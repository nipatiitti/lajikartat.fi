import { centroid } from '@turf/turf'
import { SPECIES } from '../species/registry'
import { acquireLayers, isLayerAvailable } from './acquire'
import { fail, parseArgs, parseBbox } from './cli'
import { GRID, skirtTileRefs, tileIndexOf, tileRefs, type TileRef } from './config'
import { loadPipelineEnv } from './env'
import { loadFeatureDataset, type ScoredEntry } from './load'
import { applyNameJoin } from './name-join'
import { progress, warn } from './progress'
import { reprojectPoint4326to3067 } from './reproject'
import { createMmlClient } from './sources/mml'
import { runRaster } from './raster/run-raster'
import { createLukeSource } from './raster/sources/luke'
import { TileContextProvider, warmTiles } from './tile-context'
import type { CandidateFeature } from './types'

// Ingest one species over the national grid, or only the tiles inside --bbox
// (EPSG:3067, for calibration runs):
//   pnpm pipeline ingest <species> [--bbox=minX,minY,maxX,maxY] [--debug]

const { positional, flags } = parseArgs(process.argv.slice(2))
const [speciesId] = positional
if (!speciesId) fail('usage: tsx src/kernel/run.ts <species> [--bbox=minX,minY,maxX,maxY] [--debug]')
const species = SPECIES[speciesId] ?? fail(`unknown species "${speciesId}". known: ${Object.keys(SPECIES).join(', ')}`)
let bbox
try {
  bbox = parseBbox(flags.get('bbox'))
} catch (err) {
  fail((err as Error).message)
}

const { MML_API_KEY } = loadPipelineEnv()
if (!MML_API_KEY) fail('MML_API_KEY not set (pipeline/.env). See pipeline/.env.example.')
const mml = createMmlClient(MML_API_KEY)

if (species.kind === 'raster') {
  const luke = createLukeSource({ localDir: process.env.LUKE_LOCAL_DIR })
  const { tiles, scored, outDir } = await runRaster(species, { mml, luke }, { bbox, debug: flags.has('debug') })
  console.log(`\nScored ${scored} forest cells over ${tiles} tiles → ${outDir}`)
  console.log(`\nNext:\n  pnpm pipeline calibrate ${speciesId}\n  pnpm pipeline publish:raster ${speciesId}`)
  process.exit(0)
}

// Phase 1 — acquire the candidate layer over the run area, extract candidates.
const runTiles = tileRefs(bbox)
const candidateLayers = species.layers.filter((l) => l.key === species.candidateLayerKey)
const contextLayers = species.layers.filter((l) => l.key !== species.candidateLayerKey)

console.log(`Phase 1: ${species.candidateLayerKey} over ${runTiles.length} tiles…`)
const candidateBundle = await acquireLayers(candidateLayers, runTiles, bbox ?? GRID.bbox3067, mml)
const candidates = species.extractCandidates(candidateBundle)
console.log(`${candidates.length} candidate ${speciesId} features`)

// Only layers we can actually fetch contribute; the rest leave their factor null.
const available = contextLayers.filter(isLayerAvailable)
for (const l of contextLayers) {
  if (!available.includes(l)) warn(`${l.key} (${l.source}) not configured — its factor will be null`)
}

// Group candidates by their grid tile.
const byTile = new Map<string, { ix: number; iy: number; items: CandidateFeature[] }>()
for (const candidate of candidates) {
  const [lng, lat] = centroid(candidate.geometry).geometry.coordinates
  const [x, y] = reprojectPoint4326to3067([lng, lat])
  const { ix, iy } = tileIndexOf(x, y)
  const key = `${ix},${iy}`
  const group = byTile.get(key) ?? { ix, iy, items: [] }
  group.items.push(candidate)
  byTile.set(key, group)
}
const sorted = [...byTile.values()].sort((a, b) => a.iy - b.iy || a.ix - b.ix) // row-major → cache reuse

// Phase 2a — pre-download all context tiles (candidate tile + 1-cell skirt)
// concurrently into the disk cache; already-cached tiles are skipped instantly.
const uniqueRefs = new Map<string, TileRef>()
for (const g of sorted) for (const ref of skirtTileRefs(g.ix, g.iy)) uniqueRefs.set(`${ref.ix},${ref.iy}`, ref)
console.log(`Phase 2a: fetching ${available.length} layers × ${uniqueRefs.size} tiles (cached tiles skip)…`)
const fetching = progress('fetched', available.length * uniqueRefs.size, 20)
await warmTiles(available, [...uniqueRefs.values()], mml, warn, fetching.tick)
fetching.end()

// Phase 2b — score tile-by-tile with bounded context (now mostly cache hits).
console.log(`Phase 2b: scoring ${candidates.length} candidates across ${sorted.length} tiles…`)
const provider = new TileContextProvider(available, mml, warn)
const entries: ScoredEntry[] = []
const scoring = progress('tiles scored', sorted.length)
for (const group of sorted) {
  const ctx = await provider.contextFor(skirtTileRefs(group.ix, group.iy))
  for (const candidate of group.items) entries.push({ candidate, score: species.score(candidate, ctx) })
  scoring.tick()
}
scoring.end()

// Phase 2c — name candidates from the nearest MML place name.
if (species.nameJoin) {
  console.log(`Phase 2c: naming from paikannimi (≤ ${species.nameJoin.maxDistanceM} m)…`)
  const named = await applyNameJoin(entries, species.nameJoin, mml, warn)
  console.log(`  named ${named}/${entries.length} candidates`)
}

const { sqlPath, geojsonPath, count } = await loadFeatureDataset(speciesId, entries)
console.log(`\nWrote ${count} rows → ${sqlPath}\n     geometry → ${geojsonPath}`)
console.log(`\nLoad locally:\n  pnpm data:publish:local ${speciesId}`)
