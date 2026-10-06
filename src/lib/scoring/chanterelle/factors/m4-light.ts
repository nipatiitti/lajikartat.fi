import { clamp, gaussianPeak } from '../../core/math'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleVariant } from '../types'

/**
 * M4 — canopy / light, SPECIES-FLIPPED. Basal area (m²/ha) is UNIMODAL for
 * both variants: Tahvanainen et al. 2016 found marketed-mushroom yields in
 * eastern-Finnish spruce stands peaking around 25 m²/ha and falling in denser
 * stands, and kantarelli wants it a little more open still. Canopy cover (%)
 * is the direct light measure when available (MVMI latvuspeitto): [K] peaks at
 * a semi-open canopy, [S] rises towards closed mossy shade. The two signals
 * average; either alone works. NaN / negative = unknown; −1 when both are
 * unknown. (species/chanterelle.md §M4)
 */
export function m4Core(basalArea: number, canopyPct: number, variant: ChanterelleVariant): number {
  const p = CHANTERELLE_PARAMS[variant].m4
  let sum = 0
  let n = 0
  if (basalArea >= 0) {
    sum += 0.1 + 0.9 * gaussianPeak(basalArea, p.baPeak, p.baSigma)
    n++
  }
  if (canopyPct >= 0) {
    sum +=
      variant === 'kantarelli'
        ? 0.1 + 0.9 * gaussianPeak(canopyPct, p.ccPeak, p.ccSigma)
        : 0.1 + 0.9 * clamp((canopyPct - p.ccRampFrom) / (p.ccRampTo - p.ccRampFrom))
    n++
  }
  return n === 0 ? -1 : clamp(sum / n)
}
