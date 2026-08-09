<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css'
  import type { Geometry, Position } from 'geojson'
  import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
  import { untrack } from 'svelte'
  import { resolveBasemapStyle, type BasemapId } from '$lib/map/basemaps'
  import {
    candidateLayers,
    candidateSources,
    fillOpacity,
    filterExpression,
    heatmapOpacity,
    LAYER_FILL,
    LAYER_HEAT,
    LAYER_LINE,
    lineOpacity,
    SOURCE_CANDIDATES,
    SOURCE_CENTROIDS,
    type CandidatePaintOptions
  } from '$lib/map/layers'
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

  let container: HTMLDivElement
  let map: MlMap | undefined
  let ready = $state(false)
  let hoveredId: string | null = null
  let prevSelected: string | null = null

  const paintOptions = $derived<CandidatePaintOptions>({
    render: config.render,
    ramp: config.ramp,
    opacity: mapState.layers.candidateOpacity,
    visible: mapState.layers.candidatesVisible
  })

  function setHover(id: string | null) {
    if (!map) return
    if (hoveredId && hoveredId !== id)
      map.setFeatureState({ source: SOURCE_CANDIDATES, id: hoveredId }, { hover: false })
    hoveredId = id
    if (id) map.setFeatureState({ source: SOURCE_CANDIDATES, id }, { hover: true })
  }

  function ensureCandidateLayers() {
    if (!map || map.getSource(SOURCE_CANDIDATES)) return
    const sources = candidateSources(mapState.geojson, mapState.centroids)
    for (const [id, spec] of Object.entries(sources)) map.addSource(id, spec)
    for (const layer of candidateLayers(paintOptions)) map.addLayer(layer)
    applyFilter()
    reapplySelection()
  }

  function applyFilter() {
    if (!map?.getLayer(LAYER_FILL)) return
    const expr = filterExpression(mapState.filter)
    map.setFilter(LAYER_FILL, expr)
    map.setFilter(LAYER_LINE, expr)
    map.setFilter(LAYER_HEAT, expr)
  }

  // Feature-state does not survive source re-creation (basemap switches).
  function reapplySelection() {
    if (!map || !mapState.selectedId) return
    map.setFeatureState({ source: SOURCE_CANDIDATES, id: mapState.selectedId }, { selected: true })
    prevSelected = mapState.selectedId
  }

  function bboxOf(geom: Geometry): [number, number, number, number] | null {
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
    if ('coordinates' in geom) walk(geom.coordinates as Position[])
    return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null
  }

  function flyTo(id: string) {
    if (!map || !mapState.geojson) return
    const f = mapState.geojson.features.find((x) => String(x.id ?? x.properties?.id) === id)
    if (!f?.geometry) return
    const b = bboxOf(f.geometry)
    if (b) map.fitBounds(b, { padding: 90, maxZoom: 14, duration: 600 })
  }

  function jumpTo(center: [number, number], zoom: number) {
    map?.jumpTo({ center, zoom })
  }

  // Init — runs ONCE. The map instance persists across species/config changes;
  // every config-dependent read here is untracked so no dependency can sneak in
  // and recreate the map (the old recreate-on-config bug).
  $effect(() => {
    let disposed = false
    void (async () => {
      const { default: maplibregl } = await import('maplibre-gl')
      if (disposed) return

      const { style, center, zoom } = await untrack(async () => {
        const style = await resolveBasemapStyle(mapState.layers.basemapId)
        const cam = initialCamera
        return {
          style,
          center: (cam ? [cam.lng, cam.lat] : config.initialView.center) as [number, number],
          zoom: cam ? cam.zoom : config.initialView.zoom
        }
      })

      if (disposed) return
      const m = new maplibregl.Map({
        container,
        style,
        center,
        zoom,
        attributionControl: { compact: true }
      })
      map = m

      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      const geolocate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: true
      })
      m.addControl(geolocate, 'top-right')
      m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

      m.on('load', () => {
        ensureCandidateLayers()
        ready = true
        mapState.registerMap({ flyTo, jumpTo })
      })
      m.on('moveend', () => {
        const c = m.getCenter()
        mapState.camera = { zoom: m.getZoom(), lat: c.lat, lng: c.lng }
      })
      m.on('click', LAYER_FILL, (e) => {
        const f = e.features?.[0]
        mapState.select(f ? String(f.properties?.id) : null)
      })
      m.on('mousemove', LAYER_FILL, (e) => {
        m.getCanvas().style.cursor = 'pointer'
        const f = e.features?.[0]
        setHover(f ? String(f.properties?.id) : null)
      })
      m.on('mouseleave', LAYER_FILL, () => {
        m.getCanvas().style.cursor = ''
        setHover(null)
      })
    })()

    return () => {
      disposed = true
      mapState.unregisterMap()
      map?.remove()
      map = undefined
      ready = false
      hoveredId = null
      prevSelected = null
    }
  })

  // Data: swap source contents when a species' blobs arrive (map never recreates).
  $effect(() => {
    const polygons = mapState.geojson
    const centroids = mapState.centroids
    if (!ready || !map) return
    const polySource = map.getSource(SOURCE_CANDIDATES) as GeoJSONSource | undefined
    if (!polySource) {
      ensureCandidateLayers()
      return
    }
    if (polygons) polySource.setData(polygons)
    const centroidSource = map.getSource(SOURCE_CENTROIDS) as GeoJSONSource | undefined
    if (centroidSource && centroids) centroidSource.setData(centroids)
  })

  // Filter changes are cheap setFilter calls — never re-parse the FeatureCollection.
  $effect(() => {
    void mapState.filter.minComposite
    if (!ready || !map) return
    applyFilter()
  })

  // Paint: user opacity / layer toggle / species render mode.
  $effect(() => {
    const opts = paintOptions
    if (!ready || !map?.getLayer(LAYER_FILL)) return
    map.setPaintProperty(LAYER_FILL, 'fill-opacity', fillOpacity(opts))
    map.setPaintProperty(LAYER_LINE, 'line-opacity', lineOpacity(opts))
    map.setPaintProperty(LAYER_HEAT, 'heatmap-opacity', heatmapOpacity(opts))
  })

  // Selection via feature-state.
  $effect(() => {
    const id = mapState.selectedId
    if (!ready || !map) return
    if (prevSelected && prevSelected !== id) {
      map.setFeatureState({ source: SOURCE_CANDIDATES, id: prevSelected }, { selected: false })
    }
    if (id) map.setFeatureState({ source: SOURCE_CANDIDATES, id }, { selected: true })
    prevSelected = id
  })

  // Basemap switch: one setStyle path for vector styles and synthesized raster
  // styles. transformStyle re-appends freshly built candidate sources/layers on
  // top of the incoming style; feature-state and filters are re-applied after.
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
      m.setStyle(next, {
        transformStyle: (_prev, incoming) => ({
          ...incoming,
          sources: { ...incoming.sources, ...candidateSources(mapState.geojson, mapState.centroids) },
          layers: [...incoming.layers, ...candidateLayers(paintOptions)]
        })
      })
      m.once('idle', () => {
        applyFilter()
        reapplySelection()
      })
    })
  })
</script>

<div bind:this={container} class="h-full w-full"></div>
