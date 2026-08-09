import { bbox } from '@turf/turf'
import { describe, expect, it } from 'vitest'
import { reprojectCollection3067to4326, reprojectFeature3067to4326 } from '../src/kernel/reproject'

describe('reproject EPSG:3067 → 4326', () => {
  it('places a known TM35FIN point at the right WGS84 lng/lat', () => {
    // Helsinki central railway station ≈ (385776, 6671971) in EPSG:3067.
    const f = reprojectFeature3067to4326({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [385776, 6671971] }
    })
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
    expect(lng).toBeCloseTo(24.94, 1)
    expect(lat).toBeCloseTo(60.17, 1)
  })

  it('reprojects polygon rings recursively', () => {
    const f = reprojectFeature3067to4326({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [320000, 6820000],
            [321000, 6820000],
            [321000, 6821000],
            [320000, 6820000]
          ]
        ]
      }
    })
    const ring = (f.geometry as GeoJSON.Polygon).coordinates[0]
    // Pirkanmaa / Tampere region: lng ~23–24, lat ~61.5.
    for (const [lng, lat] of ring) {
      expect(lng).toBeGreaterThan(22)
      expect(lng).toBeLessThan(25)
      expect(lat).toBeGreaterThan(61)
      expect(lat).toBeLessThan(62)
    }
  })

  it('strips stale source-CRS bbox members (turf 7 trusts them without recomputing)', () => {
    // Metsäkeskus GeoServer attaches per-feature 3067 bbox members; keeping them
    // poisons every turf.bbox()-seeded primitive after reprojection.
    const fc = reprojectCollection3067to4326({
      type: 'FeatureCollection',
      bbox: [320000, 6811000, 327000, 6819000],
      features: [
        {
          type: 'Feature',
          bbox: [320000, 6811000, 321000, 6812000],
          properties: {},
          geometry: {
            type: 'Polygon',
            bbox: [320000, 6811000, 321000, 6812000],
            coordinates: [
              [
                [320000, 6811000],
                [321000, 6811000],
                [321000, 6812000],
                [320000, 6811000]
              ]
            ]
          }
        }
      ]
    })
    expect(fc.bbox).toBeUndefined()
    expect(fc.features[0].bbox).toBeUndefined()
    expect(fc.features[0].geometry.bbox).toBeUndefined()
    // turf.bbox must now compute real 4326 degrees, not echo stale meters.
    const [minLng, minLat, maxLng, maxLat] = bbox(fc.features[0])
    expect(minLng).toBeGreaterThan(22)
    expect(maxLng).toBeLessThan(25)
    expect(minLat).toBeGreaterThan(61)
    expect(maxLat).toBeLessThan(62)
  })
})
