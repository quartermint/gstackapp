import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'

/**
 * Pipeline list item shape — matches GET /api/pipelines response.
 * Defined here rather than relying on Hono RPC type inference,
 * which loses deep route types across composite project references.
 */
export interface PipelineListItem {
  id: string
  status: string
  headSha: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  reviewUnit: {
    type: 'pr' | 'push'
    title: string
    authorLogin: string
    prNumber: number | null
    ref: string | null
  }
  repo: {
    fullName: string
  }
  stages: Array<{ stage: string; verdict: string }>
}

/**
 * Pipeline detail shape — matches GET /api/pipelines/:id response.
 */
export interface PipelineDetail extends Omit<PipelineListItem, 'stages'> {
  stages: Array<{
    stage: string
    verdict: string
    summary: string | null
    durationMs: number | null
    findings: Array<{
      id: string
      severity: string
      category: string
      title: string
      description: string
      filePath: string | null
      lineStart: number | null
      lineEnd: number | null
      suggestion: string | null
      codeSnippet: string | null
      feedbackVote: string | null
    }>
  }>
}

/**
 * Fetch all pipeline runs (reverse-chronological).
 * Uses direct fetch to /api/pipelines for reliable type safety.
 */
export function usePipelineList() {
  return useQuery({
    queryKey: queryKeys.pipelines.list(),
    queryFn: async (): Promise<PipelineListItem[]> => {
      const res = await fetch('/api/pipelines')
      if (!res.ok) throw new Error(`Pipeline list fetch failed: ${res.status}`)
      return res.json()
    },
  })
}

/**
 * Fetch a single pipeline run with full stage details and findings.
 * Enabled only when id is truthy.
 */
export function usePipelineDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.pipelines.detail(id),
    queryFn: async (): Promise<PipelineDetail> => {
      const res = await fetch(`/api/pipelines/${id}`)
      if (!res.ok) throw new Error(`Pipeline detail fetch failed: ${res.status}`)
      return res.json()
    },
    enabled: !!id,
  })
}
