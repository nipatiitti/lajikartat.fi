import type { FactorResult } from '../../core/types'
import type { ChanterelleInput } from '../types'

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
  const fired: string[] = []

  if (input.devClass === 'open') fired.push('tuore avohakkuuaukea')
  if (input.devClass === 'seedling') fired.push('taimikko')
  if (input.subgroup === 'openMire') fired.push('avosuo')

  if (fired.length > 0) return { subScore: 0, confidence: 'high', drivers: fired }
  if (input.devClass === null && input.subgroup === null) return { subScore: null, confidence: 'low', drivers: [] }
  return { subScore: 1, confidence: 'high', drivers: [] }
}
