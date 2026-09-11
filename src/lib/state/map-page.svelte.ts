import type { FeatureCollection, Geometry, Position } from 'geojson'
import { DEFAULT_BASEMAP, type BasemapId } from '$lib/map/basemaps'
import type { CandidateFilter, CandidateProps } from '$lib/map/types'
import type { SpeciesRenderConfig } from '$lib/species/registry'
import type { SpeciesTileJson } from '../../routes/tiles/[species].json/+server'

export interface MapController {
  flyTo(id: string): void
  jumpTo(center: [number, number], zoom: number): void
}

export interface CameraState {
  zoom: number
  lat: number
  lng: number
}

export interface LayerSettings {
  candidatesVisible: boolean
  candidateOpacity: number
  basemapId: BasemapId
}

/**
 * Single source of truth for the /[laji] map page. Shells (mobile card sheet,
 * desktop panel) and MapView are pure presentation over this API. Swapping
 * a shell touches one import, never this class.
 */
export class MapPageState {
  geojson = $state<FeatureCollection | null>(null)
  centroids = $state<FeatureCollection | null>(null)
  /** Raster species: the tile descriptor the map mounts as a raster-dem source. */
  tiles = $state<SpeciesTileJson | null>(null)
  render = $state<SpeciesRenderConfig['render']>('polygon')
  loadError = $state(false)
  filter = $state<CandidateFilter>({ minComposite: 0 })
  selectedId = $state<string | null>(null)
  layers = $state<LayerSettings>({ candidatesVisible: true, candidateOpacity: 0.7, basemapId: DEFAULT_BASEMAP })
  /** Spot id from a shared URL, resolved once map + data are both ready. */
  pendingKohde = $state<string | null>(null)
  /** Last camera reported by the map (moveend). The page mirrors it to the URL. */
  camera = $state<CameraState | null>(null)

  #map: MapController | null = null
  #loadToken = 0

  /** Data for the current species has arrived (blob or tile descriptor). */
  ready = $derived(this.render === 'raster' ? this.tiles !== null : this.geojson !== null)
  /** Region label from the live dataset when the species publishes one. */
  regionLabel = $derived<string | null>(this.tiles?.regionLabel ?? null)

  features = $derived<CandidateProps[]>(
    this.geojson ? this.geojson.features.map((f) => f.properties as unknown as CandidateProps) : []
  )

  /** Feature id → [lng, lat] bbox-centre (spot coordinates for the tap card). */
  #centers = $derived.by(() => {
    const centers = new Map<string, [number, number]>()
    for (const f of this.geojson?.features ?? []) {
      if (!f.geometry) continue
      const c = bboxCenter(f.geometry)
      if (c) centers.set(String(f.properties?.id), c)
    }
    return centers
  })

  /** [lng, lat] centre of a spot, when its geometry is loaded. */
  centerOf(id: string): [number, number] | null {
    return this.#centers.get(id) ?? null
  }

  select(id: string | null) {
    this.selectedId = id
  }

  selectAndFly(id: string) {
    this.selectedId = id
    this.#map?.flyTo(id)
  }

  registerMap(controller: MapController) {
    this.#map = controller
    this.#resolvePendingKohde()
  }

  unregisterMap() {
    this.#map = null
  }

  /** Fetch a species' blobs; keeps filter/layer prefs across species switches. */
  loadSpecies(config: SpeciesRenderConfig) {
    const token = ++this.#loadToken
    this.geojson = null
    this.centroids = null
    this.tiles = null
    this.render = config.render
    this.loadError = false
    this.selectedId = null

    if (config.render === 'raster') {
      fetch(config.tilesUrl)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data) => {
          if (token === this.#loadToken) this.tiles = data as SpeciesTileJson
        })
        .catch(() => {
          if (token === this.#loadToken) this.loadError = true
        })
      // A raster surface has no spots: a shared ?kohde= cannot resolve.
      this.pendingKohde = null
      return
    }

    fetch(config.geometryUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (token !== this.#loadToken) return
        this.geojson = data as FeatureCollection
        this.#resolvePendingKohde()
      })
      .catch(() => {
        if (token === this.#loadToken) this.loadError = true
      })

    if (config.render === 'heatmap' && config.centroidsUrl) {
      fetch(config.centroidsUrl)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data) => {
          if (token === this.#loadToken) this.centroids = data as FeatureCollection
        })
        // Heat layer is an enhancement; polygons still render without it.
        .catch(() => {})
    }
  }

  #resolvePendingKohde() {
    const id = this.pendingKohde
    if (!id || !this.#map || !this.geojson) return
    if (this.features.some((f) => f.id === id)) {
      this.selectedId = id
      this.#map.flyTo(id)
    }
    this.pendingKohde = null
  }
}

function bboxCenter(geom: Geometry): [number, number] | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const walk = (c: Position | Position[] | Position[][] | Position[][][]) => {
    if (typeof c[0] === 'number') {
      const [x, y] = c as Position
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    } else {
      for (const sub of c as unknown[]) walk(sub as Position)
    }
  }
  if (!('coordinates' in geom)) return null
  walk(geom.coordinates as Position[])
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null
}
