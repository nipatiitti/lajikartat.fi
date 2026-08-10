import type { DailyWeather } from './types'

// Picking-date outlook: rain-triggered flush kernels gated by temperature,
// drought, season and frost. Display-only, never part of stored composites.
//
// Model spec researched 2026-08-10 (boreal chanterelle phenology literature +
// Nordic foraging practice; see docs in the session report). Key evidence:
// chanterelle productivity tracks rainfall of the preceding 1-3 weeks
// (Pinna et al. 2010, Krebs et al. 2008), fruiting appears ~6-8 days after a
// soaking rain and peaks around 11-14 days (forager consensus), suppilovahvero
// runs later, colder and survives frost. The mm thresholds and the
// suppilovahvero kernel are calibrated assumptions, not literature values.

export type PickingSpecies = 'kantarelli' | 'suppilovahvero'

export type PickingTag =
  | 'out-of-season'
  | 'season-edge'
  | 'season-over-frost'
  | 'frozen-ground'
  | 'too-dry'
  | 'too-hot'
  | 'too-cold'
  | 'waiting-for-flush'
  | 'flush-rising'
  | 'flush-peak'
  | 'flush-fading'
  | 'no-recent-rain'
  | 'steady-fair'

export interface PickingDay {
  date: string
  /** 0..1 pickability. */
  score: number
  tag: PickingTag
  /** Days until the next flush peak, when one is on its way. */
  peakInDays?: number
  /** Forecast trust, 1 today decaying with distance. */
  confidence: number
}

/** Piecewise-linear curve: [x, y] breakpoints, clamped at both ends. */
type Curve = [number, number][]
const curve = (x: number, p: Curve): number => {
  if (x <= p[0][0]) return p[0][1]
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]
    const [x1, y1] = p[i]
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1)
  }
  return p[p.length - 1][1]
}

