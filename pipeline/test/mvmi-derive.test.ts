import { DEV_CLASS_CODES, SUBGROUP_CODES } from '@scoring'
import { describe, expect, it } from 'vitest'
import { deriveDevClassCode, subgroupFromPaatyyppi } from '../src/species/chanterelle/mvmi-derive'

const c = (d: (typeof DEV_CLASS_CODES)[number]) => DEV_CLASS_CODES.indexOf(d)

describe('deriveDevClassCode', () => {
  it('calls very low or empty cells open', () => {
    expect(deriveDevClassCode(30, 5, 40)).toBe(c('open'))
    expect(deriveDevClassCode(30, 50, 2)).toBe(c('open'))
    expect(deriveDevClassCode(NaN, NaN, 2)).toBe(c('open'))
  })

  it('does not call a tall stand open on volume alone', () => {
    expect(deriveDevClassCode(80, 150, 2)).toBe(c('mature'))
  })

  it('classifies seedling stands by height, then by age', () => {
    expect(deriveDevClassCode(15, 40, 20)).toBe(c('seedling'))
    expect(deriveDevClassCode(30, 120, 80)).toBe(c('young'))
    expect(deriveDevClassCode(55, 180, 150)).toBe(c('middle'))
    expect(deriveDevClassCode(90, 220, 250)).toBe(c('mature'))
  })

  it('is unknown when age is missing and height is not conclusive', () => {
    expect(deriveDevClassCode(NaN, 150, 100)).toBe(-1)
  })
})

describe('subgroupFromPaatyyppi', () => {
  it('maps the four MVMI main types onto the scoring codes', () => {
    expect(subgroupFromPaatyyppi(1)).toBe(SUBGROUP_CODES.indexOf('kangas'))
    expect(subgroupFromPaatyyppi(4)).toBe(SUBGROUP_CODES.indexOf('openMire'))
    expect(subgroupFromPaatyyppi(0)).toBe(-1)
    expect(subgroupFromPaatyyppi(5)).toBe(-1)
  })
})
