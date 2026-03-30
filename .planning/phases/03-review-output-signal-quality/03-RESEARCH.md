# Phase 3: Review Output & Signal Quality - Research

**Researched:** 2026-03-30
**Domain:** GitHub PR comment rendering, inline review comments, three-tier signal filtering, feedback mechanisms
**Confidence:** HIGH

## Summary

Phase 3 transforms raw pipeline stage outputs into the primary user-facing surface: a structured, progressively-updated PR comment with inline diff comments, noise filtering, and feedback collection. This is where gstackapp becomes visible to developers -- the PR comment IS the product for anyone who never visits the dashboard.

The critical technical challenges are: (1) mapping findings with file/line references to valid diff positions for GitHub's Pull Request Review API, (2) serializing concurrent comment updates from 5 parallel stages via a per-PR mutex, (3) rendering a distinctive pipeline topology in GitHub-flavored markdown within the 65,536-character limit, and (4) collecting user feedback on findings despite GitHub having NO webhook events for emoji reactions (requiring a polling-based approach or dashboard-only feedback for v1).

The biggest discovery from this research: **GitHub does not fire webhooks for reactions on comments.** CONTEXT.md decision D-15 calls for "GitHub reaction webhooks captured to sync feedback to database," but this is not possible with GitHub's current webhook system. Reactions can be read via the REST API (polling), but real-time reaction capture is not supported. The feedback mechanism needs to be redesigned: use GitHub reactions for visual UX (users see thumbs up/down) but poll or use dashboard-only feedback for data capture.

