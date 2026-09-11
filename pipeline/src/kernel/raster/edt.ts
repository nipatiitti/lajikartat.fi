// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher 2012): a
// 1-D lower-envelope pass over squared distances, applied to columns then rows.

const INF = 1e20

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

/**
 * Distance (in metres, `cellM` per cell) from every cell centre to the nearest
 * non-zero mask cell. Cells with no feature anywhere in the grid get Infinity.
 */
export function distanceTransform(
  mask: Uint8Array,
  width: number,
  height: number,
  cellM: number,
  out: Float32Array = new Float32Array(width * height)
): Float32Array {
  const n = width * height
  const d2 = new Float64Array(n)
  let any = false
  for (let i = 0; i < n; i++) {
    if (mask[i]) {
      d2[i] = 0
      any = true
    } else d2[i] = INF
  }
  if (!any) {
    out.fill(Infinity)
    return out
  }

  const m = Math.max(width, height)
  const f = new Float64Array(m)
  const d = new Float64Array(m)
  const v = new Int32Array(m)
  const z = new Float64Array(m + 1)

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = d2[y * width + x]
    edt1d(f, height, d, v, z)
    for (let y = 0; y < height; y++) d2[y * width + x] = d[y]
  }
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) f[x] = d2[row + x]
    edt1d(f, width, d, v, z)
    for (let x = 0; x < width; x++) d2[row + x] = d[x]
  }
  for (let i = 0; i < n; i++) out[i] = d2[i] >= INF / 2 ? Infinity : Math.sqrt(d2[i]) * cellM
  return out
}
