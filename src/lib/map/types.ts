import type { Confidence } from '$lib/scoring/core/types'

// Properties carried by each candidate feature in the served GeoJSON (see pipeline
// load.ts `renderProps`). The map colours/filters straight off these; the full
// factor breakdown loads on demand via candidates.remote.
export interface CandidateProps {
  id: string
  name: string | null
  composite: number
  confidence: Confidence
  areaHa: number | null
}

export interface CandidateFilter {
  minComposite: number
}
