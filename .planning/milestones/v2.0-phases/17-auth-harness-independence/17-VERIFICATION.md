---
phase: 17-auth-harness-independence
verified: 2026-04-11T14:30:00Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "A POST to /api/operator/request creates a pipeline run, the harness spawns an agent session with provider selection, and stage results stream back to the web UI via SSE in real time"
    status: partial
    reason: "The pipeline spawner calls the claude CLI directly (D-07 decision) without going through the harness ModelRouter for provider selection. HRN-02 requires 'Harness spawns agent session with provider selection via ModelRouter' — this is not implemented. The subprocess architecture works (spawn, file-watch, SSE) but bypasses the harness package entirely."
    artifacts:
      - path: "packages/api/src/pipeline/spawner.ts"
        issue: "Spawns 'claude' CLI directly with no ModelRouter or harness provider selection. The harness package (packages/harness/) contains ModelRouter with 3-layer failover but is not imported or used."
    missing:
      - "Either integrate ModelRouter from packages/harness into spawner.ts for provider selection, OR update ROADMAP.md SC4 and HRN-02 to reflect the D-07 architectural decision (subprocess delegates model selection to claude CLI internally)"
human_verification:
  - test: "Tailscale auto-login end-to-end"
    expected: "Accessing from a Tailscale device (100.x IP) auto-identifies user with correct role, no login page shown"
    why_human: "Requires actual Tailscale daemon running on Mac Mini — cannot verify Unix socket whois call programmatically without live tailscaled"
  - test: "Magic link email delivery"
    expected: "POST /api/auth/magic-link sends email (or logs URL in dev mode); clicking link sets session cookie and redirects to /"
    why_human: "Requires real server running with SendGrid configured or dev mode console visible; end-to-end session cookie flow requires browser"
  - test: "Operator role isolation in browser"
    expected: "Operator user sees only their own requests in history; admin sees all; unauthenticated user sees LandingPage then LoginPage on click"
    why_human: "Requires two authenticated browser sessions with different roles to verify isolation"
  - test: "Pipeline subprocess execution with real Claude CLI"
    expected: "Submitting intake form spawns claude CLI process, progress files appear in /tmp/pipeline-{id}/, SSE events stream to PipelineProgress component"
    why_human: "Requires running server with claude CLI on PATH; E2E verification marked deferred in Plan 03 (autonomous mode auto-approved Task 3)"
  - test: "Decision gate pause and resume"
    expected: "Gate file written by Claude pauses progress, approval buttons render in PipelineProgress, clicking button writes gate-{id}-response.json and pipeline resumes"
    why_human: "Requires live pipeline execution with claude subprocess producing gate files"
---

# Phase 17: Auth & Harness Independence Verification Report

**Phase Goal:** Any user can authenticate and trigger a pipeline run from the web UI, with isolated sessions routed through the harness execution engine
**Verified:** 2026-04-11T14:30:00Z
**Status:** gaps_found (1 gap blocking full ROADMAP SC compliance; 5 human verification items pending)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tailscale tailnet user auto-recognized with correct role, no extra login | ✓ VERIFIED | authMiddleware checks Tailscale-User-Login header (Funnel) then IP whois via /var/run/tailscaled.socket; resolveRole maps to admin/operator from env vars; 5 whois tests + 7 role tests pass |
| 2 | Non-tailnet user receives magic link email, clicks, gets authenticated session | ✓ VERIFIED | generateMagicLinkToken (HMAC-SHA256, 32 bytes), verifyMagicLinkToken (timingSafeEqual), sendMagicLinkEmail (SendGrid or console), POST /auth/magic-link, GET /auth/verify sets 7-day httpOnly cookie; 5 magic-link tests pass |
| 3 | Each authenticated user has isolated session history and audit trail | ✓ VERIFIED | getUserScope returns userId=null for admin (sees all), userId=user.id for operator (scoped WHERE); GET /history enforces scoping; GET /request/:id returns 403 cross-user; 21 operator+session tests pass |
| 4 | POST to /api/operator/request creates pipeline run, harness spawns agent with provider selection, SSE streams stage results | ✗ FAILED | Spawn works (detached subprocess, file watcher, SSE via pipelineBus) but ModelRouter provider selection not implemented — claude CLI spawned directly without harness package integration. Partial: spawn+SSE works, provider selection via ModelRouter missing. |
| 5 | Decision gates pause pipeline, render approval buttons in web UI, user response resumes execution | ✓ VERIFIED | PipelineProgress handles operator:gate SSE events, GateCard renders option buttons, handleResponse POSTs to /api/operator/:requestId/gate-response, operator.ts writes gate-{id}-response.json; file-watcher test confirms gate detection |

