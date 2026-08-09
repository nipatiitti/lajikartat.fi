import { clamp, logSaturate } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { ChanterelleInput, DevClass } from '../types'

// Mature = high for both species; open/seedling are veto territory (kept low
// here for robustness when the veto is bypassed); shelterwood and uneven-aged
// stands retain mature trees and stay productive.
const DEV_CLASS_SCORES: Record<DevClass, number> = {
  open: 0.05,
  seedling: 0.05,
  young: 0.3,
  middle: 0.65,
  mature: 1.0,
  shelterwood: 0.85,
  unevenAged: 0.85
}

/**
 * M3 — stand maturity. Development class is the primary signal; mean age blends
 * in when present (saturating around ~80 y — ectomycorrhizal networks build up
 * with stand age). (species/chantarelle.md §M3)
 */
export function m3Maturity(input: ChanterelleInput): FactorResult {
  const signals: number[] = []
  const drivers: string[] = []

  if (input.devClass !== null) {
    signals.push(DEV_CLASS_SCORES[input.devClass])
    if (input.devClass === 'mature') drivers.push('uudistuskypsä metsä')
    else if (input.devClass === 'young') drivers.push('nuori kasvatusmetsä')
    else if (input.devClass === 'middle') drivers.push('varttunut kasvatusmetsä')
  }

  if (input.meanAgeYears !== null) {
    signals.push(logSaturate(input.meanAgeYears, 80))
    if (input.meanAgeYears >= 60) drivers.push(`keski-ikä ${Math.round(input.meanAgeYears)} v`)
  }

  if (signals.length === 0) return { subScore: null, confidence: 'low', drivers: [] }

  const subScore = signals.reduce((a, b) => a + b, 0) / signals.length
  return { subScore: clamp(subScore), confidence: 'high', drivers }
}
