import type { Feature, FeatureCollection } from 'geojson'
import { reprojectCollection3067to4326 } from './reproject'
import type { MmlClient } from './sources/mml'
import { fetchWfsBbox, WFS_ENDPOINTS } from './sources/wfs'
import type { LayerBundle, LayerSpec } from './types'

type Bbox = [number, number, number, number]

/**
 * Acquire the given layers, reproject to 4326, and return a LayerBundle. MML
 * layers are fetched over `tiles`; WFS layers over the region `bbox3067`. A layer
 * that can't be acquired (e.g. an un-validated WFS typeName) is skipped with a
 * warning — the scoring then drops its factor cleanly. Used for the small
 * region-wide candidate layer; heavy context layers stream via TileContextProvider.
 */
export async function acquireLayers(
  layers: LayerSpec[],
  tiles: Bbox[],
  bbox3067: Bbox,
  mml: MmlClient
): Promise<LayerBundle> {
  const bundle: LayerBundle = {}

  for (const layer of layers) {
    try {
      const raw = layer.source === 'mml' ? await acquireMml(mml, layer, tiles) : await acquireWfs(layer, bbox3067)
      bundle[layer.key] = reprojectCollection3067to4326(dedupe(raw))
      console.log(`  ✓ ${layer.key} (${layer.source}): ${bundle[layer.key].features.length} features`)
    } catch (err) {
      console.warn(`  ⚠ ${layer.key} (${layer.source}) skipped: ${(err as Error).message}`)
    }
  }

  return bundle
}

async function acquireMml(mml: MmlClient, layer: LayerSpec, tiles: Bbox[]): Promise<FeatureCollection> {
  const collection = await mml.resolveCollection(layer.resolve)
  const features: Feature[] = []
  for (const tile of tiles) {
    const fc = await mml.fetchBbox(collection, tile, { tileId: tile.join('_') })
    features.push(...fc.features)
  }
  return { type: 'FeatureCollection', features }
}

async function acquireWfs(layer: LayerSpec, bbox3067: Bbox): Promise<FeatureCollection> {
  const endpoint = layer.params?.endpoint ?? WFS_ENDPOINTS[layer.source]
  const typeName = layer.params?.typeName
  if (!endpoint || !typeName) {
    throw new Error('WFS endpoint/typeName not configured — validate against GetCapabilities')
  }
  return fetchWfsBbox({ source: layer.source, endpoint, typeName, bbox3067, outputFormat: layer.params?.outputFormat })
}

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
