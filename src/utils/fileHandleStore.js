// Remembers which zip was opened last, using the File System Access API.
//
// A FileSystemFileHandle can be structured-cloned into IndexedDB and reused
// after a reload — the browser still gates the actual read behind a permission
// prompt, so the file itself never becomes readable without the user agreeing.
// Only the handle is stored; the zip stays on disk.

const DB_NAME = 'my-messenger'
const DB_VERSION = 1
const STORE = 'handles'
const KEY = 'lastZip'

export const supportsFileHandles =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveHandle(handle, name) {
  if (!supportsFileHandles) return
  try {
    const db = await openDb()
    await tx(db, 'readwrite', s => s.put({ handle, name, savedAt: Date.now() }, KEY))
    db.close()
  } catch {
    // Remembering the file is a convenience — never block opening a zip over it.
  }
}

export async function loadHandle() {
  if (!supportsFileHandles) return null
  try {
    const db = await openDb()
    const entry = await tx(db, 'readonly', s => s.get(KEY))
    db.close()
    return entry ?? null
  } catch {
    return null
  }
}

export async function clearHandle() {
  if (!supportsFileHandles) return
  try {
    const db = await openDb()
    await tx(db, 'readwrite', s => s.delete(KEY))
    db.close()
  } catch {
    // ignore
  }
}

/** Re-check read permission. Must be called from a user gesture to prompt. */
export async function ensureReadPermission(handle) {
  const opts = { mode: 'read' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

/** Open the system file picker and return { file, handle }. */
export async function pickZipFile() {
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [{ description: 'Messenger export', accept: { 'application/zip': ['.zip'] } }],
  })
  return { file: await handle.getFile(), handle }
}
