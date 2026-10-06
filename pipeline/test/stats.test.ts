import { describe, expect, it } from 'vitest'
import { auc, percentiles } from '../src/kernel/raster/stats'

describe('percentiles', () => {
  it('reads percentile values off a histogram', () => {
    const bins = [10, 20, 30, 40] // cumulative 10, 30, 60, 100
    const p = percentiles(bins, 100, [0.1, 0.5, 0.9], (i) => i)
    expect(p).toEqual({ p10: 0, p50: 2, p90: 3 })
  })
})

describe('auc', () => {
  it('is 1 for perfectly separated classes, 0.5 for identical ones', () => {
    expect(auc([0.8, 0.9], [0.1, 0.2])).toBe(1)
    expect(auc([0.5, 0.5], [0.5, 0.5])).toBe(0.5)
  })

  it('handles ties by mid-ranks', () => {
    expect(auc([0.2, 0.9], [0.2, 0.1])).toBeCloseTo(0.875, 10)
  })
})
