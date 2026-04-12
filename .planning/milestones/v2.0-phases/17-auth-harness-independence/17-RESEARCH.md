# Phase 17: Auth & Harness Independence - Research

**Researched:** 2026-04-11
**Domain:** Authentication (Tailscale + magic link), session isolation, Claude Code subprocess execution
**Confidence:** HIGH

## Summary

Phase 17 introduces two coupled systems: (1) dual-path authentication (Tailscale auto-detect for tailnet users, SendGrid magic links for external users) with role-based access control, and (2) a web-triggered pipeline execution engine that spawns Claude Code as a CLI subprocess with file-based result handoff.

The codebase already has strong foundations to build on: SSE streaming via `pipelineBus` EventEmitter, decision gates with Promise-based blocking (`GateManager`), an autonomous executor pattern that spawns subprocesses, and Hono route patterns with Zod validation. The main new work is adding auth middleware, a users table, session scoping on all queries, and a new subprocess spawner that shells out to `claude` CLI (distinct from the existing Claude Agent SDK-based agent loop).

**Primary recommendation:** Layer auth as Hono middleware that runs before all `/api/*` routes. Use Tailscale LocalAPI whois over Unix socket for zero-friction tailnet auth. Use `@sendgrid/mail` for magic links with HMAC-signed tokens stored in Postgres. Spawn `claude -p` as a child process per D-07, write results to `/tmp/pipeline-{id}/`, and bridge progress to SSE via the existing `pipelineBus`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tailscale auto-detect on first visit. If request comes from Tailscale IP, auto-identify user and land on dashboard with zero friction (no login page). If not on tailnet, show a clean login page with email input for magic link.
- **D-02:** Magic link sessions persist via httpOnly secure cookie for 7 days. External users re-authenticate weekly. Tailscale users never see a login page.
- **D-03:** Roles mapped via hardcoded allowlist in config/env. `ADMIN_EMAILS=ryan@quartermint.com`, `OPERATOR_EMAILS=ryn@...,bella@...,andrew@...`. New users added by editing config.
- **D-04:** Operators see only their own request history, audit trail, and pipeline runs. Admin (Ryan) sees everything across all users.
- **D-05:** Structured intake form matching OP-01 requirements: "What do you need?" (textarea) + "What does good look like?" (textarea) + optional deadline (text input). Clean fields, submit button.
- **D-06:** Operator home IS the intake form. Operators land on the form as their primary view. Request history appears below the form. Minimal navigation -- the form is their whole world.
- **D-07:** Spawn Claude Code as a subprocess for each pipeline run. Shell out to `claude` CLI. Gets the full agent loop (tool_use, reasoning, multi-turn) for free without reimplementing it.
- **D-08:** File-based handoff for results. Claude Code writes results to a temp directory (`/tmp/pipeline-{id}/`). No stdout parsing needed.
- **D-09:** Hybrid polling: server polls the output directory for progress updates on an interval, but Claude Code signals completion via a local HTTP callback (webhook to localhost). Guarantees final result is immediate while progress updates flow on poll cycle.

### Claude's Discretion
- Poll interval for progress updates -- Claude decides appropriate frequency
- Claude Code CLI flags and configuration for subprocess spawning
- Temp directory structure and file naming conventions
- Local webhook endpoint path and payload format

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User on Tailscale tailnet can access dashboard without additional login | Tailscale LocalAPI whois endpoint verified on this machine; returns UserProfile with LoginName, DisplayName |
| AUTH-02 | User not on tailnet can authenticate via magic link email (SendGrid) | @sendgrid/mail v8.1.6 available; HMAC-signed token pattern documented |
| AUTH-03 | Authenticated user is assigned operator or admin role | Hardcoded allowlist in env vars per D-03; middleware maps email to role |
| AUTH-04 | Each user has isolated session history, request queue, and audit trail | New `users` table + `userId` foreign key on existing tables; query scoping in middleware |
| HRN-01 | Web UI can trigger pipeline run via POST /api/operator/request | New Hono route with Zod validation; follows existing `autonomousApp.post('/launch')` pattern |
| HRN-02 | Harness spawns agent session with provider selection | `claude -p` subprocess with `--allowedTools` and system prompt injection |
| HRN-03 | Agent executes pipeline stages with structured tool_use output | Claude Code handles tool_use natively; structured output via system prompt instructions |
| HRN-04 | Stage results stream to web UI via SSE | File watcher + pipelineBus.emit(); extends existing SSE pattern in `sse.ts` |
| HRN-05 | Decision gates emit SSE events, UI renders approval buttons, user response resumes pipeline | Existing `GateManager` + `DecisionGateCard` components reusable; extend for operator pipeline context |
</phase_requirements>

