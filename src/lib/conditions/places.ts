// Weather lookup points for the calendar. FMI's daily observations come from
// the nearest station inside a ±0.4° box, so a town centre is precise enough.

export interface Place {
  label: string
  /** [lng, lat]. */
  center: [number, number]
}

export const PLACES: Record<string, Place> = {
  pirkkala: { label: 'Pirkkala', center: [23.7, 61.43] },
  helsinki: { label: 'Helsinki', center: [24.94, 60.17] },
  turku: { label: 'Turku', center: [22.27, 60.45] },
  lahti: { label: 'Lahti', center: [25.66, 60.98] },
  jyvaskyla: { label: 'Jyväskylä', center: [25.73, 62.24] },
  kuopio: { label: 'Kuopio', center: [27.68, 62.89] },
  joensuu: { label: 'Joensuu', center: [29.76, 62.6] },
  vaasa: { label: 'Vaasa', center: [21.62, 63.1] },
  oulu: { label: 'Oulu', center: [25.47, 65.01] },
  rovaniemi: { label: 'Rovaniemi', center: [25.72, 66.5] }
}

export const DEFAULT_PLACE = 'pirkkala'
export const placeIds = Object.keys(PLACES)
