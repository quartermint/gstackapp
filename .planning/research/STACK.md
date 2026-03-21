# Technology Stack

**Project:** Mission Control v1.4 — Cross-Project Intelligence + iOS Companion + Knowledge Unification
**Researched:** 2026-03-21

## Existing Stack (DO NOT RE-ADD)

Already installed and validated in v1.0-v1.3:

| Technology | Version | Purpose |
|------------|---------|---------|
| Hono | ^4.6.0 | API framework |
| better-sqlite3 | ^11.7.0 | SQLite driver |
| Drizzle ORM | ^0.38.0 | Schema + migrations + queries |
| React 19 | ^19.0.0 | Dashboard UI |
| Vite 6 | ^6.0.0 | Build + dev server |
| Tailwind v4 | ^4.0.0 | Styling |
| ai (Vercel AI SDK) | ^6.0.116 | AI model abstraction |
| @ai-sdk/google | ^3.0.43 | Gemini provider |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server |
| Commander.js | ^13.1.0 | CLI framework |
| Zod | ^3.24.0 | Schema validation |
| nanoid | ^5.0.0 | ID generation |
| p-limit | ^7.3.0 | Concurrency control |
| open-graph-scraper | ^6.11.0 | Link enrichment |
| cmdk | ^1.1.1 | Command palette |
| Vitest | ^2.1.0 | Testing |
| tsup | ^8.0.0 | MCP/CLI bundling |
| Turbo | ^2.3.0 | Monorepo orchestration |
| hono/client (hc) | (bundled) | Typed RPC client |

## New Dependencies — Server/Dashboard Side

### 1. Force-Directed Graph Layout: d3-force

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| d3-force | ^3.0.0 | Physics simulation for project relationship graph | Force-directed layout requires velocity Verlet integration, n-body forces, collision detection, and link constraints. This is computational math, not something you can hand-roll with CSS/SVG. d3-force is the only module needed — React owns the DOM via `useRef` + `useEffect`, d3-force just computes positions. |
| @types/d3-force | ^3.0.10 | TypeScript declarations | DefinitelyTyped types for d3-force. Required because d3-force v3 ships ESM but not its own `.d.ts`. |

**Confidence:** HIGH — d3-force v3.0.0 is stable (unchanged since 2021), ESM-native (`"type": "module"`), and has only 3 dependencies: `d3-dispatch` (event handling), `d3-quadtree` (spatial indexing for n-body), `d3-timer` (animation frames). No DOM manipulation — pure computation.

**Bundle impact:** d3-force + its 3 dependencies total approximately 15-20KB minified/gzipped. This is the only charting-adjacent library in MC, justified because force simulation math cannot be replicated with custom SVG/CSS (unlike heatmaps, timelines, and bar charts which MC already does natively).

**React integration pattern (proven, not experimental):**

```typescript
// d3-force computes positions, React renders SVG
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import { useRef, useEffect, useState } from "react";

function ProjectGraph({ nodes, links }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<NodePosition[]>([]);

  useEffect(() => {
    const sim = forceSimulation(nodes)
      .force("link", forceLink(links).id(d => d.id).distance(80))
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(30))
      .on("tick", () => {
        setPositions(nodes.map(n => ({ id: n.id, x: n.x!, y: n.y! })));
      });

    return () => { sim.stop(); };
  }, [nodes, links]);

  // React renders SVG circles + lines from computed positions
  return <svg ref={svgRef}>...</svg>;
}
```

**Key principle:** d3-force does NOT touch the DOM. It calculates `x,y` coordinates per tick. React renders the `<circle>` and `<line>` elements. No conflict between D3 selections and React's virtual DOM.

### 2. No Other New npm Dependencies Needed

Everything else in v1.4's server/dashboard scope builds on existing infrastructure:

