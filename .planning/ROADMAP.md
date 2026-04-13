# Roadmap: gstackapp

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-03-31)
- ✅ **v1.1 @gstackapp/harness** — Phases 7-11 (shipped 2026-04-03)
- ✅ **v2.0 Mission Control 4.0 — The Cathedral** — Phases 16-20 (shipped 2026-04-12)
- 🚧 **v3.0 Autonomous Operator — Router MVP + Ryn Demo** — Phases 21-26 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-03-31</summary>

- [x] Phase 1: Foundation & GitHub Integration (3/3 plans) — completed 2026-03-30
- [x] Phase 2: Pipeline Engine (3/3 plans) — completed 2026-03-30
- [x] Phase 3: Review Output & Signal Quality (2/2 plans) — completed 2026-03-31
- [x] Phase 4: Dashboard & Pipeline Visualization (4/4 plans) — completed 2026-03-31
- [x] Phase 5: Cross-Repo Intelligence (2/2 plans) — completed 2026-03-31
- [x] Phase 6: Onboarding & Quality Trends (3/3 plans) — completed 2026-03-31

See: `.planning/milestones/v1.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.1 @gstackapp/harness (Phases 7-11) — SHIPPED 2026-04-03</summary>

- [x] Phase 7: Seam Cleanup (1/1 plan) — completed 2026-04-03
- [x] Phase 8: Harness Package Extraction (2/2 plans) — completed 2026-04-03
- [x] Phase 9: Model Failover Router (2/2 plans) — completed 2026-04-03
- [x] Phase 10: Tool Adapters & Skills (2/2 plans) — completed 2026-04-03
- [x] Phase 11: State Sync (2/2 plans) — completed 2026-04-03

See: `.planning/milestones/v1.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.0 Mission Control 4.0 — The Cathedral (Phases 16-20) — SHIPPED 2026-04-12</summary>

- [x] Phase 16: Prerequisites & Stack Cleanup (4/4 plans) — completed 2026-04-11
- [x] Phase 17: Auth & Harness Independence (3/3 plans) — completed 2026-04-11
- [x] Phase 18: Operator Mode (4/4 plans) — completed 2026-04-11
- [x] Phase 19: gbrain Integration (2/2 plans) — completed 2026-04-12
- [x] Phase 20: Ryan Power Dashboard (3/3 plans) — completed 2026-04-12

</details>

### 🚧 v3.0 Autonomous Operator — Router MVP + Ryn Demo (In Progress)

**Milestone Goal:** Close the v2.0 decision-gate bottleneck by wiring a judgment triumvirate (Opus + Gemini 3 Pro + OpenAI GPT-5/o4) with personal context and a cost-aware multi-provider router, and prove it by shipping a working PWA to Ryn without DMing her once.

**Source of truth:** `~/.gstack/projects/quartermint-gstackapp/ryanstern-main-design-20260413-070725.md` (APPROVED 9.0/10)

**Coverage:** 55/55 REQ-IDs mapped. No orphans.

- [ ] **Phase 21: Pre-Flight** — Resolve 6 blockers (Neon, gbrain MCP, Gemini key, OpenAI key, Ryn onboarding, spend baseline) before any code work starts
- [ ] **Phase 22: Router + Vault + Ledger + PWA Provisioner** — Ship HRN-02 router completion, N-tenant credential vault, spend ledger, and versioned PWA scaffold in one packaged foundation
- [ ] **Phase 23: Judgment Triumvirate Service** — Standalone `packages/triumvirate/` with parallel-blind Opus + Gemini 3 Pro + OpenAI quorum and verification hookback
- [ ] **Phase 24: Autonomous Decision Loop** — Replace v2.0 escalation defaults with triumvirate-gated proceed-unless-objected flow across ntfy + Twilio + email (HIGHEST RISK)
- [ ] **Phase 25: Ryan Power Dashboard v2 — Cost Ledger View** — Per-user ledger, triumvirate telemetry, and baseline comparison as primary dashboard
- [ ] **Phase 26: Ryn PPL App Demo End-to-End** — Ship PWA to Ryn via autonomous loop with zero DMs (milestone validation)

