import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, shell, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { clipboardSequence, forceForeground, foregroundHandle, foregroundProcessName, sendCombo, shiftHeld, typeText, VK, vkForChar } from './native'
import { KeyboardLock } from './lock'
import { actions, setPowerGuard, startIvVoice, status as roomStatus } from './system'
import { initUpdater, updateState } from './updater'
import { VoiceClient } from './voice'

if (!app.requestSingleInstanceLock()) app.quit()

// ---------- view settings ----------

// Base layout sizes in CSS px at 100% zoom; the window is this × zoom.
const SIZES = {
  compact: { width: 800, height: 336 },
  full: { width: 1180, height: 736 }
}
const EMOJI_WIDTH = 248
const ZOOM = { compact: [0.55, 1.25], full: [0.65, 1.25] }

const settingsFile = () => path.join(app.getPath('userData'), 'view.json')
let view = { mode: 'compact', compactZoom: 0.8, fullZoom: 0.9, emoji: false, fade: true, x: null, y: null }

function loadView() {
  try {
    view = { ...view, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }
    return
  } catch {
    /* first run: carry over the old app's view */
  }
  const local = process.env.LOCALAPPDATA || ''
  for (const old of [path.join(local, 'IVKeys', 'view-settings.txt'), path.join(local, 'BabyModeControl', 'view-settings.txt')]) {
    try {
      for (const line of fs.readFileSync(old, 'utf8').split(/\r?\n/)) {
        const [k, v] = line.split('=')
        if (k === 'mode') view.mode = v === 'full' ? 'full' : 'compact'
        if (k === 'compactZoom' && Number(v)) view.compactZoom = Number(v)
        if (k === 'fullZoom' && Number(v)) view.fullZoom = Number(v)
      }
      return
    } catch {
      /* try the next one */
    }
  }
}

function saveView() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(settingsFile(), JSON.stringify(view, null, 2))
  } catch {
    /* non-fatal */
  }
}

const zoomOf = () => (view.mode === 'full' ? view.fullZoom : view.compactZoom)

// ---------- window ----------

let win = null
let tray = null
let updater = null
const voice = new VoiceClient()
const keyLock = new KeyboardLock()

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function contentSize() {
  const base = SIZES[view.mode]
  const z = zoomOf()
  return { width: Math.round((base.width + (view.emoji ? EMOJI_WIDTH : 0)) * z), height: Math.round(base.height * z) }
}

// Resize around the current centre, kept on screen.
function applyView(keepCenter = true) {
  if (!win) return
  const { width, height } = contentSize()
  const b = win.getBounds()
  const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  win.webContents.setZoomFactor(zoomOf())
  win.setContentSize(width, height)
  if (keepCenter) {
    const area = screen.getDisplayNearestPoint({ x: Math.round(center.x), y: Math.round(center.y) }).workArea
    const x = Math.round(Math.max(area.x, Math.min(area.x + area.width - width, center.x - width / 2)))
    const y = Math.round(Math.max(area.y, Math.min(area.y + area.height - height, center.y - height / 2)))
    win.setPosition(x, y)
  }
  send('view:changed', view)
}

function createWindow() {
  const { width, height } = contentSize()
  const area = screen.getPrimaryDisplay().workArea
  const onScreen = view.x != null && screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return view.x >= a.x - 50 && view.x < a.x + a.width - 50 && view.y >= a.y - 20 && view.y < a.y + a.height - 50
  })
  win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    x: onScreen ? view.x : Math.round(area.x + (area.width - width) / 2),
    y: onScreen ? view.y : Math.round(area.y + area.height - height - 24),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    // Never take focus: clicks type into the app you were already using.
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'IV Keys',
    icon: path.join(app.getAppPath(), 'resources', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  win.setAlwaysOnTop(true, 'floating')
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })
  win.once('ready-to-show', () => {
    win.webContents.setZoomFactor(zoomOf())
    win.showInactive()
  })
  win.on('moved', () => {
    const [x, y] = win.getPosition()
    view.x = x
    view.y = y
    saveView()
  })
  win.on('closed', () => {
    win = null
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function showWindow() {
  if (!win) createWindow()
  else win.showInactive()
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(app.getAppPath(), 'resources', 'tray.png')))
  tray.setToolTip('IV Keys')
  tray.on('click', showWindow)
  buildTrayMenu(false)
}

