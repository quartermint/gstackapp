---
phase: 29-ios-companion-core
plan: 03
subsystem: ios-ui
tags: [swiftui, nwpathmonitor, mvvm, observable, dashboard, offline, tailscale]

# Dependency graph
requires:
  - phase: 29-ios-companion-core/01
    provides: "MCAPIClientProtocol, APIModels, MockMCAPIClient, XcodeGen project scaffold"
provides:
  - "ConnectionMonitor with NWPathMonitor + health probe for Tailscale reachability"
  - "DashboardViewModel with Active/Idle/Stale project grouping and worst severity calculation"
  - "DashboardView with grouped project list, pull-to-refresh, last synced footer"
  - "ProjectRowView with health dot, capture count, host badge"
  - "SyncBannerView and OfflineIndicator UI components"
affects: [29-ios-companion-core/04]

# Tech tracking
tech-stack:
  added: []
  patterns: ["@Observable ViewModel with protocol-injected API client", "NWPathMonitor + health probe dual-check for Tailscale connectivity"]

key-files:
  created:
    - "~/mission-control-ios/MissionControl/Services/ConnectionMonitor.swift"
    - "~/mission-control-ios/MissionControl/ViewModels/DashboardViewModel.swift"
    - "~/mission-control-ios/MissionControl/Views/DashboardView.swift"
    - "~/mission-control-ios/MissionControl/Views/ProjectRowView.swift"
    - "~/mission-control-ios/MissionControl/Views/SyncBannerView.swift"
    - "~/mission-control-ios/MissionControl/Views/OfflineIndicator.swift"
    - "~/mission-control-ios/MissionControlTests/DashboardViewModelTests.swift"
    - "~/mission-control-ios/MissionControlTests/ConnectionMonitorTests.swift"
  modified:
    - "~/mission-control-ios/project.yml"

key-decisions:
  - "healthBySlug uses internal setter (not private(set)) for test accessibility with @testable import"
  - "ISO8601DateFormatter tries fractional seconds first then standard format for robust date parsing"
  - "Fixed project.yml: bundle.unit-test type, GENERATE_INFOPLIST_FILE, explicit scheme definition"

patterns-established:
  - "@Observable ViewModel pattern: @MainActor + @Observable + protocol-injected API client with default MCAPIClient()"
  - "Connectivity dual-check: NWPathMonitor for network + API health probe for MC-specific reachability"
  - "Project grouping constants: Active <=7d, Idle 7-30d, Stale >30d (matches web dashboard)"

requirements-completed: [IOS-09, IOS-10, IOS-12]

# Metrics
duration: 10min
completed: 2026-03-22
---

# Phase 29 Plan 03: Dashboard & Connection Monitor Summary

**Native SwiftUI dashboard with Active/Idle/Stale project grouping, health dots, capture counts, pull-to-refresh, offline indicators, and NWPathMonitor-based Tailscale connectivity detection**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-22T23:40:40Z
- **Completed:** 2026-03-22T23:51:12Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- ConnectionMonitor service using NWPathMonitor + API health probe for dual-check Tailscale reachability with VPN settings deep link
- DashboardViewModel grouping projects by Active/Idle/Stale with worst severity calculation, pull-to-refresh, and relative time formatting
- Full SwiftUI dashboard: DashboardView, ProjectRowView (health dot, capture count, host badge), SyncBannerView, OfflineIndicator
- 9 new unit tests covering grouping logic, severity calculation, load/error states, and probe success/failure paths

## Task Commits

Each task was committed atomically:

1. **Task 1: ConnectionMonitor + DashboardViewModel + project grouping logic** - `ab0e591` (feat)
2. **Task 2: Dashboard SwiftUI views** - `dd2c0db` (feat)

## Files Created/Modified
- `~/mission-control-ios/MissionControl/Services/ConnectionMonitor.swift` - NWPathMonitor + health probe for network/MC reachability
- `~/mission-control-ios/MissionControl/ViewModels/DashboardViewModel.swift` - Project grouping, health severity, data fetching, relative time
- `~/mission-control-ios/MissionControl/Views/DashboardView.swift` - Main dashboard with grouped sections, pull-to-refresh, sync/offline banners
- `~/mission-control-ios/MissionControl/Views/ProjectRowView.swift` - Project row with health dot, name, commit time, capture count, host badge
- `~/mission-control-ios/MissionControl/Views/SyncBannerView.swift` - Pending sync count banner with progress indicator
- `~/mission-control-ios/MissionControl/Views/OfflineIndicator.swift` - Offline status with Tailscale prompt and VPN settings link
- `~/mission-control-ios/MissionControlTests/DashboardViewModelTests.swift` - 5 tests: grouping, arrays, severity, refresh, error
- `~/mission-control-ios/MissionControlTests/ConnectionMonitorTests.swift` - 4 tests: initial state, probe success/failure/false
- `~/mission-control-ios/project.yml` - Fixed test target type, added GENERATE_INFOPLIST_FILE, explicit scheme

## Decisions Made
- healthBySlug uses internal setter (not private(set)) so tests can set values directly via @testable import
- ISO8601DateFormatter tries fractional seconds first, then standard format, for robust date parsing from API
- Fixed project.yml from Plan 01: changed test target type from `bundle` to `bundle.unit-test`, added `GENERATE_INFOPLIST_FILE: YES`, and added explicit scheme definition with test targets

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed project.yml test target configuration**
- **Found during:** Task 1 (running tests)
- **Issue:** Test target had `type: bundle` instead of `bundle.unit-test`, missing GENERATE_INFOPLIST_FILE, and no scheme definition -- xcodebuild could not find or run tests
- **Fix:** Changed type to `bundle.unit-test`, added `GENERATE_INFOPLIST_FILE: YES`, added explicit scheme with test targets
- **Files modified:** project.yml
- **Verification:** xcodebuild test exits 0, all 24 tests pass
- **Committed in:** ab0e591 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix to enable test execution. No scope creep.

## Issues Encountered
None beyond the project.yml fix documented above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - DashboardView's syncEngine and connectionMonitor are optional parameters (documented as "injected via .environment() from MissionControlApp in Plan 04"), not stubs.

## Next Phase Readiness
- Dashboard and ConnectionMonitor ready for integration in Plan 04 (app assembly)
- SyncEngine (from Plan 02) and ConnectionMonitor need to be wired into MissionControlApp via environment
- DashboardView replaces the placeholder Text("Mission Control") in MissionControlApp.swift

## Self-Check: PASSED

All 8 created files verified on disk. Both commits (ab0e591, dd2c0db) verified in git log. 24 tests passing. Build exits 0.

---
*Phase: 29-ios-companion-core*
*Completed: 2026-03-22*
