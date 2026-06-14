import {
  booleanIntersects,
  booleanPointInPolygon,
  bbox as turfBbox,
  centroid,
  distance,
  lineString,
  pointToLineDistance,
  simplify
} from '@turf/turf'
import Flatbush from 'flatbush'
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
  Position
} from 'geojson'
import type { JoinContext, LayerBundle } from '../types'

type Bbox = [number, number, number, number]

interface IndexedLayer {
  features: Feature<Geometry>[]
  index: Flatbush | null
}

function buildLayer(fc: FeatureCollection | undefined): IndexedLayer {
  const features = (fc?.features ?? []).filter((f): f is Feature<Geometry> => f.geometry != null)
  let index: Flatbush | null = null
  if (features.length > 0) {
    index = new Flatbush(features.length)
    for (const f of features) {
      const b = turfBbox(f)
      index.add(b[0], b[1], b[2], b[3])
    }
    index.finish()
  }
  return { features, index }
}

function expand(b: readonly number[], meters: number): Bbox {
  const lat = (b[1] + b[3]) / 2
  const dLat = meters / 111320
  const dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180))
  return [b[0] - dLng, b[1] - dLat, b[2] + dLng, b[3] + dLat]
}

function ringsToLines(geom: Geometry): Feature<LineString>[] {
  const out: Feature<LineString>[] = []
  const pushRings = (rings: Position[][]) => {
    for (const r of rings) if (r.length >= 2) out.push(lineString(r))
  }
  switch (geom.type) {
    case 'LineString':
      out.push(lineString(geom.coordinates))
      break
    case 'MultiLineString':
      for (const l of geom.coordinates) if (l.length >= 2) out.push(lineString(l))
      break
    case 'Polygon':
      pushRings(geom.coordinates)
      break
    case 'MultiPolygon':
      for (const p of geom.coordinates) pushRings(p)
      break
  }
  return out
}

function verticesOf(geom: Geometry): Position[] {
  if (geom.type === 'Point') return [geom.coordinates]
  return ringsToLines(geom).flatMap((l) => l.geometry.coordinates)
}

/** Minimum geodesic distance (m) between two features' boundaries/vertices. */
function minDistanceMeters(a: Feature<Geometry>, b: Feature<Geometry>): number {
  const aLines = ringsToLines(a.geometry)
  const bLines = ringsToLines(b.geometry)
  const aVerts = verticesOf(a.geometry)
  const bVerts = verticesOf(b.geometry)
  let min = Infinity
  for (const v of aVerts) for (const l of bLines) min = Math.min(min, pointToLineDistance(v, l, { units: 'meters' }))
  for (const v of bVerts) for (const l of aLines) min = Math.min(min, pointToLineDistance(v, l, { units: 'meters' }))
  if (min === Infinity) {
    for (const av of aVerts) for (const bv of bVerts) min = Math.min(min, distance(av, bv, { units: 'meters' }))
  }
  return min
}

const isPolygonal = (f: Feature<Geometry>): f is Feature<Polygon | MultiPolygon> =>
  f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'

/** Down-sample a vertex list to at most `max` points, preserving rough shape. */
function decimate(pts: Position[], max: number): Position[] {
  if (pts.length <= max) return pts
  const step = Math.ceil(pts.length / max)
  const out: Position[] = []
  for (let i = 0; i < pts.length; i += step) out.push(pts[i])
  return out
}

