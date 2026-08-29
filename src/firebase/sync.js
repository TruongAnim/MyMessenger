import { doc, collection, setDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { db } from './client'
import { STATS_COLLECTION } from './config'
import { fmtDate } from '../utils/stats'

// Messenger only ever exports a slice of a conversation (roughly six months at
// a time), so a single zip can never describe the whole history. Rather than
// overwriting the stats document on every sync, each export is stored as its
// own immutable "chunk" of per-day buckets under
//
//   messenger_stats/{docId}/chunks/{from_to}
//
// and the public document is rebuilt by merging every chunk. The day is the
// merge unit: exports may overlap arbitrarily, but a given day appears under
// the same key in every chunk that covers it, so merging is idempotent and
// re-syncing the same zip changes nothing.
//
// Everything the public document exposes (totals, byHour, bySender, streaks…)
// is derived from the merged days on each rebuild — nothing accumulates across
// syncs, so a bad sync can be corrected by re-running the rebuild.

const CHUNKS = 'chunks'
const CHUNK_VERSION = 1

/** "Bích Ngọc" → "bich_ngoc" (NFD strips accents; đ/Đ needs its own pass). */
export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// ─── Per-day buckets ─────────────────────────────────────────────────────────
//
// Keys are deliberately short: a chunk holds one entry per day per sender and
// Firestore counts field names towards the 1 MiB document limit.
//
//   t total   x text   m media   l links   u unsent   r reactions received
//   f/q first & last message timestamp that day (kept so the rollup can report
//        real times, which day keys alone would lose)
//   rx  reaction emoji → count      s  sender name → per-sender bucket
//   rr/rg reactions received / given      h  hour → count (sparse)

function emptyDay() {
  return { t: 0, x: 0, m: 0, l: 0, u: 0, r: 0, f: Infinity, q: -Infinity, rx: {}, s: {} }
}

function emptySender() {
  return { t: 0, m: 0, l: 0, rr: 0, rg: 0, h: {} }
}

/**
 * Bucket a conversation's messages by local calendar day.
 * Field semantics mirror computeStats() so the rollup matches what the app shows.
 */
export function buildDailyBuckets(messages) {
  const days = {}

  for (const msg of messages) {
    const day = (days[fmtDate(msg.timestamp)] ??= emptyDay())
    const mediaCount = msg.media?.length ?? 0

    day.t++
    if (msg.type === 'text' && !msg.isUnsent) day.x++
    if (msg.type === 'link') day.l++
    if (msg.isUnsent) day.u++
    day.m += mediaCount
    if (msg.timestamp < day.f) day.f = msg.timestamp
    if (msg.timestamp > day.q) day.q = msg.timestamp

    const sender = (day.s[msg.senderName] ??= emptySender())
    sender.t++
    sender.m += mediaCount
    if (msg.type === 'link') sender.l++
    const hour = String(new Date(msg.timestamp).getHours())
    sender.h[hour] = (sender.h[hour] || 0) + 1

    for (const reaction of msg.reactions ?? []) {
      day.r++
      day.rx[reaction.reaction] = (day.rx[reaction.reaction] || 0) + 1
      sender.rr++
      // Credited on the day of the message — when the reaction was actually
      // added is not in the export. An actor who never sent a message still
      // gets a bucket here; the rollup drops those.
      const actor = (day.s[reaction.actor] ??= emptySender())
      actor.rg++
    }
  }

  return days
}

/**
 * Merge chunks into one day map, newest chunk last.
 *
 * A day sitting on an export boundary may be truncated, so the record holding
 * more messages is the more complete one. The whole record is taken rather than
 * a per-field max, which could otherwise produce a day whose sender counts do
 * not add up to its total.
 */
export function mergeDays(chunks) {
  const merged = {}
  for (const chunk of chunks) {
    for (const [day, bucket] of Object.entries(chunk.days ?? {})) {
      const current = merged[day]
      // >= so a later (newer) chunk wins ties: reactions accrue over time.
      if (!current || bucket.t >= current.t) merged[day] = bucket
    }
  }
  return merged
}

// ─── Derived values ──────────────────────────────────────────────────────────

const DAY_MS = 86400000

function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return fmtDate(d.getTime())
}

