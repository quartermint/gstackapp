# Architecture Research

**Domain:** AI Code Review Pipeline (GitHub App)
**Researched:** 2026-03-30
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          INGRESS LAYER                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                    │
│  │ Tailscale    │───▶│ Hono Webhook │───▶│ Signature    │                    │
│  │ Funnel       │    │ Handler      │    │ Verifier     │                    │
│  └──────────────┘    └──────┬───────┘    └──────────────┘                    │
│                             │                                                │
├─────────────────────────────┼────────────────────────────────────────────────┤
│                      ORCHESTRATION LAYER                                     │
│                             │                                                │
│  ┌──────────────────────────▼───────────────────────────┐                    │
│  │              Pipeline Orchestrator                    │                    │
│  │  - Creates pipeline_run record                        │                    │
│  │  - Spawns 5 parallel stage executors                  │                    │
│  │  - Aggregates results + updates PR comment            │                    │
│  │  - Handles force-push cancellation                    │                    │
│  └──┬──────┬──────┬──────┬──────┬───────────────────────┘                    │
│     │      │      │      │      │                                            │
├─────┼──────┼──────┼──────┼──────┼────────────────────────────────────────────┤
│     │  STAGE EXECUTION LAYER (parallel)                  │                    │
│     │      │      │      │      │                                            │
│  ┌──▼──┐┌──▼──┐┌──▼──┐┌──▼──┐┌──▼──┐                                        │
│  │ CEO ││ Eng ││Dsgn ││ QA  ││ Sec │  ← Claude API tool_use per stage       │
│  └──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘                                        │
│     │      │      │      │      │                                            │
│  ┌──▼──────▼──────▼──────▼──────▼──┐                                         │
│  │    Sandbox File Access Layer     │                                         │
│  │  read_file / list_files /        │                                         │
│  │  search_code (path-sandboxed)    │                                         │
│  └──────────────┬──────────────────┘                                         │
│                 │                                                             │
├─────────────────┼────────────────────────────────────────────────────────────┤
│           DATA LAYER                │                                         │
│                 │                                                             │
│  ┌──────────────▼──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │   SQLite (Drizzle ORM)      │  │ sqlite-vec   │  │ /tmp Clone Store │     │
│  │  6 tables: installations,   │  │ Embeddings   │  │ Shallow clones   │     │
│  │  repos, PRs, runs, stages,  │  │ cross-repo   │  │ per pipeline     │     │
│  │  findings                   │  │ findings     │  │                  │     │
│  └─────────────────────────────┘  └──────────────┘  └──────────────────┘     │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                          EXTERNAL SERVICES                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                        │
│  │ GitHub API   │  │ Claude API   │  │ GitHub       │                        │
│  │ (Octokit)    │  │ (tool_use)   │  │ Webhooks     │                        │
│  └──────────────┘  └──────────────┘  └──────────────┘                        │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND LAYER                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Pipeline     │  │ Activity     │  │ Quality      │  │ Cross-Repo   │      │
│  │ Hero View    │  │ Feed         │  │ Trends       │  │ Intelligence │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │                 │              │
│  ┌──────▼─────────────────▼─────────────────▼─────────────────▼──────┐       │
│  │                    SSE Event Stream                                │       │
│  │              (Hono streamSSE → React EventSource)                 │       │
│  └───────────────────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Webhook Handler** | Receive GitHub events, verify signature, filter event types, respond within 10s | Hono route + `@octokit/webhooks` signature verification |
| **Pipeline Orchestrator** | Create pipeline_run, dispatch stages, aggregate results, manage PR comment lifecycle | In-process async coordinator with per-PR mutex |
| **Stage Executor** | Run a single cognitive review stage against the codebase | Claude API `tool_use` with sandboxed file tools |
| **Sandbox File Layer** | Provide read_file/list_files/search_code scoped to clone dir | Path resolution + symlink escape prevention (fs.realpathSync) |
| **Clone Manager** | Shallow clone PR branch to /tmp, cleanup after pipeline | `git clone --depth=1 --branch` + cleanup on completion |
| **Comment Manager** | Create or update the single PR comment with stage results | Octokit `issues.createComment` / `issues.updateComment` |
| **Embedding Service** | Generate and query finding embeddings for cross-repo patterns | sqlite-vec + Claude embeddings or local model |
| **SSE Broadcaster** | Stream pipeline progress to dashboard in real-time | Hono `streamSSE` helper + event bus |
| **Dashboard Frontend** | Render pipeline visualization, feed, trends, intelligence | React SPA with EventSource for live updates |

