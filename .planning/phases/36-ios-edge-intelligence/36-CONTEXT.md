# Phase 36: iOS Edge Intelligence - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Apple Foundation Models integration to the iOS companion app (built in v1.4 phases 29-30). On-device capture classification, pre-sync enrichment, smart routing between device and Mac Mini, and fully offline intelligence.

**Dependency:** v1.4 Phase 29-30 must ship first (iOS app must exist). This phase adds intelligence to an existing app.

</domain>

<decisions>
## Implementation Decisions

### Foundation Models Integration
- **D-01:** iOS 17+ minimum deployment target (from v1.4 decision). Foundation Models is an enhancement layer — captures work without it, they just skip on-device enrichment.
- **D-02:** @Generable-style constrained decoding for capture classification: project slug, confidence score, extraction type. Guaranteed structural correctness at token level.
- **D-03:** ~4096 token context window. For long captures, use summarization strategy (like FoundationChat's approach).

### Smart Routing
- **D-04:** High-confidence captures (>0.8) enriched entirely on-device. Never hit Mac Mini for classification.
- **D-05:** Complex captures (ambiguous, multi-project, low confidence) sync to Mac Mini with on-device pre-classification as hint.

### Offline
- **D-06:** All capture processing works offline. Foundation Models + local SwiftData queue = full offline functionality.

### Device Context
- **D-07:** Capture metadata includes: city-level location (Core Location), time-of-day, source app (from share sheet UTI), connectivity state.

### Claude's Discretion
- Foundation Models session management and prewarm strategy
- @Generable struct design for capture classification
- Confidence threshold tuning (0.8 initial, adjustable)
- How device context metadata displays on capture cards (dashboard side)
- Error handling for devices without Apple Intelligence

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision
- `.planning/v2.0-VISION.md` — EDGE-01 through EDGE-06 requirements

### Foundation Models
- Apple Developer Docs: FoundationModels framework (developer.apple.com/documentation/FoundationModels)
- WWDC25 Session 286: "Meet the Foundation Models framework"
- WWDC25 Session 301: "Deep dive into the Foundation Models framework"
- Dimillian/FoundationChat (GitHub) — Production-grade demo with SwiftData, tools, auto-summarization
- PallavAg/Apple-Intelligence-Chat (GitHub) — Minimal proof-of-concept

### iOS App (v1.4)
- `~/mission-control-ios/` — Sibling repo (created in Phase 29)
- v1.4 decisions: SwiftData for offline queue, App Groups for share extension, foreground-only sync

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from v1.4 iOS app)
- SwiftData QueuedCapture model — extend with `deviceClassification` and `deviceContext` fields
- MCAPIClient protocol — extend with pre-classification hint in capture payload
- SyncEngine — add Foundation Models classification step before sync
- Share extension — add classification before queuing

### Established Patterns
- Offline-first queue with foreground sync
- App Group shared container between main app and share extension
- Tailscale network boundary (no auth)

### Integration Points
- Server-side: `POST /api/captures` — accept optional `deviceClassification` field as hint
- Server-side: enrichment pipeline uses device hint to skip/confirm classification
- iOS: Foundation Models session initialized at app launch with project list context

</code_context>

<specifics>
## Specific Ideas

- FoundationChat's context window management: estimate tokens (~word count / 0.75), switch to summary + last message at 3500 tokens. Apply same pattern.
- The @Generable struct for capture classification should include: projectSlug (String), confidence (Double), extractionType (enum: project_ref, action_item, idea, link, question), reasoning (String).
- Foundation Models' tool calling could eventually invoke device-local tools (check calendar for meeting context, read contacts for relationship hints). Start with classification only.

</specifics>

<deferred>
## Deferred Ideas

- Foundation Models tool calling for device-local actions (calendar, contacts)
- On-device voice transcription + classification in one pass
- Foundation Models for notification summarization (if MC ever adds push)

</deferred>

---

*Phase: 36-ios-edge-intelligence*
*Context gathered: 2026-03-22*
