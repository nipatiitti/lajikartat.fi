<script lang="ts">
  import { COPY, scoreIndex } from '$lib/copy'
  import { BASEMAP_IDS, BASEMAPS } from '$lib/map/basemaps'
  import type { CandidateFilter } from '$lib/map/types'
  import type { LayerSettings } from '$lib/state/map-page.svelte'
  import type { SpeciesCopy } from '$lib/species/registry'

  let {
    layers = $bindable(),
    filter = $bindable(),
    copy,
    direction = 'down'
  }: {
    layers: LayerSettings
    filter: CandidateFilter
    copy: SpeciesCopy
    /** Which way the panel opens relative to the button. */
    direction?: 'up' | 'down'
  } = $props()

  let open = $state(false)
  const layerLabel = $derived(copy.plural.charAt(0).toUpperCase() + copy.plural.slice(1))
</script>

{#if open}
  <!-- Invisible backdrop: tapping the map closes the panel. -->
  <button
    type="button"
    class="fixed inset-0 z-10 cursor-default"
    onclick={() => (open = false)}
    aria-label={COPY.close}
    tabindex="-1"
  ></button>
{/if}

<div class="relative z-20">
  <button
    type="button"
    class="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-gray-700 shadow hover:bg-white"
    onclick={() => (open = !open)}
    aria-expanded={open}
  >
    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="m12 2 9 4.9-9 4.9-9-4.9L12 2Z" />
      <path stroke-linecap="round" stroke-linejoin="round" d="m3 11.9 9 4.9 9-4.9" />
      <path stroke-linecap="round" stroke-linejoin="round" d="m3 16.9 9 4.9 9-4.9" />
    </svg>
    {COPY.layers}
  </button>

  {#if open}
    <div
      class="absolute right-0 flex w-64 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-lg {direction ===
      'up'
        ? 'bottom-full mb-2'
        : 'top-full mt-2'}"
    >
      <label class="flex flex-col gap-1 text-sm">
        <span class="flex justify-between text-gray-600">
          <span>{COPY.minPotential}</span>
          <span class="font-mono tabular-nums">{scoreIndex(filter.minComposite)}/100</span>
        </span>
        <input type="range" min="0" max="1" step="0.01" bind:value={filter.minComposite} class="w-full" />
      </label>

      <div class="flex flex-col gap-1 text-sm">
        <span class="flex items-center justify-between text-gray-600">
          <label class="flex items-center gap-1.5">
            <input type="checkbox" bind:checked={layers.candidatesVisible} />
            <span>{layerLabel}</span>
          </label>
          <span class="font-mono text-xs tabular-nums">{Math.round(layers.candidateOpacity * 100)} %</span>
        </span>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          bind:value={layers.candidateOpacity}
          disabled={!layers.candidatesVisible}
          class="w-full"
          aria-label="Tason läpinäkyvyys"
        />
      </div>

      <div class="flex flex-col gap-1 text-sm">
        <span class="text-gray-600">{COPY.basemap}</span>
        <div class="flex flex-col gap-0.5">
          {#each BASEMAP_IDS as id (id)}
            <label class="flex items-center gap-1.5">
              <input type="radio" name="basemap" value={id} bind:group={layers.basemapId} />
              <span>{BASEMAPS[id].label}</span>
            </label>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
