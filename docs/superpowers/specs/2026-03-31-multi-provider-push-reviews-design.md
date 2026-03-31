# Multi-Provider Pipeline + Push Reviews + Backfill

**Date:** 2026-03-31
**Status:** Approved
**Scope:** Provider abstraction, push-based reviews, git history backfill

## Motivation

gstackapp reviews PRs, but its target users (YC/gstack builders, solo founders) ship directly to main. PRs are a team ceremony they haven't needed yet. The pipeline should review every push, not just PRs. This also pulls forward the Phase 2 multi-provider goal so backfill and budget stages can run on Gemini/local models instead of burning Claude tokens.

## Three-Tier Token Strategy

| Tier | Provider | Use Case |
|------|----------|----------|
| Brain | Claude Opus/Sonnet | High-judgment stages (CEO, Security) |
| Cloud grunt | Gemini 3 Flash, GPT | Pattern-matching stages (Eng, QA, Design) |
| Local grunt | Qwen3-Coder-30B via LM Studio | Free execution, backfill, experimentation |

## Plan Sequence

1. **Provider Abstraction** — multi-model support in stage runner
2. **Push Reviews** — webhook handler, data model, commit comments
3. **Backfill CLI** — git history replay with Gemini Flash

Each plan is independently shippable and testable.

---

## Plan 1: Provider Abstraction

### Interface

All providers implement `LLMProvider`:

```ts
interface LLMProvider {
  createCompletion(params: {
    model: string
    system: string
    messages: ConversationMessage[]
    tools: ToolDefinition[]
    maxTokens: number
    signal?: AbortSignal
  }): Promise<CompletionResult>
}

interface CompletionResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  content: ContentBlock[]
  usage: { inputTokens: number; outputTokens: number }
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[] | ToolResultBlock[]
}

interface ToolResultBlock {
  type: 'tool_result'
  toolCallId: string
  content: string
  isError?: boolean
}

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema
}
```

The tool_use loop in `stage-runner.ts` speaks only to this interface. It does not know which provider is running.

### Providers

| Provider | SDK | File | Notes |
|----------|-----|------|-------|
| `anthropic` | `@anthropic-ai/sdk` (existing) | `providers/anthropic.ts` | Current production path, native tool_use |
| `gemini` | `@google/generative-ai` (new) | `providers/gemini.ts` | Maps tools to `functionDeclarations`, responses to `functionCall` |
| `openai` | `openai` (new) | `providers/openai.ts` | Standard function calling, also used for local |
| `local` | `openai` (reused) | `providers/openai.ts` | Same class, custom `baseURL` pointing to LM Studio |

### Provider Adapter Responsibilities

Each adapter:
1. Translates `ToolDefinition[]` to native format (Anthropic `Tool[]`, Gemini `FunctionDeclaration[]`, OpenAI `ChatCompletionTool[]`)
2. Translates `ConversationMessage[]` to native message format
3. Translates native response to `CompletionResult` (normalizing stop reasons, tool calls, text blocks)
4. Translates `ToolResultBlock[]` to native tool result format
5. Passes through `AbortSignal` for timeout support

### File Structure

```
packages/api/src/pipeline/providers/
  types.ts          # LLMProvider interface, ContentBlock, etc.
  anthropic.ts      # Wraps @anthropic-ai/sdk
  gemini.ts         # Wraps @google/generative-ai
  openai.ts         # Wraps openai SDK (exports OpenAIProvider class)
  index.ts          # getProvider(name) factory, resolveModel(stage) logic
```

### Model Profiles

Named presets with per-stage overrides:

```ts
const PROFILES: Record<string, Record<string, string>> = {
  quality:  { default: 'anthropic:claude-opus-4-6' },
  balanced: {
    default: 'anthropic:claude-sonnet-4-6',
    ceo: 'anthropic:claude-opus-4-6',
    security: 'anthropic:claude-opus-4-6',
  },
  budget:   { default: 'gemini:gemini-3-flash-preview' },
  local:    { default: 'local:qwen3-coder-30b' },
}
```

Resolution order: `STAGE_{NAME}_MODEL` env var > profile stage override > profile default.

Format is always `provider:model`. The `local` provider is the `openai` provider class with `baseURL` set to `LOCAL_API_URL`.

### stage-runner.ts Changes

- Remove `import Anthropic` and direct SDK usage
- Import `getProvider`, `resolveModel` from `./providers`
- The tool_use loop becomes provider-agnostic:
  1. `const { provider, model } = resolveModel(stage)`
  2. `const result = await provider.createCompletion({ model, system, messages, tools, maxTokens, signal })`
  3. Check `result.stopReason` — same logic as today
  4. Extract tool calls from `result.content` — normalized `ContentBlock[]`
  5. Execute tools, push results as `ToolResultBlock[]`
