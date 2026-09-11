import { describe, expect, it } from 'vitest'
import {
  PROJECTION_DAYS,
  pickingAnalysis,
  bestPickingWindow,
  pickingOutlook,
  pickingPill,
  pickingSentence,
  type PickingDay
} from '../../src/lib/conditions/picking'
import type { DailyWeather } from '../../src/lib/conditions/types'

// Series builder: obs days then forecast days, each [rainMm, meanTempC].
function series(startIso: string, obs: Array<[number, number]>, fc: Array<[number, number]>): DailyWeather[] {
  const start = new Date(`${startIso}T00:00:00Z`)
  const day = (i: number, [rainMm, meanTempC]: [number, number], source: 'obs' | 'forecast'): DailyWeather => ({
    date: new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10),
    rainMm,
    meanTempC,
    source
  })
  return [...obs.map((v, i) => day(i, v, 'obs')), ...fc.map((v, i) => day(obs.length + i, v, 'forecast'))]
}

const dry = (n: number, tempC: number): Array<[number, number]> => Array.from({ length: n }, () => [0, tempC])

describe('pickingOutlook', () => {
  it('returns null for species without a model or without forecast days', () => {
    const d = series('2026-07-10', dry(35, 16), dry(9, 16))
    expect(pickingOutlook(d, 'ahven')).toBeNull()
    expect(
      pickingOutlook(
        d.filter((x) => x.source === 'obs'),
        'kantarelli'
      )
    ).toBeNull()
  })

  it('peaks kantarelli ~12 days after a soaking August rain', () => {
    // 30 mm event ending 12 days before today, warm summer, otherwise dry.
    const obs = dry(35, 16)
    obs[22] = [14, 15]
    obs[23] = [16, 15]
    const out = pickingOutlook(series('2026-07-10', obs, dry(9, 16)), 'kantarelli')!
    expect(out[0].score).toBeGreaterThan(0.5)
    expect(out[0].tag).toBe('flush-peak')
    // Same weather scores clearly lower for suppilovahvero (August season gate).
    const s = pickingOutlook(series('2026-07-10', obs, dry(9, 16)), 'suppilovahvero')!
    expect(s[0].score).toBeLessThan(out[0].score)
  })

  it('flags a drought as too dry with a near-zero score', () => {
    const out = pickingOutlook(series('2026-07-10', dry(35, 18), dry(9, 18)), 'kantarelli')!
    expect(out[0].tag).toBe('too-dry')
    expect(out[0].score).toBeLessThan(0.1)
  })

  it('ignores showers below the event threshold', () => {
    // 2 mm every day: 21-day sum is 42 mm (not a drought) but no single
    // soaking event, so there is nothing to trigger a flush.
    const drizzle: Array<[number, number]> = Array.from({ length: 35 }, () => [2, 16])
    const out = pickingOutlook(series('2026-07-10', drizzle, dry(9, 16)), 'kantarelli')!
    expect(out[0].tag).toBe('no-recent-rain')
    expect(out[0].score).toBeLessThanOrEqual(0.2)
  })

  it('latches kantarelli shut after a hard frost, while suppilovahvero survives', () => {
    // October: rain event, then a -4 °C night 8 days before today.
    const obs: Array<[number, number]> = dry(35, 6)
    obs[20] = [20, 6]
    obs[21] = [15, 6]
    obs[27] = [0, -4]
    const d = series('2026-09-06', obs, dry(9, 5))
    const k = pickingOutlook(d, 'kantarelli')!
    expect(k[0].tag).toBe('season-over-frost')
    expect(k[0].score).toBeLessThan(0.1)
    const s = pickingOutlook(d, 'suppilovahvero')!
    expect(s[0].score).toBeGreaterThan(0.5)
  })

  it('helpers: window, sentence and pill compose coherently', () => {
    const day = (i: number, score: number, tag: PickingDay['tag'], peakInDays?: number): PickingDay => ({
      date: `2026-08-${String(10 + i).padStart(2, '0')}`,
      score,
      tag,
      peakInDays,
      confidence: 1 - 0.06 * i
    })

    // Window: contiguous run within 80 % of the best score, none under 0.25.
    const rising = [
      day(0, 0.2, 'waiting-for-flush', 3),
      day(1, 0.4, 'flush-rising', 2),
      day(2, 0.7, 'flush-peak'),
      day(3, 0.72, 'flush-peak'),
      day(4, 0.6, 'flush-peak'),
      day(5, 0.3, 'flush-fading')
    ]
    expect(bestPickingWindow(rising)).toEqual({ start: '2026-08-12', end: '2026-08-14' })
    expect(bestPickingWindow([day(0, 0.2, 'too-dry'), day(1, 0.24, 'too-dry')])).toBeNull()

    // Sentence: today's state + the window as one sentence.
    const w = bestPickingWindow(rising)
    expect(pickingSentence(rising, w)).toBe('Sato tuloillaan, parhaat päivät 12.-14.8.')
    const fading = [day(0, 0.6, 'flush-fading'), day(1, 0.55, 'flush-fading'), day(2, 0.2, 'no-recent-rain')]
    expect(pickingSentence(fading, bestPickingWindow(fading))).toBe('Sato hiipuu, parhaat päivät heti 10.-11.8.')
    expect(pickingSentence([day(0, 0.02, 'season-over-frost')], w)).toBe('Pakkaset päättivät kauden tältä vuodelta.')
    expect(pickingSentence([day(0, 0.1, 'waiting-for-flush', 4)], null)).toBe(
      'Sato tuloillaan, huippu noin 4 pv päästä.'
    )

    // Pill: today's tone, suffix only when clearly better days are ahead.
    const pill = pickingPill(rising, w)!
    expect(pill.label).toBe('Sato tuloillaan')
    expect(pill.tone).toBe('gray')
    expect(pill.suffix).toBe('paras ke') // 2026-08-12 is a Wednesday
    const flat = [day(0, 0.6, 'flush-peak'), day(1, 0.62, 'flush-peak')]
    expect(pickingPill(flat, bestPickingWindow(flat))!.suffix).toBeNull()
  })

  it('announces an incoming flush with a peak estimate', () => {
    // Event ends 7 days before today: kantarelli kernel is barely open, so
    // today reads as waiting/rising with the peak a few days out.
    const obs = dry(35, 15)
    obs[27] = [18, 14]
    obs[28] = [14, 14]
    const out = pickingOutlook(series('2026-07-10', obs, dry(9, 15)), 'kantarelli')!
    expect(['waiting-for-flush', 'flush-rising']).toContain(out[0].tag)
    expect(out[0].peakInDays).toBeGreaterThan(0)
    // The score improves toward the peak within the horizon, and the peak day
    // itself reads as one.
    const peakDay = out.reduce((a, b) => (b.score > a.score ? b : a))
    expect(peakDay.score).toBeGreaterThan(out[0].score)
    expect(peakDay.tag).toBe('flush-peak')
  })
})

