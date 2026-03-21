# Feature Research

**Domain:** Cross-Project Intelligence, iOS Companion App, Knowledge Unification, Dashboard Enhancements
**Researched:** 2026-03-21
**Confidence:** MEDIUM-HIGH (cross-project dependency tracking and knowledge aggregation are novel for personal dev tools but build on well-understood patterns from monorepo/microservice ecosystems; iOS capture is well-documented; dashboard highlight mode is standard UX)

## Feature Landscape

This research covers four pillars of v1.4. Each pillar is analyzed independently for table stakes vs. differentiators vs. anti-features, with dependencies on existing MC infrastructure called out.

---

## Pillar 1: Cross-Project Intelligence

MC currently tracks 35+ projects independently. v1.4 connects them -- understanding that changes to `mission-control` affect `@mission-control/mcp`, that `openefb` and `sovereign-flight-recorder` share Swift/MapLibre patterns, and that a stale `mac-mini-bridge` might block `lifevault` deployments.

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Dependencies on Existing MC | Notes |
|---------|--------------|------------|----------------------------|-------|
| Dependency chain definitions in `mc.config.json` | Without explicit "A depends on B" declarations, the system is guessing. Manual declaration is the minimum viable approach and the only reliable one for a polyglot multi-repo setup. | LOW | `mc.config.json` loader, `MCConfig` type in `packages/api/src/lib/config.ts` | Add `dependsOn: string[]` field to `ProjectConfigEntry`. Each entry is a project slug. Validation: reject cycles at config load time (topological sort). Keep it simple -- no version pinning, no semver ranges. This is "project X uses project Y" not "project X requires Y@^2.0". |
| Cross-project relationship display | Declarations without visualization are invisible. Users need to see which projects connect and how. | MEDIUM | Projects API, dashboard project cards | Minimum viable: show dependency badges on project cards ("depends on: shared, mcp"). List format, not graph. Graph is a differentiator (below). |
| Automated cross-machine reconciliation | MC already detects unpushed/diverged/stale per-project (7 health checks). Cross-machine reconciliation is the natural extension: "MacBook has commits Mac Mini doesn't have." Already partially built via `projectCopies` table and divergence detection. | MEDIUM | `projectCopies` table, `git-health.ts` divergence checks, SSH scanner | The existing `diverged_copies` health check fires when copies on different hosts have different HEAD commits. v1.4 extends this to continuous detection (not just at scan time) and adds severity escalation: diverged for >24h = warning, >7d = critical. Reuse `projectHealth` table with new `checkType` values. |
| Dependency drift health findings | When project A depends on project B, and B has unpushed commits, A is at risk. This is the core value of cross-project intelligence: "your dependency changed, be aware." | MEDIUM | Dependency definitions, health engine scan loop, `projectHealth` table | New `checkType: "dependency_impact"`. During post-scan health phase, for each project with `dependsOn`, check if any dependency has active warnings/critical findings. Propagate as info/warning finding on the dependent project. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Dependencies on Existing MC | Notes |
|---------|-------------------|------------|----------------------------|-------|
| Project relationship graph (D3-force) | Visual "aha moment" -- see the entire ecosystem as a connected network, not a flat list. No personal dev tool does this. Monorepo tools (Nx) show package graphs, but MC's graph spans repos, hosts, and languages. | HIGH | Dependency definitions, D3-force library (~40KB), React integration | CEO review already approved D3-force exception. Implementation: nodes = projects (colored by host/status), edges = dependency relationships. Force-directed layout positions connected projects near each other. Interactive: hover for details, click to navigate to project card. This is a "wow" feature, not a daily-use feature -- build it, but don't block the milestone on it. |
| Commit impact alerts | "openefb just pushed 5 commits -- sovereign-flight-recorder depends on shared Swift patterns from openefb." Cross-project awareness at commit granularity. Beyond what any personal dev tool offers. | HIGH | Dependency definitions, commit tracking, scan cycle timing | During scan, compare each project's latest commits against last scan. If a dependency has new commits, generate `dependency_impact` finding on the dependent. Metadata includes: which dependency changed, commit count, commit messages summary. Alert severity: info (dependency updated), warning (dependency has breaking-looking commits -- keyword heuristic on commit messages). |
| Pipeline awareness | Understanding that `mission-control` API changes should trigger MCP rebuild, or that `vaulttrain-stern` model changes should trigger `lifevault` re-evaluation. Directional data flow awareness. | HIGH | Dependency definitions with optional `dataFlow` field, scan cycle | The CEO review reserved a `dataFlow` field but deferred consumption. This is genuinely hard to make useful without being noisy. Defer to v1.5 unless dependency definitions naturally reveal pipeline patterns. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-detected dependencies (via import analysis) | "MC should figure out dependencies itself" | MC spans 4+ languages (TypeScript, Swift, Go, Python). Cross-language import analysis is a massive effort with poor recall. A TypeScript project importing a Go CLI via `execFile` has no parseable dependency. Manual declaration is 10 minutes of setup and 100% accurate. | Manual `dependsOn` in config. Simple, explicit, correct. |
| Dependency version tracking | "Track which version of shared each consumer uses" | MC projects are not published packages. They don't have version contracts. Adding semver tracking to git repos that don't publish creates phantom precision. | Track divergence (commit delta), not versions. "shared has 3 commits your copy doesn't have" is more useful than "you're on v1.2.3 and shared is v1.3.0". |
| Automated dependency updates | "MC should auto-pull when a dependency changes" | MC observes, it does not act. Auto-pulling can break working trees, create merge conflicts during active sessions, and destroy uncommitted work. The "awareness not action" principle is core. | Surface dependency drift alerts. User decides when and how to sync. |
| Circular dependency detection with resolution | "Break circular dependencies automatically" | Cycle detection at config load time is table stakes (reject invalid configs). But "resolving" cycles requires understanding project architecture -- MC doesn't know if the cycle is intentional (mutual dev dependencies) or accidental. | Detect and report cycles. User restructures manually. |

