export interface RegionPreset {
  id: string
  /**
   * Rough region bbox in EPSG:3067 [minX, minY, maxX, maxY], used to enumerate
   * acquisition tiles. The precise clip mask comes from the maakunta boundary
   * polygon (sources/boundary.ts) — this bbox only bounds the tile sweep.
   */
  bbox3067: [number, number, number, number]
}

// NOTE(data-layer): bbox3067 below is an approximation to confirm against the
// real Pirkanmaa maakunta boundary once boundary.ts is wired with the user.
export const REGIONS: Record<string, RegionPreset> = {
  pirkanmaa: {
    id: 'pirkanmaa',
    bbox3067: [283000, 6780000, 385000, 6900000]
  }
}

export const TILE_SIZE_M = 10000

type Bbox = [number, number, number, number]

/** Enumerate acquisition tiles (EPSG:3067 bboxes) covering a region bbox. */
export function tileGrid(bbox3067: Bbox, tileSizeM = TILE_SIZE_M): Bbox[] {
  const [minX, minY, maxX, maxY] = bbox3067
  const tiles: Bbox[] = []
  for (let x = minX; x < maxX; x += tileSizeM) {
    for (let y = minY; y < maxY; y += tileSizeM) {
      tiles.push([x, y, Math.min(x + tileSizeM, maxX), Math.min(y + tileSizeM, maxY)])
    }
  }
  return tiles
}

/**
 * Tiles (with a `skirt`-tile border) that contain any of the given 3067 points.
 * Candidate-driven acquisition: fetch heavy context layers only where ponds are.
 */
export function tilesContaining(
  points3067: [number, number][],
  bbox3067: Bbox,
  tileSizeM = TILE_SIZE_M,
  skirt = 1
): Bbox[] {
  const [minX, minY, maxX, maxY] = bbox3067
  const nx = Math.ceil((maxX - minX) / tileSizeM)
  const ny = Math.ceil((maxY - minY) / tileSizeM)
  const wanted = new Set<string>()

  for (const [x, y] of points3067) {
    const ix = Math.floor((x - minX) / tileSizeM)
    const iy = Math.floor((y - minY) / tileSizeM)
    for (let dx = -skirt; dx <= skirt; dx++) {
      for (let dy = -skirt; dy <= skirt; dy++) {
        const tx = ix + dx
        const ty = iy + dy
        if (tx < 0 || ty < 0 || tx >= nx || ty >= ny) continue
        wanted.add(`${tx},${ty}`)
      }
    }
  }

  const tiles: Bbox[] = []
  for (const key of wanted) {
    const [tx, ty] = key.split(',').map(Number)
    const x0 = minX + tx * tileSizeM
    const y0 = minY + ty * tileSizeM
    tiles.push([x0, y0, Math.min(x0 + tileSizeM, maxX), Math.min(y0 + tileSizeM, maxY)])
  }
  return tiles
}

export interface TileRef {
  ix: number
  iy: number
  bbox: Bbox
}

/** Which grid cell a 3067 point falls in. */
export function tileIndexOf(x: number, y: number, bbox3067: Bbox, tileSizeM = TILE_SIZE_M): { ix: number; iy: number } {
  return { ix: Math.floor((x - bbox3067[0]) / tileSizeM), iy: Math.floor((y - bbox3067[1]) / tileSizeM) }
}

/** A single tile (its 3067 bbox), clipped to the region. */
export function tileRef(ix: number, iy: number, bbox3067: Bbox, tileSizeM = TILE_SIZE_M): TileRef {
  const [minX, minY, maxX, maxY] = bbox3067
  const x0 = minX + ix * tileSizeM
  const y0 = minY + iy * tileSizeM
  return { ix, iy, bbox: [x0, y0, Math.min(x0 + tileSizeM, maxX), Math.min(y0 + tileSizeM, maxY)] }
}

/** A tile plus its `skirt`-cell border, clipped to the grid (for edge ponds). */
export function skirtTileRefs(ix: number, iy: number, bbox3067: Bbox, tileSizeM = TILE_SIZE_M, skirt = 1): TileRef[] {
  const [minX, minY, maxX, maxY] = bbox3067
  const nx = Math.ceil((maxX - minX) / tileSizeM)
  const ny = Math.ceil((maxY - minY) / tileSizeM)
  const refs: TileRef[] = []
  for (let dx = -skirt; dx <= skirt; dx++) {
    for (let dy = -skirt; dy <= skirt; dy++) {
      const tx = ix + dx
      const ty = iy + dy
      if (tx < 0 || ty < 0 || tx >= nx || ty >= ny) continue
      refs.push(tileRef(tx, ty, bbox3067, tileSizeM))
    }
  }
  return refs
}