describe('pickingAnalysis', () => {
  it('adjusts the dry-soil threshold for evapotranspiration', () => {
    // Four isolated 4,8 mm showers (19,2 mm) then a 19,8 mm two-day front
    // ending 11 days before today. Raw antecedent is under 20 mm, so the old
    // rule demanded 25 mm and dismissed the front. In September the ground
    // is still moist (19,2 / 0,7 = 27), so 15 mm is enough.
    const build = (start: string, temp: number) => {
      const obs = dry(43, temp)
      for (const i of [18, 21, 24, 27]) obs[i] = [4.8, temp]
      obs[31] = [9.9, temp]
      obs[32] = [9.9, temp]
      return series(start, obs, dry(9, temp))
    }
    const sept = pickingOutlook(build('2026-08-01', 12), 'kantarelli')!
    expect(sept[0].tag).toBe('flush-peak')
    expect(sept[0].score).toBeGreaterThan(0.4)
    // Same layout in July (evapotranspiration factor 1): the front is ignored.
    const july = pickingOutlook(build('2026-06-01', 16), 'kantarelli')!
    expect(july[0].tag).toBe('no-recent-rain')
    expect(july[0].score).toBeLessThan(0.2)
  })

  it('exposes rain events with species peak windows and a projection tail', () => {
    const obs = dry(35, 16)
    obs[22] = [14, 15]
    obs[23] = [16, 15]
    const fc = dry(9, 16)
    fc[3] = [15, 15]
    fc[4] = [15, 15]
    const d = series('2026-07-10', obs, fc)
    const k = pickingAnalysis(d, 'kantarelli')!
    const s = pickingAnalysis(d, 'suppilovahvero')!

    expect(k.todayIdx).toBe(35)
    expect(k.forecastEndIdx).toBe(43)
    expect(k.events).toHaveLength(2)
    expect(k.events[0]).toMatchObject({
      start: '2026-08-01',
      soakStart: '2026-08-01',
      end: '2026-08-02',
      mm: 30,
      forecast: false,
      firstFruit: '2026-08-08',
      peakStart: '2026-08-13',
      peakEnd: '2026-08-19',
      fadeEnd: '2026-08-28'
    })
    expect(s.events[0].peakStart).toBe('2026-08-16')
    expect(s.events[0].peakEnd).toBe('2026-08-26')
    // The forecast event is flagged and peaks after the forecast ends.
    expect(k.events[1].forecast).toBe(true)
    expect(k.events[1].end).toBe('2026-08-18')
    expect(k.events[1].peakStart > k.series[k.forecastEndIdx].date).toBe(true)

    // Projection: PROJECTION_DAYS synthesized days, no rain, persistence
    // temperature (mean of the last five forecast days), decaying trust.
    expect(k.series).toHaveLength(35 + 9 + PROJECTION_DAYS)
    expect(k.days).toHaveLength(9 + PROJECTION_DAYS)
    const tail = k.series.slice(44)
    expect(tail.every((x) => x.source === 'projection' && x.rainMm === 0 && x.meanTempC === 15.8)).toBe(true)
    const projected = k.days.filter((x) => x.projected)
    expect(projected).toHaveLength(PROJECTION_DAYS)
    const lastLive = k.days[8]
    expect(projected.every((x) => x.confidence < lastLive.confidence)).toBe(true)
    for (let i = 1; i < projected.length; i++)
      expect(projected[i].confidence).toBeLessThanOrEqual(projected[i - 1].confidence)
    // The forecast rain's flush shows up in the tail.
    const peakDay = k.days.find((x) => x.date === '2026-08-29')!
    expect(peakDay.tag).toBe('flush-peak')
    expect(peakDay.driverEvent).toBe(1)

    // pickingOutlook is the non-projected slice.
    const outlook = pickingOutlook(d, 'kantarelli')!
    expect(outlook.map((x) => [x.date, x.score, x.tag])).toEqual(
      k.days.filter((x) => !x.projected).map((x) => [x.date, x.score, x.tag])
    )
    expect(outlook.some((x) => x.projected)).toBe(false)
  })

  it('calls a fading flush at the season start an early flush', () => {
    // 30 mm event 26 days before today, showers keeping the ground moist.
    const build = (start: string, temp: number) => {
      const obs = dry(35, temp)
      obs[8] = [15, temp]
      obs[9] = [15, temp]
      for (const i of [20, 24, 28, 32]) obs[i] = [5, temp]
      return series(start, obs, dry(9, temp))
    }
    // Late August: suppilovahvero's curve is still climbing.
    expect(pickingOutlook(build('2026-07-24', 14), 'suppilovahvero')![0].tag).toBe('early-flush-fading')
    // Late October: the curve is flat, so it is a plain fading flush.
    expect(pickingOutlook(build('2026-09-23', 5), 'suppilovahvero')![0].tag).toBe('flush-fading')
  })
})
