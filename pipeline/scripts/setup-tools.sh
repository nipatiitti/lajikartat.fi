#!/usr/bin/env bash
# One-time install of the two native tools the raster publish step needs.
# No sudo: GDAL comes from conda-forge into its own env, pmtiles is a static
# Go binary. Re-running is harmless.
set -euo pipefail

if ! command -v conda >/dev/null; then
  echo "conda not found — install miniconda first (https://docs.conda.io/en/latest/miniconda.html)" >&2
  exit 1
fi
if ! conda env list | grep -q '^lajikartat '; then
  conda create -y -n lajikartat -c conda-forge gdal
fi
"$HOME/miniconda3/envs/lajikartat/bin/gdalinfo" --version

mkdir -p "$HOME/.local/bin"
if ! "$HOME/.local/bin/pmtiles" version >/dev/null 2>&1; then
  ver=$(curl -sL https://api.github.com/repos/protomaps/go-pmtiles/releases/latest | grep -o '"tag_name": *"v[0-9.]*"' | grep -o '[0-9.]*')
  curl -sL "https://github.com/protomaps/go-pmtiles/releases/download/v${ver}/go-pmtiles_${ver}_Linux_x86_64.tar.gz" | tar xz -C "$HOME/.local/bin" pmtiles
fi
"$HOME/.local/bin/pmtiles" version
