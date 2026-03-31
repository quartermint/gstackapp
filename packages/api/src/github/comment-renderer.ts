import type { Finding } from '@gstackapp/shared'
import { groupFindingsBySeverity, formatSignalRatio } from '../lib/severity-filter'

// ── Types ────────────────────────────────────────────────────────────────────

export interface StageData {
  stage: string
  verdict: string
  summary?: string
}

export interface FindingWithStage extends Finding {
  stage: string
}

export interface RenderCommentInput {
  runId: string
  stages: StageData[]
  allFindings: FindingWithStage[]
  headSha: string
  durationMs?: number
}

// ── Constants ────────────────────────────────────────────────────────────────

export const COMMENT_MARKER_PREFIX = '<!-- gstackapp-review'
export const MAX_COMMENT_LENGTH = 65000
export const MAX_FINDING_DESC_LENGTH = 500
export const MAX_FINDINGS_PER_STAGE = 10

// Stage emoji map (D-01/D-02/D-08)
const STAGE_EMOJI: Record<string, string> = {
  ceo: '\u{1F7E0}',     // orange circle
  eng: '\u{1F535}',     // blue circle
  design: '\u{1F7E3}',  // purple circle
  qa: '\u{1F7E2}',      // green circle
  security: '\u{1F534}', // red circle
}

// Stage display names
const STAGE_NAMES: Record<string, string> = {
  ceo: 'CEO',
  eng: 'Eng',
  design: 'Design',
  qa: 'QA',
  security: 'Security',
}

// Verdict badge formatting
const VERDICT_BADGES: Record<string, string> = {
  PASS: 'PASS',
  FLAG: 'FLAG',
  BLOCK: '**BLOCK**',
  SKIP: '~~SKIP~~',
  RUNNING: '...',
  PENDING: '...',
}

// Stage ordering for pipeline topology
const ORDERED_STAGES = ['ceo', 'eng', 'design', 'qa', 'security']

// Verdict severity order for section sorting (lower = more severe = shown first)
const VERDICT_ORDER: Record<string, number> = {
  BLOCK: 0,
  FLAG: 1,
  PASS: 2,
  SKIP: 3,
  RUNNING: 4,
  PENDING: 5,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + '...'
}

function renderTopologyLine(stages: StageData[]): string {
  const stageMap = new Map(stages.map((s) => [s.stage, s]))

  const topLine = ORDERED_STAGES.map((s) => {
    const emoji = STAGE_EMOJI[s] || ''
    const name = STAGE_NAMES[s] || s
    return `${emoji} ${name}`
  }).join(' \u2501\u2501 ')

  const bottomLine = ORDERED_STAGES.map((s) => {
    const stage = stageMap.get(s)
    const verdict = stage?.verdict || 'PENDING'
    return VERDICT_BADGES[verdict] || '...'
  }).join(' \u2501\u2501 ')

  return `${topLine}\n${bottomLine}`
}

function renderFindingBlock(finding: Finding): string {
  const lines: string[] = []

  let header = `**${finding.title}**`
  if (finding.filePath) {
    header += ` \u2014 \`${finding.filePath}`
    if (finding.lineStart) {
      header += `:${finding.lineStart}`
      if (finding.lineEnd && finding.lineEnd !== finding.lineStart) {
        header += `-${finding.lineEnd}`
      }
    }
    header += '`'
  }
  lines.push(header)

  const desc = truncate(finding.description, MAX_FINDING_DESC_LENGTH)
  lines.push(desc)

  if (finding.suggestion) {
    lines.push(`> \u{1F4A1} ${finding.suggestion}`)
  }

  if (finding.codeSnippet) {
    lines.push('```')
    lines.push(truncate(finding.codeSnippet, MAX_FINDING_DESC_LENGTH))
    lines.push('```')
  }

  return lines.join('\n')
}

function renderStageFindings(stageFindings: FindingWithStage[]): string {
  const grouped = groupFindingsBySeverity(stageFindings)
  const lines: string[] = []
  let totalRendered = 0
  const totalFindings = stageFindings.length

  // Render critical findings directly
  for (const finding of grouped.critical) {
    if (totalRendered >= MAX_FINDINGS_PER_STAGE) break
    lines.push(renderFindingBlock(finding))
    lines.push('')
    totalRendered++
  }

  // Render notable findings directly
  for (const finding of grouped.notable) {
    if (totalRendered >= MAX_FINDINGS_PER_STAGE) break
    lines.push(renderFindingBlock(finding))
    lines.push('')
    totalRendered++
  }

  // Wrap minor findings in collapsible section (D-10)
  if (grouped.minor.length > 0) {
    const minorToRender = grouped.minor.slice(0, Math.max(0, MAX_FINDINGS_PER_STAGE - totalRendered))
    if (minorToRender.length > 0) {
      lines.push(`<details>`)
      lines.push(`<summary>Minor findings (${grouped.minor.length})</summary>`)
      lines.push('')
      for (const finding of minorToRender) {
        lines.push(renderFindingBlock(finding))
        lines.push('')
        totalRendered++
      }
      lines.push('</details>')
      lines.push('')
    }
  }

  // Overflow note
  if (totalFindings > MAX_FINDINGS_PER_STAGE) {
    const overflow = totalFindings - MAX_FINDINGS_PER_STAGE
    lines.push(`*${overflow} more findings \u2014 see dashboard for full results*`)
    lines.push('')
  }

  return lines.join('\n')
}

