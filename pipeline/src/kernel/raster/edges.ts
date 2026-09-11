export interface StandEdgeOptions {
  /** Age jump (years) between 4-neighbours that marks a stand boundary. */
  ageJump: number
  /** Mean-height jump (dm) that marks a stand boundary. */
  heightJumpDm: number
  /** Value meaning "outside forest" — a forest cell next to it is a forest edge. */
  nodata: number
  /** Value meaning "unknown" (clouds) — never an edge, never compared. */
  unknown: number
  /** Treat the forest / non-forest boundary as an edge (field, lake, road corridor). */
  nonForestIsEdge: boolean
  /** 3×3 median-filter the bands first: MVMI is a per-pixel kNN estimate and
   * neighbouring pixels jitter by tens of years, which otherwise marks most
   * of the forest as "edge" (Pirkkala: 63 % of cells at 20 y / 5 m raw). */
  median: boolean
}

export const DEFAULT_STAND_EDGE_OPTIONS: StandEdgeOptions = {
  ageJump: 30,
  heightJumpDm: 80,
  nodata: 32767,
  unknown: 32766,
  nonForestIsEdge: true,
  median: true
}

/** 3×3 median of forest cells; nodata / unknown pass through and are ignored in the window. */
export function median3x3(src: ArrayLike<number>, width: number, rows: number, nodata: number, unknown: number): Uint16Array {
  const out = new Uint16Array(width * rows)
  const win = new Array<number>(9)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const v = src[i]
      if (v === nodata || v === unknown) {
        out[i] = v
        continue
      }
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= rows) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= width) continue
          const u = src[yy * width + xx]
          if (u === nodata || u === unknown) continue
          win[n++] = u
        }
      }
      const sorted = win.slice(0, n).sort((a, b) => a - b)
      out[i] = sorted[n >> 1]
    }
  }
  return out
}

/**
 * Stand boundaries from MVMI discontinuities: a forest cell is an edge when an
 * east or south 4-neighbour differs by ≥ ageJump years or ≥ heightJumpDm in
 * mean height (both cells are marked), or when the neighbour is not forest.
 */
export function standEdgeMask(
  ikaRaw: ArrayLike<number>,
  heightRaw: ArrayLike<number>,
  width: number,
  rows: number,
  opts: StandEdgeOptions = DEFAULT_STAND_EDGE_OPTIONS
): Uint8Array {
  const ika = opts.median ? median3x3(ikaRaw, width, rows, opts.nodata, opts.unknown) : ikaRaw
  const height = opts.median ? median3x3(heightRaw, width, rows, opts.nodata, opts.unknown) : heightRaw
  const mask = new Uint8Array(width * rows)
  const isForest = (i: number) => ika[i] !== opts.nodata && ika[i] !== opts.unknown
  const compare = (a: number, b: number) => {
    const fa = isForest(a)
    const fb = isForest(b)
    if (fa && fb) {
      if (Math.abs(ika[a] - ika[b]) >= opts.ageJump || Math.abs(height[a] - height[b]) >= opts.heightJumpDm) {
        mask[a] = 1
        mask[b] = 1
      }
      return
    }
    if (!opts.nonForestIsEdge) return
    if (fa && ika[b] === opts.nodata) mask[a] = 1
    else if (fb && ika[a] === opts.nodata) mask[b] = 1
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (x + 1 < width) compare(i, i + 1)
      if (y + 1 < rows) compare(i, i + width)
    }
  }
  return mask
}
