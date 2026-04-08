import { useState, useCallback, useRef } from 'react'

export interface ToolCall {
  id: string
  name: string
  input?: string
  output?: string
  isError?: boolean
  isRunning: boolean
  startedAt: number
  durationMs?: number
}

export interface RoutingInfo {
  provider: string   // 'claude', 'gpt', 'gemini', 'local'
  model: string      // full model name e.g. 'claude-opus-4-6'
  taskType?: string  // e.g. 'ideation', 'review'
  reason?: string    // routing rationale
  confidence?: number // 0-1
  tier?: string      // 'frontier', 'local', 'sandbox'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  routingInfo?: RoutingInfo
}

interface AgentStreamState {
  messages: ChatMessage[]
  streamingText: string
  activeTools: Map<string, ToolCall>
  isStreaming: boolean
  compacted: boolean
  error: string | null
  sessionId: string | null
  pendingRouteInfo: RoutingInfo | null
}

let messageCounter = 0
function nextId() {
  return `msg-${Date.now()}-${++messageCounter}`
}

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>({
    messages: [],
    streamingText: '',
    activeTools: new Map(),
    isStreaming: false,
    compacted: false,
    error: null,
    sessionId: null,
    pendingRouteInfo: null,
  })

  const sourceRef = useRef<EventSource | null>(null)
  const toolsRef = useRef<Map<string, ToolCall>>(new Map())

  const sendMessage = useCallback((prompt: string, sessionId?: string) => {
    // Add user message immediately
    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: prompt }
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      streamingText: '',
      isStreaming: true,
      error: null,
    }))
    toolsRef.current = new Map()

    // Build URL
    const params = new URLSearchParams({ prompt })
    if (sessionId) params.set('sessionId', sessionId)
    const url = `/api/agent/stream?${params.toString()}`

    // Close existing connection
    if (sourceRef.current) {
      sourceRef.current.close()
    }

    const source = new EventSource(url)
    sourceRef.current = source

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        switch (data.type) {
          case 'text_delta':
            setState(prev => ({
              ...prev,
              streamingText: prev.streamingText + data.text,
            }))
            break

          case 'tool_start': {
            const tool: ToolCall = {
              id: data.id,
              name: data.name,
              input: data.input,
              isRunning: true,
              startedAt: Date.now(),
            }
            toolsRef.current.set(data.id, tool)
            setState(prev => ({
              ...prev,
              activeTools: new Map(toolsRef.current),
            }))
            break
          }

          case 'tool_result': {
            const existing = toolsRef.current.get(data.id)
            if (existing) {
              existing.output = data.output
              existing.isError = data.isError
              existing.isRunning = false
              existing.durationMs = Date.now() - existing.startedAt
              toolsRef.current.set(data.id, { ...existing })
            }
            setState(prev => ({
              ...prev,
              activeTools: new Map(toolsRef.current),
            }))
            break
          }

          case 'route_info':
            setState(prev => ({
              ...prev,
              pendingRouteInfo: {
                provider: data.provider,
                model: data.model,
                taskType: data.taskType,
                reason: data.reason,
                confidence: data.confidence,
                tier: data.tier,
              },
            }))
            break

          case 'turn_complete': {
            // Move streaming text + tools into a completed message
            setState(prev => {
              const assistantMsg: ChatMessage = {
                id: data.messageId || nextId(),
                role: 'assistant',
                content: prev.streamingText,
                toolCalls: toolsRef.current.size > 0
                  ? Array.from(toolsRef.current.values())
                  : undefined,
                routingInfo: prev.pendingRouteInfo ?? undefined,
              }
              toolsRef.current = new Map()
              return {
                ...prev,
                messages: [...prev.messages, assistantMsg],
                streamingText: '',
                activeTools: new Map(),
                pendingRouteInfo: null,
              }
            })
            break
          }

          case 'result':
            setState(prev => ({
              ...prev,
              isStreaming: false,
              sessionId: data.sessionId || prev.sessionId,
            }))
            source.close()
            sourceRef.current = null
            break

          case 'compact':
            setState(prev => ({ ...prev, compacted: true }))
            break

          case 'error':
            setState(prev => ({
              ...prev,
              isStreaming: false,
              error: data.message,
            }))
            source.close()
            sourceRef.current = null
            break
        }
      } catch {
        // Ignore parse errors on SSE data
      }
    }

    source.onerror = () => {
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: 'Connection lost. Check your connection and try again.',
      }))
      source.close()
      sourceRef.current = null
    }
  }, [])

  const loadHistory = useCallback((messages: ChatMessage[]) => {
    setState(prev => ({
      ...prev,
      messages,
      streamingText: '',
      activeTools: new Map(),
      isStreaming: false,
      error: null,
    }))
    toolsRef.current = new Map()
  }, [])

  return {
    messages: state.messages,
    streamingText: state.streamingText,
    activeTools: state.activeTools,
    isStreaming: state.isStreaming,
    compacted: state.compacted,
    error: state.error,
    sessionId: state.sessionId,
    sendMessage,
    loadHistory,
  }
}
