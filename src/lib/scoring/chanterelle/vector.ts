import { compositeNumeric, confidenceNumeric } from '../core/limiting'
import { m1Core } from './factors/m1-hosts'
import { m2Core } from './factors/m2-fertility'
import { m3Core } from './factors/m3-maturity'
import { m4Core } from './factors/m4-light'
import { m5Core } from './factors/m5-moisture'
import { m6Core } from './factors/m6-edges'
import { m7Core } from './factors/m7-soil'
import { m9Core } from './factors/m9-remoteness'
import { vetoCore } from './factors/veto'
import { CHANTERELLE_HARD_FACTORS, CHANTERELLE_PARAMS, type ChanterelleHardFactorId } from './params'
import type { ChanterelleVariant } from './types'

/**
 * Column-oriented inputs for the per-cell raster scorer. Float arrays use NaN
 * for "unknown", code arrays use −1, `valid` marks cells that are forest at
 * all (0 → every output is nodata). The layout mirrors ChanterelleInput field
 * by field so the object scorer can be used as the reference in tests.
 */
export interface ChanterelleGridInputs {
  n: number
  pineShare: Float32Array
  spruceShare: Float32Array
  otherShare: Float32Array
  /** kasvupaikkatyyppi 1..8, −1 unknown. */
  fertilityClass: Int8Array
  /** SUBGROUP_CODES index, −1 unknown. */
  subgroupCode: Int8Array
  /** DEV_CLASS_CODES index, −1 unknown. */
  devClassCode: Int8Array
  meanAge: Float32Array
  basalArea: Float32Array
  canopyPct: Float32Array
  twi: Float32Array
  nearestTrackM: Float32Array
  nearestDitchM: Float32Array
  nearestStandEdgeM: Float32Array
  /** 1 = drained peatland (internal ditch network), else 0. */
  drained: Uint8Array
  peatFraction: Float32Array
  rockFraction: Float32Array
  nearestCarRoadM: Float32Array
  buildingsWithin500m: Float32Array
  valid: Uint8Array
}

export type ChanterelleGridFactorId = ChanterelleHardFactorId | 'M9' | 'V'

export interface ChanterelleGridOutputs {
  /** Composite 0..1, NaN where the cell is invalid. */
  composite: Float32Array
  /** 0 nodata, 1 low, 2 med, 3 high. */
  confidence: Uint8Array
  /** Per-factor sub-scores (NaN = unknown / invalid); V is 0 fired, 1 passed. */
  factors: Record<ChanterelleGridFactorId, Float32Array>
}

export function allocGridInputs(n: number): ChanterelleGridInputs {
  const f = () => new Float32Array(n).fill(NaN)
  const c = () => new Int8Array(n).fill(-1)
  return {
    n,
    pineShare: f(),
    spruceShare: f(),
    otherShare: f(),
    fertilityClass: c(),
    subgroupCode: c(),
    devClassCode: c(),
    meanAge: f(),
    basalArea: f(),
    canopyPct: f(),
    twi: f(),
    nearestTrackM: f(),
    nearestDitchM: f(),
    nearestStandEdgeM: f(),
    drained: new Uint8Array(n),
    peatFraction: f(),
    rockFraction: f(),
    nearestCarRoadM: f(),
    buildingsWithin500m: f(),
    valid: new Uint8Array(n)
  }
}

export function allocGridOutputs(n: number): ChanterelleGridOutputs {
  const f = () => new Float32Array(n).fill(NaN)
  return {
    composite: f(),
    confidence: new Uint8Array(n),
    factors: { M1: f(), M2: f(), M3: f(), M4: f(), M5: f(), M6: f(), M7: f(), M9: f(), V: f() }
  }
}

// Confidence rank each hard factor reports when it has data (mirrors the object
// API: M1/M2/M3/M6 high, M4/M5/M7 med because their inputs are proxies).
const HARD_RANK: Record<ChanterelleHardFactorId, number> = { M1: 2, M2: 2, M3: 2, M4: 1, M5: 1, M6: 2, M7: 1 }

/**
 * Score every cell of a grid with the same numeric cores the object API uses.
 * One pass, no per-cell allocation. `out` may be reused between tiles.
 */
export function scoreChanterelleGrid(
  inp: ChanterelleGridInputs,
  variant: ChanterelleVariant,
  out: ChanterelleGridOutputs = allocGridOutputs(inp.n)
): ChanterelleGridOutputs {
  const p = CHANTERELLE_PARAMS[variant]
  const nHard = CHANTERELLE_HARD_FACTORS.length
  const weights = new Float64Array(nHard)
  const ranksWhenKnown = new Int8Array(nHard)
  for (let k = 0; k < nHard; k++) {
    weights[k] = p.weights[CHANTERELLE_HARD_FACTORS[k]]
    ranksWhenKnown[k] = HARD_RANK[CHANTERELLE_HARD_FACTORS[k]]
  }
  const hard = new Float64Array(nHard)
  const ranks = new Int8Array(nHard)
  const mods = new Float64Array(1)
  const bands: Array<[number, number]> = [p.m9Band]
  const F = out.factors
  const hardArrays = CHANTERELLE_HARD_FACTORS.map((id) => F[id])

  for (let i = 0; i < inp.n; i++) {
    if (!inp.valid[i]) {
      out.composite[i] = NaN
      out.confidence[i] = 0
      for (let k = 0; k < nHard; k++) hardArrays[k][i] = NaN
      F.M9[i] = NaN
      F.V[i] = NaN
      continue
    }

    const pine = inp.pineShare[i]
    const spruce = inp.spruceShare[i]
    const other = inp.otherShare[i]
    hard[0] = pine === pine && spruce === spruce && other === other ? m1Core(pine, spruce, other, variant) : -1
    hard[1] = m2Core(inp.fertilityClass[i], inp.subgroupCode[i], variant)
    hard[2] = m3Core(inp.devClassCode[i], inp.meanAge[i])
    hard[3] = m4Core(inp.basalArea[i], inp.canopyPct[i], variant)
    hard[4] = m5Core(inp.twi[i], variant)
    hard[5] = m6Core(
      inp.nearestTrackM[i],
      inp.nearestDitchM[i],
      inp.nearestStandEdgeM[i],
      false,
      inp.drained[i] === 1,
      variant
    )
    hard[6] = m7Core(inp.peatFraction[i], inp.rockFraction[i], variant)
    mods[0] = m9Core(inp.nearestCarRoadM[i], inp.buildingsWithin500m[i])
    const veto = vetoCore(inp.devClassCode[i], inp.subgroupCode[i])

    for (let k = 0; k < nHard; k++) {
      const s = hard[k]
      ranks[k] = s >= 0 ? ranksWhenKnown[k] : -1
      hardArrays[k][i] = s >= 0 ? s : NaN
    }
    F.M9[i] = mods[0] >= 0 ? mods[0] : NaN
    F.V[i] = veto < 0 ? NaN : veto

    out.composite[i] = compositeNumeric(hard, weights, mods, bands, veto === 0)
    out.confidence[i] = 1 + confidenceNumeric(ranks)
  }
  return out
}
