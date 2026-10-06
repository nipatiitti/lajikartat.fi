import { describe, expect, it } from 'vitest'
import { m1Core } from './factors/m1-hosts'
import { m2Core, SUBGROUP_CODES } from './factors/m2-fertility'
import { DEV_CLASS_CODES, m3Core } from './factors/m3-maturity'
import { m4Core } from './factors/m4-light'
import { m5Core } from './factors/m5-moisture'
import { m6Core } from './factors/m6-edges'
import { m7Core } from './factors/m7-soil'
import { m9Core } from './factors/m9-remoteness'
import { vetoCore } from './factors/veto'

const code = (d: (typeof DEV_CLASS_CODES)[number]) => DEV_CLASS_CODES.indexOf(d)
const sub = (s: (typeof SUBGROUP_CODES)[number]) => SUBGROUP_CODES.indexOf(s)

describe('M1 — host trees & mix', () => {
  it('[K] rewards a mixed stand over a monoculture, without vetoing it', () => {
    const mixed = m1Core(0.4, 0.35, 0.25, 'kantarelli')
    const mono = m1Core(0.95, 0.03, 0.02, 'kantarelli')
    expect(mixed).toBeGreaterThan(mono)
    expect(mono).toBeGreaterThan(0.25)
  })

  it('[S] tracks spruce share and collapses in pure deciduous', () => {
    expect(m1Core(0.1, 0.7, 0.2, 'suppilovahvero')).toBeGreaterThan(0.9)
    expect(m1Core(0.02, 0.03, 0.95, 'suppilovahvero')).toBeLessThanOrEqual(0.1)
  })
})

describe('M2 — site fertility', () => {
  it('peaks at tuore kangas and drops out for unknown classes', () => {
    expect(m2Core(3, sub('kangas'), 'kantarelli')).toBe(1)
    expect(m2Core(3, sub('kangas'), 'kantarelli')).toBeGreaterThan(m2Core(5, sub('kangas'), 'kantarelli'))
    expect(m2Core(-1, sub('kangas'), 'kantarelli')).toBe(-1)
    expect(m2Core(9, sub('kangas'), 'kantarelli')).toBe(-1)
  })

  it('penalises peat subgroups, korpi least for [S]', () => {
    const k = m2Core(3, sub('korpi'), 'kantarelli')
    const s = m2Core(3, sub('korpi'), 'suppilovahvero')
    expect(s).toBeGreaterThan(k)
    expect(m2Core(3, sub('openMire'), 'suppilovahvero')).toBeLessThan(0.1)
  })
})

describe('M3 — maturity', () => {
  it('averages class and age, and drops out when both are unknown', () => {
    expect(m3Core(code('mature'), 80)).toBe(1)
    expect(m3Core(code('young'), 30)).toBeLessThan(m3Core(code('middle'), 60))
    expect(m3Core(-1, 50)).toBeCloseTo(0.5, 10)
    expect(m3Core(-1, NaN)).toBe(-1)
  })
})

describe('M4 — canopy/light is species-flipped and unimodal', () => {
  it('dense canopy favours [S], semi-open favours [K]', () => {
    expect(m4Core(30, -1, 'suppilovahvero')).toBeGreaterThan(m4Core(30, -1, 'kantarelli'))
    expect(m4Core(18, -1, 'kantarelli')).toBeGreaterThan(m4Core(30, -1, 'kantarelli'))
  })

  it('peaks at ~25 m²/ha for [S] and falls in the densest stands (Tahvanainen 2016)', () => {
    const s = (ba: number) => m4Core(ba, -1, 'suppilovahvero')
    expect(s(25)).toBeGreaterThan(s(15))
    expect(s(25)).toBeGreaterThan(s(40))
    expect(s(40)).toBeGreaterThan(0.1)
  })

  it('uses canopy cover when present and averages it with basal area', () => {
    expect(m4Core(-1, 60, 'kantarelli')).toBeCloseTo(1, 5)
    expect(m4Core(20, 60, 'kantarelli')).toBeCloseTo(1, 5)
    expect(m4Core(20, 95, 'kantarelli')).toBeLessThan(0.8)
    expect(m4Core(-1, 85, 'suppilovahvero')).toBeCloseTo(1, 5)
    expect(m4Core(NaN, NaN, 'kantarelli')).toBe(-1)
  })
})

