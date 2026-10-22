// Room controls: Stream Deck, Filter Keys, the power button guard and the two one-click modes.
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

// ---------- power button guard ----------
// Points the power and sleep buttons at "Do nothing" on the active power plan, and puts back what
// they were afterwards. The originals are saved to disk so they survive a restart. Holding the
// power button for about 4 seconds is a hardware force-off that no software can block.

const SUB_BUTTONS = '4f971e89-eebd-4455-a8de-9e59040e7347'
const BUTTONS = {
  power: { guid: '7648efa3-dd9c-4e3e-b566-50f929386280', fallback: 3 }, // Shut down
  sleep: { guid: '96996bc0-ad50-47ec-923b-6f41874dd9eb', fallback: 1 } // Sleep
}
const guardFile = () => path.join(app.getPath('userData'), 'power-guard.json')

const powercfg = (args) =>
  new Promise((resolve, reject) =>
    execFile('powercfg', args, { windowsHide: true, timeout: 8000 }, (err, stdout, stderr) =>
      err ? reject(new Error(String(stderr || stdout).trim() || 'powercfg failed')) : resolve(String(stdout))
    )
  )

// The last two hex values in /qh output are the current AC and DC indexes (locale-independent).
async function readButton(guid) {
  const out = await powercfg(['/qh', 'SCHEME_CURRENT', SUB_BUTTONS, guid])
  const hex = out.match(/0x[0-9a-f]{8}/gi) || []
  if (hex.length < 2) throw new Error('Could not read the power button setting')
  const [ac, dc] = hex.slice(-2).map((h) => parseInt(h, 16))
  return { ac, dc }
}

async function writeButton(guid, { ac, dc }) {
  await powercfg(['/setacvalueindex', 'SCHEME_CURRENT', SUB_BUTTONS, guid, String(ac)])
  await powercfg(['/setdcvalueindex', 'SCHEME_CURRENT', SUB_BUTTONS, guid, String(dc)])
}

export async function powerGuardOn() {
  const { ac, dc } = await readButton(BUTTONS.power.guid)
  return ac === 0 && dc === 0
}

export async function setPowerGuard(on) {
  if (on) {
    if (!fs.existsSync(guardFile())) {
      const saved = {}
      for (const [name, b] of Object.entries(BUTTONS)) saved[name] = await readButton(b.guid)
      // Already "Do nothing" before we touched it: remember the Windows default instead.
      for (const [name, b] of Object.entries(BUTTONS))
        if (saved[name].ac === 0 && saved[name].dc === 0) saved[name] = { ac: b.fallback, dc: b.fallback }
      fs.writeFileSync(guardFile(), JSON.stringify(saved, null, 2))
    }
    for (const b of Object.values(BUTTONS)) await writeButton(b.guid, { ac: 0, dc: 0 })
  } else {
    let saved = {}
    try {
      saved = JSON.parse(fs.readFileSync(guardFile(), 'utf8'))
    } catch {
      /* no saved values: fall back to the Windows defaults */
    }
    for (const [name, b] of Object.entries(BUTTONS))
      await writeButton(b.guid, saved[name] || { ac: b.fallback, dc: b.fallback })
    fs.rmSync(guardFile(), { force: true })
  }
  await powercfg(['/setactive', 'SCHEME_CURRENT'])
}

export async function status() {
  let filter = false
  try {
    filter = filterKeysOn()
  } catch {
    /* reported as off */
  }
  const powerGuard = await powerGuardOn().catch(() => false)
  return { filterKeys: filter, powerGuard, streamDeck: await streamDeckRunning(), streamDeckInstalled: fs.existsSync(STREAM_DECK) }
}

// The keyboard lock half of each mode lives in index.js (it owns the hook). Work mode leaves the
// power button guard alone: the agents still need protecting while you're at the desk.
export const actions = {
  async babyMode() {
    await setPowerGuard(true)
    await stopStreamDeck()
  },
  async workMode() {
    setFilterKeys(false)
    await startStreamDeck()
  },
  async toggleFilterKeys() {
    setFilterKeys(!filterKeysOn())
  },
  async togglePowerGuard() {
    await setPowerGuard(!(await powerGuardOn()))
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
