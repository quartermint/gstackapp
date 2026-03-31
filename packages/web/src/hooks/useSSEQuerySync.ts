import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSSE } from './useSSE'
import { queryKeys } from '../api/client'
import type { PipelineSSEEvent } from '../types/sse'

const SSE_EVENT_TYPES = [
  'pipeline:started',
  'pipeline:completed',
  'pipeline:failed',
  'stage:running',
  'stage:completed',
] as const

/**
 * SSE-to-TanStack-Query bridge. Listens for pipeline SSE events
 * and invalidates the appropriate query cache entries.
 * Uses scoped invalidation per D-07 and Pitfall 3.
 */
export function useSSEQuerySync() {
  const queryClient = useQueryClient()

  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const data: PipelineSSEEvent = JSON.parse(event.data)

        switch (data.type) {
          case 'pipeline:started':
          case 'pipeline:completed':
          case 'pipeline:failed':
            // Invalidate all pipeline queries
            queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.all })
            break

          case 'stage:running':
          case 'stage:completed':
            // Invalidate the specific pipeline detail and the list
            queryClient.invalidateQueries({
              queryKey: queryKeys.pipelines.detail(data.runId),
            })
            queryClient.invalidateQueries({
              queryKey: queryKeys.pipelines.list(),
            })
            break
        }
      } catch {
        console.warn('[SSE] Failed to parse event data:', event.data)
      }
    },
    [queryClient]
  )

  const eventTypes = useMemo(() => [...SSE_EVENT_TYPES], [])

  useSSE({
    url: '/api/sse',
    onEvent: handleEvent,
    eventTypes,
  })
}
