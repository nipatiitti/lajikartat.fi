/**
 * Byte encoding of the suitability raster, shared by the pipeline (writes the
 * tiles) and the map (decodes them through MapLibre's custom raster-dem
 * encoding). One grey byte per cell: 0 = nodata (outside forest / no result),
 * 1..255 = composite 0..1 in 254 steps.
 */
export const RASTER_NODATA = 0
export const RASTER_MAX = 255

export const encodeComposite = (composite: number): number =>
  !(composite >= 0) ? RASTER_NODATA : 1 + Math.min(254, Math.round(composite * 254))

export const decodeComposite = (value: number): number => (value === RASTER_NODATA ? NaN : (value - 1) / 254)

/** Byte a composite threshold maps to (fractional; the tile bytes are integers). */
export const thresholdToByte = (threshold: number): number => 1 + threshold * 254

/**
 * MapLibre raster-dem source options. A grey PNG decodes to r = g = b = v, so
 * the "elevation" MapLibre computes is v × (redFactor + greenFactor + blueFactor).
 *
 * The factors MUST form a base-256 ladder (r = 256·g, g = 256·b) and none may
 * be 0: the color-relief layer packs its colour stops back into RGB with
 * MapLibre's `packDEMData`, which divides by the smallest factor and splits the
 * value by powers of 256. With any other factors (e.g. red 1, green 0, blue 0)
 * every stop packs to 0 and the whole surface paints in the top colour.
 * These are the Terrarium factors without the base shift.
 */
export const CUSTOM_DEM_ENCODING = {
  encoding: 'custom',
  redFactor: 256,
  greenFactor: 1,
  blueFactor: 1 / 256,
  baseShift: 0
} as const

/** Elevation MapLibre decodes for one grey byte. */
export const BYTE_GAIN =
  CUSTOM_DEM_ENCODING.redFactor + CUSTOM_DEM_ENCODING.greenFactor + CUSTOM_DEM_ENCODING.blueFactor

/** `["elevation"]` value of a (possibly fractional) grey byte. */
export const byteToElevation = (byte: number): number => byte * BYTE_GAIN

/** `["elevation"]` value a composite threshold maps to (for colour stops). */
export const thresholdToElevation = (threshold: number): number => byteToElevation(thresholdToByte(threshold))
