import { describe, expect, it } from 'vitest'
import { distanceTransform } from '../src/kernel/raster/edt'

function brute(mask: Uint8Array, w: number, h: number, cell: number): Float32Array {
  const out = new Float32Array(w * h)
  const pts: [number, number][] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) pts.push([x, y])
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = Infinity
      for (const [px, py] of pts) best = Math.min(best, Math.hypot(px - x, py - y))
      out[y * w + x] = best * cell
    }
  return out
}

describe('distanceTransform', () => {
  it('matches brute force on random masks', () => {
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let trial = 0; trial < 5; trial++) {
      const w = 37
      const h = 29
      const mask = new Uint8Array(w * h)
      for (let i = 0; i < mask.length; i++) mask[i] = rnd() < 0.03 ? 1 : 0
      mask[5 * w + 5] = 1
      const got = distanceTransform(mask, w, h, 16)
      const want = brute(mask, w, h, 16)
      for (let i = 0; i < got.length; i++) expect(got[i]).toBeCloseTo(want[i], 4)
    }
  })

  it('returns Infinity everywhere for an empty mask and 0 on features', () => {
    const empty = distanceTransform(new Uint8Array(12), 4, 3, 16)
    expect(empty.every((v) => v === Infinity)).toBe(true)
    const m = new Uint8Array(12)
    m[0] = 1
    const d = distanceTransform(m, 4, 3, 16)
    expect(d[0]).toBe(0)
    expect(d[3]).toBe(48)
    expect(d[11]).toBeCloseTo(Math.hypot(3, 2) * 16, 4)
  })
})
