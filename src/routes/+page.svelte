<script lang="ts">
  import { DATA_SOURCES } from '$lib/copy'
  import { SPECIES_RENDER, speciesIds } from '$lib/species/registry'
</script>

<svelte:head>
  <title>lajikartat.fi · lajikohtaisia potentiaalikarttoja avoimesta paikkatiedosta</title>
  <meta
    name="description"
    content="Avoin kartta-apuri kalastajille ja sienestäjille: missä isot ahvenet, kantarellit ja suppilovahverot todennäköisimmin ovat avoimen paikkatiedon perusteella."
  />
</svelte:head>

<div class="min-h-dvh bg-gray-50 text-gray-900">
  <main class="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10 sm:py-16">
    <header class="flex flex-col gap-3">
      <h1 class="text-3xl font-bold tracking-tight">lajikartat.fi</h1>
      <p class="max-w-xl text-gray-600">
        Lajikohtaisia potentiaalikarttoja avoimesta paikkatiedosta. Kartat arvioivat, missä lajin elinympäristö on
        parhaimmillaan. Ne eivät takaa saalista, vaan kertovat mistä kannattaa aloittaa.
      </p>
    </header>

    <section class="flex flex-col gap-3" aria-label="Lajit">
      <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">Lajit</h2>
      <ul class="grid gap-3 sm:grid-cols-2">
        {#each speciesIds as id (id)}
          {@const s = SPECIES_RENDER[id]}
          <li>
            <a
              href="/{id}"
              class="flex h-full flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow"
            >
              <span class="flex items-baseline justify-between gap-2">
                <span class="font-semibold">{s.label}</span>
                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{s.regionLabel}</span>
              </span>
              <span class="text-sm text-gray-600">{s.description}</span>
              <span class="mt-auto pt-1 text-sm font-medium text-blue-600">Avaa kartta →</span>
            </a>
          </li>
        {/each}
      </ul>
    </section>

    <section class="flex flex-col gap-3" aria-label="Näin luet karttaa">
      <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">Näin luet karttaa</h2>
      <div class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
        <p>
          <strong class="text-gray-800">Potentiaali</strong> (0–100) vertailee alueita: se kertoo, kuinka hyvin kohde
          vastaa lajin tunnettuja elinympäristövaatimuksia. Se ei ennusta saalista. Arvio lasketaan etukäteen avoimista
          aineistoista, ja maastossa asiat voivat aina olla toisin.
          <strong class="text-gray-800">Varmuus</strong> kertoo, kuinka kattavaa lähtötieto kohteella oli.
        </p>
        {#each speciesIds as id (id)}
          {@const s = SPECIES_RENDER[id]}
          <p><strong class="text-gray-800">{s.label}:</strong> {s.howToRead}</p>
        {/each}
        <p>
          Kohdetta napauttamalla näet perustelut: mitkä tekijät nostivat tai laskivat arviota ja mihin aineistoon ne
          perustuvat.
        </p>
      </div>
    </section>

    <section class="flex flex-col gap-2 text-xs text-gray-500" aria-label="Aineistot ja vastuut">
      <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">Aineistot ja vastuut</h2>
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
      <p class="pt-2 text-gray-400">lajikartat.fi · avoin harrasteprojekti</p>
    </section>
  </main>
</div>
