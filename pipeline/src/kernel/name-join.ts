import { centroid } from '@turf/turf'
import Flatbush from 'flatbush'
import type { FeatureCollection } from 'geojson'
import { skirtTileRefs, TILE_SIZE_M, tileIndexOf, tileRef, type TileRef } from './config'
import type { ScoredEntry } from './load'
import { reprojectPoint4326to3067 } from './reproject'
import type { MmlClient } from './sources/mml'
import { rawLayerTile, warmTiles } from './tile-context'
import type { LayerSpec } from './types'

// MML place names: Point features, name in `teksti`, class in `kohdeluokka`
// (validated live 2026-08-09). Fetched raw (EPSG:3067) so the nearest-neighbour
// search runs in metres without reprojection.
const PAIKANNIMI_LAYER: LayerSpec = { key: 'paikannimi', source: 'mml', resolve: ['paikannimi'], geometry: 'point' }

export interface NameJoinOptions {
  maxDistanceM: number
  kohdeluokka?: number[]
}

type Bbox = [number, number, number, number]

/**
 * Post-scoring enrichment: give each still-unnamed published candidate the
 * nearest place name within `maxDistanceM` of its centroid. The name is the
 * raw `teksti` string only — no composed labels. Runs after the publish gate
 * so only candidates that reach D1/R2 pay for paikannimi tiles.
 */
export async function applyNameJoin(
  entries: ScoredEntry[],
  opts: NameJoinOptions,
  regionBbox3067: Bbox,
  mml: MmlClient
): Promise<number> {
  const unnamed = entries.filter((e) => e.candidate.name === null)
  if (unnamed.length === 0) return 0

  // Group candidates by grid tile (same machinery as the scoring pass).
  const byTile = new Map<string, { ix: number; iy: number; items: { entry: ScoredEntry; x: number; y: number }[] }>()
  for (const entry of unnamed) {
    const [lng, lat] = centroid(entry.candidate.geometry).geometry.coordinates
    const [x, y] = reprojectPoint4326to3067([lng, lat])
    const { ix, iy } = tileIndexOf(x, y, regionBbox3067, TILE_SIZE_M)
    const key = `${ix},${iy}`
    const group = byTile.get(key) ?? { ix, iy, items: [] }
    group.items.push({ entry, x, y })
    byTile.set(key, group)
  }

  // Warm every needed tile (tile + 1-cell skirt ⇒ correct for any
  // maxDistanceM ≤ TILE_SIZE_M) — disk-cached like every other MML layer.
  const uniqueRefs = new Map<string, TileRef>()
  for (const g of byTile.values()) {
    for (const ref of skirtTileRefs(g.ix, g.iy, regionBbox3067, TILE_SIZE_M, 1)) {
      uniqueRefs.set(`${ref.ix},${ref.iy}`, ref)
    }
  }
  await warmTiles([PAIKANNIMI_LAYER], [...uniqueRefs.values()], mml)

  const tileCache = new Map<string, FeatureCollection | null>()
  const tileFc = async (ref: TileRef): Promise<FeatureCollection | null> => {
    const key = `${ref.ix},${ref.iy}`
    if (!tileCache.has(key)) tileCache.set(key, await rawLayerTile(PAIKANNIMI_LAYER, ref, mml))
    return tileCache.get(key) ?? null
  }

  let named = 0
  for (const group of byTile.values()) {
    // Gather names over the tile + skirt, dedupe (skirts overlap across groups).
    const points: { x: number; y: number; name: string }[] = []
    const seen = new Set<unknown>()
    for (const ref of skirtTileRefs(group.ix, group.iy, regionBbox3067, TILE_SIZE_M, 1)) {
      const fc = await tileFc(tileRef(ref.ix, ref.iy, regionBbox3067, TILE_SIZE_M))
      if (!fc) continue
      for (const f of fc.features) {
        if (f.geometry?.type !== 'Point') continue
        const props = f.properties ?? {}
        const id = props.mtk_id ?? f.id
        if (id != null && seen.has(id)) continue
        if (id != null) seen.add(id)
        if (opts.kohdeluokka && !opts.kohdeluokka.includes(Number(props.kohdeluokka))) continue
        const name = props.teksti
        if (typeof name !== 'string' || name.length === 0) continue
        const [x, y] = f.geometry.coordinates
        points.push({ x, y, name })
      }
    }
    if (points.length === 0) continue

    const index = new Flatbush(points.length)
    for (const p of points) index.add(p.x, p.y, p.x, p.y)
    index.finish()

    for (const { entry, x, y } of group.items) {
      const [nearest] = index.neighbors(x, y, 1, opts.maxDistanceM)
      if (nearest === undefined) continue
      entry.candidate.name = points[nearest].name
      named++
    }
  }
  return named
}
