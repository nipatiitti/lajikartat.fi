import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// One row per candidate feature, species-discriminated. Geometry stays OUT of
// D1 (no spatial type/index in SQLite) — the Worker filters on indexed bbox +
// centroid columns and pulls polygons from R2. Generic across feature species.
export const candidate = sqliteTable(
  'candidate',
  {
    id: text('id').primaryKey(), // `${species}:${sourceFeatureId}`
    species: text('species').notNull(),
    sourceFeatureId: text('source_feature_id').notNull(),
    name: text('name'), // null = unnamed
    centroidLat: real('centroid_lat').notNull(),
    centroidLng: real('centroid_lng').notNull(),
    minLat: real('min_lat').notNull(),
    minLng: real('min_lng').notNull(),
    maxLat: real('max_lat').notNull(),
    maxLng: real('max_lng').notNull(),
    areaHa: real('area_ha'),
    region: text('region').notNull(),
    pipelineVersion: text('pipeline_version').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
  },
  (t) => [
    index('cand_species_region_idx').on(t.species, t.region),
    index('cand_bbox_idx').on(t.minLat, t.minLng, t.maxLat, t.maxLng)
  ]
)

// One row per candidate per pipeline version. Per-factor sub-scores live in JSON
// so the schema is stable across species; ranking is by `composite`.
export const candidateScore = sqliteTable(
  'candidate_score',
  {
    candidateId: text('candidate_id')
      .notNull()
      .references(() => candidate.id),
    species: text('species').notNull(),
    pipelineVersion: text('pipeline_version').notNull(),
    composite: real('composite').notNull(),
    confidence: text('confidence').notNull(), // 'high' | 'med' | 'low'
    factors: text('factors', { mode: 'json' }).notNull(),
    why: text('why', { mode: 'json' }).notNull(),
    scoredAt: integer('scored_at', { mode: 'timestamp' }).notNull()
  },
  (t) => [
    index('cand_score_rank_idx').on(t.species, t.composite),
    index('cand_score_pk_idx').on(t.candidateId, t.pipelineVersion)
  ]
)

// Tracks what is published per species/region/version for BOTH pipeline kinds,
// including the R2 key of the vector geometry (feature) or raster tiles (raster).
export const speciesDataset = sqliteTable('species_dataset', {
  species: text('species').notNull(),
  region: text('region').notNull(),
  pipelineVersion: text('pipeline_version').notNull(),
  kind: text('kind').notNull(), // 'feature' | 'raster'
  r2Key: text('r2_key').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp' }).notNull()
})

export type Candidate = typeof candidate.$inferSelect
export type CandidateScore = typeof candidateScore.$inferSelect
export type SpeciesDataset = typeof speciesDataset.$inferSelect
