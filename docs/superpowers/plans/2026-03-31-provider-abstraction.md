# Provider Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded Anthropic client in stage-runner.ts with a provider interface supporting Claude, Gemini, OpenAI, and local LM Studio — all using the same tool_use loop.

**Architecture:** A `LLMProvider` interface normalizes tool calling across providers. Each provider adapter translates between the normalized interface and its native SDK. The stage-runner's tool_use loop speaks only to the interface. Model selection uses named profiles with per-stage env var overrides.

**Tech Stack:** `@anthropic-ai/sdk` (existing), `@google/generative-ai` (new), `openai` (new), Zod for config validation

**Spec:** `docs/superpowers/specs/2026-03-31-multi-provider-push-reviews-design.md` (Plan 1 section)

---

### Task 1: Install dependencies and add config fields

**Files:**
- Modify: `packages/api/package.json`
- Modify: `packages/api/src/lib/config.ts`

- [ ] **Step 1: Install new SDK dependencies**

```bash
cd /Users/ryanstern/gstackapp && npm install @google/generative-ai openai --workspace=packages/api
```

- [ ] **Step 2: Add provider config fields to config.ts**

Add these fields to `configSchema` in `packages/api/src/lib/config.ts`:

```ts
  geminiApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  localApiUrl: z.string().optional(),
  pipelineProfile: z.enum(['quality', 'balanced', 'budget', 'local']).default('balanced'),
```

And map them in the `configSchema.parse()` call:

```ts
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  localApiUrl: process.env.LOCAL_API_URL,
  pipelineProfile: process.env.PIPELINE_PROFILE,
```

- [ ] **Step 3: Add env vars to .env**

Append to `/Users/ryanstern/gstackapp/.env`:

```
# Provider API keys
GEMINI_API_KEY=<paste from ~/.env>
# OPENAI_API_KEY=
# LOCAL_API_URL=http://ryans-mac-mini:1234/v1

# Pipeline config
PIPELINE_PROFILE=balanced
```

- [ ] **Step 4: Verify server starts with new config**

```bash
npm run dev --workspace=packages/api
```

Expected: `gstackapp API listening on http://localhost:3002` (no config validation errors)

- [ ] **Step 5: Commit**

```bash
git add packages/api/package.json packages/api/src/lib/config.ts package-lock.json
git commit -m "feat: add Gemini and OpenAI SDK dependencies and config fields"
```

---

### Task 2: Define the LLMProvider interface and shared types

**Files:**
- Create: `packages/api/src/pipeline/providers/types.ts`

- [ ] **Step 1: Create the types file**

Create `packages/api/src/pipeline/providers/types.ts`:

```ts
/**
 * Normalized LLM provider interface for multi-provider tool_use loops.
 *
 * Each provider adapter translates between this interface and its native SDK.
 * The stage-runner speaks only to this interface.
 */

// ── Content Blocks ──────────────────────────────────────────────────────────

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }

// ── Tool Definitions ────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema object
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface ToolResultBlock {
  type: 'tool_result'
  toolCallId: string
  content: string
  isError?: boolean
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[] | ToolResultBlock[]
}

// ── Completion ──────────────────────────────────────────────────────────────

export interface CompletionParams {
  model: string
  system: string
  messages: ConversationMessage[]
  tools: ToolDefinition[]
  maxTokens: number
  signal?: AbortSignal
}

export interface CompletionResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  content: ContentBlock[]
  usage: { inputTokens: number; outputTokens: number }
}

// ── Provider Interface ──────────────────────────────────────────────────────

export interface LLMProvider {
  readonly name: string
  createCompletion(params: CompletionParams): Promise<CompletionResult>
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/pipeline/providers/types.ts
git commit -m "feat: define LLMProvider interface and shared types"
```

---

### Task 3: Anthropic provider adapter

**Files:**
- Create: `packages/api/src/pipeline/providers/anthropic.ts`
- Create: `packages/api/src/__tests__/providers/anthropic.test.ts`

- [ ] **Step 1: Write the test file**

