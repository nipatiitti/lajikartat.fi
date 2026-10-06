import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { encodeComposite } from '@raster'
import type { FeatureCollection } from 'geojson'
import { isLayerAvailable } from '../acquire'
import { skirtTileRefs, tileRefs, type Bbox, type TileRef } from '../config'
import { OUT_DIR } from '../load'
import { progress, warn } from '../progress'
import type { MmlClient } from '../sources/mml'
import { TileCache } from '../tile-cache'
import { warmTiles } from '../tile-context'
import type { RasterSpecies, RasterTileRef } from '../types'
import { buildRasterContext } from './context'
import { encodeGeoTiffU8 } from './geotiff-write'
import { MVMI, rasterTileRef } from './lattice'
import type { LukeRasterSource } from './sources/luke'

export interface RunRasterOptions {
  /** Only score national tiles intersecting this EPSG:3067 bbox (dev runs); default: all. */
  bbox?: Bbox
  /** Also write per-factor Float32 sidecars (`<ix>_<iy>.<factor>.f32`) for calibration. */
  debug?: boolean
}

export interface TileHistogram {
  ix: number
  iy: number
  /** Counts of the encoded byte 0..255 (0 = nodata). */
  bins: number[]
  valid: number
  cells: number
}

/** Tiles listed in `out/<species>/run.json` after a run. */
export interface RunManifest {
  species: string
  bbox3067: Bbox | null
  tiles: Array<{ ix: number; iy: number }>
  cellsValid: number
  finishedAt: string
}

/** Raw vector tiles kept in memory across scoring tiles (JSON.parse of a 2–9 MB tile is the cost). */
const RAW_TILE_CACHE = 64

export const rasterOutDir = (species: string): string => join(OUT_DIR, species)

/**
 * Score national tiles one by one. Phase 0 drops tiles with no forest land,
 * phase 1 warms the vector tiles into the disk cache, phase 2 scores and writes
 * one GeoTIFF + histogram per tile under out/<species>/tiles/.
 */
export async function runRaster(
  species: RasterSpecies,
  deps: { mml: MmlClient; luke: LukeRasterSource },
  opts: RunRasterOptions = {}
): Promise<{ tiles: number; scored: number; outDir: string }> {
  const outDir = rasterOutDir(species.id)
  const tilesDir = join(outDir, 'tiles')
  await mkdir(tilesDir, { recursive: true })

  // Phase 0 — enumerate tiles and drop the ones without forest land.
  const all = tileRefs(opts.bbox).map((t) => rasterTileRef(t.ix, t.iy))
  console.log(`Phase 0: ${all.length} tiles, checking forest cover (maaluokka)…`)
  const tiles: RasterTileRef[] = []
  for (const ref of all) {
    const maaluokka = await deps.luke.readWindow('mvmi', 'maaluokka', ref.bbox3067)
    if (maaluokka.some((v) => v === 1)) tiles.push(ref)
  }
  console.log(`  ${tiles.length} tiles hold forest land`)

  // Phase 1 — vector tiles (tile + 1 skirt) into the disk cache.
  const available = species.layers.filter(isLayerAvailable)
  const uniqueRefs = new Map<string, TileRef>()
  for (const t of tiles) for (const ref of skirtTileRefs(t.ix, t.iy)) uniqueRefs.set(`${ref.ix},${ref.iy}`, ref)
  console.log(`Phase 1: fetching ${available.length} layers × ${uniqueRefs.size} tiles (cached tiles skip)…`)
  const fetching = progress('fetched', available.length * uniqueRefs.size, 20)
  await warmTiles(available, [...uniqueRefs.values()], deps.mml, warn, fetching.tick)
  fetching.end()

  // Phase 2 — score.
  console.log(`Phase 2: scoring ${tiles.length} tiles…`)
  const scoring = progress('tiles scored', tiles.length, 5)
  const ctxDeps = { ...deps, rawTiles: new TileCache<FeatureCollection | null>(RAW_TILE_CACHE), onWarn: warn }
  let cellsValid = 0
  for (const ref of tiles) {
    const ctx = await buildRasterContext(species, ref, ctxDeps)
    const result = species.scoreTile(ctx)
    const n = ref.width * ref.height
    const bytes = new Uint8Array(n)
    const bins = new Array<number>(256).fill(0)
    let valid = 0
    for (let i = 0; i < n; i++) {
      const b = encodeComposite(result.composite[i])
      bytes[i] = b
      bins[b]++
      if (b > 0) valid++
    }
    cellsValid += valid
    const base = join(tilesDir, `${ref.ix}_${ref.iy}`)
    await writeFile(
      `${base}.tif`,
      encodeGeoTiffU8(bytes, ref.width, ref.height, {
        minX: ref.bbox3067[0],
        maxY: ref.bbox3067[3],
        cellM: MVMI.cell,
        nodata: 0
      })
    )
    const hist: TileHistogram = { ix: ref.ix, iy: ref.iy, bins, valid, cells: n }
    await writeFile(`${base}.hist.json`, JSON.stringify(hist))
    if (opts.debug) {
      for (const [id, arr] of Object.entries(result.factors)) {
        await writeFile(`${base}.${id}.f32`, new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))
      }
      await writeFile(`${base}.confidence.u8`, result.confidence)
    }
    scoring.tick()
  }
  scoring.end()

  const manifest: RunManifest = {
    species: species.id,
    bbox3067: opts.bbox ?? null,
    tiles: tiles.map((t) => ({ ix: t.ix, iy: t.iy })),
    cellsValid,
    finishedAt: new Date().toISOString()
  }
  await writeFile(join(outDir, 'run.json'), JSON.stringify(manifest, null, 2))
  return { tiles: tiles.length, scored: cellsValid, outDir }
}
