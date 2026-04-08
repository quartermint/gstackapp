/**
 * Ideation pipeline orchestrator.
 *
 * Chains 4 skill stages (office-hours -> CEO review -> eng review -> design consultation)
 * as an async generator, yielding typed SSE events for browser consumption.
 *
 * Uses the harness LLMProvider with failover router (Phase 9) instead of the
 * Agent SDK. Ideation stages are analysis/brainstorming — no tool use needed.
 * Failover chain: Claude → Gemini → Qwen (configured via ROUTER_* env vars).
 *
 * Per D-05, D-06: Sequential pipeline with cumulative artifact context.
 * Per D-08: No repo required — idea-first ideation.
 */

import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/client'
import { ideationSessions, ideationArtifacts } from '../db/schema'
import { resolveModel } from '@gstackapp/harness'
import {
  IDEATION_STAGES,
  buildCumulativeContext,
  buildIdeationPrompt,
  getStageDisplayName,
} from './skill-bridge'

// ── Types ──────────────────────────────────────────────────────────────────

/** SSE event forwarded from the harness completion */
export interface IdeationTextEvent {
  type: 'text_delta'
  text: string
}

export type IdeationSSEEvent =
  | { type: 'ideation:stage:start'; stage: string; displayName: string }
  | { type: 'ideation:stage:event'; stage: string; event: IdeationTextEvent | { type: 'route_info'; provider: string; model: string } }
  | { type: 'ideation:stage:complete'; stage: string }
  | { type: 'ideation:stage:artifact'; stage: string; path: string; title?: string }
  | { type: 'ideation:stage:error'; stage: string; error: string }
  | { type: 'ideation:pipeline:complete'; sessionId: string }

export interface IdeationPipeline {
  id: string
  sessionId: string
  agentSessionId?: string
  userIdea: string
  stages: Map<string, 'pending' | 'running' | 'complete' | 'error'>
  artifacts: Map<string, string>
  status: 'running' | 'complete' | 'failed' | 'paused'
}

// ── Stage-to-profile mapping ──────────────────────────────────────────────

/**
 * Map ideation stage names to harness stage names for model resolution.
 * CEO review and eng review map to 'ceo' and 'eng' (Opus in balanced profile).
 * Office hours and design map to 'default' (Sonnet in balanced profile).
 */
function harnessStage(stage: string): string {
  switch (stage) {
    case 'plan-ceo-review': return 'ceo'
    case 'plan-eng-review': return 'eng'
    default: return 'default'
  }
}

// ── Pipeline Runner ────────────────────────────────────────────────────────

/**
 * Run the ideation pipeline as an async generator.
 *
 * Uses the harness LLMProvider with failover router instead of the Agent SDK.
 * Each stage gets a single completion call — no tool use needed for
 * brainstorming/analysis. The router handles Claude → Gemini → Qwen failover
 * when billing caps are hit.
 */
export async function* runIdeationPipeline(
  pipeline: IdeationPipeline
): AsyncGenerator<IdeationSSEEvent> {
  for (const stage of IDEATION_STAGES) {
    pipeline.stages.set(stage, 'running')

    // Update DB with current stage
    db.update(ideationSessions)
      .set({ currentStage: stage, status: 'running' })
      .where(eq(ideationSessions.id, pipeline.id))
      .run()

    yield {
      type: 'ideation:stage:start',
      stage,
      displayName: getStageDisplayName(stage),
    }

    try {
      // Build prompt with cumulative context from prior stages
      const priorContext = buildCumulativeContext(pipeline.artifacts)
      const prompt = buildIdeationPrompt(stage, priorContext, pipeline.userIdea)

      // Resolve model via harness (goes through failover router)
      const resolved = resolveModel(harnessStage(stage))
      console.log(`[ideation] Stage ${stage}: using ${resolved.providerName}:${resolved.model}`)

      // Emit route info so the frontend knows which provider is handling this
      yield {
        type: 'ideation:stage:event',
        stage,
        event: { type: 'route_info', provider: resolved.providerName, model: resolved.model },
      }

      // Single completion call — ideation stages are text analysis, no tools
      const result = await resolved.provider.createCompletion({
        model: resolved.model,
        system: 'You are an expert product and engineering advisor. Analyze the idea thoroughly and provide structured, actionable feedback.',
        messages: [{ role: 'user', content: prompt }],
        tools: [],
        maxTokens: 4096,
      })

      // Extract text from the completion
      const text = result.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n')

      if (text) {
        yield {
          type: 'ideation:stage:event',
          stage,
          event: { type: 'text_delta', text },
        }

        // Store the stage output as an in-memory artifact
        const artifactId = nanoid()
        const excerpt = text.slice(0, 500)
        const title = `${getStageDisplayName(stage)} Analysis`

        db.insert(ideationArtifacts).values({
          id: artifactId,
          ideationSessionId: pipeline.id,
          stage,
          artifactPath: `memory://${pipeline.id}/${stage}`,
          title,
          excerpt,
        }).run()

        pipeline.artifacts.set(stage, text)

        yield {
          type: 'ideation:stage:artifact',
          stage,
          path: `memory://${pipeline.id}/${stage}`,
          title,
        }
      }

      pipeline.stages.set(stage, 'complete')

      // Update DB status between stages
      db.update(ideationSessions)
        .set({ status: 'stage_complete' })
        .where(eq(ideationSessions.id, pipeline.id))
        .run()

      yield { type: 'ideation:stage:complete', stage }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[ideation] Stage ${stage} failed:`, errorMessage)
      if (err instanceof Error && err.stack) {
        console.error('[ideation] Stack:', err.stack.split('\n').slice(0, 5).join('\n'))
      }
      pipeline.stages.set(stage, 'error')
      pipeline.status = 'failed'

      db.update(ideationSessions)
        .set({ status: 'failed' })
        .where(eq(ideationSessions.id, pipeline.id))
        .run()

      yield { type: 'ideation:stage:error', stage, error: errorMessage }
      return // Stop pipeline on error
    }
  }

  // All stages complete
  pipeline.status = 'complete'
  db.update(ideationSessions)
    .set({ status: 'complete', currentStage: null })
    .where(eq(ideationSessions.id, pipeline.id))
    .run()

  yield { type: 'ideation:pipeline:complete', sessionId: pipeline.id }
}

// Re-export stages for use by routes
export { IDEATION_STAGES } from './skill-bridge'
