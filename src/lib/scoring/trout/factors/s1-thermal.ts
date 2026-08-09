import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { TroutInput } from '../types'

/**
 * S1 — thermal regime (HARD FILTER). Trout need cold, stable, ideally
 * groundwater-fed water. v1 proxies this with mapped groundwater areas
 * (pohjavesialueet) + nearby springs (MML lähde); riparian shade and DEM
 * elevation/position are deferred (null) and simply don't contribute yet.
 * (species/trout.md §S1)
 */
export function s1Thermal(input: TroutInput): FactorResult {
  const signals: number[] = []
  const drivers: string[] = []

  if (input.inGroundwaterArea !== null) {
    signals.push(input.inGroundwaterArea ? 0.9 : 0.45)
    drivers.push(input.inGroundwaterArea ? 'in groundwater area (cold baseflow)' : 'no mapped groundwater area')
  }

  if (input.springsWithin500m !== null) {
    if (input.springsWithin500m > 0) {
      signals.push(clamp(0.6 + 0.2 * input.springsWithin500m))
      drivers.push(`${input.springsWithin500m} spring(s) within 500 m`)
    } else {
      signals.push(0.4)
    }
  }

  if (signals.length === 0) return { subScore: null, confidence: 'low', drivers: [] }

  const subScore = signals.reduce((a, b) => a + b, 0) / signals.length
  return { subScore: clamp(subScore), confidence: 'med', drivers }
}
