import type { FeatureCollection } from 'geojson'
import { filterLayerFeatures, isLayerAvailable } from '../acquire'
import { skirtTileRefs, TILE_SIZE_M } from '../config'
import type { MmlClient } from '../sources/mml'
import { rawLayerTile } from '../tile-context'
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
  /** Cells of padding around the tile for distance rasters (200 = 3.2 km, covers the 3 km road cap). */
  padCells?: number
}

const CELL = MVMI.cell
/** Padding (cells) for the MVMI bands so stand edges just outside the tile are seen. */
const BAND_PAD = 20

// Small LRU of raw (3067) vector tiles: neighbouring scoring tiles share 6 of
// their 9 skirt tiles, and JSON.parse of a 2–9 MB tile is the expensive part.
const rawLru = new Map<string, FeatureCollection | null>()
const RAW_LRU_MAX = 64

async function rawTile(layer: LayerSpec, ref: RasterTileRef['vectorRef'], mml: MmlClient): Promise<FeatureCollection | null> {
  const key = `${layer.source}:${layer.resolve.join('|')}:${layer.params?.typeName ?? ''}:${ref.bbox.join('_')}`
  if (rawLru.has(key)) {
    const v = rawLru.get(key) ?? null
    rawLru.delete(key)
    rawLru.set(key, v)
    return v
  }
  const v = await rawLayerTile(layer, ref, mml)
  rawLru.set(key, v)
  if (rawLru.size > RAW_LRU_MAX) {
    const oldest = rawLru.keys().next().value
    if (oldest !== undefined) rawLru.delete(oldest)
  }
  return v
}

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

/**
 * Assemble everything a raster species needs for one tile: national raster
 * windows (padded, then cropped on access) and the vector layers of the tile's
 * 3×3 vector skirt rasterised onto a padded grid, with distance / count /
 * class primitives memoised per layer.
 */
export async function buildRasterContext(
  species: RasterSpecies,
  ref: RasterTileRef,
  region: Bbox,
  deps: RasterContextDeps
): Promise<RasterContext> {
  const { luke, mml } = deps
  const padCells = deps.padCells ?? 200
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
      b = crop(p, bandW, BAND_PAD, width, height, p instanceof Int16Array ? new Int16Array(width * height) : new Uint16Array(width * height))
      bands.set(key, b)
    }
    return b
  }
  const productOf = new Map(species.rasters.map((r) => [r.key, r.product] as const))

  // Vector layers over the skirt, rasterised lazily onto the padded grid.
  const gridBbox = paddedBbox(ref.bbox3067, padCells)
  const grid: GridSpec = {
    minX: gridBbox[0],
    maxY: gridBbox[3],
    cell: CELL,
    width: width + 2 * padCells,
    height: height + 2 * padCells
  }
  const skirt = skirtTileRefs(ref.ix, ref.iy, region, TILE_SIZE_M, 1)
  const layerFeatures = new Map<string, FeatureCollection | null>()
  const layerByKey = new Map(species.layers.map((l) => [l.key, l] as const))

  async function featuresOf(layerKey: string): Promise<FeatureCollection | null> {
    if (layerFeatures.has(layerKey)) return layerFeatures.get(layerKey) ?? null
    const layer = layerByKey.get(layerKey)
    let fc: FeatureCollection | null = null
    if (layer && isLayerAvailable(layer)) {
      const features = []
      let any = false
      for (const vref of skirt) {
        const raw = await rawTile(layer, vref, mml)
        if (!raw) continue
        any = true
        features.push(...filterLayerFeatures(layer, raw).features)
      }
      if (any) fc = { type: 'FeatureCollection', features }
      else if (!layer.optional) console.warn(`\n  ⚠ ${layerKey}: no data for tile ${ref.ix},${ref.iy}`)
    }
    layerFeatures.set(layerKey, fc)
    return fc
  }

  // Everything below is synchronous for the species; prefetch the features now.
  await Promise.all(species.layers.map((l) => featuresOf(l.key)))

  const distances = new Map<string, Float32Array>()
  const counts = new Map<string, Uint16Array>()
  const classes = new Map<string, { codes: Uint8Array; classes: string[] }>()
  let edgeDistance: Float32Array | null | undefined

  const cropF32 = (padded: Float32Array, capM: number) => {
    const out = crop(padded, grid.width, padCells, width, height, new Float32Array(width * height))
    for (let i = 0; i < out.length; i++) if (out[i] > capM) out[i] = capM
    return out
  }

  return {
    tile: ref,
    band,
    bandNodata: (key) => luke.nodata(productOf.get(key) ?? 'mvmi'),
    hasLayer: (key) => layerFeatures.get(key) != null,
    distanceTo(key, capM) {
      const memo = `${key}:${capM}`
      const hit = distances.get(memo)
      if (hit) return hit
      const fc = layerFeatures.get(key)
      if (!fc) return null
      const layer = layerByKey.get(key)
      const mask =
        layer?.geometry === 'polygon' ? rasterizePolygons(fc, grid, () => 1, rasterizeLines(fc, grid)) : rasterizeLines(fc, grid)
      const d = cropF32(distanceTransform(mask, grid.width, grid.height, CELL), capM)
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
      const out = crop(sums, grid.width, padCells, width, height, new Uint16Array(width * height))
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
          if (names.length >= 255) return 0
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
      const out = crop(d, bandW, BAND_PAD, width, height, new Float32Array(width * height))
      for (let i = 0; i < out.length; i++) if (out[i] > capM) out[i] = capM
      return (edgeDistance = out)
    }
  }
}
