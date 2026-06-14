import { centroid } from '@turf/turf'
import { SPECIES } from '../species/registry'
import { acquireLayers } from './acquire'
import { REGIONS, skirtTileRefs, tileGrid, tileIndexOf, TILE_SIZE_M } from './config'
import { loadPipelineEnv } from './env'
import { reprojectPoint4326to3067 } from './reproject'
import { buildRegionMask } from './sources/boundary'
import { createMmlClient } from './sources/mml'
import { WFS_ENDPOINTS } from './sources/wfs'
import { TileContextProvider } from './tile-context'
import type { JoinContext, LayerSpec } from './types'

// Profiles scoring of the FIRST valid candidate using cached tile data (no heavy
// downloads — only the one /collections lookup hits the network). Run:
//   pnpm --filter @lajikartat/pipeline probe:score [species] [region]

const [speciesId = 'perch', regionId = 'pirkanmaa'] = process.argv.slice(2)

const species = SPECIES[speciesId]
if (!species || species.kind !== 'feature') {
  console.error(`need a feature species; got "${speciesId}"`)
  process.exit(1)
}
const region = REGIONS[regionId]
if (!region) {
  console.error(`unknown region "${regionId}"`)
  process.exit(1)
}
const { MML_API_KEY } = loadPipelineEnv()
if (!MML_API_KEY) {
  console.error('MML_API_KEY not set (needed once to resolve collection names).')
  process.exit(1)
}

const mml = createMmlClient(MML_API_KEY)
let last = performance.now()
const step = (label: string) => {
  const now = performance.now()
  console.log(`  ${label.padEnd(40)} ${(now - last).toFixed(1).padStart(8)} ms`)
  last = now
}

console.log(`Probe: scoring ${speciesId} / ${regionId} (cache-only context)\n`)

// 1. Candidate layer from cache → first valid candidate.
const candidateLayers = species.layers.filter((l) => l.key === species.candidateLayerKey)
const candidateBundle = await acquireLayers(candidateLayers, tileGrid(region.bbox3067), region.bbox3067, mml)
step('acquire candidate layer (from cache)')

const candidates = species.extractCandidates(candidateBundle, buildRegionMask(regionId, region.bbox3067))
step(`extract candidates (${candidates.length})`)

const pond = candidates[0]
if (!pond) {
  console.error('no valid candidates found in cache — run `pnpm ingest` first')
  process.exit(1)
}
console.log(`\nFirst valid pond: ${pond.id}  "${pond.name ?? '(unnamed)'}"  ${pond.areaHa.toFixed(2)} ha\n`)

// 2. Build the context (a tile + 1-cell skirt) for that pond, from cache.
const [lng, lat] = centroid(pond.geometry).geometry.coordinates
const [x, y] = reprojectPoint4326to3067([lng, lat])
const { ix, iy } = tileIndexOf(x, y, region.bbox3067, TILE_SIZE_M)
const available = species.layers.filter((l) => l.key !== species.candidateLayerKey).filter(isAvailable)
const provider = new TileContextProvider(available, mml)

last = performance.now()
const baseCtx = await provider.contextFor(skirtTileRefs(ix, iy, region.bbox3067, TILE_SIZE_M, 1))
step('build context (fetch cache + reproject + index)')

// 3. Score the pond, timing each spatial primitive it calls.
const timings = new Map<string, { ms: number; calls: number }>()
last = performance.now()
const scored = species.score(pond, instrument(baseCtx, timings))
step('score pond (total)')

console.log('\nPer-primitive (inside score):')
for (const [name, t] of timings) {
  console.log(`  ${name.padEnd(22)} ${String(t.calls).padStart(4)}×  ${t.ms.toFixed(1).padStart(8)} ms`)
}

console.log('\nResult:')
console.log(`  composite ${scored.composite.toFixed(3)}   confidence ${scored.confidence}`)
console.log(`  factors   ${JSON.stringify(scored.factors)}`)
console.log(`  +  ${scored.why.topPositives.join('; ') || '(none)'}`)
console.log(`  -  ${scored.why.topNegatives.join('; ') || '(none)'}`)

function isAvailable(layer: LayerSpec): boolean {
  if (layer.source === 'mml') return true
  const endpoint = layer.params?.endpoint ?? WFS_ENDPOINTS[layer.source]
  return Boolean(endpoint && layer.params?.typeName)
}

/** Wrap a JoinContext so each primitive's elapsed time and call count are recorded. */
function instrument(base: JoinContext, timings: Map<string, { ms: number; calls: number }>): JoinContext {
  const time =
    <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    (...a: A): R => {
      const t0 = performance.now()
      const r = fn(...a)
      const e = timings.get(name) ?? { ms: 0, calls: 0 }
      e.ms += performance.now() - t0
      e.calls++
      timings.set(name, e)
      return r
    }
  return {
    hasLayer: base.hasLayer.bind(base),
    nearestLine: time('nearestLine', base.nearestLine.bind(base)),
    featuresWithin: time('featuresWithin', base.featuresWithin.bind(base)),
    linesIntersecting: time('linesIntersecting', base.linesIntersecting.bind(base)),
    containingPolygon: time('containingPolygon', base.containingPolygon.bind(base)),
    areaFractionByClass: time('areaFractionByClass', base.areaFractionByClass.bind(base))
  }
}
