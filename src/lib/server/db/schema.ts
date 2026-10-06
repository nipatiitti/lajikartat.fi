import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// One row per scored candidate of a feature species (perch ponds). Geometry
// stays out of D1: the map renders the GeoJSON blob from R2 and reads the
// why-breakdown here on tap.
export const candidate = sqliteTable(
  'candidate',
  {
    id: text('id').primaryKey(), // `${species}:${sourceFeatureId}`
    species: text('species').notNull(),
    name: text('name'), // null = unnamed
    areaHa: real('area_ha'),
    composite: real('composite').notNull(),
    confidence: text('confidence').notNull(), // 'high' | 'med' | 'low'
    why: text('why', { mode: 'json' }).notNull()
  },
  (t) => [index('candidate_species_idx').on(t.species)]
)

// What is published per species and kind: the R2 key of the vector geometry
// (feature) or the raster PMTiles archive (raster, with zoom range and bounds
// in meta). The newest published_at row of a kind is the live one.
export const speciesDataset = sqliteTable(
  'species_dataset',
  {
    species: text('species').notNull(),
    kind: text('kind').notNull(), // 'feature' | 'raster'
    /** Minted per publish; part of every R2 key and tile URL. */
    version: text('version').notNull(),
    r2Key: text('r2_key').notNull(),
    publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
    /** raster: { bounds, minzoom, maxzoom, tileSize }. */
    meta: text('meta', { mode: 'json' })
  },
  (t) => [primaryKey({ columns: [t.species, t.kind, t.version] })]
)

export interface RasterDatasetMeta {
  bounds: [number, number, number, number]
  minzoom: number
  maxzoom: number
  tileSize: number
}
