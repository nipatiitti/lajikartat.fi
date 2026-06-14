<script lang="ts">
  import type { FeatureCollection } from 'geojson'
  import { page } from '$app/state'
  import Filters from '$lib/components/Filters.svelte'
  import Legend from '$lib/components/Legend.svelte'
  import MapView from '$lib/components/Map.svelte'
  import RankedList from '$lib/components/RankedList.svelte'
  import WhyPanel from '$lib/components/WhyPanel.svelte'
  import { ALL_CONFIDENCES, type CandidateFilter, type CandidateProps } from '$lib/map/types'
  import { SPECIES_RENDER } from '$lib/species/registry'

  const species = $derived(page.params.species ?? '')
  const config = $derived(SPECIES_RENDER[species])

  let geojson = $state<FeatureCollection | null>(null)
  let loadError = $state(false)
  let filter = $state<CandidateFilter>({ minComposite: 0, confidences: [...ALL_CONFIDENCES] })
  let selectedId = $state<string | null>(null)
  let mapRef = $state<{ flyTo(id: string): void }>()

  const features = $derived<CandidateProps[]>(
    geojson ? geojson.features.map((f) => f.properties as unknown as CandidateProps) : []
  )

  // Fetch the species' GeoJSON once (served from R2) whenever the species changes.
  $effect(() => {
    if (!config) return
    const url = config.geometryUrl
    geojson = null
    loadError = false
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => (geojson = data as FeatureCollection))
      .catch(() => (loadError = true))
  })

  function select(id: string | null) {
    selectedId = id
  }
  function selectAndFly(id: string) {
    selectedId = id
    mapRef?.flyTo(id)
  }
</script>

<svelte:head><title>{config?.label ?? species} — lajikartat.fi</title></svelte:head>

{#if !config}
  <div class="p-8 text-gray-600">Unknown species "{species}".</div>
{:else}
  <div class="flex h-screen w-screen overflow-hidden text-gray-900">
    <aside class="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div class="border-b border-gray-100 px-3 py-3">
        <h1 class="font-semibold">{config.label}</h1>
        <p class="text-xs text-gray-500">Pirkanmaa · validation</p>
      </div>
      <Filters bind:filter />
      <Legend ramp={config.ramp} />
      <div class="min-h-0 flex-1 overflow-y-auto border-t border-gray-100">
        {#if loadError}
          <p class="px-3 py-4 text-sm text-red-600">Couldn't load ponds.</p>
        {:else if !geojson}
          <p class="px-3 py-4 text-sm text-gray-400">Loading ponds…</p>
        {:else}
          <RankedList {features} {filter} {selectedId} onselect={selectAndFly} />
        {/if}
      </div>
    </aside>

    <main class="relative min-w-0 flex-1">
      <MapView bind:this={mapRef} {geojson} {config} {filter} {selectedId} onselect={select} />
    </main>

    <WhyPanel {species} id={selectedId} onclose={() => (selectedId = null)} />
  </div>
{/if}
