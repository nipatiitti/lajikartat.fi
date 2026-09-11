// Client-side render config per species — mirrors the server plugin's `render` so the
// `/[species]` route stays generic. Adding a species = adding an entry here + a server
// plugin; the map page never changes.

export interface SpeciesCopy {
  /** Nominative singular: "lampi", "metsikkö". */
  singular: string
  /** Nominative plural: "lammet", "metsiköt" — also the layer toggle label. */
  plural: string
  /** Partitive singular for counts: "1 520 metsikköä", "231 lampea". */
  partitive: string
}

interface SpeciesRenderBase {
  /** Display name for the species. */
  label: string
  /** Region the dataset covers ("Pirkanmaa"); raster species read the live value from the tile descriptor. */
  regionLabel: string
  /** What one candidate unit is called in UI copy. */
  copy: SpeciesCopy
  /** Lander card text. */
  description: string
  /** "Näin luet karttaa" blurb on the lander. */
  howToRead: string
  /** Show the FMI picking pill (fungi). */
  showConditions?: boolean
  /** [value, colour] stops for the colour ramp, ascending — diverging blue→red. */
  ramp: Array<[number, string]>
  /** Initial map camera (used only when the URL carries no camera hash). */
  initialView: { center: [number, number]; zoom: number }
}

/** Discrete candidates: polygons at all zooms, or a heatmap→polygon crossfade. Tappable. */
export interface VectorSpeciesConfig extends SpeciesRenderBase {
  render: 'polygon' | 'heatmap'
  /** R2-backed GeoJSON endpoint with `composite`/`confidence`/`name`/`areaHa` per feature. */
  geometryUrl: string
  /** Point blob for the heatmap (heatmap species only). */
  centroidsUrl?: string
  /** Feature property driving the colour ramp. */
  colorBy: 'composite'
}

/** Continuous 16 m suitability surface served as raster tiles. Nothing to tap. */
export interface RasterSpeciesConfig extends SpeciesRenderBase {
  render: 'raster'
  /** Tile descriptor endpoint (`/tiles/<species>.json`). */
  tilesUrl: string
}

export type SpeciesRenderConfig = VectorSpeciesConfig | RasterSpeciesConfig

// RdYlBu-reversed: low scores cool/blue, top candidates hot/red.
const DIVERGING_RAMP: Array<[number, string]> = [
  [0.3, '#4575b4'],
  [0.45, '#91bfdb'],
  [0.55, '#fee090'],
  [0.65, '#fc8d59'],
  [0.8, '#d73027']
]

const FUNGI_COPY: SpeciesCopy = { singular: 'ruutu', plural: 'soveltuvuuskartta', partitive: 'ruutua' }
const FUNGI_HOW_TO_READ =
  'Kartta näyttää soveltuvuuden 16 metrin ruuduissa: punainen on lupaavin. Arvio perustuu Luken ' +
  'metsävarakarttoihin, maaston kosteuteen sekä polkujen, ojien ja metsikönreunojen läheisyyteen. ' +
  'Lähennä, niin reunat ja notkot piirtyvät esiin. Se ei takaa sieniä, vaan kertoo mistä kannattaa aloittaa.'

export const SPECIES_RENDER: Record<string, SpeciesRenderConfig> = {
  ahven: {
    label: 'Iso ahven',
    regionLabel: 'Pirkanmaa',
    copy: { singular: 'lampi', plural: 'lammet', partitive: 'lampea' },
    description:
      'Syrjäisiä pikkulampia, joissa iso ahven on todennäköisimmin saanut kasvaa rauhassa. ' +
      'Potentiaali suosii vaikeapääsyisiä, eristyneitä ja kirkasvetisiä lampia.',
    howToRead:
      'Lammet värittyvät potentiaalin mukaan: punainen on lupaavin. Arvio perustuu avoimeen ' +
      'paikkatietoon (syrjäisyys, puroyhteydet, valuma-alueen maaperä ja lammen koko). ' +
      'Se ei takaa kalaa, vaan kertoo mistä kannattaa aloittaa.',
    geometryUrl: '/geometry/ahven',
    render: 'polygon',
    colorBy: 'composite',
    ramp: DIVERGING_RAMP,
    // Pirkanmaa, centred north of Tampere.
    initialView: { center: [23.8, 61.7], zoom: 8 }
  },
  kantarelli: {
    label: 'Kantarelli',
    regionLabel: 'Pirkanmaa',
    copy: FUNGI_COPY,
    description:
      'Valoisia sekametsiä, polunvarsia ja kangasmaita, joissa kantarellin löytymisen ' + 'edellytykset ovat parhaat.',
    howToRead: FUNGI_HOW_TO_READ,
    tilesUrl: '/tiles/kantarelli.json',
    render: 'raster',
    showConditions: true,
    ramp: DIVERGING_RAMP,
    initialView: { center: [23.7, 61.43], zoom: 11 }
  },
  suppilovahvero: {
    label: 'Suppilovahvero',
    regionLabel: 'Pirkanmaa',
    copy: FUNGI_COPY,
    description: 'Varjoisia, sammaleisia kuusikoita ja ojanvarsia, suppilovahveron syksyisiä kasvupaikkoja.',
    howToRead: FUNGI_HOW_TO_READ,
    tilesUrl: '/tiles/suppilovahvero.json',
    render: 'raster',
    showConditions: true,
    ramp: DIVERGING_RAMP,
    initialView: { center: [23.7, 61.43], zoom: 11 }
  }
}

export const speciesIds = Object.keys(SPECIES_RENDER)
