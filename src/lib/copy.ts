import type { Confidence } from '$lib/scoring/core/types'

// Finnish UI strings. Single-language site: no i18n framework by design.

export const SITE_NAME = 'lajikartat.fi'

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'korkea',
  med: 'kohtalainen',
  low: 'matala'
}

/** Compact axis labels for the factor star plot, keyed by the factor id in the D1 why JSON. */
export const FACTOR_SHORT_LABELS: Record<string, string> = {
  F1: 'Syrjäisyys',
  F2: 'Eristyneisyys',
  F3: 'Veden väri',
  F5: 'Koko'
}

export const COPY = {
  tagline: 'Lajikohtaisia potentiaalikarttoja avoimesta paikkatiedosta.',
  species: 'Lajit',
  openMap: 'Avaa kartta',
  home: 'Etusivulle',
  loading: 'Ladataan…',
  loadError: 'Lataus epäonnistui.',
  detailError: 'Tietojen lataus epäonnistui.',
  close: 'Sulje',
  potential: 'Potentiaali',
  potentialCaveat: 'Potentiaali vertailee alueita, ei ennusta saalista.',
  unknownSpecies: 'Tuntematon laji',
  reasons: 'Perustelut',
  noData: 'ei tietoa',
  unnamed: 'Nimetön',
  spot: 'Kohteen tiedot',
  layers: 'Tasot',
  basemap: 'Pohjakartta',
  minPotential: 'Potentiaali vähintään',
  copyCoords: 'Kopioi koordinaatit',
  openInMaps: 'Avaa Google Mapsissa',
  share: 'Jaa',
  copied: 'Kopioitu',
  sources: 'Aineistot ja vastuut',
  hobbyProject: 'avoin harrasteprojekti'
} as const

export const CALENDAR_COPY = {
  title: 'Sienikalenteri',
  subtitle: 'Sateet, lämpötila ja arvioitu sato',
  back: 'Takaisin karttaan',
  openCalendar: 'Avaa sienikalenteri',
  mapLocation: 'kartan sijainti',
  ownLocation: 'Oma sijainti',
  locate: 'Oma sijainti (GPS)',
  locating: 'Haetaan sijaintia…',
  locateFailed: 'Sijaintia ei saatu. Salli sijainnin käyttö tai valitse paikkakunta.',
  place: 'Paikka',
  why: 'Miksi',
  observed: 'havainnot',
  forecast: 'ennuste',
  projection: 'arvio ilman lisäsadetta',
  today: 'tänään',
  rain: 'Sade',
  temp: 'Lämpö',
  frost: 'yöpakkanen',
  trigger: 'satoa käynnistävä sade',
  triggerColors: 'oma väri joka sateelle',
  peakWindow: 'satohuippu',
  scoreGood: 'hyvä päivä',
  scoreOk: 'kohtalainen',
  scorePoor: 'heikko',
  loading: 'Haetaan säätietoja…',
  unavailable: 'Säätietoja ei saatu Ilmatieteen laitokselta. Yritä hetken päästä uudelleen.',
  attribution: 'Ilmatieteen laitos, havainnot ja ennuste',
  caveat: 'Arvio perustuu sademalliin, ei havaintoihin sienistä.',
  landerCardText: 'Milloin kantarellia ja suppilovahveroa kannattaa lähteä hakemaan. Sateista laskettu satoarvio.'
} as const

// Data sources behind the map layers. CC BY 4.0 attribution is a license requirement.
export const DATA_SOURCES = [
  { name: 'Maanmittauslaitos', url: 'https://www.maanmittauslaitos.fi/avoindata' },
  { name: 'Luonnonvarakeskus (Luke)', url: 'https://www.luke.fi/fi/avoin-tieto' },
  { name: 'Geologian tutkimuskeskus (GTK)', url: 'https://www.gtk.fi/palvelut/aineistot-ja-verkkopalvelut/' },
  { name: 'Suomen ympäristökeskus (SYKE)', url: 'https://www.syke.fi/fi/ymparistotieto/avoin-tieto' },
  { name: 'Ilmatieteen laitos', url: 'https://www.ilmatieteenlaitos.fi/avoin-data' }
] as const

/** Composite 0–1 → 0–100 index shown in the UI, e.g. 0.873 → 87. */
export function scoreIndex(composite: number): number {
  return Math.round(composite * 100)
}