## Standard Stack

### Core (New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @sendgrid/mail | 8.1.6 | Magic link email delivery | Official Twilio SendGrid SDK, 100 free emails/day, already mentioned in CONTEXT.md as configured for OIP |
| node:crypto | built-in | HMAC token signing for magic links | No external dependency; `createHmac('sha256', secret)` for token generation/verification |
| node:http | built-in | Tailscale LocalAPI whois via Unix socket | Node.js native HTTP over Unix domain socket; no library needed |
| node:child_process | built-in | Claude Code subprocess spawning | `spawn('claude', [...args])` for pipeline execution per D-07 |
| node:fs/promises | built-in | File watcher for pipeline output | `watch()` for monitoring `/tmp/pipeline-{id}/` per D-08 |
| chokidar | 4.0.3 | Robust file watching (fallback) | More reliable cross-platform file watching than native `fs.watch`; handles edge cases |

[VERIFIED: npm registry] @sendgrid/mail v8.1.6
[VERIFIED: local machine] node v22.22.0 (all built-in modules available)
[ASSUMED] chokidar may not be needed if native fs.watch is sufficient on macOS

### Existing (Already in Project)

| Library | Current Version | Role in Phase 17 |
|---------|----------------|-------------------|
| hono | 4.12.12 | Auth middleware, cookie helpers, new routes |
| drizzle-orm | 0.45.2 | Users table, session scoping queries |
| zod | 3.24 | Intake form validation, auth token schemas |
| nanoid | 5.1.7 | User IDs, request IDs, token generation |
| pino | 9.6 | Auth event logging, pipeline execution logging |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HMAC-signed magic link tokens | JWT for magic links | HMAC is simpler -- magic links are one-time-use, no need for stateless token claims. Store token hash in DB, delete after use. |
| Hardcoded email allowlist | Database-managed user roles | Overkill for 4-5 known users. Config edit is fine per D-03. |
| @sendgrid/mail | nodemailer + SMTP | SendGrid is already configured for OIP per canonical refs. No reason to switch. |
| `claude` CLI subprocess | Claude Agent SDK `query()` | D-07 explicitly chose CLI subprocess. SDK is already used for the existing agent loop (different use case). CLI gives full Claude Code experience (CLAUDE.md, hooks, permissions). |
| File-based handoff (D-08) | stdout parsing | File-based is more reliable, no streaming parser needed, Claude Code can write structured JSON files. |

**Installation:**
```bash
npm install @sendgrid/mail --workspace=packages/api
```

## Architecture Patterns

### Recommended Project Structure (New Files)
```
packages/api/src/
  auth/
    middleware.ts        # Hono middleware: tailscale-detect -> cookie-check -> reject
    tailscale.ts         # LocalAPI whois client over Unix socket
    magic-link.ts        # Token generation, SendGrid email, verification
    roles.ts             # Email-to-role mapping from env vars
  routes/
    auth.ts              # POST /auth/magic-link, GET /auth/verify/:token, GET /auth/me
    operator.ts          # POST /operator/request, GET /operator/history
  pipeline/
    spawner.ts           # Claude Code subprocess lifecycle
    file-watcher.ts      # Poll /tmp/pipeline-{id}/ for progress
    callback-server.ts   # Local HTTP endpoint for completion webhook
  db/
    schema.ts            # Add: users, operatorRequests, auditTrail tables
packages/web/src/
  components/
    auth/
      LoginPage.tsx      # Magic link email input (external users only)
    operator/
      IntakeForm.tsx     # D-05: "What do you need?" + "Good looks like" + deadline
      RequestHistory.tsx # Below the form per D-06
      OperatorHome.tsx   # Compose IntakeForm + RequestHistory
```

