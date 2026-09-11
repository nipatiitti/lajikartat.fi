import { error, json } from '@sveltejs/kit'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '$lib/server/db'
import { speciesDataset, type RasterDatasetMeta } from '$lib/server/db/schema'
import { getEnv } from '$lib/server/env'
import { CUSTOM_DEM_ENCODING } from '$lib/raster/encoding'
import type { RequestHandler } from './$types'

/** What the map needs to mount a raster species: a TileJSON-ish descriptor. */
export interface SpeciesTileJson {
  species: string
  region: string
  regionLabel: string
  version: string
  /** Absolute tile URL template — MapLibre fetches from a worker with no document base. */
  tiles: string[]
  tileSize: number
  minzoom: number
  maxzoom: number
  bounds: [number, number, number, number]
  encoding: typeof CUSTOM_DEM_ENCODING
}

// Resolves the latest published raster archive for a species. The tile URLs
// carry region + version, so tiles themselves are immutable and cacheable.
export const GET: RequestHandler = async ({ params, platform, url }) => {
  if (!platform) throw error(500, 'platform bindings unavailable')
  const species = params.species
  const db = getDb(getEnv(platform).DB)
  const [dataset] = await db
    .select({ region: speciesDataset.region, version: speciesDataset.pipelineVersion, meta: speciesDataset.meta })
    .from(speciesDataset)
    .where(and(eq(speciesDataset.species, species), eq(speciesDataset.kind, 'raster-tiles')))
    .orderBy(desc(speciesDataset.publishedAt))
    .limit(1)
  if (!dataset?.meta) throw error(404, `no published raster for species "${species}"`)

  const meta = dataset.meta as RasterDatasetMeta
  const body: SpeciesTileJson = {
    species,
    region: dataset.region,
    regionLabel: meta.regionLabel,
    version: dataset.version,
    tiles: [`${url.origin}/tiles/${species}/${dataset.region}.${dataset.version}/{z}/{x}/{y}.png`],
    tileSize: meta.tileSize,
    minzoom: meta.minzoom,
    maxzoom: meta.maxzoom,
    bounds: meta.bounds,
    encoding: CUSTOM_DEM_ENCODING
  }
  return json(body, { headers: { 'cache-control': 'public, max-age=300' } })
}
