import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import { readArchive } from '../utils/zipLoader'

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

  const archiveRef = useRef(null)
  const passwordRef = useRef(undefined)

  const loadZip = useCallback(async (file, password) => {
    if (archiveRef.current) {
      archiveRef.current.close()
      archiveRef.current = null
    }

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

  const reset = useCallback(() => {
    archiveRef.current?.close()
    archiveRef.current = null
    passwordRef.current = undefined
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
      loadZip, reset, getMediaUrl,
    }),
    [status, progress, error, needsPassword, fileName, conversations, byFilename, loadZip, reset, getMediaUrl]
  )

  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>
}
