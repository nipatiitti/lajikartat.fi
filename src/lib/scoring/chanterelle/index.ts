import { combineLimiting } from '../core/limiting'
import type { CompositeResult } from '../core/types'
import { m1Hosts } from './factors/m1-hosts'
import { m2Fertility } from './factors/m2-fertility'
import { m3Maturity } from './factors/m3-maturity'
import { m4Light } from './factors/m4-light'
import { m6Edges } from './factors/m6-edges'
import { m7Soil } from './factors/m7-soil'
import { m9Remoteness } from './factors/m9-remoteness'
import { vetoConditions } from './factors/veto'
import { CHANTERELLE_FACTOR_LABELS, CHANTERELLE_NOTES, CHANTERELLE_PARAMS } from './params'
import type { ChanterelleInput, ChanterelleVariant } from './types'

/**
 * Pure entry point, shared by both variants: already-joined inputs → composite
 * `suitability` (WHERE — the temporal "prime now" overlay is a separate,
 * frontend-side concern and is never baked into this score). Hard filters
 * M1–M4/M6/M7 combine by weighted geometric mean, M9 nudges within a mild band,
 * and explicit vetoes zero the site with the reason surfaced.
 * (species/chantarelle.md §2, §5)
 */
export function scoreChanterelle(input: ChanterelleInput, variant: ChanterelleVariant): CompositeResult {
  const p = CHANTERELLE_PARAMS[variant]
  const L = CHANTERELLE_FACTOR_LABELS

  return combineLimiting(
    [
      { id: 'M1', label: L.M1, weight: p.weights.M1, result: m1Hosts(input, variant) },
      { id: 'M2', label: L.M2, weight: p.weights.M2, result: m2Fertility(input, variant) },
      { id: 'M3', label: L.M3, weight: p.weights.M3, result: m3Maturity(input) },
      { id: 'M4', label: L.M4, weight: p.weights.M4, result: m4Light(input, variant) },
      { id: 'M6', label: L.M6, weight: p.weights.M6, result: m6Edges(input, variant) },
      { id: 'M7', label: L.M7, weight: p.weights.M7, result: m7Soil(input, variant) }
    ],
    [{ id: 'M9', label: L.M9, band: p.m9Band, result: m9Remoteness(input) }],
    {
      vetoes: [{ id: 'V', label: L.V, result: vetoConditions(input) }],
      notes: CHANTERELLE_NOTES
    }
  )
}

export type { ChanterelleInput, ChanterelleVariant, DevClass, MainTreeGroup, StandSoil, Subgroup } from './types'
