import { clamp } from './math'

// Limiting-factor combination on typed arrays, used by the per-cell raster
// scorers. Sub-scores < 0 (or NaN) mean "unknown" and drop out (unknown ≠ bad):
// a missing layer can never fake a veto.

/** Map a modulator sub-score (0→1, 0.5 neutral) onto its multiplier band. */
function multiplierFor(subScore: number, band: readonly [number, number]): number {
  const [lo, hi] = band
  const s = clamp(subScore)
  // Piecewise-linear, continuous at 0.5: s=0→lo, s=0.5→1, s=1→hi.
  return s >= 0.5 ? 1 + (hi - 1) * (s - 0.5) * 2 : lo + (1 - lo) * (s * 2)
}

/**
 * Hard filters combine by exponent-weighted geometric mean (weights renormalised
 * over the available ones, so any ~0 filter vetoes the site); modulators nudge
 * the result within their bands, normalised by the best attainable multiplier
 * so top sites never clamp into a tie at 1; an explicit veto forces 0.
 */
export function compositeNumeric(
  hard: ArrayLike<number>,
  weights: ArrayLike<number>,
  modulators: ArrayLike<number>,
  bands: ReadonlyArray<readonly [number, number]>,
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
    multiplier *= multiplierFor(s, bands[i])
    maxMultiplier *= Math.max(1, bands[i][1])
  }
  return clamp((hardScore * multiplier) / maxMultiplier)
}

/**
 * Confidence rank (0 low, 1 med, 2 high): the minimum rank among available hard
 * filters (rank < 0 = missing), capped at "med" with one missing and "low" with
 * two or more.
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
