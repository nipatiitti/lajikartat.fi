<script lang="ts">
  import { browser } from '$app/env'
  import { afterNavigate, replaceState } from '$app/navigation'
  import { page } from '$app/state'
  import MapView from '$lib/components/Map.svelte'
  import DesktopShell from '$lib/components/shell/DesktopShell.svelte'
  import MobileShell from '$lib/components/shell/MobileShell.svelte'
  import { COPY } from '$lib/copy'
  import { formatCameraHash, parseCameraHash, type Camera } from '$lib/map/url'
  import { SPECIES_RENDER } from '$lib/species/registry'
  import { MapPageState } from '$lib/state/map-page.svelte'
  import { MediaQuery } from 'svelte/reactivity'

  const species = $derived(page.params.species ?? '')
  const config = $derived(SPECIES_RENDER[species])

  const mapState = new MapPageState()
  const isDesktop = new MediaQuery('(min-width: 1024px)')

  // Restore shared-URL state once, client-side only — the map reads the camera
  // at init, the spot id resolves when the geojson arrives. Keeping this out of
  // SSR also keeps the detail remote-query strictly client-side.
  const initialCamera: Camera | null = browser ? parseCameraHash(location.hash) : null
  if (browser) {
    const kohde = new URL(location.href).searchParams.get('kohde')
    if (kohde) mapState.pendingKohde = kohde
  }

  // replaceState throws before the router has initialised — gate on it.
  let routerReady = $state(false)
  afterNavigate(() => {
    routerReady = true
  })

  // Species switch: same route component, persistent map — just swap the data.
  $effect(() => {
    if (config) mapState.loadSpecies(config)
  })

  // Single URL writer: camera hash + ?kohde in one shallow replaceState.
  // Reads location.href (not page.url) so writing the URL can't retrigger it.
  $effect(() => {
    const cam = mapState.camera
    const selected = mapState.selectedId
    if (!routerReady || !browser) return
    const url = new URL(location.href)
    if (cam) url.hash = formatCameraHash(cam)
    if (selected) url.searchParams.set('kohde', selected)
    else url.searchParams.delete('kohde')
    if (url.href !== location.href) replaceState(url, {})
  })
</script>

<svelte:head><title>{config?.label ?? species} · lajikartat.fi</title></svelte:head>

{#if !config}
  <div class="p-8 text-gray-600">
    <p>{COPY.unknownSpecies} ”{species}”.</p>
    <a href="/" class="text-blue-600 underline">Takaisin etusivulle</a>
  </div>
{:else}
  <div class="relative h-dvh w-screen overflow-hidden text-gray-900">
    <div class="absolute inset-0">
      <MapView {mapState} {config} {initialCamera} />
    </div>
    {#if isDesktop.current}
      <DesktopShell {mapState} {config} {species} />
    {:else}
      <MobileShell {mapState} {config} {species} />
    {/if}
  </div>
{/if}
