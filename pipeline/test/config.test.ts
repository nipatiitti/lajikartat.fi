import { describe, expect, it } from 'vitest'
import { tileGrid, tilesContaining } from '../src/kernel/config'

type Bbox = [number, number, number, number]

describe('tileGrid', () => {
  it('covers the bbox with tiles of the given size', () => {
    expect(tileGrid([0, 0, 20000, 10000], 10000)).toHaveLength(2)
  })
})

describe('tilesContaining (candidate-driven acquisition)', () => {
  const grid: Bbox = [0, 0, 100000, 100000] // 10×10 grid of 10 km tiles

  it('selects only a point’s tile plus a 1-tile skirt', () => {
    const tiles = tilesContaining([[55000, 55000]], grid, 10000, 1)
    expect(tiles).toHaveLength(9) // centre tile + 8 neighbours
    expect(tiles.length).toBeLessThan(tileGrid(grid, 10000).length) // 9 ≪ 100
  })

  it('clips the skirt at the grid edge', () => {
    const tiles = tilesContaining([[5000, 5000]], grid, 10000, 1) // corner tile
    expect(tiles).toHaveLength(4)
  })

  it('dedupes overlapping skirts from nearby points', () => {
    const tiles = tilesContaining(
      [
        [55000, 55000],
        [56000, 56000]
      ],
      grid,
      10000,
      1
    )
    expect(tiles).toHaveLength(9)
  })
})
