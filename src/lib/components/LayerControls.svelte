<script lang="ts">
  import { BASEMAP_IDS, BASEMAPS } from '$lib/map/basemaps'
  import type { LayerSettings } from '$lib/state/map-page.svelte'
  import type { SpeciesCopy } from '$lib/species/registry'

  let { layers = $bindable(), copy }: { layers: LayerSettings; copy: SpeciesCopy } = $props()

  const layerLabel = $derived(copy.plural.charAt(0).toUpperCase() + copy.plural.slice(1))
</script>

<div class="flex flex-col gap-3 px-3 py-3">
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
    <span class="text-gray-600">Pohjakartta</span>
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
