import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'
import type { CarryoverItem, InfraStatus, DesignDoc } from '@gstackapp/shared'

/**
 * Fetch worklog carryover items with staleness classification.
 */
export function useCarryover() {
  return useQuery({
    queryKey: queryKeys.worklog.carryover,
    queryFn: async (): Promise<CarryoverItem[]> => {
      const res = await fetch('/api/worklog/carryover')
      if (!res.ok) throw new Error('Failed to fetch carryover')
      return res.json()
    },
  })
}

/**
 * Fetch Mac Mini infrastructure status.
 */
export function useInfraStatus() {
  return useQuery({
    queryKey: queryKeys.infra.status,
    queryFn: async (): Promise<InfraStatus> => {
      const res = await fetch('/api/infra/status')
      if (!res.ok) throw new Error('Failed to fetch infra status')
      return res.json()
    },
  })
}

/**
 * Fetch design documents from ~/.gstack/projects/.
 */
export function useDesignDocs() {
  return useQuery({
    queryKey: queryKeys.designDocs.list(),
    queryFn: async (): Promise<DesignDoc[]> => {
      const res = await fetch('/api/design-docs')
      if (!res.ok) throw new Error('Failed to fetch design docs')
      return res.json()
    },
  })
}
