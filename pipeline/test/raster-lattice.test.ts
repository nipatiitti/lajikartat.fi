import { describe, expect, it } from 'vitest'
import { REGIONS, tileGrid, tileRef } from '../src/kernel/config'
import {
  cellToXY,
  gridSize,
  MVMI,
  mvmiWindow,
  rasterTileRef,
  snapRegion,
  TWI_COL_OFFSET,
  TWI_ROW_OFFSET,
  twiWindow,
  xyToCell
} from '../src/kernel/raster/lattice'

describe('lattice', () => {
  it('knows the TWI offset from the MVMI origin', () => {
    expect(TWI_COL_OFFSET).toBe(2312)
    expect(TWI_ROW_OFFSET).toBe(207)
  })

  for (const id of ['pirkkala', 'pirkanmaa', 'finland'] as const) {
    it(`snaps ${id} outward onto the 16 m lattice`, () => {
      const bbox = REGIONS[id].bbox3067
      const s = snapRegion(bbox)
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

  it('tiles pirkkala as one tile within 16 m of the vector tile', () => {
    const region = REGIONS.pirkkala.bbox3067
    expect(gridSize(region)).toEqual({ nx: 1, ny: 1 })
    const r = rasterTileRef(0, 0, region)
    const v = tileRef(0, 0, region)
    expect(r.vectorRef).toEqual(v)
    for (let k = 0; k < 4; k++) expect(Math.abs(r.bbox3067[k] - v.bbox[k])).toBeLessThan(16)
    expect(r.width * 16).toBe(r.bbox3067[2] - r.bbox3067[0])
    expect(r.height * 16).toBe(r.bbox3067[3] - r.bbox3067[1])
  })

  it('tiles pirkanmaa without gaps or overlaps and 625 cells per full tile', () => {
    const region = REGIONS.pirkanmaa.bbox3067
    const { nx, ny } = gridSize(region)
    expect(nx * ny).toBe(tileGrid(region).length)
    const a = rasterTileRef(3, 4, region)
    const right = rasterTileRef(4, 4, region)
    const up = rasterTileRef(3, 5, region)
    expect(a.width).toBe(625)
    expect(a.height).toBe(625)
    expect(right.bbox3067[0]).toBe(a.bbox3067[2])
    expect(up.bbox3067[1]).toBe(a.bbox3067[3])
    const last = rasterTileRef(nx - 1, ny - 1, region)
    expect(last.bbox3067[2]).toBe(snapRegion(region)[2])
    expect(last.bbox3067[3]).toBe(snapRegion(region)[3])
  })

  it('shares pirkanmaa tile bboxes with the finland grid', () => {
    const p = rasterTileRef(0, 0, REGIONS.pirkanmaa.bbox3067)
    const f = rasterTileRef(23, 18, REGIONS.finland.bbox3067)
    expect(f.bbox3067).toEqual(p.bbox3067)
  })

  it('maps windows and cells consistently', () => {
    const r = rasterTileRef(0, 0, REGIONS.pirkkala.bbox3067)
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
