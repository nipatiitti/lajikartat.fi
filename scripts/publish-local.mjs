// Load a species' published artefacts into the local wrangler state:
//   pnpm data:publish:local <species>
// Reads pipeline/out/<species>/publish.json written by ingest / publish:raster.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const species = process.argv[2]
if (!species) {
  console.error('usage: pnpm data:publish:local <species>')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(join('pipeline', 'out', species, 'publish.json'), 'utf8'))

function wrangler(args) {
  console.log(`$ wrangler ${args.join(' ')}`)
  const r = spawnSync('pnpm', ['exec', 'wrangler', ...args], { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
for (const { key, file } of manifest.r2)
  wrangler(['r2', 'object', 'put', `lajikartat-geometry/${key}`, `--file=${file}`, '--local'])
for (const file of manifest.sql) wrangler(['d1', 'execute', 'DB', '--local', `--file=${file}`])
