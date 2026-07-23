#!/bin/bash
# Build Aurealis2 for macOS (VST3 + AU)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "=== Building Aurealis2 for macOS ==="
cd "$PROJECT_DIR"

cmake -B build-release -DCMAKE_BUILD_TYPE=Release \
    -DAUREALIS2_BUILD_VST3=ON \
    -DAUREALIS2_BUILD_AU=ON \
    -DAUREALIS2_BUILD_TESTS=OFF

cmake --build build-release --config Release -j$(sysctl -n hw.ncpu)

echo "=== Build complete ==="
echo "Outputs in: $PROJECT_DIR/build-release/"
