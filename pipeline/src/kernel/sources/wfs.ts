import type { Feature, FeatureCollection } from 'geojson'
import type { SourceId } from '../types'
import { readCache, writeCache } from './cache'

type Bbox = [number, number, number, number]

// Default open WFS endpoints. typeNames must be validated against each service's
// GetCapabilities before use; until a layer supplies one it is skipped (F3 null).
export const WFS_ENDPOINTS: Partial<Record<SourceId, string>> = {
  gtk: 'https://gtkdata.gtk.fi/arcgis/services/Rajapinnat/GTK_Maapera_WFS/MapServer/WFSServer'
  // syke / corine: provide endpoint + typeName via LayerSpec.params after validation.
}

export interface WfsRequest {
  source: SourceId
  endpoint: string
  typeName: string
  bbox3067: Bbox
  srs?: string
  count?: number
  /** GeoJSON format token: 'GEOJSON' for ArcGIS (GTK), 'application/json' for GeoServer (SYKE). */
  outputFormat?: string
}

/** WFS 2.0 GetFeature over a 3067 bbox, GeoJSON output, startIndex paging, cached. */
export async function fetchWfsBbox(req: WfsRequest): Promise<FeatureCollection> {
  const srs = req.srs ?? 'EPSG:3067'
  const count = req.count ?? 5000
  const outputFormat = req.outputFormat ?? 'GEOJSON'
  const cacheKey = { source: req.source, collection: req.typeName, tile: req.bbox3067.join('_') }

  const cached = await readCache<FeatureCollection>(cacheKey)
  if (cached) return cached

  const features: Feature[] = []
  let startIndex = 0
  for (;;) {
    const url =
      `${req.endpoint}?` +
      new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: req.typeName,
        srsName: srs,
        bbox: `${req.bbox3067.join(',')},${srs}`,
        outputFormat,
        count: String(count),
        startIndex: String(startIndex)
      }).toString()

    const res = await fetch(url)
    if (!res.ok) throw new Error(`WFS ${req.source}/${req.typeName} → ${res.status} ${res.statusText}`)
    const page = (await res.json()) as FeatureCollection
    const got = page.features?.length ?? 0
    features.push(...(page.features ?? []))
    if (got < count) break
    startIndex += count
  }

  const fc: FeatureCollection = { type: 'FeatureCollection', features }
  await writeCache(cacheKey, fc)
  return fc
}
