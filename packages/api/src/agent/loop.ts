/**
 * Agent loop wrapper around Claude Agent SDK query().
 *
 * Wraps the SDK's async generator and yields typed SSE events
 * for browser consumption. Handles session resume, budget limits,
 * and custom MCP tool injection.
 */

import { query } from '@anthropic-ai/claude-agent-sdk'
import { gstackToolServer } from './tools'
import { buildSystemPrompt } from './system-prompt'
import { bridgeToSSE, type AgentSSEEvent } from './stream-bridge'

// ── Options ─────────────────────────────────────────────────────────────────

export interface AgentLoopOptions {
  /** User prompt to send */
  prompt: string
  /** Our Drizzle session ID (for metadata tracking) */
  sessionId?: string
  /** SDK session ID for resume */
  sdkSessionId?: string
  /** Project context directory */
  projectPath?: string
  /** Max agentic turns (default 100) */
  maxTurns?: number
  /** Max budget in USD (default 5.0) — T-12-04 DoS mitigation */
  maxBudgetUsd?: number
}

// ── Agent Loop ──────────────────────────────────────────────────────────────

/**
 * Run the agent loop as an async generator that yields typed SSE events.
 *
 * Wraps the Claude Agent SDK's query() generator:
 * - Injects system prompt with cross-project awareness (D-02, D-03, D-04)
 * - Connects custom MCP tools (gstackToolServer)
 * - Enforces budget and turn limits (T-12-04)
 * - Bridges raw SDK messages to frontend-consumable events
 */
export async function* runAgentLoop(
  options: AgentLoopOptions
): AsyncGenerator<AgentSSEEvent> {
  const systemPrompt = buildSystemPrompt({ projectPath: options.projectPath })

  const queryHandle = query({
    prompt: options.prompt,
    options: {
      systemPrompt,
      resume: options.sdkSessionId,
      cwd: options.projectPath ?? process.cwd(),
      includePartialMessages: true,
      allowedTools: [
        'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
        'mcp__gstack__*',
      ],
      permissionMode: 'bypassPermissions',   // Per D-11: personal workstation
      allowDangerouslySkipPermissions: true,  // Required for bypassPermissions
      maxTurns: options.maxTurns ?? 100,
      maxBudgetUsd: options.maxBudgetUsd ?? 5.0,
      mcpServers: { gstack: gstackToolServer },
      persistSession: true,                  // Save SDK sessions for resume
    },
  })

  try {
    for await (const message of queryHandle) {
      const event = bridgeToSSE(message)
      if (event) {
        if (Array.isArray(event)) {
          for (const e of event) yield e
        } else {
          yield event
        }
      }
    }
  } finally {
    // Ensure cleanup if the consumer stops iterating
    queryHandle.close()
  }
}
