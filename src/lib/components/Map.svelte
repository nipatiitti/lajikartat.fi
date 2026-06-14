<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css'
  import type { FeatureCollection, Geometry, Position } from 'geojson'
  import type {
    ExpressionSpecification,
    FilterSpecification,
    GeoJSONSource,
    Map as MlMap,
    StyleSpecification
  } from 'maplibre-gl'
  import type { SpeciesRenderConfig } from '$lib/species/registry'
  import type { CandidateFilter } from '$lib/map/types'

  let {
    geojson,
    config,
    filter,
    selectedId = null,
    onselect
  }: {
    geojson: FeatureCollection | null
    config: SpeciesRenderConfig
    filter: CandidateFilter
    selectedId?: string | null
    onselect: (id: string | null) => void
  } = $props()

  const SOURCE = 'candidates'
  const FILL = 'candidates-fill'
  const LINE = 'candidates-outline'
  // MML has no `maastokartta` vector style; `backgroundmap` is the detailed topographic
  // vector style (more terrain detail + altitude contours) — closest to maastokartta.
  // (`taustakartta` is the muted backdrop; true maastokartta exists only as raster WMTS.)
  const STYLE_URL = '/basemap/vectortiles/stylejson/v20/backgroundmap.json?TileMatrixSet=WGS84_Pseudo-Mercator'

  // Used when the basemap proxy 204s (no MML key) — the perch polygons still render.
  const BLANK_STYLE: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e8eef0' } }]
  }

  let container: HTMLDivElement
  let map: MlMap | undefined
  let ready = $state(false)
  let hoveredId: string | null = null
  let prevSelected: string | null = null

  // maplibre expression literals are typed too loosely to infer here — build then cast.
  const expr = (e: unknown): ExpressionSpecification => e as ExpressionSpecification
  const fillColor = (): ExpressionSpecification =>
    expr(['interpolate', ['linear'], ['get', config.colorBy], ...config.ramp.flat()])
  const filterExpr = (): FilterSpecification =>
    [
      'all',
      ['>=', ['get', 'composite'], filter.minComposite],
      ['in', ['get', 'confidence'], ['literal', filter.confidences]]
    ] as unknown as FilterSpecification

  function setHover(id: string | null) {
    if (!map) return
    if (hoveredId && hoveredId !== id) map.setFeatureState({ source: SOURCE, id: hoveredId }, { hover: false })
    hoveredId = id
    if (id) map.setFeatureState({ source: SOURCE, id }, { hover: true })
  }

  function addLayers() {
    if (!map || !geojson || map.getSource(SOURCE)) return
    // promoteId lifts the `id` property to the feature id so feature-state works.
    map.addSource(SOURCE, { type: 'geojson', data: geojson, promoteId: 'id' })
    map.addLayer({
      id: FILL,
      type: 'fill',
      source: SOURCE,
      paint: {
        'fill-color': fillColor(),
        'fill-opacity': expr(['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.6])
      }
    })
    map.addLayer({
      id: LINE,
      type: 'line',
      source: SOURCE,
      paint: {
        'line-color': expr(['case', ['boolean', ['feature-state', 'selected'], false], '#111111', '#3a3a3a']),
        'line-width': expr([
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          2.5,
          ['boolean', ['feature-state', 'hover'], false],
          1.5,
          0.4
        ])
      }
    })
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

  export function flyTo(id: string) {
    if (!map || !geojson) return
    const f = geojson.features.find((x) => String(x.id ?? x.properties?.id) === id)
    if (!f?.geometry) return
    const b = bboxOf(f.geometry)
    if (b) map.fitBounds(b, { padding: 90, maxZoom: 14, duration: 600 })
  }

  $effect(() => {
    let disposed = false
    void (async () => {
      const { default: maplibregl } = await import('maplibre-gl')
      if (disposed) return

      const probe = await fetch(STYLE_URL, { cache: 'no-store' })
      const style: string | StyleSpecification =
        probe.ok && probe.status !== 204 ? ((await probe.json()) as StyleSpecification) : BLANK_STYLE

      if (disposed) return
      const m = new maplibregl.Map({
        container,
        style,
        center: config.initialView.center,
        zoom: config.initialView.zoom,
        attributionControl: { compact: true }
      })
      map = m

      m.on('load', () => {
        addLayers()
        ready = true
      })
      m.on('click', FILL, (e) => {
        const f = e.features?.[0]
        onselect(f ? String(f.properties?.id) : null)
      })
      m.on('mousemove', FILL, (e) => {
        m.getCanvas().style.cursor = 'pointer'
        const f = e.features?.[0]
        setHover(f ? String(f.properties?.id) : null)
      })
      m.on('mouseleave', FILL, () => {
        m.getCanvas().style.cursor = ''
        setHover(null)
      })
    })()

    return () => {
      disposed = true
      map?.remove()
      map = undefined
      ready = false
      hoveredId = null
      prevSelected = null
    }
  })

  // Keep the source data in sync once layers exist (geojson is loaded once up-front).
  $effect(() => {
    if (!ready || !map || !geojson) return
    const src = map.getSource(SOURCE) as GeoJSONSource | undefined
    if (src) src.setData(geojson)
    else addLayers()
  })

  // Filter changes are cheap setFilter calls — never re-parse the FeatureCollection.
  $effect(() => {
    const expr = filterExpr()
    if (!ready || !map?.getLayer(FILL)) return
    map.setFilter(FILL, expr)
    map.setFilter(LINE, expr)
  })

  // Highlight the selected pond via feature-state.
  $effect(() => {
    const id = selectedId
    if (!ready || !map) return
    if (prevSelected && prevSelected !== id) map.setFeatureState({ source: SOURCE, id: prevSelected }, { selected: false })
    if (id) map.setFeatureState({ source: SOURCE, id }, { selected: true })
    prevSelected = id
  })
</script>

<div bind:this={container} class="h-full w-full"></div>