**Score:** 4/5 truths verified (SC4 partial — spawn and SSE work, ModelRouter provider selection missing)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | gbrain context injection into pipeline agent sessions | Phase 19 | Phase 19 goal: "Pipelines are knowledge-aware — they leverage gbrain context"; HRN-02 gbrain portion covered by GB-01 through GB-04 in Phase 19 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/auth/tailscale.ts` | Tailscale LocalAPI whois client | ✓ VERIFIED | Exports whoisByAddr; checks 100.x prefix; Unix socket /var/run/tailscaled.socket; 2s timeout; optional baseUrl for testability |
| `packages/api/src/auth/roles.ts` | Email-to-role mapping | ✓ VERIFIED | Exports resolveRole, isKnownUser; reads ADMIN_EMAILS/OPERATOR_EMAILS env vars; case-insensitive |
| `packages/api/src/auth/magic-link.ts` | Magic link token generation/verification | ✓ VERIFIED | Exports generateMagicLinkToken, verifyMagicLinkToken, sendMagicLinkEmail; HMAC-SHA256; timingSafeEqual; SendGrid or console fallback |
| `packages/api/src/auth/middleware.ts` | 3-path auth middleware | ✓ VERIFIED | Exports authMiddleware and getUserScope; 3 paths: Tailscale-User-Login header → IP whois → cookie; upsertUser on each successful auth |
| `packages/api/src/routes/auth.ts` | Auth routes (magic-link, verify, me) | ✓ VERIFIED | POST /magic-link, GET /verify (sets httpOnly cookie), GET /me returns {user:{id,email,role}} |
| `packages/api/src/db/schema.ts` | users, magic_link_tokens, user_sessions tables | ✓ VERIFIED | pgTable('users'), pgTable('magic_link_tokens'), pgTable('user_sessions') all present with correct columns, FKs, indexes |
| `packages/api/src/routes/operator.ts` | POST /request, GET /history, gate-response | ✓ VERIFIED | All routes implemented; Zod validation; getUserScope for isolation; spawnPipeline wired post-creation; audit trail logged |
| `packages/api/src/db/schema.ts` | operatorRequests, auditTrail tables | ✓ VERIFIED | pgTable('operator_requests') and pgTable('audit_trail') with userId FK, status, pipelinePid, outputDir |
| `packages/api/src/pipeline/spawner.ts` | Claude Code subprocess spawner | ✓ VERIFIED | Exports spawnPipeline; detached:true; child.unref(); --max-turns 50; --allowedTools; request.json file handoff (T-17-14) |
| `packages/api/src/pipeline/file-watcher.ts` | Progress file polling | ✓ VERIFIED | Exports watchPipelineOutput, stopWatching, finalSweep; 2s polling; emits operator:progress and operator:gate via pipelineBus |
| `packages/api/src/pipeline/system-prompt.ts` | System prompt builder | ✓ VERIFIED | Exports buildPipelineSystemPrompt; instructs stages, progress file format, gate files, curl callback |
| `packages/web/src/components/operator/PipelineProgress.tsx` | Real-time SSE progress UI | ✓ VERIFIED | EventSource('/api/sse'); filters by runId; handles operator:progress, operator:gate, operator:complete; GateCard with option buttons |
| `packages/web/src/components/operator/IntakeForm.tsx` | Intake form with 3 fields | ✓ VERIFIED | whatNeeded textarea, whatGood textarea, deadline text input; useMutation POST to /api/operator/request; invalidates history query |
| `packages/web/src/components/operator/RequestHistory.tsx` | Session-scoped history | ✓ VERIFIED | useQuery ['operator','history']; status badges; relative timestamps |
| `packages/web/src/components/operator/OperatorHome.tsx` | IntakeForm + RequestHistory composed | ✓ VERIFIED | Renders both components; "What can I help with?" heading |
| `packages/web/src/components/auth/LoginPage.tsx` | Magic link email input | ✓ VERIFIED | Email input; POST /api/auth/magic-link; success/403 states |
| `packages/api/src/pipeline/callback-server.ts` | Callback server | ⚠️ ORPHANED (acceptable deviation) | Does not exist as standalone file — implemented as POST /api/operator/pipeline/callback route in operator.ts. Documented decision in 17-03-SUMMARY.md. Function fully present, artifact path changed. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auth/middleware.ts` | `auth/tailscale.ts` | whoisByAddr(remoteAddr) | ✓ WIRED | grep confirms whoisByAddr imported and called on 100.x IP check |
| `auth/middleware.ts` | `auth/roles.ts` | resolveRole(tsLoginHeader) | ✓ WIRED | Both header path and IP path call resolveRole |
| `auth/middleware.ts` | `db/schema.ts` | userSessions table lookup | ✓ WIRED | Cookie path queries userSessions with expiry check |
| `routes/auth.ts` | `auth/magic-link.ts` | generateMagicLinkToken + sendMagicLinkEmail | ✓ WIRED | Both functions imported and called in POST /magic-link |
| `routes/auth.ts` | `auth/middleware.ts` | c.get('user') in GET /me | ✓ WIRED | GET /me reads c.get('user') set by authMiddleware |
| `index.ts` | `auth/middleware.ts` | app.use('/api/*', authMiddleware) | ✓ WIRED | authMiddleware mounted on apiRoutes with exclusions for magic-link, verify, health, webhook |
| `routes/operator.ts` | `auth/middleware.ts` | getUserScope for isolation | ✓ WIRED | getUserScope imported and called in GET /history |
| `web/IntakeForm.tsx` | `/api/operator/request` | fetch POST | ✓ WIRED | Direct fetch to /api/operator/request with JSON body |
| `web/RequestHistory.tsx` | `/api/operator/history` | useQuery GET | ✓ WIRED | useQuery fetches /api/operator/history |
| `routes/operator.ts` | `pipeline/spawner.ts` | spawnPipeline() after request creation | ✓ WIRED | spawnPipeline called in POST /request after DB insert |
| `pipeline/file-watcher.ts` | `events/bus.ts` | pipelineBus.emit('pipeline:event') | ✓ WIRED | pipelineBus.emit called in processProgressFile and processGateFile |
| `web/PipelineProgress.tsx` | `/api/sse` | EventSource listening for pipeline events | ✓ WIRED | new EventSource('/api/sse'); handles operator:progress, operator:gate, operator:complete |
| `pipeline/spawner.ts` | `packages/harness` (ModelRouter) | provider selection | ✗ NOT WIRED | spawner.ts spawns 'claude' CLI directly; no import from packages/harness; ModelRouter not used |
| `web/App.tsx` | `auth/LoginPage.tsx` | role-based routing | ✓ WIRED | if (!authData?.user) → LoginPage or LandingPage; if role==='operator' → OperatorHome |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `RequestHistory.tsx` | requests array | GET /api/operator/history → operatorRequests table | Yes — DB query with getUserScope scoping | ✓ FLOWING |
| `PipelineProgress.tsx` | stages, gates, isComplete | EventSource('/api/sse') → pipelineBus → file-watcher | Real files from Claude subprocess OR test-only; runtime depends on claude CLI | ✓ FLOWING (architecture sound; E2E needs human) |
| `App.tsx` | authData | GET /api/auth/me → userSessions table → users table | Yes — DB lookup with expiry check | ✓ FLOWING |
| `LoginPage.tsx` | mutation result | POST /api/auth/magic-link → magicLinkTokens table | Yes — DB insert + email send | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Auth files exist and export expected functions | grep checks on all auth files | All exports present | ✓ PASS |
| Schema has all 5 new tables | grep on schema.ts | users, magic_link_tokens, user_sessions, operator_requests, audit_trail all present | ✓ PASS |
| Auth middleware wired in index.ts | grep authMiddleware in index.ts | Confirmed mounted on apiRoutes | ✓ PASS |
| Web build succeeds | npm run build --workspace=@gstackapp/web | Built in 1.39s, 1027 modules | ✓ PASS |
| Phase 17 unit tests | npx vitest run (auth-roles, auth-tailscale, auth-magic-link) | 17 tests pass | ✓ PASS |
| Phase 17 integration tests | npx vitest run (session-isolation, operator-request) | 21 tests pass | ✓ PASS |
| Phase 17 pipeline tests | npx vitest run (pipeline-spawner, file-watcher, pipeline-sse) | 10 tests pass | ✓ PASS |
| ModelRouter provider selection in spawner | grep ModelRouter packages/api/src/pipeline/ | No results — not wired | ✗ FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-01 | Plan 17-01 | Tailscale tailnet user auto-access | ✓ SATISFIED | authMiddleware path 0+1; whoisByAddr; Tailscale-User-Login header |
| AUTH-02 | Plan 17-01 | Magic link for non-tailnet users | ✓ SATISFIED | generateMagicLinkToken, sendMagicLinkEmail, GET /auth/verify, httpOnly cookie |
| AUTH-03 | Plan 17-01 | User assigned operator or admin role | ✓ SATISFIED | resolveRole from ADMIN_EMAILS/OPERATOR_EMAILS; role stored in users table |
| AUTH-04 | Plan 17-01, 17-02 | Isolated session history, request queue, audit trail | ✓ SATISFIED | getUserScope enforces WHERE userId=?; auditTrail table per user; GET /request/:id 403 for cross-user |
| HRN-01 | Plan 17-02 | Web UI triggers pipeline via POST /api/operator/request | ✓ SATISFIED | Route exists, Zod validated, spawns subprocess, returns 201 |
| HRN-02 | Plan 17-03 | Harness spawns agent with provider selection via ModelRouter | ✗ BLOCKED | Spawner calls 'claude' CLI directly — ModelRouter not integrated. Provider selection deferred to CLI's own model selection. gbrain context (Phase 19) deferred. |
| HRN-03 | Plan 17-03 | Agent executes pipeline stages with structured tool_use output | ✓ SATISFIED | System prompt instructs clarify→plan→execute→verify stages; progress-NNN.json schema defined; architecture correct (E2E requires claude CLI) |
| HRN-04 | Plan 17-03 | Stage results stream to web UI via SSE | ✓ SATISFIED | pipelineBus.emit in file-watcher; EventSource in PipelineProgress; existing SSE route broadcasts all events generically |
| HRN-05 | Plan 17-03 | Decision gates emit SSE, web UI renders buttons, response resumes | ✓ SATISFIED | operator:gate events emitted; GateCard renders options; POST gate-response writes response file; architecture complete (E2E needs human) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `index.ts` | 31-44 | NODE_ENV=test bypasses auth middleware | ⚠️ Warning | Auth not enforced in test env; deliberate design decision (documented) — all phase 17 tests would need auth mocking without it. Not a production concern. |
| `pipeline/system-prompt.ts` | — | No gbrain context injection in prompt | ℹ️ Info | Per plan decisions, gbrain deferred to Phase 19. Prompt is functional without it. |
| `packages/api/src/pipeline/` | — | No callback-server.ts | ℹ️ Info | Deliberate deviation — callback implemented as Hono route in operator.ts. Documented in 17-03-SUMMARY.md decisions. |

