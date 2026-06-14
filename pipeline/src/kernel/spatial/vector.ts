import {
  area,
  booleanIntersects,
  booleanPointInPolygon,
  bbox as turfBbox,
  centroid,
  distance,
  featureCollection,
  intersect,
  lineString,
  pointToLineDistance
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

/** Build the shared spatial primitives over an already-reprojected (4326) bundle. */
export function buildJoinContext(bundle: LayerBundle): JoinContext {
  const layers: Record<string, IndexedLayer> = {}
  for (const [key, fc] of Object.entries(bundle)) layers[key] = buildLayer(fc)

  const search = (key: string, box: Bbox): Feature<Geometry>[] => {
    const layer = layers[key]
    if (!layer?.index) return []
    return layer.index.search(box[0], box[1], box[2], box[3]).map((i) => layer.features[i])
  }

  return {
    hasLayer(layerKey) {
      return layerKey in layers
    },

    nearestLine(feature, layerKey, maxMeters = 2000) {
      const layer = layers[layerKey]
      if (!layer?.index) return null
      // k-nearest by bbox from the pond centroid, then exact distance on just
      // those — avoids an exact distance against every road in a 3 km box.
      const [cx, cy] = centroid(feature).geometry.coordinates
      const maxDeg = (maxMeters + 1000) / 111_000
      let best: { distanceM: number; properties: Record<string, unknown> } | null = null
      for (const i of layer.index.neighbors(cx, cy, 48, maxDeg)) {
        const cand = layer.features[i]
        const d = minDistanceMeters(feature, cand)
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
      const total = area(polygon)
      if (total <= 0) return out
      for (const c of search(layerKey, turfBbox(polygon) as Bbox)) {
        if (!isPolygonal(c)) continue
        const clipped = intersect(featureCollection([polygon, c]))
        if (!clipped) continue
        const cls = String((c.properties ?? {})[classField] ?? 'unknown')
        out[cls] = (out[cls] ?? 0) + area(clipped) / total
      }
      return out
    }
  }
}
