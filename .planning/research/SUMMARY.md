# Project Research Summary

**Project:** gstackapp (Cognitive Code Review Platform)
**Domain:** AI Code Review Platform (GitHub App + Claude Pipeline + Real-Time Dashboard)
**Researched:** 2026-03-30
**Confidence:** HIGH

## Executive Summary

gstackapp is a GitHub App that runs a 5-stage parallel AI review pipeline (CEO, Eng, Design, QA, Security) on every PR, streams progress to a real-time dashboard, and builds cross-repo intelligence via vector embeddings. The domain is well-understood: production AI code review tools (CodeRabbit, Qodo) have documented their architectures publicly, GitHub's webhook contracts are stable, and the Hono + SQLite + Claude tool_use pattern is proven in Ryan's existing Mission Control stack. The decided stack is validated without exception — every technology choice holds under scrutiny, with specific versions confirmed against npm and official docs as of March 2026.

The core architectural insight is "webhook-fast, process-async": respond to GitHub within 2 seconds, run the 5 parallel Claude stages asynchronously, and stream progress back to both the PR comment and the dashboard via SSE. This maps cleanly to Mac Mini deployment via Tailscale Funnel for Phase 1. The build order is strictly dependency-driven: GitHub App auth and webhook handling must come before any pipeline work, and the pipeline must produce real output before the dashboard has anything meaningful to render. Architecture research documented working TypeScript examples for all five core patterns (fan-out/fan-in, find-or-create comment with mutex, tool_use stage runtime, SSE broadcasting, and sandbox path validation).

The single biggest risk is comment noise destroying developer trust before value accumulates. Production benchmarks show 70-90% of AI review comments are low-signal, and tools with action rates below 40% are abandoned within weeks. The mitigation is baked into the finding schema: a three-tier classification (runtime errors/security → architecture issues → style) where only Tier 1 and Tier 2 reach PR comments by default, and SKIP is a first-class verdict meaning "nothing notable found." The second biggest risk is API cost explosion — 5 parallel Sonnet calls with tool_use can hit $1-5/review without prompt caching and model discipline. Both risks must be addressed at schema and prompt design time, not retrofitted post-launch.

## Key Findings

### Recommended Stack

The decided stack (Hono + SQLite + Drizzle + React + Claude API + sqlite-vec) is fully validated. Research confirmed each choice against alternatives and filled in integration gaps. The Anthropic SDK is recommended directly over Vercel AI SDK because gstackapp runs server-side tool_use pipelines, not streaming chat UIs. Raw Octokit packages are preferred over Probot because gstackapp already has Hono as the HTTP server. Tailwind CSS v4 replaces shadcn/ui because DESIGN.md specifies a bespoke industrial aesthetic that pre-built components would fight. The pipeline topology view is custom SVG/CSS — not a chart library — per DESIGN.md's operations-room specification.

**Core technologies:**
- **Hono ^4.12 + @hono/node-server ^1.14**: HTTP server, routing, built-in SSE streaming via streamSSE(), typed RPC client — proven in MC stack, no reason to change
- **better-sqlite3 ^11.8 + drizzle-orm ^0.45 + drizzle-kit ^0.30**: Fastest sync SQLite driver + SQL-first ORM with schema migrations and Drizzle Studio
- **sqlite-vec ^0.1.8**: Zero-dependency C extension for vector search, brute-force KNN sufficient at single-user scale, day-1 cross-repo embeddings
- **@anthropic-ai/sdk ^0.80**: Direct SDK for full tool_use loop control, structured outputs, retry logic — no Vercel AI SDK abstraction needed
- **@octokit/webhooks ^14.2 + @octokit/rest ^21.1 + @octokit/auth-app ^7.2**: Type-safe GitHub App integration, auto-refresh installation tokens
- **simple-git ^3.27**: Programmatic shallow clone to /tmp, diff operations
- **React ^19.2 + Vite ^8.0**: Dashboard SPA (no SSR/SEO needed), Rolldown-powered builds, sub-second HMR
- **@tanstack/react-query ^5.95 + Hono RPC client (hc)**: Server state with zero-config end-to-end TypeScript types, no code generation required
- **Tailwind CSS ^4.2**: CSS-first config (@theme) maps directly to DESIGN.md tokens, 5x faster builds vs v3
- **Recharts ^2.15**: Declarative React SVG charts for quality trends — D3 fights React's model and is overkill here
- **Zod ^3.24**: Shared schemas across pipeline stages and frontend, Anthropic SDK structured output integration
- **Vitest ^3.1**: Vite-native testing, Hono testClient for type-safe API tests without separate babel config
- **Node.js ^22 LTS + tsx ^4.19**: Stable runtime with native fetch/Web Crypto, TypeScript execution without compile step
- **npm workspaces**: 3-package monorepo (api, web, shared) — Turborepo unnecessary at this scale

