import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'
import type { ProjectState } from '@gstackapp/shared'

/**
 * Fetch all detected projects with GSD state, git status, and staleness classification.
 */
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: async (): Promise<ProjectState[]> => {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error('Failed to fetch projects')
      return res.json()
    },
  })
}
