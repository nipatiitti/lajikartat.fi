<script lang="ts">
  import { ALL_CONFIDENCES, type CandidateFilter } from '$lib/map/types'
  import type { Confidence } from '$lib/scoring/core/types'

  let { filter = $bindable() }: { filter: CandidateFilter } = $props()

  function toggle(c: Confidence) {
    filter.confidences = filter.confidences.includes(c)
      ? filter.confidences.filter((x) => x !== c)
      : [...filter.confidences, c]
  }
</script>

<div class="flex flex-col gap-3 px-3 py-3">
  <label class="flex flex-col gap-1 text-sm">
    <span class="flex justify-between text-gray-600">
      <span>Min score</span>
      <span class="font-mono tabular-nums">{filter.minComposite.toFixed(2)}</span>
    </span>
    <input type="range" min="0" max="1" step="0.01" bind:value={filter.minComposite} class="w-full" />
  </label>

  <div class="flex flex-col gap-1 text-sm">
    <span class="text-gray-600">Confidence</span>
    <div class="flex gap-3">
      {#each ALL_CONFIDENCES as c (c)}
        <label class="flex items-center gap-1">
          <input type="checkbox" checked={filter.confidences.includes(c)} onchange={() => toggle(c)} />
          <span>{c}</span>
        </label>
      {/each}
    </div>
  </div>
</div>