describe('M5 — moisture from TWI', () => {
  it('rises into wet hollows for [S] and peaks at moderate wetness for [K]', () => {
    const s = (twi: number) => m5Core(twi, 'suppilovahvero')
    const k = (twi: number) => m5Core(twi, 'kantarelli')
    expect(s(9.8)).toBeGreaterThan(s(6.5))
    expect(s(6.5)).toBeGreaterThan(s(5.3))
    expect(k(6.5)).toBeCloseTo(1, 5) // the p50 anchor
    expect(k(6.5)).toBeGreaterThan(k(12))
    expect(k(6.5)).toBeGreaterThan(k(2))
    expect(k(20)).toBeCloseTo(0.25, 5) // floored, not vetoed
  })

  it('drops out when TWI is unknown', () => {
    expect(m5Core(NaN, 'kantarelli')).toBe(-1)
  })
})

describe('M6 — edge & disturbance proximity', () => {
  it('scores a cell hugging a forest track high', () => {
    expect(m6Core(30, 250, -1, false, 'kantarelli')).toBeGreaterThan(0.9)
  })

  it('floors the deep interior instead of zeroing it', () => {
    expect(m6Core(900, 900, -1, false, 'kantarelli')).toBeCloseTo(0.05, 5)
  })

  it('counts a stand boundary as a weaker edge than a track', () => {
    const interior = m6Core(900, 900, 900, false, 'kantarelli')
    const edge = m6Core(900, 900, 10, false, 'kantarelli')
    expect(edge).toBeGreaterThan(interior + 0.3)
    expect(edge).toBeLessThan(m6Core(30, 250, -1, false, 'kantarelli'))
  })

  it('weights ditches above tracks for [S] and treats drained peat as a ditch signal', () => {
    expect(m6Core(900, 20, -1, false, 'suppilovahvero')).toBeGreaterThan(m6Core(900, 20, -1, false, 'kantarelli'))
    expect(m6Core(-1, -1, -1, true, 'suppilovahvero')).toBeGreaterThan(0.5)
    expect(m6Core(-1, -1, -1, false, 'suppilovahvero')).toBe(-1)
  })
})

describe('M7 — soil', () => {
  it('penalises peat, tolerates a little rock for [K], drops out when unknown', () => {
    expect(m7Core(0, 0, 'kantarelli')).toBe(1)
    expect(m7Core(1, 0, 'kantarelli')).toBeLessThan(m7Core(1, 0, 'suppilovahvero'))
    expect(m7Core(0, 0.3, 'kantarelli')).toBe(1)
    expect(m7Core(0, 0.3, 'suppilovahvero')).toBeLessThan(1)
    expect(m7Core(-1, 0.5, 'kantarelli')).toBeLessThan(1)
    expect(m7Core(NaN, NaN, 'kantarelli')).toBe(-1)
  })
})

describe('M9 — remoteness modulator', () => {
  it('takes the min of road distance and settlement signals', () => {
    expect(m9Core(2000, 0)).toBe(1)
    expect(m9Core(100, 0)).toBeLessThan(0.7)
    expect(m9Core(2000, 4)).toBeCloseTo(0.5, 10)
    expect(m9Core(-1, -1)).toBe(-1)
  })
})

describe('V — vetoes', () => {
  it('fires on open / seedling stands and open mire only', () => {
    expect(vetoCore(code('open'), sub('kangas'))).toBe(0)
    expect(vetoCore(code('seedling'), -1)).toBe(0)
    expect(vetoCore(code('mature'), sub('openMire'))).toBe(0)
    expect(vetoCore(code('mature'), sub('kangas'))).toBe(1)
    expect(vetoCore(-1, sub('rame'))).toBe(1)
    expect(vetoCore(-1, -1)).toBe(-1)
  })
})
