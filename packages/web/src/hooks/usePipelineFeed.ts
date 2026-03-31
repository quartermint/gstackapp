import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'

/**
 * Local pipeline data types inferred from API response shapes.
 * These match the GET /api/pipelines and GET /api/pipelines/:id responses.
 */
export interface PipelineListItem {
  id: string
  status: string
  headSha: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  pr: {
    number: number
    title: string
    authorLogin: string
    baseBranch: string
    state: string
  }
  repo: {
    fullName: string
  }
  stages: Array<{ stage: string; verdict: string }>
}

export interface FindingData {
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
}

export interface StageResultData {
  stage: string
  verdict: string
  summary: string | null
  durationMs: number | null
  findings: FindingData[]
}

export interface CrossRepoMatchData {
  finding_id: string
  title: string
  description: string
  file_path: string | null
  repo_full_name: string
  distance: number
  stage: string
  severity: string
}

export interface PipelineDetail extends Omit<PipelineListItem, 'stages'> {
  stages: StageResultData[]
  crossRepoMatches?: CrossRepoMatchData[]
}

/**
 * Fetch the list of all pipeline runs (reverse-chronological).
 * Uses fetch directly because Hono RPC AppType doesn't carry route-level types
 * when sub-apps use non-chained route definitions.
 * Separate hook file to avoid conflicts with Plan 04-03's usePipeline.ts.
 */
export function usePipelineList() {
  return useQuery({
    queryKey: queryKeys.pipelines.list(),
    queryFn: async (): Promise<PipelineListItem[]> => {
      const res = await fetch('/api/pipelines')
      if (!res.ok) throw new Error('Failed to fetch pipelines')
      return res.json()
    },
  })
}

/**
 * Fetch a single pipeline run with full stage results and findings.
 */
export function usePipelineDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.pipelines.detail(id ?? ''),
    queryFn: async (): Promise<PipelineDetail> => {
      if (!id) throw new Error('No pipeline ID')
      const res = await fetch(`/api/pipelines/${id}`)
      if (!res.ok) throw new Error('Failed to fetch pipeline detail')
      return res.json()
    },
    enabled: !!id,
  })
}
