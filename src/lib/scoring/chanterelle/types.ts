export type ChanterelleVariant = 'kantarelli' | 'suppilovahvero'

/** Semantic development class. The stand pipeline mapped Metsäkeskus
 * DEVELOPMENTCLASS codes (A0→open; S0/T1/T2/Y1→seedling; 02→young; 03→middle;
 * 04→mature; 05→shelterwood; ER→unevenAged); the raster pipeline derives it
 * from MVMI age / height / volume. */
export type DevClass = 'open' | 'seedling' | 'young' | 'middle' | 'mature' | 'shelterwood' | 'unevenAged'

/** Semantic peatland subgroup (Metsäkeskus SUBGROUP / MVMI paatyyppi: 1 kangas, 2 korpi, 3 räme, 4 open mire). */
export type Subgroup = 'kangas' | 'korpi' | 'rame' | 'openMire'

/** Stand-level dominant soil, mapped from Metsäkeskus SOILTYPE (fallback when GTK is missing). */
export type StandSoil = 'mineral' | 'peat' | 'rock' | 'other'

export type MainTreeGroup = 'pine' | 'spruce' | 'deciduous' | 'otherConifer'

/**
 * Already-joined inputs for the chanterelle limiting-factor model, shared by both
 * variants ([K] kantarelli / [S] suppilovahvero — same shape, different parameters).
 * The ETL composes these from stand attributes or per-cell rasters + kernel
 * spatial joins; the scoring library stays pure. Any field may be null: the
 * geometric mean carries on without it (unknown ≠ bad). M8 (occurrence) is in
 * the shape but unused — occurrence data validates the model, never feeds it.
 * (species/chantarelle.md §3, §5)
 */
export interface ChanterelleInput {
  // M1 — host trees & mix (volume proportions, 0..1, sum ≈ 1).
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

  // M4 — canopy / light: basal area proxies closure; canopy cover % (MVMI latvuspeitto) is the direct measure.
  basalAreaM2Ha: number | null
  canopyCoverPct: number | null

  // M5 — moisture & micro-topography (Luke TWI; slope/aspect reserved).
  twi: number | null
  slopeDeg: number | null
  aspectDeg: number | null

  // M6 — edge & disturbance proximity (metres).
  nearestTrackM: number | null // min distance to forest track (ajotie) / path
  nearestDitchM: number | null // narrow watercourse < 2 m ≈ ditch in managed forest
  nearestStandEdgeM: number | null // distance to a stand boundary (age / height discontinuity)
  ditchesIntersectingCount: number | null
  isDrainedPeatland: boolean | null // drained → internal ditch network

  // M7 — soil: GTK fractions (or per-cell classes); stand SOILTYPE as fallback.
  peatFraction: number | null
  rockFraction: number | null
  standSoil: StandSoil | null

  // M8 — known occurrence — reserved, unused.
  occurrenceWithin1kmCount: number | null

  // M9 — remoteness / picking pressure (mild modulator; mycelium is renewable).
  nearestCarRoadM: number | null
  buildingsWithin500m: number | null
}
