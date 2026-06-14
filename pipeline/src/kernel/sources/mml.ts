import type { Feature, FeatureCollection } from 'geojson'
import { readCache, writeCache } from './cache'

// Maastotietokanta OGC API Features (open, API-key tier).
// Docs: https://www.maanmittauslaitos.fi/en/maastotietokannan-kyselypalvelu/tekninen-kuvaus
const MML_BASE = 'https://avoin-paikkatieto.maanmittauslaitos.fi/maastotiedot/features/v1'
const CRS_3067 = 'http://www.opengis.net/def/crs/EPSG/0/3067'

type Bbox = [number, number, number, number]

interface CollectionInfo {
  id: string
  title?: string
}

interface OgcLink {
  rel: string
  href: string
}

export interface MmlClient {
  listCollections(): Promise<CollectionInfo[]>
  /** Resolve a logical layer to a live collection id (rename-proof). */
  resolveCollection(candidates: string[]): Promise<string>
  /** Fetch all features in a 3067 bbox (responses stay in 3067, cached verbatim). */
  fetchBbox(collection: string, bbox3067: Bbox, opts?: { limit?: number; tileId?: string }): Promise<FeatureCollection>
}

export function createMmlClient(apiKey: string): MmlClient {
  // HTTP Basic auth: API key as the user-id, empty password.
  const headers = {
    Authorization: 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64'),
    Accept: 'application/geo+json'
  }

  let collectionsCache: CollectionInfo[] | null = null

  async function listCollections(): Promise<CollectionInfo[]> {
    if (collectionsCache) return collectionsCache
    const res = await fetch(`${MML_BASE}/collections?f=json`, { headers })
    if (!res.ok) throw new Error(`MML /collections → ${res.status} ${res.statusText}`)
    const json = (await res.json()) as { collections: CollectionInfo[] }
    collectionsCache = json.collections.map((c) => ({ id: c.id, title: c.title }))
    return collectionsCache
  }

  async function resolveCollection(candidates: string[]): Promise<string> {
    const cols = await listCollections()
    for (const cand of candidates) {
      const exact = cols.find((c) => c.id === cand)
      if (exact) return exact.id
      const partial = cols.find((c) => c.id.includes(cand))
      if (partial) return partial.id
    }
    throw new Error(
      `Could not resolve an MML collection from [${candidates.join(', ')}].\n` +
        `Live collections: ${cols.map((c) => c.id).join(', ')}`
    )
  }

  async function fetchBbox(collection: string, bbox3067: Bbox, opts: { limit?: number; tileId?: string } = {}) {
    const limit = opts.limit ?? 1000
    const tileId = opts.tileId ?? bbox3067.join('_')
    const cacheKey = { source: 'mml', collection, tile: tileId }

    const cached = await readCache<FeatureCollection>(cacheKey)
    if (cached) return cached

    const features: Feature[] = []
    let url: string | null =
      `${MML_BASE}/collections/${collection}/items?` +
      new URLSearchParams({
        bbox: bbox3067.join(','),
        'bbox-crs': CRS_3067,
        crs: CRS_3067,
        limit: String(limit),
        f: 'json'
      }).toString()

    while (url) {
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`MML items (${collection}) → ${res.status}: ${await res.text()}`)
      const page = (await res.json()) as FeatureCollection & { links?: OgcLink[] }
      features.push(...page.features)
      url = page.links?.find((l) => l.rel === 'next')?.href ?? null
    }

    const fc: FeatureCollection = { type: 'FeatureCollection', features }
    await writeCache(cacheKey, fc)
    return fc
  }

  return { listCollections, resolveCollection, fetchBbox }
}
