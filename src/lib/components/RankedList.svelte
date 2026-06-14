<script lang="ts">
  import type { CandidateFilter, CandidateProps } from '$lib/map/types'

  let {
    features,
    filter,
    selectedId,
    onselect
  }: {
    features: CandidateProps[]
    filter: CandidateFilter
    selectedId: string | null
    onselect: (id: string) => void
  } = $props()

  const LIMIT = 50

  const ranked = $derived(
    features
      .filter((f) => f.composite >= filter.minComposite && filter.confidences.includes(f.confidence))
      .toSorted((a, b) => b.composite - a.composite)
      .slice(0, LIMIT)
  )

  const confClass: Record<string, string> = {
    high: 'bg-green-100 text-green-800',
    med: 'bg-amber-100 text-amber-800',
    low: 'bg-gray-200 text-gray-600'
  }
</script>

<div class="flex flex-col">
  <h2 class="px-3 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
    Top {ranked.length}
    {#if features.length}<span class="font-normal">of {features.length}</span>{/if}
  </h2>
  <ol class="divide-y divide-gray-100">
    {#each ranked as f, i (f.id)}
      <li>
        <button
          type="button"
          onclick={() => onselect(f.id)}
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 {selectedId === f.id
            ? 'bg-blue-50'
            : ''}"
        >
          <span class="w-6 shrink-0 text-right text-xs text-gray-400">{i + 1}</span>
          <span class="flex-1 truncate">{f.name ?? '(unnamed)'}</span>
          <span class="rounded px-1.5 py-0.5 text-[10px] font-medium {confClass[f.confidence] ?? ''}">
            {f.confidence}
          </span>
          <span class="w-10 shrink-0 text-right font-mono text-xs tabular-nums">{f.composite.toFixed(3)}</span>
        </button>
      </li>
    {/each}
  </ol>
  {#if ranked.length === 0}
    <p class="px-3 py-4 text-sm text-gray-400">No ponds match the current filter.</p>
  {/if}
</div>
