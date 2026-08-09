import { clamp, logSaturate } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { ChanterelleInput } from '../types'

/**
 * M9 — remoteness / picking pressure (MODULATOR, mild). Distance from car roads
 * and settlement → fresher, un-picked fruiting bodies on the day. Deliberately
 * mild (mycelium persists, spots renew) and CAR-road based so it doesn't cancel
 * M6's forest-track signal — a stand can hug an ajotie (good M6) while being far
 * from the paved network (good M9). (species/chantarelle.md §M9)
 */
export function m9Remoteness(input: ChanterelleInput): FactorResult {
  const signals: number[] = []
  const drivers: string[] = []

  if (input.nearestCarRoadM !== null) {
    signals.push(logSaturate(input.nearestCarRoadM, 2000))
    if (input.nearestCarRoadM > 1000) drivers.push(`${(input.nearestCarRoadM / 1000).toFixed(1)} km autotielle`)
    else if (input.nearestCarRoadM < 150) drivers.push('aivan autotien vieressä — todennäköisesti kaluttu')
  }

  if (input.buildingsWithin500m !== null) {
    signals.push(1 / (1 + input.buildingsWithin500m))
    if (input.buildingsWithin500m >= 3) drivers.push(`${input.buildingsWithin500m} rakennusta 500 m säteellä`)
  }

  if (signals.length === 0) return { subScore: null, confidence: 'low', drivers: [] }

  return { subScore: clamp(Math.min(...signals)), confidence: 'high', drivers }
}
