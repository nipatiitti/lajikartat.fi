import { clamp, gaussianPeak } from '../../core/math'
import type { FactorResult } from '../../core/types'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleInput, ChanterelleVariant } from '../types'

/**
 * Numeric core of M4. Basal area (m²/ha) is UNIMODAL for both variants:
 * Tahvanainen et al. 2016 found marketed-mushroom yields in eastern-Finnish
 * spruce stands peaking around 25 m²/ha and falling in denser stands, and
 * kantarelli wants it a little more open still. Canopy cover (%) is the direct
 * light measure when available (MVMI latvuspeitto): [K] peaks at a semi-open
 * canopy, [S] rises towards closed mossy shade. The two signals average; either
 * alone works. NaN / negative = unknown; −1 when both are unknown.
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

/**
 * M4 — canopy / light, SPECIES-FLIPPED. [K] wants semi-open light (it can
 * still fruit in denser stands late season, hence the floor); [S] is
 * shade-tolerant and prefers the closed mossy spruce dark, but even it fades
 * in the densest stands. (species/chantarelle.md §M4)
 */
export function m4Light(input: ChanterelleInput, variant: ChanterelleVariant): FactorResult {
  const ba = input.basalAreaM2Ha ?? -1
  const cc = input.canopyCoverPct ?? -1
  const subScore = m4Core(ba, cc, variant)
  if (subScore < 0) return { subScore: null, confidence: 'low', drivers: [] }

  const p = CHANTERELLE_PARAMS[variant].m4
  const drivers: string[] = []
  if (variant === 'kantarelli') {
    if (cc >= 0) {
      if (Math.abs(cc - p.ccPeak) <= p.ccSigma)
        drivers.push(`puoliavoin latvus (${Math.round(cc)} %), valoa maanpinnalle`)
      else if (cc > p.ccPeak + 1.5 * p.ccSigma) drivers.push('tiheä, varjoisa latvus (lähinnä loppukauden paikka)')
    } else if (ba >= p.baPeak - p.baSigma && ba <= p.baPeak + p.baSigma) {
      drivers.push('puoliavoin latvus (valoa maanpinnalle)')
    } else if (ba > p.baPeak + 1.5 * p.baSigma) {
      drivers.push('tiheä, varjoisa latvus (lähinnä loppukauden paikka)')
    }
  } else {
    if (cc >= 0) {
      if (cc >= p.ccRampTo - 10) drivers.push(`sulkeutunut latvus (${Math.round(cc)} %), sammaleinen ja kostea`)
      else if (cc < p.ccRampFrom + 10) drivers.push('harva latvus, kuivuu helposti')
    } else if (ba >= p.baPeak - 5) {
      drivers.push('sulkeutunut, varjoisa latvus (sammaleinen ja kostea)')
    } else if (ba < 12) {
      drivers.push('harva latvus, kuivuu helposti')
    }
  }

  // Basal area proxies closure; MVMI canopy cover is itself a model estimate.
  return { subScore, confidence: 'med', drivers }
}
