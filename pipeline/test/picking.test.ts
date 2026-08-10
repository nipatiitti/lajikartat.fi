import { describe, expect, it } from 'vitest'
import {
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
