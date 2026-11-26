import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'
import { isJunk, dirOf, findMessagesDir } from './zipLoader'

// Facebook only exports a few months at a time, so the history lives across a
// growing pile of zips. Merging them into one archive keeps the app's reader
// unchanged — the output is shaped exactly like a Messenger export, just larger.
//
// Two details drive the whole design:
//
//   1. Media filenames are NOT stable. Facebook regenerates them on every
//      export, so the same photo arrives under a different name each time.
//      Deduplicating by name therefore never dedupes anything; identity has to
//      come from content, via the CRC32 and size already sitting in the zip
//      index. That also means every message `uri` must be rewritten to point at
//      the name the merged archive actually uses.
//
//   2. Media entries are STORED, never deflated (jpeg/mp4 are already
//      compressed). Copying them at level 0 is a byte-for-byte copy.

const MEDIA_DIR = 'media/'
const DAY_MS = 86400000

/** Threads are matched on participants: the `_<n>` suffix in a filename shifts between exports. */
function threadKey(thread) {
  const participants = (thread.participants ?? []).map(p => String(p).trim().toLowerCase()).sort()
  return participants.length ? participants.join('|') : `name:${thread.displayName.toLowerCase()}`
}

/** Identity of a media file: content, not name. Size guards against CRC32 collisions. */
function mediaKey(entry) {
  return `${entry.signature}|${entry.uncompressedSize}`
}

/**
 * Messenger does reuse a (timestamp, sender) pair — a burst of photos sent at
 * once shares one millisecond — so the key has to include content, or messages
 * are silently dropped. Reactions and media uris stay out of it: reactions
 * accrue between exports, and uris are regenerated every time, while the media
 * count is stable.
 */
function messageKey(message) {
  const text = message.text ?? ''
  return `${message.timestamp}|${message.senderName}|${message.type ?? ''}|${message.media?.length ?? 0}|${text}`
}

function dayOf(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + delta)
  return dayOf(d.getTime())
}

/**
 * Which stretches of time the exports actually cover, as non-overlapping ranges.
 * Taken from each export's span rather than from days that happen to hold
 * messages: a quiet day is not a hole in the history, a missing export is.
 */
function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from))
  const out = []
  for (const range of sorted) {
    const last = out[out.length - 1]
    if (last && range.from <= shiftDay(last.to, 1)) {
      if (range.to > last.to) last.to = range.to
    } else {
      out.push({ ...range })
    }
  }
  return out
}

function gapsBetween(ranges) {
  const gaps = []
  for (let i = 1; i < ranges.length; i++) {
    const from = shiftDay(ranges[i - 1].to, 1)
    const to = shiftDay(ranges[i].from, -1)
    const days = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY_MS) + 1
    gaps.push({ from, to, days })
  }
  return gaps
}

