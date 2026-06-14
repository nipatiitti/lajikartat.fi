// Client-side render config per species — mirrors the server plugin's `render` so the
// `/[species]` route stays generic. Adding a species = adding an entry here + a server
// plugin; the map page never changes.

export interface SpeciesRenderConfig {
  /** Display name for the species. */
  label: string
  /** R2-backed GeoJSON endpoint with `composite`/`confidence`/`name` per feature. */
  geometryUrl: string
  /** Feature property driving the colour ramp. */
  colorBy: 'composite'
  /** [value, colour] stops for the fill ramp, ascending — diverging blue→red. */
  ramp: Array<[number, string]>
  /** Initial map camera. */
  initialView: { center: [number, number]; zoom: number }
}

export const SPECIES_RENDER: Record<string, SpeciesRenderConfig> = {
  perch: {
    label: 'Iso ahven',
    geometryUrl: '/geometry/perch',
    colorBy: 'composite',
    // RdYlBu-reversed: low scores cool/blue, top candidates hot/red.
    ramp: [
      [0.3, '#4575b4'],
      [0.45, '#91bfdb'],
      [0.55, '#fee090'],
      [0.65, '#fc8d59'],
      [0.8, '#d73027']
    ],
    // Pirkanmaa, centred north of Tampere.
    initialView: { center: [23.8, 61.7], zoom: 8 }
  }
}

export const speciesIds = Object.keys(SPECIES_RENDER)
