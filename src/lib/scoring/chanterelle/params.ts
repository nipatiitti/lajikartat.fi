import type { ChanterelleVariant } from './types'

// Geometric mean with EXPONENT WEIGHTS on the hard filters — the spec's
// `geomean(M1..M7 · species_weights)` (species/chanterelle.md §2). Weights are
// relative emphases, renormalised over available factors by core/limiting.ts.

export type ChanterelleHardFactorId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7'
export const CHANTERELLE_HARD_FACTORS: readonly ChanterelleHardFactorId[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']

export interface ChanterelleParams {
  /** Geometric-mean exponent weights for the hard filters. */
  weights: Record<ChanterelleHardFactorId, number>
  /** M9 multiplier band — deliberately mild (renewable resource). */
  m9Band: [number, number]
  /** M2: unimodal score per kasvupaikkatyyppi 1..8 (3 = tuore kangas peak). */
  fertilityScores: Record<number, number>
  /** M2: multiplier per peatland subgroup (kangas is ×1). */
  subgroupMultiplier: { korpi: number; rame: number; openMire: number }
  /**
   * M4: basal-area peak/width (m²/ha) — unimodal after Tahvanainen et al. 2016
   * (yields peak ≈ 25 m²/ha in spruce stands) — and the canopy-cover (%) curve:
   * [K] Gaussian around ccPeak; [S] linear ramp ccRampFrom→ccRampTo.
   */
  m4: { baPeak: number; baSigma: number; ccPeak: number; ccSigma: number; ccRampFrom: number; ccRampTo: number }
  /**
   * M5: TWI anchors (p10 / p50 / p90 over forest cells) that standardise the
   * wetness index. Measured with `calibrate --twi` (Luke TWI ×1000).
   */
  twiAnchors: { p10: number; p50: number; p90: number }
  /** M6: relative strengths of the proximity signals. */
  edgeSignalWeights: { track: number; ditch: number; standEdge: number }
  /** M7: how hard peat/rock fractions penalise the site. */
  soilPenalty: { peat: number; rock: number; rockFreeAllowance: number }
}

export const CHANTERELLE_PARAMS: Record<ChanterelleVariant, ChanterelleParams> = {
  // [K] — light, mesic (blueberry-type) mixed/mature forest; worked edges along
  // old forest roads and paths; tolerates rocky sunny pine ground.
  kantarelli: {
    weights: { M1: 1.0, M2: 1.2, M3: 1.2, M4: 0.7, M5: 0.8, M6: 1.5, M7: 0.7 },
    m9Band: [0.9, 1.15],
    fertilityScores: { 1: 0.4, 2: 0.65, 3: 1.0, 4: 0.55, 5: 0.2, 6: 0.05, 7: 0.25, 8: 0.15 },
    subgroupMultiplier: { korpi: 0.4, rame: 0.3, openMire: 0.05 },
    m4: { baPeak: 20, baSigma: 8, ccPeak: 60, ccSigma: 20, ccRampFrom: 30, ccRampTo: 80 },
    twiAnchors: { p10: 5.3, p50: 6.5, p90: 9.8 },
    edgeSignalWeights: { track: 1.0, ditch: 0.8, standEdge: 0.5 },
    soilPenalty: { peat: 0.75, rock: 0.3, rockFreeAllowance: 0.3 }
  },
  // [S] — shady mossy spruce ground, moist microsites, ditch bottoms; korpi
  // margins are fine; rocky/dry ground penalised more.
  suppilovahvero: {
    weights: { M1: 1.2, M2: 1.2, M3: 1.2, M4: 0.7, M5: 1.2, M6: 1.5, M7: 0.7 },
    m9Band: [0.9, 1.15],
    fertilityScores: { 1: 0.55, 2: 0.8, 3: 1.0, 4: 0.35, 5: 0.1, 6: 0.05, 7: 0.15, 8: 0.1 },
    subgroupMultiplier: { korpi: 0.85, rame: 0.35, openMire: 0.05 },
    m4: { baPeak: 25, baSigma: 9, ccPeak: 70, ccSigma: 20, ccRampFrom: 30, ccRampTo: 80 },
    twiAnchors: { p10: 5.3, p50: 6.5, p90: 9.8 },
    edgeSignalWeights: { track: 0.65, ditch: 1.0, standEdge: 0.4 },
    soilPenalty: { peat: 0.45, rock: 0.3, rockFreeAllowance: 0 }
  }
}
