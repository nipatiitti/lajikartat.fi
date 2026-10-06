import { error } from '@sveltejs/kit'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '$lib/server/db'
import { getEnv } from '$lib/server/env'
import { speciesDataset } from '$lib/server/db/schema'
import type { RequestHandler } from './$types'

// Serves the published vector geometry of a feature species from R2: the map
// fetches the FeatureCollection once and renders it client-side.
export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform) throw error(500, 'platform bindings unavailable')

  const env = getEnv(platform)
  const db = getDb(env.DB)
  const [dataset] = await db
    .select({ r2Key: speciesDataset.r2Key })
    .from(speciesDataset)
    .where(and(eq(speciesDataset.species, params.species), eq(speciesDataset.kind, 'feature')))
    .orderBy(desc(speciesDataset.publishedAt))
    .limit(1)
  if (!dataset) throw error(404, `no published geometry for species "${params.species}"`)

  const object = await env.GEOMETRY.get(dataset.r2Key)
  if (!object) throw error(404, `geometry object missing in R2: ${dataset.r2Key}`)

  return new Response(object.body, {
    headers: {
      'content-type': 'application/geo+json',
      etag: object.httpEtag,
      'cache-control': 'public, max-age=300'
    }
  })
}
