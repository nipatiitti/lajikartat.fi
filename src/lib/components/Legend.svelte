<script lang="ts">
  let { ramp }: { ramp: Array<[number, string]> } = $props()

  const gradient = $derived(
    `linear-gradient(to right, ${ramp.map(([v, c]) => `${c} ${Math.round(v * 100)}%`).join(', ')})`
  )
  const lo = $derived(ramp[0]?.[0] ?? 0)
  const hi = $derived(ramp.at(-1)?.[0] ?? 1)
</script>

<div class="flex flex-col gap-1 px-3 py-3">
  <span class="text-xs text-gray-600">Composite score</span>
  <div class="h-2.5 w-full rounded" style:background={gradient}></div>
  <div class="flex justify-between font-mono text-[10px] text-gray-400 tabular-nums">
    <span>{lo.toFixed(2)}</span>
    <span>{hi.toFixed(2)}+</span>
  </div>
</div>
