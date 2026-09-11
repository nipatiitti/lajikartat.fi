import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CACHE_ROOT } from '../../sources/cache'

// GBIF occurrence API (open, no key). Finnish records are mostly laji.fi /
// FinBIF mirrors. Used ONLY to validate the model (presence vs background),
// never as a scoring input (species/chantarelle.md §M8: absence ≠ absence).
const GBIF = 'https://api.gbif.org/v1'

export interface Occurrence {
  lat: number
  lng: number
  year: number | null
  uncertaintyM: number | null
}

export async function fetchOccurrences(scientificName: string, opts: { country?: string; maxRecords?: number } = {}): Promise<Occurrence[]> {
  const country = opts.country ?? 'FI'
  const slug = scientificName.toLowerCase().replace(/[^a-z]+/g, '-')
  const cachePath = join(CACHE_ROOT, 'raw', 'gbif', `${slug}-${country}.json`)
  try {
    return JSON.parse(await readFile(cachePath, 'utf8')) as Occurrence[]
  } catch {
    // miss
  }

  const match = (await (await fetch(`${GBIF}/species/match?name=${encodeURIComponent(scientificName)}`)).json()) as {
    usageKey?: number
  }
  if (!match.usageKey) throw new Error(`GBIF could not match "${scientificName}"`)

  const out: Occurrence[] = []
  const limit = 300
  const max = opts.maxRecords ?? 20000
  for (let offset = 0; offset < max; offset += limit) {
    const url =
      `${GBIF}/occurrence/search?` +
      new URLSearchParams({
        taxonKey: String(match.usageKey),
        country,
        hasCoordinate: 'true',
        hasGeospatialIssue: 'false',
        limit: String(limit),
        offset: String(offset)
      })
    const res = await fetch(url)
    if (!res.ok) throw new Error(`GBIF search → ${res.status}`)
    const page = (await res.json()) as {
      endOfRecords: boolean
      results: Array<{ decimalLatitude?: number; decimalLongitude?: number; year?: number; coordinateUncertaintyInMeters?: number }>
    }
    for (const r of page.results) {
      if (r.decimalLatitude == null || r.decimalLongitude == null) continue
      out.push({ lat: r.decimalLatitude, lng: r.decimalLongitude, year: r.year ?? null, uncertaintyM: r.coordinateUncertaintyInMeters ?? null })
    }
    if (page.endOfRecords) break
  }

  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(out))
  return out
}
