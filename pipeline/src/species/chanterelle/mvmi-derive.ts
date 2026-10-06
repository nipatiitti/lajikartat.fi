import { DEV_CLASS_CODES, SUBGROUP_CODES } from '@scoring'

// Thresholds that turn MVMI cell estimates into the categorical inputs the
// scoring model was designed around. One object so calibration edits one place.
export const MVMI_DERIVE = {
  /** Mean height (dm) below which a cell is an open / fresh regeneration area. */
  openMaxHeightDm: 13,
  /** Volume (m³/ha) below which a cell is open regardless of height. */
  openMaxVolume: 5,
  /** Mean height (dm) below which a cell is a seedling stand (taimikko). */
  seedlingMaxHeightDm: 70,
  /** Age (years) below which a stand is young (nuori kasvatusmetsä). */
  youngMaxAge: 40,
  /** Age (years) below which a stand is middle-aged (varttunut); ≥ → mature. */
  middleMaxAge: 70,
  /** TWI raster stores the index ×1000. */
  twiScale: 1000,
  /** A ditch this close (m) to a peatland cell marks it as drained. */
  drainedDitchM: 60,
  /** M6 / M9 distance caps (m): beyond these a cell is "far", not unknown. */
  edgeCapM: 1000,
  carRoadCapM: 3000,
  /** M9 building count box half-width (m). */
  buildingsRadiusM: 500
} as const

const DEV_OPEN = DEV_CLASS_CODES.indexOf('open')
const DEV_SEEDLING = DEV_CLASS_CODES.indexOf('seedling')
const DEV_YOUNG = DEV_CLASS_CODES.indexOf('young')
const DEV_MIDDLE = DEV_CLASS_CODES.indexOf('middle')
const DEV_MATURE = DEV_CLASS_CODES.indexOf('mature')

/** Development-class code from MVMI age / mean height (dm) / volume; NaN = unknown; −1 when nothing is known. */
export function deriveDevClassCode(ikaYears: number, heightDm: number, volume: number): number {
  const d = MVMI_DERIVE
  const hasH = heightDm === heightDm
  const hasV = volume === volume
  const hasA = ikaYears === ikaYears
  if (
    (hasH && heightDm < d.openMaxHeightDm) ||
    (hasV && volume < d.openMaxVolume && (!hasH || heightDm < d.seedlingMaxHeightDm))
  )
    return DEV_OPEN
  if (hasH && heightDm < d.seedlingMaxHeightDm) return DEV_SEEDLING
  if (!hasA) return -1
  if (ikaYears < d.youngMaxAge) return DEV_YOUNG
  if (ikaYears < d.middleMaxAge) return DEV_MIDDLE
  return DEV_MATURE
}

// MVMI paatyyppi 1 kangas, 2 korpi, 3 räme, 4 avosuo.
const SUBGROUP_BY_PAATYYPPI = ['kangas', 'korpi', 'rame', 'openMire'].map((s) =>
  SUBGROUP_CODES.indexOf(s as (typeof SUBGROUP_CODES)[number])
)

/** MVMI paatyyppi → SUBGROUP_CODES index, −1 when out of range. */
export function subgroupFromPaatyyppi(paatyyppi: number): number {
  return paatyyppi >= 1 && paatyyppi <= 4 ? SUBGROUP_BY_PAATYYPPI[paatyyppi - 1] : -1
}
