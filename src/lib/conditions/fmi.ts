import type { Conditions, ConditionsProvider, DailyWeather } from './types'

// FMI open data (validated live 2026-08-10): BsWfs XML, CORS `*` → fetched
// straight from the browser.
//
// Observations: the daily stored query does NOT support `latlon` (it is
// silently ignored and zero features match), so we query a bbox around the
// point. `maxlocations` is ignored for bbox too: several stations come back,
// and some report only temperature (rain values are a literal "NaN"), so
// elements are grouped per station and the nearest station with rain data
// wins.
//
// Forecast: the meteorologist-edited point forecast DOES support `latlon` and
// returns hourly Precipitation1h + Temperature ~10 days out; we aggregate it
// to daily values client-side.

// 35 days of history: the suppilovahvero flush kernel reaches back 35 days,
// so a shorter window is blind to the rain events that matter most in autumn.
// The chip's headline sum stays a 14-day read.
const HISTORY_DAYS = 35
const SUMMARY_DAYS = 14
const FORECAST_DAYS = 8
const BOX_HALF_DEG = 0.4

const cache = new Map<string, Promise<Conditions | null>>()

export const fmiConditions: ConditionsProvider = {
  fetch(center: [number, number]): Promise<Conditions | null> {
    // Region-level cache key: 0.1° ≈ 10 km — one fetch per area per session.
    const key = `${center[1].toFixed(1)},${center[0].toFixed(1)}`
    let hit = cache.get(key)
    if (!hit) {
      hit = fetchConditions(center).catch(() => null)
      cache.set(key, hit)
    }
    return hit
  }
}

async function fetchConditions(center: [number, number]): Promise<Conditions | null> {
  // The forecast is an enhancement: its failure never hides the chip.
  const [obs, forecast] = await Promise.all([
    fetchObservations(center),
    fetchForecast(center).catch(() => [] as DailyWeather[])
  ])
  if (!obs) return null

  // Observation days end yesterday; forecast fills today onward.
  const lastObsDate = obs.days.at(-1)?.date ?? ''
  return { ...obs, days: [...obs.days, ...forecast.filter((d) => d.date > lastObsDate)] }
}

interface BsWfsValue {
  pos: string
  time: string
  name: string
  value: number
}

/** Flatten a BsWfs document to finite-valued entries (missing values are "NaN"). */
function parseBsWfs(xmlText: string): BsWfsValue[] {
  const xml = new DOMParser().parseFromString(xmlText, 'text/xml')
  const out: BsWfsValue[] = []
  // Match by localName — the document is namespaced (BsWfs:…).
  for (const el of xml.getElementsByTagNameNS('*', 'BsWfsElement')) {
    const pos = el.getElementsByTagNameNS('*', 'pos')[0]?.textContent?.trim()
    const time = el.getElementsByTagNameNS('*', 'Time')[0]?.textContent
    const name = el.getElementsByTagNameNS('*', 'ParameterName')[0]?.textContent
    const value = Number(el.getElementsByTagNameNS('*', 'ParameterValue')[0]?.textContent)
    if (!pos || !time || !name || !Number.isFinite(value)) continue
    out.push({ pos, time, name, value })
  }
  return out
}

const wfsUrl = (params: Record<string, string>): URL => {
  const url = new URL('https://opendata.fmi.fi/wfs')
  url.search = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'getFeature', ...params }).toString()
  return url
}

async function fetchObservations([lng, lat]: [number, number]): Promise<Conditions | null> {
  const to = new Date()
  const from = new Date(to.getTime() - HISTORY_DAYS * 24 * 3600 * 1000)
  const url = wfsUrl({
    storedquery_id: 'fmi::observations::weather::daily::simple',
    bbox: [lng - BOX_HALF_DEG, lat - BOX_HALF_DEG, lng + BOX_HALF_DEG, lat + BOX_HALF_DEG]
      .map((v) => v.toFixed(2))
      .join(','),
    parameters: 'rrday,tday',
    starttime: from.toISOString(),
    endtime: to.toISOString()
  })

  const res = await fetch(url)
  if (!res.ok) return null

  interface Station {
    byDate: Map<string, { rainMm: number | null; meanTempC: number | null }>
    rainDays: number
    dist2: number
  }
  const stations = new Map<string, Station>()

  for (const { pos, time, name, value } of parseBsWfs(await res.text())) {
    let station = stations.get(pos)
    if (!station) {
      const [stationLat, stationLng] = pos.split(/\s+/).map(Number)
      // Rough planar distance; a longitude degree is ~half a latitude degree
      // at Finnish latitudes.
      const dLat = stationLat - lat
      const dLng = (stationLng - lng) * 0.5
      station = { byDate: new Map(), rainDays: 0, dist2: dLat * dLat + dLng * dLng }
      stations.set(pos, station)
    }
    const date = time.slice(0, 10)
    const day = station.byDate.get(date) ?? { rainMm: null, meanTempC: null }
    if (name === 'rrday') {
      day.rainMm = Math.max(0, value) // -1 = "no rain" convention
      station.rainDays++
    } else if (name === 'tday') day.meanTempC = value
    station.byDate.set(date, day)
  }

  // Nearest station that measures rain; a temperature-only station is the
  // fallback (the chip then shows temperature alone).
  const best = [...stations.values()].sort(
    (a, b) => Number(b.rainDays > 0) - Number(a.rainDays > 0) || a.dist2 - b.dist2
  )[0]
  if (!best) return null

  const days: DailyWeather[] = [...best.byDate.entries()]
    .map(([date, d]) => ({ date, rainMm: d.rainMm, meanTempC: d.meanTempC, source: 'obs' as const }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const summaryDays = days.slice(-SUMMARY_DAYS)
  const rain = summaryDays.filter((d) => d.rainMm !== null).map((d) => d.rainMm as number)
  const temp = summaryDays.filter((d) => d.meanTempC !== null).map((d) => d.meanTempC as number)
  if (rain.length === 0 && temp.length === 0) return null

  return {
    rainSumMm: rain.length > 0 ? Math.round(rain.reduce((a, b) => a + b, 0)) : null,
    meanTempC: temp.length > 0 ? Math.round((temp.reduce((a, b) => a + b, 0) / temp.length) * 10) / 10 : null,
    days,
    from,
    to
  }
}

async function fetchForecast([lng, lat]: [number, number]): Promise<DailyWeather[]> {
  const url = wfsUrl({
    storedquery_id: 'fmi::forecast::edited::weather::scandinavia::point::simple',
    latlon: `${lat.toFixed(4)},${lng.toFixed(4)}`,
    parameters: 'Precipitation1h,Temperature',
    endtime: new Date(Date.now() + FORECAST_DAYS * 24 * 3600 * 1000).toISOString()
  })

  const res = await fetch(url)
  if (!res.ok) return []

  const byDate = new Map<string, { rain: number; temps: number[] }>()
  for (const { time, name, value } of parseBsWfs(await res.text())) {
    const date = time.slice(0, 10)
    const day = byDate.get(date) ?? { rain: 0, temps: [] }
    if (name === 'Precipitation1h') day.rain += Math.max(0, value)
    else if (name === 'Temperature') day.temps.push(value)
    byDate.set(date, day)
  }

  return [...byDate.entries()]
    .map(([date, d]) => ({
      date,
      rainMm: Math.round(d.rain * 10) / 10,
      meanTempC: d.temps.length > 0 ? Math.round((d.temps.reduce((a, b) => a + b, 0) / d.temps.length) * 10) / 10 : null,
      source: 'forecast' as const
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}
