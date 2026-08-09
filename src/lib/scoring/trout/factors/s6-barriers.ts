import type { FactorResult } from '../../core/types'
import type { TroutInput } from '../types'

/**
 * S6 — protective isolation (MODULATOR, bonus-only). A barrier downstream isolates a
 * resident stock: it marks the fish as non-migratory tammukka AND shields it from
 * invasives/predators/angling. v1 reads SYKE PUROHELMI predicted-impassable culverts
 * + Vaellusesteet barriers; without flow direction / DEM this is APPROXIMATED as a
 * barrier in the reach's catchment / nearby, not strictly downstream. Double-edged
 * (fragile relict) → flagged in notes. (§S6)
 */
export function s6Barriers(input: TroutInput): FactorResult {
  if (input.impassableBarrierNearby === null) return { subScore: null, confidence: 'low', drivers: [] }

  if (input.impassableBarrierNearby) {
    return {
      subScore: 0.85,
      confidence: 'med',
      drivers: ['impassable barrier nearby (protective isolation; fragile relict stock)']
    }
  }
  return { subScore: 0.5, confidence: 'med', drivers: [] }
}
