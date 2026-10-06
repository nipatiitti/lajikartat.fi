import type { Feature, Polygon } from 'geojson'
import { describe, expect, it } from 'vitest'
import { extractPerchCandidates, featureId, pickName } from '../src/species/perch/candidates'
import { eskerShare, peatShare } from '../src/species/perch/score'

// Roughly square polygons near lat 61.5; 0.001° lng ≈ 53 m, 0.001° lat ≈ 111 m.
function square(sideDeg: number, id?: string, properties: Record<string, unknown> = {}): Feature<Polygon> {
  const lng = 23.5
  const lat = 61.5
  const dx = sideDeg
  const dy = sideDeg * 0.48
  return {
    type: 'Feature',
    id,
    properties,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [lng, lat],
          [lng + dx, lat],
          [lng + dx, lat + dy],
          [lng, lat + dy],
          [lng, lat]
        ]
      ]
    }
  }
}

describe('extractPerchCandidates', () => {
  it('keeps ponds in the 0,5–50 ha band only', () => {
    const tiny = square(0.001, 'tiny') // ~0,28 ha
    const pond = square(0.004, 'pond') // ~4,5 ha
    const lake = square(0.02, 'lake') // ~113 ha
    const out = extractPerchCandidates({ water: { type: 'FeatureCollection', features: [tiny, pond, lake] } })
    expect(out.map((c) => c.id)).toEqual(['pond'])
    expect(out[0].areaHa).toBeGreaterThan(4)
    expect(out[0].areaHa).toBeLessThan(5)
  })

  it('ignores non-polygon features and missing layers', () => {
    expect(extractPerchCandidates({})).toEqual([])
    const line: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1]
        ]
      }
    }
    expect(extractPerchCandidates({ water: { type: 'FeatureCollection', features: [line] } })).toEqual([])
  })
})

describe('featureId / pickName', () => {
  it('prefers the feature id, then known id properties', () => {
    expect(featureId(square(0.001, '7'))).toBe('7')
    expect(featureId(square(0.001, undefined, { mtk_id: 42 }))).toBe('42')
    expect(featureId(square(0.001, undefined, {}))).toMatch(/[0-9a-f-]{36}/)
  })

  it('takes the first non-empty name field', () => {
    expect(pickName({ nimi: '  ', teksti: 'Kalalampi' })).toBe('Kalalampi')
    expect(pickName(null)).toBeNull()
  })
})

describe('GTK soil class matching', () => {
  it('sums peat classes and sorted deposits, excluding till', () => {
    const f = { 'Saraturve (Ct)': 0.3, 'Hiekkamoreeni (Mr)': 0.5, 'Hiekka (Hk)': 0.2 }
    expect(peatShare(f)).toBeCloseTo(0.3, 10)
    expect(eskerShare(f)).toBeCloseTo(0.2, 10)
  })
})
