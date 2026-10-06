import type { FeatureCollection } from 'geojson'
import { filterLayerFeatures, isLayerAvailable, rawLayerTile } from '../acquire'
import { skirtTileRefs } from '../config'
import type { MmlClient } from '../sources/mml'
import type { TileCache } from '../tile-cache'
import type { LayerSpec, RasterContext, RasterSpecies, RasterTileRef } from '../types'
import { DEFAULT_STAND_EDGE_OPTIONS, standEdgeMask } from './edges'
import { distanceTransform } from './edt'
import { MVMI, type Bbox } from './lattice'
import { rasterizeLines, rasterizePointCounts, rasterizePolygons, type GridSpec } from './rasterize'
import { boxSum, summedAreaTable } from './sat'
import type { LukeRasterSource } from './sources/luke'

export interface RasterContextDeps {
  luke: LukeRasterSource
  mml: MmlClient
  /** Raw (3067) vector tiles shared across scoring tiles: neighbours share 6 of their 9 skirt tiles. */
  rawTiles: TileCache<FeatureCollection | null>
  onWarn: (message: string) => void
}

const CELL = MVMI.cell
/** Padding (cells) for the MVMI bands so stand edges just outside the tile are seen. */
const BAND_PAD = 20
/** Padding (cells) for the vector grid so distance rasters see features up to 3,2 km outside the tile. */
const GRID_PAD = 200
/** The largest distance cap a species may ask for without the padding falsifying it. */
const MAX_DISTANCE_CAP_M = GRID_PAD * CELL

/** Crop a padded row-major grid to its centre `w × h` block. */
function crop<T extends Float32Array | Uint16Array | Int16Array | Uint8Array>(
  src: T,
  paddedW: number,
  pad: number,
  w: number,
  h: number,
  out: T
): T {
  for (let y = 0; y < h; y++) {
    const s = (y + pad) * paddedW + pad
    out.set(src.subarray(s, s + w) as never, y * w)
  }
  return out
}

function paddedBbox(bbox: Bbox, padCells: number): Bbox {
  const p = padCells * CELL
  return [bbox[0] - p, bbox[1] - p, bbox[2] + p, bbox[3] + p]
}

function capped(values: Float32Array, capM: number): Float32Array {
  if (capM > MAX_DISTANCE_CAP_M)
    throw new Error(`distance cap ${capM} m exceeds the grid padding (${MAX_DISTANCE_CAP_M} m)`)
  for (let i = 0; i < values.length; i++) if (values[i] > capM) values[i] = capM
  return values
}

/**
 * Assemble everything a raster species needs for one tile: national raster
 * windows (padded, then cropped on access) and the vector layers of the tile's
 * 3×3 skirt rasterised onto a padded grid, with distance / count / class
 * primitives memoised per layer.
 */
