import type { Confidence } from '$lib/scoring/core/types'

// Properties carried by each pond feature in the served GeoJSON (see pipeline load.ts
// `renderFeature`). The map colours/filters/ranks straight off these — no D1 round-trip.
export interface CandidateProps {
  id: string
  name: string | null
  composite: number
  confidence: Confidence
  f1: number | null
  f2: number | null
  f3: number | null
  f5: number | null
}

export interface CandidateFilter {
  minComposite: number
  confidences: Confidence[]
}

export const ALL_CONFIDENCES: Confidence[] = ['high', 'med', 'low']
