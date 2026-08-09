import type { Confidence } from '$lib/scoring/core/types'

// Properties carried by each candidate feature in the served GeoJSON (see pipeline
// load.ts `renderProps`). The map colours/filters/ranks straight off these — no
// D1 round-trip; the full factor breakdown loads on demand via candidates.remote.
export interface CandidateProps {
  id: string
  name: string | null
  composite: number
  confidence: Confidence
  areaHa: number | null
}

export interface CandidateFilter {
  minComposite: number
  confidences: Confidence[]
}

export type SortMode = 'score' | 'distance' | 'size'

export const ALL_CONFIDENCES: Confidence[] = ['high', 'med', 'low']
