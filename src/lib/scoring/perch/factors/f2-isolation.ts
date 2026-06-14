import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { PerchInput } from '../types'

/**
 * F2 — isolation. Fewer stream connections support the cannibal-control regime
 * and block cyprinid colonisation. 0 = closed basin (best), 1 = headwater,
 * ≥2 = through-flow. (perch.md §F2)
 */
export function f2Isolation(input: PerchInput): FactorResult {
  if (input.connectingStreamCount === null) return { subScore: null, confidence: 'low', drivers: [] }

  const drivers: string[] = []
  const n = input.connectingStreamCount
  let sub: number

  if (n <= 0) {
    sub = 1
    drivers.push('closed basin (no stream connections)')
  } else if (n === 1) {
    sub = input.isHeadwater ? 0.8 : 0.65
    drivers.push(input.isHeadwater ? 'headwater (single outflow, no upstream lake)' : 'single stream connection')
  } else {
    sub = clamp(0.5 - 0.1 * (n - 2))
    drivers.push(`through-flow (${n} stream connections)`)
  }

  return { subScore: clamp(sub), confidence: 'med', drivers }
}
