import type { FeatureCollection } from 'geojson'
import type { ExpressionSpecification, FilterSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl'
import { RASTER_MAX, byteToElevation, thresholdToByte } from '$lib/raster/encoding'
import type { SpeciesTileJson } from '../../routes/tiles/[species].json/+server'
import type { CandidateFilter } from './types'

// Candidate source/layer builders — pure spec factories so Map.svelte can
// rebuild everything fresh on basemap switches (never copy specs from a
// previous style; transformStyle re-appends these on top).

export const SOURCE_CANDIDATES = 'candidates'
export const SOURCE_CENTROIDS = 'candidate-centroids'
export const LAYER_FILL = 'candidates-fill'
export const LAYER_LINE = 'candidates-outline'
export const LAYER_HEAT = 'candidates-heat'
export const SOURCE_RELIEF = 'suitability-dem'
export const LAYER_RELIEF = 'suitability-relief'

// Heatmap → polygon crossfade (tune here): heat fades OUT over HEAT_FADE,
// polygons fade IN over FILL_FADE, so stands are tappable from ~z12.3 up.
const HEAT_FADE: [number, number] = [11.5, 13]
const FILL_FADE: [number, number] = [12, 12.8]
const HEAT_MAX_ZOOM = 13.5

export type RenderMode = 'polygon' | 'heatmap' | 'raster'

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
      'heatmap-radius': expr(['interpolate', ['exponential', 4], ['zoom'], 9, 8, 11, 18, HEAT_MAX_ZOOM, 42]),
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
  return ['>=', ['get', 'composite'], filter.minComposite] as unknown as FilterSpecification
}

// ---- Raster species: a 16 m suitability surface as raster-dem + color-relief.
// The grey byte of each tile (1..255 = composite 0..1, 0 = nodata) decodes to
// "elevation" through the custom encoding, so the Potentiaali slider is just a
// new colour expression — no data reload, no filter.

const TRANSPARENT = 'rgba(0,0,0,0)'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Colour of the ramp at `v` (linear between stops, clamped at the ends). */
export function rampColorAt(ramp: Array<[number, string]>, v: number): string {
  if (v <= ramp[0][0]) return ramp[0][1]
  const last = ramp[ramp.length - 1]
  if (v >= last[0]) return last[1]
  for (let i = 0; i + 1 < ramp.length; i++) {
    const [v0, c0] = ramp[i]
    const [v1, c1] = ramp[i + 1]
    if (v >= v0 && v < v1) {
      const t = (v - v0) / (v1 - v0)
      const a = hexToRgb(c0)
      const b = hexToRgb(c1)
      const mix = a.map((x, k) => Math.round(x + (b[k] - x) * t))
      return `rgb(${mix[0]},${mix[1]},${mix[2]})`
    }
  }
  return last[1]
}

/**
 * color-relief colour expression: transparent below the threshold (a hard
 * step half a byte under it), the diverging ramp above. Stops are laid out in
 * tile-byte space and mapped to MapLibre "elevation" through the shared
 * encoding, so the ramp stays in composite units.
 */
export function reliefColor(ramp: Array<[number, string]>, minComposite: number): ExpressionSpecification {
  const min = Math.max(0, Math.min(1, minComposite))
  const bMin = thresholdToByte(min)
  const stops: Array<number | string> = [0, TRANSPARENT]
  if (bMin - 0.5 > 0) stops.push(byteToElevation(bMin - 0.5), TRANSPARENT)
  stops.push(byteToElevation(bMin), rampColorAt(ramp, min))
  let last = bMin
  for (const [v, c] of ramp) {
    const b = thresholdToByte(v)
    if (b <= last) continue
    stops.push(byteToElevation(b), c)
    last = b
  }
  if (last < RASTER_MAX) stops.push(byteToElevation(RASTER_MAX), ramp[ramp.length - 1][1])
  return expr(['interpolate', ['linear'], ['elevation'], ...stops])
}

export function reliefOpacity(opts: CandidatePaintOptions): number {
  return opts.visible ? opts.opacity : 0
}

export function rasterSources(tj: SpeciesTileJson): Record<string, SourceSpecification> {
  return {
    [SOURCE_RELIEF]: {
      type: 'raster-dem',
      tiles: tj.tiles,
      tileSize: tj.tileSize,
      minzoom: tj.minzoom,
      maxzoom: tj.maxzoom,
      bounds: tj.bounds,
      ...tj.encoding
    } as SourceSpecification
  }
}

export function rasterLayers(opts: CandidatePaintOptions, minComposite: number): LayerSpecification[] {
  return [
    {
      id: LAYER_RELIEF,
      type: 'color-relief',
      source: SOURCE_RELIEF,
      paint: {
        'color-relief-color': reliefColor(opts.ramp, minComposite),
        'color-relief-opacity': reliefOpacity(opts),
        // Linear sampling would blend nodata (0) with forest bytes and sweep
        // the whole ramp along every lake and field edge.
        resampling: 'nearest'
      }
    } as unknown as LayerSpecification
  ]
}
