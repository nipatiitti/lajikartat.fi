import type { FeatureCollection, Geometry, Position } from 'geojson'
import { haversineM } from '$lib/geo/distance'
import { DEFAULT_BASEMAP, type BasemapId } from '$lib/map/basemaps'
import { ALL_CONFIDENCES, type CandidateFilter, type CandidateProps, type SortMode } from '$lib/map/types'
import type { SpeciesRenderConfig } from '$lib/species/registry'

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
 * Single source of truth for the /[laji] map page. Shells (mobile sheet,
 * desktop sidebar) and MapView are pure presentation over this API — swapping
 * a shell touches one import, never this class.
 */
export class MapPageState {
  geojson = $state<FeatureCollection | null>(null)
  centroids = $state<FeatureCollection | null>(null)
  loadError = $state(false)
  filter = $state<CandidateFilter>({ minComposite: 0, confidences: [...ALL_CONFIDENCES] })
  selectedId = $state<string | null>(null)
  sort = $state<SortMode>('score')
  userLocation = $state<[number, number] | null>(null)
  layers = $state<LayerSettings>({ candidatesVisible: true, candidateOpacity: 0.7, basemapId: DEFAULT_BASEMAP })
  /** Spot id from a shared URL, resolved once map + data are both ready. */
  pendingKohde = $state<string | null>(null)
  /** Last camera reported by the map (moveend) — the page mirrors it to the URL. */
  camera = $state<CameraState | null>(null)

  #map: MapController | null = null
  #loadToken = 0

  features = $derived<CandidateProps[]>(
    this.geojson ? this.geojson.features.map((f) => f.properties as unknown as CandidateProps) : []
  )

  /** Feature id → [lng, lat] bbox-centre, for distance sorting. */
  #centers = $derived.by(() => {
    const centers = new Map<string, [number, number]>()
    for (const f of this.geojson?.features ?? []) {
      if (!f.geometry) continue
      const c = bboxCenter(f.geometry)
      if (c) centers.set(String(f.properties?.id), c)
    }
    return centers
  })

  ranked = $derived.by(() => {
    const { minComposite, confidences } = this.filter
    const matching = this.features.filter((f) => f.composite >= minComposite && confidences.includes(f.confidence))
    const location = this.userLocation
    if (this.sort === 'size') {
      return matching.toSorted((a, b) => (b.areaHa ?? -1) - (a.areaHa ?? -1))
    }
    if (this.sort === 'distance' && location) {
      return matching.toSorted((a, b) => (this.distanceTo(a.id) ?? Infinity) - (this.distanceTo(b.id) ?? Infinity))
    }
    return matching.toSorted((a, b) => b.composite - a.composite)
  })

  /** Distance from the user to a spot in metres, when both are known. */
  distanceTo(id: string): number | null {
    const location = this.userLocation
    if (!location) return null
    const center = this.#centers.get(id)
    return center ? haversineM(location, center) : null
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
    this.loadError = false
    this.selectedId = null

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
        // Heat layer is an enhancement — polygons still render without it.
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
