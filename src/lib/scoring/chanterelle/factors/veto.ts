/**
 * V — hard vetoes (species/chanterelle.md §2) on the DEV_CLASS_CODES /
 * SUBGROUP_CODES indices: fresh clearcut or seedling stand (codes 0, 1) and
 * open treeless mire (subgroup 3). Open water, built and cultivated ground are
 * never forest land, so they need no runtime check. 0 = fired, 1 = passed,
 * −1 = unknown (never fires).
 */
export function vetoCore(devClass: number, subgroup: number): number {
  if (devClass === 0 || devClass === 1 || subgroup === 3) return 0
  if (devClass < 0 && subgroup < 0) return -1
  return 1
}
