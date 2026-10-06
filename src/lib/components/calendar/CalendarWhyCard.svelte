<script lang="ts">
  import type { PickingExplanation } from '$lib/conditions'
  import { CALENDAR_COPY } from '$lib/copy'
  import { scoreTone, TONE_DOT } from '$lib/tone'

  let {
    label,
    explanation,
    todayScore
  }: {
    label: string
    explanation: PickingExplanation
    todayScore: number
  } = $props()

  const tone = $derived(scoreTone(todayScore))
</script>

<article class="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4">
  <header class="flex items-center gap-2">
    <span class="h-2.5 w-2.5 shrink-0 rounded-full {TONE_DOT[tone]}"></span>
    <h2 class="font-semibold">{label}</h2>
  </header>
  <p class="text-sm font-medium text-gray-800">{explanation.headline}</p>
  <h3 class="mt-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{CALENDAR_COPY.why}</h3>
  <ul class="flex flex-col gap-1.5 text-sm text-gray-600">
    {#each explanation.lines as line (line.kind)}
      <li class="flex gap-2">
        <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full {TONE_DOT[line.tone]}"></span>
        <span>{line.text}</span>
      </li>
    {/each}
  </ul>
</article>
