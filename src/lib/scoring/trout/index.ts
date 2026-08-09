import { combineLimiting } from '../core/limiting'
import type { CompositeResult } from '../core/types'
import { s1Thermal } from './factors/s1-thermal'
import { s2Substrate } from './factors/s2-substrate'
import { s3Acidity } from './factors/s3-acidity'
import { s4Naturalness } from './factors/s4-naturalness'
import { s5Flow } from './factors/s5-flow'
import { s6Barriers } from './factors/s6-barriers'
import { s9Remoteness } from './factors/s9-remoteness'
import type { TroutInput } from './types'
import { TROUT_FACTOR_LABELS, TROUT_MODULATOR_BANDS } from './weights'

// Conservation ethic travels with every candidate (species/trout.md §6).
const CONSERVATION_NOTES = [
  'Wild brown trout S of 64°N are protected — catch & release only (barbless, wet hands, quick release)',
  'Small natural brooks are protected under the Water Act',
  'Do not publish precise coordinates of wild-trout brooks',
  'Puronieriä (brook trout) is invasive — removal often encouraged; verify local rules'
]

/**
 * Pure entry point: already-joined inputs → composite + confidence + why, via the
 * geometric-mean / limiting-factor rule. Hard filters (S1/S2/S3/S5) veto; modulators
 * (S4/S6/S9) nudge within bounded bands. (species/trout.md §2)
 */
export function scoreTrout(input: TroutInput): CompositeResult {
  return combineLimiting(
    [
      { id: 'S1', label: TROUT_FACTOR_LABELS.S1, result: s1Thermal(input) },
      { id: 'S2', label: TROUT_FACTOR_LABELS.S2, result: s2Substrate(input) },
      { id: 'S3', label: TROUT_FACTOR_LABELS.S3, result: s3Acidity(input) },
      { id: 'S5', label: TROUT_FACTOR_LABELS.S5, result: s5Flow(input) }
    ],
    [
      { id: 'S4', label: TROUT_FACTOR_LABELS.S4, band: TROUT_MODULATOR_BANDS.S4, result: s4Naturalness(input) },
      { id: 'S6', label: TROUT_FACTOR_LABELS.S6, band: TROUT_MODULATOR_BANDS.S6, result: s6Barriers(input) },
      { id: 'S9', label: TROUT_FACTOR_LABELS.S9, band: TROUT_MODULATOR_BANDS.S9, result: s9Remoteness(input) }
    ],
    { notes: CONSERVATION_NOTES }
  )
}

export type { TroutInput, BufferingClass } from './types'
