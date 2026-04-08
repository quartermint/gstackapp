import { useState, useEffect, useCallback } from 'react'

type ConnectionState = 'connected' | 'disconnected' | 'loading'

interface LocalHealthResponse {
  status: 'ok' | 'error'
  model?: string
  tokensPerSec?: number
}

/**
 * Mac Mini local model connection indicator.
 * Per 13-UI-SPEC.md Section 4: LocalModelStatus.
 *
 * - Connected: 6px green dot + "Local" label
 * - Disconnected: 6px red dot + "Local offline" in muted text
 * - Loading: 6px cyan dot with pulse animation + "Loading model..."
 *
 * Polls /api/health/local every 30s (T-13-07 DoS mitigation).
 */
export function LocalModelStatus() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
  const [modelName, setModelName] = useState<string | undefined>()
  const [tokensPerSec, setTokensPerSec] = useState<number | undefined>()

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health/local', { signal: AbortSignal.timeout(5000) })
      if (!res.ok) {
        setConnectionState('disconnected')
        return
      }
      const data: LocalHealthResponse = await res.json()
      if (data.status === 'ok') {
        setConnectionState('connected')
        setModelName(data.model)
        setTokensPerSec(data.tokensPerSec)
      } else {
        setConnectionState('disconnected')
      }
    } catch {
      setConnectionState('disconnected')
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30_000) // Poll every 30s per T-13-07
    return () => clearInterval(interval)
  }, [checkHealth])

  const dotColor = connectionState === 'connected'
    ? '#2EDB87'
    : connectionState === 'loading'
      ? '#36C9FF'
      : '#FF5A67'

  const label = connectionState === 'connected'
    ? 'Local'
    : connectionState === 'loading'
      ? 'Connecting...'
      : 'Local offline'

  const textColor = connectionState === 'connected' ? '#EDEDED' : '#8B95A7'

  return (
    <div className="inline-flex items-center gap-1.5 group relative" title={modelName ? `${modelName}${tokensPerSec ? ` - ${tokensPerSec} tok/s` : ''}` : undefined}>
      {/* Status dot */}
      <span
        className={`inline-block shrink-0 rounded-full ${connectionState === 'loading' ? 'animate-pulse' : ''}`}
        style={{
          width: 6,
          height: 6,
          backgroundColor: dotColor,
          ...(connectionState === 'loading' ? { boxShadow: `0 0 8px 2px rgba(54, 201, 255, 0.4)` } : {}),
        }}
      />
      {/* Label */}
      <span
        className="font-body text-[13px] font-normal leading-[1.5]"
        style={{ color: textColor }}
      >
        {label}
      </span>
    </div>
  )
}
