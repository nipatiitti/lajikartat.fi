<script lang="ts">
  import { browser } from '$app/env'
  import { conditionsSummary, fmiConditions, type Conditions } from '$lib/conditions'

  let { center }: { center: [number, number] } = $props()

  let conditions = $state<Conditions | null>(null)

  // Display-only scaffold: fetches FMI observations client-side and hides
  // silently on any failure. Never touches stored potentiaali values.
  $effect(() => {
    const target = center
    if (!browser) return
    void fmiConditions.fetch(target).then((c) => (conditions = c))
  })

  const summary = $derived(conditions ? conditionsSummary(conditions) : null)

  const toneClass: Record<string, string> = {
    good: 'bg-green-100 text-green-800',
    ok: 'bg-amber-100 text-amber-800',
    poor: 'bg-orange-100 text-orange-800'
  }
</script>

{#if conditions && summary}
  <div
    class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {toneClass[summary.tone]}"
    title="Ilmatieteen laitoksen havainnot lähimmältä asemalta, 14 vrk"
  >
    <span>{summary.label}</span>
    <span class="font-normal opacity-75">
      {#if conditions.rainSumMm !== null}{conditions.rainSumMm} mm{/if}
      {#if conditions.rainSumMm !== null && conditions.meanTempC !== null}·{/if}
      {#if conditions.meanTempC !== null}{String(conditions.meanTempC).replace('.', ',')} °C{/if}
    </span>
  </div>
{/if}