Create `packages/api/src/__tests__/providers/anthropic.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn()
  return { mockCreate }
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

import { AnthropicProvider } from '../../pipeline/providers/anthropic'
import type { ToolDefinition, ConversationMessage, ToolResultBlock } from '../../pipeline/providers/types'

const tools: ToolDefinition[] = [
  { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
]

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider

  beforeEach(() => {
    mockCreate.mockReset()
    provider = new AnthropicProvider()
  })

  it('translates end_turn response to normalized format', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hello world' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const result = await provider.createCompletion({
      model: 'claude-sonnet-4-6',
      system: 'You are a reviewer.',
      messages: [{ role: 'user', content: 'Review this code.' }],
      tools,
      maxTokens: 4096,
    })

    expect(result.stopReason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello world' }])
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
  })

  it('translates tool_use response with tool call blocks', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'src/index.ts' } },
      ],
      usage: { input_tokens: 80, output_tokens: 30 },
    })

    const result = await provider.createCompletion({
      model: 'claude-sonnet-4-6',
      system: 'You are a reviewer.',
      messages: [{ role: 'user', content: 'Review this code.' }],
      tools,
      maxTokens: 4096,
    })

    expect(result.stopReason).toBe('tool_use')
    expect(result.content).toEqual([
      { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'src/index.ts' } },
    ])
  })

  it('passes tool results in Anthropic format', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done' }],
      usage: { input_tokens: 50, output_tokens: 20 },
    })

    const toolResults: ToolResultBlock[] = [
      { type: 'tool_result', toolCallId: 'call_1', content: 'file contents here' },
    ]

    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Review this.' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'x' } }] },
      { role: 'user', content: toolResults },
    ]

    await provider.createCompletion({
      model: 'claude-sonnet-4-6',
      system: 'You are a reviewer.',
      messages,
      tools,
      maxTokens: 4096,
    })

    const call = mockCreate.mock.calls[0][0]
    const lastMsg = call.messages[2]
    expect(lastMsg.content[0].type).toBe('tool_result')
    expect(lastMsg.content[0].tool_use_id).toBe('call_1')
    expect(lastMsg.content[0].content).toBe('file contents here')
  })

  it('passes abort signal through', async () => {
    const controller = new AbortController()
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'OK' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await provider.createCompletion({
      model: 'claude-sonnet-4-6',
      system: 'Test',
      messages: [{ role: 'user', content: 'Hi' }],
      tools,
      maxTokens: 100,
      signal: controller.signal,
    })

    const callArgs = mockCreate.mock.calls[0]
    expect(callArgs[1]).toEqual({ signal: controller.signal })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/api -- --run -t "AnthropicProvider"
```

Expected: FAIL -- `AnthropicProvider` not found

- [ ] **Step 3: Implement the Anthropic adapter**

Create `packages/api/src/pipeline/providers/anthropic.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ContentBlock,
  ConversationMessage,
  ToolResultBlock,
} from './types'

const anthropic = new Anthropic()

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    const response = await anthropic.messages.create(
      {
        model: params.model,
        max_tokens: params.maxTokens,
        system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
        tools: params.tools.map((t, i, arr) => {
          const tool: Anthropic.Tool = {
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
          }
          if (i === arr.length - 1) {
            return { ...tool, cache_control: { type: 'ephemeral' as const } }
          }
          return tool
        }),
        messages: params.messages.map((m) => this.toAnthropicMessage(m)),
      },
      params.signal ? { signal: params.signal } : undefined
    )

    return {
      stopReason: this.normalizeStopReason(response.stop_reason),
      content: this.normalizeContent(response.content),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }

  private normalizeStopReason(
    reason: string | null
  ): CompletionResult['stopReason'] {
    if (reason === 'tool_use') return 'tool_use'
    if (reason === 'max_tokens') return 'max_tokens'
    return 'end_turn'
  }

  private normalizeContent(
    content: Anthropic.ContentBlock[]
  ): ContentBlock[] {
    return content
      .filter(
        (b): b is Anthropic.TextBlock | Anthropic.ToolUseBlock =>
          b.type === 'text' || b.type === 'tool_use'
      )
      .map((b) => {
        if (b.type === 'text') {
          return { type: 'text' as const, text: b.text }
        }
        return {
          type: 'tool_use' as const,
          id: b.id,
          name: b.name,
          input: b.input as Record<string, unknown>,
        }
      })
  }

  private toAnthropicMessage(
    msg: ConversationMessage
  ): Anthropic.MessageParam {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }

    if (Array.isArray(msg.content) && msg.content.length > 0 && 'toolCallId' in msg.content[0]) {
      return {
        role: msg.role,
        content: (msg.content as ToolResultBlock[]).map((tr) => ({
          type: 'tool_result' as const,
          tool_use_id: tr.toolCallId,
          content: tr.content,
          is_error: tr.isError,
        })),
      }
    }

    return {
      role: msg.role,
      content: (msg.content as ContentBlock[]).map((b) => {
        if (b.type === 'text') return { type: 'text' as const, text: b.text }
        return {
          type: 'tool_use' as const,
          id: b.id,
          name: b.name,
          input: b.input,
        }
      }),
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=packages/api -- --run -t "AnthropicProvider"
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/pipeline/providers/anthropic.ts packages/api/src/__tests__/providers/anthropic.test.ts
git commit -m "feat: Anthropic provider adapter with tests"
```