### Human Verification Required

#### 1. Tailscale Auto-Login Flow

**Test:** Access the running server from a device on the Tailscale tailnet (100.x IP or via Funnel with Tailscale-User-Login header)
**Expected:** Dashboard loads with no login page; user appears as admin or operator based on email in ADMIN_EMAILS/OPERATOR_EMAILS env vars
**Why human:** Requires real Tailscale daemon running; Unix socket /var/run/tailscaled.socket not accessible in test environment

#### 2. Magic Link Email Flow

**Test:** In incognito browser, access dashboard, enter a known operator email, check email (or console for dev mode magic link URL), click link
**Expected:** "Check your email" confirmation shows; clicking link sets gstack_session cookie and redirects to OperatorHome
**Why human:** End-to-end browser + email flow cannot be automated without real server + SendGrid or visible console output

#### 3. Operator Role Isolation in Browser

**Test:** Log in as an operator user (magic link), submit a request, then log in as a different operator — verify the second operator does not see the first's request in history
**Expected:** Each operator sees only their own history; admin session sees all requests
**Why human:** Requires two concurrent authenticated browser sessions with different users

#### 4. Pipeline Subprocess Execution (Claude CLI)

**Test:** Submit an intake form request on the running server with claude CLI available on PATH; monitor /tmp/pipeline-{id}/ for progress files
**Expected:** Directory created, request.json written, progress-001.json etc. appear, SSE events stream to PipelineProgress component, status updates in real time
**Why human:** Requires running server + claude CLI on PATH; Task 3 (E2E verification) was auto-approved in autonomous mode

