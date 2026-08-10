<script lang="ts">
  import { browser } from '$app/env'
  import {
    bestPickingWindow,
    conditionsSummary,
    dayLabel,
    fmiConditions,
    PICKING_TAG_LABELS,
    pickingOutlook,
    pickingPill,
    pickingSentence,
    type Conditions
  } from '$lib/conditions'

  let { center, species }: { center: [number, number]; species?: string } = $props()

  let conditions = $state<Conditions | null>(null)
  let open = $state(false)
  let chartW = $state(0)

  // Display-only scaffold: fetches FMI observations + forecast client-side and
  // hides silently on any failure. Never touches stored potentiaali values.
  $effect(() => {
    const target = center
    if (!browser) return
    void fmiConditions.fetch(target).then((c) => (conditions = c))
  })

  const summary = $derived(conditions ? conditionsSummary(conditions) : null)
  const days = $derived(conditions?.days ?? [])
  // The model sees 35 days of history; the chart shows the last 14 + forecast.
  const chartDays = $derived([
    ...days.filter((d) => d.source === 'obs').slice(-14),
    ...days.filter((d) => d.source === 'forecast')
  ])
  const maxRain = $derived(Math.max(6, ...chartDays.map((d) => d.rainMm ?? 0)))
  const forecastRainMm = $derived(
    Math.round(days.filter((d) => d.source === 'forecast').reduce((s, d) => s + (d.rainMm ?? 0), 0))
  )

  const outlook = $derived(species ? pickingOutlook(days, species) : null)
  const bestWindow = $derived(outlook ? bestPickingWindow(outlook) : null)
  const bestDay = $derived(outlook && outlook.length > 0 ? outlook.reduce((a, b) => (b.score > a.score ? b : a)) : null)
  const sentence = $derived(outlook ? pickingSentence(outlook, bestWindow) : '')
  const pill = $derived(outlook ? pickingPill(outlook, bestWindow) : null)

  // One quality scale everywhere: green go, amber maybe, gray nothing.
  const PILL_TONES: Record<string, string> = {
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    gray: 'bg-gray-100 text-gray-700'
  }
  const SUMMARY_TONES: Record<string, string> = { good: PILL_TONES.green, ok: PILL_TONES.amber, poor: PILL_TONES.gray }
  const scoreTone = (score: number): string =>
    score >= 0.55 ? 'bg-green-600' : score >= 0.3 ? 'bg-amber-500' : 'bg-gray-300'
  const inBestWindow = (date: string): boolean =>
    bestWindow !== null && date >= bestWindow.start && date <= bestWindow.end

  // Where the obs/forecast boundary sits, as a fraction of the chart width:
  // the outlook strip and the "tänään" axis label anchor to it.
  const obsCount = $derived(chartDays.filter((d) => d.source === 'obs').length)
  const todayPct = $derived(chartDays.length > 0 ? (obsCount / chartDays.length) * 100 : 0)

  // Temperature overlay geometry. Frost risk: a daily MEAN at or below +1 °C
  // implies a probable night frost (we have no daily minimum).
  const FROST_RISK_MEAN_C = 1
  const PLOT_H = 56
  const TEMP_TOP = 10
  const TEMP_BOTTOM = 50

  const temps = $derived(chartDays.map((d) => d.meanTempC).filter((t): t is number => t !== null))
  const tempDomain = $derived.by(() => {
    if (temps.length === 0) return null
    const maxT = Math.max(...temps)
    const minT = Math.min(...temps)
    const hi = Math.max(10, Math.ceil(maxT) + 2)
    const lo = minT <= 2 ? Math.min(-2, Math.floor(minT) - 2) : 0
    return { hi, lo, showZero: minT <= 2 }
  })
  const xOf = (i: number): number => ((i + 0.5) * chartW) / chartDays.length
  const yOf = (t: number): number => {
    const d = tempDomain!
    return TEMP_TOP + ((d.hi - t) / (d.hi - d.lo)) * (TEMP_BOTTOM - TEMP_TOP)
  }

  interface TempSegment {
    points: string
    single: { x: number; y: number } | null
    forecast: boolean
  }
  // Polyline per contiguous run of measured temps, split at the obs/forecast
  // boundary (the first forecast segment starts at the last obs point).
  const tempSegments = $derived.by(() => {
    if (!tempDomain || chartW === 0) return [] as TempSegment[]
    const segments: TempSegment[] = []
    let run: { x: number; y: number }[] = []
    let runForecast = false
    const flush = () => {
      if (run.length === 1) segments.push({ points: '', single: run[0], forecast: runForecast })
      else if (run.length > 1)
        segments.push({
          points: run.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
          single: null,
          forecast: runForecast
        })
      run = []
    }
    for (let i = 0; i < chartDays.length; i++) {
      const t = chartDays[i].meanTempC
      if (t === null) {
        flush()
        continue
      }
      const isForecast = chartDays[i].source === 'forecast'
      if (run.length > 0 && isForecast !== runForecast) {
        const last = run[run.length - 1]
        flush()
        run = [last]
      }
      runForecast = isForecast
      run.push({ x: xOf(i), y: yOf(t) })
    }
    flush()
    return segments
  })
  const frostDays = $derived(
    chartW === 0
      ? []
      : chartDays
          .map((d, i) => ({ d, i }))
          .filter(({ d }) => d.meanTempC !== null && d.meanTempC <= FROST_RISK_MEAN_C)
          .map(({ d, i }) => ({ x: xOf(i), forecast: d.source === 'forecast' }))
  )

  const barTitle = (d: (typeof days)[number]): string => {
    const rain = d.rainMm !== null ? `${String(d.rainMm).replace('.', ',')} mm` : 'ei sadetietoa'
    const temp = d.meanTempC !== null ? ` · ${String(d.meanTempC).replace('.', ',')} °C` : ''
    const src = d.source === 'forecast' ? ' (ennuste)' : ''
    const frost = d.meanTempC !== null && d.meanTempC <= FROST_RISK_MEAN_C ? ' · halla' : ''
    return `${dayLabel(d.date)} ${rain}${temp}${src}${frost}`
  }
