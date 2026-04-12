#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BUILD_FIRST=false
DEV_MODE=false
DEV_MODE_FULL=false
PREFER_JAN_MODELS=false
JAN_DATA_FOLDER=""
APP_ARGS=()

ATOMIC_CHAT_DATA_DIR="$HOME/Library/Application Support/Atomic Chat/data"
EXTENSIONS_CACHE_DIR="$ATOMIC_CHAT_DATA_DIR/extensions"
EXTENSION_BUNDLE_STAMP="$ATOMIC_CHAT_DATA_DIR/.bundled-preinstall.sha256"

usage() {
  cat <<'EOF'
Usage: ./start.sh [options] [-- <app args...>]

Options:
  --build                 Build the macOS app bundle before launching.
  --dev                   Run the fast desktop dev workflow (`yarn dev`) instead of opening a built app.
  --dev-full              Run the heavier desktop dev bootstrap (`yarn dev:tauri:full`).
  --prefer-jan-models    Prefer Jan llama.cpp models, then fall back to Atomic Chat models.
  --jan-data-folder PATH Override Jan's data folder for shared model discovery.
  -h, --help             Show this help.

Examples:
  ./start.sh
  ./start.sh --dev
  ./start.sh --dev-full
  ./start.sh --build --prefer-jan-models
  ./start.sh --prefer-jan-models --jan-data-folder "/Users/you/Library/Application Support/Jan/data"
EOF
}

extension_bundle_checksum() {
  local bundle_dir="$1"
  local files=()
  local file

  if [[ ! -d "$bundle_dir" ]]; then
    printf 'missing\n'
    return
  fi

  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    files+=("$file")
  done < <(find "$bundle_dir" -maxdepth 1 -type f -name '*.tgz' | LC_ALL=C sort)

  if [[ ${#files[@]} -eq 0 ]]; then
    printf 'empty\n'
    return
  fi

  shasum -a 256 "${files[@]}" | shasum -a 256 | awk '{print $1}'
}

refresh_extension_cache_if_needed() {
  local bundled_extensions_dir="$SCRIPT_DIR/src-tauri/resources/pre-install"
  local current_checksum
  local previous_checksum=""

  mkdir -p "$ATOMIC_CHAT_DATA_DIR"
  current_checksum="$(extension_bundle_checksum "$bundled_extensions_dir")"

  if [[ -f "$EXTENSION_BUNDLE_STAMP" ]]; then
    previous_checksum="$(<"$EXTENSION_BUNDLE_STAMP")"
  fi

  if [[ "$current_checksum" == "$previous_checksum" ]]; then
    echo "Bundled extensions unchanged; keeping installed extension cache."
    return
  fi

  if [[ -d "$EXTENSIONS_CACHE_DIR" ]]; then
    echo "Bundled extensions changed; refreshing installed extension cache..."
    rm -rf "$EXTENSIONS_CACHE_DIR"
  fi

  printf '%s\n' "$current_checksum" > "$EXTENSION_BUNDLE_STAMP"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      BUILD_FIRST=true
      shift
      ;;
    --dev)
      DEV_MODE=true
      shift
      ;;
    --dev-full)
      DEV_MODE=true
      DEV_MODE_FULL=true
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

if [[ "$BUILD_FIRST" == true && "$DEV_MODE" == true ]]; then
  echo "--build cannot be combined with --dev or --dev-full."
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
  refresh_extension_cache_if_needed
fi

LAUNCH_ARGS=("${APP_ARGS[@]}")
if [[ "$PREFER_JAN_MODELS" == true ]]; then
  LAUNCH_ARGS+=("--prefer-jan-models")
fi
if [[ -n "$JAN_DATA_FOLDER" ]]; then
  LAUNCH_ARGS+=("--jan-data-folder" "$JAN_DATA_FOLDER")
fi

if [[ "$DEV_MODE" == true ]]; then
  if [[ "$DEV_MODE_FULL" == true ]]; then
    echo "Starting full desktop dev workflow..."
    if [[ ${#LAUNCH_ARGS[@]} -gt 0 ]]; then
      (cd "$SCRIPT_DIR" && yarn dev:tauri:full -- "${LAUNCH_ARGS[@]}")
    else
      (cd "$SCRIPT_DIR" && yarn dev:tauri:full)
    fi
  else
    echo "Starting fast desktop dev workflow..."
    if [[ ${#LAUNCH_ARGS[@]} -gt 0 ]]; then
      (cd "$SCRIPT_DIR" && yarn dev -- "${LAUNCH_ARGS[@]}")
    else
      (cd "$SCRIPT_DIR" && yarn dev)
    fi
  fi
  exit $?
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
