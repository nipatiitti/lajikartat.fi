import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { simplify } from '@turf/turf'
import type { Feature, FeatureCollection } from 'geojson'
import { datasetVersion } from './config'
import type { CandidateFeature, ScoredCandidate } from './types'

export const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../out')
/** Polygon simplification for the render blob (degrees, ~10 m). */
const RENDER_TOLERANCE_DEG = 0.0001

export interface ScoredEntry {
  candidate: CandidateFeature
  score: ScoredCandidate
}

export interface DatasetRow {
  species: string
  kind: 'feature' | 'raster'
  version: string
  r2Key: string
  meta?: unknown
}

/** Manifest the root `data:publish:local` script reads: R2 objects to put and SQL files to execute. */
export interface PublishManifest {
  r2: Array<{ key: string; file: string }>
  sql: string[]
}

/** Idempotent dataset-row SQL: replaces the row for this species / kind / version. */
export function datasetSql(row: DatasetRow): string {
  const now = Math.floor(Date.now() / 1000)
  return (
    `INSERT OR REPLACE INTO species_dataset (species, kind, version, r2_key, published_at, meta) VALUES (` +
    [
      str(row.species),
      str(row.kind),
      str(row.version),
      str(row.r2Key),
      num(now),
      row.meta === undefined ? 'NULL' : json(row.meta)
    ].join(', ') +
    ');\n'
  )
}

export async function writePublishManifest(species: string, manifest: PublishManifest): Promise<string> {
  const p = join(OUT_DIR, species, 'publish.json')
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(manifest, null, 2))
  return p
}

/** SQL statements that replace every candidate row of a species. */
export function candidateSql(species: string, entries: ScoredEntry[]): string[] {
  const sql = [`DELETE FROM candidate WHERE species = ${str(species)};`]
  for (const { candidate, score } of entries) {
    sql.push(
      `INSERT INTO candidate (id, species, name, area_ha, composite, confidence, why) VALUES (` +
        [
          str(candidateId(species, candidate)),
          str(species),
          str(candidate.name),
          num(candidate.areaHa),
          num(score.composite),
          str(score.confidence),
          json(score.why)
        ].join(', ') +
        ');'
    )
  }
  return sql
}

/**
 * Local-first loader for a feature species: an idempotent SQL file (candidate
 * rows + dataset row), the render GeoJSON, and the publish manifest under
 * out/<species>/. The same files load into remote D1 / R2.
 */
export async function loadFeatureDataset(
  species: string,
  entries: ScoredEntry[]
): Promise<{ sqlPath: string; geojsonPath: string; manifestPath: string; count: number }> {
  const outDir = join(OUT_DIR, species)
  await mkdir(outDir, { recursive: true })
  const version = datasetVersion()
  const r2Key = `geometry/${species}/${version}.geojson`

  const sql = [...candidateSql(species, entries), datasetSql({ species, kind: 'feature', version, r2Key })]
  const geojson: FeatureCollection = {
    type: 'FeatureCollection',
    features: entries.map(({ candidate, score }) => renderFeature(candidateId(species, candidate), candidate, score))
  }
  const sqlPath = join(outDir, 'dataset.sql')
  const geojsonPath = join(outDir, 'features.geojson')
  await writeFile(sqlPath, sql.join('\n') + '\n')
  await writeFile(geojsonPath, JSON.stringify(geojson))
  const manifestPath = await writePublishManifest(species, { r2: [{ key: r2Key, file: geojsonPath }], sql: [sqlPath] })
  return { sqlPath, geojsonPath, manifestPath, count: entries.length }
}

const candidateId = (species: string, c: CandidateFeature) => `${species}:${c.id}`

// Species-agnostic render properties: the map colours/filters straight off
// composite + confidence; the why-breakdown is read from D1 on tap.
function renderFeature(id: string, candidate: CandidateFeature, score: ScoredCandidate): Feature {
  const simplified = simplify(candidate.geometry, {
    tolerance: RENDER_TOLERANCE_DEG,
    highQuality: false,
    mutate: false
  })
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      name: candidate.name,
      composite: Math.round(score.composite * 1000) / 1000,
      confidence: score.confidence,
      areaHa: candidate.areaHa === null ? null : Math.round(candidate.areaHa * 10) / 10
    },
    geometry: simplified.geometry
  }
}

export const str = (s: string | null): string => (s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`)
const num = (n: number | null): string => (n === null ? 'NULL' : String(n))
const json = (v: unknown): string => str(JSON.stringify(v))
