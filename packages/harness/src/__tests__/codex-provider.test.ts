import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CompletionParams, CompletionResult } from '../types'

// -- Mock openai module -------------------------------------------------------

const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class OpenAIMock {
    chat = { completions: { create: mockCreate } }
    constructor() {}
  },
}))

// -- Mock @openai/codex-sdk module --------------------------------------------

const mockRun = vi.fn()
const mockStartThread = vi.fn().mockReturnValue({ run: mockRun })
vi.mock('@openai/codex-sdk', () => ({
  Codex: class CodexMock {
    startThread = mockStartThread
    constructor() {}
  },
}))

// -- Mock child_process for isCodexAvailable ----------------------------------

const mockExecSync = vi.fn()
vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

// -- Import after mocks -------------------------------------------------------

import { CodexProvider } from '../providers/codex'

// -- Helpers ------------------------------------------------------------------

function mockParams(overrides?: Partial<CompletionParams>): CompletionParams {
  return {
    model: 'gpt-5.4',
    system: 'You are helpful.',
    messages: [{ role: 'user', content: 'Hi' }],
    tools: [],
    maxTokens: 1024,
    ...overrides,
  }
}

function mockOpenAIResponse(overrides?: Record<string, unknown>) {
  return {
    choices: [{
      message: {
        content: 'Hello there',
        tool_calls: null,
      },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
    },
    ...overrides,
  }
}

// =============================================================================
// CodexProvider
// =============================================================================

describe('CodexProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 1: Implements LLMProvider interface
  it('implements LLMProvider interface with name="codex"', () => {
    const provider = new CodexProvider('test-api-key')
    expect(provider.name).toBe('codex')
    expect(typeof provider.createCompletion).toBe('function')
  })

  // Test 2: API mode delegates to OpenAI client
  it('API mode delegates to OpenAI client and returns normalized CompletionResult', async () => {
    mockCreate.mockResolvedValueOnce(mockOpenAIResponse())

    const provider = new CodexProvider('test-api-key')
    const result = await provider.createCompletion(mockParams())

    expect(mockCreate).toHaveBeenCalledOnce()
    expect(result.stopReason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello there' }])
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
  })

  // Test 3: API mode maps tool_calls to ContentBlock[] with type='tool_use'
  it('API mode maps tool_calls to ContentBlock[] with type="tool_use"', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: '{"path": "/tmp/test.ts"}',
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 200, completion_tokens: 30 },
    })

    const provider = new CodexProvider('test-api-key')
    const result = await provider.createCompletion(mockParams({
      tools: [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } }],
    }))

    expect(result.stopReason).toBe('tool_use')
    expect(result.content).toEqual([
      {
        type: 'tool_use',
        id: 'call_123',
        name: 'read_file',
        input: { path: '/tmp/test.ts' },
      },
    ])
  })

  // Test 4: Sandbox mode invokes codex SDK
  it('sandbox mode invokes @openai/codex-sdk and returns SandboxResult', async () => {
    mockRun.mockResolvedValueOnce({
      finalResponse: 'Task completed successfully',
      items: [{ type: 'code', content: 'console.log("done")' }],
      usage: { input_tokens: 150, output_tokens: 80 },
    })

    const provider = new CodexProvider('test-api-key')
    const result = await provider.runSandbox('Fix the bug in index.ts', {
      workDir: '/tmp/test-project',
    })

    expect(mockStartThread).toHaveBeenCalledWith(expect.objectContaining({
      workingDirectory: '/tmp/test-project',
      skipGitRepoCheck: true,
    }))
    expect(result.response).toBe('Task completed successfully')
    expect(result.items).toEqual([{ type: 'code', content: 'console.log("done")' }])
    expect(result.usage).toEqual({ inputTokens: 150, outputTokens: 80 })
  })

  // Test 5: Sandbox mode respects timeout
  it('sandbox mode rejects with error on timeout', async () => {
    mockRun.mockImplementationOnce(() => new Promise((_, reject) => {
      setTimeout(() => reject(new Error('aborted')), 200)
    }))

    const provider = new CodexProvider('test-api-key')
    await expect(
      provider.runSandbox('Long running task', {
        workDir: '/tmp/test-project',
        timeout: 100,
      })
    ).rejects.toThrow()
  })

  // Test 6: isCodexAvailable returns false when binary not found
  it('isCodexAvailable returns false when codex CLI binary not found', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('not found')
    })

    const provider = new CodexProvider('test-api-key')
    expect(provider.isCodexAvailable()).toBe(false)
  })

  // Test 7: API mode handles GPT-5.4 and GPT-5.2 model names
  it('API mode handles GPT-5.4 and GPT-5.2 model names', async () => {
    mockCreate.mockResolvedValue(mockOpenAIResponse())

    const provider = new CodexProvider('test-api-key')

    await provider.createCompletion(mockParams({ model: 'gpt-5.4' }))
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.4' }))

    await provider.createCompletion(mockParams({ model: 'gpt-5.2' }))
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.2' }))
  })

  // Additional: isCodexAvailable returns true when binary found
  it('isCodexAvailable returns true when codex CLI binary is found', () => {
    mockExecSync.mockReturnValueOnce(Buffer.from('/usr/local/bin/codex'))

    const provider = new CodexProvider('test-api-key')
    expect(provider.isCodexAvailable()).toBe(true)
  })
})