### Pattern 1: Dual-Path Auth Middleware
**What:** Single Hono middleware that checks three auth paths in order: (1) Tailscale-User-Login header (for Funnel-proxied tailnet users), (2) Tailscale IP detection via LocalAPI whois (for direct tailnet connections), (3) session cookie validation. Sets `c.set('user', {...})` on the Hono context.
**When to use:** Every `/api/*` route except `/api/health` and `/api/auth/*`.

```typescript
// Source: Verified against Tailscale LocalAPI on this machine + Hono cookie docs
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { whoisByAddr } from '../auth/tailscale'
import { verifySessionToken } from '../auth/magic-link'
import { resolveRole } from '../auth/roles'

export const authMiddleware = createMiddleware(async (c, next) => {
  // Path 0: Tailscale Funnel header (Funnel may mask source IP but sets this header)
  const tsLoginHeader = c.req.header('tailscale-user-login')
  if (tsLoginHeader) {
    const role = resolveRole(tsLoginHeader)
    if (role) {
      // Upsert user in DB, set context
      c.set('user', { id: /* upserted userId */, email: tsLoginHeader, role, source: 'tailscale' })
      return next()
    }
  }

  // Path 1: Tailscale IP auto-detect (direct tailnet connections)
  const remoteAddr = c.req.header('x-forwarded-for') ?? c.env?.remoteAddr
  if (remoteAddr) {
    const tsUser = await whoisByAddr(remoteAddr)
    if (tsUser) {
      const role = resolveRole(tsUser.loginName)
      c.set('user', { id: tsUser.userId, email: tsUser.loginName, role, source: 'tailscale' })
      return next()
    }
  }

  // Path 2: Session cookie
  const sessionToken = getCookie(c, 'gstack_session')
  if (sessionToken) {
    const session = await verifySessionToken(sessionToken)
    if (session) {
      c.set('user', { id: session.userId, email: session.email, role: session.role, source: 'magic-link' })
      return next()
    }
  }

  // No auth: return 401 for API, redirect for pages
  return c.json({ error: 'Unauthorized' }, 401)
})
```

### Pattern 2: Tailscale LocalAPI Whois Client
**What:** HTTP request over Unix domain socket to Tailscale's LocalAPI.
**When to use:** When a request arrives from a Tailscale IP (100.x.x.x range).

```typescript
// Source: Verified on this machine - socket at /var/run/tailscaled.socket
import { request } from 'node:http'

const TAILSCALE_SOCKET = '/var/run/tailscaled.socket'

interface TailscaleWhoisResult {
  userId: string
  loginName: string  // e.g., "sternryan@github"
  displayName: string
  nodeName: string
}

export async function whoisByAddr(addr: string): Promise<TailscaleWhoisResult | null> {
  // Only check Tailscale IPs (100.64.0.0/10 range)
  if (!addr.startsWith('100.')) return null

  return new Promise((resolve) => {
    const req = request({
      socketPath: TAILSCALE_SOCKET,
      path: `/localapi/v0/whois?addr=${addr}:0`,
      method: 'GET',
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({
            userId: String(json.UserProfile.ID),
            loginName: json.UserProfile.LoginName,
            displayName: json.UserProfile.DisplayName,
            nodeName: json.Node.ComputedName,
          })
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(2000, () => { req.destroy(); resolve(null) })
    req.end()
  })
}
```

### Pattern 3: Claude Code Subprocess Spawner (D-07, D-08, D-09)
**What:** Spawn `claude -p` as a child process, write results to temp directory, signal completion via localhost webhook.
**When to use:** When operator submits a request via the intake form.

