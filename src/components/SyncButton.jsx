import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, signInWithGoogle, signOutUser } from '../firebase/client'
import { isConfigured } from '../firebase/config'
import { syncConversation, slugify } from '../firebase/sync'

export default function SyncButton({ conversation }) {
  const [user, setUser] = useState(null)
  const [state, setState] = useState('idle') // idle | syncing | done | error
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!isConfigured) return
    return onAuthStateChanged(auth(), setUser)
  }, [])

  if (!isConfigured) return null

  const docId = slugify(conversation.displayName)

  const handleClick = async () => {
    setState('syncing')
    setMessage('')
    try {
      if (!auth().currentUser) await signInWithGoogle()
      const id = await syncConversation(conversation)
      setState('done')
      setMessage(id)
    } catch (err) {
      setState('error')
      setMessage(
        err.code === 'permission-denied'
          ? 'Tài khoản này không có quyền ghi.'
          : err.code === 'auth/popup-closed-by-user'
            ? 'Đã huỷ đăng nhập.'
            : err.message
      )
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
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
          onClick={handleClick}
          disabled={state === 'syncing'}
          title={`Ghi vào document "${docId}"`}
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

      {state === 'done' && (
        <p className="text-xs text-emerald-500">✓ {message}</p>
      )}
      {state === 'error' && (
        <p className="text-xs text-red-400 max-w-[280px] text-right">{message}</p>
      )}
    </div>
  )
}
