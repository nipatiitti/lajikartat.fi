import { describe, expect, it } from 'vitest'
import { combineFactors } from './composite'

describe('combineFactors — renormalisation & null drop-out', () => {
  it('excludes a null factor from the denominator (never treats it as 0)', () => {
    const r = combineFactors([
      { id: 'A', weight: 0.5, result: { subScore: 0.8, confidence: 'high' } },
      { id: 'B', weight: 0.5, result: { subScore: null, confidence: 'low' } }
    ])
    expect(r.composite).toBeCloseTo(0.8)
    expect(r.factors.B.subScore).toBeNull()
  })

  it('renormalises weights over the available factors', () => {
    const r = combineFactors([
      { id: 'A', weight: 0.3, result: { subScore: 1, confidence: 'high' } },
      { id: 'B', weight: 0.1, result: { subScore: 0, confidence: 'high' } }
    ])
    expect(r.composite).toBeCloseTo(0.75) // (0.3*1 + 0.1*0) / 0.4
  })

  it('caps confidence at med when a high-weight factor is missing', () => {
    const r = combineFactors([
      { id: 'A', weight: 0.3, result: { subScore: null, confidence: 'low' } },
      { id: 'B', weight: 0.3, result: { subScore: 0.5, confidence: 'high' } }
    ])
    expect(r.confidence).toBe('med')
  })

  it('ignores low-weight factors for overall confidence', () => {
    const r = combineFactors([
      { id: 'A', weight: 0.3, result: { subScore: 0.5, confidence: 'high' } },
      { id: 'B', weight: 0.1, result: { subScore: 0.5, confidence: 'low' } }
    ])
    expect(r.confidence).toBe('high')
  })

  it('surfaces the strongest drivers as positives and negatives', () => {
    const r = combineFactors([
      { id: 'A', weight: 0.5, result: { subScore: 0.9, confidence: 'high', drivers: ['good'] } },
      { id: 'B', weight: 0.5, result: { subScore: 0.1, confidence: 'high', drivers: ['bad'] } }
    ])
    expect(r.why.topPositives).toEqual(['good'])
    expect(r.why.topNegatives).toEqual(['bad'])
  })
})
