import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleInput, ChanterelleVariant, StandSoil } from '../types'

/** Numeric core of M7 on area fractions (0..1; negative / NaN = unknown, treated as 0 when the other is known). −1 when both unknown. */
export function m7Core(peatFraction: number, rockFraction: number, variant: ChanterelleVariant): number {
  const peatKnown = peatFraction >= 0
  const rockKnown = rockFraction >= 0
  if (!peatKnown && !rockKnown) return -1
  const p = CHANTERELLE_PARAMS[variant].soilPenalty
  const peat = peatKnown ? peatFraction : 0
  const rock = rockKnown ? rockFraction : 0
  return clamp(1 - p.peat * peat - p.rock * Math.max(0, rock - p.rockFreeAllowance))
}

const STAND_SOIL_SCORES: Record<ChanterelleVariant, Record<StandSoil, number>> = {
  kantarelli: { mineral: 0.8, peat: 0.3, rock: 0.6, other: 0.5 },
  suppilovahvero: { mineral: 0.8, peat: 0.5, rock: 0.4, other: 0.5 }
}

/** Lower-confidence fallback on a categorical stand soil. */
export function m7Fallback(soil: StandSoil, variant: ChanterelleVariant): number {
  return STAND_SOIL_SCORES[variant][soil]
}

/**
 * M7 — soil. Mineral soil (till, sorted sand) positive; open peat negative
 * (softened for [S] — korpi margins); rock context minor: [K] tolerates sunny
 * rocky pine ground up to a point, [S] penalised on dry rock. GTK fractions
 * over the stand polygon are the primary input; the stand's own SOILTYPE class
 * is the lower-confidence fallback. (species/chantarelle.md §M7)
 */
export function m7Soil(input: ChanterelleInput, variant: ChanterelleVariant): FactorResult {
  if (input.peatFraction !== null || input.rockFraction !== null) {
    const peat = input.peatFraction ?? 0
    const rock = input.rockFraction ?? 0
    const drivers: string[] = []

    const subScore = m7Core(input.peatFraction ?? -1, input.rockFraction ?? -1, variant)
    if (peat > 0.5) drivers.push('pääosin turvemaata')
    else if (peat < 0.15 && rock < 0.3) drivers.push('kivennäismaata (moreeni/hiekka)')
    if (rock > 0.4)
      drivers.push(variant === 'kantarelli' ? 'kallioista, tarkista paisteiset männikönreunat' : 'kuivaa kalliomaata')

    return { subScore, confidence: 'med', drivers }
  }

  if (input.standSoil !== null) {
    const soilLabels: Record<StandSoil, string> = {
      mineral: 'kivennäismaa',
      peat: 'turvemaa',
      rock: 'kalliomaa',
      other: 'muu maapohja'
    }
    return {
      subScore: m7Fallback(input.standSoil, variant),
      confidence: 'low',
      drivers: [`kuvion maapohja: ${soilLabels[input.standSoil]}`]
    }
  }

  return { subScore: null, confidence: 'low', drivers: [] }
}
