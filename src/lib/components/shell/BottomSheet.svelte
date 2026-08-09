<script module lang="ts">
  export type SheetSnap = 'half' | 'full'
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    snap = $bindable('half'),
    onclose,
    children
  }: {
    snap?: SheetSnap
    /** Called when the sheet is swiped down past the dismiss threshold. */
    onclose?: () => void
    children: Snippet
  } = $props()

  const SNAP_HEIGHTS: Record<SheetSnap, string> = { half: '45dvh', full: '85dvh' }

  let sheet = $state<HTMLDivElement>()
  let dragging = $state(false)
  let dragHeight = $state<number | null>(null)
  let moved = false

  // Drag lives on the grab handle only: the map keeps its gestures and the
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
      dragHeight = null
      if (!moved) return
      const vh = window.innerHeight
      // Swiping well below the half snap dismisses the card.
      if (height < vh * 0.25 && onclose) {
        onclose()
        return
      }
      snap = Math.abs(vh * 0.45 - height) < Math.abs(vh * 0.85 - height) ? 'half' : 'full'
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onHandleClick() {
    if (moved) return
    snap = snap === 'half' ? 'full' : 'half'
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
