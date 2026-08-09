// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // Platform comes from @sveltejs/adapter-cloudflare's ambient.d.ts (env is
    // `unknown` there by design — narrow it via $lib/server/env `getEnv`).
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
  }
}

export {}
