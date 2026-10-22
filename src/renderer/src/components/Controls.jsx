// Full view, left column: room modes, direct controls and IV Voice.
export default function Controls({ room, voice, keyLock, onToggleLock, onAction, onVoice, busy }) {
  const babyActive = room && keyLock.locked && room.powerGuard && !room.streamDeck
  const workActive = room && !keyLock.locked && !room.filterKeys && (room.streamDeck || !room.streamDeckInstalled)

  return (
    <aside className="controls">
      <section className="panel">
        <p className="mono label">01 / The room</p>
        <h2 className="panel-title">Set the room.</h2>
        <div className="modes">
          <button className={`mode ${babyActive ? 'mode-on' : ''}`} disabled={busy} onClick={() => onAction('babyMode', 'Baby Mode is on')}>
            <span className="mode-name">Baby mode</span>
            <span className="mode-detail">Keyboard locked · Power button off · Stream Deck off</span>
          </button>
          <button className={`mode ${workActive ? 'mode-on' : ''}`} disabled={busy} onClick={() => onAction('workMode', 'Work Mode is on')}>
            <span className="mode-name">Work mode</span>
            <span className="mode-detail">Keyboard unlocked · Stream Deck on</span>
          </button>
        </div>
      </section>

      <section className="panel">
        <p className="mono label">02 / Direct</p>
        <Switch
          label="Keyboard lock"
          detail={keyLock.locked ? `Physical keys blocked${keyLock.blocked ? ` (${keyLock.blocked} so far)` : ''} · hold both Ctrl 2 s to unlock` : 'On-screen keys still type'}
          title="Blocks the physical keyboard. Hold both Ctrl keys for 2 seconds to unlock"
          on={keyLock.locked}
          disabled={busy}
          onClick={onToggleLock}
        />
        <Switch
          label="Power button guard"
          detail={room?.powerGuard ? 'Presses do nothing' : 'Power button works normally'}
          title="Sets the power and sleep buttons to Do nothing. Holding the power button for 4 seconds still forces the PC off; that's hardware."
          on={room?.powerGuard}
          disabled={busy || !room}
          onClick={() => onAction('togglePowerGuard', room?.powerGuard ? 'Power button works again' : 'Power button now does nothing')}
        />
        <Switch
          label="Filter Keys"
          detail="Ignores quick or repeated key presses"
          on={room?.filterKeys}
          disabled={busy || !room}
          onClick={() => onAction('toggleFilterKeys', room?.filterKeys ? 'Filter Keys off' : 'Filter Keys on')}
        />
        <Switch
          label="Stream Deck"
          detail={room && !room.streamDeckInstalled ? 'Not installed' : room?.streamDeck ? 'Running' : 'Stopped'}
          on={room?.streamDeck}
          disabled={busy || !room || !room.streamDeckInstalled}
          onClick={() => onAction('toggleStreamDeck', room?.streamDeck ? 'Stream Deck stopped' : 'Stream Deck started')}
        />
      </section>

      <section className="panel voice-panel">
        <p className="mono label">03 / IV Voice</p>
        <VoiceButton voice={voice} onVoice={onVoice} big />
        <div className="voice-row">
          <button className="btn-ghost" disabled={!voice.connected} onClick={() => onVoice('paste-last')}>
            Paste last
          </button>
          <button className="btn-ghost" disabled={!voice.connected || voice.state !== 'recording'} onClick={() => onVoice('cancel')}>
            Cancel
          </button>
        </div>
        <p className="voice-status">
          {!voice.connected
            ? 'IV Voice isn’t running. Start opens it.'
            : voice.state === 'recording'
              ? 'Listening. Tap Finish when you’re done.'
              : voice.state === 'working'
                ? 'Typing what you said…'
                : 'Ready. Text lands wherever you’re typing.'}
        </p>
      </section>
    </aside>
  )
}

function Switch({ label, detail, title, on, disabled, onClick }) {
  return (
    <button className={`switch ${on ? 'switch-on' : ''}`} disabled={disabled} onClick={onClick} title={title}>
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        <span className="switch-detail">{detail}</span>
      </span>
      <span className="switch-track" aria-hidden>
        <span />
      </span>
    </button>
  )
}

export function VoiceButton({ voice, onVoice, big = false }) {
  const recording = voice.state === 'recording'
  const working = voice.state === 'working'
  const label = recording ? (big ? 'Finish dictating' : 'Done') : working ? 'Typing…' : big ? 'Start dictating' : 'Voice'
  return (
    <button
      className={`voice-btn ${big ? 'voice-big' : ''} ${recording ? 'voice-rec' : ''} ${working ? 'voice-working' : ''}`}
      disabled={working}
      onClick={() => onVoice('toggle')}
    >
      <span className="voice-dot" aria-hidden />
      {label}
    </button>
  )
}