| Capability | Implementation | How |
|------------|---------------|-----|
| **Dependency chain definitions** | `mc.config.json` schema extension | New `dependsOn` field per project entry. Validated with existing Zod schemas. |
| **Cross-machine reconciliation** | Existing SSH + git patterns | Same `execFile("ssh", ...)` pattern from `project-scanner.ts`. Compare HEAD/remote across copies. |
| **Dependency drift alerts** | New health check type | Pure function added to `git-health.ts`. Same pattern as 7 existing checks. |
| **CLAUDE.md SSH aggregation** | `execFile("ssh", [..., "cat /path/CLAUDE.md"])` | Identical to `buildSshBatchScript()` pattern. Single SSH call, read file content, cache with `TTLCache`. |
| **Content-hash caching** | Node.js `crypto.createHash("sha256")` | Built-in `node:crypto`. Hash CLAUDE.md content to detect changes without re-reading. Store hash in SQLite. |
| **Convention scanning** | String pattern matching on CLAUDE.md text | `RegExp` or `string.includes()` against config-driven anti-pattern list. No NLP library needed. |
| **Knowledge MCP tools** | `@modelcontextprotocol/sdk` | 3 new tools added to existing MCP server. Same pattern as 6 existing tools. |
| **"Changes since last visit" UI** | `localStorage` + existing API data | Store last-visit timestamp client-side. Compare against `lastActivityAt` per project. Zero new deps. |
| **Relationship graph rendering** | React SVG + d3-force positions | React renders `<svg>` with `<circle>` nodes and `<line>` edges. d3-force provides `x,y` per tick. |
| **Graph interaction (drag, hover)** | React event handlers on SVG elements | `onMouseDown`, `onMouseMove`, `onMouseUp` for drag. `onMouseEnter` for tooltips. No d3-drag needed. |

## New Technology — iOS Companion (Sibling Repo)

The iOS companion app lives in `~/mission-control-ios/` as a separate repository. It is NOT part of the TypeScript monorepo.

### iOS Platform Stack

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Swift | 6.2 | Language | Latest stable. Strict concurrency checking. Matches Principal's Ear and other iOS projects in the ecosystem. |
| SwiftUI | iOS 18+ | UI framework | Declarative, native scroll physics, haptics, gestures. WKWebView was rejected — lacks native feel for a "last environment" tool. |
| Xcode | 16.x | IDE + build | Required for SwiftUI + share extension + widget targets. |
| XcodeGen | latest | Project generation | Keeps `project.yml` as source of truth, avoids Xcode project merge conflicts. Same pattern as NexusClaw and Principal's Ear. |

**Minimum deployment target: iOS 18.** Not iOS 26 — that would exclude too many devices as of March 2026. iOS 18 provides everything needed: SwiftData maturity, on-device SFSpeechRecognizer with `requiresOnDeviceRecognition`, interactive widgets via WidgetKit, and share sheet extensions.

**Confidence:** HIGH — iOS 18 is the pragmatic choice. SpeechAnalyzer (iOS 26) offers better transcription but requires an iOS 26 device. SFSpeechRecognizer on iOS 18 is sufficient for 60-second voice captures. Can add `if #available(iOS 26, *)` upgrade path later.

### iOS Data & Networking

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SwiftData | (built-in iOS 17+) | Offline capture queue | SwiftUI-native persistence. Shares model container between main app and share extension via App Groups. Simpler than Core Data for this use case — MC-iOS stores captures (text + audio ref + timestamp + sync status), not complex relational data. |
| URLSession | (built-in) | HTTP client to MC API | Standard Apple networking. No Alamofire needed — MC API returns simple JSON. Combine publishers for async/await integration. |
| App Groups | (entitlement) | Shared data between app + extensions | Required for share extension and widget to access the same SwiftData store. Configure via `group.com.quartermint.mission-control`. |

**Why SwiftData over Core Data:**

