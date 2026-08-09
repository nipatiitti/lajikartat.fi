import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { TroutInput } from '../types'

/**
 * S2 — substrate / spawning gravel (HARD FILTER). Trout spawn in clean gravel/
 * cobble; silt buries and suffocates redds. v1 reads GTK superficial-deposit
 * composition sampled ALONG the channel: glaciofluvial/till → gravel (positive),
 * clay/fine sediment → negative. Channel gradient (DEM) is deferred. (§S2)
 */
export function s2Substrate(input: TroutInput): FactorResult {
  if (input.gravelFraction === null && input.fineSedimentFraction === null) {
    return { subScore: null, confidence: 'low', drivers: [] }
  }

  const gravel = clamp(input.gravelFraction ?? 0)
  const fines = clamp(input.fineSedimentFraction ?? 0)
  const drivers: string[] = []

  // Baseline mid; gravel lifts toward gravel/cobble redds, fines drag toward silt.
  const sub = clamp(0.3 + gravel * 0.7 - fines * 0.6)

  drivers.push(`gravel/glaciofluvial ${(gravel * 100).toFixed(0)}% along channel`)
  if (fines > 0.4) drivers.push(`fine sediment ${(fines * 100).toFixed(0)}% (silts redds)`)

  return { subScore: sub, confidence: 'med', drivers }
}
