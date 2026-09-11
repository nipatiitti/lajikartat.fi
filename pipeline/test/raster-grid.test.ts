import type { FeatureCollection } from 'geojson'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STAND_EDGE_OPTIONS, standEdgeMask } from '../src/kernel/raster/edges'
import {
  geometryCentre,
  rasterizeLines,
  rasterizePointCounts,
  rasterizePolygons,
  type GridSpec
} from '../src/kernel/raster/rasterize'
import { boxSum, summedAreaTable } from '../src/kernel/raster/sat'

const grid: GridSpec = { minX: 1000, maxY: 2000, cell: 16, width: 10, height: 10 }
const at = (m: Uint8Array, col: number, row: number) => m[row * grid.width + col]

describe('rasterizeLines', () => {
  it('marks every cell along a diagonal without gaps', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [1008, 1992],
              [1152, 1848]
            ]
          }
        }
      ]
    }
    const m = rasterizeLines(fc, grid)
    for (let k = 0; k < 10; k++) expect(at(m, k, k)).toBe(1)
    expect(m.reduce((a, b) => a + b, 0)).toBe(10)
  })

  it('ignores segments outside the grid', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [10, 10]
            ]
          }
        }
      ]
    }
    expect(rasterizeLines(fc, grid).some((v) => v)).toBe(false)
  })
})

describe('rasterizePolygons', () => {
  it('fills a square with a hole by cell centres, later features win', () => {
    const square = [
      [1032, 1968],
      [1096, 1968],
      [1096, 1904],
      [1032, 1904],
      [1032, 1968]
    ]
    const hole = [
      [1048, 1952],
      [1080, 1952],
      [1080, 1920],
      [1048, 1920],
      [1048, 1952]
    ]
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { c: 2 }, geometry: { type: 'Polygon', coordinates: [square, hole] } },
        {
          type: 'Feature',
          properties: { c: 3 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [1000, 2000],
                [1016, 2000],
                [1016, 1984],
                [1000, 1984],
                [1000, 2000]
              ]
            ]
          }
        }
      ]
    }
    const m = rasterizePolygons(fc, grid, (f) => Number(f.properties?.c))
    // 4×4 outer minus 2×2 hole = 12 cells of class 2, 1 cell of class 3
    expect(m.filter((v) => v === 2).length).toBe(12)
    expect(m.filter((v) => v === 3).length).toBe(1)
    expect(at(m, 2, 2)).toBe(2)
    expect(at(m, 3, 3)).toBe(0)
    expect(at(m, 0, 0)).toBe(3)
  })
})

describe('rasterizePointCounts', () => {
  it('counts feature centres per cell', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1008, 1992] } },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [1002, 1998],
                [1014, 1998],
                [1014, 1986],
                [1002, 1986],
                [1002, 1998]
              ]
            ]
          }
        },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [5000, 5000] } }
      ]
    }
    const m = rasterizePointCounts(fc, grid)
    expect(at(m, 0, 0)).toBe(2)
    expect(m.reduce((a, b) => a + b, 0)).toBe(2)
    expect(geometryCentre(null)).toBeNull()
  })
})

describe('summedAreaTable / boxSum', () => {
  it('equals brute-force box sums', () => {
    const w = 9
    const h = 7
    const src = new Uint8Array(w * h)
    for (let i = 0; i < src.length; i++) src[i] = (i * 7) % 5
    const sat = summedAreaTable(src, w, h)
    const got = boxSum(sat, w, h, 2)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0
        for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2); yy++)
          for (let xx = Math.max(0, x - 2); xx <= Math.min(w - 1, x + 2); xx++) s += src[yy * w + xx]
        expect(got[y * w + x]).toBe(s)
      }
  })
})

describe('standEdgeMask', () => {
  it('marks the boundary between two stands and the forest edge', () => {
    const w = 6
    const h = 3
    const ika = new Uint16Array(w * h)
    const height = new Uint16Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (x === 5) ika[i] = 32767
        else ika[i] = x < 3 ? 40 : 90
        height[i] = 150
      }
    const m = standEdgeMask(ika, height, w, h, { ...DEFAULT_STAND_EDGE_OPTIONS, median: false })
    for (let y = 0; y < h; y++) {
      expect(m[y * w + 2]).toBe(1) // west stand side of the boundary
      expect(m[y * w + 3]).toBe(1) // east side
      expect(m[y * w + 4]).toBe(1) // next to non-forest
      expect(m[y * w + 0]).toBe(0)
      expect(m[y * w + 1]).toBe(0)
      expect(m[y * w + 5]).toBe(0) // non-forest itself never an edge
    }
    const uniform = standEdgeMask(new Uint16Array(w * h).fill(60), height, w, h, {
      ...DEFAULT_STAND_EDGE_OPTIONS,
      median: false
    })
    expect(uniform.some((v) => v)).toBe(false)
  })
})
