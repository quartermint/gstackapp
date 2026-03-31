import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'
import type { QualityScorePoint, VerdictRatePoint, FindingTrendPoint } from '@gstackapp/shared'

/**
 * Fetch quality score trend data for a repo.
 */
export function useQualityScores(repoId: number | null) {
  return useQuery({
    queryKey: queryKeys.trends.scores(repoId ?? 0),
    queryFn: async (): Promise<QualityScorePoint[]> => {
      const res = await fetch(`/api/trends/scores?repoId=${repoId}`)
      if (!res.ok) throw new Error('Failed to fetch quality scores')
      return res.json()
    },
    enabled: repoId !== null,
    staleTime: 60_000,
  })
}

/**
 * Fetch verdict rate trend data for a repo + stage.
 */
export function useVerdictRates(repoId: number | null, stage: string) {
  return useQuery({
    queryKey: queryKeys.trends.verdicts(repoId ?? 0, stage),
    queryFn: async (): Promise<VerdictRatePoint[]> => {
      const res = await fetch(`/api/trends/verdicts?repoId=${repoId}&stage=${stage}`)
      if (!res.ok) throw new Error('Failed to fetch verdict rates')
      return res.json()
    },
    enabled: repoId !== null,
    staleTime: 60_000,
  })
}

/**
 * Fetch finding frequency trend data for a repo.
 */
export function useFindingTrends(repoId: number | null) {
  return useQuery({
    queryKey: queryKeys.trends.findings(repoId ?? 0),
    queryFn: async (): Promise<FindingTrendPoint[]> => {
      const res = await fetch(`/api/trends/findings?repoId=${repoId}`)
      if (!res.ok) throw new Error('Failed to fetch finding trends')
      return res.json()
    },
    enabled: repoId !== null,
    staleTime: 60_000,
  })
}
