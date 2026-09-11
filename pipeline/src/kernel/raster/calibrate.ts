import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { decodeComposite } from '@raster'
import { CHANTERELLE_PARAMS } from '@scoring'
import type { FeatureCollection } from 'geojson'
import { REGIONS, tileRef } from '../config'
import { reprojectPoint4326to3067 } from '../reproject'
import { readCache } from '../sources/cache'
import { DEFAULT_STAND_EDGE_OPTIONS, standEdgeMask } from './edges'
import { distanceTransform } from './edt'
import { MVMI, rasterTileRef, xyToCell } from './lattice'
import { rasterizeLines, type GridSpec } from './rasterize'
import { rasterOutDir, type TileHistogram } from './run-raster'
import { fetchOccurrences } from './sources/gbif'
import { createLukeSource } from './sources/luke'

// Calibration report for a scored raster region:
//   pnpm --filter @lajikartat/pipeline calibrate <species> <region> [--twi] [--edges] [--gbif]
// Targets (project memory): median 0.5–0.65, p99 0.85–0.92, no pile at 255,
// no factor whose histogram is a spike at one value.

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const [speciesId, regionId] = args.filter((a) => !a.startsWith('--'))
if (!speciesId || !regionId || !REGIONS[regionId]) {
  console.error('usage: tsx src/kernel/raster/calibrate.ts <species> <region> [--twi] [--edges] [--gbif]')
  process.exit(1)
}
const region = REGIONS[regionId]
const outDir = rasterOutDir(speciesId, regionId)
const tilesDir = join(outDir, 'tiles')

const GBIF_NAMES: Record<string, string> = {
  kantarelli: 'Cantharellus cibarius',
  suppilovahvero: 'Craterellus tubaeformis'
}

const fmt = (x: number, d = 3) => x.toFixed(d).replace('.', ',')

function percentiles(bins: number[], total: number, probs: number[], valueOf: (bin: number) => number): Record<string, number> {
  const out: Record<string, number> = {}
  let acc = 0
  let k = 0
  for (let i = 0; i < bins.length && k < probs.length; i++) {
    acc += bins[i]
    while (k < probs.length && acc / total >= probs[k]) {
      out[`p${Math.round(probs[k] * 100)}`] = valueOf(i)
      k++
    }
  }
  return out
}

function ascii(buckets: number[], labelOf: (i: number) => string) {
  const mx = Math.max(1, ...buckets)
  return buckets.map((c, i) => `  ${labelOf(i)} ${'#'.repeat(Math.round((40 * c) / mx)).padEnd(40)} ${c}`).join('\n')
}

async function histograms(): Promise<TileHistogram[]> {
  const files = (await readdir(tilesDir)).filter((f) => f.endsWith('.hist.json'))
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(tilesDir, f), 'utf8')) as TileHistogram))
}

async function reportComposite() {
  const hists = await histograms()
  const bins = new Array<number>(256).fill(0)
  for (const h of hists) for (let i = 0; i < 256; i++) bins[i] += h.bins[i]
  const valid = bins.slice(1).reduce((a, b) => a + b, 0)
  console.log(`\n== ${speciesId} / ${regionId}: ${hists.length} tiles, ${valid} forest cells, ${bins[0]} nodata`)
  const p = percentiles(bins.slice(1), valid, [0.05, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99], (i) => decodeComposite(i + 1))
  console.log('   ' + Object.entries(p).map(([k, v]) => `${k} ${fmt(v)}`).join('  '))
  const ge70 = bins.slice(Math.round(1 + 0.7 * 254)).reduce((a, b) => a + b, 0)
  console.log(`   share ≥ 0,70: ${fmt(ge70 / valid)}   at 255: ${bins[255]}   at 1 (zero): ${bins[1]}`)
  const buckets = new Array<number>(10).fill(0)
  for (let i = 1; i < 256; i++) buckets[Math.min(9, Math.floor(decodeComposite(i) * 10))] += bins[i]
  console.log(ascii(buckets, (i) => `${fmt(i / 10, 1)}`))
}

async function reportFactors() {
  const files = (await readdir(tilesDir)).filter((f) => f.endsWith('.f32'))
  if (files.length === 0) {
    console.log('\n(no factor sidecars — run ingest with --debug for per-factor histograms)')
    return
  }
  const byFactor = new Map<string, number[]>()
  const nulls = new Map<string, number>()
  for (const f of files) {
    const id = f.split('.')[1]
    const buf = await readFile(join(tilesDir, f))
    const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
    const b = byFactor.get(id) ?? new Array<number>(20).fill(0)
    let nn = nulls.get(id) ?? 0
    for (const v of arr) {
      if (v !== v) nn++
      else b[Math.min(19, Math.floor(v * 20))]++
    }
    byFactor.set(id, b)
    nulls.set(id, nn)
  }
  for (const [id, b] of [...byFactor.entries()].sort()) {
    const n = b.reduce((a, c) => a + c, 0)
    const p = percentiles(b, n, [0.1, 0.5, 0.9], (i) => (i + 0.5) / 20)
    console.log(`\n-- ${id}: ${n} known, ${nulls.get(id)} unknown   ${Object.entries(p).map(([k, v]) => `${k} ${fmt(v, 2)}`).join('  ')}`)
    console.log(ascii(b, (i) => fmt(i / 20, 2)))
  }
}

