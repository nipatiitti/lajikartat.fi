import { describe, expect, it } from 'vitest'
import { compositeNumeric } from '../core/limiting'
import { SUBGROUP_CODES } from './factors/m2-fertility'
import { DEV_CLASS_CODES } from './factors/m3-maturity'
import { m1Core } from './factors/m1-hosts'
import { m2Core } from './factors/m2-fertility'
import { m3Core } from './factors/m3-maturity'
import { m4Core } from './factors/m4-light'
import { m6Core } from './factors/m6-edges'
import { m7Core } from './factors/m7-soil'
import { m9Core } from './factors/m9-remoteness'
import { allocGridInputs, scoreChanterelleGrid, type ChanterelleGridInputs } from './index'
import { CHANTERELLE_PARAMS } from './params'

// A prime kantarelli cell: mature mixed pine–spruce on tuore kangas, mineral
// soil, forest track at the edge, far from the paved network.
function primeCell(g: ChanterelleGridInputs, i: number) {
  g.valid[i] = 1
  g.pineShare[i] = 0.4
  g.spruceShare[i] = 0.35
  g.otherShare[i] = 0.25
  g.fertilityClass[i] = 3
  g.subgroupCode[i] = SUBGROUP_CODES.indexOf('kangas')
  g.devClassCode[i] = DEV_CLASS_CODES.indexOf('mature')
  g.meanAge[i] = 85
  g.basalArea[i] = 18
  g.nearestTrackM[i] = 30
  g.nearestDitchM[i] = 250
  g.peatFraction[i] = 0.05
  g.rockFraction[i] = 0.1
  g.nearestCarRoadM[i] = 1500
  g.buildingsWithin500m[i] = 0
}

describe('scoreChanterelleGrid', () => {
  it('reproduces the weighted geometric mean of the cores for a prime cell', () => {
    const g = allocGridInputs(1)
    primeCell(g, 0)
    const out = scoreChanterelleGrid(g, 'kantarelli')
    const p = CHANTERELLE_PARAMS.kantarelli
    const hard = [
      m1Core(0.4, 0.35, 0.25, 'kantarelli'),
      m2Core(3, 0, 'kantarelli'),
      m3Core(DEV_CLASS_CODES.indexOf('mature'), 85),
      m4Core(18, NaN, 'kantarelli'),
      -1, // TWI unknown
      m6Core(30, 250, NaN, false, 'kantarelli'),
      m7Core(0.05, 0.1, 'kantarelli')
    ]
    const weights = [p.weights.M1, p.weights.M2, p.weights.M3, p.weights.M4, p.weights.M5, p.weights.M6, p.weights.M7]
    const want = compositeNumeric(hard, weights, [m9Core(1500, 0)], [p.m9Band], false)
    expect(out.composite[0]).toBeCloseTo(want, 5)
    expect(out.composite[0]).toBeGreaterThan(0.7)
    expect(Number.isNaN(out.factors.M5[0])).toBe(true)
    expect(out.factors.V[0]).toBe(1)
    // One proxy factor missing (M5) caps confidence at med (2).
    expect(out.confidence[0]).toBe(2)
  })

  it('vetoes a seedling stand and reports the veto', () => {
    const g = allocGridInputs(1)
    primeCell(g, 0)
    g.devClassCode[0] = DEV_CLASS_CODES.indexOf('seedling')
    const out = scoreChanterelleGrid(g, 'kantarelli')
    expect(out.composite[0]).toBe(0)
    expect(out.factors.V[0]).toBe(0)
  })

  it('ranks the same cell differently per variant (spruce dark vs mixed light)', () => {
    const g = allocGridInputs(2)
    primeCell(g, 0)
    primeCell(g, 1)
    // Dark spruce cell by a ditch.
    g.pineShare[1] = 0.05
    g.spruceShare[1] = 0.85
    g.otherShare[1] = 0.1
    g.basalArea[1] = 28
    g.nearestTrackM[1] = 350
    g.nearestDitchM[1] = 15
    const k = scoreChanterelleGrid(g, 'kantarelli')
    const s = scoreChanterelleGrid(g, 'suppilovahvero')
    expect(k.composite[0]).toBeGreaterThan(s.composite[0])
    expect(s.composite[1]).toBeGreaterThan(k.composite[1])
  })

  it('leaves invalid cells as nodata and reuses a provided output buffer', () => {
    const g = allocGridInputs(3)
    primeCell(g, 0)
    primeCell(g, 2)
    const first = scoreChanterelleGrid(g, 'kantarelli')
    const out = scoreChanterelleGrid(g, 'kantarelli', first)
    expect(out).toBe(first)
    expect(Number.isNaN(out.composite[1])).toBe(true)
    expect(out.confidence[1]).toBe(0)
    expect(Number.isNaN(out.factors.M1[1])).toBe(true)
    expect(out.composite[0]).toBeCloseTo(out.composite[2], 10)
  })

  it('keeps unknown fields out of the picture without penalty', () => {
    const g = allocGridInputs(2)
    primeCell(g, 0)
    primeCell(g, 1)
    g.twi[1] = CHANTERELLE_PARAMS.kantarelli.twiAnchors.p50
    const out = scoreChanterelleGrid(g, 'kantarelli')
    expect(out.factors.M5[1]).toBeCloseTo(1, 5)
    // M5 at its optimum cannot lower the geometric mean of the others.
    expect(out.composite[1]).toBeGreaterThanOrEqual(out.composite[0] - 1e-6)
    // Every hard factor known, but M4/M5/M7 are proxies → med overall.
    expect(out.confidence[1]).toBe(2)
  })
})
