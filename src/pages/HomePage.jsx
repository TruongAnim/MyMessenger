import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDataSource } from '../context/DataSourceContext'
import { summarize, formatTimestamp } from '../utils/stats'

const SENDER_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b']

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function ConversationCard({ entry }) {
  const summary = useMemo(() => summarize(entry.messages), [entry])

  const bg = `hsl(${entry.displayName.charCodeAt(0) * 7 % 360}, 60%, 25%)`
  const accent = `hsl(${entry.displayName.charCodeAt(0) * 7 % 360}, 70%, 60%)`

  return (
    <Link
      to={`/conversation/${encodeURIComponent(entry.filename)}`}
      className="group block bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-600 rounded-2xl p-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5"
    >
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ background: bg, color: accent }}
        >
          {initials(entry.displayName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-white truncate text-sm">{entry.displayName}</h3>
            {summary && (
              <span className="text-xs text-indigo-400 font-medium whitespace-nowrap">
                {summary.total.toLocaleString()} tin
              </span>
            )}
          </div>
          {summary ? (
            <>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatTimestamp(summary.firstTimestamp)} → {formatTimestamp(summary.lastTimestamp)}
              </p>
              <div className="flex gap-3 mt-2">
                {summary.senders.map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: SENDER_COLORS[i] }} />
                    <span className="text-xs text-slate-400 truncate max-w-[90px]">{s}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-600 mt-1">Không có tin nhắn</p>
          )}
        </div>
      </div>
      {summary && (
        <div className="mt-3 flex gap-3 text-xs text-slate-500">
          <span>📸 {summary.mediaCount}</span>
          <span>😄 {summary.reactionsCount}</span>
          <span>🔗 {summary.linkCount}</span>
          <span>📅 {summary.activeDays} ngày</span>
        </div>
      )}
    </Link>
  )
}

export default function HomePage() {
  const { conversations, fileName, reset } = useDataSource()
  const [search, setSearch] = useState('')

  const filtered = search
    ? conversations.filter(e => e.displayName.toLowerCase().includes(search.toLowerCase()))
    : conversations

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">💬 My Messenger</h1>
            <p className="text-slate-400 text-sm">{conversations.length} cuộc hội thoại</p>
          </div>
          <button
            onClick={reset}
            title={fileName}
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-600 rounded-xl text-xs text-slate-400 hover:text-white transition-colors flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Đổi file zip
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(entry => (
            <ConversationCard key={entry.filename} entry={entry} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20 text-slate-500">Không tìm thấy kết quả</div>
        )}
      </div>
    </div>
  )
}