/** Read one export: its threads, and an index of its media keyed by content. */
async function readSource(file, password) {
  const zipReader = new ZipReader(new BlobReader(file), {
    filenameEncoding: 'utf-8',
    ...(password ? { password } : {}),
  })

  const entries = await zipReader.getEntries()
  const messagesDir = findMessagesDir(entries)
  if (messagesDir === null) {
    await zipReader.close().catch(() => {})
    throw new Error(`"${file.name}" không chứa file hội thoại (.json) nào.`)
  }

  const threadEntries = entries.filter(e =>
    !e.directory && !isJunk(e.filename) &&
    dirOf(e.filename) === messagesDir &&
    e.filename.toLowerCase().endsWith('.json')
  )

  if (threadEntries.some(e => e.encrypted) && !password) {
    await zipReader.close().catch(() => {})
    const err = new Error(`"${file.name}" được đặt mật khẩu.`)
    err.needsPassword = true
    err.fileName = file.name
    throw err
  }

  // Media indexed by path relative to the messages folder, matching message uris.
  const mediaByPath = new Map()
  for (const entry of entries) {
    if (entry.directory || isJunk(entry.filename)) continue
    if (!entry.filename.startsWith(messagesDir)) continue
    if (entry.filename.toLowerCase().endsWith('.json')) continue
    mediaByPath.set(entry.filename.slice(messagesDir.length), entry)
  }

  const threads = []
  let messageCount = 0
  let latest = -Infinity
  const days = new Set()

  for (const entry of threadEntries) {
    let json
    try {
      json = JSON.parse(await entry.getData(new TextWriter(), password ? { password } : undefined))
    } catch (err) {
      if (threadEntries.some(e => e.encrypted)) {
        await zipReader.close().catch(() => {})
        const wrapped = new Error(`Mật khẩu của "${file.name}" không đúng.`)
        wrapped.needsPassword = true
        wrapped.fileName = file.name
        throw wrapped
      }
      continue // one unreadable thread must not sink the whole merge
    }
    if (!Array.isArray(json?.messages)) continue

    const name = entry.filename.slice(messagesDir.length).replace(/\.json$/i, '')
    threads.push({
      displayName: name.replace(/_\d+$/, ''),
      participants: json.participants ?? [],
      threadName: json.threadName,
      messages: json.messages,
    })

    messageCount += json.messages.length
    for (const m of json.messages) {
      if (m.timestamp > latest) latest = m.timestamp
      days.add(dayOf(m.timestamp))
    }
  }

  if (threads.length === 0) {
    await zipReader.close().catch(() => {})
    throw new Error(`"${file.name}" không chứa hội thoại hợp lệ nào.`)
  }

  const dayKeys = [...days].sort()
  return {
    file, password, zipReader, messagesDir, threads, mediaByPath,
    name: file.name,
    size: file.size,
    messageCount,
    dayCount: dayKeys.length,
    from: dayKeys[0],
    to: dayKeys[dayKeys.length - 1],
    mediaCount: mediaByPath.size,
    latest,
  }
}

/**
 * Read every export and work out exactly what the merged archive will contain.
 *
 * Nothing is decompressed beyond the thread JSON — media identity comes from the
 * zip index — so the full preview costs seconds even across gigabytes.
 */
