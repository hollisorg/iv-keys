// Full view, left column: room modes, direct controls and IV Voice.
export default function Controls({ room, voice, onAction, onVoice, busy }) {
  const babyActive = room && room.filterKeys && !room.streamDeck
  const workActive = room && !room.filterKeys && (room.streamDeck || !room.streamDeckInstalled)

  return (
    <aside className="controls">
      <section className="panel">
        <p className="mono label">01 / The room</p>
        <h2 className="panel-title">Set the room.</h2>
        <div className="modes">
          <button className={`mode ${babyActive ? 'mode-on' : ''}`} disabled={busy} onClick={() => onAction('babyMode', 'Baby Mode is on')}>
            <span className="mode-name">Baby mode</span>
            <span className="mode-detail">Filter Keys on · Stream Deck off</span>
          </button>
          <button className={`mode ${workActive ? 'mode-on' : ''}`} disabled={busy} onClick={() => onAction('workMode', 'Work Mode is on')}>
            <span className="mode-name">Work mode</span>
            <span className="mode-detail">Filter Keys off · Stream Deck on</span>
          </button>
        </div>
      </section>

      <section className="panel">
        <p className="mono label">02 / Direct</p>
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

function Switch({ label, detail, on, disabled, onClick }) {
  return (
    <button className={`switch ${on ? 'switch-on' : ''}`} disabled={disabled} onClick={onClick}>
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
