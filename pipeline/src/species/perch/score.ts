import { centroid, length, simplify } from '@turf/turf'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import { scorePerch } from '@scoring'
import type { AccessType, PerchInput } from '@scoring'
import type { CandidateFeature, JoinContext, ScoredCandidate } from '../../kernel/types'

// GTK 1:200k surface-soil class attribute (validated live), e.g. "Saraturve (CT)",
// "Hiekka (Hk)", "Kalliopaljastuma (KaPa) RT".
const SOIL_CLASS_FIELD = 'PINTAMAALAJI'

/** Compose the kernel spatial primitives into a PerchInput, then score it. */
export function scorePerchCandidate(candidate: CandidateFeature, ctx: JoinContext): ScoredCandidate {
  // Coarsen the shoreline once for distance/intersection work — F1/F2 don't need
  // every vertex, and a detailed 39 ha pond is otherwise O(thousands) per call.
  const pond = simplify(candidate.geometry, { tolerance: 0.0002, highQuality: false, mutate: false })
  const center = centroid(pond)

  // F1 — roads present but none within range ⇒ very remote (cap), not "no data".
  const road = ctx.hasLayer('roads') ? ctx.nearestLine(pond, 'roads', 3000) : null
  const nearestRoadDistanceM = ctx.hasLayer('roads') ? (road ? road.distanceM : 3000) : null
  const accessType = road ? accessFromRoad(road.properties) : null
  const buildingsWithin100m = ctx.hasLayer('buildings') ? ctx.featuresWithin(pond, 'buildings', 100).length : null

  // F2
  const connectingStreamCount = ctx.hasLayer('streams') ? ctx.linesIntersecting(pond, 'streams').length : null

  // F3 — water-colour proxy: peat vs mineral/esker composition of the pond's
  // catchment (SYKE TASO5), classified from GTK surface soil. Memoised per
  // catchment — many ponds in a tile share one, and the clip is costly.
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
  const perimeterM = length(candidate.geometry, { units: 'kilometers' }) * 1000
  const areaM2 = candidate.areaHa * 10_000
  const shorelineDevelopment = areaM2 > 0 ? perimeterM / (2 * Math.sqrt(Math.PI * areaM2)) : null

  const input: PerchInput = {
    nearestRoadDistanceM,
    accessType,
    buildingsWithin100m,
    isNamed: candidate.name !== null,
    connectingStreamCount,
    isHeadwater: null,
    peatFraction,
    eskerFraction,
    areaHa: candidate.areaHa,
    shorelineDevelopment,
    maxDepthM: null
  }

  const r = scorePerch(input)
  return { composite: r.composite, confidence: r.confidence, factors: r.factors, why: r.why }
}

// TODO: map the MML road-class attribute (kohdeluokka) to an AccessType. Until
// validated, return null so F1 stays distance-driven.
function accessFromRoad(_props: Record<string, unknown>): AccessType | null {
  return null
}

// Catchment soil composition, memoised by catchment id (TASO5 osatunnus). The
// renormalisation by sampled soil keeps partial tile-edge coverage meaningful.
const catchmentCache = new Map<string, { peat: number; esker: number } | null>()

function catchmentComposition(
  catchment: Feature<Polygon | MultiPolygon>,
  ctx: JoinContext
): { peat: number; esker: number } | null {
  const id = catchmentId(catchment)
  const cached = catchmentCache.get(id)
  if (cached !== undefined) return cached

  const soil = ctx.areaFractionByClass(catchment, 'soil', SOIL_CLASS_FIELD)
  const total = Object.values(soil).reduce((s, v) => s + v, 0)
  const comp = total > 0 ? { peat: peatShare(soil) / total, esker: eskerShare(soil) / total } : null
  catchmentCache.set(id, comp)
  return comp
}

function catchmentId(f: Feature<Polygon | MultiPolygon>): string {
  const p = f.properties ?? {}
  return String(p.taso5_osatunnus ?? p.objectid ?? f.id ?? '')
}

// Peat soils (Saraturve/Rahkaturve/Turve) → browner water.
function peatShare(fractions: Record<string, number>): number {
  return sumWhere(fractions, (c) => c.includes('turve'))
}

// Sorted glaciofluvial deposits (gravel/sand/esker) → clearer water. Excludes
// `moreeni` (till) so the esker bonus stays a real discriminator, not ubiquitous.
function eskerShare(fractions: Record<string, number>): number {
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
