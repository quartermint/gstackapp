---
phase: quick
plan: 260323-iru
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/api/src/services/chat-tools.ts
  - packages/api/src/db/queries/captures.ts
  - packages/api/src/routes/captures.ts
  - packages/api/src/services/rrf-fusion.ts
  - packages/api/src/__tests__/services/rrf-fusion.test.ts
  - packages/api/src/services/insight-generator.ts
  - packages/web/src/components/digest/daily-digest.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Bella searchMC tool returns hybrid search results (vector + BM25 + RRF)"
    - "GET /api/captures returns extraction data alongside captures"
    - "Stale capture insight and triage view use the same 14-day threshold"
    - "No orphaned dead code files remain from v2.0 phases"
  artifacts:
    - path: "packages/api/src/services/chat-tools.ts"
      provides: "hybridSearch wiring in searchMC tool"
      contains: "hybridSearch"
    - path: "packages/api/src/db/queries/captures.ts"
      provides: "LEFT JOIN with capture_extractions"
      contains: "captureExtractions"
  key_links:
    - from: "packages/api/src/services/chat-tools.ts"
      to: "packages/api/src/services/hybrid-search.ts"
      via: "import hybridSearch"
      pattern: "hybridSearch\\(sqlite,\\s*db"
    - from: "packages/api/src/db/queries/captures.ts"
      to: "packages/api/src/db/schema.ts"
      via: "LEFT JOIN captureExtractions"
      pattern: "captureExtractions"
---

<objective>
Fix all 5 functional tech debt items from the v2.0 milestone audit.

Purpose: Close the gap between what v2.0 shipped and what works end-to-end. The two critical items (searchMC wiring, extraction display) restore broken data flows. The remaining three are cleanup (dead code, threshold alignment).
Output: 5 atomic commits, each fixing one debt item. Zero broken tests, typecheck clean.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/v2.0-MILESTONE-AUDIT.md
@packages/api/src/services/chat-tools.ts
@packages/api/src/services/hybrid-search.ts
@packages/api/src/db/queries/captures.ts
@packages/api/src/db/schema.ts
@packages/api/src/services/insight-generator.ts
@packages/web/src/components/digest/daily-digest.tsx

<interfaces>
From packages/api/src/services/hybrid-search.ts:
```typescript
export interface HybridSearchResult {
  id: string;
  content: string;
  snippet: string;
  sourceType: SearchSourceType;
  sourceId: string;
  projectSlug: string | null;
  rank: number;
  createdAt: string;
  bm25Score: number | null;
  vectorScore: number | null;
  fusedScore: number | null;
  projectContext?: string;
}

export interface HybridSearchResponse {
  results: HybridSearchResult[];
  searchMode: "hybrid" | "bm25-only";
  filters: SearchFilters | null;
  rewrittenQuery: string | null;
}

export async function hybridSearch(
  sqlite: Database.Database,
  db: DrizzleDb,
  rawQuery: string,
  options?: HybridSearchOptions
): Promise<HybridSearchResponse>;
```

From packages/api/src/services/chat-tools.ts:
```typescript
export function createChatTools(dbInstance: DatabaseInstance, userId: string) {
  const { db, sqlite } = dbInstance;
  // ... tool definitions
}
```

