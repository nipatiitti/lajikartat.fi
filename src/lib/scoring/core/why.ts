import type { WhyBreakdown, WhyFactor } from './types'

/**
 * Shared tail of the why-breakdown: pick the strongest positives (sub-score
 * ≥ 0.6) and negatives (≤ 0.4) and surface their driver strings. Callers build
 * their own WhyFactor list (weights differ per combination rule).
 */
export function buildWhyBreakdown(whyFactors: WhyFactor[], notes: string[]): WhyBreakdown {
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
