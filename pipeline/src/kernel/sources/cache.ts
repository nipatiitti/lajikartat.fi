import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CACHE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../.cache')

export interface CacheKey {
  source: string
  collection: string
  tile: string
}

function pathFor(key: CacheKey): string {
  const hash = createHash('sha1').update(key.tile).digest('hex').slice(0, 16)
  return join(CACHE_ROOT, 'raw', key.source, key.collection, `${hash}.json`)
}

/** Raw responses are cached verbatim so transform never re-hits the network. */
export async function readCache<T>(key: CacheKey): Promise<T | null> {
  try {
    return JSON.parse(await readFile(pathFor(key), 'utf8')) as T
  } catch {
    return null
  }
}

export async function writeCache(key: CacheKey, value: unknown): Promise<void> {
  const p = pathFor(key)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(value))
}
