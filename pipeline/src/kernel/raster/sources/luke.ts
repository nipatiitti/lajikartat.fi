import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fromFile, fromUrl, type GeoTIFF } from 'geotiff'
import pLimit from 'p-limit'
import { CACHE_ROOT } from '../../sources/cache'
import { MVMI, TWI, mvmiWindow, twiWindow, type Bbox, type PixelWindow } from '../lattice'

// Luke open data (CC BY 4.0), mirrored on Paituli / funet. Whole-Finland
// GeoTIFFs, internally tiled, so windowed reads over HTTP range requests work.
export const MVMI_YEAR = 2023
export const MVMI_URL_BASE = `https://www.nic.funet.fi/index/geodata/luke/vmi/${MVMI_YEAR}/`
export const TWI_URL = 'https://www.nic.funet.fi/index/geodata/luke/twi/TWI_16m_Finland_NA_lakes_int.tif'

export const MVMI_THEMES = [
  'ika',
  'ppa',
  'latvuspeitto',
  'keskipituus',
  'tilavuus',
  'manty',
  'kuusi',
  'koivu',
  'kasvupaikka',
  'paatyyppi',
  'maaluokka'
] as const
export type MvmiTheme = (typeof MVMI_THEMES)[number]

export type LukeProduct = 'mvmi' | 'twi'

/** File stem suffix as published for the 2023 maps (`<theme>_vmi1x_1923.tif`). */
export const MVMI_FILE_SUFFIX = '_vmi1x_1923.tif'
export function mvmiFileName(theme: string): string {
  return `${theme}${MVMI_FILE_SUFFIX}`
}

export interface LukeRasterSource {
  /** Window for a lattice-aligned bbox, row-major, nodata-filled outside the raster extent. */
  readWindow(product: LukeProduct, theme: string, bbox: Bbox): Promise<Uint16Array | Int16Array>
  nodata(product: LukeProduct): readonly number[]
}

export interface LukeSourceOptions {
  /** Directory holding full local copies (`<file name>.tif`); used instead of HTTP when present. */
  localDir?: string
  /** Parallel remote reads (funet has no published limit; keep it polite). */
  concurrency?: number
  /** Disk cache root for windows (default: pipeline/.cache/raster/luke). */
  cacheDir?: string
}

const RETRY_DELAYS_MS = [1000, 3000, 9000]

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export function createLukeSource(opts: LukeSourceOptions = {}): LukeRasterSource {
  const cacheDir = opts.cacheDir ?? join(CACHE_ROOT, 'raster', 'luke')
  const limit = pLimit(opts.concurrency ?? 3)
  const tiffs = new Map<string, Promise<GeoTIFF>>()

  const fileFor = (product: LukeProduct, theme: string) =>
    product === 'twi' ? 'TWI_16m_Finland_NA_lakes_int.tif' : mvmiFileName(theme)
  const urlFor = (product: LukeProduct, theme: string) => (product === 'twi' ? TWI_URL : MVMI_URL_BASE + mvmiFileName(theme))

  async function open(product: LukeProduct, theme: string): Promise<GeoTIFF> {
    const key = `${product}/${theme}`
    let p = tiffs.get(key)
    if (!p) {
      p = (async () => {
        const local = opts.localDir ? join(opts.localDir, fileFor(product, theme)) : null
        if (local && (await exists(local))) return fromFile(local)
        // funet drops bursts of small multi-range requests: one range per request, 512 KB blocks.
        return fromUrl(urlFor(product, theme), { maxRanges: 1, blockSize: 524288, cacheSize: 128 } as Parameters<typeof fromUrl>[1])
      })()
      tiffs.set(key, p)
    }
    return p
  }

  async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      }
    }
    throw new Error(`${what}: ${(lastErr as Error).message}`)
  }

  function nodata(product: LukeProduct): readonly number[] {
    return product === 'twi' ? [TWI.nodata] : [MVMI.nodataOutside, MVMI.nodataCloud]
  }

  async function readWindow(product: LukeProduct, theme: string, bbox: Bbox): Promise<Uint16Array | Int16Array> {
    const win = product === 'twi' ? twiWindow(bbox) : mvmiWindow(bbox)
    const width = win.right - win.left
    const height = win.bottom - win.top
    const themeKey = product === 'twi' ? 'twi' : theme
    const cachePath = join(cacheDir, product, themeKey, `${bbox.join('_')}.bin`)
    const make = () => (product === 'twi' ? new Int16Array(width * height) : new Uint16Array(width * height))

    try {
      const buf = await readFile(cachePath)
      if (buf.byteLength === width * height * 2) {
        const arr = make()
        new Uint8Array(arr.buffer).set(buf)
        return arr
      }
    } catch {
      // cache miss
    }

    const extent = product === 'twi' ? TWI : MVMI
    const fill = product === 'twi' ? TWI.nodata : MVMI.nodataOutside
    const out = make()
    out.fill(fill)

    // Clip to the raster extent; the rest stays nodata.
    const clipped: PixelWindow = {
      left: Math.max(0, win.left),
      top: Math.max(0, win.top),
      right: Math.min(extent.width, win.right),
      bottom: Math.min(extent.height, win.bottom)
    }
    if (clipped.right > clipped.left && clipped.bottom > clipped.top) {
      const tiff = await open(product, theme)
      const image = await tiff.getImage(0)
      const rasters = await limit(() =>
        withRetry(`${product}/${themeKey} window ${bbox.join(',')}`, () =>
          image.readRasters({ window: [clipped.left, clipped.top, clipped.right, clipped.bottom] })
        )
      )
      const band = rasters[0] as ArrayLike<number>
      const cw = clipped.right - clipped.left
      const ch = clipped.bottom - clipped.top
      const dx = clipped.left - win.left
      const dy = clipped.top - win.top
      for (let y = 0; y < ch; y++) {
        const src = y * cw
        const dst = (y + dy) * width + dx
        for (let x = 0; x < cw; x++) out[dst + x] = band[src + x]
      }
    }

    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, new Uint8Array(out.buffer, out.byteOffset, out.byteLength))
    return out
  }

  return { readWindow, nodata }
}