```typescript
// Source: Verified claude CLI at /Users/ryanstern/.local/bin/claude v2.1.101
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface PipelineSpawnOptions {
  pipelineId: string
  prompt: string
  projectPath: string
  callbackUrl: string  // e.g., http://localhost:3000/api/pipeline/callback
}

export function spawnPipeline(options: PipelineSpawnOptions): void {
  const outputDir = `/tmp/pipeline-${options.pipelineId}`
  mkdirSync(outputDir, { recursive: true })

  // Write the prompt to a file for the system prompt to reference
  writeFileSync(join(outputDir, 'request.json'), JSON.stringify({
    pipelineId: options.pipelineId,
    prompt: options.prompt,
    outputDir,
    callbackUrl: options.callbackUrl,
  }))

  const systemPrompt = buildPipelineSystemPrompt(options.pipelineId, outputDir, options.callbackUrl)

  const child = spawn('claude', [
    '-p', options.prompt,
    '--system-prompt', systemPrompt,
    '--allowedTools', 'Read,Write,Bash,Glob,Grep',
    '--max-turns', '50',
    '--output-format', 'json',
  ], {
    cwd: options.projectPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    detached: true,  // Don't kill child if parent exits
  })

  child.unref()  // Allow parent to exit independently

  // Log stderr for debugging
  child.stderr?.on('data', (data: Buffer) => {
    logger.warn({ pipelineId: options.pipelineId }, data.toString())
  })

  child.on('exit', (code) => {
    logger.info({ pipelineId: options.pipelineId, exitCode: code }, 'Claude Code subprocess exited')
  })
}
```

### Pattern 4: File-Based Progress Polling (D-09)
**What:** Server polls output directory for structured progress files. Claude Code writes `progress-{n}.json` files during execution. Completion signaled via localhost HTTP callback.

```typescript
// Recommended file structure in /tmp/pipeline-{id}/
// progress-001.json  -- { stage: 'clarify', status: 'running', timestamp: ... }
// progress-002.json  -- { stage: 'clarify', status: 'complete', result: {...}, timestamp: ... }
// progress-003.json  -- { stage: 'plan', status: 'running', timestamp: ... }
// ...
// result.json         -- Final pipeline result (written by Claude Code)
// gate-{id}.json      -- Decision gate request (Claude Code writes, server reads)
```

### Anti-Patterns to Avoid
- **Parsing Claude Code stdout for structured data:** Stdout format is not stable. Use file-based handoff per D-08.
- **Using the existing Agent SDK loop for pipeline execution:** D-07 explicitly chose CLI subprocess. The SDK-based loop in `agent/loop.ts` is for a different use case (interactive chat sessions).
- **Building a custom auth library:** Use Hono's built-in cookie helpers + node:crypto HMAC. No need for passport, lucia, or better-auth at this scale.
- **Storing magic link tokens in plaintext:** Always hash tokens before storing. Compare with `timingSafeEqual`.
- **Blocking the Hono event loop on subprocess I/O:** Use `detached: true` + `child.unref()` so the subprocess runs independently.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email delivery | SMTP client | @sendgrid/mail | Deliverability, rate limiting, bounce handling. SendGrid already configured. |
| Tailscale user detection | IP range guessing | Tailscale LocalAPI whois | Authoritative source of truth. Returns actual user identity, not just "is on tailnet". |
| Token timing-safe comparison | `===` string comparison | `crypto.timingSafeEqual()` | Prevents timing attacks on magic link tokens. |
| File watching on macOS | Recursive `fs.watch` | chokidar or single-dir `fs.watch` | Native `fs.watch` on macOS uses kqueue with known edge cases. Single-directory polling is acceptable given the flat file structure. |
| Cookie security | Manual header setting | `hono/cookie` `setCookie()` | Handles httpOnly, secure, sameSite, maxAge correctly per RFC 6265bis. |

