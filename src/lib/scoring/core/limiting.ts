import { clamp } from './math'
import type { CompositeResult, Confidence, FactorResult, WhyBreakdown, WhyFactor } from './types'

const ORDER: readonly Confidence[] = ['low', 'med', 'high']
const rank = (c: Confidence): number => ORDER.indexOf(c)

export interface LimitingFactor {
  id: string
  label?: string
  result: FactorResult
}

export interface ModulatorFactor extends LimitingFactor {
  /** Multiplier band a sub-score of 0→1 maps onto (0.5 ⇒ ×1). Default [0.7, 1.3]. */
  band?: [number, number]
}

export interface LimitingOptions {
  /** Free-text notes carried into the why-breakdown (e.g. conservation reminders). */
  notes?: string[]
}

/** Map a modulator sub-score (0→1, 0.5 neutral) onto its multiplier band. */
function multiplierFor(subScore: number, band: [number, number]): number {
  const [lo, hi] = band
  const s = clamp(subScore)
  // Piecewise-linear, continuous at 0.5: s=0→lo, s=0.5→1, s=1→hi.
  return s >= 0.5 ? 1 + (hi - 1) * (s - 0.5) * 2 : lo + (1 - lo) * (s * 2)
}

/**
 * Geometric-mean / limiting-factor combination (trout). The HARD filters combine
 * MULTIPLICATIVELY, so any single fatal condition (sub-score ~0) vetoes the site
 * regardless of the rest; MODULATORS then nudge an already-suitable reach up or
 * down within a bounded band. Null sub-scores drop out (unknown ≠ bad) — they are
 * never treated as 0, so a missing layer can't fake a veto.
 */
export function combineLimiting(
  hard: LimitingFactor[],
  modulators: ModulatorFactor[] = [],
  options: LimitingOptions = {}
): CompositeResult {
  const availHard = hard.filter((f) => f.result.subScore !== null)
  const hardScore =
    availHard.length > 0
      ? Math.pow(
          availHard.reduce((p, f) => p * (f.result.subScore as number), 1),
          1 / availHard.length
        )
      : 0

  let multiplier = 1
  for (const m of modulators) {
    if (m.result.subScore === null) continue
    multiplier *= multiplierFor(m.result.subScore, m.band ?? [0.7, 1.3])
  }

  const composite = clamp(hardScore * multiplier)
  const confidence = hardConfidence(hard)
  const why = buildWhy(hard, modulators, availHard.length, options.notes ?? [])

  const factors: CompositeResult['factors'] = {}
  for (const f of [...hard, ...modulators]) {
    factors[f.id] = { subScore: f.result.subScore, confidence: f.result.confidence }
  }

  return { composite, confidence, why, factors }
}

// Confidence is the minimum among available hard filters, lowered for each hard
// filter we had no data for (mirrors the weighted-sum model's behaviour).
function hardConfidence(hard: LimitingFactor[]): Confidence {
  const avail = hard.filter((f) => f.result.subScore !== null)
  const missing = hard.length - avail.length
  let r = avail.length > 0 ? Math.min(...avail.map((f) => rank(f.result.confidence))) : 0
  if (missing >= 1) r = Math.min(r, 1) // one missing hard filter caps at "med"
  if (missing >= 2) r = 0 // two or more missing → "low"
  return ORDER[r]
}

function buildWhy(
  hard: LimitingFactor[],
  modulators: ModulatorFactor[],
  availHardCount: number,
  notes: string[]
): WhyBreakdown {
  const toWhy = (f: LimitingFactor, weight: number): WhyFactor => ({
    id: f.id,
    label: f.label ?? f.id,
    subScore: f.result.subScore,
    weight,
    confidence: f.result.confidence,
    drivers: f.result.drivers ?? []
  })

  // Hard filters share an even indicative weight (for the why-panel bars);
  // modulators are secondary and shown at weight 0.
  const whyFactors: WhyFactor[] = [
    ...hard.map((f) => toWhy(f, f.result.subScore !== null && availHardCount > 0 ? 1 / availHardCount : 0)),
    ...modulators.map((f) => toWhy(f, 0))
  ]

  const available = whyFactors.filter((f) => f.subScore !== null)
  const positives = available
    .filter((f) => (f.subScore as number) >= 0.6)
    .sort((a, b) => (b.subScore as number) - (a.subScore as number))
  const negatives = available
    .filter((f) => (f.subScore as number) <= 0.4)
    .sort((a, b) => (a.subScore as number) - (b.subScore as number))

  return {
    factors: whyFactors,
    topPositives: positives.slice(0, 2).flatMap((f) => f.drivers),
    topNegatives: negatives.slice(0, 2).flatMap((f) => f.drivers),
    notes
  }
}
