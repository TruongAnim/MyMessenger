import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './client'
import { STATS_COLLECTION } from './config'
import { computeStats, toChartData, topReactions } from '../utils/stats'

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

/**
 * Aggregate stats only — no message text, no media. Whatever lands here is
 * readable by anyone who can read the collection, so keep it to numbers.
 */
export function buildStatsPayload(conversation) {
  const stats = computeStats(conversation.messages)
  if (!stats) return null

  const { overall } = stats

  return {
    displayName: conversation.displayName,
    participants: conversation.participants ?? [],

    totals: {
      messages: overall.total,
      text: overall.textCount,
      media: overall.mediaCount,
      links: overall.linkCount,
      unsent: overall.unsentCount,
      reactions: overall.reactionsReceived,
    },

    period: {
      firstTimestamp: stats.firstTimestamp,
      lastTimestamp: stats.lastTimestamp,
      activeDays: stats.activeDays,
      longestStreak: stats.longestStreak,
      avgPerActiveDay: Number((overall.total / stats.activeDays).toFixed(2)),
    },

    byHour: overall.byHour,
    byDay: toChartData(overall.byDay),
    byMonth: toChartData(overall.byMonth),
    topReactions: topReactions(overall.reactionsReceivedMap, 10)
      .map(([emoji, count]) => ({ emoji, count })),

    bySender: stats.senders.map(name => {
      const s = stats.bySender[name]
      return {
        name,
        total: s.total,
        share: Number((s.total / overall.total * 100).toFixed(1)),
        media: s.mediaCount,
        links: s.linkCount,
        reactionsReceived: s.reactionsReceived,
        reactionsGiven: s.reactionsGiven,
        byHour: s.byHour,
      }
    }),

    syncedAt: serverTimestamp(),
  }
}

/** Write one conversation's stats to Firestore. Returns the document id used. */
export async function syncConversation(conversation) {
  const payload = buildStatsPayload(conversation)
  if (!payload) throw new Error('Hội thoại này không có tin nhắn để đồng bộ.')

  const docId = slugify(conversation.displayName)
  if (!docId) throw new Error('Không tạo được id hợp lệ từ tên hội thoại.')

  await setDoc(doc(db(), STATS_COLLECTION, docId), payload)
  return docId
}
