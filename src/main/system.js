// Room controls: Stream Deck, Filter Keys and the two one-click modes.
import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { filterKeysOn, setFilterKeys } from './native'

const STREAM_DECK = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Elgato', 'StreamDeck', 'StreamDeck.exe')

const run = (file, args) =>
  new Promise((resolve) => execFile(file, args, { windowsHide: true, timeout: 8000 }, (err, stdout) => resolve(err ? '' : String(stdout))))

export async function streamDeckRunning() {
  const out = await run('tasklist', ['/FI', 'IMAGENAME eq StreamDeck.exe', '/NH', '/FO', 'CSV'])
  return /"StreamDeck\.exe"/i.test(out)
}

export async function stopStreamDeck() {
  await run('taskkill', ['/IM', 'StreamDeck.exe', '/F'])
}

export async function startStreamDeck() {
  if (await streamDeckRunning()) return
  if (!fs.existsSync(STREAM_DECK)) throw new Error('Stream Deck is not installed')
  spawn(STREAM_DECK, [], { detached: true, stdio: 'ignore' }).unref()
}

export async function status() {
  let filter = false
  try {
    filter = filterKeysOn()
  } catch {
    /* reported as off */
  }
  return { filterKeys: filter, streamDeck: await streamDeckRunning(), streamDeckInstalled: fs.existsSync(STREAM_DECK) }
}

export const actions = {
  async babyMode() {
    setFilterKeys(true)
    await stopStreamDeck()
  },
  async workMode() {
    setFilterKeys(false)
    await startStreamDeck()
  },
  async toggleFilterKeys() {
    setFilterKeys(!filterKeysOn())
  },
  async toggleStreamDeck() {
    if (await streamDeckRunning()) await stopStreamDeck()
    else await startStreamDeck()
  }
}

export function ivVoicePath() {
  return path.join(app.getPath('home'), 'AppData', 'Local', 'Programs', 'IV Voice', 'IV Voice.exe')
}

// Starts IV Voice in the tray if it's installed and not running.
export function startIvVoice() {
  const exe = ivVoicePath()
  if (!fs.existsSync(exe)) throw new Error('IV Voice is not installed')
  spawn(exe, ['--hidden'], { detached: true, stdio: 'ignore' }).unref()
}