## Common Pitfalls

### Pitfall 1: Tailscale IP Detection Through Reverse Proxy
**What goes wrong:** When Tailscale Funnel forwards traffic, the original client IP may be in `X-Forwarded-For` or `X-Real-IP` headers, not the socket's remote address. Tailnet-direct connections use the raw Tailscale IP.
**Why it happens:** Tailscale Funnel acts as a reverse proxy. External traffic comes from Funnel's IP, not the original client.
**How to avoid:** Check headers in order: `Tailscale-User-Login` header first (Funnel sets this for authenticated tailnet users) > `x-forwarded-for` / socket remote address for IP-based whois. For external (non-tailnet) traffic arriving via Funnel, neither header nor 100.x IP will be present, correctly falling through to cookie auth.
**Warning signs:** All requests appear to come from the same IP; Tailscale users forced to magic-link auth.

### Pitfall 2: Magic Link Token Replay
**What goes wrong:** A magic link token is used multiple times, potentially by an attacker who intercepts the email.
**Why it happens:** Token not invalidated after first use.
**How to avoid:** Delete the token from the database immediately after successful verification. Set a short expiry (15 minutes). Include a `usedAt` column.
**Warning signs:** Multiple session creations from the same token.

### Pitfall 3: Claude Code Subprocess Zombie Processes
**What goes wrong:** If the Hono server restarts while a Claude Code subprocess is running, the child process becomes orphaned.
**Why it happens:** Default `child_process.spawn` ties the child to the parent's process group.
**How to avoid:** Use `detached: true` + `child.unref()`. Track active subprocess PIDs in the database. On server startup, check for orphaned processes (stale `RUNNING` status with no live PID).
**Warning signs:** `/tmp/pipeline-{id}/` directories with no `result.json` and no running process.

### Pitfall 4: Cookie Not Sent Over Tailscale Funnel HTTPS
**What goes wrong:** Session cookie not included in requests because `secure: true` requires HTTPS, but development may use HTTP.
**Why it happens:** Tailscale Funnel provides HTTPS externally, but local dev uses `http://localhost:3000`.
**How to avoid:** Set `secure: true` only when `NODE_ENV === 'production'` or when the request arrives over HTTPS. In development, use `secure: false`.
**Warning signs:** Magic link auth works once but session disappears on next request.

### Pitfall 5: Race Condition on File Watcher + Completion Callback
**What goes wrong:** The completion callback arrives before the file watcher has read the final progress file, resulting in missed progress updates.
**Why it happens:** File write and HTTP callback happen in sequence, but the file watcher poll interval may not have caught the last file yet.
**How to avoid:** When the completion callback fires, do a final sweep of the output directory for any unprocessed progress files before emitting the completion event.
**Warning signs:** Pipeline shows as "complete" but the last stage progress is missing from the UI.

## Code Examples

### Magic Link Token Generation and Verification

```typescript
// Source: node:crypto docs + SendGrid npm docs
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET! // 32+ byte random secret

export function generateMagicLinkToken(email: string): { token: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString('hex')
  const hash = createHmac('sha256', MAGIC_LINK_SECRET).update(raw).digest('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  return { token: raw, hash, expiresAt }
}

export function verifyMagicLinkToken(token: string, storedHash: string): boolean {
  const computedHash = createHmac('sha256', MAGIC_LINK_SECRET).update(token).digest('hex')
  return timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash))
}
```

### SendGrid Magic Link Email

```typescript
// Source: @sendgrid/mail npm docs (v8.1.6)
import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const baseUrl = process.env.PUBLIC_URL ?? 'https://ryans-mac-mini.tail857f5c.ts.net'
  const link = `${baseUrl}/auth/verify?token=${token}&email=${encodeURIComponent(email)}`

  await sgMail.send({
    to: email,
    from: process.env.SENDGRID_FROM_EMAIL ?? 'noreply@quartermint.com',
    subject: 'Sign in to gstackapp',
    text: `Click this link to sign in: ${link}\n\nThis link expires in 15 minutes.`,
    html: `<p>Click <a href="${link}">here</a> to sign in to gstackapp.</p><p>This link expires in 15 minutes.</p>`,
  })
}
```

