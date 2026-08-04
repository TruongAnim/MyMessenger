import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import { useDataSource } from '../context/DataSourceContext'
import SyncButton from '../components/SyncButton'
import {
  computeStats, toChartData, topReactions,
  formatTimestamp, formatMonth, formatWeek
} from '../utils/stats'

const SENDER_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b']
const HOUR_LABELS = ['0h','1h','2h','3h','4h','5h','6h','7h','8h','9h','10h','11h',
  '12h','13h','14h','15h','16h','17h','18h','19h','20h','21h','22h','23h']

function StatCard({ label, value, sub, color = '#6366f1' }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs mt-1" style={{ color }}>{sub}</p>}
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="text-white font-semibold">{payload[0].value.toLocaleString()} tin nhắn</p>
    </div>
  )
}

function TimelineChart({ stats, period, color }) {
  const raw = period === 'day' ? stats.byDay : period === 'week' ? stats.byWeek : stats.byMonth
  const data = toChartData(raw).map(d => ({
    ...d,
    label: period === 'month' ? formatMonth(d.date) : period === 'week' ? formatWeek(d.date) : d.date.slice(5),
  }))

  const interval = data.length > 60 ? Math.floor(data.length / 20) : data.length > 30 ? 2 : 0

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} interval={interval} />
        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function HourChart({ byHour, color }) {
  const data = byHour.map((count, h) => ({ label: HOUR_LABELS[h], count }))
  const peak = Math.max(...byHour)
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} interval={2} />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.count === peak ? color : `${color}66`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function ReactionsSection({ map, label }) {
  const top = topReactions(map, 10)
  if (!top.length) return null
  const total = top.reduce((s, [, c]) => s + c, 0)
  return (
    <div>
      <p className="text-xs text-slate-500 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {top.map(([emoji, count]) => (
          <div key={emoji} className="flex items-center gap-1.5 bg-slate-800 rounded-full px-3 py-1.5 text-sm">
            <span>{emoji}</span>
            <span className="text-white font-medium">{count}</span>
            <span className="text-slate-500 text-xs">({Math.round(count / total * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ConversationDetail() {
  const { id } = useParams()
  const filename = decodeURIComponent(id)
  const displayName = filename.replace(/_\d+$/, '')

  const { byFilename } = useDataSource()
  const conversation = byFilename.get(filename)

  const [activeTab, setActiveTab] = useState('all')
  const [period, setPeriod] = useState('month')

  const stats = useMemo(
    () => conversation ? computeStats(conversation.messages) : null,
    [conversation]
  )

  if (!conversation) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <p className="text-slate-400 text-sm">Không tìm thấy hội thoại này.</p>
        <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">← Về trang chủ</Link>
      </div>
    )
  }

  if (!stats) return null

  const tabs = ['all', ...stats.senders]
  const tabLabel = (t) => t === 'all' ? 'Tất cả' : t
  const currentStats = activeTab === 'all' ? stats.overall : stats.bySender[activeTab]
  const senderIdx = stats.senders.indexOf(activeTab)
  const accentColor = activeTab === 'all' ? '#6366f1' : SENDER_COLORS[senderIdx] ?? '#6366f1'

  const totalDays = Math.ceil((stats.lastTimestamp - stats.firstTimestamp) / 86400000) + 1
  const avgPerDay = (stats.overall.total / stats.activeDays).toFixed(1)
  const peakHour = currentStats.byHour.indexOf(Math.max(...currentStats.byHour))

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <Link to="/" className="mt-1 p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{displayName}</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {formatTimestamp(stats.firstTimestamp)} – {formatTimestamp(stats.lastTimestamp)}
              <span className="ml-2 text-slate-600">({totalDays} ngày)</span>
            </p>
          </div>
          <div className="flex items-start gap-2 flex-shrink-0 mt-1">
            <SyncButton conversation={conversation} />
            <Link
              to={`/conversation/${encodeURIComponent(filename)}/chat`}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Xem hội thoại
            </Link>
          </div>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Tin nhắn" value={stats.overall.total} />
          <StatCard label="Ngày hoạt động" value={stats.activeDays} sub={`~${avgPerDay}/ngày`} />
          <StatCard label="Streak dài nhất" value={`${stats.longestStreak} ngày`} color="#10b981" />
          <StatCard label="Reaction" value={stats.overall.reactionsReceived} color="#f59e0b" />
          <StatCard label="Media" value={stats.overall.mediaCount} color="#ec4899" />
          <StatCard label="Link" value={stats.overall.linkCount} color="#3b82f6" />
        </div>

        {/* Message breakdown per sender */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {stats.senders.map((sender, i) => {
            const s = stats.bySender[sender]
            const pct = Math.round(s.total / stats.overall.total * 100)
            return (
              <div key={sender} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: SENDER_COLORS[i] }} />
                    <span className="font-semibold text-sm text-white">{sender}</span>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${SENDER_COLORS[i]}22`, color: SENDER_COLORS[i] }}>
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full mb-3 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SENDER_COLORS[i] }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-sm font-bold text-white">{s.total.toLocaleString()}</p><p className="text-xs text-slate-500">Tin nhắn</p></div>
                  <div><p className="text-sm font-bold text-white">{s.reactionsReceived}</p><p className="text-xs text-slate-500">Nhận reaction</p></div>
                  <div><p className="text-sm font-bold text-white">{s.reactionsGiven}</p><p className="text-xs text-slate-500">Cho reaction</p></div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 w-fit">
          {tabs.map((t, i) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === t
                  ? 'text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={activeTab === t ? { background: t === 'all' ? '#6366f1' : SENDER_COLORS[i - 1] } : {}}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        {/* Tab stats pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { label: '💬 Tin nhắn', val: currentStats.total },
            { label: '📝 Văn bản', val: currentStats.textCount },
            { label: '📸 Media', val: currentStats.mediaCount },
            { label: '🔗 Link', val: currentStats.linkCount },
            { label: '🗑️ Đã xóa', val: currentStats.unsentCount },
            { label: '😄 Nhận reaction', val: currentStats.reactionsReceived },
            ...(activeTab !== 'all' ? [{ label: '👍 Cho reaction', val: currentStats.reactionsGiven }] : []),
          ].map(({ label, val }) => (
            <div key={label} className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-3 py-1.5 text-sm">
              <span className="text-slate-400">{label}</span>
              <span className="text-white font-semibold">{val.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* Timeline chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-white">Tin nhắn theo thời gian</h2>
            <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
              {['day', 'week', 'month'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    period === p ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p === 'day' ? 'Ngày' : p === 'week' ? 'Tuần' : 'Tháng'}
                </button>
              ))}
            </div>
          </div>
          <TimelineChart stats={currentStats} period={period} color={accentColor} />
        </div>

        {/* Hour activity */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-sm text-white">Hoạt động theo giờ</h2>
            <span className="text-xs text-slate-500">Giờ cao điểm: {peakHour}h</span>
          </div>
          <HourChart byHour={currentStats.byHour} color={accentColor} />
        </div>

        {/* Reactions */}
        {(Object.keys(currentStats.reactionsReceivedMap).length > 0 || (activeTab !== 'all' && Object.keys(currentStats.reactionsGivenMap ?? {}).length > 0)) && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="font-semibold text-sm text-white mb-4">Reactions</h2>
            <div className="space-y-4">
              <ReactionsSection map={currentStats.reactionsReceivedMap} label="Nhận được" />
              {activeTab !== 'all' && currentStats.reactionsGivenMap && (
                <ReactionsSection map={currentStats.reactionsGivenMap} label="Đã cho" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