### v3.0 Dependency Graph

```
                 Phase 21: Pre-Flight (blockers, not code)
                 PRE-01..PRE-06 must be 6/6 green
                              |
                              v
                 +------------+------------+
                 |                         |
         Phase 22 Lane A            Phase 22 Lane B
         Router + Vault             PWA Provisioner + Scaffold
         packages/api/src/          packages/pwa-scaffold/
           router/                  packages/api/src/
           credential-vault/          pwa-provisioner/
         ROUTER-01..06              PWA-01..06
         VAULT-01..06
         LEDGER-01..05
                 \                         /
                  \                       /
                   v                     v
                 Phase 22 schema merged (single migration file,
                 first lane to start owns it, other lane rebases)
                              |
                              v
                 Phase 23 Lane C (may start in parallel w/ 22
                 once schema is merged — provider adapters only)
                 Judgment Triumvirate
                 TRIO-01..10
                              |
                              v
                 Phase 24: Autonomous Decision Loop   <-- HIGHEST RISK
                 AUTO-01..08                              1.5x nominal budget
                 (may split into 24a/24b during execution)
                              |
                              v
                 Phase 25: Power Dashboard v2
                 DASH-01..06
                 (also depends on Phase 22 ledger tables
                  + Phase 23 triumvirate_decisions tables)
                              |
                              v
                 Phase 26: Ryn Demo
                 DEMO-01..08
                 Day 1 = internal dry-run with Ryan as test user
                 Behavioral gate: zero DMs Ryan -> Ryn
```

## Phase Details

### Phase 16: Prerequisites & Stack Cleanup
**Goal**: Clear the foundation gate so all v2.0 work builds on a stable, tested, accurately documented codebase
**Depends on**: Phase 15 (ideation pipeline)
**Requirements**: PRE-01, PRE-02, PRE-03 (v2.0 scope)
**Status**: Shipped 2026-04-11
**Plans:** 4/4 plans complete

### Phase 17: Auth & Harness Independence
**Goal**: Any user can authenticate and trigger a pipeline run from the web UI, with isolated sessions routed through the harness execution engine
**Depends on**: Phase 16
**Requirements**: AUTH-01..04, HRN-01..05 (v2.0 scope; HRN-02 accepted partial, closed in Phase 22)
**Status**: Shipped 2026-04-11
**Plans:** 3/3 plans complete
**UI hint**: yes

### Phase 18: Operator Mode
**Goal**: A non-technical user can go from "I have an idea" to a verified, quality-checked result without opening a terminal or asking Ryan
**Depends on**: Phase 17
**Requirements**: OP-01..11 (v2.0 scope)
**Status**: Shipped 2026-04-11
**Plans:** 4/4 plans complete
**UI hint**: yes

### Phase 19: gbrain Integration
**Goal**: Pipelines are knowledge-aware — they leverage 10,609 pages of compiled project/people/decision context to produce grounded, context-loaded outputs
**Depends on**: Phase 17, Phase 18
**Requirements**: GB-01..04 (v2.0 scope)
**Status**: Shipped 2026-04-12
**Plans:** 2/2 plans complete

### Phase 20: Ryan Power Dashboard
**Goal**: Ryan can manage all quartermint projects from one surface
**Depends on**: Phase 17, Phase 18, Phase 19
**Requirements**: DASH-01..05 (v2.0 scope — distinct from v3.0 DASH-*)
**Status**: Shipped 2026-04-12
**Plans:** 3/3 plans complete
**UI hint**: yes

