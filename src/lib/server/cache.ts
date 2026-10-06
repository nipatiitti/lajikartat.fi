/** The Workers edge cache (inert on *.workers.dev and in the dev server, live on a custom domain). */
export const edgeCache = (platform: App.Platform): Cache | undefined =>
  (platform.caches as unknown as { default?: Cache }).default