---

### Task 4: Gemini provider adapter

**Files:**
- Create: `packages/api/src/pipeline/providers/gemini.ts`
- Create: `packages/api/src/__tests__/providers/gemini.test.ts`

- [ ] **Step 1: Write the test file**

Create `packages/api/src/__tests__/providers/gemini.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGenerateContent } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn()
  return { mockGenerateContent }
})

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class MockGoogleAI {
    constructor() {}
    getGenerativeModel() {
      return { generateContent: mockGenerateContent }
    }
  },
  FunctionCallingMode: { AUTO: 'AUTO' },
}))

import { GeminiProvider } from '../../pipeline/providers/gemini'
import type { ToolDefinition } from '../../pipeline/providers/types'

const tools: ToolDefinition[] = [
  { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
]

describe('GeminiProvider', () => {
  let provider: GeminiProvider

  beforeEach(() => {
    mockGenerateContent.mockReset()
    provider = new GeminiProvider('test-api-key')
  })

  it('translates text response to normalized format', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: { parts: [{ text: 'Hello world' }] },
          finishReason: 'STOP',
        }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      },
    })

    const result = await provider.createCompletion({
      model: 'gemini-3-flash-preview',
      system: 'You are a reviewer.',
      messages: [{ role: 'user', content: 'Review this code.' }],
      tools,
      maxTokens: 4096,
    })

    expect(result.stopReason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello world' }])
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
  })

  it('translates function call response to tool_use format', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [{ functionCall: { name: 'read_file', args: { path: 'src/index.ts' } } }],
          },
          finishReason: 'STOP',
        }],
        usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 30 },
      },
    })

    const result = await provider.createCompletion({
      model: 'gemini-3-flash-preview',
      system: 'You are a reviewer.',
      messages: [{ role: 'user', content: 'Review this code.' }],
      tools,
      maxTokens: 4096,
    })

    expect(result.stopReason).toBe('tool_use')
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('tool_use')
    if (result.content[0].type === 'tool_use') {
      expect(result.content[0].name).toBe('read_file')
      expect(result.content[0].input).toEqual({ path: 'src/index.ts' })
    }
  })

  it('handles mixed text and function call parts', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [{
          content: {
            parts: [
              { text: 'Let me read that file.' },
              { functionCall: { name: 'read_file', args: { path: 'README.md' } } },
            ],
          },
          finishReason: 'STOP',
        }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 25 },
      },
    })

    const result = await provider.createCompletion({
      model: 'gemini-3-flash-preview',
      system: 'You are a reviewer.',
      messages: [{ role: 'user', content: 'Review this code.' }],
      tools,
      maxTokens: 4096,
    })

    expect(result.stopReason).toBe('tool_use')
    expect(result.content).toHaveLength(2)
    expect(result.content[0]).toEqual({ type: 'text', text: 'Let me read that file.' })
    expect(result.content[1].type).toBe('tool_use')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/api -- --run -t "GeminiProvider"
```

