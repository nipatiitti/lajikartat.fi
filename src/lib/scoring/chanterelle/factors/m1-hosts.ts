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
 * Numeric core of M1 (shared by the object API and the per-cell grid scorer).
 * Shares are volume proportions in 0..1 summing to ≈ 1.
 */
export function m1Core(pine: number, spruce: number, other: number, variant: ChanterelleVariant): number {
  const mixedness = 1 - Math.max(pine, spruce, other) // 0 = monoculture, →2/3 = perfectly even
  if (variant === 'kantarelli') {
    // Mixed best; monoculture clearly worse; nearly pure deciduous mediocre.
    let s = 0.3 + 0.7 * clamp(mixedness / 0.45)
    if (pine + spruce < 0.2) s = Math.min(s, 0.3)
    return clamp(s)
  }
  // Spruce-driven; saturates at ≥50 % spruce; deciduous dominance is bad.
  let s = clamp(spruce / 0.5)
  if (other > 0.6) s *= 0.3
  if (spruce <= 0.15) s = Math.min(s, 0.1)
  return clamp(s)
}

/** Lower-confidence fallback on the main tree species alone (mix unknown). */
export function m1Fallback(group: MainTreeGroup, variant: ChanterelleVariant): number {
  if (variant === 'kantarelli') return group === 'otherConifer' ? 0.4 : 0.55
  return group === 'spruce' ? 0.85 : group === 'pine' || group === 'otherConifer' ? 0.4 : 0.15
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
    const mixedness = 1 - Math.max(pineShare, spruceShare, otherShare)
    const conifer = pineShare + spruceShare
    const drivers: string[] = []
    const subScore = m1Core(pineShare, spruceShare, otherShare, variant)

    if (variant === 'kantarelli') {
      if (conifer < 0.2) drivers.push('lähes puhdas lehtimetsä')
      else if (mixedness >= 0.35) drivers.push('sekametsä (parhaat kantarellisadot)')
      else drivers.push('lähes yhden puulajin metsä, kelvollinen muttei paras')
    } else {
      if (spruceShare >= 0.5) drivers.push(`kuusivaltainen (${Math.round(spruceShare * 100)} %)`)
      else if (spruceShare > 0.15) drivers.push(`jonkin verran kuusta (${Math.round(spruceShare * 100)} %)`)
      else drivers.push('vähän tai ei lainkaan kuusta')
    }

    return { subScore, confidence: 'high', drivers }
  }

  // Fallback: main tree species only — host presence known, mix unknown.
  if (input.mainTreeGroup !== null) {
    const g = input.mainTreeGroup
    return {
      subScore: m1Fallback(g, variant),
      confidence: 'med',
      drivers: [`pääpuulaji: ${TREE_GROUP_LABELS[g]} (sekoitus tuntematon)`]
    }
  }

  return { subScore: null, confidence: 'low', drivers: [] }
}
