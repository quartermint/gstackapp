---
phase: 33-capture-intelligence-engine
verified: 2026-03-23T11:13:02Z
status: gaps_found
score: 5/6 success criteria verified
re_verification: false
gaps:
  - truth: "Action items and ideas auto-extracted and surfaced in project cards"
    status: partial
    reason: "ExtractionBadges and GroundedText components exist and are wired in capture-card.tsx, but the captures list API (GET /api/captures) returns only base captures table columns — it does NOT join capture_extractions. The extractions and groundingData fields on CaptureItem are always undefined in practice. Extraction badges never render on live capture cards."
    artifacts:
      - path: "packages/api/src/routes/captures.ts"
        issue: "listCaptures query selects from captures table only — no JOIN with capture_extractions table"
      - path: "packages/api/src/db/queries/captures.ts"
        issue: "listCaptures function has no JOIN — returns captures without aggregated extractions"
      - path: "packages/web/src/components/capture/capture-card.tsx"
        issue: "Correctly wired to use extractions/groundingData, but data is always undefined from API"
    missing:
      - "Enrich GET /api/captures list response with aggregated extractions and grounding data per capture (LEFT JOIN capture_extractions or separate batch query)"
      - "ExtractionBadges will only render once API returns extractions inline in the captures list"
human_verification:
  - test: "iMessage monitoring end-to-end"
    expected: "Captures with sourceType 'imessage' appear in MC after enabling config and granting Full Disk Access in System Settings > Privacy & Security"
    why_human: "Requires macOS Full Disk Access permission grant, real chat.db access, and configured contact identifiers in mc.config.json — cannot verify programmatically"
  - test: "Capacities ZIP import with real backup"
    expected: "POST /api/captures/import/capacities returns 202, captures appear in DB with sourceType 'capacities', skipped count matches dedup"
    why_human: "Requires actual ~/Capacities_backup directory with real ZIP — ZIP fixture in tests mocks this but real path/data not available in automated check"
  - test: "Tweet content fetch via Crawl4AI"
    expected: "POST /api/captures/import/tweets resolves Capacities tweet URLs to full text content via Crawl4AI at 100.123.8.125:11235"
    why_human: "Requires Mac Mini Crawl4AI service to be running — external service dependency"
---

# Phase 33: Capture Intelligence Engine Verification Report

**Phase Goal:** Captures are deeply understood — multi-pass extraction with grounding, user-correctable few-shot examples, and ambient capture from Capacities and iMessage
**Verified:** 2026-03-23T11:13:02Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User corrections to AI categorization improve future predictions | VERIFIED | `POST /captures/:id/reassign` stores correction as few-shot example via `createFewShotExample`; `enrichCapture` fetches examples via `getFewShotExamplesForCategorization` and injects into prompt |
| 2 | Action items and ideas auto-extracted and surfaced in project cards | PARTIAL | Extractions stored in `capture_extractions` table via `createExtractionsBatch` in enrichment pipeline; `ExtractionBadges` component exists and is wired in `capture-card.tsx`; but `listCaptures` has no JOIN — `extractions` field is always `undefined` in API response, so badges never render |
| 3 | Capacities import enriches 800+ existing bookmarks with context and project assignment | VERIFIED | `capacities-importer.ts` with `StreamZip`, `gray-matter`, content-hash dedup, `POST /api/captures/import/capacities` endpoint wired and fires async import; 19 tests pass |
| 4 | iMessage conversations with Bella surface as captures before Ryan opens MC | VERIFIED (code-complete, human setup required) | `imessage-monitor.ts` polls `chat.db` readonly, converts Apple timestamps, extracts `attributedBody`, creates captures with `sourceType: "imessage"`, wired at startup in `index.ts`; disabled by default pending FDA grant |
| 5 | Tweet URLs resolve to full text content via Crawl4AI | VERIFIED | `tweet-fetcher.ts` POSTs to Crawl4AI at `100.123.8.125:11235` with OG scraper fallback; `POST /api/captures/import/tweets` endpoint wired; 14 tests pass |
| 6 | Enrichment works offline using LM Studio when Gemini is unreachable | VERIFIED | `ai-categorizer.ts` tries Gemini first, then `callLMStudio` with OpenAI-compatible `/v1/chat/completions`, then safe fallback; `isLMStudioAvailable()` checks `LM_STUDIO_URL`/`LM_STUDIO_BASE_URL` env vars |

**Score:** 5/6 truths verified (1 partial — extraction badges hollow due to missing API JOIN)

---

### Required Artifacts

