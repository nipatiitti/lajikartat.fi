import { readCache, writeCache } from '../../sources/cache'

// GBIF occurrence API (open, no key). Finnish records are mostly laji.fi /
// FinBIF mirrors. Used ONLY to validate the model (presence vs background),
// never as a scoring input (species/chanterelle.md §M8: absence ≠ absence).
const GBIF = 'https://api.gbif.org/v1'
const PAGE = 300
const MAX_RECORDS = 20000

export interface Occurrence {
  lat: number
  lng: number
  year: number | null
  uncertaintyM: number | null
}

export async function fetchOccurrences(scientificName: string, country = 'FI'): Promise<Occurrence[]> {
  const slug = scientificName.toLowerCase().replace(/[^a-z]+/g, '-')
  const cacheKey = { source: 'gbif', collection: country, tile: slug }
  const cached = await readCache<Occurrence[]>(cacheKey)
  if (cached) return cached

  const match = (await (await fetch(`${GBIF}/species/match?name=${encodeURIComponent(scientificName)}`)).json()) as {
    usageKey?: number
  }
  if (!match.usageKey) throw new Error(`GBIF could not match "${scientificName}"`)

  const out: Occurrence[] = []
  for (let offset = 0; offset < MAX_RECORDS; offset += PAGE) {
    const url =
      `${GBIF}/occurrence/search?` +
      new URLSearchParams({
        taxonKey: String(match.usageKey),
        country,
        hasCoordinate: 'true',
        hasGeospatialIssue: 'false',
        limit: String(PAGE),
        offset: String(offset)
      })
    const res = await fetch(url)
    if (!res.ok) throw new Error(`GBIF search → ${res.status}`)
    const page = (await res.json()) as {
      endOfRecords: boolean
      results: Array<{
        decimalLatitude?: number
        decimalLongitude?: number
        year?: number
        coordinateUncertaintyInMeters?: number
      }>
    }
    for (const r of page.results) {
      if (r.decimalLatitude == null || r.decimalLongitude == null) continue
      out.push({
        lat: r.decimalLatitude,
        lng: r.decimalLongitude,
        year: r.year ?? null,
        uncertaintyM: r.coordinateUncertaintyInMeters ?? null
      })
    }
    if (page.endOfRecords) break
  }

  await writeCache(cacheKey, out)
  return out
}
