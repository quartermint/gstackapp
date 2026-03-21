# Domain Pitfalls

**Domain:** Cross-project intelligence, iOS companion app, knowledge unification, dashboard enhancements for existing Hono/SQLite/React personal operating environment
**Researched:** 2026-03-21
**Context:** Adding iOS capture, D3 dependency graphs, SSH-based CLAUDE.md aggregation, convention enforcement, dependency chain tracking, and "changes since last visit" to existing MC (41K LOC, 610+ tests, Drizzle ORM + SQLite, Hono API, React 19 dashboard)

## Critical Pitfalls

Mistakes that cause rewrites, broken user experience, or fundamentally undermine the feature's value.

### Pitfall 1: iOS Share Sheet Extension Exceeds Memory Limits and Crashes Silently

**What goes wrong:** The share sheet extension loads SwiftUI views, initializes Core Data stack, and attempts network connectivity check to the Hono API -- all within a 120MB memory ceiling. On iOS 17+, the system eagerly loads website metadata for shared URLs (images, CSS, JavaScript), consuming 80-100MB before the extension code even runs. The extension gets jettisoned by the OS with no user-visible error -- the share sheet simply disappears. Users think the feature is broken.

**Why it happens:** Share extensions run in a separate process with strict memory limits enforced by the OS. Unlike the host app, there is no "low memory warning" -- the system kills the extension immediately when the limit is exceeded. SwiftUI view initialization, Core Data stack setup, and any imported framework all count toward this budget. Debug builds are significantly larger than release builds, making the issue invisible during development and surfacing only on TestFlight or production.

**Consequences:** Captures are lost silently. User learns not to trust the share sheet. The entire iOS capture value proposition collapses because the share sheet is the primary capture entry point.

**Prevention:**
- **Keep the share extension minimal.** The extension should do exactly three things: (1) extract the shared content (text, URL, image reference), (2) write it to the shared App Group container (UserDefaults or a shared Core Data store), (3) dismiss. Zero networking in the extension itself.
- **Never initialize the full Core Data stack in the extension.** Use `UserDefaults(suiteName: "group.com.quartermint.mission-control")` for the offline queue. Core Data is for the host app only.
- **Defer API calls to the host app.** The extension writes to the shared container; the host app's foreground sync flushes the queue to the Hono API. This keeps the extension under 20MB.
- **Test memory usage in Release configuration.** Debug builds with SwiftUI can use 3-5x more memory than Release. Profile with Instruments Allocations on a physical device, not Simulator.
- **Do not load UIImage objects in the extension.** If sharing images, pass the file URL (not the loaded image) to the shared container. Loading a 12MP photo as UIImage consumes 48MB instantly.
- **Avoid importing heavy frameworks.** Each imported framework (Combine, SwiftData, network libraries) adds to the memory footprint. The extension target should have a minimal dependency graph.

**Detection:** Share sheet extension crashes appear in Xcode Organizer under "Memory" crashes, not regular crash logs. Users report "share sheet flashes and disappears." Extension process exceeds 120MB in Instruments Allocations.

**Phase warning:** iOS share sheet phase. Must be addressed in architecture, not fixable retroactively.

### Pitfall 2: D3-Force Simulation Fights React's Render Cycle, Causing Ghost Nodes and Memory Leaks

**What goes wrong:** D3's force simulation mutates node/link data objects in-place (adding `x`, `y`, `vx`, `vy` properties). React expects immutable state updates to trigger re-renders. Three failure modes emerge: (1) Ghost nodes -- React re-renders and appends duplicate SVG elements because the cleanup from the previous render was incomplete. (2) Memory leaks -- the force simulation's `tick` callback holds a reference to stale DOM elements after React unmounts the component. (3) Infinite re-render loop -- calling `setNodes(...)` on every simulation tick triggers a React render, which reinitializes the simulation, which triggers more ticks.

**Why it happens:** D3 and React both want to own the DOM. D3 uses direct DOM manipulation via `d3.select().append()`. React uses a virtual DOM and diffing. When both mutate the same SVG container, they get out of sync. The force simulation runs ~300 ticks at 60fps -- calling React setState 300 times per second is catastrophic.

**Consequences:** The relationship graph is unusable -- nodes multiply, the browser tab freezes, or the graph flickers. Memory usage climbs until the tab crashes. The feature ships but is immediately disabled because it degrades the dashboard.

**Prevention:**
- **Let D3 own the SVG container entirely via useRef.** Create a `<div ref={containerRef} />` in React. D3 creates and manages all SVG elements inside that ref. React never renders SVG children -- it only provides the container.
- **Initialize the simulation in useEffect with proper cleanup.** The effect creates the simulation; the cleanup function calls `simulation.stop()` and removes the SVG. This prevents ghost nodes and memory leaks.
```typescript
useEffect(() => {
  if (!containerRef.current || !nodes.length) return;
  const svg = d3.select(containerRef.current).append("svg");
  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id))
    .force("charge", d3.forceManyBody().strength(-100))
    .force("center", d3.forceCenter(width / 2, height / 2));
  simulation.on("tick", () => {
    // Update SVG positions directly -- do NOT call setState
    svg.selectAll("circle").attr("cx", d => d.x).attr("cy", d => d.y);
    svg.selectAll("line").attr("x1", d => d.source.x)/* ... */;
  });
  return () => { simulation.stop(); svg.remove(); };
}, [nodes, links]);
```
- **Never spread D3-mutated objects into React state.** The `[...nodes]` spread on every tick forces React to re-render 300 times per second. D3 handles all DOM updates inside the tick callback.
- **Import `d3-force` and `d3-selection` only -- not the full `d3` package.** The full D3 package is 280KB+ minified. `d3-force` is ~17KB, `d3-selection` is ~10KB. Import specific modules: `import { forceSimulation, forceLink, forceManyBody, forceCenter } from "d3-force"`.
- **Gate the graph behind user interaction.** Don't render the force graph on page load. Show it in a modal or expandable panel that the user explicitly opens. This avoids simulation overhead on the main dashboard.
- **Limit node count.** With 35 projects, the graph is manageable. But if dependency chains create 100+ nodes (projects + their dependencies), the simulation becomes sluggish. Cap visible nodes at 50 with a "show all" option.

