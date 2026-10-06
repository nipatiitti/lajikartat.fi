import { error } from '@sveltejs/kit'
import { edgeCache } from '$lib/server/cache'
import { getEnv } from '$lib/server/env'
import { pmtilesFor } from '$lib/server/pmtiles'
import type { RequestHandler } from './$types'

const ID_RE = /^[a-z0-9-]+$/
const MAX_ZOOM = 16

// Fully transparent 256 px grey+alpha PNG for addresses inside the archive
// bounds that hold no tile (lakes, bbox margins: GDAL drops all-nodata tiles).
// MapLibre turns an empty body into a 1×1 bitmap, and a raster-dem tile of the
// wrong size makes the border backfill of its real neighbours throw, so the
// neighbours error out instead of the hole.
const BLANK_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAAD2e2DtAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAlUlEQVR42u3BAQ0AAADCoPdP7ewBFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3AR4AAY/4QuAAAAAASUVORK5CYII='
  ),
  (c) => c.charCodeAt(0)
)

// One PNG tile out of the species' PMTiles archive on R2. No D1 on this path:
// the archive key follows from the URL (species / version), and the URL is
// immutable, so the edge cache absorbs repeats.
export const GET: RequestHandler = async ({ params, platform, request }) => {
  if (!platform) throw error(500, 'platform bindings unavailable')

  const z = Number(params.z)
  const x = Number(params.x)
  const y = Number(params.y)
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > MAX_ZOOM) {
    throw error(400, 'bad tile address')
  }
  const n = 2 ** z
  if (x < 0 || y < 0 || x >= n || y >= n) throw error(400, 'tile out of range')
  if (!ID_RE.test(params.species) || !ID_RE.test(params.version)) throw error(400, 'bad dataset')

  const cache = edgeCache(platform)
  const hit = await cache?.match(request)
  if (hit) return hit

  const archive = pmtilesFor(getEnv(platform).GEOMETRY, `tiles/${params.species}/${params.version}/raster.pmtiles`)
  const tile = await archive.getZxy(z, x, y)

  // getZxy already decompressed the tile bytes, so no content-encoding here.
  const res = new Response(tile ? tile.data : BLANK_PNG, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' }
  })
  if (cache) platform.ctx.waitUntil(cache.put(request, res.clone()))
  return res
}
