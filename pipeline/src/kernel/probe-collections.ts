import { loadPipelineEnv } from './env'
import { createMmlClient } from './sources/mml'

// Prints the live MML collection ids so we can resolve the exact (post spring-2025
// rename) names for water/streams/mires. Run: pnpm --filter @lajikartat/pipeline exec tsx src/kernel/probe-collections.ts
const { MML_API_KEY } = loadPipelineEnv()
if (!MML_API_KEY) {
  console.error('Set MML_API_KEY in pipeline/.env (see pipeline/.env.example).')
  process.exit(1)
}

const cols = await createMmlClient(MML_API_KEY).listCollections()
console.log(`${cols.length} MML collections:\n`)
for (const c of cols) console.log(`  ${c.id}${c.title ? `\t— ${c.title}` : ''}`)
