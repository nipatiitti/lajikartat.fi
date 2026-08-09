// The trout model does NOT use a weighted sum — the four HARD filters combine by
// geometric mean (any veto → ~0) and the three MODULATORS apply bounded multipliers
// (see core/limiting.ts). These constants are labels + the modulator bands; there are
// no additive weights. (species/trout.md §2, §7)

export const TROUT_FACTOR_LABELS = {
  S1: 'Thermal regime (cold & stable)',
  S2: 'Substrate / spawning gravel',
  S3: 'Acidity / buffering',
  S5: 'Flow permanence & morphology',
  S4: 'Stream naturalness (PUROHELMI)',
  S6: 'Protective isolation (barrier)',
  S9: 'Remoteness / low pressure'
} as const

// Multiplier bands a modulator sub-score (0→1, 0.5 neutral) maps onto.
export const TROUT_MODULATOR_BANDS = {
  S4: [0.75, 1.25] as [number, number], // naturalness nudges either way
  S6: [1.0, 1.25] as [number, number], // isolation only ever a bonus
  S9: [0.7, 1.2] as [number, number] // remoteness can penalise easy-access reaches
}
