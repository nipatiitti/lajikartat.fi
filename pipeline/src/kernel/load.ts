import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bbox as turfBbox, centroid, simplify } from '@turf/turf'
import type { Feature, FeatureCollection } from 'geojson'
import type { CandidateFeature, ScoredCandidate } from './types'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../out')
const PIPELINE_VERSION = 'v1'

export interface ScoredEntry {
  candidate: CandidateFeature
  score: ScoredCandidate
}

export interface LoadResult {
  sqlPath: string
  geojsonPath: string
  count: number
}

/**
 * Local-first loader: emits an idempotent SQL file (load into local D1 with
 * `wrangler d1 execute DB --local --file=…`) plus a GeoJSON render artifact.
 * The same shape swaps to D1-REST + R2 for remote without touching scoring.
 */
export async function loadFeatureDataset(species: string, region: string, entries: ScoredEntry[]): Promise<LoadResult> {
  await mkdir(OUT_DIR, { recursive: true })
  const now = Math.floor(Date.now() / 1000)
  const r2Key = `${species}/${region}/${PIPELINE_VERSION}.geojson`

  // No explicit BEGIN/COMMIT — D1's `execute --file` runs the statements itself.
  const sql: string[] = [...resetStatements(species, region)]
  const features: Feature[] = []

  for (const { candidate, score } of entries) {
    const id = `${species}:${candidate.id}`
    const [minLng, minLat, maxLng, maxLat] = turfBbox(candidate.geometry)
    const [cLng, cLat] = centroid(candidate.geometry).geometry.coordinates

    sql.push(
      `INSERT OR REPLACE INTO candidate (id, species, source_feature_id, name, centroid_lat, centroid_lng, ` +
        `min_lat, min_lng, max_lat, max_lng, area_ha, region, pipeline_version, updated_at) VALUES (` +
        [
          str(id),
          str(species),
          str(candidate.id),
          str(candidate.name),
          num(cLat),
          num(cLng),
          num(minLat),
          num(minLng),
          num(maxLat),
          num(maxLng),
          num(candidate.areaHa),
          str(region),
          str(PIPELINE_VERSION),
          num(now)
        ].join(', ') +
        ');'
    )
    sql.push(
      `INSERT INTO candidate_score (candidate_id, species, pipeline_version, composite, confidence, factors, why, ` +
        `scored_at) VALUES (` +
        [
          str(id),
          str(species),
          str(PIPELINE_VERSION),
          num(score.composite),
          str(score.confidence),
          json(score.factors),
          json(score.why),
          num(now)
        ].join(', ') +
        ');'
    )
    features.push(renderFeature(id, candidate, score))
  }

  sql.push(
    `INSERT INTO species_dataset (species, region, pipeline_version, kind, r2_key, published_at) VALUES (` +
      [str(species), str(region), str(PIPELINE_VERSION), str('feature'), str(r2Key), num(now)].join(', ') +
      ');'
  )

  const geojson: FeatureCollection = { type: 'FeatureCollection', features }
  const sqlPath = join(OUT_DIR, `${species}-${region}.sql`)
  const geojsonPath = join(OUT_DIR, `${species}-${region}.geojson`)
  await writeFile(sqlPath, sql.join('\n'))
  await writeFile(geojsonPath, JSON.stringify(geojson))
  return { sqlPath, geojsonPath, count: entries.length }
}

function resetStatements(species: string, region: string): string[] {
  return [
    `DELETE FROM candidate_score WHERE pipeline_version = ${str(PIPELINE_VERSION)} AND candidate_id IN ` +
      `(SELECT id FROM candidate WHERE species = ${str(species)} AND region = ${str(region)});`,
    `DELETE FROM candidate WHERE species = ${str(species)} AND region = ${str(region)};`,
    `DELETE FROM species_dataset WHERE species = ${str(species)} AND region = ${str(region)} ` +
      `AND pipeline_version = ${str(PIPELINE_VERSION)};`
  ]
}

function renderFeature(id: string, candidate: CandidateFeature, score: ScoredCandidate): Feature {
  const simplified = simplify(candidate.geometry, { tolerance: 0.0001, highQuality: false, mutate: false })
  const f = score.factors
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      name: candidate.name,
      composite: round(score.composite),
      confidence: score.confidence,
      f1: f.F1?.subScore ?? null,
      f2: f.F2?.subScore ?? null,
      f3: f.F3?.subScore ?? null,
      f5: f.F5?.subScore ?? null
    },
    geometry: simplified.geometry
  }
}

const round = (n: number): number => Math.round(n * 1000) / 1000
const str = (s: string | null): string => (s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`)
const num = (n: number | null): string => (n === null ? 'NULL' : String(n))
const json = (v: unknown): string => `'${JSON.stringify(v).replace(/'/g, "''")}'`
