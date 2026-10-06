# lajikartat.fi pipeline

Offline ETL: acquire open geodata, score, and write local artefacts that the
Cloudflare Worker serves. Two pipeline kinds live in `src/kernel/`:

- **feature** — discrete scored units (perch ponds): D1 rows + R2 GeoJSON.
- **raster** — a suitability surface per 16 m cell (kantarelli, suppilovahvero)
  from Luke's MS-NFI rasters + Luke TWI + rasterised MML vectors: one PMTiles
  archive per species on R2, nothing in D1 except the dataset row.

Every run scores the same national 10 km grid (`src/kernel/config.ts` `GRID`).
`--bbox` only restricts which tiles run, so a dev run and the full Finland run
write into the same `out/<species>/` tree.

## Setup

```
cp .env.example .env            # MML_API_KEY
pnpm install                    # at the repo root
pipeline/scripts/setup-tools.sh # GDAL (conda env "lajikartat") + pmtiles, publish only
```

## Raster species

```
# one 10 km tile (Pirkkala forests) for quick iteration; --debug writes per-factor sidecars
pnpm pipeline ingest kantarelli --bbox=320000,6811000,327000,6819000 --debug
pnpm pipeline calibrate kantarelli --twi --gbif
# a maakunta-sized area (Pirkanmaa)
pnpm pipeline ingest kantarelli --bbox=283000,6780000,385000,6900000
pnpm pipeline publish:raster kantarelli   # GDAL → MBTiles → PMTiles + dataset SQL
pnpm data:publish:local kantarelli        # from the repo root: R2 + D1 (local wrangler)
```

Luke rasters are read by window over HTTP range requests and cached under
`.cache/raster/luke/`. For a national run download the themes first
(`LUKE_LOCAL_DIR=…` pointing at a directory of `<theme>_vmi1x_1923.tif` files)
and run without `--bbox`.

Calibration targets: median composite 0,5–0,65, p99 0,85–0,92, no pile at
255, and no factor whose histogram is a single spike.

## Feature species

```
pnpm pipeline ingest ahven --bbox=283000,6780000,385000,6900000
pnpm data:publish:local ahven
```
