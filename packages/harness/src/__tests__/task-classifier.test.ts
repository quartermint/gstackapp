import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock node:fs for capability-matrix tests
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    existsSync: (...args: any[]) => mockExistsSync(...args),
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
    writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
  }
})

import { classifyTask, computeComplexityScore } from '../router/task-classifier'
import { loadMatrix, saveMatrix, getRecommendedModel } from '../router/capability-matrix'
import type { ClassificationInput, TaskTier } from '../types'
import type { CapabilityMatrix, CapabilityEntry } from '../router/capability-matrix'

describe('TaskClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no matrix file exists
    mockExistsSync.mockReturnValue(false)
  })

  // Test 1: classifyTask returns skill manifest tier when manifest.tier is declared (confidence 1.0)
  it('returns skill manifest tier when manifest.tier is declared', () => {
    const input: ClassificationInput = {
      messageLength: 100,
      toolCount: 0,
      conversationDepth: 1,
      hasCodeReview: false,
      isMultiFileEdit: false,
      skillManifest: { id: 'review', tier: 'frontier' },
    }

    const result = classifyTask(input)
    expect(result.tier).toBe('frontier')
    expect(result.confidence).toBe(1.0)
    expect(result.taskType).toBe('review')
    expect(result.reason).toContain('review')
    expect(result.reason).toContain('tier')
  })

  // Test 2: classifyTask returns 'frontier' for high-complexity conversation
  it('returns frontier for high-complexity conversation', () => {
    const input: ClassificationInput = {
      messageLength: 3000,   // long
      toolCount: 5,          // many tools
      conversationDepth: 15, // deep
      hasCodeReview: true,   // code review flag
      isMultiFileEdit: false,
    }

    const result = classifyTask(input)
    expect(result.tier).toBe('frontier')
  })

  // Test 3: classifyTask returns 'local' for low-complexity conversation
  it('returns local for low-complexity conversation', () => {
    const input: ClassificationInput = {
      messageLength: 50,    // short
      toolCount: 0,         // no tools
      conversationDepth: 1, // shallow
      hasCodeReview: false,
      isMultiFileEdit: false,
    }

    const result = classifyTask(input)
    expect(result.tier).toBe('local')
  })

  // Test 4: classifyTask returns 'sandbox' when isMultiFileEdit is true
  it('returns sandbox when isMultiFileEdit is true', () => {
    const input: ClassificationInput = {
      messageLength: 200,
      toolCount: 2,
      conversationDepth: 3,
      hasCodeReview: false,
      isMultiFileEdit: true,
    }

    const result = classifyTask(input)
    expect(result.tier).toBe('sandbox')
    expect(result.reason).toContain('Multi-file edit')
  })

  // Test 5: classifyTask returns reason string explaining classification decision
  it('returns reason string explaining classification decision', () => {
    const input: ClassificationInput = {
      messageLength: 1000,
      toolCount: 3,
      conversationDepth: 5,
      hasCodeReview: false,
      isMultiFileEdit: false,
    }

    const result = classifyTask(input)
    expect(typeof result.reason).toBe('string')
    expect(result.reason.length).toBeGreaterThan(0)
    // Reason should mention the score or threshold
    expect(result.reason).toMatch(/score|threshold|tier|declares/)
  })

  // Test 6: classifyTask with capability matrix consulted
  it('returns matrix-recommended model when matrix has entry for taskType', () => {
    const matrix: CapabilityMatrix = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      entries: [
        {
          taskType: 'review',
          model: 'anthropic:claude-opus-4-6',
          qualityScore: 0.95,
          latencyMs: 2000,
          costPerMToken: 15,
          recommended: true,
          sampleSize: 10,
        },
      ],
    }

    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(matrix))

    const input: ClassificationInput = {
      messageLength: 100,
      toolCount: 0,
      conversationDepth: 1,
      hasCodeReview: false,
      isMultiFileEdit: false,
      skillManifest: { id: 'review', tier: 'frontier' },
    }

    const result = classifyTask(input)
    expect(result.recommendedModel).toBe('anthropic:claude-opus-4-6')
  })

  // Test 7: computeComplexityScore weights
  it('computeComplexityScore weights message length (0.2), tool count (0.3), conversation depth (0.2), code review flag (0.3)', () => {
    // All max values
    const maxScore = computeComplexityScore({
      messageLength: 2000, // 2000/2000 * 0.2 = 0.2
      toolCount: 5,        // 5/5 * 0.3 = 0.3
      conversationDepth: 10, // 10/10 * 0.2 = 0.2
      hasCodeReview: true,   // 1.0 * 0.3 = 0.3
      isMultiFileEdit: false,
    })
    expect(maxScore).toBeCloseTo(1.0, 2)

    // All min values
    const minScore = computeComplexityScore({
      messageLength: 0,
      toolCount: 0,
      conversationDepth: 0,
      hasCodeReview: false,
      isMultiFileEdit: false,
    })
    expect(minScore).toBeCloseTo(0.0, 2)

    // Only message length at max
    const msgOnly = computeComplexityScore({
      messageLength: 2000,
      toolCount: 0,
      conversationDepth: 0,
      hasCodeReview: false,
      isMultiFileEdit: false,
    })
    expect(msgOnly).toBeCloseTo(0.2, 2)

    // Only tools at max
    const toolsOnly = computeComplexityScore({
      messageLength: 0,
      toolCount: 5,
      conversationDepth: 0,
      hasCodeReview: false,
      isMultiFileEdit: false,
    })
    expect(toolsOnly).toBeCloseTo(0.3, 2)
  })
})

