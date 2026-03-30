import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const currentFile = fileURLToPath(import.meta.url)
const currentDir = dirname(currentFile)

const STAGES = ['ceo', 'eng', 'design', 'qa', 'security'] as const
const PROMPTS_DIR = resolve(currentDir, '../pipeline/prompts')

describe('Stage prompt files', () => {
  for (const stage of STAGES) {
    describe(stage, () => {
      const promptPath = resolve(PROMPTS_DIR, `${stage}.md`)

      it('exists and is readable', () => {
        const content = readFileSync(promptPath, 'utf-8')
        expect(content.length).toBeGreaterThan(0)
      })

      it('contains JSON format instructions with verdict and findings', () => {
        const content = readFileSync(promptPath, 'utf-8')
        expect(content).toContain('"verdict"')
        expect(content).toContain('"findings"')
        expect(content).toContain('"severity"')
      })

      it('contains verdict definitions (PASS, FLAG, BLOCK)', () => {
        const content = readFileSync(promptPath, 'utf-8')
        expect(content).toContain('PASS')
        expect(content).toContain('FLAG')
        expect(content).toContain('BLOCK')
      })

      it('is substantial enough for prompt caching', () => {
        const content = readFileSync(promptPath, 'utf-8')
        const wordCount = content.split(/\s+/).length
        // Opus stages (ceo, security) need 4096+ tokens (~1500+ words)
        // Sonnet stages (eng, design, qa) need 2048+ tokens (~1000+ words)
        const minWords = (stage === 'ceo' || stage === 'security') ? 1500 : 1000
        expect(wordCount).toBeGreaterThanOrEqual(minWords)
      })
    })
  }
})
