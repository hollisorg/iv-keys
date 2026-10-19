// Keyboard lock for toddler time.
//
// A low-level keyboard hook (WH_KEYBOARD_LL) swallows key presses that come from the physical
// keyboard, so slaps, the Windows key, Alt+Tab and media keys do nothing. Simulated keystrokes are
// let through (Windows marks them LLKHF_INJECTED), so IV Keys' on-screen keys and IV Voice's paste
// keep working.
//
// Safety:
//   - Key releases always pass, so a key held at the moment of locking can't get stuck down.
//   - Hold both Ctrl keys for 2 seconds to unlock from the physical keyboard.
//   - Ctrl+Alt+Del can never be blocked by an app.
//   - If IV Keys exits or stops responding, Windows drops or bypasses the hook automatically.
import { EventEmitter } from 'node:events'
import koffi from 'koffi'

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
  vkCode: 'uint32',
  scanCode: 'uint32',
  flags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t'
})
const HOOKPROC = koffi.proto('intptr_t __stdcall LowLevelKeyboardProc(int nCode, uintptr_t wParam, void *lParam)')
const SetWindowsHookExW = user32.func('void * __stdcall SetWindowsHookExW(int idHook, LowLevelKeyboardProc *lpfn, void *hmod, uint32 dwThreadId)')
const CallNextHookEx = user32.func('intptr_t __stdcall CallNextHookEx(void *hhk, int nCode, uintptr_t wParam, void *lParam)')
const UnhookWindowsHookEx = user32.func('bool __stdcall UnhookWindowsHookEx(void *hhk)')
const GetModuleHandleW = kernel32.func('void * __stdcall GetModuleHandleW(void *lpModuleName)')

const WH_KEYBOARD_LL = 13
const HC_ACTION = 0
const WM_KEYDOWN = 0x100
const WM_SYSKEYDOWN = 0x104
const LLKHF_INJECTED = 0x10
const VK_LCONTROL = 0xa2
const VK_RCONTROL = 0xa3
const UNLOCK_HOLD_MS = 2000

export class KeyboardLock extends EventEmitter {
  constructor() {
    super()
    this.hook = null
    this.callback = null
    this.locked = false
    this.blocked = 0 // physical key presses swallowed this session
    this.passed = 0 // simulated key presses let through this session
    this.ctrlDown = { [VK_LCONTROL]: false, [VK_RCONTROL]: false }
    this.unlockTimer = null
  }

  lock() {
    if (this.locked) return
    this.callback = koffi.register((nCode, wParam, lParam) => this.onKey(nCode, wParam, lParam), koffi.pointer(HOOKPROC))
    this.hook = SetWindowsHookExW(WH_KEYBOARD_LL, this.callback, GetModuleHandleW(null), 0)
    if (!this.hook) {
      koffi.unregister(this.callback)
      this.callback = null
      throw new Error('Windows would not install the keyboard lock')
    }
    this.locked = true
    this.blocked = 0
    this.passed = 0
    this.emit('change', this.state())
  }

  unlock() {
    if (!this.locked) return
    clearTimeout(this.unlockTimer)
    UnhookWindowsHookEx(this.hook)
    koffi.unregister(this.callback)
    this.hook = null
    this.callback = null
    this.locked = false
    this.ctrlDown = { [VK_LCONTROL]: false, [VK_RCONTROL]: false }
    this.emit('change', this.state())
  }

  state() {
    return { locked: this.locked, blocked: this.blocked }
  }

  // Runs for every key event system-wide while locked. Keep it fast: Windows skips hooks that
  // take too long.
  onKey(nCode, wParam, lParam) {
    if (nCode !== HC_ACTION) return CallNextHookEx(this.hook, nCode, wParam, lParam)
    const info = koffi.decode(lParam, KBDLLHOOKSTRUCT)
    const msg = Number(wParam) // uintptr_t may arrive as a BigInt
    const down = msg === WM_KEYDOWN || msg === WM_SYSKEYDOWN
    if (info.flags & LLKHF_INJECTED) {
      if (down) this.passed++
      return CallNextHookEx(this.hook, nCode, wParam, lParam)
    }
    this.trackUnlockChord(info.vkCode, down)
    if (!down) return CallNextHookEx(this.hook, nCode, wParam, lParam)
    this.blocked++
    return 1 // swallow the physical key press
  }

  // Both Ctrl keys held together for 2 seconds unlocks.
  trackUnlockChord(vk, down) {
    if (vk !== VK_LCONTROL && vk !== VK_RCONTROL) return
    this.ctrlDown[vk] = down
    if (this.ctrlDown[VK_LCONTROL] && this.ctrlDown[VK_RCONTROL]) {
      if (!this.unlockTimer) {
        this.unlockTimer = setTimeout(() => {
          this.unlockTimer = null
          this.unlock()
          this.emit('unlocked-by-keyboard')
        }, UNLOCK_HOLD_MS)
      }
    } else {
      clearTimeout(this.unlockTimer)
      this.unlockTimer = null
    }
  }
}
