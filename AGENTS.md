# lajikartat.fi

SvelteKit (Svelte 5 runes, Tailwind 4) on Cloudflare Workers with D1 + R2, pnpm
workspace with the offline data pipeline in `pipeline/` (Node + tsx). See
`README.md` and `pipeline/README.md` for the commands.

- Finnish UI copy, short sentences, no em dashes, decimal comma.
- The data model is national: one grid in `pipeline/src/kernel/config.ts`,
  `--bbox` restricts dev runs, nothing is sliced or labelled by region.
- No Docker on the dev machine. GDAL comes from the conda env `lajikartat`,
  `pmtiles` is a static binary (`pipeline/scripts/setup-tools.sh`).
- Scoring math lives in `src/lib/scoring` and is shared with the pipeline via
  the `@scoring` / `@raster` aliases; keep it pure.
- Before finishing: `pnpm check`, `pnpm lint`, `pnpm test`.

## Svelte MCP server

Use the Svelte MCP server for Svelte 5 / SvelteKit questions: `list-sections`
first, then `get-documentation` for the relevant sections, and run
`svelte-autofixer` on every `.svelte` file you write until it reports nothing.