---

## Pillar 2: iOS Companion App

The universal capture problem is MC's biggest unsolved UX gap. The CLI solved terminal capture. iOS solves everywhere-else capture: while reading Twitter, while walking, while in another app. The UX bar is WhatsApp-style "send and forget."

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Dependencies on Existing MC | Notes |
|---------|--------------|------------|----------------------------|-------|
| Share sheet extension | The primary iOS capture entry point. Share a link, text selection, or screenshot from any app directly to MC. Without this, the iOS app is just a dashboard viewer -- not worth installing. | MEDIUM | `POST /captures` API endpoint (already exists), App Groups for shared data | iOS Share Extension target in Xcode. Custom SwiftUI view (not default `SLComposeServiceViewController`). Accept: URLs, text, images. Write to shared App Group container (Core Data or SwiftData). Main app syncs to MC API on foreground. Share sheet must work even when MC API is unreachable (offline-first). Share extensions have a 120MB memory limit and ~30s execution time -- keep UI lightweight. |
| Offline capture queue | iPhone captures must survive Mac Mini downtime, airplane mode, and poor cell coverage. If a capture is lost because the server was unreachable, trust is permanently broken. | MEDIUM | Core Data / SwiftData for local persistence, network reachability detection | Queue model: `CaptureQueueItem(id, content, type, timestamp, synced)`. Sync on foreground via `URLSession`. Retry with exponential backoff (1s, 2s, 4s, max 60s). Show sync status in app: "3 captures pending sync." Clear queue after confirmed API response. |
| Native SwiftUI dashboard | Project list with status, recent captures, risk summary. Not a web wrapper -- native scroll physics, haptics, pull-to-refresh. CEO review already decided: native SwiftUI, not WKWebView. | HIGH | `GET /projects`, `GET /risks`, `GET /captures` API endpoints (all exist) | Three tabs: Projects (departure-board style list), Captures (recent with project badges), Risks (summary cards). Pull-to-refresh triggers API fetch. Data model mirrors web dashboard but simplified -- no heatmap, no session timeline, no relationship graph. iOS is for capture and quick glance, not deep analysis. |
| Tailscale network requirement | iOS app only works when phone is on Tailscale. This is the auth model -- same as browser. No new auth system needed. | LOW | Tailscale iOS app installed, MC API accessible via Tailscale IP/MagicDNS | On launch, check reachability of MC API. If unreachable, show "Connect to Tailscale" prompt with deep link to Tailscale app. Offline captures still queue locally. Dashboard shows stale data with "Last synced: X ago" badge. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Dependencies on Existing MC | Notes |
|---------|-------------------|------------|----------------------------|-------|
| Widget capture (3-tap) | Capture without opening the app. Tap widget, type/dictate, send. The "3-Second Rule" from iOS widget UX: if it takes longer than 3 seconds, the widget has failed. | MEDIUM | WidgetKit + AppIntents, shared App Group container, offline queue | iOS 17+ interactive widgets via AppIntents. Medium-size widget with text field and "Capture" button. Use `AppIntent` that writes to shared Core Data container (background daemon, not main app). Main app syncs on next foreground. Widget can also show "last capture" for ambient awareness. Critical: widget interactions have a ~3s execution budget. Write to local queue only, never hit network from widget. |
| Voice capture with transcription | Capture while walking, driving, or cooking. Tap, speak, done. Audio stored alongside transcription for fidelity. The 60s cap from CEO review aligns with Apple Speech on-device limits. | HIGH | Apple Speech framework (on-device), `captures` table with `type: "voice"`, audio file storage | Two-phase: (1) Record audio via AVAudioEngine, save to App Group container as .m4a. (2) Transcribe on-device via SFSpeechRecognizer (iOS 17+, on-device mode). Store both transcription text (as capture `rawContent`) and audio file reference (new `audioUrl` field on captures schema). On-device transcription means no network needed at capture time. Note: iOS 26 introduces SpeechAnalyzer with DictationTranscriber for better accuracy, but that requires iOS 26 minimum deployment target. Recommend SFSpeechRecognizer for iOS 17+ compatibility, upgrade path to SpeechAnalyzer when iOS 26 adoption is sufficient. |
| Context-aware capture metadata | When you capture from the MC iOS app, auto-include: current location (city-level, not GPS), time of day, source app (from share sheet UTI), and whether you're on WiFi or cellular. Enriches "why did I save this?" at triage time. | LOW | iOS Core Location (city-level), UIApplication context, UTI from share sheet | Location permission request (When In Use). Store as capture metadata JSON: `{ city, timeOfDay, sourceApp, connectivity }`. This is LOW complexity because it's just metadata attached to the existing capture payload -- no new API endpoints needed. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| iOS push notifications | "Alert me when a project has critical risk" | Notification fatigue kills adoption. MC is pull-based by design. Push notifications for a single-user personal tool create anxiety, not awareness. The user's morning pattern is "open MC, see what's up" -- not "get pinged at 2am about an unpushed commit." | Dashboard is the notification surface. Open MC, see risks. No push. |
| Background sync | "Sync captures even when app is closed" | iOS background execution is heavily constrained. `BGAppRefreshTask` gets ~30s of execution every 15-60 minutes, timing controlled by iOS. `BGProcessingTask` requires device charging + WiFi. The complexity of background modes entitlement, testing, and debugging vastly outweighs the value for a capture queue that rarely exceeds 5 items. CEO review deferred this. | Foreground sync on app open. Offline queue holds captures until then. If the user opens the app once a day, captures sync once a day. That's fine. |
| Full dashboard parity with web | "Show everything the web dashboard shows" | The web dashboard has sprint timeline, session sidebar, relationship graph, heatmap, convergence badges. Rebuilding all of this in SwiftUI doubles the frontend engineering surface for a secondary client. iOS should do 2 things well: capture and glance. | Simplified dashboard: project list + risks + captures. Deep analysis happens on the web dashboard. Link out to web for details. |
| Screenshot OCR capture | "Screenshot a tweet, MC extracts the text" | On-device OCR (Vision framework) works but adds significant complexity: text extraction accuracy varies, layout detection for tweets/articles is fragile, and the user has to review/correct OCR output (adding friction to "fire and forget"). CEO review deferred this. | Share sheet captures the URL directly from apps like Twitter. For actual screenshots, store the image and surface it for manual triage later. OCR is v1.5+ territory. |
| Camera capture | "Take a photo of a whiteboard and save to MC" | Feature creep. MC captures thoughts and references, not images. A whiteboard photo needs annotation, OCR, and spatial understanding -- that's a different product (Apple Notes, Miro). | Share sheet accepts images. Store as image capture. No annotation or OCR. |

