import { clamp } from '../../core/math'
import type { ChanterelleVariant } from '../types'

/**
 * M1 — host trees & mix (near-hard filter). The host range is broad (spruce,
 * pine, birch), so in forest this rarely vetoes — the signal is the MIX:
 * Finnish inventories found the best kantarelli yields in mature mixed
 * pine–spruce stands, not monocultures; suppilovahvero wants spruce present or
 * dominant and scores ~0 in pure deciduous. Shares are volume proportions in
 * 0..1 summing to ≈ 1. (species/chanterelle.md §M1)
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