## Recommended Project Structure

```
packages/
├── api/                        # Hono backend (monolith)
│   └── src/
│       ├── index.ts            # Hono app entry, route mounting
│       ├── routes/
│       │   ├── webhook.ts      # POST /api/webhook (GitHub events)
│       │   ├── sse.ts          # GET /api/sse (dashboard streaming)
│       │   ├── pipelines.ts    # GET /api/pipelines (list/detail)
│       │   ├── repos.ts        # GET /api/repos (installed repos)
│       │   └── trends.ts       # GET /api/trends (quality data)
│       ├── pipeline/
│       │   ├── orchestrator.ts # Pipeline lifecycle management
│       │   ├── stage-runner.ts # Single stage execution loop
│       │   ├── tools.ts        # read_file, list_files, search_code
│       │   ├── sandbox.ts      # Path validation + symlink guard
│       │   ├── clone.ts        # Git clone + cleanup
│       │   └── prompts/        # Per-stage prompt templates
│       │       ├── ceo.md
│       │       ├── eng.md
│       │       ├── design.md
│       │       ├── qa.md
│       │       └── security.md
│       ├── github/
│       │   ├── auth.ts         # Installation token management
│       │   ├── comment.ts      # PR comment create/update/render
│       │   └── client.ts       # Octokit instance factory
│       ├── embeddings/
│       │   ├── index.ts        # Embedding generation
│       │   ├── search.ts       # Cross-repo similarity search
│       │   └── ingest.ts       # Post-pipeline finding ingestion
│       ├── events/
│       │   └── bus.ts          # In-process event emitter for SSE
│       ├── db/
│       │   ├── schema.ts       # Drizzle schema (6 tables)
│       │   ├── client.ts       # SQLite connection + sqlite-vec
│       │   └── migrations/     # Drizzle migrations
│       └── lib/
│           ├── config.ts       # Environment + app config
│           └── types.ts        # Shared types + Zod schemas
├── web/                        # React frontend
│   └── src/
│       ├── App.tsx
│       ├── hooks/
│       │   ├── useSSE.ts       # EventSource hook
│       │   └── usePipeline.ts  # Pipeline state management
│       ├── components/
│       │   ├── pipeline/       # Pipeline hero visualization
│       │   ├── feed/           # Activity feed
│       │   ├── trends/         # Quality trend charts
│       │   └── intelligence/   # Cross-repo insights
│       └── lib/
│           ├── api.ts          # REST client
│           └── types.ts        # Shared frontend types
└── shared/                     # Shared between api and web
    ├── schemas.ts              # Zod schemas (StageResult, Finding, etc.)
    └── constants.ts            # Stage names, verdict types
```

### Structure Rationale

