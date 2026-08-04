import { useState, useRef, useCallback } from 'react'
import { useDataSource } from '../context/DataSourceContext'

export default function ZipPicker() {
  const { status, progress, error, needsPassword, fileName, loadZip, reset } = useDataSource()
  const [dragging, setDragging] = useState(false)
  const [password, setPassword] = useState('')
  const pendingFileRef = useRef(null)
  const inputRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      alert('Vui lòng chọn file .zip được export từ Messenger.')
      return
    }
    pendingFileRef.current = file
    setPassword('')
    loadZip(file)
  }, [loadZip])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }, [handleFile])

  const submitPassword = useCallback((e) => {
    e.preventDefault()
    if (pendingFileRef.current && password) {
      loadZip(pendingFileRef.current, password)
    }
  }, [loadZip, password])

  const pct = progress.total ? Math.round(progress.loaded / progress.total * 100) : 0

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">💬 My Messenger</h1>
          <p className="text-slate-400 text-sm">
            Chọn file zip đã export từ Messenger để xem lại tin nhắn và thống kê
          </p>
        </div>

        {status === 'loading' ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
            <p className="text-sm text-white font-medium mb-1 truncate">{fileName}</p>
            <p className="text-xs text-slate-500 mb-4">
              {progress.total
                ? `Đang đọc hội thoại... ${progress.loaded}/${progress.total}`
                : 'Đang mở file zip...'}
            </p>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-150"
                style={{ width: progress.total ? `${pct}%` : '25%' }}
              />
            </div>
          </div>
        ) : needsPassword ? (
          <form onSubmit={submitPassword} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <p className="text-sm text-white font-medium mb-1 truncate">🔒 {fileName}</p>
            <p className="text-xs text-slate-500 mb-4">{error}</p>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu zip..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!password}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Mở file
              </button>
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
              >
                Chọn file khác
              </button>
            </div>
          </form>
        ) : (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors
                ${dragging
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-700 bg-slate-900 hover:border-slate-600 hover:bg-slate-800/50'}
              `}
            >
              <svg className="w-10 h-10 mx-auto text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <p className="text-sm text-white font-medium mb-1">
                Kéo thả file zip vào đây
              </p>
              <p className="text-xs text-slate-500">hoặc bấm để chọn từ máy tính</p>
              <input
                ref={inputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>

            {status === 'error' && (
              <div className="mt-4 bg-red-950/40 border border-red-900/60 rounded-xl px-4 py-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <p className="text-xs text-slate-600 text-center mt-6 leading-relaxed">
              Dữ liệu được đọc trực tiếp trong trình duyệt, không tải lên máy chủ nào.<br />
              Tải lại trang sẽ cần chọn file lại.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
