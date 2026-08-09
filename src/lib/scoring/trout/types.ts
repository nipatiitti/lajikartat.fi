export type BufferingClass = 'high' | 'med' | 'low'

/**
 * Already-joined inputs for the trout (brown/brook) limiting-factor model. The ETL
 * composes these from the kernel's spatial primitives; the scoring library stays
 * pure. DEM-dependent inputs (elevation, channel gradient) are present in the shape
 * but fed `null` in the v1 cut — their factors simply lose that sub-signal and the
 * geometric mean carries on with what it has. (species/trout.md §4, §7)
 */
export interface TroutInput {
  // S1 — thermal regime (cold & stable): groundwater + springs now; shade/elevation deferred.
  inGroundwaterArea: boolean | null
  springsWithin500m: number | null
  reachElevationM: number | null // DEM-deferred

  // S2 — substrate / spawning gravel: GTK deposits along the channel; gradient deferred.
  gravelFraction: number | null
  fineSedimentFraction: number | null
  channelGradient: number | null // DEM-deferred

  // S3 — acidity / buffering (brown trout strict; puronieriä lenient — `lenientAcidity`).
  catchmentPeatFraction: number | null
  acidSulfatePresent: boolean | null
  bedrockBuffering: BufferingClass | null
  lenientAcidity: boolean // puronieriä variant tolerates lower pH

  // S5 — flow permanence & morphology: upstream catchment area; gradient deferred.
  upstreamAreaKm2: number | null

  // S4 — stream naturalness (SYKE PUROHELMI class 1–5, 5 = least altered).
  naturalnessClass: number | null

  // S6 — protective isolation: an impassable barrier downstream (approx: in catchment / nearby).
  impassableBarrierNearby: boolean | null

  // S9 — remoteness / low fishing & disturbance pressure.
  nearestRoadDistanceM: number | null
  buildingsWithin100m: number | null
  isNamed: boolean
}
