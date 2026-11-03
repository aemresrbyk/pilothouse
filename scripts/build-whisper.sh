#!/usr/bin/env bash
# Builds a statically linked whisper-cli into vendor/whisper/ for bundling (used by CI and for local dev).
#   macOS:   universal (arm64 + x64) with Metal. Needs cmake and Xcode command line tools.
#   Linux:   CPU build. Needs cmake and a C/C++ compiler (build-essential).
#   Windows: CPU build from Git Bash. Needs cmake and Visual Studio Build Tools.
set -euo pipefail
VERSION="v1.9.5"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/vendor/whisper"

EXE=whisper-cli
FLAGS=(-DGGML_OPENMP=OFF) # no libgomp/vcomp runtime to ship
case "$(uname -s)" in
  Darwin) FLAGS=(-DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_BLAS=ON
                 "-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64" -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0) ;;
  MINGW*|MSYS*|CYGWIN*) EXE=whisper-cli.exe ;;
esac

[ -x "$OUT/$EXE" ] && { echo "whisper-cli already built: $OUT/$EXE"; exit 0; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git clone -q --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp.git "$WORK/src"
cmake -S "$WORK/src" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF \
  "${FLAGS[@]}" -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF >/dev/null
JOBS="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)"
cmake --build "$WORK/build" --config Release -j "$JOBS" --target whisper-cli >/dev/null
mkdir -p "$OUT"
# Single-config generators (make, ninja) put it in bin/, Visual Studio in bin/Release/.
BIN="$(ls "$WORK/build/bin/$EXE" "$WORK/build/bin/Release/$EXE" 2>/dev/null | head -1)"
cp "$BIN" "$OUT/$EXE"
if command -v lipo >/dev/null; then lipo -info "$OUT/$EXE"; else ls -l "$OUT/$EXE"; fi
