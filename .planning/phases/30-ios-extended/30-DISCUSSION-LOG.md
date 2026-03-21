# Phase 30: iOS Extended - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-21
**Phase:** 30-ios-extended
**Areas discussed:** Widget UX, Voice UX

---

## Widget Capture UX

| Option | Description | Selected |
|--------|-------------|----------|
| Text field + send button (Recommended) | Medium widget with text input and send button. Tap opens keyboard. Dictation via iOS keyboard mic. Like Reminders widget. | ✓ |
| Quick action buttons | Small widget with preset buttons: Text, Voice, Link. Each opens app. More modes, extra tap. | |
| Tap-to-open only | Shows pending count and last sync. Tapping opens capture screen. Widget doesn't capture. | |

**User's choice:** Text field + send button
**Notes:** Familiar Reminders-style widget, 3-tap flow.

---

## Voice Capture UX

| Option | Description | Selected |
|--------|-------------|----------|
| Live waveform + countdown (Recommended) | Audio waveform, countdown timer, stop button. After: transcription preview, re-record or save. Both audio + text stored. | ✓ (modified) |
| Minimal timer | Simple circular timer with pulsing indicator. No waveform. Lighter UI. | |
| Record-and-forget | Tap record, tap stop. Queues immediately. No preview, no re-record. | |

**User's choice:** Live waveform + no time limit
**Notes:** User requested removing the 60s recording cap entirely. Transcription handles chunking in 60s segments via SFSpeechRecognizer. Original requirement IOS-05 specified 60s — user overrode to unlimited.

---

## Claude's Discretion

- Waveform visualization implementation
- Audio format and compression
- Transcription chunking logic
- Widget configuration
- Timer display (elapsed, not countdown since no limit)

## Deferred Ideas

- SpeechAnalyzer upgrade — deferred until iOS 26 adoption
- AppIntents integration — research flag, needs execution budget validation
