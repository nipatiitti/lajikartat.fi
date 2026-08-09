<script lang="ts">
  import ConditionsChip from '$lib/components/ConditionsChip.svelte'
  import Legend from '$lib/components/Legend.svelte'
  import LoadStatus from '$lib/components/LoadStatus.svelte'
  import MapControls from '$lib/components/MapControls.svelte'
  import SpeciesSwitcher from '$lib/components/SpeciesSwitcher.svelte'
  import SpotDetail from '$lib/components/SpotDetail.svelte'
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

<div class="absolute top-2 left-2 z-10 flex w-72 flex-col gap-2 rounded-xl bg-white/95 p-3 shadow">
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

<div class="absolute top-28 right-2.5 z-10">
  <MapControls bind:layers={mapState.layers} bind:filter={mapState.filter} copy={config.copy} direction="down" />
</div>

<div class="absolute bottom-10 left-2 z-10">
  <Legend ramp={config.ramp} />
</div>

<LoadStatus loading={!mapState.geojson && !mapState.loadError} error={mapState.loadError} />

{#if mapState.selectedId}
  <aside class="absolute inset-y-0 right-0 z-20 w-96 border-l border-gray-200 bg-white">
    <SpotDetail
      {species}
      id={mapState.selectedId}
      copy={config.copy}
      coords={mapState.centerOf(mapState.selectedId)}
      showConditions={config.showConditions ?? false}
      onclose={() => mapState.select(null)}
    />
  </aside>
{/if}