| Factor | SwiftData | Core Data |
|--------|-----------|-----------|
| SwiftUI integration | Native `.modelContainer` modifier | Manual `NSPersistentContainer` wiring |
| Concurrency | Swift concurrency-native | `NSManagedObjectContext` thread confinement |
| Share extension sharing | Works via shared `ModelContainer` with App Groups | Works but requires more boilerplate |
| Code complexity | `@Model` macro on plain Swift classes | `NSManagedObject` subclasses or `.xcdatamodeld` files |
| Maturity | Production-ready as of iOS 18 (2 years of hardening) | 20+ years mature |
| MC-iOS data model | Simple: captures, sync queue, cached projects | Overkill for 3-4 entity types |

SwiftData is the right call because MC-iOS has a trivially simple data model (offline captures waiting to sync). The SwiftUI integration is dramatically simpler. If this were Principal's Ear with complex entity relationships, Core Data would win. But for a capture queue, SwiftData's `@Model` macro eliminates all the ceremony.

**Confidence:** MEDIUM — SwiftData in share extensions has some documented quirks. The `ModelContainer` must be created manually (not via `.modelContainer` modifier) in extensions. This is a known pattern with working examples, but device testing is essential.

### iOS Speech & Audio

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| SFSpeechRecognizer | (Speech framework, iOS 10+) | Voice-to-text for captures | On-device transcription with `requiresOnDeviceRecognition = true`. 60-second limit per request is acceptable for MC captures (quick thoughts, not lectures). No network dependency. |
| AVAudioEngine | (AVFoundation, built-in) | Audio recording | Real-time audio buffer capture for speech recognition. Also records audio file for storage alongside transcript. |
| AVAudioRecorder | (AVFoundation, built-in) | Audio file persistence | Records to `.m4a` (AAC) for compact storage. Audio files stored locally, transcript synced to MC API. |

**Why SFSpeechRecognizer (not SpeechAnalyzer):**

SpeechAnalyzer is superior (no 60s limit, better accuracy, no Settings prerequisites) but requires iOS 26. As of March 2026, iOS 26 is in beta — requiring it would make MC-iOS unusable for months. SFSpeechRecognizer on iOS 18+ with on-device recognition covers the use case: quick voice captures under 60 seconds.

**Upgrade path:** When iOS 26 reaches stable (likely fall 2026), add conditional:

```swift
if #available(iOS 26, *) {
    // Use SpeechAnalyzer / DictationTranscriber
    // Better accuracy, no 60s limit, no Settings prerequisite
} else {
    // Fall back to SFSpeechRecognizer
    // requiresOnDeviceRecognition = true, 60s limit
}
```

**Confidence:** HIGH — SFSpeechRecognizer is battle-tested. The 60-second limit aligns with MC's "quick capture" use case. Known iOS 18.0 regression (transcribed text clearing on pause) was fixed in subsequent iOS 18.x releases.

### iOS Share Extension

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Share Extension target | (Xcode target type) | Capture from any app's share sheet | Core v1.4 feature. User shares link/text from Safari, Notes, etc. Extension writes to SwiftData (shared via App Groups), syncs on next app open. |
| NSItemProvider | (built-in) | Content extraction from share payload | Standard API for extracting URLs, text, and images from share sheet items. |
| SwiftUI in Extension | (built-in) | Share extension UI | Wrap SwiftUI view in `UIHostingController` within `SLComposeServiceViewController`. Reuse main app's capture view. |

**Implementation pattern:**

```swift
// ShareViewController.swift
class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let container = ConfigureSharedModelContainer() // App Group-aware
        let hostingController = UIHostingController(
            rootView: ShareCaptureView()
                .modelContainer(container)
        )
        addChild(hostingController)
        view.addSubview(hostingController.view)
    }
}
```

**Info.plist activation rules:**
```xml
<key>NSExtensionActivationRule</key>
<dict>
    <key>NSExtensionActivationSupportsText</key>
    <true/>
    <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
    <integer>1</integer>
</dict>
```

**Confidence:** HIGH — Share extensions with SwiftUI are well-documented. The App Group + SwiftData shared container pattern has multiple verified implementations.

