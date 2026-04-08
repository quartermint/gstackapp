import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface Session {
  id: string
  title: string | null
  status: string
  messageCount: number
  lastMessageAt: string | null
  projectPath: string | null
  createdAt: string
}

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  hasToolCalls: boolean
  createdAt: string
}

interface SessionDetailResponse {
  session: Session
  messages: SessionMessage[]
}

export const sessionKeys = {
  all: ['sessions'] as const,
  list: () => [...sessionKeys.all, 'list'] as const,
  detail: (id: string) => [...sessionKeys.all, 'detail', id] as const,
}

export function useSessions() {
  return useQuery({
    queryKey: sessionKeys.list(),
    queryFn: async (): Promise<Session[]> => {
      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('Failed to fetch sessions')
      const data = await res.json()
      return data.sessions
    },
  })
}

export function useSessionDetail(sessionId: string | null) {
  return useQuery({
    queryKey: sessionKeys.detail(sessionId ?? ''),
    queryFn: async (): Promise<SessionDetailResponse> => {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Failed to load session')
      return res.json()
    },
    enabled: !!sessionId,
  })
}

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (opts: { title?: string; projectPath?: string }) => {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      })
      if (!res.ok) throw new Error('Failed to create session')
      return res.json() as Promise<{ session: Session }>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.all }),
  })
}
