# lajikartat.fi pipeline

Offline ETL: acquire open geodata, score, and write local artefacts that the
Cloudflare Worker serves. Two pipeline kinds live in `src/kernel/`:

- **feature** — discrete scored units (perch ponds): D1 rows + R2 GeoJSON.
- **raster** — a suitability surface per 16 m cell (kantarelli, suppilovahvero)
  from Luke's MS-NFI rasters + Luke TWI + rasterised MML vectors: one PMTiles
  archive per species and region on R2, nothing in D1 except the dataset row.

## Setup

```
cp .env.example .env            # MML_API_KEY
pnpm install                    # at the repo root
pipeline/scripts/setup-tools.sh # GDAL (conda env "lajikartat") + pmtiles, publish only
```

## Raster species

```
pnpm pipeline ingest kantarelli pirkkala --debug   # score; --debug writes per-factor sidecars
pnpm pipeline calibrate kantarelli pirkkala --twi --edges --gbif
pnpm pipeline ingest kantarelli pirkanmaa
pnpm pipeline publish:raster kantarelli pirkanmaa  # GDAL → MBTiles → PMTiles + dataset SQL
pnpm data:publish:local:chanterelle               # R2 + D1 (local wrangler)
```

Luke rasters are read by window over HTTP range requests and cached under
`.cache/raster/luke/`. For a national run download the themes first
(`LUKE_LOCAL_DIR=…` pointing at a directory of `<theme>_vmi1x_1923.tif` files).

Calibration targets: median composite 0,5–0,65, p99 0,85–0,92, no pile at
255, and no factor whose histogram is a single spike.
