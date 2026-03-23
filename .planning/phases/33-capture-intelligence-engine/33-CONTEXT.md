# Phase 33: Capture Intelligence Engine - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform capture enrichment from single-shot Gemini classification into a multi-signal intelligence pipeline: few-shot categorization with user corrections, multi-pass extraction, post-hoc grounding, and three new ambient capture sources (Capacities import, iMessage monitoring, tweet content fetching).

</domain>

<decisions>
## Implementation Decisions

### Categorization
- **D-01:** Few-shot categorization with user-correctable examples. User corrections stored as new few-shot examples in database (not config file). Examples evolve over time.
- **D-02:** Local LLM fallback — LM Studio serves as backup enrichment engine when Gemini is unreachable. Same few-shot prompt, different model.
- **D-03:** Prompt validation at startup — verify few-shot examples still produce correct extractions (like langextract's pre-flight check).

### Grounding
- **D-04:** Post-hoc grounding IS in scope — highlight which words in capture text triggered each extraction. Deterministic alignment (like langextract's difflib approach), not LLM-generated offsets. User said "that sounds cool" after explanation.
- **D-05:** Display as inline highlights on capture text (like search result snippets with marked terms).

### User Corrections
- **D-06:** Click project badge → dropdown reassign. Simple, direct, no gestures.
- **D-07:** Corrections tracked per project to calibrate confidence thresholds over time.

### Extraction Types
- **D-08:** Multi-pass extraction: project_ref, action_item, idea, link, question. Not just "which project" but "what kind of capture and what should happen next."

### Ambient Capture: Capacities Bridge
- **D-09:** Import from ~/Capacities_backup/ daily backup ZIPs. Ongoing bridge until MC replaces Capacities.
- **D-10:** Tweet content fetching via Crawl4AI (already running on Mac Mini Docker). Resolve bare URLs to full tweet text + thread context. 644 tweets need content.
- **D-11:** Batch-save UX must handle rapid-fire captures (42-tweet mega-batch pattern). Pipeline handles bursts gracefully.

### Ambient Capture: iMessage Monitoring
- **D-12:** Start with Bella only, configurable contacts in mc.config.json. Full integration from day one.
- **D-13:** chat.db polling on Mac Mini (if Messages synced via iCloud) or MacBook helper app. Needs Full Disk Access.
- **D-14:** Extract action items, ideas, project references from conversations. Surface as captures with "from conversation with Bella" attribution.

### Claude's Discretion
- Multi-pass extraction implementation details
- Grounding alignment algorithm choice (difflib equivalent in JS)
- Capacities ZIP parsing and data mapping
- iMessage chat.db schema navigation and polling interval
- Confidence threshold tuning
- Heuristic for what constitutes a "significant" capture extraction

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision
- `.planning/v2.0-VISION.md` — Full v2.0 vision with CAP-01 through CAP-11 requirements

### Current Capture Pipeline
- `packages/api/src/services/enrichment.ts` — Current async enrichment pipeline
- `packages/api/src/services/ai-categorizer.ts` — Current Gemini categorization (to be evolved)
- `packages/api/src/services/link-extractor.ts` — OG scraping (keep as-is)
- `packages/api/src/routes/captures.ts` — Capture creation route

### Capture Schema
- `packages/api/src/db/schema.ts` — captures table schema
- `packages/shared/src/schemas/` — Zod schemas for captures

### iMessage
- `~/Library/Messages/chat.db` — macOS iMessage SQLite database (TCC-protected)

### Capacities
- `~/Capacities_backup/Schedule #1 (829272da)/` — Automated daily backup ZIPs
- Structure: `Ryan's Brain/{Tweets,Weblinks,DailyNotes,People,Projects}/` as markdown with YAML frontmatter

### Inspiration
- google/langextract — Few-shot extraction, post-hoc grounding via difflib, prompt validation
- IdentityVault insight: iMessage histories should map people first, then email supplements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `enrichment.ts` — "persist first, enrich later" pattern with queueMicrotask
- `ai-categorizer.ts` — Gemini structured output with confidence threshold (0.6)
- `link-extractor.ts` — OG scraper for URL metadata
- Phase 32's job queue — reuse for batch embedding of Capacities imports

### Established Patterns
- Status progression: raw → pending_enrichment → enriched
- Fire-and-forget async enrichment via queueMicrotask
- User override preservation — AI suggestion doesn't overwrite explicit projectId
- SSE events for real-time capture updates

### Integration Points
- `POST /api/captures` — extend to accept ambient capture sources (Capacities, iMessage)
- `packages/web/src/components/capture/` — capture-card.tsx for grounding display
- Capture table needs new columns: `sourceType` (manual/capacities/imessage), `groundingData` (JSON)
- mc.config.json — add `ambientCapture` section for iMessage contacts and Capacities path

</code_context>

<specifics>
## Specific Ideas

- langextract's grounding tiers: MATCH_EXACT → MATCH_LESSER → MATCH_FUZZY → ungrounded. Apply same cascade for confidence in word-level highlighting.
- Capacities tweets are "Untitled (N).md" files with just URL + handle + date in YAML frontmatter. Need to fetch actual content from each URL.
- The Jan 6 mega-batch (42 tweets at 12:49pm) means the import pipeline needs to handle hundreds of items without blocking the API.
- iMessage chat.db uses Apple's proprietary date format (Core Data timestamp: seconds since 2001-01-01). Conversion needed.

</specifics>

<deferred>
## Deferred Ideas

- IdentityVault integration — iMessage data feeds both MC captures and IV people graph. Coordinate when both projects are active.
- Screenshot OCR capture from iOS — deferred from v1.4, remains deferred
- Auto-promote captures to tasks — MC captures, it doesn't manage tasks

</deferred>

---

*Phase: 33-capture-intelligence-engine*
*Context gathered: 2026-03-22*