Expected: FAIL -- `GeminiProvider` not found

- [ ] **Step 3: Implement the Gemini adapter**

Create `packages/api/src/pipeline/providers/gemini.ts`:

```ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ContentBlock,
  ConversationMessage,
  ToolResultBlock,
} from './types'

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini'
  private client: GoogleGenerativeAI

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    const model = this.client.getGenerativeModel({
      model: params.model,
      systemInstruction: params.system,
      tools: [{
        functionDeclarations: params.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        })),
      }],
    })

    const contents = params.messages.map((m) => this.toGeminiContent(m))

    const result = await model.generateContent({
      contents,
      generationConfig: { maxOutputTokens: params.maxTokens },
    })

    const response = result.response
    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    const usage = response.usageMetadata

    const hasFunctionCall = parts.some((p: any) => p.functionCall)

    const content: ContentBlock[] = []
    for (const part of parts) {
      if ((part as any).text !== undefined) {
        content.push({ type: 'text', text: (part as any).text })
      }
      if ((part as any).functionCall) {
        const fc = (part as any).functionCall
        content.push({
          type: 'tool_use',
          id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: fc.name,
          input: fc.args ?? {},
        })
      }
    }

    return {
      stopReason: hasFunctionCall ? 'tool_use' : this.normalizeFinishReason(candidate?.finishReason),
      content,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      },
    }
  }

  private normalizeFinishReason(
    reason?: string
  ): CompletionResult['stopReason'] {
    if (reason === 'MAX_TOKENS') return 'max_tokens'
    return 'end_turn'
  }

  private toGeminiContent(msg: ConversationMessage): any {
    const role = msg.role === 'assistant' ? 'model' : 'user'

    if (typeof msg.content === 'string') {
      return { role, parts: [{ text: msg.content }] }
    }

    if (Array.isArray(msg.content) && msg.content.length > 0 && 'toolCallId' in msg.content[0]) {
      return {
        role,
        parts: (msg.content as ToolResultBlock[]).map((tr) => ({
          functionResponse: {
            name: tr.toolCallId,
            response: { content: tr.content },
          },
        })),
      }
    }

    return {
      role,
      parts: (msg.content as ContentBlock[]).map((b) => {
        if (b.type === 'text') return { text: b.text }
        return { functionCall: { name: b.name, args: b.input } }
      }),
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=packages/api -- --run -t "GeminiProvider"
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/pipeline/providers/gemini.ts packages/api/src/__tests__/providers/gemini.test.ts
git commit -m "feat: Gemini provider adapter with tests"
```

---

### Task 5: OpenAI provider adapter (cloud + local)

**Files:**
- Create: `packages/api/src/pipeline/providers/openai.ts`
- Create: `packages/api/src/__tests__/providers/openai.test.ts`

- [ ] **Step 1: Write the test file**