### Expected Features

The AI code review market ($2-3B, 30-40% YoY growth) is mature but gstackapp's target — indie/YC/gstack builders shipping daily — is unserved. Every competitor targets enterprise or the broad developer market. The market is moving toward agentic remediation (auto-fix), but the tooling aesthetic remains either enterprise-grey or startup-generic. gstackapp's whitespace is the intersection of visible pipeline, unique review perspectives (CEO/product, design), cross-repo memory for indie devs, and an operations-room aesthetic unlike anything in the market.

**Must have (table stakes):**
- Automated PR review on open/synchronize webhooks — baseline expectation in 2026
- Inline PR comments via GitHub Review API with line-level diff mapping
- PR summary comment updated in-place as stages complete
- Severity classification (PASS/FLAG/BLOCK/SKIP) — unclassified findings feel equal and noisy
- GitHub App installation flow — frictionless one-click repo selection
- Security vulnerability detection — expected baseline in every competitor
- Sub-5-minute review time — parallel stage execution is critical, sequential would take 2.5+ minutes
- False positive management — noisy tools get uninstalled within a week, this is a retention blocker
- Force-push re-review — stale reviews on amended PRs erode trust faster than no review

**Should have (differentiators — gstackapp's moat):**
- Visible 5-stage pipeline with spectral identity per stage (CEO=amber, Eng=cyan, Design=violet, QA=green, Security=coral) — nobody else makes the review process observable
- CEO/Product review stage — no competitor reviews code from a product/strategic lens; challenges the premise of the change
- Design review stage — no competitor checks design system adherence in PRs
- Cross-repo intelligence ("Seen in your other repos") — cross-project pattern recognition for indie devs with 5-10 repos
- Operations-room aesthetic — visually distinct from every tool in the market
- In-place progressive comment updates — developers see stages completing in GitHub, not just a final dump
- Quality trends dashboard — per-repo quality over time, lightweight (not enterprise-bloated)

**Defer (Phase 2+):**
- GitHub OAuth / multi-user auth — v1 is single-user, no auth complexity needed
- Checks API merge blocking — opt-in only; indie devs don't want robots blocking merges
- Auto-fix suggestions — only after review quality is proven and trusted
- IDE extension — massive surface area; target audience already has Cursor/Claude Code/Copilot

**Explicit anti-features (never build):**
IDE extensions, static analysis rules engine, enterprise SSO/SAML, self-hosted deployment, multi-provider AI (Claude-only for consistent quality), GitLab/Bitbucket support, .coderabbit.yaml config files, Jira/Linear integrations, test generation.

### Architecture Approach

The system has four distinct layers: Ingress (Tailscale Funnel → Hono webhook handler with HMAC-SHA256 signature verification), Orchestration (pipeline coordinator that fans out to 5 parallel stage executors via Promise.allSettled and aggregates with fan-in), Data (SQLite with WAL mode + 5000ms busy timeout, sqlite-vec for embeddings, /tmp for shallow clones), and Frontend (React SPA consuming SSE for live updates and Hono RPC for historical data). Each stage runs an independent Claude tool_use conversation with a sandboxed file access layer — the model sees the diff summary and uses read_file/list_files/search_code tools to pull relevant context on demand. This hybrid pipeline+agent approach is validated by CodeRabbit's published research as optimal for code review.

**Major components:**
1. **Webhook Handler** — receives GitHub events, verifies X-Hub-Signature-256 with timingSafeEqual against raw body bytes, ACKs within 2 seconds, filters to pull_request opened/synchronize only, deduplicates via X-GitHub-Delivery UNIQUE constraint
2. **Pipeline Orchestrator** — creates pipeline_run record (RUNNING status before any stage starts), fans out 5 stages via Promise.allSettled, aggregates results, manages PR comment lifecycle with per-PR mutex, handles force-push cancellation via AbortController
3. **Stage Executor** — runs one Claude tool_use conversation per stage with sandboxed file tools, emits progress to in-process event bus, returns Zod-validated StageResult with PASS/FLAG/BLOCK/SKIP verdict and typed findings
4. **Sandbox File Layer** — provides read_file/list_files/search_code scoped to clone dir using fs.realpathSync (not lexical prefix check), scans and removes all symlinks from clone before granting AI access
5. **Clone Manager** — shallow clone via simple-git (`--depth=1 --branch {pr_branch}`), cleanup on pipeline completion via rm -rf
6. **Comment Manager** — find-or-create via hidden HTML marker (`<!-- gstackapp-review -->`), per-PR mutex preventing concurrent update races, serialized updates with 1s minimum delay to avoid GitHub secondary rate limits, enforces 65,536-char body limit
7. **SSE Broadcaster** — in-process EventEmitter bridges pipeline progress to Hono streamSSE endpoint consumed by React EventSource; heartbeat every 15s for disconnect detection
8. **Embedding Service** — post-pipeline finding ingestion into sqlite-vec, cosine similarity search for cross-repo pattern matches (threshold empirically tuned)
9. **Dashboard Frontend** — React SPA with pipeline hero visualization (raw SVG/CSS per DESIGN.md), activity feed, quality trend charts (Recharts), cross-repo intelligence strip

### Critical Pitfalls

1. **Comment noise destroying trust before value builds** — Production benchmarks show 70-90% of AI findings are low-signal without deliberate filtering. An independent benchmark found CodeRabbit at 1/5 completeness with 28% outright noise; one study found PR merge time increasing from 6 hours to 2-3 days after installation. Prevention: three-tier finding classification from day 1, SKIP as a first-class verdict, target signal ratio >60%, finding-quality heuristic requiring code references and line numbers before BLOCK verdict is accepted, "Was this helpful?" mechanism built early.

2. **Webhook reliability without a job queue** — In-process execution means a Mac Mini restart or OOM loses all in-flight pipelines. GitHub webhooks are at-least-once delivery, so retries create duplicates without idempotency guards. Prevention: X-GitHub-Delivery as idempotency key with UNIQUE DB constraint using INSERT ... ON CONFLICT DO NOTHING, RUNNING status persisted before any stage starts, startup reconciliation marking stale runs (>10 min) as STALE with PR comment update.

3. **Sandbox escape via symlink/path traversal** — CVE-2025-53109 and CVE-2025-53110 demonstrated this exact attack on Anthropic's own filesystem MCP server — simple prefix matching was bypassed through symlinks, enabling reads of /etc/sudoers and writes to macOS Launch Agents. On a personal Mac Mini, the blast radius is the entire machine. Prevention: fs.realpathSync() BEFORE validation (never lexical prefix check), scan and delete all symlinks from clone before granting AI access, consider macOS Seatbelt sandbox profiles.

4. **Claude API cost explosion** — 5 parallel Sonnet stages with tool_use at 100K-500K tokens each can hit $1-5/review. At 10 PRs/day on one active repo, that's $150-500/month for a single-user personal tool. Prevention: Sonnet (not Opus) for all pipeline stages, aggressive prompt caching with token-efficient-tools-2025-02-19 beta header (60-80% savings on tool-heavy conversations), per-stage max_tokens limits, track cost per pipeline_run in DB from Phase 2.

5. **Concurrent SQLite write contention** — 5 parallel stages completing near-simultaneously hit SQLite's single-writer limit. Default busy timeout is 0ms (immediate failure). Prevention: WAL mode + 5000ms busy timeout from first migration (both are one-line PRAGMA changes but must be set from the start), serialize DB writes through a single write function while stage execution remains parallel.

## Implications for Roadmap

Architecture research identified a strict 6-phase build order based on layer dependencies. No phase can start meaningfully until the one before it produces real output. The architecture's "Build Order Implications" section (ARCHITECTURE.md) explicitly documents these dependencies.

### Phase 1: Foundation
**Rationale:** Everything depends on GitHub auth tokens existing before any API call and the DB schema existing before any persistence. No shortcuts here.
**Delivers:** Working GitHub App that receives and acknowledges webhooks, 6-table database schema with migrations, monorepo scaffold with 3 packages
**Addresses:** GitHub App installation (table stakes), signature verification, monorepo structure
**Avoids:** Webhook signature ordering pitfall (raw body before JSON parse), duplicate delivery (X-GitHub-Delivery idempotency key from day 1)
**Stack:** Hono + @octokit/auth-app + @octokit/webhooks + better-sqlite3 + Drizzle + npm workspaces

### Phase 2: Core Pipeline Engine
**Rationale:** The pipeline IS the product. Dashboard and PR comments are worthless without real stage output. Validate the tool_use loop with one stage before adding parallelism. Start collecting embeddings now even though they won't surface until Phase 5.
**Delivers:** 5-stage parallel pipeline executing against shallow clones, Zod-validated StageResult per stage, embedding collection for cross-repo intelligence
**Addresses:** Multi-stage cognitive pipeline (core differentiator), sub-5-minute review via parallelism, force-push cancellation, cost tracking
**Avoids:** Sequential execution (anti-pattern), full codebase in prompt (anti-pattern), cost explosion (Sonnet + prompt caching from day 1), sandbox escape (realpathSync + symlink removal), SQLite contention (WAL mode + write serialization)
**Architecture:** Clone Manager + Sandbox File Layer + Stage Executor (tool_use loop) + Pipeline Orchestrator (Promise.allSettled fan-out/fan-in)

### Phase 3: PR Comment Output
**Rationale:** The PR comment is the primary user-facing surface and the deliverable developers actually interact with. The three-tier noise filter is built here — getting this wrong means the product is already failing by the time the dashboard launches.
**Delivers:** Single in-place PR comment updated progressively as stages complete, structured findings with PASS/FLAG/BLOCK/SKIP verdicts, three-tier finding classification, "Was this helpful?" mechanism
**Addresses:** Inline PR comments, PR summary, severity classification (all table stakes), in-place progressive updates (differentiator)
**Avoids:** Comment spam (find-or-create + mutex), comment update races (serialized updates with 1s delay), noise problem (three-tier filter with SKIP as first-class verdict), large diffs exceeding context (diff summary not full diff)
**Architecture:** Comment Manager with per-PR mutex + markdown renderer + three-tier finding quality heuristic

### Phase 4: Dashboard + Pipeline Visualization
**Rationale:** After the pipeline produces real, quality-filtered output, the dashboard has trustworthy data to render. The pipeline hero visualization is the hero UX that makes gstackapp visually distinct from every competitor.
**Delivers:** Real-time pipeline topology visualization (raw SVG/CSS per DESIGN.md, not a chart library), activity feed (reverse-chronological PR list across all repos), SSE streaming of stage progress, quality trend charts
**Addresses:** Pipeline visualization as primary differentiator, reverse-chronological PR feed, builder-community aesthetic
**Avoids:** Building dashboard before pipeline produces real output (would ship a beautiful empty shell)
**Architecture:** SSE event bus (EventEmitter) + Hono streamSSE endpoint + React EventSource hook + pipeline hero component + Recharts trend charts
**Stack:** React 19 + Vite 8 + Tailwind v4 + TanStack Query + Hono RPC client + Recharts

### Phase 5: Cross-Repo Intelligence
**Rationale:** Embeddings have been collected since Phase 2, so there's now accumulated data to query. This phase adds the query and display layer — it's additive. The moat compounds over time as more repos are connected and more reviews run.
**Delivers:** "Seen in your other repos" callouts in PR comments and dashboard, intelligence strip showing cross-repo patterns, cosine similarity threshold tuned empirically
**Addresses:** Cross-repo intelligence (highest-value differentiator — nobody else does this for indie devs)
**Avoids:** Embedding drift (pin model version, store model identifier alongside each embedding vector)
**Architecture:** Embedding Service query layer + /api/intelligence REST endpoint + intelligence strip component

### Phase 6: Polish + Onboarding + Trends
**Rationale:** Quality trends require accumulated data from Phases 1-5. The onboarding wizard and false positive feedback loop can't be prioritized until core functionality is stable and trustworthy.
**Delivers:** Per-repo quality trend charts with per-stage pass rates, onboarding wizard (install GitHub App → pick repos → first review walkthrough), false positive feedback loop (thumbs up/down improves future reviews), stale pipeline detection on restart
**Addresses:** Quality trends dashboard (differentiator), false positive management (table stakes retention feature), first-run experience
**Avoids:** Enterprise features (auth, merge blocking, config files, IDE extension)
**Stack:** Recharts + aggregation queries over historical stage_results + simple state machine for onboarding

### Phase Ordering Rationale

- GitHub auth must precede any API call — hard dependency, not negotiable
- DB schema must precede any persistence — hard dependency
- Clone + sandbox must precede stage execution — stages need file access
- Stage output must precede PR comments and dashboard — nothing to render without real findings
- Core pipeline must precede embeddings — nothing to embed without findings flowing through
- Embeddings need time to accumulate before cross-repo matching produces useful signal — Phase 5 is deliberately late
- Quality trends need historical data — Phase 6 is inherently last

### Research Flags

Phases needing deeper research during planning:
- **Phase 2 (Core Pipeline):** The tool_use conversation loop is where most complexity lives — prompt engineering for 5 distinct cognitive modes, finding schema design, three-tier noise filter implementation, and cost per review calibration all need detailed planning before first line of code. CEO and Design stages have zero prior art in the market. Plan for 2-3 prompt iteration cycles after first real pipeline output.
- **Phase 5 (Cross-Repo Intelligence):** Embedding model selection and cosine similarity threshold tuning are empirical — requires actual finding embeddings to calibrate. Too low = false cross-repo matches, too high = nothing surfaces.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** GitHub App auth and Hono webhook patterns are fully documented in official sources. Standard implementation with working examples in architecture research.
- **Phase 3 (PR Comments):** Octokit comment CRUD + mutex pattern is well-documented. Architecture research includes working TypeScript code for the find-or-create pattern.
- **Phase 4 (Dashboard):** React + Hono SSE + Recharts are stable, documented APIs. The pipeline visualization is custom SVG/CSS per DESIGN.md — creative work, not technical research.
- **Phase 6 (Trends + Polish):** Aggregation queries and Recharts charts are standard. Onboarding wizard is CRUD + state machine.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm and official docs as of March 2026. Every alternative considered with explicit rationale for rejection. No experimental dependencies. |
| Features | HIGH | 15+ competitors analyzed. Market is mature enough that table stakes are clearly delineated from differentiators. Three areas of genuine whitespace confirmed (visible pipeline, CEO/design stages, cross-repo for indie devs). |
| Architecture | HIGH | Four separate HIGH-confidence sources including Vercel's open-source code review reference implementation, CodeRabbit's published architecture posts, and GitHub's official webhook docs. All five core patterns include working TypeScript examples. |
| Pitfalls | HIGH | CVE citations (CVE-2025-53109/53110), production benchmark data (449 AI code reviews study), GitHub rate limit docs, and production incident reports. Not theoretical — documented failures in live AI code review systems. |

**Overall confidence:** HIGH

### Gaps to Address

- **Prompt quality for 5 stages:** The stage prompts (prompts/*.md) are the most critical implementation artifact and cannot be fully designed without running real pipeline output. Plan for iterative prompt refinement after Phase 2. The CEO and Design stages have no prior art — budget extra iteration cycles.
- **Cost per review in practice:** The $1-5/review estimate is a range that depends on diff size and tool call depth. Build per-run cost tracking in Phase 2 and establish a baseline before connecting to active repos. Set a per-repo daily cost cap before going live.
- **Tailscale Funnel stability:** Funnel has no uptime SLA and undocumented bandwidth limits. The health check endpoint and "last webhook received" dashboard indicator are the mitigations. Monitor closely in Phase 1; plan Fly.io migration path for Phase 2 if stability is a problem.
- **sqlite-vec similarity threshold:** The cosine similarity cutoff for "Seen in your other repos" needs empirical tuning against real finding embeddings. Too low produces false cross-repo matches; too high produces nothing. Defer threshold selection until Phase 5 when real embeddings exist.
- **GitHub secondary rate limits on comment updates:** GitHub's secondary rate limits on POST/PATCH requests can trigger 403s when stages complete near-simultaneously. The 1-second minimum delay between comment updates is documented guidance but may need tuning under load.

## Sources

### Primary (HIGH confidence)
- [Hono docs](https://hono.dev/docs) — Framework, RPC client, streamSSE API
- [Drizzle ORM docs](https://orm.drizzle.team/) — SQLite driver, migrations, schema push
- [Anthropic tool_use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) — Tool_use conversation loop patterns
- [Claude API: Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — Cost optimization, token-efficient-tools beta header
- [GitHub Docs: Webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks) — 10s timeout, idempotency, signature verification
- [GitHub Docs: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) — HMAC-SHA256 with timingSafeEqual
- [GitHub Docs: Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) — Secondary rate limits on comment create/update
- [Octokit auth-app.js](https://github.com/octokit/auth-app.js/) — Installation token auto-refresh
- [CodeRabbit: Pipeline AI vs Agentic AI](https://www.coderabbit.ai/blog/pipeline-ai-vs-agentic-ai-for-code-reviews-let-the-model-reason-within-reason) — Hybrid approach validation
- [Vercel OpenReview (open source)](https://github.com/vercel-labs/openreview) — Reference implementation: webhook → pipeline → sandbox → Claude → PR comments
- [EscapeRoute CVE-2025-53109/53110](https://cymulate.com/blog/cve-2025-53109-53110-escaperoute-anthropic/) — Sandbox escape via symlink, realpathSync mitigation
- [Tailscale Funnel docs](https://tailscale.com/kb/1223/funnel) — HTTPS endpoint provisioning, limitations
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — v0.1.8, Node.js integration, DiskANN roadmap

### Secondary (MEDIUM confidence)
- [State of AI Code Review Tools 2025](https://www.devtoolsacademy.com/blog/state-of-ai-code-review-tools-2025/) — Competitor feature matrix
- [I Ran 449 AI Code Reviews in 9 Days](https://dev.to/alexey-pelykh/i-ran-449-ai-code-reviews-in-9-days-then-i-almost-got-banned-17h5) — Signal-to-noise benchmark data, action rate measurement
- [AI Code Review Accuracy 2026](https://www.codeant.ai/blogs/ai-code-review-accuracy) — False positive rates (28% noise finding), action rate data
- [Qodo 2.0 Multi-Agent Announcement](https://www.qodo.ai/blog/introducing-qodo-2-0-agentic-code-review/) — Competitive context, multi-agent opaque pipeline comparison
- [CodeRabbit: Accurate reviews on massive codebases](https://www.coderabbit.ai/blog/how-coderabbit-delivers-accurate-ai-code-reviews-on-massive-codebases) — Codegraph, semantic index, context engineering
- [CodeRabbit architecture on Google Cloud Run](https://cloud.google.com/blog/products/ai-machine-learning/how-coderabbit-built-its-ai-code-review-agent-with-google-cloud-run) — Webhook queue decoupling at scale
- [Baz.co: Building an AI Code Review Agent](https://baz.co/resources/building-an-ai-code-review-agent-advanced-diffing-parsing-and-agentic-workflows) — Git diff limitations, context building strategy
- [DEV Community: Hono + GitHub webhooks](https://dev.to/fiberplane/building-a-community-database-with-github-a-guide-to-webhook-and-api-integration-with-honojs-1m8h) — Hono-specific webhook middleware patterns

---
*Research completed: 2026-03-30*
*Ready for roadmap: yes*
