import type { Feature, FeatureCollection } from 'geojson'
import pLimit from 'p-limit'
import { filterLayerFeatures, rawLayerTile } from './acquire'
import type { TileRef } from './config'
import { reprojectCollection3067to4326 } from './reproject'
import type { MmlClient } from './sources/mml'
import { buildJoinContext } from './spatial/vector'
import { TileCache } from './tile-cache'
import type { JoinContext, LayerBundle, LayerSpec } from './types'

/** Pre-download all (layer, tile) combinations into the disk cache, concurrently. */
export async function warmTiles(
  layers: LayerSpec[],
  refs: TileRef[],
  mml: MmlClient,
  onWarn: (message: string) => void,
  onTile?: () => void,
  concurrency = 5
): Promise<void> {
  const limit = pLimit(concurrency)
  await Promise.all(
    layers.flatMap((layer) =>
      refs.map((ref) =>
        limit(async () => {
          await rawLayerTile(layer, ref, mml, onWarn)
          onTile?.()
        })
      )
    )
  )
}

/** Reprojected per-(layer, tile) collections, so overlapping skirts reuse parsed data. */
const PROJECTED_TILE_CACHE = 150

/**
 * Streams context layers tile-by-tile so memory stays bounded and builds a
 * JoinContext over a candidate tile plus its skirt.
 */
export class TileContextProvider {
  #cache = new TileCache<FeatureCollection | null>(PROJECTED_TILE_CACHE)

  constructor(
    private readonly layers: LayerSpec[],
    private readonly mml: MmlClient,
    private readonly onWarn: (message: string) => void
  ) {}

  async contextFor(refs: TileRef[]): Promise<JoinContext> {
    const bundle: LayerBundle = {}
    for (const layer of this.layers) {
      const features: Feature[] = []
      for (const ref of refs) {
        const fc = await this.#layerTile(layer, ref)
        if (fc) features.push(...fc.features)
      }
      bundle[layer.key] = { type: 'FeatureCollection', features }
    }
    return buildJoinContext(bundle)
  }

  #layerTile(layer: LayerSpec, ref: TileRef): Promise<FeatureCollection | null> {
    // Filter AFTER the (shared) raw fetch, BEFORE the per-layer-key cache entry:
    // sibling keys over the same collection reuse the download, not the filter.
    return this.#cache.remember(`${layer.key}:${ref.ix},${ref.iy}`, async () => {
      const raw = await rawLayerTile(layer, ref, this.mml, this.onWarn)
      return raw && reprojectCollection3067to4326(filterLayerFeatures(layer, raw))
    })
  }
}
