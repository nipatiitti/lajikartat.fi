<script lang="ts">
  import { goto } from '$app/navigation'
  import { SPECIES_RENDER, speciesIds } from '$lib/species/registry'

  let { current }: { current: string } = $props()

  function switchTo(event: Event) {
    const id = (event.currentTarget as HTMLSelectElement).value
    if (id === current) return
    // Keep the camera hash so the map doesn't jump; `?kohde` drops with the path
    // (spot ids are species-prefixed and meaningless across species).
    void goto(`/${id}${location.hash}`)
  }
</script>

<select
  value={current}
  onchange={switchTo}
  class="rounded border border-gray-300 bg-white px-2 py-1 text-sm font-medium"
  aria-label="Vaihda lajia"
>
  {#each speciesIds as id (id)}
    <option value={id}>{SPECIES_RENDER[id].label}</option>
  {/each}
</select>
