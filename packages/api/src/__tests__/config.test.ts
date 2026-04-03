import { describe, it, expect } from 'vitest'
import { findProjectRoot } from '../lib/config'
import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

describe('findProjectRoot', () => {
  it('returns directory containing @gstackapp/api package.json', () => {
    const root = findProjectRoot()
    const pkgPath = resolve(root, 'package.json')
    expect(existsSync(pkgPath)).toBe(true)
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    expect(pkg.name).toBe('@gstackapp/api')
  })

  it('returns a directory that is an ancestor of the lib directory', () => {
    const root = findProjectRoot()
    // The root should be the packages/api directory
    expect(root.endsWith('packages/api') || root.endsWith('packages/api/')).toBe(true)
  })
})
