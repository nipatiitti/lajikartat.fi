import { describe, expect, it } from 'vitest'
import { compositeNumeric, confidenceNumeric } from './limiting'

const BAND: [number, number] = [0.7, 1.3]

describe('compositeNumeric — weighted geometric mean with modulators and vetoes', () => {
  it('takes the even geometric mean of the hard filters', () => {
    expect(compositeNumeric([0.8, 0.5], [1, 1], [], [], false)).toBeCloseTo(Math.sqrt(0.4), 10)
  })

  it('is invariant to scaling all weights', () => {
    expect(compositeNumeric([0.8, 0.5], [2, 2], [], [], false)).toBeCloseTo(
      compositeNumeric([0.8, 0.5], [1, 1], [], [], false),
      12
    )
  })

  it('shifts the mean toward the heavier factor', () => {
    const even = compositeNumeric([0.9, 0.3], [1, 1], [], [], false)
    const heavyLow = compositeNumeric([0.9, 0.3], [1, 3], [], [], false)
    const heavyHigh = compositeNumeric([0.9, 0.3], [3, 1], [], [], false)
    expect(heavyLow).toBeLessThan(even)
    expect(heavyHigh).toBeGreaterThan(even)
  })

  it('lets any ~0 hard filter veto the site', () => {
    expect(compositeNumeric([0.9, 0], [1, 1], [], [], false)).toBe(0)
  })

  it('drops unknown (negative / NaN) hard filters from the exponent sum', () => {
    expect(compositeNumeric([0.8, -1], [1, 1], [], [], false)).toBeCloseTo(0.8, 10)
    expect(compositeNumeric([0.8, NaN], [1, 1], [], [], false)).toBeCloseTo(0.8, 10)
    expect(compositeNumeric([-1, -1], [1, 1], [], [], false)).toBe(0)
  })

  it('applies modulator bands piecewise-linearly, normalised to the band top', () => {
    // The multiplier is divided by the max attainable (1.3), so only a perfect
    // modulator reaches the hard-filter score and nothing clamps into a 1.0 tie.
    expect(compositeNumeric([0.64], [1], [1], [BAND], false)).toBeCloseTo(0.64, 10)
    expect(compositeNumeric([0.64], [1], [0.75], [BAND], false)).toBeCloseTo((0.64 * 1.15) / 1.3, 10)
    expect(compositeNumeric([0.64], [1], [0], [BAND], false)).toBeCloseTo((0.64 * 0.7) / 1.3, 10)
    expect(compositeNumeric([0.64], [1], [-1], [BAND], false)).toBeCloseTo(0.64, 10)
  })

  it('forces 0 when a veto fired', () => {
    expect(compositeNumeric([0.9], [1], [1], [BAND], true)).toBe(0)
  })
})

describe('confidenceNumeric', () => {
  it('reports the weakest available hard filter', () => {
    expect(confidenceNumeric([2, 2, 2])).toBe(2)
    expect(confidenceNumeric([2, 1, 2])).toBe(1)
  })

  it('caps at med with one missing filter and low with two', () => {
    expect(confidenceNumeric([2, -1, 2])).toBe(1)
    expect(confidenceNumeric([2, -1, -1])).toBe(0)
    expect(confidenceNumeric([-1])).toBe(0)
  })
})
