import { error } from '@sveltejs/kit'
import { getRequestEvent, query } from '$app/server'
import { and, eq } from 'drizzle-orm'
import { getDb } from '$lib/server/db'
import { candidate, candidateScore } from '$lib/server/db/schema'
import type { Confidence, WhyBreakdown } from '$lib/scoring/core/types'

// NOTE: remote files must NOT live under src/lib/server — they expose a generated
// HTTP endpoint and SvelteKit strips the body from the client bundle itself. The
// server-only imports below ($lib/server/db) only run inside the query handler.

const PIPELINE_VERSION = 'v1'

export interface CandidateDetail {
  id: string
  name: string | null
  areaHa: number | null
  composite: number
  confidence: Confidence
  factors: Record<string, { subScore: number | null; confidence: Confidence }>
  why: WhyBreakdown
}

// The map renders bulk geometry (composite/confidence/f*) straight from R2; this
// pulls the richer per-pond breakdown (drivers, positives/negatives, notes) that the
// geojson omits, on demand when a pond is clicked.
export const getCandidateDetail = query(
  'unchecked',
  async ({ species, id }: { species: string; id: string }): Promise<CandidateDetail> => {
    const { platform } = getRequestEvent()
    if (!platform) throw error(500, 'platform bindings unavailable')

    const db = getDb(platform.env.DB)
    const [row] = await db
      .select({
        id: candidate.id,
        name: candidate.name,
        areaHa: candidate.areaHa,
        composite: candidateScore.composite,
        confidence: candidateScore.confidence,
        factors: candidateScore.factors,
        why: candidateScore.why
      })
      .from(candidateScore)
      .innerJoin(candidate, eq(candidate.id, candidateScore.candidateId))
      .where(
        and(
          eq(candidateScore.candidateId, id),
          eq(candidateScore.species, species),
          eq(candidateScore.pipelineVersion, PIPELINE_VERSION)
        )
      )
      .limit(1)

    if (!row) throw error(404, `no candidate "${id}" for species "${species}"`)

    return {
      id: row.id,
      name: row.name,
      areaHa: row.areaHa,
      composite: row.composite,
      confidence: row.confidence as Confidence,
      factors: row.factors as CandidateDetail['factors'],
      why: row.why as WhyBreakdown
    }
  }
)