---

## Pillar 3: Knowledge Unification

The core insight from the cross-machine knowledge memory: "lessons learned on my laptop aren't being used by my mini/desktop/server." CLAUDE.md files, project conventions, and architectural decisions are siloed per-project and per-machine. MC becomes the knowledge aggregation layer.

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Dependencies on Existing MC | Notes |
|---------|--------------|------------|----------------------------|-------|
| CLAUDE.md aggregation | MC already scans 35+ project directories. Reading CLAUDE.md from each is a natural extension of the scan loop. Without this, knowledge unification has no data source. | MEDIUM | `project-scanner.ts` scan loop, SSH scanner for Mac Mini projects, new `knowledge` table | During scan, read `CLAUDE.md` (and `.claude/CLAUDE.md`, `~/.claude/projects/*/CLAUDE.md`) from each project directory. Parse content, extract key sections (conventions, architecture, constraints). Store content hash for change detection. SSH read for Mac Mini projects (already have SSH batch execution pattern). New table: `project_knowledge(id, projectSlug, filePath, contentHash, content, scannedAt)`. |
| Content-hash caching | CLAUDE.md files change rarely. Re-reading and re-parsing 35+ files every 5-minute scan cycle is wasteful. Content-hash comparison skips unchanged files. | LOW | `project_knowledge` table with `contentHash` column | SHA-256 of file content. Compare hash on each scan. If unchanged, skip re-read. If changed, update content and trigger stale knowledge check. This is identical to the existing `headCommit` comparison pattern in `projectCopies`. |
| MCP knowledge tools | Claude Code sessions need to query MC's aggregated knowledge. "What conventions does this project follow?" and "What do other projects do for error handling?" are questions that MCP tools should answer. | MEDIUM | MCP server (`packages/mcp`), knowledge API endpoints, FTS5 search | Three new MCP tools: `project_knowledge` (return CLAUDE.md content + conventions for a project), `convention_check` (check if a pattern violates known conventions), `cross_project_search` (search across all project knowledge for a term/pattern). These are thin wrappers around API endpoints, following the existing MCP pattern. |
| Context injection into Claude Code startup | The existing session startup hook surfaces critical risks in a banner. v1.4 extends this to include relevant knowledge: project conventions, related project context, recent captures about this project. | LOW | Existing HTTP hook endpoints (`/hook/start`), knowledge API | Extend the `/hook/start` response payload with a `knowledge` section: project CLAUDE.md summary, active conventions for the project, any dependency projects and their key conventions. This enriches the Claude Code startup banner without requiring the session to make separate MCP calls. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Dependencies on Existing MC | Notes |
|---------|-------------------|------------|----------------------------|-------|
| Convention registry with scan-time enforcement | Go beyond passive aggregation to active enforcement: "all TypeScript projects must use strict mode," "all Swift projects must have CLAUDE.md." Config-driven anti-pattern list that runs during scan and generates health findings for violations. | HIGH | Convention definitions in `mc.config.json`, scan loop, `projectHealth` table | New config section: `conventions: [{ name: "ts-strict", pattern: "tsconfig.json must contain strict: true", scope: "language:typescript", checkType: "file_contains" }]`. During scan, for each project matching scope, run the check. Violations become `convention_violation` health findings. Enforcement is at scan-time only (CEO review deferred runtime enforcement). Start with simple checks: file existence, file contains string, CLAUDE.md sections present. Complex AST checks are anti-features. |
| Stale knowledge alerts | CLAUDE.md written 6 months ago for a project with 200 commits since then is probably outdated. MC detects the gap between knowledge freshness and project activity, and surfaces it as a health finding. | MEDIUM | Knowledge table with `scannedAt`, commits table with `authorDate`, `projectHealth` table | Compare: last CLAUDE.md modification time vs. last commit date. If CLAUDE.md is >30 days older than latest commit activity, generate `stale_knowledge` health finding (info severity). If >90 days, warning. Heuristic, not definitive -- but surfaces the "this project's docs are probably outdated" signal. |
| Cross-project convention diffing | "Mission Control uses Vitest but CocoBanana uses Jest. OpenEFB has CLAUDE.md but NexusClaw doesn't." Surface inconsistencies across the portfolio as a knowledge feed, not as errors. | MEDIUM | Convention registry, knowledge aggregation | After convention scan, compare results across projects with similar scope (same language, same framework). Surface differences as info-level findings. Not prescriptive -- "these differ" not "fix this." Useful for gradual standardization. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Runtime convention enforcement | "Block Claude Code from violating conventions in real-time" | Intercepting Claude Code tool calls requires a proxy layer between Claude and the filesystem. This is M+ engineering effort, introduces latency on every file write, and creates a fragile dependency on Claude Code's internal protocol. CEO review explicitly deferred this. | Scan-time enforcement generates findings. User sees violations in risk feed and fixes them in the next session. Awareness, not enforcement. |
| AI-generated convention suggestions | "MC should analyze my code and suggest conventions I should adopt" | Convention suggestions without human judgment create noise. A project might intentionally deviate from a convention (prototype, legacy, different requirements). AI suggesting "you should use TypeScript strict mode" for a quick script project is unhelpful. | Conventions are human-defined in config. MC enforces what you declare, not what it thinks you should declare. |
| CLAUDE.md auto-generation | "MC should write CLAUDE.md files for projects that don't have one" | Auto-generated docs without human review are worse than no docs. They create false confidence. A CLAUDE.md should reflect the developer's actual understanding and intent, not a machine's guess. | Surface `stale_knowledge` finding: "nexusclaw has no CLAUDE.md." User writes it when they're ready. |
| Cross-machine memory sync (Claude Code memories) | "Sync Claude Code auto-memories between MacBook and Mac Mini" | Claude Code memories are stored in `~/.claude/` and are tied to the local machine's context. Syncing them creates conflicts (different machines have different paths, different tools), and Claude Code has no API for memory management. | MC aggregates CLAUDE.md files (explicit, version-controlled knowledge). Auto-memories stay local. If something is important enough to share, put it in CLAUDE.md. |