### iOS Widget

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| WidgetKit | (built-in iOS 14+) | Home screen quick-capture widget | "Widget capture in 3 taps" — tap widget, it opens the app to capture view with keyboard ready. Widgets cannot accept text input directly (WidgetKit limitation). |
| App Intents | (built-in iOS 16+) | Widget button actions | Interactive widget buttons trigger App Intent actions. "Quick capture" button opens app to capture screen. |

**Important limitation:** WidgetKit widgets are read-only with interactive buttons/toggles only. Direct text input in a widget is not possible. The "3-tap capture" flow is: (1) tap widget button, (2) app opens to capture field with keyboard, (3) type/dictate and send.

**Widget display options:**
- Project count + latest capture timestamp (small widget)
- Last 3 captures with project badges (medium widget)
- Quick-capture button that opens app to capture view

**Confidence:** HIGH — WidgetKit with App Intents is straightforward. The constraint (no text input in widget) is a platform limitation, not a technical risk.

### iOS Project Structure

```
~/mission-control-ios/
  project.yml                    # XcodeGen manifest
  MissionControl.xcodeproj/      # Generated (gitignored)
  Package.swift                  # SPM for shared code between targets
  Sources/
    App/                         # Main iOS app
      MissionControlApp.swift
      Views/
        DashboardView.swift      # Project list, captures, risks
        CaptureView.swift        # Text + voice capture
        ProjectDetailView.swift
      Services/
        MCAPIClient.swift        # URLSession → MC API (:3000)
        SyncService.swift        # Foreground sync of offline queue
        SpeechService.swift      # SFSpeechRecognizer wrapper
      Models/
        CaptureItem.swift        # @Model — offline capture queue
        CachedProject.swift      # @Model — cached API responses
    ShareExtension/              # Share sheet target
      ShareViewController.swift
      ShareCaptureView.swift     # Reuses CaptureView
    Widget/                      # WidgetKit target
      MissionControlWidget.swift
      WidgetProvider.swift
  Tests/
    ...
```

**Why sibling repo (not monorepo):** Swift/Xcode tooling expects its own project root. The TypeScript monorepo (`pnpm`, `turbo`, `tsconfig`) has no awareness of Swift. Mixing them creates CI confusion. NexusClaw and Principal's Ear follow the same sibling-repo pattern.

**Confidence:** HIGH — This matches the established pattern across 3 other iOS projects in the ecosystem.

## Server-Side Stack Additions Summary

### mc.config.json Schema Extensions

```json
{
  "projects": [
    {
      "name": "Mission Control",
      "slug": "mission-control",
      "path": "/Users/ryanstern/mission-control",
      "host": "local",
      "dependsOn": ["nexusclaw", "openefb"],
      "conventions": {
        "claudeMdRequired": true,
        "testFramework": "vitest"
      }
    }
  ],
  "knowledge": {
    "conventionRules": [
      { "pattern": "any", "severity": "error", "message": "Use 'unknown' instead of 'any' in TypeScript strict mode" },
      { "pattern": "console\\.log", "severity": "warning", "message": "Prefer structured logging" }
    ],
    "scanIntervalMs": 3600000,
    "sshCacheMinutes": 60
  }
}
```

### New API Routes

| Route | Purpose | Uses |
|-------|---------|------|
| `GET /api/projects/:slug/dependencies` | Dependency chain for a project | mc.config.json `dependsOn` field |
| `GET /api/projects/graph` | Full project relationship graph (nodes + edges) | All projects + their `dependsOn` relationships |
| `GET /api/knowledge/conventions` | Convention registry with violation counts | Convention scanner results |
| `GET /api/knowledge/:slug` | CLAUDE.md content + parsed conventions for a project | SSH content cache + convention scan |
| `GET /api/knowledge/search` | Cross-project knowledge search | FTS5 over cached CLAUDE.md content |

