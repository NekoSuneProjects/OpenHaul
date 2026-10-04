#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
OPENHAUL_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"

GAME=""
GAME_PATH=""
TRUCKSIM_MAPS_PATH="$OPENHAUL_ROOT/GameMap/maps"
WORK_DIR="$OPENHAUL_ROOT/data-runtime/map-build"
TIPPECANOE_IMAGE="openhaul-tippecanoe:latest"
TILES_ONLY=0

usage() {
  cat <<'EOF'
Usage: tools/maps/build-scs-map.sh --game <ats|ets2> [options]

Options:
  --game-path <path>             SCS game installation root.
  --trucksim-maps-path <path>    TruckSim Maps checkout (default: GameMap/maps).
  --work-dir <path>              Build workspace (default: data-runtime/map-build).
  --tippecanoe-image <image>     Tippecanoe Docker image.
  --tiles-only                   Rebuild PMTiles from existing GeoJSON.
  -h, --help                     Show this help.
EOF
}

while (($#)); do
  case "$1" in
    --game)
      GAME="${2:-}"
      shift 2
      ;;
    --game-path)
      GAME_PATH="${2:-}"
      shift 2
      ;;
    --trucksim-maps-path)
      TRUCKSIM_MAPS_PATH="${2:-}"
      shift 2
      ;;
    --work-dir)
      WORK_DIR="${2:-}"
      shift 2
      ;;
    --tippecanoe-image)
      TIPPECANOE_IMAGE="${2:-}"
      shift 2
      ;;
    --tiles-only)
      TILES_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$GAME" != "ats" && "$GAME" != "ets2" ]]; then
  echo "--game must be ats or ets2" >&2
  exit 2
fi

for command_name in node npm docker git; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required." >&2
    exit 1
  fi
done

