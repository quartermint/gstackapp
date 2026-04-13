# Requirements — v3.0 Autonomous Operator

Milestone: v3.0 — Router MVP + Ryn Demo
Source of truth: `~/.gstack/projects/quartermint-gstackapp/ryanstern-main-design-20260413-070725.md` (APPROVED 9.0/10)

## v3.0 Requirements

### Pre-Flight (PRE)

- [ ] **PRE-01**: Neon DB credentials refreshed and validated against production schema (blocker for Phase 1 vault work)
- [ ] **PRE-02**: gbrain MCP server running on Mac Mini with `search`, `get_page`, `traverse_graph` endpoints responding (blocker for Phase 2)
- [ ] **PRE-03**: Gemini 3 Pro API key confirmed present and functional in Mac Mini env
- [ ] **PRE-04**: OpenAI API key with access to GPT-5 or o4 (current frontier judgment tier) confirmed present and functional in Mac Mini env
- [ ] **PRE-05**: Ryn's Claude Pro subscription status resolved AND phone number captured via pre-milestone Assignment text (gates Phase 1 credential branch + Phase 3 SMS channel)
- [ ] **PRE-06**: Baseline API spend ledger exported for 7 days preceding Phase 0 close, saved as `.planning/baseline-{date-range}.json` (required for Success Criterion 2 measurement)

### Router Foundation (ROUTER)

