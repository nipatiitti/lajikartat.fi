<script lang="ts">
  import { getCandidateDetail } from '$lib/candidates.remote'
  import ConditionsChip from '$lib/components/ConditionsChip.svelte'
  import StarPlot, { type StarAxis } from '$lib/components/StarPlot.svelte'
  import { CONFIDENCE_CHIP_CLASSES, CONFIDENCE_LABELS, COPY, FACTOR_SHORT_LABELS, scoreIndex } from '$lib/copy'
  import type { SpeciesCopy } from '$lib/species/registry'

  let {
    species,
    id,
    copy,
    coords = null,
    showConditions = false,
    onclose
  }: {
    species: string
    id: string
    copy: SpeciesCopy
    /** Spot centre [lng, lat] for the utility row and per-spot conditions. */
    coords?: [number, number] | null
    showConditions?: boolean
    onclose: () => void
  } = $props()

  // Re-creating the query when `id` changes gives us reactive loading/error/current.
  const detail = $derived(getCandidateDetail({ species, id }))

  // Star axes: scored factors only. The veto factor is pass/fail, not a scale.
  const axes = $derived.by<StarAxis[]>(() => {
    const out: StarAxis[] = []
    for (const f of detail.current?.why.factors ?? []) {
      if (f.id === 'V' || f.subScore === null) continue
      out.push({ id: f.id, label: FACTOR_SHORT_LABELS[f.id] ?? f.label, value: f.subScore })
    }
    return out
  })

  const coordsText = $derived(coords ? `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}` : null)
  const mapsUrl = $derived(
    coords ? `https://www.google.com/maps/dir/?api=1&destination=${coords[1].toFixed(5)},${coords[0].toFixed(5)}` : null
  )

  let copied = $state<'coords' | 'link' | null>(null)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  function copyText(text: string, kind: 'coords' | 'link') {
    void navigator.clipboard.writeText(text).then(() => {
      copied = kind
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => (copied = null), 2000)
    })
  }

  function share() {
    if (navigator.share) void navigator.share({ url: location.href }).catch(() => {})
    else copyText(location.href, 'link')
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  <header class="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
    <div class="min-w-0">
      {#if detail.current}
        <h3 class="truncate font-semibold">{detail.current.name ?? `Nimetön ${copy.singular}`}</h3>
        <p class="flex items-center gap-1.5 text-xs text-gray-500">
          {#if detail.current.areaHa}<span>{detail.current.areaHa.toFixed(1).replace('.', ',')} ha</span> ·{/if}
          <span>{COPY.potential.toLowerCase()} {scoreIndex(detail.current.composite)}/100</span>
          <span
            class="rounded px-1.5 py-0.5 text-[10px] font-medium {CONFIDENCE_CHIP_CLASSES[detail.current.confidence]}"
          >
            {CONFIDENCE_LABELS[detail.current.confidence]}
          </span>
        </p>
      {:else}
        <h3 class="font-semibold text-gray-400">Kohteen tiedot</h3>
      {/if}
    </div>
    <button type="button" onclick={onclose} class="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label={COPY.close}>
      ✕
    </button>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
    {#if detail.error}
      <p class="text-sm text-red-600">{COPY.detailError}</p>
    {:else if detail.loading || !detail.current}
      <p class="text-sm text-gray-400">{COPY.loading}</p>
    {:else}
      {@const d = detail.current}
      <StarPlot {axes} />

      {#if showConditions && coords}
        <div class="mt-2 flex justify-center">
          <ConditionsChip center={coords} />
        </div>
      {/if}

      <h4 class="mt-4 text-xs font-semibold tracking-wide text-gray-500 uppercase">{COPY.reasons}</h4>
      <ul class="mt-2 flex flex-col gap-2.5">
        {#each d.why.factors as f (f.id)}
          {#if f.id !== 'V' || f.drivers.length}
            <li>
              <div class="flex items-baseline justify-between gap-2 text-sm">
                <span class="font-medium">{f.label}</span>
                <span class="shrink-0 font-mono text-xs text-gray-400 tabular-nums">
                  {f.subScore === null ? COPY.noData : scoreIndex(f.subScore)}
                </span>
              </div>
              {#if f.drivers.length}
                <p class="mt-0.5 text-xs text-gray-500">{f.drivers.join(' · ')}</p>
              {/if}
            </li>
          {/if}
        {/each}
      </ul>

      <div class="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        {#if coordsText}
          <button
            type="button"
            class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            onclick={() => copyText(coordsText, 'coords')}
          >
            {copied === 'coords' ? COPY.copied : COPY.copyCoords}
          </button>
        {/if}
        {#if mapsUrl}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener"
            class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {COPY.openInMaps}
          </a>
        {/if}
        <button
          type="button"
          class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          onclick={share}
        >
          {copied === 'link' ? COPY.copied : COPY.share}
        </button>
      </div>

      <p class="mt-4 text-xs text-gray-400">{COPY.potentialCaveat}</p>
      {#if d.why.notes.length}
        <ul class="mt-2 flex flex-col gap-1 border-t border-gray-100 pt-3 text-xs text-gray-500">
          {#each d.why.notes as note, i (i)}
            <li>{note}</li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</div>
