import { describe, it, expect } from 'vitest'
import { shouldRunStage, type PrFile } from '../pipeline/filter'

function makePrFile(overrides: Partial<PrFile> = {}): PrFile {
  return {
    filename: 'file.ts',
    status: 'modified',
    additions: 10,
    deletions: 5,
    ...overrides,
  }
}

describe('shouldRunStage', () => {
  // Eng, QA, Security always fire
  it('eng always returns true', () => {
    expect(shouldRunStage('eng', [makePrFile()])).toBe(true)
  })

  it('qa always returns true', () => {
    expect(shouldRunStage('qa', [makePrFile()])).toBe(true)
  })

  it('security always returns true', () => {
    expect(shouldRunStage('security', [makePrFile()])).toBe(true)
  })

  // CEO stage filtering
  it('ceo returns false for small documentation-only PRs (no new files, no arch/dep changes)', () => {
    expect(
      shouldRunStage('ceo', [
        makePrFile({ filename: 'README.md', status: 'modified' }),
      ])
    ).toBe(false)
  })

  it('ceo returns true when new files are added', () => {
    expect(
      shouldRunStage('ceo', [
        makePrFile({ filename: 'src/new.ts', status: 'added' }),
      ])
    ).toBe(true)
  })

  it('ceo returns true for dependency changes (package.json)', () => {
    expect(
      shouldRunStage('ceo', [
        makePrFile({ filename: 'package.json', status: 'modified' }),
      ])
    ).toBe(true)
  })

  it('ceo returns true for large PRs (>500 lines)', () => {
    const files = [
      makePrFile({ additions: 300, deletions: 250 }),
    ]
    expect(shouldRunStage('ceo', files)).toBe(true)
  })

  it('ceo returns true for architecture changes', () => {
    expect(
      shouldRunStage('ceo', [
        makePrFile({ filename: 'docker-compose.yml', status: 'modified' }),
      ])
    ).toBe(true)
  })

  // Design stage filtering
  it('design returns false for non-UI files', () => {
    expect(
      shouldRunStage('design', [
        makePrFile({ filename: 'src/lib/utils.ts', status: 'modified' }),
      ])
    ).toBe(false)
  })

  it('design returns true for tsx files', () => {
    expect(
      shouldRunStage('design', [
        makePrFile({ filename: 'src/App.tsx', status: 'modified' }),
      ])
    ).toBe(true)
  })

  it('design returns true for CSS files', () => {
    expect(
      shouldRunStage('design', [
        makePrFile({ filename: 'styles/main.css', status: 'modified' }),
      ])
    ).toBe(true)
  })

  it('design returns true for component files', () => {
    expect(
      shouldRunStage('design', [
        makePrFile({ filename: 'src/components/Button.ts', status: 'modified' }),
      ])
    ).toBe(true)
  })
})
