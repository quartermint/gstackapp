/**
 * Tests for cumulative context building and truncation.
 */

import { describe, it, expect } from 'vitest'
import { buildCumulativeContext, getStageDisplayName } from '../ideation/skill-bridge'

describe('buildCumulativeContext', () => {
  it('returns empty string for empty map', () => {
    const result = buildCumulativeContext(new Map())
    expect(result).toBe('')
  })

  it('formats single artifact with display name header', () => {
    const artifacts = new Map([['office-hours', 'This is the analysis output.']])
    const result = buildCumulativeContext(artifacts)

    expect(result).toContain('## Prior Ideation Context')
    expect(result).toContain('### Office Hours Output')
    expect(result).toContain('This is the analysis output.')
  })

  it('formats multiple artifacts in order', () => {
    const artifacts = new Map([
      ['office-hours', 'Office hours output.'],
      ['plan-ceo-review', 'CEO review output.'],
    ])
    const result = buildCumulativeContext(artifacts)

    expect(result).toContain('### Office Hours Output')
    expect(result).toContain('### CEO Review Output')
    // Office hours should appear before CEO review
    const ohIdx = result.indexOf('Office Hours')
    const ceoIdx = result.indexOf('CEO Review')
    expect(ohIdx).toBeLessThan(ceoIdx)
  })

  it('truncates context exceeding 32K chars', () => {
    // Create artifacts that exceed 32K chars total
    const longText = 'x'.repeat(15_000)
    const artifacts = new Map([
      ['office-hours', longText],
      ['plan-ceo-review', longText],
      ['plan-eng-review', longText],
    ])

    const result = buildCumulativeContext(artifacts)
    expect(result.length).toBeLessThanOrEqual(32_100) // small overhead for headers
    expect(result).toContain('truncated')
  })

  it('truncates at section boundary when possible', () => {
    const artifacts = new Map([
      ['office-hours', 'A'.repeat(12_000)],
      ['plan-ceo-review', 'B'.repeat(12_000)],
      ['plan-eng-review', 'C'.repeat(12_000)],
    ])

    const result = buildCumulativeContext(artifacts)
    // Should start at a ### boundary after truncation
    const contentAfterHeader = result.replace('## Prior Ideation Context (truncated)\n\n', '')
    expect(contentAfterHeader.startsWith('### ')).toBe(true)
  })
})

describe('getStageDisplayName', () => {
  it('maps known stages to display names', () => {
    expect(getStageDisplayName('office-hours')).toBe('Office Hours')
    expect(getStageDisplayName('plan-ceo-review')).toBe('CEO Review')
    expect(getStageDisplayName('plan-eng-review')).toBe('Eng Review')
    expect(getStageDisplayName('design-consultation')).toBe('Design Consultation')
  })

  it('returns raw stage name for unknown stages', () => {
    expect(getStageDisplayName('unknown')).toBe('unknown')
  })
})