export async function buildRasterContext(
  species: RasterSpecies,
  ref: RasterTileRef,
  deps: RasterContextDeps
): Promise<RasterContext> {
  const { luke, mml, rawTiles, onWarn } = deps
  const { width, height } = ref

  // Raster bands (padded by BAND_PAD for the edge mask).
  const bandBbox = paddedBbox(ref.bbox3067, BAND_PAD)
  const bandW = width + 2 * BAND_PAD
  const bandH = height + 2 * BAND_PAD
  const paddedBands = new Map<string, Uint16Array | Int16Array>()
  await Promise.all(
    species.rasters.map(async (r) => {
      paddedBands.set(r.key, await luke.readWindow(r.product, r.theme, bandBbox))
    })
  )
  const bands = new Map<string, Uint16Array | Int16Array>()
  const band = (key: string) => {
    let b = bands.get(key)
    if (!b) {
      const p = paddedBands.get(key)
      if (!p) return null
      b = crop(
        p,
        bandW,
        BAND_PAD,
        width,
        height,
        p instanceof Int16Array ? new Int16Array(width * height) : new Uint16Array(width * height)
      )
      bands.set(key, b)
    }
    return b
  }

  // Vector layers over the skirt, rasterised lazily onto the padded grid.
  const gridBbox = paddedBbox(ref.bbox3067, GRID_PAD)
  const grid: GridSpec = {
    minX: gridBbox[0],
    maxY: gridBbox[3],
    cell: CELL,
    width: width + 2 * GRID_PAD,
    height: height + 2 * GRID_PAD
  }
  const skirt = skirtTileRefs(ref.ix, ref.iy)
  const layerFeatures = new Map<string, FeatureCollection | null>()
  const layerByKey = new Map(species.layers.map((l) => [l.key, l] as const))

  const rawTile = (layer: LayerSpec, vref: RasterTileRef['vectorRef']) =>
    rawTiles.remember(
      `${layer.source}:${layer.resolve.join('|')}:${layer.params?.typeName ?? ''}:${vref.bbox.join('_')}`,
      () => rawLayerTile(layer, vref, mml, onWarn)
    )

  async function loadLayer(layer: LayerSpec): Promise<void> {
    let fc: FeatureCollection | null = null
    if (isLayerAvailable(layer)) {
      const features = []
      let any = false
      for (const vref of skirt) {
        const raw = await rawTile(layer, vref)
        if (!raw) continue
        any = true
        features.push(...filterLayerFeatures(layer, raw).features)
      }
      if (any) fc = { type: 'FeatureCollection', features }
      else if (!layer.optional) onWarn(`${layer.key}: no data for tile ${ref.ix},${ref.iy}`)
    }
    layerFeatures.set(layer.key, fc)
  }
  await Promise.all(species.layers.map(loadLayer))

  const distances = new Map<string, Float32Array>()
  const counts = new Map<string, Uint16Array>()
  const classes = new Map<string, { codes: Uint8Array; classes: string[] }>()
  let edgeDistance: Float32Array | null | undefined

  return {
    tile: ref,
    band,
    hasLayer: (key) => layerFeatures.get(key) != null,
    distanceTo(key, capM) {
      const memo = `${key}:${capM}`
      const hit = distances.get(memo)
      if (hit) return hit
      const fc = layerFeatures.get(key)
      if (!fc) return null
      const layer = layerByKey.get(key)
      const mask =
        layer?.geometry === 'polygon'
          ? rasterizePolygons(fc, grid, () => 1, rasterizeLines(fc, grid))
          : rasterizeLines(fc, grid)
      const padded = distanceTransform(mask, grid.width, grid.height, CELL)
      const d = capped(crop(padded, grid.width, GRID_PAD, width, height, new Float32Array(width * height)), capM)
      distances.set(memo, d)
      return d
    },
    countWithin(key, radiusM) {
      const memo = `${key}:${radiusM}`
      const hit = counts.get(memo)
      if (hit) return hit
      const fc = layerFeatures.get(key)
      if (!fc) return null
      const pts = rasterizePointCounts(fc, grid)
      const sat = summedAreaTable(pts, grid.width, grid.height)
      const sums = boxSum(sat, grid.width, grid.height, Math.round(radiusM / CELL))
      const out = crop(sums, grid.width, GRID_PAD, width, height, new Uint16Array(width * height))
      counts.set(memo, out)
      return out
    },
    classCode(key, classField) {
      const memo = `${key}:${classField}`
      const hit = classes.get(memo)
      if (hit) return hit
      const fc = layerFeatures.get(key)
      if (!fc) return null
      const names: string[] = ['']
      const codeOf = new Map<string, number>()
      const tileGrid: GridSpec = { minX: ref.bbox3067[0], maxY: ref.bbox3067[3], cell: CELL, width, height }
      const codes = rasterizePolygons(fc, tileGrid, (f) => {
        const name = String((f.properties ?? {})[classField] ?? '')
        if (!name) return 0
        let c = codeOf.get(name)
        if (c === undefined) {
          if (names.length >= 255) return 0 // Uint8 code space exhausted; further classes read as "none"
          c = names.length
          names.push(name)
          codeOf.set(name, c)
        }
        return c
      })
      const out = { codes, classes: names }
      classes.set(memo, out)
      return out
    },
    standEdgeDistance(capM) {
      if (edgeDistance !== undefined) return edgeDistance
      const ika = paddedBands.get('ika')
      const h = paddedBands.get('keskipituus')
      if (!ika || !h) return (edgeDistance = null)
      const mask = standEdgeMask(ika, h, bandW, bandH, DEFAULT_STAND_EDGE_OPTIONS)
      const d = distanceTransform(mask, bandW, bandH, CELL)
      // Capped by the band padding, not the grid padding: edges further than
      // BAND_PAD cells outside the tile are unseen, so the cap must not exceed it.
      const out = crop(d, bandW, BAND_PAD, width, height, new Float32Array(width * height))
      const cap = Math.min(capM, BAND_PAD * CELL)
      for (let i = 0; i < out.length; i++) if (out[i] > cap) out[i] = cap
      return (edgeDistance = out)
    }
  }
}
