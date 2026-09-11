import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleInput, ChanterelleVariant } from '../types'

/**
 * 1 at ≤ 25 m, linear → 0 at 300 m. Managed forest is dense with tracks and
 * ditches, so a generous decay (formerly 50→400 m) saturated this factor for
 * nearly every stand and erased its ranking signal.
 */
export const prox = (d: number): number => (d <= 25 ? 1 : clamp((300 - d) / 275))

/**
 * Numeric core of M6. Distances in metres, NaN / negative = unknown. Returns −1
 * only when no signal at all is known. Signals never stack: the best wins.
 */
export function m6Core(
  nearestTrackM: number,
  nearestDitchM: number,
  nearestStandEdgeM: number,
  hasInternalDitch: boolean,
  isDrainedPeatland: boolean,
  variant: ChanterelleVariant
): number {
  const track = nearestTrackM >= 0
  const ditch = nearestDitchM >= 0
  const edge = nearestStandEdgeM >= 0
  if (!track && !ditch && !edge && !hasInternalDitch && !isDrainedPeatland) return -1

  const w = CHANTERELLE_PARAMS[variant].edgeSignalWeights
  const trackSignal = track ? prox(nearestTrackM) : 0
  const ditchSignal = Math.max(ditch ? prox(nearestDitchM) : 0, hasInternalDitch ? 0.9 : 0, isDrainedPeatland ? 0.6 : 0)
  const edgeSignal = edge ? prox(nearestStandEdgeM) : 0
  const signal = Math.max(w.track * trackSignal, w.ditch * ditchSignal, w.standEdge * edgeSignal)
  return clamp(0.05 + 0.95 * signal)
}

/**
 * M6 — edge & disturbance proximity, the top folk signal for both species:
 * old forest tracks/paths with lightly worked, compacted ground for [K]; ditch
 * banks and bottoms for [S]; stand boundaries (age or height jumps) for both.
 * A drained peatland stand carries its own internal ditch network. The best
 * single signal wins (edges don't stack); the interior keeps a floor — it
 * isn't hopeless, the edge is just better. (species/chantarelle.md §M6)
 */
export function m6Edges(input: ChanterelleInput, variant: ChanterelleVariant): FactorResult {
  const { nearestTrackM, nearestDitchM, nearestStandEdgeM, ditchesIntersectingCount, isDrainedPeatland } = input
  const hasInternalDitch = ditchesIntersectingCount !== null && ditchesIntersectingCount > 0
  const subScore = m6Core(
    nearestTrackM ?? -1,
    nearestDitchM ?? -1,
    nearestStandEdgeM ?? -1,
    hasInternalDitch,
    isDrainedPeatland === true,
    variant
  )
  if (subScore < 0) return { subScore: null, confidence: 'low', drivers: [] }

  const drivers: string[] = []
  if (nearestTrackM !== null && prox(nearestTrackM) > 0.6) {
    drivers.push(`metsätie tai polku ${Math.round(nearestTrackM)} m päässä, kulje sen reunoja`)
  }
  if (hasInternalDitch) {
    drivers.push(
      ditchesIntersectingCount === 1
        ? 'oja halkoo metsikköä, tarkista penkat'
        : `${ditchesIntersectingCount} ojaa halkoo metsikköä, tarkista penkat`
    )
  } else if (nearestDitchM !== null && prox(nearestDitchM) > 0.6) {
    drivers.push(`oja ${Math.round(nearestDitchM)} m päässä`)
  } else if (isDrainedPeatland === true) {
    drivers.push('ojitettu metsikkö (ojaverkosto sisällä)')
  }
  if (nearestStandEdgeM !== null && prox(nearestStandEdgeM) > 0.6 && drivers.length === 0) {
    drivers.push(`metsikön reuna ${Math.round(nearestStandEdgeM)} m päässä`)
  }
  if (subScore < 0.05 + 0.95 * 0.2) drivers.push('syvällä metsikön sisällä, kaukana reunoista ja poluista')

  return { subScore, confidence: 'high', drivers }
}
