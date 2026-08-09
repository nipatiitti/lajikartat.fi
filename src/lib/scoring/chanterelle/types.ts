export type ChanterelleVariant = 'kantarelli' | 'suppilovahvero'

/** Semantic development class, mapped from Metsäkeskus DEVELOPMENTCLASS codes
 * (A0→open; S0/T1/T2/Y1→seedling; 02→young; 03→middle; 04→mature; 05→shelterwood;
 * ER→unevenAged) by the pipeline plugin. */
export type DevClass = 'open' | 'seedling' | 'young' | 'middle' | 'mature' | 'shelterwood' | 'unevenAged'

/** Semantic peatland subgroup (Metsäkeskus SUBGROUP: 1 kangas, 2 korpi, 3 räme, 4/5 open mire). */
export type Subgroup = 'kangas' | 'korpi' | 'rame' | 'openMire'

/** Stand-level dominant soil, mapped from Metsäkeskus SOILTYPE (fallback when GTK is missing). */
export type StandSoil = 'mineral' | 'peat' | 'rock' | 'other'

export type MainTreeGroup = 'pine' | 'spruce' | 'deciduous' | 'otherConifer'

/**
 * Already-joined inputs for the chanterelle limiting-factor model, shared by both
 * variants ([K] kantarelli / [S] suppilovahvero — same shape, different parameters).
 * The ETL composes these from Metsäkeskus stand attributes + kernel spatial joins;
 * the scoring library stays pure. M5 (DEM/TWI) and M8 (occurrence) are present in
 * the shape but fed `null` in the v1 cut — the geometric mean carries on without
 * them, exactly like trout's DEM-deferred factors. (species/chantarelle.md §3, §6)
 */
export interface ChanterelleInput {
  // M1 — host trees & mix (Metsäkeskus volume proportions, 0..1, sum ≈ 1).
  pineShare: number | null
  spruceShare: number | null
  otherShare: number | null // deciduous + minority species
  mainTreeGroup: MainTreeGroup | null // lower-confidence fallback when shares are missing

  // M2 — site fertility (kasvupaikkatyyppi 1..8; 3 = tuore kangas optimum) + peatland context.
  fertilityClass: number | null
  subgroup: Subgroup | null

  // M3 — stand maturity.
  devClass: DevClass | null
  meanAgeYears: number | null

  // M4 — canopy / light. No canopy-% in the stand data; basal area is the light proxy.
  basalAreaM2Ha: number | null

  // M5 — moisture & micro-topography (DEM/TWI) — deferred, always null in v1.
  twi: number | null
  slopeDeg: number | null
  aspectDeg: number | null

  // M6 — edge & disturbance proximity (stand-level: microsite signal coarsens to the stand).
  nearestTrackM: number | null // min distance to forest track (ajotie) / path
  nearestDitchM: number | null // narrow watercourse < 2 m ≈ ditch in managed forest
  ditchesIntersectingCount: number | null
  isDrainedPeatland: boolean | null // DRAINAGESTATE drained → internal ditch network

  // M7 — soil: GTK fractions over the stand polygon; stand SOILTYPE as fallback.
  peatFraction: number | null
  rockFraction: number | null
  standSoil: StandSoil | null

  // M8 — known occurrence — deferred, always null in v1.
  occurrenceWithin1kmCount: number | null

  // M9 — remoteness / picking pressure (mild modulator; mycelium is renewable).
  nearestCarRoadM: number | null
  buildingsWithin500m: number | null
}
