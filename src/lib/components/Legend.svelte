<script lang="ts">
  import { COPY, scoreIndex } from '$lib/copy'

  let { ramp }: { ramp: Array<[number, string]> } = $props()

  const gradient = $derived(
    `linear-gradient(to right, ${ramp.map(([v, c]) => `${c} ${Math.round(v * 100)}%`).join(', ')})`
  )
  const lo = $derived(ramp[0]?.[0] ?? 0)
  const hi = $derived(ramp.at(-1)?.[0] ?? 1)
</script>

<div class="flex w-36 flex-col gap-1 rounded-lg bg-white/95 px-2.5 py-1.5 shadow">
  <span class="text-[11px] text-gray-600">{COPY.potential}</span>
  <div class="h-2 w-full rounded" style:background={gradient}></div>
  <div class="flex justify-between font-mono text-[10px] text-gray-400 tabular-nums">
    <span>{scoreIndex(lo)}</span>
    <span>{scoreIndex(hi)}+</span>
  </div>
</div>
