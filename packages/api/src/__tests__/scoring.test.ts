import { describe, it, expect } from 'vitest'
import { calculateQualityScore, SEVERITY_WEIGHTS } from '../lib/scoring'

describe('SEVERITY_WEIGHTS', () => {
  it('assigns weight 3 to critical', () => {
    expect(SEVERITY_WEIGHTS.critical).toBe(3)
  })

  it('assigns weight 1 to notable', () => {
    expect(SEVERITY_WEIGHTS.notable).toBe(1)
  })

  it('assigns weight 0 to minor per D-05', () => {
    expect(SEVERITY_WEIGHTS.minor).toBe(0)
  })
})

describe('calculateQualityScore', () => {
  it('returns 100 for no findings (perfect score)', () => {
    expect(calculateQualityScore({ critical: 0, notable: 0, minor: 0 })).toBe(100)
  })

  it('returns 70 for 1 critical finding', () => {
    // weighted_sum = 1*3 = 3, norm = max(10, 1) = 10, score = 100 - (3/10)*100 = 70
    expect(calculateQualityScore({ critical: 1, notable: 0, minor: 0 })).toBe(70)
  })

  it('returns 50 for 5 notable + 3 minor findings', () => {
    // weighted_sum = 5*1 + 3*0 = 5, norm = max(10, 8) = 10, score = 100 - (5/10)*100 = 50
    expect(calculateQualityScore({ critical: 0, notable: 5, minor: 3 })).toBe(50)
  })

  it('clamps to 0 when score would be negative', () => {
    // weighted_sum = 10*3 + 5*1 = 35, norm = max(10, 15) = 15, pct = 35/15 = 233%
    // score = 100 - 233 = -133 -> clamped to 0
    expect(calculateQualityScore({ critical: 10, notable: 5, minor: 0 })).toBe(0)
  })

  it('minor findings have 0 weight', () => {
    // 100 minor findings should still yield 100 (all weight 0)
    expect(calculateQualityScore({ critical: 0, notable: 0, minor: 100 })).toBe(100)
  })

  it('uses normalization factor max(10, total_findings)', () => {
    // 20 notable findings: weighted_sum = 20, norm = max(10, 20) = 20, score = 100 - (20/20)*100 = 0
    expect(calculateQualityScore({ critical: 0, notable: 20, minor: 0 })).toBe(0)
  })

  it('rounds to integer', () => {
    // 2 critical + 1 notable: weighted_sum = 7, norm = max(10, 3) = 10, score = 100 - 70 = 30
    expect(calculateQualityScore({ critical: 2, notable: 1, minor: 0 })).toBe(30)
  })

  it('handles mixed severity correctly', () => {
    // 1 critical + 2 notable + 5 minor: weighted_sum = 3 + 2 = 5, norm = max(10, 8) = 10
    // score = 100 - (5/10)*100 = 50
    expect(calculateQualityScore({ critical: 1, notable: 2, minor: 5 })).toBe(50)
  })
})
