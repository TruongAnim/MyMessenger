import { useState, useCallback, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDataSource } from '../context/DataSourceContext'
import { analyzeArchives, writeMergedArchive, closeAnalysis, suggestedName } from '../utils/zipMerger'

const supportsSave = typeof window !== 'undefined' && 'showSaveFilePicker' in window

const fmtDay = day => day.split('-').reverse().join('/')
const fmtMB = bytes => `${(bytes / 1024 / 1024).toFixed(0)} MB`
const fmtNum = n => n.toLocaleString('vi-VN')

/** Horizontal span of one export against the full timeline. */
function TimelineBar({ from, to, min, max, className }) {
  const span = Math.max(1, new Date(max) - new Date(min))
  const left = ((new Date(from) - new Date(min)) / span) * 100
  const width = Math.max(1.5, ((new Date(to) - new Date(from)) / span) * 100)
  return (
    <div className="relative h-2.5 rounded-full bg-slate-800/80 overflow-hidden">
      <div className={`absolute inset-y-0 rounded-full ${className}`} style={{ left: `${left}%`, width: `${width}%` }} />
    </div>
  )
}

function Timeline({ analysis }) {
  const min = analysis.sources.reduce((a, s) => (s.from < a ? s.from : a), analysis.sources[0].from)
  const max = analysis.sources.reduce((a, s) => (s.to > a ? s.to : a), analysis.sources[0].to)

  return (
    <div className="space-y-3">
      {analysis.sources.map(source => (
        <div key={source.name} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
          <span className="text-xs text-slate-400 truncate" title={source.name}>{source.name}</span>
          <TimelineBar from={source.from} to={source.to} min={min} max={max} className="bg-slate-500" />
          <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
            {fmtDay(source.from)} → {fmtDay(source.to)}
          </span>
        </div>
      ))}

      <div className="border-t border-slate-800 pt-3 grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
        <span className="text-xs font-semibold text-white">Kết quả</span>
        <div className="relative h-2.5 rounded-full bg-slate-800/80 overflow-hidden">
          {analysis.coverage.map(range => {
            const span = Math.max(1, new Date(max) - new Date(min))
            const left = ((new Date(range.from) - new Date(min)) / span) * 100
            const width = Math.max(1.5, ((new Date(range.to) - new Date(range.from)) / span) * 100)
            return <div key={range.from} className="absolute inset-y-0 rounded-full bg-indigo-500"
              style={{ left: `${left}%`, width: `${width}%` }} />
          })}
        </div>
        <span className="text-[11px] text-slate-300 tabular-nums whitespace-nowrap">
          {fmtDay(analysis.from)} → {fmtDay(analysis.to)}
        </span>
      </div>

      <p className={`text-xs text-right ${analysis.gaps.length ? 'text-amber-500' : 'text-emerald-500'}`}>
        {analysis.gaps.length
          ? `⚠ Thiếu ${analysis.gaps.map(g => `${fmtDay(g.from)} → ${fmtDay(g.to)} (${g.days} ngày)`).join(', ')}`
          : '✓ Liền mạch, không lỗ hổng'}
      </p>
    </div>
  )
}

