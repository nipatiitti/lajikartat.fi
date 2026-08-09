// Client-side render config per species — mirrors the server plugin's `render` so the
// `/[species]` route stays generic. Adding a species = adding an entry here + a server
// plugin; the map page never changes.

export interface SpeciesCopy {
  /** Nominative singular: "lampi", "metsikkö". */
  singular: string
  /** Nominative plural: "lammet", "metsiköt". */
  plural: string
  /** Partitive singular for counts: "1 520 metsikköä", "231 lampea". */
  partitive: string
}

export interface SpeciesRenderConfig {
  /** Display name for the species. */
  label: string
  /** Region the current dataset covers ("Pirkanmaa", "Pirkkala"). */
  regionLabel: string
  /** What one candidate unit is called in UI copy. */
  copy: SpeciesCopy
  /** Lander card text. */
  description: string
  /** "Näin luet karttaa" blurb on the lander. */
  howToRead: string
  /** R2-backed GeoJSON endpoint with `composite`/`confidence`/`name`/`areaHa` per feature. */
  geometryUrl: string
  /** Point blob for the heatmap (heatmap species only). */
  centroidsUrl?: string
  /** How candidates render: polygons at all zooms, or heatmap→polygon crossfade. */
  render: 'polygon' | 'heatmap'
  /** Show the FMI conditions chip (fungi). */
  showConditions?: boolean
  /** Feature property driving the colour ramp. */
  colorBy: 'composite'
  /** [value, colour] stops for the fill ramp, ascending — diverging blue→red. */
  ramp: Array<[number, string]>
  /** Initial map camera (used only when the URL carries no camera hash). */
  initialView: { center: [number, number]; zoom: number }
}

// RdYlBu-reversed: low scores cool/blue, top candidates hot/red.
const DIVERGING_RAMP: Array<[number, string]> = [
  [0.3, '#4575b4'],
  [0.45, '#91bfdb'],
  [0.55, '#fee090'],
  [0.65, '#fc8d59'],
  [0.8, '#d73027']
]

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
      'paikkatietoon — syrjäisyyteen, puroyhteyksiin, valuma-alueen maaperään ja lammen kokoon. ' +
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
    regionLabel: 'Pirkkala',
    copy: { singular: 'metsikkö', plural: 'metsiköt', partitive: 'metsikköä' },
    description:
      'Valoisia sekametsiä, polunvarsia ja kangasmaita, joissa kantarellin löytymisen ' + 'edellytykset ovat parhaat.',
    howToRead:
      'Kaukaa kartta näyttää lämpökarttana, minne lupaavimmat metsiköt keskittyvät. Lähennä, ' +
      'niin yksittäiset metsiköt piirtyvät esiin — napauttamalla näet perustelut ja varmuuden.',
    geometryUrl: '/geometry/kantarelli',
    centroidsUrl: '/geometry/kantarelli?kind=centroids',
    render: 'heatmap',
    showConditions: true,
    colorBy: 'composite',
    ramp: DIVERGING_RAMP,
    // The Pirkkala validation forests.
    initialView: { center: [23.7, 61.43], zoom: 12 }
  },
  suppilovahvero: {
    label: 'Suppilovahvero',
    regionLabel: 'Pirkkala',
    copy: { singular: 'metsikkö', plural: 'metsiköt', partitive: 'metsikköä' },
    description: 'Varjoisia, sammaleisia kuusikoita ja ojanvarsia — suppilovahveron syksyisiä kasvupaikkoja.',
    howToRead:
      'Kaukaa kartta näyttää lämpökarttana, minne lupaavimmat metsiköt keskittyvät. Lähennä, ' +
      'niin yksittäiset metsiköt piirtyvät esiin — napauttamalla näet perustelut ja varmuuden.',
    geometryUrl: '/geometry/suppilovahvero',
    centroidsUrl: '/geometry/suppilovahvero?kind=centroids',
    render: 'heatmap',
    showConditions: true,
    colorBy: 'composite',
    ramp: DIVERGING_RAMP,
    initialView: { center: [23.7, 61.43], zoom: 12 }
  }
}

export const speciesIds = Object.keys(SPECIES_RENDER)
