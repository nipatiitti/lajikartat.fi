// adapter-cloudflare's ambient App.Platform pins `env: unknown` (its ambient.d.ts
// wins the interface merge), so bindings are narrowed here in one place instead
// of casting at every use site. Cloudflare.Env is wrangler-generated.
export const getEnv = (platform: App.Platform): Cloudflare.Env => platform.env as Cloudflare.Env