**Plan 33-02 must_haves artifacts:**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/services/grounding.ts` | Deterministic grounding via character matching | VERIFIED | Exports `groundExtraction`, `groundAllExtractions`, `alignExtractions`; 3-tier cascade (exact/lesser/fuzzy); 0.75 fuzzy threshold; no diff-match-patch dependency (custom implementation) |
| `packages/api/src/services/prompt-validator.ts` | Startup validation of few-shot examples | VERIFIED | Exports `validatePromptExamples`; fetches examples, runs zero-shot baseline, logs mismatches |
| `packages/web/src/components/capture/extraction-badges.tsx` | Extraction type badge display | VERIFIED | Exports `ExtractionBadges`; 4 color styles (amber/violet/sky/emerald); filters `project_ref`; tooltip on hover |

**Plan 33-03 must_haves artifacts:**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/services/capacities-importer.ts` | Capacities ZIP parsing and batch import | VERIFIED | Exports `importCapacitiesBackup`, `findLatestBackupZip`; uses `StreamZip`, `gray-matter`; content-hash dedup; p-limit concurrency |
| `packages/api/src/services/tweet-fetcher.ts` | Tweet content resolution via Crawl4AI | VERIFIED | Exports `fetchTweetContent`, `batchFetchTweets`, `isCrawl4AIAvailable`; p-limit(2) + 1s delay; OG scraper fallback |

**Plan 33-04 must_haves artifacts:**

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/services/imessage-monitor.ts` | iMessage chat.db polling service | VERIFIED | Exports `pollNewMessages`, `convertAppleTimestamp`, `startIMessageMonitor`, `extractAttributedBodyText`; `APPLE_EPOCH_OFFSET=978307200`; readonly connection; `busy_timeout=1000` |

**Plan 33-01 artifacts (not in must_haves frontmatter but claimed in summary):**

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/api/drizzle/0012_capture_intelligence.sql` | VERIFIED | Migration creates `few_shot_examples`, `capture_extractions`, `correction_stats` tables; adds `source_type` column to captures (note: migration landed as 0012, not 0011 as planned — vector search took 0011) |
| `packages/api/src/routes/capture-intelligence.ts` | VERIFIED | `POST /captures/:id/reassign`, `GET /captures/:id/extractions`, `GET /captures/correction-stats`, `GET /captures/few-shot-examples` routes all present |
| `packages/api/src/db/queries/few-shot-examples.ts` | VERIFIED | Exists on disk |
| `packages/api/src/db/queries/capture-extractions.ts` | VERIFIED | Exists; `getExtractionsByCapture` used in intelligence route |
| `packages/api/src/db/queries/correction-stats.ts` | VERIFIED | Exists; used in intelligence routes |

---

### Key Link Verification

**Plan 33-02 key links:**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/api/src/services/enrichment.ts` | `packages/api/src/services/grounding.ts` | `groundAllExtractions` called after categorization | PARTIAL | `enrichment.ts` imports `alignExtractions` (not `groundAllExtractions`) — the plan called for `groundAllExtractions` but the implementation uses the original `alignExtractions` function which is semantically equivalent. Functionally correct. |
| `packages/api/src/index.ts` | `packages/api/src/services/prompt-validator.ts` | `validatePromptExamples` called at server startup | VERIFIED | `index.ts` line 102: `validatePromptExamples(db).catch(...)` inside 5-second startup setTimeout |
| `packages/web/src/components/capture/capture-card.tsx` | `packages/web/src/components/capture/extraction-badges.tsx` | `ExtractionBadges` rendered in capture card | VERIFIED | `capture-card.tsx` imports and conditionally renders `<ExtractionBadges extractions={extractions} />` |

**Plan 33-03 key links:**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/api/src/services/capacities-importer.ts` | `packages/api/src/db/schema.ts` | `db.insert(captures)` for batch performance | VERIFIED | Direct Drizzle insert at line 211 bypasses `createCapture` |
| `packages/api/src/services/tweet-fetcher.ts` | Crawl4AI HTTP API | POST to `http://100.123.8.125:11235/crawl` | VERIFIED | `fetchTweetContent` POSTs to `${crawl4aiUrl}/crawl` with 30s timeout |
| `packages/api/src/routes/captures.ts` | `packages/api/src/services/capacities-importer.ts` | `POST /api/captures/import/capacities` triggers import | VERIFIED | Route at line 117 imports and calls `importCapacitiesBackup` fire-and-forget |