</script>

{#if conditions && (pill || summary)}
  <div class="flex flex-col items-start gap-1">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium {PILL_TONES[
        pill?.tone ?? SUMMARY_TONES[summary?.tone ?? 'poor']
      ] ?? SUMMARY_TONES[summary?.tone ?? 'poor']}"
      title="Ilmatieteen laitoksen havainnot ja ennuste"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      {#if pill}
        <span>{pill.label}</span>
        {#if pill.suffix}<span class="font-normal opacity-75">{pill.suffix}</span>{/if}
      {:else if summary}
        <span>{summary.label}</span>
        <span class="font-normal opacity-75">
          {#if conditions.rainSumMm !== null}{conditions.rainSumMm} mm{/if}
          {#if conditions.rainSumMm !== null && conditions.meanTempC !== null}·{/if}
          {#if conditions.meanTempC !== null}{String(conditions.meanTempC).replace('.', ',')} °C{/if}
        </span>
      {/if}
      <svg
        viewBox="0 0 12 12"
        class="h-2.5 w-2.5 opacity-60 transition-transform {open ? 'rotate-180' : ''}"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="m2 4 4 4 4-4" />
      </svg>
    </button>

    {#if open && chartDays.length > 0}
      <div class="flex w-72 flex-col gap-2 rounded-xl border border-gray-200 bg-white/95 p-3 text-xs shadow-lg sm:w-80">
        {#if outlook && outlook.length > 0 && bestDay}
          <div class="flex items-start gap-1.5">
            <span class="mt-0.75 h-2 w-2 shrink-0 rounded-full {scoreTone(bestDay.score)}"></span>
            <p class="text-[13px] leading-snug font-medium text-gray-800">{sentence}</p>
          </div>
        {/if}

        <div class="flex justify-between text-[10px] text-gray-500">
          <span
            >Sade 14 vrk <span class="font-medium text-gray-700 tabular-nums">{conditions.rainSumMm ?? '?'} mm</span
            ></span
          >
          <span>ennuste 8 vrk <span class="font-medium text-gray-700 tabular-nums">{forecastRainMm} mm</span></span>
        </div>

        <div
          class="relative h-14"
          bind:clientWidth={chartW}
          role="img"
          aria-label="Sade ja lämpötila, 14 vrk havainnot ja 8 vrk ennuste. {sentence}"
        >
          <div class="absolute inset-x-0 bottom-0 flex items-end gap-px">
            {#each chartDays as d (d.date)}
              <div class="flex flex-1 flex-col items-center" title={barTitle(d)}>
                <div
                  class="w-full rounded-t-sm {d.source === 'obs' ? 'bg-blue-500' : 'bg-blue-300'}"
                  style:height="{d.rainMm !== null ? Math.max(2, (d.rainMm / maxRain) * 48) : 2}px"
                  style:opacity={d.rainMm === null ? 0.25 : 1}
                ></div>
              </div>
            {/each}
          </div>
          {#if tempDomain && chartW > 0}
            <svg class="pointer-events-none absolute inset-0" width={chartW} height={PLOT_H} aria-hidden="true">
              {#if tempDomain.showZero}
                <line
                  x1="0"
                  y1={yOf(0)}
                  x2={chartW}
                  y2={yOf(0)}
                  stroke="#d1d5db"
                  stroke-width="1"
                  stroke-dasharray="2 3"
                />
                <text x={chartW - 1} y={yOf(0) - 2} text-anchor="end" font-size="8" fill="#9ca3af">0°</text>
              {/if}
              {#each tempSegments as s, i (i)}
                {#if s.points}
                  <polyline
                    points={s.points}
                    fill="none"
                    stroke="white"
                    stroke-width="3.5"
                    opacity="0.85"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                {:else if s.single}
                  <circle cx={s.single.x} cy={s.single.y} r="3.5" fill="white" opacity="0.85" />
                {/if}
              {/each}
              {#each tempSegments as s, i (i)}
                {#if s.points}
                  <polyline
                    points={s.points}
                    fill="none"
                    stroke="#ef4444"
                    stroke-width="1.5"
                    stroke-dasharray={s.forecast ? '4 3' : undefined}
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                {:else if s.single}
                  <circle cx={s.single.x} cy={s.single.y} r="2" fill="#ef4444" />
                {/if}
              {/each}
              {#each frostDays as f (f.x)}
                <g stroke="#0891b2" stroke-width="1" stroke-linecap="round" opacity={f.forecast ? 0.65 : 1}>
                  <line x1={f.x} y1="1" x2={f.x} y2="7" />
                  <line x1={f.x - 2.6} y1="2.5" x2={f.x + 2.6} y2="5.5" />
                  <line x1={f.x - 2.6} y1="5.5" x2={f.x + 2.6} y2="2.5" />
                </g>
              {/each}
            </svg>
          {/if}
        </div>

        {#if outlook && outlook.length > 0}
          <div class="flex items-end gap-px" role="img" aria-label="Poimintanäkymä päivittäin">
            <div
              class="overflow-hidden pr-1 text-right text-[10px] leading-none whitespace-nowrap text-gray-400"
              style:width="{todayPct}%"
            >
              {obsCount >= 6 ? 'poimintanäkymä' : ''}
            </div>
            {#each outlook as o (o.date)}
              <div
                class="{inBestWindow(o.date) ? 'h-2.5' : 'h-1.5'} flex-1 self-end rounded-sm {scoreTone(o.score)}"
                style:opacity={0.45 + 0.55 * o.confidence}
                title="{dayLabel(o.date)} {PICKING_TAG_LABELS[o.tag]}"
              ></div>
            {/each}
          </div>
        {/if}

        <div class="relative h-4 font-mono text-[10px] text-gray-400 tabular-nums">
          <span class="absolute left-0">{chartDays[0] ? dayLabel(chartDays[0].date) : ''}</span>
          {#if obsCount > 0 && obsCount < chartDays.length}
            <span class="absolute -translate-x-1/2 font-medium text-gray-600" style:left="{todayPct}%">tänään</span>
          {/if}
          <span class="absolute right-0">{chartDays.at(-1) ? dayLabel(chartDays.at(-1)!.date) : ''}</span>
        </div>

        <div class="flex items-center gap-3 text-[10px] text-gray-500">
          <span class="flex items-center gap-1">
            <svg width="12" height="8" aria-hidden="true"
              ><line x1="0" y1="4" x2="12" y2="4" stroke="#ef4444" stroke-width="1.5" /></svg
            >
            lämpötila
          </span>
          {#if frostDays.length > 0}
            <span class="flex items-center gap-1">
              <svg width="8" height="8" aria-hidden="true">
                <g stroke="#0891b2" stroke-width="1" stroke-linecap="round">
                  <line x1="4" y1="1" x2="4" y2="7" />
                  <line x1="1.4" y1="2.5" x2="6.6" y2="5.5" />
                  <line x1="1.4" y1="5.5" x2="6.6" y2="2.5" />
                </g>
              </svg>
              yöpakkanen
            </span>
          {/if}
          <span class="ml-auto">Ilmatieteen laitos</span>
        </div>
      </div>
    {/if}
  </div>
{/if}
