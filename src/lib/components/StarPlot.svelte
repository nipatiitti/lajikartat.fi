<script module lang="ts">
  export interface StarAxis {
    id: string
    label: string
    /** Factor sub-score in [0,1]. */
    value: number
  }
</script>

<script lang="ts">
  import { scoreIndex } from '$lib/copy'

  let { axes }: { axes: StarAxis[] } = $props()

  const CX = 165
  const CY = 120
  const R = 78
  const LABEL_R = 92
  const RINGS = [0.25, 0.5, 0.75, 1]

  const clamp = (v: number) => Math.min(1, Math.max(0, v))

  function point(i: number, r: number): [number, number] {
    const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
  }

  const ring = (f: number) => axes.map((_, i) => point(i, R * f).join(',')).join(' ')

  const valuePoints = $derived(axes.map((a, i) => point(i, R * clamp(a.value)).join(',')).join(' '))

  function labelFor(i: number): { x: number; y: number; anchor: string; dy: number } {
    const [x, y] = point(i, LABEL_R)
    const dx = x - CX
    const anchor = dx > 12 ? 'start' : dx < -12 ? 'end' : 'middle'
    const dy = y < CY - 12 ? -2 : y > CY + 12 ? 8 : 4
    return { x, y, anchor, dy }
  }

  const description = $derived(axes.map((a) => `${a.label} ${scoreIndex(a.value)}/100`).join(', '))
</script>

{#if axes.length >= 3}
  <svg viewBox="0 0 330 240" class="w-full" role="img" aria-label={description}>
    {#each RINGS as f (f)}
      <polygon points={ring(f)} fill="none" stroke="#e5e7eb" stroke-width="1" />
    {/each}
    {#each axes as axis, i (axis.id)}
      {@const [ex, ey] = point(i, R)}
      {@const l = labelFor(i)}
      <line x1={CX} y1={CY} x2={ex} y2={ey} stroke="#e5e7eb" stroke-width="1" />
      <text x={l.x} y={l.y + l.dy} text-anchor={l.anchor} class="fill-gray-500 text-[11px]">{axis.label}</text>
    {/each}
    <polygon points={valuePoints} fill="rgb(59 130 246 / 0.25)" stroke="#3b82f6" stroke-width="1.5" />
    {#each axes as axis, i (axis.id)}
      {@const [vx, vy] = point(i, R * clamp(axis.value))}
      <circle cx={vx} cy={vy} r="2.5" fill="#3b82f6" />
    {/each}
  </svg>
{/if}