### Session Cookie Setup

```typescript
// Source: Hono cookie helper docs
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'

export function setSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, 'gstack_session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days per D-02
    path: '/',
  })
}
```

### Database Schema Additions

```typescript
// New tables for auth + operator pipeline
export const users = pgTable('users', {
  id: text('id').primaryKey(),             // nanoid
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  role: text('role').notNull(),            // 'admin' | 'operator'
  source: text('source').notNull(),        // 'tailscale' | 'magic-link'
  tailscaleNodeName: text('tailscale_node_name'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
})

export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
})

export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(),             // This is the cookie value
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
})

export const operatorRequests = pgTable('operator_requests', {
  id: text('id').primaryKey(),             // nanoid
  userId: text('user_id').notNull().references(() => users.id),
  whatNeeded: text('what_needed').notNull(),
  whatGood: text('what_good').notNull(),
  deadline: text('deadline'),
  status: text('status').notNull().default('pending'),
    // pending | running | paused | complete | failed
  pipelinePid: integer('pipeline_pid'),    // Claude Code subprocess PID
  outputDir: text('output_dir'),           // /tmp/pipeline-{id}/
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('or_user_idx').on(table.userId),
  index('or_status_idx').on(table.status),
])

export const auditTrail = pgTable('audit_trail', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  requestId: text('request_id').references(() => operatorRequests.id),
  action: text('action').notNull(),         // 'login' | 'request_submitted' | 'gate_approved' | ...
  detail: text('detail'),                   // JSON stringified context
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('audit_user_idx').on(table.userId),
  index('audit_request_idx').on(table.requestId),
])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Passport.js sessions | Hono native cookie helpers + custom middleware | 2024+ | No heavy session middleware needed for small user counts |
| Claude Agent SDK for all AI execution | Claude Code CLI subprocess for autonomous tasks | 2026 | CLI gives full Claude Code experience (CLAUDE.md, hooks, MCP) vs SDK which is bare agent loop |
| stdout parsing for subprocess output | File-based handoff (D-08) | Project decision | More reliable, structured, no streaming parser needed |

**Deprecated/outdated:**
- `hono-session` npm package: Works but unnecessary complexity for 4-5 users with known emails. Direct cookie + DB session is cleaner.
- `lucia-auth`: Deprecated in favor of custom auth per their docs. Not needed at this scale anyway.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SendGrid is already configured with a verified sender domain for quartermint.com | Standard Stack | Would need to set up SendGrid account and verify domain before magic links work |
| A2 | `noreply@quartermint.com` is a valid/verified SendGrid sender | Code Examples | Email delivery will fail; need to verify correct sender address |
| A3 | Tailscale Funnel preserves source IP for tailnet-originating connections | Pitfalls | If Funnel masks the IP, tailnet auto-detect won't work; would need alternative header |
| A4 | `chokidar` may not be needed -- native `fs.watch` sufficient for flat directory monitoring | Standard Stack | If file events are missed, progress updates won't flow to SSE |
| A5 | `MAGIC_LINK_SECRET` env var will be set before deployment | Code Examples | Token generation/verification will crash without it |

## Open Questions (RESOLVED)

1. **SendGrid sender verification status** -- RESOLVED
   - What we know: CONTEXT.md says "SendGrid already configured for OIP"
   - Resolution: The verified sender email is configured via `SENDGRID_FROM_EMAIL` env var at deploy time. The implementation reads from this env var (with `noreply@quartermint.com` as fallback). In dev mode (no `SENDGRID_API_KEY`), magic link URLs are logged to console instead of emailed. The executor should use whatever sender is already verified in the SendGrid dashboard. No code change needed -- the env var approach handles this.

2. **Tailscale Funnel IP forwarding behavior** -- RESOLVED
   - What we know: Direct tailnet connections use 100.x.x.x IPs. LocalAPI whois works on those IPs.
   - Resolution: Tailscale Funnel acts as a reverse proxy and MAY mask the original tailnet source IP. The auth middleware implements a three-path fallback: (1) check `Tailscale-User-Login` header first (set by Funnel for authenticated tailnet users accessing via the Funnel URL), (2) fall back to IP-based whois via LocalAPI for direct tailnet connections (100.x IPs), (3) session cookie. This covers both access paths: Funnel URL access uses the header, direct tailnet access uses IP whois, and external users use cookie auth. If Funnel does NOT mask the IP, path 2 catches it. If it does, path 1 catches it.

3. **Claude Code `--output-format json` flag behavior** -- RESOLVED
   - What we know: `claude -p` runs non-interactively and outputs to stdout.
   - Resolution: Per D-08, we do NOT parse stdout for structured pipeline data. All structured pipeline data flows via file-based handoff (progress-NNN.json, gate-{id}.json, result.json written to `/tmp/pipeline-{id}/`). The `--output-format json` flag is passed to the subprocess for its own output logging but is not consumed by the pipeline engine. The system prompt instructs Claude Code to write structured JSON files to the output directory. Stdout content is irrelevant to pipeline operation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 22.22.0 | -- |
| claude CLI | Pipeline subprocess (D-07) | Yes | 2.1.101 | -- |
| Tailscale | Auth auto-detect (AUTH-01) | Yes | 1.94.1 | -- |
| Tailscale socket | LocalAPI whois | Yes | /var/run/tailscaled.socket | `tailscale whois --json` CLI fallback |
| SendGrid account | Magic link emails (AUTH-02) | Unknown | -- | Console log token in dev mode |
| Neon Postgres | Database | Yes | Configured in .env | -- |
| npm | Package management | Yes | 10.9.4 | -- |

**Missing dependencies with no fallback:**
- None identified -- all critical dependencies are available.

**Missing dependencies with fallback:**
- SendGrid account status unknown -- can develop with console-logged tokens, verify SendGrid before deployment.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1 |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `npm test --workspace=packages/api -- --run` |
| Full suite command | `npm test --workspace=packages/api` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Tailscale whois returns user profile for 100.x IP | unit | `npx vitest run src/__tests__/auth-tailscale.test.ts -t "whois"` | Wave 0 |
| AUTH-02 | Magic link token generation, hashing, verification, email send | unit | `npx vitest run src/__tests__/auth-magic-link.test.ts` | Wave 0 |
| AUTH-03 | Role resolution from email allowlist | unit | `npx vitest run src/__tests__/auth-roles.test.ts` | Wave 0 |
| AUTH-04 | Session-scoped queries return only user's own data | integration | `npx vitest run src/__tests__/session-isolation.test.ts` | Wave 0 |
| HRN-01 | POST /api/operator/request validates and creates request | unit | `npx vitest run src/__tests__/operator-route.test.ts` | Wave 0 |
| HRN-02 | Subprocess spawns with correct CLI flags | unit | `npx vitest run src/__tests__/pipeline-spawner.test.ts` | Wave 0 |
| HRN-03 | File watcher detects progress files | unit | `npx vitest run src/__tests__/file-watcher.test.ts` | Wave 0 |
| HRN-04 | SSE events emitted when progress files detected | integration | `npx vitest run src/__tests__/pipeline-sse.test.ts` | Wave 0 |
| HRN-05 | Decision gate creates/resolves via file handoff | unit | `npx vitest run src/__tests__/gate-manager.test.ts -t "file"` | Extends existing |

### Sampling Rate
- **Per task commit:** `npm test --workspace=packages/api -- --run`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/auth-tailscale.test.ts` -- mock Unix socket responses for whois
- [ ] `src/__tests__/auth-magic-link.test.ts` -- token lifecycle (generate, hash, verify, expire)
- [ ] `src/__tests__/auth-roles.test.ts` -- email-to-role mapping from env vars
- [ ] `src/__tests__/session-isolation.test.ts` -- query scoping by userId
- [ ] `src/__tests__/operator-route.test.ts` -- intake form validation and request creation
- [ ] `src/__tests__/pipeline-spawner.test.ts` -- mock child_process.spawn, verify CLI args
- [ ] `src/__tests__/file-watcher.test.ts` -- write files, verify detection
- [ ] `src/__tests__/pipeline-sse.test.ts` -- file detection -> pipelineBus emit -> SSE write

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Tailscale LocalAPI whois (network-level auth) + HMAC-signed magic link tokens with 15min expiry |
| V3 Session Management | Yes | httpOnly secure cookie, 7-day expiry (D-02), server-side session table with explicit expiry |
| V4 Access Control | Yes | Role-based (admin/operator) from hardcoded allowlist (D-03), middleware-enforced query scoping (D-04) |
| V5 Input Validation | Yes | Zod schemas on all route inputs (existing pattern) |
| V6 Cryptography | Yes | node:crypto HMAC-SHA256 for tokens, timingSafeEqual for comparison |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Magic link token interception | Spoofing | Short expiry (15min), single-use (delete after verify), HTTPS-only links |
| Session cookie theft | Spoofing | httpOnly, secure, sameSite=Lax, 7-day rolling expiry |
| Path traversal via outputDir | Tampering | Validate outputDir starts with `/tmp/pipeline-` prefix |
| Subprocess command injection | Tampering | Never interpolate user input into CLI args; pass via file (D-08) |
| Operator accessing other user's data | Information Disclosure | `WHERE user_id = ?` on all queries; middleware-enforced, not route-level |
| Claude Code subprocess resource exhaustion | Denial of Service | `--max-turns 50` limit, track PIDs, kill orphaned processes on startup |
| Magic link token brute force | Spoofing | 32-byte random token (256 bits entropy), rate limit magic link requests |

