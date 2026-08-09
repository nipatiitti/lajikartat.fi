import { clamp } from '../../core/math'
import type { FactorResult } from '../../core/types'
import type { TroutInput } from '../types'

const BUFFERING_BONUS = { high: 0.15, med: 0.05, low: -0.05 } as const

/**
 * S3 — acidity / buffering (HARD FILTER). Brown trout are absent below ~pH 5.0;
 * puronieriä tolerates lower (`lenientAcidity`). v1 proxies acidity from catchment
 * peatland fraction (browning + low buffering), GTK acid-sulfate soils (strong
 * negative), and bedrock buffering capacity. (§S3)
 */
export function s3Acidity(input: TroutInput): FactorResult {
  if (input.catchmentPeatFraction === null && input.acidSulfatePresent === null && input.bedrockBuffering === null) {
    return { subScore: null, confidence: 'low', drivers: [] }
  }

  const drivers: string[] = []
  let sub = 0.7 // neutral-good baseline buffering

  if (input.catchmentPeatFraction !== null) {
    const peat = clamp(input.catchmentPeatFraction)
    // Brown trout is hit harder by acidity than puronieriä → steeper peat penalty.
    sub -= peat * (input.lenientAcidity ? 0.3 : 0.5)
    if (peat > 0.5) drivers.push(`peat-dominated catchment ${(peat * 100).toFixed(0)}% (acidity/browning)`)
  }

  if (input.bedrockBuffering !== null) {
    sub += BUFFERING_BONUS[input.bedrockBuffering]
    if (input.bedrockBuffering === 'high') drivers.push('carbonate/mafic bedrock (good buffering)')
  }

  if (input.acidSulfatePresent === true) {
    // Veto-level acidity — clamp low so the geometric mean knocks the reach out.
    sub = Math.min(sub, input.lenientAcidity ? 0.25 : 0.1)
    drivers.push('acid sulfate soils in catchment (severe acidity)')
  }

  return { subScore: clamp(sub), confidence: 'med', drivers }
}