Create `packages/api/src/__tests__/providers/openai.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn()
  return { mockCreate }
})

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } }
    constructor() {}
  },
}))

import { OpenAIProvider } from '../../pipeline/providers/openai'
import type { ToolDefinition, ConversationMessage, ToolResultBlock } from '../../pipeline/providers/types'

const tools: ToolDefinition[] = [
  { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
]

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider

  beforeEach(() => {
    mockCreate.mockReset()
    provider = new OpenAIProvider({ apiKey: 'test-key' })
  })

  it('translates stop response to normalized format', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { role: 'assistant', content: 'Hello world', tool_calls: undefined },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    })

    const result = await provider.createCompletion({
      model: 'gpt-4o',
      system: 'You are a reviewer.',
      messages: [{ role: 'user', content: 'Review this code.' }],
      tools,
      maxTokens: 4096,
    })

    expect(result.stopReason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello world' }])
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
  })

  it('translates tool_calls response to tool_use format', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_abc',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"src/index.ts"}' },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 80, completion_tokens: 30 },
    })

    const result = await provider.createCompletion({
      model: 'gpt-4o',
      system: 'You are a reviewer.',
      messages: [{ role: 'user', content: 'Review this code.' }],
      tools,
      maxTokens: 4096,
    })

    expect(result.stopReason).toBe('tool_use')
    expect(result.content).toEqual([
      { type: 'tool_use', id: 'call_abc', name: 'read_file', input: { path: 'src/index.ts' } },
    ])
  })

  it('passes tool results in OpenAI format', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: { role: 'assistant', content: 'Done' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 50, completion_tokens: 20 },
    })

    const messages: ConversationMessage[] = [
      { role: 'user', content: 'Review this.' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call_abc', name: 'read_file', input: { path: 'x' } }] },
      { role: 'user', content: [{ type: 'tool_result', toolCallId: 'call_abc', content: 'file data' }] as ToolResultBlock[] },
    ]

    await provider.createCompletion({
      model: 'gpt-4o',
      system: 'You are a reviewer.',
      messages,
      tools,
      maxTokens: 4096,
    })

    const call = mockCreate.mock.calls[0][0]
    const toolMsg = call.messages.find((m: any) => m.role === 'tool')
    expect(toolMsg).toBeTruthy()
    expect(toolMsg.tool_call_id).toBe('call_abc')
    expect(toolMsg.content).toBe('file data')
  })

  it('accepts custom baseURL for local LM Studio', () => {
    const localProvider = new OpenAIProvider({
      apiKey: 'not-needed',
      baseURL: 'http://ryans-mac-mini:1234/v1',
    })
    expect(localProvider.name).toBe('openai')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/api -- --run -t "OpenAIProvider"
```

Expected: FAIL -- `OpenAIProvider` not found

- [ ] **Step 3: Implement the OpenAI adapter**

Create `packages/api/src/pipeline/providers/openai.ts`:

```ts
import OpenAI from 'openai'
import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ContentBlock,
  ConversationMessage,
  ToolResultBlock,
} from './types'

interface OpenAIProviderOptions {
  apiKey: string
  baseURL?: string
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  private client: OpenAI

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    })
  }

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    const messages = [
      { role: 'system' as const, content: params.system },
      ...params.messages.flatMap((m) => this.toOpenAIMessages(m)),
    ]

    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
      tools: params.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
    })

    const choice = response.choices[0]
    const msg = choice.message

    const content: ContentBlock[] = []

    if (msg.content) {
      content.push({ type: 'text', text: msg.content })
    }

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        })
      }
    }

    return {
      stopReason: this.normalizeFinishReason(choice.finish_reason),
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    }
  }

  private normalizeFinishReason(
    reason: string | null
  ): CompletionResult['stopReason'] {
    if (reason === 'tool_calls') return 'tool_use'
    if (reason === 'length') return 'max_tokens'
    return 'end_turn'
  }

  private toOpenAIMessages(
    msg: ConversationMessage
  ): OpenAI.ChatCompletionMessageParam[] {
    if (typeof msg.content === 'string') {
      return [{ role: msg.role as 'user' | 'assistant', content: msg.content }]
    }

    if (Array.isArray(msg.content) && msg.content.length > 0 && 'toolCallId' in msg.content[0]) {
      return (msg.content as ToolResultBlock[]).map((tr) => ({
        role: 'tool' as const,
        tool_call_id: tr.toolCallId,
        content: tr.content,
      }))
    }

    const toolCalls = (msg.content as ContentBlock[]).filter(
      (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use'
    )
    const textParts = (msg.content as ContentBlock[]).filter(
      (b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text'
    )

    return [{
      role: 'assistant' as const,
      content: textParts.map((t) => t.text).join('\n') || null,
      tool_calls: toolCalls.length > 0
        ? toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          }))
        : undefined,
    }]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=packages/api -- --run -t "OpenAIProvider"
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/pipeline/providers/openai.ts packages/api/src/__tests__/providers/openai.test.ts
git commit -m "feat: OpenAI provider adapter with tests (cloud + local)"
```

---

### Task 6: Provider factory and model resolution

**Files:**
- Create: `packages/api/src/pipeline/providers/index.ts`
- Create: `packages/api/src/__tests__/providers/index.test.ts`

- [ ] **Step 1: Write the test file**

