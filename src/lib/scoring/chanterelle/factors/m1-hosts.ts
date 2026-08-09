import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { ChanterelleInput, ChanterelleVariant, MainTreeGroup } from '../types'

const TREE_GROUP_LABELS: Record<MainTreeGroup, string> = {
  pine: 'mänty',
  spruce: 'kuusi',
  deciduous: 'lehtipuu',
  otherConifer: 'muu havupuu'
}

/**
 * M1 — host trees & mix (near-hard filter). The host range is broad (spruce,
 * pine, birch), so in forest this rarely vetoes — the signal is the MIX:
 * Finnish inventories found the best kantarelli yields in mature mixed
 * pine–spruce stands, not monocultures; suppilovahvero wants spruce present or
 * dominant and scores ~0 in pure deciduous. (species/chantarelle.md §M1)
 */
export function m1Hosts(input: ChanterelleInput, variant: ChanterelleVariant): FactorResult {
  const { pineShare, spruceShare, otherShare } = input

  if (pineShare !== null && spruceShare !== null && otherShare !== null) {
    const maxShare = Math.max(pineShare, spruceShare, otherShare)
    const mixedness = 1 - maxShare // 0 = monoculture, →2/3 = perfectly even
    const conifer = pineShare + spruceShare
    const drivers: string[] = []
    let subScore: number

    if (variant === 'kantarelli') {
      // Mixed best; monoculture still decent; nearly pure deciduous mediocre.
      subScore = 0.55 + 0.45 * clamp(mixedness / 0.5)
      if (conifer < 0.2) {
        subScore = Math.min(subScore, 0.35)
        drivers.push('lähes puhdas lehtimetsä')
      } else if (mixedness >= 0.35) {
        drivers.push('sekametsä (parhaat kantarellisadot)')
      } else {
        drivers.push('lähes yhden puulajin metsä — kelvollinen muttei paras')
      }
    } else {
      // Spruce-driven; saturates at ≥50 % spruce; deciduous dominance is bad.
      subScore = clamp(spruceShare / 0.5)
      if (otherShare > 0.6) subScore *= 0.3
      if (spruceShare >= 0.5) drivers.push(`kuusivaltainen (${Math.round(spruceShare * 100)} %)`)
      else if (spruceShare > 0.15) drivers.push(`jonkin verran kuusta (${Math.round(spruceShare * 100)} %)`)
      else {
        subScore = Math.min(subScore, 0.1)
        drivers.push('vähän tai ei lainkaan kuusta')
      }
    }

    return { subScore: clamp(subScore), confidence: 'high', drivers }
  }

  // Fallback: main tree species only — host presence known, mix unknown.
  if (input.mainTreeGroup !== null) {
    const g = input.mainTreeGroup
    const subScore =
      variant === 'kantarelli'
        ? g === 'otherConifer'
          ? 0.5
          : 0.7
        : g === 'spruce'
          ? 0.85
          : g === 'pine' || g === 'otherConifer'
            ? 0.4
            : 0.15
    return { subScore, confidence: 'med', drivers: [`pääpuulaji: ${TREE_GROUP_LABELS[g]} (sekoitus tuntematon)`] }
  }

  return { subScore: null, confidence: 'low', drivers: [] }
}
