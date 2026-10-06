import { describe, expect, it } from 'vitest'
import { f1Remoteness } from './factors/f1-remoteness'
import { f3WaterColour } from './factors/f3-watercolour'
import { f5Morphometry } from './factors/f5-morphometry'
import { scorePerch } from './index'
import type { PerchInput } from './types'

const baseInput: PerchInput = {
  nearestRoadDistanceM: 2500,
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

describe('F1 — remoteness (easiest entry dominates)', () => {
  it('scores a close road low', () => {
    expect(f1Remoteness({ ...baseInput, nearestRoadDistanceM: 50 }).subScore).toBeLessThan(0.5)
  })

  it('scores a distant walk-in pond high', () => {
    expect(f1Remoteness(baseInput).subScore).toBeGreaterThan(0.8)
  })

  it('lets nearby buildings drag the score down (min over signals)', () => {
    const remote = f1Remoteness(baseInput).subScore as number
    const withBuildings = f1Remoteness({ ...baseInput, buildingsWithin100m: 3 }).subScore as number
    expect(withBuildings).toBeLessThan(remote)
    expect(withBuildings).toBeLessThan(0.4)
  })

  it('returns null when no access data exists', () => {
    const r = f1Remoteness({ ...baseInput, nearestRoadDistanceM: null, buildingsWithin100m: null })
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

  it('is a med-confidence proxy', () => {
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
