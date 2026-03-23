---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Cross-Project Intelligence + iOS Companion + Knowledge Unification
status: Ready to plan
stopped_at: Completed 29-04-PLAN.md
last_updated: "2026-03-23T00:07:33.922Z"
progress:
  total_phases: 9
  completed_phases: 7
  total_plans: 15
  completed_plans: 15
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** Every time you open Mission Control, you're smarter than you were 3 seconds ago
**Current focus:** Phase 29 — ios-companion-core

## Current Position

Phase: 30
Plan: Not started

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

## Session Continuity

Last session: 2026-03-23T00:01:29.394Z
Stopped at: Completed 29-04-PLAN.md
Resume file: None
