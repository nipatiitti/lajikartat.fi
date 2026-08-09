// Display-only weather conditions — NEVER part of stored composites (design
// rule: temporal factors stay frontend-only).

export interface Conditions {
  /** Rolling rain sum over the window, mm — null when no station reported. */
  rainSumMm: number | null
  /** Mean daily temperature over the window, °C. */
  meanTempC: number | null
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
  return { label: 'Kuivaa — heikko sienikeli', tone: 'poor' }
}
