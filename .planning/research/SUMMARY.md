# Project Research Summary

**Project:** Mission Control v1.4 — Cross-Project Intelligence + iOS Companion + Knowledge Unification
**Domain:** Personal developer operating environment — dependency graph, knowledge aggregation, iOS companion app, dashboard enhancements
**Researched:** 2026-03-21
**Confidence:** HIGH

## Executive Summary

Mission Control v1.4 is a major capability expansion across four parallel pillars: cross-project dependency intelligence, iOS companion app for universal capture, CLAUDE.md knowledge aggregation, and a dashboard highlight mode. The core architectural insight from research is that all four pillars extend the existing Hono/SQLite/React/MCP platform without introducing new databases, runtimes, or transport protocols. Every new capability slots into established patterns: new health check types plug into `projectHealth`, new services extend the scan-persist-emit pipeline, new API routes register via factory functions in `app.ts`, and new MCP tools follow the thin-HTTP-wrapper pattern. The only new npm dependency in the server/dashboard surface is `d3-force` (~15-20KB), and the iOS companion lives in a sibling repo using 100% Apple frameworks.

The recommended build order flows from config foundations upward: extend `mc.config.json` with `dependsOn` and `conventions` schemas first, then build the CLAUDE.md knowledge service (which convention scanning depends on), then dependency impact detection and convention enforcement in parallel, then MCP tools and session enrichment as consumers, then the dashboard highlight mode as a standalone enhancement. The iOS companion is fully independent and can be built in parallel — it consumes only existing API endpoints with zero backend changes needed for basic functionality. The one server-side prerequisite for iOS is idempotency keys on the captures endpoint, which should be treated as a preparatory change in the first phase.

The top risks are all well-understood and preventable. iOS share sheet extensions have a 120MB memory ceiling that will silently crash if networking or heavy frameworks are initialized in the extension — the mitigation is to write only to a shared App Group container and let the host app handle all networking. The D3 force graph must use `useRef` with D3 owning the SVG container entirely rather than triggering React state updates on every simulation tick, or ghost nodes and memory leaks will make the graph unusable. SSH-based CLAUDE.md aggregation must run on a separate hourly timer with batched SSH commands, not inside the 5-minute scan cycle, or scan latency increases 5-10x.

## Key Findings

### Recommended Stack

The existing stack (Hono 4.6, better-sqlite3 + Drizzle ORM, React 19, Vite 6, Tailwind v4, Vercel AI SDK, Commander.js, Zod, Vitest) handles all v1.4 capabilities without modification. The single new server/dashboard dependency is `d3-force` v3.0.0 — ESM-native, ~15KB, 3 transitive dependencies, stable since 2021, used exclusively for physics simulation (not DOM manipulation). The iOS companion uses zero third-party Swift packages — 100% Apple frameworks.

**Core technologies:**
- `d3-force` v3.0.0 (web package): Force-directed graph layout — only library providing velocity Verlet integration, n-body forces, and collision detection at ~15KB; React owns the DOM, d3-force only computes x/y positions per tick
- `Swift 6.2 + SwiftUI` (iOS sibling repo): Native iOS companion — matches NexusClaw and Principal's Ear in the ecosystem; iOS 18 minimum deployment target for SwiftData maturity and SFSpeechRecognizer on-device recognition
- `SwiftData` (iOS): Offline capture queue — native SwiftUI integration via `@Model` macro, share extension support via App Groups, simpler than Core Data for a 3-4 entity model
- `SFSpeechRecognizer` (iOS, Speech framework): On-device voice transcription — zero dependencies, instant, 60-second limit aligns with "quick capture" use case; `#available(iOS 26, *)` upgrade path to SpeechAnalyzer reserved
- `node:crypto` SHA-256: Content-hash caching for CLAUDE.md — built-in, no additional dependency, fast enough for <10KB files
- `XcodeGen`: iOS project generation — consistent with NexusClaw and Principal's Ear; keeps `project.yml` as source of truth, avoids merge conflicts

