<script lang="ts">
  import { browser } from '$app/env'
  import {
    bestPickingWindow,
    conditionsSummary,
    fmiConditions,
    pickingOutlook,
    pickingPill,
    type Conditions
  } from '$lib/conditions'
  import { CALENDAR_COPY, TONE_CLASSES } from '$lib/copy'

  // One-word picking state that links to the calendar. Fetches FMI
  // client-side and renders nothing on failure, like the chip it replaced.
  let {
    center,
    species,
    spot = false
  }: {
    /** [lng, lat] the weather is read for. */
    center: [number, number]
    species: string
    /** Carry the coordinates into the calendar (a selected spot). */
    spot?: boolean
  } = $props()

  let conditions = $state<Conditions | null>(null)
  $effect(() => {
    const target = center
    if (!browser) return
    void fmiConditions.fetch(target).then((c) => (conditions = c))
  })

  const outlook = $derived(conditions ? pickingOutlook(conditions.days, species) : null)
  const pill = $derived(outlook ? pickingPill(outlook, bestPickingWindow(outlook)) : null)
  const summary = $derived(conditions ? conditionsSummary(conditions) : null)
  const SUMMARY_TONES = { good: 'green', ok: 'amber', poor: 'gray' } as const
  const label = $derived(pill?.label ?? summary?.label ?? null)
  const tone = $derived(pill?.tone ?? (summary ? SUMMARY_TONES[summary.tone] : 'gray'))
  const href = $derived(
    `/sienikalenteri?laji=${species}` + (spot ? `&lat=${center[1].toFixed(4)}&lng=${center[0].toFixed(4)}` : '')
  )
</script>

{#if label}
  <a
    {href}
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {TONE_CLASSES[tone]}"
    title={CALENDAR_COPY.openCalendar}
  >
    <span>{label}</span>
    {#if pill?.suffix}<span class="font-normal opacity-75">{pill.suffix}</span>{/if}
    <span class="opacity-60" aria-hidden="true">›</span>
  </a>
{/if}
