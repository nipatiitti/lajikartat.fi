import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { open, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PMTiles, type RangeResponse, type Source } from 'pmtiles'
import { fail, parseArgs } from '../cli'
import { datasetVersion, RASTER_NATIVE_ZOOM, RASTER_TILE_SIZE } from '../config'
import { datasetSql, writePublishManifest } from '../load'
import { rasterOutDir } from './run-raster'

// Publish a scored raster species as one PMTiles archive:
//   pnpm pipeline publish:raster <species>
// GDAL (conda env "lajikartat") mosaics the tile GeoTIFFs, warps them to web
// mercator PNG tiles in an MBTiles file and builds the overview pyramid; the
// pmtiles CLI converts that to a single archive. Everything model-related has
// already happened — this step only reprojects and packages bytes.

const { positional } = parseArgs(process.argv.slice(2))
const [speciesId] = positional
if (!speciesId) fail('usage: tsx src/kernel/raster/publish.ts <species>')

const gdalBin = process.env.GDAL_BIN_DIR ?? join(homedir(), 'miniconda3', 'envs', 'lajikartat', 'bin')
const pmtilesBin = process.env.PMTILES_BIN ?? join(homedir(), '.local', 'bin', 'pmtiles')
for (const [what, p] of [
  ['gdalbuildvrt', join(gdalBin, 'gdalbuildvrt')],
  ['gdalwarp', join(gdalBin, 'gdalwarp')],
  ['gdaladdo', join(gdalBin, 'gdaladdo')],
  ['gdal_translate', join(gdalBin, 'gdal_translate')],
  ['pmtiles', pmtilesBin]
]) {
  if (!existsSync(p))
    fail(`${what} not found at ${p} — run pipeline/scripts/setup-tools.sh (or set GDAL_BIN_DIR / PMTILES_BIN)`)
}

const outDir = rasterOutDir(speciesId)
const tilesDir = join(outDir, 'tiles')
const vrt = join(outDir, 'mosaic.vrt')
const warped = join(outDir, 'mercator.tif')
const mbtiles = join(outDir, 'raster.mbtiles')
const pmtiles = join(outDir, 'raster.pmtiles')

const MERCATOR_HALF = 20037508.342789244
const zoomRes = (z: number) => (2 * MERCATOR_HALF) / (RASTER_TILE_SIZE * 2 ** z)
/** Overview factors down from the native zoom (z11 … z4). */
const OVERVIEWS = ['2', '4', '8', '16', '32', '64', '128', '256']

function run(cmd: string, args: string[]) {
  console.log(`\n$ ${cmd.split('/').pop()} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, GDAL_CACHEMAX: '1024' } })
  if (r.status !== 0) fail(`${cmd} exited with ${r.status}`)
}

const tifs = (await readdir(tilesDir).catch(() => [] as string[])).filter((f) => f.endsWith('.tif'))
if (tifs.length === 0) fail(`no tiles under ${tilesDir} — run ingest first`)
const listPath = join(outDir, 'tiles.txt')
await writeFile(listPath, tifs.map((f) => join(tilesDir, f)).join('\n') + '\n')

// 1 mosaic (a VRT references the tiles, no copy)
run(join(gdalBin, 'gdalbuildvrt'), [
  '-overwrite',
  '-srcnodata',
  '0',
  '-vrtnodata',
  '0',
  '-input_file_list',
  listPath,
  vrt
])

// 2 warp to web mercator on the native-zoom tile lattice (-tap aligns pixels to
//   the grid); nearest keeps the byte codes exact; alpha marks nodata.
const res = zoomRes(RASTER_NATIVE_ZOOM)
await rm(warped, { force: true })
run(join(gdalBin, 'gdalwarp'), [
  '-overwrite',
  '-t_srs',
  'EPSG:3857',
  '-tr',
  String(res),
  String(res),
  '-tap',
  '-r',
  'near',
  '-dstalpha',
  '-multi',
  '-wo',
  'NUM_THREADS=ALL_CPUS',
  '-co',
  'COMPRESS=DEFLATE',
  '-co',
  'TILED=YES',
  vrt,
  warped
])

// 3 cut into PNG tiles (MBTiles) at exactly that zoom
await rm(mbtiles, { force: true })
run(join(gdalBin, 'gdal_translate'), [
  '-of',
  'MBTILES',
  '-co',
  `ZOOM_LEVEL=${RASTER_NATIVE_ZOOM}`,
  '-co',
  'TILE_FORMAT=PNG',
  '-co',
  'RESAMPLING=NEAREST',
  '-co',
  `NAME=${speciesId}`,
  warped,
  mbtiles
])

// 4 pyramid (average of the decoded values, alpha-aware)
run(join(gdalBin, 'gdaladdo'), ['-r', 'average', mbtiles, ...OVERVIEWS])

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
  tileSize: RASTER_TILE_SIZE
}
console.log(
  `\nraster.pmtiles: zoom ${header.minZoom}–${header.maxZoom}, ${header.numAddressedTiles} tiles, bounds ${meta.bounds.map((b) => b.toFixed(3)).join(' ')}`
)

// 7 dataset row + publish manifest
const version = datasetVersion()
const r2Key = `tiles/${speciesId}/${version}/raster.pmtiles`
const sqlPath = join(outDir, 'dataset.sql')
await writeFile(sqlPath, datasetSql({ species: speciesId, kind: 'raster', version, r2Key, meta }))
const manifestPath = await writePublishManifest(speciesId, { r2: [{ key: r2Key, file: pmtiles }], sql: [sqlPath] })
console.log(`\nWrote ${sqlPath} and ${manifestPath}\n\nLoad locally:\n  pnpm data:publish:local ${speciesId}`)