**What NOT to add:** Full `d3` package (280KB+ vs 15KB for d3-force module), `d3-selection`/`d3-drag`/`d3-zoom` (DOM manipulation conflicts with React's virtual DOM), `react-force-graph` (adds its own renderer over a pattern MC already handles natively), `Alamofire` (URLSession + async/await is sufficient for simple JSON API calls), `mlx-audio-swift` (Principal's Ear territory; SFSpeechRecognizer is built-in and instant for sub-60s captures), `node-ssh` (execFile pattern is already proven in 4 places in project-scanner.ts).

### Expected Features

**Must have (P1 — v1.4 core):**
- Dependency definitions (`dependsOn: string[]` in `mc.config.json`) — foundation for all cross-project intelligence; manual declaration is 10 minutes of setup and 100% accurate across a polyglot multi-repo ecosystem
- CLAUDE.md aggregation with content-hash caching — foundation for all knowledge unification; extends existing scan loop with hourly timer
- Dashboard highlight mode ("changes since last visit") — immediate daily value answering the morning pattern "what happened while I was sleeping?"; server-side timestamp storage from day one
- Dependency drift health findings — first payoff from dependency definitions; fully reuses existing health engine (`projectHealth` table, `upsertHealthFinding` pipeline)
- Stale knowledge alerts — first payoff from CLAUDE.md aggregation; simple heuristic comparing CLAUDE.md age vs. commit activity
- iOS share sheet extension + offline queue — the universal capture breakthrough; "send and forget" from any app with offline-first Core Data queue
- MCP knowledge tools (3 tools: `project_knowledge`, `convention_check`, `cross_project_search`) — context injection for Claude Code sessions; thin-HTTP-wrapper pattern

**Should have (P2 — extended v1.4):**
- Convention registry with scan-time enforcement — add after CLAUDE.md aggregation proves useful and anti-patterns emerge from the data corpus
- Context injection into Claude Code startup banner — extend `/sessions/hook/start` response after MCP tools validate data quality
- iOS widget capture (3-tap flow) — WidgetKit + AppIntents after share sheet validates the offline queue pattern
- Native SwiftUI dashboard (project list + risks + captures) — after share sheet establishes the iOS app as worth opening
- Commit impact alerts — after dependency definitions accumulate enough real data across projects
- Continuous cross-machine reconciliation — after existing divergence detection proves insufficient

**Defer (P3 — v1.5+):**
- Voice capture with transcription — HIGH complexity (audio storage decisions, SpeechAnalyzer evaluation); defer until share sheet + widget prove the iOS capture pattern
- Relationship graph (D3-force) — impressive "wow" feature but not daily-use; build after dependency definitions prove useful and the graph has enough nodes/edges to be meaningful
- Pipeline awareness (`dataFlow` field) — genuinely hard to make useful without noise; reserved in config but not consumed
- Cross-project convention diffing — needs 6+ months of convention data across enough projects to surface meaningful inconsistencies
- Context-aware capture metadata (location, source app) — nice enrichment but not essential for the capture habit

**Hard anti-features (never build):**
- Auto-detected dependencies from import analysis — MC spans 4+ languages; a TypeScript project importing a Go CLI via execFile has no parseable dependency; manual declaration is correct
- iOS push notifications — pull-based by design; morning pattern is "open MC, see what's up," not "get pinged at 2am about an unpushed commit"
- iOS background sync — iOS constraints (30s BGAppRefreshTask, WiFi+charging required for BGProcessingTask) make complexity disproportionate to value for a single-user capture queue
- Runtime convention enforcement (tool call interception) — adds latency to every Claude Code tool call, fragile dependency on internal protocol, explicitly deferred in PROJECT.md
- CLAUDE.md auto-generation — auto-generated docs without human review create false confidence; surface "no CLAUDE.md" as a stale knowledge finding instead

### Architecture Approach

