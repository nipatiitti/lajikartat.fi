// One national acquisition grid. Every run scores the same 10 km tiles of this
// grid (tile ix, iy is stable across runs), so partial dev runs restricted with
// --bbox accumulate into the same output as a full Finland run. The origin is
// chosen so the grid covers the full Luke MVMI raster extent
// (57632..733472, 6602752..7778304 in EPSG:3067).
export type Bbox = [number, number, number, number]

export const TILE_SIZE_M = 10000

export const GRID: { readonly bbox3067: Bbox; readonly tileSizeM: number } = {
  bbox3067: [53000, 6600000, 743000, 7780000],
  tileSizeM: TILE_SIZE_M
}

/** Web-mercator PNG tiles published for raster species: tile size and native zoom (z12 ≈ 38 m/px, 18,5 m on the ground at 61° N for 16 m cells). */
export const RASTER_TILE_SIZE = 256
export const RASTER_NATIVE_ZOOM = 12

/**
 * Version string minted at publish time. It becomes part of every R2 key and
 * tile URL, which are cached as immutable, so each publish must mint a new one.
 */
export function datasetVersion(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`
}

export interface TileRef {
  ix: number
  iy: number
  bbox: Bbox
}

/** Number of tile columns / rows a bbox spans at the given tile size. */
export function gridSize(bbox3067: Bbox, tileSizeM = TILE_SIZE_M): { nx: number; ny: number } {
  return {
    nx: Math.ceil((bbox3067[2] - bbox3067[0]) / tileSizeM),
    ny: Math.ceil((bbox3067[3] - bbox3067[1]) / tileSizeM)
  }
}

/** Which grid cell a 3067 point falls in. */
export function tileIndexOf(
  x: number,
  y: number,
  bbox3067: Bbox = GRID.bbox3067,
  tileSizeM = TILE_SIZE_M
): { ix: number; iy: number } {
  return { ix: Math.floor((x - bbox3067[0]) / tileSizeM), iy: Math.floor((y - bbox3067[1]) / tileSizeM) }
}

/** A single tile (its 3067 bbox), clipped to the grid. */
export function tileRef(ix: number, iy: number, bbox3067: Bbox = GRID.bbox3067, tileSizeM = TILE_SIZE_M): TileRef {
  const [minX, minY, maxX, maxY] = bbox3067
  const x0 = minX + ix * tileSizeM
  const y0 = minY + iy * tileSizeM
  return { ix, iy, bbox: [x0, y0, Math.min(x0 + tileSizeM, maxX), Math.min(y0 + tileSizeM, maxY)] }
}

/** Every tile of the grid, optionally only those intersecting `within`. */
export function tileRefs(within?: Bbox, bbox3067: Bbox = GRID.bbox3067, tileSizeM = TILE_SIZE_M): TileRef[] {
  const { nx, ny } = gridSize(bbox3067, tileSizeM)
  let ix0 = 0
  let iy0 = 0
  let ix1 = nx - 1
  let iy1 = ny - 1
  if (within) {
    ix0 = Math.max(ix0, Math.floor((within[0] - bbox3067[0]) / tileSizeM))
    iy0 = Math.max(iy0, Math.floor((within[1] - bbox3067[1]) / tileSizeM))
    ix1 = Math.min(ix1, Math.ceil((within[2] - bbox3067[0]) / tileSizeM) - 1)
    iy1 = Math.min(iy1, Math.ceil((within[3] - bbox3067[1]) / tileSizeM) - 1)
  }
  const refs: TileRef[] = []
  for (let iy = iy0; iy <= iy1; iy++)
    for (let ix = ix0; ix <= ix1; ix++) refs.push(tileRef(ix, iy, bbox3067, tileSizeM))
  return refs
}

/** A tile plus its `skirt`-cell border, clipped to the grid (for features on tile edges). */
export function skirtTileRefs(
  ix: number,
  iy: number,
  bbox3067: Bbox = GRID.bbox3067,
  tileSizeM = TILE_SIZE_M,
  skirt = 1
): TileRef[] {
  const { nx, ny } = gridSize(bbox3067, tileSizeM)
  const refs: TileRef[] = []
  for (let dy = -skirt; dy <= skirt; dy++) {
    for (let dx = -skirt; dx <= skirt; dx++) {
      const tx = ix + dx
      const ty = iy + dy
      if (tx < 0 || ty < 0 || tx >= nx || ty >= ny) continue
      refs.push(tileRef(tx, ty, bbox3067, tileSizeM))
    }
  }
  return refs
}
