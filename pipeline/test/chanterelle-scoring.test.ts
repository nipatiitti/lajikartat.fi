import { describe, expect, it } from 'vitest'
import { m1Hosts } from '../../src/lib/scoring/chanterelle/factors/m1-hosts'
import { m4Light } from '../../src/lib/scoring/chanterelle/factors/m4-light'
import { m6Edges } from '../../src/lib/scoring/chanterelle/factors/m6-edges'
import { scoreChanterelle } from '../../src/lib/scoring/chanterelle/index'
import type { ChanterelleInput } from '../../src/lib/scoring/chanterelle/types'
import { combineLimiting } from '../../src/lib/scoring/core/limiting'

// A prime kantarelli stand: mature mixed pine–spruce on tuore kangas, mineral
// soil, forest track at the edge, far from the paved network.
const baseInput: ChanterelleInput = {
  pineShare: 0.4,
  spruceShare: 0.35,
  otherShare: 0.25,
  mainTreeGroup: 'pine',
  fertilityClass: 3,
  subgroup: 'kangas',
  devClass: 'mature',
  meanAgeYears: 85,
  basalAreaM2Ha: 18,
  twi: null,
  slopeDeg: null,
  aspectDeg: null,
  nearestTrackM: 30,
  nearestDitchM: 250,
  ditchesIntersectingCount: 0,
  isDrainedPeatland: false,
  peatFraction: 0.05,
  rockFraction: 0.1,
  standSoil: 'mineral',
  occurrenceWithin1kmCount: null,
  nearestCarRoadM: 1500,
  buildingsWithin500m: 0
}

describe('combineLimiting — exponent weights', () => {
  it('reproduces the unweighted mean when all weights are equal', () => {
    const factors = [
      { id: 'A', result: { subScore: 0.8, confidence: 'high' as const } },
      { id: 'B', result: { subScore: 0.5, confidence: 'high' as const } }
    ]
    const unweighted = combineLimiting(factors)
    const weighted = combineLimiting(factors.map((f) => ({ ...f, weight: 2 })))
    expect(weighted.composite).toBeCloseTo(unweighted.composite, 12)
  })

  it('shifts the mean toward the heavier factor', () => {
    const even = combineLimiting([
      { id: 'A', weight: 1, result: { subScore: 0.9, confidence: 'high' } },
      { id: 'B', weight: 1, result: { subScore: 0.3, confidence: 'high' } }
    ])
    const heavyGood = combineLimiting([
      { id: 'A', weight: 3, result: { subScore: 0.9, confidence: 'high' } },
      { id: 'B', weight: 1, result: { subScore: 0.3, confidence: 'high' } }
    ])
    expect(heavyGood.composite).toBeGreaterThan(even.composite)
    // Exact: 0.9^(3/4) · 0.3^(1/4)
    expect(heavyGood.composite).toBeCloseTo(Math.pow(0.9, 0.75) * Math.pow(0.3, 0.25), 12)
  })

  it('drops a null factor’s weight from the exponent sum', () => {
    const r = combineLimiting([
      { id: 'A', weight: 1, result: { subScore: 0.64, confidence: 'high' } },
      { id: 'B', weight: 9, result: { subScore: null, confidence: 'low' } }
    ])
    expect(r.composite).toBeCloseTo(0.64, 12)
  })

  it('reports renormalised exponents as why-weights', () => {
    const r = combineLimiting([
      { id: 'A', weight: 3, result: { subScore: 0.9, confidence: 'high' } },
      { id: 'B', weight: 1, result: { subScore: 0.3, confidence: 'high' } }
    ])
    const weights = Object.fromEntries(r.why.factors.map((f) => [f.id, f.weight]))
    expect(weights.A).toBeCloseTo(0.75, 12)
    expect(weights.B).toBeCloseTo(0.25, 12)
  })
})

describe('combineLimiting — vetoes', () => {
  const hard = [{ id: 'A', result: { subScore: 0.9, confidence: 'high' as const } }]

  it('forces composite to 0 and surfaces the reason when fired', () => {
    const r = combineLimiting(hard, [], {
      vetoes: [{ id: 'V', result: { subScore: 0, confidence: 'high', drivers: ['fresh clearcut'] } }]
    })
    expect(r.composite).toBe(0)
    expect(r.why.topNegatives).toContain('fresh clearcut')
    expect(r.factors.V.subScore).toBe(0)
  })

  it('changes nothing when passing or unknown', () => {
    const pass = combineLimiting(hard, [], { vetoes: [{ id: 'V', result: { subScore: 1, confidence: 'high' } }] })
    const unknown = combineLimiting(hard, [], {
      vetoes: [{ id: 'V', result: { subScore: null, confidence: 'low' } }]
    })
    expect(pass.composite).toBeCloseTo(0.9, 12)
    expect(unknown.composite).toBeCloseTo(0.9, 12)
  })
})

