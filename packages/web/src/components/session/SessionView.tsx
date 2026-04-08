import { useEffect } from 'react'
import { useAgentStream, type ChatMessage } from '../../hooks/useAgentStream'
import { useSessionDetail, type SessionMessage } from '../../hooks/useSession'
import { InputArea } from './InputArea'

interface SessionViewProps {
  sessionId: string | null
  onSessionCreated?: (id: string) => void
}

/**
 * Full session conversation view: message list + input area + artifact panel.
 * Message rendering components (MessageList, ArtifactPanel) wired in Task 2.
 */
export function SessionView({ sessionId, onSessionCreated }: SessionViewProps) {
  const {
    messages,
    streamingText,
    activeTools,
    isStreaming,
    compacted,
    error,
    sessionId: streamSessionId,
    sendMessage,
    loadHistory,
  } = useAgentStream()

  const { data: sessionData } = useSessionDetail(sessionId)

  // Load message history when session is selected
  useEffect(() => {
    if (sessionData?.messages) {
      const loaded: ChatMessage[] = sessionData.messages.map((m: SessionMessage) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
      loadHistory(loaded)
    }
  }, [sessionData, loadHistory])

  // Notify parent of new session ID from stream result
  useEffect(() => {
    if (streamSessionId && onSessionCreated) {
      onSessionCreated(streamSessionId)
    }
  }, [streamSessionId, onSessionCreated])

  const handleSend = (text: string) => {
    sendMessage(text, sessionId ?? undefined)
  }

  return (
    <div className="flex h-full">
      {/* Conversation column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Message area - placeholder until MessageList is wired in Task 2 */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {compacted && (
            <div
              className="h-[2px] w-full bg-[#FFB020] mb-4"
              title="Context compressed to maintain coherence"
            />
          )}
          <div className="max-w-[720px] space-y-6">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={
                  msg.role === 'assistant'
                    ? 'bg-surface rounded-lg p-4 font-body text-[15px] leading-[1.6] text-text-primary whitespace-pre-wrap'
                    : 'font-body text-[15px] leading-[1.6] text-text-primary whitespace-pre-wrap'
                }
              >
                {msg.content}
              </div>
            ))}
            {streamingText && (
              <div className="bg-surface rounded-lg p-4 font-body text-[15px] leading-[1.6] text-text-primary whitespace-pre-wrap">
                {streamingText}
                <span className="inline-block w-[2px] h-[1.2em] bg-accent animate-pulse align-text-bottom ml-0.5" />
              </div>
            )}
            {activeTools.size > 0 && (
              <div className="space-y-1">
                {Array.from(activeTools.values()).map(tool => (
                  <div
                    key={tool.id}
                    className="border-l-2 border-[#36C9FF] pl-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted"
                  >
                    {tool.name} {tool.isRunning ? '...' : tool.isError ? 'failed' : 'done'}
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && (
            <div className="max-w-[720px] mt-4 text-[#FF5A67] font-body text-sm">
              {error}
            </div>
          )}
        </div>

        <InputArea onSend={handleSend} isStreaming={isStreaming} />
      </div>
    </div>
  )
}
