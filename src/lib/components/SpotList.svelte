<script lang="ts">
  import { CONFIDENCE_CHIP_CLASSES, CONFIDENCE_LABELS, formatPercent, SORT_LABELS } from '$lib/copy'
  import { formatDistance } from '$lib/geo/distance'
  import type { SortMode } from '$lib/map/types'
  import type { MapPageState } from '$lib/state/map-page.svelte'
  import type { SpeciesCopy } from '$lib/species/registry'

  let {
    mapState,
    copy,
    onselect
  }: {
    mapState: MapPageState
    copy: SpeciesCopy
    onselect: (id: string) => void
  } = $props()

  const LIMIT = 50

  const top = $derived(mapState.ranked.slice(0, LIMIT))
  const sortModes = $derived<SortMode[]>(mapState.userLocation ? ['score', 'distance', 'size'] : ['score', 'size'])
</script>

<div class="flex flex-col">
  <div class="flex items-center justify-between gap-2 px-3 py-2">
    <h2 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
      Parhaat {top.length}
      {#if mapState.features.length}
        <span class="font-normal normal-case">/ {mapState.features.length} {copy.partitive}</span>
      {/if}
    </h2>
    <div class="flex rounded border border-gray-200 text-[11px]">
      {#each sortModes as mode (mode)}
        <button
          type="button"
          onclick={() => (mapState.sort = mode)}
          class="px-1.5 py-0.5 {mapState.sort === mode ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}"
        >
          {SORT_LABELS[mode]}
        </button>
      {/each}
    </div>
  </div>

  <ol class="divide-y divide-gray-100">
    {#each top as f, i (f.id)}
      {@const distance = mapState.distanceTo(f.id)}
      <li>
        <button
          type="button"
          onclick={() => onselect(f.id)}
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 {mapState.selectedId === f.id
            ? 'bg-blue-50'
            : ''}"
        >
          <span class="w-6 shrink-0 text-right text-xs text-gray-400 tabular-nums">{i + 1}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm">
              {f.name ?? `Nimetön ${copy.singular}`}
            </span>
            <span class="block text-xs text-gray-400">
              {#if f.areaHa !== null}{String(f.areaHa).replace('.', ',')} ha{/if}
              {#if f.areaHa !== null && distance !== null}·{/if}
              {#if distance !== null}{formatDistance(distance)}{/if}
            </span>
          </span>
          <span class="flex shrink-0 flex-col items-end gap-0.5">
            <span class="font-mono text-sm font-medium tabular-nums">{formatPercent(f.composite)}</span>
            <span class="rounded px-1.5 py-0.5 text-[10px] font-medium {CONFIDENCE_CHIP_CLASSES[f.confidence]}">
              {CONFIDENCE_LABELS[f.confidence]}
            </span>
          </span>
        </button>
      </li>
    {/each}
  </ol>
  {#if top.length === 0}
    <p class="px-3 py-4 text-sm text-gray-400">Yksikään {copy.singular} ei vastaa suodattimia.</p>
  {/if}
</div>