### Phase 21: Pre-Flight
**Goal**: Resolve every hard blocker before any code is written so Phase 22 starts against a clean environment.
**Depends on**: Nothing (but secondarily: PRE-05 waits on Ryn's reply to Ryan's pre-milestone Assignment text)
**Requirements**: PRE-01, PRE-02, PRE-03, PRE-04, PRE-05, PRE-06
**Success Criteria** (what must be TRUE):
  1. Neon DB credentials are refreshed and a query against the production schema succeeds from Mac Mini (PRE-01)
  2. gbrain MCP server responds to `search`, `get_page`, and `traverse_graph` from Mac Mini shell (PRE-02)
  3. Gemini 3 Pro and OpenAI GPT-5/o4 API keys both return 200 on a smoke-test call from Mac Mini env (PRE-03, PRE-04)
  4. Ryn's Claude Pro status and phone number are captured and recorded in the Phase 22 handoff notes (PRE-05)
  5. `.planning/baseline-{date-range}.json` exists with 7 days of Anthropic + Google + OpenAI spend export (PRE-06)
**Plans**: TBD
**Notes**: This phase is not code work. It is gate resolution with explicit per-item owners (all Ryan). Phase 22 does NOT start until this phase is 6/6 green. Each PRE-* REQ is a hard gate, not a checklist item. Twilio SMS account provisioning can run in parallel here (required before Phase 24 kickoff but not a Phase 21 blocker).

### Phase 22: Router + Vault + Ledger + PWA Provisioner
**Goal**: Land the foundation layer — completed HRN-02 router, N-tenant encrypted credential vault, spend ledger with approval state machine, and versioned per-user PWA provisioner — in one packaged phase.
**Depends on**: Phase 21 (all 6 PRE items green)
**Requirements**: ROUTER-01, ROUTER-02, ROUTER-03, ROUTER-04, ROUTER-05, ROUTER-06, VAULT-01, VAULT-02, VAULT-03, VAULT-04, VAULT-05, VAULT-06, LEDGER-01, LEDGER-02, LEDGER-03, LEDGER-04, LEDGER-05, PWA-01, PWA-02, PWA-03, PWA-04, PWA-05, PWA-06
**Success Criteria** (what must be TRUE):
  1. Every v2.0 operator-mode LLM call site dispatches through the new router with a tagged `(user_id, provider, model, tier_used, task_id, approval_state)` row in `spend_ledger` — no bypasses (ROUTER-01..04, LEDGER-01..02)
  2. 4+ tenant records coexist in the `credentials` table, each encrypted under a distinct ciphertext/iv/auth_tag, with the master key loaded from macOS Keychain at boot; manual rotation runbook tested (VAULT-01, VAULT-02, VAULT-05)
  3. A signed one-time onboarding URL (24h expiry) lets a user paste an API key via the Tailscale Funnel web form; PWA subdomain URLs use 30d expiry with auto-refresh; Ryn's tier-0 handling branches correctly per PRE-05 outcome (VAULT-03, VAULT-04, VAULT-06)
  4. `pending_approvals` reaper transitions expired rows with correct default-on-timeout semantics (objection = proceed, borrow = deny); borrow approval flow with weekly soft cap works end-to-end; state survives Mac Mini restart (ROUTER-05, ROUTER-06, LEDGER-03, LEDGER-04, LEDGER-05)
  5. `packages/pwa-provisioner` builds a PWA from `packages/pwa-scaffold/` into `~/apps/<user_id>/<app_slug>/dist/`, served under `https://apps.<machine>.ts.net/app/<jwt>/` with correct service-worker scope, working iOS "Add to Home Screen" manifest, and clean error handling on build failure (PWA-01..06)
  6. `.planning/v3.1-onboarding.md` authored as a Phase 22 byproduct documenting Bella/Andrew activation path (satisfies SC-05)