Create `packages/api/src/__tests__/providers/index.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../pipeline/providers/anthropic', () => ({
  AnthropicProvider: class { readonly name = 'anthropic' },
}))
vi.mock('../../pipeline/providers/gemini', () => ({
  GeminiProvider: class { readonly name = 'gemini'; constructor() {} },
}))
vi.mock('../../pipeline/providers/openai', () => ({
  OpenAIProvider: class { readonly name = 'openai'; constructor() {} },
}))
vi.mock('../../lib/config', () => ({
  config: {
    anthropicApiKey: 'test-anthropic-key',
    geminiApiKey: 'test-gemini-key',
    openaiApiKey: 'test-openai-key',
    localApiUrl: 'http://localhost:1234/v1',
    pipelineProfile: 'balanced',
  },
}))

import { resolveModel, getProvider, PROFILES } from '../../pipeline/providers/index'

describe('provider factory', () => {
  beforeEach(() => {
    delete process.env.STAGE_CEO_MODEL
    delete process.env.STAGE_ENG_MODEL
  })

  it('resolves balanced profile defaults correctly', () => {
    const ceo = resolveModel('ceo')
    expect(ceo.providerName).toBe('anthropic')
    expect(ceo.model).toBe('claude-opus-4-6')

    const eng = resolveModel('eng')
    expect(eng.providerName).toBe('anthropic')
    expect(eng.model).toBe('claude-sonnet-4-6')
  })

  it('applies per-stage env var overrides', () => {
    process.env.STAGE_CEO_MODEL = 'gemini:gemini-3-flash-preview'
    const ceo = resolveModel('ceo')
    expect(ceo.providerName).toBe('gemini')
    expect(ceo.model).toBe('gemini-3-flash-preview')
  })

  it('quality profile uses Opus for all stages', () => {
    expect(PROFILES.quality.default).toBe('anthropic:claude-opus-4-6')
  })

  it('budget profile uses Gemini for all stages', () => {
    expect(PROFILES.budget.default).toBe('gemini:gemini-3-flash-preview')
  })

  it('getProvider returns correct provider by name', () => {
    expect(getProvider('anthropic').name).toBe('anthropic')
    expect(getProvider('gemini').name).toBe('gemini')
    expect(getProvider('openai').name).toBe('openai')
  })

  it('getProvider for local returns openai provider', () => {
    expect(getProvider('local').name).toBe('openai')
  })

  it('throws for unknown provider', () => {
    expect(() => getProvider('unknown')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test --workspace=packages/api -- --run -t "provider factory"
```

Expected: FAIL -- module not found

- [ ] **Step 3: Implement the provider factory**

Create `packages/api/src/pipeline/providers/index.ts`:

```ts
import { config } from '../../lib/config'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'
import type { LLMProvider } from './types'
import type { Stage } from '@gstackapp/shared'

export type { LLMProvider, CompletionParams, CompletionResult, ContentBlock, ConversationMessage, ToolResultBlock, ToolDefinition } from './types'

// ── Model Profiles ──────────────────────────────────────────────────────────

export const PROFILES: Record<string, Record<string, string>> = {
  quality: {
    default: 'anthropic:claude-opus-4-6',
  },
  balanced: {
    default: 'anthropic:claude-sonnet-4-6',
    ceo: 'anthropic:claude-opus-4-6',
    security: 'anthropic:claude-opus-4-6',
  },
  budget: {
    default: 'gemini:gemini-3-flash-preview',
  },
  local: {
    default: 'local:qwen3-coder-30b',
  },
}

// ── Provider Singletons ─────────────────────────────────────────────────────

let _providers: Map<string, LLMProvider> | null = null

function initProviders(): Map<string, LLMProvider> {
  if (_providers) return _providers
  _providers = new Map()

  _providers.set('anthropic', new AnthropicProvider())

  if (config.geminiApiKey) {
    _providers.set('gemini', new GeminiProvider(config.geminiApiKey))
  }

  if (config.openaiApiKey) {
    _providers.set('openai', new OpenAIProvider({ apiKey: config.openaiApiKey }))
  }

  if (config.localApiUrl) {
    _providers.set('local', new OpenAIProvider({
      apiKey: 'not-needed',
      baseURL: config.localApiUrl,
    }))
  }

  return _providers
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getProvider(name: string): LLMProvider {
  const providers = initProviders()
  const provider = providers.get(name)
  if (!provider) {
    throw new Error(
      `Provider "${name}" not configured. Check your .env for the required API key.`
    )
  }
  return provider
}

export function resolveModel(stage: Stage): { provider: LLMProvider; providerName: string; model: string } {
  const envKey = `STAGE_${stage.toUpperCase()}_MODEL`
  const envValue = process.env[envKey]
  if (envValue) {
    const [providerName, model] = envValue.split(':')
    return { provider: getProvider(providerName), providerName, model }
  }

  const profile = PROFILES[config.pipelineProfile] ?? PROFILES.balanced
  const profileValue = profile[stage] ?? profile.default
  const [providerName, model] = profileValue.split(':')
  return { provider: getProvider(providerName), providerName, model }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test --workspace=packages/api -- --run -t "provider factory"
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/pipeline/providers/index.ts packages/api/src/__tests__/providers/index.test.ts
git commit -m "feat: provider factory with profile-based model resolution"
```

