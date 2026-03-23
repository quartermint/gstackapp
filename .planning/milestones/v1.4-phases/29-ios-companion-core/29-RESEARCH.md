# Phase 29: iOS Companion Core - Research

**Researched:** 2026-03-22
**Domain:** iOS native app (SwiftUI, share extension, offline queue, Tailscale API client)
**Confidence:** HIGH

## Summary

Phase 29 builds a new iOS app in a sibling repository (`~/mission-control-ios`) that serves as a capture-first, glance-second companion to the existing Mission Control API. The app has three core capabilities: (1) a share sheet extension for zero-friction text/URL capture from any iOS app, (2) an offline queue that persists captures locally and syncs on foreground via idempotency keys, and (3) a native SwiftUI dashboard showing project health at a glance.

The developer environment is fully equipped: Xcode 26.0.1, Swift 6.2, XcodeGen 2.44.1, and iOS 26.0 simulators are all available. Three existing quartermint iOS projects (NexusClaw/Juliette, Principal's Ear, SFR) establish proven patterns for MVVM + @Observable, `NWPathMonitor` network detection, `URLSession`-based API clients over Tailscale, and XcodeGen project configuration. The MC API endpoints are stable, JSON-based, and already support idempotency keys on captures.

The primary technical risks are (1) SwiftData + App Group sharing with the share extension requires manual `ModelContainer` wiring (not the usual `.modelContainer` modifier), (2) the share extension's 120MB memory ceiling forbids networking or heavy frameworks in-extension, and (3) there is no `tailscale://` deep link URL scheme -- the "Connect to Tailscale" prompt must use `App-Prefs:General&path=VPN` or a simple informational message.

**Primary recommendation:** Use SwiftData with `ModelConfiguration(groupContainer:)` for the offline queue shared between main app and share extension. Follow the NexusClaw/Juliette patterns for API client, connection monitoring, and XcodeGen configuration. Keep the share extension ultra-minimal (write to shared container, dismiss) with all networking in the main app.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Minimal confirm UI -- brief slide-up showing captured content preview + optional project picker dropdown + "Save" button
- **D-02:** Dismisses in 1 tap. Like sharing to Notes or Reminders -- zero friction.
- **D-03:** Share sheet extension stays within 120MB memory ceiling (no networking, no heavy frameworks in extension)
- **D-04:** Content saved to shared App Group container for main app to sync later
- **D-05:** Simple scrollable list grouped by Active/Idle/Stale -- same grouping as web dashboard
- **D-06:** Each row: project name, health dot, last commit time, capture count
- **D-07:** Pull-to-refresh, "Last synced: X ago" when offline
- **D-08:** Like Apple Health summary cards -- glanceable, not interactive deep-dive
- **D-09:** Subtle banner at top: "3 captures pending sync" when offline, animates away on successful sync
- **D-10:** Badge on app icon shows pending capture count
- **D-11:** Sync happens automatically when app comes to foreground (foreground-only, no background sync)
- **D-12:** Retry logic with idempotency keys (Phase 23 foundation) prevents duplicate captures
- **D-13:** Passive indicator -- status bar shows "Offline -- connect to Tailscale" with tap-to-open deep link
- **D-14:** Captures still work when offline (queued locally). No blocking modals.
- **D-15:** User-assigned project on captures preserved -- server AI categorization does not override manual assignment (IOS-13)
- **D-16:** Sibling repo ~/mission-control-ios (not monorepo) -- Swift/Xcode expects own project root
- **D-17:** Native SwiftUI (not WKWebView) -- native scroll physics, haptics, gestures worth the effort
- **D-18:** Tailscale trust model (same as browser) -- phone theft -> revoke Tailscale device
- **D-19:** Foreground-only sync (no BGAppRefreshTask) -- sufficient for v1.4

### Claude's Discretion
- SwiftUI layout and styling details
- Core Data schema for offline queue (research recommends SwiftData instead -- see below)
- App Group container naming
- Network reachability detection approach
- Share sheet extension implementation specifics

### Deferred Ideas (OUT OF SCOPE)
- iOS background sync (BGAppRefreshTask) -- deferred, foreground sync sufficient for v1.4
- Push notifications for critical health alerts -- deferred, pull-based by design
- Screenshot OCR capture -- deferred, Vision framework complexity
- Camera/whiteboard capture -- out of scope, MC captures thoughts not images
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IOS-01 | User can capture text and links from any iOS app via share sheet extension | Share extension architecture with NSExtensionActivationRule for text+URL, SwiftUI share view controller pattern |
| IOS-02 | Share sheet writes to shared App Group container without networking (<120MB memory) | SwiftData ModelConfiguration with groupContainer, no URLSession in extension process |
| IOS-07 | Captures queued offline sync automatically on app foreground with retry logic | scenePhase .active detection, SyncEngine with exponential backoff, Idempotency-Key header |
| IOS-08 | User sees sync status in-app ("3 captures pending sync") | @Observable SyncEngine exposes pendingCount, SwiftUI banner view |
| IOS-09 | User can view project list with health dots, recent captures, and risk summary in native SwiftUI | GET /api/projects + GET /api/health-checks consumed by ProjectListViewModel |
| IOS-10 | Dashboard supports pull-to-refresh and shows "Last synced: X ago" when offline | .refreshable modifier, UserDefaults lastSyncTimestamp, RelativeDateTimeFormatter |
| IOS-11 | Captures include context metadata (city-level location, time of day, source app, connectivity) | CLLocationManager with kCLLocationAccuracyReduced, NSExtensionContext metadata extraction |
| IOS-12 | App gracefully handles Tailscale disconnection with "Connect to Tailscale" prompt and deep link | NWPathMonitor + health endpoint probe, App-Prefs:General&path=VPN fallback (no tailscale:// scheme) |
| IOS-13 | User-assigned project on captures is preserved (not overridden by server AI re-categorization) | POST /api/captures already accepts optional projectId; server enrichment must respect non-null projectId |
</phase_requirements>

## Standard Stack

### Core
| Library/Framework | Version | Purpose | Why Standard |
|-------------------|---------|---------|--------------|
| Swift | 6.2 | Language | Installed via Xcode 26.0.1, matches NexusClaw/PE |
| SwiftUI | iOS 26+ | UI framework | All quartermint iOS apps use SwiftUI, locked decision D-17 |
| SwiftData | iOS 26+ | Offline queue persistence | Modern replacement for Core Data, native App Group support via ModelConfiguration |
| Network framework (NWPathMonitor) | iOS 26+ | Connectivity detection | Apple's built-in, proven in NexusClaw ConnectionMonitor |
| CoreLocation | iOS 26+ | City-level location metadata | kCLLocationAccuracyReduced for IOS-11 |
| XcodeGen | 2.44.1 | Project generation from YAML | All quartermint projects use XcodeGen, avoids .xcodeproj conflicts |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| URLSession | Built-in | HTTP client for MC API | All API calls from main app (never from share extension) |
| UNUserNotificationCenter | Built-in | App icon badge count | IOS-10: badge shows pending capture count |
| @Observable macro | Swift 5.9+ | ViewModel observation | Standard pattern in NexusClaw/Juliette |
| RelativeDateTimeFormatter | Built-in | "Last synced: 5 min ago" display | IOS-10 offline indicator |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SwiftData | Core Data | Core Data works but requires .xcdatamodeld files (awkward with SPM), more boilerplate. SwiftData is Apple's recommended path forward and has better App Group support via ModelConfiguration. |
| SwiftData | JSON files in App Group | Simpler but no query support, no automatic conflict resolution, manual file locking needed for concurrent access from extension + app |
| NWPathMonitor | Reachability (3rd party) | NWPathMonitor is Apple's replacement, no dependencies needed. Already proven in NexusClaw. |
| URLSession | Alamofire | URLSession is sufficient for simple REST calls. Zero dependencies is better for an app this simple. |

**No external dependencies.** The entire app uses only Apple frameworks. This is intentional -- the app is small, focused, and should have zero dependency management overhead.

## Architecture Patterns

### Recommended Project Structure
```
mission-control-ios/
├── project.yml                    # XcodeGen configuration (2 targets)
├── CLAUDE.md                      # Project-specific instructions
├── MissionControl/                # Main app target
│   ├── MissionControlApp.swift    # App entry point, SwiftData container
│   ├── Info.plist
│   ├── MissionControl.entitlements
│   ├── Models/
│   │   ├── QueuedCapture.swift    # SwiftData @Model for offline queue
│   │   └── CachedProject.swift    # SwiftData @Model for dashboard cache
│   ├── API/
│   │   ├── MCAPIClient.swift      # URLSession client for MC API
│   │   └── APIModels.swift        # Codable structs matching Zod schemas
│   ├── Services/
│   │   ├── SyncEngine.swift       # Foreground sync with retry + idempotency
│   │   ├── ConnectionMonitor.swift # NWPathMonitor + MC health probe
│   │   └── LocationService.swift  # City-level location for capture metadata
│   ├── ViewModels/
│   │   ├── DashboardViewModel.swift
│   │   └── SyncStatusViewModel.swift
│   └── Views/
│       ├── DashboardView.swift    # Project list grouped by status
│       ├── ProjectRowView.swift   # Single project row (name, health dot, etc.)
│       ├── SyncBannerView.swift   # "3 captures pending sync" banner
│       └── OfflineIndicator.swift # Tailscale connection status
├── ShareExtension/                # Share sheet extension target
│   ├── ShareViewController.swift  # UIViewController hosting SwiftUI
│   ├── ShareView.swift           # Minimal capture confirm UI
│   ├── Info.plist                # NSExtensionActivationRule config
│   └── ShareExtension.entitlements
└── Shared/                        # Code shared between both targets
    ├── SharedModelContainer.swift  # SwiftData container config (App Group)
    ├── QueuedCapture.swift        # Model (in both targets' compile sources)
    └── Constants.swift            # App Group ID, API base URL
```

### Pattern 1: Shared SwiftData Container via App Group
**What:** Both the main app and share extension access the same SwiftData store through a shared App Group container.
**When to use:** Whenever the share extension writes data that the main app needs to read.
**Example:**
```swift
// Shared/SharedModelContainer.swift
import SwiftData

enum AppConstants {
    static let appGroupID = "group.quartermint.mission-control"
    static let apiBaseURL = URL(string: "http://100.x.x.x:3000")!
}

func createSharedModelContainer() throws -> ModelContainer {
    let schema = Schema([QueuedCapture.self])
    let config = ModelConfiguration(
        schema: schema,
        isStoredInMemoryOnly: false,
        groupContainer: .identifier(AppConstants.appGroupID)
    )
    return try ModelContainer(for: schema, configurations: [config])
}
```
Source: [Apple Developer Forums on SwiftData App Groups](https://developer.apple.com/forums/thread/732986), [Sam Merrell guide](https://www.merrell.dev/ios-share-extension-with-swiftui-and-swiftdata/)

### Pattern 2: Ultra-Minimal Share Extension (No Networking)
**What:** The share extension only writes to the shared SwiftData container and dismisses. Zero networking, zero heavy frameworks.
**When to use:** Always in the share extension process (D-03: 120MB memory ceiling).
**Example:**
```swift
// ShareExtension/ShareViewController.swift
import UIKit
import SwiftUI
import SwiftData

@objc(ShareViewController)
class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        guard let container = try? createSharedModelContainer() else {
            extensionContext?.cancelRequest(withError: NSError(domain: "MC", code: 1))
            return
        }

        let hostingController = UIHostingController(
            rootView: ShareView(extensionContext: extensionContext)
                .modelContainer(container)
        )
        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.frame = view.bounds
        hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        hostingController.didMove(toParent: self)
    }
}
```

### Pattern 3: Foreground Sync via scenePhase
**What:** Sync engine triggers when app enters foreground. Uses `@Environment(\.scenePhase)` to detect transitions.
**When to use:** App entry point, to flush offline queue automatically (D-11).
**Example:**
```swift
// MissionControlApp.swift
@main
struct MissionControlApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var syncEngine = SyncEngine()

    var body: some Scene {
        WindowGroup {
            DashboardView()
                .environment(syncEngine)
        }
        .modelContainer(try! createSharedModelContainer())
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                Task { await syncEngine.syncPendingCaptures() }
            }
        }
    }
}
```
Source: [Apple ScenePhase documentation](https://developer.apple.com/documentation/swiftui/scenephase)

### Pattern 4: Connection Monitor (adapted from NexusClaw)
**What:** NWPathMonitor detects network availability; separate health probe confirms MC API reachability.
**When to use:** Before sync attempts and for UI status indicator.
**Example:**
```swift
// Services/ConnectionMonitor.swift
@MainActor
@Observable
final class ConnectionMonitor {
    private(set) var isNetworkAvailable = true
    private(set) var isMCReachable = false
    private var monitor: NWPathMonitor?

    func start() {
        let monitor = NWPathMonitor()
        self.monitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                self?.isNetworkAvailable = path.status == .satisfied
                if path.status == .satisfied {
                    await self?.probeHealth()
                } else {
                    self?.isMCReachable = false
                }
            }
        }
        monitor.start(queue: DispatchQueue(label: "mc.network"))
    }

    func probeHealth() async {
        // GET http://100.x.x.x:3000/api/health with 5s timeout
        // Sets isMCReachable based on response
    }
}
```
Source: Direct adaptation of NexusClaw `ConnectionMonitor.swift`

### Pattern 5: Idempotent Sync with Retry
**What:** Each queued capture gets a UUID idempotency key at creation time. Sync sends this as `Idempotency-Key` header. Server returns 201 with existing capture on duplicate.
**When to use:** Every sync attempt (D-12).
**Example:**
```swift
// Services/SyncEngine.swift
@MainActor
@Observable
final class SyncEngine {
    private(set) var pendingCount = 0
    private(set) var isSyncing = false

    func syncPendingCaptures() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        let pending = fetchPendingCaptures() // SwiftData query
        pendingCount = pending.count

        for capture in pending {
            do {
                try await apiClient.createCapture(
                    rawContent: capture.rawContent,
                    type: capture.type,
                    projectId: capture.projectId,
                    idempotencyKey: capture.idempotencyKey // UUID string
                )
                capture.syncStatus = .synced
                pendingCount -= 1
            } catch {
                capture.retryCount += 1
                // Exponential backoff: skip items with too many recent failures
            }
        }
    }
}
```

### Anti-Patterns to Avoid
- **Networking in the share extension:** The extension process has a 120MB memory ceiling. URLSession, JSON parsing of API responses, and error handling UI all consume memory. Write to disk only, let the main app sync.
- **Blocking modals on network failure:** D-14 explicitly forbids this. Captures must always work offline. Show status indicators, never block the user.
- **WKWebView for dashboard:** D-17 locks native SwiftUI. Do not embed the web dashboard.
- **Background sync (BGAppRefreshTask):** D-19 explicitly defers this. Foreground sync only.
- **Auto-retry in a tight loop:** Failed syncs should use exponential backoff with a cap (e.g., 3 retries with 2s/4s/8s delays). Do not retry immediately or infinitely.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Offline persistence | Custom JSON file read/write with locking | SwiftData with ModelConfiguration(groupContainer:) | Handles concurrent access from extension + app, provides query capabilities, automatic save |
| Network reachability | Custom socket probing | NWPathMonitor (Network framework) | Apple's official API, handles VPN transitions, already proven in NexusClaw |
| Relative time formatting | Custom "5 min ago" string builder | RelativeDateTimeFormatter | Handles localization, auto-updates, edge cases (just now, yesterday, etc.) |
| App icon badge | Custom notification-based badge | UNUserNotificationCenter.setBadgeCount() | iOS 16+ API, handles authorization automatically |
| JSON date parsing | Manual ISO 8601 parsing | JSONDecoder.dateDecodingStrategy = .iso8601 | Handles timezone variants, fractional seconds |
| UUID generation | Custom ID scheme | UUID().uuidString | System-provided, cryptographically random, guaranteed unique for idempotency keys |
| Project file management | Manual .xcodeproj editing | XcodeGen from project.yml | Conflict-free, reproducible, pattern established across all quartermint projects |

**Key insight:** This app has zero external dependencies. Every capability comes from Apple frameworks. This is the correct architecture for a small companion app -- no CocoaPods, no SPM packages, no dependency version management.

## Common Pitfalls

### Pitfall 1: SwiftData ModelContainer Not Using App Group
**What goes wrong:** Main app creates its SwiftData container in the default location. Share extension creates its own container in the extension sandbox. They cannot see each other's data. Captures saved in the share extension are invisible to the main app.
**Why it happens:** SwiftData defaults to the app's own container directory. The share extension runs in a separate process with a separate sandbox. Without explicit App Group configuration, there is no shared file system.
**How to avoid:** Always use `ModelConfiguration(groupContainer: .identifier("group.quartermint.mission-control"))` in both targets. Create a single `createSharedModelContainer()` function in shared code. Never use the default ModelConfiguration.
**Warning signs:** Captures appear to save in share sheet but never show in the main app. SwiftData database file exists in two different locations.

### Pitfall 2: Share Extension Exceeds 120MB Memory
**What goes wrong:** iOS force-kills the share extension before the user can complete their capture. The extension crashes or shows a blank white screen.
**Why it happens:** Importing UIKit, SwiftUI, and SwiftData already consumes significant memory. Adding URLSession, JSON parsing, or image processing pushes past the 120MB ceiling. Debug builds use more memory than release builds.
**How to avoid:** Zero networking in the extension. Minimal SwiftUI views (text field, picker, save button). No image processing. Test on physical devices in release mode -- simulators don't enforce memory limits.
**Warning signs:** Extension works in simulator but crashes on device. Xcode memory debugger shows >80MB at rest.

### Pitfall 3: Tailscale Deep Link Does Not Exist
**What goes wrong:** The app tries to open `tailscale://` when the user taps "Connect to Tailscale" and nothing happens (or an error appears), because Tailscale has no registered URL scheme on iOS.
**Why it happens:** The developer assumes Tailscale has a URL scheme. It does not -- this is an open feature request (GitHub issue #14679) that Tailscale has declined for security reasons.
**How to avoid:** Use `App-Prefs:General&path=VPN` to open the VPN section in iOS Settings. This lets the user toggle Tailscale on from the system VPN list. Alternatively, show a text instruction: "Open Tailscale app and connect." Note: `App-Prefs:` URLs may be rejected by App Store review -- have a fallback that just shows instructions.
**Warning signs:** `UIApplication.shared.canOpenURL(tailscaleURL)` returns false.

### Pitfall 4: Type Drift Between Zod Schemas and Swift Codable
**What goes wrong:** The MC API evolves (new fields, renamed properties) but the Swift Codable structs don't get updated. The iOS app silently drops new fields or crashes on changed types.
**Why it happens:** No shared build step between the TypeScript monorepo and the Swift sibling repo. No automated contract verification.
**How to avoid:** Use explicit `CodingKeys` enums in every Swift Codable struct (never rely on automatic synthesis). Document the API contract version in the Swift file headers. Make all new API fields optional in Swift (decoder won't crash on unknown keys if struct uses `init(from:)` with `decodeIfPresent`).
**Warning signs:** JSONDecoder throws `DecodingError.keyNotFound` or `DecodingError.typeMismatch` after an API update.

### Pitfall 5: scenePhase .active Fires Multiple Times
**What goes wrong:** The sync engine runs multiple concurrent syncs because `.active` fires on multiple scene phase transitions (e.g., notification center dismiss, control center dismiss).
**Why it happens:** iOS sends `.active` not just on true foreground transitions but also when returning from system overlays.
**How to avoid:** Guard with an `isSyncing` boolean flag in the SyncEngine. If already syncing, return immediately. Debounce with a minimum interval (e.g., don't re-sync if last sync was <30 seconds ago).
**Warning signs:** Duplicate API calls in network logs. Concurrent SwiftData writes causing conflicts.

### Pitfall 6: CLLocationManager Authorization in Share Extension
**What goes wrong:** Requesting location permission from the share extension fails or shows no prompt because extensions have limited authorization capabilities.
**Why it happens:** Share extensions inherit the host app's permissions, not the containing app's permissions. Location authorization must be requested from the main app first.
**How to avoid:** Request location permission during the main app's first launch. In the share extension, only read the last known location from `CLLocationManager` (do not request authorization). If no location is available, capture without it -- location metadata is supplementary, not required.
**Warning signs:** Location metadata is always nil for captures created via share sheet.

## Code Examples

### API Client Matching MC Zod Schemas
```swift
// API/APIModels.swift
// Matches packages/shared/src/schemas/capture.ts

struct CreateCaptureRequest: Encodable {
    let rawContent: String
    let type: String  // "text" | "link"
    let projectId: String?
    let clientId: String?

    enum CodingKeys: String, CodingKey {
        case rawContent
        case type
        case projectId
        case clientId
    }
}

struct CaptureResponse: Decodable {
    let capture: Capture
}

struct Capture: Decodable {
    let id: String
    let rawContent: String
    let type: String
    let status: String
    let projectId: String?
    let aiConfidence: Double?
    let aiProjectSlug: String?
    let linkUrl: String?
    let linkTitle: String?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, rawContent, type, status, projectId
        case aiConfidence, aiProjectSlug
        case linkUrl, linkTitle
        case createdAt, updatedAt
    }
}

// Matches packages/shared/src/schemas/project.ts (with scan data enrichment)
struct ProjectListResponse: Decodable {
    let projects: [ProjectItem]
}

struct ProjectItem: Decodable, Identifiable {
    let slug: String
    let name: String
    let tagline: String?
    let host: String          // "local" | "mac-mini" | "github"
    let lastCommitTime: String?
    let lastCommitDate: String?
    let lastScannedAt: String?
    let healthScore: Double?
    let riskLevel: String     // "healthy" | "warning" | "critical" | "unmonitored"

    var id: String { slug }

    enum CodingKeys: String, CodingKey {
        case slug, name, tagline, host
        case lastCommitTime, lastCommitDate, lastScannedAt
        case healthScore, riskLevel
    }
}

// Matches packages/shared/src/schemas/health.ts
struct HealthCheckResponse: Decodable {
    let findings: [HealthFinding]
    let total: Int
}

struct HealthFinding: Decodable {
    let id: Int
    let projectSlug: String
    let checkType: String
    let severity: String      // "info" | "warning" | "critical"
    let detail: String
    let isNew: Bool

    enum CodingKeys: String, CodingKey {
        case id, projectSlug, checkType, severity, detail, isNew
    }
}
```

### SwiftData Model for Offline Queue
```swift
// Models/QueuedCapture.swift
import Foundation
import SwiftData

@Model
final class QueuedCapture {
    var idempotencyKey: String     // UUID generated at creation time
    var rawContent: String
    var type: String               // "text" or "link"
    var projectId: String?         // User-assigned project (IOS-13)
    var linkUrl: String?           // URL if shared from browser
    var sourceApp: String?         // Bundle ID of sharing app (IOS-11)
    var city: String?              // City-level location (IOS-11)
    var capturedAt: Date           // Time of capture (IOS-11)
    var syncStatus: String         // "pending" | "synced" | "failed"
    var retryCount: Int
    var lastRetryAt: Date?

    init(
        rawContent: String,
        type: String = "text",
        projectId: String? = nil,
        linkUrl: String? = nil,
        sourceApp: String? = nil,
        city: String? = nil
    ) {
        self.idempotencyKey = UUID().uuidString
        self.rawContent = rawContent
        self.type = type
        self.projectId = projectId
        self.linkUrl = linkUrl
        self.sourceApp = sourceApp
        self.city = city
        self.capturedAt = Date()
        self.syncStatus = "pending"
        self.retryCount = 0
        self.lastRetryAt = nil
    }
}
```

### XcodeGen project.yml Configuration
```yaml
# project.yml
name: MissionControl
options:
  bundleIdPrefix: quartermint
  deploymentTarget:
    iOS: "17.0"          # Support iPhone 15+ users, SwiftData requires iOS 17
  xcodeVersion: "16.0"
  generateEmptyDirectories: true
  minimumXcodeGenVersion: "2.38.0"

settings:
  base:
    SWIFT_VERSION: "6.0"
    DEVELOPMENT_TEAM: SKGLKG576D

targets:
  MissionControl:
    type: application
    platform: iOS
    sources:
      - MissionControl
      - Shared
    entitlements:
      path: MissionControl/MissionControl.entitlements
      properties:
        com.apple.security.application-groups:
          - group.quartermint.mission-control
    info:
      path: MissionControl/Info.plist
      properties:
        CFBundleDisplayName: Mission Control
        CFBundleShortVersionString: "1.0.0"
        CFBundleVersion: "1"
        UILaunchScreen: {}
        UISupportedInterfaceOrientations:
          - UIInterfaceOrientationPortrait
        NSAppTransportSecurity:
          NSAllowsLocalNetworking: true
          NSExceptionDomains:
            100.x.x.x:
              NSExceptionAllowsInsecureHTTPLoads: true
              NSIncludesSubdomains: false
        NSLocationWhenInUseUsageDescription: "Mission Control uses your approximate location to add context to captures"
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: quartermint.mission-control
        INFOPLIST_FILE: MissionControl/Info.plist
        TARGETED_DEVICE_FAMILY: "1"  # iPhone only
    dependencies:
      - target: ShareExtension
        embed: true

  ShareExtension:
    type: app-extension
    platform: iOS
    sources:
      - ShareExtension
      - Shared
    entitlements:
      path: ShareExtension/ShareExtension.entitlements
      properties:
        com.apple.security.application-groups:
          - group.quartermint.mission-control
    info:
      path: ShareExtension/Info.plist
      properties:
        CFBundleDisplayName: MC Capture
        CFBundleShortVersionString: "1.0.0"
        CFBundleVersion: "1"
        NSExtension:
          NSExtensionPointIdentifier: com.apple.share-services
          NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).ShareViewController"
          NSExtensionAttributes:
            NSExtensionActivationRule:
              NSExtensionActivationSupportsText: true
              NSExtensionActivationSupportsWebURLWithMaxCount: 1
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: quartermint.mission-control.share
        INFOPLIST_FILE: ShareExtension/Info.plist
```

### NSExtensionActivationRule Configuration
```swift
// ShareExtension/Info.plist NSExtensionActivationRule dictionary:
// NSExtensionActivationSupportsText: true          -- Accept text selections
// NSExtensionActivationSupportsWebURLWithMaxCount: 1  -- Accept URLs (Safari, etc.)
// NSExtensionActivationSupportsImageWithMaxCount: 0   -- NO images
// NSExtensionActivationSupportsMovieWithMaxCount: 0   -- NO videos
// NSExtensionActivationSupportsFileWithMaxCount: 0    -- NO files
```

### API Endpoint Contract Summary
```
Base URL: http://100.x.x.x:3000/api

POST /captures
  Headers: Content-Type: application/json, Idempotency-Key: <uuid>
  Body: { rawContent: string, type?: "text"|"link", projectId?: string, clientId?: string }
  Response 201: { capture: { id, rawContent, type, status, projectId, createdAt, ... } }
  Idempotency: If key exists, returns original capture with 201 (no duplicate)

GET /projects
  Query: ?host=local|mac-mini|github
  Response 200: { projects: [{ slug, name, host, riskLevel, healthScore, lastCommitTime, ... }] }

GET /health-checks
  Query: ?severity=info|warning|critical
  Response 200: { findings: [{ projectSlug, checkType, severity, detail, isNew }], total: N }

GET /health-checks/:slug
  Response 200: { findings: [...], riskLevel: "healthy"|"warning"|"critical"|"unmonitored" }

GET /health
  Response 200: { status: "ok", timestamp: number, version: string }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Core Data + NSPersistentContainer | SwiftData + ModelContainer | iOS 17 (2023) | Dramatically less boilerplate, native Swift macros, App Group support via ModelConfiguration |
| Reachability (3rd party) | NWPathMonitor | iOS 12 (2018) | No external dependency needed |
| UIApplication.shared.applicationIconBadgeNumber | UNUserNotificationCenter.setBadgeCount() | iOS 16 (2022) | More reliable, dedicated API |
| SLComposeServiceViewController | UIViewController + UIHostingController | iOS 13+ | Full SwiftUI support in share extensions |
| @StateObject / @ObservedObject | @Observable macro | iOS 17 (2023) | Simpler observation, no property wrapper needed in views |
| UIKit lifecycle (applicationDidBecomeActive) | scenePhase environment value | SwiftUI 2.0 | Declarative lifecycle, multi-window support |

**Deprecated/outdated:**
- `SLComposeServiceViewController`: Apple's template share extension base class. Replace with `UIViewController` hosting SwiftUI via `UIHostingController`.
- `Reachability`: Third-party library. Use `NWPathMonitor` from the Network framework.
- `TRUEPREDICATE` in NSExtensionActivationRule: Apple rejects apps using this. Use explicit activation rule dictionary.

## Open Questions

1. **App-Prefs URL and App Store Review**
   - What we know: `App-Prefs:General&path=VPN` opens iOS VPN settings. It works in iOS 26.
   - What's unclear: Apple sometimes rejects apps using `App-Prefs:` URLs. The rejection is inconsistent.
   - Recommendation: Implement with `App-Prefs:General&path=VPN` as the primary action. Add a fallback that shows a text instruction ("Open the Tailscale app or go to Settings > VPN") if `canOpenURL` returns false. For App Store submission, test with TestFlight first.

2. **IOS-13 Server-Side Enforcement**
   - What we know: The `POST /api/captures` endpoint accepts `projectId`. The enrichment pipeline may override it with AI-categorized project.
   - What's unclear: Whether the current enrichment code respects a non-null `projectId` or always overwrites it.
   - Recommendation: Verify in `packages/api/src/services/enrichment.ts` that enrichment skips when `projectId` is already set. If not, add a guard. This is an API-side change, not iOS-side.

3. **Share Extension Source App Detection**
   - What we know: IOS-11 requires source app metadata. NSExtensionContext may provide the host app's bundle ID.
   - What's unclear: Whether `inputItems` reliably includes the source app identifier across all sharing apps.
   - Recommendation: Best-effort extraction from `NSExtensionContext`. If unavailable, store nil -- the metadata is supplementary, not required.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode | Build & Run | Yes | 26.0.1 | -- |
| Swift | All code | Yes | 6.2 | -- |
| XcodeGen | Project generation | Yes | 2.44.1 | -- |
| iOS 26 Simulator | Testing | Yes | iPhone 17 Pro, iPad Pro | -- |
| iOS 18.6 Simulator | Back-compat testing | Yes | iPhone 16 Pro | -- |
| Apple Developer Account | TestFlight, device testing | Unknown | -- | Simulator-only testing; flag for user verification |
| Physical iPhone | Share extension memory testing | Unknown | -- | Simulator (does not enforce 120MB limit) |
| Tailscale on iPhone | End-to-end API testing | Unknown | -- | Simulator with mock API |

**Missing dependencies with no fallback:**
- Apple Developer Account status needs user verification for TestFlight distribution (noted in STATE.md blockers)

**Missing dependencies with fallback:**
- Physical device testing: can develop and test most features in simulator, but share extension memory limits require device testing before shipping

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | XCTest (built into Xcode 26) |
| Config file | None -- Wave 0 creates test targets |
| Quick run command | `xcodebuild test -project MissionControl.xcodeproj -scheme MissionControl -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` |
| Full suite command | Same as quick run (single test target in v1) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IOS-01 | Share extension extracts text/URL from NSExtensionContext | unit | `xcodebuild test -only-testing:MissionControlTests/ShareExtensionTests` | Wave 0 |
| IOS-02 | QueuedCapture persists to App Group SwiftData container | unit | `xcodebuild test -only-testing:MissionControlTests/QueuedCaptureTests` | Wave 0 |
| IOS-07 | SyncEngine syncs pending captures with retry + idempotency | unit | `xcodebuild test -only-testing:MissionControlTests/SyncEngineTests` | Wave 0 |
| IOS-08 | SyncEngine exposes accurate pendingCount | unit | `xcodebuild test -only-testing:MissionControlTests/SyncEngineTests/testPendingCount` | Wave 0 |
| IOS-09 | DashboardViewModel groups projects by Active/Idle/Stale | unit | `xcodebuild test -only-testing:MissionControlTests/DashboardViewModelTests` | Wave 0 |
| IOS-10 | Pull-to-refresh triggers data reload | manual-only | Manual: pull down on project list, verify data updates | -- |
| IOS-11 | QueuedCapture stores context metadata fields | unit | `xcodebuild test -only-testing:MissionControlTests/QueuedCaptureTests/testMetadata` | Wave 0 |
| IOS-12 | ConnectionMonitor reports offline when MC unreachable | unit | `xcodebuild test -only-testing:MissionControlTests/ConnectionMonitorTests` | Wave 0 |
| IOS-13 | Captures with projectId preserve assignment through sync | unit | `xcodebuild test -only-testing:MissionControlTests/SyncEngineTests/testProjectIdPreserved` | Wave 0 |

### Sampling Rate
- **Per task commit:** Build succeeds (`xcodebuild build`)
- **Per wave merge:** Full test suite green
- **Phase gate:** Full suite green + manual share extension test on simulator

### Wave 0 Gaps
- [ ] `MissionControlTests/` directory -- create test target in XcodeGen project.yml
- [ ] `MissionControlTests/QueuedCaptureTests.swift` -- covers IOS-02, IOS-11
- [ ] `MissionControlTests/SyncEngineTests.swift` -- covers IOS-07, IOS-08, IOS-13
- [ ] `MissionControlTests/DashboardViewModelTests.swift` -- covers IOS-09
- [ ] `MissionControlTests/ConnectionMonitorTests.swift` -- covers IOS-12
- [ ] `MissionControlTests/ShareExtensionTests.swift` -- covers IOS-01
- [ ] `MissionControlTests/Mocks/MockMCAPIClient.swift` -- protocol-based mock for network isolation

## Project Constraints (from CLAUDE.md)

### Mission Control CLAUDE.md Directives
- **Architecture:** API-first (iOS is just another client of the Hono API)
- **No auth:** Single-user, trust-based via Tailscale network boundary
- **Naming:** files kebab-case, types PascalCase, functions camelCase, constants SCREAMING_SNAKE_CASE (applies to TypeScript side; Swift follows standard Swift conventions)
- **Module system:** ESM throughout (TypeScript side only)
- **Conventional commits:** feat(scope):, fix(scope):, chore(scope): -- applies to both repos

### Global CLAUDE.md Directives (Ryan's preferences)
- **iOS pattern:** MVVM + @Observable (established in NexusClaw, PE, SFR)
- **Project generation:** XcodeGen for all iOS projects
- **Dev Team:** SKGLKG576D (quartermint)
- **Bundle ID prefix:** quartermint
- **No deprecated models:** Qwen3-8B, Gemini 2.0 are banned

## Sources

### Primary (HIGH confidence)
- NexusClaw/Juliette source code (`~/nexusclaw/`) -- ConnectionMonitor, ZeroClawAPI, project.yml patterns
- Principal's Ear source code (`~/principals-ear/`) -- SPM structure, Core Data patterns, Swift 6.2
- SFR source code (`~/sovereign-flight-recorder/`) -- MVVM + Combine patterns
- MC API source code (`packages/api/src/routes/captures.ts`) -- exact endpoint contract, idempotency implementation
- MC shared schemas (`packages/shared/src/schemas/`) -- exact Zod schemas for Codable mapping
- [Apple ScenePhase documentation](https://developer.apple.com/documentation/swiftui/scenephase) -- foreground detection
- [Apple NWPathMonitor documentation](https://developer.apple.com/documentation/network/nwpathmonitor) -- network monitoring
- [Apple kCLLocationAccuracyReduced](https://developer.apple.com/documentation/corelocation/kcllocationaccuracyreduced) -- city-level location

### Secondary (MEDIUM confidence)
- [Sam Merrell: iOS Share Extension with SwiftUI and SwiftData](https://www.merrell.dev/ios-share-extension-with-swiftui-and-swiftdata/) -- SwiftData + App Group in share extensions
- [Apple Developer Forums: SwiftData App Group setup](https://developer.apple.com/forums/thread/732986) -- ModelConfiguration groupContainer
- [Igor Kulman: Memory limits in app extensions](https://blog.kulman.sk/dealing-with-memory-limits-in-app-extensions/) -- 120MB share extension limit confirmed
- [Tailscale GitHub Issue #14679](https://github.com/tailscale/tailscale/issues/14679) -- no tailscale:// URL scheme available
- [iOS Settings URL schemes](https://wesleydegroot.nl/blog/iOS-settings-URLs) -- App-Prefs:General&path=VPN

### Tertiary (LOW confidence)
- App-Prefs URL stability across iOS versions and App Store review acceptance -- inconsistent reports, needs TestFlight validation
- NSExtensionContext source app bundle ID availability -- varies by host app implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all Apple frameworks, proven in three sibling projects, versions verified on machine
- Architecture: HIGH -- direct adaptation of established NexusClaw patterns + Apple documentation
- Pitfalls: HIGH -- multiple sources confirm each pitfall, two are documented in existing v1.4 PITFALLS.md research
- API contract: HIGH -- read directly from source code, Zod schemas are the source of truth

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (30 days -- stable Apple frameworks, stable MC API)
