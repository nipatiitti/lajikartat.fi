import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { TroutInput } from '../types'

/**
 * S4 — stream naturalness (MODULATOR). SYKE PUROHELMI predicts a habitat-naturalness
 * class 1–5 (5 = least altered) per Ranta10 segment — a ready-made composite of the
 * catchment disturbance that silts spawning gravel. Null where PUROHELMI doesn't
 * model the segment (esker/clear brooks, <5% peat catchments) → drops out, NEVER
 * treated as "bad". (§S4, coverage caveat)
 */
export function s4Naturalness(input: TroutInput): FactorResult {
  if (input.naturalnessClass === null) return { subScore: null, confidence: 'low', drivers: [] }

  const sub = clamp((input.naturalnessClass - 1) / 4) // 1→0, 5→1
  const drivers = [`PUROHELMI naturalness class ${input.naturalnessClass}/5`]
  if (input.naturalnessClass >= 4) drivers.push('near-natural stream (rare in the south)')
  return { subScore: sub, confidence: 'high', drivers }
}
