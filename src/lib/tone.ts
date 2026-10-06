import type { Confidence } from '$lib/scoring/core/types'

/** The one quality scale of the UI: green go, amber maybe, gray nothing. */
export type Tone = 'green' | 'amber' | 'gray'

/** Tone of a 0..1 score (picking day, flush drive, …). */
export const scoreTone = (score: number): Tone => (score >= 0.55 ? 'green' : score >= 0.3 ? 'amber' : 'gray')

export const CONFIDENCE_TONE: Record<Confidence, Tone> = { high: 'green', med: 'amber', low: 'gray' }

export const TONE_CHIP: Record<Tone, string> = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  gray: 'bg-gray-100 text-gray-700'
}

export const TONE_DOT: Record<Tone, string> = { green: 'bg-green-600', amber: 'bg-amber-500', gray: 'bg-gray-300' }

/** Same three colours for SVG fills. */
export const TONE_HEX: Record<Tone, string> = { green: '#16a34a', amber: '#f59e0b', gray: '#d1d5db' }
