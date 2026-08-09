<script lang="ts">
  import ConditionsChip from '$lib/components/ConditionsChip.svelte'
  import Legend from '$lib/components/Legend.svelte'
  import LoadStatus from '$lib/components/LoadStatus.svelte'
  import MapControls from '$lib/components/MapControls.svelte'
  import SpeciesSwitcher from '$lib/components/SpeciesSwitcher.svelte'
  import SpotDetail from '$lib/components/SpotDetail.svelte'
  import type { SpeciesRenderConfig } from '$lib/species/registry'
  import type { MapPageState } from '$lib/state/map-page.svelte'
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

  // Each newly opened spot starts at the half snap.
  $effect(() => {
    if (mapState.selectedId) snap = 'half'
  })
</script>

<header class="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1.5 p-2">
  <div class="pointer-events-auto flex items-center gap-2 rounded-lg bg-white/95 px-2.5 py-1.5 shadow">
    <a href="/" class="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Etusivulle">←</a>
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-sm leading-tight font-semibold">{config.label}</h1>
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

<div class="absolute right-2 bottom-10 z-10">
  <MapControls bind:layers={mapState.layers} bind:filter={mapState.filter} copy={config.copy} direction="up" />
</div>

<div class="absolute bottom-10 left-2 z-10">
  <Legend ramp={config.ramp} />
</div>

<LoadStatus loading={!mapState.geojson && !mapState.loadError} error={mapState.loadError} />

{#if mapState.selectedId}
  <BottomSheet bind:snap onclose={() => mapState.select(null)}>
    <SpotDetail
      {species}
      id={mapState.selectedId}
      copy={config.copy}
      coords={mapState.centerOf(mapState.selectedId)}
      showConditions={config.showConditions ?? false}
      onclose={() => mapState.select(null)}
    />
  </BottomSheet>
{/if}

<!-- The top bar overlays the map's own top-right controls; push them below it. -->
<style>
  :global(.maplibregl-ctrl-top-right) {
    top: 3.25rem;
  }
</style>
