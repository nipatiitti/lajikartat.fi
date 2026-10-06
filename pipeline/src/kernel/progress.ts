/** Console progress line `label n/total — elapsed s [~eta s left]`, redrawn in place. */
export function progress(label: string, total: number, every = 10) {
  const start = Date.now()
  let done = 0
  const draw = () => {
    const elapsed = (Date.now() - start) / 1000
    const eta = done > 0 && done < total ? `, ~${((elapsed / done) * (total - done)).toFixed(0)}s left` : ''
    process.stdout.write(`\r  ${label} ${done}/${total} — ${elapsed.toFixed(0)}s${eta}   `)
  }
  return {
    tick() {
      done++
      if (done % every === 0 || done === total) draw()
    },
    end() {
      if (done < total) draw()
      process.stdout.write('\n')
    }
  }
}

/** Warning that survives an in-place progress line. */
export const warn = (message: string): void => {
  process.stdout.write('\n')
  console.warn(`  ⚠ ${message}`)
}
