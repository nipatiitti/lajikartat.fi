<script lang="ts">
  import { CALENDAR_COPY, COPY, DATA_SOURCES, SITE_NAME } from '$lib/copy'
  import { SPECIES_RENDER, speciesIds } from '$lib/species/registry'
</script>

<svelte:head>
  <title>{SITE_NAME} · {COPY.tagline}</title>
  <meta
    name="description"
    content="Avoin kartta-apuri kalastajille ja sienestäjille: missä isot ahvenet, kantarellit ja suppilovahverot todennäköisimmin ovat avoimen paikkatiedon perusteella."
  />
</svelte:head>

{#snippet heading(text: string)}
  <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">{text}</h2>
{/snippet}

{#snippet card(href: string, title: string, text: string, cta: string)}
  <a
    {href}
    class="flex h-full flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow"
  >
    <span class="font-semibold">{title}</span>
    <span class="text-sm text-gray-600">{text}</span>
    <span class="mt-auto pt-1 text-sm font-medium text-blue-600">{cta} →</span>
  </a>
{/snippet}

<div class="min-h-dvh bg-gray-50 text-gray-900">
  <main class="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10 sm:py-16">
    <header class="flex flex-col gap-2">
      <h1 class="text-3xl font-bold tracking-tight">{SITE_NAME}</h1>
      <p class="max-w-xl text-gray-600">{COPY.tagline}</p>
    </header>

    <section class="flex flex-col gap-3" aria-label={COPY.species}>
      {@render heading(COPY.species)}
      <ul class="grid gap-3 sm:grid-cols-2">
        {#each speciesIds as id (id)}
          {@const s = SPECIES_RENDER[id]}
          <li>{@render card(`/${id}`, s.label, s.description, COPY.openMap)}</li>
        {/each}
      </ul>
    </section>

    <section class="flex flex-col gap-3" aria-label={CALENDAR_COPY.title}>
      {@render heading(CALENDAR_COPY.title)}
      {@render card('/sienikalenteri', CALENDAR_COPY.title, CALENDAR_COPY.landerCardText, CALENDAR_COPY.openCalendar)}
    </section>

    <section class="flex flex-col gap-2 text-xs text-gray-500" aria-label={COPY.sources}>
      {@render heading(COPY.sources)}
      <p>
        Aineistot:
        {#each DATA_SOURCES as source, i (source.name)}
          <a href={source.url} class="underline hover:text-gray-700" target="_blank" rel="noopener">{source.name}</a
          >{i < DATA_SOURCES.length - 1 ? ', ' : ','}
        {/each}
        lisenssillä
        <a
          href="https://creativecommons.org/licenses/by/4.0/deed.fi"
          class="underline hover:text-gray-700"
          target="_blank"
          rel="noopener">CC BY 4.0</a
        >. Kartat ovat johdettuja arvioita, eivät viranomaistietoa.
      </p>
      <p>
        Liiku jokamiehenoikeuksien mukaisesti: älä poimi pihoilta, viljelmiltä tai luonnonsuojelualueiden
        rajoitusosista. Sienten tunnistus on aina poimijan omalla vastuulla. Jätä osa sadosta metsään. Isojen ahventen
        kannat ovat herkkiä: vapauta suurimmat kalat.
      </p>
      <p class="pt-2 text-gray-400">{SITE_NAME} · {COPY.hobbyProject}</p>
    </section>
  </main>
</div>