async function runTiles() {
  const run = JSON.parse(await readFile(join(outDir, 'run.json'), 'utf8')) as { tiles: Array<{ ix: number; iy: number }> }
  return run.tiles.map((t) => rasterTileRef(t.ix, t.iy, region.bbox3067))
}

async function reportTwi() {
  const luke = createLukeSource({ localDir: process.env.LUKE_LOCAL_DIR })
  const bins = new Array<number>(400).fill(0) // 0.1 TWI units up to 40
  let n = 0
  for (const ref of await runTiles()) {
    const [twi, maaluokka] = await Promise.all([
      luke.readWindow('twi', 'twi', ref.bbox3067),
      luke.readWindow('mvmi', 'maaluokka', ref.bbox3067)
    ])
    for (let i = 0; i < twi.length; i++) {
      if (maaluokka[i] !== 1 || twi[i] === -32768) continue
      bins[Math.max(0, Math.min(399, Math.round(twi[i] / 100)))]++
      n++
    }
  }
  const p = percentiles(bins, n, [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95], (i) => i / 10)
  console.log(
    `\n== TWI over ${n} forest cells (raster stores ×1000): ` + Object.entries(p).map(([k, v]) => `${k} ${fmt(v, 1)}`).join('  ')
  )
  console.log(
    `   current twiAnchors: ${JSON.stringify(CHANTERELLE_PARAMS.kantarelli.twiAnchors)} → suggest { p10: ${fmt(p.p10, 1)}, p50: ${fmt(p.p50, 1)}, p90: ${fmt(p.p90, 1)} }`
  )
}

async function reportEdges() {
  // Reference: cached Metsäkeskus stand polygons (feature-pipeline era cache).
  const luke = createLukeSource({ localDir: process.env.LUKE_LOCAL_DIR })
  const refs = await runTiles()
  const sweeps: Array<[number, number, boolean]> = [
    [20, 50, false],
    [20, 50, true],
    [30, 80, true],
    [40, 100, true],
    [60, 150, true]
  ]
  const totals = new Map<string, { tp: number; pred: number; hit: number; ref: number; forest: number }>()
  let tilesWithRef = 0
  for (const ref of refs) {
    const v = tileRef(ref.ix, ref.iy, region.bbox3067)
    const stands = await readCache<FeatureCollection>({ source: 'metsakeskus', collection: 'v1:stand', tile: v.bbox.join('_') })
    if (!stands) continue
    tilesWithRef++
    const grid: GridSpec = { minX: ref.bbox3067[0], maxY: ref.bbox3067[3], cell: MVMI.cell, width: ref.width, height: ref.height }
    const refMask = rasterizeLines(stands, grid)
    const refDist = distanceTransform(refMask, ref.width, ref.height, MVMI.cell)
    const [ika, h] = await Promise.all([
      luke.readWindow('mvmi', 'ika', ref.bbox3067),
      luke.readWindow('mvmi', 'keskipituus', ref.bbox3067)
    ])
    for (const [ageJump, heightJumpDm, median] of sweeps) {
      const pred = standEdgeMask(ika, h, ref.width, ref.height, { ...DEFAULT_STAND_EDGE_OPTIONS, ageJump, heightJumpDm, median })
      const predDist = distanceTransform(pred, ref.width, ref.height, MVMI.cell)
      const key = `${ageJump}/${heightJumpDm}${median ? ' med' : ' raw'}`
      const t = totals.get(key) ?? { tp: 0, pred: 0, hit: 0, ref: 0, forest: 0 }
      for (let i = 0; i < pred.length; i++) {
        if (ika[i] === MVMI.nodataOutside) continue
        t.forest++
        if (pred[i]) {
          t.pred++
          if (refDist[i] <= 32) t.tp++
        }
        if (refMask[i]) {
          t.ref++
          if (predDist[i] <= 32) t.hit++
        }
      }
      totals.set(key, t)
    }
  }
  if (tilesWithRef === 0) {
    console.log('\n(no cached Metsäkeskus stands for this region — edge check needs the pirkkala cache)')
    return
  }
  console.log(`\n== Stand-edge mask vs Metsäkeskus boundaries (${tilesWithRef} tiles, 32 m tolerance)`)
  for (const [key, t] of totals) {
    console.log(
      `   jump ${key.padEnd(12)} precision ${fmt(t.tp / t.pred, 2)}  recall ${fmt(t.hit / t.ref, 2)}  edge share of forest ${fmt(t.pred / t.forest, 2)}`
    )
  }
}

