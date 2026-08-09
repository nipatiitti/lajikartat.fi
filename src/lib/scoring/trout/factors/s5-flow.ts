import type { FactorResult } from '../../core/types'
import type { TroutInput } from '../types'

/**
 * S5 — flow permanence & morphology (HARD FILTER). The reach must be perennial
 * (not dry out / freeze solid) yet still brook-scale. v1 reads upstream catchment
 * area (SYKE valuma-alue `ylavalu_pa_km2`): too tiny → intermittent; a small/medium
 * catchment → sustained baseflow; very large → a river, not a resident-trout brook.
 * Channel gradient (DEM riffle–pool) is deferred. (§S5)
 */
export function s5Flow(input: TroutInput): FactorResult {
  if (input.upstreamAreaKm2 === null) return { subScore: null, confidence: 'low', drivers: [] }

  const a = input.upstreamAreaKm2
  let sub: number
  if (a < 0.3) sub = 0.2 // tiny headwater — may dry / freeze solid
  else if (a < 1) sub = 0.55
  else if (a <= 50) sub = 0.85 // perennial brook sweet spot
  else if (a <= 200) sub = 0.6
  else sub = 0.4 // large river — off-archetype for resident brook trout

  return { subScore: sub, confidence: 'med', drivers: [`upstream catchment ${a.toFixed(1)} km²`] }
}
