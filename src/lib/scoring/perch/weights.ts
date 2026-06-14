// Design weights from species/perch.md §5. v1 computes F1/F2/F3/F5; the missing
// factors (F4/F6/F7) simply drop out of the renormalised denominator.
export const PERCH_WEIGHTS = {
  F1: 0.3,
  F2: 0.15,
  F3: 0.2,
  F5: 0.15
} as const

export const PERCH_FACTOR_LABELS = {
  F1: 'Remoteness / fishing pressure',
  F2: 'Isolation / closed basin',
  F3: 'Water colour (peat/esker proxy)',
  F5: 'Morphometry (size & depth)'
} as const