const dayOfYear = (iso: string): number => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return Math.floor((+d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1
}

interface SpeciesParams {
  /** Flush kernel over days since the triggering rain ended. */
  flush: Curve
  /** Gate on the 14-day mean temperature. */
  temp: Curve
  /** Gate on the day of year (southern Finland). */
  season: Curve
  /** Daily mean at or below this reads as a night frost. */
  frostSoft: number
  /** Daily mean at or below this is a hard frost. */
  frostHard: number
  softMul: number
  hardMul: number
  /** Hard frost permanently ends the season (kantarelli). */
  latch: boolean
}

const PARAMS: Record<PickingSpecies, SpeciesParams> = {
  kantarelli: {
    flush: [
      [6, 0],
      [11, 1],
      [17, 1],
      [26, 0]
    ],
    temp: [
      [5, 0],
      [10, 1],
      [18, 1],
      [26, 0.15],
      [45, 0.15]
    ],
    season: [
      [166, 0],
      [186, 0.6],
      [213, 1],
      [244, 1],
      [263, 0.8],
      [288, 0.15],
      [305, 0.05],
      [366, 0]
    ],
    frostSoft: 0,
    frostHard: -3,
    softMul: 0.5,
    hardMul: 0.05,
    latch: true
  },
  suppilovahvero: {
    flush: [
      [8, 0],
      [14, 1],
      [24, 1],
      [35, 0]
    ],
    temp: [
      [-3, 0],
      [4, 1],
      [14, 1],
      [22, 0.2],
      [45, 0.2]
    ],
    season: [
      [196, 0.05],
      [213, 0.2],
      [244, 0.6],
      [258, 0.85],
      [274, 1],
      [319, 1],
      [349, 0.3],
      [366, 0.1]
    ],
    frostSoft: -5,
    frostHard: -99,
    softMul: 0.6,
    hardMul: 0.15,
    latch: false
  }
}

// Rain-event trigger: a soaking event, not a shower. Dry antecedent soil needs
// recharging first. Thresholds are assumption A1 of the spec.
const RAIN_EVENT_MIN_MM = 15
const RAIN_EVENT_MIN_DRY_SOIL_MM = 25
const RAIN_EVENT_SAT_MM = 40
const WET_DAY_MM = 0.5
const BASELINE = 0.15
const DROUGHT: Curve = [
  [10, 0.15],
  [30, 1],
  [9999, 1]
]
/** Rough monthly evapotranspiration divisor for the 21-day rain sum. */
const etFactor = (month: number): number =>
  month <= 4 ? 0.6 : month === 5 ? 0.8 : month <= 8 ? 1 : month === 9 ? 0.7 : 0.5

const rainOf = (d: DailyWeather): number => d.rainMm ?? 0

interface RainEvent {
  /** Index of the event's last wet day (the clock starts when soil is wet). */
  endIdx: number
  /** 0..1 by event size. */
  amplitude: number
}

/**
 * Maximal wet runs (one dry bridge day allowed), thresholded to events by
 * their best 3-day sum. The intensity window matters: weeks of steady drizzle
 * would otherwise accumulate into a fake "soaking event", while a real front
 * drops its rain inside a few days. The event anchors where the soaking window
 * ends, since that is when the flush clock starts.
 */
function findRainEvents(days: DailyWeather[]): RainEvent[] {
  const events: RainEvent[] = []
  let i = 0
  while (i < days.length) {
    if (rainOf(days[i]) < WET_DAY_MM) {
      i++
      continue
    }
    let j = i
    while (j < days.length) {
      if (rainOf(days[j]) >= WET_DAY_MM) j++
      else if (j + 1 < days.length && rainOf(days[j + 1]) >= WET_DAY_MM) j++
      else break
    }
    let best = 0
    let bestEnd = i
    for (let k = i; k < j; k++) {
      let window = 0
      for (let w = Math.max(i, k - 2); w <= k; w++) window += rainOf(days[w])
      if (window > best) {
        best = window
        bestEnd = k
      }
    }
    let antecedent = 0
    for (let k = Math.max(0, i - 14); k < i; k++) antecedent += rainOf(days[k])
    const min = antecedent < 20 ? RAIN_EVENT_MIN_DRY_SOIL_MM : RAIN_EVENT_MIN_MM
    if (best >= min) events.push({ endIdx: bestEnd, amplitude: Math.min(1, best / RAIN_EVENT_SAT_MM) })
    i = j
  }
  return events
}

/**
 * Pickability outlook from `todayIdx` (first forecast day) over the horizon.
 * `days` is the merged obs + forecast series, ascending. Returns null for
 * species without a model.
 */
export function pickingOutlook(days: DailyWeather[], species: string, horizonDays = 8): PickingDay[] | null {
  if (species !== 'kantarelli' && species !== 'suppilovahvero') return null
  const p = PARAMS[species]
  const todayIdx = days.findIndex((d) => d.source === 'forecast')
  if (todayIdx < 0 || days.length === 0) return null

  const events = findRainEvents(days)
  const peakLag = p.flush[1][0]
  const out: PickingDay[] = []

  // A hard frost in the recent past latches kantarelli's season shut even
  // before the outlook window starts.
  let latched = false
  for (let i = Math.max(0, todayIdx - 30); i < todayIdx; i++) {
    const t = days[i].meanTempC
    if (t !== null && t <= p.frostHard) latched = true
  }

  for (let n = todayIdx; n <= Math.min(days.length - 1, todayIdx + horizonDays); n++) {
    // Flush drive: saturating superposition of all triggering rain events.
    let drive = 0
    let age = -1
    let nextPeak = Infinity
    for (const e of events) {
      const f = curve(n - e.endIdx, p.flush) * e.amplitude
      if (f > 0) {
        drive = 1 - (1 - drive) * (1 - f)
        if (n - e.endIdx > age) age = n - e.endIdx
      }
      const untilPeak = e.endIdx + peakLag - n
      if (untilPeak > 0 && untilPeak < nextPeak) nextPeak = untilPeak
    }

    // Trailing means/sums skip unmeasured days.
    let tempSum = 0
    let tempN = 0
    for (let i = Math.max(0, n - 13); i <= n; i++) {
      const t = days[i].meanTempC
      if (t !== null) {
        tempSum += t
        tempN++
      }
    }
    const t14 = tempN > 0 ? tempSum / tempN : 10
    let p21 = 0
    for (let i = Math.max(0, n - 20); i <= n; i++) p21 += rainOf(days[i])

    const month = Number(days[n].date.slice(5, 7))
    const gTemp = curve(t14, p.temp)
    const gDrought = curve(p21 / etFactor(month), DROUGHT)
    const gSeason = curve(dayOfYear(days[n].date), p.season)

    let gFrost = 1
    for (let i = Math.max(0, n - 3); i <= n; i++) {
      const t = days[i].meanTempC
      if (t === null) continue
      if (t <= p.frostHard) latched = true
      else if (t <= p.frostSoft) gFrost = Math.min(gFrost, p.softMul)
    }
    if (latched) gFrost = Math.min(gFrost, p.hardMul)

    const score = Math.max(0, Math.min(1, Math.max(drive, BASELINE) * gTemp * gDrought * gSeason * gFrost))

    let tag: PickingTag = 'steady-fair'
    let peakInDays: number | undefined
    if (gSeason < 0.15) tag = 'out-of-season'
    else if (p.latch && latched) tag = 'season-over-frost'
    else if (!p.latch && gFrost <= p.hardMul) tag = 'frozen-ground'
    else if (gDrought < 0.4) tag = 'too-dry'
    else if (gTemp < 0.5 && t14 > 15) tag = 'too-hot'
    else if (gTemp < 0.5) tag = 'too-cold'
    else if (gSeason < 0.5) tag = 'season-edge'
    else if (drive >= 0.55 && age >= peakLag && age <= p.flush[2][0]) tag = 'flush-peak'
    else if (drive >= 0.3 && age >= 0 && age < peakLag) {
      tag = 'flush-rising'
      peakInDays = peakLag - age
    } else if (drive >= 0.25 && age > p.flush[2][0]) tag = 'flush-fading'
    else if (nextPeak <= 10) {
      tag = 'waiting-for-flush'
      peakInDays = nextPeak
    } else if (drive < 0.15) tag = 'no-recent-rain'

    out.push({
      date: days[n].date,
      score: Math.round(score * 1000) / 1000,
      tag,
      peakInDays,
      confidence: Math.max(0.4, 1 - 0.06 * (n - todayIdx))
    })
  }
  return out
}

/** Finnish labels for the outlook tags (drafts, owner reviews all Finnish). */
export const PICKING_TAG_LABELS: Record<PickingTag, string> = {
  'out-of-season': 'ei sesonkia',
  'season-edge': 'sesongin reunalla',
  'season-over-frost': 'pakkaset päättivät kauden',
  'frozen-ground': 'maa jäässä',
  'too-dry': 'liian kuivaa',
  'too-hot': 'liian lämmintä',
  'too-cold': 'liian kylmää',
  'waiting-for-flush': 'sato tuloillaan',
  'flush-rising': 'sato nousussa',
  'flush-peak': 'sato huipussaan',
  'flush-fading': 'sato hiipuu',
  'no-recent-rain': 'ei tuoreita sateita',
  'steady-fair': 'kohtalainen näkymä'
}

/** Short pill labels (drafts, owner reviews all Finnish). */
export const PICKING_TAG_SHORT: Record<PickingTag, string> = {
  'out-of-season': 'Ei sesonkia',
  'season-edge': 'Sesongin reunalla',
  'season-over-frost': 'Kausi ohi',
  'frozen-ground': 'Maa jäässä',
  'too-dry': 'Liian kuivaa',
  'too-hot': 'Liian lämmintä',
  'too-cold': 'Liian kylmää',
  'waiting-for-flush': 'Sato tuloillaan',
  'flush-rising': 'Sato nousussa',
  'flush-peak': 'Sato huipussaan',
  'flush-fading': 'Sato hiipuu',
  'no-recent-rain': 'Ei sateita',
  'steady-fair': 'Kohtalainen'
}

// Shared date formatters: the pill, the recommendation sentence and the chart
// axis must agree on how a day is written.
export const dayLabel = (date: string): string => {
  const [, m, d] = date.split('-')
  return `${Number(d)}.${Number(m)}.`
}

export const rangeLabel = (start: string, end: string): string => {
  if (start === end) return dayLabel(start)
  const sameMonth = start.slice(5, 7) === end.slice(5, 7)
  const startPart = sameMonth ? `${Number(start.slice(8, 10))}.` : dayLabel(start)
  return `${startPart}-${dayLabel(end)}`
}

export interface PickingWindow {
  start: string
  end: string
}

/**
 * Contiguous run of days around the best-scoring day, within 80 % of its
 * score. Null when nothing in the horizon is worth going for.
 */
export function bestPickingWindow(outlook: PickingDay[]): PickingWindow | null {
  if (outlook.length === 0) return null
  const best = outlook.reduce((a, b) => (b.score > a.score ? b : a))
  if (best.score < 0.25) return null
  const threshold = Math.max(0.45, best.score * 0.8)
  const bestIdx = outlook.indexOf(best)
  let start = bestIdx
  let end = bestIdx
  while (start > 0 && outlook[start - 1].score >= threshold) start--
  while (end < outlook.length - 1 && outlook[end + 1].score >= threshold) end++
  return { start: outlook[start].date, end: outlook[end].date }
}

// Sentence fragments per tag when no window is worth recommending.
const NO_WINDOW_SENTENCES: Record<PickingTag, string> = {
  'flush-peak': 'Sato huipussaan.',
  'flush-rising': 'Sato nousussa.',
  'flush-fading': 'Sato hiipuu, uutta satoa ei vielä näköpiirissä.',
  'waiting-for-flush': 'Sato tuloillaan.',
  'steady-fair': 'Kohtalainen näkymä koko jaksolle.',
  'no-recent-rain': 'Ei tuoreita sateita, näkymä pysyy heikkona.',
  'too-dry': 'Liian kuivaa, sadetta tarvitaan ennen satoa.',
  'too-hot': 'Liian lämmintä, näkymä paranee viileämmällä säällä.',
  'too-cold': 'Liian kylmää sadolle juuri nyt.',
  'season-edge': 'Sesongin reunalla, näkymä jää vaisuksi.',
  'out-of-season': 'Ei sesonkia juuri nyt.',
  'season-over-frost': 'Pakkaset päättivät kauden tältä vuodelta.',
  'frozen-ground': 'Maa on jäässä, poiminta tauolla.'
}

// Sentence openers per tag when a window exists ("nyt" contrasts the poor
// present against the better days ahead).
const WINDOW_OPENERS: Record<PickingTag, string> = {
  'flush-peak': 'Sato huipussaan',
  'flush-rising': 'Sato nousussa',
  'flush-fading': 'Sato hiipuu',
  'waiting-for-flush': 'Sato tuloillaan',
  'steady-fair': 'Kohtalainen näkymä',
  'no-recent-rain': 'Ei tuoreita sateita',
  'too-dry': 'Liian kuivaa nyt',
  'too-hot': 'Liian lämmintä nyt',
  'too-cold': 'Liian kylmää nyt',
  'season-edge': 'Sesongin reunalla',
  'out-of-season': '',
  'season-over-frost': '',
  'frozen-ground': ''
}

// These states end the discussion; a window would be misleading next to them.
const WINDOW_IGNORED = new Set<PickingTag>(['out-of-season', 'season-over-frost', 'frozen-ground'])

/** One natural sentence: today's state plus the best days ahead. */
export function pickingSentence(outlook: PickingDay[], window: PickingWindow | null): string {
  if (outlook.length === 0) return ''
  const today = outlook[0]

  if (window === null || WINDOW_IGNORED.has(today.tag)) {
    let s = NO_WINDOW_SENTENCES[today.tag]
    if ((today.tag === 'flush-rising' || today.tag === 'waiting-for-flush') && today.peakInDays !== undefined) {
      s = `${s.slice(0, -1)}, huippu noin ${today.peakInDays} pv päästä.`
    }
    return s
  }

  const opener = WINDOW_OPENERS[today.tag]
  if (window.start === today.date && window.end === today.date) {
    return `${opener}, paras päivä on tänään.`
  }
  const immediate = window.start === today.date && (today.tag === 'flush-peak' || today.tag === 'flush-fading')
  // The date's own trailing dot serves as the sentence period.
  return `${opener}, parhaat päivät ${immediate ? 'heti ' : ''}${rangeLabel(window.start, window.end)}`
}

const WEEKDAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']
const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 864e5)

export interface PickingPill {
  label: string
  tone: 'green' | 'amber' | 'gray'
  /** "paras ti" style hint, only when clearly better days are ahead. */
  suffix: string | null
}

/** Collapsed-pill content: today's state, with a better-day hint. */
export function pickingPill(outlook: PickingDay[], window: PickingWindow | null): PickingPill | null {
  if (outlook.length === 0) return null
  const today = outlook[0]
  const tone = today.score >= 0.55 ? 'green' : today.score >= 0.3 ? 'amber' : 'gray'

  let suffix: string | null = null
  if (window !== null && !WINDOW_IGNORED.has(today.tag) && window.start > today.date) {
    const best = outlook.reduce((a, b) => (b.score > a.score ? b : a))
    if (best.score >= today.score + 0.15) {
      const d = daysBetween(today.date, window.start)
      const ref =
        d >= 1 && d <= 6 ? WEEKDAYS[new Date(`${window.start}T00:00:00Z`).getUTCDay()] : dayLabel(window.start)
      suffix = `paras ${ref}`
    }
  }
  return { label: PICKING_TAG_SHORT[today.tag], tone, suffix }
}