v1.4 extends the existing scan-persist-emit pipeline without replacement. The four new services (`knowledge-service.ts`, `convention-service.ts`, `dependency-service.ts`, `visit-service.ts`) each integrate into the post-scan health phase. The dependency graph is held in-memory as a derived structure from `mc.config.json` — never stored in SQLite, since it's 35 nodes and ~50 edges, changes only when config changes, and is needed in-memory for graph traversal. The iOS companion is a sibling repo at `~/mission-control-ios` calling the same `/api/*` endpoints — the API doesn't know the request comes from an iPhone. Zero changes to the capture pipeline, SSE streaming mechanism, FTS5 search, budget tracking, CLI package, discovery engine, or star intelligence system.

**Major components:**
1. **Knowledge Service** (`services/knowledge-service.ts`) — reads CLAUDE.md via filesystem (local) and batched SSH (Mac Mini), computes SHA-256 content hash, caches in `knowledge` table, runs on a separate hourly timer (never inside the 5-minute project scan)
2. **Convention Service** (`services/convention-service.ts`) — config-driven anti-pattern matching against CLAUDE.md content from knowledge cache; produces `convention_violation` health findings; `negativeContext` patterns required to prevent false positives
3. **Dependency Service** (`services/dependency-service.ts`) — builds in-memory adjacency list from `mc.config.json` at load time; detects impact chains during post-scan health phase; produces `dependency_impact` health findings with severity escalation ladder
4. **Visit Service** (`services/visit-service.ts`) — queries commits/captures/findings since a given ISO timestamp; supports `GET /api/changes-since`; server-side last-visit timestamp stored in SQLite (device-agnostic)
5. **iOS Companion** (`~/mission-control-ios`) — SwiftUI + SwiftData sibling repo; share extension writes to App Group container via UserDefaults only (no networking); host app syncs offline queue on foreground via URLSession
6. **D3-Force Graph** (`components/graph/dependency-graph.tsx`) — lazy-loaded with `React.lazy()` (d3-force not in main bundle); D3 owns SVG container via `useRef`; React provides the container div, D3 manages all SVG elements inside it; loaded on user interaction, not page load
7. **MCP Knowledge Tools** — three thin-HTTP-wrapper tools in `packages/mcp` following the established pattern of the existing 6 tools

**New SQLite tables:** `knowledge` (CLAUDE.md content + hash + parsed sections, one row per project). The `conventions` table is optional for v1.4 — convention rules read from config at runtime. Zero schema changes to existing tables — `projectHealth` already accepts any string `checkType`.

### Critical Pitfalls

1. **iOS share sheet crashes silently at 120MB** — the extension must do exactly three things: extract content, write to App Group container (UserDefaults with suite name, not Core Data), dismiss. Zero networking, zero heavy frameworks. Debug builds are 3-5x larger than Release; profile with Instruments Allocations in Release config on a physical device.

2. **D3-force fights React's render cycle causing ghost nodes and memory leaks** — D3 must own the SVG container via `useRef`; initialize simulation in `useEffect` with cleanup calling `simulation.stop()` and removing the SVG; never call `setState` on every simulation tick; `React.lazy()` code splits the D3 bundle so it doesn't inflate the initial dashboard load.

3. **SSH CLAUDE.md aggregation blocks the 5-minute scan cycle** — run knowledge aggregation on a separate hourly timer (CLAUDE.md files change at most weekly); batch all Mac Mini reads into a single SSH command that reads all files in one round-trip; content-hash caching means 99%+ of reads result in zero DB writes; graceful degradation if SSH fails (serve cached content, never show errors for stale knowledge).

4. **iOS captures duplicate on retry without idempotency** — iOS app generates a UUID per capture at creation time; sends as `Idempotency-Key` header; server adds `idempotencyKey` column to captures table with unique constraint and checks before insert. This is a server-side change that must ship before the iOS app; treat as a preparatory change in Phase 23.

5. **Tailscale VPN disconnects silently, breaking iOS connectivity** — offline-first architecture is mandatory from day one, not retroactive; capture writes to Core Data immediately and never requires network confirmation; use `NWPathMonitor` to detect reachability before sync attempts; sync indicator in UI (green/yellow/red dot, never a blocking error modal).

