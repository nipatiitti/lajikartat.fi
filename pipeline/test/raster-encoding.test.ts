import { describe, expect, it } from 'vitest'
// MapLibre's own packer: the color-relief layer runs every colour stop through
// it (color_relief_style_layer.ts → getColorRampTextures), so the encoding
// factors must survive a pack → unpack round trip or the ramp collapses.
import { packDEMData } from '../../node_modules/maplibre-gl/src/data/dem_data'
import {
  BYTE_GAIN,
  CUSTOM_DEM_ENCODING,
  byteToElevation,
  decodeComposite,
  encodeComposite,
  thresholdToByte,
  thresholdToElevation
} from '../../src/lib/raster/encoding'

const unpackVector = [
  CUSTOM_DEM_ENCODING.redFactor,
  CUSTOM_DEM_ENCODING.greenFactor,
  CUSTOM_DEM_ENCODING.blueFactor,
  CUSTOM_DEM_ENCODING.baseShift
]
// dem_data.ts DEMData.unpack, also color_relief.fragment.glsl getElevation.
const unpack = (r: number, g: number, b: number) =>
  r * unpackVector[0] + g * unpackVector[1] + b * unpackVector[2] - unpackVector[3]

describe('composite byte encoding', () => {
  it('round-trips composite through the byte', () => {
    for (let i = 0; i <= 100; i++) {
      const c = i / 100
      const b = encodeComposite(c)
      expect(b).toBeGreaterThanOrEqual(1)
      expect(b).toBeLessThanOrEqual(255)
      expect(decodeComposite(b)).toBeCloseTo(c, 2)
    }
    expect(encodeComposite(NaN)).toBe(0)
    expect(Number.isNaN(decodeComposite(0))).toBe(true)
  })
})

describe('MapLibre custom DEM encoding', () => {
  it('uses a base-256 ladder with no zero factor', () => {
    const { redFactor, greenFactor, blueFactor } = CUSTOM_DEM_ENCODING
    expect(greenFactor).toBeGreaterThan(0)
    expect(blueFactor).toBeGreaterThan(0)
    expect(redFactor / greenFactor).toBe(256)
    expect(greenFactor / blueFactor).toBe(256)
    expect(BYTE_GAIN).toBe(redFactor + greenFactor + blueFactor)
  })

  it('decodes a grey tile byte to byteToElevation', () => {
    for (let v = 0; v <= 255; v++) expect(unpack(v, v, v)).toBeCloseTo(byteToElevation(v), 9)
  })

  it('packs every colour stop MapLibre can be given back to the same elevation', () => {
    // Whole bytes, the half-byte step under the slider and the ramp thresholds.
    const bytes: number[] = []
    for (let v = 0; v <= 255; v += 0.5) bytes.push(v)
    for (const t of [0, 0.3, 0.45, 0.55, 0.65, 0.75, 0.8, 1]) bytes.push(thresholdToByte(t), thresholdToByte(t) - 0.5)
    for (const b of bytes) {
      const e = byteToElevation(b)
      const p = packDEMData(e, unpackVector)
      for (const ch of [p.r, p.g, p.b]) {
        expect(Number.isInteger(ch)).toBe(true)
        expect(ch).toBeGreaterThanOrEqual(0)
        expect(ch).toBeLessThanOrEqual(255)
      }
      // packDEMData quantises to the smallest factor (1/256 of an elevation unit).
      expect(Math.abs(unpack(p.r, p.g, p.b) - e)).toBeLessThanOrEqual(CUSTOM_DEM_ENCODING.blueFactor / 2 + 1e-9)
    }
  })

  it('keeps threshold elevations strictly ordered against tile bytes', () => {
    // A cell with byte b must fall below the stop for a threshold whose byte is above b.
    expect(thresholdToElevation(0)).toBeCloseTo(byteToElevation(1), 9)
    expect(thresholdToElevation(1)).toBeCloseTo(byteToElevation(255), 9)
    for (let t = 0; t < 1; t += 0.01) expect(thresholdToElevation(t + 0.01)).toBeGreaterThan(thresholdToElevation(t))
  })
})
