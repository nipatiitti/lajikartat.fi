import { DEV_CLASS_CODES } from '@scoring'
import { describe, expect, it } from 'vitest'
import { MVMI, TWI } from '../src/kernel/raster/lattice'
import type { RasterContext, RasterTileRef } from '../src/kernel/types'
import { buildGridInputs } from '../src/species/chanterelle/raster-inputs'

// A 2×2 tile: cell 0 mature mixed forest on mineral soil, cell 1 drained peat
// spruce, cell 2 non-forest (lake), cell 3 forest with overshooting species volumes.
const tile: RasterTileRef = {
  ix: 0,
  iy: 0,
  bbox3067: [0, 0, 32, 32],
  width: 2,
  height: 2,
  vectorRef: { ix: 0, iy: 0, bbox: [0, 0, 32, 32] }
}
const u16 = (v: number[]) => Uint16Array.from(v)
const bands: Record<string, Uint16Array | Int16Array> = {
  ika: u16([85, 60, MVMI.nodataOutside, 40]),
  ppa: u16([18, 25, MVMI.nodataOutside, MVMI.nodataCloud]),
  latvuspeitto: u16([60, 80, MVMI.nodataOutside, 50]),
  keskipituus: u16([200, 180, MVMI.nodataOutside, 150]),
  tilavuus: u16([200, 150, MVMI.nodataOutside, 100]),
  manty: u16([80, 10, MVMI.nodataOutside, 80]),
  kuusi: u16([70, 130, MVMI.nodataOutside, 60]),
  koivu: u16([50, 10, MVMI.nodataOutside, 0]),
  kasvupaikka: u16([3, 3, MVMI.nodataOutside, 7]),
  paatyyppi: u16([1, 2, MVMI.nodataOutside, 1]),
  maaluokka: u16([1, 1, 2, 1]),
  twi: Int16Array.from([6500, 9800, TWI.nodata, TWI.nodata])
}

function context(overrides: Partial<RasterContext> = {}): RasterContext {
  return {
    tile,
    band: (key) => bands[key] ?? null,
    hasLayer: () => true,
    distanceTo: (key) =>
      key === 'ditches' ? Float32Array.from([500, 30, 30, 900]) : Float32Array.from([50, 60, 70, 80]),
    countWithin: () => Uint16Array.from([0, 2, 0, 0]),
    classCode: () => null,
    standEdgeDistance: () => Float32Array.from([10, 20, 30, 40]),
    ...overrides
  }
}

describe('buildGridInputs', () => {
  const g = buildGridInputs(context())

  it('marks only forest land valid', () => {
    expect(Array.from(g.valid)).toEqual([1, 1, 0, 1])
  })

  it('turns species volumes into a share partition, even when they overshoot the total', () => {
    expect(g.pineShare[0]).toBeCloseTo(0.4, 5)
    expect(g.spruceShare[0]).toBeCloseTo(0.35, 5)
    expect(g.otherShare[0]).toBeCloseTo(0.25, 5)
    // 80 + 60 > 100: normalised by the species sum, other = 0, not negative.
    expect(g.pineShare[3] + g.spruceShare[3]).toBeCloseTo(1, 5)
    expect(g.otherShare[3]).toBeCloseTo(0, 6)
  })

  it('derives class codes, scales TWI and treats cloud cells as unknown', () => {
    expect(g.devClassCode[0]).toBe(DEV_CLASS_CODES.indexOf('mature'))
    expect(g.subgroupCode[1]).toBe(1) // korpi
    expect(g.twi[0]).toBeCloseTo(6.5, 5)
    expect(Number.isNaN(g.twi[3])).toBe(true)
    expect(Number.isNaN(g.basalArea[3])).toBe(true)
  })

  it('marks peatland next to a ditch as drained and falls back to MVMI site type for soil', () => {
    expect(Array.from(g.drained)).toEqual([0, 1, 0, 0])
    expect(g.peatFraction[0]).toBe(0)
    expect(g.peatFraction[1]).toBe(1)
    expect(g.rockFraction[3]).toBe(1) // kasvupaikka 7 on mineral ground
  })

  it('prefers GTK soil classes where present', () => {
    const gtk = buildGridInputs(
      context({
        classCode: () => ({
          codes: Uint8Array.from([1, 2, 0, 0]),
          classes: ['', 'Kalliopaljastuma (KaPa)', 'Saraturve (Ct)']
        })
      })
    )
    expect(gtk.rockFraction[0]).toBe(1)
    expect(gtk.peatFraction[0]).toBe(0)
    expect(gtk.peatFraction[1]).toBe(1)
    expect(gtk.rockFraction[3]).toBe(1) // no GTK code → MVMI fallback
  })

  it('throws when a required band is missing', () => {
    expect(() => buildGridInputs(context({ band: (key) => (key === 'ika' ? null : bands[key]) }))).toThrow(/ika/)
  })
})
