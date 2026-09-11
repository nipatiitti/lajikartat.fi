import { clamp } from './math'
import type { CompositeResult, Confidence, FactorResult, WhyFactor } from './types'
import { buildWhyBreakdown } from './why'

const ORDER: readonly Confidence[] = ['low', 'med', 'high']
const rank = (c: Confidence): number => ORDER.indexOf(c)
/** Numeric confidence rank: 0 low, 1 med, 2 high. */
export const confidenceRank = rank
export const CONFIDENCE_BY_RANK = ORDER

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

export const DEFAULT_MODULATOR_BAND: [number, number] = [0.7, 1.3]

/** Map a modulator sub-score (0→1, 0.5 neutral) onto its multiplier band. */
export function multiplierFor(subScore: number, band: [number, number]): number {
  const [lo, hi] = band
  const s = clamp(subScore)
  // Piecewise-linear, continuous at 0.5: s=0→lo, s=0.5→1, s=1→hi.
  return s >= 0.5 ? 1 + (hi - 1) * (s - 0.5) * 2 : lo + (1 - lo) * (s * 2)
}

/**
 * Numeric core of the limiting-factor combination, shared with the per-cell
 * raster scorers. Sub-scores < 0 (or NaN) mean "unknown" and drop out of the
 * exponent sum; a veto fires when `vetoFired` is true. Returns the composite.
 */
export function compositeNumeric(
  hard: ArrayLike<number>,
  weights: ArrayLike<number>,
  modulators: ArrayLike<number>,
  bands: ReadonlyArray<[number, number]>,
  vetoFired: boolean
): number {
  if (vetoFired) return 0
  let weightSum = 0
  for (let i = 0; i < hard.length; i++) if (hard[i] >= 0) weightSum += weights[i]
  if (weightSum <= 0) return 0
  let hardScore = 1
  for (let i = 0; i < hard.length; i++) {
    const s = hard[i]
    if (s >= 0) hardScore *= Math.pow(s, weights[i] / weightSum)
  }
  let multiplier = 1
  let maxMultiplier = 1
  for (let i = 0; i < modulators.length; i++) {
    const s = modulators[i]
    if (!(s >= 0)) continue
    const band = bands[i] ?? DEFAULT_MODULATOR_BAND
    multiplier *= multiplierFor(s, band)
    maxMultiplier *= Math.max(1, band[1])
  }
  return clamp((hardScore * multiplier) / maxMultiplier)
}

/**
 * Numeric confidence: minimum rank among available hard filters (rank < 0 =
 * missing), capped at "med" (1) with one missing, "low" (0) with two or more.
 */
export function confidenceNumeric(hardRanks: ArrayLike<number>): number {
  let missing = 0
  let r = Infinity
  for (let i = 0; i < hardRanks.length; i++) {
    const c = hardRanks[i]
    if (c < 0) missing++
    else if (c < r) r = c
  }
  if (r === Infinity) r = 0
  if (missing >= 1) r = Math.min(r, 1)
  if (missing >= 2) r = 0
  return r
}

/**
 * Geometric-mean / limiting-factor combination (trout, chanterelle). The HARD
 * filters combine MULTIPLICATIVELY (optionally exponent-weighted), so any single
 * fatal condition (sub-score ~0) vetoes the site regardless of the rest;
 * MODULATORS then nudge an already-suitable site up or down within a bounded
 * band; explicit VETOES short-circuit the composite to 0 with the reason
 * surfaced. Null sub-scores drop out (unknown ≠ bad) — they are never treated
 * as 0, so a missing layer can't fake a veto.
 *
 * The combined modulator multiplier is normalised by its maximum attainable
 * value, so the composite reaches the hard-filter score only when every
 * available modulator is at its best. Without this, boosting bands (hi > 1)
 * push top sites past 1.0 into the clamp and the best candidates collapse
 * into an unranked tie at exactly 1.0.
 */
export function combineLimiting(
  hard: LimitingFactor[],
  modulators: ModulatorFactor[] = [],
  options: LimitingOptions = {}
): CompositeResult {
  const vetoes = options.vetoes ?? []

  const hardScores = hard.map((f) => f.result.subScore ?? -1)
  const hardWeights = hard.map((f) => f.weight ?? 1)
  const weightSum = hard.reduce((s, f, i) => s + (hardScores[i] >= 0 ? hardWeights[i] : 0), 0)
  const vetoFired = vetoes.some((v) => v.result.subScore === 0)
  const composite = compositeNumeric(
    hardScores,
    hardWeights,
    modulators.map((m) => m.result.subScore ?? -1),
    modulators.map((m) => m.band ?? DEFAULT_MODULATOR_BAND),
    vetoFired
  )
  const confidence =
    ORDER[confidenceNumeric(hard.map((f) => (f.result.subScore === null ? -1 : rank(f.result.confidence))))]

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
    ...hard.map((f, i) => toWhy(f, hardScores[i] >= 0 && weightSum > 0 ? hardWeights[i] / weightSum : 0)),
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
