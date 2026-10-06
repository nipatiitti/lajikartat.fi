// Display-only weather: never part of stored composites (temporal factors stay frontend-only).
export interface DailyWeather {
  /** ISO date, YYYY-MM-DD. */
  date: string
  /** Rain sum for the day, mm — null when not measured. */
  rainMm: number | null
  /** Mean temperature for the day, °C. */
  meanTempC: number | null
  /** 'projection' days are synthesized by the picking model: no rain, persistence temperature. */
  source: 'obs' | 'forecast' | 'projection'
}
