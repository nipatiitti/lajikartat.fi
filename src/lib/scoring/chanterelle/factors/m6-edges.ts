import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleInput, ChanterelleVariant } from '../types'

/**
 * 1 at ≤ 25 m, linear → 0 at 300 m. Managed forest is dense with tracks and
 * ditches, so a generous decay (formerly 50→400 m) saturated this factor for
 * nearly every stand and erased its ranking signal.
 */
const prox = (d: number): number => (d <= 25 ? 1 : clamp((300 - d) / 275))

/**
 * M6 — edge & disturbance proximity, the top folk signal for both species:
 * old forest tracks/paths with lightly worked, compacted ground for [K]; ditch
 * banks and bottoms for [S]. A drained peatland stand carries its own internal
 * ditch network. The best single signal wins (edges don't stack); the stand
 * interior keeps a floor — it isn't hopeless, the edge is just better.
 * (species/chantarelle.md §M6)
 */
export function m6Edges(input: ChanterelleInput, variant: ChanterelleVariant): FactorResult {
  const { nearestTrackM, nearestDitchM, ditchesIntersectingCount, isDrainedPeatland } = input
  if (nearestTrackM === null && nearestDitchM === null && ditchesIntersectingCount === null) {
    return { subScore: null, confidence: 'low', drivers: [] }
  }

  const w = CHANTERELLE_PARAMS[variant].edgeSignalWeights
  const drivers: string[] = []

  const trackSignal = nearestTrackM !== null ? prox(nearestTrackM) : 0
  const hasInternalDitch = ditchesIntersectingCount !== null && ditchesIntersectingCount > 0
  const ditchSignals = [
    nearestDitchM !== null ? prox(nearestDitchM) : 0,
    hasInternalDitch ? 0.9 : 0,
    isDrainedPeatland === true ? 0.6 : 0
  ]
  const ditchSignal = Math.max(...ditchSignals)

  if (trackSignal > 0.6 && nearestTrackM !== null) {
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

  const signal = Math.max(w.track * trackSignal, w.ditch * ditchSignal)
  if (signal < 0.2) drivers.push('syvällä metsikön sisällä, kaukana reunoista ja poluista')

  return { subScore: clamp(0.05 + 0.95 * signal), confidence: 'high', drivers }
}
