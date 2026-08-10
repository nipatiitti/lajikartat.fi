// Display-only weather conditions — NEVER part of stored composites (design
// rule: temporal factors stay frontend-only).

export interface DailyWeather {
  /** ISO date, YYYY-MM-DD. */
  date: string
  /** Rain sum for the day, mm — null when not measured. */
  rainMm: number | null
  /** Mean temperature for the day, °C. */
  meanTempC: number | null
  source: 'obs' | 'forecast'
}

export interface Conditions {
  /** Rolling rain sum over the past window, mm — null when no station reported. */
  rainSumMm: number | null
  /** Mean daily temperature over the past window, °C. */
  meanTempC: number | null
  /** Past observation days followed by forecast days, ascending by date. */
  days: DailyWeather[]
  from: Date
  to: Date
}

export interface ConditionsProvider {
  /** center = [lng, lat]. Resolves null on any failure — the chip just hides. */
  fetch(center: [number, number]): Promise<Conditions | null>
}

export interface ConditionsSummary {
  label: string
  tone: 'good' | 'ok' | 'poor'
}

/** Qualitative mushroom-weather read of the last two weeks. */
export function conditionsSummary(c: Conditions): ConditionsSummary | null {
  if (c.rainSumMm === null) return null
  if (c.rainSumMm >= 25) return { label: 'Hyvä sienikeli', tone: 'good' }
  if (c.rainSumMm >= 10) return { label: 'Kohtalainen sienikeli', tone: 'ok' }
  return { label: 'Kuivaa, heikko sienikeli', tone: 'poor' }
}