// ── Exports ──────────────────────────────────────────────────────────────────

/**
 * Render a skeleton comment for when the pipeline first starts.
 * Shows all stages with "..." verdicts and a running message.
 */
export function renderSkeleton(runId: string): string {
  const marker = `${COMMENT_MARKER_PREFIX}:${runId} -->`
  const skeletonStages = ORDERED_STAGES.map((s) => ({
    stage: s,
    verdict: 'PENDING',
  }))
  const topology = renderTopologyLine(skeletonStages)

  const lines = [
    marker,
    '',
    '## gstackapp Review',
    '',
    topology,
    '',
    '*Pipeline running... results will appear as each stage completes.*',
    '',
    `<sub>Reviewed by [gstackapp](https://gstackapp.com) | React on inline comments to give feedback</sub>`,
  ]

  return lines.join('\n')
}

/**
 * Render a full or incremental comment showing pipeline results.
 * Stages are sorted by severity (BLOCK first, then FLAG, PASS, SKIP).
 * Minor findings are wrapped in collapsible details sections.
 * Body is truncated to MAX_COMMENT_LENGTH if exceeded.
 */
export function renderComment(input: RenderCommentInput): string {
  const { runId, stages, allFindings, headSha, durationMs } = input

  const marker = `${COMMENT_MARKER_PREFIX}:${runId} -->`
  const topology = renderTopologyLine(stages)
  const signalRatio = formatSignalRatio(allFindings)
  const shortSha = headSha.slice(0, 7)
  const durationStr = durationMs != null ? `${(durationMs / 1000).toFixed(1)}s` : 'N/A'

  const lines = [
    marker,
    '',
    '## gstackapp Review',
    '',
    topology,
    '',
    `Reviewed: \`${shortSha}\` | Duration: ${durationStr} | Signal: ${signalRatio}`,
    '',
    '---',
    '',
  ]

  // Sort stages by verdict severity (BLOCK first, SKIP last)
  const completedStages = stages
    .filter((s) => s.verdict !== 'PENDING' && s.verdict !== 'RUNNING')
    .sort((a, b) => (VERDICT_ORDER[a.verdict] ?? 5) - (VERDICT_ORDER[b.verdict] ?? 5))

  const pendingStages = stages.filter(
    (s) => s.verdict === 'PENDING' || s.verdict === 'RUNNING'
  )

  // Render completed stages
  for (const stage of completedStages) {
    const emoji = STAGE_EMOJI[stage.stage] || ''
    const name = STAGE_NAMES[stage.stage] || stage.stage
    const badge = VERDICT_BADGES[stage.verdict] || stage.verdict

    lines.push(`### ${emoji} ${name} \u2014 ${badge}`)
    lines.push('')

    if (stage.verdict === 'SKIP') {
      lines.push('*Stage skipped (no findings)*')
      lines.push('')
    } else {
      const stageFindings = allFindings.filter((f) => f.stage === stage.stage)

      if (stageFindings.length === 0) {
        lines.push('No significant findings.')
        lines.push('')
      } else {
        lines.push(renderStageFindings(stageFindings))
      }
    }
  }

  // Render pending/running stages
  for (const stage of pendingStages) {
    const emoji = STAGE_EMOJI[stage.stage] || ''
    const name = STAGE_NAMES[stage.stage] || stage.stage
    lines.push(`### ${emoji} ${name} \u2014 ...`)
    lines.push('')
    lines.push('*Awaiting results...*')
    lines.push('')
  }

  // Footer
  lines.push('---')
  lines.push('')
  lines.push(`<sub>Reviewed by [gstackapp](https://gstackapp.com) | React on inline comments to give feedback</sub>`)

  let body = lines.join('\n')

  // Truncate if over limit
  if (body.length > MAX_COMMENT_LENGTH) {
    const truncationNote = '\n\n... (truncated, see dashboard for full results)'
    body = body.slice(0, MAX_COMMENT_LENGTH - truncationNote.length) + truncationNote
  }

  return body
}
