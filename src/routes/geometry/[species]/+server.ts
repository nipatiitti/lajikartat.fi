import { error } from '@sveltejs/kit'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '$lib/server/db'
import { getEnv } from '$lib/server/env'
import { speciesDataset } from '$lib/server/db/schema'
import type { RequestHandler } from './$types'

// Serves the published vector geometry for a species from the GEOMETRY R2 bucket.
// The 2.6 MB FeatureCollection is fetched once by the map and rendered client-side;
// keeping it behind the R2 binding (vs bundling it) matches the remote serving path.
// `?kind=centroids` serves the Point blob heatmap species also publish.
export const GET: RequestHandler = async ({ params, platform, url }) => {
  if (!platform) throw error(500, 'platform bindings unavailable')

  const kind = url.searchParams.get('kind') === 'centroids' ? 'centroids' : 'feature'

  // Resolve the latest published dataset of that kind → its R2 key (generic across species).
  const env = getEnv(platform)
  const db = getDb(env.DB)
  const [dataset] = await db
    .select({ r2Key: speciesDataset.r2Key })
    .from(speciesDataset)
    .where(and(eq(speciesDataset.species, params.species), eq(speciesDataset.kind, kind)))
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
