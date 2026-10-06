// Client-side config per species. Adding a species = an entry here + a
// pipeline plugin; the /[species] route never changes.

interface SpeciesBase {
  label: string
  /** Lander card text. */
  description: string
  /** Nominative singular of one unit ("lampi") and the layer toggle label. */
  unit: { singular: string; layerLabel: string }
  /** [value, colour] stops for the colour ramp, ascending — diverging blue→red. */
  ramp: Array<[number, string]>
  /** Show the picking-conditions pill that links to the calendar (fungi). */
  calendar?: true
}

export type SpeciesRenderConfig = SpeciesBase &
  (
    | {
        /** Discrete tappable polygons from an R2-backed GeoJSON endpoint. */
        render: 'vector'
        geometryUrl: string
      }
    | {
        /** Continuous 16 m suitability surface served as raster tiles. Nothing to tap. */
        render: 'raster'
        tilesUrl: string
      }
  )

// RdYlBu-reversed: low scores cool/blue, top candidates hot/red.
const DIVERGING_RAMP: Array<[number, string]> = [
  [0.3, '#4575b4'],
  [0.45, '#91bfdb'],
  [0.55, '#fee090'],
  [0.65, '#fc8d59'],
  [0.8, '#d73027']
]

const FUNGI_UNIT = { singular: 'ruutu', layerLabel: 'Soveltuvuus' }

export const SPECIES_RENDER: Record<string, SpeciesRenderConfig> = {
  ahven: {
    label: 'Iso ahven',
    description: 'Syrjäisiä pikkulampia, joissa iso ahven on todennäköisimmin saanut kasvaa rauhassa.',
    unit: { singular: 'lampi', layerLabel: 'Lammet' },
    ramp: DIVERGING_RAMP,
    render: 'vector',
    geometryUrl: '/geometry/ahven'
  },
  kantarelli: {
    label: 'Kantarelli',
    description: 'Valoisia sekametsiä, polunvarsia ja kangasmaita, joissa kantarellin edellytykset ovat parhaat.',
    unit: FUNGI_UNIT,
    ramp: DIVERGING_RAMP,
    calendar: true,
    render: 'raster',
    tilesUrl: '/tiles/kantarelli.json'
  },
  suppilovahvero: {
    label: 'Suppilovahvero',
    description: 'Varjoisia, sammaleisia kuusikoita ja ojanvarsia, suppilovahveron syksyisiä kasvupaikkoja.',
    unit: FUNGI_UNIT,
    ramp: DIVERGING_RAMP,
    calendar: true,
    render: 'raster',
    tilesUrl: '/tiles/suppilovahvero.json'
  }
}

export const speciesIds = Object.keys(SPECIES_RENDER)
