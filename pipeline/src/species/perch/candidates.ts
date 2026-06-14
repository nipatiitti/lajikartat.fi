import { area, booleanPointInPolygon, centroid } from '@turf/turf'
import type { Feature, GeoJsonProperties, MultiPolygon, Polygon } from 'geojson'
import type { CandidateFeature, LayerBundle, RegionMask } from '../../kernel/types'

const M2_PER_HA = 10_000
const MIN_HA = 0.5
const MAX_HA = 50 // target 0.5–20 ha; extend to ~50 ha for "medium" (perch.md §F5)

/** Filter standing-water polygons to candidate ponds (area band, clipped to region). */
export function extractPerchCandidates(bundle: LayerBundle, region: RegionMask): CandidateFeature[] {
  const out: CandidateFeature[] = []
  for (const f of bundle.water?.features ?? []) {
    if (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon') continue
    const poly = f as Feature<Polygon | MultiPolygon>
    const areaHa = area(poly) / M2_PER_HA
    if (areaHa < MIN_HA || areaHa > MAX_HA) continue
    if (region.polygon && !booleanPointInPolygon(centroid(poly), region.polygon)) continue
    out.push({ id: featureId(poly), name: pickName(poly.properties), geometry: poly, areaHa })
  }
  return out
}

function featureId(f: Feature): string {
  if (f.id != null) return String(f.id)
  const p = f.properties ?? {}
  return String(p.localId ?? p.mtk_id ?? p.gid ?? p.id ?? crypto.randomUUID())
}

function pickName(props: GeoJsonProperties): string | null {
  const p = props ?? {}
  for (const k of ['nimi', 'nimi_suomi', 'nimisuomi', 'kohdenimi', 'teksti', 'name']) {
    const v = p[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}