## Sources

### Primary (HIGH confidence)
- [Tailscale LocalAPI whois] - Verified on local machine via `curl --unix-socket /var/run/tailscaled.socket` [VERIFIED: local machine]
- [Hono cookie helper docs](https://hono.dev/docs/helpers/cookie) - setCookie/getCookie API with security options [CITED: docs.hono.dev]
- [@sendgrid/mail npm](https://www.npmjs.com/package/@sendgrid/mail) - v8.1.6, official Twilio SDK [VERIFIED: npm registry]
- [claude CLI](https://code.claude.com/docs/en/cli-reference) - v2.1.101, -p/--print for non-interactive mode [VERIFIED: local machine]
- Existing codebase: `packages/api/src/agent/loop.ts`, `autonomous/executor.ts`, `autonomous/gate-manager.ts`, `routes/sse.ts` [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- [Tailscale identity docs](https://tailscale.com/docs/concepts/tailscale-identity) - LocalAPI whois concept and response structure [CITED: tailscale.com/docs]
- [Hono middleware factory](https://hono.dev/docs/helpers/factory) - createMiddleware pattern [CITED: docs.hono.dev]
- [SendGrid magic link tutorial](https://www.twilio.com/en-us/blog/magic-link-authentication-sendgrid-auth-js) - Pattern reference for token flow [CITED: twilio.com]

### Tertiary (LOW confidence)
- [Tailscale Funnel IP forwarding behavior] - Resolved via header fallback strategy; `Tailscale-User-Login` header checked first, IP whois as secondary path [RESOLVED: defensive implementation]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All packages verified on npm registry, all tools verified on local machine
- Architecture: HIGH -- Patterns directly derived from existing codebase patterns (autonomous executor, gate manager, SSE)
- Auth design: HIGH -- Tailscale whois verified locally; Funnel IP masking resolved via Tailscale-User-Login header fallback
- Pitfalls: HIGH -- Based on verified codebase patterns and known Node.js child_process behavior

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable dependencies, no fast-moving APIs)