function Card({ children, className = '' }) {
  return <div className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-5 ${className}`}>{children}</div>
}

export default function MergePage() {
  const navigate = useNavigate()
  const { loadZip } = useDataSource()

  const [files, setFiles] = useState([])
  const [phase, setPhase] = useState('pick') // pick | analyzing | preview | writing | done
  const [analysis, setAnalysis] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [passwords, setPasswords] = useState({})
  const [askPassword, setAskPassword] = useState(null)
  const [result, setResult] = useState(null)
  const [dragging, setDragging] = useState(false)

  const inputRef = useRef(null)
  const analysisRef = useRef(null)
  const savedHandleRef = useRef(null)

  // Zip readers stay open for the whole preview so media can be copied later.
  useEffect(() => () => { if (analysisRef.current) closeAnalysis(analysisRef.current) }, [])

  const addFiles = useCallback(incoming => {
    const zips = [...incoming].filter(f => f.name.toLowerCase().endsWith('.zip'))
    setError(zips.length < incoming.length ? 'Đã bỏ qua file không phải .zip.' : '')
    setFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}|${f.size}`))
      return [...prev, ...zips.filter(f => !seen.has(`${f.name}|${f.size}`))]
    })
  }, [])

  const analyze = useCallback(async (pwds = passwords) => {
    setPhase('analyzing')
    setError('')
    setAskPassword(null)
    try {
      const next = await analyzeArchives(files, {
        passwords: pwds,
        onProgress: setProgress,
      })
      analysisRef.current = next
      setAnalysis(next)
      setPhase('preview')
    } catch (err) {
      if (err.needsPassword) {
        setAskPassword(err.fileName)
        setError(err.message)
      } else {
        setError(err.message || 'Không phân tích được các file này.')
      }
      setPhase('pick')
    }
  }, [files, passwords])

  const write = useCallback(async () => {
    let handle
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: suggestedName(analysis),
        types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }],
      })
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
      return
    }

    // Refuse to write over one of the inputs — the sources are the only copy.
    if (analysis.sources.some(s => s.name === handle.name)) {
      setError(`"${handle.name}" đang là file nguồn. Hãy chọn tên khác để không ghi đè dữ liệu gốc.`)
      return
    }

    setPhase('writing')
    setError('')
    try {
      const writable = await handle.createWritable()
      await writeMergedArchive(analysis, writable, { onProgress: setProgress })
      savedHandleRef.current = handle
      setResult({ name: handle.name, messageCount: analysis.messageCount, dayCount: analysis.dayCount,
        from: analysis.from, to: analysis.to, mediaUnique: analysis.mediaUnique })
      setPhase('done')
    } catch (err) {
      setError(err.message || 'Ghi file thất bại.')
      setPhase('preview')
    }
  }, [analysis])

  const openResult = useCallback(async () => {
    const handle = savedHandleRef.current
    if (!handle) return
    await closeAnalysis(analysisRef.current)
    analysisRef.current = null
    await loadZip(await handle.getFile(), undefined, handle)
    navigate('/')
  }, [loadZip, navigate])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-3xl mx-auto px-5 py-10">

        <div className="flex items-center gap-3 mb-8">
          <Link to="/" className="text-slate-500 hover:text-slate-300 transition-colors text-sm">←</Link>
          <h1 className="text-xl font-bold text-white">Gộp file zip</h1>
        </div>

        {!supportsSave && (
          <Card className="mb-5 border-amber-900/60">
            <p className="text-sm text-amber-500">
              Trình duyệt này không hỗ trợ ghi file trực tiếp. Hãy dùng Chrome, Edge hoặc Arc trên máy tính.
            </p>
          </Card>
        )}

        {/* ── Chọn file ── */}
        {phase === 'pick' && (
          <div className="space-y-4">
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl py-12 text-center cursor-pointer transition-colors ${
                dragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              <p className="font-semibold text-white text-sm">Kéo thả các file zip cần gộp vào đây</p>
              <p className="text-xs text-slate-500 mt-1">hoặc bấm để chọn — chọn được nhiều file cùng lúc</p>
              <input ref={inputRef} type="file" accept=".zip" multiple className="hidden"
                onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </div>

            {files.length > 0 && (
              <Card className="divide-y divide-slate-800">
                {files.map(file => (
                  <div key={`${file.name}|${file.size}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex-1 text-sm text-slate-300 truncate">{file.name}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{fmtMB(file.size)}</span>
                    <button
                      onClick={() => setFiles(prev => prev.filter(f => f !== file))}
                      className="text-slate-600 hover:text-red-400 transition-colors px-1"
                    >✕</button>
                  </div>
                ))}
              </Card>
            )}

            {askPassword && (
              <Card className="border-amber-900/60">
                <p className="text-sm text-amber-500 mb-3">Nhập mật khẩu cho "{askPassword}"</p>
                <form
                  onSubmit={e => {
                    e.preventDefault()
                    const next = { ...passwords, [askPassword]: new FormData(e.target).get('pw') }
                    setPasswords(next)
                    analyze(next)
                  }}
                  className="flex gap-2"
                >
                  <input name="pw" type="password" autoFocus
                    className="flex-1 bg-slate-800 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 ring-indigo-500" />
                  <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold text-white">
                    Thử lại
                  </button>
                </form>
              </Card>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => analyze()}
                disabled={files.length < 2 || !supportsSave}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-xl text-sm font-semibold text-white transition-colors"
              >
                Phân tích {files.length > 0 && `(${files.length})`}
              </button>
            </div>
            {files.length === 1 && <p className="text-xs text-slate-500 text-right">Cần ít nhất 2 file để gộp.</p>}
          </div>
        )}

        {phase === 'analyzing' && (
          <Card>
            <p className="text-sm text-slate-300">Đang đọc {progress?.name ?? 'file'}…</p>
            <p className="text-xs text-slate-500 mt-1">{(progress?.index ?? 0) + 1}/{progress?.total ?? files.length}</p>
          </Card>
        )}

        {/* ── Xem trước ── */}
        {phase === 'preview' && analysis && (
          <div className="space-y-4">
            <Card><Timeline analysis={analysis} /></Card>

            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs">
                    <th className="text-left font-medium pb-2">File</th>
                    <th className="text-right font-medium pb-2">Tin nhắn</th>
                    <th className="text-right font-medium pb-2">Ngày</th>
                    <th className="text-right font-medium pb-2">Media</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {analysis.sources.map(s => (
                    <tr key={s.name} className="text-slate-400">
                      <td className="py-1 truncate max-w-[14rem]">{s.name}</td>
                      <td className="text-right">{fmtNum(s.messageCount)}</td>
                      <td className="text-right">{fmtNum(s.dayCount)}</td>
                      <td className="text-right">{fmtNum(s.mediaCount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-800 text-white font-semibold">
                    <td className="pt-2">Sau khi gộp</td>
                    <td className="text-right pt-2">{fmtNum(analysis.messageCount)}</td>
                    <td className="text-right pt-2">{fmtNum(analysis.dayCount)}</td>
                    <td className="text-right pt-2">{fmtNum(analysis.mediaUnique)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-emerald-500 text-right mt-2">
                +{fmtNum(analysis.addedMessages)} tin so với file lớn nhất
              </p>
            </Card>

            <Card className="space-y-1.5 text-sm">
              <p className="text-slate-400">
                Media: <span className="text-slate-200">{fmtNum(analysis.mediaRefs)}</span> lượt tham chiếu →{' '}
                <span className="text-slate-200">{fmtNum(analysis.mediaUnique)}</span> file duy nhất
              </p>
              <p className="text-xs text-slate-500">
                Khử trùng theo nội dung, tiết kiệm {fmtMB(analysis.savedBytes)}. File mới ước tính{' '}
                {fmtMB(analysis.mediaBytes)}.
              </p>
              {analysis.missingMedia > 0 && (
                <p className="text-xs text-amber-500 pt-1">
                  ⚠ {fmtNum(analysis.missingMedia)} ảnh được nhắc tới trong tin nhắn nhưng thiếu file trong zip nguồn —
                  thiếu sẵn từ bản export, phép gộp không tạo ra lỗi này và cũng không sửa được.
                </p>
              )}
            </Card>

            <div className="flex justify-between items-center">
              <button onClick={() => { closeAnalysis(analysisRef.current); analysisRef.current = null; setAnalysis(null); setPhase('pick') }}
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
                ← Chọn lại file
              </button>
              <button onClick={write}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold text-white transition-colors">
                Tạo file gộp…
              </button>
            </div>
          </div>
        )}

        {/* ── Đang ghi ── */}
        {phase === 'writing' && (
          <Card>
            <p className="text-sm text-white font-semibold mb-3">Đang tạo file…</p>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden mb-2">
              <div className="h-full bg-indigo-500 transition-[width] duration-150"
                style={{ width: `${progress?.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-500 tabular-nums">
              <span>{progress?.phase === 'media' ? 'Đang chép media…' : 'Đang ghi hội thoại…'}</span>
              <span>
                {fmtNum(progress?.done ?? 0)} / {fmtNum(progress?.total ?? 0)}
                {progress?.phase === 'media' && ` · ${fmtMB(progress.bytes)} / ${fmtMB(progress.totalBytes)}`}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-4">Đừng đóng tab cho tới khi xong.</p>
          </Card>
        )}

        {/* ── Xong ── */}
        {phase === 'done' && result && (
          <div className="space-y-4">
            <Card className="border-emerald-900/60">
              <p className="text-emerald-500 font-semibold text-sm mb-2">✓ Đã tạo {result.name}</p>
              <p className="text-sm text-slate-300">
                {fmtNum(result.messageCount)} tin · {fmtNum(result.dayCount)} ngày ·{' '}
                {fmtDay(result.from)} → {fmtDay(result.to)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{fmtNum(result.mediaUnique)} file media, đã đối chiếu đủ</p>
            </Card>

            <Card className="border-amber-900/60">
              <p className="text-sm text-amber-500">
                ⚠ Hãy mở thử file mới và kiểm tra trước khi xoá các file cũ. Dữ liệu này không lấy lại được.
              </p>
            </Card>

            <div className="flex justify-end gap-3">
              <Link to="/" className="px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Về trang chủ
              </Link>
              <button onClick={openResult}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold text-white transition-colors">
                Mở file vừa tạo
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
      </div>
    </div>
  )
}