---

### Task 7: Refactor stage-runner to use provider abstraction

**Files:**
- Modify: `packages/api/src/pipeline/stage-runner.ts`
- Modify: `packages/api/src/__tests__/stage-runner.test.ts`
- Modify: `packages/api/src/db/schema.ts`
- Modify: `packages/api/scripts/db-init.ts`
- Modify: `packages/api/src/pipeline/orchestrator.ts`

- [ ] **Step 1: Add `provider_model` column to schema and db-init**

In `packages/api/src/db/schema.ts`, add to the `stageResults` table after the `error` field:

```ts
  providerModel: text('provider_model'),
```

In `packages/api/scripts/db-init.ts`, add `provider_model TEXT` after `error TEXT` in the `stage_results` CREATE TABLE statement.

- [ ] **Step 2: Add `providerModel` to StageOutput interface**

In `packages/api/src/pipeline/stage-runner.ts`, update the `StageOutput` interface:

```ts
export interface StageOutput {
  verdict: Verdict
  summary: string
  findings: Finding[]
  tokenUsage: number
  durationMs: number
  providerModel: string
}
```

- [ ] **Step 3: Rewrite stage-runner imports and constants**

Replace the top of `packages/api/src/pipeline/stage-runner.ts`. Remove the `Anthropic` import, `MODEL_MAP`, and `anthropic` singleton. Replace with:

```ts
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VerdictSchema, FindingSchema } from '@gstackapp/shared'
import type { Stage, Verdict, Finding } from '@gstackapp/shared'
import { createSandboxTools, executeTool } from './tools'
import { resolveModel } from './providers'
import type { ContentBlock, ConversationMessage, ToolResultBlock } from './providers'
import { logger } from '../lib/logger'

const MAX_ITERATIONS = 25
const STAGE_TIMEOUT_MS = 5 * 60 * 1000
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
```

- [ ] **Step 4: Rewrite parseStageOutput to use normalized types**

Replace the `parseStageOutput` function. Change the first parameter from `Anthropic.Message | null` to `ContentBlock[] | null`:

```ts
function parseStageOutput(
  content: ContentBlock[] | null,
  stage: Stage
): { verdict: Verdict; summary: string; findings: Finding[] } {
  if (!content) {
    return { verdict: 'FLAG', summary: 'Stage did not produce a response', findings: [] }
  }

  const textBlocks = content.filter(
    (block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text'
  )
  const fullText = textBlocks.map((b) => b.text).join('\n')

  const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      const verdict = VerdictSchema.parse(parsed.verdict)
      const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
      const findings: Finding[] = []
      if (Array.isArray(parsed.findings)) {
        for (const raw of parsed.findings) {
          try { findings.push(FindingSchema.parse(raw)) }
          catch { logger.warn({ stage, raw }, 'Skipping invalid finding from AI response') }
        }
      }
      return { verdict, summary, findings }
    } catch {
      logger.warn({ stage }, 'Failed to parse structured output from AI response')
    }
  }

  return { verdict: 'FLAG', summary: fullText.slice(0, 500), findings: [] }
}
```

