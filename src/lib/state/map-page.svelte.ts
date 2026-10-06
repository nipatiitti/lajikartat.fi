import type { FeatureCollection } from 'geojson'
import { DEFAULT_BASEMAP, type BasemapId } from '$lib/map/basemaps'
import { bboxOf, bboxOfCollection, centerOfBounds, type Bounds } from '$lib/map/geometry'
import type { CandidateFilter } from '$lib/map/types'
import type { Camera } from '$lib/map/url'
import type { SpeciesRenderConfig } from '$lib/species/registry'
import type { SpeciesTileJson } from '../../routes/tiles/[species].json/+server'

export interface MapController {
  flyTo(id: string): void
}

export interface LayerSettings {
  candidatesVisible: boolean
  candidateOpacity: number
  basemapId: BasemapId
}

/**
 * Single source of truth for the /[species] map page. The shell and the map
 * view are pure presentation over this class.
 */
export class MapPageState {
  /** Vector species: the candidate FeatureCollection. */
  geojson = $state<FeatureCollection | null>(null)
  /** Raster species: the tile descriptor the map mounts as a raster-dem source. */
  tiles = $state<SpeciesTileJson | null>(null)
  loadError = $state(false)
  filter = $state<CandidateFilter>({ minComposite: 0 })
  selectedId = $state<string | null>(null)
  layers = $state<LayerSettings>({ candidatesVisible: true, candidateOpacity: 0.7, basemapId: DEFAULT_BASEMAP })
  /** Spot id from a shared URL, resolved once map + data are both ready. */
  pendingKohde = $state<string | null>(null)
  /** Last camera reported by the map. The page mirrors it to the URL. */
  camera = $state<Camera | null>(null)

  #render = $state<SpeciesRenderConfig['render']>('vector')
  #map: MapController | null = null
  #loadToken = 0

  /** Data for the current species has arrived (blob or tile descriptor). */
  ready = $derived(this.#render === 'raster' ? this.tiles !== null : this.geojson !== null)
  /** Extent of the loaded dataset: the initial view when the URL carries no camera. */
  bounds = $derived<Bounds | null>(this.tiles?.bounds ?? (this.geojson ? bboxOfCollection(this.geojson) : null))

  /** [lng, lat] centre of a spot, when its geometry is loaded. */
  centerOf(id: string): [number, number] | null {
    const b = bboxOf(this.geojson?.features.find((f) => String(f.properties?.id) === id)?.geometry)
    return b && centerOfBounds(b)
  }

  select(id: string | null) {
    this.selectedId = id
  }

  registerMap(controller: MapController) {
    this.#map = controller
    this.#resolvePendingKohde()
  }

  unregisterMap() {
    this.#map = null
  }

  /** Fetch a species' data; keeps filter/layer prefs across species switches. */
  loadSpecies(config: SpeciesRenderConfig) {
    const token = ++this.#loadToken
    this.geojson = null
    this.tiles = null
    this.#render = config.render
    this.loadError = false
    this.selectedId = null

    const url = config.render === 'raster' ? config.tilesUrl : config.geometryUrl
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (token !== this.#loadToken) return
        if (config.render === 'raster') this.tiles = data as SpeciesTileJson
        else this.geojson = data as FeatureCollection
        this.#resolvePendingKohde()
      })
      .catch(() => {
        if (token === this.#loadToken) this.loadError = true
      })
  }

  #resolvePendingKohde() {
    const id = this.pendingKohde
    if (!id || !this.#map || !this.ready) return
    // A raster surface has no spots: a shared ?kohde= cannot resolve.
    if (this.geojson?.features.some((f) => String(f.properties?.id) === id)) {
      this.selectedId = id
      this.#map.flyTo(id)
    }
    this.pendingKohde = null
  }
}