function longestStreak(sortedDays) {
  let max = 0, current = 0, previous = null
  for (const day of sortedDays) {
    current = previous && (new Date(`${day}T00:00:00`) - new Date(`${previous}T00:00:00`)) / DAY_MS === 1
      ? current + 1
      : 1
    if (current > max) max = current
    previous = day
  }
  return max
}

/**
 * Which date ranges have actually been exported, as non-overlapping intervals.
 * Derived from chunk spans rather than active days — a quiet day is not a hole,
 * a missing export is. More than one interval means the stats have a gap and
 * under-report; consumers should say so rather than present a clean average.
 */
export function coverageFromChunks(chunks) {
  const spans = chunks
    .filter(c => c.from && c.to)
    .map(c => ({ from: c.from, to: c.to }))
    .sort((a, b) => a.from.localeCompare(b.from))

  const merged = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    // Adjacent ranges (one ends the day before the next starts) count as continuous.
    if (last && span.from <= shiftDay(last.to, 1)) {
      if (span.to > last.to) last.to = span.to
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

/** Build the public stats document from merged day buckets. */
export function rollupFromDays(days, { displayName, participants, coverage }) {
  const dayKeys = Object.keys(days).sort()
  if (dayKeys.length === 0) return null

  const totals = { messages: 0, text: 0, media: 0, links: 0, unsent: 0, reactions: 0 }
  const byHour = Array(24).fill(0)
  const reactionCounts = {}
  const senderTotals = {}
  const byDay = []
  const byMonthCounts = {}
  let firstTimestamp = Infinity
  let lastTimestamp = -Infinity

  for (const key of dayKeys) {
    const day = days[key]

    totals.messages += day.t
    totals.text += day.x
    totals.media += day.m
    totals.links += day.l
    totals.unsent += day.u
    totals.reactions += day.r

    byDay.push({ date: key, count: day.t })
    const month = key.slice(0, 7)
    byMonthCounts[month] = (byMonthCounts[month] || 0) + day.t

    if (day.f < firstTimestamp) firstTimestamp = day.f
    if (day.q > lastTimestamp) lastTimestamp = day.q

    for (const [emoji, count] of Object.entries(day.rx ?? {})) {
      reactionCounts[emoji] = (reactionCounts[emoji] || 0) + count
    }

    for (const [name, bucket] of Object.entries(day.s ?? {})) {
      const agg = (senderTotals[name] ??= { total: 0, media: 0, links: 0, rr: 0, rg: 0, byHour: Array(24).fill(0) })
      agg.total += bucket.t
      agg.media += bucket.m
      agg.links += bucket.l
      agg.rr += bucket.rr
      agg.rg += bucket.rg
      for (const [hour, count] of Object.entries(bucket.h ?? {})) {
        agg.byHour[Number(hour)] += count
        // Every message has exactly one sender, so the overall hour histogram
        // is just the sum of the per-sender ones.
        byHour[Number(hour)] += count
      }
    }
  }

  const activeDays = dayKeys.length

  return {
    displayName,
    participants,

    totals,

    period: {
      firstTimestamp,
      lastTimestamp,
      activeDays,
      longestStreak: longestStreak(dayKeys),
      avgPerActiveDay: Number((totals.messages / activeDays).toFixed(2)),
    },

    byHour,
    byDay,
    byMonth: Object.entries(byMonthCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    topReactions: Object.entries(reactionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([emoji, count]) => ({ emoji, count })),

    bySender: Object.entries(senderTotals)
      // Reaction-only actors picked up a bucket but never sent anything.
      .filter(([, s]) => s.total > 0)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, s]) => ({
        name,
        total: s.total,
        share: Number((s.total / totals.messages * 100).toFixed(1)),
        media: s.media,
        links: s.links,
        reactionsReceived: s.rr,
        reactionsGiven: s.rg,
        byHour: s.byHour,
      })),

    // Ranges actually exported. Length > 1 means history is missing in between.
    coverage,

    syncedAt: serverTimestamp(),
  }
}

