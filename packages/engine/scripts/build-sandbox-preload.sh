#!/usr/bin/env bash
#
# build-sandbox-preload.sh — compile the LD_PRELOAD sandbox library.
#
# Usage:
#   ./scripts/build-sandbox-preload.sh [--output PATH]
#
# Output:
#   dist/sandbox-preload.so (default) or the path specified by --output.
#
# Requirements:
#   - cc (GCC or Clang)
#   - The source file at src/functions/sandbox-preload.c
#
# This script is idempotent: if cc is not available, it logs a warning
# and exits 0 (the sandbox is advisory-only without the library).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE_DIR="$(dirname "$SCRIPT_DIR")"
SOURCE="$ENGINE_DIR/src/functions/sandbox-preload.c"
OUTPUT="$ENGINE_DIR/dist/sandbox-preload.so"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    --output=*)
      OUTPUT="${1#--output=}"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--output PATH]"
      echo "Compiles the LD_PRELOAD sandbox library from sandbox-preload.c"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v cc &>/dev/null; then
  echo "WARNING: cc (C compiler) not found. Sandbox preload library not built." >&2
  echo "         Function execution will be advisory-only (no syscall enforcement)." >&2
  echo "         Install build-essential (Debian) or Xcode Command Line Tools (macOS)." >&2
  exit 0
fi

if [[ ! -f "$SOURCE" ]]; then
  echo "ERROR: Source file not found: $SOURCE" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

echo "Compiling sandbox-preload.c → $OUTPUT"
cc -shared -fPIC -o "$OUTPUT" "$SOURCE" -ldl

if [[ -f "$OUTPUT" ]]; then
  echo "Built: $OUTPUT"
  echo "Deploy: set LD_PRELOAD=$OUTPUT for function child processes."
else
  echo "ERROR: Build failed — $OUTPUT was not created" >&2
  exit 1
fi
