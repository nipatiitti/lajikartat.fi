import { describe, expect, it } from 'vitest'
import { combineFactors } from '../../src/lib/scoring/core/composite'
import { f1Remoteness } from '../../src/lib/scoring/perch/factors/f1-remoteness'
import { f3WaterColour } from '../../src/lib/scoring/perch/factors/f3-watercolour'
import { f5Morphometry } from '../../src/lib/scoring/perch/factors/f5-morphometry'
import { scorePerch } from '../../src/lib/scoring/perch/index'
import type { PerchInput } from '../../src/lib/scoring/perch/types'

const baseInput: PerchInput = {
  nearestRoadDistanceM: 2500,
  accessType: 'none',
  buildingsWithin100m: 0,
  isNamed: false,
  connectingStreamCount: 0,
  isHeadwater: null,
  peatFraction: 0.1,
  eskerFraction: 0.3,
  areaHa: 5,
  shorelineDevelopment: 1.5,
  maxDepthM: null
}

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
})

describe('F1 — remoteness (easiest entry dominates)', () => {
  it('scores a close paved road low', () => {
    const r = f1Remoteness({ ...baseInput, nearestRoadDistanceM: 50, accessType: 'paved' })
    expect(r.subScore).toBeLessThan(0.4)
  })

  it('scores a distant walk-in pond high', () => {
    const r = f1Remoteness(baseInput)
    expect(r.subScore).toBeGreaterThan(0.8)
  })

  it('lets nearby buildings drag the score down (min over signals)', () => {
    const remote = f1Remoteness(baseInput).subScore as number
    const withBuildings = f1Remoteness({ ...baseInput, buildingsWithin100m: 3 }).subScore as number
    expect(withBuildings).toBeLessThan(remote)
    expect(withBuildings).toBeLessThan(0.4)
  })

  it('returns null when no access data exists', () => {
    const r = f1Remoteness({ ...baseInput, nearestRoadDistanceM: null, accessType: null, buildingsWithin100m: null })
    expect(r.subScore).toBeNull()
  })
})

describe('F3 — water colour (browner = worse)', () => {
  it('inverts in peat fraction', () => {
    const clear = f3WaterColour({ ...baseInput, peatFraction: 0.05 }).subScore as number
    const brown = f3WaterColour({ ...baseInput, peatFraction: 0.9, eskerFraction: 0 }).subScore as number
    expect(clear).toBeGreaterThan(brown)
    expect(brown).toBeLessThan(0.3)
  })

  it('is a med-confidence proxy at v1', () => {
    expect(f3WaterColour(baseInput).confidence).toBe('med')
  })
})

describe('F5 — morphometry banding', () => {
  it('rewards the target size band and zeroes oversized waters', () => {
    expect(f5Morphometry({ ...baseInput, areaHa: 5 }).subScore as number).toBeGreaterThan(0.7)
    expect(f5Morphometry({ ...baseInput, areaHa: 120 }).subScore).toBe(0)
  })

  it('tapers between 20 and 50 ha', () => {
    const mid = f5Morphometry({ ...baseInput, areaHa: 35, shorelineDevelopment: null }).subScore as number
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })
})

describe('scorePerch — end to end', () => {
  it('ranks an ideal pond highly with med confidence (F3 proxy)', () => {
    const r = scorePerch(baseInput)
    expect(r.composite).toBeGreaterThan(0.75)
    expect(r.confidence).toBe('med')
    expect(r.why.topPositives.length).toBeGreaterThan(0)
  })

  it('ranks a roadside named lake far lower', () => {
    const bad = scorePerch({
      ...baseInput,
      nearestRoadDistanceM: 20,
      accessType: 'paved',
      buildingsWithin100m: 4,
      isNamed: true,
      connectingStreamCount: 3,
      peatFraction: 0.85,
      eskerFraction: 0
    })
    expect(bad.composite).toBeLessThan(scorePerch(baseInput).composite)
    expect(bad.composite).toBeLessThan(0.4)
  })
})