- **packages/api/src/pipeline/:** Core differentiator lives here. Isolating pipeline logic from HTTP routing keeps the orchestrator testable and the stage runners independently mockable via AI SDK MockLanguageModelV1.
- **packages/api/src/github/:** All GitHub API interaction behind a single boundary. Installation token caching, comment rendering, and Octokit client creation are colocated because they share auth state.
- **packages/api/src/routes/:** Thin HTTP layer that delegates to pipeline and github modules. Routes stay small -- validation + delegation only.
- **packages/shared/:** Zod schemas shared between frontend and backend ensure type-safe stage results without duplicate definitions.
- **prompts/*.md:** Separate markdown files for each stage's system prompt. These are the "brains" of the platform -- editable without touching code, version-controlled, diffable.

## Architectural Patterns

### Pattern 1: Webhook-Fast, Process-Async

**What:** Respond to GitHub webhook within 10 seconds (GitHub's hard timeout), then process the pipeline asynchronously in-process.
**When to use:** Always. GitHub will mark deliveries as failed if you don't respond in time, and may throttle your app.
**Trade-offs:** Simple in-process async works for single-user / low volume. At scale, you'd need a proper queue (BullMQ/Redis), but that's explicitly out of scope for Phase 1.

**Example:**
```typescript
// Webhook handler: fast ACK, async processing
app.post('/api/webhook', async (c) => {
  const payload = await c.req.json()
  const signature = c.req.header('x-hub-signature-256')

  // Verify signature (fast, synchronous)
  if (!verifySignature(payload, signature, webhookSecret)) {
    return c.json({ error: 'Invalid signature' }, 401)
  }

  // Filter: only process pull_request opened/synchronize
  const event = c.req.header('x-github-event')
  if (event !== 'pull_request') return c.json({ ok: true })
  if (!['opened', 'synchronize'].includes(payload.action)) {
    return c.json({ ok: true })
  }

  // Idempotency check via x-github-delivery header
  const deliveryId = c.req.header('x-github-delivery')
  if (await isAlreadyProcessed(deliveryId)) {
    return c.json({ ok: true, deduplicated: true })
  }

  // ACK fast, process async
  orchestrator.startPipeline(payload).catch(console.error)
  return c.json({ ok: true, pipeline: 'started' })
})
```

### Pattern 2: Parallel Stage Execution with Fan-Out/Fan-In

**What:** All 5 stages run concurrently via `Promise.allSettled()`. Each stage independently calls Claude API with tool_use. The orchestrator waits for all to complete, then renders the final comment.
**When to use:** When stages are independent (no stage depends on another's output). This is true for gstackapp's cognitive review model.
**Trade-offs:** Higher Claude API concurrency (5 simultaneous calls). Cost is ~5x a single-pass review. But latency is nearly the same as one stage since they run in parallel.

**Example:**
```typescript
async function runPipeline(pr: PullRequest, clonePath: string) {
  const stages = ['ceo', 'eng', 'design', 'qa', 'security'] as const

  // Fan-out: all stages start simultaneously
  const results = await Promise.allSettled(
    stages.map(stage =>
      runStage(stage, pr, clonePath, (partial) => {
        // Each stage emits progress events for SSE
        eventBus.emit('stage:progress', { pr, stage, ...partial })
      })
    )
  )

  // Fan-in: aggregate results
  const stageResults = results.map((result, i) => ({
    stage: stages[i],
    status: result.status === 'fulfilled' ? result.value.verdict : 'SKIP',
    findings: result.status === 'fulfilled' ? result.value.findings : [],
    error: result.status === 'rejected' ? result.reason.message : null,
  }))

  return stageResults
}
```

### Pattern 3: Find-or-Create Comment with Mutex

**What:** Each PR gets exactly one bot comment. On first stage completion, create the comment. On subsequent updates, find by marker and update in-place. A per-PR mutex prevents race conditions from parallel stages trying to update simultaneously.
**When to use:** Always for PR bots. Multiple comments are noisy; in-place updates show progress.
**Trade-offs:** Requires tracking comment ID after creation. Mutex adds complexity but prevents GitHub API conflicts.

**Example:**
```typescript
// Comment marker for identification
const COMMENT_MARKER = '<!-- gstackapp-review -->'

// Per-PR mutex map
const commentMutexes = new Map<number, Mutex>()

async function updatePRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
) {
  // Get or create mutex for this PR
  if (!commentMutexes.has(prNumber)) {
    commentMutexes.set(prNumber, new Mutex())
  }
  const mutex = commentMutexes.get(prNumber)!

  return mutex.runExclusive(async () => {
    const markedBody = `${COMMENT_MARKER}\n${body}`

    // Find existing comment
    const { data: comments } = await octokit.issues.listComments({
      owner, repo, issue_number: prNumber,
    })
    const existing = comments.find(c => c.body?.includes(COMMENT_MARKER))

    if (existing) {
      await octokit.issues.updateComment({
        owner, repo, comment_id: existing.id, body: markedBody,
      })
    } else {
      await octokit.issues.createComment({
        owner, repo, issue_number: prNumber, body: markedBody,
      })
    }
  })
}
```

### Pattern 4: Tool-Use Stage Runtime

**What:** Each stage is a Claude API conversation where the model can call read_file, list_files, and search_code tools against the shallow clone. The model reasons about the PR diff and uses tools to explore related code, then returns structured findings.
**When to use:** This is gstackapp's core skill runtime pattern. Each stage gets its own tool_use conversation.
**Trade-offs:** More tokens and API calls than a single-shot prompt, but dramatically better review quality because the model can explore context. CodeRabbit's research confirms this hybrid (pipeline structure + selective agent tools) is the optimal approach.

**Example:**
```typescript
async function runStage(
  stage: StageName,
  pr: PullRequest,
  clonePath: string,
  onProgress: (update: StageProgress) => void
): Promise<StageResult> {
  const prompt = await loadPrompt(stage) // from prompts/*.md
  const tools = createSandboxedTools(clonePath) // path-guarded

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: prompt,
    messages: [{
      role: 'user',
      content: buildStageInput(pr) // diff + file list + PR metadata
    }],
    tools,
  })

  // Process tool_use loop until final response
  let conversation = [response]
  while (response.stop_reason === 'tool_use') {
    const toolResults = await executeTools(response.content, tools)
    // ... continue conversation
  }

  return parseStageResult(response) // Zod-validated StageResult
}
```

### Pattern 5: SSE Event Broadcasting for Live Dashboard

**What:** An in-process event bus (Node.js EventEmitter) bridges pipeline progress to connected dashboard clients via Hono's `streamSSE` helper. Each stage completion and progress update emits an event that all connected SSE clients receive.
**When to use:** For real-time pipeline visualization in the dashboard. The pipeline hero view needs to update as stages complete.
**Trade-offs:** In-process EventEmitter means only the server process that handled the webhook can broadcast to its connected clients. Fine for single-process Mac Mini deployment. At scale, you'd need Redis pub/sub or similar.

**Example:**
```typescript
// Event bus (singleton)
const pipelineBus = new EventEmitter()

// SSE endpoint
app.get('/api/sse', async (c) => {
  return streamSSE(c, async (stream) => {
    const handler = (event: PipelineEvent) => {
      stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type, // 'stage:started', 'stage:completed', 'pipeline:done'
        id: event.id,
      })
    }

    pipelineBus.on('pipeline:event', handler)

    // Keep alive until client disconnects
    stream.onAbort(() => {
      pipelineBus.off('pipeline:event', handler)
    })

    // Heartbeat to detect disconnected clients
    while (true) {
      await stream.writeSSE({ data: '', event: 'heartbeat', id: '' })
      await stream.sleep(15000)
    }
  })
})
```

## Data Flow

### Primary Flow: Webhook to PR Comment

```
GitHub PR Event (opened / synchronize / force-push)
    │
    ▼
Tailscale Funnel (public URL → Mac Mini)
    │
    ▼
Hono Webhook Route
    ├── Verify X-Hub-Signature-256 (crypto.timingSafeEqual)
    ├── Filter: only pull_request opened/synchronize
    ├── Deduplicate via X-GitHub-Delivery header
    └── ACK 200 within <1 second
    │
    ▼
Pipeline Orchestrator (async, in-process)
    ├── Get installation token (Octokit createAppAuth)
    ├── Cancel any running pipeline for this PR (force-push case)
    ├── Insert pipeline_run record (status: RUNNING)
    ├── Shallow clone PR branch to /tmp/{owner}-{repo}-{pr}-{sha}
    │
    ▼
Fan-Out: 5 Stage Executors (Promise.allSettled)
    ├── CEO Stage    ──┐
    ├── Eng Stage    ──┤
    ├── Design Stage ──┤── Each: Claude tool_use loop
    ├── QA Stage     ──┤    with sandboxed file access
    └── Security Stage─┘
    │
    │  (Each stage emits progress → event bus → SSE → dashboard)
    │  (Each stage completion → update PR comment via mutex)
    │
    ▼
Fan-In: Aggregate Results
    ├── Update stage_results + findings in SQLite
    ├── Generate embeddings for cross-repo findings (sqlite-vec)
    ├── Final PR comment render (all 5 stages)
    ├── Update pipeline_run status: COMPLETED/FAILED
    └── Cleanup: rm -rf /tmp clone directory
```

### Dashboard Data Flow

```
React Dashboard (client)
    │
    ├── EventSource(/api/sse) ──── Live pipeline progress
    │     stage:started, stage:completed, pipeline:done
    │
    ├── GET /api/pipelines ─────── Historical pipeline runs
    │     (with stage_results + findings joined)
    │
    ├── GET /api/repos ─────────── Installed repositories
    │
    ├── GET /api/trends ────────── Quality metrics over time
    │     (aggregated from findings by repo/stage/timeframe)
    │
    └── GET /api/intelligence ──── Cross-repo pattern matches
          (sqlite-vec similarity search on finding embeddings)
```

### Cross-Repo Intelligence Data Flow

```
Pipeline Run Completes
    │
    ▼
Findings Extracted (per stage)
    │
    ▼
Embed each finding → sqlite-vec
    ├── finding_text → embedding vector
    ├── metadata: repo, stage, verdict, file_path, created_at
    │
    ▼
On Next Review (any repo):
    ├── New finding generated by stage
    ├── Query sqlite-vec: "similar findings across all repos"
    ├── Filter: different repo, same user, cosine similarity > threshold
    ├── Surface: "Seen in {other_repo}: {similar finding}"
    └── Include in PR comment + dashboard intelligence strip
```

### Force-Push Handling

```
force-push event (action: 'synchronize')
    │
    ▼
Pipeline Orchestrator
    ├── Mark previous pipeline_run as CANCELLED
    ├── Cancel in-flight Claude API calls (AbortController)
    ├── Cleanup previous clone directory
    ├── Create NEW pipeline_run for new SHA
    ├── Re-render PR comment from latest pipeline_run
    └── Start fresh 5-stage execution
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-5 repos (Phase 1) | In-process async, single SQLite file, Mac Mini, no queue. Perfectly adequate. |
| 5-50 repos | Add BullMQ + Redis for job queue. Pipeline orchestrator becomes a queue consumer. Prevents webhook timeouts under burst load. |
| 50-500 repos | Move to Fly.io or similar. Postgres + pgvector replaces SQLite. Multiple worker instances consume from shared queue. |
| 500+ repos | Separate webhook ingress service from pipeline workers. Per-stage scaling (some stages are heavier). Object storage for clones instead of local /tmp. |

### Scaling Priorities

1. **First bottleneck: Claude API rate limits.** At 5 parallel stages per PR, you consume 5 concurrent Claude requests per pipeline. Anthropic's rate limits will be the first wall. Mitigation: batching, Haiku for lighter stages, request queuing.
2. **Second bottleneck: /tmp disk space.** Shallow clones of large repos accumulate. Aggressive cleanup + disk monitoring needed. At scale, use ephemeral containers instead.
3. **Third bottleneck: SQLite write contention.** WAL mode helps, but under high concurrency SQLite will bottleneck. This is when you migrate to Postgres.

## Anti-Patterns

### Anti-Pattern 1: Full Clone Per Pipeline

**What people do:** `git clone` the entire repo with full history for each pipeline run.
**Why it's wrong:** Wastes time, disk, and bandwidth. A 10GB repo with full history takes minutes to clone. You only need the PR branch state.
**Do this instead:** `git clone --depth=1 --branch {pr_branch}` -- shallow clone of the specific branch. For larger repos, consider `--filter=blob:none` (treeless clone) to defer blob downloads until read_file actually needs them.

### Anti-Pattern 2: Sequential Stage Execution

**What people do:** Run CEO review, wait for it, then Eng review, wait, etc.
**Why it's wrong:** 5 sequential Claude API calls means 5x the latency. If each stage takes 30s, that's 2.5 minutes versus ~35 seconds in parallel.
**Do this instead:** `Promise.allSettled()` on all 5 stages. They're independent cognitive modes with no data dependencies between them.

### Anti-Pattern 3: New Comment Per Stage

**What people do:** Post a new PR comment each time a stage completes.
**Why it's wrong:** PR gets spammed with 5+ comments per review. Developers mute the bot. Noise defeats the purpose.
**Do this instead:** Single comment per pipeline_run, updated in-place with a hidden HTML marker (`<!-- gstackapp-review -->`). Use mutex to prevent concurrent update conflicts.

### Anti-Pattern 4: Sending Entire Codebase as Prompt Context

**What people do:** Concatenate all files into a giant prompt to "give the AI full context."
**Why it's wrong:** Exceeds context windows, wastes tokens, reduces review quality (diluted signal). CodeRabbit's research confirms "more context isn't always better."
**Do this instead:** Send the PR diff + file list in the initial prompt. Let the model use tools (read_file, search_code) to pull in relevant context on demand. This is the hybrid pipeline+agent approach.

### Anti-Pattern 5: Ignoring Webhook Signature Verification

**What people do:** Skip `X-Hub-Signature-256` verification for development speed.
**Why it's wrong:** Anyone who discovers your webhook URL can trigger arbitrary pipeline runs, consuming Claude API credits and potentially accessing private code.
**Do this instead:** Always verify using `crypto.timingSafeEqual` with HMAC-SHA256. The `@octokit/webhooks` library handles this with `webhooks.verify()`.

### Anti-Pattern 6: Blocking Webhook Response on Pipeline Completion

**What people do:** Process the entire pipeline inside the webhook handler before responding.
**Why it's wrong:** GitHub enforces a 10-second timeout on webhook responses. A 5-stage pipeline takes 30-60 seconds. GitHub marks the delivery as failed and may throttle your app.
**Do this instead:** ACK the webhook immediately, process the pipeline asynchronously. Persist `RUNNING` status before starting stages so you can detect stale pipelines on server restart.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **GitHub API** | Octokit with `@octokit/auth-app` for installation tokens | Tokens expire after 1 hour. Cache and refresh. Use `rest.issues.createComment/updateComment` for PR comments. |
| **Claude API** | `@anthropic-ai/sdk` with tool_use | Use `claude-sonnet-4-20250514` for stages. Define tools as JSON schema. Handle `stop_reason: 'tool_use'` in a loop. |
| **GitHub Webhooks** | Receive at `/api/webhook` via Tailscale Funnel | Subscribe to `pull_request` events only. Verify signature. Filter actions: `opened`, `synchronize`. |
| **Tailscale Funnel** | Public HTTPS URL → Mac Mini localhost | Run `tailscale funnel 3000` to expose Hono server. Stable URL for GitHub App webhook config. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Webhook Handler <-> Orchestrator | Direct async function call | In-process. No queue for Phase 1. |
| Orchestrator <-> Stage Executors | Promise.allSettled fan-out | Each stage is an independent async function. Shared clone path passed as arg. |
| Stage Executors <-> Sandbox | Direct function calls with path guards | `fs.realpathSync(path.resolve(clonePath, requestedPath))` must start with `clonePath`. |
| Stage Executors <-> Claude API | HTTP (Anthropic SDK) | tool_use conversation loop until stop_reason is `end_turn`. |
| Pipeline Progress <-> Dashboard | SSE (Hono streamSSE -> React EventSource) | In-process EventEmitter bridges pipeline events to SSE connections. |
| Dashboard <-> Backend API | REST (Hono routes -> React fetch) | Standard JSON API for historical data, SSE for live updates. |

## Build Order Implications

The architecture has clear dependency layers that dictate build order:

### Phase 1: Foundation (must build first)
1. **Database schema + Drizzle setup** -- Everything depends on data persistence
2. **GitHub App registration + auth** -- Need installation tokens before anything else
3. **Webhook handler + signature verification** -- Entry point for all pipeline activity

### Phase 2: Core Pipeline (depends on Foundation)
4. **Clone manager** -- Stages need code access
5. **Sandbox file tools** (read_file, list_files, search_code) -- Stage executors need these
6. **Single stage executor** (start with one, e.g., Eng) -- Validate the tool_use loop works
7. **Pipeline orchestrator** (fan-out/fan-in) -- Once one stage works, add parallelism

### Phase 3: Output (depends on Core Pipeline)
8. **PR comment manager** (create/update with mutex) -- Pipeline results need to surface
9. **Comment rendering** (markdown template for 5-stage results) -- Visual output format

### Phase 4: Dashboard (depends on Output)
10. **SSE event bus + streaming endpoint** -- Real-time bridge
11. **Pipeline hero visualization** -- Core dashboard component
12. **Activity feed** -- Historical pipeline list

### Phase 5: Intelligence (depends on Core Pipeline)
13. **Embedding generation + sqlite-vec** -- After findings flow through the pipeline
14. **Cross-repo similarity search** -- Query layer for embeddings
15. **Intelligence display in dashboard + PR comments** -- Surface insights

### Phase 6: Polish
16. **Quality trends** (aggregation queries + charts)
17. **Onboarding flow** (install GitHub App -> pick repos -> first review)
18. **Force-push handling** (cancel + re-run)
19. **Stale pipeline detection on restart**

**Key dependency insight:** Stages 1-3 are the critical path. You cannot meaningfully work on the dashboard until at least one stage produces real output. The embedding/intelligence work (Phase 5) can be deferred since it's additive -- the core review pipeline works without it.

## Sources

- [CodeRabbit architecture on Google Cloud Run](https://cloud.google.com/blog/products/ai-machine-learning/how-coderabbit-built-its-ai-code-review-agent-with-google-cloud-run) -- Webhook queue decoupling, sandboxed execution, Cloud Tasks architecture (MEDIUM confidence)
- [CodeRabbit: Pipeline AI vs Agentic AI](https://www.coderabbit.ai/blog/pipeline-ai-vs-agentic-ai-for-code-reviews-let-the-model-reason-within-reason) -- Hybrid approach validation, context engineering philosophy (HIGH confidence)
- [CodeRabbit: Accurate reviews on massive codebases](https://www.coderabbit.ai/blog/how-coderabbit-delivers-accurate-ai-code-reviews-on-massive-codebases) -- Codegraph, semantic index, team standards, scaling (HIGH confidence)
- [Vercel OpenReview (open source)](https://github.com/vercel-labs/openreview) -- Reference implementation: webhook -> workflow -> sandbox -> Claude -> PR comments (HIGH confidence)
- [Baz.co: Building an AI Code Review Agent](https://baz.co/resources/building-an-ai-code-review-agent-advanced-diffing-parsing-and-agentic-workflows) -- Git diff limitations, Tree-Sitter AST parsing, context building (MEDIUM confidence)
- [GitHub Docs: Webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks) -- 10s timeout, queue processing, signature verification, idempotency (HIGH confidence)
- [GitHub Docs: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) -- HMAC-SHA256 verification (HIGH confidence)
- [Hono Streaming Helper docs](https://hono.dev/docs/helpers/streaming) -- streamSSE API, writeSSE usage (HIGH confidence)
- [Octokit auth-app.js](https://github.com/octokit/auth-app.js/) -- Installation token authentication (HIGH confidence)
- [DEV Community: Hono + GitHub webhooks](https://dev.to/fiberplane/building-a-community-database-with-github-a-guide-to-webhook-and-api-integration-with-honojs-1m8h) -- Hono-specific webhook middleware pattern (MEDIUM confidence)

---
*Architecture research for: AI Code Review Pipeline (GitHub App)*
*Researched: 2026-03-30*
