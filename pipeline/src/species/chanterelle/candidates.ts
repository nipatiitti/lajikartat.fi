import { area, booleanPointInPolygon, centroid } from '@turf/turf'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import type { CandidateFeature, LayerBundle, RegionMask } from '../../kernel/types'
import { readStandAttributes } from './fields'

const M2_PER_HA = 10_000
const MIN_HA = 0.5 // below this a stand is noise at map scale
const MAX_HA = 100

/**
 * Metsäkeskus stands → candidates. Extraction-time vetoes (non-forest land,
 * clearcut/seedling development classes) drop here rather than at scoring —
 * they carry zero information and at full-region scale they're ~a third of the
 * volume. Tile-fetched stands overlap on borders → dedupe by feature id
 * (GeoServer ids are stable: "stand.30307568").
 */
export function extractChanterelleCandidates(bundle: LayerBundle, region: RegionMask): CandidateFeature[] {
  const out: CandidateFeature[] = []
  const seen = new Set<string>()

  for (const f of bundle.stands?.features ?? []) {
    if (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon') continue
    const poly = f as Feature<Polygon | MultiPolygon>

    const id = featureId(poly)
    if (seen.has(id)) continue
    seen.add(id)

    const attrs = readStandAttributes(poly.properties)
    if (attrs.isForestLand === false) continue // kitumaa/joutomaa/tontti/pelto/vesi
    if (attrs.devClass === 'open' || attrs.devClass === 'seedling') continue // veto at extraction

    const areaHa = attrs.areaHa ?? area(poly) / M2_PER_HA
    if (areaHa < MIN_HA || areaHa > MAX_HA) continue
    if (region.polygon && !booleanPointInPolygon(centroid(poly), region.polygon)) continue

    // Stands are unnamed — the map shows them by score, the why-panel by id.
    out.push({ id, name: null, geometry: poly, areaHa })
  }
  return out
}

function featureId(f: Feature): string {
  if (f.id != null) return String(f.id)
  const p = f.properties ?? {}
  return String(p.gid ?? p.id ?? crypto.randomUUID())
}
