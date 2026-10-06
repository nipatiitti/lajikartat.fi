import type { ExpressionSpecification, LayerSpecification, Map as MlMap, SourceSpecification } from 'maplibre-gl'
import { clamp } from '$lib/scoring/core/math'
import { RASTER_MAX, byteToElevation, thresholdToByte } from '$lib/raster/encoding'
import type { SpeciesTileJson } from '../../routes/tiles/[species].json/+server'
import type { PaintOptions, StyleAdditions } from './types'

// Raster species: a 16 m suitability surface as raster-dem + color-relief.
// The grey byte of each tile (1..255 = composite 0..1, 0 = nodata) decodes to
// "elevation" through the custom encoding, so the Potentiaali slider is just a
// new colour expression — no data reload, no filter.

export const SOURCE = 'suitability-dem'
export const LAYER = 'suitability-relief'

const TRANSPARENT = 'rgba(0,0,0,0)'
const expr = (e: unknown): ExpressionSpecification => e as ExpressionSpecification

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Colour of the ramp at `v` (linear between stops, clamped at the ends). */
function rampColorAt(ramp: Array<[number, string]>, v: number): string {
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
  const min = clamp(minComposite)
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

const reliefOpacity = ({ opacity, visible }: PaintOptions): number => (visible ? opacity : 0)

export function specs(tiles: SpeciesTileJson, paint: PaintOptions, minComposite: number): StyleAdditions {
  return {
    sources: {
      [SOURCE]: {
        type: 'raster-dem',
        tiles: tiles.tiles,
        tileSize: tiles.tileSize,
        minzoom: tiles.minzoom,
        maxzoom: tiles.maxzoom,
        bounds: tiles.bounds,
        ...tiles.encoding
      } as SourceSpecification
    },
    layers: [
      {
        id: LAYER,
        type: 'color-relief',
        source: SOURCE,
        paint: {
          'color-relief-color': reliefColor(paint.ramp, minComposite),
          'color-relief-opacity': reliefOpacity(paint),
          // Linear sampling would blend nodata (0) with forest bytes and sweep
          // the whole ramp along every lake and field edge.
          resampling: 'nearest'
        }
      } as unknown as LayerSpecification
    ]
  }
}

export const isMounted = (map: MlMap): boolean => Boolean(map.getSource(SOURCE))

export function unmount(map: MlMap): void {
  if (map.getLayer(LAYER)) map.removeLayer(LAYER)
  if (map.getSource(SOURCE)) map.removeSource(SOURCE)
}

export function applyFilter(map: MlMap, ramp: Array<[number, string]>, minComposite: number): void {
  map.setPaintProperty(LAYER, 'color-relief-color', reliefColor(ramp, minComposite))
}

export function applyPaint(map: MlMap, paint: PaintOptions): void {
  map.setPaintProperty(LAYER, 'color-relief-opacity', reliefOpacity(paint))
}
