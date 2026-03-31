import type { Finding } from '@gstackapp/shared'
import type { Octokit } from '@octokit/rest'
import { logger } from '../lib/logger'

// ── Types ────────────────────────────────────────────────────────────────────

export interface InlineComment {
  path: string
  line: number
  side: 'LEFT' | 'RIGHT'
  body: string
}

export interface DiffFile {
  filename: string
  patch?: string
}

export interface FindingWithStage extends Finding {
  stage: string
  id: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  ceo: '🟠 CEO',
  eng: '🔵 Eng',
  design: '🟣 Design',
  qa: '🟢 QA',
  security: '🔴 Security',
}

export const MAX_INLINE_COMMENTS = 15

// ── Diff Line Parsing ────────────────────────────────────────────────────────

/**
 * Parse unified diff patches to build a set of valid "filePath:lineNumber" strings.
 * Only lines present in the diff (additions and context) are valid targets for inline comments.
 */
export function buildDiffLineMap(diffFiles: DiffFile[]): Set<string> {
  const validLines = new Set<string>()

  for (const file of diffFiles) {
    if (!file.patch) continue

    const lines = file.patch.split('\n')
    let rightLine = 0

    for (const line of lines) {
      // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (hunkMatch) {
        rightLine = parseInt(hunkMatch[1], 10)
        continue
      }

      if (line.startsWith('+')) {
        // Addition line — valid target on right side
        validLines.add(`${file.filename}:${rightLine}`)
        rightLine++
      } else if (line.startsWith('-')) {
        // Deletion line — NOT a valid target on right side, don't increment
      } else {
        // Context line (space prefix or empty) — valid target
        validLines.add(`${file.filename}:${rightLine}`)
        rightLine++
      }
    }
  }

  return validLines
}

// ── Finding to Comment Mapping ───────────────────────────────────────────────

function formatInlineComment(finding: FindingWithStage): string {
  const stageLabel = STAGE_LABELS[finding.stage] || finding.stage
  const severityLabel = finding.severity === 'critical' ? '**CRITICAL**' : 'Notable'

  const parts = [
    `${stageLabel} | ${severityLabel}`,
    '',
    `**${finding.title}**`,
    '',
    finding.description.length > 500
      ? finding.description.slice(0, 497) + '...'
      : finding.description,
  ]

  if (finding.suggestion) {
    parts.push('', `**Suggestion:** ${finding.suggestion}`)
  }

  return parts.join('\n')
}

/**
 * Map findings to inline comments, filtering to only valid diff lines.
 * Per D-07: only Tier 1 (critical) and Tier 2 (notable) findings get inline comments.
 * Capped at MAX_INLINE_COMMENTS to avoid GitHub secondary rate limits.
 */
export function mapFindingsToInlineComments(
  findings: FindingWithStage[],
  diffFiles: DiffFile[]
): InlineComment[] {
  const validLines = buildDiffLineMap(diffFiles)

  const eligible = findings
    .filter((f) => f.severity === 'critical' || f.severity === 'notable')
    .filter((f) => f.filePath && f.lineStart)
    .filter((f) => validLines.has(`${f.filePath}:${f.lineStart}`))

  // Sort: critical first, then notable — so cap preserves highest severity
  eligible.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1
    if (b.severity === 'critical' && a.severity !== 'critical') return 1
    return 0
  })

  return eligible.slice(0, MAX_INLINE_COMMENTS).map((f) => ({
    path: f.filePath!,
    line: f.lineStart!,
    side: 'RIGHT' as const,
    body: formatInlineComment(f),
  }))
}

// ── Create Inline Review ─────────────────────────────────────────────────────

/**
 * Batch all inline comments into a single pulls.createReview call.
 * Returns review comment IDs for storing as ghReviewCommentId on findings.
 */
export async function createInlineReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  comments: InlineComment[]
): Promise<number[]> {
  if (comments.length === 0) return []

  try {
    const { data: review } = await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      event: 'COMMENT',
      comments: comments.map((c) => ({
        path: c.path,
        line: c.line,
        side: c.side,
        body: c.body,
      })),
    })

    // Fetch the review comments to get individual IDs
    const { data: reviewComments } = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
    })

    // Filter to comments from this review
    const thisReviewComments = reviewComments.filter(
      (c: any) => c.pull_request_review_id === review.id
    )

    logger.info(
      { prNumber, reviewId: review.id, commentCount: thisReviewComments.length },
      'Inline review created'
    )

    return thisReviewComments.map((c: any) => c.id)
  } catch (err) {
    logger.error({ err, prNumber, commentCount: comments.length }, 'Failed to create inline review')
    return []
  }
}
