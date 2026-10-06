import type { FeatureCollection, Geometry, Position } from 'geojson'

export type Bounds = [number, number, number, number]

/** [minLng, minLat, maxLng, maxLat] of any GeoJSON geometry, or null when it has no coordinates. */
export function bboxOf(geom: Geometry | null | undefined): Bounds | null {
  if (!geom || !('coordinates' in geom)) return null
  const b: Bounds = [Infinity, Infinity, -Infinity, -Infinity]
  const walk = (c: unknown) => {
    if (typeof (c as Position)[0] === 'number') {
      const [x, y] = c as Position
      if (x < b[0]) b[0] = x
      if (y < b[1]) b[1] = y
      if (x > b[2]) b[2] = x
      if (y > b[3]) b[3] = y
    } else for (const sub of c as unknown[]) walk(sub)
  }
  walk(geom.coordinates)
  return Number.isFinite(b[0]) ? b : null
}

export function bboxOfCollection(fc: FeatureCollection): Bounds | null {
  let out: Bounds | null = null
  for (const f of fc.features) {
    const b = bboxOf(f.geometry)
    if (!b) continue
    out = out ? [Math.min(out[0], b[0]), Math.min(out[1], b[1]), Math.max(out[2], b[2]), Math.max(out[3], b[3])] : b
  }
  return out
}

export const centerOfBounds = (b: Bounds): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
