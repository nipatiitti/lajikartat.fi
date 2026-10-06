import { describe, expect, it } from 'vitest'
import { GRID, gridSize, tileRef, tileRefs } from '../src/kernel/config'
import {
  cellToXY,
  MVMI,
  mvmiWindow,
  rasterTileRef,
  snapBbox,
  TWI_COL_OFFSET,
  TWI_ROW_OFFSET,
  twiWindow,
  xyToCell
} from '../src/kernel/raster/lattice'

// A 7×8 km dev bbox (Pirkkala forests) and a 102×120 km one (Pirkanmaa).
const SMALL: [number, number, number, number] = [320000, 6811000, 327000, 6819000]
const LARGE: [number, number, number, number] = [283000, 6780000, 385000, 6900000]

describe('lattice', () => {
  it('knows the TWI offset from the MVMI origin', () => {
    expect(TWI_COL_OFFSET).toBe(2312)
    expect(TWI_ROW_OFFSET).toBe(207)
  })

  for (const [name, bbox] of [
    ['small', SMALL],
    ['large', LARGE],
    ['national', GRID.bbox3067]
  ] as const) {
    it(`snaps the ${name} bbox outward onto the 16 m lattice`, () => {
      const s = snapBbox(bbox)
      expect(s[0]).toBeLessThanOrEqual(bbox[0])
      expect(s[1]).toBeLessThanOrEqual(bbox[1])
      expect(s[2]).toBeGreaterThanOrEqual(bbox[2])
      expect(s[3]).toBeGreaterThanOrEqual(bbox[3])
      expect(bbox[0] - s[0]).toBeLessThan(16)
      expect(s[3] - bbox[3]).toBeLessThan(16)
      const w = mvmiWindow(s)
      for (const v of Object.values(w)) expect(Number.isInteger(v)).toBe(true)
    })
  }

  it('tiles a small bbox as one tile within 16 m of the vector tile', () => {
    expect(gridSize(SMALL)).toEqual({ nx: 1, ny: 1 })
    const r = rasterTileRef(0, 0, SMALL)
    const v = tileRef(0, 0, SMALL)
    expect(r.vectorRef).toEqual(v)
    for (let k = 0; k < 4; k++) expect(Math.abs(r.bbox3067[k] - v.bbox[k])).toBeLessThan(16)
    expect(r.width * 16).toBe(r.bbox3067[2] - r.bbox3067[0])
    expect(r.height * 16).toBe(r.bbox3067[3] - r.bbox3067[1])
  })

  it('tiles the national grid without gaps or overlaps and 625 cells per full tile', () => {
    const { nx, ny } = gridSize(GRID.bbox3067)
    expect(nx * ny).toBe(tileRefs().length)
    const a = rasterTileRef(23, 18)
    const right = rasterTileRef(24, 18)
    const up = rasterTileRef(23, 19)
    expect(a.width).toBe(625)
    expect(a.height).toBe(625)
    expect(right.bbox3067[0]).toBe(a.bbox3067[2])
    expect(up.bbox3067[1]).toBe(a.bbox3067[3])
    const last = rasterTileRef(nx - 1, ny - 1)
    expect(last.bbox3067[2]).toBe(snapBbox(GRID.bbox3067)[2])
    expect(last.bbox3067[3]).toBe(snapBbox(GRID.bbox3067)[3])
  })

  it('keeps dev bboxes on the national tile lattice (cached MML tiles stay valid)', () => {
    const national = tileRefs(LARGE).map((t) => rasterTileRef(t.ix, t.iy))
    const local = rasterTileRef(0, 0, LARGE)
    expect(national.some((t) => t.bbox3067.every((v, k) => v === local.bbox3067[k]))).toBe(true)
  })

  it('maps windows and cells consistently', () => {
    const r = rasterTileRef(0, 0, SMALL)
    const w = mvmiWindow(r.bbox3067)
    expect(w.right - w.left).toBe(r.width)
    expect(w.bottom - w.top).toBe(r.height)
    const t = twiWindow(r.bbox3067)
    expect(t.left).toBe(w.left - TWI_COL_OFFSET)
    expect(t.top).toBe(w.top - TWI_ROW_OFFSET)
    const [x, y] = cellToXY(r, 0)
    expect(x).toBe(r.bbox3067[0] + 8)
    expect(y).toBe(r.bbox3067[3] - 8)
    expect(xyToCell(r, x, y)).toBe(0)
    const i = r.width * 3 + 7
    const [x2, y2] = cellToXY(r, i)
    expect(xyToCell(r, x2, y2)).toBe(i)
    expect(xyToCell(r, r.bbox3067[0] - 1, y)).toBe(-1)
    expect(MVMI.originX + MVMI.width * 16).toBe(733472)
  })
})