describe('CapabilityMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 8: getRecommendedModel returns highest qualityScore model
  it('getRecommendedModel returns highest qualityScore model that is recommended for given taskType', () => {
    const matrix: CapabilityMatrix = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      entries: [
        { taskType: 'review', model: 'model-a', qualityScore: 0.8, latencyMs: 1000, costPerMToken: 10, recommended: true, sampleSize: 5 },
        { taskType: 'review', model: 'model-b', qualityScore: 0.95, latencyMs: 2000, costPerMToken: 15, recommended: true, sampleSize: 5 },
        { taskType: 'review', model: 'model-c', qualityScore: 0.9, latencyMs: 500, costPerMToken: 5, recommended: false, sampleSize: 5 },
      ],
    }

    const result = getRecommendedModel('review', matrix)
    expect(result).toBe('model-b') // highest qualityScore among recommended
  })

  // Test 9: getRecommendedModel returns null when no entries
  it('getRecommendedModel returns null when no matrix entries exist for taskType', () => {
    const matrix: CapabilityMatrix = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      entries: [
        { taskType: 'scaffolding', model: 'model-a', qualityScore: 0.8, latencyMs: 1000, costPerMToken: 10, recommended: true, sampleSize: 5 },
      ],
    }

    const result = getRecommendedModel('review', matrix)
    expect(result).toBeNull()
  })

  // Test 10: loadMatrix/saveMatrix round-trip
  it('loadMatrix/saveMatrix round-trip preserves capability entries as JSON file', () => {
    const matrix: CapabilityMatrix = {
      version: '1.0',
      lastUpdated: '2026-01-01T00:00:00Z',
      entries: [
        { taskType: 'review', model: 'model-a', qualityScore: 0.8, latencyMs: 1000, costPerMToken: 10, recommended: true, sampleSize: 5 },
      ],
    }

    // Save
    saveMatrix(matrix, '/tmp/test-matrix.json')
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/tmp/test-matrix.json',
      expect.any(String),
    )

    // Load (return what was saved)
    const savedJson = mockWriteFileSync.mock.calls[0][1]
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(savedJson)

    const loaded = loadMatrix('/tmp/test-matrix.json')
    expect(loaded.version).toBe('1.0')
    expect(loaded.entries).toHaveLength(1)
    expect(loaded.entries[0].taskType).toBe('review')
    expect(loaded.entries[0].model).toBe('model-a')
    expect(loaded.entries[0].qualityScore).toBe(0.8)
  })

  it('loadMatrix returns empty matrix when file does not exist', () => {
    mockExistsSync.mockReturnValue(false)

    const matrix = loadMatrix('/tmp/nonexistent.json')
    expect(matrix.version).toBe('1.0')
    expect(matrix.entries).toEqual([])
  })
})
