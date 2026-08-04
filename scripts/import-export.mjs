#!/usr/bin/env node
// Import a Messenger "Download your data" (E2EE) export into assets/messages/,
// merging with whatever is already there instead of overwriting it.
//
// Usage:
//   npm run import -- /path/to/export.zip
//   npm run import -- /path/to/already-unzipped-folder

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readdirSync, statSync, existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'

const ASSETS_DIR = new URL('../assets/messages', import.meta.url).pathname

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

function findMessagesDir(root) {
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    const hasThreadJson = entries.some(e => e.isFile() && e.name.endsWith('.json'))
    if (basename(dir) === 'messages' && hasThreadJson) return dir
    for (const e of entries) {
      if (e.isDirectory()) stack.push(join(dir, e.name))
    }
  }
  return null
}

function participantsKey(participants) {
  return [...participants].map(p => p.trim().toLowerCase()).sort().join('|')
}

function loadExisting() {
  const byKey = new Map()
  if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true })
  for (const name of readdirSync(ASSETS_DIR)) {
    if (!name.endsWith('.json')) continue
    const path = join(ASSETS_DIR, name)
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    if (!data.participants) continue
    byKey.set(participantsKey(data.participants), { name, path, data })
  }
  return byKey
}

function mergeThread(existing, incoming) {
  const byMsgKey = new Map()
  for (const m of existing.messages) byMsgKey.set(`${m.timestamp}|${m.senderName}`, m)
  let added = 0
  for (const m of incoming.messages) {
    const key = `${m.timestamp}|${m.senderName}`
    if (!byMsgKey.has(key)) added++
    byMsgKey.set(key, m) // incoming wins on conflict (newer snapshot: reactions/unsent may have changed)
  }
  const messages = [...byMsgKey.values()].sort((a, b) => a.timestamp - b.timestamp)
  const participants = [...new Set([...existing.participants, ...incoming.participants])]
  return { participants, threadName: incoming.threadName ?? existing.threadName, messages, added }
}

function copyMedia(srcMediaDir) {
  const destMediaDir = join(ASSETS_DIR, 'media')
  if (!existsSync(srcMediaDir)) return 0
  mkdirSync(destMediaDir, { recursive: true })
  let copied = 0
  for (const name of readdirSync(srcMediaDir)) {
    const src = join(srcMediaDir, name)
    const dest = join(destMediaDir, name)
    if (statSync(src).isFile() && !existsSync(dest)) {
      copyFileSync(src, dest)
      copied++
    }
  }
  return copied
}

function main() {
  const input = process.argv[2]
  if (!input) fail('Cần truyền đường dẫn file zip hoặc thư mục export.\n  npm run import -- /path/to/export.zip')
  if (!existsSync(input)) fail(`Không tìm thấy: ${input}`)

  let extractedRoot = input
  let tmpDir = null

  if (statSync(input).isFile()) {
    if (!input.endsWith('.zip')) fail('File đầu vào phải là .zip hoặc là thư mục đã giải nén.')
    tmpDir = mkdtempSync(join(tmpdir(), 'messenger-import-'))
    console.log(`→ Giải nén ${input}...`)
    execFileSync('unzip', ['-qq', '-o', input, '-d', tmpDir])
    extractedRoot = tmpDir
  }

  const messagesDir = findMessagesDir(extractedRoot)
  if (!messagesDir) fail('Không tìm thấy thư mục "messages" chứa file .json trong export này.')
  console.log(`→ Tìm thấy thư mục messages: ${messagesDir}`)

  const existingByKey = loadExisting()
  const threadFiles = readdirSync(messagesDir).filter(f => f.endsWith('.json'))

  let newThreads = 0, updatedThreads = 0, totalNewMessages = 0

  for (const file of threadFiles) {
    const incoming = JSON.parse(readFileSync(join(messagesDir, file), 'utf-8'))
    if (!incoming.participants || !incoming.messages) continue

    const key = participantsKey(incoming.participants)
    const match = existingByKey.get(key)

    if (!match) {
      let destName = file
      let destPath = join(ASSETS_DIR, destName)
      let n = 2
      while (existsSync(destPath)) {
        destName = file.replace(/\.json$/, `-${n}.json`)
        destPath = join(ASSETS_DIR, destName)
        n++
      }
      writeFileSync(destPath, JSON.stringify(incoming, null, 2))
      existingByKey.set(key, { name: destName, path: destPath, data: incoming })
      newThreads++
      totalNewMessages += incoming.messages.length
    } else {
      const merged = mergeThread(match.data, incoming)
      if (merged.added > 0) {
        writeFileSync(match.path, JSON.stringify(merged, null, 2))
        updatedThreads++
        totalNewMessages += merged.added
      }
      existingByKey.set(key, { ...match, data: merged })
    }
  }

  const mediaCopied = copyMedia(join(messagesDir, 'media'))

  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })

  console.log('')
  console.log(`✓ Hội thoại mới: ${newThreads}`)
  console.log(`✓ Hội thoại được cập nhật: ${updatedThreads}`)
  console.log(`✓ Tin nhắn mới thêm vào: ${totalNewMessages}`)
  console.log(`✓ File media mới copy: ${mediaCopied}`)
}

main()
