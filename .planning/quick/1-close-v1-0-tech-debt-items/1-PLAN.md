---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/web/src/hooks/use-projects.ts
  - packages/web/src/hooks/use-project-detail.ts
  - packages/web/src/hooks/use-captures.ts
  - packages/web/src/hooks/use-capture-submit.ts
  - packages/web/src/hooks/use-search.ts
  - packages/web/src/hooks/use-heatmap.ts
  - packages/web/src/hooks/use-health.ts
  - packages/api/src/db/queries/search.ts
  - packages/api/src/routes/captures.ts
  - packages/api/src/index.ts
  - packages/api/src/services/enrichment.ts
  - packages/web/src/app.css
autonomous: true
requirements: []
must_haves:
  truths:
    - "All frontend API calls use Hono RPC client instead of plain fetch()"
    - "No dead searchCaptures function exists in the codebase"
    - "Archive PATCH handler has a code comment explaining why deindexCapture is NOT called"
    - "All log/error messages referencing the AI API key use consistent GEMINI_API_KEY naming"
    - "Triage modal CSS animations have a code comment explaining why they are intentionally kept"
  artifacts:
    - path: "packages/web/src/api/client.ts"
      provides: "Hono RPC client (already exists, consumed by hooks after migration)"
    - path: "packages/api/src/db/queries/search.ts"
      provides: "Unified search without deprecated searchCaptures bridge"
    - path: "packages/api/src/routes/captures.ts"
      provides: "Archive PATCH with intentional deindex comment"
  key_links:
    - from: "packages/web/src/hooks/*.ts"
      to: "packages/web/src/api/client.ts"
      via: "import { client } from '../api/client.js'"
      pattern: "client\\.api"
---

<objective>
Close all 5 tech debt items identified in the v1.0 milestone audit.

Purpose: Clean up documented tech debt before moving to v2 features. All items are non-blocking cosmetic/hygiene issues.
Output: Zero tech debt items remaining from v1.0 audit.
</objective>

<execution_context>
@/Users/ryanstern/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ryanstern/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/v1.0-MILESTONE-AUDIT.md
@packages/web/src/api/client.ts
@packages/api/src/db/queries/search.ts
@packages/api/src/routes/captures.ts
@packages/api/src/index.ts
@packages/api/src/services/enrichment.ts
@packages/web/src/app.css

<interfaces>
<!-- Hono RPC client already exists and is typed -->
From packages/web/src/api/client.ts:
```typescript
import { hc } from "hono/client";
import type { AppType } from "@mission-control/api";
export const client = hc<AppType>(import.meta.env.DEV ? "http://localhost:3000" : "");
```

