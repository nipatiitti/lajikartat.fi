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
  /** TWI raster stores the index ×1000 (probed 2026-09-11: 3361..21597 in Pirkkala). */
  twiScale: 1000,
  /** A ditch this close (m) to a peatland cell marks it as drained. */
  drainedDitchM: 60
} as const

// DEV_CLASS_CODES order: open 0, seedling 1, young 2, middle 3, mature 4.
export const DEV_OPEN = 0
export const DEV_SEEDLING = 1
export const DEV_YOUNG = 2
export const DEV_MIDDLE = 3
export const DEV_MATURE = 4

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

/** MVMI paatyyppi (1 kangas, 2 korpi, 3 räme, 4 avosuo) → SUBGROUP_CODES index. */
export function subgroupFromPaatyyppi(paatyyppi: number): number {
  return paatyyppi >= 1 && paatyyppi <= 4 ? paatyyppi - 1 : -1
}
