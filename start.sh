#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BUILD_FIRST=false
PREFER_JAN_MODELS=false
JAN_DATA_FOLDER=""
APP_ARGS=()

usage() {
  cat <<'EOF'
Usage: ./start.sh [options] [-- <app args...>]

Options:
  --build                 Build the macOS app bundle before launching.
  --prefer-jan-models    Prefer Jan llama.cpp models, then fall back to Atomic Chat models.
  --jan-data-folder PATH Override Jan's data folder for shared model discovery.
  -h, --help             Show this help.

Examples:
  ./start.sh
  ./start.sh --build --prefer-jan-models
  ./start.sh --prefer-jan-models --jan-data-folder "/Users/you/Library/Application Support/Jan/data"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      BUILD_FIRST=true
      shift
      ;;
    --prefer-jan-models|--prefer-jan-shared-models)
      PREFER_JAN_MODELS=true
      shift
      ;;
    --jan-data-folder)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --jan-data-folder"
        exit 1
      fi
      JAN_DATA_FOLDER="$2"
      shift 2
      ;;
    --jan-data-folder=*)
      JAN_DATA_FOLDER="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        APP_ARGS+=("$1")
        shift
      done
      ;;
    *)
      APP_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "start.sh currently supports macOS app bundles."
  exit 1
fi

APP_CANDIDATES=(
  "$SCRIPT_DIR/src-tauri/target/release/bundle/macos/Atomic Chat.app"
  "$SCRIPT_DIR/src-tauri/target/universal-apple-darwin/release/bundle/macos/Atomic Chat.app"
  "$SCRIPT_DIR/src-tauri/target/debug/bundle/macos/Atomic Chat.app"
  "/Applications/Atomic Chat.app"
)

if [[ "$BUILD_FIRST" == true ]]; then
  echo "Building Atomic Chat macOS app bundle..."
  (cd "$SCRIPT_DIR" && yarn build:tauri:darwin:native)

  EXTENSIONS_CACHE_DIR="$HOME/Library/Application Support/Atomic Chat/data/extensions"
  if [[ -d "$EXTENSIONS_CACHE_DIR" ]]; then
    echo "Refreshing installed extension cache..."
    rm -rf "$EXTENSIONS_CACHE_DIR"
  fi
fi

LAUNCH_ARGS=("${APP_ARGS[@]}")
if [[ "$PREFER_JAN_MODELS" == true ]]; then
  LAUNCH_ARGS+=("--prefer-jan-models")
fi
if [[ -n "$JAN_DATA_FOLDER" ]]; then
  LAUNCH_ARGS+=("--jan-data-folder" "$JAN_DATA_FOLDER")
fi

for app_path in "${APP_CANDIDATES[@]}"; do
  if [[ -d "$app_path" ]]; then
    echo "Launching: $app_path"
    if [[ ${#LAUNCH_ARGS[@]} -gt 0 ]]; then
      open -a "$app_path" --args "${LAUNCH_ARGS[@]}"
    else
      open "$app_path"
    fi
    exit 0
  fi
done

cat <<'EOF'
Atomic Chat.app was not found.

Checked:
  - src-tauri/target/release/bundle/macos/Atomic Chat.app
  - src-tauri/target/universal-apple-darwin/release/bundle/macos/Atomic Chat.app
  - src-tauri/target/debug/bundle/macos/Atomic Chat.app
  - /Applications/Atomic Chat.app

Next steps:
  1. Build the app from this repo:
       ./start.sh --build
  2. Or install Atomic Chat into /Applications
EOF

exit 1
