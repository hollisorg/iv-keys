# IV Keys

The Infinite Variance on-screen keyboard and family control center for Windows. Tap keys and text
lands in the app you were already using: the window never takes focus. It also drives IV Voice
dictation and switches the room between Baby Mode and Work Mode.

IV Keys 4 is a rebuild of Baby Mode Control (a .NET WinForms app) in the same stack and style as
IV Voice and IV Downloader, with the same features.

## What it does

- **Keyboard that never steals focus.** Keys fire the moment you press them. Every tap counts,
  including quick repeats of the same key, and Backspace, Delete and the arrows repeat while held.
  Shift and Ctrl/Alt are one-shot and Caps stays on until you tap it again. The legends follow your
  physical Shift key.
- **Emoji tray** attached to the right, in full color.
- **IV Voice.**
  - **Voice** starts hands-free dictation; **Done** finishes and the text is typed where you were.
  - **Paste last** and **Cancel** are in the full view.
  - If IV Voice isn't running, the first tap starts it.
  - The button follows IV Voice's state live over its local control pipe.
- **Room controls (full view):**
  - **Baby mode:** Filter Keys on, Stream Deck off.
  - **Work mode:** Filter Keys off, Stream Deck on.
  - Direct switches for each, plus live status chips.
- **Screenshot.** Hides IV Keys, opens Windows' snipping tool, and comes back when you're done.
- **Views.** Keyboard only (compact) or Controls (full), each with its own zoom. It remembers the
  view, zoom and position, and carries over Baby Mode Control's saved view on first run.
- **Hover fade.** Fades to half when the pointer is elsewhere.
- **Tray icon, auto-updates and per-user installer**, like the other IV apps.

## Run it

```bash
npm install
npm run dev
```

Run these from your own terminal. Apps started from the Claude desktop app's shell have their
AppData redirected into Claude's package folder.

## How it works

- `src/main/native.js` calls Windows directly through **koffi**, with no compiled addon of our own:
  - `SendInput` types Unicode text, including emoji surrogate pairs, and sends key combos as one
    atomic batch. Arrow keys, Delete and the right-hand modifiers carry the extended-key flag.
  - `SystemParametersInfo` reads and toggles Filter Keys.
  - `GetAsyncKeyState` follows the physical Shift key.
  - The foreground process name and the clipboard sequence number tell when screenshot mode is done.
- `src/main/system.js` covers Stream Deck (tasklist, taskkill, start) and the two modes.
- `src/main/voice.js` is the IV Voice pipe client (`\\.\pipe\iv-voice-<user>`).
- `src/main/index.js` sets up the window:
  - It's `focusable: false` and always on top, and shows without activating.
  - Zoom is Chromium's zoom factor and the window resizes to match.
  - The hover fade and Shift tracking run on a 60 ms tick, and room status refreshes every 3 s,
    none of it on the UI thread.
- The renderer is in `src/renderer/src/`: `App.jsx` (toolbar and views) plus `Keyboard`,
  `Controls` and `EmojiTray`.

### Development self-test

`window.keys.dev.typeTest()` (dev builds only) opens a scratch text box, forces it to the front,
and types `ab`, Backspace, `c😀`, Left and `!` through the real `SendInput` path. It expects
`ac!😀`. It refuses to send any key unless its own window is confirmed to be in front, so a focus
failure can never type into another app.

## Build the installer

```bash
npm run dist
```

This writes `dist\IV-Keys-Setup.exe`. Releases, code signing and auto-updates work the same as the
other IV apps; see `docs/RELEASING.md` and `docs/CODE-SIGNING.md`.

## Licence

MIT (see `LICENSE`). Third-party components are listed in `THIRD_PARTY_NOTICES.txt`.
