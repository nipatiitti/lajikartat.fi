import { clamp } from './math'
import type { CompositeResult, Confidence, FactorResult, WhyFactor } from './types'
import { buildWhyBreakdown } from './why'

const ORDER: readonly Confidence[] = ['low', 'med', 'high']
const rank = (c: Confidence): number => ORDER.indexOf(c)

export interface LimitingFactor {
  id: string
  label?: string
  /**
   * Geometric-mean exponent weight (default 1 = even mean). Weights are
   * renormalised over the AVAILABLE hard filters, so `∏ sᵢ^(wᵢ/Σw)` with all
   * defaults reproduces the unweighted `∏ sᵢ^(1/n)` exactly.
   */
  weight?: number
  result: FactorResult
}

export interface ModulatorFactor extends LimitingFactor {
  /** Multiplier band a sub-score of 0→1 maps onto (0.5 ⇒ ×1). Default [0.7, 1.3]. */
  band?: [number, number]
}

export interface LimitingOptions {
  /** Free-text notes carried into the why-breakdown (e.g. conservation reminders). */
  notes?: string[]
  /**
   * Explicit veto conditions (e.g. chanterelle clearcut/seedling stand). A veto
   * with sub-score 0 FIRES: composite is forced to 0 and its drivers surface in
   * the why-breakdown. Sub-score > 0 passes and contributes nothing; null means
   * unknown and never fires (unknown ≠ bad, same rule as the hard filters).
   */
  vetoes?: LimitingFactor[]
}

/** Map a modulator sub-score (0→1, 0.5 neutral) onto its multiplier band. */
function multiplierFor(subScore: number, band: [number, number]): number {
  const [lo, hi] = band
  const s = clamp(subScore)
  // Piecewise-linear, continuous at 0.5: s=0→lo, s=0.5→1, s=1→hi.
  return s >= 0.5 ? 1 + (hi - 1) * (s - 0.5) * 2 : lo + (1 - lo) * (s * 2)
}

/**
 * Geometric-mean / limiting-factor combination (trout, chanterelle). The HARD
 * filters combine MULTIPLICATIVELY (optionally exponent-weighted), so any single
 * fatal condition (sub-score ~0) vetoes the site regardless of the rest;
 * MODULATORS then nudge an already-suitable site up or down within a bounded
 * band; explicit VETOES short-circuit the composite to 0 with the reason
 * surfaced. Null sub-scores drop out (unknown ≠ bad) — they are never treated
 * as 0, so a missing layer can't fake a veto.
 */
export function combineLimiting(
  hard: LimitingFactor[],
  modulators: ModulatorFactor[] = [],
  options: LimitingOptions = {}
): CompositeResult {
  const vetoes = options.vetoes ?? []

  const availHard = hard.filter((f) => f.result.subScore !== null)
  const weightSum = availHard.reduce((s, f) => s + (f.weight ?? 1), 0)
  const hardScore =
    availHard.length > 0 && weightSum > 0
      ? availHard.reduce((p, f) => p * Math.pow(f.result.subScore as number, (f.weight ?? 1) / weightSum), 1)
      : 0

  let multiplier = 1
  for (const m of modulators) {
    if (m.result.subScore === null) continue
    multiplier *= multiplierFor(m.result.subScore, m.band ?? [0.7, 1.3])
  }

  const vetoFired = vetoes.some((v) => v.result.subScore === 0)
  const composite = vetoFired ? 0 : clamp(hardScore * multiplier)
  const confidence = hardConfidence(hard)

  const toWhy = (f: LimitingFactor, weight: number): WhyFactor => ({
    id: f.id,
    label: f.label ?? f.id,
    subScore: f.result.subScore,
    weight,
    confidence: f.result.confidence,
    drivers: f.result.drivers ?? []
  })
  // Hard filters carry their renormalised exponent as an indicative weight (for
  // the why-panel bars); modulators and vetoes are secondary and shown at 0. A
  // fired veto (sub-score 0) lands in topNegatives via the generic ≤0.4 rule.
  const whyFactors: WhyFactor[] = [
    ...hard.map((f) => toWhy(f, f.result.subScore !== null && weightSum > 0 ? (f.weight ?? 1) / weightSum : 0)),
    ...modulators.map((f) => toWhy(f, 0)),
    ...vetoes.map((f) => toWhy(f, 0))
  ]
  const why = buildWhyBreakdown(whyFactors, options.notes ?? [])

  const factors: CompositeResult['factors'] = {}
  for (const f of [...hard, ...modulators, ...vetoes]) {
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
