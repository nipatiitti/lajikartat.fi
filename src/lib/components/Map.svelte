<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css'
  import type { Map as MlMap } from 'maplibre-gl'
  import { untrack } from 'svelte'
  import { resolveBasemapStyle, type BasemapId } from '$lib/map/basemaps'
  import * as candidate from '$lib/map/candidate-layer'
  import { FINLAND_VIEW } from '$lib/map/finland'
  import { bboxOf } from '$lib/map/geometry'
  import * as relief from '$lib/map/relief-layer'
  import type { PaintOptions, StyleAdditions } from '$lib/map/types'
  import type { Camera } from '$lib/map/url'
  import type { MapPageState } from '$lib/state/map-page.svelte'
  import type { SpeciesRenderConfig } from '$lib/species/registry'

  let {
    mapState,
    config,
    initialCamera = null
  }: {
    mapState: MapPageState
    config: SpeciesRenderConfig
    initialCamera?: Camera | null
  } = $props()

  const FIT_PADDING = 40
  const SPOT_FIT = { padding: 90, maxZoom: 14, duration: 600 }

  let container: HTMLDivElement
  let map: MlMap | undefined
  let ready = $state(false)
  let hoveredId: string | null = null
  let prevSelected: string | null = null
  // Without a URL camera the first dataset decides the view, once.
  let fitted = false

  const paint = $derived<PaintOptions>({
    ramp: config.ramp,
    opacity: mapState.layers.candidateOpacity,
    visible: mapState.layers.candidatesVisible
  })

  // Only one layer family is mounted at a time; a species switch across
  // families tears the other down first.
  function unmountAll(m: MlMap) {
    candidate.unmount(m)
    relief.unmount(m)
  }

  function additions(): StyleAdditions | null {
    if (config.render === 'raster')
      return mapState.tiles && relief.specs(mapState.tiles, paint, mapState.filter.minComposite)
    return candidate.specs(mapState.geojson, paint, mapState.filter.minComposite)
  }

  function mount(m: MlMap) {
    const a = additions()
    if (!a) return
    unmountAll(m)
    for (const [id, spec] of Object.entries(a.sources)) m.addSource(id, spec)
    for (const layer of a.layers) m.addLayer(layer)
    if (config.render === 'vector') {
      reapplySelection()
      bindTapHandlers(m)
    }
  }

  function setHover(id: string | null) {
    if (!map) return
    if (hoveredId && hoveredId !== id) candidate.setHover(map, hoveredId, false)
    hoveredId = id
    if (id) candidate.setHover(map, id, true)
  }

  // Delegated layer events are bound once the fill layer exists (binding them
  // for a missing layer makes MapLibre log an error on every pointer event).
  let tapHandlersBound = false
  function bindTapHandlers(m: MlMap) {
    if (tapHandlersBound) return
    tapHandlersBound = true
    m.on('click', candidate.LAYER_FILL, (e) => {
      const f = e.features?.[0]
      mapState.select(f ? String(f.properties?.id) : null)
    })
    m.on('mousemove', candidate.LAYER_FILL, (e) => {
      m.getCanvas().style.cursor = 'pointer'
      const f = e.features?.[0]
      setHover(f ? String(f.properties?.id) : null)
    })
    m.on('mouseleave', candidate.LAYER_FILL, () => {
      m.getCanvas().style.cursor = ''
      setHover(null)
    })
  }

  // Feature-state does not survive source re-creation (basemap switches).
  function reapplySelection() {
    if (!map || !mapState.selectedId) return
    candidate.setSelected(map, mapState.selectedId, true)
    prevSelected = mapState.selectedId
  }

  function flyTo(id: string) {
    if (!map || !mapState.geojson) return
    const f = mapState.geojson.features.find((x) => String(x.id ?? x.properties?.id) === id)
    const b = bboxOf(f?.geometry)
    if (b) map.fitBounds(b, SPOT_FIT)
  }

  function reportCamera(m: MlMap) {
    const c = m.getCenter()
    mapState.camera = { zoom: m.getZoom(), lat: c.lat, lng: c.lng }
  }

  // Init — runs ONCE. The map instance persists across species/config changes;
  // every config-dependent read here is untracked so no dependency can sneak in
  // and recreate the map.
  $effect(() => {
    let disposed = false
    void (async () => {
      const { default: maplibregl } = await import('maplibre-gl')
      if (disposed) return

      const { style, center, zoom } = await untrack(async () => {
        const cam = initialCamera
        fitted = cam !== null
        return {
          style: await resolveBasemapStyle(mapState.layers.basemapId),
          center: (cam ? [cam.lng, cam.lat] : FINLAND_VIEW.center) as [number, number],
          zoom: cam ? cam.zoom : FINLAND_VIEW.zoom
        }
      })

      if (disposed) return
      const m = new maplibregl.Map({ container, style, center, zoom, attributionControl: { compact: true } })
      map = m

      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      m.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserLocation: true
        }),
        'top-right'
      )
      m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

      m.on('load', () => {
        untrack(() => mount(m))
        ready = true
        reportCamera(m)
        mapState.registerMap({ flyTo })
      })
      m.on('moveend', () => reportCamera(m))
    })()

    return () => {
      disposed = true
      mapState.unregisterMap()
      map?.remove()
      map = undefined
      ready = false
      hoveredId = null
      prevSelected = null
      tapHandlersBound = false
    }
  })

  // Data: a species' blob or tile descriptor arrives. Vector data swaps in
  // place; a raster-dem source cannot swap its tiles, so it remounts.
  $effect(() => {
    const geojson = mapState.geojson
    const tiles = mapState.tiles
    if (!ready || !map) return
    const m = map
    if (config.render === 'raster') {
      if (relief.isMounted(m)) relief.unmount(m)
      if (tiles) untrack(() => mount(m))
      return
    }
    if (!candidate.isMounted(m)) untrack(() => mount(m))
    else if (geojson) candidate.setData(m, geojson)
  })

  // First dataset: fit the view to its extent unless the URL set a camera.
  $effect(() => {
    const bounds = mapState.bounds
    if (!ready || !map || !bounds || fitted) return
    fitted = true
    map.fitBounds(bounds, { padding: FIT_PADDING, duration: 0 })
  })

  // Filter: a cheap setFilter / new colour expression, never a data reload.
  $effect(() => {
    const min = mapState.filter.minComposite
    if (!ready || !map) return
    if (config.render === 'raster') {
      if (relief.isMounted(map)) relief.applyFilter(map, config.ramp, min)
    } else if (candidate.isMounted(map)) candidate.applyFilter(map, min)
  })

  // Paint: user opacity / layer toggle.
  $effect(() => {
    const p = paint
    if (!ready || !map) return
    if (config.render === 'raster') {
      if (relief.isMounted(map)) relief.applyPaint(map, p)
    } else if (candidate.isMounted(map)) candidate.applyPaint(map, p)
  })

  // Selection via feature-state.
  $effect(() => {
    const id = mapState.selectedId
    if (!ready || !map || !candidate.isMounted(map)) return
    if (prevSelected && prevSelected !== id) candidate.setSelected(map, prevSelected, false)
    if (id) candidate.setSelected(map, id, true)
    prevSelected = id
  })

  // Basemap switch: transformStyle re-appends freshly built species sources and
  // layers on top of the incoming style; feature-state is re-applied after.
  let appliedBasemap: BasemapId | null = null
  $effect(() => {
    const id = mapState.layers.basemapId
    if (!ready || !map) return
    if (appliedBasemap === null) {
      appliedBasemap = id // style the map was created with
      return
    }
    if (appliedBasemap === id) return
    appliedBasemap = id
    const m = map
    void resolveBasemapStyle(id).then((next) => {
      if (!m.getContainer().isConnected) return
      const a = untrack(additions)
      m.setStyle(next, {
        transformStyle: (_prev, incoming) => ({
          ...incoming,
          sources: { ...incoming.sources, ...a?.sources },
          layers: [...incoming.layers, ...(a?.layers ?? [])]
        })
      })
      m.once('idle', reapplySelection)
    })
  })
</script>

<div bind:this={container} class="h-full w-full"></div>
