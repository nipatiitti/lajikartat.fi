import { clamp } from '../../core/math'
import { CHANTERELLE_PARAMS } from '../params'
import type { ChanterelleVariant } from '../types'

/**
 * 1 at ≤ 25 m, linear → 0 at 300 m. Managed forest is dense with tracks and
 * ditches, so a generous decay (formerly 50→400 m) saturated this factor for
 * nearly every cell and erased its ranking signal.
 */
const prox = (d: number): number => (d <= 25 ? 1 : clamp((300 - d) / 275))

/**
 * M6 — edge & disturbance proximity, the top folk signal for both species:
 * old forest tracks/paths with lightly worked, compacted ground for [K]; ditch
 * banks and bottoms for [S]; stand boundaries (age or height jumps) for both.
 * A drained peatland cell carries its own internal ditch network. The best
 * single signal wins (edges don't stack); the interior keeps a floor — it
 * isn't hopeless, the edge is just better. Distances in metres, NaN / negative
 * = unknown; −1 only when no signal at all is known. (species/chanterelle.md §M6)
 */
export function m6Core(
  nearestTrackM: number,
  nearestDitchM: number,
  nearestStandEdgeM: number,
  isDrainedPeatland: boolean,
  variant: ChanterelleVariant
): number {
  const track = nearestTrackM >= 0
  const ditch = nearestDitchM >= 0
  const edge = nearestStandEdgeM >= 0
  if (!track && !ditch && !edge && !isDrainedPeatland) return -1

  const w = CHANTERELLE_PARAMS[variant].edgeSignalWeights
  const trackSignal = track ? prox(nearestTrackM) : 0
  const ditchSignal = Math.max(ditch ? prox(nearestDitchM) : 0, isDrainedPeatland ? 0.6 : 0)
  const edgeSignal = edge ? prox(nearestStandEdgeM) : 0
  const signal = Math.max(w.track * trackSignal, w.ditch * ditchSignal, w.standEdge * edgeSignal)
  return clamp(0.05 + 0.95 * signal)
}
