import { clamp, logSaturate } from '../../core/math'

/** Buildings within 500 m at which the settlement signal has halved (a hamlet, not a lone barn). */
const BUILDINGS_HALF = 4
const CAR_ROAD_CAP_M = 2000

/**
 * M9 — remoteness / picking pressure (MODULATOR, mild). Distance from car roads
 * and settlement → fresher, un-picked fruiting bodies on the day. Deliberately
 * mild (mycelium persists, spots renew) and CAR-road based so it doesn't cancel
 * M6's forest-track signal. Min of the available signals; negative / NaN =
 * unknown; −1 when both unknown. (species/chanterelle.md §M9)
 */
export function m9Core(nearestCarRoadM: number, buildingsWithin500m: number): number {
  let s = Infinity
  if (nearestCarRoadM >= 0) s = Math.min(s, logSaturate(nearestCarRoadM, CAR_ROAD_CAP_M))
  if (buildingsWithin500m >= 0) s = Math.min(s, 1 / (1 + buildingsWithin500m / BUILDINGS_HALF))
  return s === Infinity ? -1 : clamp(s)
}
