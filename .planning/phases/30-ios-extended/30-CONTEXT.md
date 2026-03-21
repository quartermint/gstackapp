# Phase 30: iOS Extended - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Home screen widget capture (3-tap flow) and voice recording with on-device transcription. Builds on Phase 29's offline queue and sync infrastructure. Lives in ~/mission-control-ios.

</domain>

<decisions>
## Implementation Decisions

### Widget capture UX
- **D-01:** Medium WidgetKit widget with text input area and send button — like Reminders widget
- **D-02:** Tap opens inline keyboard, dictation via iOS keyboard mic button
- **D-03:** Widget writes to shared App Group offline queue within 3-second WidgetKit execution budget (IOS-04)
- **D-04:** 3-tap flow: tap widget → type/dictate → tap send

### Voice capture UX
- **D-05:** Recording screen shows live audio waveform animation, countdown timer, and stop button
- **D-06:** No hard recording time limit — user records until they tap stop. Transcription chunked in 60s segments via SFSpeechRecognizer.
- **D-07:** After recording: shows transcription preview with option to re-record or save
- **D-08:** Stores both transcription text and original audio file (.m4a) — per IOS-06
- **D-09:** Transcription uses SFSpeechRecognizer (on-device). SpeechAnalyzer upgrade deferred to future milestone.

### Claude's Discretion
- Waveform visualization implementation (Core Animation vs SwiftUI)
- Audio recording format and compression settings
- Transcription chunking and stitching logic
- Widget configuration options (if any)
- Countdown timer vs elapsed timer display

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### iOS Extended requirements
- `.planning/REQUIREMENTS.md` — IOS-03 through IOS-06 define widget and voice requirements
- `.planning/ROADMAP.md` §Phase 30 — Success criteria (4 items), research flags on SpeechAnalyzer and AppIntents

### Phase 29 foundation
- `.planning/phases/29-ios-companion-core/29-CONTEXT.md` — Offline queue and sync architecture decisions

### Deferred requirements
- `.planning/REQUIREMENTS.md` §Future Requirements — KNOW-F02 (SpeechAnalyzer upgrade when iOS 26 adoption sufficient)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 29 offline queue (Core Data + App Group) — widget and voice captures write to same queue
- Phase 29 sync infrastructure — voice captures sync via same foreground flush mechanism
- Idempotency keys — voice captures get UUIDs like text captures

### Established Patterns
- App Group shared container — widget extension accesses same offline queue as share sheet and main app
- Foreground sync — all capture types (text, link, voice) sync through same pipeline

### Integration Points
- Shared App Group container — widget writes captures here
- Main app offline queue — picks up widget and voice captures for sync
- `POST /api/captures` — voice captures POST with type: "voice", attach audio file
- WidgetKit timeline provider — widget refreshes to show pending count

</code_context>

<specifics>
## Specific Ideas

- Voice recording limit removed — user records as long as they want, transcription handles chunking
- Widget should feel like Reminders widget — familiar, fast, minimal

</specifics>

<deferred>
## Deferred Ideas

- SpeechAnalyzer API upgrade — deferred until iOS 26 adoption is sufficient (KNOW-F02)
- AppIntents / Shortcuts integration — research flag noted in roadmap, validate execution budget

</deferred>

---

*Phase: 30-ios-extended*
*Context gathered: 2026-03-21*
