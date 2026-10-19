import { useEffect, useRef } from 'react'

// [normal, shifted, width in key units]. Every row adds up to 14.5 units.
const VK = { BACK: 0x08, TAB: 0x09, RETURN: 0x0d, LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28, DELETE: 0x2e, SPACE: 0x20, LWIN: 0x5b }
const char = (n, s, w = 1) => ({ kind: 'char', normal: n, shifted: s, w })
const special = (label, vk, w = 1, repeat = false) => ({ kind: 'special', label, vk, w, repeat })
const mod = (label, name, w) => ({ kind: 'mod', label, name, w })

const ROWS = [
  [...'1234567890'.split('').map((d, i) => char(d, '!@#$%^&*()'[i])), char('-', '_'), char('=', '+'), special('Backspace', VK.BACK, 2.5, true)],
  [special('Tab', VK.TAB, 1.5), ...'qwertyuiop'.split('').map((c) => char(c, c.toUpperCase())), char('[', '{'), char(']', '}'), char('\\', '|')],
  [mod('Caps', 'caps', 1.75), ...'asdfghjkl'.split('').map((c) => char(c, c.toUpperCase())), char(';', ':'), char("'", '"'), special('Enter', VK.RETURN, 1.75)],
  [mod('Shift', 'shift', 2.25), ...'zxcvbnm'.split('').map((c) => char(c, c.toUpperCase())), char(',', '<'), char('.', '>'), char('/', '?'), special('↑', VK.UP, 1, true), special('Del', VK.DELETE, 1.25, true)],
  [mod('Ctrl', 'ctrl', 1.25), mod('Win', 'win', 1.25), mod('Alt', 'alt', 1.25), special('Space', VK.SPACE, 7.75, true), special('←', VK.LEFT, 1, true), special('↓', VK.DOWN, 1, true), special('→', VK.RIGHT, 1, true)]
]

const isLetter = (c) => /^[a-z]$/i.test(c)

export default function Keyboard({ mods, setMods, physicalShift, onError }) {
  const repeatTimer = useRef(null)
  const shiftActive = mods.shift || physicalShift

  useEffect(() => () => clearTimeout(repeatTimer.current), [])

  const legend = (k) => {
    if (!isLetter(k.normal)) return shiftActive ? k.shifted : k.normal
    return mods.caps !== shiftActive ? k.shifted : k.normal
  }

  // One-shot modifiers clear after a key; Caps stays until tapped again.
  const releaseOneShots = () => setMods((m) => ({ ...m, shift: false, ctrl: false, alt: false, win: false }))

  const press = async (k) => {
    try {
      if (k.kind === 'char') {
        const text = legend(k)
        await window.keys.type({ text, ctrl: mods.ctrl, alt: mods.alt, shift: mods.shift, win: mods.win })
      } else if (k.kind === 'special') {
        if (k.vk === VK.SPACE && !mods.ctrl && !mods.alt && !mods.win) await window.keys.type({ text: ' ' })
        else await window.keys.special({ vk: k.vk, ctrl: mods.ctrl, alt: mods.alt, shift: mods.shift, win: mods.win })
      }
      releaseOneShots()
    } catch (err) {
      onError(String(err.message || err))
    }
  }

  // Keys fire on press, like a real keyboard. Backspace, Delete, Space and the arrows repeat when held.
  const down = (k, e) => {
    e.preventDefault()
    if (k.kind === 'mod') {
      // Win latches for a combo (Win + E, Win + D…); tapping it again on its own opens Start.
      if (k.name === 'win' && mods.win && !mods.ctrl && !mods.alt && !mods.shift) {
        window.keys.special({ vk: VK.LWIN }).catch((err) => onError(String(err.message || err)))
        setMods((m) => ({ ...m, win: false }))
        return
      }
      setMods((m) => ({ ...m, [k.name]: !m[k.name] }))
      return
    }
    press(k)
    if (k.repeat) {
      const loop = (delay) => {
        repeatTimer.current = setTimeout(() => {
          window.keys.special({ vk: k.vk }).catch(() => {})
          loop(55)
        }, delay)
      }
      if (k.vk !== VK.SPACE) loop(420)
    }
  }
  const up = () => clearTimeout(repeatTimer.current)

  return (
    <div className="keyboard" onPointerUp={up} onPointerLeave={up}>
      {ROWS.map((row, r) => (
        <div className="krow" key={r}>
          {row.map((k, i) => {
            const on = k.kind === 'mod' && (k.name === 'shift' ? shiftActive : mods[k.name])
            const label = k.kind === 'char' ? legend(k) : k.label
            return (
              <button
                key={i}
                className={`key key-${k.kind} ${on ? 'key-on' : ''} ${label.length > 1 ? 'key-word' : ''}`}
                style={{ flexGrow: k.w, flexBasis: 0 }}
                onPointerDown={(e) => down(k, e)}
                tabIndex={-1}
              >
                {label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
