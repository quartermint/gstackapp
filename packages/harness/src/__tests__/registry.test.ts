import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SkillRegistry } from '../skills/registry'
import type { ClassificationInput, TaskClassification } from '../types'

const validManifest = {
  id: 'test-skill',
  name: 'Test Skill',
  version: '1.0.0',
  tools: ['Read', 'Bash'],
  prompt: 'You are a test skill.',
  outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry

  beforeEach(() => {
    registry = new SkillRegistry()
  })

  describe('loadFromDirectory', () => {
    it('loads valid .skill.json files into registry', () => {
      const dir = mkdtempSync(join(tmpdir(), 'skills-'))
      writeFileSync(join(dir, 'test.skill.json'), JSON.stringify(validManifest))

      registry.loadFromDirectory(dir)

      expect(registry.list()).toHaveLength(1)
      expect(registry.get('test-skill')).toBeDefined()
      expect(registry.get('test-skill')!.name).toBe('Test Skill')
    })

    it('returns silently for nonexistent directory', () => {
      expect(() => registry.loadFromDirectory('/nonexistent/path/skills')).not.toThrow()
      expect(registry.list()).toHaveLength(0)
    })

    it('skips invalid .skill.json files with console.warn, loads valid ones', () => {
      const dir = mkdtempSync(join(tmpdir(), 'skills-'))
      writeFileSync(join(dir, 'good.skill.json'), JSON.stringify(validManifest))
      writeFileSync(join(dir, 'bad.skill.json'), JSON.stringify({ id: '', name: '' }))

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      registry.loadFromDirectory(dir)
      warnSpy.mockRestore()

      expect(registry.list()).toHaveLength(1)
      expect(registry.get('test-skill')).toBeDefined()
    })

    it('ignores non-.skill.json files', () => {
      const dir = mkdtempSync(join(tmpdir(), 'skills-'))
      writeFileSync(join(dir, 'test.skill.json'), JSON.stringify(validManifest))
      writeFileSync(join(dir, 'readme.md'), '# Skills')
      writeFileSync(join(dir, 'config.json'), '{}')

      registry.loadFromDirectory(dir)
      expect(registry.list()).toHaveLength(1)
    })
  })

  describe('loadFromUrl', () => {
    it('fetches HTTPS URL, parses JSON, validates, and adds to registry', async () => {
      const mockResponse = {
        ok: true,
        json: async () => validManifest,
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      await registry.loadFromUrl('https://example.com/skill.json')

      expect(registry.get('test-skill')).toBeDefined()
      expect(registry.list()).toHaveLength(1)

      vi.unstubAllGlobals()
    })

    it('throws on non-HTTPS URLs', async () => {
      await expect(registry.loadFromUrl('http://example.com/skill.json')).rejects.toThrow('HTTPS')
    })

    it('throws on HTTP error responses', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      await expect(registry.loadFromUrl('https://example.com/skill.json')).rejects.toThrow('404')

      vi.unstubAllGlobals()
    })
  })

  describe('get and list', () => {
    it('get returns manifest by id', () => {
      const dir = mkdtempSync(join(tmpdir(), 'skills-'))
      writeFileSync(join(dir, 'test.skill.json'), JSON.stringify(validManifest))
      registry.loadFromDirectory(dir)

      expect(registry.get('test-skill')?.id).toBe('test-skill')
    })

    it('get returns undefined for unknown id', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })

    it('list returns all loaded manifests', () => {
      const dir = mkdtempSync(join(tmpdir(), 'skills-'))
      const manifest2 = { ...validManifest, id: 'second-skill', name: 'Second' }
      writeFileSync(join(dir, 'first.skill.json'), JSON.stringify(validManifest))
      writeFileSync(join(dir, 'second.skill.json'), JSON.stringify(manifest2))

      registry.loadFromDirectory(dir)
      expect(registry.list()).toHaveLength(2)
    })
  })
})

// -- resolveModel with classification integration --------------------------------

// Mock providers before importing registry module
vi.mock('../anthropic', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    name: 'anthropic',
    createCompletion: vi.fn(),
  })),
}))

vi.mock('../gemini', () => ({
  GeminiProvider: vi.fn().mockImplementation(() => ({
    name: 'gemini',
    createCompletion: vi.fn(),
  })),
}))

vi.mock('../openai', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({
    name: 'openai',
    createCompletion: vi.fn(),
  })),
}))

