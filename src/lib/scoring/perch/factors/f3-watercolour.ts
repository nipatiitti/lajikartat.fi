import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { PerchInput } from '../types'

/**
 * F3 — water colour, inverted folk wisdom: browner = smaller perch. v1 uses a
 * proxy (catchment soil composition), not measured colour, so confidence is
 * "med" until SYKE VESLA is wired in v2. Low peatland + esker/mineral catchment
 * ⇒ clearer water ⇒ higher score. (perch.md §F3)
 */
export function f3WaterColour(input: PerchInput): FactorResult {
  if (input.peatFraction === null) return { subScore: null, confidence: 'low', drivers: [] }

  const drivers: string[] = []
  const peat = clamp(input.peatFraction)
  const esker = clamp(input.eskerFraction ?? 0)

  const sub = clamp((1 - peat) * 0.85 + esker * 0.15)

  drivers.push(`catchment peatland ${(peat * 100).toFixed(0)}%`)
  if (esker > 0.05) drivers.push(`esker/glaciofluvial ${(esker * 100).toFixed(0)}% (clearer water)`)
  if (peat > 0.5) drivers.push('peat-dominated catchment (browning risk)')

  return { subScore: sub, confidence: 'med', drivers }
}