- `parseStageOutput()` unchanged — it already works on text content looking for JSON code blocks
- `StageOutput` gains a `providerModel` field (e.g., `"gemini:gemini-3-flash-preview"`) for dashboard display

### stage_results Schema Addition

Add `provider_model TEXT` column to `stage_results` table. Records which provider:model executed each stage. Used by dashboard to show provider badge and for quality comparison across models.

### Failure Behavior

Per design decision: fail the stage with FLAG verdict, log which provider failed, surface in PR/commit comment. No automatic fallback to a more expensive provider. The existing retry-once logic (D-11) retries with the same provider.

### Environment Variables

```bash
# Existing
ANTHROPIC_API_KEY=<key>

# New
GEMINI_API_KEY=<key>
OPENAI_API_KEY=<key>              # Optional
LOCAL_API_URL=http://ryans-mac-mini:1234/v1

# Profile + overrides
PIPELINE_PROFILE=balanced
# STAGE_CEO_MODEL=anthropic:claude-opus-4-6
# STAGE_ENG_MODEL=gemini:gemini-3-flash-preview
```

### New Dependencies

- `@google/generative-ai` — Gemini SDK
- `openai` — OpenAI + local LM Studio

---

## Plan 2: Push Reviews

### Webhook Handler

Subscribe to `push` events on the GitHub App (settings update required). New handler in `handlers.ts`:

```ts
webhooks.on('push', async ({ id, payload }) => {
  // Only review pushes to the default branch
  if (payload.ref !== `refs/heads/${payload.repository.default_branch}`) return
  // Skip empty pushes (branch create/delete)
  if (payload.commits.length === 0) return
  // Skip force-pushes (before === '0000...' means branch recreation)
  if (payload.forced) return

  const reviewUnit = ensureReviewUnit({
    repoId: payload.repository.id,
    type: 'push',
    title: summarizePushCommits(payload.commits),
    authorLogin: payload.pusher.name,
    headSha: payload.after,
    baseSha: payload.before,
    ref: payload.ref,
  })

  const { created, runId } = tryCreatePipelineRun({
    deliveryId: id,
    reviewUnitId: reviewUnit.id,
    installationId: payload.installation!.id,
    headSha: payload.after,
  })

  if (created) {
    executePipeline({
      runId,
      installationId: payload.installation!.id,
      repoFullName: payload.repository.full_name,
      reviewUnitId: reviewUnit.id,
      headSha: payload.after,
      baseSha: payload.before,
      ref: payload.ref,
      type: 'push',
    }).catch(err => console.error(`Pipeline failed for run ${runId}:`, err))
  }
})
```

### Data Model: review_units Table

Generalizes the pipeline trigger. Both PRs and pushes map to review units.

```sql
CREATE TABLE review_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repositories(id),
  type TEXT NOT NULL,              -- 'pr' | 'push'
  title TEXT NOT NULL,             -- PR title or commit summary
  author_login TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  base_sha TEXT,                   -- parent for push, base branch HEAD for PR
  ref TEXT,                        -- 'refs/heads/main' for push, branch for PR
  pr_number INTEGER,               -- only for type='pr'
  state TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX review_unit_dedup_idx ON review_units(repo_id, type, head_sha);
```

### pipeline_runs FK Migration

`pipeline_runs.pr_id` becomes `pipeline_runs.review_unit_id`:

1. Create `review_units` table
2. Backfill: `INSERT INTO review_units SELECT ... FROM pull_requests`
3. Add `review_unit_id` column to `pipeline_runs`
4. Populate from existing `pr_id` via the backfilled mapping
5. Drop `pr_id` column (SQLite requires table rebuild)

Since this is a dev database with minimal data, a full table rebuild is acceptable.

### Diff Source

PRs get diffs from `pulls.listFiles()`. Pushes get diffs from `repos.compareCommits()`:

```ts
const { data } = await octokit.repos.compareCommits({
  owner, repo,
  base: baseSha,   // payload.before
  head: headSha,   // payload.after
})
// data.files has same shape as pulls.listFiles() response
```

Same `mappedFiles` array feeds into stage filtering and `buildStageInput()`.

### Comment Posting

| Trigger | Comment type | API |
|---------|-------------|-----|
| PR | Issue comment (updates in-place) | `octokit.issues.createComment()` |
| Push | Commit comment | `octokit.repos.createCommitComment()` |

