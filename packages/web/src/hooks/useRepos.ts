import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'

export interface Repo {
  id: number
  fullName: string
  defaultBranch: string
  installationId: number
  createdAt: string
}

/**
 * Fetch the list of connected repositories.
 */
export function useRepos() {
  return useQuery({
    queryKey: queryKeys.repos.list(),
    queryFn: async (): Promise<Repo[]> => {
      const res = await fetch('/api/repos')
      if (!res.ok) throw new Error('Failed to fetch repos')
      return res.json()
    },
  })
}
