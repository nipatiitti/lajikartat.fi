/** Clamp to [lo, hi] (defaults to the unit interval). */
export const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x))

/** Monotonic increasing, saturating: 0 at x=0, → 1 as x → cap and beyond. */
export function logSaturate(x: number, cap: number): number {
  if (x <= 0) return 0
  return clamp(Math.log1p(x) / Math.log1p(cap))
}

/** Unimodal Gaussian peak, max 1 at `center`, width `sigma`. (For future F4.) */
export function gaussianPeak(x: number, center: number, sigma: number): number {
  const z = (x - center) / sigma
  return Math.exp(-0.5 * z * z)
}
