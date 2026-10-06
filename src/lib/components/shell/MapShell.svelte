<script lang="ts">
  import PickingLinkPill from '$lib/components/PickingLinkPill.svelte'
  import Legend from '$lib/components/Legend.svelte'
  import LoadStatus from '$lib/components/LoadStatus.svelte'
  import MapControls from '$lib/components/MapControls.svelte'
  import SpeciesSwitcher from '$lib/components/SpeciesSwitcher.svelte'
  import SpotDetail from '$lib/components/SpotDetail.svelte'
  import { COPY, SITE_NAME } from '$lib/copy'
  import type { SpeciesRenderConfig } from '$lib/species/registry'
  import type { MapPageState } from '$lib/state/map-page.svelte'
  import BottomSheet, { type SheetSnap } from './BottomSheet.svelte'

  let {
    mapState,
    config,
    species,
    desktop
  }: {
    mapState: MapPageState
    config: SpeciesRenderConfig
    species: string
    /** Side panel and top-left card (true) or top bar and bottom sheet (false). */
    desktop: boolean
  } = $props()

  // The picking pill reads the weather where the map is looking, on a 0,25°
  // grid so panning across a town does not refetch.
  const PILL_GRID_DEG = 0.25
  const pillCenter = $derived.by((): [number, number] | null => {
    const c = mapState.camera
    if (!c) return null
    const snap = (v: number) => Math.round(v / PILL_GRID_DEG) * PILL_GRID_DEG
    return [snap(c.lng), snap(c.lat)]
  })

  let snap = $state<SheetSnap>('half')
  // Each newly opened spot starts at the half snap.
  $effect(() => {
    if (mapState.selectedId) snap = 'half'
  })
  const showSpot = $derived(mapState.selectedId !== null && config.render === 'vector')
</script>

{#snippet pill()}
  {#if config.calendar && pillCenter}
    <PickingLinkPill center={pillCenter} {species} />
  {/if}
{/snippet}

{#snippet spot(id: string)}
  <SpotDetail {id} unit={config.unit} coords={mapState.centerOf(id)} onclose={() => mapState.select(null)} />
{/snippet}

{#if desktop}
  <div class="absolute top-2 left-2 z-10 flex w-72 flex-col gap-2 rounded-xl bg-white/95 p-3 shadow">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <a href="/" class="text-[11px] text-gray-400 hover:text-gray-600">← {SITE_NAME}</a>
        <h1 class="truncate font-semibold">{config.label}</h1>
      </div>
      <SpeciesSwitcher current={species} />
    </div>
    {@render pill()}
  </div>
  <div class="absolute top-28 right-2.5 z-10">
    <MapControls {mapState} layerLabel={config.unit.layerLabel} direction="down" />
  </div>
{:else}
  <header class="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1.5 p-2">
    <div class="pointer-events-auto flex items-center gap-2 rounded-lg bg-white/95 px-2.5 py-1.5 shadow">
      <a href="/" class="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100" aria-label={COPY.home}>←</a>
      <h1 class="min-w-0 flex-1 truncate text-sm leading-tight font-semibold">{config.label}</h1>
      <SpeciesSwitcher current={species} />
    </div>
    <div class="pointer-events-auto self-start">{@render pill()}</div>
  </header>
  <div class="absolute right-2 bottom-10 z-10">
    <MapControls {mapState} layerLabel={config.unit.layerLabel} direction="up" />
  </div>
{/if}

<div class="absolute bottom-10 left-2 z-10">
  <Legend ramp={config.ramp} minComposite={mapState.filter.minComposite} />
</div>

<LoadStatus loading={!mapState.ready && !mapState.loadError} error={mapState.loadError} />

{#if showSpot && mapState.selectedId}
  {#if desktop}
    <aside class="absolute inset-y-0 right-0 z-20 w-96 border-l border-gray-200 bg-white">
      {@render spot(mapState.selectedId)}
    </aside>
  {:else}
    <BottomSheet bind:snap onclose={() => mapState.select(null)}>
      {@render spot(mapState.selectedId)}
    </BottomSheet>
  {/if}
{/if}

<!-- On phones the top bar overlays the map's own top-right controls; push them below it. -->
<style>
  :global(.maplibregl-ctrl-top-right) {
    top: 3.25rem;
  }
  @media (min-width: 64rem) {
    :global(.maplibregl-ctrl-top-right) {
      top: 0;
    }
  }
</style>
