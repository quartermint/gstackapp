# Phase 4: Search & Intelligence - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

User can find anything they ever captured or committed using natural language from the command palette. The system becomes retrievable memory, not just a capture dump. Covers SRCH-01 (natural language search from command palette), SRCH-02 (ranked results with source type), and SRCH-03 (AI-powered contextual results beyond keyword matching).

Not in scope: vector/embedding search (v2 AINT-01), dedicated search page, search history, CLI/MCP search, saved searches.

</domain>

<decisions>
## Implementation Decisions

### AI search approach
- AI query rewriter: user types natural language, AI rewrites into optimized FTS5 query + extracts structured filters (project, date range, type)
- Smart detection heuristic: short keyword queries (1-2 words, no question words) go straight to FTS5; longer or question-like queries ("what did I...", "find my...") route through AI rewriter
- Graceful fallback: when AI is unavailable (no API key, rate limit, error), pass query directly to FTS5 keyword search — matches Phase 3 pattern of graceful AI degradation
- No re-ranking or vector search — AI rewriter is the intelligence layer

### Search scope & indexing
- Unified FTS5 index: single `search_index` FTS5 table indexing captures, project metadata, AND commit messages with BM25 ranking
- Persist commits to SQLite: project scanner writes last 50 commits per project to a `commits` table, FTS5 indexes them alongside captures
- Project metadata fields indexed: name, tagline, GSD state/phase info
- One query, mixed results — unified ranking across all source types

### Result presentation
- Flat ranked list with source type badges (capture/commit/project) — no grouping by type, relevance-first ordering
- Content snippet (~80 chars) with query term highlighting + source type badge + relative timestamp per result
- AI-extracted filters shown as subtle dismissible chips below the search input ("project: openefb", "type: link", "last 30 days") — transparent but not intrusive
- Select result → navigate to context: captures and commits swap hero to their project, project results swap hero to that project

### Search surface
- Command palette only (? prefix) — no dedicated dashboard search section
- No search history — palette is transient (find, navigate, done)
- ? prefix is the only way to trigger search — no auto-detect from default capture mode
- No new keyboard shortcut required — Cmd+K then ? is the primary flow (consistent with existing palette model)
- Optional: Cmd+/ could open palette pre-filled with ? for one-step search access — add if implementation is trivial

### Claude's Discretion
- Smart detection heuristic implementation (what counts as "question-like" vs keyword)
- FTS5 unified index schema design (content, source_type, source_id columns)
- AI rewriter prompt engineering
- Commit deduplication strategy on re-scan
- Filter chip component design
- Query term highlighting approach in snippets
- How project metadata is inserted/updated in the search index

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/api/src/db/queries/search.ts`: Existing FTS5 search with BM25 ranking and query sanitization — extend to unified index
- `packages/api/src/services/ai-categorizer.ts`: Vercel AI SDK + Gemini 3 Flash pattern with structured output (Zod schema) — reuse for AI query rewriter
- `packages/web/src/components/command-palette/command-palette.tsx`: Search mode (? prefix) already wired with debounced fetch, result rendering, and project navigation on select
- `packages/api/src/services/project-scanner.ts`: Git scanner with child_process.execFile — already reads commits, needs to persist them
- `packages/api/src/lib/errors.ts`: AppError class for structured error handling
- `packages/shared/src/schemas/capture.ts`: Zod schema patterns for API validation

### Established Patterns
- FTS5 via raw better-sqlite3 SQL (Drizzle has no virtual table support)
- Query function DI: all query functions accept db as first parameter
- cmdk shouldFilter disabled in search mode (API-driven results)
- Vercel AI SDK `generateText` with `Output.object` for structured AI responses
- `isAIAvailable()` guard pattern for graceful AI degradation
- TTL cache as simple Map with timestamp entries for scan data
- Zod schema-first: TypeScript types derived from schemas via z.infer

### Integration Points
- `/api/search` route: currently calls `searchCaptures()` — will call unified search function instead
- Command palette search mode: fetches from `/api/search`, renders results, handles selection → already built, needs enhanced result format
- Project scanner poll cycle (setInterval, 5-10 min): needs to persist commits to SQLite on each scan
- AI categorizer's Gemini model + API key env vars: reused for AI query rewriter

</code_context>

<specifics>
## Specific Ideas

- "Retrievable memory" — the system should feel like an extension of your brain. You captured it, you can find it, even if you don't remember the exact words
- AI filter chips make the AI transparent without being noisy — user sees what the AI understood and can dismiss to broaden
- The ? prefix model is clean: Cmd+K → ? → natural language question → results → click to navigate. No mode confusion with capture
- Graceful degradation mirrors Phase 3: AI enrichment skips gracefully when unavailable, search does the same

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-search-intelligence*
*Context gathered: 2026-03-09*
