export interface CandidateFilter {
  minComposite: number
}

export interface PaintOptions {
  /** [value, colour] ramp stops, ascending. */
  ramp: Array<[number, string]>
  /** User opacity slider 0..1. */
  opacity: number
  visible: boolean
}

/** Sources and layers a species layer family appends on top of a basemap style. */
export interface StyleAdditions {
  sources: Record<string, import('maplibre-gl').SourceSpecification>
  layers: import('maplibre-gl').LayerSpecification[]
}
