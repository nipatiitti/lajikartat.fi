import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon
} from 'geojson'
import type { CompositeResult } from '@scoring'
import type { TileRef } from './config'

export type SourceId = 'mml' | 'gtk' | 'syke' | 'luke'

/** A logical vector layer a species needs, decoupled from the live source schema. */
export interface LayerSpec {
  key: string
  source: SourceId
  /** Candidate collection-name substrings, resolved against the live schema. */
  resolve: string[]
  geometry: 'polygon' | 'line' | 'point'
  /**
   * Optional extra query params for the source connector. Beyond the raw WFS
   * params (endpoint/typeName/outputFormat): `filterField` + `filterValues`
   * (csv) keep only features whose property matches, applied AFTER fetch so
   * layer keys sharing a collection also share the disk cache (e.g. tieviiva →
   * tracks vs car roads by `kohdeluokka`).
   */
  params?: Record<string, string>
  /** Raster pipelines: skip silently when the tile has no data for this layer
   * (e.g. GTK soil outside the cached area) instead of warning. */
  optional?: boolean
}

/** All acquired layers for a run, keyed by LayerSpec.key, reprojected to 4326. */
export type LayerBundle = Record<string, FeatureCollection>

export interface CandidateFeature {
  id: string
  name: string | null
  geometry: Feature<Geometry>
  /** Area in ha for polygon candidates. */
  areaHa: number | null
}

export type ScoredCandidate = Pick<CompositeResult, 'composite' | 'confidence' | 'why'>

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
  linesIntersecting(polygon: Feature<Polygon | MultiPolygon>, layerKey: string): Feature<LineString | MultiLineString>[]
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

/** Discrete-feature species (perch ponds): each unit scored individually. */
export interface FeatureSpecies extends SpeciesBase {
  kind: 'feature'
  /** Layer key the candidates come from — acquired over the run bbox; other
   * layers are then fetched only around candidates. */
  candidateLayerKey: string
  extractCandidates(bundle: LayerBundle): CandidateFeature[]
  score(candidate: CandidateFeature, ctx: JoinContext): ScoredCandidate
  /** Name each published candidate from the nearest MML paikannimi point
   * within maxDistanceM (optionally filtered by kohdeluokka). Never overwrites
   * a name the source data already provided. */
  nameJoin?: { maxDistanceM: number; kohdeluokka?: number[] }
}

/** A national raster theme a raster species samples (Luke MVMI / TWI). */
export interface RasterLayerSpec {
  key: string
  source: 'luke'
  product: 'mvmi' | 'twi'
  /** MVMI theme file stem (`ika`, `ppa`, …); ignored for `twi`. */
  theme: string
}

/** A 10 km scoring tile snapped to the 16 m MVMI lattice (see raster/lattice.ts). */
export interface RasterTileRef {
  ix: number
  iy: number
  /** Lattice-snapped EPSG:3067 bbox; tiles never overlap. */
  bbox3067: [number, number, number, number]
  /** Cells across / down (625 for a full tile). */
  width: number
  height: number
  /** The un-snapped vector tile whose bbox keys the MML disk cache. */
  vectorRef: TileRef
}

/**
 * Per-tile raster context: national raster windows plus rasterised vector
 * layers, all row-major (row 0 = north) over `tile.width × tile.height`.
 */
export interface RasterContext {
  tile: RasterTileRef
  /** Raw raster window for a RasterLayerSpec key, or null when unavailable. */
  band(key: string): Uint16Array | Int16Array | null
  /** Was this vector layer rasterised for the tile? */
  hasLayer(layerKey: string): boolean
  /** Euclidean distance (m) from each cell centre to the nearest feature of a line/polygon layer, capped at `capM`. */
  distanceTo(layerKey: string, capM: number): Float32Array | null
  /** Number of features (by centre point) within a square of half-width `radiusM` around each cell. */
  countWithin(layerKey: string, radiusM: number): Uint16Array | null
  /** Per-cell class code of a polygon layer (0 = none) with the code → class name table. */
  classCode(layerKey: string, classField: string): { codes: Uint8Array; classes: string[] } | null
  /** Distance (m) to the nearest stand boundary derived from MVMI discontinuities, capped. */
  standEdgeDistance(capM: number): Float32Array | null
}

interface RasterTileResult {
  /** Composite 0..1, NaN outside forest / no result. */
  composite: Float32Array
  /** 0 nodata, 1 low, 2 med, 3 high. */
  confidence: Uint8Array
  /** Per-factor sub-scores (NaN unknown) for calibration and debugging. */
  factors: Record<string, Float32Array>
}

/** Continuous-raster species (chanterelle): a suitability surface per 16 m cell. */
export interface RasterSpecies extends SpeciesBase {
  kind: 'raster'
  rasters: RasterLayerSpec[]
  scoreTile(ctx: RasterContext): RasterTileResult
}

export type SpeciesPlugin = FeatureSpecies | RasterSpecies
