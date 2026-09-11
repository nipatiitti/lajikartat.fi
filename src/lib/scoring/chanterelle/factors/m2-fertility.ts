import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleInput, ChanterelleVariant, Subgroup } from '../types'

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

/** Subgroup code used by the numeric API: 0 kangas, 1 korpi, 2 räme, 3 avosuo, −1 unknown. */
export const SUBGROUP_CODES: readonly Subgroup[] = ['kangas', 'korpi', 'rame', 'openMire']
export const subgroupCode = (s: Subgroup | null): number => (s === null ? -1 : SUBGROUP_CODES.indexOf(s))

/**
 * Numeric core of M2. `fertilityClass` 1..8 (−1 unknown → −1), `subgroup` code
 * as above. On peat the MVMI/Metsäkeskus classes are the parallel mire
 * fertility classes (lettosuot ≈ lehto … rahkaiset ≈ karukko), so the same
 * table applies and the subgroup multiplier handles the peat penalty.
 */
export function m2Core(fertilityClass: number, subgroup: number, variant: ChanterelleVariant): number {
  const params = CHANTERELLE_PARAMS[variant]
  const base = params.fertilityScores[fertilityClass]
  if (base === undefined) return -1
  let s = base
  if (subgroup === 1) s *= params.subgroupMultiplier.korpi
  else if (subgroup === 2) s *= params.subgroupMultiplier.rame
  else if (subgroup === 3) s *= params.subgroupMultiplier.openMire
  return clamp(s)
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

  const subScore = m2Core(input.fertilityClass, subgroupCode(input.subgroup), variant)
  if (subScore < 0) return { subScore: null, confidence: 'low', drivers: [] }

  const drivers: string[] = [FERTILITY_LABELS[input.fertilityClass] ?? `kasvupaikkaluokka ${input.fertilityClass}`]
  if (input.subgroup !== null && input.subgroup !== 'kangas') {
    if (input.subgroup === 'korpi' && variant === 'suppilovahvero') {
      drivers.push('korpinen reuna, sopii suppilovahverolle')
    } else {
      drivers.push(input.subgroup === 'korpi' ? 'korpea' : input.subgroup === 'rame' ? 'rämettä' : 'avosuota')
    }
  }

  return { subScore, confidence: 'high', drivers }
}
