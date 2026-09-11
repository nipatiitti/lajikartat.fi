<script lang="ts">
  import { browser } from '$app/env'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import CalendarLegend from '$lib/components/calendar/CalendarLegend.svelte'
  import CalendarTimeline, { type TimelineRow } from '$lib/components/calendar/CalendarTimeline.svelte'
  import CalendarWhyCard from '$lib/components/calendar/CalendarWhyCard.svelte'
  import {
    explainPicking,
    fmiConditions,
    pickingAnalysis,
    type Conditions,
    type PickingAnalysis,
    type PickingSpecies
  } from '$lib/conditions'
  import { DEFAULT_PLACE, PLACES, placeIds } from '$lib/conditions/places'
  import { CALENDAR_COPY, DATA_SOURCES } from '$lib/copy'
  import { SPECIES_RENDER } from '$lib/species/registry'

  const SPECIES: PickingSpecies[] = ['kantarelli', 'suppilovahvero']
  const HINDCAST_DAYS = 28

  // ?laji= picks the row order and the back link. The lookup point comes from
  // ?paikka= (a preset town, or "oma" for the browser's position) or from
  // ?lat=&lng= (a spot pill). Everything stays in the URL so links share.
  const laji = $derived<PickingSpecies>(
    page.url.searchParams.get('laji') === 'suppilovahvero' ? 'suppilovahvero' : 'kantarelli'
  )
  const custom = $derived.by((): [number, number] | null => {
    const latP = page.url.searchParams.get('lat')
    const lngP = page.url.searchParams.get('lng')
    if (latP === null || lngP === null) return null
    const lat = Number(latP)
    const lng = Number(lngP)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (lat < 59 || lat > 71 || lng < 19 || lng > 32) return null
    return [lng, lat]
  })
  const paikka = $derived(page.url.searchParams.get('paikka'))
  const preset = $derived(paikka !== null && paikka in PLACES ? paikka : null)
  const center = $derived(custom ?? PLACES[preset ?? DEFAULT_PLACE].center)
  const coordsText = $derived(`${center[1].toFixed(2).replace('.', ',')}, ${center[0].toFixed(2).replace('.', ',')}`)
  const regionLabel = $derived(
    custom
      ? `${coordsText} · ${paikka === 'oma' ? CALENDAR_COPY.ownLocation.toLowerCase() : CALENDAR_COPY.spotLocation}`
      : PLACES[preset ?? DEFAULT_PLACE].label
  )
  // What the select shows: a preset id, "oma", or "kohde" for a spot link.
  const selected = $derived(custom ? (paikka === 'oma' ? 'oma' : 'kohde') : (preset ?? DEFAULT_PLACE))

  let geo = $state<'idle' | 'busy' | 'failed'>('idle')
  function setParams(patch: Record<string, string | null>) {
    const url = new URL(location.href)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) url.searchParams.delete(k)
      else url.searchParams.set(k, v)
    }
    void goto(url, { replaceState: true, keepFocus: true, noScroll: true })
  }
  function choosePlace(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value
    if (value === 'oma') {
      locate()
      return
    }
    if (value === 'kohde') return
    geo = 'idle'
    setParams({ paikka: value, lat: null, lng: null })
  }
  function locate() {
    if (!navigator.geolocation) {
      geo = 'failed'
      return
    }
    geo = 'busy'
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geo = 'idle'
        setParams({ paikka: 'oma', lat: pos.coords.latitude.toFixed(4), lng: pos.coords.longitude.toFixed(4) })
      },
      () => (geo = 'failed'),
      { timeout: 10000, maximumAge: 600000 }
    )
  }

  let conditions = $state<Conditions | null>(null)
  let status = $state<'loading' | 'ok' | 'error'>('loading')
  // Browser-only: the FMI parser needs DOMParser, so nothing runs during SSR.
  $effect(() => {
    const target = center
    if (!browser) return
    status = 'loading'
    void fmiConditions.fetch(target).then((c) => {
      conditions = c
      status = c ? 'ok' : 'error'
    })
  })

  let shown = $state<Record<PickingSpecies, boolean>>({ kantarelli: true, suppilovahvero: true })
  function toggle(s: PickingSpecies) {
    // Keep at least one row on the axis.
    if (shown[s] && SPECIES.filter((k) => shown[k]).length === 1) return
    shown[s] = !shown[s]
  }
  const order = $derived(laji === 'kantarelli' ? SPECIES : [...SPECIES].reverse())

  const analyses = $derived.by(() => {
    if (!conditions) return null
    const out = {} as Record<PickingSpecies, PickingAnalysis>
    for (const s of SPECIES) {
      const a = pickingAnalysis(conditions.days, s, { hindcastDays: HINDCAST_DAYS })
      if (!a) return null
      out[s] = a
    }
    return out
  })
  const base = $derived(analyses ? analyses[laji] : null)
  const rows = $derived<TimelineRow[]>(
    analyses
      ? order
          .filter((s) => shown[s])
          .map((s) => ({
            species: s,
            label: SPECIES_RENDER[s].label,
            days: [...analyses[s].hindcast, ...analyses[s].days],
            events: analyses[s].events
          }))
      : []
  )
  const startIdx = $derived(base ? Math.max(0, base.todayIdx - HINDCAST_DAYS) : 0)
  // The axis runs past the forecast only as far as the last shown peak window.
  const endIdx = $derived.by(() => {
    if (!base) return 0
    let end = base.forecastEndIdx + 3
    const idx = new Map(base.series.map((d, i) => [d.date, i]))
    for (const r of rows)
      for (const e of r.events) {
        const pe = idx.get(e.peakEnd)
        if (pe !== undefined && e.endIdx >= startIdx) end = Math.max(end, pe + 2)
      }
    return Math.min(base.series.length - 1, end)
  })
  const explanations = $derived(
    analyses
      ? order.map((s) => ({
          species: s,
          label: SPECIES_RENDER[s].label,
          explanation: explainPicking(analyses[s]),
          todayScore: analyses[s].days[0]?.score ?? 0
        }))
      : []
  )
  const fmi = DATA_SOURCES.find((s) => s.name === 'Ilmatieteen laitos')
