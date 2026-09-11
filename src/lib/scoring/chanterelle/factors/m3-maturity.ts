import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { ChanterelleInput, DevClass } from '../types'

/** Development class code used by the numeric API (index into this list, −1 unknown). */
export const DEV_CLASS_CODES: readonly DevClass[] = [
  'open',
  'seedling',
  'young',
  'middle',
  'mature',
  'shelterwood',
  'unevenAged'
]
export const devClassCode = (d: DevClass | null): number => (d === null ? -1 : DEV_CLASS_CODES.indexOf(d))

// Mature = high for both species; open/seedling are veto territory (kept low
// here for robustness when the veto is bypassed); shelterwood and uneven-aged
// stands retain mature trees and stay productive.
const DEV_CLASS_SCORES: Record<DevClass, number> = {
  open: 0.05,
  seedling: 0.05,
  young: 0.2,
  middle: 0.5,
  mature: 1.0,
  shelterwood: 0.85,
  unevenAged: 0.85
}
const DEV_CLASS_SCORE_BY_CODE: readonly number[] = DEV_CLASS_CODES.map((d) => DEV_CLASS_SCORES[d])

/** Numeric core of M3: mean of the available signals; −1 when both unknown (age NaN or < 0). */
export function m3Core(devClass: number, meanAge: number): number {
  let sum = 0
  let n = 0
  if (devClass >= 0 && devClass < DEV_CLASS_SCORE_BY_CODE.length) {
    sum += DEV_CLASS_SCORE_BY_CODE[devClass]
    n++
  }
  if (meanAge >= 0) {
    // Linear ramp 20→80 y: logSaturate flattened too early (a 60 y stand sat
    // at ~0.94), which erased the age signal across the managed-forest range.
    sum += clamp((meanAge - 20) / 60)
    n++
  }
  return n === 0 ? -1 : clamp(sum / n)
}

/**
 * M3 — stand maturity. Development class is the primary signal; mean age blends
 * in when present (ectomycorrhizal networks build up with stand age).
 * (species/chantarelle.md §M3)
 */
export function m3Maturity(input: ChanterelleInput): FactorResult {
  const subScore = m3Core(devClassCode(input.devClass), input.meanAgeYears ?? -1)
  if (subScore < 0) return { subScore: null, confidence: 'low', drivers: [] }

  const drivers: string[] = []
  if (input.devClass === 'mature') drivers.push('uudistuskypsä metsä')
  else if (input.devClass === 'young') drivers.push('nuori kasvatusmetsä')
  else if (input.devClass === 'middle') drivers.push('varttunut kasvatusmetsä')
  if (input.meanAgeYears !== null && input.meanAgeYears >= 60)
    drivers.push(`keski-ikä ${Math.round(input.meanAgeYears)} v`)

  return { subScore, confidence: 'high', drivers }
}
