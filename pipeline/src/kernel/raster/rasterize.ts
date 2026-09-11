import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'

/** A row-major cell grid in EPSG:3067 (row 0 = north edge at `maxY`). */
export interface GridSpec {
  minX: number
  maxY: number
  cell: number
  width: number
  height: number
}

type Ring = Position[]

function* lineStrings(geom: Geometry | null): Generator<Position[]> {
  if (!geom) return
  switch (geom.type) {
    case 'LineString':
      yield geom.coordinates
      break
    case 'MultiLineString':
      yield* geom.coordinates
      break
    case 'Polygon':
      yield* geom.coordinates
      break
    case 'MultiPolygon':
      for (const poly of geom.coordinates) yield* poly
      break
    case 'GeometryCollection':
      for (const g of geom.geometries) yield* lineStrings(g)
      break
    default:
      break
  }
}

function* polygonRings(geom: Geometry | null): Generator<Ring[]> {
  if (!geom) return
  if (geom.type === 'Polygon') yield geom.coordinates
  else if (geom.type === 'MultiPolygon') yield* geom.coordinates
  else if (geom.type === 'GeometryCollection') for (const g of geom.geometries) yield* polygonRings(g)
}

/** Mark every cell a line passes through (DDA with ≤ 1-cell steps → 8-connected, no gaps). */
export function rasterizeLines(fc: FeatureCollection, grid: GridSpec, mask: Uint8Array = new Uint8Array(grid.width * grid.height)): Uint8Array {
  const { minX, maxY, cell, width, height } = grid
  for (const f of fc.features) {
    for (const line of lineStrings(f.geometry)) {
      for (let i = 1; i < line.length; i++) {
        const ax = (line[i - 1][0] - minX) / cell
        const ay = (maxY - line[i - 1][1]) / cell
        const bx = (line[i][0] - minX) / cell
        const by = (maxY - line[i][1]) / cell
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2))
        for (let s = 0; s <= steps; s++) {
          const t = s / steps
          const cx = Math.floor(ax + (bx - ax) * t)
          const cy = Math.floor(ay + (by - ay) * t)
          if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
          mask[cy * width + cx] = 1
        }
      }
    }
  }
  return mask
}

/**
 * Even-odd scanline fill on cell centres. `classOf` returns the byte to write
 * for a feature (later features win); with the default every covered cell is 1.
 */
export function rasterizePolygons(
  fc: FeatureCollection,
  grid: GridSpec,
  classOf: (f: Feature) => number = () => 1,
  out: Uint8Array = new Uint8Array(grid.width * grid.height)
): Uint8Array {
  const { minX, maxY, cell, width, height } = grid
  const xs: number[] = []
  for (const f of fc.features) {
    const code = classOf(f)
    if (code === 0) continue
    for (const rings of polygonRings(f.geometry)) {
      let ymin = Infinity
      let ymax = -Infinity
      for (const ring of rings) for (const [, y] of ring) {
        if (y < ymin) ymin = y
        if (y > ymax) ymax = y
      }
      const r0 = Math.max(0, Math.floor((maxY - ymax) / cell))
      const r1 = Math.min(height - 1, Math.floor((maxY - ymin) / cell))
      for (let r = r0; r <= r1; r++) {
        const yc = maxY - (r + 0.5) * cell
        xs.length = 0
        for (const ring of rings) {
          for (let i = 1; i < ring.length; i++) {
            const [x0, y0] = ring[i - 1]
            const [x1, y1] = ring[i]
            if (y0 === y1) continue
            if (yc < Math.min(y0, y1) || yc >= Math.max(y0, y1)) continue
            xs.push(x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0))
          }
        }
        if (xs.length < 2) continue
        xs.sort((a, b) => a - b)
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const c0 = Math.max(0, Math.ceil((xs[k] - minX) / cell - 0.5))
          const c1 = Math.min(width - 1, Math.floor((xs[k + 1] - minX) / cell - 0.5))
          for (let c = c0; c <= c1; c++) out[r * width + c] = code
        }
      }
    }
  }
  return out
}

/** Bbox centre of a geometry, or null for empty geometries. */
export function geometryCentre(geom: Geometry | null): [number, number] | null {
  if (!geom) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === 'number') {
      const [x, y] = c as Position
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    } else for (const sub of c as unknown[]) walk(sub)
  }
  if (geom.type === 'GeometryCollection') for (const g of geom.geometries) walk((g as { coordinates: unknown }).coordinates)
  else walk(geom.coordinates)
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null
}

/** Count of features (by bbox centre) per cell, saturating at 255. */
export function rasterizePointCounts(fc: FeatureCollection, grid: GridSpec, out: Uint8Array = new Uint8Array(grid.width * grid.height)): Uint8Array {
  const { minX, maxY, cell, width, height } = grid
  for (const f of fc.features) {
    const c = geometryCentre(f.geometry)
    if (!c) continue
    const cx = Math.floor((c[0] - minX) / cell)
    const cy = Math.floor((maxY - c[1]) / cell)
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue
    const i = cy * width + cx
    if (out[i] < 255) out[i]++
  }
  return out
}
