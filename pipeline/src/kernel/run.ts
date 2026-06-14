import { centroid } from '@turf/turf'
import { SPECIES } from '../species/registry'
import { acquireLayers } from './acquire'
import { REGIONS, skirtTileRefs, tileGrid, tileIndexOf, TILE_SIZE_M, type TileRef } from './config'
import { loadPipelineEnv } from './env'
import { loadFeatureDataset, type ScoredEntry } from './load'
import { reprojectPoint4326to3067 } from './reproject'
import { buildRegionMask } from './sources/boundary'
import { createMmlClient } from './sources/mml'
import { WFS_ENDPOINTS } from './sources/wfs'
import { TileContextProvider, warmTiles } from './tile-context'
import type { CandidateFeature, LayerSpec } from './types'

const [speciesId, regionId] = process.argv.slice(2)
if (!speciesId || !regionId) {
  console.error('usage: tsx src/kernel/run.ts <species> <region>')
  process.exit(1)
}

const species = SPECIES[speciesId]
if (!species) {
  console.error(`unknown species "${speciesId}". known: ${Object.keys(SPECIES).join(', ')}`)
  process.exit(1)
}
const region = REGIONS[regionId]
if (!region) {
  console.error(`unknown region "${regionId}". known: ${Object.keys(REGIONS).join(', ')}`)
  process.exit(1)
}

const { MML_API_KEY } = loadPipelineEnv()
if (!MML_API_KEY) {
  console.error('MML_API_KEY not set (pipeline/.env). See pipeline/.env.example.')
  process.exit(1)
}

if (species.kind !== 'feature') {
  console.error(`species "${speciesId}" is a ${species.kind} pipeline — only feature is supported in the v1 loader`)
  process.exit(1)
}

const mml = createMmlClient(MML_API_KEY)
const mask = buildRegionMask(regionId, region.bbox3067)

// Phase 1 — acquire the small candidate layer region-wide, extract candidates.
const allTiles = tileGrid(region.bbox3067)
const candidateLayers = species.layers.filter((l) => l.key === species.candidateLayerKey)
const contextLayers = species.layers.filter((l) => l.key !== species.candidateLayerKey)

console.log(`Phase 1: ${species.candidateLayerKey} over ${allTiles.length} tiles…`)
const candidateBundle = await acquireLayers(candidateLayers, allTiles, region.bbox3067, mml)
const candidates = species.extractCandidates(candidateBundle, mask)
console.log(`${candidates.length} candidate ${speciesId} features`)

// Only layers we can actually fetch contribute; the rest leave their factor null.
const available = contextLayers.filter(isAvailable)
for (const l of contextLayers) {
  if (!available.includes(l)) console.warn(`  ⚠ ${l.key} (${l.source}) not configured — its factor will be null`)
}

// Group candidates by their grid tile.
const byTile = new Map<string, { ix: number; iy: number; items: CandidateFeature[] }>()
for (const candidate of candidates) {
  const [lng, lat] = centroid(candidate.geometry).geometry.coordinates
  const [x, y] = reprojectPoint4326to3067([lng, lat])
  const { ix, iy } = tileIndexOf(x, y, region.bbox3067, TILE_SIZE_M)
  const key = `${ix},${iy}`
  const group = byTile.get(key) ?? { ix, iy, items: [] }
  group.items.push(candidate)
  byTile.set(key, group)
}

const sorted = [...byTile.values()].sort((a, b) => a.iy - b.iy || a.ix - b.ix) // row-major → LRU reuse

// Phase 2a — pre-download all context tiles (candidate tile + 1-cell skirt)
// concurrently into the disk cache. This is the slow, network-bound cold-run
// step; already-cached tiles are skipped instantly.
const uniqueRefs = new Map<string, TileRef>()
for (const g of sorted) {
  for (const ref of skirtTileRefs(g.ix, g.iy, region.bbox3067, TILE_SIZE_M, 1)) {
    uniqueRefs.set(`${ref.ix},${ref.iy}`, ref)
  }
}
console.log(`Phase 2a: fetching ${available.length} layers × ${uniqueRefs.size} tiles (cached tiles skip)…`)
const dlStart = Date.now()
await warmTiles(available, [...uniqueRefs.values()], mml, 5, (n, total) => {
  if (n % 20 === 0 || n === total) {
    const elapsed = (Date.now() - dlStart) / 1000
    const eta = n > 0 ? (elapsed / n) * (total - n) : 0
    process.stdout.write(`\r  ${n}/${total} fetched — ${elapsed.toFixed(0)}s elapsed, ~${eta.toFixed(0)}s left   `)
  }
})
process.stdout.write('\n')

// Phase 2b — score tile-by-tile with bounded context (now mostly cache hits).
console.log(`Phase 2b: scoring ${candidates.length} ponds across ${sorted.length} tiles…`)
const provider = new TileContextProvider(available, mml)
const entries: ScoredEntry[] = []
const scoreStart = Date.now()
let done = 0
for (const group of sorted) {
  const ctx = await provider.contextFor(skirtTileRefs(group.ix, group.iy, region.bbox3067, TILE_SIZE_M, 1))
  for (const candidate of group.items) entries.push({ candidate, score: species.score(candidate, ctx) })
  if (++done % 10 === 0 || done === sorted.length) {
    const elapsed = (Date.now() - scoreStart) / 1000
    process.stdout.write(`\r  ${done}/${sorted.length} tiles scored — ${elapsed.toFixed(0)}s   `)
  }
}
process.stdout.write('\n')

const { sqlPath, geojsonPath, count } = await loadFeatureDataset(speciesId, regionId, entries)
console.log(`\nWrote ${count} rows → ${sqlPath}`)
console.log(`     geometry → ${geojsonPath}`)
console.log(`\nLoad locally:\n  pnpm exec wrangler d1 execute DB --local --file=${sqlPath}`)

function isAvailable(layer: LayerSpec): boolean {
  if (layer.source === 'mml') return true
  const endpoint = layer.params?.endpoint ?? WFS_ENDPOINTS[layer.source]
  return Boolean(endpoint && layer.params?.typeName)
}
