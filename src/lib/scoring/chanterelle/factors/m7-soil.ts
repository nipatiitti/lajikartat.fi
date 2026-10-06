import { clamp } from '../../core/math'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleVariant } from '../types'

/**
 * M7 — soil on area fractions (0..1). Mineral soil (till, sorted sand)
 * positive; open peat negative (softened for [S] — korpi margins); rock
 * context minor: [K] tolerates sunny rocky pine ground up to a point, [S] is
 * penalised on dry rock. Negative / NaN = unknown, treated as 0 when the other
 * is known; −1 when both unknown. (species/chanterelle.md §M7)
 */
export function m7Core(peatFraction: number, rockFraction: number, variant: ChanterelleVariant): number {
  const peatKnown = peatFraction >= 0
  const rockKnown = rockFraction >= 0
  if (!peatKnown && !rockKnown) return -1
  const p = CHANTERELLE_PARAMS[variant].soilPenalty
  const peat = peatKnown ? peatFraction : 0
  const rock = rockKnown ? rockFraction : 0
  return clamp(1 - p.peat * peat - p.rock * Math.max(0, rock - p.rockFreeAllowance))
}
