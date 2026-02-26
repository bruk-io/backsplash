#!/usr/bin/env bash
# Download pokered tileset PNGs from pret/pokered on GitHub.
# Idempotent — skips files that already exist.

set -euo pipefail

BASE_URL="https://raw.githubusercontent.com/pret/pokered/master/gfx/tilesets"
OUT_DIR="$(dirname "$0")/../public/tilesets/pokered"

TILESETS=(
  overworld
  reds_house
  house
  pokecenter
  gym
  forest
  ship
  ship_port
  underground
  cemetery
  gate
  interior
  cavern
  lobby
  mansion
  lab
  club
  facility
  plateau
)

mkdir -p "$OUT_DIR"

for name in "${TILESETS[@]}"; do
  dest="$OUT_DIR/${name}.png"
  if [[ -f "$dest" ]]; then
    echo "skip  $name.png (exists)"
    continue
  fi
  echo "fetch $name.png"
  curl -fsSL "$BASE_URL/${name}.png" -o "$dest"
done

echo "done — $(ls "$OUT_DIR"/*.png 2>/dev/null | wc -l | tr -d ' ') PNGs in $OUT_DIR"