export async function analyzeArchives(files, { onProgress, passwords = {} } = {}) {
  const sources = []
  for (let i = 0; i < files.length; i++) {
    onProgress?.({ phase: 'reading', index: i, total: files.length, name: files[i].name })
    sources.push(await readSource(files[i], passwords[files[i].name]))
  }

  // Later exports win on conflict, so order by the newest message each one holds.
  sources.sort((a, b) => a.latest - b.latest)

  // ── Media: one entry per distinct content, with a name chosen once ──
  const mediaByContent = new Map()   // contentKey -> { name, entry, source, size }
  const usedNames = new Set()
  const remap = new Map()            // `${sourceIndex}|${uri}` -> canonical name

  let mediaRefBytes = 0
  for (const [index, source] of sources.entries()) {
    for (const [path, entry] of source.mediaByPath) {
      const key = mediaKey(entry)
      mediaRefBytes += entry.uncompressedSize
      let record = mediaByContent.get(key)
      if (!record) {
        const base = path.startsWith(MEDIA_DIR) ? path.slice(MEDIA_DIR.length) : path
        let name = base
        // Different content under a name already taken would silently overwrite.
        for (let n = 2; usedNames.has(name); n++) {
          name = base.replace(/(\.[^.]+)?$/, m => `-${n}${m || ''}`)
        }
        usedNames.add(name)
        record = { name, entry, source, size: entry.uncompressedSize }
        mediaByContent.set(key, record)
      }
      remap.set(`${index}|${path}`, record.name)
    }
  }

  // ── Threads and messages ──
  const threads = new Map()
  let missingMedia = 0
  let unresolved = 0

  for (const [index, source] of sources.entries()) {
    for (const thread of source.threads) {
      const key = threadKey(thread)
      let merged = threads.get(key)
      if (!merged) {
        merged = {
          displayName: thread.displayName,
          participants: [...(thread.participants ?? [])],
          threadName: thread.threadName,
          byKey: new Map(),
        }
        threads.set(key, merged)
      }

      // The newest export is authoritative: reactions accrue, and a message
      // retracted later should read as retracted here too.
      merged.displayName = thread.displayName
      merged.threadName = thread.threadName ?? merged.threadName
      for (const p of thread.participants ?? []) {
        if (!merged.participants.includes(p)) merged.participants.push(p)
      }

      // A base key can legitimately repeat inside one export; the Nth repeat in
      // one export is the Nth repeat in the next, so numbering them keeps every
      // message while still matching them up across exports.
      const seen = new Map()
      for (const message of thread.messages) {
        const base = messageKey(message)
        const nth = seen.get(base) ?? 0
        seen.set(base, nth + 1)

        const media = message.media?.map(item => {
          const uri = (item.uri ?? '').replace(/^\.\//, '')
          const name = remap.get(`${index}|${uri}`)
          if (!name) {
            // Referenced by a message but absent from its own zip: already lost
            // upstream, so carry the uri through untouched rather than drop it.
            missingMedia++
            return item
          }
          return { ...item, uri: MEDIA_DIR + name }
        })
        merged.byKey.set(nth === 0 ? base : `${base}#${nth}`, media ? { ...message, media } : message)
      }
    }
  }

  const mergedThreads = [...threads.values()].map(t => ({
    displayName: t.displayName,
    participants: t.participants,
    threadName: t.threadName,
    messages: [...t.byKey.values()].sort((a, b) => a.timestamp - b.timestamp),
  })).sort((a, b) => b.messages.length - a.messages.length)

  const days = new Set()
  let messageCount = 0
  for (const thread of mergedThreads) {
    messageCount += thread.messages.length
    for (const m of thread.messages) days.add(dayOf(m.timestamp))
  }
  const dayKeys = [...days].sort()
  const coverage = mergeRanges(sources.map(s => ({ from: s.from, to: s.to })))

  const mediaRecords = [...mediaByContent.values()]
  const mediaBytes = mediaRecords.reduce((sum, r) => sum + r.size, 0)

  return {
    sources,
    threads: mergedThreads,
    media: mediaRecords,
    messageCount,
    dayCount: dayKeys.length,
    from: dayKeys[0],
    to: dayKeys[dayKeys.length - 1],
    coverage,
    gaps: gapsBetween(coverage),
    mediaRefs: sources.reduce((n, s) => n + s.mediaCount, 0),
    mediaUnique: mediaRecords.length,
    mediaBytes,
    savedBytes: mediaRefBytes - mediaBytes,
    missingMedia,
    unresolved,
    addedMessages: messageCount - Math.max(...sources.map(s => s.messageCount)),
  }
}

/** Suggested filename, always dated and never equal to a source. */
export function suggestedName(analysis) {
  return `messenger-master-${analysis.to}.zip`
}

/**
 * Write the merged archive, shaped like a Messenger export so the app's reader
 * needs no changes: thread JSON at the root, media alongside in `media/`.
 *
 * Media is copied one file at a time and stored rather than deflated, so memory
 * stays flat regardless of how large the archive grows.
 */
export async function writeMergedArchive(analysis, writable, { onProgress } = {}) {
  const zipWriter = new ZipWriter(writable, { zip64: true })

  try {
    for (const [index, thread] of analysis.threads.entries()) {
      const json = JSON.stringify({
        participants: thread.participants,
        ...(thread.threadName ? { threadName: thread.threadName } : {}),
        messages: thread.messages,
      })
      await zipWriter.add(`${thread.displayName}_${index}.json`, new TextReader(json))
      onProgress?.({ phase: 'threads', done: index + 1, total: analysis.threads.length })
    }

    let done = 0
    let bytes = 0
    for (const record of analysis.media) {
      const { password } = record.source
      const blob = await record.entry.getData(new BlobWriter(), password ? { password } : undefined)
      // level 0: these are jpeg/mp4, already compressed — deflating only burns time.
      await zipWriter.add(MEDIA_DIR + record.name, new BlobReader(blob), { level: 0 })
      done++
      bytes += record.size
      onProgress?.({ phase: 'media', done, total: analysis.media.length, bytes, totalBytes: analysis.mediaBytes })
    }

    await zipWriter.close()
  } catch (err) {
    await zipWriter.close().catch(() => {})
    throw err
  }
}

export async function closeAnalysis(analysis) {
  for (const source of analysis?.sources ?? []) {
    await source.zipReader.close().catch(() => {})
  }
}
