/** Percentile values of a histogram (`bins[i]` counts, `valueOf(i)` the bin value), keyed `p<n>`. */
export function percentiles(
  bins: ArrayLike<number>,
  total: number,
  probs: number[],
  valueOf: (bin: number) => number
): Record<string, number> {
  const out: Record<string, number> = {}
  let acc = 0
  let k = 0
  for (let i = 0; i < bins.length && k < probs.length; i++) {
    acc += bins[i]
    while (k < probs.length && acc / total >= probs[k]) {
      out[`p${Math.round(probs[k] * 100)}`] = valueOf(i)
      k++
    }
  }
  return out
}

/** Area under the ROC curve: Mann–Whitney U via ranks with ties. */
export function auc(pos: number[], neg: number[]): number {
  const all = [...pos.map((v) => [v, 1] as const), ...neg.map((v) => [v, 0] as const)].sort((a, b) => a[0] - b[0])
  let rankSumPos = 0
  for (let i = 0; i < all.length; ) {
    let j = i
    while (j < all.length && all[j][0] === all[i][0]) j++
    const avgRank = (i + 1 + j) / 2
    for (let k = i; k < j; k++) if (all[k][1] === 1) rankSumPos += avgRank
    i = j
  }
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length)
}
