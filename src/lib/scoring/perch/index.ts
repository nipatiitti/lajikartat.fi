import { combineFactors } from '../core/composite'
import type { CompositeResult } from '../core/types'
import { f1Remoteness } from './factors/f1-remoteness'
import { f2Isolation } from './factors/f2-isolation'
import { f3WaterColour } from './factors/f3-watercolour'
import { f5Morphometry } from './factors/f5-morphometry'
import type { PerchInput } from './types'
import { PERCH_FACTOR_LABELS, PERCH_WEIGHTS } from './weights'

/** Pure entry point: already-joined inputs → composite + confidence + why. */
export function scorePerch(input: PerchInput): CompositeResult {
  return combineFactors(
    [
      { id: 'F1', label: PERCH_FACTOR_LABELS.F1, weight: PERCH_WEIGHTS.F1, result: f1Remoteness(input) },
      { id: 'F2', label: PERCH_FACTOR_LABELS.F2, weight: PERCH_WEIGHTS.F2, result: f2Isolation(input) },
      { id: 'F3', label: PERCH_FACTOR_LABELS.F3, weight: PERCH_WEIGHTS.F3, result: f3WaterColour(input) },
      { id: 'F5', label: PERCH_FACTOR_LABELS.F5, weight: PERCH_WEIGHTS.F5, result: f5Morphometry(input) }
    ],
    { notes: ['F7: verify fish community on site', 'Big-perch stocks are fragile — release the largest fish'] }
  )
}

export type { PerchInput, AccessType } from './types'
