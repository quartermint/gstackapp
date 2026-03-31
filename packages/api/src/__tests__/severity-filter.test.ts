import { describe, it, expect } from 'vitest'
import type { Finding } from '@gstackapp/shared'
import { FeedbackVoteSchema, FeedbackSubmissionSchema } from '@gstackapp/shared'
import {
  groupFindingsBySeverity,
  calculateSignalRatio,
  formatSignalRatio,
} from '../lib/severity-filter'

// ── Test Fixtures ──────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> & { severity: Finding['severity'] }): Finding {
  return {
    category: 'test',
    title: 'Test finding',
    description: 'Test description',
    ...overrides,
  }
}

// ── groupFindingsBySeverity ────────────────────────────────────────────────

describe('groupFindingsBySeverity', () => {
  it('returns all empty arrays for empty input', () => {
    const result = groupFindingsBySeverity([])
    expect(result).toEqual({ critical: [], notable: [], minor: [] })
  })

  it('groups single-severity findings correctly', () => {
    const criticals = [
      makeFinding({ severity: 'critical', title: 'Crit 1' }),
      makeFinding({ severity: 'critical', title: 'Crit 2' }),
    ]
    const result = groupFindingsBySeverity(criticals)
    expect(result.critical).toHaveLength(2)
    expect(result.notable).toHaveLength(0)
    expect(result.minor).toHaveLength(0)
  })

  it('correctly separates mixed-severity findings', () => {
    const mixed = [
      makeFinding({ severity: 'critical', title: 'Crit' }),
      makeFinding({ severity: 'minor', title: 'Minor 1' }),
      makeFinding({ severity: 'notable', title: 'Notable' }),
      makeFinding({ severity: 'minor', title: 'Minor 2' }),
    ]
    const result = groupFindingsBySeverity(mixed)
    expect(result.critical).toHaveLength(1)
    expect(result.notable).toHaveLength(1)
    expect(result.minor).toHaveLength(2)
  })
})

// ── calculateSignalRatio ───────────────────────────────────────────────────

describe('calculateSignalRatio', () => {
  it('returns 1.0 for empty findings array', () => {
    expect(calculateSignalRatio([])).toBe(1.0)
  })

  it('returns 1.0 when all findings are critical', () => {
    const findings = [
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'critical' }),
    ]
    expect(calculateSignalRatio(findings)).toBe(1.0)
  })

  it('returns 0.0 when all findings are minor', () => {
    const findings = [
      makeFinding({ severity: 'minor' }),
      makeFinding({ severity: 'minor' }),
    ]
    expect(calculateSignalRatio(findings)).toBe(0.0)
  })

  it('returns correct ratio for mixed findings', () => {
    const findings = [
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'minor' }),
      makeFinding({ severity: 'minor' }),
    ]
    // 1 critical / 3 total = 0.333...
    expect(calculateSignalRatio(findings)).toBeCloseTo(1 / 3, 5)
  })

  it('counts notable as actionable', () => {
    const findings = [
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'notable' }),
      makeFinding({ severity: 'minor' }),
      makeFinding({ severity: 'minor' }),
    ]
    // 2 actionable / 4 total = 0.5
    expect(calculateSignalRatio(findings)).toBe(0.5)
  })
})

// ── formatSignalRatio ──────────────────────────────────────────────────────

describe('formatSignalRatio', () => {
  it('produces correct string for mixed findings', () => {
    const findings = [
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'notable' }),
      makeFinding({ severity: 'minor' }),
      makeFinding({ severity: 'minor' }),
      makeFinding({ severity: 'minor' }),
    ]
    // 2 actionable / 5 total = 40%
    expect(formatSignalRatio(findings)).toBe('2/5 findings actionable (40%)')
  })

  it('handles all-actionable findings', () => {
    const findings = [
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'notable' }),
    ]
    expect(formatSignalRatio(findings)).toBe('2/2 findings actionable (100%)')
  })

  it('handles empty findings', () => {
    expect(formatSignalRatio([])).toBe('0/0 findings actionable (100%)')
  })
})

// ── Feedback Schemas ───────────────────────────────────────────────────────

describe('FeedbackVoteSchema', () => {
  it('validates "up"', () => {
    expect(FeedbackVoteSchema.parse('up')).toBe('up')
  })

  it('validates "down"', () => {
    expect(FeedbackVoteSchema.parse('down')).toBe('down')
  })

  it('rejects invalid values', () => {
    expect(() => FeedbackVoteSchema.parse('neutral')).toThrow()
    expect(() => FeedbackVoteSchema.parse('')).toThrow()
    expect(() => FeedbackVoteSchema.parse(123)).toThrow()
  })
})

describe('FeedbackSubmissionSchema', () => {
  it('validates complete submission', () => {
    const result = FeedbackSubmissionSchema.parse({
      findingId: 'abc123',
      vote: 'up',
      note: 'Great finding!',
    })
    expect(result.findingId).toBe('abc123')
    expect(result.vote).toBe('up')
    expect(result.note).toBe('Great finding!')
  })

  it('validates submission without optional note', () => {
    const result = FeedbackSubmissionSchema.parse({
      findingId: 'abc123',
      vote: 'down',
    })
    expect(result.findingId).toBe('abc123')
    expect(result.vote).toBe('down')
    expect(result.note).toBeUndefined()
  })

  it('rejects invalid vote', () => {
    expect(() =>
      FeedbackSubmissionSchema.parse({
        findingId: 'abc123',
        vote: 'neutral',
      })
    ).toThrow()
  })

  it('rejects missing findingId', () => {
    expect(() =>
      FeedbackSubmissionSchema.parse({
        vote: 'up',
      })
    ).toThrow()
  })
})
