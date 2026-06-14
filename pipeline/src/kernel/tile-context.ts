import type { Feature, FeatureCollection } from 'geojson'
import pLimit from 'p-limit'
import type { TileRef } from './config'
import { reprojectCollection3067to4326 } from './reproject'
import type { MmlClient } from './sources/mml'
import { fetchWfsBbox, WFS_ENDPOINTS } from './sources/wfs'
import { buildJoinContext } from './spatial/vector'
import type { JoinContext, LayerBundle, LayerSpec } from './types'

/**
 * Raw (EPSG:3067) fetch of one layer over one tile, disk-cached by the source
 * connectors. Returns null when the layer isn't configured or the fetch fails.
 */
export async function rawLayerTile(layer: LayerSpec, ref: TileRef, mml: MmlClient): Promise<FeatureCollection | null> {
  try {
    if (layer.source === 'mml') {
      const collection = await mml.resolveCollection(layer.resolve)
      return await mml.fetchBbox(collection, ref.bbox, { tileId: `${ref.ix}_${ref.iy}` })
    }
    const endpoint = layer.params?.endpoint ?? WFS_ENDPOINTS[layer.source]
    const typeName = layer.params?.typeName
    if (!endpoint || !typeName) return null
    return await fetchWfsBbox({
      source: layer.source,
      endpoint,
      typeName,
      bbox3067: ref.bbox,
      outputFormat: layer.params?.outputFormat
    })
  } catch (err) {
    console.warn(`\n  ⚠ ${layer.key} tile ${ref.ix},${ref.iy}: ${(err as Error).message}`)
    return null
  }
}

/** Pre-download all (layer, tile) combinations into the disk cache, concurrently. */
export async function warmTiles(
  layers: LayerSpec[],
  refs: TileRef[],
  mml: MmlClient,
  concurrency = 5,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const limit = pLimit(concurrency)
  const total = layers.length * refs.length
  let done = 0
  const jobs = layers.flatMap((layer) =>
    refs.map((ref) =>
      limit(async () => {
        await rawLayerTile(layer, ref, mml)
        onProgress?.(++done, total)
      })
    )
  )
  await Promise.all(jobs)
}

/**
 * Streams context layers tile-by-tile so memory stays bounded. Reprojected
 * per-(layer,tile) FeatureCollections are kept in a small LRU so overlapping
 * skirts between neighbouring candidate tiles reuse parsed data.
 */
export class TileContextProvider {
  private cache = new Map<string, FeatureCollection>()

  constructor(
    private readonly layers: LayerSpec[],
    private readonly mml: MmlClient,
    private readonly maxEntries = 150
  ) {}

  /** Build a JoinContext over the given tiles (a candidate tile + its skirt). */
  async contextFor(refs: TileRef[]): Promise<JoinContext> {
    const bundle: LayerBundle = {}
    for (const layer of this.layers) {
      const features: Feature[] = []
      for (const ref of refs) {
        const fc = await this.layerTile(layer, ref)
        if (fc) features.push(...fc.features)
      }
      bundle[layer.key] = { type: 'FeatureCollection', features }
    }
    return buildJoinContext(bundle)
  }

  private async layerTile(layer: LayerSpec, ref: TileRef): Promise<FeatureCollection | null> {
    const key = `${layer.key}:${ref.ix},${ref.iy}`
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key) // LRU: refresh recency
      this.cache.set(key, cached)
      return cached
    }

    const raw = await rawLayerTile(layer, ref, this.mml)
    if (!raw) return null

    const projected = reprojectCollection3067to4326(raw)
    this.cache.set(key, projected)
    if (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    return projected
  }
}
