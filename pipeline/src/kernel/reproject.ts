import type { Feature, FeatureCollection, Geometry, GeometryCollection, Position } from 'geojson'
import proj4 from 'proj4'

// ETRS-TM35FIN. Reproject ONCE at ingest so all downstream geometry + Turf math
// is geodesic WGS84. (Turf assumes 4326; feeding it 3067 makes distances wrong.)
proj4.defs('EPSG:3067', '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')

const to4326 = (p: Position): Position => {
  const [x, y] = proj4('EPSG:3067', 'EPSG:4326', [p[0], p[1]])
  return p.length > 2 ? [x, y, p[2]] : [x, y]
}

/** Reproject a single [x, y] coordinate from EPSG:3067 to WGS84. */
export const reprojectPoint3067to4326 = (p: Position): Position => to4326(p)

/** Reproject a single [lng, lat] coordinate from WGS84 to EPSG:3067. */
export const reprojectPoint4326to3067 = (p: Position): Position => {
  const [x, y] = proj4('EPSG:4326', 'EPSG:3067', [p[0], p[1]])
  return [x, y]
}

type Coords = Position | Coords[]
const mapCoords = (coords: Coords): Coords =>
  typeof coords[0] === 'number' ? to4326(coords as Position) : (coords as Coords[]).map(mapCoords)

export function reprojectGeometry3067to4326(geom: Geometry): Geometry {
  if (geom.type === 'GeometryCollection') {
    const gc = geom as GeometryCollection
    return { ...gc, geometries: gc.geometries.map(reprojectGeometry3067to4326) }
  }
  const g = geom as Exclude<Geometry, GeometryCollection>
  return { ...g, coordinates: mapCoords(g.coordinates as Coords) } as Geometry
}

export function reprojectFeature3067to4326(feature: Feature): Feature {
  if (!feature.geometry) return feature
  return { ...feature, geometry: reprojectGeometry3067to4326(feature.geometry) }
}

export function reprojectCollection3067to4326(fc: FeatureCollection): FeatureCollection {
  return { ...fc, features: fc.features.map(reprojectFeature3067to4326) }
}