From packages/api/src/db/schema.ts:
```typescript
export const captureExtractions = sqliteTable("capture_extractions", {
  id: text("id").primaryKey(),
  captureId: text("capture_id").notNull(),
  extractionType: text("extraction_type", {
    enum: ["project_ref", "action_item", "idea", "link", "question"],
  }).notNull(),
  content: text("content").notNull(),
  confidence: real("confidence").notNull().default(0),
  groundingJson: text("grounding_json"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire searchMC to hybridSearch (CRITICAL — fixes BELLA-07)</name>
  <files>packages/api/src/services/chat-tools.ts</files>
  <action>
    1. Replace `import { searchUnified } from "../db/queries/search.js"` with `import { hybridSearch } from "./hybrid-search.js"`
    2. Make `searchMCImpl` async — change signature to `async function searchMCImpl(sqlite: Database.Database, db: DrizzleDb, query: string)`
    3. Call `const response = await hybridSearch(sqlite, db, query, { limit: 10 })` instead of `searchUnified(sqlite, query, { limit: 10 })`
    4. Map over `response.results` instead of `results` — the HybridSearchResult has the same `snippet`, `sourceType`, `projectSlug`, `rank` fields, plus extras (`fusedScore`, `projectContext`, `searchMode`)
    5. Include `projectContext` and `searchMode` in the return so the LLM gets richer context for grounded answers:
       ```typescript
       return {
         searchMode: response.searchMode,
         query: response.rewrittenQuery ?? query,
         results: response.results.map((r) => ({
           snippet: r.snippet,
           sourceType: r.sourceType,
           projectSlug: r.projectSlug,
           rank: r.rank,
           projectContext: r.projectContext ?? null,
         })),
       };
       ```
    6. Update the `searchMC` tool's `execute` call at line ~240 from `searchMCImpl(sqlite, args.query)` to `searchMCImpl(sqlite, db, args.query)` (already destructured from dbInstance at line 201)
    7. Remove the now-unused `searchUnified` import (no other function in this file uses it)
  </action>
  <verify>
    <automated>cd /Users/ryanstern/mission-control && pnpm typecheck && pnpm test -- --filter chat</automated>
  </verify>
  <done>searchMC tool calls hybridSearch with both sqlite and db params. Typecheck passes. Bella's search now uses the full Phase 32 pipeline (vector search, RRF fusion, reranking, query expansion, context annotations).</done>
</task>

<task type="auto">
  <name>Task 2: Add LEFT JOIN with capture_extractions to listCaptures (fixes CAP-03)</name>
  <files>packages/api/src/db/queries/captures.ts, packages/api/src/routes/captures.ts</files>
  <action>
    1. In `packages/api/src/db/queries/captures.ts`, import `captureExtractions` from the schema and `eq` from drizzle-orm (eq likely already imported)
    2. After the main `listCaptures` query returns results (line ~66), add a batch query to fetch extractions for all returned capture IDs:
       ```typescript
       const captureIds = results.map((c) => c.id);
       const extractions = captureIds.length > 0
         ? db.select().from(captureExtractions)
             .where(sql`${captureExtractions.captureId} IN (${sql.join(captureIds.map(id => sql`${id}`), sql`, `)})`)
             .all()
         : [];

       // Group extractions by captureId
       const extractionsByCapture = new Map<string, typeof extractions>();
       for (const ext of extractions) {
         const list = extractionsByCapture.get(ext.captureId) ?? [];
         list.push(ext);
         extractionsByCapture.set(ext.captureId, list);
       }
       ```
    3. Augment the returned captures with their extractions:
       ```typescript
       return {
         captures: results.map((c) => ({
           ...c,
           extractions: extractionsByCapture.get(c.id) ?? [],
         })),
         total: countResult?.count ?? 0,
       };
       ```
    4. Ensure the `sql` import from drizzle-orm is present (already used on line 65 for ORDER BY)
    5. Import `captureExtractions` from `"../schema.js"` if not already imported
    6. The route handler in `captures.ts` should not need changes -- it passes through whatever `listCaptures` returns, and the Zod response schema for CaptureItem already has `extractions` as optional (per Phase 33 decision: "CaptureItem extractions/groundingData/sourceType optional")
  </action>
  <verify>
    <automated>cd /Users/ryanstern/mission-control && pnpm typecheck && pnpm test -- --filter captures</automated>
  </verify>
  <done>GET /api/captures response includes `extractions` array on each capture. ExtractionBadges and GroundedText components can now render on live capture cards.</done>
</task>

<task type="auto">
  <name>Task 3: Delete orphaned rrf-fusion.ts and its test</name>
  <files>packages/api/src/services/rrf-fusion.ts, packages/api/src/__tests__/services/rrf-fusion.test.ts</files>
  <action>
    1. Delete `packages/api/src/services/rrf-fusion.ts` — this module is dead code; RRF logic was implemented directly in `hybrid-search.ts` (see `rrfScore` function at line 57 and the inline fusion in hybridSearch)
    2. Delete `packages/api/src/__tests__/services/rrf-fusion.test.ts` — the test file imports from the orphaned module
    3. Verify no other production code imports from `rrf-fusion` (already confirmed: only the test file imports it, and planning docs reference it)
  </action>
  <verify>
    <automated>cd /Users/ryanstern/mission-control && pnpm typecheck && pnpm test</automated>
  </verify>
  <done>rrf-fusion.ts and its test file deleted. No import errors. All remaining tests pass.</done>
</task>

<task type="auto">
  <name>Task 4: Align stale capture threshold to 14 days</name>
  <files>packages/api/src/services/insight-generator.ts</files>
  <action>
    1. In `insight-generator.ts`, change `const STALE_CAPTURE_DAYS = 7` (line 23) to `const STALE_CAPTURE_DAYS = 14`
    2. Update the insight body text at line ~88 from "older than 7 days" to "older than 14 days"
    3. This aligns with `getStaleCaptures` default of `daysThreshold = 14` in `captures.ts` line 153
    4. 14 days is the more reasonable threshold — 7 days was overly aggressive and caused the UX inconsistency where triage view showed more captures than the insight claimed
  </action>
  <verify>
    <automated>cd /Users/ryanstern/mission-control && pnpm typecheck && pnpm test -- --filter insight</automated>
  </verify>
  <done>Both insight-generator and getStaleCaptures use 14-day threshold. Insight count matches triage view count.</done>
</task>

<task type="auto">
  <name>Task 5: Delete orphaned DailyDigestPanel component</name>
  <files>packages/web/src/components/digest/daily-digest.tsx</files>
  <action>
    1. Delete `packages/web/src/components/digest/daily-digest.tsx` — this component was replaced by `DigestStripView` in `packages/web/src/components/whats-new/digest-strip-view.tsx` during Phase 37
    2. Already confirmed: `DailyDigestPanel` is NOT imported by any other file (grep shows zero imports)
    3. Check if the `digest/` directory is now empty after deletion. If so, delete the empty directory too
  </action>
  <verify>
    <automated>cd /Users/ryanstern/mission-control && pnpm typecheck && pnpm build</automated>
  </verify>
  <done>DailyDigestPanel file deleted. No import errors. Build succeeds. DigestStripView in whats-new/ is the sole digest rendering component.</done>
</task>

</tasks>

<verification>
After all 5 tasks:
1. `pnpm typecheck` — zero errors across all packages
2. `pnpm test` — all 1057+ tests pass (minus the deleted rrf-fusion tests)
3. `pnpm build` — clean build for both API and web packages
4. No orphaned imports or dead code references remain
</verification>

<success_criteria>
- searchMC tool calls hybridSearch (not searchUnified) — Bella gets vector+BM25+RRF results
- GET /api/captures includes extractions array — ExtractionBadges render on capture cards
- rrf-fusion.ts and its test deleted — no orphaned dead code
- Stale capture threshold aligned at 14 days in both insight-generator and getStaleCaptures
- DailyDigestPanel deleted — no orphaned component files
- All tests pass, typecheck clean, build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/260323-iru-fix-all-functional-tech-debt-from-v2-0-a/260323-iru-SUMMARY.md`
</output>
