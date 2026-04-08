import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SkillRegistry } from '../skills/registry'

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
