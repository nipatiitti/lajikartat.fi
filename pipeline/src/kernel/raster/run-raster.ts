import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { encodeComposite } from '@raster'
import { isLayerAvailable } from '../acquire'
import { skirtTileRefs, TILE_SIZE_M, type RegionPreset, type TileRef } from '../config'
import { OUT_DIR } from '../load'
import type { MmlClient } from '../sources/mml'
import { warmTiles } from '../tile-context'
import type { RasterSpecies, RasterTileRef } from '../types'
import { buildRasterContext } from './context'
import { encodeGeoTiffU8 } from './geotiff-write'
import { gridSize, MVMI, rasterTileRef } from './lattice'
import type { LukeRasterSource } from './sources/luke'

export interface RunRasterOptions {
  /** Also write per-factor Float32 sidecars (`<ix>_<iy>.<factor>.f32`) for calibration. */
  debug?: boolean
  /** Restrict to these tiles (for iteration), as "ix,iy". */
  only?: string[]
}

export interface TileHistogram {
  ix: number
  iy: number
  /** Counts of the encoded byte 0..255 (0 = nodata). */
  bins: number[]
  valid: number
  cells: number
}

export function rasterOutDir(species: string, region: string): string {
  return join(OUT_DIR, 'raster', species, region)
}

/**
 * Score a region tile by tile. Phase 0 drops tiles with no forest land, phase
 * 1 warms the vector tiles into the disk cache, phase 2 scores and writes one
 * GeoTIFF + histogram per tile under out/raster/<species>/<region>/tiles/.
 */
export async function runRaster(
  species: RasterSpecies,
  region: RegionPreset,
  deps: { mml: MmlClient; luke: LukeRasterSource },
  opts: RunRasterOptions = {}
): Promise<{ tiles: number; scored: number; outDir: string }> {
  const { nx, ny } = gridSize(region.bbox3067)
  const outDir = rasterOutDir(species.id, region.id)
  const tilesDir = join(outDir, 'tiles')
  await mkdir(tilesDir, { recursive: true })

  // Phase 0 — enumerate tiles and drop the ones without forest land.
  const all: RasterTileRef[] = []
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) all.push(rasterTileRef(ix, iy, region.bbox3067))
  const wanted = opts.only ? new Set(opts.only) : null
  console.log(`Phase 0: ${all.length} tiles, checking forest cover (maaluokka)…`)
  const tiles: RasterTileRef[] = []
  for (const ref of all) {
    if (wanted && !wanted.has(`${ref.ix},${ref.iy}`)) continue
    const maaluokka = await deps.luke.readWindow('mvmi', 'maaluokka', ref.bbox3067)
    let forest = 0
    for (let i = 0; i < maaluokka.length; i++) if (maaluokka[i] === 1) forest++
    if (forest > 0) tiles.push(ref)
  }
  console.log(`  ${tiles.length} tiles hold forest land`)

  // Phase 1 — vector tiles (tile + 1 skirt) into the disk cache.
  const available = species.layers.filter(isLayerAvailable)
  const uniqueRefs = new Map<string, TileRef>()
  for (const t of tiles) {
    for (const ref of skirtTileRefs(t.ix, t.iy, region.bbox3067, TILE_SIZE_M, 1)) uniqueRefs.set(`${ref.ix},${ref.iy}`, ref)
  }
  console.log(`Phase 1: fetching ${available.length} layers × ${uniqueRefs.size} tiles (cached tiles skip)…`)
  const dlStart = Date.now()
  await warmTiles(available, [...uniqueRefs.values()], deps.mml, 5, (n, total) => {
    if (n % 20 === 0 || n === total) {
      const elapsed = (Date.now() - dlStart) / 1000
      process.stdout.write(`\r  ${n}/${total} fetched — ${elapsed.toFixed(0)}s   `)
    }
  })
  process.stdout.write('\n')

  // Phase 2 — score.
  console.log(`Phase 2: scoring ${tiles.length} tiles…`)
  const scoreStart = Date.now()
  let done = 0
  let cellsValid = 0
  for (const ref of tiles) {
    const ctx = await buildRasterContext(species, ref, region.bbox3067, deps)
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
      encodeGeoTiffU8(bytes, ref.width, ref.height, { minX: ref.bbox3067[0], maxY: ref.bbox3067[3], cellM: MVMI.cell, nodata: 0 })
    )
    const hist: TileHistogram = { ix: ref.ix, iy: ref.iy, bins, valid, cells: n }
    await writeFile(`${base}.hist.json`, JSON.stringify(hist))
    if (opts.debug) {
      for (const [id, arr] of Object.entries(result.factors)) {
        await writeFile(`${base}.${id}.f32`, new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))
      }
      await writeFile(`${base}.confidence.u8`, result.confidence)
    }
    if (++done % 5 === 0 || done === tiles.length) {
      const elapsed = (Date.now() - scoreStart) / 1000
      process.stdout.write(`\r  ${done}/${tiles.length} tiles scored — ${elapsed.toFixed(0)}s   `)
    }
  }
  process.stdout.write('\n')

  await writeFile(
    join(outDir, 'run.json'),
    JSON.stringify(
      {
        species: species.id,
        region: region.id,
        bbox3067: region.bbox3067,
        tiles: tiles.map((t) => ({ ix: t.ix, iy: t.iy, bbox3067: t.bbox3067, width: t.width, height: t.height })),
        cellsValid,
        finishedAt: new Date().toISOString()
      },
      null,
      2
    )
  )
  return { tiles: tiles.length, scored: cellsValid, outDir }
}
