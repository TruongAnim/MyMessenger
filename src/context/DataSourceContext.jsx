import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { readArchive } from '../utils/zipLoader'
import {
  supportsFileHandles, saveHandle, loadHandle, clearHandle,
  ensureReadPermission, pickZipFile,
} from '../utils/fileHandleStore'

const DataSourceContext = createContext(null)

export function useDataSource() {
  const ctx = useContext(DataSourceContext)
  if (!ctx) throw new Error('useDataSource must be used inside <DataSourceProvider>')
  return ctx
}

export function DataSourceProvider({ children }) {
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [progress, setProgress] = useState({ loaded: 0, total: 0 })
  const [conversations, setConversations] = useState([])
  const [error, setError] = useState(null)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [fileName, setFileName] = useState('')
  const [restorable, setRestorable] = useState(null) // { name } of the last opened zip

  const archiveRef = useRef(null)
  const passwordRef = useRef(undefined)
  const pendingFileRef = useRef(null)

  // Surface the previously opened zip so it can be reopened with one click.
  useEffect(() => {
    let cancelled = false
    loadHandle().then(entry => {
      if (!cancelled && entry) setRestorable({ name: entry.name })
    })
    return () => { cancelled = true }
  }, [])

  const loadZip = useCallback(async (file, password, handle) => {
    if (archiveRef.current) {
      archiveRef.current.close()
      archiveRef.current = null
    }

    pendingFileRef.current = file
    setStatus('loading')
    setError(null)
    setNeedsPassword(false)
    setProgress({ loaded: 0, total: 0 })
    setFileName(file.name)

    try {
      const { conversations, archive } = await readArchive(file, {
        password,
        onProgress: setProgress,
      })
      archiveRef.current = archive
      passwordRef.current = password
      setConversations(conversations)
      setStatus('ready')
      if (handle) {
        saveHandle(handle, file.name)
        setRestorable({ name: file.name })
      }
    } catch (err) {
      if (err.needsPassword) {
        setNeedsPassword(true)
        setStatus('idle')
        setError(err.message)
      } else {
        setStatus('error')
        setError(err.message || 'Đã xảy ra lỗi khi đọc file.')
      }
    }
  }, [])

  /** Retry the file already chosen, now that a password has been typed. */
  const retryWithPassword = useCallback(password => {
    if (pendingFileRef.current) loadZip(pendingFileRef.current, password)
  }, [loadZip])

  /** Open the system picker (keeps a handle so the file can be reopened later). */
  const pickAndLoad = useCallback(async () => {
    try {
      const { file, handle } = await pickZipFile()
      await loadZip(file, undefined, handle)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatus('error')
        setError(err.message)
      }
    }
  }, [loadZip])

  /** Reopen the zip used last time, after the browser re-grants read access. */
  const restoreLast = useCallback(async () => {
    const entry = await loadHandle()
    if (!entry) { setRestorable(null); return }

    try {
      if (!(await ensureReadPermission(entry.handle))) {
        setStatus('error')
        setError('Bạn chưa cấp quyền đọc lại file này.')
        return
      }
      const file = await entry.handle.getFile()
      await loadZip(file, undefined, entry.handle)
    } catch {
      // Typically the file was moved, renamed or deleted since last time.
      await clearHandle()
      setRestorable(null)
      setStatus('error')
      setError(`Không mở lại được "${entry.name}" — file có thể đã bị di chuyển hoặc xoá.`)
    }
  }, [loadZip])

  const forgetLast = useCallback(async () => {
    await clearHandle()
    setRestorable(null)
  }, [])

  const reset = useCallback(() => {
    archiveRef.current?.close()
    archiveRef.current = null
    passwordRef.current = undefined
    pendingFileRef.current = null
    setConversations([])
    setStatus('idle')
    setError(null)
    setNeedsPassword(false)
    setProgress({ loaded: 0, total: 0 })
    setFileName('')
  }, [])

  const getMediaUrl = useCallback(
    uri => archiveRef.current?.getMediaUrl(uri, passwordRef.current) ?? Promise.resolve(null),
    []
  )

  const byFilename = useMemo(
    () => new Map(conversations.map(c => [c.filename, c])),
    [conversations]
  )

  const value = useMemo(
    () => ({
      status, progress, error, needsPassword, fileName,
      conversations, byFilename,
      restorable, supportsFileHandles,
      loadZip, retryWithPassword, pickAndLoad, restoreLast, forgetLast, reset, getMediaUrl,
    }),
    [status, progress, error, needsPassword, fileName, conversations, byFilename,
     restorable, loadZip, retryWithPassword, pickAndLoad, restoreLast, forgetLast, reset, getMediaUrl]
  )

  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>
}
