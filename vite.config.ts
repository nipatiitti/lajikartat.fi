/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import adapter from '@sveltejs/adapter-cloudflare'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
        experimental: { async: true }
      },
      adapter: adapter(),
      experimental: { remoteFunctions: true, handleRenderingErrors: true },
      typescript: {
        config: (config) => ({
          ...config,
          include: [...config.include, '../drizzle.config.ts'],
          // The encoding test imports MapLibre's own TypeScript source (its DEM
          // packer), which does not type-check outside MapLibre's build.
          exclude: [...(config.exclude ?? []), '../src/lib/raster/encoding.test.ts']
        })
      }
    })
  ],
  // One `pnpm test` for the app library and the pipeline package.
  test: {
    projects: [{ extends: true, test: { name: 'lib', include: ['src/**/*.test.ts'], environment: 'node' } }, 'pipeline']
  }
})
