import { fromArrayBuffer } from 'geotiff'
import { describe, expect, it } from 'vitest'
import { encodeGeoTiffU8 } from '../src/kernel/raster/geotiff-write'

describe('encodeGeoTiffU8', () => {
  it('round-trips through geotiff.js with georeferencing and nodata', async () => {
    const w = 5
    const h = 3
    const data = new Uint8Array(w * h)
    for (let i = 0; i < data.length; i++) data[i] = (i * 17) % 256
    const bytes = encodeGeoTiffU8(data, w, h, { minX: 320000, maxY: 6819008, cellM: 16, nodata: 0 })
    const tiff = await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    const image = await tiff.getImage(0)
    expect(image.getWidth()).toBe(w)
    expect(image.getHeight()).toBe(h)
    expect(image.getGDALNoData()).toBe(0)
    expect(image.getOrigin()).toEqual([320000, 6819008, 0])
    expect(image.getResolution()).toEqual([16, -16, 0])
    expect(image.getGeoKeys().ProjectedCSTypeGeoKey).toBe(3067)
    const [band] = (await image.readRasters()) as unknown as [Uint8Array]
    expect(Array.from(band)).toEqual(Array.from(data))
  })
})
