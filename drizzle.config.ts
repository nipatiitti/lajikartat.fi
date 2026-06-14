import { defineConfig } from 'drizzle-kit'

// `drizzle-kit generate` needs only the schema (works offline, local-first).
// `push`/`migrate`/`studio` use the d1-http credentials below when targeting a
// real Cloudflare D1 — set them in .env for remote operations.
export default defineConfig({
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? '',
    token: process.env.CLOUDFLARE_D1_TOKEN ?? ''
  },
  verbose: true,
  strict: true
})
