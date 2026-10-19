// Windows APIs through koffi (no compiled addon of our own):
//   SendInput            type characters (Unicode) and key combos into the focused app
//   SystemParametersInfo read/flip Filter Keys
//   GetAsyncKeyState     follow the physical Shift key so the on-screen legends match
//   foreground process   detect the Snipping Tool overlay during screenshots
import koffi from 'koffi'

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: 'uint16',
  wScan: 'uint16',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t'
})
const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
  dx: 'int32',
  dy: 'int32',
  mouseData: 'uint32',
  dwFlags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t'
})
const INPUT = koffi.struct('INPUT', {
  type: 'uint32',
  u: koffi.union('INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT })
})
const FILTERKEYS = koffi.struct('FILTERKEYS', {
  cbSize: 'uint32',
  dwFlags: 'uint32',
  iWaitMSec: 'uint32',
  iDelayMSec: 'uint32',
  iRepeatMSec: 'uint32',
  iBounceMSec: 'uint32'
})

const SendInput = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)')
const SystemParametersInfoW = user32.func('bool __stdcall SystemParametersInfoW(uint32 uiAction, uint32 uiParam, _Inout_ FILTERKEYS *pvParam, uint32 fWinIni)')
const GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int vKey)')
const VkKeyScanW = user32.func('int16 __stdcall VkKeyScanW(uint16 ch)')
const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()')
const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)')
const GetClipboardSequenceNumber = user32.func('uint32 __stdcall GetClipboardSequenceNumber()')
const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)')
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void *hObject)')
const QueryFullProcessImageNameW = kernel32.func('bool __stdcall QueryFullProcessImageNameW(void *hProcess, uint32 dwFlags, _Out_ uint8 *lpExeName, _Inout_ uint32 *lpdwSize)')

// Same functions declared with integer handles, for comparing and forcing the foreground window.
const GetForegroundWindowValue = user32.func('uintptr_t __stdcall GetForegroundWindow()')
const GetWindowThreadIdValue = user32.func('uint32 __stdcall GetWindowThreadProcessId(uintptr_t hWnd, uintptr_t lpdwProcessId)')
const SetForegroundWindowValue = user32.func('bool __stdcall SetForegroundWindow(uintptr_t hWnd)')
const AttachThreadInput = user32.func('bool __stdcall AttachThreadInput(uint32 idAttach, uint32 idAttachTo, bool fAttach)')
const GetCurrentThreadId = kernel32.func('uint32 __stdcall GetCurrentThreadId()')

const INPUT_KEYBOARD = 1
const KEYEVENTF_EXTENDEDKEY = 0x1
const KEYEVENTF_KEYUP = 0x2
const KEYEVENTF_UNICODE = 0x4
const SPI_GETFILTERKEYS = 0x32
const SPI_SETFILTERKEYS = 0x33
const SPIF_UPDATEINIFILE = 0x1
const SPIF_SENDCHANGE = 0x2
const FKF_FILTERKEYSON = 0x1
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

export const VK = {
  BACK: 0x08, TAB: 0x09, RETURN: 0x0d, SHIFT: 0x10, ESCAPE: 0x1b, SPACE: 0x20,
  LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28, DELETE: 0x2e,
  LWIN: 0x5b, LSHIFT: 0xa0, LCONTROL: 0xa2, LMENU: 0xa4, S: 0x53
}

export const INPUT_SIZE = koffi.sizeof(INPUT)

// Arrows, Delete, Home/End… and the right-hand modifiers are "extended"; without the flag some
// apps read them as numpad keys.
const extended = (vk) => (vk >= 0x21 && vk <= 0x28) || vk === 0x2d || vk === 0x2e || vk === 0xa3 || vk === 0xa5 || vk === 0x5b || vk === 0x5c

