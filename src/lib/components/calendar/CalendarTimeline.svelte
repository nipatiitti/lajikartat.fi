<script lang="ts" module>
  import type { DailyWeather, PickingDayDetail, PickingRainEvent, PickingSpecies } from '$lib/conditions'

  export interface TimelineRow {
    species: PickingSpecies
    label: string
    /** Hindcast followed by outlook, ascending. */
    days: PickingDayDetail[]
    events: PickingRainEvent[]
  }
</script>

<script lang="ts">
  import { dayLabel, PICKING_TAG_LABELS, rangeLabel } from '$lib/conditions'
  import { CALENDAR_COPY } from '$lib/copy'

  // One shared time axis: rain bars, temperature line, then a row per species
  // with the rain events the model counted arcing to the peak window they
  // cause. Pixel-coordinate SVG inside a horizontal scroller; the label gutter
  // stays put outside it.
  let {
    series,
    startIdx,
    endIdx,
    todayIdx,
    forecastEndIdx,
    rows
  }: {
    series: DailyWeather[]
    startIdx: number
    endIdx: number
    todayIdx: number
    forecastEndIdx: number
    rows: TimelineRow[]
  } = $props()

  const MIN_DAY_W = 12
  const AXIS_H = 18
  const RAIN_H = 46
  const TEMP_H = 40
  const GAP = 8
  const ARC_H = 26
  const STRIP_H = 14
  const ROW_H = ARC_H + STRIP_H
  const FOOT_H = 16
  const FROST_RISK_MEAN_C = 1

  let viewW = $state(0)

  const n = $derived(Math.max(1, endIdx - startIdx + 1))
  const dayW = $derived(Math.max(MIN_DAY_W, Math.floor(viewW / n)))
  const width = $derived(n * dayW)
  const left = (i: number): number => (i - startIdx) * dayW
  const x = (i: number): number => left(i) + dayW / 2

  const rainTop = AXIS_H
  const tempTop = AXIS_H + RAIN_H + GAP
  const rowTop = (r: number): number => tempTop + TEMP_H + GAP + r * (ROW_H + GAP)
  const height = $derived(rowTop(rows.length) + FOOT_H)

  const visible = $derived(series.slice(startIdx, endIdx + 1).map((d, k) => ({ d, i: startIdx + k })))
  const idxOf = $derived(new Map(series.map((d, i) => [d.date, i])))

  // Rain: bars scaled to the visible maximum, mm printed on the big ones.
  const maxRain = $derived(Math.max(10, ...visible.map(({ d }) => d.rainMm ?? 0)))
  const barH = (mm: number): number => (mm <= 0 ? 0 : Math.max(2, (mm / maxRain) * (RAIN_H - 12)))
  const mm = (v: number): string => String(Math.round(v * 10) / 10).replace('.', ',')
  const barTitle = (d: DailyWeather): string => {
    const rain = d.rainMm !== null ? `${mm(d.rainMm)} mm` : 'ei sadetietoa'
    const temp = d.meanTempC !== null ? ` · ${mm(d.meanTempC)} °C` : ''
    const src = d.source === 'forecast' ? ' (ennuste)' : d.source === 'projection' ? ' (arvio)' : ''
    return `${dayLabel(d.date)} ${rain}${temp}${src}`
  }

  // Temperature: one polyline per measured run, split at the obs/forecast
  // boundary, never drawn over the projection.
  const temps = $derived(
    visible.filter(({ d }) => d.source !== 'projection' && d.meanTempC !== null).map(({ d }) => d.meanTempC as number)
  )
  const tempDomain = $derived.by(() => {
    if (temps.length === 0) return null
    const maxT = Math.max(...temps)
    const minT = Math.min(...temps)
    const hi = Math.max(10, Math.ceil(maxT) + 2)
    const lo = minT <= 2 ? Math.min(-2, Math.floor(minT) - 2) : 0
    return { hi, lo, showZero: minT <= 2 }
  })
  const yT = (t: number): number => {
    const d = tempDomain!
    return tempTop + 4 + ((d.hi - t) / (d.hi - d.lo)) * (TEMP_H - 8)
  }
  interface TempSegment {
    points: string
    forecast: boolean
  }
  const tempSegments = $derived.by(() => {
    if (!tempDomain) return [] as TempSegment[]
    const segments: TempSegment[] = []
    let run: { x: number; y: number }[] = []
    let runForecast = false
    const flush = () => {
      if (run.length > 1)
        segments.push({
          points: run.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
          forecast: runForecast
        })
      run = []
    }
    for (const { d, i } of visible) {
      const t = d.meanTempC
      if (t === null || d.source === 'projection') {
        flush()
        continue
      }
      const isForecast = d.source === 'forecast'
      if (run.length > 0 && isForecast !== runForecast) {
        const last = run[run.length - 1]
        flush()
        run = [last]
      }
      runForecast = isForecast
      run.push({ x: x(i), y: yT(t) })
    }
    flush()
    return segments
  })
  const frostDays = $derived(
    visible.filter(({ d }) => d.source !== 'projection' && d.meanTempC !== null && d.meanTempC <= FROST_RISK_MEAN_C)
  )

  // Monday ticks, skipping labels that would collide with "tänään".
  const mondays = $derived(
    visible.filter(({ d }) => new Date(`${d.date}T00:00:00Z`).getUTCDay() === 1).map(({ i }) => i)
  )

  // Trigger markers on the rain band: one per event end, shared across rows.
  const triggers = $derived.by(() => {
    const m = new Map<string, PickingRainEvent>()
    for (const r of rows)
      for (const e of r.events) if (e.endIdx >= startIdx && e.endIdx <= endIdx && !m.has(e.end)) m.set(e.end, e)
    return [...m.values()].sort((a, b) => a.endIdx - b.endIdx)
  })
  // One colour per rain event, the same in every row and on the marker, so
  // the eye can follow a rain to the windows it causes. Avoids the score
  // greens/ambers, the rain blues and the temperature red.
  const EVENT_COLORS = ['#7c3aed', '#0d9488', '#db2777', '#b45309', '#4338ca', '#65a30d']
  const eventColor = $derived(new Map(triggers.map((e, k) => [e.end, EVENT_COLORS[k % EVENT_COLORS.length]])))
  const colorOf = (end: string): string => eventColor.get(end) ?? '#374151'

  interface Arc {
    key: string
    path: string
    bracket: string | null
    x0: number
    forecast: boolean
    title: string
  }
  const arcsFor = (row: TimelineRow, r: number): Arc[] => {
    const yb = rowTop(r) + ARC_H - 1
    const out: Arc[] = []
    for (const e of row.events) {
      if (e.endIdx < startIdx || e.endIdx > endIdx) continue
      if (e.fadeEnd < series[startIdx].date) continue
      const ps = idxOf.get(e.peakStart)
      if (ps === undefined || ps > endIdx) continue
      const pe = Math.min(idxOf.get(e.peakEnd) ?? endIdx, endIdx)
      const x0 = x(e.endIdx)
      const x1 = left(ps) + 1
      const h = Math.min(ARC_H - 6, 8 + (ps - e.endIdx) * 0.7)
      const path = `M ${x0.toFixed(1)} ${yb} Q ${((x0 + x1) / 2).toFixed(1)} ${yb - 2 * h} ${x1.toFixed(1)} ${yb}`
      const x2 = left(pe) + dayW - 1
      const bracket = `M ${x1.toFixed(1)} ${yb - 4} v 4 H ${x2.toFixed(1)} v -4`
      out.push({
        key: e.end,
        path,
        bracket,
        x0,
        forecast: e.forecast,
        title: `${CALENDAR_COPY.trigger} ${rangeLabel(e.soakStart, e.end)}, ${Math.round(e.soakMm)} mm. ${CALENDAR_COPY.peakWindow} ${rangeLabel(e.peakStart, e.peakEnd)}`
      })
    }
    return out
  }

  const scoreFill = (s: number): string => (s >= 0.55 ? '#16a34a' : s >= 0.3 ? '#f59e0b' : '#d1d5db')
  const stripCells = (row: TimelineRow) =>
    row.days
      .map((d) => ({ d, i: idxOf.get(d.date) }))
      .filter((c): c is { d: PickingDayDetail; i: number } => c.i !== undefined && c.i >= startIdx && c.i <= endIdx)

  // Segment labels along the foot: observed, forecast, projection.
  const segments = $derived.by(() => {
    const out: { label: string; from: number; to: number }[] = []
    if (todayIdx > startIdx) out.push({ label: CALENDAR_COPY.observed, from: startIdx, to: todayIdx - 1 })
    out.push({ label: CALENDAR_COPY.forecast, from: todayIdx, to: Math.min(forecastEndIdx, endIdx) })
    if (endIdx > forecastEndIdx) out.push({ label: CALENDAR_COPY.projection, from: forecastEndIdx + 1, to: endIdx })
    return out
  })

  // Scroll so today sits a third of the way in when the axis overflows.
  // Re-runs whenever the width or the axis changes.
  const scrollToToday = (el: HTMLDivElement) => {
    if (viewW === 0 || width <= viewW) return
    el.scrollLeft = Math.max(0, x(todayIdx) - viewW * 0.38)
  }
