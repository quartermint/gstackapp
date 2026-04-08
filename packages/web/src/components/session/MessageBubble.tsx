import { StreamingCursor } from './StreamingCursor'
import { ToolCallBlock } from './ToolCallBlock'
import type { ToolCall } from '../../hooks/useAgentStream'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  toolCalls?: ToolCall[]
}

/**
 * Single message bubble.
 * Per UI spec:
 * - User: no background, text-primary, 15px Geist, left-aligned flush
 * - AI: bg-surface, rounded-lg, p-4, left-aligned
 * - Max content width: 720px
 */
export function MessageBubble({ role, content, isStreaming, toolCalls }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className="max-w-[720px]">
      <div
        className={
          isUser
            ? 'font-body text-[15px] leading-[1.6] text-text-primary whitespace-pre-wrap'
            : 'bg-surface rounded-lg p-4 font-body text-[15px] leading-[1.6] text-text-primary whitespace-pre-wrap'
        }
      >
        {renderContent(content)}
        {isStreaming && <StreamingCursor />}
      </div>

      {/* Tool calls rendered between text blocks */}
      {toolCalls && toolCalls.length > 0 && (
        <div className="space-y-1 mt-2">
          {toolCalls.map(tool => (
            <ToolCallBlock
              key={tool.id}
              name={tool.name}
              id={tool.id}
              input={tool.input}
              output={tool.output}
              isError={tool.isError}
              isRunning={tool.isRunning}
              durationMs={tool.durationMs}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Basic inline markdown rendering:
 * - Code blocks (```...```) with JetBrains Mono
 * - Inline code (`...`) with JetBrains Mono
 * - Bold (**...**)
 * - Preserves whitespace/newlines
 */
function renderContent(text: string) {
  // Split on code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g)

  return parts.map((part, i) => {
    // Code block
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3)
      // Remove optional language identifier on first line
      const firstNewline = code.indexOf('\n')
      const codeBody = firstNewline >= 0 ? code.slice(firstNewline + 1) : code

      return (
        <pre
          key={i}
          className="my-2 bg-background rounded p-3 font-mono text-[14px] leading-[1.7] overflow-x-auto whitespace-pre"
        >
          {codeBody}
        </pre>
      )
    }

    // Inline formatting
    return <span key={i}>{renderInline(part)}</span>
  })
}

function renderInline(text: string) {
  // Split on inline code and bold
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)

  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="bg-background rounded px-1.5 py-0.5 font-mono text-[14px]"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}
