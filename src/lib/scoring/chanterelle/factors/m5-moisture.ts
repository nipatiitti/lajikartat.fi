import { clamp, gaussianPeak } from '../../core/math'
import type { FactorResult } from '../../core/types'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleInput, ChanterelleVariant } from '../types'

/**
 * Standardised wetness: 0 at the regional median, ±1 at the p10/p90 anchors
 * (measured on forest cells by `calibrate --twi`, stored in params).
 */
export function twiZ(twi: number, variant: ChanterelleVariant): number {
  const a = CHANTERELLE_PARAMS[variant].twiAnchors
  return (twi - a.p50) / ((a.p90 - a.p10) / 2)
}

/**
 * Numeric core of M5. [K] moist-but-drained: peaked at the median, waterlogged
 * hollows and bone-dry crests both fall off (floored — kantarelli is not
 * hopeless on a dry ridge). [S] rises into depressions, ditch bottoms and
 * shaded hollows and stays low on dry ground. NaN = unknown → −1.
 */
export function m5Core(twi: number, variant: ChanterelleVariant): number {
  if (!(twi === twi)) return -1 // NaN guard
  const z = twiZ(twi, variant)
  if (variant === 'kantarelli') return clamp(Math.max(0.25, gaussianPeak(z, 0, 1)))
  return clamp(0.25 + 0.75 * clamp((z + 1) / 2))
}

/**
 * M5 — moisture & micro-topography from the topographic wetness index
 * (Luke TWI, 16 m). Depressions, hollows, ditch bottoms and shaded slopes for
 * [S]; moderate, drained ground for [K]. (species/chantarelle.md §M5)
 */
export function m5Moisture(input: ChanterelleInput, variant: ChanterelleVariant): FactorResult {
  if (input.twi === null) return { subScore: null, confidence: 'low', drivers: [] }
  const subScore = m5Core(input.twi, variant)
  if (subScore < 0) return { subScore: null, confidence: 'low', drivers: [] }

  const z = twiZ(input.twi, variant)
  const drivers: string[] = []
  if (variant === 'kantarelli') {
    if (z > 1.5) drivers.push('vettynyt painanne')
    else if (Math.abs(z) < 0.75) drivers.push('sopivan kostea, vettä läpäisevä maa')
    else if (z < -1.5) drivers.push('kuiva kumpare tai rinne')
  } else if (z > 0.5) drivers.push('kostea painanne tai notko')
  else if (z < -0.75) drivers.push('kuiva rinne tai kumpare')

  // TWI is a terrain proxy for soil moisture, not a measurement.
  return { subScore, confidence: 'med', drivers }
}
