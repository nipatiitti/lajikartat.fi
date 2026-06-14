import type { FeatureSpecies } from '../../kernel/types'
import { extractPerchCandidates } from './candidates'
import { PERCH_LAYERS } from './layers'
import { scorePerchCandidate } from './score'

export const perch: FeatureSpecies = {
  id: 'perch',
  kind: 'feature',
  layers: PERCH_LAYERS,
  candidateLayerKey: 'water',
  extractCandidates: extractPerchCandidates,
  score: scorePerchCandidate,
  render: { type: 'vector', colorBy: 'composite' }
}
