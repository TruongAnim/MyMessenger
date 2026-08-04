import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDataSource } from '../context/DataSourceContext'

const MY_NAME = 'Trường Anim'

function dateKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtDisplayDate(key) {
  const d = new Date(key + 'T00:00:00')
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return `${days[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`
}

// ─── Media ────────────────────────────────────────────────────────────────────

// Media lives inside the zip and is decompressed on demand, so each image
// resolves to a blob URL asynchronously.
function ZipImage({ uri }) {
  const { getMediaUrl } = useDataSource()
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setFailed(false)
    getMediaUrl(uri).then(resolved => {
      if (cancelled) return
      if (resolved) setUrl(resolved)
      else setFailed(true)
    })
    return () => { cancelled = true }
  }, [uri, getMediaUrl])

  if (failed) return null

  if (!url) {
    return <div className="w-[200px] h-[150px] bg-slate-800 animate-pulse rounded" />
  }

  return (
    <img
      src={url}
      alt=""
      className="max-w-[260px] max-h-[260px] object-cover block"
      onError={() => setFailed(true)}
    />
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({ msg, isMe, showAvatar, showTime, avatarLetter }) {
  const isUnsent = msg.isUnsent

  let bubbleContent
  if (isUnsent) {
    bubbleContent = (
      <div className="px-3.5 py-2 rounded-2xl border border-slate-700 text-slate-500 text-sm italic">
        Tin nhắn đã bị xóa
      </div>
    )
  } else if (msg.type === 'media' && msg.media.length > 0) {
    bubbleContent = (
      <div className={`rounded-2xl overflow-hidden ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
        <div className="flex flex-wrap gap-0.5">
          {msg.media.map((m, i) => (
            <ZipImage key={i} uri={m.uri} />
          ))}
        </div>
        {msg.text && (
          <div className={`px-3 py-2 text-sm text-white ${isMe ? 'bg-indigo-600' : 'bg-slate-800'}`}>
            {msg.text}
          </div>
        )}
      </div>
    )
  } else {
    bubbleContent = (
      <div className={`px-3.5 py-2 rounded-2xl text-sm break-words whitespace-pre-wrap ${
        isMe
          ? 'bg-indigo-600 text-white rounded-br-sm'
          : 'bg-slate-800 text-slate-100 rounded-bl-sm'
      }`}>
        {msg.type === 'link'
          ? <a href={msg.text} target="_blank" rel="noopener noreferrer" className="underline break-all">{msg.text}</a>
          : msg.text}
      </div>
    )
  }

  return (
    <div className={`flex items-end gap-1.5 my-0.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className="w-7 h-7 flex-shrink-0">
        {!isMe && showAvatar && (
          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-200 font-semibold">
            {avatarLetter}
          </div>
        )}
      </div>

      <div className={`flex flex-col gap-0.5 max-w-[65%] ${isMe ? 'items-end' : 'items-start'}`}>
        {bubbleContent}

        {/* Reactions */}
        {msg.reactions.length > 0 && (
          <div className={`flex gap-0.5 -mt-0.5 ${isMe ? 'mr-1' : 'ml-1'}`}>
            {msg.reactions.map((r, i) => (
              <span
                key={i}
                className="bg-slate-900 border border-slate-700 rounded-full px-1.5 py-0.5 text-xs leading-none"
                title={r.actor}
              >
                {r.reaction}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp */}
        {showTime && (
          <p className="text-xs text-slate-600">{fmtTime(msg.timestamp)}</p>
        )}
      </div>
    </div>
  )
})

// ─── Calendar ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

const Calendar = memo(function Calendar({ activeDays, selectedDate, onSelectDate, initialDate }) {
  const [view, setView] = useState(() => {
    const d = initialDate ? new Date(initialDate + 'T00:00:00') : new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const { year, month } = view
  const firstWeekday = new Date(year, month, 1).getDay()
  const offset = firstWeekday === 0 ? 6 : firstWeekday - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const cellKey = d => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setView(v => {
            const d = new Date(v.year, v.month - 1, 1)
            return { year: d.getFullYear(), month: d.getMonth() }
          })}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-lg"
        >‹</button>
        <span className="text-sm font-semibold text-white">{MONTH_NAMES[month]} {year}</span>
        <button
          onClick={() => setView(v => {
            const d = new Date(v.year, v.month + 1, 1)
            return { year: d.getFullYear(), month: d.getMonth() }
          })}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-lg"
        >›</button>
      </div>

      <div className="grid grid-cols-7 text-center mb-1">
        {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
          <div key={d} className="text-xs text-slate-600 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 text-center gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const key = cellKey(day)
          const active = activeDays.has(key)
          const selected = selectedDate === key
          return (
            <button
              key={key}
              onClick={() => active && onSelectDate(key)}
              disabled={!active}
              className={`
                aspect-square rounded-lg text-xs font-medium transition-colors leading-none
                ${selected
                  ? 'bg-indigo-600 text-white'
                  : active
                    ? 'bg-slate-800 text-slate-200 hover:bg-indigo-500/30 hover:text-indigo-300'
                    : 'text-slate-700 cursor-default'}
              `}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
})

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConversationChat() {
  const { id } = useParams()
  const filename = decodeURIComponent(id)
  const displayName = filename.replace(/_\d+$/, '')

  const { byFilename } = useDataSource()
  const conversation = byFilename.get(filename)

  const [selectedDate, setSelectedDate] = useState(null)

  const dateRefs = useRef({})
  const scrollContainerRef = useRef(null)
  const bottomRef = useRef(null)

  const { groupedMessages, activeDays, lastDate, otherName } = useMemo(() => {
    if (!conversation?.messages?.length) {
      return { groupedMessages: [], activeDays: new Set(), lastDate: null, otherName: '' }
    }
    const sorted = [...conversation.messages].sort((a, b) => a.timestamp - b.timestamp)

    const byDate = {}
    sorted.forEach(msg => {
      const d = dateKey(msg.timestamp)
      if (!byDate[d]) byDate[d] = []
      byDate[d].push(msg)
    })

    const sortedDates = Object.keys(byDate).sort()
    const lastDate = sortedDates[sortedDates.length - 1]
    const otherName = (conversation.participants || []).find(p => p !== MY_NAME)
      || (conversation.participants || [])[0]
      || '?'

    return {
      groupedMessages: sortedDates.map(date => ({ date, messages: byDate[date] })),
      activeDays: new Set(sortedDates),
      lastDate,
      otherName,
    }
  }, [conversation])

  // Scroll to bottom on first load
  useEffect(() => {
    if (conversation) {
      bottomRef.current?.scrollIntoView()
    }
  }, [conversation])

  const handleSelectDate = useCallback((date) => {
    setSelectedDate(date)
    const el = dateRefs.current[date]
    if (el && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const elTop = el.offsetTop - container.offsetTop
      container.scrollTo({ top: elTop - 12, behavior: 'smooth' })
    }
  }, [])

  if (!conversation) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <p className="text-slate-400 text-sm">Không tìm thấy hội thoại này.</p>
        <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">← Về trang chủ</Link>
      </div>
    )
  }

  const avatarLetter = otherName[0]?.toUpperCase() || '?'

  return (
    <div className="h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <Link
          to={`/conversation/${encodeURIComponent(filename)}`}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-semibold text-slate-200 flex-shrink-0">
          {avatarLetter}
        </div>
        <div>
          <h1 className="font-semibold text-white text-sm leading-tight">{displayName}</h1>
          <p className="text-xs text-slate-500">{(conversation?.participants || []).join(' & ')}</p>
        </div>
        <div className="ml-auto text-xs text-slate-600">
          {conversation?.messages?.length?.toLocaleString()} tin nhắn
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left – Calendar */}
        <div className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0 overflow-y-auto p-4 gap-6">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Lịch</p>
            <Calendar
              activeDays={activeDays}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              initialDate={lastDate}
            />
          </div>

          {selectedDate && (
            <div className="bg-slate-800 rounded-xl p-3">
              <p className="text-xs text-slate-400 leading-snug">{fmtDisplayDate(selectedDate)}</p>
              <p className="text-base font-bold text-white mt-1">
                {groupedMessages.find(g => g.date === selectedDate)?.messages.length ?? 0} tin
              </p>
            </div>
          )}
        </div>

        {/* Right – Messages */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          {groupedMessages.map(({ date, messages }) => (
            <div key={date}>
              {/* Date divider */}
              <div
                ref={el => { dateRefs.current[date] = el }}
                className="flex items-center justify-center my-5"
              >
                <div className="bg-slate-800 text-slate-400 text-xs px-3 py-1 rounded-full">
                  {fmtDisplayDate(date)}
                </div>
              </div>

              {/* Bubbles */}
              {messages.map((msg, idx) => {
                const isMe = msg.senderName === MY_NAME
                const next = messages[idx + 1]
                const isLastInGroup = !next || next.senderName !== msg.senderName
                // Show time only on last of a group, or if next is >5min apart
                const showTime = isLastInGroup || (next && next.timestamp - msg.timestamp > 5 * 60 * 1000)
                return (
                  <MessageBubble
                    key={`${msg.timestamp}-${idx}`}
                    msg={msg}
                    isMe={isMe}
                    showAvatar={isLastInGroup}
                    showTime={showTime}
                    avatarLetter={avatarLetter}
                  />
                )
              })}
            </div>
          ))}
          <div ref={bottomRef} className="h-6" />
        </div>
      </div>
    </div>
  )
}
