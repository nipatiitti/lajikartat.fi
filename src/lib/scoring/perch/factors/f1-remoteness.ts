import { clamp, logSaturate } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { PerchInput } from '../types'

const ROAD_DISTANCE_CAP_M = 3000

/**
 * F1 — the strongest factor. A pond is only as unfished as its easiest entry, so
 * the sub-signals are combined with a MIN: any easy access route drags the score
 * down. (species/perch.md §F1)
 */
export function f1Remoteness(input: PerchInput): FactorResult {
  const drivers: string[] = []
  const signals: number[] = []

  if (input.nearestRoadDistanceM !== null) {
    signals.push(logSaturate(input.nearestRoadDistanceM, ROAD_DISTANCE_CAP_M))
    drivers.push(`lähin tie ${formatDist(input.nearestRoadDistanceM)}`)
  }

  if (input.buildingsWithin100m !== null) {
    signals.push(1 / (1 + input.buildingsWithin100m))
    drivers.push(
      input.buildingsWithin100m === 0
        ? 'ei rakennuksia 100 m säteellä'
        : `${input.buildingsWithin100m} rakennusta 100 m säteellä`
    )
  }

  if (signals.length === 0) return { subScore: null, confidence: 'low', drivers }

  let sub = Math.min(...signals)
  // Unnamed is the norm in the data — only a name is worth surfacing as a driver.
  if (input.isNamed) {
    sub *= 0.9
    drivers.push('nimetty vesi (todennäköisemmin tunnettu ja kalastettu)')
  }

  const hasBoth = input.nearestRoadDistanceM !== null && input.buildingsWithin100m !== null
  return { subScore: clamp(sub), confidence: hasBoth ? 'high' : 'med', drivers }
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}
