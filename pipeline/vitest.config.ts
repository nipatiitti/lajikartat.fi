import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Standalone config so the pipeline test run does not walk up to the root
// SvelteKit vite.config.ts; the root `pnpm test` includes it as a project.
export default defineConfig({
  resolve: {
    alias: {
      '@scoring': fileURLToPath(new URL('../src/lib/scoring/index.ts', import.meta.url)),
      '@raster': fileURLToPath(new URL('../src/lib/raster/encoding.ts', import.meta.url))
    }
  },
  test: {
    name: 'pipeline',
    include: ['test/**/*.test.ts']
  }
})