</script>

<svelte:head>
  <title>{CALENDAR_COPY.title} · lajikartat.fi</title>
  <meta name="description" content={CALENDAR_COPY.landerCardText} />
</svelte:head>

<div class="min-h-dvh bg-gray-50 text-gray-900">
  <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:py-10">
    <header class="flex flex-col gap-2">
      <a href="/{laji}" class="text-[11px] text-gray-400 hover:text-gray-600">← {CALENDAR_COPY.back}</a>
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{CALENDAR_COPY.title}</h1>
          <p class="text-sm text-gray-500">{regionLabel} · {CALENDAR_COPY.subtitle}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onchange={choosePlace}
            class="rounded-full border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700"
            aria-label={CALENDAR_COPY.place}
          >
            {#each placeIds as id (id)}
              <option value={id}>{PLACES[id].label}</option>
            {/each}
            <option value="oma">{CALENDAR_COPY.locate}</option>
            {#if selected === 'kohde'}
              <option value="kohde">{CALENDAR_COPY.spotLocation}</option>
            {/if}
          </select>
          <div class="flex gap-2" role="group" aria-label="Lajit">
            {#each SPECIES as s (s)}
              <button
                type="button"
                class="rounded-full border px-3 py-1 text-sm font-medium transition {shown[s]
                  ? 'border-gray-800 bg-gray-800 text-white'
                  : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'}"
                aria-pressed={shown[s]}
                onclick={() => toggle(s)}
              >
                {SPECIES_RENDER[s].label}
              </button>
            {/each}
          </div>
        </div>
      </div>
      {#if geo === 'busy'}
        <p class="text-xs text-gray-500">{CALENDAR_COPY.locating}</p>
      {:else if geo === 'failed'}
        <p class="text-xs text-amber-700">{CALENDAR_COPY.locateFailed}</p>
      {/if}
    </header>

    {#if status === 'loading'}
      <p class="text-sm text-gray-400">{CALENDAR_COPY.loading}</p>
    {:else if status === 'error' || !analyses || !base}
      <div class="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        {CALENDAR_COPY.unavailable}
      </div>
    {:else}
      <section class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:p-4" aria-label="Aikajana">
        <CalendarTimeline
          series={base.series}
          {startIdx}
          {endIdx}
          todayIdx={base.todayIdx}
          forecastEndIdx={base.forecastEndIdx}
          {rows}
        />
        <CalendarLegend />
      </section>

      <section class="grid gap-3 sm:grid-cols-2" aria-label={CALENDAR_COPY.why}>
        {#each explanations as e (e.species)}
          <CalendarWhyCard label={e.label} explanation={e.explanation} todayScore={e.todayScore} />
        {/each}
      </section>

      <section class="flex flex-col gap-2 text-xs text-gray-500" aria-label="Näin luet kalenteria">
        <p>{CALENDAR_COPY.howToRead}</p>
        <p>{CALENDAR_COPY.caveat}</p>
        <p>
          {#if fmi}
            <a href={fmi.url} class="underline hover:text-gray-700" target="_blank" rel="noopener"
              >{CALENDAR_COPY.attribution}</a
            >
          {:else}
            {CALENDAR_COPY.attribution}
          {/if}
        </p>
      </section>
    {/if}
  </main>
</div>
