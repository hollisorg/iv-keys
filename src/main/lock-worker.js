// Keyboard lock hook thread (runs as a worker, started by lock.js).
//
// Windows calls a low-level keyboard hook on the thread that installed it, for every key event in
// the whole system, and only while that thread is waiting for messages. On Electron's main thread
// the hook shared a thread with the window, so each key press waited behind window work (moves,
// fades, redraws) and the hook could fire in the middle of it. With the lock on, the window then
// stopped moving or typing. Here the hook gets a thread of its own that does nothing but wait in
// GetMessage, so key presses are answered at once and the window never sees them.
//
// The thread ends when it receives WM_QUIT: lock.js posts it to unlock, and the both-Ctrl unlock
// chord posts it from in here.
import { parentPort } from 'node:worker_threads'
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
const POINT = koffi.struct('POINT', { x: 'int32', y: 'int32' })
const MSG = koffi.struct('MSG', {
  hwnd: 'uintptr_t',
  message: 'uint32',
  wParam: 'uintptr_t',
  lParam: 'intptr_t',
  time: 'uint32',
  pt: POINT,
  lPrivate: 'uint32'
})
const HOOKPROC = koffi.proto('intptr_t __stdcall LowLevelKeyboardProc(int nCode, uintptr_t wParam, void *lParam)')
const SetWindowsHookExW = user32.func('void * __stdcall SetWindowsHookExW(int idHook, LowLevelKeyboardProc *lpfn, void *hmod, uint32 dwThreadId)')
const CallNextHookEx = user32.func('intptr_t __stdcall CallNextHookEx(void *hhk, int nCode, uintptr_t wParam, void *lParam)')
const UnhookWindowsHookEx = user32.func('bool __stdcall UnhookWindowsHookEx(void *hhk)')
const GetMessageW = user32.func('int __stdcall GetMessageW(_Out_ MSG *lpMsg, uintptr_t hWnd, uint32 wMsgFilterMin, uint32 wMsgFilterMax)')
const PeekMessageW = user32.func('bool __stdcall PeekMessageW(_Out_ MSG *lpMsg, uintptr_t hWnd, uint32 wMsgFilterMin, uint32 wMsgFilterMax, uint32 wRemoveMsg)')
const PostQuitMessage = user32.func('void __stdcall PostQuitMessage(int nExitCode)')
const SetTimer = user32.func('uintptr_t __stdcall SetTimer(uintptr_t hWnd, uintptr_t nIDEvent, uint32 uElapse, void *lpTimerFunc)')
const KillTimer = user32.func('bool __stdcall KillTimer(uintptr_t hWnd, uintptr_t uIDEvent)')
const GetModuleHandleW = kernel32.func('void * __stdcall GetModuleHandleW(void *lpModuleName)')
const GetCurrentThreadId = kernel32.func('uint32 __stdcall GetCurrentThreadId()')
const GetTickCount = kernel32.func('uint32 __stdcall GetTickCount()')

const WH_KEYBOARD_LL = 13
const HC_ACTION = 0
const WM_KEYDOWN = 0x100
const WM_SYSKEYDOWN = 0x104
const WM_TIMER = 0x113
const WM_USER = 0x400
const PM_NOREMOVE = 0
const LLKHF_INJECTED = 0x10
const VK_LCONTROL = 0xa2
const VK_RCONTROL = 0xa3
const UNLOCK_HOLD_MS = 2000
const TICK_MS = 100

let hook = null
let blocked = 0 // physical key presses swallowed
let passed = 0 // simulated key presses let through
let reported = { blocked: -1, passed: -1 }
const ctrlDown = { [VK_LCONTROL]: false, [VK_RCONTROL]: false }
let chordSince = null
let unlockedByKeyboard = false

// Both Ctrl keys held together for 2 seconds unlocks. Checked on every key event and on the timer,
// because a held key may stop repeating.
function trackChord(vk, down) {
  if (vk !== VK_LCONTROL && vk !== VK_RCONTROL) return
  ctrlDown[vk] = down
  if (ctrlDown[VK_LCONTROL] && ctrlDown[VK_RCONTROL]) {
    if (chordSince == null) chordSince = GetTickCount()
  } else {
    chordSince = null
  }
}

function checkChord() {
  if (unlockedByKeyboard || chordSince == null) return
  if ((GetTickCount() - chordSince) >>> 0 >= UNLOCK_HOLD_MS) {
    unlockedByKeyboard = true
    PostQuitMessage(0)
  }
}

function report() {
  if (reported.blocked === blocked && reported.passed === passed) return
  reported = { blocked, passed }
  parentPort.postMessage({ type: 'stats', blocked, passed, tick: GetTickCount() })
}

// Runs for every key event system-wide. Keep it fast: Windows drops hooks that take too long.
// Key releases always pass, so a key held at the moment of locking can't get stuck down.
const callback = koffi.register((nCode, wParam, lParam) => {
  if (nCode === HC_ACTION) {
    const info = koffi.decode(lParam, KBDLLHOOKSTRUCT)
    const msg = Number(wParam) // uintptr_t may arrive as a BigInt
    const down = msg === WM_KEYDOWN || msg === WM_SYSKEYDOWN
    if (info.flags & LLKHF_INJECTED) {
      if (down) passed++
    } else {
      trackChord(info.vkCode, down)
      checkChord()
      if (down) {
        blocked++
        return 1 // swallow the physical key press
      }
    }
  }
  return CallNextHookEx(hook, nCode, wParam, lParam)
}, koffi.pointer(HOOKPROC))

const msg = {}
// Make sure this thread has a message queue before anyone posts WM_QUIT to it.
PeekMessageW(msg, 0, WM_USER, WM_USER, PM_NOREMOVE)
hook = SetWindowsHookExW(WH_KEYBOARD_LL, callback, GetModuleHandleW(null), 0)

if (!hook) {
  koffi.unregister(callback)
  parentPort.postMessage({ type: 'error', message: 'Windows would not install the keyboard lock' })
} else {
  const timer = SetTimer(0, 0, TICK_MS, null)
  parentPort.postMessage({ type: 'ready', threadId: GetCurrentThreadId() })
  for (;;) {
    const r = GetMessageW(msg, 0, 0, 0) // hook calls run inside this wait
    if (r === 0 || r === -1) break // WM_QUIT, or the queue is gone
    if (msg.message === WM_TIMER) {
      checkChord()
      report()
    }
  }
  if (timer) KillTimer(0, timer)
  UnhookWindowsHookEx(hook)
  koffi.unregister(callback)
  report()
  parentPort.postMessage({ type: unlockedByKeyboard ? 'unlocked-by-keyboard' : 'stopped' })
}
