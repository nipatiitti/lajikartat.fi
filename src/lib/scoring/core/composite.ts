import type { CompositeResult, Confidence, WeightedFactor, WhyBreakdown, WhyFactor } from './types'

const ORDER: readonly Confidence[] = ['low', 'med', 'high']
const rank = (c: Confidence): number => ORDER.indexOf(c)

export interface CompositeOptions {
  /** Weight at/above which a factor counts toward the overall confidence. */
  highWeightThreshold?: number
  /** Free-text notes carried into the why-breakdown (e.g. "verify on site"). */
  notes?: string[]
}

/**
 * Renormalised weighted sum over NON-NULL factors. A null sub-score drops the
 * factor's weight from the denominator entirely — it is never treated as 0.
 * Overall confidence is driven by the high-weight factors that had real data.
 */
export function combineFactors(factors: WeightedFactor[], options: CompositeOptions = {}): CompositeResult {
  const highWeightThreshold = options.highWeightThreshold ?? 0.2
  const available = factors.filter((f) => f.result.subScore !== null)
  const weightSum = available.reduce((s, f) => s + f.weight, 0)

  const composite =
    weightSum > 0 ? available.reduce((s, f) => s + f.weight * (f.result.subScore as number), 0) / weightSum : 0

  const confidence = overallConfidence(factors, highWeightThreshold)
  const why = buildWhy(factors, weightSum, options.notes ?? [])

  const factorMap: CompositeResult['factors'] = {}
  for (const f of factors) {
    factorMap[f.id] = { subScore: f.result.subScore, confidence: f.result.confidence }
  }

  return { composite, confidence, why, factors: factorMap }
}

function overallConfidence(factors: WeightedFactor[], threshold: number): Confidence {
  const high = factors.filter((f) => f.weight >= threshold)
  const highAvailable = high.filter((f) => f.result.subScore !== null)
  const missingHigh = high.length - highAvailable.length

  let r = highAvailable.length > 0 ? Math.min(...highAvailable.map((f) => rank(f.result.confidence))) : 0
  if (missingHigh >= 1) r = Math.min(r, 1) // a missing high-weight factor caps at "med"
  if (missingHigh >= 2) r = 0 // two or more missing → "low"
  return ORDER[r]
}

function buildWhy(factors: WeightedFactor[], weightSum: number, notes: string[]): WhyBreakdown {
  const whyFactors: WhyFactor[] = factors.map((f) => ({
    id: f.id,
    label: f.label ?? f.id,
    subScore: f.result.subScore,
    weight: f.result.subScore !== null && weightSum > 0 ? f.weight / weightSum : 0,
    confidence: f.result.confidence,
    drivers: f.result.drivers ?? []
  }))

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
