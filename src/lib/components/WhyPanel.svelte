<script lang="ts">
  import { getCandidateDetail } from '$lib/candidates.remote'

  let {
    species,
    id,
    onclose
  }: {
    species: string
    id: string | null
    onclose: () => void
  } = $props()

  // Re-creating the query when `id` changes gives us reactive loading/error/current.
  const detail = $derived(id ? getCandidateDetail({ species, id }) : null)

  const confClass: Record<string, string> = {
    high: 'bg-green-100 text-green-800',
    med: 'bg-amber-100 text-amber-800',
    low: 'bg-gray-200 text-gray-600'
  }

  const pct = (n: number | null) => (n === null ? 0 : Math.round(n * 100))
</script>

{#if id}
  <aside class="flex h-full w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
    <header class="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
      <div class="min-w-0">
        {#if detail?.current}
          <h3 class="truncate font-semibold">{detail.current.name ?? '(unnamed pond)'}</h3>
          <p class="text-xs text-gray-500">
            {#if detail.current.areaHa}{detail.current.areaHa.toFixed(1)} ha · {/if}
            score {detail.current.composite.toFixed(3)}
            <span class="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium {confClass[detail.current.confidence] ?? ''}">
              {detail.current.confidence}
            </span>
          </p>
        {:else}
          <h3 class="font-semibold text-gray-400">Pond details</h3>
        {/if}
      </div>
      <button type="button" onclick={onclose} class="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
        ✕
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-4 py-3">
      {#if detail?.error}
        <p class="text-sm text-red-600">Couldn't load details.</p>
      {:else if !detail || detail.loading || !detail.current}
        <p class="text-sm text-gray-400">Loading…</p>
      {:else}
        {@const d = detail.current}
        <ul class="flex flex-col gap-3">
          {#each d.why.factors as f (f.id)}
            <li>
              <div class="flex items-baseline justify-between text-sm">
                <span class="font-medium">{f.label}</span>
                <span class="font-mono text-xs text-gray-400 tabular-nums">
                  {f.subScore === null ? '—' : f.subScore.toFixed(2)} · w{Math.round(f.weight * 100)}%
                </span>
              </div>
              <div class="mt-1 h-1.5 w-full rounded bg-gray-100">
                <div class="h-1.5 rounded bg-blue-500" style:width="{pct(f.subScore)}%"></div>
              </div>
              {#if f.drivers.length}
                <p class="mt-1 text-xs text-gray-500">{f.drivers.join(' · ')}</p>
              {/if}
            </li>
          {/each}
        </ul>

        {#if d.why.notes.length}
          <ul class="mt-4 flex flex-col gap-1 border-t border-gray-100 pt-3 text-xs text-gray-500">
            {#each d.why.notes as note, i (i)}
              <li>{note}</li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  </aside>
{/if}
