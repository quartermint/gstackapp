import { useEffect, useState } from 'react'
import { useAgentStream, type ChatMessage } from '../../hooks/useAgentStream'
import { useSessionDetail, type SessionMessage } from '../../hooks/useSession'
import { InputArea } from './InputArea'
import { MessageList } from './MessageList'
import { ArtifactPanel } from './ArtifactPanel'

interface SessionViewProps {
  sessionId: string | null
  onSessionCreated?: (id: string) => void
}

interface ArtifactContent {
  type: 'code' | 'markdown' | 'gsd'
  title: string
  body: string
}

/**
 * Full session conversation view: message list + input area + artifact panel.
 * Per UI spec: conversation (flex-1) + artifact panel (480px, conditional).
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
  const [artifactOpen, setArtifactOpen] = useState(false)
  const [artifactContent, setArtifactContent] = useState<ArtifactContent | undefined>()

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

  // Expose artifact opening for future use
  void setArtifactContent // suppress unused warning until wired

  const handleSend = (text: string) => {
    sendMessage(text, sessionId ?? undefined)
  }

  return (
    <div className="flex h-full">
      {/* Conversation column */}
      <div className="flex-1 flex flex-col min-w-0">
        <MessageList
          messages={messages}
          streamingText={streamingText}
          activeTools={activeTools}
          compacted={compacted}
        />

        {error && (
          <div className="px-6 pb-2">
            <div className="max-w-[720px] text-[#FF5A67] font-body text-sm">
              {error}
            </div>
          </div>
        )}

        <InputArea onSend={handleSend} isStreaming={isStreaming} />
      </div>

      {/* Artifact panel */}
      <ArtifactPanel
        isOpen={artifactOpen}
        onClose={() => setArtifactOpen(false)}
        content={artifactContent}
      />
    </div>
  )
}