describe('M1 — host trees & mix', () => {
  it('[K] rewards a mixed stand over a monoculture', () => {
    const mixed = m1Hosts(baseInput, 'kantarelli').subScore as number
    const mono = m1Hosts({ ...baseInput, pineShare: 0.95, spruceShare: 0.03, otherShare: 0.02 }, 'kantarelli')
      .subScore as number
    expect(mixed).toBeGreaterThan(mono)
    expect(mono).toBeGreaterThan(0.4) // monoculture penalised, not vetoed
  })

  it('[S] tracks spruce share and collapses in pure deciduous', () => {
    const sprucey = m1Hosts({ ...baseInput, pineShare: 0.1, spruceShare: 0.7, otherShare: 0.2 }, 'suppilovahvero')
    const deciduous = m1Hosts({ ...baseInput, pineShare: 0.02, spruceShare: 0.03, otherShare: 0.95 }, 'suppilovahvero')
    expect(sprucey.subScore as number).toBeGreaterThan(0.9)
    expect(deciduous.subScore as number).toBeLessThanOrEqual(0.1)
  })

  it('falls back to main tree species at med confidence', () => {
    const r = m1Hosts(
      { ...baseInput, pineShare: null, spruceShare: null, otherShare: null, mainTreeGroup: 'spruce' },
      'suppilovahvero'
    )
    expect(r.subScore).toBeCloseTo(0.85)
    expect(r.confidence).toBe('med')
  })
})

describe('M4 — canopy/light is species-flipped', () => {
  it('dense canopy favours [S], semi-open favours [K]', () => {
    const dense = { ...baseInput, basalAreaM2Ha: 30 }
    const semiOpen = { ...baseInput, basalAreaM2Ha: 18 }
    expect(m4Light(dense, 'suppilovahvero').subScore as number).toBeGreaterThan(
      m4Light(dense, 'kantarelli').subScore as number
    )
    expect(m4Light(semiOpen, 'kantarelli').subScore as number).toBeGreaterThan(
      m4Light(dense, 'kantarelli').subScore as number
    )
  })
})

describe('M6 — edge & disturbance proximity', () => {
  it('scores a stand hugging a forest track high', () => {
    expect(m6Edges(baseInput, 'kantarelli').subScore as number).toBeGreaterThan(0.9)
  })

  it('floors the deep interior instead of zeroing it', () => {
    const interior = m6Edges(
      { ...baseInput, nearestTrackM: 900, nearestDitchM: 900, ditchesIntersectingCount: 0 },
      'kantarelli'
    )
    expect(interior.subScore).toBeCloseTo(0.15, 5)
  })

  it('weights ditches above tracks for [S]', () => {
    const ditchy = { ...baseInput, nearestTrackM: 900, nearestDitchM: 20, ditchesIntersectingCount: 2 }
    expect(m6Edges(ditchy, 'suppilovahvero').subScore as number).toBeGreaterThan(
      m6Edges(ditchy, 'kantarelli').subScore as number
    )
  })
})

describe('scoreChanterelle — end to end', () => {
  it('ranks an ideal kantarelli stand highly', () => {
    const r = scoreChanterelle(baseInput, 'kantarelli')
    expect(r.composite).toBeGreaterThan(0.7)
    expect(r.why.topPositives.length).toBeGreaterThan(0)
    expect(r.why.notes.length).toBeGreaterThan(0)
  })

  it('vetoes the same stand as a seedling stand, with the reason surfaced', () => {
    const r = scoreChanterelle({ ...baseInput, devClass: 'seedling' }, 'kantarelli')
    expect(r.composite).toBe(0)
    expect(r.why.topNegatives.join(' ')).toMatch(/taimikko|seedling/i)
  })

  it('ranks the same input differently per variant (spruce dark vs mixed light)', () => {
    const darkSpruce: ChanterelleInput = {
      ...baseInput,
      pineShare: 0.05,
      spruceShare: 0.85,
      otherShare: 0.1,
      basalAreaM2Ha: 28,
      nearestTrackM: 350,
      nearestDitchM: 15,
      ditchesIntersectingCount: 1
    }
    const s = scoreChanterelle(darkSpruce, 'suppilovahvero')
    const k = scoreChanterelle(darkSpruce, 'kantarelli')
    expect(s.composite).toBeGreaterThan(k.composite)
    // And the flip: the mixed, semi-open, track-side base stand favours [K].
    expect(scoreChanterelle(baseInput, 'kantarelli').composite).toBeGreaterThan(
      scoreChanterelle(baseInput, 'suppilovahvero').composite
    )
  })

  it('keeps deferred factors (M5/M8) out of the picture without penalty', () => {
    const r = scoreChanterelle(baseInput, 'kantarelli')
    expect(r.factors.M5).toBeUndefined()
    expect(r.factors.M8).toBeUndefined()
  })
})
