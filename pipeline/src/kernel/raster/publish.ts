import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { open, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PMTiles, type RangeResponse, type Source } from 'pmtiles'
import { REGIONS } from '../config'
import { OUT_DIR } from '../load'
import { rasterOutDir } from './run-raster'

// Publish a scored raster region as one PMTiles archive:
//   pnpm --filter @lajikartat/pipeline publish:raster <species> <region>
// GDAL (conda env "lajikartat") mosaics the tile GeoTIFFs, warps them to web
// mercator PNG tiles in an MBTiles file and builds the overview pyramid; the
// pmtiles CLI converts that to a single archive. Everything model-related has
// already happened — this step only reprojects and packages bytes.

export const RASTER_VERSION = 'v2'
export const RASTER_TILE_SIZE = 256

const [speciesId, regionId] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!speciesId || !regionId || !REGIONS[regionId]) {
  console.error('usage: tsx src/kernel/raster/publish.ts <species> <region>')
  process.exit(1)
}
const region = REGIONS[regionId]

const gdalBin = process.env.GDAL_BIN_DIR ?? join(homedir(), 'miniconda3', 'envs', 'lajikartat', 'bin')
const pmtilesBin = process.env.PMTILES_BIN ?? join(homedir(), '.local', 'bin', 'pmtiles')
for (const [what, p] of [
  ['gdalbuildvrt', join(gdalBin, 'gdalbuildvrt')],
  ['gdalwarp', join(gdalBin, 'gdalwarp')],
  ['gdaladdo', join(gdalBin, 'gdaladdo')],
  ['gdal_translate', join(gdalBin, 'gdal_translate')],
  ['pmtiles', pmtilesBin]
]) {
  if (!existsSync(p)) {
    console.error(`${what} not found at ${p} — run pipeline/scripts/setup-tools.sh (or set GDAL_BIN_DIR / PMTILES_BIN)`)
    process.exit(1)
  }
}

const outDir = rasterOutDir(speciesId, regionId)
const tilesDir = join(outDir, 'tiles')
const vrt = join(outDir, 'mosaic.vrt')
const warped = join(outDir, 'mercator.tif')
const mbtiles = join(outDir, 'raster.mbtiles')

// Native zoom for 16 m cells at Finnish latitudes: z12 is 38,2 m/px on the
// mercator plane, which at 61° N is 18,5 m on the ground.
export const RASTER_NATIVE_ZOOM = 12
const MERCATOR_HALF = 20037508.342789244
const zoomRes = (z: number) => (2 * MERCATOR_HALF) / (RASTER_TILE_SIZE * 2 ** z)
const pmtiles = join(outDir, 'raster.pmtiles')

function run(cmd: string, args: string[]) {
  console.log(`\n$ ${cmd.split('/').pop()} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, GDAL_CACHEMAX: '1024' } })
  if (r.status !== 0) {
    console.error(`${cmd} exited with ${r.status}`)
    process.exit(1)
  }
}

const tifs = (await readdir(tilesDir)).filter((f) => f.endsWith('.tif'))
if (tifs.length === 0) {
  console.error(`no tiles under ${tilesDir} — run ingest first`)
  process.exit(1)
}
const listPath = join(outDir, 'tiles.txt')
await writeFile(listPath, tifs.map((f) => join(tilesDir, f)).join('\n') + '\n')

// 1 mosaic (a VRT references the tiles, no copy)
run(join(gdalBin, 'gdalbuildvrt'), ['-overwrite', '-srcnodata', '0', '-vrtnodata', '0', '-input_file_list', listPath, vrt])

// 2 warp to web mercator on the z12 tile lattice (-tap aligns pixels to the
//   grid); nearest keeps the byte codes exact; alpha marks nodata.
const res = zoomRes(RASTER_NATIVE_ZOOM)
await rm(warped, { force: true })
run(join(gdalBin, 'gdalwarp'), [
  '-overwrite', '-t_srs', 'EPSG:3857', '-tr', String(res), String(res), '-tap', '-r', 'near', '-dstalpha',
  '-multi', '-wo', 'NUM_THREADS=ALL_CPUS', '-co', 'COMPRESS=DEFLATE', '-co', 'TILED=YES', vrt, warped
])

// 3 cut into PNG tiles (MBTiles) at exactly that zoom
await rm(mbtiles, { force: true })
run(join(gdalBin, 'gdal_translate'), [
  '-of', 'MBTILES', '-co', `ZOOM_LEVEL=${RASTER_NATIVE_ZOOM}`, '-co', 'TILE_FORMAT=PNG', '-co', 'RESAMPLING=NEAREST',
  '-co', `NAME=${speciesId}-${regionId}`, warped, mbtiles
])

// 4 pyramid down to ~z4 (average of the decoded values, alpha-aware)
run(join(gdalBin, 'gdaladdo'), ['-r', 'average', mbtiles, '2', '4', '8', '16', '32', '64', '128', '256'])

// 5 single archive
await rm(pmtiles, { force: true })
run(pmtilesBin, ['convert', mbtiles, pmtiles])

// 6 read the header back for the dataset row
class NodeFileSource implements Source {
  constructor(private path: string) {}
  getKey() {
    return this.path
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const fh = await open(this.path, 'r')
    try {
      const buf = new Uint8Array(length)
      const { bytesRead } = await fh.read(buf, 0, length, offset)
      return { data: buf.buffer.slice(0, bytesRead) }
    } finally {
      await fh.close()
    }
  }
}
const header = await new PMTiles(new NodeFileSource(pmtiles)).getHeader()
const meta = {
  bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
  minzoom: header.minZoom,
  maxzoom: header.maxZoom,
  tileSize: RASTER_TILE_SIZE,
  regionLabel: region.label
}
console.log(`\nraster.pmtiles: zoom ${header.minZoom}–${header.maxZoom}, ${header.numAddressedTiles} tiles, bounds ${meta.bounds.map((b) => b.toFixed(3)).join(' ')}`)

// 7 dataset row (local D1 first; the same file loads remotely)
const r2Key = `tiles/${speciesId}/${regionId}/${RASTER_VERSION}/raster.pmtiles`
const now = Math.floor(Date.now() / 1000)
const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const sqlPath = join(OUT_DIR, `${speciesId}-${regionId}.dataset.sql`)
await writeFile(
  sqlPath,
  [
    `DELETE FROM species_dataset WHERE species = ${q(speciesId)} AND region = ${q(regionId)} AND pipeline_version = ${q(RASTER_VERSION)} AND kind = 'raster-tiles';`,
    `INSERT INTO species_dataset (species, region, pipeline_version, kind, r2_key, published_at, meta) VALUES (` +
      `${q(speciesId)}, ${q(regionId)}, ${q(RASTER_VERSION)}, 'raster-tiles', ${q(r2Key)}, ${now}, ${q(JSON.stringify(meta))});`,
    ''
  ].join('\n')
)
console.log(`\nWrote ${sqlPath}\n\nLoad locally:\n  pnpm exec wrangler r2 object put lajikartat-geometry/${r2Key} --file=${pmtiles} --local\n  pnpm exec wrangler d1 execute DB --local --file=${sqlPath}`)
