// Minimal classic-TIFF writer for one uint8 band in EPSG:3067 — just enough for
// GDAL (gdalbuildvrt / gdalwarp) and geotiff.js to read the scored tiles back.

const TAG = {
  ImageWidth: 256,
  ImageLength: 257,
  BitsPerSample: 258,
  Compression: 259,
  Photometric: 262,
  StripOffsets: 273,
  SamplesPerPixel: 277,
  RowsPerStrip: 278,
  StripByteCounts: 279,
  PlanarConfiguration: 284,
  ModelPixelScale: 33550,
  ModelTiepoint: 33922,
  GeoKeyDirectory: 34735,
  GdalNoData: 42113
} as const

const TYPE = { ASCII: 2, SHORT: 3, LONG: 4, DOUBLE: 12 } as const

interface Entry {
  tag: number
  type: number
  count: number
  /** Inline value (≤ 4 bytes) or payload placed after the IFD. */
  value: number | Uint8Array
}

export interface GeoTiffOptions {
  /** EPSG:3067 x of the west edge and y of the north edge. */
  minX: number
  maxY: number
  cellM: number
  nodata?: number
}

/** Encode a uint8 row-major grid as a GeoTIFF (little-endian, uncompressed, one strip). */
export function encodeGeoTiffU8(data: Uint8Array, width: number, height: number, opts: GeoTiffOptions): Uint8Array {
  if (data.length !== width * height) throw new Error('data length does not match width × height')
  const nodata = opts.nodata ?? 0

  const doubles = (vals: number[]) => {
    const b = new Uint8Array(vals.length * 8)
    const dv = new DataView(b.buffer)
    vals.forEach((v, i) => dv.setFloat64(i * 8, v, true))
    return b
  }
  const shorts = (vals: number[]) => {
    const b = new Uint8Array(vals.length * 2)
    const dv = new DataView(b.buffer)
    vals.forEach((v, i) => dv.setUint16(i * 2, v, true))
    return b
  }
  const ascii = (s: string) => new TextEncoder().encode(s + '\0')

  // GeoKeyDirectory: header (version 1, revision 1.0, N keys) then
  // GTModelType = projected, GTRasterType = PixelIsArea, ProjectedCSType = 3067.
  const geoKeys = shorts([1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 3067])
  const nodataAscii = ascii(String(nodata))

  const entries: Entry[] = [
    { tag: TAG.ImageWidth, type: TYPE.LONG, count: 1, value: width },
    { tag: TAG.ImageLength, type: TYPE.LONG, count: 1, value: height },
    { tag: TAG.BitsPerSample, type: TYPE.SHORT, count: 1, value: 8 },
    { tag: TAG.Compression, type: TYPE.SHORT, count: 1, value: 1 },
    { tag: TAG.Photometric, type: TYPE.SHORT, count: 1, value: 1 },
    { tag: TAG.StripOffsets, type: TYPE.LONG, count: 1, value: 0 }, // patched below
    { tag: TAG.SamplesPerPixel, type: TYPE.SHORT, count: 1, value: 1 },
    { tag: TAG.RowsPerStrip, type: TYPE.LONG, count: 1, value: height },
    { tag: TAG.StripByteCounts, type: TYPE.LONG, count: 1, value: data.length },
    { tag: TAG.PlanarConfiguration, type: TYPE.SHORT, count: 1, value: 1 },
    { tag: TAG.ModelPixelScale, type: TYPE.DOUBLE, count: 3, value: doubles([opts.cellM, opts.cellM, 0]) },
    { tag: TAG.ModelTiepoint, type: TYPE.DOUBLE, count: 6, value: doubles([0, 0, 0, opts.minX, opts.maxY, 0]) },
    { tag: TAG.GeoKeyDirectory, type: TYPE.SHORT, count: geoKeys.length / 2, value: geoKeys },
    { tag: TAG.GdalNoData, type: TYPE.ASCII, count: nodataAscii.length, value: nodataAscii }
  ]

  const headerLen = 8
  const ifdLen = 2 + entries.length * 12 + 4
  let payloadLen = 0
  for (const e of entries) if (e.value instanceof Uint8Array && e.value.length > 4) payloadLen += e.value.length + (e.value.length % 2)
  const dataOffset = headerLen + ifdLen + payloadLen
  const total = dataOffset + data.length

  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  out[0] = 0x49
  out[1] = 0x49 // "II" little-endian
  dv.setUint16(2, 42, true)
  dv.setUint32(4, headerLen, true)

  dv.setUint16(headerLen, entries.length, true)
  let p = headerLen + 2
  let payload = headerLen + ifdLen
  for (const e of entries) {
    dv.setUint16(p, e.tag, true)
    dv.setUint16(p + 2, e.type, true)
    dv.setUint32(p + 4, e.count, true)
    if (e.tag === TAG.StripOffsets) dv.setUint32(p + 8, dataOffset, true)
    else if (typeof e.value === 'number') {
      if (e.type === TYPE.SHORT) dv.setUint16(p + 8, e.value, true)
      else dv.setUint32(p + 8, e.value, true)
    } else if (e.value.length <= 4) {
      out.set(e.value, p + 8)
    } else {
      dv.setUint32(p + 8, payload, true)
      out.set(e.value, payload)
      payload += e.value.length + (e.value.length % 2)
    }
    p += 12
  }
  dv.setUint32(p, 0, true) // no next IFD
  out.set(data, dataOffset)
  return out
}
