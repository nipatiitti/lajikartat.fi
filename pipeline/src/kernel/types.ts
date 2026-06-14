import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson'
import type { CompositeResult } from '@scoring'

export type Confidence = 'high' | 'med' | 'low'
export type SourceId = 'mml' | 'gtk' | 'syke' | 'corine'
export type LayerGeometry = 'polygon' | 'line' | 'point' | 'raster'

/** A logical layer a species needs, decoupled from the live source schema. */
export interface LayerSpec {
  key: string
  source: SourceId
  /** Candidate collection-name substrings, resolved against the live schema. */
  resolve: string[]
  geometry: LayerGeometry
  /** Optional extra query params for the source connector. */
  params?: Record<string, string>
}

/** All acquired layers for a run, keyed by LayerSpec.key, reprojected to 4326. */
export type LayerBundle = Record<string, FeatureCollection>

export interface RegionMask {
  id: string
  /** Region boundary polygon in 4326 (clip mask), or null for unclipped. */
  polygon: Feature<Polygon | MultiPolygon> | null
  /** Region bbox in 4326: [minLng, minLat, maxLng, maxLat]. */
  bbox: [number, number, number, number]
}

export interface CandidateFeature {
  id: string
  name: string | null
  geometry: Feature<Polygon | MultiPolygon>
  areaHa: number
}

export interface ScoredCandidate {
  composite: number
  confidence: Confidence
  factors: CompositeResult['factors']
  why: CompositeResult['why']
}

/** Shared spatial primitives a feature species composes (see spatial/vector.ts). */
export interface JoinContext {
  /** Was this layer acquired at all? Distinguishes "no data" from a genuine zero. */
  hasLayer(layerKey: string): boolean
  nearestLine(
    feature: Feature<Geometry>,
    layerKey: string,
    maxMeters?: number
  ): { distanceM: number; properties: Record<string, unknown> } | null
  /** Features of any geometry within `meters` of the input feature. */
  featuresWithin(feature: Feature<Geometry>, layerKey: string, meters: number): Feature<Geometry>[]
  linesIntersecting(
    polygon: Feature<Polygon | MultiPolygon>,
    layerKey: string
  ): Feature<LineString | MultiLineString>[]
  containingPolygon(point: Feature<Point>, layerKey: string): Feature<Polygon | MultiPolygon> | null
  areaFractionByClass(
    polygon: Feature<Polygon | MultiPolygon>,
    layerKey: string,
    classField: string
  ): Record<string, number>
}

interface SpeciesBase {
  id: string
  layers: LayerSpec[]
}

/** Discrete-feature species (perch): each unit scored individually. */
export interface FeatureSpecies extends SpeciesBase {
  kind: 'feature'
  /** Layer key the candidates come from — acquired region-wide; other layers are
   * then fetched only around candidates (candidate-driven acquisition). */
  candidateLayerKey: string
  extractCandidates(bundle: LayerBundle, region: RegionMask): CandidateFeature[]
  score(candidate: CandidateFeature, ctx: JoinContext): ScoredCandidate
  render: { type: 'vector'; colorBy: string }
}

export interface GridCell {
  lng: number
  lat: number
}

export interface RasterContext {
  sample(layerKey: string, lng: number, lat: number): number | string | null
}

/** Continuous-raster species (chanterelle): a suitability surface. Sketch-only. */
export interface RasterSpecies extends SpeciesBase {
  kind: 'raster'
  grid: { cellSizeM: number }
  scoreCell(cell: GridCell, ctx: RasterContext): number
  render: { type: 'raster'; ramp: string }
}

export type SpeciesPlugin = FeatureSpecies | RasterSpecies
