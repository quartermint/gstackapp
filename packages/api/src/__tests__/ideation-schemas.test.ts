/**
 * Ideation Zod schema validation tests.
 * Tests for packages/shared/src/schemas/ideation.ts
 */

import { describe, it, expect } from 'vitest'
import {
  ideationStartSchema,
  ideationStageSchema,
  ideationStatusSchema,
  ideationArtifactSchema,
  ideationSessionResponseSchema,
  autonomousRunStatusSchema,
  decisionGateSchema,
} from '@gstackapp/shared'

describe('ideationStartSchema', () => {
  it('validates {idea: string} with non-empty string', () => {
    const result = ideationStartSchema.safeParse({ idea: 'A todo app' })
    expect(result.success).toBe(true)
  })

  it('rejects empty strings', () => {
    const result = ideationStartSchema.safeParse({ idea: '' })
    expect(result.success).toBe(false)
  })

  it('rejects strings over 5000 chars', () => {
    const result = ideationStartSchema.safeParse({ idea: 'x'.repeat(5001) })
    expect(result.success).toBe(false)
  })

  it('rejects missing idea field', () => {
    const result = ideationStartSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('ideationStageSchema', () => {
  it('validates known stage names', () => {
    const stages = ['office-hours', 'plan-ceo-review', 'plan-eng-review', 'design-consultation']
    for (const stage of stages) {
      expect(ideationStageSchema.safeParse(stage).success).toBe(true)
    }
  })

  it('rejects unknown stage names', () => {
    expect(ideationStageSchema.safeParse('unknown-stage').success).toBe(false)
  })
})

describe('ideationStatusSchema', () => {
  it('validates all status values', () => {
    const statuses = ['pending', 'running', 'stage_complete', 'complete', 'failed']
    for (const s of statuses) {
      expect(ideationStatusSchema.safeParse(s).success).toBe(true)
    }
  })
})

describe('ideationArtifactSchema', () => {
  it('validates a complete artifact', () => {
    const result = ideationArtifactSchema.safeParse({
      id: 'abc123',
      stage: 'office-hours',
      artifactPath: '/path/to/artifact.md',
      title: 'Design Doc',
      excerpt: 'First 500 chars...',
      createdAt: '2026-04-08T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('allows null title and excerpt', () => {
    const result = ideationArtifactSchema.safeParse({
      id: 'abc123',
      stage: 'plan-ceo-review',
      artifactPath: '/path/to/artifact.md',
      title: null,
      excerpt: null,
      createdAt: '2026-04-08T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })
})

describe('ideationSessionResponseSchema', () => {
  it('validates a complete session response', () => {
    const result = ideationSessionResponseSchema.safeParse({
      id: 'sess123',
      userIdea: 'Build a todo app',
      status: 'running',
      currentStage: 'office-hours',
      artifacts: [],
    })
    expect(result.success).toBe(true)
  })

  it('allows null currentStage', () => {
    const result = ideationSessionResponseSchema.safeParse({
      id: 'sess123',
      userIdea: 'Build a todo app',
      status: 'pending',
      currentStage: null,
      artifacts: [],
    })
    expect(result.success).toBe(true)
  })
})

describe('autonomousRunStatusSchema', () => {
  it('validates all status values', () => {
    const statuses = ['pending', 'running', 'complete', 'failed', 'blocked']
    for (const s of statuses) {
      expect(autonomousRunStatusSchema.safeParse(s).success).toBe(true)
    }
  })
})

describe('decisionGateSchema', () => {
  it('validates a complete decision gate', () => {
    const result = decisionGateSchema.safeParse({
      id: 'gate123',
      title: 'Database Choice',
      description: 'Choose a database',
      options: [
        { id: 'opt1', label: 'PostgreSQL' },
        { id: 'opt2', label: 'SQLite', description: 'Embedded DB' },
      ],
      blocking: true,
      response: null,
    })
    expect(result.success).toBe(true)
  })
})
