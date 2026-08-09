import type { StyleSpecification } from 'maplibre-gl'

// MML basemaps through the same-origin `/basemap` key-injecting proxy
// (host avoin-karttakuva.maanmittauslaitos.fi — the proxy forwards any path).
// Validated live 2026-08-09: both vector styles 200, both WMTS REST rasters 200.

export type BasemapId = 'backgroundmap' | 'taustakartta' | 'maastokartta' | 'ortokuva'

interface VectorBasemap {
  kind: 'vector'
  label: string
  url: string
}

interface RasterBasemap {
  kind: 'raster'
  label: string
  /** WMTS REST template — note MML's path order is {z}/{y}/{x} (y before x). */
  tiles: string
}

export type Basemap = VectorBasemap | RasterBasemap

export const BASEMAPS: Record<BasemapId, Basemap> = {
  backgroundmap: {
    kind: 'vector',
    label: 'Maastokartta (vektori)',
    url: '/basemap/vectortiles/stylejson/v20/backgroundmap.json?TileMatrixSet=WGS84_Pseudo-Mercator'
  },
  taustakartta: {
    kind: 'vector',
    label: 'Taustakartta',
    url: '/basemap/vectortiles/stylejson/v20/taustakartta.json?TileMatrixSet=WGS84_Pseudo-Mercator'
  },
  maastokartta: {
    kind: 'raster',
    label: 'Maastokartta (rasteri)',
    tiles: '/basemap/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png'
  },
  ortokuva: {
    kind: 'raster',
    label: 'Ilmakuva',
    tiles: '/basemap/avoin/wmts/1.0.0/ortokuva/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png'
  }
}

export const DEFAULT_BASEMAP: BasemapId = 'backgroundmap'

export const BASEMAP_IDS = Object.keys(BASEMAPS) as BasemapId[]

// Used when the basemap proxy 204s (no MML key) — candidate layers still render.
export const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8eef0' } }]
}

/**
 * Resolve a basemap id to a full style: vector styles are fetched through the
 * proxy (204/error → blank fallback), raster styles are synthesized inline —
 * one setStyle code path for all four options.
 */
export async function resolveBasemapStyle(id: BasemapId): Promise<StyleSpecification> {
  const basemap = BASEMAPS[id]
  if (basemap.kind === 'raster') {
    return {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: [basemap.tiles],
          tileSize: 256,
          attribution: '© Maanmittauslaitos'
        }
      },
      layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }]
    }
  }
  try {
    const res = await fetch(basemap.url, { cache: 'no-store' })
    if (!res.ok || res.status === 204) return BLANK_STYLE
    return (await res.json()) as StyleSpecification
  } catch {
    return BLANK_STYLE
  }
}
