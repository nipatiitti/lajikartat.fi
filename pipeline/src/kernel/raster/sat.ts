/** Summed-area table (inclusive prefix sums) with a zero border: (w+1)×(h+1). */
export function summedAreaTable(src: ArrayLike<number>, width: number, height: number): Uint32Array {
  const W = width + 1
  const sat = new Uint32Array(W * (height + 1))
  for (let y = 1; y <= height; y++) {
    let rowSum = 0
    for (let x = 1; x <= width; x++) {
      rowSum += src[(y - 1) * width + (x - 1)]
      sat[y * W + x] = sat[(y - 1) * W + x] + rowSum
    }
  }
  return sat
}

/** Sum of `src` over the (2r+1)² box around each cell, clipped at the grid edge. */
export function boxSum(
  sat: Uint32Array,
  width: number,
  height: number,
  radiusCells: number,
  out: Uint16Array = new Uint16Array(width * height)
): Uint16Array {
  const W = width + 1
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radiusCells)
    const y1 = Math.min(height, y + radiusCells + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radiusCells)
      const x1 = Math.min(width, x + radiusCells + 1)
      const s = sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0]
      out[y * width + x] = s > 65535 ? 65535 : s
    }
  }
  return out
}
