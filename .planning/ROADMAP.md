# Roadmap: Mission Control

## Milestones

- v1.0 MVP (Phases 1-5) - Shipped 2026-03-10
- v1.1 Git Health Intelligence + MCP (Phases 6-10) - Shipped 2026-03-15
- v1.2 Session Orchestrator + Local LLM Gateway (Phases 11-15) - Shipped 2026-03-16
- v1.3 Auto-Discovery + Session Enrichment + CLI (Phases 16-22) - Shipped 2026-03-17
- v1.4 Cross-Project Intelligence + iOS Companion + Knowledge Unification (Phases 23-31) - Shipped 2026-03-23
- **v2.0 Intelligence Engine** (Phases 32-37) - In Progress

## Phases

<details>
<summary>v1.0 MVP (Phases 1-5) - SHIPPED 2026-03-10</summary>
See .planning/milestones/v1.0/
</details>

<details>
<summary>v1.1 Git Health Intelligence + MCP (Phases 6-10) - SHIPPED 2026-03-15</summary>
See .planning/milestones/v1.1/
</details>

<details>
<summary>v1.2 Session Orchestrator + Local LLM Gateway (Phases 11-15) - SHIPPED 2026-03-16</summary>
See .planning/milestones/v1.2/
</details>

<details>
<summary>v1.3 Auto-Discovery + Session Enrichment + CLI (Phases 16-22) - SHIPPED 2026-03-17</summary>
See .planning/milestones/v1.3/
</details>

<details>
<summary>v1.4 Cross-Project Intelligence + iOS Companion + Knowledge Unification (Phases 23-31) - SHIPPED 2026-03-23</summary>
See .planning/milestones/v1.4/
</details>

### v2.0 Intelligence Engine

**Milestone Goal:** Transform MC from a monitoring platform into a personal intelligence daemon — hybrid search, capture intelligence with ambient sources, knowledge compounding, and proactive AI-generated insights powered by local LLM.

**Vision document:** `.planning/v2.0-VISION.md`

- [ ] **Phase 32: Hybrid Search Intelligence** - sqlite-vec + BM25/vector fusion + local query expansion via LM Studio
- [ ] **Phase 33: Capture Intelligence Engine** - Few-shot categorization, grounding, Capacities import, iMessage monitoring, tweet content fetching
- [ ] **Phase 34: Knowledge Compounding** - Solutions registry auto-populated from Claude Code sessions, learnings surface at startup
- [ ] **Phase 35: Active Intelligence Daemon** - LM Studio activated for narratives, routing, digests, constrained generation, tool calling
- [ ] **Phase 36: iOS Edge Intelligence** - Foundation Models on-device classification, pre-sync enrichment, offline intelligence
- [ ] **Phase 37: Proactive Intelligence** - Morning digest, stale capture triage, activity patterns, cross-project insights
- [ ] **Phase 38: Bella Client** - Second lightsaber: chat-first "Ryan interpreter" for Bella, teaching her to build on MC's platform

## Phase Details

### Phase 32: Hybrid Search Intelligence
**Goal**: User can search across all MC content (captures, commits, knowledge, solutions) with semantic understanding — not just keyword matching — powered entirely by local models
**Depends on**: v1.4 complete
**Requirements**: SRCH-01 through SRCH-07
**Success Criteria** (what must be TRUE):
  1. Semantic query "how does the capture pipeline work" returns relevant results even without keyword matches
  2. Search results include fused BM25 + vector scores via Reciprocal Rank Fusion
  3. LM Studio generates query expansions locally (no Gemini dependency for search)
  4. CLAUDE.md content searchable through unified search (not separate LIKE query)
  5. Content-addressable storage prevents duplicate embeddings
**Plans**: TBD

### Phase 33: Capture Intelligence Engine
**Goal**: Captures are deeply understood — multi-pass extraction with grounding, user-correctable few-shot examples, and ambient capture from Capacities and iMessage
**Depends on**: Phase 32 (uses vector search for categorization)
**Requirements**: CAP-01 through CAP-11
**Success Criteria** (what must be TRUE):
  1. User corrections to AI categorization improve future predictions
  2. Action items and ideas auto-extracted and surfaced in project cards
  3. Capacities import enriches 800+ existing bookmarks with context and project assignment
  4. iMessage conversations with Bella surface as captures before Ryan opens MC
  5. Tweet URLs resolve to full text content via Crawl4AI
  6. Enrichment works offline using LM Studio when Gemini is unreachable
