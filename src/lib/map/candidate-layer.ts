import type { FeatureCollection } from 'geojson'
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type { PaintOptions, StyleAdditions } from './types'

// Vector species: tappable candidate polygons coloured by composite. Pure spec
// factories plus the map calls that mutate them, so Map.svelte can rebuild
// everything fresh on basemap switches (transformStyle re-appends specs()).

export const SOURCE = 'candidates'
export const LAYER_FILL = 'candidates-fill'
export const LAYER_LINE = 'candidates-outline'

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }
// maplibre expression literals are typed too loosely to infer — build then cast.
const expr = (e: unknown): ExpressionSpecification => e as ExpressionSpecification

const fillOpacity = ({ opacity, visible }: PaintOptions): ExpressionSpecification | number =>
  visible ? expr(['case', ['boolean', ['feature-state', 'hover'], false], Math.min(opacity + 0.25, 1), opacity]) : 0
const lineOpacity = ({ visible }: PaintOptions): number => (visible ? 1 : 0)
const filterExpression = (minComposite: number): FilterSpecification =>
  ['>=', ['get', 'composite'], minComposite] as unknown as FilterSpecification

export function specs(geojson: FeatureCollection | null, paint: PaintOptions, minComposite: number): StyleAdditions {
  const filter = filterExpression(minComposite)
  return {
    sources: { [SOURCE]: { type: 'geojson', data: geojson ?? EMPTY, promoteId: 'id' } },
    layers: [
      {
        id: LAYER_FILL,
        type: 'fill',
        source: SOURCE,
        filter,
        paint: {
          'fill-color': expr(['interpolate', ['linear'], ['get', 'composite'], ...paint.ramp.flat()]),
          'fill-opacity': fillOpacity(paint)
        }
      },
      {
        id: LAYER_LINE,
        type: 'line',
        source: SOURCE,
        filter,
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
          'line-opacity': lineOpacity(paint)
        }
      }
    ]
  }
}

export const isMounted = (map: MlMap): boolean => Boolean(map.getSource(SOURCE))

export function unmount(map: MlMap): void {
  for (const id of [LAYER_FILL, LAYER_LINE]) if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(SOURCE)) map.removeSource(SOURCE)
}

export function setData(map: MlMap, geojson: FeatureCollection): void {
  ;(map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(geojson)
}

export function applyFilter(map: MlMap, minComposite: number): void {
  const filter = filterExpression(minComposite)
  map.setFilter(LAYER_FILL, filter)
  map.setFilter(LAYER_LINE, filter)
}

export function applyPaint(map: MlMap, paint: PaintOptions): void {
  map.setPaintProperty(LAYER_FILL, 'fill-opacity', fillOpacity(paint))
  map.setPaintProperty(LAYER_LINE, 'line-opacity', lineOpacity(paint))
}

export function setSelected(map: MlMap, id: string, selected: boolean): void {
  map.setFeatureState({ source: SOURCE, id }, { selected })
}

export function setHover(map: MlMap, id: string, hover: boolean): void {
  map.setFeatureState({ source: SOURCE, id }, { hover })
}