</script>

<div class="flex">
  <div class="relative w-16 shrink-0 text-[11px] leading-none text-gray-500" style:height="{height}px">
    <span class="absolute left-0" style:top="{rainTop + RAIN_H - 12}px">{CALENDAR_COPY.rain}</span>
    <span class="absolute left-0" style:top="{tempTop + TEMP_H / 2 - 5}px">{CALENDAR_COPY.temp}</span>
    {#each rows as row, r (row.species)}
      <span class="absolute left-0 pr-1 font-medium text-gray-700" style:top="{rowTop(r) + ARC_H + 2}px">
        {row.label}
      </span>
    {/each}
  </div>

  <div class="min-w-0 flex-1 overflow-x-auto" bind:clientWidth={viewW} {@attach scrollToToday}>
    <svg {width} {height} role="img" aria-label="Sade, lämpötila ja satoarvio päivittäin">
      <defs>
        <pattern id="proj-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#cbd5e1" stroke-width="1" />
        </pattern>
      </defs>

      <!-- Backgrounds: forecast tint, projection hatch, Monday gridlines. -->
      <rect
        x={left(todayIdx)}
        y="0"
        width={(Math.min(forecastEndIdx, endIdx) - todayIdx + 1) * dayW}
        {height}
        fill="#eff6ff"
      />
      {#if endIdx > forecastEndIdx}
        <rect
          x={left(forecastEndIdx + 1)}
          y="0"
          width={(endIdx - forecastEndIdx) * dayW}
          {height}
          fill="url(#proj-hatch)"
          opacity="0.6"
        />
      {/if}
      {#each mondays as i (i)}
        <line x1={left(i)} y1={AXIS_H - 4} x2={left(i)} y2={height - FOOT_H} stroke="#e5e7eb" stroke-width="1" />
        {#if Math.abs(i - todayIdx) > 2}
          <text x={left(i) + 2} y="11" font-size="10" fill="#9ca3af">{dayLabel(series[i].date)}</text>
        {/if}
      {/each}

      <!-- Today and forecast end. -->
      <line x1={x(todayIdx)} y1="0" x2={x(todayIdx)} y2={height - FOOT_H} stroke="#111827" stroke-width="1" />
      <text x={x(todayIdx)} y="11" font-size="10" font-weight="600" fill="#111827" text-anchor="middle">
        {CALENDAR_COPY.today}
      </text>
      {#if endIdx > forecastEndIdx}
        <line
          x1={left(forecastEndIdx + 1)}
          y1={AXIS_H - 4}
          x2={left(forecastEndIdx + 1)}
          y2={height - FOOT_H}
          stroke="#9ca3af"
          stroke-width="1"
          stroke-dasharray="3 3"
        />
      {/if}

      <!-- Rain bars. -->
      {#each visible as { d, i } (d.date)}
        {@const h = barH(d.rainMm ?? 0)}
        <g>
          <title>{barTitle(d)}</title>
          {#if d.source !== 'projection' && (d.rainMm === null || d.rainMm > 0)}
            <rect
              x={left(i) + 1}
              y={rainTop + RAIN_H - h}
              width={dayW - 2}
              height={h}
              rx="1"
              fill={d.source === 'obs' ? '#3b82f6' : '#93c5fd'}
              opacity={d.rainMm === null ? 0.25 : 1}
            />
          {/if}
          {#if (d.rainMm ?? 0) >= 10}
            <text x={x(i)} y={rainTop + RAIN_H - h - 2} font-size="8" fill="#1e3a8a" text-anchor="middle">
              {Math.round(d.rainMm ?? 0)}
            </text>
          {/if}
        </g>
      {/each}
      {#each triggers as e (e.end)}
        <g>
          <title>{CALENDAR_COPY.trigger} {rangeLabel(e.soakStart, e.end)}, {Math.round(e.soakMm)} mm</title>
          <path
            d="M {x(e.endIdx) - 4} {rainTop + RAIN_H + 5} l 4 -5 l 4 5 z"
            fill={e.forecast ? 'white' : colorOf(e.end)}
            stroke={colorOf(e.end)}
            stroke-width="1.2"
          />
        </g>
      {/each}

      <!-- Temperature. -->
      {#if tempDomain}
        {#if tempDomain.showZero}
          <line x1="0" y1={yT(0)} x2={width} y2={yT(0)} stroke="#d1d5db" stroke-width="1" stroke-dasharray="2 3" />
          <text x={width - 2} y={yT(0) - 2} text-anchor="end" font-size="8" fill="#9ca3af">0°</text>
        {/if}
        <text x="2" y={tempTop + 8} font-size="8" fill="#9ca3af">{tempDomain.hi}°</text>
        {#each tempSegments as s, k (k)}
          <polyline
            points={s.points}
            fill="none"
            stroke="white"
            stroke-width="3.5"
            opacity="0.85"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        {/each}
        {#each tempSegments as s, k (k)}
          <polyline
            points={s.points}
            fill="none"
            stroke="#ef4444"
            stroke-width="1.5"
            stroke-dasharray={s.forecast ? '4 3' : undefined}
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        {/each}
        {#each frostDays as { d, i } (d.date)}
          <g stroke="#0891b2" stroke-width="1" stroke-linecap="round" opacity={d.source === 'forecast' ? 0.65 : 1}>
            <line x1={x(i)} y1={tempTop + TEMP_H - 8} x2={x(i)} y2={tempTop + TEMP_H - 2} />
            <line x1={x(i) - 2.6} y1={tempTop + TEMP_H - 6.5} x2={x(i) + 2.6} y2={tempTop + TEMP_H - 3.5} />
            <line x1={x(i) - 2.6} y1={tempTop + TEMP_H - 3.5} x2={x(i) + 2.6} y2={tempTop + TEMP_H - 6.5} />
          </g>
        {/each}
      {/if}

      <!-- Species rows: cause arcs above a daily score strip. -->
      {#each rows as row, r (row.species)}
        {#each arcsFor(row, r) as a (a.key)}
          <g fill="none" stroke={colorOf(a.key)} stroke-width="1.4">
            <title>{a.title}</title>
            <path d={a.path} stroke-dasharray={a.forecast ? '3 3' : undefined} />
            {#if a.bracket}
              <path d={a.bracket} stroke-width="1.8" stroke-dasharray={a.forecast ? '3 3' : undefined} />
            {/if}
            <circle cx={a.x0} cy={rowTop(r) + ARC_H - 1} r="2.5" fill={a.forecast ? 'white' : colorOf(a.key)} />
          </g>
        {/each}
        {#each stripCells(row) as { d, i } (d.date)}
          <rect
            x={left(i) + 1}
            y={rowTop(r) + ARC_H}
            width={dayW - 2}
            height={STRIP_H}
            rx="2"
            fill={scoreFill(d.score)}
            opacity={0.35 + 0.65 * d.confidence}
          >
            <title>{dayLabel(d.date)} {PICKING_TAG_LABELS[d.tag]} · {Math.round(d.score * 100)}/100</title>
          </rect>
        {/each}
      {/each}

      <!-- Foot: which part of the axis is measured, forecast or assumed. -->
      {#each segments as s (s.label)}
        {#if (s.to - s.from + 1) * dayW >= 40}
          <text
            x={(left(s.from) + left(s.to) + dayW) / 2}
            y={height - 4}
            font-size="9"
            fill="#6b7280"
            text-anchor="middle"
          >
            {s.label}
          </text>
        {/if}
      {/each}
    </svg>
  </div>
</div>
