import { error } from '@sveltejs/kit'
import { TileType } from 'pmtiles'
import { getEnv } from '$lib/server/env'
import { pmtilesFor } from '$lib/server/pmtiles'
import type { RequestHandler } from './$types'

const CONTENT_TYPES: Partial<Record<TileType, string>> = {
  [TileType.Png]: 'image/png',
  [TileType.Webp]: 'image/webp',
  [TileType.Jpeg]: 'image/jpeg',
  [TileType.Mvt]: 'application/vnd.mapbox-vector-tile'
}

const DATASET_RE = /^([a-z0-9-]+)\.(v\d+)$/

// Fully transparent 256 px grey+alpha PNG for addresses inside the archive
// bounds that hold no tile (lakes, bbox margins: GDAL drops all-nodata tiles).
// MapLibre turns an empty body into a 1×1 bitmap, and a raster-dem tile of the
// wrong size makes the border backfill of its real neighbours throw, so the
// neighbours error out instead of the hole.
const BLANK_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAAD2e2DtAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAlUlEQVR42u3BAQ0AAADCoPdP7ewBFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3AR4AAY/4QuAAAAAASUVORK5CYII='
  ),
  (c) => c.charCodeAt(0)
)

// One raster tile out of the species' PMTiles archive on R2. No D1 on this
// path: the archive key follows from the URL (species / region.version), and
// the URL is immutable, so the edge cache absorbs repeats.
export const GET: RequestHandler = async ({ params, platform, request }) => {
  if (!platform) throw error(500, 'platform bindings unavailable')

  const z = Number(params.z)
  const x = Number(params.x)
  const y = Number(params.y)
  const m = DATASET_RE.exec(params.dataset)
  if (!m || !Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 16) {
    throw error(400, 'bad tile address')
  }
  const n = 2 ** z
  if (x < 0 || y < 0 || x >= n || y >= n) throw error(400, 'tile out of range')
  if (!/^[a-z0-9-]+$/.test(params.species)) throw error(400, 'bad species')

  const cache = (platform.caches as unknown as { default?: Cache }).default
  const hit = await cache?.match(request)
  if (hit) return hit

  const env = getEnv(platform)
  const key = `tiles/${params.species}/${m[1]}/${m[2]}/raster.pmtiles`
  const archive = pmtilesFor(env.GEOMETRY, key)
  const header = await archive.getHeader()
  const tile = await archive.getZxy(z, x, y)

  // getZxy already decompressed the tile bytes, so no content-encoding here.
  const headers: Record<string, string> = {
    'content-type': tile ? (CONTENT_TYPES[header.tileType] ?? 'application/octet-stream') : 'image/png',
    'cache-control': 'public, max-age=31536000, immutable'
  }
  const res = new Response(tile ? tile.data : BLANK_PNG, { headers })
  if (cache) platform.ctx.waitUntil(cache.put(request, res.clone()))
  return res
}