### New Health Check Types

| Check Type | Trigger | Severity |
|------------|---------|----------|
| `dependency_impact` | Upstream project has unpushed commits that downstream depends on | Warning |
| `convention_violation` | CLAUDE.md or codebase violates convention registry rules | Info/Warning |
| `stale_knowledge` | CLAUDE.md not updated in 30+ days while project has active commits | Info |

### New SQLite Tables

```sql
-- Cached CLAUDE.md content per project
CREATE TABLE knowledge_cache (
  projectSlug TEXT PRIMARY KEY,
  host TEXT NOT NULL,           -- 'local' | 'mac-mini'
  content TEXT NOT NULL,         -- Full CLAUDE.md text
  contentHash TEXT NOT NULL,     -- SHA-256 for change detection
  parsedAt TEXT NOT NULL,        -- ISO timestamp
  conventions TEXT               -- JSON array of extracted conventions
);

-- Convention violations detected during scan
CREATE TABLE convention_violations (
  id TEXT PRIMARY KEY,
  projectSlug TEXT NOT NULL,
  rule TEXT NOT NULL,            -- Pattern that matched
  severity TEXT NOT NULL,        -- 'error' | 'warning' | 'info'
  location TEXT,                 -- File path or section
  detectedAt TEXT NOT NULL,
  resolvedAt TEXT                -- NULL if still active
);
```

These follow the existing Drizzle schema patterns and integrate with the health findings pipeline.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Graph visualization | d3-force (module only) | Full D3 (`d3` npm package) | Full D3 is 280KB+ minified. d3-force is ~15-20KB. MC only needs physics simulation, not scales/axes/shapes. |
| Graph visualization | d3-force + React SVG | react-force-graph (vasturiano) | react-force-graph wraps d3-force with its own rendering. MC already renders custom SVG — adding another rendering layer conflicts with the pattern. |
| Graph visualization | d3-force + React SVG | vis.js / cytoscape.js | 200-300KB libraries with full graph editing UIs. MC needs a read-only relationship visualization, not a graph editor. |
| Graph visualization | d3-force + React SVG | Custom spring physics | Reinventing velocity Verlet, Barnes-Hut approximation, and collision detection is unjustifiable when d3-force does exactly this in 15KB. |
| iOS offline storage | SwiftData | Core Data | Core Data is more mature but requires NSManagedObject boilerplate, .xcdatamodeld files, and manual NSPersistentContainer setup. MC-iOS has 3-4 simple entities — SwiftData's `@Model` macro eliminates ceremony. |
| iOS offline storage | SwiftData | Raw SQLite (GRDB) | GRDB is excellent (OpenEFB uses it) but overkill for a capture queue. SwiftData has native SwiftUI integration and share extension support via App Groups. |
| iOS offline storage | SwiftData | UserDefaults + JSON files | Not queryable, no migration support, won't scale if capture volume grows. |
| iOS speech | SFSpeechRecognizer | SpeechAnalyzer | SpeechAnalyzer requires iOS 26 (beta as of March 2026). SFSpeechRecognizer on iOS 18+ is sufficient for sub-60s captures. Add SpeechAnalyzer path when iOS 26 ships. |
| iOS speech | SFSpeechRecognizer | WhisperKit / mlx-audio-swift | Principal's Ear uses mlx-audio-swift for long-form transcription. MC-iOS needs quick captures (10-30s), not lecture transcription. SFSpeechRecognizer is zero-dependency, built-in, instant. No model download needed. |
| iOS networking | URLSession | Alamofire | MC API returns simple JSON. URLSession with async/await is sufficient. Alamofire adds 500KB+ for features MC doesn't need (multipart upload, request retry chains, certificate pinning). |
| iOS project gen | XcodeGen | Tuist | Tuist is more powerful but more complex. XcodeGen is proven across NexusClaw and Principal's Ear in this ecosystem. Consistency matters. |
| SSH content reading | `execFile("ssh", [..., "cat ..."])` | node-ssh (npm package) | node-ssh adds a dependency for SSH2 protocol. MC already has a proven `execFile("ssh", ...)` pattern used 4 places in project-scanner.ts. Same approach for reading CLAUDE.md. |
| Content hashing | `node:crypto` SHA-256 | xxhash / farmhash | CLAUDE.md files are small (<10KB). SHA-256 via built-in `node:crypto` is fast enough. No need for a faster hash library at this scale. |
| Convention enforcement | RegExp string matching | ESLint / AST parsing | MC scans CLAUDE.md text for conventions, not source code. String matching is appropriate for "does this project mention X?" checks. AST parsing is deferred (runtime convention enforcement is out of scope for v1.4). |

