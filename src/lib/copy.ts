import type { Confidence } from '$lib/scoring/core/types'

// Shared Finnish UI terms. Anything used by ≥2 components lives here so the
// wording can't drift. Single-language site: no i18n framework by design.

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'korkea',
  med: 'kohtalainen',
  low: 'matala'
}

export const CONFIDENCE_CHIP_CLASSES: Record<Confidence, string> = {
  high: 'bg-green-100 text-green-800',
  med: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-200 text-gray-600'
}

/**
 * Compact axis labels for the factor star plot, keyed by the factor id baked
 * into the D1 why JSON. Fallback = the factor's full label.
 */
export const FACTOR_SHORT_LABELS: Record<string, string> = {
  F1: 'Syrjäisyys',
  F2: 'Eristyneisyys',
  F3: 'Veden väri',
  F5: 'Koko',
  M1: 'Puusto',
  M2: 'Kasvupaikka',
  M3: 'Ikä',
  M4: 'Valoisuus',
  M6: 'Reunat',
  M7: 'Maaperä',
  M9: 'Syrjäisyys'
}

export const COPY = {
  siteName: 'lajikartat.fi',
  loading: 'Ladataan…',
  loadError: 'Lataus epäonnistui.',
  detailError: 'Tietojen lataus epäonnistui.',
  close: 'Sulje',
  potential: 'Potentiaali',
  potentialCaveat: 'Potentiaali vertailee alueita, ei ennusta saalista.',
  confidence: 'Varmuus',
  unknownSpecies: 'Tuntematon laji',
  reasons: 'Perustelut',
  noData: 'ei tietoa',
  layers: 'Tasot',
  basemap: 'Pohjakartta',
  minPotential: 'Potentiaali vähintään',
  copyCoords: 'Kopioi koordinaatit',
  openInMaps: 'Avaa Google Mapsissa',
  share: 'Jaa',
  copied: 'Kopioitu'
} as const

// Data sources behind the candidate layers. CC BY 4.0 attribution is a
// license requirement once the site is public.
export const DATA_SOURCES = [
  { name: 'Maanmittauslaitos', url: 'https://www.maanmittauslaitos.fi/avoindata' },
  { name: 'Geologian tutkimuskeskus (GTK)', url: 'https://www.gtk.fi/palvelut/aineistot-ja-verkkopalvelut/' },
  { name: 'Suomen metsäkeskus', url: 'https://www.metsakeskus.fi/fi/avoin-metsa-ja-luontotieto' },
  { name: 'Suomen ympäristökeskus (SYKE)', url: 'https://www.syke.fi/fi/ymparistotieto/avoin-tieto' },
  { name: 'Ilmatieteen laitos', url: 'https://www.ilmatieteenlaitos.fi/avoin-data' }
] as const

/** Composite 0–1 → 0–100 index shown in the UI, e.g. 0.873 → 87. */
export function scoreIndex(composite: number): number {
  return Math.round(composite * 100)
}
