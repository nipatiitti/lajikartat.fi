import { fileURLToPath } from 'node:url'

export interface PipelineEnv {
  MML_API_KEY?: string
}

/** Load pipeline/.env (gitignored) into process.env, then read known keys. */
export function loadPipelineEnv(): PipelineEnv {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
  } catch {
    // No .env file — fall back to the ambient process.env.
  }
  return { MML_API_KEY: process.env.MML_API_KEY }
}
