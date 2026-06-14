import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// MML's open vector-tile service (taustakartta, MVT 2.1, EPSG:3857 — MapLibre-native)
// requires the api-key on EVERY request: style JSON, TileJSON, .pbf tiles, sprite and
// glyphs. All of it lives under this one host, so a single host-rewriting catch-all
// proxy keeps the key server-side and points every asset back at same-origin /basemap.
const MML_HOST = 'https://avoin-karttakuva.maanmittauslaitos.fi'

export const GET: RequestHandler = async ({ params, url, platform, request }) => {
  if (!platform) throw error(500, 'platform bindings unavailable')

  const apiKey = platform.env.MML_API_KEY
  // No key → 204 so the map degrades to a blank style; the perch polygons still render.
  if (!apiKey) return new Response(null, { status: 204 })

  // style.json / tilejson are rewritten to the current origin and must never be cached
  // (a stale relative-URL copy breaks MapLibre's worker tile fetches). Only the
  // immutable binary assets (.pbf, sprite, glyphs) get edge-cached.
  const isMeta = /(stylejson|tilejson|\.json)(\?|$)/.test(params.path)
  const cache = isMeta ? undefined : (platform.caches as unknown as { default?: Cache }).default
  const hit = await cache?.match(request)
  if (hit) return hit

  // Reconstruct the upstream request: same path under the MML host, forward the
  // incoming query (e.g. ?TileMatrixSet=…) and inject the api-key server-side.
  const upstream = new URL(`${MML_HOST}/${params.path}`)
  upstream.search = url.search
  upstream.searchParams.set('api-key', apiKey)

  const res = await fetch(upstream, { headers: { accept: request.headers.get('accept') ?? '*/*' } })
  if (!res.ok && res.status !== 204) {
    return new Response(`basemap upstream ${res.status}`, { status: res.status })
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'

  // JSON (style.json, tilejson) embeds absolute MML URLs with the key baked in —
  // rewrite them to ABSOLUTE same-origin /basemap URLs and drop the key. This covers
  // `sources`/`url`, `sprite` and `glyphs` transparently, so MapLibre needs no
  // transformRequest. Binary (.pbf, sprite png/json, glyph pbf) passes through.
  if (isMeta || contentType.includes('json')) {
    return new Response(rewriteUrls(await res.text(), url.origin), {
      headers: { 'content-type': contentType || 'application/json', 'cache-control': 'no-store' }
    })
  }

  const out = new Response(await res.arrayBuffer(), {
    headers: { 'content-type': contentType, 'cache-control': 'public, max-age=86400' }
  })

  if (cache) platform.ctx.waitUntil(cache.put(request, out.clone()))
  return out
}

// Repoint embedded MML asset URLs at this proxy and strip the api-key query.
// MapLibre loads vector tiles from a Web Worker that has no document base, so the
// rewritten URLs must be ABSOLUTE (origin-qualified), not relative.
function rewriteUrls(text: string, origin: string): string {
  return stripApiKey(text.split(`${MML_HOST}/`).join(`${origin}/basemap/`))
}

// api-key values are GUID-like (hex + hyphens), so stop at the JSON string end (`"`),
// the next param (`&`), or a URL-template tail (`}`).
function stripApiKey(s: string): string {
  return s
    .replace(/\?api-key=[^"&}]*&/g, '?') // first of several params
    .replace(/\?api-key=[^"&}]*/g, '') // sole param
    .replace(/&api-key=[^"&}]*/g, '') // trailing param
}
