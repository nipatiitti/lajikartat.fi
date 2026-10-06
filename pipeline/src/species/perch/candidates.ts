import { area } from '@turf/turf'
import type { Feature, GeoJsonProperties, MultiPolygon, Polygon } from 'geojson'
import type { CandidateFeature, LayerBundle } from '../../kernel/types'

export const M2_PER_HA = 10_000
const MIN_HA = 0.5
const MAX_HA = 50 // target 0.5–20 ha; extend to ~50 ha for "medium" (species/perch.md §F5)

/** Filter standing-water polygons to candidate ponds by area band. */
export function extractPerchCandidates(bundle: LayerBundle): CandidateFeature[] {
  const out: CandidateFeature[] = []
  for (const f of bundle.water?.features ?? []) {
    if (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon') continue
    const poly = f as Feature<Polygon | MultiPolygon>
    const areaHa = area(poly) / M2_PER_HA
    if (areaHa < MIN_HA || areaHa > MAX_HA) continue
    out.push({ id: featureId(poly), name: pickName(poly.properties), geometry: poly, areaHa })
  }
  return out
}

export function featureId(f: Feature): string {
  if (f.id != null) return String(f.id)
  const p = f.properties ?? {}
  return String(p.localId ?? p.mtk_id ?? p.gid ?? p.id ?? crypto.randomUUID())
}

export function pickName(props: GeoJsonProperties): string | null {
  const p = props ?? {}
  for (const k of ['nimi', 'nimi_suomi', 'nimisuomi', 'kohdenimi', 'teksti', 'name']) {
    const v = p[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}
