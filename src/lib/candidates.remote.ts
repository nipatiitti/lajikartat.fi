import { error } from '@sveltejs/kit'
import { getRequestEvent, query } from '$app/server'
import { eq } from 'drizzle-orm'
import { getDb } from '$lib/server/db'
import { candidate } from '$lib/server/db/schema'
import { getEnv } from '$lib/server/env'
import type { Confidence, WhyBreakdown } from '$lib/scoring/core/types'

// NOTE: remote files must NOT live under src/lib/server — they expose a generated
// HTTP endpoint and SvelteKit strips the body from the client bundle itself. The
// server-only imports below ($lib/server/db) only run inside the query handler.

interface CandidateDetail {
  id: string
  name: string | null
  areaHa: number | null
  composite: number
  confidence: Confidence
  why: WhyBreakdown
}

// The map renders bulk geometry (composite/confidence) straight from R2; this
// pulls the why-breakdown (drivers, positives/negatives, notes) on tap.
export const getCandidateDetail = query('unchecked', async ({ id }: { id: string }): Promise<CandidateDetail> => {
  const { platform } = getRequestEvent()
  if (!platform) throw error(500, 'platform bindings unavailable')

  const db = getDb(getEnv(platform).DB)
  const [row] = await db.select().from(candidate).where(eq(candidate.id, id)).limit(1)
  if (!row) throw error(404, `no candidate "${id}"`)

  return {
    id: row.id,
    name: row.name,
    areaHa: row.areaHa,
    composite: row.composite,
    confidence: row.confidence as Confidence,
    why: row.why as WhyBreakdown
  }
})
