import type { ExpressionSpecification, FilterSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { CandidateFilter } from './types'

// Candidate source/layer builders — pure spec factories so Map.svelte can
// rebuild everything fresh on basemap switches (never copy specs from a
// previous style; transformStyle re-appends these on top).

export const SOURCE_CANDIDATES = 'candidates'
export const SOURCE_CENTROIDS = 'candidate-centroids'
export const LAYER_FILL = 'candidates-fill'
export const LAYER_LINE = 'candidates-outline'
export const LAYER_HEAT = 'candidates-heat'

// Heatmap → polygon crossfade (tune here): heat fades OUT over HEAT_FADE,
// polygons fade IN over FILL_FADE, so stands are tappable from ~z12.3 up.
const HEAT_FADE: [number, number] = [11.5, 13]
const FILL_FADE: [number, number] = [12, 12.8]
const HEAT_MAX_ZOOM = 13.5

export type RenderMode = 'polygon' | 'heatmap'

export interface CandidatePaintOptions {
  render: RenderMode
  /** [value, colour] ramp stops, ascending. */
  ramp: Array<[number, string]>
  /** User opacity slider 0..1. */
  opacity: number
  visible: boolean
}

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

// maplibre expression literals are typed too loosely to infer — build then cast.
const expr = (e: unknown): ExpressionSpecification => e as ExpressionSpecification

const rampColor = (ramp: Array<[number, string]>): ExpressionSpecification =>
  expr(['interpolate', ['linear'], ['get', 'composite'], ...ramp.flat()])

const hoverOpacity = (base: number): ExpressionSpecification =>
  expr(['case', ['boolean', ['feature-state', 'hover'], false], Math.min(base + 0.25, 1), base])

export function candidateSources(
  polygons: FeatureCollection | null,
  centroids: FeatureCollection | null
): Record<string, SourceSpecification> {
  return {
    [SOURCE_CANDIDATES]: { type: 'geojson', data: polygons ?? EMPTY_FC, promoteId: 'id' },
    [SOURCE_CENTROIDS]: { type: 'geojson', data: centroids ?? EMPTY_FC, promoteId: 'id' }
  }
}

export function fillOpacity(opts: CandidatePaintOptions): ExpressionSpecification | number {
  if (!opts.visible) return 0
  const base = hoverOpacity(opts.opacity)
  if (opts.render === 'polygon') return base
  return expr(['interpolate', ['linear'], ['zoom'], FILL_FADE[0], 0, FILL_FADE[1], base])
}

export function lineOpacity(opts: CandidatePaintOptions): ExpressionSpecification | number {
  if (!opts.visible) return 0
  if (opts.render === 'polygon') return 1
  return expr(['interpolate', ['linear'], ['zoom'], FILL_FADE[0] + 0.2, 0, FILL_FADE[1], 1])
}

export function heatmapOpacity(opts: CandidatePaintOptions): ExpressionSpecification | number {
  if (!opts.visible || opts.render !== 'heatmap') return 0
  return expr(['interpolate', ['linear'], ['zoom'], HEAT_FADE[0], 0.85 * opts.opacity, HEAT_FADE[1], 0])
}

/** All candidate layers, top-of-style order: heat under fill under outline. */
export function candidateLayers(opts: CandidatePaintOptions): LayerSpecification[] {
  const heat: LayerSpecification = {
    id: LAYER_HEAT,
    type: 'heatmap',
    source: SOURCE_CENTROIDS,
    maxzoom: HEAT_MAX_ZOOM,
    paint: {
      // Publish gate floors composite at 0.4 → renormalise the weight ramp
      // (fungi-specific; polygon species never render this layer).
      'heatmap-weight': expr([
        'interpolate',
        ['linear'],
        ['get', 'composite'],
        0.4,
        0.05,
        0.55,
        0.35,
        0.7,
        0.75,
        0.85,
        1
      ]),
      'heatmap-intensity': expr(['interpolate', ['linear'], ['zoom'], 9, 0.8, 13, 2.2]),
      'heatmap-radius': expr(['interpolate', ['exponential', 1.6], ['zoom'], 9, 8, 11, 18, HEAT_MAX_ZOOM, 42]),
      'heatmap-color': expr([
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(69, 117, 180, 0)',
        0.2,
        '#91bfdb',
        0.45,
        '#fee090',
        0.7,
        '#fc8d59',
        1,
        '#d73027'
      ]),
      'heatmap-opacity': heatmapOpacity(opts)
    }
  }

  const fill: LayerSpecification = {
    id: LAYER_FILL,
    type: 'fill',
    source: SOURCE_CANDIDATES,
    paint: {
      'fill-color': rampColor(opts.ramp),
      'fill-opacity': fillOpacity(opts)
    }
  }

  const line: LayerSpecification = {
    id: LAYER_LINE,
    type: 'line',
    source: SOURCE_CANDIDATES,
    paint: {
      'line-color': expr(['case', ['boolean', ['feature-state', 'selected'], false], '#111111', '#3a3a3a']),
      'line-width': expr([
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        2.5,
        ['boolean', ['feature-state', 'hover'], false],
        1.5,
        0.4
      ]),
      'line-opacity': lineOpacity(opts)
    }
  }

  return [heat, fill, line]
}

export function filterExpression(filter: CandidateFilter): FilterSpecification {
  return [
    'all',
    ['>=', ['get', 'composite'], filter.minComposite],
    ['in', ['get', 'confidence'], ['literal', filter.confidences]]
  ] as unknown as FilterSpecification
}
