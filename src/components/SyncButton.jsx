import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, signInWithGoogle, signOutUser } from '../firebase/client'
import { isConfigured } from '../firebase/config'
import { syncConversation, rebuildRollup, slugify } from '../firebase/sync'

/** "2024-01-15" → "15/01/2024" */
function fmtDay(day) {
  const [y, m, d] = day.split('-')
  return `${d}/${m}/${y}`
}

function describeError(err) {
  if (err.code === 'permission-denied') return 'Tài khoản này không có quyền ghi.'
  if (err.code === 'auth/popup-closed-by-user') return 'Đã huỷ đăng nhập.'
  // Firebase Auth only accepts sign-in from domains listed in the console, so
  // this fires the first time the app runs anywhere other than localhost.
  if (err.code === 'auth/unauthorized-domain') {
    return `Domain ${window.location.hostname} chưa được Firebase cho phép đăng nhập. Thêm nó vào Authentication → Settings → Authorized domains.`
  }
  if (err.code === 'auth/popup-blocked') return 'Trình duyệt đã chặn popup đăng nhập.'
  return err.message
}

export default function SyncButton({ conversation }) {
  const [user, setUser] = useState(null)
  const [state, setState] = useState('idle') // idle | syncing | rebuilding | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isConfigured) return
    return onAuthStateChanged(auth(), setUser)
  }, [])

  if (!isConfigured) return null

  const docId = slugify(conversation.displayName)
  const busy = state === 'syncing' || state === 'rebuilding'

  /** Both actions need a signed-in owner and report the rebuilt document. */
  const run = async (phase, action) => {
    setState(phase)
    setError('')
    setResult(null)
    try {
      if (!auth().currentUser) await signInWithGoogle()
      setResult(await action())
      setState('done')
    } catch (err) {
      setError(describeError(err))
      setState('error')
    }
  }

  const gaps = (result?.coverage?.length ?? 1) - 1

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {user && (
          <button
            onClick={() => signOutUser()}
            title={`Đăng xuất ${user.email}`}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            {user.email}
          </button>
        )}

        <button
          onClick={() => run('rebuilding', () => rebuildRollup(docId, conversation))}
          disabled={busy}
          title="Đọc lại toàn bộ chunk đã lưu và ghi lại số liệu tổng — không cần mở zip"
          className="px-3 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-60 flex-shrink-0"
        >
          {state === 'rebuilding' ? 'Đang tính...' : 'Tính lại'}
        </button>

        <button
          onClick={() => run('syncing', () => syncConversation(conversation))}
          disabled={busy}
          title={`Ghi chunk rồi dựng lại document "${docId}"`}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors flex-shrink-0 ${
            state === 'done'
              ? 'bg-emerald-600 text-white'
              : state === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-60'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {state === 'syncing' ? 'Đang đồng bộ...' : state === 'done' ? 'Đã đồng bộ' : 'Sync to Firestore'}
        </button>
      </div>

      {state === 'done' && result && (
        <div className="text-right space-y-0.5">
          <p className="text-xs text-emerald-500">
            ✓ {result.docId} · {result.totalMessages.toLocaleString('vi-VN')} tin ·{' '}
            {result.totalDays.toLocaleString('vi-VN')} ngày · {result.chunkCount} chunk
          </p>
          {result.coverage?.length > 0 && (
            <p className="text-xs text-slate-500">
              {result.coverage.map(r => `${fmtDay(r.from)} – ${fmtDay(r.to)}`).join(' · ')}
            </p>
          )}
          {gaps > 0 && (
            <p className="text-xs text-amber-500 max-w-[300px]">
              ⚠ Dữ liệu ngắt quãng ({gaps} lỗ hổng) — số liệu đang thiếu phần lịch sử ở giữa.
            </p>
          )}
        </div>
      )}

      {state === 'error' && (
        <p className="text-xs text-red-400 max-w-[280px] text-right">{error}</p>
      )}
    </div>
  )
}
