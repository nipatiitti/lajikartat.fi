import { describe, expect, it } from 'vitest'
import { explainPicking } from '../../src/lib/conditions/explain'
import { pickingAnalysis } from '../../src/lib/conditions/picking'
import type { DailyWeather } from '../../src/lib/conditions/types'

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

describe('explainPicking', () => {
  it('names the last soaking rain, its window, and a forecast rain beyond the horizon', () => {
    // 30 mm event on 1.-2.8., today 14.8. inside its peak window; another
    // 30 mm front forecast for 17.-18.8. whose peak lies past the forecast.
    const obs = dry(35, 16)
    obs[22] = [14, 15]
    obs[23] = [16, 15]
    const fc = dry(9, 16)
    fc[3] = [15, 15]
    fc[4] = [15, 15]
    const a = pickingAnalysis(series('2026-07-10', obs, fc), 'kantarelli')!
    const ex = explainPicking(a)
    const by = Object.fromEntries(ex.lines.map((l) => [l.kind, l]))

    expect(by.rain.text).toBe('Sadon käynnisti sade 1.-2.8., 30 mm. Se on nyt parhaimmillaan, 13.-19.8.')
    expect(by.rain.tone).toBe('green')
    expect(by.next.text).toBe('Ennustettu sade 17.-18.8., 30 mm. Sen sato osuisi 29.8.-4.9., ennusteen ulkopuolella.')
    expect(by.temp.text).toBe('Lämpötila 14 vrk keskiarvo 15,9 °C, sopiva.')
    expect(by.season.text).toBe('Sesonki parhaimmillaan.')
    expect(by.frost).toBeUndefined()
    expect(ex.headline.startsWith('Sato huipussaan')).toBe(true)
  })

  it('reports a season-ending frost and no rain in sight', () => {
    const obs: Array<[number, number]> = dry(35, 6)
    obs[20] = [20, 6]
    obs[21] = [15, 6]
    obs[27] = [0, -4]
    const a = pickingAnalysis(series('2026-09-06', obs, dry(9, 5)), 'kantarelli')!
    const by = Object.fromEntries(explainPicking(a).lines.map((l) => [l.kind, l]))
    expect(by.frost.text).toBe('Kova pakkanen 3.10. päätti kauden.')
    expect(by.next.text).toBe('Ennusteessa ei kunnon sadetta seuraavaan 9 päivään.')
  })

  it('tells suppilovahvero pickers the main season is still ahead', () => {
    const obs = dry(35, 14)
    obs[8] = [15, 14]
    obs[9] = [15, 14]
    for (const i of [20, 24, 28, 32]) obs[i] = [5, 14]
    const a = pickingAnalysis(series('2026-07-24', obs, dry(9, 14)), 'suppilovahvero')!
    const by = Object.fromEntries(explainPicking(a).lines.map((l) => [l.kind, l]))
    expect(by.season.text).toBe('Sesonki alkamassa.')
    expect(explainPicking(a).headline.startsWith('Ensimmäinen sato hiipuu')).toBe(true)
  })
})