function auc(pos: number[], neg: number[]): number {
  // Mann–Whitney U via ranks with ties.
  const all = [...pos.map((v) => [v, 1] as const), ...neg.map((v) => [v, 0] as const)].sort((a, b) => a[0] - b[0])
  let rankSumPos = 0
  for (let i = 0; i < all.length; ) {
    let j = i
    while (j < all.length && all[j][0] === all[i][0]) j++
    const avgRank = (i + 1 + j) / 2
    for (let k = i; k < j; k++) if (all[k][1] === 1) rankSumPos += avgRank
    i = j
  }
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length)
}

async function reportGbif() {
  const name = GBIF_NAMES[speciesId]
  if (!name) {
    console.log(`\n(no GBIF taxon configured for ${speciesId})`)
    return
  }
  const occ = await fetchOccurrences(name)
  const refs = await runTiles()
  const [minX, minY, maxX, maxY] = region.bbox3067
  const inside = occ
    .filter((o) => o.uncertaintyM === null || o.uncertaintyM <= 1000)
    .map((o) => ({ ...o, xy: reprojectPoint4326to3067([o.lng, o.lat]) }))
    .filter((o) => o.xy[0] >= minX && o.xy[0] < maxX && o.xy[1] >= minY && o.xy[1] < maxY)
  console.log(
    `\n== GBIF ${name}: ${occ.length} Finnish records, ${inside.length} inside ${regionId} (uncertainty ≤ 1 km or unknown)`
  )
  if (inside.length < 5) {
    console.log('   too few records for a meaningful check')
    return
  }

  const tileBytes = new Map<string, Uint8Array>()
  const factorArrays = new Map<string, Map<string, Float32Array>>()
  const factorIds = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M9']
  for (const r of refs) {
    const key = `${r.ix},${r.iy}`
    const tif = await readFile(join(tilesDir, `${r.ix}_${r.iy}.tif`))
    tileBytes.set(key, tif.subarray(tif.byteLength - r.width * r.height)) // single uncompressed strip at the end
    const fm = new Map<string, Float32Array>()
    for (const id of factorIds) {
      try {
        const buf = await readFile(join(tilesDir, `${r.ix}_${r.iy}.${id}.f32`))
        fm.set(id, new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4))
      } catch {
        // no sidecar
      }
    }
    factorArrays.set(key, fm)
  }

  const presence: number[] = []
  const presenceF = new Map<string, number[]>(factorIds.map((id) => [id, []]))
  let outsideForest = 0
  for (const o of inside) {
    let found = false
    for (const r of refs) {
      const i = xyToCell(r, o.xy[0], o.xy[1])
      if (i < 0) continue
      found = true
      const key = `${r.ix},${r.iy}`
      const b = tileBytes.get(key)![i]
      if (b === 0) outsideForest++
      else {
        presence.push(decodeComposite(b))
        for (const id of factorIds) {
          const v = factorArrays.get(key)?.get(id)?.[i]
          if (v !== undefined && v === v) presenceF.get(id)!.push(v)
        }
      }
      break
    }
    if (!found) outsideForest++
  }

  // Background: random valid cells, 10× the presences.
  let seed = 42
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const background: number[] = []
  const backgroundF = new Map<string, number[]>(factorIds.map((id) => [id, []]))
  const want = presence.length * 10
  let guard = 0
  while (background.length < want && guard++ < want * 50) {
    const r = refs[Math.floor(rnd() * refs.length)]
    const i = Math.floor(rnd() * r.width * r.height)
    const key = `${r.ix},${r.iy}`
    const b = tileBytes.get(key)![i]
    if (b === 0) continue
    background.push(decodeComposite(b))
    for (const id of factorIds) {
      const v = factorArrays.get(key)?.get(id)?.[i]
      if (v !== undefined && v === v) backgroundF.get(id)!.push(v)
    }
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
  console.log(`   ${presence.length} records on forest cells, ${outsideForest} outside forest / nodata`)
  console.log(
    `   composite: presence mean ${fmt(mean(presence))}  background mean ${fmt(mean(background))}  AUC ${fmt(auc(presence, background))}`
  )
  console.log(
    `   share of presences ≥ 0,70: ${fmt(presence.filter((v) => v >= 0.7).length / presence.length)}  (background ${fmt(background.filter((v) => v >= 0.7).length / background.length)})`
  )
  for (const id of factorIds) {
    const p = presenceF.get(id)!
    const b = backgroundF.get(id)!
    if (p.length < 5 || b.length < 5) continue
    console.log(
      `   ${id}: presence ${fmt(mean(p), 2)}  background ${fmt(mean(b), 2)}  AUC ${fmt(auc(p, b), 2)}${id === 'M9' ? '  (roadside recording bias expected)' : ''}`
    )
  }
}

await reportComposite()
await reportFactors()
if (flags.has('--twi')) await reportTwi()
if (flags.has('--edges')) await reportEdges()
if (flags.has('--gbif')) await reportGbif()
