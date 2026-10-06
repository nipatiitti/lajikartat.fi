import { describe, expect, it } from 'vitest'
import { datasetVersion, GRID, gridSize, skirtTileRefs, tileIndexOf, tileRef, tileRefs } from '../src/kernel/config'

type Bbox = [number, number, number, number]
const grid: Bbox = [0, 0, 100000, 100000] // 10×10 grid of 10 km tiles

describe('national grid', () => {
  it('covers the whole MVMI raster extent with whole tiles', () => {
    const { nx, ny } = gridSize(GRID.bbox3067)
    expect(GRID.bbox3067[0] + nx * GRID.tileSizeM).toBeGreaterThanOrEqual(733472)
    expect(GRID.bbox3067[1] + ny * GRID.tileSizeM).toBeGreaterThanOrEqual(7778304)
    expect(tileRefs()).toHaveLength(nx * ny)
  })

  it('addresses tiles by stable indices from the grid origin', () => {
    const { ix, iy } = tileIndexOf(325000, 6815000)
    expect({ ix, iy }).toEqual({ ix: 27, iy: 21 })
    expect(tileRef(ix, iy).bbox).toEqual([323000, 6810000, 333000, 6820000])
  })
})

describe('tileRefs(within)', () => {
  it('lists only the tiles a bbox intersects, in row-major order', () => {
    const refs = tileRefs([15000, 25000, 26000, 35000], grid, 10000)
    expect(refs.map((r) => `${r.ix},${r.iy}`)).toEqual(['1,2', '2,2', '1,3', '2,3'])
  })

  it('clips the last column and row to the grid', () => {
    const refs = tileRefs([95000, 95000, 200000, 200000], grid, 10000)
    expect(refs).toHaveLength(1)
    expect(refs[0].bbox).toEqual([90000, 90000, 100000, 100000])
  })
})

describe('skirtTileRefs', () => {
  it('returns a tile plus its 8 neighbours', () => {
    expect(skirtTileRefs(5, 5, grid, 10000)).toHaveLength(9)
  })

  it('clips the skirt at the grid edge', () => {
    expect(skirtTileRefs(0, 0, grid, 10000)).toHaveLength(4)
  })
})

describe('datasetVersion', () => {
  it('is a sortable UTC timestamp usable in URLs', () => {
    expect(datasetVersion(new Date(Date.UTC(2026, 8, 11, 7, 5)))).toBe('20260911-0705')
  })
})
