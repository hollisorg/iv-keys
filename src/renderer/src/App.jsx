import { useCallback, useEffect, useRef, useState } from 'react'
import Keyboard from './components/Keyboard'
import Controls, { VoiceButton } from './components/Controls'
import EmojiTray from './components/EmojiTray'

const clean = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export default function App() {
  const [view, setView] = useState(null)
  const [room, setRoom] = useState(null)
  const [voice, setVoice] = useState({ connected: false, state: 'idle', locked: false })
  const [mods, setMods] = useState({ shift: false, caps: false, ctrl: false, alt: false })
  const [physicalShift, setPhysicalShift] = useState(false)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [update, setUpdate] = useState(null)
  const toastTimer = useRef(null)

  const say = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  useEffect(() => {
    window.keys.view.get().then(setView)
    window.keys.room.status().then(setRoom)
    window.keys.voice.state().then(setVoice)
    window.keys.app.update().then(setUpdate)
    const offs = [
      window.keys.view.onChange(setView),
      window.keys.room.onStatus(setRoom),
      window.keys.voice.onState(setVoice),
      window.keys.onPhysicalShift(setPhysicalShift),
      window.keys.onToast(say),
      window.keys.app.onUpdate(setUpdate)
    ]
    return () => offs.forEach((f) => f())
  }, [say])

  if (!view) return null

  const setViewPatch = async (patch) => setView(await window.keys.view.set(patch))
  const full = view.mode === 'full'
  const zoom = Math.round((full ? view.fullZoom : view.compactZoom) * 100)

  const onAction = async (name, done) => {
    setBusy(true)
    try {
      setRoom(await window.keys.room.action(name))
      say(done)
    } catch (err) {
      say(clean(err))
    } finally {
      setBusy(false)
    }
  }

  const onVoice = async (cmd) => {
    try {
      const r = await window.keys.voice.command(cmd)
      if (r?.started) say('Starting IV Voice. Tap again in a moment')
      else if (cmd === 'paste-last') say('Pasted last dictation')
      else if (cmd === 'cancel') say('Dictation cancelled')
    } catch (err) {
      say(clean(err))
    }
  }

  const toolbar = (
    <div className="toolbar">
      <div className="brand">
        <span className="brand-mark">IV</span>
        <span className="mono">Keys</span>
        {full && <span className="mono dim">/ Infinite Variance</span>}
      </div>
      {full && room && (
        <div className="chips">
          <Chip label="Filter Keys" on={room.filterKeys} />
          <Chip label="Stream Deck" on={room.streamDeck} />
          <Chip label="IV Voice" on={voice.connected} />
        </div>
      )}
      <span className="toast mono">{toast}</span>
      <div className="tools">
        {!full && <VoiceButton voice={voice} onVoice={onVoice} />}
        <button className="tool" onClick={() => window.keys.screenshot()}>
          Screenshot
        </button>
        <button className={`tool ${view.emoji ? 'tool-on' : ''}`} onClick={() => setViewPatch({ emoji: !view.emoji })}>
          Emoji
        </button>
        <div className="zoom">
          <button className="tool tool-sq" onClick={() => setViewPatch({ zoomStep: -0.05 })} aria-label="Smaller">
            −
          </button>
          <span className="mono">{zoom}%</span>
          <button className="tool tool-sq" onClick={() => setViewPatch({ zoomStep: 0.05 })} aria-label="Bigger">
            +
          </button>
        </div>
        <button className="tool" onClick={() => setViewPatch({ mode: full ? 'compact' : 'full' })}>
          {full ? 'Keyboard only' : 'Controls'}
        </button>
        {update?.status === 'ready' && (
          <button className="tool tool-update" onClick={() => window.keys.app.installUpdate()}>
            Update
          </button>
        )}
        <button className="tool tool-sq tool-close" onClick={() => window.keys.quit()} aria-label="Close IV Keys">
          ×
        </button>
      </div>
    </div>
  )

  const keyboard = (
    <section className="keys-card">
      {full && (
        <div className="keys-head">
          <p className="mono label">04 / The keys</p>
          <h1 className="keys-title">
            Type anywhere<span className="accent">.</span>
          </h1>
          <p className="keys-sub">Never takes focus. Your text lands in the app behind it.</p>
        </div>
      )}
      <Keyboard mods={mods} setMods={setMods} physicalShift={physicalShift} onError={say} />
    </section>
  )

  return (
    <div className={`shell ${full ? 'shell-full' : 'shell-compact'} ${view.emoji ? 'with-emoji' : ''}`}>
      <div className="main-card">
        {toolbar}
        {full ? (
          <div className="full-grid">
            <Controls room={room} voice={voice} onAction={onAction} onVoice={onVoice} busy={busy} />
            {keyboard}
          </div>
        ) : (
          keyboard
        )}
      </div>
      {view.emoji && <EmojiTray onClose={() => setViewPatch({ emoji: false })} onError={say} />}
    </div>
  )
}

function Chip({ label, on }) {
  return (
    <span className={`chip mono ${on ? 'chip-on' : ''}`}>
      <span className="chip-dot" aria-hidden />
      {label}
    </span>
  )
}
