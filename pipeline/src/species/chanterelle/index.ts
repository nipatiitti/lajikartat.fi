import type { ChanterelleVariant } from '@scoring'
import type { FeatureSpecies } from '../../kernel/types'
import { extractChanterelleCandidates } from './candidates'
import { CHANTERELLE_LAYERS } from './layers'
import { makeChanterelleScorer } from './score'

/**
 * Both chanterelle variants share one plugin, parameterised here. Each variant
 * is its own species id (own route, own D1 rows, own R2 object) — the
 * species-discriminated schema needs nothing new. The publish gate keeps even
 * a full-Pirkanmaa stand run at perch-scale output.
 */
export function makeChanterelleSpecies(variant: ChanterelleVariant): FeatureSpecies {
  return {
    id: variant,
    kind: 'feature',
    layers: CHANTERELLE_LAYERS,
    candidateLayerKey: 'stands',
    extractCandidates: extractChanterelleCandidates,
    score: makeChanterelleScorer(variant),
    publish: { minComposite: 0.4, maxFeatures: 5000 },
    // Stands render as a heatmap at low zoom — the frontend needs the Point blob.
    publishCentroids: true,
    nameJoin: { maxDistanceM: 800 },
    render: { type: 'vector', colorBy: 'composite' }
  }
}

export const kantarelli = makeChanterelleSpecies('kantarelli')
export const suppilovahvero = makeChanterelleSpecies('suppilovahvero')
