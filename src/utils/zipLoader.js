import { BlobReader, ZipReader, TextWriter, BlobWriter } from '@zip.js/zip.js'

// A Messenger export unzips to a `messages/` folder holding one JSON per thread
// plus a `media/` subfolder. We locate that folder rather than assuming a fixed
// path, since the zip may nest it under a wrapper directory.

export function isJunk(filename) {
  const base = filename.split('/').pop()
  return filename.startsWith('__MACOSX/') || base.startsWith('.')
}

export function dirOf(filename) {
  const i = filename.lastIndexOf('/')
  return i === -1 ? '' : filename.slice(0, i + 1)
}

/** Pick the directory containing the most .json files — that's the thread folder. */
export function findMessagesDir(entries) {
  const counts = new Map()
  for (const entry of entries) {
    if (entry.directory || isJunk(entry.filename)) continue
    if (!entry.filename.toLowerCase().endsWith('.json')) continue
    const dir = dirOf(entry.filename)
    counts.set(dir, (counts.get(dir) || 0) + 1)
  }
  if (counts.size === 0) return null
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

export class ConversationArchive {
  constructor(zipReader, entries, messagesDir) {
    this.zipReader = zipReader
    this.messagesDir = messagesDir
    // Media entries are keyed by their path relative to the messages folder
    // ("media/xxx.jpeg") so message `uri` values map straight onto them.
    this.mediaEntries = new Map()
    for (const entry of entries) {
      if (entry.directory || isJunk(entry.filename)) continue
      if (entry.filename.startsWith(messagesDir) && !entry.filename.toLowerCase().endsWith('.json')) {
        this.mediaEntries.set(entry.filename.slice(messagesDir.length), entry)
      }
    }
    this.mediaUrlCache = new Map()
  }

  /** Resolve a message media uri ("./media/x.jpeg") to a blob URL, or null if absent. */
  async getMediaUrl(uri, password) {
    const key = uri.replace(/^\.\//, '')
    if (this.mediaUrlCache.has(key)) return this.mediaUrlCache.get(key)

    const entry = this.mediaEntries.get(key)
    if (!entry) {
      this.mediaUrlCache.set(key, null)
      return null
    }

    const promise = entry
      .getData(new BlobWriter(), password ? { password } : undefined)
      .then(blob => URL.createObjectURL(blob))
      .catch(() => null)

    this.mediaUrlCache.set(key, promise)
    return promise
  }

  async close() {
    for (const value of this.mediaUrlCache.values()) {
      const url = await value
      if (url) URL.revokeObjectURL(url)
    }
    this.mediaUrlCache.clear()
    await this.zipReader.close().catch(() => {})
  }
}

/**
 * Read every conversation out of a Messenger export zip.
 * Media stays inside the zip and is only decompressed on demand.
 *
 * @param file      the user-selected .zip File
 * @param password  optional, for encrypted archives
 * @param onProgress called as ({ loaded, total }) while threads are parsed
 */
export async function readArchive(file, { password, onProgress } = {}) {
  // filenameEncoding only applies to entries lacking the UTF-8 flag; some zip
  // tools omit it and Vietnamese thread names would otherwise decode as CP437.
  const zipReader = new ZipReader(new BlobReader(file), {
    filenameEncoding: 'utf-8',
    ...(password ? { password } : {}),
  })
  let entries
  try {
    entries = await zipReader.getEntries()
  } catch (err) {
    await zipReader.close().catch(() => {})
    throw new Error(`Không đọc được file zip: ${err.message}`)
  }

  const messagesDir = findMessagesDir(entries)
  if (messagesDir === null) {
    await zipReader.close().catch(() => {})
    throw new Error('Không tìm thấy file hội thoại (.json) nào trong zip này.')
  }

  const threadEntries = entries.filter(e =>
    !e.directory &&
    !isJunk(e.filename) &&
    dirOf(e.filename) === messagesDir &&
    e.filename.toLowerCase().endsWith('.json')
  )

  const encrypted = threadEntries.some(e => e.encrypted)
  if (encrypted && !password) {
    await zipReader.close().catch(() => {})
    const err = new Error('File zip này được đặt mật khẩu.')
    err.needsPassword = true
    throw err
  }

  const conversations = []
  let loaded = 0
  for (const entry of threadEntries) {
    let json
    try {
      const text = await entry.getData(new TextWriter(), password ? { password } : undefined)
      json = JSON.parse(text)
    } catch (err) {
      if (encrypted) {
        await zipReader.close().catch(() => {})
        const wrapped = new Error('Mật khẩu không đúng hoặc file zip bị lỗi.')
        wrapped.needsPassword = true
        throw wrapped
      }
      loaded++
      onProgress?.({ loaded, total: threadEntries.length })
      continue // skip a single unreadable thread rather than failing the whole import
    }

    if (Array.isArray(json?.messages)) {
      const filename = entry.filename.slice(messagesDir.length).replace(/\.json$/i, '')
      conversations.push({
        filename,
        displayName: filename.replace(/_\d+$/, ''),
        participants: json.participants ?? [],
        messages: json.messages,
      })
    }

    loaded++
    onProgress?.({ loaded, total: threadEntries.length })
  }

  if (conversations.length === 0) {
    await zipReader.close().catch(() => {})
    throw new Error('Zip không chứa hội thoại hợp lệ nào.')
  }

  conversations.sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'))

  return {
    conversations,
    archive: new ConversationArchive(zipReader, entries, messagesDir),
  }
}
