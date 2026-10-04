#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
MAPS_PATH="$ROOT/GameMap/maps"
PUBLISH_REPO="${OPENHAUL_MAP_REPO:-NekoSuneProjects/OpenHaul}"
SELECTED_GAME="all"
PUBLISH=1
STEAM_USER="${STEAM_USER:-anonymous}"
STEAM_PASSWORD="${STEAM_PASSWORD:-}"

usage() {
  cat <<'EOF'
Usage: GameMap/build-maps.sh [options]

Builds ATS and ETS2 PMTiles using GameMap/maps. If a game is not installed,
the script downloads it into data-runtime/steam-games with SteamCMD.

Options:
  --game <all|ats|ets2>   Build both games or only one (default: all).
  --no-publish            Build/import maps without publishing the GitHub release.
  --repo <owner/repo>     GitHub repository for map:publish.
  --steam-user <user>     Steam account for SteamCMD (default: STEAM_USER or anonymous).
  -h, --help              Show this help.

For an owned paid game, set STEAM_USER to an account that owns it. If
STEAM_PASSWORD is unset SteamCMD can prompt interactively for credentials/Guard.
EOF
}

while (($#)); do
  case "$1" in
    --game)
      SELECTED_GAME="${2:-}"
      shift 2
      ;;
    --no-publish)
      PUBLISH=0
      shift
      ;;
    --repo)
      PUBLISH_REPO="${2:-}"
      shift 2
      ;;
    --steam-user)
      STEAM_USER="${2:-}"
      shift 2
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

if [[ "$SELECTED_GAME" != "all" && "$SELECTED_GAME" != "ats" && "$SELECTED_GAME" != "ets2" ]]; then
  echo "--game must be all, ats or ets2" >&2
  exit 2
fi

for command_name in git node npm docker; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required." >&2
    exit 1
  fi
done

echo "Initializing TruckSim Maps submodule..."
git -C "$ROOT" submodule update --init --recursive GameMap/maps

steam_roots=()
add_steam_root() {
  local path="$1"
  [[ -d "$path" ]] || return 0
  local canonical
  canonical="$(cd -- "$path" && pwd -P)"
  local existing
  for existing in "${steam_roots[@]:-}"; do
    [[ "$existing" == "$canonical" ]] && return 0
  done
  steam_roots+=("$canonical")
}

add_steam_root "$HOME/.steam/steam"
add_steam_root "$HOME/.local/share/Steam"
add_steam_root "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam"

for root in "${steam_roots[@]:-}"; do
  vdf="$root/steamapps/libraryfolders.vdf"
  [[ -f "$vdf" ]] || continue
  while IFS= read -r library; do
    library="${library//\\\\/\\}"
    add_steam_root "$library"
  done < <(sed -nE 's/^[[:space:]]*"path"[[:space:]]+"([^"]+)".*/\1/p' "$vdf")
done

find_game() {
  local game="$1"
  local folder
  if [[ "$game" == "ats" ]]; then
    folder="American Truck Simulator"
  else
    folder="Euro Truck Simulator 2"
  fi
  local root candidate
  for root in "${steam_roots[@]:-}"; do
    candidate="$root/steamapps/common/$folder"
    if [[ -f "$candidate/base.scs" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_steamcmd() {
  if command -v steamcmd >/dev/null 2>&1; then
    command -v steamcmd
    return 0
  fi

  local steamcmd_dir="$ROOT/data-runtime/steamcmd"
  local steamcmd_bin="$steamcmd_dir/steamcmd.sh"
  mkdir -p "$steamcmd_dir"
  if [[ ! -x "$steamcmd_bin" ]]; then
    echo "steamcmd is not installed; downloading Valve SteamCMD locally..." >&2
    local archive="$steamcmd_dir/steamcmd_linux.tar.gz"
    if command -v curl >/dev/null 2>&1; then
      curl -fL --retry 3 -o "$archive" https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz
    elif command -v wget >/dev/null 2>&1; then
      wget -O "$archive" https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz
    else
      echo "curl or wget is required to download SteamCMD." >&2
      return 1
    fi
    tar -xzf "$archive" -C "$steamcmd_dir"
    rm -f "$archive"
    chmod +x "$steamcmd_bin"
  fi
  printf '%s\n' "$steamcmd_bin"
}

download_game() {
  local game="$1"
  local app_id destination steamcmd_bin
  if [[ "$game" == "ats" ]]; then
    app_id=270880
  else
    app_id=227300
  fi
  destination="$ROOT/data-runtime/steam-games/$game"
  mkdir -p "$destination"
  steamcmd_bin="$(ensure_steamcmd)"

  echo "Downloading/updating $game with SteamCMD into $destination..." >&2
  login_args=(+login "$STEAM_USER")
  if [[ "$STEAM_USER" != "anonymous" && -n "$STEAM_PASSWORD" ]]; then
    login_args=(+login "$STEAM_USER" "$STEAM_PASSWORD")
  fi

  if ! "$steamcmd_bin" +force_install_dir "$destination" "${login_args[@]}" +app_update "$app_id" validate +quit >&2; then
    echo "SteamCMD could not download app $app_id." >&2
    echo "ATS/ETS2 are paid games, so anonymous access may be refused. Set STEAM_USER to an account that owns the game and rerun; SteamCMD can prompt for password/Steam Guard when needed." >&2
    return 1
  fi

  if [[ ! -f "$destination/base.scs" ]]; then
    echo "SteamCMD finished but the expected game archives were not found in $destination." >&2
    return 1
  fi
  printf '%s\n' "$destination"
}

build_one() {
  local game="$1"
  local game_path
  game_path="$(find_game "$game" || true)"
  if [[ -n "$game_path" ]]; then
    echo "Auto-detected $game: $game_path"
  else
    game_path="$(download_game "$game")"
  fi

  "$ROOT/tools/maps/build-scs-map.sh" \
    --game "$game" \
    --game-path "$game_path" \
    --trucksim-maps-path "$MAPS_PATH"
}

if [[ "$SELECTED_GAME" == "all" || "$SELECTED_GAME" == "ets2" ]]; then
  build_one ets2
fi
if [[ "$SELECTED_GAME" == "all" || "$SELECTED_GAME" == "ats" ]]; then
  build_one ats
fi

if (( PUBLISH )); then
  ETS2_MAP="$ROOT/data-runtime/maps/ets2.pmtiles"
  ATS_MAP="$ROOT/data-runtime/maps/ats.pmtiles"
  if [[ ! -f "$ETS2_MAP" || ! -f "$ATS_MAP" ]]; then
    echo "Publishing requires both $ETS2_MAP and $ATS_MAP. Build both first or use --no-publish." >&2
    exit 1
  fi
  echo "Publishing ATS + ETS2 map release to $PUBLISH_REPO..."
  pushd "$ROOT" >/dev/null
  npm run map:publish -- --ets2 "$ETS2_MAP" --ats "$ATS_MAP" --repo "$PUBLISH_REPO"
  popd >/dev/null
fi

echo "OpenHaul map build complete."

