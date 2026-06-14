import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { PerchInput } from '../types'

// Target band 0.5–20 ha; extend to ~50 ha for "medium"; taper to 0 outside.
function areaBand(areaHa: number): number {
  if (areaHa <= 0) return 0
  if (areaHa < 0.5) return clamp(areaHa / 0.5)
  if (areaHa <= 20) return 1
  if (areaHa <= 50) return clamp(1 - (areaHa - 20) / 30)
  return 0
}

/**
 * F5 — morphometry. Small favours the cannibal-giant dynamic; a deeper hole and
 * complex shoreline add refugia/cover. Depth is null at v1 (no Järvirajapinta
 * lookup yet) and simply nudges confidence down. (perch.md §F5)
 */
export function f5Morphometry(input: PerchInput): FactorResult {
  if (input.areaHa === null) return { subScore: null, confidence: 'low', drivers: [] }

  const drivers: string[] = [`area ${input.areaHa.toFixed(1)} ha`]
  let sub = areaBand(input.areaHa)
  if (sub === 0) drivers.push('outside target size band')

  if (input.shorelineDevelopment !== null) {
    const structure = clamp((input.shorelineDevelopment - 1) / 2)
    sub = clamp(sub * (0.85 + 0.15 * structure))
    if (structure > 0.3) drivers.push('complex shoreline (more littoral cover)')
  }

  if (input.maxDepthM !== null) {
    const depth = clamp(input.maxDepthM / 6)
    sub = clamp(sub * (0.8 + 0.2 * depth))
    drivers.push(`max depth ${input.maxDepthM.toFixed(1)} m`)
  }

  return { subScore: sub, confidence: input.maxDepthM !== null ? 'high' : 'med', drivers }
}
