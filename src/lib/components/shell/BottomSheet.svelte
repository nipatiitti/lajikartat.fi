<script module lang="ts">
  export type SheetSnap = 'collapsed' | 'half' | 'full'
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  let { snap = $bindable('half'), children }: { snap?: SheetSnap; children: Snippet } = $props()

  const SNAP_HEIGHTS: Record<SheetSnap, string> = { collapsed: '5.5rem', half: '45dvh', full: '85dvh' }

  let sheet = $state<HTMLDivElement>()
  let dragging = $state(false)
  let dragHeight = $state<number | null>(null)
  let moved = false

  // Drag lives on the grab handle only — the map keeps its gestures and the
  // sheet body keeps native scrolling.
  function onPointerDown(e: PointerEvent) {
    if (!sheet) return
    dragging = true
    moved = false
    const startY = e.clientY
    const startHeight = sheet.getBoundingClientRect().height

    const onMove = (ev: PointerEvent) => {
      const delta = startY - ev.clientY
      if (Math.abs(delta) > 5) moved = true
      dragHeight = Math.max(56, Math.min(window.innerHeight * 0.92, startHeight + delta))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragging = false
      const height = dragHeight ?? startHeight
      const vh = window.innerHeight
      const targets: Array<[SheetSnap, number]> = [
        ['collapsed', 88],
        ['half', vh * 0.45],
        ['full', vh * 0.85]
      ]
      if (moved)
        snap = targets.reduce((best, t) => (Math.abs(t[1] - height) < Math.abs(best[1] - height) ? t : best))[0]
      dragHeight = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onHandleClick() {
    if (moved) return
    snap = snap === 'collapsed' ? 'half' : snap === 'half' ? 'full' : 'collapsed'
  }
</script>

<div
  bind:this={sheet}
  class="fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] {dragging
    ? ''
    : 'transition-[height] duration-200 ease-out'}"
  style:height={dragHeight !== null ? `${dragHeight}px` : SNAP_HEIGHTS[snap]}
>
  <button
    type="button"
    class="flex w-full shrink-0 cursor-grab touch-none justify-center py-2.5"
    onpointerdown={onPointerDown}
    onclick={onHandleClick}
    aria-label="Vedä tai napauta paneelia"
  >
    <span class="h-1 w-10 rounded-full bg-gray-300"></span>
  </button>
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    {@render children()}
  </div>
</div>
