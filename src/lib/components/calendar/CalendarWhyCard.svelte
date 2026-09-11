<script lang="ts">
  import type { ExplainTone, PickingExplanation } from '$lib/conditions'
  import { CALENDAR_COPY } from '$lib/copy'

  let {
    label,
    explanation,
    todayScore
  }: {
    label: string
    explanation: PickingExplanation
    todayScore: number
  } = $props()

  const DOT: Record<ExplainTone, string> = { green: 'bg-green-600', amber: 'bg-amber-500', gray: 'bg-gray-300' }
  const tone = $derived<ExplainTone>(todayScore >= 0.55 ? 'green' : todayScore >= 0.3 ? 'amber' : 'gray')
</script>

<article class="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4">
  <header class="flex items-center gap-2">
    <span class="h-2.5 w-2.5 shrink-0 rounded-full {DOT[tone]}"></span>
    <h2 class="font-semibold">{label}</h2>
  </header>
  <p class="text-sm font-medium text-gray-800">{explanation.headline}</p>
  <h3 class="mt-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{CALENDAR_COPY.why}</h3>
  <ul class="flex flex-col gap-1.5 text-sm text-gray-600">
    {#each explanation.lines as line (line.kind)}
      <li class="flex gap-2">
        <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full {DOT[line.tone]}"></span>
        <span>{line.text}</span>
      </li>
    {/each}
  </ul>
</article>
