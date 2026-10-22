# Changelog

## 4.2.0 (2026-10-22)

- **Power button guard** so a curious toddler can't shut the PC down:
  - Sets the power and sleep buttons to "Do nothing" on the active power plan. No admin needed.
  - Switch it off and the previous actions come back (they're saved, so this survives restarts).
  - **Baby mode** turns it on. **Work mode** leaves it on; use the switch or the tray menu to
    turn it off.
  - Stays on if IV Keys closes, and shows as the **Power** chip.
  - Holding the button for about 4 seconds still forces the PC off. That's hardware, so a physical
    button cover is the fix for it.

## 4.1.0 (2026-10-19)

- **Windows key** between Ctrl and Alt. Tap Win then a key for shortcuts (Win + E, Win + D, Win + V…);
  tap Win twice to open Start.
- **Keyboard lock** for toddler time:
  - Blocks every key from the physical keyboard, including the Windows key, Alt + Tab and media keys.
  - On-screen keys and IV Voice's paste keep typing.
  - Turn it on with **Lock** in the toolbar or the Keyboard lock switch.
  - Unlock on screen, or hold both Ctrl keys for 2 seconds.
  - Ctrl + Alt + Del always works, and the lock lifts automatically if IV Keys closes.
- **Baby mode** now locks the keyboard (instead of turning Filter Keys on) and stops Stream Deck.
  **Work mode** unlocks it. The Filter Keys switch stays available.
- Status chips no longer wrap in the full view.

## 4.0.0 (2026-10-19)

Baby Mode Control is rebuilt as **IV Keys** on the same stack and design as IV Voice and IV Downloader.

- New Infinite Variance layout:
  - **Keyboard only** view with a slim toolbar.
  - **Controls** view with the room modes, direct switches, IV Voice and a large keyboard.
  - An attached emoji tray in full color.
- Keys fire on press. Quick repeats of the same key always type, and Backspace, Delete and the
  arrows repeat while held.
- IV Voice Start/Done, Paste last and Cancel are driven over IV Voice's control pipe, with live state.
- Baby Mode, Work Mode, Filter Keys and Stream Deck controls, with live status chips.
- Screenshot mode, zoom per view, remembered view, size and position (carried over from Baby Mode
  Control), hover fade, tray icon.
- Auto-updates and a per-user installer, like the other IV apps.
