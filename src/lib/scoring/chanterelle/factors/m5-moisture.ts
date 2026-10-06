import { clamp, gaussianPeak } from '../../core/math'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleVariant } from '../types'

/**
 * M5 — moisture & micro-topography from the topographic wetness index (Luke
 * TWI, 16 m), standardised to 0 at the p50 anchor and ±1 at p10/p90. [K]
 * moist-but-drained: peaked at the median, waterlogged hollows and bone-dry
 * crests both fall off (floored — kantarelli is not hopeless on a dry ridge).
 * [S] rises into depressions, ditch bottoms and shaded hollows and stays low
 * on dry ground. NaN = unknown → −1. (species/chanterelle.md §M5)
 */
export function m5Core(twi: number, variant: ChanterelleVariant): number {
  if (!(twi === twi)) return -1 // NaN guard
  const a = CHANTERELLE_PARAMS[variant].twiAnchors
  const z = (twi - a.p50) / ((a.p90 - a.p10) / 2)
  if (variant === 'kantarelli') return clamp(Math.max(0.25, gaussianPeak(z, 0, 1)))
  return clamp(0.25 + 0.75 * clamp((z + 1) / 2))
}
