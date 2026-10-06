<script lang="ts">
  import { getCandidateDetail } from '$lib/candidates.remote'
  import StarPlot, { type StarAxis } from '$lib/components/StarPlot.svelte'
  import { CONFIDENCE_LABELS, COPY, FACTOR_SHORT_LABELS, scoreIndex } from '$lib/copy'
  import type { SpeciesRenderConfig } from '$lib/species/registry'
  import { CONFIDENCE_TONE, TONE_CHIP } from '$lib/tone'

  let {
    id,
    unit,
    coords = null,
    onclose
  }: {
    id: string
    unit: SpeciesRenderConfig['unit']
    /** Spot centre [lng, lat] for the utility row. */
    coords?: [number, number] | null
    onclose: () => void
  } = $props()

  const COPIED_MS = 2000

  // Re-creating the query when `id` changes gives us reactive loading/error/current.
  const detail = $derived(getCandidateDetail({ id }))

  // Star axes: scored factors only. The veto factor is pass/fail, not a scale.
  const axes = $derived<StarAxis[]>(
    (detail.current?.why.factors ?? [])
      .filter((f) => f.id !== 'V' && f.subScore !== null)
      .map((f) => ({ id: f.id, label: FACTOR_SHORT_LABELS[f.id] ?? f.label, value: f.subScore as number }))
  )

  const coordsText = $derived(coords ? `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}` : null)
  const mapsUrl = $derived(
    coordsText && `https://www.google.com/maps/dir/?api=1&destination=${coordsText.replace(' ', '')}`
  )

  let copied = $state<'coords' | 'link' | null>(null)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  function copyText(text: string, kind: 'coords' | 'link') {
    void navigator.clipboard.writeText(text).then(() => {
      copied = kind
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => (copied = null), COPIED_MS)
    })
  }

  function share() {
    const url = location.href
    if (navigator.share) void navigator.share({ url }).catch(() => copyText(url, 'link'))
    else copyText(url, 'link')
  }
</script>

{#snippet action(label: string, onclick: () => void)}
  <button
    type="button"
    class="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
    {onclick}
  >
    {label}
  </button>
{/snippet}

<div class="flex h-full min-h-0 flex-col">
  <header class="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
    <div class="min-w-0">
      {#if detail.current}
        <h3 class="truncate font-semibold">{detail.current.name ?? `${COPY.unnamed} ${unit.singular}`}</h3>
        <p class="flex items-center gap-1.5 text-xs text-gray-500">
          {#if detail.current.areaHa}<span>{detail.current.areaHa.toFixed(1).replace('.', ',')} ha</span> ·{/if}
          <span>{COPY.potential.toLowerCase()} {scoreIndex(detail.current.composite)}/100</span>
          <span
            class="rounded px-1.5 py-0.5 text-[10px] font-medium {TONE_CHIP[
              CONFIDENCE_TONE[detail.current.confidence]
            ]}"
          >
            {CONFIDENCE_LABELS[detail.current.confidence]}
          </span>
        </p>
      {:else}
        <h3 class="font-semibold text-gray-400">{COPY.spot}</h3>
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
          {@render action(copied === 'coords' ? COPY.copied : COPY.copyCoords, () => copyText(coordsText, 'coords'))}
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
        {@render action(copied === 'link' ? COPY.copied : COPY.share, share)}
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
