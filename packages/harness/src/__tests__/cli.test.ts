import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

describe('CLI', () => {
  const binPath = resolve(import.meta.dirname, '../../bin/harness')

  it('--help prints usage', () => {
    const output = execSync(`${binPath} --help`, { encoding: 'utf-8' })
    expect(output).toContain('@gstackapp/harness')
    expect(output).toContain('providers')
    expect(output).toContain('test')
  })

  it('providers lists provider status', () => {
    const output = execSync(`${binPath} providers`, { encoding: 'utf-8' })
    expect(output).toContain('anthropic')
    expect(output).toContain('gemini')
  })
})
