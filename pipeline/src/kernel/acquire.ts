import type { Feature, FeatureCollection } from 'geojson'
import type { Bbox, TileRef } from './config'
import { reprojectCollection3067to4326 } from './reproject'
import type { MmlClient } from './sources/mml'
import { fetchWfsBbox, WFS_ENDPOINTS } from './sources/wfs'
import type { LayerBundle, LayerSpec } from './types'

/** Can this layer actually be fetched? MML always; WFS needs endpoint + typeName. */
export function isLayerAvailable(layer: LayerSpec): boolean {
  if (layer.source === 'mml') return true
  const endpoint = layer.params?.endpoint ?? WFS_ENDPOINTS[layer.source]
  return Boolean(endpoint && layer.params?.typeName)
}

/**
 * Apply the layer's declarative property filter (`filterField` + `filterValues`),
 * if any. Runs AFTER fetch/cache, so multiple layer keys over the same source
 * collection (e.g. tieviiva → forest tracks vs car roads by `kohdeluokka`)
 * share one download.
 */
export function filterLayerFeatures(layer: LayerSpec, fc: FeatureCollection): FeatureCollection {
  const field = layer.params?.filterField
  const values = layer.params?.filterValues
  if (!field || !values) return fc
  const wanted = new Set(values.split(',').map((v) => v.trim()))
  return {
    type: 'FeatureCollection',
    features: fc.features.filter((f) => wanted.has(String((f.properties ?? {})[field])))
  }
}

/**
 * Raw (EPSG:3067) fetch of one layer over one tile, disk-cached by the source
 * connectors. Returns null when the layer isn't configured or the fetch fails.
 */
export async function rawLayerTile(
  layer: LayerSpec,
  ref: TileRef,
  mml: MmlClient,
  onWarn: (message: string) => void
): Promise<FeatureCollection | null> {
  try {
    if (layer.source === 'mml') {
      const collection = await mml.resolveCollection(layer.resolve)
      // Cache key is the bbox: it identifies the tile independently of any grid.
      return await mml.fetchBbox(collection, ref.bbox, { tileId: ref.bbox.join('_') })
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
    onWarn(`${layer.key} tile ${ref.ix},${ref.iy}: ${(err as Error).message}`)
    return null
  }
}

/**
 * Acquire whole layers over a set of tiles (MML) or one bbox (WFS), reproject
 * to 4326 and bundle them. Used for the candidate layer of a feature species;
 * heavy context layers stream tile-by-tile instead (tile-context.ts).
 */
export async function acquireLayers(
  layers: LayerSpec[],
  tiles: TileRef[],
  bbox3067: Bbox,
  mml: MmlClient
): Promise<LayerBundle> {
  const bundle: LayerBundle = {}
  for (const layer of layers) {
    const raw = layer.source === 'mml' ? await acquireMml(mml, layer, tiles) : await acquireWfs(layer, bbox3067)
    bundle[layer.key] = reprojectCollection3067to4326(filterLayerFeatures(layer, dedupe(raw)))
  }
  return bundle
}

async function acquireMml(mml: MmlClient, layer: LayerSpec, tiles: TileRef[]): Promise<FeatureCollection> {
  const collection = await mml.resolveCollection(layer.resolve)
  const features: Feature[] = []
  for (const tile of tiles) {
    const fc = await mml.fetchBbox(collection, tile.bbox, { tileId: tile.bbox.join('_') })
    features.push(...fc.features)
  }
  return { type: 'FeatureCollection', features }
}

async function acquireWfs(layer: LayerSpec, bbox3067: Bbox): Promise<FeatureCollection> {
  const endpoint = layer.params?.endpoint ?? WFS_ENDPOINTS[layer.source]
  const typeName = layer.params?.typeName
  if (!endpoint || !typeName) {
    throw new Error(`${layer.key}: WFS endpoint/typeName not configured — validate against GetCapabilities`)
  }
  return fetchWfsBbox({ source: layer.source, endpoint, typeName, bbox3067, outputFormat: layer.params?.outputFormat })
}

/** Drop duplicate features by id (tile-border overlap; WFS features carry stable ids). */
function dedupe(fc: FeatureCollection): FeatureCollection {
  const seen = new Set<string>()
  const features = fc.features.filter((f) => {
    if (f.id == null) return true
    const id = String(f.id)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
  return { type: 'FeatureCollection', features }
}
