import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleInput, ChanterelleVariant } from '../types'

/**
 * M7 — soil. Mineral soil (till, sorted sand) positive; open peat negative
 * (softened for [S] — korpi margins); rock context minor: [K] tolerates sunny
 * rocky pine ground up to a point, [S] penalised on dry rock. GTK fractions
 * over the stand polygon are the primary input; the stand's own SOILTYPE class
 * is the lower-confidence fallback. (species/chantarelle.md §M7)
 */
export function m7Soil(input: ChanterelleInput, variant: ChanterelleVariant): FactorResult {
  const p = CHANTERELLE_PARAMS[variant].soilPenalty

  if (input.peatFraction !== null || input.rockFraction !== null) {
    const peat = input.peatFraction ?? 0
    const rock = input.rockFraction ?? 0
    const drivers: string[] = []

    let subScore = 1 - p.peat * peat - p.rock * Math.max(0, rock - p.rockFreeAllowance)
    if (peat > 0.5) drivers.push('pääosin turvemaata')
    else if (peat < 0.15 && rock < 0.3) drivers.push('kivennäismaata (moreeni/hiekka)')
    if (rock > 0.4)
      drivers.push(variant === 'kantarelli' ? 'kallioista, tarkista paisteiset männikönreunat' : 'kuivaa kalliomaata')

    return { subScore: clamp(subScore), confidence: 'med', drivers }
  }

  if (input.standSoil !== null) {
    const scores: Record<NonNullable<typeof input.standSoil>, number> = {
      mineral: 0.8,
      peat: variant === 'kantarelli' ? 0.3 : 0.5,
      rock: variant === 'kantarelli' ? 0.6 : 0.4,
      other: 0.5
    }
    const soilLabels: Record<NonNullable<typeof input.standSoil>, string> = {
      mineral: 'kivennäismaa',
      peat: 'turvemaa',
      rock: 'kalliomaa',
      other: 'muu maapohja'
    }
    return {
      subScore: scores[input.standSoil],
      confidence: 'low',
      drivers: [`kuvion maapohja: ${soilLabels[input.standSoil]}`]
    }
  }

  return { subScore: null, confidence: 'low', drivers: [] }
}
