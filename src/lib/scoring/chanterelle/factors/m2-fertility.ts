import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleInput, ChanterelleVariant } from '../types'

const FERTILITY_LABELS: Record<number, string> = {
  1: 'lehto',
  2: 'lehtomainen kangas',
  3: 'tuore kangas (mustikkatyyppi)',
  4: 'kuivahko kangas',
  5: 'kuiva kangas',
  6: 'karukkokangas',
  7: 'kalliomaa tai hietikko',
  8: 'lakimetsä tai tunturi'
}

/**
 * M2 — site fertility type (kasvupaikkatyyppi), unimodal with the peak at mesic
 * heath (tuore kangas — the blueberry indicator ties directly to the folk
 * "kantarelli comes with the blueberries"). Peatland subgroups multiply the
 * score down — except korpi margins stay decent for suppilovahvero.
 * (species/chantarelle.md §M2)
 */
export function m2Fertility(input: ChanterelleInput, variant: ChanterelleVariant): FactorResult {
  if (input.fertilityClass === null) return { subScore: null, confidence: 'low', drivers: [] }

  const params = CHANTERELLE_PARAMS[variant]
  const base = params.fertilityScores[input.fertilityClass]
  if (base === undefined) return { subScore: null, confidence: 'low', drivers: [] }

  const drivers: string[] = [FERTILITY_LABELS[input.fertilityClass] ?? `kasvupaikkaluokka ${input.fertilityClass}`]
  let subScore = base

  if (input.subgroup !== null && input.subgroup !== 'kangas') {
    subScore *= params.subgroupMultiplier[input.subgroup]
    if (input.subgroup === 'korpi' && variant === 'suppilovahvero') {
      drivers.push('korpinen reuna — sopii suppilovahverolle')
    } else {
      drivers.push(input.subgroup === 'korpi' ? 'korpea' : input.subgroup === 'rame' ? 'rämettä' : 'avosuota')
    }
  }

  return { subScore: clamp(subScore), confidence: 'high', drivers }
}
