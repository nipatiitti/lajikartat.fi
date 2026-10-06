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

  // Snap heights as a share of the viewport; below DISMISS the card closes.
  const SNAP: Record<SheetSnap, number> = { half: 0.45, full: 0.85 }
  const DISMISS = 0.25
  const MIN_PX = 56
  const MAX_SHARE = 0.92
  const DRAG_THRESHOLD_PX = 5

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
      if (Math.abs(delta) > DRAG_THRESHOLD_PX) moved = true
      dragHeight = Math.max(MIN_PX, Math.min(window.innerHeight * MAX_SHARE, startHeight + delta))
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
      if (height < vh * DISMISS && onclose) {
        onclose()
        return
      }
      snap = Math.abs(vh * SNAP.half - height) < Math.abs(vh * SNAP.full - height) ? 'half' : 'full'
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
  style:height={dragHeight !== null ? `${dragHeight}px` : `${SNAP[snap] * 100}dvh`}
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
