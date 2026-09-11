export * from './types'
export * from './math'
export { combineFactors } from './composite'
export type { CompositeOptions } from './composite'
export {
  combineLimiting,
  compositeNumeric,
  confidenceNumeric,
  confidenceRank,
  CONFIDENCE_BY_RANK,
  DEFAULT_MODULATOR_BAND,
  multiplierFor
} from './limiting'
export type { LimitingFactor, ModulatorFactor, LimitingOptions } from './limiting'