// ─── Firestore ───────────────────────────────────────────────────────────────

/** Split one export's days into per-calendar-year chunks to stay well under 1 MiB. */
function splitByYear(days) {
  const byYear = {}
  for (const [day, bucket] of Object.entries(days)) {
    ;(byYear[day.slice(0, 4)] ??= {})[day] = bucket
  }
  return Object.values(byYear)
}

function spanOf(days) {
  const keys = Object.keys(days).sort()
  return { from: keys[0], to: keys[keys.length - 1] }
}

function chunksRef(docId) {
  return collection(db(), STATS_COLLECTION, docId, CHUNKS)
}

function syncedAtMs(chunk) {
  return chunk.syncedAt?.toMillis?.() ?? 0
}

/**
 * Rebuild the public document from every chunk stored for this conversation.
 * Needs no zip open, so it also repairs the document after chunks are edited
 * or removed by hand in the Firebase console.
 */
export async function rebuildRollup(docId, fallback = {}, fresh = []) {
  const snapshot = await getDocs(chunksRef(docId))
  if (snapshot.empty && fresh.length === 0) {
    throw new Error('Chưa có chunk nào cho hội thoại này — hãy sync một file zip trước.')
  }

  // Chunks just written still carry an unresolved serverTimestamp, so they are
  // appended rather than sorted — merging is idempotent, and being last means a
  // fresh export wins ties over the stored copy it replaces.
  const stored = snapshot.docs.map(d => d.data()).sort((a, b) => syncedAtMs(a) - syncedAtMs(b))
  const chunks = [...stored, ...fresh]
  const newest = chunks[chunks.length - 1]

  const participants = [...new Set(chunks.flatMap(c => c.participants ?? []))]
  const payload = rollupFromDays(mergeDays(chunks), {
    displayName: fallback.displayName ?? newest.displayName ?? docId,
    participants: participants.length ? participants : (fallback.participants ?? []),
    coverage: coverageFromChunks(chunks),
  })

  if (!payload) throw new Error('Các chunk hiện có không chứa ngày nào hợp lệ.')

  await setDoc(doc(db(), STATS_COLLECTION, docId), payload)

  return {
    docId,
    chunkCount: new Set([...stored, ...fresh].map(c => `${c.from}_${c.to}`)).size,
    totalMessages: payload.totals.messages,
    totalDays: payload.period.activeDays,
    coverage: payload.coverage,
  }
}

/**
 * Store this export as chunks, then rebuild the public document from all of them.
 *
 * Not transactional: the web SDK cannot read a collection inside a transaction,
 * and this is a single-owner action, so two concurrent syncs are not a case
 * worth designing around. Re-running the sync repairs any half-finished state.
 */
export async function syncConversation(conversation) {
  const docId = slugify(conversation.displayName)
  if (!docId) throw new Error('Không tạo được id hợp lệ từ tên hội thoại.')

  const days = buildDailyBuckets(conversation.messages ?? [])
  const dayCount = Object.keys(days).length
  if (dayCount === 0) throw new Error('Hội thoại này không có tin nhắn để đồng bộ.')

  const collectionRef = chunksRef(docId)
  const written = []

  for (const yearDays of splitByYear(days)) {
    const span = spanOf(yearDays)
    // Derived from the data itself, so re-syncing the same zip overwrites the
    // same document instead of piling up duplicates.
    const chunkId = `${span.from}_${span.to}`
    const chunk = {
      displayName: conversation.displayName,
      participants: conversation.participants ?? [],
      ...span,
      days: yearDays,
      version: CHUNK_VERSION,
    }
    await setDoc(doc(collectionRef, chunkId), { ...chunk, syncedAt: serverTimestamp() })
    written.push(chunk)
  }

  const result = await rebuildRollup(docId, conversation, written)
  return { ...result, chunkIds: written.map(c => `${c.from}_${c.to}`), daysInExport: dayCount }
}
