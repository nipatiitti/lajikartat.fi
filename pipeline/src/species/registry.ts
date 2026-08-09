import type { SpeciesPlugin } from '../kernel/types'
import { kantarelli, suppilovahvero } from './chanterelle'
import { ahven } from './perch'

/** Add a species by dropping a plugin here — the kernel never changes. */
export const SPECIES: Record<string, SpeciesPlugin> = {
  ahven,
  kantarelli,
  suppilovahvero
}