---

## Pillar 4: Dashboard Enhancement

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Dependencies on Existing MC | Notes |
|---------|--------------|------------|----------------------------|-------|
| "Changes since last visit" highlight mode | MC is the browser homepage. The morning pattern is "what changed while I was sleeping?" Current dashboard shows current state but doesn't highlight what's new. Without this, the user must mentally diff what they remember vs. what they see. | MEDIUM | `localStorage` for last-visit timestamp, projects API with activity data, existing SSE infrastructure | On dashboard load, read `lastVisitTimestamp` from `localStorage`. Query API for projects with activity since that timestamp (commits, captures, health changes). Float changed projects to the top of the departure board. Show activity count badge: "5 new commits, 2 captures." Subtle highlight animation (warm glow that fades after 3s). Update `lastVisitTimestamp` on page unload. This is a UX pattern, not a feature -- it's how the existing data is presented, not new data. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Dependencies on Existing MC | Notes |
|---------|-------------------|------------|----------------------------|-------|
| Activity delta badges | Not just "this project changed" but "3 commits, 1 capture, health improved" in a compact badge on each project card. Quick scanning without expanding any card. | LOW | Projects API with aggregated activity counts, existing project card components | Extend project list API response with `activitySince: { commits: number, captures: number, healthChanges: number }` when `since` query param is provided. Render as compact badges (same visual language as existing health dots and convergence badges). |
| Highlight fade animation | Changed rows glow briefly (terracotta accent, 3s fade) drawing the eye without being distracting. Respects the warm/opinionated design language already established. | LOW | CSS animation, `localStorage` timestamp comparison | Pure CSS: `@keyframes highlight-fade { from { background: var(--terracotta-15) } to { background: transparent } }`. Apply class on mount for changed projects. No JavaScript animation library needed. |
| Time-since-last-visit display | "You were last here 14 hours ago. Here's what happened." A single line at the top of the dashboard that contextualizes the highlight mode. | LOW | `localStorage` last-visit timestamp | Format: "Last visit: 14 hours ago" or "Last visit: yesterday at 11:42 PM." Shows only when > 1 hour since last visit. Disappears after 30s or on any interaction. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Email/Slack digest of changes | "Send me a summary of what changed" | MC is pull-based. Adding push channels (email, Slack) creates a parallel notification surface that competes with the dashboard. The user's adopted pattern is "open MC homepage" not "check email for MC updates." | Dashboard IS the digest. Open it, see what changed. |
| Persistent unread markers | "Show unread badges until I click each project" | Creates obligation. "You have 12 unread projects" feels like work, not awareness. The highlight mode should inform, not guilt. Fading highlights say "here's what's new" without "you owe me attention." | Fade-based highlights. New items glow for 3s on first visit, then blend back to normal. No persistent unread state. |