**Additional watch items:**
- "Changes since last visit" must use server-side timestamp storage from day one — retrofitting after shipping localStorage-only is a rewrite, and the multi-device inconsistency (browser + iOS app) is immediate
- Convention regex false positives are inevitable without `negativeContext` patterns in the schema — start with 5 high-confidence rules only, run all rules against all 35+ existing CLAUDE.md files to verify zero false positives before shipping
- Circular `dependsOn` declarations will infinite-loop health check traversal — validate with topological sort at config load time, use visited set in all traversal code

## Implications for Roadmap

The phase structure is dictated by a clear dependency chain: config schema extensions → knowledge aggregation (knowledge is the foundation for convention checking) → convention and dependency services in parallel → MCP tools and session enrichment as consumers → dashboard highlight mode → iOS companion. The iOS track is fully independent and runs in parallel throughout.

### Phase 23: Config Foundation

**Rationale:** All three server-side pillars read from config schema extensions. Pure Zod schema additions are zero-risk and backward-compatible. Cycle detection must be added here before any traversal code is written.
**Delivers:** `dependsOn: string[]` field on `projectEntrySchema` and `multiCopyEntrySchema`; `conventions` config section with anti-pattern schema including `negativeContext` field; `knowledge` config section with aggregation settings; three new `healthCheckTypeEnum` values (`dependency_impact`, `convention_violation`, `stale_knowledge`); cycle detection (topological sort) at config load time; idempotency key preparatory change on captures endpoint
**Addresses:** Foundation for all cross-project intelligence and knowledge unification
**Avoids:** Circular dependency infinite loops (cycle detection ships in this phase, before any traversal code)
**Research flag:** Not needed — pure Zod schema additions and a small SQLite column addition

### Phase 24: Knowledge Service + CLAUDE.md Aggregation

**Rationale:** Convention scanning reads CLAUDE.md content from the knowledge cache — knowledge must exist before convention checking can be built. This is also the first tangible payoff: MC knowing what all 35+ projects say about themselves.
**Delivers:** `knowledge` SQLite table + Drizzle schema + migration; `knowledge-service.ts` with content-hash caching (SHA-256, skip unchanged files); batched SSH reads for Mac Mini projects (single SSH command, one round-trip); separate hourly scan timer (never blocks the 5-minute project scan); `GET /api/knowledge/:slug` and `GET /api/knowledge/search` routes; `stale_knowledge` health findings (info severity)
**Uses:** `node:crypto` SHA-256 (built-in), existing SSH execFile pattern from discovery-scanner.ts, existing FTS5 infrastructure
**Avoids:** SSH latency blocking the scan cycle (separate timer); cache staleness (git commit hash freshness check preferred over mtime)
**Research flag:** Not needed — SSH batching and content-hash caching are established patterns already used in MC

### Phase 25: Dependency Service + Impact Detection

**Rationale:** Independent of knowledge/conventions; uses the scan cycle hook point established in Phase 24. Can run in parallel with Phase 26 after Phase 24 completes. Delivers the first concrete payoff from the `dependsOn` config field.
**Delivers:** `dependency-service.ts` with in-memory adjacency list (derived from config at load time, never stored in SQLite); `dependency_impact` health findings with severity escalation (info first, warn only if downstream project also modified); `GET /api/dependencies` and `GET /api/dependencies/:slug/impact` routes; cap at 2 dependency findings per project in the risk feed
**Implements:** Config-derived in-memory graph pattern; cycle-safe traversal with visited set
**Avoids:** Alert fatigue from stale config (severity escalation ladder, cap on findings per project, info-level for dormant dependencies)
**Research flag:** Not needed — graph derivation and health check integration follow established patterns

### Phase 26: Convention Service + Enforcement

