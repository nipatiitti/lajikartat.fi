import { scoreChanterelleGrid, type ChanterelleVariant } from '@scoring'
import type { RasterSpecies } from '../../kernel/types'
import { CHANTERELLE_LAYERS, CHANTERELLE_RASTERS } from './layers'
import { buildGridInputs } from './raster-inputs'

/**
 * Both chanterelle variants share one raster plugin, parameterised here. Each
 * variant is its own species id (own route, own R2 archive). Every 16 m forest
 * cell of Luke's MS-NFI grid is scored; the map shows the surface as a heat
 * layer at all zooms and there are no discrete candidates.
 */
export function makeChanterelleSpecies(variant: ChanterelleVariant): RasterSpecies {
  return {
    id: variant,
    kind: 'raster',
    layers: CHANTERELLE_LAYERS,
    rasters: CHANTERELLE_RASTERS,
    scoreTile(ctx) {
      const out = scoreChanterelleGrid(buildGridInputs(ctx), variant)
      return { composite: out.composite, confidence: out.confidence, factors: out.factors }
    },
    render: { type: 'raster', ramp: 'diverging' }
  }
}

export const kantarelli = makeChanterelleSpecies('kantarelli')
export const suppilovahvero = makeChanterelleSpecies('suppilovahvero')
