import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'

export interface IntelligenceAlert {
  title: string
  description: string
  severity: string
  stage: string
  repos: string[]
  count: number
}

interface IntelligenceFeedResponse {
  alerts: IntelligenceAlert[]
  total: number
}

export function useIntelligenceFeed() {
  return useQuery<IntelligenceFeedResponse>({
    queryKey: queryKeys.intelligence.feed(),
    queryFn: async () => {
      const res = await fetch('/api/intelligence/feed')
      if (!res.ok) return { alerts: [], total: 0 }
      return res.json()
    },
    staleTime: 5 * 60_000, // 5 min
  })
}