**Rationale:** Depends on Phase 24 (reads CLAUDE.md from knowledge cache). Can run in parallel with Phase 25. Convention violations are info/warning level and never blocking — safe to ship incrementally. Must launch with a validation suite run against all 35+ existing CLAUDE.md files.
**Delivers:** `convention-service.ts` with config-driven pattern matching and `negativeContext` support; `convention_violation` health findings (start all rules at `info` severity); `GET /api/conventions` and `GET /api/conventions/violations` routes; dry-run endpoint (`POST /api/conventions/check`) for testing rules; 5 curated launch rules validated against full CLAUDE.md corpus; `conventionOverrides` per-project escape hatch in config
**Avoids:** Regex false positives (`negativeContext` patterns required in schema from day one); convention schema maintenance burden (validate rules at startup, start with 5 rules only)
**Research flag:** Not needed — pattern matching is straightforward; the validation suite run is the primary risk mitigation

### Phase 27: MCP Knowledge Tools + Session Enrichment

**Rationale:** Pure consumer of Phase 24-26 APIs. Three new MCP tools are mechanical once the API endpoints exist. Session hook enrichment extends an existing response payload — no new endpoint needed.
**Delivers:** `project_knowledge` MCP tool; `convention_check` MCP tool; `cross_project_search` MCP tool; enhanced `/sessions/hook/start` response with `knowledgeContext` field (CLAUDE.md excerpt truncated to 2KB + active violations + dependency status); new SSE event types (`knowledge:updated`, `convention:violation`, `dependency:impact`)
**Implements:** Thin-HTTP-wrapper MCP pattern (identical to existing 6 MCP tools); session hook response enrichment pattern (same as `budgetContext` addition)
**Research flag:** Not needed — the pattern has 6 existing working examples in the codebase

### Phase 28: Dashboard Highlight Mode

**Rationale:** Fully independent of all other pillars — no cross-dependencies. Placing it after server-side work ensures the "last visit" timestamp is server-side from the start, which is the architecturally correct design.
**Delivers:** `visit-service.ts`; `GET /api/changes-since?since=<ISO>` route; `GET/POST /api/user/last-visit` server-side timestamp storage; last-visit strip component (localStorage as cache, server as source of truth, device-agnostic); activity delta badges on changed project cards (commits, captures, health changes); CSS highlight fade animation (3s, terracotta accent, no JS animation library)
**Avoids:** Multi-device inconsistency (server-side storage handles both browser and future iOS app updating the same timestamp); persistent unread markers (fading highlights inform without creating obligation)
**Research flag:** Not needed — standard UX pattern with straightforward implementation

### Phase 29: iOS Companion App — Core

**Rationale:** Fully independent of all server-side phases — consumes only existing API endpoints. Can start at any point after Phase 23 (which adds idempotency keys to the captures endpoint). The share sheet is the highest-value iOS feature and must be built first.
**Delivers:** New sibling repo at `~/mission-control-ios`; XcodeGen project setup (`project.yml`, iOS 18 target, Swift 6.2 strict concurrency); SwiftData offline capture queue (`CaptureQueueItem` entity with `id`, `rawContent`, `type`, `syncStatus`, `retryCount`); `MissionControlAPI.swift` URLSession client; `SyncManager.swift` foreground flush (FIFO serial, exponential backoff, max 3 retries, idempotency key); iOS share sheet extension with App Group container (UserDefaults only — no Core Data, no networking in extension); `NWPathMonitor` connectivity guard; sync status indicator in UI
**Avoids:** Share sheet memory crash (write-only to UserDefaults in extension, zero networking); offline data loss (Core Data queue writes before any network attempt); duplicate captures (idempotency keys, set up in Phase 23)
**Research flag:** The SwiftData + App Groups + share extension combination has documented device-specific quirks. `ModelContainer` in extensions must be created manually (not via `.modelContainer` SwiftUI modifier). Research this initialization pattern before implementation and plan a physical device testing checkpoint as a phase gate.

### Phase 30: iOS Extended — Widget + Voice Capture

**Rationale:** Defer until Phase 29 proves the offline queue reliable and the share sheet establishes the iOS app as worth opening. Widget and voice capture add complexity but not core value.
**Delivers:** WidgetKit + AppIntents quick-capture widget (medium-size, tap to open app to capture view with keyboard ready — no text input directly in widget); SFSpeechRecognizer voice capture with 60-second countdown timer, audio storage as `.m4a` alongside transcription, `audioUrl` field on captures schema; graceful degradation for microphone/speech permission denial
**Avoids:** Widget 3-second execution budget exceeded (write to App Group only, no network calls from widget); silent 60-second transcription truncation (visible countdown timer, auto-stop at 60s with saved partial)
**Research flag:** AppIntents execution budget on device (not simulator) should be validated before committing to the widget architecture. SpeechAnalyzer availability (iOS 26 beta as of March 2026) should be re-evaluated at phase planning time.

