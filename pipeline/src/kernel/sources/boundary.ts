import type { RegionMask } from '../types'
import { reprojectPoint3067to4326 } from '../reproject'

type Bbox = [number, number, number, number]

/**
 * Build the clip mask for a region. v1 clips by the 3067 bbox only (polygon
 * null) — good enough to validate the pipeline. A precise maakunta polygon
 * (MML administrative boundaries / Tilastokeskus) is a follow-up data-layer task.
 */
export function buildRegionMask(id: string, bbox3067: Bbox): RegionMask {
  const [minX, minY, maxX, maxY] = bbox3067
  const [minLng, minLat] = reprojectPoint3067to4326([minX, minY])
  const [maxLng, maxLat] = reprojectPoint3067to4326([maxX, maxY])
  return { id, polygon: null, bbox: [minLng, minLat, maxLng, maxLat] }
}