**Plan 33-04 key links:**

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/api/src/services/imessage-monitor.ts` | `~/Library/Messages/chat.db` | better-sqlite3 readonly connection | VERIFIED | `new Database(chatDbPath, { readonly: true, fileMustExist: true })` at line 129 |
| `packages/api/src/index.ts` | `packages/api/src/services/imessage-monitor.ts` | `startIMessageMonitor` called at startup | VERIFIED | `index.ts` imports and calls `startIMessageMonitor` at line 110 inside startup block |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `capture-card.tsx` | `extractions` (from `capture.extractions`) | `GET /api/captures` → `listCaptures` → captures table | No — `capture_extractions` table never joined | HOLLOW — wired but data disconnected |
| `capture-card.tsx` | `groundingData` (from `capture.groundingData`) | `GET /api/captures` → `listCaptures` → captures table | No — grounding stored in `capture_extractions.grounding_json`, not in captures table | HOLLOW — wired but data disconnected |
| `ExtractionBadges` | `extractions` prop | Passed from `capture-card.tsx` | No — always `[]` due to hollow upstream | HOLLOW |
| `GroundedText` | `groundingData` prop | Passed from `capture-card.tsx` | No — always `null` due to hollow upstream | Falls back to plain text render — functional but no grounding highlights visible |
| `enrichment.ts` / `alignExtractions` | `aiResult.extractions` | Gemini/LM Studio categorization | Yes — real AI extractions when key present | FLOWING |
| `createExtractionsBatch` | batch insert | `enrichCapture` pipeline | Yes — written to `capture_extractions` table | FLOWING (to DB, not to API response) |

**Root cause:** Extractions flow correctly through enrichment → `capture_extractions` table, but the captures list endpoint does not retrieve them. `listCaptures` has no LEFT JOIN with `capture_extractions`. The 33-02 summary explicitly acknowledges this: "The extractions/groundingData fields on CaptureItem will be `undefined` until the API enriches capture responses."

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 749 API tests pass | `pnpm --filter @mission-control/api exec vitest run` | 749 passed (63 test files) | PASS |
| All 109 web tests pass | `pnpm test` (web) | 109 passed | PASS |
| TypeScript compiles clean | `pnpm typecheck` | `ok (no errors)` | PASS |
| grounding.ts exports present | `grep -c export packages/api/src/services/grounding.ts` | 7 exports | PASS |
| imessage-monitor.ts exports present | `grep -c export packages/api/src/services/imessage-monitor.ts` | multiple exports | PASS |
| isCrawl4AIAvailable function exported | `grep isCrawl4AIAvailable packages/api/src/services/tweet-fetcher.ts` | found | PASS |
| Migration 0012 on disk | `ls packages/api/drizzle/0012_capture_intelligence.sql` | exists | PASS |
| Extraction badges hollow (data flow gap) | `grep -n "extractions\|groundingData" packages/api/src/db/queries/captures.ts` | no rows — listCaptures has no JOIN | FAIL |

---

### Requirements Coverage

Requirements CAP-01 through CAP-11 are defined in `.planning/v2.0-VISION.md` (not REQUIREMENTS.md, which covers v1.4 only). The authoritative source for phase 33 requirements is the ROADMAP.md success criteria and v2.0-VISION.md.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CAP-01 | 33-01 | Few-shot categorization with user-correctable examples | SATISFIED | `createFewShotExample` called on reassignment; `getFewShotExamplesForCategorization` injected into prompts in `enrichCapture` |
| CAP-02 | 33-01 | Multi-pass extraction: project refs, action items, ideas, links | SATISFIED | `createExtractionsBatch` stores 5-type extractions; `aiResult.extractions` returned with `extractionType` enum |
| CAP-03 | 33-01, 33-02 | Post-hoc grounding — highlight which words triggered each extraction | SATISFIED (storage) / PARTIAL (display) | `alignExtractions` computes grounding spans; stored in `grounding_json`; display blocked by API JOIN gap |
| CAP-04 | 33-01 | Confidence calibration from user feedback | SATISFIED | `recordCorrection` tracks per-project-pair correction stats; `GET /captures/correction-stats` returns calibration data |
| CAP-05 | 33-01 | Local LLM fallback for categorization when Gemini unavailable | SATISFIED | `callLMStudio` in `ai-categorizer.ts`; OpenAI-compatible `/v1/chat/completions`; 15s timeout; JSON mode |
| CAP-06 | 33-01, 33-02 | Prompt validation at startup | SATISFIED | `validatePromptExamples` called in startup setTimeout in `index.ts`; fire-and-forget |
| CAP-07 | 33-01 | Extraction types: project_ref, action_item, idea, link, question | SATISFIED | `extractionTypeValues` enum in `ai-categorizer.ts`; Zod schema enforces 5 types |
| CAP-08 | 33-03 | Capacities import bridge | SATISFIED | `importCapacitiesBackup` parses ZIP, classifies entries, dedupes by content hash; `POST /api/captures/import/capacities` |
| CAP-09 | 33-04 | iMessage passive monitoring | SATISFIED (code-complete) | `startIMessageMonitor` polls `chat.db` readonly; Apple timestamp conversion; `attributedBody` extraction; disabled by default (requires FDA) |
| CAP-10 | 33-03 | Tweet content fetching via Crawl4AI | SATISFIED | `fetchTweetContent` POSTs to Crawl4AI; OG scraper fallback; `batchFetchTweets` with rate limiting |
| CAP-11 | 33-03 | Batch-save UX — handle rapid-fire captures without friction | SATISFIED | Direct Drizzle insert bypasses per-item enrichment; p-limit concurrency; fire-and-forget async import returns 202 immediately |

**Orphaned requirements:** None — all CAP-01 through CAP-11 are claimed by plans and have implementation evidence.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/web/src/hooks/use-captures.ts` | 19-24 | `extractions?: string \| null` optional — always undefined from API | Warning | ExtractionBadges never render on capture cards (data flow gap, not a stub) |
| `packages/api/src/db/queries/captures.ts` | 43-79 | `listCaptures` queries captures table only — no JOIN with capture_extractions | Warning | API response missing extractions; root cause of data flow gap |

