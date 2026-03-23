---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Intelligence Engine
status: Ready to execute
stopped_at: Completed 37-02-PLAN.md (Insight Generator)
last_updated: "2026-03-23T14:40:36.992Z"
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 22
  completed_plans: 21
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** Every time you open Mission Control, you're smarter than you were 3 seconds ago
**Current focus:** Phase 37 — proactive-intelligence

## Current Position

Phase: 37 (proactive-intelligence) — EXECUTING
Plan: 4 of 4

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v1.4)
- Average duration: —
- Total execution time: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

All v1.0-v1.3 decisions archived to PROJECT.md Key Decisions table.

- (v1.4 CEO review) iOS as sibling repo ~/mission-control-ios, not monorepo
- (v1.4 CEO review) Native SwiftUI dashboard, not WKWebView
- (v1.4 CEO review) Tailscale trust for iOS, no new auth
- (v1.4 CEO review) D3-force library exception for relationship graph
- (v1.4 CEO review) Scan-time convention enforcement only
- (v1.4 CEO review) iOS foreground-only sync
- (v1.4 CEO review) Voice capture capped at 60s
- [Phase 23]: Idempotency key check before body validation for early short-circuit on retries
- [Phase 23]: dependsOn uses optional().default([]) for backward compatibility with existing mc.config.json
- [Phase 23]: detectCycles uses DFS with inStack tracking, handles unknown slugs gracefully as leaf nodes
- [Phase 24]: ON CONFLICT DO UPDATE for knowledge upsert (simpler than SELECT-then-INSERT, preserves createdAt)
- [Phase 24]: Staleness formula: 60% age (90d decay) + 40% commits (50-commit decay), integer 0-100
- [Phase 24]: getAllKnowledge uses explicit Drizzle column projection to exclude content at query level
- [Phase 24]: Content-hash SHA-256 with CRLF normalization for cross-platform consistency
- [Phase 24]: pLimit(3) for parallel reads to avoid SSH connection exhaustion
- [Phase 24]: AND logic for stale detection: both >30d age AND >10 commits required (D-08)
- [Phase 25]: First scan baseline: skip drift detection when previousHeadCommits is empty (no false positives on startup)
- [Phase 25]: Dependency drift severity thresholds: <24h info, >=24h warning, >=7d critical (D-04)
- [Phase 25]: currentHeads map prefers non-null headCommit when slug appears on multiple hosts
- [Phase 25]: DependencyBadges follows HostBadge styling pattern exactly (text-[10px] font-medium rounded-full px-2 py-0.5, neutral bg-warm-gray/8)
- [Phase 26]: Widen detectCycles parameter type to avoid requiring conventionOverrides on callers
- [Phase 26]: Convention checks run on cached DB content via getAllKnowledgeWithContent (no re-read from disk)
- [Phase 26]: Targeted SQL for convention resolution to avoid side effects on other check types
- [Phase 26]: resolveFindings calls preserve convention_violation findings via activeCheckTypes parameter
- [Phase 27]: LIKE COLLATE NOCASE for case-insensitive knowledge search (no FTS5 for CLAUDE.md content)
- [Phase 27]: Convention check reuses /api/health-checks/:slug with checkType filter (no new API route)
- [Phase 27]: Digest endpoint reuses resolveProjectFromCwd for cwd-to-slug resolution (no duplicate logic)
- [Phase 27]: createKnowledgeRoutes extended with optional getConfig parameter (backward compatible default)
- [Phase 28]: INSERT ON CONFLICT DO UPDATE rotates lastVisitAt into previousVisitAt in a single SQL statement
- [Phase 28]: seenSlugs state tracks clicked projects so highlights clear on click without API round-trip
- [Phase 28]: Border priority: selected (terracotta) > stale (amber) > changed (indigo) > default (transparent)
- [Phase 29]: SwiftData over Core Data for offline queue (better App Group support, less boilerplate)
- [Phase 29]: Zero external dependencies -- Apple frameworks only for iOS companion
- [Phase 29]: Explicit CodingKeys on every Codable struct to prevent type drift with Zod schemas
- [Phase 29]: No networking in share extension -- writes SwiftData only, SyncEngine handles API sync
- [Phase 29]: Project picker reads cached list from App Group UserDefaults (main app populates)
- [Phase 29]: SyncEngine debounces at 30s + exponential backoff (2^retryCount) with max 3 retries
- [Phase 29]: healthBySlug uses internal setter for test accessibility with @testable import
- [Phase 29]: ISO8601DateFormatter tries fractional seconds then standard format for robust API date parsing
- [Phase 29]: Fixed project.yml: bundle.unit-test type, GENERATE_INFOPLIST_FILE, explicit scheme for test target
- [Phase 29]: LocationService uses kCLLocationAccuracyReduced for city-level only (privacy-first)
- [Phase 29]: Share extension reads lastKnownCity from App Group UserDefaults (no CLLocationManager in extension)
- [Phase 29]: IOS-13 fix: capture.projectId ?? aiResult.projectSlug (user assignment always wins over AI)
- [Phase 29]: captureCount uses GROUP BY on captures table with isNotNull filter (same pattern as copyCount)
- [Phase 30]: Widget uses AppIntent button with openAppWhenRun (WidgetKit does not support TextField)
- [Phase 30]: showQuickCapture flag in App Group UserDefaults for widget-to-app navigation
- [Phase 30]: Static let for AppIntent properties to satisfy Swift 6 strict concurrency
- [Phase 30]: Widget timeline refreshes every 15 minutes plus on-demand reload after sync
- [Phase 30]: AVAudioRecorder with metering over AVAudioEngine for voice recording simplicity
- [Phase 30]: 55-second chunk timer with 5-second safety margin for SFSpeechRecognizer 60s limit
- [Phase 30]: On-device transcription preferred (requiresOnDeviceRecognition) with server fallback
- [Phase 30]: Voice captures sync transcription-only to API (audio stays local for v1.4)
- [Phase 30]: MockMCAPIClient uses withLock closure for Swift 6 async context compatibility
- [Phase 31]: GraphNode uses structural typing for d3-force compatibility (no d3-force import in graph-data.ts)
- [Phase 31]: BFS bidirectional traversal for highlight chain (simpler than DFS, same correctness)
- [Phase 31]: dependencyCount counts ALL declared deps including dangling (tracks user intent)
- [Phase 31]: rAF throttling for d3-force tick updates to prevent render storms (~300 ticks during settling)
- [Phase 31]: React.lazy code-split pattern: relationship-graph chunk (21KB) separate from main bundle (364KB)
- [Phase 31]: Node cloning before forceSimulation to avoid mutating shared React state
- [Phase 32]: RRF k=60 per original paper, formula: score = sum(weight / (k + rank + 1))
- [Phase 32]: createOpenAI from @ai-sdk/openai for LM Studio (OpenAI-compatible endpoint)
- [Phase 32]: SearchFilters.type extended to include 'knowledge' source type per D-07
- [Phase 32]: sqlite-vec requires BigInt for rowid (JS number rejected)
- [Phase 32]: Two-table pattern: embeddings (metadata) + vec_search (vectors) joined by integer rowid
- [Phase 32]: RRF k=60, BM25 weight=2x, vector weight=1x for hybrid search fusion
- [Phase 32]: 768-dim float vectors for nomic-embed-text-v1.5, vec_search created programmatically (not SQL migration)
- [Phase 32]: knowledge source_type added to search_index for CLAUDE.md content in unified FTS5 search
- [Phase 32]: Reranker uses generateText mock model reference instead of createLmStudioProvider
- [Phase 32]: No search_content table: vector embeddings via existing backfill service from FTS5 index
- [Phase 32]: Position-aware reranking blending: top 5 at 75/25 RRF/rerank, deep at 40/60
- [Phase 33]: Few-shot examples in DB (not config) for API-driven evolution from user corrections
- [Phase 33]: LM Studio fallback uses OpenAI-compatible /v1/chat/completions with JSON mode
- [Phase 33]: Grounding cascade: exact -> lesser (60% word overlap) -> fuzzy (0.75 char overlap) -> ungrounded
- [Phase 33]: Correction-as-training: user reassignment auto-creates few-shot example
- [Phase 33]: Direct Drizzle insert bypasses createCapture to avoid per-item enrichment on 800+ batch items
- [Phase 33]: Content-hash dedup uses SHA-256 with CRLF normalization (same as knowledge aggregator)
- [Phase 33]: Import progress uses capture:created event with data.subtype discriminator (no new event types)
- [Phase 33]: Tweet import finds unfetched tweets by isNull(linkTitle) for Capacities-sourced link captures
- [Phase 33]: Readonly better-sqlite3 connection with busy_timeout=1000 for iMessage chat.db concurrent access safety
- [Phase 33]: TCC/FDA errors auto-disable iMessage polling via clearInterval to prevent log spam
- [Phase 33]: Binary plist extraction: NSString marker regex primary, longest printable ASCII run fallback
- [Phase 33]: groundExtraction/groundAllExtractions wrap existing alignExtractions (no new matching logic)
- [Phase 33]: CaptureItem extractions/groundingData/sourceType optional for forward-compatibility with API enrichment
- [Phase 33]: ExtractionBadges filter project_ref (already shown via project badge button)
- [Phase 34]: Significance heuristic uses compound gates: projectSlug required, 5min minimum, then commit/file/duration thresholds (D-04)
- [Phase 34]: extractSolutionMetadata returns null (not throws) when LM Studio unavailable -- graceful degradation per D-05
- [Phase 34]: Epoch ms for weekly trend filter (not Date object) -- Drizzle timestamp mode requires number bind params
- [Phase 34]: listSolutions uses inline type for query param -- avoids Zod .default() making limit/offset required at call sites
- [Phase 34]: Dynamic import of solution-extractor in session stop hook to avoid loading AI modules at route init
- [Phase 34]: MCP cross_project_search filters solutions client-side from unified search (no sourceType query param in search schema)
- [Phase 34]: Plain fetch for PATCH /solutions/:id/status and /metadata because Hono routes use c.req.json() without zValidator (typed client cannot infer body shape)
- [Phase 35]: ON CONFLICT(project_slug, generation_type) DO UPDATE for intelligence cache upsert (same as Phase 24 knowledge pattern)
- [Phase 35]: In-memory generation lock with 60s auto-release timeout to prevent permanent locks on crash
- [Phase 35]: Model tier budgets: regex pattern matching (70b/72b=large/16K, 30b/32b=medium/8K, default=small/4K tokens)
- [Phase 35]: Context budget allocation: 40% commits, 30% captures, 30% sessions with line-boundary truncation
- [Phase 35]: Cache-first serving via getNarrative: returns cached or null, triggers async regeneration via queueMicrotask (never blocks API)
- [Phase 35]: Output.object with narrativeSchema for constrained generation -- same pattern as solution-extractor (D-03, D-06)
- [Phase 35]: NarrativePanel renders nothing when null -- commit breadcrumbs serve as fallback, zero visual regression
- [Phase 35]: useNarrative uses plain fetch to /api/intelligence/:slug/narrative -- follows fetchCounter convention
- [Phase 35]: Rule-based suggestions as sync fallback; AI enrichment is fire-and-forget async upgrade
- [Phase 35]: Hot burn rate Rule D uses burnRate parameter for advisory downgrade suggestion
- [Phase 35]: Digest route placed BEFORE :slug/narrative route to avoid slug-matching conflict
- [Phase 35]: gatherDigestData uses epoch seconds for session/capture timestamps (Drizzle timestamp mode)
- [Phase 35]: z.discriminatedUnion for tool dispatch -- type-safe switching without native function calling (Qwen3-Coder issue)
- [Phase 35]: Sequential narrative generation (not parallel) to avoid LM Studio overload
- [Phase 35]: Digest panel placed between compound score and hero card for morning briefing flow
- [Phase 36]: Device hint confidence threshold >0.8 for AI skip (per EDGE-03 D-04)
- [Phase 36]: Null projectSlug falls through to server AI regardless of confidence
- [Phase 36]: User-set projectId always wins over device classification (IOS-13 preserved)
- [Phase 36]: SyncEngine passes nil for deviceClassification (Plan 03 wires real classification)
- [Phase 36]: Protocol method requires explicit deviceClassification parameter (no default on protocol, concrete impl has default)
- [Phase 36]: @preconcurrency conformance for FoundationModelsCaptureClassifier to bridge @MainActor + nonisolated protocol in Swift 6
- [Phase 36]: New LanguageModelSession per classification (one-shot, no context carry-over between captures)
- [Phase 36]: Token estimation heuristic: word_count / 0.75 (Apple has no public tokenizer)
- [Phase 36]: ConnectionMonitor passed as parameter to classifyPendingCaptures to avoid lifecycle coupling
- [Phase 37]: ON CONFLICT DO NOTHING for content-hash dedup (insights are immutable once created)
- [Phase 37]: Epoch-second comparison for snooze filtering via raw SQL bind param (Drizzle timestamp mode)
- [Phase 37]: Insight routes placed before :slug/narrative to avoid Hono param-matching conflicts
- [Phase 37]: Optimistic dismissedIds Set clears on server refetch (server already filters dismissed)
- [Phase 37]: Intelligence strip mode switching: hasDigest && \!digestRead shows DigestStripView, else standard What's New
- [Phase 37]: InsightBadges batch dismiss: X on badge dismisses all insights of that type
- [Phase 37]: SSE event listeners use exact event bus type strings (intelligence:insight_created/dismissed)
- [Phase 37]: Local hours (getHours) for session pattern peak hour -- user's timezone, not UTC
- [Phase 37]: Term frequency minimum of 2 occurrences per project for cross-project overlap detection
- [Phase 37]: generateAllInsights is synchronous (rule-based only, no LM Studio dependency, no lock)

