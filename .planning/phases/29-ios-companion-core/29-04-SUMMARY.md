---
phase: 29-ios-companion-core
plan: 04
subsystem: api, ios
tags: [swift, swiftui, swiftdata, corelocation, hono, drizzle, enrichment, ios-13]

# Dependency graph
requires:
  - phase: 29-02
    provides: SyncEngine with offline queue, idempotency keys, retry logic
  - phase: 29-03
    provides: ConnectionMonitor, DashboardView, DashboardViewModel, ProjectRowView
provides:
  - App lifecycle wiring with scenePhase foreground sync
  - LocationService for city-level capture metadata
  - IOS-13 fix preserving user-assigned projectId in enrichment
  - captureCount per project in GET /api/projects response
affects: [ios-voice-capture, ios-widget, dashboard-enrichments]

# Tech tracking
tech-stack:
  added: [CoreLocation]
  patterns: [App Group UserDefaults for cross-target data sharing, scenePhase lifecycle sync, city-level location with kCLLocationAccuracyReduced]

key-files:
  created:
    - ~/mission-control-ios/MissionControl/Services/LocationService.swift
  modified:
    - ~/mission-control-ios/MissionControl/MissionControlApp.swift
    - ~/mission-control-ios/ShareExtension/ShareView.swift
    - packages/api/src/services/enrichment.ts
    - packages/api/src/__tests__/services/enrichment.test.ts
    - packages/api/src/routes/projects.ts

key-decisions:
  - "LocationService uses kCLLocationAccuracyReduced for city-level only (privacy-first)"
  - "Share extension reads lastKnownCity from App Group UserDefaults (no CLLocationManager in extension per pitfall #6)"
  - "IOS-13 fix: capture.projectId ?? aiResult.projectSlug (user assignment always wins over AI)"
  - "captureCount uses GROUP BY on captures table with isNotNull filter"

patterns-established:
  - "App Group UserDefaults for sharing location data between main app and share extension"
  - "scenePhase .active triggers ConnectionMonitor probe then conditional SyncEngine flush"

requirements-completed: [IOS-09, IOS-11, IOS-13]

# Metrics
duration: 5min
completed: 2026-03-22
---

# Phase 29 Plan 04: App Lifecycle Integration Summary

**Foreground sync via scenePhase, LocationService for city metadata, IOS-13 enrichment fix preserving user projectId, and captureCount in projects API**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-22T23:54:25Z
- **Completed:** 2026-03-22T23:59:49Z
- **Tasks:** 3 (2 auto + 1 checkpoint approved)
- **Files modified:** 6

## Accomplishments
- App lifecycle fully wired: SyncEngine, ConnectionMonitor, and LocationService injected into MissionControlApp with scenePhase foreground sync
- LocationService provides city-level metadata via kCLLocationAccuracyReduced, persisted to App Group UserDefaults for share extension access
- Fixed IOS-13 bug: user-assigned projectId now takes precedence over AI categorization in enrichment pipeline, with dedicated test verifying user='nexusclaw' beats AI='mission-control'
- Added captureCount per project to GET /api/projects response for iOS dashboard (IOS-09, D-06)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire app lifecycle -- scenePhase sync, environment injection, LocationService** - `415e615` (feat, mission-control-ios repo)
2. **Task 2: Fix server-side enrichment to preserve user-assigned projectId (IOS-13) and add captureCount to projects API** - `26ad5b8` (fix, mission-control repo)
3. **Task 3: Verify complete iOS Companion Core app on simulator** - checkpoint approved

## Files Created/Modified
- `~/mission-control-ios/MissionControl/Services/LocationService.swift` - City-level location service with App Group persistence
- `~/mission-control-ios/MissionControl/MissionControlApp.swift` - Full app lifecycle wiring (scenePhase, environment injection)
- `~/mission-control-ios/ShareExtension/ShareView.swift` - Reads lastKnownCity from App Group UserDefaults for capture metadata
- `packages/api/src/services/enrichment.ts` - Fixed projectId priority: user > AI (IOS-13)
- `packages/api/src/__tests__/services/enrichment.test.ts` - IOS-13 test case + nexusclaw project seed
- `packages/api/src/routes/projects.ts` - captureCount per project in response

## Decisions Made
- LocationService uses kCLLocationAccuracyReduced for city-level only (privacy-first, per IOS-11)
- Share extension reads lastKnownCity from App Group UserDefaults rather than requesting location permission (per research pitfall #6)
- IOS-13 fix reverses operand order: `capture.projectId ?? aiResult.projectSlug` instead of `aiResult.projectSlug ?? capture.projectId`
- captureCount uses SQL GROUP BY on captures table with isNotNull filter, same pattern as existing copyCount

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all data paths are fully wired.

## Next Phase Readiness
- iOS Companion Core (Phase 29) is complete: all 4 plans shipped
- Share extension, offline queue, sync engine, dashboard, connection monitor, location service, and app lifecycle are fully integrated
- Server-side IOS-13 guarantee enforced with test
- Ready for Phase 30 (iOS voice capture / widget) or other v1.4 phases

## Self-Check: PASSED

- All 6 files verified present on disk
- Commit `415e615` verified in mission-control-ios repo
- Commit `26ad5b8` verified in mission-control repo
- 589 API tests + 90 web tests pass (679 total)
- iOS build succeeds (BUILD SUCCEEDED)

---
*Phase: 29-ios-companion-core*
*Completed: 2026-03-22*