---

## Feature Dependencies

```
[Dependency Definitions (mc.config.json)]
    |
    |-- enables --> [Dependency Drift Health Findings]
    |                   |-- reuses --> projectHealth table (existing)
    |                   |-- reuses --> health engine scan loop (existing)
    |
    |-- enables --> [Commit Impact Alerts]
    |                   |-- requires --> commit tracking (existing)
    |                   |-- reuses --> projectHealth table (existing)
    |
    |-- enables --> [Relationship Graph (D3-force)]
    |                   |-- requires --> React integration layer
    |                   |-- new dependency --> d3-force (~40KB)
    |
    |-- enhances --> [Cross-Machine Reconciliation]
                        |-- reuses --> projectCopies table (existing)
                        |-- reuses --> diverged_copies health check (existing)

[CLAUDE.md Aggregation]
    |
    |-- requires --> project-scanner.ts scan loop (existing)
    |-- requires --> SSH scanner for Mac Mini (existing)
    |-- new table --> project_knowledge
    |
    |-- enables --> [Convention Registry]
    |                   |-- requires --> convention definitions in config
    |                   |-- reuses --> projectHealth table (existing)
    |                   |-- new checkType --> "convention_violation"
    |
    |-- enables --> [MCP Knowledge Tools]
    |                   |-- requires --> knowledge API endpoints (new)
    |                   |-- reuses --> MCP server (existing, 6 tools)
    |
    |-- enables --> [Context Injection]
    |                   |-- reuses --> /hook/start endpoint (existing)
    |
    |-- enables --> [Stale Knowledge Alerts]
                        |-- requires --> commits table (existing)
                        |-- new checkType --> "stale_knowledge"

[iOS Share Sheet Extension]
    |
    |-- requires --> POST /captures API (existing)
    |-- requires --> App Group container (new, iOS)
    |-- requires --> Offline queue (new, Core Data/SwiftData)
    |
    |-- independent of --> [Widget Capture]
    |                          |-- requires --> WidgetKit + AppIntents
    |                          |-- shares --> App Group container
    |                          |-- shares --> Offline queue
    |
    |-- independent of --> [Voice Capture]
    |                          |-- requires --> Apple Speech framework
    |                          |-- requires --> captures schema update (audioUrl field)
    |                          |-- shares --> Offline queue
    |
    |-- all feed into --> [Native SwiftUI Dashboard]
                              |-- requires --> GET /projects, /risks, /captures APIs (all existing)
                              |-- requires --> Tailscale network access

[Dashboard Highlight Mode]
    |-- requires --> localStorage last-visit tracking (new, client-side)
    |-- requires --> projects API activity query (extend existing)
    |-- independent of all other pillars
```