### Phase 31: Relationship Graph (D3-Force)

**Rationale:** A "wow" feature that requires enough `dependsOn` declarations to make the graph visually meaningful. Build after Phase 25 has accumulated real dependency data across the 35-project corpus. Implementation pattern is thoroughly documented and low-risk.
**Delivers:** `components/graph/dependency-graph.tsx` lazy-loaded with `React.lazy()`; `d3-force` npm install; force-directed SVG graph with hover details and click-to-navigate; node coloring by host (local/mac-mini) and health status; edge coloring for cycles (amber); accessible behind user interaction (modal or expandable panel, not on page load)
**Avoids:** React/D3 lifecycle conflict (D3 owns SVG via `useRef`, React provides container div only); bundle inflation (`React.lazy` code splits d3-force out of main bundle, verified with `vite-bundle-visualizer`)
**Research flag:** Not needed — the useRef/useEffect/d3-force ownership pattern is thoroughly documented across multiple sources.

### Phase Ordering Rationale

- **Config first** because schema additions are zero-risk and every downstream pillar reads from config extensions; cycle detection ships here before any traversal code exists
- **Knowledge second** because convention scanning reads the knowledge cache; establishing aggregation first prevents coupling and avoids a sequential dependency mid-implementation
- **Conventions and dependencies in parallel (Phases 25-26)** because they share only the scan cycle hook point established in Phase 24; neither depends on the other
- **MCP tools after Phase 24-26** because they are pure consumers; all three tools are mechanical to implement once the API endpoints exist
- **Dashboard highlight mode after server phases** to ensure server-side timestamp storage is the design from the start — retrofitting is a rewrite
- **iOS as a parallel track** because it requires zero server-side changes for core functionality; the only prerequisite is idempotency keys (Phase 23 preparatory change)
- **Graph deferred to Phase 31** because it needs enough `dependsOn` data to be meaningful, and implementation risk is low (well-documented pattern)

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 29 (iOS Share Extension):** The SwiftData + App Groups + share extension combination has documented device-specific quirks. The `ModelContainer` must be created manually (not via the `.modelContainer` SwiftUI modifier) in extensions. Research this specific initialization pattern before implementation starts, and plan a physical device testing checkpoint as a phase gate.
- **Phase 30 (Widget + Voice):** AppIntents execution budget on-device (not simulator) and SpeechAnalyzer availability timeline (iOS 26 beta as of March 2026) should be validated at phase planning time before committing to architecture decisions.

Phases with standard patterns (skip research-phase):
- **Phase 23 (Config Foundation):** Pure Zod schema extensions following existing patterns. Mechanical.
- **Phase 24 (Knowledge Service):** SSH batching and content-hash caching are established patterns already used in MC's discovery-scanner.ts.
- **Phase 25 (Dependency Service):** Health check integration follows the established `upsertHealthFinding` pipeline with 7 existing check types.
- **Phase 26 (Convention Service):** Config-driven string matching is straightforward; the validation suite run (not research) is the primary risk mitigation.
- **Phase 27 (MCP Tools):** Thin-HTTP-wrapper pattern has 6 working examples in the codebase. Mechanical.
- **Phase 28 (Dashboard Highlight):** Standard UX pattern, one new API endpoint, CSS animation.
- **Phase 31 (D3 Graph):** Integration pattern is thoroughly documented; no architectural surprises expected.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Minimal new dependencies — d3-force is the only addition for server/dashboard surface, and it's stable (unchanged since 2021). iOS choices match existing ecosystem (NexusClaw, Principal's Ear) with zero third-party Swift packages. |
| Features | HIGH | Four pillars are independent with clear value propositions and well-reasoned anti-features. Feature research includes direct codebase analysis of v1.3 (41K LOC, 610+ tests) and user's own problem articulation from memory files. |
| Architecture | HIGH | Based on direct codebase analysis of v1.3. Integration strategy extends verified patterns. The "extend, do not replace" principle is conservative and appropriate for a production system with 610+ tests. |
| Pitfalls | HIGH | Pitfalls are grounded in specific documented failure modes with concrete prevention strategies. iOS memory limits, D3/React lifecycle conflicts, and SSH latency bottlenecks all have well-understood solutions from the broader ecosystem. |

