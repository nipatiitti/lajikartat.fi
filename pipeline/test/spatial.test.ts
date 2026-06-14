import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson'
import { describe, expect, it } from 'vitest'
import { buildJoinContext } from '../src/kernel/spatial/vector'

const feat = (geometry: Geometry, id: string): Feature => ({ type: 'Feature', properties: { id }, geometry })
const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })

// ~50 m wide pond centred near Pirkanmaa (lng 23.5, lat 61.5).
const pond = feat(
  {
    type: 'Polygon',
    coordinates: [
      [
        [23.4995, 61.4995],
        [23.5005, 61.4995],
        [23.5005, 61.5005],
        [23.4995, 61.5005],
        [23.4995, 61.4995]
      ]
    ]
  },
  'pond'
) as Feature

const bundle = {
  roads: fc([
    feat({ type: 'LineString', coordinates: [[23.5015, 61.499], [23.5015, 61.501]] }, 'near'), // ~50 m east
    feat({ type: 'LineString', coordinates: [[23.6, 61.49], [23.6, 61.51]] }, 'far') // ~5 km east
  ]),
  buildings: fc([
    feat({ type: 'Point', coordinates: [23.5, 61.5008] }, 'b-near'), // ~33 m north
    feat({ type: 'Point', coordinates: [23.5, 61.51] }, 'b-far') // ~1 km north
  ])
}

describe('JoinContext spatial primitives', () => {
  const ctx = buildJoinContext(bundle)

  it('nearestLine finds the closest road by exact distance (k-NN candidates)', () => {
    const r = ctx.nearestLine(pond, 'roads', 3000)
    expect(r).not.toBeNull()
    expect(r?.properties.id).toBe('near')
    expect(r?.distanceM).toBeGreaterThan(20)
    expect(r?.distanceM).toBeLessThan(120)
  })

  it('nearestLine returns null for an absent layer', () => {
    expect(ctx.nearestLine(pond, 'nope', 3000)).toBeNull()
  })

  it('featuresWithin counts only features inside the radius', () => {
    const within = ctx.featuresWithin(pond, 'buildings', 100)
    expect(within).toHaveLength(1)
    expect(within[0].properties?.id).toBe('b-near')
  })

  it('hasLayer distinguishes present from absent layers', () => {
    expect(ctx.hasLayer('roads')).toBe(true)
    expect(ctx.hasLayer('soil')).toBe(false)
  })
})

describe('areaFractionByClass (grid sampling)', () => {
  // A unit catchment split left/right into two soil classes.
  const catchment: Feature<Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[[23.5, 61.5], [23.6, 61.5], [23.6, 61.6], [23.5, 61.6], [23.5, 61.5]]]
    }
  }
  const soil = (lng0: number, lng1: number, cls: string): Feature => ({
    type: 'Feature',
    properties: { PINTAMAALAJI: cls },
    geometry: {
      type: 'Polygon',
      coordinates: [[[lng0, 61.5], [lng1, 61.5], [lng1, 61.6], [lng0, 61.6], [lng0, 61.5]]]
    }
  })
  const ctx = buildJoinContext({
    soil: fc([soil(23.5, 23.55, 'Saraturve (CT)'), soil(23.55, 23.6, 'Hiekka (Hk)')])
  })

  it('estimates the class composition of a polygon', () => {
    const f = ctx.areaFractionByClass(catchment, 'soil', 'PINTAMAALAJI')
    expect(f['Saraturve (CT)']).toBeGreaterThan(0.35)
    expect(f['Saraturve (CT)']).toBeLessThan(0.65)
    expect(f['Saraturve (CT)'] + f['Hiekka (Hk)']).toBeCloseTo(1, 1)
  })
})
