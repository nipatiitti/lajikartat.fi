import { clamp } from '../../core/math'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleVariant, Subgroup } from '../types'

/** Subgroup code: index into this list (0 kangas, 1 korpi, 2 räme, 3 avosuo), −1 unknown. */
export const SUBGROUP_CODES: readonly Subgroup[] = ['kangas', 'korpi', 'rame', 'openMire']

/**
 * M2 — site fertility type (kasvupaikkatyyppi 1..8), unimodal with the peak at
 * mesic heath (tuore kangas — the blueberry indicator ties directly to the folk
 * "kantarelli comes with the blueberries"). On peat the MVMI classes are the
 * parallel mire fertility classes, so the same table applies and the subgroup
 * multiplier handles the peat penalty. Unknown class → −1.
 * (species/chanterelle.md §M2)
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
