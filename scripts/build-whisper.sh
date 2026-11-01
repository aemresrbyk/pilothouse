#!/usr/bin/env bash
# Builds a universal (arm64 + x64), statically linked whisper-cli into vendor/whisper/ for bundling.
# Needs cmake and Xcode command line tools. Used by CI and for local dev.
set -euo pipefail
VERSION="v1.9.5"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/vendor/whisper"
[ -x "$OUT/whisper-cli" ] && { echo "whisper-cli already built: $OUT/whisper-cli"; exit 0; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git clone -q --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp.git "$WORK/src"
cmake -S "$WORK/src" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DGGML_NATIVE=OFF -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_BLAS=ON \
  -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF >/dev/null
cmake --build "$WORK/build" -j "$(sysctl -n hw.ncpu)" --target whisper-cli >/dev/null
mkdir -p "$OUT"
cp "$WORK/build/bin/whisper-cli" "$OUT/whisper-cli"
lipo -info "$OUT/whisper-cli"
