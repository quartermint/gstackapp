import { hc } from 'hono/client'
import type { AppType } from '@gstackapp/api'

// Hono RPC client — Vite proxy handles /api routing to localhost:3000
export const client = hc<AppType>('/')

// TanStack Query key factory for consistent cache key management
export const queryKeys = {
  pipelines: {
    all: ['pipelines'] as const,
    list: () => [...queryKeys.pipelines.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.pipelines.all, 'detail', id] as const,
  },
  repos: {
    all: ['repos'] as const,
    list: () => [...queryKeys.repos.all, 'list'] as const,
  },
  onboarding: {
    status: ['onboarding', 'status'] as const,
  },
  trends: {
    all: ['trends'] as const,
    scores: (repoId: number) => [...queryKeys.trends.all, 'scores', repoId] as const,
    verdicts: (repoId: number, stage: string) => [...queryKeys.trends.all, 'verdicts', repoId, stage] as const,
    findings: (repoId: number) => [...queryKeys.trends.all, 'findings', repoId] as const,
  },
  projects: {
    all: ['projects'] as const,
    list: () => ['projects', 'list'] as const,
  },
} as const
