import { useRef, useEffect, useState } from 'react'
import { useIdeation } from '../../hooks/useIdeation'
import { IdeationInput } from './IdeationInput'
import { IdeationPipeline } from './IdeationPipeline'
import { ArtifactCard } from './ArtifactCard'
import type { AgentSSEEvent } from '../../hooks/useIdeation'
import { cn } from '../../lib/cn'

interface IdeationViewProps {
  onLaunchExecution?: (sessionId: string) => void
}

/**
 * Full ideation view: two-column layout with pipeline + conversation left,
 * artifacts right.
 *
 * Per UI spec:
 * - Left (60%): IdeationInput, IdeationPipeline, conversation stream
 * - Right (40%): Scrollable artifact cards, artifact detail on selection
 * - Right column collapses when no artifacts
 *
 * Per D-08: No repo selector, no project association UI. Idea-first.
 *
 * Copywriting contract:
 * - Empty state: "Start with an idea" heading, "Describe what you want to build..." body
 * - Pipeline complete: "Launch Execution" accent CTA
 */
export function IdeationView({ onLaunchExecution }: IdeationViewProps) {
  const {
    idea,
    setIdea,
    startIdeation,
    sessionId,
    status,
    stages,
    artifacts,
    activeStage,
    conversationEvents,
    error,
  } = useIdeation()

  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const conversationEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll conversation to bottom
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversationEvents.length])

  const handleSubmit = () => {
    if (idea.trim()) {
      startIdeation(idea)
    }
  }

  const handleStageClick = (stage: string) => {
    // Find first artifact for this stage and select it
    const artifact = artifacts.find((a) => a.stage === stage)
    if (artifact) {
      setSelectedArtifactId(artifact.id)
    }
  }

  const hasArtifacts = artifacts.length > 0
  const isIdle = status === 'idle'
  const isComplete = status === 'complete'

  // Empty/idle state
  if (isIdle) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-col items-start justify-center flex-1 max-w-2xl px-8 py-16">
          <h2 className="font-display text-[32px] leading-[1.2] font-semibold text-text-primary tracking-[-0.02em] mb-3">
            Start with an idea
          </h2>
          <p className="font-body text-[15px] leading-[1.6] text-text-muted mb-8 max-w-lg">
            Describe what you want to build and watch it flow through four AI skill stages.
            Each stage refines your concept from brainstorm to blueprint.
          </p>
          <div className="w-full max-w-xl">
            <IdeationInput
              value={idea}
              onChange={setIdea}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left column: Pipeline + Conversation */}
      <div
        className={cn(
          'flex flex-col overflow-hidden',
          hasArtifacts ? 'w-[60%]' : 'w-full'
        )}
      >
        {/* Pipeline topology */}
        <div className="shrink-0 px-6 pt-4 pb-2 border-b border-border">
          <IdeationPipeline
            stages={stages}
            activeStage={activeStage}
            artifacts={artifacts.map((a) => ({
              stage: a.stage,
              title: a.title,
              excerpt: a.excerpt,
            }))}
            onStageClick={handleStageClick}
          />

          {/* Launch Execution CTA */}
          {isComplete && sessionId && onLaunchExecution && (
            <div className="flex justify-center pb-3 pt-2">
              <button
                onClick={() => onLaunchExecution(sessionId)}
                className="px-6 py-2.5 rounded-lg font-display font-semibold text-sm bg-accent text-background hover:bg-accent-hover cursor-pointer transition-colors duration-150"
              >
                Launch Execution
              </button>
            </div>
          )}
        </div>

        {/* Conversation stream */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Active stage label */}
          {activeStage && (
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted">
                {activeStage}
              </span>
              {status === 'running' && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              )}
            </div>
          )}

          {/* Render conversation events */}
          {conversationEvents.map((event, i) => (
            <ConversationEvent key={i} event={event} />
          ))}

          {/* Error display */}
          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{
              backgroundColor: 'rgba(255, 90, 103, 0.08)',
              border: '1px solid rgba(255, 90, 103, 0.2)',
              color: '#FF5A67',
            }}>
              {error}
            </div>
          )}

          <div ref={conversationEndRef} />
        </div>
      </div>

      {/* Right column: Artifacts panel */}
      {hasArtifacts && (
        <div className="w-[40%] border-l border-border flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border shrink-0">
            <h3 className="font-display text-sm font-semibold text-text-primary">
              Artifacts
            </h3>
            <p className="font-body text-[12px] text-text-muted mt-0.5">
              {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''} produced
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {artifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                selected={artifact.id === selectedArtifactId}
                onClick={() => setSelectedArtifactId(artifact.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Renders a single conversation event from the ideation SSE stream.
 * Handles text_delta, tool_start, tool_result event types.
 */
function ConversationEvent({ event }: { event: AgentSSEEvent }) {
  if (event.type === 'text_delta' && event.content) {
    return (
      <div className="font-body text-[15px] leading-[1.6] text-text-primary whitespace-pre-wrap">
        {event.content}
      </div>
    )
  }

  if (event.type === 'tool_start' && event.tool_name) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-text-muted">
          Tool
        </span>
        <span className="font-mono text-[13px] text-accent">
          {event.tool_name}
        </span>
      </div>
    )
  }

  if (event.type === 'tool_result' && event.tool_result) {
    return (
      <div className="rounded-lg bg-surface border border-border px-3 py-2 font-mono text-[13px] text-text-muted leading-[1.5] max-h-32 overflow-y-auto whitespace-pre-wrap">
        {event.tool_result}
      </div>
    )
  }

  if (event.type === 'error' && event.error) {
    return (
      <div className="rounded-lg px-3 py-2 text-[13px]" style={{
        backgroundColor: 'rgba(255, 90, 103, 0.08)',
        color: '#FF5A67',
      }}>
        {event.error}
      </div>
    )
  }

  return null
}
