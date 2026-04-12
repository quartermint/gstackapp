/**
 * Tests for knowledge-enhanced clarification with gbrain context injection.
 *
 * GB-03: When gbrain entities are available, they're injected into the
 * clarification system prompt. Backward compatible when unavailable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GbrainCacheData } from '../gbrain/types'

// Mock Anthropic SDK
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

import { generateClarificationQuestion, type ClarificationContext } from '../pipeline/clarifier'

describe('generateClarificationQuestion with gbrain context', () => {
  const baseCtx: ClarificationContext = {
    whatNeeded: 'Update the CocoBanana fashion AI to support new designers',
    whatGood: 'New designer profiles show up in search results',
    previousQA: [],
  }

  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"isComplete": false, "question": "Which designer profiles?"}' }],
    })
  })

  it('injects knowledge block into system prompt when entities are provided', async () => {
    const gbrainContext: GbrainCacheData = {
      available: true,
      entities: [
        {
          slug: 'cocobanana',
          title: 'CocoBanana',
          type: 'project',
          content: 'Fashion AI design platform built with Next.js and FastAPI',
          excerpt: 'Fashion AI design platform built with Next.js and FastAPI',
        },
      ],
      searchResults: [],
    }

    await generateClarificationQuestion(baseCtx, gbrainContext)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).toContain('CocoBanana')
    expect(callArgs.system).toContain('project')
    expect(callArgs.system).toContain('Fashion AI design platform')
    expect(callArgs.system).toContain('knowledge about the following')
  })

  it('works identically without gbrainContext parameter (backward compatible)', async () => {
    await generateClarificationQuestion(baseCtx)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).not.toContain('knowledge about the following')
    expect(callArgs.system).toContain('clarify')
  })

  it('does NOT inject knowledge block when gbrainContext.available is false', async () => {
    const gbrainContext: GbrainCacheData = {
      available: false,
      entities: [
        {
          slug: 'cocobanana',
          title: 'CocoBanana',
          type: 'project',
          content: 'Fashion AI design platform',
          excerpt: 'Fashion AI design platform',
        },
      ],
    }

    await generateClarificationQuestion(baseCtx, gbrainContext)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).not.toContain('knowledge about the following')
  })

  it('does NOT inject knowledge block when entities array is empty', async () => {
    const gbrainContext: GbrainCacheData = {
      available: true,
      entities: [],
      searchResults: [],
    }

    await generateClarificationQuestion(baseCtx, gbrainContext)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).not.toContain('knowledge about the following')
  })

  it('includes multiple entities in knowledge block', async () => {
    const gbrainContext: GbrainCacheData = {
      available: true,
      entities: [
        {
          slug: 'cocobanana',
          title: 'CocoBanana',
          type: 'project',
          content: 'Fashion AI platform',
          excerpt: 'Fashion AI platform',
        },
        {
          slug: 'ryan-stern',
          title: 'Ryan Stern',
          type: 'person',
          content: 'Founder and builder',
          excerpt: 'Founder and builder',
        },
      ],
      searchResults: [],
    }

    await generateClarificationQuestion(baseCtx, gbrainContext)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).toContain('CocoBanana')
    expect(callArgs.system).toContain('Ryan Stern')
    expect(callArgs.system).toContain('person')
  })

  it('does NOT inject knowledge block when gbrainContext has no entities field', async () => {
    const gbrainContext: GbrainCacheData = {
      available: true,
      searchResults: [{ slug: 'test', title: 'Test', type: 'page', excerpt: 'A test' }],
    }

    await generateClarificationQuestion(baseCtx, gbrainContext)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).not.toContain('knowledge about the following')
  })
})