### Key Dependency Insights

- **Dashboard highlight mode is fully independent.** It touches only the web frontend and a minor API extension. Can ship in any phase without blocking or being blocked.
- **Dependency definitions are the foundation of Pillar 1.** Everything in cross-project intelligence requires `dependsOn` in config first. This is the critical path item.
- **CLAUDE.md aggregation is the foundation of Pillar 3.** Convention registry, MCP tools, context injection, and stale knowledge alerts all require the aggregation layer.
- **iOS pillars are internally independent.** Share sheet, widget, and voice capture can ship in any order. They share the offline queue and App Group container, but those are infrastructure, not features.
- **iOS is fully independent of server-side pillars.** The iOS app consumes existing API endpoints. No new server-side work is needed for basic iOS functionality (share sheet + dashboard). Voice capture needs a minor schema extension (`audioUrl` field).
- **The four pillars have no cross-dependencies.** They can be developed and shipped in parallel or in any order. The only shared infrastructure is the existing MC API.

## MVP Definition

### Launch With (v1.4 Core)

Priority ordering based on user value, complexity, and dependency chains:

- [ ] **Dependency definitions in mc.config.json** -- Foundation for all cross-project intelligence. 10 minutes of manual config, 100% accuracy. Without this, Pillar 1 doesn't exist.
- [ ] **CLAUDE.md aggregation with content-hash cache** -- Foundation for all knowledge unification. Extends existing scan loop. Without this, Pillar 3 doesn't exist.
- [ ] **Dashboard highlight mode** -- Immediate daily value. Answers "what changed while I was sleeping?" every morning. Low complexity, high impact, zero dependencies.
- [ ] **Dependency drift health findings** -- First payoff from dependency definitions. Reuses existing health engine entirely.
- [ ] **Stale knowledge alerts** -- First payoff from CLAUDE.md aggregation. Simple heuristic, immediate value.
- [ ] **iOS share sheet extension + offline queue** -- The universal capture breakthrough. Highest-value iOS feature. "Send and forget" from any app.
- [ ] **MCP knowledge tools (3 tools)** -- Context injection for Claude Code sessions. Thin wrappers around new API endpoints.

### Add After Validation (v1.4 Extended)

- [ ] **Convention registry with scan-time enforcement** -- Add after CLAUDE.md aggregation proves useful and convention patterns emerge from the data
- [ ] **Context injection into Claude Code startup** -- Add after MCP knowledge tools validate the data quality
- [ ] **Widget capture** -- Add after share sheet validates the iOS capture flow and offline queue reliability
- [ ] **Native SwiftUI dashboard** -- Add after share sheet establishes the iOS app as worth opening
- [ ] **Commit impact alerts** -- Add after dependency definitions accumulate enough data to make alerts meaningful
- [ ] **Cross-machine reconciliation (continuous)** -- Add after the existing divergence detection proves insufficient

### Future Consideration (v1.5+)