**Plans**: TBD

### Phase 34: Knowledge Compounding
**Goal**: Every Claude Code session leaves the system smarter — solutions registry auto-populated from session outcomes, learnings surface in future sessions
**Depends on**: Phase 32 (solutions indexed in hybrid search)
**Requirements**: COMP-01 through COMP-06
**Success Criteria** (what must be TRUE):
  1. Session stop hooks auto-generate solution docs from significant sessions
  2. Session startup MCP banner includes relevant past learnings
  3. Dashboard shows compound score (knowledge reuse rate over time)
  4. Solutions searchable through unified search and MCP tools
**Plans**: TBD

### Phase 35: Active Intelligence Daemon
**Goal**: LM Studio goes from passive health probe to active intelligence — generating narratives, digests, routing suggestions, and responding to tool calls
**Depends on**: Phase 32, Phase 34
**Requirements**: DAEMON-01 through DAEMON-08
**Success Criteria** (what must be TRUE):
  1. Opening a project card shows AI-generated "Previously on..." narrative (local LLM)
  2. Session startup banner includes routing suggestion based on historical patterns
  3. Daily digest generated at 6am with overnight activity summary
  4. All local LLM outputs use JSON schema constrained generation
  5. Intelligence generation never blocks API responses (cached + async)
**Plans**: TBD

### Phase 36: iOS Edge Intelligence
**Goal**: iOS companion uses Apple Foundation Models for on-device capture classification, reducing Mac Mini load and enabling fully offline capture intelligence
**Depends on**: v1.4 Phase 29-30 (iOS app must exist)
**Requirements**: EDGE-01 through EDGE-06
**Success Criteria** (what must be TRUE):
  1. Captures classified on-device within 2 seconds using Foundation Models
  2. High-confidence captures enriched entirely on-device, never hit Mac Mini for classification
  3. All capture processing works offline
  4. Capture metadata includes device context (location, time, source app)
**Plans**: TBD

### Phase 37: Proactive Intelligence
**Goal**: MC stops being pull-only — it generates morning digests, surfaces stale captures, detects activity patterns, and finds cross-project insights
**Depends on**: Phase 35 (daemon generates proactive content)
**Requirements**: PROACT-01 through PROACT-06
**Success Criteria** (what must be TRUE):
  1. Dashboard morning view shows AI-generated digest in evolved What's New strip
  2. Stale captures surface proactively with suggested actions
  3. Activity patterns visible without manual analysis
  4. Cross-project patterns detected and surfaced
  5. All proactive intelligence generated locally (no external API dependency)
**Plans**: TBD

### Phase 38: Bella Client
**Goal**: Bella has a dedicated chat-first MC client where she can see Ryan's project state, send captures, review iMessage extracts, and learn to build her own tools on the MC platform — the second lightsaber
**Depends on**: Phase 33 (iMessage captures), working iOS app
**Requirements**: BELLA-01 through BELLA-11
**Success Criteria** (what must be TRUE):
  1. Bella can ask "what's Ryan working on?" and get a contextual answer from MC data
  2. Bella can send captures into MC on Ryan's behalf
  3. Bella can see extracted action items from their iMessage conversations
  4. The client establishes the multi-user pattern for future team members
  5. Bella can use the platform knowledge to contribute to iOS app development
**Plans**: TBD

## Progress

**Execution Order:**
Phases 32-37 execute with noted parallelization:
- Phase 33 and 34 can run in parallel after Phase 32
- Phase 36 is independent (iOS track, requires v1.4 iOS phases shipped)
- Phase 35 depends on 32 + 34
- Phase 37 depends on 35
- Phase 38 depends on 33 (iMessage captures) + working iOS app

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 32. Hybrid Search Intelligence | v2.0 | 2/3 | In Progress|  |
| 33. Capture Intelligence Engine | v2.0 | 0/? | Not started | - |
| 34. Knowledge Compounding | v2.0 | 0/? | Not started | - |
| 35. Active Intelligence Daemon | v2.0 | 0/? | Not started | - |
| 36. iOS Edge Intelligence | v2.0 | 0/? | Not started | - |
| 37. Proactive Intelligence | v2.0 | 0/? | Not started | - |
| 38. Bella Client | v2.0 | 0/? | Not started | - |
