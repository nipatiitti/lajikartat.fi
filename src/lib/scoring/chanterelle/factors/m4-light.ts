import { clamp, gaussianPeak } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { ChanterelleInput, ChanterelleVariant } from '../types'

/**
 * M4 — canopy / light, SPECIES-FLIPPED. The stand data has no canopy-cover %,
 * so basal area (m²/ha) proxies canopy closure. [K] wants semi-open light
 * (peak ~18 m²/ha, floored — it can still fruit in denser stands late season);
 * [S] is shade-tolerant and prefers the closed mossy spruce dark (saturates
 * ~24 m²/ha). (species/chantarelle.md §M4)
 */
export function m4Light(input: ChanterelleInput, variant: ChanterelleVariant): FactorResult {
  if (input.basalAreaM2Ha === null) return { subScore: null, confidence: 'low', drivers: [] }

  const ba = input.basalAreaM2Ha
  const drivers: string[] = []
  let subScore: number

  if (variant === 'kantarelli') {
    subScore = 0.2 + 0.8 * gaussianPeak(ba, 18, 8)
    if (ba >= 12 && ba <= 24) drivers.push('puoliavoin latvus (valoa maanpinnalle)')
    else if (ba > 28) drivers.push('tiheä, varjoisa latvus (lähinnä loppukauden paikka)')
  } else {
    subScore = 0.15 + 0.85 * clamp(ba / 24)
    if (ba >= 20) drivers.push('sulkeutunut, varjoisa latvus (sammaleinen ja kostea)')
    else if (ba < 12) drivers.push('harva latvus, kuivuu helposti')
  }

  // Basal area is a proxy, not a measured canopy cover.
  return { subScore: clamp(subScore), confidence: 'med', drivers }
}
