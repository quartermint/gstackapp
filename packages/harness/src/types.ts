/**
 * Normalized LLM provider interface for multi-provider tool_use loops.
 *
 * Each provider adapter translates between this interface and its native SDK.
 * The stage-runner speaks only to this interface.
 */

// -- Content Blocks ----------------------------------------------------------

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; providerMetadata?: Record<string, unknown> }

// -- Tool Definitions --------------------------------------------------------

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema object
}

// -- Messages ----------------------------------------------------------------

export interface ToolResultBlock {
  type: 'tool_result'
  toolCallId: string
  name?: string  // Function name (required by Gemini, optional for others)
  content: string
  isError?: boolean
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[] | ToolResultBlock[]
}

// -- Completion --------------------------------------------------------------

export interface CompletionParams {
  model: string
  system: string
  messages: ConversationMessage[]
  tools: ToolDefinition[]
  maxTokens: number
  signal?: AbortSignal
  taskType?: string  // Task classification for routing
}

export interface CompletionResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  content: ContentBlock[]
  usage: { inputTokens: number; outputTokens: number }
}

// -- Provider Interface ------------------------------------------------------

export interface LLMProvider {
  readonly name: string
  createCompletion(params: CompletionParams): Promise<CompletionResult>
}

// -- Task Classification (D-09, D-10, D-11) ----------------------------------

export type TaskTier = 'frontier' | 'local' | 'sandbox' | 'any'

export interface TaskClassification {
  tier: TaskTier
  reason: string
  confidence: number  // 0-1
  taskType: string    // e.g., 'ideation', 'scaffolding', 'review', 'debugging', 'refactor'
  recommendedModel?: string  // From capability matrix, if available
}

export interface ClassificationInput {
  messageLength: number
  toolCount: number
  conversationDepth: number
  hasCodeReview: boolean
  isMultiFileEdit: boolean
  taskCategory?: string  // Explicit category if known
  skillManifest?: { id: string; tier?: TaskTier }
}

// -- Sandbox (Codex CLI subprocess) ------------------------------------------

export interface SandboxOptions {
  workDir: string
  timeout?: number  // ms, default 120000
  outputSchema?: Record<string, unknown>  // JSON Schema for structured output
}

export interface SandboxResult {
  response: string
  items: unknown[]  // Codex event items
  usage: { inputTokens: number; outputTokens: number }
}
