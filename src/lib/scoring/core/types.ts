export type Confidence = 'high' | 'med' | 'low'

export interface FactorResult {
  /** Normalised sub-score in [0,1], or null when the data is unavailable. */
  subScore: number | null
  confidence: Confidence
  /** Human-readable reasons feeding the "why" breakdown. */
  drivers?: string[]
}

export interface WeightedFactor {
  id: string
  label?: string
  /** Design weight, before renormalisation over the available factors. */
  weight: number
  result: FactorResult
}

export interface WhyFactor {
  id: string
  label: string
  subScore: number | null
  /** Effective weight after renormalisation (0 when the factor dropped out). */
  weight: number
  confidence: Confidence
  drivers: string[]
}

export interface WhyBreakdown {
  factors: WhyFactor[]
  topPositives: string[]
  topNegatives: string[]
  notes: string[]
}

export interface CompositeResult {
  /** Renormalised weighted sum over non-null factors, in [0,1]. */
  composite: number
  confidence: Confidence
  why: WhyBreakdown
  /** Per-factor sub-scores, keyed by factor id — persisted as JSON. */
  factors: Record<string, { subScore: number | null; confidence: Confidence }>
}
