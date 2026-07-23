#!/bin/bash
# Build Aurealis2 WebAssembly module via Emscripten
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "=== Building Aurealis2 for Web (Emscripten) ==="

if [ -z "${EMSDK:-}" ]; then
    echo "Error: EMSDK environment variable not set."
    echo "Please source emsdk_env.sh first."
    exit 1
fi

cd "$PROJECT_DIR"

emcmake cmake -B build-web --preset web

cmake --build build-web --config Release -j$(nproc 2>/dev/null || sysctl -n hw.ncpu)

# Copy web resources alongside WASM output
cp -r Aurealis2/resources/web/* build-web/

echo "=== Web build complete ==="
echo "Serve build-web/ directory to test in browser."
