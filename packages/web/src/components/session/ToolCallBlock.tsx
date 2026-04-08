import { useState } from 'react'
import { cn } from '../../lib/cn'

interface ToolCallBlockProps {
  name: string
  id: string
  input?: string
  output?: string
  isError?: boolean
  isRunning?: boolean
  durationMs?: number
}

function formatDuration(ms?: number): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Collapsible tool execution display.
 * Per UI spec: collapsed shows tool name + status badge + duration.
 * Expandable on click to show input and output code blocks.
 */
export function ToolCallBlock({
  name,
  id,
  input,
  output,
  isError,
  isRunning,
  durationMs,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)

  const borderColor = isRunning
    ? 'border-[#36C9FF]'
    : isError
      ? 'border-[#FF5A67]'
      : 'border-[#2EDB87]'

  const badgeBg = isRunning
    ? 'bg-[#36C9FF]/12 text-[#36C9FF]'
    : isError
      ? 'bg-[#FF5A67]/12 text-[#FF5A67]'
      : 'bg-[#2EDB87]/12 text-[#2EDB87]'

  const statusText = isRunning ? 'running' : isError ? 'error' : 'success'

  return (
    <div
      className={cn(
        'border-l-2 pl-3 py-1.5 cursor-pointer select-none',
        borderColor,
        isRunning && 'animate-pulse'
      )}
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`Tool call: ${name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setExpanded(!expanded)
        }
      }}
    >
      {/* Collapsed header */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted">
          {name}
        </span>
        <span className={cn('px-1.5 py-0.5 rounded text-[12px] font-medium leading-[1.4]', badgeBg)}>
          {statusText}
        </span>
        {durationMs != null && !isRunning && (
          <span className="text-[12px] text-text-muted font-body">
            {formatDuration(durationMs)}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-2 space-y-2">
          {input && (
            <div>
              <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
                input
              </span>
              <pre className="mt-1 bg-background rounded p-2 font-mono text-[14px] leading-[1.7] text-text-primary overflow-x-auto whitespace-pre-wrap break-all">
                {input}
              </pre>
            </div>
          )}
          {output && (
            <div>
              <span className="font-mono text-[11px] text-text-muted uppercase tracking-[0.06em]">
                output
              </span>
              <pre
                className={cn(
                  'mt-1 bg-background rounded p-2 font-mono text-[14px] leading-[1.7] overflow-x-auto whitespace-pre-wrap break-all',
                  isError ? 'text-[#FF5A67]' : 'text-text-primary'
                )}
              >
                {output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
