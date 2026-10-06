<script lang="ts">
  import { browser } from '$app/env'
  import { bestPickingWindow, fetchWeather, pickingAnalysis, pickingPill, type DailyWeather } from '$lib/conditions'
  import { CALENDAR_COPY } from '$lib/copy'
  import { TONE_CHIP } from '$lib/tone'

  // One-word picking state for the map's location, linking to the calendar at
  // the same point. Fetches FMI client-side and renders nothing on failure.
  let { center, species }: { center: [number, number]; species: string } = $props()

  let days = $state<DailyWeather[] | null>(null)
  $effect(() => {
    const target = center
    if (!browser) return
    void fetchWeather(target).then((d) => (days = d))
  })

  const pill = $derived.by(() => {
    const outlook = days && pickingAnalysis(days, species, { projectionDays: 0 })?.days
    return outlook ? pickingPill(outlook, bestPickingWindow(outlook)) : null
  })
  const href = $derived(`/sienikalenteri?laji=${species}&lat=${center[1].toFixed(4)}&lng=${center[0].toFixed(4)}`)
</script>

{#if pill}
  <a
    {href}
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {TONE_CHIP[pill.tone]}"
    title={CALENDAR_COPY.openCalendar}
  >
    <span>{pill.label}</span>
    {#if pill.suffix}<span class="font-normal opacity-75">{pill.suffix}</span>{/if}
    <span class="opacity-60" aria-hidden="true">›</span>
  </a>
{/if}