### Pending Todos

None.

### Blockers/Concerns

- CEO plan notes: `dataFlow` field in dependency schema reserved for future use, not consumed by v1.4
- iOS requires paid Apple Developer account for TestFlight distribution
- Convention anti-pattern registry shape needs validation during plan-phase
- Phase 29 research flag: SwiftData + App Groups + share extension has device-specific quirks
- Phase 30 research flag: AppIntents execution budget and SpeechAnalyzer availability need validation

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Close v1.0 tech debt items | 2026-03-10 | 0a94015 | [1-close-v1-0-tech-debt-items](./quick/1-close-v1-0-tech-debt-items/) |
| 2 | Fix dashboard "Failed to fetch" error banner | 2026-03-11 | f7faed5 | [2-fix-dashboard-failed-to-fetch-error-init](./quick/2-fix-dashboard-failed-to-fetch-error-init/) |
| 3 | Deploy Mission Control to Mac Mini as self-updating service | 2026-03-16 | fb2c7e6 | [260316-cox-deploy-mission-control-v1-1-to-mac-mini-](./quick/260316-cox-deploy-mission-control-v1-1-to-mac-mini-/) |
| Phase 23 P02 | 6min | 2 tasks | 6 files |
| Phase 23 P01 | 10min | 1 tasks | 8 files |
| Phase 24 P01 | 9min | 2 tasks | 12 files |
| Phase 24 P02 | 7min | 2 tasks | 3 files |
| Phase 25 P01 | 6min | 2 tasks | 7 files |
| Phase 25 P02 | 3min | 2 tasks | 3 files |
| Phase 26 P01 | 14min | 2 tasks | 13 files |
| Phase 27 P01 | 5min | 2 tasks | 8 files |
| Phase 27 P02 | 6min | 2 tasks | 5 files |
| Phase 28 P01 | 8min | 2 tasks | 11 files |
| Phase 28 P02 | 4min | 2 tasks | 8 files |
| Phase 29 P01 | 5min | 2 tasks | 17 files |
| Phase 29 P02 | 10min | 2 tasks | 6 files |
| Phase 29 P03 | 10min | 2 tasks | 9 files |
| Phase 29 P04 | 5min | 3 tasks | 6 files |
| Phase 30 P01 | 6min | 2 tasks | 12 files |
| Phase 30 P02 | 7min | 2 tasks | 15 files |
| Phase 31 P01 | 2min | 1 tasks | 2 files |
| Phase 31 P02 | 5min | 2 tasks | 11 files |
| Phase 32 P02 | 15min | 2 tasks | 8 files |
| Phase 32 P01 | 31min | 4 tasks | 18 files |
| Phase 32 P03 | 14min | 2 tasks | 10 files |
| Phase 33 P01 | 23min | 5 tasks | 17 files |
| Phase 33 P03 | 11min | 2 tasks | 6 files |
| Phase 33 P04 | 5min | 3 tasks | 4 files |
| Phase 33 P02 | 12min | 2 tasks | 8 files |
| Phase 34 P02 | 5min | 1 tasks | 2 files |
| Phase 34 P01 | 10min | 2 tasks | 11 files |
| Phase 34 P03 | 7min | 2 tasks | 10 files |
| Phase 34 P04 | 5min | 2 tasks | 7 files |
| Phase 35 P01 | 5min | 2 tasks | 9 files |
| Phase 35 P02 | 8min | 2 tasks | 8 files |
| Phase 35 P03 | 10min | 2 tasks | 6 files |
| Phase 35 P04 | 7min | 2 tasks | 8 files |
| Phase 36 P01 | 5min | 2 tasks | 7 files |
| Phase 36 P02 | 8min | 2 tasks | 10 files |
| Phase 36 P03 | 8min | 2 tasks | 5 files |
| Phase 37 P01 | 7min | 2 tasks | 11 files |
| Phase 37 P03 | 5min | 2 tasks | 6 files |
| Phase 37 P02 | 8min | 2 tasks | 4 files |

## Session Continuity

Last session: 2026-03-23T14:40:36.990Z
Stopped at: Completed 37-02-PLAN.md (Insight Generator)
Resume file: None
