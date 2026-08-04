function fmtDate(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtMonth(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getWeekStart(ts) {
  const d = new Date(ts)
  const day = d.getDay()
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + (day === 0 ? -6 : 1))
  return fmtDate(monday.getTime())
}

function computeForMessages(msgs, allMessages) {
  const total = msgs.length
  const textCount = msgs.filter(m => m.type === 'text' && !m.isUnsent).length
  const linkCount = msgs.filter(m => m.type === 'link').length
  const mediaCount = msgs.reduce((s, m) => s + m.media.length, 0)
  const unsentCount = msgs.filter(m => m.isUnsent).length

  // Reactions received (reactions on this sender's messages)
  const reactionsReceived = msgs.reduce((s, m) => s + m.reactions.length, 0)
  const reactionsReceivedMap = {}
  msgs.forEach(m => m.reactions.forEach(r => {
    reactionsReceivedMap[r.reaction] = (reactionsReceivedMap[r.reaction] || 0) + 1
  }))

  // Reactions given (reactions this sender gave anywhere)
  const reactionsGivenMap = {}
  let reactionsGiven = 0
  allMessages.forEach(m => {
    m.reactions.forEach(r => {
      if (r.actor === msgs[0]?.senderName) {
        reactionsGiven++
        reactionsGivenMap[r.reaction] = (reactionsGivenMap[r.reaction] || 0) + 1
      }
    })
  })

  const byDay = {}, byWeek = {}, byMonth = {}
  const byHour = Array(24).fill(0)
  msgs.forEach(m => {
    const day = fmtDate(m.timestamp)
    byDay[day] = (byDay[day] || 0) + 1
    const week = getWeekStart(m.timestamp)
    byWeek[week] = (byWeek[week] || 0) + 1
    const month = fmtMonth(m.timestamp)
    byMonth[month] = (byMonth[month] || 0) + 1
    byHour[new Date(m.timestamp).getHours()]++
  })

  return {
    total, textCount, linkCount, mediaCount, unsentCount,
    reactionsReceived, reactionsReceivedMap,
    reactionsGiven, reactionsGivenMap,
    byDay, byWeek, byMonth, byHour,
  }
}

/**
 * Cheap single-pass summary for conversation cards. computeStats() is far more
 * thorough but too heavy to run for every conversation at once.
 */
export function summarize(messages) {
  if (!messages.length) return null

  let first = Infinity, last = -Infinity
  let mediaCount = 0, linkCount = 0, reactionsCount = 0
  const senders = []
  const days = new Set()

  for (const m of messages) {
    if (m.timestamp < first) first = m.timestamp
    if (m.timestamp > last) last = m.timestamp
    mediaCount += m.media?.length ?? 0
    reactionsCount += m.reactions?.length ?? 0
    if (m.type === 'link') linkCount++
    if (!senders.includes(m.senderName)) senders.push(m.senderName)
    days.add(fmtDate(m.timestamp))
  }

  return {
    total: messages.length,
    firstTimestamp: first,
    lastTimestamp: last,
    senders,
    mediaCount,
    linkCount,
    reactionsCount,
    activeDays: days.size,
  }
}

export function computeStats(messages) {
  if (!messages.length) return null
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp)
  const senders = [...new Set(sorted.map(m => m.senderName))]

  const overall = {
    ...computeForMessages(sorted, sorted),
    reactionsGiven: 0, reactionsGivenMap: {},
  }
  // Overall reactions received = sum across all messages
  overall.reactionsReceived = sorted.reduce((s, m) => s + m.reactions.length, 0)
  const allReactionsMap = {}
  sorted.forEach(m => m.reactions.forEach(r => {
    allReactionsMap[r.reaction] = (allReactionsMap[r.reaction] || 0) + 1
  }))
  overall.reactionsReceivedMap = allReactionsMap

  const bySender = {}
  senders.forEach(sender => {
    const senderMsgs = sorted.filter(m => m.senderName === sender)
    bySender[sender] = computeForMessages(senderMsgs, sorted)
  })

  // Longest streak (consecutive days with messages)
  const activeDays = new Set(sorted.map(m => fmtDate(m.timestamp)))
  let maxStreak = 0, curStreak = 0, prevDate = null
  ;[...activeDays].sort().forEach(day => {
    if (prevDate) {
      const diff = (new Date(day) - new Date(prevDate)) / 86400000
      curStreak = diff === 1 ? curStreak + 1 : 1
    } else {
      curStreak = 1
    }
    maxStreak = Math.max(maxStreak, curStreak)
    prevDate = day
  })

  return {
    overall,
    bySender,
    senders,
    firstTimestamp: sorted[0].timestamp,
    lastTimestamp: sorted[sorted.length - 1].timestamp,
    activeDays: activeDays.size,
    longestStreak: maxStreak,
  }
}

export function toChartData(obj) {
  return Object.entries(obj)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function topReactions(map, n = 5) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

export function formatTimestamp(ts) {
  return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatMonth(key) {
  const [y, m] = key.split('-')
  return `${m}/${y}`
}

export function formatWeek(key) {
  const d = new Date(key)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