**Overall confidence:** HIGH

### Gaps to Address

- **Idempotency keys must be a preparatory change in Phase 23, not deferred to Phase 29.** The iOS app cannot safely ship without server-side idempotency — adding the `idempotencyKey` column to captures after iOS is live requires a coordinated deployment. Treat it as a zero-risk preparatory schema addition alongside the other config changes.

- **SwiftData in share extensions requires physical device validation.** Research confirms the App Group + manual `ModelContainer` pattern works, but notes "device testing is essential." Plan a dedicated physical device testing checkpoint before Phase 29 is considered complete. Simulator does not replicate share extension memory or VPN behavior.

- **Last-visit multi-client UX decision.** The architecture supports server-side timestamp storage (device-agnostic), but the UX decision — "seen anywhere = seen everywhere" vs. per-client timestamps — should be made during Phase 28 planning, not during implementation. This affects the API design (`POST /api/user/last-visit` with or without `source` parameter).

- **Convention rule validation suite.** Before shipping Phase 26, every anti-pattern rule must be run against all 35+ existing CLAUDE.md files to verify zero false positives. This is a non-trivial testing step (not just unit tests) that should be part of the Phase 26 plan's definition of done.

- **SpeechAnalyzer timeline.** As of March 2026, iOS 26 is in beta. SpeechAnalyzer (no 60-second limit, better accuracy) is the correct long-term solution for voice capture. At Phase 30 planning time, assess iOS 26 stable release timeline and decide whether to build SFSpeechRecognizer (safe now) vs. wait for SpeechAnalyzer (better quality, later ship date).

## Sources

### Primary (HIGH confidence)
- Existing MC codebase (v1.3): `config.ts`, `git-health.ts`, `project-scanner.ts`, `event-bus.ts`, `sessions.ts`, `app.ts`, `schema.ts`, `captures.ts`, MCP package — direct code analysis of 41K LOC / 610+ tests
- MC memory files: `universal_capture_problem.md`, `cross_machine_knowledge.md`, `project_v13_design_decisions.md` — user's own problem articulation and design decisions
- Apple official docs: SFSpeechRecognizer, WidgetKit, SwiftData, App Extensions, NSItemProvider — authoritative on iOS constraints
- d3-force repository and API documentation — stable, well-documented, unchanged since 2021
- iOS Share Extension with SwiftUI and SwiftData (merrell.dev) — App Group + shared ModelContainer pattern

### Secondary (MEDIUM confidence)
- React + D3 force graph integration patterns — multiple sources agree on useRef ownership model to avoid ghost nodes and memory leaks
- Offline-first iOS architecture references — consensus on foreground sync, consensus on background sync complexity vs. value tradeoff
- iOS widget interactivity patterns — consensus on 3-second execution budget, AppIntents as correct API
- SpeechAnalyzer WWDC25 session — Apple's official introduction of next-gen speech API; iOS 26 timeline uncertain
- OpenAPI generation toolchain (`swift-openapi-generator`, `openapi-zod-client`) — documented but adds toolchain complexity; minimum viable approach is JSON Schema manual validation with explicit `CodingKeys`

### Tertiary (informed by research, not directly validated)
- Convention regex false positive rate in practice — estimated based on markdown variability across freeform CLAUDE.md files; actual rate will only be known after running against the 35-project corpus
- SpeechAnalyzer stability on iOS 26 beta — WWDC session reviewed; real-world reliability on non-beta iOS 26 devices is unknown until stable release

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
