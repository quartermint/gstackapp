# Phase 19: GitHub Star Intelligence - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Sync GitHub stars, persist with metadata, AI intent categorization (reference/tool/try/inspiration), hourly sync timer, user intent override, star-to-project linking via remote URL. No dashboard UI — that's Phase 21.

</domain>

<decisions>
## Implementation Decisions

### Star sync behavior
- Fetch via `gh api --paginate user/starred` with `Accept: application/vnd.github.v3.star+json` header for starred_at timestamps
- Persist-first, enrich-later: stars hit SQLite immediately, AI categorization runs async (same pattern as capture categorizer)
- Sync timer: every 6 hours (stars don't change fast)
- Incremental sync: only fetch stars newer than last sync timestamp
- Rate limit guard: check `gh api rate_limit` before sync, abort if <500 remaining (protect existing project scan budget)

### AI categorization
- 4 intent categories: reference (read later), tool (use this), try (experiment), inspiration (design/architecture reference)
- Same Gemini structured output pattern as ai-categorizer.ts: `generateText + Output.object`
- Input: repo description + topics + language. NOT full README (too expensive for bulk categorization)
- Graceful fallback when Gemini unavailable: star persisted with intent=null, categorized on next successful sync
- Confidence threshold: same 0.6 as capture categorizer

### User override
- PATCH endpoint to update intent category manually
- Override sets aiConfidence to null (signals human decision, not AI)
- Override persists across re-syncs (human decision is final)

### Star-to-project linking
- Match star fullName (owner/repo) against tracked projects' remote URLs using normalizeRemoteUrl
- When match found: star record stores projectSlug reference
- Enables "you starred this 3 weeks ago, now it's cloned locally" connections

### Claude's Discretion
- Exact Gemini prompt for intent categorization
- API route design for stars endpoints
- SSE event structure for star:synced events
- Batch size for AI categorization (rate limiting Gemini calls)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AI categorization pattern
- `packages/api/src/services/ai-categorizer.ts` — Gemini structured output, confidence threshold, fallback pattern
- `packages/api/src/services/enrichment.ts` — Async enrichment queue pattern (persist-first)

### GitHub API
- `packages/api/src/services/project-scanner.ts` — `gh api` execFile pattern, timeout handling

### Star schema
- `packages/api/src/db/schema.ts` (Phase 16) — Stars table definition
- `packages/api/src/services/git-health.ts` — `normalizeRemoteUrl()` for star-to-project matching

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ai-categorizer.ts`: Complete pattern for Gemini structured output with Zod schema, confidence scoring, fallback
- `enrichment.ts`: queueMicrotask-based async enrichment (persist first, enrich later)
- `normalizeRemoteUrl()` for matching star repos to local clones

### Established Patterns
- AI enrichment is fire-and-forget via queueMicrotask
- Confidence threshold at 0.6, below = null assignment
- GitHub API calls via `execFile('gh', ['api', ...])` with timeout

### Integration Points
- New star service with its own setInterval timer (6 hours)
- Star routes register in app.ts (extend Hono RPC chain)
- SSE events for star:synced and star:categorized

</code_context>

<specifics>
## Specific Ideas

No specific requirements — mirror the capture categorization pattern exactly for star intent categorization.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-github-star-intelligence*
*Context gathered: 2026-03-16*
