import type { FeatureSpecies } from '../../kernel/types'
import { extractPerchCandidates } from './candidates'
import { PERCH_LAYERS } from './layers'
import { scorePerchCandidate } from './score'

// Public species id is Finnish (`ahven` — drives the route, D1 rows and R2
// keys); internal code names stay English.
export const ahven: FeatureSpecies = {
  id: 'ahven',
  kind: 'feature',
  layers: PERCH_LAYERS,
  candidateLayerKey: 'water',
  extractCandidates: extractPerchCandidates,
  score: scorePerchCandidate,
  // MML jarvi carries no name attribute — every pond is named (if at all) from
  // the nearest place-name point instead.
  nameJoin: { maxDistanceM: 400 },
  render: { type: 'vector', colorBy: 'composite' }
}
