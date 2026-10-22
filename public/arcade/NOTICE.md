# Freedoom arcade — third-party notices and source

This cabinet plays **Freedoom: Phase 1**, using the DOOM-compatible doomgeneric
engine. No commercial DOOM WAD, executable, artwork, music, or logos are shipped.
Freedoom is an independent game; it is not the original id Software campaign.

## Data

- Freedoom 0.13.0: https://github.com/freedoom/freedoom/releases/tag/v0.13.0
- `freedoom1.wad` is taken unchanged from the official `freedoom-0.13.0.zip`.
- BSD 3-clause terms and attribution: [COPYING](licenses/freedoom-COPYING.txt),
  [credits](licenses/freedoom-CREDITS.txt), [music credits](licenses/freedoom-CREDITS-MUSIC.txt).
- Source data: https://github.com/freedoom/freedoom/tree/v0.13.0

## Engine and corresponding source

- doomgeneric revision `e257a09527062bfb986b6e5e0780839b6cbd5b71`:
  https://github.com/ozkl/doomgeneric
- [GPL version 2](licenses/doomgeneric-GPL-2.0.txt); individual source files retain
  their copyright notices and GPL-2.0-or-later grants.
- Complete engine source (upstream screenshots omitted): [doomgeneric archive](source/doomgeneric-e257a095.tar.gz).
- AJAN adapter changes, dated 2026-10-22: [C platform adapter](source/ajan_port.c),
  [browser input/framebuffer adapter](player.js), [HTML shell](index.html),
  [build script and engine patch](source/build.sh). These adapter files are
  available under GPL-2.0-or-later. No warranty is provided.
- Changes: 320×200 framebuffer, browser key queue, fixed 35 Hz single-tic
  scheduling, nonblocking transitions, sound cleanup, and engine diagnostics.
  Vanilla save/demo limits are disabled through the engine's config options.

## Linked dependencies

- SDL 2.30.8: [license](licenses/SDL.txt), [complete source](source/SDL-2.30.8.zip).
- SDL_mixer 2.8.0: [license](licenses/SDL_mixer.txt),
  [complete source](source/SDL_mixer-2.8.0.zip). Its bundled TiMidity code has
  [Artistic License terms](licenses/TiMidity-Artistic.txt).
- Emscripten 3.1.69: [MIT license](licenses/emscripten-MIT.txt),
  [compiler/runtime/system-library source and individual notices; unrelated tests/docs omitted](source/emscripten-3.1.69.tar.gz).
  The source archive includes musl's license and third-party notices. The compiler
  is a build tool, not a browser service. LLVM/Clang 19 is used for this build.

All runtime files are served locally. No CDN, game portal, external emulator
service, accounts, or commercial game downloads are required.

## Rebuild

Install Emscripten 3.1.69, Python 3, Bash and its LLVM/Node prerequisites.
Run `bash public/arcade/source/build.sh` from the repository. On Ubuntu's frozen
Emscripten package use a writable cache:

```
EM_FROZEN_CACHE=0 EM_CACHE=/tmp/ajan-emcache bash public/arcade/source/build.sh
```

Emscripten may download its pinned SDL build ports on the first build. Identical
source archives are provided above; no network access is used by the shipped game.
The official Freedoom WAD is already included and is loaded separately at runtime.
The build writes `doom.js` and `doom.wasm`. `SHA256SUMS` identifies shipped inputs
and binaries. Source and notices remain available directly from this directory.

## Controls and current scope

Arrows move/turn; Ctrl or left click fires; Space uses/opens doors; Shift runs;
Alt+arrows strafes; 1–7 select weapons; Tab shows the map; Space restarts after
Freedoom death. E, Escape or the leave button returns to AJAN.

One single-player Freedoom instance runs per occupied local cabinet. AJAN
multiplayer synchronizes occupancy, not DOOM gameplay or remote screen pixels.
Leaving ends that run; persistent saves are not implemented. This initial release
plays authentic WAD sound effects. MIDI background music is disabled (no instrument
bank is bundled). AJAN ambience and multiplayer voice continue normally.