vi.mock('../config', () => ({
  loadHarnessConfig: vi.fn().mockReturnValue({
    pipelineProfile: 'balanced',
    geminiApiKey: 'test-key',
    openaiApiKey: undefined,
    localApiUrl: undefined,
  }),
}))

vi.mock('../router', () => ({
  ModelRouter: vi.fn(),
  loadRouterConfig: vi.fn().mockReturnValue({
    fallbackPolicy: 'none',
    providerChain: ['anthropic'],
    cooldownMs: 60000,
    maxRetriesPerProvider: 2,
    dbPath: ':memory:',
  }),
}))

vi.mock('../db/client', () => ({
  getHarnessDb: vi.fn().mockReturnValue({}),
}))

// Mock classifyTask so we can control its output
const mockClassifyTask = vi.fn()
vi.mock('../router/task-classifier', () => ({
  classifyTask: (...args: unknown[]) => mockClassifyTask(...args),
}))

describe('resolveModel with classification', () => {
  let resolveModel: typeof import('../registry').resolveModel
  let resetProviders: typeof import('../registry').resetProviders

  beforeEach(async () => {
    vi.clearAllMocks()
    mockClassifyTask.mockReset()
    // Dynamic import to get fresh module with mocks applied
    const mod = await import('../registry')
    resolveModel = mod.resolveModel
    resetProviders = mod.resetProviders
    resetProviders()
  })

  afterEach(() => {
    resetProviders()
  })

  it('calls classifyTask when classificationInput is provided and no explicit taskType', () => {
    mockClassifyTask.mockReturnValue({
      tier: 'frontier',
      reason: 'Complexity score 0.70 exceeds frontier threshold',
      confidence: 0.7,
      taskType: 'review',
    } satisfies TaskClassification)

    const input: ClassificationInput = {
      messageLength: 1500,
      toolCount: 2,
      conversationDepth: 3,
      hasCodeReview: true,
      isMultiFileEdit: false,
    }

    const result = resolveModel('ceo', { classificationInput: input })

    expect(mockClassifyTask).toHaveBeenCalledWith(input)
    expect(result.classification).toBeDefined()
    expect(result.classification!.tier).toBe('frontier')
    expect(result.classification!.taskType).toBe('review')
  })

  it('uses recommendedModel from classifier when available', () => {
    mockClassifyTask.mockReturnValue({
      tier: 'frontier',
      reason: 'Skill declares tier',
      confidence: 1.0,
      taskType: 'review',
      recommendedModel: 'anthropic:claude-opus-4-6',
    } satisfies TaskClassification)

    const input: ClassificationInput = {
      messageLength: 500,
      toolCount: 1,
      conversationDepth: 1,
      hasCodeReview: true,
      isMultiFileEdit: false,
      skillManifest: { id: 'review', tier: 'frontier' },
    }

    const result = resolveModel('eng', { classificationInput: input })

    expect(result.model).toBe('claude-opus-4-6')
    expect(result.providerName).toBe('anthropic')
    expect(result.classification?.recommendedModel).toBe('anthropic:claude-opus-4-6')
  })

  it('does NOT call classifyTask when explicit taskType is provided', () => {
    const result = resolveModel('ceo', { taskType: 'review' })

    expect(mockClassifyTask).not.toHaveBeenCalled()
    // Should still return a valid result via existing profile lookup
    expect(result.provider).toBeDefined()
    expect(result.model).toBeDefined()
  })

  it('does NOT call classifyTask when neither taskType nor classificationInput provided', () => {
    const result = resolveModel('ceo')

    expect(mockClassifyTask).not.toHaveBeenCalled()
    expect(result.provider).toBeDefined()
    expect(result.model).toBeDefined()
  })

  it('returns classification metadata with tier, reason, and confidence', () => {
    mockClassifyTask.mockReturnValue({
      tier: 'local',
      reason: 'Complexity score 0.20 below local threshold',
      confidence: 0.6,
      taskType: 'scaffolding',
    } satisfies TaskClassification)

    const input: ClassificationInput = {
      messageLength: 100,
      toolCount: 0,
      conversationDepth: 1,
      hasCodeReview: false,
      isMultiFileEdit: false,
    }

    const result = resolveModel('eng', { classificationInput: input })

    expect(result.classification).toBeDefined()
    expect(result.classification!.tier).toBe('local')
    expect(result.classification!.reason).toContain('local threshold')
    expect(result.classification!.confidence).toBe(0.6)
  })
})
