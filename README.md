# lajikartat.fi

Lajikohtaisia potentiaalikarttoja avoimesta paikkatiedosta: missä iso ahven,
kantarelli ja suppilovahvero todennäköisimmin ovat. SvelteKit on Cloudflare
Workers (D1 + R2), MapLibre on the client, an offline pipeline in `pipeline/`.

- `/[species]` — the map. Vector species (ahven) render tappable polygons from
  an R2 GeoJSON blob and read the why-breakdown from D1 on tap; raster species
  (kantarelli, suppilovahvero) render a 16 m suitability surface from a PMTiles
  archive on R2 through `/tiles/...`.
- `/sienikalenteri` — picking calendar from FMI rain and temperature, client-side only.
- `/basemap/*` — key-injecting proxy for the MML basemaps.

## Develop

```
pnpm install
cp .dev.vars.example .dev.vars   # MML_API_KEY for the basemap proxy
pnpm db:apply:local              # local D1 schema (drizzle/ migrations)
pnpm dev
```

`pnpm check` (svelte-check), `pnpm lint` (prettier), `pnpm test` (vitest: app
library + pipeline). `pnpm build && pnpm preview` runs the real Worker locally.

## Data

Datasets are produced by the pipeline and loaded into the local wrangler state:

```
pnpm pipeline ingest <species> [--bbox=minX,minY,maxX,maxY]
pnpm pipeline publish:raster <species>   # raster species only
pnpm data:publish:local <species>        # R2 object(s) + D1 rows from pipeline/out/<species>/publish.json
```

See `pipeline/README.md`. Schema changes: edit `src/lib/server/db/schema.ts`,
`pnpm db:generate`, `pnpm db:apply:local`.
