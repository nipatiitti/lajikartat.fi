import { describe, expect, it } from 'vitest'
import { candidateSql, datasetSql, str } from '../src/kernel/load'

describe('SQL emission', () => {
  it('escapes quotes and nulls', () => {
    expect(str("O'Malley")).toBe("'O''Malley'")
    expect(str(null)).toBe('NULL')
  })

  it('replaces every candidate row of the species', () => {
    const sql = candidateSql('ahven', [
      {
        candidate: {
          id: '1',
          name: "Iso'lampi",
          areaHa: 3.2,
          geometry: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [23.5, 61.5] } }
        },
        score: {
          composite: 0.8,
          confidence: 'med',
          why: { factors: [], topPositives: ["it's"], topNegatives: [], notes: [] }
        }
      }
    ])
    expect(sql[0]).toBe("DELETE FROM candidate WHERE species = 'ahven';")
    expect(sql[1]).toContain(
      "'ahven:1', 'ahven', 'Iso''lampi', 3.2, 0.8, 'med', '{\"factors\":[],\"topPositives\":[\"it''s\"]"
    )
  })

  it('writes one dataset row with optional meta', () => {
    const row = datasetSql({
      species: 'kantarelli',
      kind: 'raster',
      version: '20260911-0705',
      r2Key: 'tiles/kantarelli/20260911-0705/raster.pmtiles',
      meta: { bounds: [1, 2, 3, 4] }
    })
    expect(row).toMatch(
      /^INSERT OR REPLACE INTO species_dataset \(species, kind, version, r2_key, published_at, meta\)/
    )
    expect(row).toContain("'raster', '20260911-0705'")
    expect(row).toContain('\'{"bounds":[1,2,3,4]}\'')
    expect(datasetSql({ species: 'ahven', kind: 'feature', version: 'v', r2Key: 'k' })).toMatch(/, NULL\);\n$/)
  })
})
