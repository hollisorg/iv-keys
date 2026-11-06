// Keyboard lock for toddler time.
//
// A low-level keyboard hook (WH_KEYBOARD_LL) swallows key presses that come from the physical
// keyboard, so slaps, the Windows key, Alt+Tab and media keys do nothing. Simulated keystrokes are
// let through (Windows marks them LLKHF_INJECTED), so IV Keys' on-screen keys and IV Voice's paste
// keep working.
//
// The hook lives on its own thread (lock-worker.js), never on the main thread that runs the
// window. See that file for why.
//
// Safety:
//   - Key releases always pass, so a key held at the moment of locking can't get stuck down.
//   - Hold both Ctrl keys for 2 seconds to unlock from the physical keyboard.
//   - Ctrl+Alt+Del can never be blocked by an app.
//   - If IV Keys exits or stops responding, Windows drops or bypasses the hook automatically.
import { EventEmitter } from 'node:events'
import koffi from 'koffi'
import createLockWorker from './lock-worker?nodeWorker'

const user32 = koffi.load('user32.dll')
const PostThreadMessageW = user32.func('bool __stdcall PostThreadMessageW(uint32 idThread, uint32 Msg, uintptr_t wParam, intptr_t lParam)')

const WM_QUIT = 0x12
const START_TIMEOUT_MS = 5000

export class KeyboardLock extends EventEmitter {
  constructor() {
    super()
    this.worker = null
    this.threadId = 0
    this.starting = null
    this.cancelStart = false
    this.locked = false
    this.blocked = 0 // physical key presses swallowed this session
    this.passed = 0 // simulated key presses let through this session
  }

  // Resolves once the hook is installed.
  lock() {
    if (this.locked) return Promise.resolve(this.state())
    if (this.starting) return this.starting
    this.cancelStart = false
    const worker = createLockWorker({})
    this.starting = new Promise((resolve, reject) => {
      let settled = false
      const fail = (err) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.starting = null
        worker.removeAllListeners()
        worker.terminate()
        reject(err)
      }
      const timeout = setTimeout(() => fail(new Error('The keyboard lock did not start')), START_TIMEOUT_MS)

      worker.on('message', (m) => {
        if (m.type === 'ready' && !settled) {
          settled = true
          clearTimeout(timeout)
          this.starting = null
          if (this.cancelStart) {
            // Unlock was asked for while the hook was still starting.
            PostThreadMessageW(m.threadId, WM_QUIT, 0, 0)
            resolve(this.state())
            return
          }
          this.worker = worker
          this.threadId = m.threadId
          this.locked = true
          this.blocked = 0
          this.passed = 0
          this.emit('change', this.state())
          resolve(this.state())
        } else if (m.type === 'error') {
          fail(new Error(m.message))
        } else if (worker === this.worker) {
          this.onWorkerMessage(m)
        }
      })
      worker.on('error', (err) => {
        if (!settled) fail(err)
        else if (worker === this.worker) this.lost()
      })
      worker.on('exit', () => {
        if (!settled) fail(new Error('The keyboard lock stopped while starting'))
        else if (worker === this.worker) this.lost()
      })
    })
    return this.starting
  }

  unlock() {
    if (this.starting) this.cancelStart = true
    if (!this.locked) return
    PostThreadMessageW(this.threadId, WM_QUIT, 0, 0)
    this.release()
  }

  state() {
    return { locked: this.locked, blocked: this.blocked }
  }

  onWorkerMessage(m) {
    if (m.type === 'stats') {
      this.blocked = m.blocked
      this.passed = m.passed
    } else if (m.type === 'unlocked-by-keyboard') {
      this.release()
      this.emit('unlocked-by-keyboard')
    }
  }

  release() {
    this.worker = null
    this.threadId = 0
    this.locked = false
    this.emit('change', this.state())
  }

  // The hook thread ended without being asked to.
  lost() {
    this.release()
    this.emit('lost')
  }
}
