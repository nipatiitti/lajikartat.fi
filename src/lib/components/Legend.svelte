<script lang="ts">
  import { COPY, scoreIndex } from '$lib/copy'

  let { ramp, minComposite = 0 }: { ramp: Array<[number, string]>; minComposite?: number } = $props()

  const gradient = $derived(
    `linear-gradient(to right, ${ramp.map(([v, c]) => `${c} ${Math.round(v * 100)}%`).join(', ')})`
  )
  const lo = $derived(ramp[0]?.[0] ?? 0)
  const hi = $derived(ramp.at(-1)?.[0] ?? 1)
  // Part of the bar the Potentiaali slider has cut away.
  const cutPct = $derived(Math.max(0, Math.min(100, ((minComposite - lo) / (hi - lo)) * 100)))
</script>

<div class="flex w-36 flex-col gap-1 rounded-lg bg-white/95 px-2.5 py-1.5 shadow">
  <span class="text-[11px] text-gray-600">{COPY.potential}</span>
  <div class="relative h-2 w-full overflow-hidden rounded" style:background={gradient}>
    {#if cutPct > 0}
      <div class="absolute inset-y-0 left-0 bg-white/85" style:width="{cutPct}%"></div>
    {/if}
  </div>
  <div class="flex justify-between font-mono text-[10px] text-gray-400 tabular-nums">
    <span>{scoreIndex(Math.max(lo, minComposite))}</span>
    <span>{scoreIndex(hi)}+</span>
  </div>
</div>
