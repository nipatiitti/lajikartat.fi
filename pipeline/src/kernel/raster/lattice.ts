import { TILE_SIZE_M, tileRef } from '../config'
import type { RasterTileRef } from '../types'

export type Bbox = [number, number, number, number]

/** Luke MS-NFI (MVMI) 2023 rasters: 16 m ETRS-TM35FIN grid (header parsed 2026-09-11). */
export const MVMI = {
  originX: 57632,
  originY: 7778304, // top-left corner (rows run south)
  cell: 16,
  width: 42240,
  height: 73472,
  nodataOutside: 32767,
  nodataCloud: 32766
} as const

/** Luke TWI 16 m raster — same lattice, different extent. */
export const TWI = {
  originX: 94624,
  originY: 7774992,
  cell: 16,
  width: 39923,
  height: 71116,
  nodata: -32768
} as const

/** TWI pixel (col, row) = MVMI pixel (col − 2312, row − 207). */
export const TWI_COL_OFFSET = (TWI.originX - MVMI.originX) / MVMI.cell
export const TWI_ROW_OFFSET = (MVMI.originY - TWI.originY) / MVMI.cell

export interface PixelWindow {
  left: number
  top: number
  right: number
  bottom: number
}

const CELL = MVMI.cell

/** Snap a 3067 bbox outward onto the 16 m MVMI lattice. */
export function snapRegion(bbox: Bbox): Bbox {
  const [minX, minY, maxX, maxY] = bbox
  const fx = (x: number) => MVMI.originX + Math.floor((x - MVMI.originX) / CELL) * CELL
  const cx = (x: number) => MVMI.originX + Math.ceil((x - MVMI.originX) / CELL) * CELL
  const fy = (y: number) => MVMI.originY - Math.ceil((MVMI.originY - y) / CELL) * CELL
  const cy = (y: number) => MVMI.originY - Math.floor((MVMI.originY - y) / CELL) * CELL
  return [fx(minX), fy(minY), cx(maxX), cy(maxY)]
}

/** Number of tile columns / rows the vector tile grid has for a region. */
export function gridSize(regionBbox: Bbox, tileSizeM = TILE_SIZE_M): { nx: number; ny: number } {
  return {
    nx: Math.ceil((regionBbox[2] - regionBbox[0]) / tileSizeM),
    ny: Math.ceil((regionBbox[3] - regionBbox[1]) / tileSizeM)
  }
}

/**
 * The raster tile for grid cell (ix, iy): the vector tile's bbox snapped to the
 * lattice. Tiles are non-overlapping, the last column / row absorbs the
 * remainder, and every raster bbox lies within 16 m of its vector bbox, so the
 * vector skirt tiles (and their MML cache keys) still cover any padding.
 */
export function rasterTileRef(ix: number, iy: number, regionBbox: Bbox, tileSizeM = TILE_SIZE_M): RasterTileRef {
  if (tileSizeM % CELL !== 0) throw new Error(`tile size ${tileSizeM} is not a multiple of ${CELL} m`)
  const snapped = snapRegion(regionBbox)
  const { nx, ny } = gridSize(regionBbox, tileSizeM)
  const x0 = snapped[0] + ix * tileSizeM
  const y0 = snapped[1] + iy * tileSizeM
  const x1 = ix === nx - 1 ? snapped[2] : x0 + tileSizeM
  const y1 = iy === ny - 1 ? snapped[3] : y0 + tileSizeM
  return {
    ix,
    iy,
    bbox3067: [x0, y0, x1, y1],
    width: Math.round((x1 - x0) / CELL),
    height: Math.round((y1 - y0) / CELL),
    vectorRef: tileRef(ix, iy, regionBbox, tileSizeM)
  }
}

function assertOnLattice(v: number, what: string) {
  if (!Number.isInteger(v)) throw new Error(`${what} is not on the 16 m lattice (${v})`)
}

/** Pixel window of a lattice-aligned bbox in the MVMI raster (may exceed the raster extent). */
export function mvmiWindow(bbox: Bbox): PixelWindow {
  const w = {
    left: (bbox[0] - MVMI.originX) / CELL,
    right: (bbox[2] - MVMI.originX) / CELL,
    top: (MVMI.originY - bbox[3]) / CELL,
    bottom: (MVMI.originY - bbox[1]) / CELL
  }
  for (const [k, v] of Object.entries(w)) assertOnLattice(v, `mvmi window ${k}`)
  return w
}

/** Pixel window of a lattice-aligned bbox in the TWI raster. */
export function twiWindow(bbox: Bbox): PixelWindow {
  const w = mvmiWindow(bbox)
  return {
    left: w.left - TWI_COL_OFFSET,
    right: w.right - TWI_COL_OFFSET,
    top: w.top - TWI_ROW_OFFSET,
    bottom: w.bottom - TWI_ROW_OFFSET
  }
}

/** Centre of cell `i` (row-major, row 0 = north) in EPSG:3067. */
export function cellToXY(ref: RasterTileRef, i: number): [number, number] {
  const col = i % ref.width
  const row = Math.floor(i / ref.width)
  return [ref.bbox3067[0] + (col + 0.5) * CELL, ref.bbox3067[3] - (row + 0.5) * CELL]
}

/** Cell index of a 3067 point inside the tile, or −1 when outside. */
export function xyToCell(ref: RasterTileRef, x: number, y: number): number {
  const col = Math.floor((x - ref.bbox3067[0]) / CELL)
  const row = Math.floor((ref.bbox3067[3] - y) / CELL)
  if (col < 0 || row < 0 || col >= ref.width || row >= ref.height) return -1
  return row * ref.width + col
}
