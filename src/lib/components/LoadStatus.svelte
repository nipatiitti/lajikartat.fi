<script lang="ts">
  import { COPY } from '$lib/copy'

  let { loading, error }: { loading: boolean; error: boolean } = $props()
</script>

{#if error || loading}
  <div class="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center">
    {#if error}
      <span class="rounded-full bg-red-600/90 px-3 py-1.5 text-xs font-medium text-white shadow">{COPY.loadError}</span>
    {:else}
      <span class="rounded-full bg-gray-900/75 px-3 py-1.5 text-xs font-medium text-white shadow">{COPY.loading}</span>
    {/if}
  </div>
{/if}