**Plans**: TBD
**UI hint**: yes
**Worktree parallelization**:
  - **Lane A (Router + Credential Vault):** `packages/api/src/router/`, `packages/api/src/credential-vault/`, `npm run vault:rotate` script. Owns ROUTER-*, VAULT-*, LEDGER-*.
  - **Lane B (PWA Provisioner + Scaffold):** `packages/pwa-scaffold/`, `packages/api/src/pwa-provisioner/`. Owns PWA-*.
  - **Shared:** `packages/api/src/db/schema.ts` — single Drizzle migration file. Whichever lane starts first owns the migration; the other lane rebases onto it.
**Ties to milestone gates**: SC-04 (HRN-02 closed), SC-05 (N-tenant vault shipped).

### Phase 23: Judgment Triumvirate Service
**Goal**: Ship `packages/triumvirate/` — a standalone parallel-blind decision engine with quorum rules, gbrain snapshot compilation, cost cap, within-task cache, and synchronous `false_positive` hookback from v2.0's verification loop.
**Depends on**: Phase 22 schema (needs `credentials`, `spend_ledger` + new `triumvirate_decisions` + `triumvirate_model_calls` tables). Lane C provider-adapter work may start in parallel with Phase 22 Lane A once the schema migration is merged.
**Requirements**: TRIO-01, TRIO-02, TRIO-03, TRIO-04, TRIO-05, TRIO-06, TRIO-07, TRIO-08, TRIO-09, TRIO-10
**Success Criteria** (what must be TRUE):
  1. `decide(context)` dispatches parallel-blind calls to Opus, Gemini 3 Pro, and OpenAI frontier with 30s per-model timeout and returns a canonical `{verdict, confidence, rationale}` per provider via native structured-output adapters (TRIO-01, TRIO-02, TRIO-03)
  2. Quorum decision rule produces the documented outcomes across 3/3, 2/3, 2/2-quorum, disagreement, and 0-1/3 cases, with each case writing the correct `consensus_outcome` (TRIO-04)
  3. gbrain snapshot is compiled, recency-truncated to 8K input tokens, identical across all three providers; gbrain failure escalates with reason `gbrain_unavailable`; system prompt contract loaded from versioned `packages/triumvirate/prompts/judge.md` (TRIO-05, TRIO-06)
  4. Normalized `triumvirate_decisions` parent + `triumvirate_model_calls` child schema captures one row per provider call per decision; verification loop synchronously sets `false_positive = true` on triumvirate-approved tasks that fail verification (TRIO-07, TRIO-08)
  5. Per-task cost cap ($1 default) and within-task decision-fingerprint cache both fire on a synthetic multi-decision task and prevent runaway triumvirate spend (TRIO-09, TRIO-10)
**Plans**: TBD
**Ties to milestone gates**: SC-03 (≥70% 3/3-or-2/3 consensus, <30% escalation, <5% false-positive, measured over first 50+ decisions via Phase 25 dashboard).

### Phase 24: Autonomous Decision Loop
**Goal**: Replace v2.0 operator-mode escalation defaults with triumvirate-gated proceed-unless-Ryan-objects-within-N-hours decisions across ntfy, Twilio SMS, email, and persistent conversation-thread fallback.
**Depends on**: Phase 23 (triumvirate service must be callable)
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06, AUTO-07, AUTO-08
**Success Criteria** (what must be TRUE):
  1. Every v2.0 scoping-question escalation path routes through `packages/triumvirate/decide()` before touching Ryan; default is `proceed` unless Ryan objects within the configured N-hour window (AUTO-01, AUTO-02)
  2. Intake page receives a `Thinking...` SSE event the moment triumvirate starts (no silent 5-30s wait) (AUTO-03)
  3. Ryan receives single-tap accept/reject/defer ntfy notifications; reject opens a one-line reply that re-runs triumvirate once; second 0-1/3 outcome routes the task to a persistent thread in the power dashboard; defer extends `pending_approvals.state = extended` (AUTO-04, AUTO-06, AUTO-07)
  4. Users receive Twilio SMS primary + email fallback for borrow-approval flow; Twilio account is provisioned with SMS sending enabled before phase kickoff (AUTO-05, AUTO-08)
  5. N-hour timer and approval state survive Mac Mini restart (validated via service stop/start mid-wait)