- [ ] **ROUTER-01**: `packages/api/src/router/` completes HRN-02 ModelRouter with 6-tier priority cascade (user's own Claude sub → user's laptop stub → Mac Mini local models → Ryan's Max 20x with borrow → Gemini/Opus/OpenAI adversarial tier → paid Anthropic fallback)
- [ ] **ROUTER-02**: Static task-type → tier lookup table loaded at service start, overridable per-dispatch via explicit tier hint
- [ ] **ROUTER-03**: All v2.0 operator mode LLM call sites migrated onto the new router (no call bypasses the router)
- [ ] **ROUTER-04**: Dispatch tagging records every LLM call with `(user_id, provider, model, tier_used, task_id, approval_state)` at call time
- [ ] **ROUTER-05**: N-hour objection window timer uses Mac Mini system timezone, configurable per-task (default 4h waking / 8h overnight, 1h urgent, 24h low-stakes)
- [ ] **ROUTER-06**: Task dispatcher hydrates state from DB on startup and resumes any task whose `pending_approvals` row is in `waiting` state, respecting original deadline (Mac Mini restart survival)

### Credential Vault (VAULT)

- [ ] **VAULT-01**: Postgres `credentials` table with N-tenant schema handling 4+ tenant records on day one (even though only 2 are active in v3.0)
- [ ] **VAULT-02**: Per-credential AES-256-GCM encryption at rest with master key stored in Mac Mini macOS Keychain under service `gstackapp-credential-vault`
- [ ] **VAULT-03**: Per-user onboarding flow via one-time signed URL (web form on operator service over Tailscale Funnel) for pasting API keys or completing OAuth
- [ ] **VAULT-04**: JWT HS256 URL signing with signing secret stored in separate Keychain service `gstackapp-url-signer`, 24h expiry for onboarding URLs, 30d expiry for per-user PWA subdomain URLs with auto-refresh on use
- [ ] **VAULT-05**: Manual master-key rotation runbook documented and tested (`npm run vault:rotate` script, rollback preserves old ciphertext on failure, old key never deleted until new ciphertext verified readable)
- [ ] **VAULT-06**: Dual-branch Ryn tier-0 handling — if PRE-05 resolves "has Pro," Phase 1 wires her credential directly; if "no Pro and declines," vault record initialized with $5 weekly borrow cap against Ryan's Max 20x

### Spend Ledger + Credit Borrow (LEDGER)

- [ ] **LEDGER-01**: `spend_ledger` table schema with `(id, user_id, provider, model, tier_used, cost_usd, task_id, approval_state, borrow_approved_by_user NULL, triumvirate_verdict_id NULL, timestamp)`
- [ ] **LEDGER-02**: `approval_state` enum values: `own_sub`, `borrowed_within_cap`, `borrowed_over_cap_user_approved`, `borrowed_over_cap_ryan_override`, `system_judgment`
- [ ] **LEDGER-03**: Credit borrow approval flow — task pauses when user's sub saturates, notifies user with one-tap approve/deny, 30-minute timeout defaults to deny, each user has weekly soft cap (default $5)
- [ ] **LEDGER-04**: `pending_approvals` table `(id, task_id, user_id, kind, deadline_at, increment_minutes, state, created_at, updated_at)` with partial index on `deadline_at WHERE state = 'waiting'`
- [ ] **LEDGER-05**: Minute-resolution reaper transitions expired `pending_approvals` rows based on default-on-timeout semantics (objection default = proceed; borrow approval default = deny)

### PWA Provisioner (PWA)

- [ ] **PWA-01**: `packages/pwa-scaffold/` versioned template (Vite + React + Workbox + PWA plugin) that the operator customizes per request
- [ ] **PWA-02**: `packages/api/src/pwa-provisioner/` builds per-user PWAs, outputs to `~/apps/<user_id>/<app_slug>/dist/`, triggers Caddy hot-reload
- [ ] **PWA-03**: Single-subdomain JWT-path routing — PWAs served at `https://apps.<machine>.ts.net/app/<jwt>/` with service worker scope correctly set per path via Workbox
- [ ] **PWA-04**: iOS "Add to Home Screen" manifest serves correct icon and display name per user's PWA
- [ ] **PWA-05**: Update flow replaces existing build without service-worker version conflict
- [ ] **PWA-06**: Build failure produces clean error, no partial `dist/` left behind

### Triumvirate Service (TRIO)

- [ ] **TRIO-01**: New `packages/triumvirate/` monorepo package exposing `decide(context): Promise<TriumvirateVerdict>`
- [ ] **TRIO-02**: Parallel-blind call pattern — Opus (Anthropic), Gemini 3 Pro (Google), GPT-5 or o4 (OpenAI Responses API) receive identical input, 30-second timeout per model, no cross-visibility
- [ ] **TRIO-03**: Provider adapter layer `packages/triumvirate/providers/{anthropic,google,openai}.ts` translates canonical verdict schema `{verdict: "proceed"|"escalate", confidence: 0-10, rationale: string}` to each provider's native structured-output mode
- [ ] **TRIO-04**: Quorum decision rule — 3/3 proceed → auto, 2/3 proceed → auto with dissent logged, 0-1/3 proceed → escalate, 2/3 quorum (one timeout) with agreement → proceed with abstain logged, 2/3 quorum with disagreement → escalate, 0-1/3 available → escalate with quorum failure
- [ ] **TRIO-05**: System prompt contract loaded from `packages/triumvirate/prompts/judge.md`, versioned and committed to git
- [ ] **TRIO-06**: gbrain snapshot compilation via `getPage(user_id) → traverse_graph(depth=2)` producing JSON payload capped at 8K input tokens, recency-first truncation; gbrain failure escalates immediately with `gbrain_unavailable` reason
- [ ] **TRIO-07**: Normalized telemetry — `triumvirate_decisions` parent table + `triumvirate_model_calls` child table (one row per provider call per decision)
- [ ] **TRIO-08**: `false_positive` hookback from v2.0 verification loop — verification report writer updates `triumvirate_decisions.false_positive = true` synchronously inside the verification transaction when a triumvirate-approved decision fails verification
- [ ] **TRIO-09**: Per-task triumvirate cost cap (default $1/task) tracked in `triumvirate_decisions`; when task exceeds cap, subsequent sub-decisions fall back to Sonnet-only verdict or escalate to Ryan
- [ ] **TRIO-10**: Within-task decision cache — semantically similar sub-decisions in the same task reuse prior verdict via decision-fingerprint cache key

### Autonomous Decision Loop (AUTO)

- [ ] **AUTO-01**: v2.0 operator mode escalation defaults replaced with triumvirate-gated decisions — every scoping question routes through `packages/triumvirate/` before escalation
- [ ] **AUTO-02**: Default flips from escalate-to-Ryan to proceed-unless-Ryan-objects-within-N-hours per ROUTER-05
- [ ] **AUTO-03**: "Thinking..." SSE event sent to intake page the moment triumvirate starts (prevents 5-30s silent wait)
- [ ] **AUTO-04**: ntfy notification for Ryan with single-tap accept/reject/defer UX
- [ ] **AUTO-05**: Twilio SMS primary + email fallback notification channel for users (Ryn pre-PWA), PWA push becomes primary post-install
- [ ] **AUTO-06**: Reject UX — single-line reply field, Ryan's response injected as context, triumvirate re-runs once; if still 0-1/3 consensus, task moves to persistent conversation thread in power dashboard
- [ ] **AUTO-07**: Defer UX — extends N-hour objection window by task's configured increment via `pending_approvals.state = extended`
- [ ] **AUTO-08**: Twilio account provisioned with SMS sending enabled before Phase 3 kickoff

### Ryan Power Dashboard v2 (DASH)

- [ ] **DASH-01**: Per-user cost ledger view renders `spend_ledger` rows grouped by user with subscription utilization vs external spend
- [ ] **DASH-02**: Triumvirate consensus distribution chart — renders 3/3, 2/3, 2/2 quorum, disagreement, failure breakdown from `triumvirate_decisions.consensus_outcome`
- [ ] **DASH-03**: Triumvirate `false_positive` rate chart — renders calibration signal from verification hookback
- [ ] **DASH-04**: Autonomous-decision success rate — percentage of tasks that completed via the autonomous loop without Ryan escalation
- [ ] **DASH-05**: Baseline comparison chart — Phase 0 baseline export vs current-week spending (Success Criterion 2 measurement)
- [ ] **DASH-06**: Spend velocity alerts — flag when a user approaches their weekly cap or Ryan's credits are burning faster than expected

### Ryn PPL App Demo (DEMO)

- [ ] **DEMO-01**: Pre-Phase-5 integration dry-run with Ryan as the test user (catches Phase 1-4 integration bugs before Ryn touches the system)
- [ ] **DEMO-02**: Ryn receives signed intake URL, opens on iPhone, submits request via web form (iOS native dictation or typing)
- [ ] **DEMO-03**: Triumvirate autonomously picks PWA scaffold params, question bank, study cadence, visual style from Ryn's gbrain Person page
- [ ] **DEMO-04**: Router dispatches code generation to cheapest viable tier (Sonnet on Ryn's Claude Pro or Ryan's Max 20x with approved borrow)
- [ ] **DEMO-05**: PWA built via provisioner, deployed to dedicated subdomain path, Ryn receives SMS with link + "add to home screen" instructions
- [ ] **DEMO-06**: Ryn adds PWA to home screen, opens offline-capable, uses for 3+ days across the week following delivery
- [ ] **DEMO-07**: 1-tap daily satisfaction check-in captures Ryn's usage signal
- [ ] **DEMO-08**: Zero DMs from Ryan to Ryn between pre-milestone Assignment text and milestone audit (the one-time credential onboarding URL is explicitly scoped out)

## Success Criteria (milestone gates)

Tracked as hard gates. Failure of SC-01, SC-02, or SC-03 = milestone failed.

- **SC-01:** DEMO-01 through DEMO-08 all pass
- **SC-02:** Week-after-v3.0 external API spend (Anthropic + Google + OpenAI aggregate, including triumvirate judgment costs) measurably lower than PRE-06 baseline, router telemetry proves reduction came from Max 20x saturation + local routing not reduced usage
- **SC-03:** Triumvirate achieves ≥70% 3/3-or-2/3 consensus rate, <30% escalation rate, <5% `false_positive` rate from verification hookback, across 50+ decisions
- **SC-04:** HRN-02 ModelRouter marked fully satisfied in v3.0 milestone audit (no longer accepted-partial)
- **SC-05:** VAULT + LEDGER schemas handle 4+ tenant records; `.planning/v3.1-onboarding.md` documented as byproduct of Phase 1
- **SC-06:** DASH-01 through DASH-06 all render real data with baseline comparison working

## Future Requirements (deferred to v3.1+)

- Bella and Andrew active tenancy with live onboarding UX
- Per-laptop device capability probe + local-model routing to user's own machine (Tier 1 activation)
- Voice-memo transcription pipeline beyond iOS native dictation
- Automated credential vault master-key rotation
- Triumvirate consensus threshold recalibration based on accumulated `false_positive` telemetry (needs 50+ decisions of ground truth first)
- Public README / positioning reframing
- Question-bank licensing review (required before multi-user distribution)

## Out of Scope (explicit exclusions)

- Off-site credential vault backup (v3.2+) — if Mac Mini Keychain is lost, credentials unrecoverable, users re-provision. Accepted risk.
- Mac Mini SPOF mitigation / HA deployment (v3.2+) — best-effort uptime.
- Native iOS apps — PWAs are the strategy, deferred indefinitely.
- Codex CLI in the triumvirate — replaced by OpenAI Responses API directly. Codex CLI stays available for the `/codex` gstack skill (code review), separate from the autonomous judgment loop.
- GitHub Checks API merge blocking — inherited v1.0 decision, PR comments only.
- Light mode / mobile-responsive UI — same constraints as v1.0 through v2.0.

## Traceability

Populated by the roadmapper — maps each REQ-ID to exactly one phase.

| REQ-ID | Phase | Notes |
|---|---|---|
| *(pending roadmap generation)* | | |
