const EMOJIS = ['😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤔', '😭', '😡', '👍', '🙏', '🙌', '👏', '❤️', '🔥', '🎉', '💯', '👀', '🚀']

export default function EmojiTray({ onClose, onError }) {
  return (
    <aside className="emoji-tray">
      <div className="emoji-head">
        <p className="mono label">Emoji</p>
        <button className="icon-btn" onClick={onClose} aria-label="Close emoji tray">
          ×
        </button>
      </div>
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button
            key={e}
            className="emoji"
            tabIndex={-1}
            onPointerDown={(ev) => {
              ev.preventDefault()
              window.keys.type({ text: e }).catch((err) => onError(String(err.message || err)))
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </aside>
  )
}