From packages/api/src/db/queries/search.ts (lines 220-243, to be DELETED):
```typescript
/** @deprecated Use searchUnified instead. */
export function searchCaptures(sqlite, query, limit): SearchResult[]
```
Note: searchCaptures has ZERO imports in packages/api/src/ — it is dead code. No tests reference it either.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migrate all hooks from plain fetch() to Hono RPC client</name>
  <files>
    packages/web/src/hooks/use-projects.ts
    packages/web/src/hooks/use-project-detail.ts
    packages/web/src/hooks/use-captures.ts
    packages/web/src/hooks/use-capture-submit.ts
    packages/web/src/hooks/use-search.ts
    packages/web/src/hooks/use-heatmap.ts
    packages/web/src/hooks/use-health.ts
  </files>
  <action>
    Replace all plain `fetch()` calls in hooks with the existing Hono RPC client (`client` from `../api/client.js`).

    The RPC client is already set up at `packages/web/src/api/client.ts` using `hc<AppType>`. Each hook currently does `fetch("/api/...")` -- replace with the typed `client.api.*` equivalent.

    Migration pattern for each hook:
    1. Add `import { client } from "../api/client.js";`
    2. Replace `fetch("/api/projects")` with `client.api.projects.$get()`
    3. Replace `fetch("/api/projects/${slug}")` with `client.api.projects[":slug"].$get({ param: { slug } })`
    4. Replace `fetch("/api/captures?...")` with `client.api.captures.$get({ query: { ... } })`
    5. Replace `fetch("/api/captures", { method: "POST", ... })` with `client.api.captures.$post({ json: { ... } })`
    6. Replace `fetch("/api/captures/stale")` with `client.api.captures.stale.$get()`
    7. Replace `fetch("/api/search?q=...")` with `client.api.search.$get({ query: { q: ... } })`
    8. Replace `fetch("/api/heatmap?weeks=12")` with `client.api.heatmap.$get({ query: { weeks: "12" } })`
    9. Replace `fetch("/api/health/system")` with `client.api.health.system.$get()`

    For response handling: Hono RPC `.json()` returns typed data directly. Replace `const data = await res.json()` with `const data = await res.json()` (same API, but now typed). Keep error handling patterns (check `res.ok` before parsing).

    Preserve all existing behavior: AbortController signals, error handling, loading states. The RPC client accepts the same `init` options as fetch (including `signal` for AbortController).

    For AbortController usage (use-project-detail.ts, use-search.ts): pass `{ init: { signal } }` as part of the Hono client call options -- Hono RPC's `$get()` accepts fetch RequestInit via the second positional argument or via `init` key in the options object. The pattern is: `client.api.projects[":slug"].$get({ param: { slug } }, { init: { signal } })`.

    IMPORTANT: Do NOT change any hook signatures, return types, or external behavior. This is a pure internal refactor.
  </action>
  <verify>
    <automated>cd /Users/ryanstern/mission-control && pnpm typecheck && pnpm test</automated>
  </verify>
  <done>All 7 hooks use `client.api.*` instead of `fetch()`. Zero plain fetch() calls remain in hooks directory. TypeScript compiles clean. All 135 tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Close 4 surgical tech debt items (dead code, comments, naming)</name>
  <files>
    packages/api/src/db/queries/search.ts
    packages/api/src/routes/captures.ts
    packages/api/src/index.ts
    packages/api/src/services/enrichment.ts
    packages/web/src/app.css
  </files>
  <action>
    Four small surgical edits:

    **A. Delete dead searchCaptures function** (`packages/api/src/db/queries/search.ts`):
    - Delete the entire deprecated `searchCaptures` function (lines 220-243 including the JSDoc comment).
    - Also delete the `SearchResult` interface if it exists solely for this function (check -- if other code uses it, leave it).
    - Verify: no imports of `searchCaptures` exist anywhere in `packages/api/src/` (already confirmed -- zero imports).

    **B. Add CAPT-08 intentional behavior comment** (`packages/api/src/routes/captures.ts`):
    - In the PATCH `/captures/:id` handler, above the `if (data.status === "archived")` block (around line 119), add this comment:
    ```
    // CAPT-08: Archived captures intentionally remain in the search index.
    // deindexCapture is NOT called here -- this preserves searchability per CAPT-08.
    // The DELETE handler below DOES call deindexCapture (permanent removal).
    ```

    **C. Standardize GEMINI_API_KEY naming in messages** (`packages/api/src/index.ts` and `packages/api/src/services/enrichment.ts`):
    - In `packages/api/src/index.ts` line 21: Change the warning message from `"Warning: GEMINI_API_KEY not set — AI enrichment will be disabled"` to `"Warning: GEMINI_API_KEY not set — AI enrichment and smart search will be disabled"`. The env var is GEMINI_API_KEY (what users set), so keep that name in user-facing messages. Add a code comment above line 13 explaining the mapping:
    ```
    // User sets GEMINI_API_KEY in .env; @ai-sdk/google expects GOOGLE_GENERATIVE_AI_API_KEY.
    // We map one to the other at startup. All user-facing messages reference GEMINI_API_KEY.
    ```
    - In `packages/api/src/services/enrichment.ts` line 52: The reasoning message `"AI categorization skipped — no GEMINI_API_KEY configured"` already uses GEMINI_API_KEY -- this is correct. No change needed here.

    **D. Add triage animation comment** (`packages/web/src/app.css`):
    - Above the `/* Triage modal animations */` comment (line 91), add:
    ```
    /*
     * NOTE: These animations are intentionally kept for the triage modal.
     * The command palette had similar animations removed (04-03) because they
     * caused a white flash on mode switch. The triage modal has no mode switch,
     * so the entrance animations work correctly here.
     */
    ```
  </action>
  <verify>
    <automated>cd /Users/ryanstern/mission-control && pnpm typecheck && pnpm test</automated>
  </verify>
  <done>searchCaptures function deleted from search.ts. CAPT-08 comment present on PATCH archive handler. GEMINI_API_KEY naming consistent with explanatory comment. Triage animation CSS has intentionality comment. TypeScript compiles clean. All tests pass.</done>
</task>

</tasks>

<verification>
1. `pnpm typecheck` -- all packages compile clean
2. `pnpm test` -- all 135 tests pass
3. `grep -r "searchCaptures" packages/api/src/` -- returns zero results
4. `grep -r "plain fetch\|fetch(" packages/web/src/hooks/` -- returns zero plain fetch calls (only RPC client usage)
5. `grep "CAPT-08" packages/api/src/routes/captures.ts` -- comment present
6. `grep "intentionally kept" packages/web/src/app.css` -- comment present
</verification>

<success_criteria>
All 5 tech debt items from v1.0-MILESTONE-AUDIT.md are closed:
1. All hooks use Hono RPC client (zero plain fetch calls in hooks)
2. searchCaptures dead code removed
3. CAPT-08 archive behavior documented in code
4. GEMINI_API_KEY naming standardized with explanatory comment
5. Triage modal animation intentionality documented
TypeScript compiles clean. All 135 tests pass. Zero new regressions.
</success_criteria>

<output>
After completion, create `.planning/quick/1-close-v1-0-tech-debt-items/1-SUMMARY.md`
</output>
