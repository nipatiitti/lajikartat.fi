import { centroid, length, simplify } from '@turf/turf'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import { scorePerch, type PerchInput } from '@scoring'
import type { CandidateFeature, JoinContext, ScoredCandidate } from '../../kernel/types'
import { M2_PER_HA } from './candidates'

// GTK 1:200k surface-soil class attribute (validated live), e.g. "Saraturve (CT)",
// "Hiekka (Hk)", "Kalliopaljastuma (KaPa) RT".
const SOIL_CLASS_FIELD = 'PINTAMAALAJI'
const ROAD_SEARCH_M = 3000
/** Shoreline simplification for distance work; F1/F2 do not need every vertex. */
const SHORELINE_TOLERANCE_DEG = 0.0002

/** Compose the kernel spatial primitives into a PerchInput, then score it. */
export function scorePerchCandidate(candidate: CandidateFeature, ctx: JoinContext): ScoredCandidate {
  const pond = simplify(candidate.geometry, {
    tolerance: SHORELINE_TOLERANCE_DEG,
    highQuality: false,
    mutate: false
  }) as Feature<Polygon | MultiPolygon>
  const center = centroid(pond)

  // F1 — roads present but none within range ⇒ very remote (cap), not "no data".
  const road = ctx.hasLayer('roads') ? ctx.nearestLine(pond, 'roads', ROAD_SEARCH_M) : null
  const nearestRoadDistanceM = ctx.hasLayer('roads') ? (road ? road.distanceM : ROAD_SEARCH_M) : null
  const buildingsWithin100m = ctx.hasLayer('buildings') ? ctx.featuresWithin(pond, 'buildings', 100).length : null

  // F2
  const connectingStreamCount = ctx.hasLayer('streams') ? ctx.linesIntersecting(pond, 'streams').length : null

  // F3 — water-colour proxy: peat vs mineral/esker composition of the pond's
  // catchment (SYKE TASO5), classified from GTK surface soil.
  let peatFraction: number | null = null
  let eskerFraction: number | null = null
  if (ctx.hasLayer('soil') && ctx.hasLayer('catchments')) {
    const catchment = ctx.containingPolygon(center, 'catchments')
    const comp = catchment && catchmentComposition(catchment, ctx)
    if (comp) {
      peatFraction = comp.peat
      eskerFraction = comp.esker
    }
  }

  // F5 — perimeter from the FULL geometry for an accurate shoreline-development ratio.
  // Perch candidates are always area-bearing polygons, so areaHa is non-null here.
  const areaHa = candidate.areaHa ?? 0
  const perimeterM = length(candidate.geometry, { units: 'kilometers' }) * 1000
  const areaM2 = areaHa * M2_PER_HA
  const shorelineDevelopment = areaM2 > 0 ? perimeterM / (2 * Math.sqrt(Math.PI * areaM2)) : null

  const input: PerchInput = {
    nearestRoadDistanceM,
    buildingsWithin100m,
    isNamed: candidate.name !== null,
    connectingStreamCount,
    isHeadwater: null,
    peatFraction,
    eskerFraction,
    areaHa,
    shorelineDevelopment,
    maxDepthM: null
  }

  const r = scorePerch(input)
  return { composite: r.composite, confidence: r.confidence, why: r.why }
}

// Catchment soil composition, memoised per tile context by catchment id (TASO5
// osatunnus): many ponds in a tile share one catchment and the clip is costly.
// The renormalisation by sampled soil keeps partial tile-edge coverage meaningful.
const catchmentCaches = new WeakMap<JoinContext, Map<string, { peat: number; esker: number } | null>>()

function catchmentComposition(
  catchment: Feature<Polygon | MultiPolygon>,
  ctx: JoinContext
): { peat: number; esker: number } | null {
  let cache = catchmentCaches.get(ctx)
  if (!cache) {
    cache = new Map()
    catchmentCaches.set(ctx, cache)
  }
  const id = catchmentId(catchment)
  const cached = cache.get(id)
  if (cached !== undefined) return cached

  const soil = ctx.areaFractionByClass(catchment, 'soil', SOIL_CLASS_FIELD)
  const total = Object.values(soil).reduce((s, v) => s + v, 0)
  const comp = total > 0 ? { peat: peatShare(soil) / total, esker: eskerShare(soil) / total } : null
  cache.set(id, comp)
  return comp
}

function catchmentId(f: Feature<Polygon | MultiPolygon>): string {
  const p = f.properties ?? {}
  return String(p.taso5_osatunnus ?? p.objectid ?? f.id ?? '')
}

/** Peat soils (Saraturve/Rahkaturve/Turve) → browner water. */
export function peatShare(fractions: Record<string, number>): number {
  return sumWhere(fractions, (c) => c.includes('turve'))
}

/**
 * Sorted glaciofluvial deposits (gravel/sand/esker) → clearer water. Excludes
 * `moreeni` (till) so the esker bonus stays a real discriminator, not ubiquitous.
 */
export function eskerShare(fractions: Record<string, number>): number {
  return sumWhere(
    fractions,
    (c) => !c.includes('moreeni') && (c.includes('sora') || c.includes('hiekka') || c.includes('harju'))
  )
}

function sumWhere(fractions: Record<string, number>, pred: (lowerClass: string) => boolean): number {
  let sum = 0
  for (const [cls, frac] of Object.entries(fractions)) if (pred(cls.toLowerCase())) sum += frac
  return sum
}
