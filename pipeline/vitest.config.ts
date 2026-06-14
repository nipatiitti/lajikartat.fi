import { defineConfig } from 'vitest/config'

// Standalone config so the pipeline test run does not walk up to the root
// SvelteKit vite.config.ts.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts']
  }
})