- [ ] **Voice capture with transcription** -- HIGH complexity, requires SpeechAnalyzer evaluation, audio storage decisions. Defer until share sheet + widget prove the iOS capture pattern.
- [ ] **Relationship graph (D3-force)** -- HIGH complexity, impressive but not daily-use. Build after dependency definitions prove useful and the graph has enough nodes/edges to be meaningful.
- [ ] **Pipeline awareness** -- Requires understanding data flow between projects. The `dataFlow` field is reserved but not consumed. Defer until dependency definitions reveal pipeline patterns naturally.
- [ ] **Cross-project convention diffing** -- Requires enough convention data across projects. Defer until convention registry has 6+ months of data.
- [ ] **Context-aware capture metadata (location, source app)** -- Nice enrichment but not essential. Defer until basic iOS capture is habitual.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Pillar |
|---------|------------|---------------------|----------|--------|
| Dashboard highlight mode | HIGH | LOW | P1 | Dashboard |
| Dependency definitions (config) | HIGH | LOW | P1 | Cross-Project |
| CLAUDE.md aggregation | HIGH | MEDIUM | P1 | Knowledge |
| iOS share sheet + offline queue | HIGH | MEDIUM | P1 | iOS |
| Dependency drift findings | HIGH | MEDIUM | P1 | Cross-Project |
| Stale knowledge alerts | MEDIUM | LOW | P1 | Knowledge |
| MCP knowledge tools | MEDIUM | MEDIUM | P1 | Knowledge |
| Context injection (startup banner) | MEDIUM | LOW | P2 | Knowledge |
| Convention registry | MEDIUM | HIGH | P2 | Knowledge |
| Widget capture | MEDIUM | MEDIUM | P2 | iOS |
| Native SwiftUI dashboard | MEDIUM | HIGH | P2 | iOS |
| Commit impact alerts | MEDIUM | HIGH | P2 | Cross-Project |
| Cross-machine reconciliation (continuous) | MEDIUM | MEDIUM | P2 | Cross-Project |
| Activity delta badges | LOW | LOW | P2 | Dashboard |
| Voice capture | MEDIUM | HIGH | P3 | iOS |
| Relationship graph (D3-force) | LOW | HIGH | P3 | Cross-Project |
| Pipeline awareness | LOW | HIGH | P3 | Cross-Project |
| Cross-project convention diffing | LOW | MEDIUM | P3 | Knowledge |
| Context-aware capture metadata | LOW | LOW | P3 | iOS |

**Priority key:**
- P1: Must have for v1.4 launch -- delivers the core promise of each pillar
- P2: Should have -- extends the core with higher-complexity features
- P3: Nice to have -- defer unless time permits or v1.5

## Competitor/Reference Feature Analysis