if [[ "$WORK_DIR" != /* ]]; then
  WORK_DIR="$OPENHAUL_ROOT/${WORK_DIR#./}"
fi

mkdir -p "$WORK_DIR/logs" "$WORK_DIR/parsed/$GAME" "$WORK_DIR/generated/geojson" "$WORK_DIR/generated/pmtiles"
WORK_DIR="$(cd -- "$WORK_DIR" && pwd -P)"
LOGS_OUT="$WORK_DIR/logs"
PARSED_OUT="$WORK_DIR/parsed/$GAME"
GEOJSON_OUT="$WORK_DIR/generated/geojson"
PMTILES_OUT="$WORK_DIR/generated/pmtiles"
GEOJSON_FILE="$GEOJSON_OUT/$GAME.geojson"
PMTILES_FILE="$PMTILES_OUT/$GAME.pmtiles"

if [[ "$GAME" == "ets2" ]]; then
  MAP_ID="europe"
  GAME_NAME="Euro Truck Simulator 2"
else
  MAP_ID="usa"
  GAME_NAME="American Truck Simulator"
fi

if (( ! TILES_ONLY )); then
  if [[ -z "$GAME_PATH" ]]; then
    echo "--game-path is required for a full Linux build. GameMap/build-maps.sh can auto-detect or SteamCMD-download it." >&2
    exit 2
  fi
  if [[ ! -d "$GAME_PATH" ]]; then
    echo "$GAME_NAME path does not exist: $GAME_PATH" >&2
    exit 1
  fi
  GAME_PATH="$(cd -- "$GAME_PATH" && pwd -P)"

  if [[ ! -d "$TRUCKSIM_MAPS_PATH" ]]; then
    echo "TruckSim Maps submodule is missing at $TRUCKSIM_MAPS_PATH. Run: git submodule update --init --recursive" >&2
    exit 1
  fi
  TRUCKSIM_MAPS_PATH="$(cd -- "$TRUCKSIM_MAPS_PATH" && pwd -P)"

  required_maps_files=(
    package.json
    packages/clis/parser/package.json
    packages/clis/parser/index.ts
    packages/clis/generator/package.json
    packages/clis/generator/index.ts
  )
  for required_file in "${required_maps_files[@]}"; do
    if [[ ! -f "$TRUCKSIM_MAPS_PATH/$required_file" ]]; then
      echo "TruckSim Maps checkout is incomplete. Missing $required_file in $TRUCKSIM_MAPS_PATH" >&2
      exit 1
    fi
  done

  required_archives=(base.scs base_map.scs base_share.scs core.scs def.scs locale.scs version.scs)
  missing_archives=()
  for archive in "${required_archives[@]}"; do
    [[ -f "$GAME_PATH/$archive" ]] || missing_archives+=("$archive")
  done
  if ((${#missing_archives[@]})); then
    echo "$GAME_NAME game root is invalid or incomplete: $GAME_PATH" >&2
    echo "Missing: ${missing_archives[*]}" >&2
    exit 1
  fi

  scs_count="$(find "$GAME_PATH" -maxdepth 1 -type f -name '*.scs' | wc -l | tr -d ' ')"
  echo "Validated $GAME_NAME installation: $scs_count .scs archives found."
fi

if ! docker info --format '{{.OSType}}' >/tmp/openhaul-docker-os.$$ 2>/dev/null; then
  rm -f /tmp/openhaul-docker-os.$$
  echo "Docker is unavailable. Start Docker and retry." >&2
  exit 1
fi
DOCKER_OS="$(cat /tmp/openhaul-docker-os.$$)"
rm -f /tmp/openhaul-docker-os.$$
if [[ "$DOCKER_OS" != "linux" ]]; then
  echo "OpenHaul map generation requires Linux Docker containers. Current Docker OSType: $DOCKER_OS" >&2
  exit 1
fi

ensure_tippecanoe_image() {
  local image="$1"
  if docker image inspect "$image" >/dev/null 2>&1 && docker run --rm "$image" tippecanoe --version >/dev/null 2>&1; then
    TIPPECANOE_IMAGE="$image"
    return
  fi

  if [[ "$image" != "openhaul-tippecanoe:latest" ]]; then
    echo "Custom Tippecanoe image failed; falling back to openhaul-tippecanoe:latest."
  fi

  echo "Building OpenHaul Tippecanoe image..."
  docker build --pull -f "$SCRIPT_DIR/tippecanoe.Dockerfile" -t openhaul-tippecanoe:latest "$SCRIPT_DIR"
  docker run --rm openhaul-tippecanoe:latest tippecanoe --version
  TIPPECANOE_IMAGE="openhaul-tippecanoe:latest"
}

ensure_tippecanoe_image "$TIPPECANOE_IMAGE"

echo "OpenHaul SCS map builder"
echo "Game: $GAME ($MAP_ID)"
[[ -n "$GAME_PATH" ]] && echo "Game files: $GAME_PATH"
echo "TruckSim Maps: $TRUCKSIM_MAPS_PATH"
echo "Working directory: $WORK_DIR"

if (( ! TILES_ONLY )); then
  pushd "$TRUCKSIM_MAPS_PATH" >/dev/null
  git submodule update --init --recursive
  trucksim_commit="$(git rev-parse --short HEAD 2>/dev/null || true)"
  [[ -n "$trucksim_commit" ]] && echo "TruckSim Maps commit: $trucksim_commit"

  TSX_CLI="$TRUCKSIM_MAPS_PATH/node_modules/tsx/dist/cli.mjs"
  if [[ ! -f "$TSX_CLI" ]]; then
    echo "Installing TruckSim Maps dependencies..."
    npm install
  fi
  if [[ ! -f "$TSX_CLI" ]]; then
    echo "TruckSim Maps dependencies are incomplete: $TSX_CLI is missing." >&2
    exit 1
  fi

  echo "Applying OpenHaul TruckSim Maps compatibility patches..."
  node "$SCRIPT_DIR/prepare-trucksim-maps.mjs" "$TRUCKSIM_MAPS_PATH"

  echo "Building TruckSim Maps native parser addons..."
  npm run build --workspace=packages/clis/parser

  PARSER_LOG="$LOGS_OUT/$GAME-parser.log"
  PARSER_ERROR_LOG="$LOGS_OUT/$GAME-parser-error.log"
  rm -f "$PARSER_LOG" "$PARSER_ERROR_LOG"

  echo "Parsing installed SCS game files..."
  if ! node "$TSX_CLI" packages/clis/parser/index.ts -i "$GAME_PATH" -o "$PARSED_OUT" >"$PARSER_LOG" 2>"$PARSER_ERROR_LOG"; then
    cat "$PARSER_LOG" || true
    echo "----- TruckSim Maps parser stderr tail -----" >&2
    tail -n 120 "$PARSER_ERROR_LOG" >&2 || true
    echo "TruckSim Maps parser failed. Full logs: $PARSER_LOG and $PARSER_ERROR_LOG" >&2
    exit 1
  fi
  cat "$PARSER_LOG"

  echo "Generating SCS road/prefab/city GeoJSON..."
  node "$TSX_CLI" packages/clis/generator/index.ts map -m "$MAP_ID" -i "$PARSED_OUT" -o "$GEOJSON_OUT" -t geojson
  popd >/dev/null
fi

if [[ ! -f "$GEOJSON_FILE" ]]; then
  echo "Expected GeoJSON was not found: $GEOJSON_FILE" >&2
  exit 1
fi

PMTILES_BUILDING_FILE="$PMTILES_OUT/$GAME.building.pmtiles"
rm -f "$PMTILES_BUILDING_FILE"

echo "Generating PMTiles with $TIPPECANOE_IMAGE..."
docker run --rm \
  --mount "type=bind,source=$GEOJSON_OUT,target=/geojson,readonly" \
  --mount "type=bind,source=$PMTILES_OUT,target=/pmtiles" \
  "$TIPPECANOE_IMAGE" \
  tippecanoe \
  -Z1 -z13 -B4 -b10 --force \
  -y type -y dlcGuard -y zIndex -y height -y hidden -y secret \
  -y poiType -y poiName -y sprite -y scaleRank -y capital -y roadType \
  -y color -y name \
  -o "/pmtiles/$GAME.building.pmtiles" \
  "/geojson/$GAME.geojson"

if [[ ! -f "$PMTILES_BUILDING_FILE" ]]; then
  echo "Expected completed PMTiles build was not found: $PMTILES_BUILDING_FILE" >&2
  exit 1
fi

mv -f "$PMTILES_BUILDING_FILE" "$PMTILES_FILE"
echo "PMTiles backup updated: $PMTILES_FILE"

pushd "$OPENHAUL_ROOT" >/dev/null
npm run map:import -- --game "$GAME" --file "$PMTILES_FILE"
popd >/dev/null

echo
echo "Done."
echo "GeoJSON backup: $GEOJSON_FILE"
echo "PMTiles backup: $PMTILES_FILE"
echo "Live map: $OPENHAUL_ROOT/data-runtime/maps/$GAME.pmtiles"

