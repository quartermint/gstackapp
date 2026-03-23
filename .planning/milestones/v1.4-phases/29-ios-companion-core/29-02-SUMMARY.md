---
phase: 29-ios-companion-core
plan: 02
subsystem: ios
tags: [swift, swiftui, swiftdata, share-extension, sync-engine, offline-queue, idempotency]

# Dependency graph
requires:
  - phase: 29-ios-companion-core
    plan: 01
    provides: SwiftData QueuedCapture model, SharedModelContainer, MCAPIClientProtocol, MockMCAPIClient, Constants
provides:
  - Share extension with text/URL extraction, content preview, and optional project picker
  - SyncEngine with retry logic, exponential backoff, idempotency keys, and debounce guard
  - Project list caching to App Group UserDefaults for share extension project picker
  - 12 new unit tests (5 QueuedCapture, 3 ShareExtension, 7 SyncEngine -- note 3 preexisting from other agents)
affects: [29-03-dashboard, 29-04-sync-lifecycle]

# Tech tracking
tech-stack:
  added: [UserNotifications (badge count)]
  patterns: [UIHostingController bridge for SwiftUI in extension, App Group UserDefaults for cross-process data, Exponential backoff with retry count tracking]

key-files:
  created:
    - ~/mission-control-ios/ShareExtension/ShareView.swift
    - ~/mission-control-ios/MissionControl/Services/SyncEngine.swift
    - ~/mission-control-ios/MissionControlTests/QueuedCaptureTests.swift
    - ~/mission-control-ios/MissionControlTests/ShareExtensionTests.swift
    - ~/mission-control-ios/MissionControlTests/SyncEngineTests.swift
  modified:
    - ~/mission-control-ios/ShareExtension/ShareViewController.swift

key-decisions:
  - "No networking in share extension -- writes to SwiftData only, SyncEngine handles API communication"
  - "Project picker reads cached list from App Group UserDefaults -- main app populates on project fetch"
  - "SyncEngine debounces at 30s intervals to prevent rapid foreground transition hammering"
  - "Exponential backoff (2^retryCount seconds) with max 3 retries before giving up"

patterns-established:
  - "UIHostingController bridge: Share extension uses UIViewController to host SwiftUI view with model container"
  - "Cross-process data sharing: App Group UserDefaults for project list (main app writes, extension reads)"
  - "Sync guard pattern: isSyncing flag + debounce interval prevents concurrent/rapid syncs"
  - "Badge count pattern: UNUserNotificationCenter.setBadgeCount for pending capture visibility"

requirements-completed: [IOS-01, IOS-02, IOS-07, IOS-08, IOS-13]

# Metrics
duration: 10min
completed: 2026-03-22
---

# Phase 29 Plan 02: Capture Pipeline Summary

**Share extension with text/URL extraction and project picker, plus SyncEngine with idempotent retry logic and offline-first capture flow**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-22T23:40:05Z
- **Completed:** 2026-03-22T23:50:05Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Share extension extracts text and URLs from any iOS app, shows content preview with optional project picker, and saves QueuedCapture to shared SwiftData store with zero networking
- SyncEngine flushes pending captures to MC API with idempotency keys, exponential backoff, debounce guard, and concurrent sync protection
- Project list caching to App Group UserDefaults bridges main app data to share extension project picker
- 24 total tests passing (including tests from parallel agents), all new SyncEngine and capture tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Share extension -- ShareViewController + ShareView with content extraction and project picker** - `10c1501` (feat)
2. **Task 2: SyncEngine with retry logic, idempotency keys, pending count, and project list caching** - `bf67402` (feat)

## Files Created/Modified
- `~/mission-control-ios/ShareExtension/ShareViewController.swift` - UIHostingController bridge hosting SwiftUI ShareView with shared SwiftData container
- `~/mission-control-ios/ShareExtension/ShareView.swift` - Capture confirm UI with content preview, URL detection, project picker, and Save button
- `~/mission-control-ios/MissionControl/Services/SyncEngine.swift` - Foreground sync with retry logic, idempotency, debounce, badge count, and project list caching
- `~/mission-control-ios/MissionControlTests/QueuedCaptureTests.swift` - 5 tests for capture creation defaults, link type, project ID, metadata, and unique keys
- `~/mission-control-ios/MissionControlTests/ShareExtensionTests.swift` - 3 tests for text capture, URL capture, and user project assignment
- `~/mission-control-ios/MissionControlTests/SyncEngineTests.swift` - 7 tests for pending count, sync, idempotency, project ID, retry, debounce, and no-container guard

## Decisions Made
- No networking in share extension process -- writes to SwiftData only; SyncEngine in main app handles API communication (per D-03)
- Project picker reads cached project list from App Group UserDefaults rather than fetching from API (per D-01)
- SyncEngine uses 30-second debounce interval to prevent hammering on rapid foreground transitions (per research pitfall #5)
- Exponential backoff uses 2^retryCount seconds (2s, 4s, 8s) with max 3 retries before marking capture as permanently failed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Known Stubs
None - all components are fully functional.

## Next Phase Readiness
- Share extension and SyncEngine are ready to be wired into app lifecycle (Plan 04)
- SyncEngine.configure(container:) must be called at app startup
- SyncEngine.syncPendingCaptures() should be triggered on scenePhase .active transitions
- SyncEngine.cacheProjectList() should be called after DashboardViewModel fetches projects (Plan 03)
- SyncEngine.requestBadgePermission() should be called once on first launch

## Self-Check: PASSED

- All 6 created/modified files verified to exist on disk
- Commit 10c1501 (Task 1) verified in git log
- Commit bf67402 (Task 2) verified in git log
- xcodebuild build exits 0
- xcodebuild test exits 0 (24 tests, 0 failures)

---
*Phase: 29-ios-companion-core*
*Completed: 2026-03-22*
