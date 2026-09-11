import {
  addDays,
  bestPickingWindow,
  dayLabel,
  moistureNeedMm,
  PARAMS,
  pickingSentence,
  rangeLabel,
  seasonAt,
  type PickingAnalysis,
  type PickingRainEvent
} from './picking'

// Plain-Finnish reasoning behind a picking analysis, one line per factor.
// Pure and relative-import only: the pipeline test runner has no $lib alias.

export type ExplainKind = 'rain' | 'moisture' | 'temp' | 'season' | 'frost' | 'next'
export type ExplainTone = 'green' | 'amber' | 'gray'

export interface ExplainLine {
  kind: ExplainKind
  text: string
  tone: ExplainTone
}

export interface PickingExplanation {
  /** Today's state and the best days ahead, one sentence. */
  headline: string
  lines: ExplainLine[]
}

const fmt = (n: number): string => String(n).replace('.', ',')

export function explainPicking(a: PickingAnalysis): PickingExplanation {
  const today = a.days[0]
  const live = a.days.filter((d) => !d.projected)
  const headline = pickingSentence(live, bestPickingWindow(live))
  const lines: ExplainLine[] = []
  const p = PARAMS[a.species]
  const month = Number(today.date.slice(5, 7))
  const forecastEnd = a.series[a.forecastEndIdx].date

  // Rain: the event driving today's flush and where it stands, plus a later
  // observed rain that keeps it going. Quoted by soaking window, not the
  // whole drizzly run.
  const soak = (e: PickingRainEvent): string => `${rangeLabel(e.soakStart, e.end)}, ${Math.round(e.soakMm)} mm`
  const observed = a.events.filter((e) => !e.forecast)
  const driver =
    today.driverEvent !== null && !a.events[today.driverEvent].forecast ? a.events[today.driverEvent] : null
  const last = observed.at(-1)
  const rainTone: ExplainTone = today.drive >= 0.55 ? 'green' : today.drive >= 0.25 ? 'amber' : 'gray'
  if (driver) {
    const peak = rangeLabel(driver.peakStart, driver.peakEnd)
    let text = `Sadon käynnisti sade ${soak(driver)}.`
    // A date range ends with its own dot, which serves as the period.
    if (driver.peakEnd < today.date) text += ` Se oli parhaimmillaan ${peak} ja hiipuu nyt.`
    else if (driver.peakStart <= today.date) text += ` Se on nyt parhaimmillaan, ${peak}`
    else text += ` Se on parhaimmillaan ${peak}`
    if (last && last !== driver && last.fadeEnd >= today.date) {
      text += ` Sade ${soak(last)}, pitää satoa yllä. Sen huippu on ${rangeLabel(last.peakStart, last.peakEnd)}`
    }
    lines.push({ kind: 'rain', text, tone: rainTone })
  } else if (last) {
    lines.push({ kind: 'rain', text: `Viimeisin kunnon sade ${soak(last)}. Sen sato on jo ohi.`, tone: 'gray' })
  } else {
    lines.push({ kind: 'rain', text: `Ei kunnon sadetta viimeisen ${a.todayIdx} päivän aikana.`, tone: 'gray' })
  }

  // Moisture: the 21-day sum against what this month needs.
  const need = moistureNeedMm(month)
  const wet = `sadetta 21 vrk ${fmt(Math.round(today.p21))} mm, tarve noin ${need} mm.`
  if (today.gDrought >= 0.8) lines.push({ kind: 'moisture', text: `Maa on kosteaa: ${wet}`, tone: 'green' })
  else if (today.gDrought >= 0.4) lines.push({ kind: 'moisture', text: `Kuivahkoa: ${wet}`, tone: 'amber' })
  else lines.push({ kind: 'moisture', text: `Liian kuivaa: ${wet}`, tone: 'gray' })

  // Temperature: 14-day mean against the species gate.
  if (today.t14 === null) {
    lines.push({ kind: 'temp', text: 'Lämpötilatietoa ei ole.', tone: 'gray' })
  } else {
    const cold = today.t14 < p.temp[1][0]
    const base = `Lämpötila 14 vrk keskiarvo ${fmt(today.t14)} °C`
    if (today.gTemp >= 0.8) lines.push({ kind: 'temp', text: `${base}, sopiva.`, tone: 'green' })
    else if (today.gTemp >= 0.5)
      lines.push({ kind: 'temp', text: `${base}, ${cold ? 'viileähkö' : 'lämmin'}.`, tone: 'amber' })
    else lines.push({ kind: 'temp', text: `${base}, liian ${cold ? 'kylmä' : 'lämmin'}.`, tone: 'gray' })
  }

  // Season: where the date sits on the species curve, and which way it goes.
  const rising = seasonAt(a.species, addDays(today.date, 14)) > today.gSeason + 0.05
  if (today.gSeason >= 0.8)
    lines.push({
      kind: 'season',
      text: rising ? 'Sesonki alkanut, pääsesonki on vasta edessä.' : 'Sesonki parhaimmillaan.',
      tone: 'green'
    })
  else if (today.gSeason >= 0.5)
    lines.push({ kind: 'season', text: rising ? 'Sesonki alkamassa.' : 'Sesonki loppupuolella.', tone: 'amber' })
  else if (today.gSeason >= 0.15) lines.push({ kind: 'season', text: 'Sesongin reunalla.', tone: 'gray' })
  else lines.push({ kind: 'season', text: 'Ei sesonkia.', tone: 'gray' })

  // Frost: only when it matters.
  if (a.latched && a.latchedOn) {
    lines.push({ kind: 'frost', text: `Kova pakkanen ${dayLabel(a.latchedOn)} päätti kauden.`, tone: 'gray' })
  } else {
    let recent = false
    for (let i = Math.max(0, a.todayIdx - 3); i <= a.todayIdx; i++) {
      const t = a.series[i].meanTempC
      if (t !== null && t <= p.frostSoft) recent = true
    }
    const ahead: string[] = []
    for (let i = a.todayIdx + 1; i <= a.forecastEndIdx; i++) {
      const t = a.series[i].meanTempC
      if (t !== null && t <= p.frostSoft) ahead.push(a.series[i].date)
    }
    if (recent) lines.push({ kind: 'frost', text: 'Yöpakkanen hidastaa satoa.', tone: 'amber' })
    else if (ahead.length > 0)
      lines.push({
        kind: 'frost',
        text: `Ennusteessa yöpakkasia ${rangeLabel(ahead[0], ahead[ahead.length - 1])}`,
        tone: 'amber'
      })
  }

  // Next: the first forecast soaking rain and where its flush would land.
  const next = a.events.find((e) => e.forecast && e.end >= today.date)
  if (next) {
    const beyond = next.peakStart > forecastEnd
    lines.push({
      kind: 'next',
      text:
        `Ennustettu sade ${soak(next)}. ` +
        `Sen sato osuisi ${rangeLabel(next.peakStart, next.peakEnd)}${beyond ? ', ennusteen ulkopuolella.' : ''}`,
      tone: 'amber'
    })
  } else {
    const fcDays = a.forecastEndIdx - a.todayIdx + 1
    lines.push({ kind: 'next', text: `Ennusteessa ei kunnon sadetta seuraavaan ${fcDays} päivään.`, tone: 'gray' })
  }

  return { headline, lines }
}
