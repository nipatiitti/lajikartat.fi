import type { Bbox } from './config'

export interface CliArgs {
  positional: string[]
  flags: Map<string, string | true>
}

/** `<positional…> --flag --key=value` → positional list + flag map. */
export function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = []
  const flags = new Map<string, string | true>()
  for (const a of argv) {
    if (!a.startsWith('--')) {
      positional.push(a)
      continue
    }
    const eq = a.indexOf('=')
    if (eq === -1) flags.set(a.slice(2), true)
    else flags.set(a.slice(2, eq), a.slice(eq + 1))
  }
  return { positional, flags }
}

/** `--bbox=minX,minY,maxX,maxY` in EPSG:3067, or undefined for the whole grid. */
export function parseBbox(value: string | true | undefined): Bbox | undefined {
  if (value === undefined) return undefined
  if (value === true) throw new Error('--bbox needs a value: --bbox=minX,minY,maxX,maxY (EPSG:3067)')
  const parts = value.split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[0] >= parts[2] || parts[1] >= parts[3]) {
    throw new Error(`bad --bbox "${value}": expected minX,minY,maxX,maxY (EPSG:3067)`)
  }
  return parts as Bbox
}

export function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
