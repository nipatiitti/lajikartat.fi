import { describe, expect, it } from 'vitest'
import { SUBGROUP_CODES } from '../../src/lib/scoring/chanterelle/factors/m2-fertility'
import { DEV_CLASS_CODES } from '../../src/lib/scoring/chanterelle/factors/m3-maturity'
import { scoreChanterelle } from '../../src/lib/scoring/chanterelle/index'
import type { ChanterelleInput, ChanterelleVariant } from '../../src/lib/scoring/chanterelle/types'
import { allocGridInputs, scoreChanterelleGrid } from '../../src/lib/scoring/chanterelle/vector'
import { CONFIDENCE_BY_RANK } from '../../src/lib/scoring/core/limiting'

// Deterministic PRNG so a failure reproduces.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomInput(rnd: () => number): ChanterelleInput {
  const maybe = <T>(v: T, p = 0.15): T | null => (rnd() < p ? null : v)
  const a = rnd()
  const b = rnd() * (1 - a)
  const sharesKnown = rnd() > 0.15
  return {
    pineShare: sharesKnown ? a : null,
    spruceShare: sharesKnown ? b : null,
    otherShare: sharesKnown ? 1 - a - b : null,
    mainTreeGroup: null, // the grid has no categorical fallback
    fertilityClass: maybe(1 + Math.floor(rnd() * 9)), // 9 → unknown class, must drop out
    subgroup: maybe(SUBGROUP_CODES[Math.floor(rnd() * 4)]),
    devClass: maybe(DEV_CLASS_CODES[Math.floor(rnd() * 7)]),
    meanAgeYears: maybe(rnd() * 140),
    basalAreaM2Ha: maybe(rnd() * 40),
    canopyCoverPct: maybe(rnd() * 100),
    twi: maybe(rnd() * 20),
    slopeDeg: null,
    aspectDeg: null,
    nearestTrackM: maybe(rnd() * 1000),
    nearestDitchM: maybe(rnd() * 1000),
    nearestStandEdgeM: maybe(rnd() * 1000),
    ditchesIntersectingCount: null,
    isDrainedPeatland: rnd() < 0.2,
    peatFraction: maybe(rnd() < 0.5 ? 0 : 1),
    rockFraction: maybe(rnd() < 0.7 ? 0 : 1),
    standSoil: null,
    occurrenceWithin1kmCount: null,
    nearestCarRoadM: maybe(rnd() * 3000),
    buildingsWithin500m: maybe(Math.floor(rnd() * 8))
  }
}

function toGrid(inputs: ChanterelleInput[]) {
  const g = allocGridInputs(inputs.length)
  const num = (v: number | null) => (v === null ? NaN : v)
  inputs.forEach((x, i) => {
    g.valid[i] = 1
    g.pineShare[i] = num(x.pineShare)
    g.spruceShare[i] = num(x.spruceShare)
    g.otherShare[i] = num(x.otherShare)
    g.fertilityClass[i] = x.fertilityClass ?? -1
    g.subgroupCode[i] = x.subgroup === null ? -1 : SUBGROUP_CODES.indexOf(x.subgroup)
    g.devClassCode[i] = x.devClass === null ? -1 : DEV_CLASS_CODES.indexOf(x.devClass)
    g.meanAge[i] = num(x.meanAgeYears)
    g.basalArea[i] = num(x.basalAreaM2Ha)
    g.canopyPct[i] = num(x.canopyCoverPct)
    g.twi[i] = num(x.twi)
    g.nearestTrackM[i] = num(x.nearestTrackM)
    g.nearestDitchM[i] = num(x.nearestDitchM)
    g.nearestStandEdgeM[i] = num(x.nearestStandEdgeM)
    g.drained[i] = x.isDrainedPeatland ? 1 : 0
    g.peatFraction[i] = num(x.peatFraction)
    g.rockFraction[i] = num(x.rockFraction)
    g.nearestCarRoadM[i] = num(x.nearestCarRoadM)
    g.buildingsWithin500m[i] = num(x.buildingsWithin500m)
  })
  return g
}

describe('scoreChanterelleGrid == scoreChanterelle', () => {
  const rnd = mulberry32(20260911)
  const inputs = Array.from({ length: 2000 }, () => randomInput(rnd))
  const variants: ChanterelleVariant[] = ['kantarelli', 'suppilovahvero']

  for (const variant of variants) {
    it(`matches composite, factors and confidence for ${variant}`, () => {
      const grid = scoreChanterelleGrid(toGrid(inputs), variant)
      inputs.forEach((x, i) => {
        const ref = scoreChanterelle(x, variant)
        expect(grid.composite[i], `composite #${i}`).toBeCloseTo(ref.composite, 5)
        expect(CONFIDENCE_BY_RANK[grid.confidence[i] - 1], `confidence #${i}`).toBe(ref.confidence)
        for (const id of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M9', 'V'] as const) {
          const want = ref.factors[id].subScore
          const got = grid.factors[id][i]
          if (want === null) expect(Number.isNaN(got), `${id} #${i} should be NaN`).toBe(true)
          else expect(got, `${id} #${i}`).toBeCloseTo(want, 5)
        }
      })
    })
  }

  it('leaves invalid cells as nodata', () => {
    const g = toGrid(inputs.slice(0, 3))
    g.valid[1] = 0
    const out = scoreChanterelleGrid(g, 'kantarelli')
    expect(Number.isNaN(out.composite[1])).toBe(true)
    expect(out.confidence[1]).toBe(0)
    expect(Number.isNaN(out.factors.M1[1])).toBe(true)
    expect(Number.isNaN(out.composite[0])).toBe(false)
  })
})