**Plans**: TBD
**UI hint**: yes
**HIGHEST-RISK PHASE**: Integration surface = triumvirate-as-gate + Twilio + ntfy + email + reject re-run UX + defer extension + persistent-thread fallback + dashboard hookup. Allocate 1.5x nominal time budget. Prefer splitting into 24a/24b mid-execution over absorbing slip into downstream phases.
**Ties to milestone gates**: SC-01 (enables Ryn autonomous flow), SC-03 (feeds consensus telemetry).

### Phase 25: Ryan Power Dashboard v2 — Cost Ledger View
**Goal**: Make the per-user cost ledger the primary view of the Ryan power dashboard with triumvirate telemetry, autonomous-decision success rate, baseline comparison, and spend velocity alerts.
**Depends on**: Phase 22 (ledger tables) AND Phase 23 (`triumvirate_decisions` + `triumvirate_model_calls` tables)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06
**Success Criteria** (what must be TRUE):
  1. Per-user cost ledger view renders `spend_ledger` rows grouped by user with subscription utilization vs external spend and per-user weekly cap tracking (DASH-01)
  2. Triumvirate consensus distribution chart renders 3/3, 2/3, 2/2-quorum, disagreement, and failure breakdown from `consensus_outcome`; `false_positive` rate chart renders calibration signal from verification hookback (DASH-02, DASH-03)
  3. Autonomous-decision success rate chart renders percentage of tasks completed without Ryan escalation (DASH-04)
  4. Baseline comparison chart renders Phase 21 baseline export vs current-week spend (DASH-05 — SC-02 measurement surface)
  5. Spend velocity alerts fire visibly when a user approaches their weekly cap or Ryan's credits burn faster than the baseline trendline predicts (DASH-06)
**Plans**: TBD
**UI hint**: yes
**Notes**: Desktop-only, dark mode, 1024px min-width per DESIGN.md. Charts via Recharts.
**Ties to milestone gates**: SC-02 (proves cost-bleed reduction), SC-06 (dashboard lands).

### Phase 26: Ryn PPL App Demo End-to-End
**Goal**: Ship a working PPL study PWA to Ryn's phone via the autonomous loop with zero DMs from Ryan to Ryn — validating every upstream phase with one real user on one real ask.
**Depends on**: Phases 21, 22, 23, 24, 25 all green
**Requirements**: DEMO-01, DEMO-02, DEMO-03, DEMO-04, DEMO-05, DEMO-06, DEMO-07, DEMO-08
**Success Criteria** (what must be TRUE):
  1. Day-1 integration dry-run with Ryan as test user completes end-to-end without hitting a Phase 22-25 integration bug; any bug routes back to the owning phase before Ryn-facing work proceeds (DEMO-01)
  2. Ryn receives a signed intake URL, submits her request from her iPhone (typing or iOS native dictation), and the triumvirate autonomously picks scaffold params, question bank, study cadence, and visual style from her gbrain Person page (DEMO-02, DEMO-03)
  3. Router dispatches code generation to the cheapest viable tier (Sonnet on Ryn's Claude Pro, or Ryan's Max 20x with approved borrow) with full ledger attribution; PWA is built, deployed to signed subdomain path, and Ryn receives a Twilio SMS with link + "Add to Home Screen" instructions (DEMO-04, DEMO-05)
  4. Ryn adds PWA to home screen, opens it offline-capable, uses it 3+ days in the week following delivery, and the 1-tap daily satisfaction check-in captures her usage signal (DEMO-06, DEMO-07)
  5. **Behavioral gate**: zero DMs from Ryan to Ryn between the pre-milestone Assignment text and the milestone audit — the one-time credential onboarding URL is explicitly scoped out (DEMO-08)