No TODO/FIXME/placeholder comments found in phase files. No empty implementations. The anti-patterns listed above are architectural gaps, not code quality issues.

---

### Human Verification Required

#### 1. iMessage Monitoring (FDA Required)

**Test:** Enable `ambientCapture.imessage.enabled: true` in `mc.config.json` with a real contact identifier (e.g., `+15551234567` or `bella@domain.com`). Restart API. Wait 5 minutes for first poll.
**Expected:** `curl http://localhost:3000/api/captures?limit=10` shows captures with `sourceType: "imessage"` containing message text with speaker attribution
**Why human:** Requires macOS Full Disk Access grant for Terminal/node in System Settings > Privacy & Security, and real contact configuration

#### 2. Capacities ZIP Import with Real Backup

**Test:** Confirm `~/Capacities_backup/Schedule #1 (829272da)/` has ZIP files. Run `curl -X POST http://localhost:3000/api/captures/import/capacities`. Check captures table for `sourceType: "capacities"` entries.
**Expected:** Import starts async, completes with imported/skipped counts logged, 800+ captures in DB
**Why human:** Real backup directory required; ZIP fixture tests cover logic but not real Capacities data format edge cases

#### 3. Tweet Content Fetch via Crawl4AI

**Test:** After Capacities import, run `curl -X POST http://localhost:3000/api/captures/import/tweets`. Check captures that were tweet URLs now have `linkTitle`/`linkDescription` populated.
**Expected:** Tweet URLs resolve to full text content; `fetchedVia: "crawl4ai"` in logs; batch respects 1-second delay
**Why human:** Requires Mac Mini Crawl4AI service running at `100.123.8.125:11235`; cannot stub from automated check

---

### Gaps Summary

One gap blocks goal achievement for Success Criterion #2 ("Action items and ideas auto-extracted and surfaced in project cards"):

**Extraction badges are hollow on live capture cards.** The full pipeline works correctly end-to-end through enrichment: captures are enriched, 5-type extractions are identified by AI, grounding spans are computed, and everything is stored in the `capture_extractions` table. However, the dashboard's `GET /api/captures` endpoint calls `listCaptures` which queries only the base `captures` table. There is no LEFT JOIN with `capture_extractions` to aggregate extractions per capture. As a result, `CaptureItem.extractions` is always `undefined` in the React frontend, so `ExtractionBadges` never renders any badges and `GroundedText` always falls back to plain text rendering.

The summary for Plan 33-02 explicitly acknowledges this gap: "The extractions/groundingData fields on CaptureItem will be `undefined` until the API enriches capture responses with aggregated extractions inline."

**Fix required:** Update `listCaptures` to LEFT JOIN `capture_extractions`, grouping extractions as a JSON array per capture; or add a batch query to the captures route that fetches extractions for all returned captures and merges them before the response.

All other Success Criteria are fully satisfied with 749 API + 109 web tests passing and TypeScript compiling clean.

---

_Verified: 2026-03-23T11:13:02Z_
_Verifier: Claude (gsd-verifier)_
