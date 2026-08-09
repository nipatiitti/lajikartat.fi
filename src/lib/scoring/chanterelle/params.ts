import type { ChanterelleVariant } from './types'

// The chanterelle model combines like trout (geometric mean + bounded modulators)
// but with EXPONENT WEIGHTS on the hard filters — the spec's
// `geomean(M1..M7 · species_weights)` (species/chantarelle.md §2). Weights are
// relative emphases, renormalised over available factors by core/limiting.ts.

// User-facing labels (Finnish) — these bake into the D1 `why` JSON at pipeline time.
export const CHANTERELLE_FACTOR_LABELS = {
  M1: 'Puulajit ja sekapuustoisuus',
  M2: 'Kasvupaikkatyyppi',
  M3: 'Puuston ikä ja kehitysvaihe',
  M4: 'Latvus ja valoisuus',
  M6: 'Reunat, polut ja ojat',
  M7: 'Maaperä',
  M9: 'Syrjäisyys ja poimintapaine',
  V: 'Poissulkevat ehdot'
} as const

export interface ChanterelleParams {
  /** Geometric-mean exponent weights for the hard filters. */
  weights: { M1: number; M2: number; M3: number; M4: number; M6: number; M7: number }
  /** M9 multiplier band — deliberately mild (renewable resource). */
  m9Band: [number, number]
  /** M2: unimodal score per kasvupaikkatyyppi 1..8 (3 = tuore kangas peak). */
  fertilityScores: Record<number, number>
  /** M2: multiplier per peatland subgroup (kangas is ×1). */
  subgroupMultiplier: { korpi: number; rame: number; openMire: number }
  /** M6: relative strengths of the two proximity signals. */
  edgeSignalWeights: { track: number; ditch: number }
  /** M7: how hard peat/rock fractions penalise the site. */
  soilPenalty: { peat: number; rock: number; rockFreeAllowance: number }
}

export const CHANTERELLE_PARAMS: Record<ChanterelleVariant, ChanterelleParams> = {
  // [K] — light, mesic (blueberry-type) mixed/mature forest; worked edges along
  // old forest roads and paths; tolerates rocky sunny pine ground.
  kantarelli: {
    weights: { M1: 1.0, M2: 1.2, M3: 1.2, M4: 0.7, M6: 1.5, M7: 0.7 },
    m9Band: [0.9, 1.15],
    fertilityScores: { 1: 0.55, 2: 0.8, 3: 1.0, 4: 0.7, 5: 0.25, 6: 0.05, 7: 0.3, 8: 0.2 },
    subgroupMultiplier: { korpi: 0.4, rame: 0.3, openMire: 0.05 },
    edgeSignalWeights: { track: 1.0, ditch: 0.8 },
    soilPenalty: { peat: 0.75, rock: 0.3, rockFreeAllowance: 0.3 }
  },
  // [S] — shady mossy spruce ground, moist microsites, ditch bottoms; korpi
  // margins are fine; rocky/dry ground penalised more.
  suppilovahvero: {
    weights: { M1: 1.2, M2: 1.2, M3: 1.2, M4: 0.7, M6: 1.5, M7: 0.7 },
    m9Band: [0.9, 1.15],
    fertilityScores: { 1: 0.7, 2: 0.9, 3: 1.0, 4: 0.45, 5: 0.1, 6: 0.05, 7: 0.15, 8: 0.1 },
    subgroupMultiplier: { korpi: 0.85, rame: 0.35, openMire: 0.05 },
    edgeSignalWeights: { track: 0.65, ditch: 1.0 },
    soilPenalty: { peat: 0.45, rock: 0.3, rockFreeAllowance: 0 }
  }
}

// Ethics & legal notes travel with every candidate (species/chantarelle.md §5).
export const CHANTERELLE_NOTES = [
  'Poimiminen on sallittua jokamiehenoikeudella — ei kuitenkaan pihoilla, viljelmillä eikä luonnonsuojelualueiden rajoitusosissa',
  'Tunnistus on aina poimijan omalla vastuulla',
  'Älä haravoi tai riko sammalta — nosta varovasti ja jätä pienimmät kasvamaan',
  'Löytöpaikka tuottaa yleensä vuosittain (sienirihmasto säilyy) — paina mieleen'
]