## What NOT to Add

| Temptation | Why Skip It |
|------------|------------|
| Full `d3` package | 280KB+ for d3-scale, d3-axis, d3-shape, d3-geo, etc. MC only needs force simulation (~15KB via d3-force module). |
| `d3-selection` / `d3-transition` | DOM manipulation modules. React owns the DOM in MC. Use `useRef` + React event handlers instead. |
| `d3-drag` | Would require d3-selection (DOM-level drag). Use React's `onMouseDown/Move/Up` for graph node dragging instead. |
| `d3-zoom` | Same issue — DOM-level zoom via d3-selection. Implement with CSS `transform: scale()` + wheel events if needed. |
| `react-force-graph` | Wraps d3-force with its own Canvas/WebGL renderer. MC renders custom SVG consistently — adding a different rendering approach breaks the pattern. |
| `vis.js` / `cytoscape.js` | 200-300KB graph editors. MC needs a read-only relationship view, not a full graph editor. |
| `Alamofire` (iOS) | URLSession with async/await is sufficient for simple JSON API calls. |
| `mlx-audio-swift` (iOS) | Principal's Ear territory. MC-iOS does quick voice captures, not long-form transcription. SFSpeechRecognizer is built-in and instant. |
| `Kingfisher` / `SDWebImage` (iOS) | MC-iOS doesn't display remote images. Project data is text/JSON. |
| `SwiftLint` | Nice to have but not critical for v1.4 scope. Add later if needed. |
| `node-ssh` | Adds npm dependency for SSH2 protocol. `execFile("ssh", ...)` is already proven in 4 places. |
| `chokidar` / filesystem watchers | Knowledge scan runs on timer (1hr). Real-time file watching is unnecessary overhead. |
| `diff` / `jsdiff` | Convention violations are binary (matches or doesn't). No need for diff computation. |
| `marked` / `remark` | CLAUDE.md is scanned as plain text for patterns, not parsed as Markdown AST. String matching suffices. |

## Installation

### Server/Dashboard (in existing monorepo)

```bash
# Graph visualization (web package)
pnpm --filter @mission-control/web add d3-force
pnpm --filter @mission-control/web add -D @types/d3-force

# That's it. Everything else uses existing deps or Node.js built-ins.
```

**Total new npm dependencies: 1** (d3-force, which brings 3 transitive: d3-dispatch, d3-quadtree, d3-timer). Plus 1 devDep (@types/d3-force).

### iOS Companion (new repo)

```bash
# Create repo
mkdir ~/mission-control-ios && cd ~/mission-control-ios
git init

# XcodeGen project
cat > project.yml << 'YML'
name: MissionControl
options:
  bundleIdPrefix: com.quartermint.missioncontrol
  deploymentTarget:
    iOS: "18.0"
  xcodeVersion: "16.0"
targets:
  MissionControl:
    type: application
    platform: iOS
    sources: [Sources/App]
    settings:
      SWIFT_VERSION: "6.2"
      SWIFT_STRICT_CONCURRENCY: complete
    entitlements:
      path: MissionControl.entitlements
  ShareExtension:
    type: app-extension
    platform: iOS
    sources: [Sources/ShareExtension]
    settings:
      SWIFT_VERSION: "6.2"
    entitlements:
      path: ShareExtension.entitlements
  Widget:
    type: app-extension
    platform: iOS
    sources: [Sources/Widget]
    settings:
      SWIFT_VERSION: "6.2"
YML

xcodegen generate
```

**Total Swift package dependencies: 0.** Everything uses Apple frameworks (SwiftUI, SwiftData, Speech, AVFoundation, WidgetKit).

## Version Compatibility Matrix

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| d3-force | 3.0.0 | 3.0.0 | Only version with ESM + `"type": "module"`. No newer releases. |
| @types/d3-force | 3.0.10 | 3.0.10 | Latest from DefinitelyTyped. |
| iOS deployment target | 18.0 | 18.0 | SwiftData maturity + SFSpeechRecognizer on-device. |
| Swift | 6.2 | 6.2 | Strict concurrency. Matches PE and SFR. |
| Xcode | 16.0 | 16.x | Required for iOS 18 SDK + SwiftUI 6. |
| Node.js (server) | 22.x | 22.22.0 | Already confirmed on Mac Mini. |

## Sources

- [d3-force v3.0.0 release](https://github.com/d3/d3-force/releases/tag/v3.0.0) — ESM migration, dependency updates
- [d3-force package.json](https://github.com/d3/d3-force/blob/main/package.json) — 3 deps: d3-dispatch, d3-quadtree, d3-timer
- [d3-force documentation](https://d3js.org/d3-force) — Force simulation API reference
- [@types/d3-force](https://www.npmjs.com/package/@types/d3-force) — TypeScript declarations, v3.0.10
- [React + D3 integration patterns](https://gist.github.com/alexcjohnson/a4b714eee8afd2123ee00cb5b3278a5f) — useRef + useEffect approach
- [Creating a Force Graph with React and D3](https://dev.to/gilfink/creating-a-force-graph-using-react-and-d3-76c) — React SVG rendering pattern
- [Apple SFSpeechRecognizer docs](https://developer.apple.com/documentation/speech/sfspeechrecognizer) — On-device recognition
- [SpeechAnalyzer WWDC25](https://developer.apple.com/videos/play/wwdc2025/277/) — iOS 26 next-gen speech API
- [iOS 26 SpeechAnalyzer guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide) — SpeechTranscriber, DictationTranscriber, SpeechDetector modules
- [iOS Share Extension with SwiftUI and SwiftData](https://www.merrell.dev/ios-share-extension-with-swiftui-and-swiftdata/) — App Group + shared ModelContainer pattern
- [Create an iOS Share Extension with custom UI](https://medium.com/@henribredtprivat/create-an-ios-share-extension-with-custom-ui-in-swift-and-swiftui-2023-6cf069dc1209) — SwiftUI in share extensions
- [Core Data and App extensions](https://www.avanderlee.com/swift/core-data-app-extension-data-sharing/) — App Group sharing patterns
- [SwiftData vs Core Data 2025](https://distantjob.com/blog/core-data-vs-swiftdata/) — Feature comparison
- [WidgetKit in iOS 26](https://dev.to/arshtechpro/wwdc-2025-widgetkit-in-ios-26-a-complete-guide-to-modern-widget-development-1cjp) — Interactive widget capabilities
- [Interactive Widgets with SwiftUI](https://www.kodeco.com/43771410-interactive-widgets-with-swiftui) — App Intents for widget buttons
- [Build Offline-First with SwiftData](https://commitstudiogs.medium.com/build-offline-first-apps-with-swiftdata-and-background-tasks-a29434b6f80c) — Offline sync patterns
- [iOS 18 Speech Recognition bug](https://developer.apple.com/forums/thread/762952) — requiresOnDeviceRecognition regression, fixed in later releases
- [Node.js child_process docs](https://nodejs.org/api/child_process.html) — execFile for SSH commands

---
*Researched: 2026-03-21*
