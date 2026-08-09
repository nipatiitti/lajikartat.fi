import { clamp, logSaturate } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { TroutInput } from '../types'

const ROAD_DISTANCE_CAP_M = 3000

/**
 * S9 — remoteness / low pressure (MODULATOR). Mirrors perch F1: nearest road +
 * buildings, combined with a MIN (any easy access route drags it down). For wild
 * trout this doubles as a conservation control — prefer (and don't publicise)
 * low-traffic brooks. (§S9)
 */
export function s9Remoteness(input: TroutInput): FactorResult {
  const drivers: string[] = []
  const signals: number[] = []

  if (input.nearestRoadDistanceM !== null) {
    signals.push(logSaturate(input.nearestRoadDistanceM, ROAD_DISTANCE_CAP_M))
    drivers.push(`nearest road ${formatDist(input.nearestRoadDistanceM)}`)
  }

  if (input.buildingsWithin100m !== null) {
    signals.push(1 / (1 + input.buildingsWithin100m))
    if (input.buildingsWithin100m > 0) drivers.push(`${input.buildingsWithin100m} building(s) within 100 m`)
  }

  if (signals.length === 0) return { subScore: null, confidence: 'low', drivers: [] }

  let sub = Math.min(...signals)
  if (input.isNamed) {
    sub *= 0.9
    drivers.push('named water (more likely known)')
  }

  const hasBoth = input.nearestRoadDistanceM !== null && input.buildingsWithin100m !== null
  return { subScore: clamp(sub), confidence: hasBoth ? 'high' : 'med', drivers }
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}