let trayGuard = null
function buildTrayMenu(powerGuard) {
  if (!tray || trayGuard === powerGuard) return
  trayGuard = powerGuard
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show IV Keys', click: showWindow },
      {
        label: 'Power button guard',
        type: 'checkbox',
        checked: powerGuard,
        click: async (item) => {
          try {
            await setPowerGuard(item.checked)
          } catch (err) {
            send('toast', err.message)
          }
          refreshStatus()
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}

// ---------- background loops: hover fade, physical Shift, room status ----------

let opacity = 1
let lastShift = false

function tick() {
  if (!win || win.isDestroyed() || !win.isVisible()) return
  // Fade to half when the pointer is elsewhere; only touch opacity when it actually changes.
  const target = !view.fade || insideWindow() ? 1 : 0.5
  if (opacity !== target) {
    opacity = Math.abs(target - opacity) < 0.09 ? target : opacity + Math.sign(target - opacity) * 0.08
    win.setOpacity(opacity)
  }
  const shift = shiftHeld()
  if (shift !== lastShift) {
    lastShift = shift
    send('shift:physical', shift)
  }
}

function insideWindow() {
  const p = screen.getCursorScreenPoint()
  const b = win.getBounds()
  return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height
}

let statusBusy = false
async function refreshStatus() {
  if (statusBusy) return
  statusBusy = true
  try {
    const s = await roomStatus()
    send('room:status', s)
    buildTrayMenu(s.powerGuard)
  } finally {
    statusBusy = false
  }
}

// ---------- screenshot: hide, open Snip & Sketch, come back when done ----------

const SNIP = /^(ScreenClippingHost|SnippingTool|ScreenSketch)\.exe$/i
let snipping = false

async function screenshot() {
  if (snipping || !win) return
  snipping = true
  const seq = clipboardSequence()
  const started = Date.now()
  let overlaySeen = false
  win.hide()
  await new Promise((r) => setTimeout(r, 160))
  try {
    sendCombo([VK.LSHIFT, VK.LWIN, VK.S])
  } catch {
    finishSnip()
    return
  }
  const poll = setInterval(() => {
    const elapsed = Date.now() - started
    let overlay = false
    try {
      overlay = SNIP.test(foregroundProcessName() || '')
    } catch {
      /* treat as not showing */
    }
    if (overlay) overlaySeen = true
    if (clipboardSequence() !== seq || (overlaySeen && !overlay && elapsed > 1000) || elapsed > 15000) {
      clearInterval(poll)
      finishSnip()
    }
  }, 250)
}

function finishSnip() {
  snipping = false
  if (win && !win.isVisible()) win.showInactive()
  send('toast', 'Screenshot mode finished')
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('view:get', () => view)
  ipcMain.handle('view:set', (_e, patch = {}) => {
    if (patch.mode === 'compact' || patch.mode === 'full') view.mode = patch.mode
    if (typeof patch.emoji === 'boolean') view.emoji = patch.emoji
    if (typeof patch.fade === 'boolean') view.fade = patch.fade
    if (typeof patch.zoomStep === 'number') {
      const [lo, hi] = ZOOM[view.mode]
      const key = view.mode === 'full' ? 'fullZoom' : 'compactZoom'
      view[key] = Math.round(Math.min(hi, Math.max(lo, view[key] + patch.zoomStep)) * 100) / 100
    }
    saveView()
    applyView()
    return view
  })

  // Typing: text as Unicode, or a combo when Ctrl/Alt are latched.
  const modifiers = ({ ctrl, alt, shift, win }) => [
    ...(ctrl ? [VK.LCONTROL] : []),
    ...(win ? [VK.LWIN] : []),
    ...(alt ? [VK.LMENU] : []),
    ...(shift ? [VK.LSHIFT] : [])
  ]
  ipcMain.handle('key:text', (_e, { text, ctrl, alt, shift, win }) => {
    if (typeof text !== 'string' || !text || text.length > 16) return
    if (ctrl || alt || win) {
      const vk = vkForChar(text)
      if (vk == null) return
      sendCombo([...modifiers({ ctrl, alt, shift, win }), vk])
    } else {
      typeText(text)
    }
  })
  const ALLOWED_VK = new Set([VK.BACK, VK.TAB, VK.RETURN, VK.ESCAPE, VK.LEFT, VK.UP, VK.RIGHT, VK.DOWN, VK.DELETE, VK.SPACE])
  ipcMain.handle('key:special', (_e, { vk, ctrl, alt, shift, win }) => {
    if (vk === VK.LWIN) return sendCombo([VK.LWIN]) // Win on its own: Start menu
    if (!ALLOWED_VK.has(vk)) return
    sendCombo([...modifiers({ ctrl, alt, shift, win }), vk])
  })

  ipcMain.handle('room:status', () => roomStatus())
  ipcMain.handle('room:action', async (_e, name) => {
    if (!actions[name]) throw new Error('Unknown action')
    if (name === 'babyMode') keyLock.lock()
    if (name === 'workMode') keyLock.unlock()
    await actions[name]()
    const s = await roomStatus()
    send('room:status', s)
    buildTrayMenu(s.powerGuard)
    return s
  })

  ipcMain.handle('lock:state', () => keyLock.state())
  ipcMain.handle('lock:set', (_e, on) => {
    on ? keyLock.lock() : keyLock.unlock()
    return keyLock.state()
  })

  ipcMain.handle('voice:state', () => voice.state)
  ipcMain.handle('voice:command', async (_e, cmd) => {
    if (!['toggle', 'stop', 'cancel', 'paste-last'].includes(cmd)) throw new Error('Unknown command')
    if (!voice.state.connected) {
      if (cmd !== 'toggle') throw new Error('IV Voice isn’t running')
      startIvVoice()
      return { started: true }
    }
    return voice.send(cmd)
  })

  ipcMain.handle('screenshot', () => screenshot())
  ipcMain.handle('app:quit', () => app.quit())
  ipcMain.handle('update:state', () => updateState())
  ipcMain.handle('update:install', () => updater?.install())

  // Development only: type into a scratch window through the real SendInput path and read it back.
  // It refuses to send a single key unless its own window is confirmed to be in front, so a
  // failed focus can never type into another app.
  if (!app.isPackaged) {
    ipcMain.handle('dev:typeTest', async (_e, { withLock = false } = {}) => {
      if (withLock) keyLock.lock()
      const before = keyLock.passed
      const target = new BrowserWindow({ width: 320, height: 120, show: false, alwaysOnTop: true })
      await target.loadURL('data:text/html,<textarea id=t autofocus style="width:100%;height:100%"></textarea>')
      const hwnd = target.getNativeWindowHandle().readBigUInt64LE(0)
      target.show()
      const focused = forceForeground(hwnd)
      await target.webContents.executeJavaScript("document.getElementById('t').focus()")
      await new Promise((r) => setTimeout(r, 300))
      const steps = [() => typeText('ab'), () => sendCombo([VK.BACK]), () => typeText('c😀'), () => sendCombo([VK.LEFT]), () => typeText('!')]
      let sent = 0
      if (focused) {
        for (const step of steps) {
          if (foregroundHandle() !== hwnd) break // focus moved away: stop before typing anywhere else
          step()
          sent++
          await new Promise((r) => setTimeout(r, 40))
        }
      }
      await new Promise((r) => setTimeout(r, 300))
      const value = await target.webContents.executeJavaScript("document.getElementById('t').value")
      target.destroy()
      const lock = withLock ? { passedThroughLock: keyLock.passed - before, physicalBlocked: keyLock.blocked } : undefined
      if (withLock) keyLock.unlock()
      if (!focused || sent < steps.length) return { aborted: true, focused, sent, value, lock }
      return { expected: 'ac!😀', value, pass: value === 'ac!😀', lock }
    })
  }
}

// ---------- lifecycle ----------

app.on('second-instance', showWindow)

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  loadView()
  registerIpc()
  createWindow()
  createTray()
  updater = initUpdater((s) => send('update:changed', s))
  voice.on('change', (s) => send('voice:state', s))
  keyLock.on('change', (s) => send('lock:state', s))
  keyLock.on('unlocked-by-keyboard', () => send('toast', 'Keyboard unlocked (both Ctrl keys held)'))
  setInterval(tick, 60)
  refreshStatus()
  setInterval(refreshStatus, 3000)
})

app.on('before-quit', () => {
  keyLock.unlock()
  voice.close()
})
app.on('window-all-closed', () => app.quit())