**Plans**: TBD
**UI hint**: yes
**Notes**: Day 1 is the Ryan-as-test-user dry-run, not a separate phase. If the dry-run fails, Phase 26 pauses and the fix routes back to the appropriate earlier phase owner.
**Ties to milestone gates**: SC-01 (milestone validation). Failure here = milestone failed regardless of upstream success.

## Known Risks (v3.0)

1. **Phase 24 integration density.** Escalation replacement + Twilio + ntfy + email + reject UX + defer extension + persistent-thread fallback in one phase. Mitigated by 1.5x time budget and willingness to split into 24a/24b mid-execution.
2. **Phase 23 SC-03 threshold is unvalidated.** 70% 3/3-or-2/3 consensus is a guess without prior data. Phase 25 dashboard surfaces real rates for v3.1 recalibration. Measurement goal, not a blocker.
3. **Mac Mini SPOF.** Every v3.0 service lives on the Mac Mini. Accepted risk per design doc. Revisit in v3.2+.
4. **Credential vault master-key loss.** If Mac Mini Keychain is lost, all credentials are unrecoverable. Accepted risk. VAULT-05 rotation runbook reduces operational risk; disaster recovery is user re-provisioning.
5. **Zero-DM behavioral gate (Phase 26).** Discipline gate, not technical. Ryan must personally refrain from DMing Ryn between the Assignment text and the milestone audit even when the system breaks. Failure fails SC-01 independent of code quality.
6. **Phase 22 schema coordination.** Two parallel lanes share `packages/api/src/db/schema.ts`. First lane owns the migration; second rebases. Without a clear owner, the migration file becomes a merge-conflict magnet.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & GitHub Integration | v1.0 | 3/3 | Complete | 2026-03-30 |
| 2. Pipeline Engine | v1.0 | 3/3 | Complete | 2026-03-30 |
| 3. Review Output & Signal Quality | v1.0 | 2/2 | Complete | 2026-03-31 |
| 4. Dashboard & Pipeline Visualization | v1.0 | 4/4 | Complete | 2026-03-31 |
| 5. Cross-Repo Intelligence | v1.0 | 2/2 | Complete | 2026-03-31 |
| 6. Onboarding & Quality Trends | v1.0 | 3/3 | Complete | 2026-03-31 |
| 7. Seam Cleanup | v1.1 | 1/1 | Complete | 2026-04-03 |
| 8. Harness Package Extraction | v1.1 | 2/2 | Complete | 2026-04-03 |
| 9. Model Failover Router | v1.1 | 2/2 | Complete | 2026-04-03 |
| 10. Tool Adapters & Skills | v1.1 | 2/2 | Complete | 2026-04-03 |
| 11. State Sync | v1.1 | 2/2 | Complete | 2026-04-03 |
| 16. Prerequisites & Stack Cleanup | v2.0 | 4/4 | Complete | 2026-04-11 |
| 17. Auth & Harness Independence | v2.0 | 3/3 | Complete | 2026-04-11 |
| 18. Operator Mode | v2.0 | 4/4 | Complete | 2026-04-11 |
| 19. gbrain Integration | v2.0 | 2/2 | Complete | 2026-04-12 |
| 20. Ryan Power Dashboard | v2.0 | 3/3 | Complete | 2026-04-12 |
| 21. Pre-Flight | v3.0 | 0/0 | Not started | - |
| 22. Router + Vault + Ledger + PWA Provisioner | v3.0 | 0/0 | Not started | - |
| 23. Judgment Triumvirate Service | v3.0 | 0/0 | Not started | - |
| 24. Autonomous Decision Loop | v3.0 | 0/0 | Not started | - |
| 25. Power Dashboard v2 — Cost Ledger View | v3.0 | 0/0 | Not started | - |
| 26. Ryn PPL App Demo End-to-End | v3.0 | 0/0 | Not started | - |