- [ ] **Step 5: Rewrite runStage to use provider abstraction**

Replace the `runStage` function body to use `resolveModel()` and `provider.createCompletion()`. The tool_use loop uses normalized `ContentBlock` and `ToolResultBlock` types. Map `createSandboxTools()` output to `ToolDefinition[]` format. Return `providerModel` in the output.

Key changes from current implementation:
- `resolveModel(input.stage)` replaces `MODEL_MAP[input.stage]`
- `provider.createCompletion(...)` replaces `anthropic.messages.create(...)`
- `result.stopReason` replaces `response.stop_reason`
- `result.content` filter for `tool_use` blocks replaces `response.content` filter
- Tool results use `{ type: 'tool_result', toolCallId, content }` not `{ type: 'tool_result', tool_use_id, content }`

See the spec task for the full function body.

- [ ] **Step 6: Update runStageWithRetry to include providerModel on failure**

```ts
export async function runStageWithRetry(input: StageInput): Promise<StageOutput> {
  const { providerName, model } = resolveModel(input.stage)
  const providerModel = `${providerName}:${model}`
  try {
    return await runStage(input)
  } catch (firstError) {
    logger.warn({ stage: input.stage, error: (firstError as Error).message }, 'Stage failed, retrying')
    try {
      return await runStage(input)
    } catch (retryError) {
      logger.error({ stage: input.stage, error: (retryError as Error).message }, 'Stage failed after retry')
      return {
        verdict: 'FLAG' as const,
        summary: `Stage failed after retry: ${(retryError as Error).message}`,
        findings: [],
        tokenUsage: 0,
        durationMs: 0,
        providerModel,
      }
    }
  }
}
```

- [ ] **Step 7: Update orchestrator to persist providerModel**

In `packages/api/src/pipeline/orchestrator.ts`, in the fulfilled result handler, add `providerModel: output.providerModel` to the `stageResults` `.set()` call.

- [ ] **Step 8: Rewrite stage-runner tests to mock provider factory**

Replace `packages/api/src/__tests__/stage-runner.test.ts`. Mock `../pipeline/providers` instead of `@anthropic-ai/sdk`. Use `mockCreateCompletion` that returns normalized `CompletionResult` objects. Test helper `makeEndTurnResult()` returns `{ stopReason, content, usage }` format. Add assertion for `result.providerModel`.

See the spec task for the full test file.

- [ ] **Step 9: Run all tests**

```bash
npm test --workspace=packages/api -- --run
```

Expected: 215+ tests PASS (205 existing + ~18 new provider tests)

- [ ] **Step 10: Add provider_model column to live DB**

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/gstackapp.db');
try { db.exec('ALTER TABLE stage_results ADD COLUMN provider_model TEXT'); console.log('Column added'); }
catch(e) { console.log('Already exists:', e.message); }
db.close();
"
```

- [ ] **Step 11: Commit**

```bash
git add packages/api/src/pipeline/stage-runner.ts packages/api/src/pipeline/orchestrator.ts packages/api/src/db/schema.ts packages/api/scripts/db-init.ts packages/api/src/__tests__/stage-runner.test.ts
git commit -m "feat: refactor stage-runner to use multi-provider abstraction"
```

---

### Task 8: Smoke test with live Gemini call

**Files:** None (manual verification)

- [ ] **Step 1: Set PIPELINE_PROFILE=budget in .env temporarily**

- [ ] **Step 2: Restart server and redeliver a PR webhook**

Redeliver the `pull_request.opened` webhook for quartermint/openefb#2 using the JWT-based redelivery script from earlier in this session.

- [ ] **Step 3: Wait ~3 minutes and verify Gemini stages complete**

Query stage_results for the latest pipeline run. All stages should show `provider_model` = `gemini:gemini-3-flash-preview`. Pipeline should reach COMPLETED status.

- [ ] **Step 4: Verify PR comment was updated**

Check quartermint/openefb#2 comments. A new review comment should appear with findings from Gemini.

- [ ] **Step 5: Restore PIPELINE_PROFILE=balanced in .env**
