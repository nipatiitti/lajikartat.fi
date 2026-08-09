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
  centroidsPath: string | null
  count: number
}

/**
 * Local-first loader: emits an idempotent SQL file (load into local D1 with
 * `wrangler d1 execute DB --local --file=…`) plus a GeoJSON render artifact.
 * The same shape swaps to D1-REST + R2 for remote without touching scoring.
 * With `publishCentroids` a second, much smaller Point GeoJSON (same props) is
 * emitted for heatmap rendering — it stays serveable at national scale even
 * when the polygon blob eventually moves to bbox-scoped delivery.
 */
export async function loadFeatureDataset(
  species: string,
  region: string,
  entries: ScoredEntry[],
  options: { publishCentroids?: boolean } = {}
): Promise<LoadResult> {
  await mkdir(OUT_DIR, { recursive: true })
  const now = Math.floor(Date.now() / 1000)
  const r2Key = `${species}/${region}/${PIPELINE_VERSION}.geojson`
  const centroidsR2Key = `${species}/${region}/${PIPELINE_VERSION}.centroids.geojson`

  // No explicit BEGIN/COMMIT — D1's `execute --file` runs the statements itself.
  const sql: string[] = [...resetStatements(species, region)]
  const features: Feature[] = []
  const centroidFeatures: Feature[] = []

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
    if (options.publishCentroids) {
      centroidFeatures.push({
        type: 'Feature',
        id,
        properties: renderProps(id, candidate, score),
        geometry: { type: 'Point', coordinates: [cLng, cLat] }
      })
    }
  }

  sql.push(
    `INSERT INTO species_dataset (species, region, pipeline_version, kind, r2_key, published_at) VALUES (` +
      [str(species), str(region), str(PIPELINE_VERSION), str('feature'), str(r2Key), num(now)].join(', ') +
      ');'
  )
  if (options.publishCentroids) {
    sql.push(
      `INSERT INTO species_dataset (species, region, pipeline_version, kind, r2_key, published_at) VALUES (` +
        [str(species), str(region), str(PIPELINE_VERSION), str('centroids'), str(centroidsR2Key), num(now)].join(', ') +
        ');'
    )
  }

  const geojson: FeatureCollection = { type: 'FeatureCollection', features }
  const sqlPath = join(OUT_DIR, `${species}-${region}.sql`)
  const geojsonPath = join(OUT_DIR, `${species}-${region}.geojson`)
  await writeFile(sqlPath, sql.join('\n'))
  await writeFile(geojsonPath, JSON.stringify(geojson))

  let centroidsPath: string | null = null
  if (options.publishCentroids) {
    centroidsPath = join(OUT_DIR, `${species}-${region}.centroids.geojson`)
    const centroidFc: FeatureCollection = { type: 'FeatureCollection', features: centroidFeatures }
    await writeFile(centroidsPath, JSON.stringify(centroidFc))
  }
  return { sqlPath, geojsonPath, centroidsPath, count: entries.length }
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

// Species-agnostic render properties: the map colours/filters/ranks straight off
// composite + confidence. Per-factor detail is read from D1 on click (it lives in
// candidate_score.factors), so the geometry blob carries no factor keys.
function renderProps(id: string, candidate: CandidateFeature, score: ScoredCandidate) {
  return {
    id,
    name: candidate.name,
    composite: round(score.composite),
    confidence: score.confidence,
    areaHa: candidate.areaHa === null ? null : Math.round(candidate.areaHa * 10) / 10
  }
}

function renderFeature(id: string, candidate: CandidateFeature, score: ScoredCandidate): Feature {
  const simplified = simplify(candidate.geometry, { tolerance: 0.0001, highQuality: false, mutate: false })
  return {
    type: 'Feature',
    id,
    properties: renderProps(id, candidate, score),
    geometry: simplified.geometry
  }
}

const round = (n: number): number => Math.round(n * 1000) / 1000
const str = (s: string | null): string => (s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`)
const num = (n: number | null): string => (n === null ? 'NULL' : String(n))
const json = (v: unknown): string => `'${JSON.stringify(v).replace(/'/g, "''")}'`
