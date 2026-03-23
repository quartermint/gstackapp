---
phase: 36-ios-edge-intelligence
plan: 03
subsystem: ios
tags: [foundation-models, on-device-ml, swift, swiftdata, capture-classification, edge-intelligence]

# Dependency graph
requires:
  - phase: 36-02
    provides: "CaptureClassifierProtocol, CaptureClassification @Generable struct, DeviceContext, QueuedCapture extensions, MockCaptureClassifier"
provides:
  - "FoundationModelsCaptureClassifier with constrained decoding and context window management"
  - "SyncEngine pre-sync classification step with device context stamping"
  - "Device classification payload in API sync calls"
  - "App-level classifier initialization with Foundation Models prewarm"
affects: [ios-dashboard, api-captures, server-enrichment]

# Tech tracking
tech-stack:
  added: [FoundationModels, SystemLanguageModel, LanguageModelSession]
  patterns: ["@preconcurrency protocol conformance for @MainActor classes", "token estimation heuristic (word_count / 0.75)", "pre-sync classification pipeline", "device hint as projectId fallback"]

key-files:
  created:
    - "~/mission-control-ios/MissionControl/Services/CaptureClassifier.swift"
    - "~/mission-control-ios/MissionControlTests/CaptureClassifierTests.swift"
  modified:
    - "~/mission-control-ios/MissionControl/Services/SyncEngine.swift"
    - "~/mission-control-ios/MissionControl/MissionControlApp.swift"
    - "~/mission-control-ios/MissionControlTests/SyncEngineTests.swift"

key-decisions:
  - "@preconcurrency conformance for FoundationModelsCaptureClassifier to satisfy Swift 6 strict concurrency with @MainActor + nonisolated protocol"
  - "Token estimation heuristic: word_count / 0.75, max(1, ...) for empty strings"
  - "New LanguageModelSession per classification (one-shot, no context carry-over)"
  - "ConnectionMonitor passed to classifyPendingCaptures for accurate connectivity state"

patterns-established:
  - "Pre-sync classification pipeline: classify -> stamp context -> build payload -> sync"
  - "@preconcurrency protocol conformance pattern for Foundation Models @MainActor classes"

requirements-completed: [EDGE-01, EDGE-02, EDGE-03, EDGE-04, EDGE-06]

# Metrics
duration: 8min
completed: 2026-03-23
---

# Phase 36 Plan 03: Foundation Models Classifier + SyncEngine Wiring Summary

**On-device capture classification with Foundation Models constrained decoding, pre-sync enrichment pipeline, and context window management with summarization fallback**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-23T13:47:27Z
- **Completed:** 2026-03-23T13:55:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- FoundationModelsCaptureClassifier with @Generable constrained decoding, 3500-token safe limit with summarization fallback, and availability gating
- SyncEngine classifies pending captures before sync, stamps device context (timeOfDay, connectivity), and includes DeviceClassificationPayload in API calls
- App initializes Foundation Models classifier on iOS 26+ with prewarm on launch for responsive first classification
- Smart routing: device projectSlug used as fallback when user hasn't assigned project; user assignment always wins (IOS-13)
- 12 new tests (5 CaptureClassifier + 7 SyncEngine) all passing, plus all 26 existing tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Foundation Models CaptureClassifier with context window management** - `9b6d4cf` (feat)
2. **Task 2: Wire SyncEngine pre-sync classification, device context, and app initialization** - `c5aabf3` (feat)

## Files Created/Modified
- `MissionControl/Services/CaptureClassifier.swift` - Foundation Models classifier with constrained decoding, context window management, prewarm, availability gating
- `MissionControlTests/CaptureClassifierTests.swift` - 5 tests verifying protocol contract via NoOp and Mock classifiers
- `MissionControl/Services/SyncEngine.swift` - Classifier injection, classifyPendingCaptures method, cachedProjectList helper, device classification payload in sync, smart routing
- `MissionControl/MissionControlApp.swift` - Classifier initialization with compile-time + runtime gating, prewarm on appear, classification before sync
- `MissionControlTests/SyncEngineTests.swift` - 7 new tests for classification pipeline, skip logic, payload, routing, device context

## Decisions Made
- **@preconcurrency conformance:** FoundationModelsCaptureClassifier is @MainActor (required by Foundation Models) but CaptureClassifierProtocol is nonisolated. Swift 6 strict concurrency requires @preconcurrency on the conformance to bridge isolation domains safely.
- **New LanguageModelSession per classification:** One-shot sessions avoid carrying unnecessary context between unrelated captures.
- **Token estimation heuristic (word_count / 0.75):** Apple does not expose a public tokenizer. This heuristic is conservative enough to avoid context window overflow.
- **ConnectionMonitor parameter on classifyPendingCaptures:** Passed explicitly rather than stored as property to avoid lifecycle coupling between SyncEngine and ConnectionMonitor.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Swift 6 strict concurrency error on protocol conformance**
- **Found during:** Task 1 (CaptureClassifier build)
- **Issue:** `FoundationModelsCaptureClassifier: CaptureClassifierProtocol` crosses into @MainActor-isolated code, violating Swift 6 strict concurrency
- **Fix:** Added `@preconcurrency` annotation to protocol conformance
- **Files modified:** MissionControl/Services/CaptureClassifier.swift
- **Verification:** Build succeeded, all tests pass
- **Committed in:** 9b6d4cf (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Standard Swift 6 concurrency annotation. No scope creep.

## Issues Encountered
None beyond the auto-fixed Swift 6 concurrency issue.

## Known Stubs
None - all data paths are fully wired. Foundation Models code is behind `#if canImport(FoundationModels)` and `@available(iOS 26, *)` which is runtime-conditional, not a stub.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 36 (ios-edge-intelligence) is now complete with all 3 plans shipped
- Foundation Models classifier, type contracts, and API integration are all wired end-to-end
- Real on-device classification requires a physical device with Apple Intelligence enabled (iOS 26+)
- All automated tests use MockCaptureClassifier; on-device testing is a manual verification step

## Self-Check: PASSED

- CaptureClassifier.swift: FOUND
- CaptureClassifierTests.swift: FOUND
- 36-03-SUMMARY.md: FOUND
- Commit 9b6d4cf: FOUND
- Commit c5aabf3: FOUND

---
*Phase: 36-ios-edge-intelligence*
*Completed: 2026-03-23*
