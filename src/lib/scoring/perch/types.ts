export type AccessType = 'paved' | 'gravel' | 'gated' | 'trail' | 'none'

/**
 * Already-joined numeric inputs for the perch model. The ETL produces these by
 * composing the kernel's spatial primitives; the scoring library stays pure and
 * never touches geometry, the network, or a DB.
 */
export interface PerchInput {
  // F1 — fishing-pressure / remoteness
  nearestRoadDistanceM: number | null
  accessType: AccessType | null
  buildingsWithin100m: number | null
  isNamed: boolean
  // F2 — isolation / closed basin
  connectingStreamCount: number | null
  isHeadwater: boolean | null
  // F3 — water colour (v1 proxy: catchment soil composition)
  peatFraction: number | null
  eskerFraction: number | null
  // F5 — morphometry
  areaHa: number | null
  shorelineDevelopment: number | null
  maxDepthM: number | null
}
