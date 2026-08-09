import type { SortMode } from '$lib/map/types'
import type { Confidence } from '$lib/scoring/core/types'

// Shared Finnish UI terms — anything used by ≥2 components lives here so the
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

export const SORT_LABELS: Record<SortMode, string> = {
  score: 'Potentiaali',
  distance: 'Etäisyys',
  size: 'Koko'
}

export const COPY = {
  siteName: 'lajikartat.fi',
  loading: 'Ladataan…',
  loadError: 'Lataus epäonnistui.',
  detailError: 'Tietojen lataus epäonnistui.',
  close: 'Sulje',
  potential: 'Potentiaali',
  confidence: 'Varmuus',
  unknownSpecies: 'Tuntematon laji'
} as const

// Data sources behind the candidate layers — CC BY 4.0 attribution is a
// license requirement once the site is public.
export const DATA_SOURCES = [
  { name: 'Maanmittauslaitos', url: 'https://www.maanmittauslaitos.fi/avoindata' },
  { name: 'Geologian tutkimuskeskus (GTK)', url: 'https://www.gtk.fi/palvelut/aineistot-ja-verkkopalvelut/' },
  { name: 'Suomen metsäkeskus', url: 'https://www.metsakeskus.fi/fi/avoin-metsa-ja-luontotieto' },
  { name: 'Suomen ympäristökeskus (SYKE)', url: 'https://www.syke.fi/fi/ymparistotieto/avoin-tieto' },
  { name: 'Ilmatieteen laitos', url: 'https://www.ilmatieteenlaitos.fi/avoin-data' }
] as const

/** Composite 0–1 → display percent, e.g. 0.873 → "87 %". */
export function formatPercent(composite: number): string {
  return `${Math.round(composite * 100)} %`
}
