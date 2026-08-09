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
  import BottomSheet, { type SheetSnap } from './BottomSheet.svelte'

  let {
    mapState,
    config,
    species
  }: {
    mapState: MapPageState
    config: SpeciesRenderConfig
    species: string
  } = $props()

  let snap = $state<SheetSnap>('half')

  // A spot picked from the map must be visible — lift a collapsed sheet.
  $effect(() => {
    if (mapState.selectedId && snap === 'collapsed') snap = 'half'
  })
</script>

<header class="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1.5 p-2">
  <div class="pointer-events-auto flex items-center gap-2 rounded-lg bg-white/95 px-2.5 py-1.5 shadow">
    <a href="/" class="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Etusivulle">←</a>
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-sm font-semibold leading-tight">{config.label}</h1>
      <p class="text-[11px] leading-tight text-gray-500">{config.regionLabel}</p>
    </div>
    <SpeciesSwitcher current={species} />
  </div>
  {#if config.showConditions}
    <div class="pointer-events-auto self-start">
      <ConditionsChip center={config.initialView.center} />
    </div>
  {/if}
</header>

<BottomSheet bind:snap>
  {#if mapState.selectedId}
    <SpotDetail {species} id={mapState.selectedId} copy={config.copy} onclose={() => mapState.select(null)} />
  {:else if mapState.loadError}
    <p class="px-3 py-4 text-sm text-red-600">{COPY.loadError}</p>
  {:else if !mapState.geojson}
    <p class="px-3 py-4 text-sm text-gray-400">{COPY.loading}</p>
  {:else}
    <details class="border-b border-gray-100">
      <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-gray-600 select-none">
        Suodattimet ja tasot
      </summary>
      <Filters bind:filter={mapState.filter} />
      <LayerControls bind:layers={mapState.layers} copy={config.copy} />
      <Legend ramp={config.ramp} />
    </details>
    <SpotList {mapState} copy={config.copy} onselect={(id) => mapState.selectAndFly(id)} />
  {/if}
</BottomSheet>