const vkInput = (vk, up) => ({
  type: INPUT_KEYBOARD,
  u: { ki: { wVk: vk, wScan: 0, dwFlags: (up ? KEYEVENTF_KEYUP : 0) | (extended(vk) ? KEYEVENTF_EXTENDEDKEY : 0), time: 0, dwExtraInfo: 0 } }
})

const unicodeInput = (code, up) => ({
  type: INPUT_KEYBOARD,
  u: { ki: { wVk: 0, wScan: code, dwFlags: KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0), time: 0, dwExtraInfo: 0 } }
})

function send(inputs) {
  if (!inputs.length) return
  const sent = SendInput(inputs.length, inputs, INPUT_SIZE)
  if (sent !== inputs.length) throw new Error('Windows did not accept the keyboard input')
}

// Press keys in order, release in reverse, as one atomic batch.
export function sendCombo(vks) {
  send([...vks.map((vk) => vkInput(vk, false)), ...[...vks].reverse().map((vk) => vkInput(vk, true))])
}

// Type text as Unicode (works for any character, including emoji surrogate pairs).
export function typeText(text) {
  const inputs = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    inputs.push(unicodeInput(code, false), unicodeInput(code, true))
  }
  send(inputs)
}

// Virtual-key for a character on the current layout (for Ctrl/Alt shortcuts like Ctrl+C).
export function vkForChar(ch) {
  const r = VkKeyScanW(ch.charCodeAt(0))
  return r === -1 ? null : r & 0xff
}

function readFilterKeys() {
  const fk = { cbSize: koffi.sizeof(FILTERKEYS), dwFlags: 0, iWaitMSec: 0, iDelayMSec: 0, iRepeatMSec: 0, iBounceMSec: 0 }
  if (!SystemParametersInfoW(SPI_GETFILTERKEYS, fk.cbSize, fk, 0)) throw new Error('Windows would not report Filter Keys')
  return fk
}

export function filterKeysOn() {
  return (readFilterKeys().dwFlags & FKF_FILTERKEYSON) !== 0
}

export function setFilterKeys(on) {
  const fk = readFilterKeys()
  fk.dwFlags = on ? fk.dwFlags | FKF_FILTERKEYSON : fk.dwFlags & ~FKF_FILTERKEYSON
  if (!SystemParametersInfoW(SPI_SETFILTERKEYS, fk.cbSize, fk, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE)) {
    throw new Error('Windows would not change Filter Keys')
  }
}

export function shiftHeld() {
  return (GetAsyncKeyState(VK.SHIFT) & 0x8000) !== 0
}

export function clipboardSequence() {
  return GetClipboardSequenceNumber()
}

export function foregroundHandle() {
  return BigInt(GetForegroundWindowValue())
}

// Bring one of our own windows to the front (used only by the dev self-test). Windows blocks
// background apps from taking focus, so briefly attach to the foreground thread's input first.
// Returns true only if the window really is in front afterwards.
export function forceForeground(hwnd) {
  const target = BigInt(hwnd)
  const fg = GetForegroundWindowValue()
  const fgThread = fg ? GetWindowThreadIdValue(fg, 0) : 0
  const self = GetCurrentThreadId()
  const attached = fgThread && fgThread !== self ? AttachThreadInput(self, fgThread, true) : false
  try {
    SetForegroundWindowValue(target)
  } finally {
    if (attached) AttachThreadInput(self, fgThread, false)
  }
  return foregroundHandle() === target
}

// Executable name of the foreground window's process, e.g. "ScreenClippingHost.exe".
export function foregroundProcessName() {
  const hwnd = GetForegroundWindow()
  if (!hwnd) return null
  const pid = [0]
  GetWindowThreadProcessId(hwnd, pid)
  if (!pid[0]) return null
  const h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0])
  if (!h) return null
  try {
    const buf = Buffer.alloc(1040)
    const size = [520]
    if (!QueryFullProcessImageNameW(h, 0, buf, size)) return null
    return buf.toString('utf16le', 0, size[0] * 2).split('\\').pop()
  } finally {
    CloseHandle(h)
  }
}