There are no direct competitors to MC (it's a personal dev operating environment), but adjacent tools inform feature expectations:

| Feature Area | Reference Tool | How They Do It | Our Approach |
|--------------|----------------|----------------|--------------|
| Dependency graphs | Nx (monorepo) | Auto-detected from package.json imports, interactive graph in browser | Manual `dependsOn` in config (polyglot, multi-repo -- can't auto-detect). D3-force graph. |
| Commit impact analysis | Nx affected | Traces imports to determine "what's affected by this change" | Simpler: dependency chain + commit timing. "Your dependency had commits since your last scan." |
| Cross-project impact | Augment Code (AI) | AI-powered semantic diff across microservices with API contract analysis | Heuristic: keyword matching on commit messages ("breaking", "refactor") + dependency chain. No AI needed for v1.4. |
| Share sheet capture | Apple Notes, Notion, Things 3 | Share extension writes to local DB, syncs to cloud | Same pattern: share extension -> App Group -> Core Data -> foreground sync to MC API. |
| Offline queue sync | Things 3, Bear | Core Data with cloud sync, conflict resolution via timestamps | Simpler: capture-only queue (append-only, no conflicts). Core Data -> foreground flush to API. |
| Voice capture | Apple Voice Memos, Just Press Record | On-device recording + transcription | SFSpeechRecognizer on-device. Store audio + transcription as capture. 60s cap. |
| Widget quick capture | Drafts, Fantastical | WidgetKit interactive widgets with AppIntents | Text field + send button. Write to App Group, main app syncs. 3-second budget. |
| Knowledge aggregation | Notion knowledge base, Confluence | Centralized wiki with search | MC aggregates CLAUDE.md files (existing, distributed). No wiki -- just aggregation + search. |
| Convention enforcement | ESLint shared configs, Nx enforce-module-boundaries | Build-time/lint-time checks per project | Scan-time checks across all projects. Health findings, not build failures. |
| Changes since last visit | GitHub notifications, Slack "since you were away" | Unread markers, chronological feed | Highlight mode: float changed projects, activity badges, fade animation. No persistent unread. |

## Sources

- [Nx Dependency Graph Documentation](https://nx.dev/features/explore-graph) -- HIGH confidence. Reference for dependency visualization in monorepo tools.
- [Augment Code Microservices Impact Analysis](https://www.augmentcode.com/tools/microservices-impact-analysis) -- MEDIUM confidence. Reference for AI-powered cross-project change analysis.
- [Change Impact Analysis in Microservices (SANER 2025)](https://arxiv.org/abs/2501.11778) -- MEDIUM confidence. Academic reference for ripple effect analysis across services.
- [iOS Share Extension with SwiftUI and SwiftData](https://www.merrell.dev/ios-share-extension-with-swiftui-and-swiftdata/) -- HIGH confidence. Implementation guide for SwiftUI share extensions with shared data persistence.
- [Create Powerful iOS Share Extensions: Best Practices](https://curatedios.substack.com/p/19-share-extension) -- MEDIUM confidence. Best practices compilation for share extension development.
- [Sharing Data Between Share Extension & App via App Groups](https://www.fleksy.com/blog/communicating-between-an-ios-app-extensions-using-app-groups/) -- HIGH confidence. App Group data sharing pattern between extension and main app.
- [iOS Widget Interactivity in 2026](https://dev.to/devin-rosario/ios-widget-interactivity-in-2026-designing-for-the-post-app-era-i17) -- MEDIUM confidence. Widget design patterns including 3-second rule.
- [Interactive Widgets With SwiftUI (Kodeco)](https://www.kodeco.com/43771410-interactive-widgets-with-swiftui) -- HIGH confidence. Implementation reference for WidgetKit + AppIntents.
- [Apple Speech Framework Documentation](https://developer.apple.com/documentation/speech) -- HIGH confidence. Official Apple docs for SFSpeechRecognizer.
- [iOS 26 SpeechAnalyzer Guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide) -- MEDIUM confidence. New SpeechAnalyzer API available in iOS 26, upgrade path from SFSpeechRecognizer.
- [Bring advanced speech-to-text with SpeechAnalyzer (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/277/) -- HIGH confidence. Apple's official introduction of SpeechAnalyzer framework.
- [Offline-First iOS Architecture with Swift Concurrency & Core Data Sync](https://medium.com/@er.rajatlakhina/designing-offline-first-architecture-with-swift-concurrency-and-core-data-sync-46ad5008c7b5) -- MEDIUM confidence. Sync Engine actor pattern for offline-first iOS apps.
- [Build Offline-First Apps with SwiftData and Background Tasks](https://commitstudiogs.medium.com/build-offline-first-apps-with-swiftdata-and-background-tasks-a29434b6f80c) -- MEDIUM confidence. SwiftData approach to offline queue sync.
- [D3.js Force-Directed Graph Implementation (2025)](https://dev.to/nigelsilonero/how-to-implement-a-d3js-force-directed-graph-in-2025-5cl1) -- MEDIUM confidence. Implementation guide for D3-force graphs.
- [d3-force API Documentation](https://d3js.org/d3-force) -- HIGH confidence. Official D3 force simulation API reference.
- [How Claude Code Became My Knowledge Management System](https://mattstockton.com/2025/09/19/how-claude-code-became-my-knowledge-management-system.html) -- MEDIUM confidence. Pattern reference for using CLAUDE.md as knowledge aggregation.
- [Context Engineering for Claude Code](https://thomaslandgraf.substack.com/p/context-engineering-for-claude-code) -- MEDIUM confidence. Strategies for enriching Claude Code sessions with project context.
- [How Claude remembers your project](https://code.claude.com/docs/en/memory) -- HIGH confidence. Official Claude Code memory documentation.
- [Dashboard Design Patterns](https://dashboarddesignpatterns.github.io/patterns.html) -- MEDIUM confidence. UX patterns for change highlighting and status indicators.
- [UX Strategies for Real-Time Dashboards (Smashing Magazine)](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/) -- MEDIUM confidence. Delta visualization and highlight patterns.
- [Tailscale iOS Documentation](https://tailscale.com/docs/install/ios) -- HIGH confidence. Official iOS setup and VPN-on-demand configuration.
- MC codebase analysis (schema.ts, project-scanner.ts, git-health.ts, convergence-detector.ts, enrichment.ts, MCP tools) -- HIGH confidence. Direct code review of existing v1.3 infrastructure.
- MC memory files (universal_capture_problem.md, cross_machine_knowledge.md) -- HIGH confidence. User's own articulation of problems and vision.

---
*Feature research for: v1.4 Cross-Project Intelligence + iOS Companion + Knowledge Unification*
*Researched: 2026-03-21*
