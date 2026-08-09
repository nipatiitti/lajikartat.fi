import type { Conditions, ConditionsProvider } from './types'

// FMI open data, daily observations (validated live 2026-08-09): BsWfs XML,
// CORS `*` → fetched straight from the browser. `latlon` is lat,lng (swap from
// our [lng, lat] tuples); missing values come back as literal "NaN".

const WINDOW_DAYS = 14

const cache = new Map<string, Promise<Conditions | null>>()

export const fmiConditions: ConditionsProvider = {
  fetch(center: [number, number]): Promise<Conditions | null> {
    // Region-level cache key: 0.1° ≈ 10 km — one fetch per area per session.
    const key = `${center[1].toFixed(1)},${center[0].toFixed(1)}`
    let hit = cache.get(key)
    if (!hit) {
      hit = fetchFmi(center).catch(() => null)
      cache.set(key, hit)
    }
    return hit
  }
}

async function fetchFmi([lng, lat]: [number, number]): Promise<Conditions | null> {
  const to = new Date()
  const from = new Date(to.getTime() - WINDOW_DAYS * 24 * 3600 * 1000)
  const url = new URL('https://opendata.fmi.fi/wfs')
  url.search = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::observations::weather::daily::simple',
    latlon: `${lat.toFixed(4)},${lng.toFixed(4)}`,
    parameters: 'rrday,tday',
    starttime: from.toISOString(),
    endtime: to.toISOString()
  }).toString()

  const res = await fetch(url)
  if (!res.ok) return null
  const xml = new DOMParser().parseFromString(await res.text(), 'text/xml')

  const rain: number[] = []
  const temp: number[] = []
  // Match by localName — the document is namespaced (BsWfs:…).
  for (const el of xml.getElementsByTagNameNS('*', 'BsWfsElement')) {
    const name = el.getElementsByTagNameNS('*', 'ParameterName')[0]?.textContent
    const value = Number(el.getElementsByTagNameNS('*', 'ParameterValue')[0]?.textContent)
    if (!Number.isFinite(value)) continue
    if (name === 'rrday')
      rain.push(Math.max(0, value)) // -1 = "no rain" convention
    else if (name === 'tday') temp.push(value)
  }

  if (rain.length === 0 && temp.length === 0) return null
  return {
    rainSumMm: rain.length > 0 ? Math.round(rain.reduce((a, b) => a + b, 0)) : null,
    meanTempC: temp.length > 0 ? Math.round((temp.reduce((a, b) => a + b, 0) / temp.length) * 10) / 10 : null,
    from,
    to
  }
}