/** Planar distance (m) from point (px,py) to segment (ax,ay)-(bx,by), local metric. */
function pointSegDistM(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Build the shared spatial primitives over an already-reprojected (4326) bundle. */
export function buildJoinContext(bundle: LayerBundle): JoinContext {
  const layers: Record<string, IndexedLayer> = {}
  for (const [key, fc] of Object.entries(bundle)) layers[key] = buildLayer(fc)

  const search = (key: string, box: Bbox): Feature<Geometry>[] => {
    const layer = layers[key]
    if (!layer?.index) return []
    return layer.index.search(box[0], box[1], box[2], box[3]).map((i) => layer.features[i])
  }

  // Class of the layer polygon a point falls in (null if none) — for sampling.
  const classAt = (key: string, lng: number, lat: number, field: string): string | null => {
    const layer = layers[key]
    if (!layer?.index) return null
    for (const i of layer.index.search(lng, lat, lng, lat)) {
      const f = layer.features[i]
      if (isPolygonal(f) && booleanPointInPolygon([lng, lat], f)) {
        return String((f.properties ?? {})[field] ?? 'unknown')
      }
    }
    return null
  }

  return {
    hasLayer(layerKey) {
      return layerKey in layers
    },

    nearestLine(feature, layerKey, maxMeters = 2000) {
      const layer = layers[layerKey]
      if (!layer?.index) return null
      // k-nearest lines by bbox from the centroid, then distance from a BOUNDED
      // set of the pond's boundary points — computed in a local planar metric
      // (plain arithmetic, no per-call turf overhead).
      const [cx, cy] = centroid(feature).geometry.coordinates
      const kx = 111_320 * Math.cos((cy * Math.PI) / 180)
      const ky = 111_320
      const toLocal = (lng: number, lat: number): [number, number] => [(lng - cx) * kx, (lat - cy) * ky]
      const pts = decimate(verticesOf(feature.geometry), 24).map(([lng, lat]) => toLocal(lng, lat))
      const maxDeg = (maxMeters + 1000) / 111_000

      let best: { distanceM: number; properties: Record<string, unknown> } | null = null
      for (const i of layer.index.neighbors(cx, cy, 16, maxDeg)) {
        const cand = layer.features[i]
        let d = Infinity
        for (const ln of ringsToLines(cand.geometry)) {
          const c = ln.geometry.coordinates
          for (let s = 0; s < c.length - 1; s++) {
            const [ax, ay] = toLocal(c[s][0], c[s][1])
            const [bx, by] = toLocal(c[s + 1][0], c[s + 1][1])
            for (const [px, py] of pts) {
              const dd = pointSegDistM(px, py, ax, ay, bx, by)
              if (dd < d) d = dd
            }
          }
        }
        if (d <= maxMeters && (best === null || d < best.distanceM)) {
          best = { distanceM: d, properties: (cand.properties ?? {}) as Record<string, unknown> }
        }
      }
      return best
    },

    featuresWithin(feature, layerKey, meters) {
      const box = expand(turfBbox(feature), meters)
      const poly = isPolygonal(feature) ? feature : null
      const out: Feature<Geometry>[] = []
      for (const c of search(layerKey, box)) {
        const within = poly && booleanPointInPolygon(centroid(c), poly) ? true : minDistanceMeters(feature, c) <= meters
        if (within) out.push(c)
      }
      return out
    },

    linesIntersecting(polygon, layerKey) {
      return search(layerKey, turfBbox(polygon) as Bbox).filter((c) => booleanIntersects(c, polygon)) as Feature<
        LineString | MultiLineString
      >[]
    },

    containingPolygon(point, layerKey) {
      for (const c of search(layerKey, turfBbox(point) as Bbox)) {
        if (isPolygonal(c) && booleanPointInPolygon(point, c)) return c
      }
      return null
    },

    areaFractionByClass(polygon, layerKey, classField) {
      const out: Record<string, number> = {}
      if (!layers[layerKey]?.index) return out
      // Estimate composition by sampling a grid of points inside the polygon and
      // classifying each by the layer polygon it lands in — far cheaper than
      // clipping every candidate with turf.intersect.
      const simplified = simplify(polygon, { tolerance: 0.0005, highQuality: false, mutate: false })
      const [minX, minY, maxX, maxY] = turfBbox(simplified)
      const N = 16
      const dx = (maxX - minX) / N
      const dy = (maxY - minY) / N
      const counts: Record<string, number> = {}
      let sampled = 0
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const lng = minX + (i + 0.5) * dx
          const lat = minY + (j + 0.5) * dy
          if (!booleanPointInPolygon([lng, lat], simplified)) continue
          const cls = classAt(layerKey, lng, lat, classField)
          if (cls === null) continue // no layer polygon here (water/gap)
          sampled++
          counts[cls] = (counts[cls] ?? 0) + 1
        }
      }
      if (sampled === 0) return out
      for (const [cls, c] of Object.entries(counts)) out[cls] = c / sampled
      return out
    }
  }
}