**Primary recommendation:** Build in this order: (1) comment renderer (markdown template), (2) comment manager (find-or-create with mutex), (3) inline review comment mapper (finding line -> diff position), (4) orchestrator integration (hook into each stage completion), (5) three-tier severity filter, (6) feedback schema + storage, (7) dashboard feedback endpoint. Handle the reaction webhook limitation by polling GitHub periodically or relying on dashboard-first feedback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Pipeline topology format -- visual pipeline diagram at top showing 5 stages with verdict badges (colored by stage spectral identity), then collapsible findings per stage below. NOT a CodeRabbit clone, NOT a generic scorecard.
- **D-02:** Pipeline topology in comment mirrors the dashboard hero experience -- gstackapp's comments are visually recognizable and distinct from any competitor
- **D-03:** Comment updated in-place as each stage completes (incremental rendering). Skeleton -> stage 1 result -> stage 2 -> ... -> complete
- **D-04:** Per-PR mutex prevents concurrent comment updates from parallel stage completions
- **D-05:** Find-or-create pattern: search for existing gstackapp comment by marker, create if not found
- **D-06:** Inline review comments on specific diff lines via GitHub Pull Request Review API
- **D-07:** Only Tier 1 (critical) and Tier 2 (notable) findings get inline comments -- Tier 3 stays in summary only
- **D-08:** Each inline comment includes stage identity (color badge/label) so developers know which "brain" found it
- **D-09:** Three-tier finding classification: Tier 1 (runtime errors, security vulns, breaking changes), Tier 2 (architecture issues, measurable perf problems), Tier 3 (style, subjective, minor)
- **D-10:** Only Tier 1 and Tier 2 appear prominently in PR comments. Tier 3 in collapsible "Minor" section
- **D-11:** Target signal ratio > 60% (Tier 1 + Tier 2 / Total findings). Track from launch.
- **D-12:** SKIP is a first-class verdict -- silence is a valid review outcome
- **D-13:** Both GitHub reactions AND dashboard feedback -- GitHub reactions (thumbs up/down) on inline comments for zero-friction feedback, plus richer dashboard feedback UI with optional context
- **D-14:** Feedback stored in findings table for future prompt improvement (not auto-applied in v1)
- **D-15:** GitHub reaction webhooks captured to sync feedback to database
- **D-16:** Exact markdown template for PR comment topology (Claude's discretion)
- **D-17:** How to render the pipeline flow in markdown (Claude's discretion)
- **D-18:** Collapsible section implementation details (Claude's discretion)
- **D-19:** How to map findings to specific diff hunks (Claude's discretion)

### Claude's Discretion
- Exact markdown template for PR comment topology
- How to render the pipeline flow in markdown (Unicode box drawing? ASCII? Emoji?)
- Collapsible section implementation details
- How to map findings to specific diff hunks

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVW-01 | Pipeline posts a structured PR summary comment with findings from all stages | Comment manager with find-or-create pattern (D-05), markdown template with pipeline topology (D-01/D-02), GitHub issues.createComment/updateComment API |
| REVW-02 | PR comment updates in-place as each stage completes (incremental rendering) | Comment manager called from orchestrator after each stage completion, hidden marker `<!-- gstackapp-review -->` for finding existing comment, skeleton -> progressive fill pattern |
| REVW-03 | Per-PR mutex prevents concurrent comment updates from parallel stages | async-mutex package (v0.5.0) with Map<prNumber, Mutex>, runExclusive serializes GitHub API calls |
| REVW-04 | Inline PR review comments on specific diff lines via GitHub Review API | octokit.rest.pulls.createReview with comments array using line/side parameters (not deprecated position), only for Tier 1+2 findings with filePath+lineStart |
| REVW-05 | Findings include severity classification mapped to PASS/FLAG/BLOCK/SKIP | Already implemented: SeveritySchema ('critical'/'notable'/'minor') in shared/schemas/verdicts.ts, FindingSchema includes severity field, DB findings table has severity column |
| REVW-06 | Multi-language support (Claude handles all languages natively) | No Phase 3 work needed -- Claude handles all languages. Comment template uses language-agnostic formatting. |
| SGNL-01 | Three-tier finding classification filters noise (critical / notable / minor) | Severity already in schema. Phase 3 implements the RENDERING logic: Tier 1+2 prominent, Tier 3 in collapsible section. Filter function groups findings by severity before rendering. |
| SGNL-02 | False positive feedback via thumbs up/down on individual findings | LIMITATION DISCOVERED: GitHub has no reaction webhooks. Workaround: poll reactions via REST API + dashboard feedback UI. Inline comments include stage identity for context. |
| SGNL-03 | Feedback stored for future prompt improvement (not auto-applied in v1) | New columns on findings table: feedbackVote (up/down/null), feedbackNote (text), feedbackAt (timestamp). Dashboard API endpoint for submitting feedback. |
</phase_requirements>

## Standard Stack

### Core (Phase 3 Additions)

| Library | Verified Version | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| async-mutex | 0.5.0 | Per-PR mutex for comment updates | Lightweight, TypeScript-native, zero dependencies. `runExclusive()` pattern matches exactly what's needed for serializing GitHub API calls. 1.5M weekly downloads. |

### Already Installed (Phase 1)

| Library | Version | Relevance to Phase 3 |
|---------|---------|---------------------|
| @octokit/rest | ^21.1 | `issues.createComment`, `issues.updateComment`, `issues.listComments`, `pulls.createReview` -- all Phase 3 GitHub API calls |
| @octokit/auth-app | ^7.2 | Installation token management for GitHub API calls |
| drizzle-orm | ^0.45 | Schema migration for feedback columns, finding queries |
| nanoid | ^5.0 | IDs for any new records |
| zod | ^3.24 | Feedback schema validation |
| better-sqlite3 | ^11.8 | Database operations for feedback storage |

### Supporting (Phase 3)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| date-fns (already installed) | Relative timestamps in comment ("reviewed 2 min ago") | Comment rendering |

### Installation

```bash
npm install -w packages/api async-mutex
```

## Architecture Patterns

### Recommended Project Structure (Phase 3 additions)

```
packages/api/src/
  github/
    comment.ts           # CommentManager: find-or-create, render, update
    comment-renderer.ts  # Markdown template rendering (pipeline topology + findings)
    inline-review.ts     # Inline review comment creation via pulls.createReview
  pipeline/
    orchestrator.ts      # MODIFIED: Hook comment update after each stage completion
  lib/
    severity-filter.ts   # Three-tier classification grouping + signal ratio tracking
packages/shared/src/
  schemas/
    feedback.ts          # Feedback Zod schema (new)
```

### Pattern 1: Comment Manager (Find-or-Create with Mutex)

**What:** A singleton service that manages the single PR comment per pipeline run. Uses a hidden HTML marker to find existing comments, creates new ones if not found, and serializes all updates through a per-PR mutex.

**When to use:** Every time a stage completes or the pipeline finishes. The orchestrator calls `commentManager.updateComment()` after each stage result is persisted to the DB.

**Critical details:**
- Hidden marker: `<!-- gstackapp-review:{runId} -->` at the top of the comment body
- The marker includes the runId so force-push re-reviews can find the RIGHT comment for the LATEST run
- Store the GitHub comment ID in `pipeline_runs.commentId` after first creation (avoids repeated listComments API calls)
- Per-PR mutex prevents race conditions when multiple stages complete simultaneously
- Mutex map is keyed by `repoId:prNumber` (not just prNumber, which could collide across repos)

**Example:**
```typescript
// packages/api/src/github/comment.ts
import { Mutex } from 'async-mutex'
import type { Octokit } from '@octokit/rest'
import { db } from '../db/client'
import { pipelineRuns, stageResults, findings } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { renderComment } from './comment-renderer'

const COMMENT_MARKER_PREFIX = '<!-- gstackapp-review'

// Per-PR mutex map: keyed by "repoFullName:prNumber"
const commentMutexes = new Map<string, Mutex>()

function getMutex(key: string): Mutex {
  if (!commentMutexes.has(key)) {
    commentMutexes.set(key, new Mutex())
  }
  return commentMutexes.get(key)!
}

interface UpdateCommentInput {
  octokit: Octokit
  owner: string
  repo: string
  prNumber: number
  runId: string
}

export async function updatePRComment(input: UpdateCommentInput): Promise<void> {
  const { octokit, owner, repo, prNumber, runId } = input
  const mutexKey = `${owner}/${repo}:${prNumber}`

  await getMutex(mutexKey).runExclusive(async () => {
    // Fetch current pipeline state from DB
    const run = db.query.pipelineRuns.findFirst({
      where: eq(pipelineRuns.id, runId),
    })
    if (!run) return

    const stages = db.query.stageResults.findMany({
      where: eq(stageResults.pipelineRunId, runId),
    })

    const allFindings = db.query.findings.findMany({
      where: eq(findings.pipelineRunId, runId),
    })

    // Render the full comment body from current state
    const body = renderComment({
      runId,
      stages,
      findings: allFindings,
      headSha: run.headSha,
    })

    const marker = `${COMMENT_MARKER_PREFIX}:${runId} -->`
    const markedBody = `${marker}\n${body}`

    // Fast path: use stored commentId
    if (run.commentId) {
      await octokit.issues.updateComment({
        owner, repo,
        comment_id: run.commentId,
        body: markedBody,
      })
      return
    }

    // Slow path: search for existing comment
    const { data: comments } = await octokit.issues.listComments({
      owner, repo, issue_number: prNumber,
    })
    const existing = comments.find(c =>
      c.body?.includes(COMMENT_MARKER_PREFIX)
    )

    if (existing) {
      await octokit.issues.updateComment({
        owner, repo,
        comment_id: existing.id,
        body: markedBody,
      })
      // Store comment ID for fast path
      db.update(pipelineRuns)
        .set({ commentId: existing.id })
        .where(eq(pipelineRuns.id, runId))
        .run()
    } else {
      const { data: created } = await octokit.issues.createComment({
        owner, repo,
        issue_number: prNumber,
        body: markedBody,
      })
      // Store comment ID for fast path
      db.update(pipelineRuns)
        .set({ commentId: created.id })
        .where(eq(pipelineRuns.id, runId))
        .run()
    }
  })
}
```

### Pattern 2: Comment Renderer (Pipeline Topology in Markdown)

**What:** A pure function that takes pipeline state and renders the full markdown comment body. Uses GitHub-flavored markdown with `<details>`/`<summary>` for collapsible sections, Unicode characters for the pipeline topology, and stage spectral identity via emoji or text labels (GitHub markdown does not support custom colors in text).

**Key constraint:** GitHub markdown does NOT support inline CSS colors, `<span style="color:...">`, or colored text. Stage identity must use emoji badges, bold labels, or image URLs for colored indicators.

**Options for stage identity in markdown:**
1. **Emoji badges:** `🟠 CEO` / `🔵 Eng` / `🟣 Design` / `🟢 QA` / `🔴 Security` -- simple, universally rendered
2. **Shields.io badge images:** `![CEO](https://img.shields.io/badge/CEO-FF8B3E)` -- exact colors but external dependency
3. **Unicode block characters:** `█ CEO` -- no color control in GFM

**Recommendation:** Use emoji badges for stage identity. They render consistently, are zero-dependency, and are visually scannable. The exact stage colors from DESIGN.md (`#FF8B3E`, `#36C9FF`, etc.) will be used in the dashboard but cannot be reproduced in GitHub markdown.

**Example template structure:**
```markdown
<!-- gstackapp-review:{runId} -->

## gstackapp Review

🟠 CEO ━━ 🔵 Eng ━━ 🟣 Design ━━ 🟢 QA ━━ 🔴 Security
 PASS      FLAG       SKIP        PASS      BLOCK

**Reviewed:** `abc1234` | **Duration:** 42s | **Signal:** 3/5 findings actionable

---

### 🔴 Security — BLOCK

> 1 critical finding

#### SQL Injection in user input handler
**`src/api/users.ts:45`** | critical
Unsanitized user input passed directly to SQL query...
**Suggestion:** Use parameterized queries via Drizzle ORM...

---

### 🔵 Eng — FLAG

> 2 findings (1 notable, 1 minor)

#### Missing error boundary in async handler
**`src/routes/webhook.ts:23`** | notable
...

<details>
<summary>Minor findings (1)</summary>

#### Consider extracting magic number
**`src/lib/config.ts:12`** | minor
...

</details>

---

### 🟠 CEO — PASS

No significant findings.

### 🟢 QA — PASS

No significant findings.

### 🟣 Design — SKIP

*Stage skipped (no UI changes detected)*

---

<sub>Reviewed by [gstackapp](https://gstackapp.com) | 👍 helpful? 👎 noise? React on inline comments</sub>
```

**Character budget:**
- GitHub comment limit: 65,536 characters
- Pipeline topology header: ~200 chars
- Per-stage with findings: ~500-2000 chars each
- With 5 stages and moderate findings: ~5,000-10,000 chars typical
- Safety: truncate findings description at 500 chars, cap total findings rendered per stage at 10

### Pattern 3: Inline Review Comments via Pull Request Review API

**What:** After all stages complete (or optionally after each stage), create a GitHub Pull Request Review with inline comments on specific diff lines. Only Tier 1 (critical) and Tier 2 (notable) findings that have a `filePath` and `lineStart` get inline comments.

**API:** `octokit.rest.pulls.createReview` with `event: 'COMMENT'` and a `comments` array.

**Critical constraint:** Inline comments can ONLY be placed on lines that are part of the diff. If a finding references a line that is not in the changed hunks, the API returns a 422 error. The mapper must validate that each finding's line is within the diff before including it.

**Line parameter details:**
- `line` (required): The line number in the file to comment on (must be within the diff)
- `side` (required): `'RIGHT'` for additions/unchanged lines (green side), `'LEFT'` for deletions (red side). For most findings, use `'RIGHT'` since findings reference the new code.
- `start_line` + `start_side` (optional): For multi-line comments spanning a range
- `path` (required): Relative file path from repo root

**Batch strategy:** Create a single review with ALL inline comments at once (one API call) rather than individual `createReviewComment` calls. This avoids secondary rate limits and ensures all comments appear simultaneously as a single review.

**Example:**
```typescript
// packages/api/src/github/inline-review.ts
import type { Octokit } from '@octokit/rest'
import type { Finding } from '@gstackapp/shared'

const STAGE_LABELS: Record<string, string> = {
  ceo: '🟠 CEO',
  eng: '🔵 Eng',
  design: '🟣 Design',
  qa: '🟢 QA',
  security: '🔴 Security',
}

interface InlineComment {
  path: string
  line: number
  side: 'LEFT' | 'RIGHT'
  body: string
}

/**
 * Map findings to inline review comments.
 * Only Tier 1 (critical) and Tier 2 (notable) findings with file/line info qualify.
 * Validates that lines are within the diff before including.
 */
export function mapFindingsToInlineComments(
  findings: Array<Finding & { stage: string }>,
  diffFiles: Array<{ filename: string; patch?: string }>
): InlineComment[] {
  // Build a set of valid (file, line) pairs from the diff
  const validLines = buildDiffLineMap(diffFiles)

  return findings
    .filter(f =>
      (f.severity === 'critical' || f.severity === 'notable') &&
      f.filePath &&
      f.lineStart &&
      validLines.has(`${f.filePath}:${f.lineStart}`)
    )
    .map(f => ({
      path: f.filePath!,
      line: f.lineStart!,
      side: 'RIGHT' as const,
      body: formatInlineComment(f),
    }))
}

function formatInlineComment(finding: Finding & { stage: string }): string {
  const stageLabel = STAGE_LABELS[finding.stage] ?? finding.stage
  const severity = finding.severity === 'critical' ? '**CRITICAL**' : 'Notable'

  let body = `${stageLabel} | ${severity}\n\n`
  body += `**${finding.title}**\n\n`
  body += finding.description

  if (finding.suggestion) {
    body += `\n\n**Suggestion:** ${finding.suggestion}`
  }

  return body
}

/**
 * Parse diff patches to determine which lines are valid comment targets.
 * Returns a Set of "filePath:lineNumber" strings for lines in the diff.
 */
function buildDiffLineMap(
  diffFiles: Array<{ filename: string; patch?: string }>
): Set<string> {
  const validLines = new Set<string>()

  for (const file of diffFiles) {
    if (!file.patch) continue

    const lines = file.patch.split('\n')
    let rightLine = 0

    for (const line of lines) {
      // Parse @@ hunk headers: @@ -oldStart,oldCount +newStart,newCount @@
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (hunkMatch) {
        rightLine = parseInt(hunkMatch[1], 10)
        continue
      }

      if (line.startsWith('+') || line.startsWith(' ')) {
        validLines.add(`${file.filename}:${rightLine}`)
        rightLine++
      } else if (line.startsWith('-')) {
        // Deletion -- line number does not advance on right side
        // Could add LEFT side tracking here if needed
      }
    }
  }

  return validLines
}

/**
 * Create a GitHub Pull Request Review with inline comments.
 */
export async function createInlineReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  comments: InlineComment[]
): Promise<void> {
  if (comments.length === 0) return

  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitSha,
    event: 'COMMENT',
    comments: comments.map(c => ({
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
    })),
  })
}
```

### Pattern 4: Orchestrator Integration (After Each Stage)

**What:** The pipeline orchestrator (from Phase 2) is modified to call the comment manager after each stage completes. This enables incremental rendering -- the PR comment updates progressively as each stage finishes.

**Integration approach:** Wrap each stage's completion callback to trigger a comment update. The comment renderer always reads the FULL current state from the DB, so partial updates are naturally handled.

**Example:**
```typescript
// In orchestrator.ts, after each stage result is persisted:

// After persisting stage result + findings to DB...
// Trigger comment update (fire-and-forget, errors logged not thrown)
updatePRComment({
  octokit,
  owner: repoFullName.split('/')[0],
  repo: repoFullName.split('/')[1],
  prNumber,
  runId,
}).catch(err => {
  console.error(`[orchestrator] Comment update failed for stage ${stage}:`, err)
})

// After ALL stages complete, create inline review comments
const allFindings = db.query.findings.findMany({
  where: eq(findings.pipelineRunId, runId),
})
const stageMap = new Map(stages.map(sr => [sr.stage, sr]))
const findingsWithStage = allFindings.map(f => ({
  ...f,
  stage: stageMap.get(f.stageResultId)?.stage ?? 'unknown',
}))

await createInlineReview(
  octokit, owner, repo, prNumber, headSha,
  mapFindingsToInlineComments(findingsWithStage, prFiles)
).catch(err => {
  console.error(`[orchestrator] Inline review failed:`, err)
})
```

### Pattern 5: Feedback Collection

**What:** Users can provide feedback on individual findings via thumbs up/down. Due to GitHub's lack of reaction webhooks, there are two feedback channels:

1. **GitHub reactions** on inline comments: Users react with thumbs up/down directly in the PR. These are visible but NOT automatically captured (no webhook). Captured via periodic polling or on next pipeline run for the same PR.
2. **Dashboard feedback UI** (Phase 4+): Direct API endpoint for submitting feedback with optional context.

**Schema extension:**
```typescript
// Add to findings table in schema.ts
feedbackVote: text('feedback_vote'),           // 'up' | 'down' | null
feedbackNote: text('feedback_note'),           // optional context from dashboard
feedbackSource: text('feedback_source'),       // 'github_reaction' | 'dashboard'
feedbackAt: integer('feedback_at', { mode: 'timestamp_ms' }),
ghReviewCommentId: integer('gh_review_comment_id'), // GitHub review comment ID (for reaction polling)
```

**Reaction polling strategy (SGNL-02 workaround):**
```typescript
// On each new pipeline run for a PR, check reactions on previous inline comments
async function syncReactionFeedback(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  // Get all findings with ghReviewCommentId from previous runs
  const feedbackableFindings = db.query.findings.findMany({
    where: and(
      isNotNull(findings.ghReviewCommentId),
      isNull(findings.feedbackVote),
    ),
  })

  for (const finding of feedbackableFindings) {
    const { data: reactions } = await octokit.reactions.listForPullRequestReviewComment({
      owner, repo,
      comment_id: finding.ghReviewCommentId!,
    })

    const thumbsUp = reactions.filter(r => r.content === '+1').length
    const thumbsDown = reactions.filter(r => r.content === '-1').length

    if (thumbsUp > 0 || thumbsDown > 0) {
      const vote = thumbsUp > thumbsDown ? 'up' : 'down'
      db.update(findings)
        .set({
          feedbackVote: vote,
          feedbackSource: 'github_reaction',
          feedbackAt: new Date(),
        })
        .where(eq(findings.id, finding.id))
        .run()
    }
  }
}
```

### Anti-Patterns to Avoid

- **Creating a new comment per stage completion:** Spams the PR with 5+ comments. Always update the single comment in-place (D-03).
- **Using deprecated `position` parameter for inline comments:** Use `line` + `side` parameters instead. `position` is relative to the diff hunk, `line` is the actual line number.
- **Placing inline comments on lines not in the diff:** GitHub returns 422 error. Always validate against the diff first.
- **Creating individual `createReviewComment` calls per finding:** Triggers secondary rate limits. Batch all inline comments into a single `createReview` call.
- **Sending colored text/CSS in GitHub markdown:** GitHub strips inline styles. Use emoji badges for stage identity.
- **Not handling the 65,536 character limit:** Truncate findings and cap per-stage finding count.
- **Assuming reaction webhooks exist:** GitHub has NO webhook for reactions. Must poll or use alternative feedback channels.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async mutex for comment updates | Custom promise queue / lock | `async-mutex` (0.5.0) `runExclusive()` | Handles edge cases (reentrancy, error cleanup, deadlock prevention) |
| Diff hunk parsing | Regex on raw diff string | Structured parser that tracks line numbers through hunk headers | Off-by-one errors in line mapping cause 422 API errors or misplaced comments |
| Comment deduplication | String comparison on full body | Hidden HTML marker `<!-- gstackapp-review:{runId} -->` | Marker is invisible to users, stable across body changes |
| Rate limit handling | Manual retry/delay | `@octokit/plugin-throttling` or built-in Octokit retry | Handles both primary and secondary rate limits with proper backoff |

**Key insight:** The comment update flow has three serial dependencies (DB read -> render -> GitHub API call) inside a mutex. Keep this path fast -- pre-render where possible, cache the commentId, and batch inline comments.

## Common Pitfalls

### Pitfall 1: Comment Update Race Condition

**What goes wrong:** Stages 3 and 4 complete simultaneously. Both read the DB, both render a comment, both call `updateComment`. Stage 3's update arrives first, then stage 4's update overwrites it -- stage 3's results disappear from the comment.
**Why it happens:** No serialization on the comment update path. The render reads stale DB state.
**How to avoid:** Per-PR mutex (D-04). The mutex key must include repo identity, not just PR number. The render always reads CURRENT DB state inside the mutex, so it always includes all completed stages.
**Warning signs:** Missing stage results in the PR comment. Intermittent -- depends on timing.

### Pitfall 2: Inline Comment on Non-Diff Line (422 Error)

**What goes wrong:** A finding references `src/utils.ts:142` but that line is not in the PR diff (it's an unchanged line above the hunk). The `createReview` API returns 422 "Unprocessable Entity."
**Why it happens:** Claude's analysis may identify issues in code that's related to the diff but not directly changed. The line number in the finding is the file line number, not a diff position.
**How to avoid:** Build a `Set<"filePath:lineNumber">` from the diff patches before creating inline comments. Only include findings whose file+line is in this set. Findings on non-diff lines still appear in the summary comment, just not as inline comments.
**Warning signs:** 422 errors from `pulls.createReview`. Missing inline comments despite findings having filePath/lineStart.

### Pitfall 3: GitHub Secondary Rate Limits on Comment Operations

**What goes wrong:** Rapid-fire comment create/update calls (5 stages completing within seconds) trigger GitHub's secondary rate limit, returning 403 "You have exceeded a secondary rate limit."
**Why it happens:** GitHub enforces undocumented limits on mutation operations (POST/PATCH) that are stricter than the primary rate limit.
**How to avoid:** The per-PR mutex already serializes updates. Add a minimum 1-second delay between successive GitHub API calls within the mutex. Batch inline comments into a single `createReview` call instead of individual calls.
**Warning signs:** 403 errors with "secondary rate limit" message. Comment updates silently failing.

### Pitfall 4: Comment Body Exceeds 65,536 Characters

**What goes wrong:** A PR with many findings across 5 stages generates a comment body that exceeds GitHub's 65,536-character limit. The API returns 422.
**Why it happens:** Verbose finding descriptions, code snippets, and 5 stages of output accumulate quickly.
**How to avoid:** (1) Truncate finding descriptions to 500 characters max. (2) Cap rendered findings per stage at 10. (3) For stages with many findings, show top 5 and note "N more findings in dashboard." (4) Monitor rendered body length before API call and truncate if needed.
**Warning signs:** 422 errors on comment create/update. Very large PRs with many findings.

### Pitfall 5: GitHub Reaction Webhook Assumption (D-15)

**What goes wrong:** Implementation assumes GitHub fires webhooks when users react to comments with thumbs up/down. It does not.
**Why it happens:** CONTEXT.md decision D-15 says "GitHub reaction webhooks captured to sync feedback to database." This is based on an incorrect assumption about GitHub's webhook capabilities.
**How to avoid:** Use a polling approach: on each new pipeline run for a PR, check reactions on previous inline comments from the last run. Store `ghReviewCommentId` on findings to enable polling. Dashboard feedback is the primary channel; GitHub reactions are a convenience UX captured asynchronously.
**Warning signs:** Feedback never appearing in the database despite users reacting.

### Pitfall 6: Force-Push Creates Orphaned Comments

**What goes wrong:** A force-push triggers a new pipeline run. The new run creates a new comment (or finds the old one). The old run's in-flight stages complete and try to update the comment with stale results.
**Why it happens:** Two pipeline runs for the same PR can be active simultaneously during a force-push race.
**How to avoid:** The orchestrator should check if the pipeline run is still the LATEST for this PR before updating the comment. Mark superseded runs as CANCELLED. The comment marker includes runId to help identify which run owns the comment.
**Warning signs:** PR comments showing stale results after a force-push. Two gstackapp comments on the same PR.

## Code Examples

### Collapsible Section in GitHub Markdown

```markdown
<details>
<summary>Minor findings (3)</summary>

#### Consider using const instead of let
**`src/lib/config.ts:12`** | minor

Variable `timeout` is never reassigned after declaration.

---

#### Unused import
**`src/routes/health.ts:2`** | minor

Import `cors` is imported but never used.

</details>
```

**IMPORTANT:** GitHub requires a blank line between the `<summary>` closing tag and the first markdown content inside `<details>`. Without it, the markdown inside is rendered as raw text.

### Incremental Comment Rendering (Skeleton State)

When the pipeline first starts (before any stage completes), the comment shows a skeleton:

```markdown
<!-- gstackapp-review:run_abc123 -->

## gstackapp Review

🟠 CEO ━━ 🔵 Eng ━━ 🟣 Design ━━ 🟢 QA ━━ 🔴 Security
  ...       ...       ...         ...       ...

*Pipeline running... results will appear as each stage completes.*

---

<sub>Reviewed by [gstackapp](https://gstackapp.com)</sub>
```

### Signal Ratio Calculation

```typescript
function calculateSignalRatio(findings: Finding[]): number {
  if (findings.length === 0) return 1.0 // No findings = perfect signal
  const actionable = findings.filter(
    f => f.severity === 'critical' || f.severity === 'notable'
  ).length
  return actionable / findings.length
}

function formatSignalRatio(findings: Finding[]): string {
  const ratio = calculateSignalRatio(findings)
  const actionable = findings.filter(
    f => f.severity === 'critical' || f.severity === 'notable'
  ).length
  return `${actionable}/${findings.length} findings actionable (${Math.round(ratio * 100)}%)`
}
```

### Database Schema Extension for Feedback

```typescript
// Migration: Add feedback columns to findings table
// Add via drizzle-kit push or manual ALTER TABLE

// In schema.ts, extend the findings table:
feedbackVote: text('feedback_vote'),              // 'up' | 'down' | null
feedbackNote: text('feedback_note'),              // Optional text from dashboard
feedbackSource: text('feedback_source'),          // 'github_reaction' | 'dashboard'
feedbackAt: integer('feedback_at', { mode: 'timestamp_ms' }),
ghReviewCommentId: integer('gh_review_comment_id'), // For reaction polling
```

### Stage Verdict Badge Rendering

```typescript
const VERDICT_BADGES: Record<string, string> = {
  PASS: 'PASS',
  FLAG: 'FLAG',
  BLOCK: '**BLOCK**',
  SKIP: '~~SKIP~~',
  RUNNING: '...',
  PENDING: '...',
}

const STAGE_EMOJIS: Record<string, string> = {
  ceo: '🟠',
  eng: '🔵',
  design: '🟣',
  qa: '🟢',
  security: '🔴',
}

function renderTopologyLine(stages: Array<{ stage: string; verdict: string }>): string {
  const ordered = ['ceo', 'eng', 'design', 'qa', 'security']
  const stageMap = new Map(stages.map(s => [s.stage, s.verdict]))

  const labels = ordered.map(s =>
    `${STAGE_EMOJIS[s]} ${s.toUpperCase()}`
  ).join(' ━━ ')

  const verdicts = ordered.map(s => {
    const v = stageMap.get(s) ?? 'PENDING'
    return ` ${VERDICT_BADGES[v] ?? v} `.padEnd(
      `${STAGE_EMOJIS[s]} ${s.toUpperCase()}`.length
    )
  }).join('    ')

  return `${labels}\n${verdicts}`
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `position` parameter for inline comments | `line` + `side` parameters | Deprecated by GitHub | Use `line`/`side` -- more intuitive, directly maps to file line numbers |
| One comment per stage | Single comment updated in-place | Industry standard by 2024 | Reduces noise, shows progress, cleaner PR thread |
| Confidence-based noise filter (AI self-assessment) | Three-tier severity classification (structural) | AI review research 2025-2026 | AI self-assessment inflated by ~30 points. Structural classification more reliable. |
| Reaction webhooks (assumed) | No reaction webhooks (confirmed) | Never existed | Must use polling or alternative feedback channels |

**Deprecated/outdated:**
- `position` parameter in `pulls.createReview` comments: Use `line` + `side` instead
- Assuming GitHub will add reaction webhooks: Feature request has been open since 2022, no progress

## Open Questions

1. **Exact Pipeline Topology Rendering**
   - What we know: Must be visually distinctive (D-01/D-02), rendered in GitHub-flavored markdown, emoji badges for stage identity
   - What's unclear: Whether a horizontal flow (`CEO ━━ Eng ━━ Design ━━ QA ━━ Security`) or a vertical list is more readable in the narrow PR comment column
   - Recommendation: Start with horizontal flow for the topology header (it's the signature visual), with vertical sections for each stage's findings below. Test on a real PR and iterate.

2. **Reaction Polling Frequency**
   - What we know: GitHub has no reaction webhooks. Polling is the only option.
   - What's unclear: How often to poll, and whether it's worth the API call budget for v1 single-user
   - Recommendation: Poll on next pipeline run for the same PR only (piggyback on existing API calls). Do NOT create a periodic polling job for v1. Dashboard feedback is the primary v1 channel.

3. **Inline Comment Placement for Multi-File Findings**
   - What we know: Some findings may reference multiple files (e.g., "function in A.ts is called in B.ts without error handling")
   - What's unclear: Where to place the inline comment when a finding spans files
   - Recommendation: Place the inline comment on the primary file (filePath in the finding). Reference other files in the comment body text.

4. **Rate Limit Handling for Large PRs**
   - What we know: The `createReview` API batches all inline comments in one call. But very large PRs could have 20+ inline comments.
   - What's unclear: Whether a single `createReview` with 20+ comments triggers secondary rate limits
   - Recommendation: Cap inline comments at 15 per review. If more than 15 Tier 1+2 findings have valid diff lines, include the top 15 by severity (critical first) and note the rest in the summary comment.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| @octokit/rest | GitHub API calls | Yes (installed Phase 1) | ^21.1 | -- |
| async-mutex | Per-PR mutex | Not installed | -- | Must install: `npm install -w packages/api async-mutex` |
| GitHub Pull Request Review API | Inline comments | Yes (GitHub API) | 2022-11-28+ | -- |
| GitHub Issues Comment API | Summary comment | Yes (GitHub API) | Stable | -- |
| GitHub Reactions API | Feedback polling | Yes (GitHub API) | Stable | Dashboard-only feedback |
| GitHub Reaction Webhooks | Real-time feedback sync | NOT AVAILABLE | -- | Polling on next pipeline run |

**Missing dependencies with no fallback:**
- async-mutex: Must install before implementation

**Missing dependencies with fallback:**
- GitHub reaction webhooks: Not available. Fallback: poll reactions via REST API on next pipeline run, plus dashboard feedback UI

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already configured from Phase 1) |
| Config file | `packages/api/vitest.config.ts` (exists) |
| Quick run command | `npm run test -w packages/api` |
| Full suite command | `npm run test -w packages/api` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVW-01 | Comment manager creates/updates PR comment with all stages | unit | `npx vitest run packages/api/src/__tests__/comment.test.ts -t "renders"` | No - Wave 0 |
| REVW-02 | Comment updates incrementally as stages complete | integration | `npx vitest run packages/api/src/__tests__/comment.test.ts -t "incremental"` | No - Wave 0 |
| REVW-03 | Per-PR mutex serializes concurrent updates | unit | `npx vitest run packages/api/src/__tests__/comment.test.ts -t "mutex"` | No - Wave 0 |
| REVW-04 | Inline review comments on diff lines | unit | `npx vitest run packages/api/src/__tests__/inline-review.test.ts` | No - Wave 0 |
| REVW-05 | Severity classification in findings | unit | Already covered by existing FindingSchema tests | Existing schema validates severity |
| REVW-06 | Multi-language support | manual-only | Manual: submit PR with Python, Go, Rust code | N/A |
| SGNL-01 | Three-tier classification filters noise | unit | `npx vitest run packages/api/src/__tests__/severity-filter.test.ts` | No - Wave 0 |
| SGNL-02 | Feedback via thumbs up/down | unit | `npx vitest run packages/api/src/__tests__/feedback.test.ts` | No - Wave 0 |
| SGNL-03 | Feedback stored in findings table | unit | `npx vitest run packages/api/src/__tests__/feedback.test.ts -t "storage"` | No - Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test -w packages/api`
- **Per wave merge:** `npm run test -w packages/api`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/api/src/__tests__/comment.test.ts` -- Comment renderer output, find-or-create logic, mutex serialization, incremental rendering, character limit handling
- [ ] `packages/api/src/__tests__/inline-review.test.ts` -- Diff line mapping, finding-to-comment conversion, 422 prevention, batch creation
- [ ] `packages/api/src/__tests__/severity-filter.test.ts` -- Three-tier grouping, signal ratio calculation, rendering order
- [ ] `packages/api/src/__tests__/feedback.test.ts` -- Feedback schema validation, storage, reaction polling simulation

**Testing strategy for GitHub API calls:** Mock @octokit/rest methods in tests. Create fixtures for `listComments`, `createComment`, `updateComment`, `createReview` responses. Test the diff line parser against real diff patches (extract from actual GitHub webhook payloads). Do NOT make real GitHub API calls in tests.

## Project Constraints (from CLAUDE.md)

- **Stack:** Hono + SQLite + Drizzle + React (locked)
- **Deploy:** Mac Mini via Tailscale Funnel (no cloud infra for Phase 1)
- **AI Provider:** Claude API only (not relevant for Phase 3 -- this phase is about rendering, not AI)
- **Auth:** None for Phase 1 (dashboard is public, single-user)
- **Display:** Desktop-only, dark mode only, 1024px min-width
- **Design System:** DESIGN.md defines stage identity colors, verdict colors -- use emoji approximations in GitHub markdown, exact colors in dashboard
- **Security:** Not directly relevant to Phase 3 (no user input handling)
- **GSD Workflow:** All edits through GSD commands
- **Comment limit:** 65,536 characters max per GitHub comment

## Sources

### Primary (HIGH confidence)
- [GitHub REST API: Pull Request Reviews](https://docs.github.com/en/rest/pulls/reviews) -- createReview endpoint, comments array parameters, event types
- [GitHub REST API: Pull Request Review Comments](https://docs.github.com/en/rest/pulls/comments) -- line/side/start_line/start_side parameters, subject_type
- [GitHub REST API: Issue Comments](https://docs.github.com/en/rest/issues/comments) -- createComment/updateComment for summary comment
- [GitHub REST API: Reactions](https://docs.github.com/en/rest/reactions/reactions) -- listForPullRequestReviewComment for polling
- [GitHub Docs: Collapsed Sections](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections) -- `<details>`/`<summary>` syntax
- [GitHub Docs: Working with Comments](https://docs.github.com/en/rest/guides/working-with-comments) -- Three types of PR comments
- [GitHub Community: No Reaction Webhooks](https://github.com/orgs/community/discussions/20824) -- Feature request open since 2022, no reaction webhook events
- [GitHub Community: No Reaction Webhook Events](https://github.com/orgs/community/discussions/7168) -- Confirmed: reactions do not trigger any webhook
- [npm: async-mutex](https://www.npmjs.com/package/async-mutex) -- v0.5.0 verified
- [GitHub Community: Comment Body Limit](https://github.com/orgs/community/discussions/27190) -- 65,536 character limit confirmed

### Secondary (MEDIUM confidence)
- [GitHub: Commenting on Unchanged Lines](https://github.blog/changelog/2025-09-25-pull-request-files-changed-public-preview-now-supports-commenting-on-unchanged-lines/) -- Sept 2025 changelog, web UI supports non-diff lines but API may still lag
- [Qodo PR Agent: Comment Not in Diff](https://github.com/qodo-ai/pr-agent/issues/592) -- Real-world example of 422 errors when commenting outside diff hunks
- [PyGithub: Issues with Many Review Comments](https://github.com/PyGithub/PyGithub/issues/3038) -- Secondary rate limits when creating reviews with many comments

### Pre-existing Project Research (HIGH confidence)
- `.planning/research/ARCHITECTURE.md` -- Find-or-create comment pattern (Pattern 3), per-PR mutex, comment manager component
- `.planning/research/PITFALLS.md` -- Pitfall 1 (review noise), Pitfall 6 (comment races), Pitfall 13 (force-push orphans)
- `.planning/research/FEATURES.md` -- Table stakes: PR summary, inline comments, severity classification
- `DESIGN.md` -- Stage identity colors, verdict colors, stage emojis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Only new dependency is async-mutex (well-established, 0.5.0 stable). All other libraries already installed from Phase 1.
- Architecture: HIGH -- Comment manager pattern verified against ARCHITECTURE.md. GitHub API endpoints verified against official docs. Inline review API parameters confirmed.
- Pitfalls: HIGH -- Race conditions identified and mitigated with mutex. 65K char limit documented. Reaction webhook limitation confirmed from multiple GitHub community discussions. Diff line validation prevents 422 errors.
- **D-15 LIMITATION:** MEDIUM -- The locked decision about "GitHub reaction webhooks" is based on a capability that does not exist. Research proposes a polling-based workaround that achieves the same goal (capturing feedback) through a different mechanism.

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (GitHub API stable; reaction webhook status unlikely to change)
