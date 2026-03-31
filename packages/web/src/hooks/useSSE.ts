import { useEffect, useRef, useCallback } from 'react'

interface UseSSEOptions {
  url: string
  onEvent: (event: MessageEvent) => void
  eventTypes?: string[]
}

/**
 * Generic SSE hook. Creates an EventSource connection on mount,
 * registers listeners for specified event types, and cleans up on unmount.
 * Native EventSource handles auto-reconnection per the SSE spec.
 */
export function useSSE({ url, onEvent, eventTypes = [] }: UseSSEOptions) {
  const sourceRef = useRef<EventSource | null>(null)
  const stableOnEvent = useCallback(onEvent, [onEvent])

  useEffect(() => {
    const source = new EventSource(url)
    sourceRef.current = source

    // Listen for named event types
    for (const type of eventTypes) {
      source.addEventListener(type, stableOnEvent)
    }

    // Fallback: listen for generic messages if no specific types
    if (eventTypes.length === 0) {
      source.onmessage = stableOnEvent
    }

    source.onerror = () => {
      console.warn('[SSE] Connection error, auto-reconnecting...')
    }

    return () => {
      for (const type of eventTypes) {
        source.removeEventListener(type, stableOnEvent)
      }
      source.close()
      sourceRef.current = null
    }
  }, [url, stableOnEvent, eventTypes])
}