The rendered markdown is identical. `comment.ts` gains a `postReviewComment()` function that dispatches based on `review_unit.type`.

For push reviews, `comment_id` stores the commit comment ID for update-in-place on re-review (force-push to same branch).

### GitHub App Settings Update

Manual step: go to GitHub App settings and add `push` to subscribed events. No new permissions needed — `contents: read` already covers the compare API.

---

## Plan 3: Backfill CLI

### Purpose

Walk git history for active repos, reconstruct push sessions, run the pipeline with Gemini Flash. Seeds the dashboard with 30 days of quality trend data.

### Invocation

```bash
npm run backfill --workspace=packages/api -- \
  --days=30 \
  --profile=budget \
  --concurrency=2 \
  [--dry-run] \
  [--repos=quartermint/openefb,quartermint/gstackapp]
```

### File

```
packages/api/scripts/backfill.ts
```

### Algorithm

For each active repo (or `--repos` subset):

1. **Fetch commit history** via `octokit.repos.listCommits({ since, sha: defaultBranch, per_page: 100 })`. Paginate if needed.

2. **Group into push sessions.** Walk commits chronologically. A new session starts when:
   - Author changes, OR
   - Gap between consecutive commits exceeds 30 minutes

   Each session captures: `baseSha` (parent of first commit), `headSha` (last commit), `authorLogin`, `title` (first commit message, truncated).

3. **Create review units.** `INSERT OR IGNORE` into `review_units` with `type='push'`. The unique constraint on `(repo_id, type, head_sha)` provides idempotency — re-running the script skips already-processed sessions.

4. **Run pipeline.** For each new review unit, call `executePipeline()` with the `budget` profile (or `--profile` override). Respects `--concurrency` limit via a semaphore.

5. **Progress output.** After each repo:
   ```
   quartermint/openefb: 12 sessions found, 12 new, 0 skipped
     Running session 1/12: "feat: add map layer..." (3 commits, +142/-38)
     Running session 2/12: ...
   ```

### Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--days` | 30 | How far back to scan |
| `--profile` | budget | Pipeline model profile |
| `--concurrency` | 2 | Max parallel pipeline runs |
| `--dry-run` | false | Show sessions without running pipelines |
| `--repos` | all active | Comma-separated repo filter |

### Cost Estimate

~50-80 push sessions across 18 active repos over 30 days. At Gemini 3 Flash with GCP credits: ~$0. Runtime: ~2-3 hours at concurrency=2.

---

## Dashboard Changes

### Feed View

- Push review units show commit message + short SHA instead of PR title + number
- Small badge: `PR` or `Push` distinguishes trigger type
- Driven by `review_units.type`

### Stage Results

- Provider badge on each stage (e.g., "via Gemini Flash", "via Claude Opus")
- Driven by `stage_results.provider_model`

### Trends View

No changes. Trends aggregate by repo and time period. Push reviews produce the same `stage_results` and `findings` rows. Charts fill in automatically.

### Pipeline Hero

No changes. Stage visualization is identical regardless of trigger type.

---

## Environment Variables (Complete)

```bash
# Existing
ANTHROPIC_API_KEY=<key>
VOYAGE_API_KEY=<key>
GITHUB_APP_ID=<id>
GITHUB_PRIVATE_KEY_PATH=<path>
GITHUB_WEBHOOK_SECRET=<secret>

# New provider keys
GEMINI_API_KEY=<key>
OPENAI_API_KEY=<key>              # Optional
LOCAL_API_URL=http://ryans-mac-mini:1234/v1

# Pipeline config
PIPELINE_PROFILE=balanced         # quality | balanced | budget | local
# Per-stage overrides (optional)
# STAGE_CEO_MODEL=anthropic:claude-opus-4-6
# STAGE_ENG_MODEL=gemini:gemini-3-flash-preview
# STAGE_QA_MODEL=local:qwen3-coder-30b

PORT=3002
DATABASE_PATH=./data/gstackapp.db
NODE_ENV=development
```

## New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@google/generative-ai` | ^0.25 | Gemini SDK |
| `openai` | ^4.85 | OpenAI + local LM Studio |

## GitHub App Settings Change

Add `push` to subscribed webhook events. No permission changes.

---

## Out of Scope

- Streaming provider responses to dashboard in real-time (SSE already handles stage status updates)
- Automatic fallback chains between providers (fail with nudge, not silent escalation)
- Cost tracking dashboard (provider_model field enables this later)
- Reviewing historical commits older than 30 days
- Light mode, mobile, multi-user (unchanged from Phase 1 constraints)
