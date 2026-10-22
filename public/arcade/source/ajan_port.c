/* AJAN browser adapter, 2026-10-22. GPL-2.0-or-later. */
#include <emscripten.h>
#include "doomgeneric.h"
#include "doomstat.h"
#include "d_player.h"
#include "m_fixed.h"
static unsigned short queue[512];
static unsigned int rd, wr;
void DG_Init(void) {}
void DG_DrawFrame(void) { EM_ASM({ if (Module.onFrame) Module.onFrame($0); }, DG_ScreenBuffer); }
void DG_SleepMs(uint32_t ms) {}
uint32_t DG_GetTicksMs(void) { return (uint32_t)emscripten_get_now(); }
void DG_SetWindowTitle(const char *title) {}
int DG_GetKey(int *pressed, unsigned char *key) {
    if (rd == wr) return 0;
    unsigned short v = queue[rd++ % 512]; *pressed = v >> 8; *key = v & 255; return 1;
}
EMSCRIPTEN_KEEPALIVE void arcade_key(int code, int down) {
    if (wr-rd < 512) queue[wr++ % 512] = (down ? 256 : 0) | (code & 255);
}
/* Diagnostics read actual engine state; no gameplay shortcuts. */
EMSCRIPTEN_KEEPALIVE double arcade_stat(int field) {
    player_t *p = &players[consoleplayer];
    switch(field) {
        case 0: return gametic;
        case 1: return p->mo ? p->mo->x / (double)FRACUNIT : 0;
        case 2: return p->mo ? p->mo->y / (double)FRACUNIT : 0;
        case 3: return p->ammo[am_clip];
        case 4: return p->health;
        case 5: return gamestate;
        case 6: return gamemap;
    }
    return 0;
}
EMSCRIPTEN_KEEPALIVE void arcade_tick(void) { doomgeneric_Tick(); }
int main(int argc, char **argv) { singletics = true; doomgeneric_Create(argc, argv); return 0; }