**Detection:** Dashboard memory usage climbs over time when graph panel is open. SVG element count in DOM inspector increases on each React re-render. `forceSimulation` tick callback fires after component unmount (check console for "Can't perform a React state update on an unmounted component" warning -- though this was removed in React 18+, the underlying leak still exists).

**Phase warning:** Cross-project intelligence graph phase. Architecture decision must be made before implementation starts.

### Pitfall 3: SSH-Based CLAUDE.md Aggregation Creates a Latency Bottleneck That Blocks the Scan Cycle

**What goes wrong:** v1.4 needs to read CLAUDE.md files from 35+ projects across two machines (MacBook local + Mac Mini via SSH). Reading 20+ files over SSH takes 3-8 seconds per file (connection setup + `cat` + response). If aggregation runs inside the existing 5-minute scan cycle, it adds 60-160 seconds to each cycle. During this time, project health data goes stale, the dashboard freezes on "Scanning...", and SSE events stop flowing.

**Why it happens:** The existing scan cycle already takes 15-30 seconds for 35 projects (git commands are fast). CLAUDE.md aggregation adds file reads that are I/O-bound, not CPU-bound. SSH connection multiplexing helps (reusing a single connection), but each `cat /path/to/CLAUDE.md` still round-trips through the SSH channel. Serial execution of 20 SSH reads is the bottleneck.

**Consequences:** The dashboard feels broken every 5 minutes. Health findings arrive late. The scan cycle, which is the heartbeat of MC, becomes unreliable. Users lose trust in the "smarter in 3 seconds" promise.

**Prevention:**
- **Content-hash caching with TTL.** Hash each CLAUDE.md's content (SHA-256). Store `{ path, host, contentHash, content, lastCheckedAt }` in SQLite. Only re-read the file if (a) the content hash differs from cached, or (b) TTL has expired (e.g., 1 hour). First check: compare file mtime via `stat` (single fast SSH command) before reading the full file.
- **Batch SSH commands.** Instead of 20 separate `ssh cat /path` calls, send a single SSH command that reads all files: `ssh ryans-mac-mini 'for f in ~/*/CLAUDE.md; do echo "---FILE:$f---"; cat "$f" 2>/dev/null; done'`. One SSH connection, one round-trip, all files.
- **Run aggregation on a separate timer (30-minute or hourly).** CLAUDE.md files change rarely -- only during active development sessions. Hourly aggregation is more than sufficient. Never block the 5-minute project scan.
- **Parallel local reads.** Local CLAUDE.md files can be read in parallel with `Promise.all()`. Only SSH reads need serialization (or batching).
- **Graceful degradation.** If SSH fails, serve cached content with a "last updated X minutes ago" indicator. Never show errors for stale knowledge data -- it's supplementary, not critical.

**Detection:** Scan cycle duration exceeds 60 seconds (normal is 15-30s). `lastScannedAt` timestamps on projects are more than 10 minutes old. SSH timeout errors in API logs during scan cycle.

**Phase warning:** Knowledge unification phase. Must be implemented as a separate background service, not bolted onto the scanner.

### Pitfall 4: iOS App Behind Tailscale Has No Connectivity When VPN Is Disconnected

