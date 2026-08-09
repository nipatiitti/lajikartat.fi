import { simplify } from '@turf/turf'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import { scoreChanterelle } from '@scoring'
import type { ChanterelleInput, ChanterelleVariant } from '@scoring'
import type { CandidateFeature, JoinContext, ScoredCandidate } from '../../kernel/types'
import { readStandAttributes } from './fields'

// GTK 1:200k surface-soil class attribute (validated live), e.g. "Saraturve (CT)",
// "Hiekka (Hk)", "Kalliopaljastuma (KaPa) RT".
const SOIL_CLASS_FIELD = 'PINTAMAALAJI'

/**
 * One scorer per variant, same joins: M1–M4 + vetoes read straight off the
 * stand's own attributes (fields.ts), M6/M7/M9 come from kernel spatial joins.
 * `hasLayer` guards keep a missing layer a null factor, never a fake zero.
 */
export function makeChanterelleScorer(variant: ChanterelleVariant) {
  return (candidate: CandidateFeature, ctx: JoinContext): ScoredCandidate => {
    // Coarsen the stand boundary once for all distance/intersection work.
    const stand = simplify(candidate.geometry, { tolerance: 0.0002, highQuality: false, mutate: false }) as Feature<
      Polygon | MultiPolygon
    >
    const attrs = readStandAttributes(candidate.geometry.properties)

    // M6 — layer present but nothing in range ⇒ genuinely far (cap), not "no data".
    const track = ctx.hasLayer('tracks') ? ctx.nearestLine(stand, 'tracks', 1000) : null
    const nearestTrackM = ctx.hasLayer('tracks') ? (track?.distanceM ?? 1000) : null
    const ditch = ctx.hasLayer('ditches') ? ctx.nearestLine(stand, 'ditches', 1000) : null
    const nearestDitchM = ctx.hasLayer('ditches') ? (ditch?.distanceM ?? 1000) : null
    const ditchesIntersectingCount = ctx.hasLayer('ditches') ? ctx.linesIntersecting(stand, 'ditches').length : null

    // M7 — GTK soil composition over the stand polygon (small → no memoisation).
    let peatFraction: number | null = null
    let rockFraction: number | null = null
    if (ctx.hasLayer('soil')) {
      const soil = ctx.areaFractionByClass(stand, 'soil', SOIL_CLASS_FIELD)
      const total = Object.values(soil).reduce((s, v) => s + v, 0)
      if (total > 0) {
        peatFraction = sumWhere(soil, (c) => c.includes('turve')) / total
        rockFraction = sumWhere(soil, (c) => c.includes('kallio') || c.includes('rakka')) / total
      }
    }

    // M9 — distance to the CAR-road network (tracks deliberately excluded — they
    // are an M6 positive) + settlement pressure.
    const road = ctx.hasLayer('roads') ? ctx.nearestLine(stand, 'roads', 3000) : null
    const nearestCarRoadM = ctx.hasLayer('roads') ? (road?.distanceM ?? 3000) : null
    const buildingsWithin500m = ctx.hasLayer('buildings') ? ctx.featuresWithin(stand, 'buildings', 500).length : null

    const input: ChanterelleInput = {
      pineShare: attrs.pineShare,
      spruceShare: attrs.spruceShare,
      otherShare: attrs.otherShare,
      mainTreeGroup: attrs.mainTreeGroup,
      fertilityClass: attrs.fertilityClass,
      subgroup: attrs.subgroup,
      devClass: attrs.devClass,
      meanAgeYears: attrs.meanAgeYears,
      basalAreaM2Ha: attrs.basalAreaM2Ha,
      twi: null, // M5 DEM-deferred
      slopeDeg: null,
      aspectDeg: null,
      nearestTrackM,
      nearestDitchM,
      ditchesIntersectingCount,
      isDrainedPeatland: attrs.isDrainedPeatland,
      peatFraction,
      rockFraction,
      standSoil: attrs.standSoil,
      occurrenceWithin1kmCount: null, // M8 deferred
      nearestCarRoadM,
      buildingsWithin500m
    }

    const r = scoreChanterelle(input, variant)
    return { composite: r.composite, confidence: r.confidence, factors: r.factors, why: r.why }
  }
}

function sumWhere(fractions: Record<string, number>, pred: (lowerClass: string) => boolean): number {
  let sum = 0
  for (const [cls, frac] of Object.entries(fractions)) if (pred(cls.toLowerCase())) sum += frac
  return sum
}
