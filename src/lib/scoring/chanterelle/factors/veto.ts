import type { FactorResult } from '../../core/types'
import type { ChanterelleInput } from '../types'
import { subgroupCode } from './m2-fertility'
import { devClassCode } from './m3-maturity'

/**
 * Numeric core of the veto on codes (see DEV_CLASS_CODES / SUBGROUP_CODES):
 * 0 = fired, 1 = passed, −1 = unknown (never fires).
 */
export function vetoCore(devClass: number, subgroup: number): number {
  if (devClass === 0 || devClass === 1 || subgroup === 3) return 0
  if (devClass < 0 && subgroup < 0) return -1
  return 1
}

/**
 * V — hard vetoes (species/chantarelle.md §2). Only the conditions knowable
 * from stand attributes live here: fresh clearcut / seedling stand and open
 * treeless mire. Open water, built/sealed and cultivated ground never become
 * candidates in the first place (the extractor keeps only forest-land stands),
 * so they need no runtime check. Fires with subScore 0 (composite → 0, reason
 * surfaced in the why-breakdown); passes with 1; all-null inputs → null
 * (unknown never vetoes).
 */
export function vetoConditions(input: ChanterelleInput): FactorResult {
  const v = vetoCore(devClassCode(input.devClass), subgroupCode(input.subgroup))
  if (v < 0) return { subScore: null, confidence: 'low', drivers: [] }
  if (v === 1) return { subScore: 1, confidence: 'high', drivers: [] }

  const fired: string[] = []
  if (input.devClass === 'open') fired.push('tuore avohakkuuaukea')
  if (input.devClass === 'seedling') fired.push('taimikko')
  if (input.subgroup === 'openMire') fired.push('avosuo')
  return { subScore: 0, confidence: 'high', drivers: fired }
}
