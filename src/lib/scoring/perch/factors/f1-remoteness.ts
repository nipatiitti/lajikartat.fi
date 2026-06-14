import { clamp, logSaturate } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { AccessType, PerchInput } from '../types'

const ROAD_DISTANCE_CAP_M = 3000

// Higher = more remote (better). Walk-in/none beats a paved road to the shore.
const ACCESS_REMOTENESS: Record<AccessType, number> = {
  paved: 0.0,
  gravel: 0.3,
  gated: 0.65,
  trail: 0.85,
  none: 1.0
}

/**
 * F1 — the strongest factor. A pond is only as unfished as its easiest entry, so
 * the sub-signals are combined with a MIN: any easy access route drags the score
 * down. (perch.md §F1)
 */
export function f1Remoteness(input: PerchInput): FactorResult {
  const drivers: string[] = []
  const signals: number[] = []

  if (input.nearestRoadDistanceM !== null) {
    const distScore = logSaturate(input.nearestRoadDistanceM, ROAD_DISTANCE_CAP_M)
    const accessScore = input.accessType !== null ? ACCESS_REMOTENESS[input.accessType] : distScore
    signals.push(0.6 * distScore + 0.4 * accessScore)
    drivers.push(`nearest road ${formatDist(input.nearestRoadDistanceM)}${input.accessType ? ` (${input.accessType})` : ''}`)
  }

  if (input.buildingsWithin100m !== null) {
    signals.push(1 / (1 + input.buildingsWithin100m))
    drivers.push(
      input.buildingsWithin100m === 0
        ? 'no buildings within 100 m'
        : `${input.buildingsWithin100m} building(s) within 100 m`
    )
  }

  if (signals.length === 0) return { subScore: null, confidence: 'low', drivers }

  let sub = Math.min(...signals)
  if (input.isNamed) {
    sub *= 0.9
    drivers.push('named water (more likely known/fished)')
  } else {
    drivers.push('unnamed')
  }

  const hasBoth = input.nearestRoadDistanceM !== null && input.buildingsWithin100m !== null
  return { subScore: clamp(sub), confidence: hasBoth ? 'high' : 'med', drivers }
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}