**What goes wrong:** The iOS companion app calls the Hono API at `100.123.8.125:3000` (Mac Mini's Tailscale IP). When Tailscale VPN is disconnected on the iPhone -- which happens frequently (battery optimization disconnects it, another VPN takes priority, user toggles it off) -- every API call fails. The app shows a blank screen or error state. Captures typed into the app are lost because the queue-flush mechanism assumed network availability.

**Why it happens:** Tailscale on iOS is a VPN configuration, and iOS only allows one active VPN at a time. If the user uses another VPN (corporate, travel), Tailscale is disconnected. iOS also aggressively disconnects VPNs for battery conservation. Unlike the browser dashboard (which is only accessed when actively on Tailscale), the iOS app may be opened at any time -- on cellular, on public WiFi, off-VPN.

**Consequences:** The capture experience is unreliable. Users learn that the app "only works sometimes" and stop using it. Captures are lost. The iOS app becomes shelfware.

**Prevention:**
- **Offline-first architecture is mandatory, not optional.** Every screen must render from local data (Core Data). Network calls enrich the local state but are never required for basic functionality.
- **Capture queue persists to Core Data immediately.** When the user captures text/voice/link, it writes to local Core Data first, then attempts API sync. Sync failure is invisible to the user -- the capture appears in the local list immediately.
- **Network reachability check before sync attempts.** Use `NWPathMonitor` to detect Tailscale connectivity. Don't attempt API calls when the path to `100.123.8.125` is unreachable -- it creates unnecessary timeouts and battery drain.
- **VPN On Demand rules.** Tailscale supports VPN On Demand configuration on iOS. Document the setup: Settings > VPN > Tailscale > On Demand > Enable "Connect On Demand" for Wi-Fi networks. This auto-connects Tailscale when the phone is on a trusted network.
- **Sync indicator in the UI.** Show a subtle badge: green dot = connected + synced, yellow = offline (will sync later), red = sync failed (needs attention). Never show a blocking error modal.
- **Foreground sync on app launch.** When the app becomes active, check connectivity and flush the queue. Don't rely on background sync (deferred to post-v1.4).

**Detection:** API calls timeout after 10 seconds with no response. `NWPathMonitor` reports `.unsatisfied` for the Tailscale interface. Capture queue grows but never flushes.

**Phase warning:** iOS foundation phase. Offline-first must be the default architecture from day one. Adding it retroactively requires rewriting every screen.

### Pitfall 5: Manual Type Sync Between Zod Schemas and Swift Codable Creates Persistent Drift

**What goes wrong:** MC's API uses Zod schemas in `packages/shared` to define request/response shapes. The iOS app needs matching Swift `Codable` structs. There's no Hono RPC equivalent for Swift -- no generated types, no compile-time contract. The developer manually writes Swift structs that mirror the Zod schemas. Over time, the API evolves (new fields, renamed properties, changed enums), but the Swift structs don't get updated. The iOS app silently drops new fields, fails to parse changed types, or sends malformed requests.

**Why it happens:** Hono RPC (`hc<AppType>`) gives the React dashboard end-to-end type safety. The MCP package and CLI use plain `fetch()` but live in the same monorepo -- TypeScript catches mismatches at build time. The iOS app lives in a separate repo (`~/mission-control-ios`), uses a different language (Swift), and has no shared build step with the TypeScript monorepo. There is no automated bridge.

**Consequences:** iOS app crashes when parsing API responses that have been updated. Captures created from iOS are missing fields the API now requires. The iOS app works on first release, then gradually breaks as the API evolves across v1.5, v1.6, etc.

**Prevention:**
- **Generate an OpenAPI spec from the Hono routes.** Use `@hono/zod-openapi` (or a post-build script that extracts Zod schemas to JSON Schema to OpenAPI). This creates a machine-readable API contract.
- **Generate Swift types from OpenAPI.** Use `swift-openapi-generator` (Apple's official tool) or `CreateAPI` to generate Swift `Codable` structs from the OpenAPI spec. Run this as a build step in the iOS project.
- **If generation is too heavy for v1.4, use a shared JSON Schema file.** Export Zod schemas to JSON Schema (`zod-to-json-schema` package). The iOS developer validates Swift structs against the JSON Schema manually but at least has a single source of truth.
- **Minimum viable approach: a test that compares.** Write a TypeScript test that serializes a sample API response to JSON and a Swift test that deserializes the same JSON. If either fails, the schemas are out of sync. Run both in CI.
- **Version the API.** Prefix routes with `/api/v1/`. When breaking changes are needed, create `/api/v2/` and give the iOS app time to migrate. Never change existing field types without a version bump.
- **Use `CodingKeys` with explicit mappings.** Swift's `CodingKeys` enum should explicitly map every JSON key, not rely on automatic synthesis. This makes field renames visible as compile errors.

**Detection:** iOS app shows "decoding error" or blank screens after API deployment. Swift `JSONDecoder` throws `DecodingError.keyNotFound` or `DecodingError.typeMismatch`. API response includes fields the Swift struct doesn't declare (they're silently dropped).

**Phase warning:** iOS foundation phase AND every subsequent API change. This is an ongoing maintenance burden, not a one-time fix.

## Moderate Pitfalls

### Pitfall 6: Dependency Chain Tracking Generates Alert Fatigue from Stale Config

**What goes wrong:** v1.4 introduces a `dependsOn` field in `mc.config.json` that declares project relationships (e.g., `mission-control` depends on `nexusclaw`). Health checks monitor these chains for drift: "nexusclaw has unpushed commits and mission-control depends on it." But dependencies are manually declared and rarely updated. When a dependency is removed or a project is archived, the config still references it. The system generates findings like "mission-control depends on qm0dev, but qm0dev has no recent activity" -- for a project that was archived months ago. Users start ignoring all dependency alerts.

**Why it happens:** Config-driven dependency tracking requires humans to maintain the config. Humans forget. The dependency graph grows stale faster than the code itself. Unlike npm's `package.json` (which is enforced by the build), MC's `dependsOn` is advisory -- nothing breaks when it's wrong.

**Consequences:** Alert fatigue. The dependency health findings become noise, polluting the risk feed alongside real issues (unpushed commits, diverged copies). Users stop reading the risk feed entirely.

**Prevention:**
- **Validate dependencies at scan time.** If a `dependsOn` target slug doesn't exist in `mc.config.json` projects, emit a "stale_dependency" warning finding -- but at `info` severity, not `warning`. Stale config is a hygiene issue, not a risk.
- **Auto-infer dependencies where possible.** Parse `package.json` for npm workspace references. Parse `go.mod` for Go module paths. Parse `Podfile`/`Package.swift` for iOS dependencies. Auto-inferred dependencies supplement (not replace) manual config.
- **Severity escalation ladder.** First alert: `info` ("nexusclaw has unpushed commits, mission-control may be affected"). Only escalate to `warning` if the downstream project has also been modified since the dependency drifted. Don't cry wolf for dormant projects.
- **Dependency freshness score.** Show how recently the `dependsOn` config was last validated (by the user clicking "still accurate" in the dashboard). Stale dependencies (not validated in 30+ days) are visually dimmed, not alerted.
- **Cap dependency alerts per project.** Maximum 2 dependency-related findings per project in the risk feed. Consolidate multiples into "3 dependencies need attention" with drill-down.

**Detection:** More than 5 `dependency_impact` findings in the risk feed at once. User never clicks on dependency findings. `dependsOn` entries reference slugs not in the projects table.

**Phase warning:** Cross-project intelligence phase. The dependency schema and alert logic must be designed together.

### Pitfall 7: "Changes Since Last Visit" Feature Breaks Across Devices and Browsers

**What goes wrong:** The "changes since last visit" feature stores the timestamp of the user's last dashboard visit in `localStorage`. When the user opens MC on their iPhone (iOS app) after using it on their MacBook (browser), the iPhone shows no changes (fresh localStorage) while the MacBook shows everything as "changed" (stale timestamp). The feature is correct on one device and wrong on every other. Clearing browser data also resets the timestamp, causing everything to show as "new."

**Why it happens:** `localStorage` is scoped to a single browser on a single device. There's no built-in sync mechanism. MC is a single-user system, so there's only one user, but they access the dashboard from multiple entry points: MacBook browser, iPhone app, possibly a different browser.

**Consequences:** The feature is confusing rather than helpful. Users see "23 changes" when they already reviewed everything on another device. Or they see "0 changes" when things actually changed. The highlight mode becomes untrusted and unused.

**Prevention:**
- **Server-side last-visit tracking.** Store the last-visit timestamp in SQLite: `{ userId: 'default', lastVisitAt: ISO_timestamp }`. Update it when the SSE connection is established (which means the dashboard is actively open). This makes it device-agnostic.
- **API endpoint for last visit.** `GET /api/user/last-visit` returns the timestamp. `POST /api/user/last-visit` updates it. The dashboard calls POST when the page loads (after rendering the "changes" view).
- **"Since when?" selector.** Instead of only "since last visit," offer quick options: "last hour," "last 4 hours," "today," "last visit." This gives the user control and avoids the multi-device problem entirely for users who prefer explicit time ranges.
- **Debounce the update.** Don't update `lastVisitAt` immediately on page load. Wait 5 seconds (user must actually look at the dashboard). This prevents the timestamp from advancing when the page loads briefly and the user navigates away.
- **localStorage as cache, server as source of truth.** Use localStorage to avoid an API round-trip on first render. But always reconcile with the server value and prefer the server timestamp if it's more recent.

**Detection:** `lastVisitAt` in localStorage differs from server value by more than 1 minute. User reports seeing "changes" that were already reviewed.

**Phase warning:** Dashboard enhancement phase. Decide server-side vs. client-side storage before implementation. Retrofitting server-side storage after shipping client-only is a rewrite.

### Pitfall 8: Convention Enforcement Regex Produces False Positives on Valid CLAUDE.md Content

**What goes wrong:** The convention registry defines anti-patterns as regex rules scanned against CLAUDE.md files. Example rule: "CLAUDE.md must not reference deprecated models (Qwen3-8B, Gemini 2.0)." The regex `/Qwen3-8B/` matches a CLAUDE.md that says "Deprecated: Qwen3-8B -- replaced by Qwen3.5-35B" -- which is the correct deprecation notice, not a violation. Similarly, a rule "must include Testing section" implemented as `/## Testing/` fails on `### Testing & Quality` (different heading level) or `## Tests` (synonym). Every false positive erodes trust in the convention system.

**Why it happens:** Regex is context-blind. It can find text patterns but cannot understand meaning. "Mentions Qwen3-8B" is not the same as "uses Qwen3-8B." CLAUDE.md files are freeform markdown with no enforced structure -- heading levels, section names, and content organization vary across 35+ projects.

**Consequences:** Projects flagged with `convention_violation` findings that are actually compliant. The user investigates, finds the violation is bogus, and stops trusting convention alerts. The feature becomes another source of noise in the risk feed.

**Prevention:**
- **Context-aware pattern matching, not bare regex.** Each anti-pattern rule needs a `pattern` (what to find) AND a `negativeContext` (what makes it a false positive). Example: `{ pattern: "Qwen3-8B", negativeContext: "Deprecated|replaced by|do not use|NEVER USE", severity: "warning" }`. If the match line also matches `negativeContext`, suppress the finding.
- **Section-aware scanning.** Parse CLAUDE.md into sections (split on `## ` headings). Convention rules target specific sections: "The Testing section must exist" checks for a heading containing "test" (case-insensitive), not an exact regex.
- **Start with very few rules.** Launch with 3-5 high-confidence conventions, not 20 speculative ones. Each rule must have zero false positives on the existing 35 projects before shipping. Run every rule against all existing CLAUDE.md files as a validation suite.
- **Configurable rule severity.** Rules have `error` (blocks nothing, but prominent in risk feed), `warning` (visible but dimmed), and `info` (only in detail view). Start everything at `info` and promote to `warning` only after zero false positives for 2 weeks.
- **User can suppress per-project.** A `conventionOverrides` field in `mc.config.json` lets the user mark "openefb is exempt from rule X." This prevents legitimate exceptions from generating noise.
- **Never use AI for convention checking in the scan cycle.** LLM calls are too slow and expensive for scan-time enforcement. Regex with context is fast, deterministic, and testable.

**Detection:** More than 3 `convention_violation` findings across all projects that the user does not resolve within a week. User adds `conventionOverrides` for more than 30% of rules.

**Phase warning:** Knowledge unification phase. The anti-pattern registry schema must include `negativeContext` from day one. Adding it later means rewriting every rule.

### Pitfall 9: Apple Speech On-Device Recognition Has a 60-Second Hard Limit and Language Gaps

**What goes wrong:** The voice capture feature uses `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true` for privacy. On-device recognition has a hard 60-second limit per request. The user starts dictating a long thought (2+ minutes), and the recognizer silently stops transcribing at 60 seconds. The user sees a truncated capture. Additionally, on-device recognition supports fewer languages than server-based recognition, and accuracy is lower -- especially for technical terms like "Hono," "Drizzle," "Tailscale," "SQLite" which are not in the on-device vocabulary.

**Why it happens:** Apple limits on-device recognition to 60 seconds to manage memory and battery impact. The on-device model is smaller and less capable than the server-side model. Technical jargon and proper nouns are poorly represented in the on-device vocabulary. There's also a device-wide limit of 1,000 recognition requests per hour.

**Consequences:** Voice captures are incomplete (truncated at 60s). Technical terms are transcribed incorrectly ("Hondo" instead of "Hono," "Drizzle" transcribed as "drizzle" with no capitalization context). Users learn voice capture is unreliable for technical content and stop using it.

**Prevention:**
- **Show a countdown timer and visual indicator.** When voice capture starts, show a 60-second countdown. At 50 seconds, pulse the UI to warn the user. At 60 seconds, auto-stop and save what was captured. Never silently truncate.
- **Auto-segment long recordings.** If the user keeps talking past 55 seconds, stop the current recognition request, start a new one, and concatenate the results. This works around the 60-second limit but introduces a ~1s gap in transcription.
- **Store the audio file alongside the transcription.** Save the raw audio (`.m4a`, compressed) in the app's documents directory. If transcription is poor, the user can replay and manually correct. This is especially important for technical terms.
- **Consider SpeechAnalyzer for iOS 26+.** Apple announced `SpeechAnalyzer` at WWDC 2025 as a replacement for `SFSpeechRecognizer`. It supports long-form audio, has better accuracy for distant audio, and manages language models automatically. If the iOS app targets iOS 26 (fall 2026), use SpeechAnalyzer instead. If targeting iOS 17+, use SFSpeechRecognizer with the workarounds above and plan migration.
- **Custom vocabulary is not available on-device.** Apple's speech framework does not support custom vocabulary (unlike server-side Google/AWS). Accept that technical terms will be poorly transcribed. The manual correction flow must be frictionless.
- **Prompt for microphone permission on first use, not on install.** Request `SFSpeechRecognizer.requestAuthorization()` when the user first taps the voice button, not on app launch. Premature permission prompts reduce grant rates.

**Detection:** Transcription text ends mid-sentence at exactly 60 seconds. User repeatedly re-records the same thought. Transcription contains obvious misrecognitions of technical terms.

**Phase warning:** iOS voice capture phase. The 60-second limit and audio storage must be in the design spec. SpeechAnalyzer availability should be evaluated against the iOS deployment target.

### Pitfall 10: Core Data Offline Queue Creates Duplicate Captures on Retry

**What goes wrong:** The iOS app queues captures in Core Data when offline. When connectivity resumes, the sync worker flushes the queue by POSTing each capture to `POST /api/captures`. If the POST succeeds but the response times out (network dropped mid-response), the sync worker doesn't know if the server received the capture. It retries, creating a duplicate. The user sees the same capture twice in the dashboard.

**Why it happens:** HTTP is not transactional. A timeout doesn't mean failure -- it means "unknown." Without idempotency, the server has no way to deduplicate retries. The existing `POST /api/captures` endpoint generates a new UUID for each request, so two identical POSTs create two captures with different IDs.

**Consequences:** Duplicate captures in the dashboard. AI categorization runs twice on the same content (wasting Gemini quota). The user manually deletes duplicates, adding friction to the capture experience.

**Prevention:**
- **Client-generated idempotency keys.** The iOS app generates a UUID for each capture at creation time (in Core Data). This UUID is sent as the `Idempotency-Key` header (or as a field in the request body). The server checks: if a capture with this key already exists, return 200 with the existing capture. Do not create a new one.
- **Implement idempotency in the Hono API.** Add an `idempotencyKey` column to the captures table (nullable, unique). On POST, check for existing key before insert. This is a small schema change with high reliability value.
- **Mark queue items as "syncing" before the POST.** If the POST fails (network error), mark as "pending" for retry. If the POST succeeds (200/201), mark as "synced" and delete from queue. If the POST times out, mark as "pending" -- the idempotency key prevents duplicates on retry.
- **Exponential backoff on retries.** Don't flood the API with retries when connectivity is flaky. 1s, 2s, 4s, 8s, 16s (max). After 5 failures, stop retrying until the next foreground sync.
- **Sync the queue in order.** Process captures FIFO. Don't parallelize queue flush -- this complicates idempotency and can reorder captures.

**Detection:** Dashboard shows two captures with identical `rawContent` within 60 seconds of each other. Capture count in the API doesn't match capture count in Core Data after sync.

**Phase warning:** iOS offline queue phase. Idempotency must be added to the Hono API before the iOS app ships. It's a server-side change, not just an iOS change.

## Moderate-Minor Pitfalls

### Pitfall 11: Dependency Graph Visualization Has Circular Dependencies That Break D3-Force Layout

**What goes wrong:** The `dependsOn` config allows Project A to depend on Project B, and Project B to depend on Project A (circular). Or worse: A -> B -> C -> A (transitive cycle). D3-force handles this visually (it just draws the edges), but the health check logic does not. When checking "does nexusclaw's unpushed commit affect mission-control?", the traversal follows the dependency chain: nexusclaw -> mission-control -> nexusclaw -> mission-control -> ... (infinite loop). The health check hangs or crashes.

**Why it happens:** Manual dependency declarations have no validation. The user types `"dependsOn": ["mission-control"]` in nexusclaw's config without realizing mission-control already depends on nexusclaw.

**Prevention:**
- **Validate for cycles at config load time.** When mc.config.json is parsed, build the dependency graph and run cycle detection (topological sort or DFS with visited set). If a cycle is found, emit a `convention_violation` finding: "Circular dependency: A -> B -> C -> A."
- **Health check traversal uses a visited set.** When walking the dependency chain, track visited slugs. Stop if a slug is revisited. This prevents infinite loops regardless of config state.
- **Dashboard graph shows cycles visually.** Highlight circular edges in a different color (amber). Don't hide them -- let the user see the problem.
- **Limit traversal depth.** Cap dependency chain walks at depth 5. No real project ecosystem has dependency chains deeper than 3-4 levels.

**Detection:** Health check scan takes > 30 seconds (indicating an infinite loop). `dependency_impact` findings appear for projects that aren't actually related.

### Pitfall 12: CLAUDE.md Content-Hash Cache Never Invalidates for Files That Don't Change on Disk

**What goes wrong:** The knowledge aggregation system caches CLAUDE.md content with a content hash. It checks file `mtime` (modification time) via `stat` to decide whether to re-read. But `git checkout`, `git pull`, and `git stash pop` can change file content without updating `mtime` on some filesystems. The cache holds stale content indefinitely. A project's CLAUDE.md is updated via a PR merge, but MC still shows the old version because the `mtime` didn't change.

**Why it happens:** HFS+/APFS can preserve `mtime` across git operations in certain scenarios (fast-forward merges, rebases). The content-hash approach is correct in theory but relies on `mtime` as the trigger for re-hashing, which is unreliable.

**Prevention:**
- **Use `git log -1 --format=%H -- CLAUDE.md` as the freshness check, not `stat mtime`.** The git commit hash that last touched the file is a reliable indicator of change. Compare against the stored hash.
- **For local files, compute a full content hash periodically (every 30 minutes).** `mtime` is a fast heuristic for short intervals, but the full hash should be recomputed on a longer cycle to catch `mtime` misses.
- **For SSH files, batch the freshness check.** `ssh ryans-mac-mini 'for f in ~/*/CLAUDE.md; do git -C $(dirname "$f") log -1 --format="%H" -- CLAUDE.md 2>/dev/null; done'` gives all commit hashes in one SSH call.
- **TTL expiration forces re-read.** Even if the freshness check says "unchanged," re-read the full file every 4 hours. This bounds the maximum staleness window.

**Detection:** Dashboard shows CLAUDE.md content that doesn't match the file on disk. `lastCheckedAt` is recent but `contentHash` hasn't changed in days despite active development.

### Pitfall 13: Share Extension Cannot Access Tailscale Network

**What goes wrong:** The iOS share sheet extension runs in a sandboxed process separate from the host app. Even though the Tailscale VPN is active for the host app, the share extension may not route traffic through the VPN tunnel. Network requests from the extension to `100.123.8.125:3000` fail with "connection refused" or timeout -- even when the host app can reach the API successfully.

**Why it happens:** iOS network extensions (VPN) apply to the device's network stack, which generally includes app extensions. However, the extension's sandbox can sometimes interfere with DNS resolution or routing. More commonly, the VPN may have disconnected between when the user opened the share sheet and when the extension tries to make the network call.

**Prevention:**
- **The share extension should never make network calls.** (Reinforces Pitfall 1.) Write to the shared App Group container. Let the host app handle all networking. This eliminates the VPN routing question entirely for the extension.
- **The host app checks connectivity before sync.** Use `NWPathMonitor` to verify the path to the API host is reachable. If not, queue for later.
- **Test on a physical device with Tailscale.** Simulator does not replicate VPN behavior. All Tailscale-related testing must happen on a real iPhone connected to the Tailnet.

**Detection:** Extension logs show network timeout errors. Share sheet appears to work (no crash) but captures never appear in the dashboard.

### Pitfall 14: Convention Registry Schema Becomes a Maintenance Burden

**What goes wrong:** The anti-pattern registry in mc.config.json starts with 5 rules, grows to 20, and becomes its own configuration management problem. Rules have complex fields (`pattern`, `negativeContext`, `section`, `severity`, `exemptProjects`). Updating a rule requires editing a JSON file, restarting the API, and hoping you didn't break the regex syntax. There's no validation, no dry-run, no diff preview.

**Prevention:**
- **Validate rules at API startup.** Parse every regex pattern in the registry. If any pattern is invalid, log a warning and skip it -- don't crash the API.
- **Provide a dry-run endpoint.** `POST /api/conventions/check` with a project slug runs all rules against that project's CLAUDE.md and returns findings without persisting them. This lets the user test rules before committing them.
- **Keep rules in a separate file.** `mc.conventions.json` (or a `conventions` key in mc.config.json) isolates convention config from project config. Changes to conventions don't risk corrupting the project registry.
- **Ship with a small, curated set.** 5 rules maximum for v1.4: (1) deprecated model references, (2) missing "Testing" section, (3) missing "Build" section, (4) stale "Current State" date, (5) references to archived projects. That's it. Expand later based on signal, not speculation.

**Detection:** mc.config.json has a `conventions` array with 15+ entries. More than half have `exemptProjects` overrides.

### Pitfall 15: D3-Force Bundle Inflates Dashboard When Imported Eagerly

**What goes wrong:** The dependency graph component imports `d3-force`, `d3-selection`, `d3-drag`, and `d3-zoom` at the top level. Even though the graph is only visible when the user clicks "Show Relationships," the D3 modules (~40-50KB) are included in the main bundle and loaded on every page view. This increases initial load time for the dashboard, which is the user's browser homepage.

**Prevention:**
- **Lazy-load the graph component.** Use `React.lazy()` and `Suspense` to code-split the dependency graph into a separate chunk. The D3 modules are only downloaded when the user opens the graph panel.
```typescript
const DependencyGraph = React.lazy(() => import('./dependency-graph'));
// In JSX:
<Suspense fallback={<div>Loading graph...</div>}>
  {showGraph && <DependencyGraph projects={projects} />}
</Suspense>
```
- **Import specific D3 modules only.** `import { forceSimulation } from "d3-force"` instead of `import * as d3 from "d3"`. The full D3 package is 280KB+; the specific modules needed are ~40KB total.
- **Verify with bundle analyzer.** Run `npx vite-bundle-visualizer` after adding D3 to confirm it's in a separate chunk. Vite handles code splitting automatically with dynamic imports.

**Detection:** Vite build output shows `d3-force` in the main chunk. Lighthouse performance score drops after adding the graph feature.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| iOS share sheet | Memory limit crash (Pitfall 1) | CRITICAL | No networking in extension, write to App Group only |
| iOS share sheet | VPN routing failure (Pitfall 13) | MODERATE | Extension never makes network calls |
| iOS offline queue | Duplicate captures on retry (Pitfall 10) | CRITICAL | Idempotency keys in API + Core Data queue |
| iOS Tailscale | VPN disconnection (Pitfall 4) | CRITICAL | Offline-first architecture from day one |
| iOS voice capture | 60-second limit (Pitfall 9) | MODERATE | Countdown timer, audio storage, SpeechAnalyzer eval |
| iOS type safety | Zod/Codable drift (Pitfall 5) | CRITICAL | OpenAPI generation or shared JSON Schema |
| D3 dependency graph | React lifecycle conflict (Pitfall 2) | CRITICAL | D3 owns SVG via useRef, React provides container only |
| D3 dependency graph | Bundle size inflation (Pitfall 15) | MODERATE | React.lazy code splitting, specific module imports |
| Dependency tracking | Circular dependency infinite loop (Pitfall 11) | MODERATE | Cycle detection at config load, visited set in traversal |
| Dependency tracking | Alert fatigue from stale config (Pitfall 6) | MODERATE | Severity escalation ladder, cap alerts per project |
| Knowledge aggregation | SSH latency blocks scan cycle (Pitfall 3) | CRITICAL | Separate timer, batch SSH, content-hash cache |
| Knowledge aggregation | Cache never invalidates (Pitfall 12) | MODERATE | Git commit hash freshness check, TTL re-read |
| Convention enforcement | Regex false positives (Pitfall 8) | MODERATE | negativeContext patterns, section-aware scanning, few rules |
| Convention registry | Schema maintenance burden (Pitfall 14) | MINOR | Validation at startup, dry-run endpoint, limit to 5 rules |
| Changes since last visit | Multi-device inconsistency (Pitfall 7) | MODERATE | Server-side timestamp storage, not localStorage-only |

## Integration Pitfalls (Cross-Feature)

### iOS Capture + API Idempotency
The idempotency key mechanism (Pitfall 10) must be designed before the iOS app ships. It requires a server-side change (`idempotencyKey` column on captures table + unique constraint + check-before-insert logic). The existing `POST /api/captures` endpoint in `packages/api/src/routes/captures.ts` must be modified. This is a cross-repo dependency: the API change must be deployed to Mac Mini before the iOS app submits captures with idempotency keys.

### SSH Aggregation + Existing Scanner
The CLAUDE.md aggregation (Pitfall 3) must not share the SSH connection pool or timer with the existing project scanner. The scanner's SSH calls in `project-scanner.ts` use `SSH_TIMEOUT = 20_000` for known paths. Aggregation of potentially 20+ files needs batched commands with different timeout characteristics. If they share a connection, a hanging aggregation blocks project scanning.

### D3 Graph + Dependency Health Checks
The D3 graph visualization (Pitfall 2) and dependency health checks (Pitfalls 6, 11) share the same data source (`dependsOn` config). But they have different tolerance for stale data. The graph can render from cached dependency config. Health checks must validate against current state. Don't couple the graph rendering to the health check cycle -- let them update independently.

### Convention Enforcement + CLAUDE.md Aggregation
Convention checks (Pitfall 8) depend on aggregated CLAUDE.md content (Pitfall 3). If aggregation is stale, convention checks run against old content and either miss new violations or report violations that have been fixed. Convention checks must record which content hash they ran against. If the content hash is outdated (older than 2 hours), mark convention findings as `stale` rather than `active`.

### iOS Type Sync + Convention Enforcement
Convention rules that check CLAUDE.md content (Pitfall 8) will eventually need to validate the iOS repo's CLAUDE.md too. But the iOS repo is a sibling repo (`~/mission-control-ios`), not part of the monorepo. The discovery scanner already knows about it (if tracked). But convention enforcement must handle cross-repo scanning -- it can't assume all CLAUDE.md files are in `~/mission-control/`.

### Changes Since Last Visit + iOS App
The "changes since last visit" feature (Pitfall 7) tracks the dashboard, but what about the iOS app? If the user reviews projects on the iOS app, should the dashboard show those as "already seen"? This requires the server-side timestamp to be updated from both clients. The API endpoint (`POST /api/user/last-visit`) must accept a `source` parameter (`web` or `ios`) and track per-source if differentiated views are desired, or a single timestamp if "seen anywhere = seen everywhere."

## Sources

- [iOS App Extensions Memory Limits](https://blog.kulman.sk/dealing-with-memory-limits-in-app-extensions/) -- 120MB limit for share extensions, strategies for staying under budget
- [Reduce Share Extension Crashes](https://medium.com/@timonus/reduce-share-extension-crashes-from-your-app-with-this-one-weird-trick-6b86211bb175) -- Pass NSData not UIImage to UIActivityViewController
- [Element iOS Share Extension Memory Issue](https://github.com/vector-im/element-ios/issues/2341) -- Real-world example of share extension exceeding memory limits
- [D3 Force Graph with React](https://dev.to/gilfink/creating-a-force-graph-using-react-and-d3-76c) -- useRef pattern for D3+React integration
- [React + D3 Force Graphs + TypeScript](https://medium.com/@qdangdo/visualizing-connections-a-guide-to-react-d3-force-graphs-typescript-74b7af728c90) -- D3 in-place mutation and React state conflict patterns
- [Adopting D3 in React Apps](https://rajeshnaroth.medium.com/adopting-d3-in-react-apps-a6237a61b59f) -- Ghost node problem and cleanup solutions
- [D3 Bundle Size (Bundlephobia)](https://bundlephobia.com/package/d3) -- Full D3: 280KB+, d3-force: ~17KB
- [D3 Tree Shaking Issue](https://github.com/d3/d3/issues/3076) -- Import specific modules to enable tree shaking
- [iOS Share Extension with SwiftUI and SwiftData](https://www.merrell.dev/ios-share-extension-with-swiftui-and-swiftdata/) -- App Group setup for data sharing between extension and host app
- [Setting up AppGroup for Extensions](https://medium.com/@B4k3R/setting-up-your-appgroup-to-share-data-between-app-extensions-in-ios-43c7c642c4c7) -- UserDefaults with suiteName pattern
- [Tailscale VPN On Demand for iOS](https://tailscale.com/kb/1291/ios-vpn-on-demand) -- Auto-connect configuration
- [Tailscale iOS Connectivity Issues](https://github.com/tailscale/tailscale/issues/16978) -- VPN setup failures on iOS 18
- [Core Data Sync with REST API](https://bipsync.com/blog/implementing-data-sync-between-a-web-api-and-a-core-data-store/) -- Conflict resolution strategies for offline-first sync
- [Offline-First: Outbox, Idempotency & Conflict Resolution](https://www.educba.com/offline-first/) -- Outbox pattern, sync worker, idempotency key lifecycle
- [Implementing Idempotency Keys in REST APIs](https://zuplo.com/learning-center/implementing-idempotency-keys-in-rest-apis-a-complete-guide) -- UUID key generation, server-side dedup, TTL on processing locks
- [SFSpeechRecognizer Documentation](https://developer.apple.com/documentation/speech/sfspeechrecognizer) -- 60-second limit, 1000 requests/hour device limit
- [requiresOnDeviceRecognition](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition) -- On-device recognition accuracy tradeoffs
- [SpeechAnalyzer WWDC 2025](https://developer.apple.com/videos/play/wwdc2025/277/) -- Next-gen speech-to-text, long-form support, iOS 26+
- [iOS 26 SpeechAnalyzer Guide](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide) -- SpeechTranscriber + SpeechDetector modules, automatic language management
- [localStorage Hidden Dangers 2025](https://medium.com/@diyasanjaysatpute147/3-hidden-dangers-of-localstorage-in-2025-that-no-one-warned-you-about-54790f33e86b) -- Synchronous blocking, security exposure, no cross-device sync
- [openapi-zod-client](https://github.com/astahmer/openapi-zod-client) -- Generate TypeScript clients from OpenAPI specs, relevant to reverse direction (Zod -> OpenAPI -> Swift)
- [swift-openapi-generator](https://github.com/apple/swift-openapi-generator) -- Apple's official OpenAPI to Swift codegen tool
- Existing MC codebase: discovery-scanner.ts (SSH patterns, scan timers), star-service.ts (rate limit handling), event-bus.ts (event types), schema.ts (table patterns), project-scanner.ts (scan cycle), captures.ts (POST endpoint that needs idempotency), shared/schemas/ (Zod schema patterns)

---
*Researched: 2026-03-21*
