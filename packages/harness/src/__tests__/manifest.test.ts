import { describe, it, expect } from 'vitest'
import { SkillManifestSchema } from '../skills/manifest'
import { ZodError } from 'zod'

const validManifest = {
  id: 'test-skill',
  name: 'Test Skill',
  version: '1.0.0',
  tools: ['Read', 'Bash'],
  prompt: 'You are a test skill.',
  outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
}

describe('SkillManifestSchema', () => {
  it('parses a valid manifest with required fields', () => {
    const result = SkillManifestSchema.parse(validManifest)
    expect(result.id).toBe('test-skill')
    expect(result.name).toBe('Test Skill')
    expect(result.version).toBe('1.0.0')
    expect(result.tools).toEqual(['Read', 'Bash'])
    expect(result.prompt).toBe('You are a test skill.')
    expect(result.outputSchema).toEqual(validManifest.outputSchema)
  })

  it('parses a valid manifest with optional fields', () => {
    const full = {
      ...validManifest,
      minimumModel: 'sonnet',
      capabilities: ['tool_use', 'vision'],
      description: 'A test skill for testing',
      author: 'test-author',
      license: 'MIT',
    }
    const result = SkillManifestSchema.parse(full)
    expect(result.minimumModel).toBe('sonnet')
    expect(result.capabilities).toEqual(['tool_use', 'vision'])
    expect(result.description).toBe('A test skill for testing')
    expect(result.author).toBe('test-author')
    expect(result.license).toBe('MIT')
  })

  it('rejects empty object (missing required fields)', () => {
    expect(() => SkillManifestSchema.parse({})).toThrow(ZodError)
  })

  it('rejects invalid semver version', () => {
    expect(() => SkillManifestSchema.parse({ ...validManifest, version: 'bad' })).toThrow(ZodError)
  })

  it('rejects empty tools array (min 1 tool)', () => {
    expect(() => SkillManifestSchema.parse({ ...validManifest, tools: [] })).toThrow(ZodError)
  })

  it('rejects invalid tool names', () => {
    expect(() => SkillManifestSchema.parse({ ...validManifest, tools: ['InvalidTool'] })).toThrow(ZodError)
  })
})
