<script lang="ts">
  import ConditionsChip from '$lib/components/ConditionsChip.svelte'
  import Filters from '$lib/components/Filters.svelte'
  import LayerControls from '$lib/components/LayerControls.svelte'
  import Legend from '$lib/components/Legend.svelte'
  import SpeciesSwitcher from '$lib/components/SpeciesSwitcher.svelte'
  import SpotDetail from '$lib/components/SpotDetail.svelte'
  import SpotList from '$lib/components/SpotList.svelte'
  import { COPY } from '$lib/copy'
  import type { MapPageState } from '$lib/state/map-page.svelte'
  import type { SpeciesRenderConfig } from '$lib/species/registry'

  let {
    mapState,
    config,
    species
  }: {
    mapState: MapPageState
    config: SpeciesRenderConfig
    species: string
  } = $props()
</script>

<aside class="absolute inset-y-0 left-0 z-10 flex w-80 flex-col border-r border-gray-200 bg-white">
  <div class="flex flex-col gap-2 border-b border-gray-100 px-3 py-3">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <a href="/" class="text-[11px] text-gray-400 hover:text-gray-600">← lajikartat.fi</a>
        <h1 class="truncate font-semibold">{config.label}</h1>
        <p class="text-xs text-gray-500">{config.regionLabel}</p>
      </div>
      <SpeciesSwitcher current={species} />
    </div>
    {#if config.showConditions}
      <ConditionsChip center={config.initialView.center} />
    {/if}
  </div>
  <Filters bind:filter={mapState.filter} />
  <details class="border-t border-gray-100">
    <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-gray-600 select-none"
      >Tasot ja pohjakartta</summary
    >
    <LayerControls bind:layers={mapState.layers} copy={config.copy} />
  </details>
  <Legend ramp={config.ramp} />
  <div class="min-h-0 flex-1 overflow-y-auto border-t border-gray-100">
    {#if mapState.loadError}
      <p class="px-3 py-4 text-sm text-red-600">{COPY.loadError}</p>
    {:else if !mapState.geojson}
      <p class="px-3 py-4 text-sm text-gray-400">{COPY.loading}</p>
    {:else}
      <SpotList {mapState} copy={config.copy} onselect={(id) => mapState.selectAndFly(id)} />
    {/if}
  </div>
</aside>

{#if mapState.selectedId}
  <aside class="absolute inset-y-0 right-0 z-10 w-80 border-l border-gray-200 bg-white">
    <SpotDetail {species} id={mapState.selectedId} copy={config.copy} onclose={() => mapState.select(null)} />
  </aside>
{/if}
