import { useRef, useEffect, useState, useCallback } from 'react'
import { MessageBubble } from './MessageBubble'
import { CompressionIndicator } from './CompressionIndicator'
import type { ChatMessage, ToolCall } from '../../hooks/useAgentStream'

interface MessageListProps {
  messages: ChatMessage[]
  streamingText: string
  activeTools: Map<string, ToolCall>
  compacted: boolean
}

/**
 * Scrollable message container with auto-scroll and "New messages" pill.
 * Per UI spec:
 * - overflow-y-auto, scroll-padding 24px
 * - Auto-scroll to bottom on new content
 * - Disengage auto-scroll when user scrolls up
 * - "New messages" pill at bottom when scrolled up and new content arrives
 * - Message grouping: same-role 8px gap, different-role 24px gap
 */
export function MessageList({ messages, streamingText, activeTools, compacted }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showPill, setShowPill] = useState(false)

  // Track scroll position to disengage auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    setAutoScroll(atBottom)
    if (atBottom) setShowPill(false)
  }, [])

  // Auto-scroll on new content
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else if (streamingText || messages.length > 0) {
      setShowPill(true)
    }
  }, [messages.length, streamingText, autoScroll])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setAutoScroll(true)
    setShowPill(false)
  }, [])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-6 py-6 relative"
      style={{ scrollPaddingBottom: '24px', scrollPaddingTop: '24px' }}
      onScroll={handleScroll}
    >
      {compacted && <CompressionIndicator />}

      <div className="max-w-[720px]">
        {messages.map((msg, idx) => {
          const prevMsg = idx > 0 ? messages[idx - 1] : null
          const sameRole = prevMsg?.role === msg.role
          const gap = sameRole ? 'mt-2' : idx > 0 ? 'mt-6' : ''

          return (
            <div key={msg.id} className={gap}>
              <MessageBubble
                role={msg.role}
                content={msg.content}
                toolCalls={msg.toolCalls}
                routingInfo={msg.routingInfo}
              />
            </div>
          )
        })}

        {/* Currently streaming text */}
        {streamingText && (
          <div className={messages.length > 0 ? 'mt-6' : ''}>
            <MessageBubble
              role="assistant"
              content={streamingText}
              isStreaming
            />
          </div>
        )}

        {/* Active tool calls during streaming */}
        {activeTools.size > 0 && (
          <div className="space-y-1 mt-2">
            {Array.from(activeTools.values()).map(tool => (
              <div
                key={tool.id}
                className="border-l-2 border-[#36C9FF] pl-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted animate-pulse"
              >
                {tool.name}
                <span className="ml-2 text-[12px] normal-case tracking-normal bg-[#36C9FF]/12 text-[#36C9FF] px-1.5 py-0.5 rounded">
                  running
                </span>
              </div>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* New messages pill */}
      {showPill && (
        <button
          onClick={scrollToBottom}
          className="sticky bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-surface text-accent px-4 py-1.5 text-sm cursor-pointer shadow-lg border border-border hover:bg-surface-hover transition-colors duration-150 z-10"
        >
          New messages
        </button>
      )}
    </div>
  )
}
