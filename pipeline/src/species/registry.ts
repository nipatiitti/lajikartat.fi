import type { SpeciesPlugin } from '../kernel/types'
import { perch } from './perch'

/** Add a species by dropping a plugin here — the kernel never changes. */
export const SPECIES: Record<string, SpeciesPlugin> = {
  perch
}
