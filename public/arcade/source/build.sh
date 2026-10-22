#!/usr/bin/env bash
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"
out="$(dirname "$src")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tar -xzf "$src/doomgeneric-e257a095.tar.gz" -C "$work"
cp "$src/ajan_port.c" "$work/doomgeneric/ajan_port.c"
cd "$work/doomgeneric"
# Browser scheduling supplies one tic at 35 Hz; never busy-wait on a screen wipe.
python3 - <<'PY'
from pathlib import Path
p=Path('d_main.c');s=p.read_text();s=s.replace('wipe = true;', 'wipe = false; /* AJAN: non-blocking browser frames */');p.write_text(s)
PY
objects="$(sed -n 's/^SRC_DOOM = //p' Makefile.emscripten)"
sources=()
for obj in $objects; do
  if [ "$obj" = doomgeneric_emscripten.o ]; then sources+=(ajan_port.c); else sources+=("${obj%.o}.c"); fi
done
emcc "${sources[@]}" -O2 -DFEATURE_SOUND -DDOOMGENERIC_RESX=320 -DDOOMGENERIC_RESY=200 \
  -sUSE_SDL=2 -sUSE_SDL_MIXER=2 -sSDL2_MIXER_FORMATS='["mid"]' \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMODULARIZE=1 -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createDoom -sENVIRONMENT=web -sEXIT_RUNTIME=0 \
  -sEXPORTED_RUNTIME_METHODS='["FS","callMain"]' -sINVOKE_RUN=0 \
  -Wno-incompatible-pointer-types -Wno-int-conversion -o "$out/doom.js"