#### 5. Decision Gate Pause and Resume

**Test:** During a live pipeline execution, when Claude Code writes a gate-{id}.json file, verify the web UI renders approval buttons; click an option and verify pipeline resumes
**Expected:** Gate card appears with title, description, and option buttons; clicking a button POSTs gate response and shows "Waiting for pipeline to continue..."
**Why human:** Requires live pipeline execution producing gate files; cannot simulate without real claude subprocess

### Gaps Summary

**1 gap blocking full ROADMAP compliance:**

**HRN-02: Provider selection via ModelRouter not implemented.** The spawner calls `claude` CLI directly without using the harness ModelRouter (`packages/harness/src/router/model-router.ts`) for provider selection and failover. The implementation decision (D-07 in CONTEXT.md) chose the subprocess approach which delegates model selection to the claude CLI internally.

This is a deliberate architectural deviation from the HRN-02 requirement text. Two resolution paths:
1. Wire ModelRouter into spawner.ts (adds failover but requires harness integration complexity)
2. Update HRN-02 and ROADMAP SC4 text to reflect the D-07 decision — the subprocess provides its own model handling, and "provider selection" is delegated to the claude CLI

**Note on test infrastructure:** The full test suite shows 34 files failing when run concurrently via workspace runner due to PGlite setup timeout in `test-db.ts`. This is a **pre-existing issue** predating Phase 17 (test-db.ts was established in the PGlite migration commit `f26444e`). All 48 Phase 17 tests pass when run individually. This does not indicate a Phase 17 regression.

---

_Verified: 2026-04-11T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
