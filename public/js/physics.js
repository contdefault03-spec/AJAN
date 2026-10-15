// 2.5D collision: axis-aligned boxes in XZ with a vertical span, circle-vs-box
// resolution for characters, and segment tests for line of sight / occlusion.
// Floor heights come from the multi-level layout (floors, stair ramps, elevator car).
import { LEVELS, RAMPS, rampHeight, levelIndex, floorAt, inElevator } from './layout.js';

export const BASEMENT_Y = LEVELS[0].y;

/** Live elevator car height (written by the elevator prop every frame). */
export const elevatorState = { y: 0 };

/** Ground height for a position: elevator car, stair ramps, then the floor of the current/lower level. */
export function groundAt(x, z, y) {
  if (inElevator(x, z)) return elevatorState.y;
  for (let i = 0; i < RAMPS.length; i++) {
    const r = RAMPS[i];
    if (r.disabled) continue; // e.g. the attic stairs before they're assembled
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
      // only when you're actually on (or just above / below) the steps here — not on a floor
      // that passes over or under this part of the staircase
      const h = rampHeight(r, x, z);
      if (y >= h - 1.0 && y <= h + 0.9) return h;
    }
  }
  for (let L = levelIndex(y + 0.6); L >= 0; L--) {
    if (floorAt(L, x, z)) return LEVELS[L].y;
  }
  return LEVELS[levelIndex(y)].y;
}

export const levelOf = y => levelIndex(y);

export const inStairs = p => RAMPS.some(r => p.x >= r.x0 - 0.5 && p.x <= r.x1 + 0.5 && p.z >= r.z0 - 0.8 && p.z <= r.z1 + 0.8);

/**
 * Push a circle (feet position) out of every overlapping collider.
 * who: 'player' | 'ajan' — some colliders only block one of them.
 */
export function collideCircle(p, r, height, colliders, who = 'player') {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.off) continue;
      if (c.ajanOnly && who !== 'ajan') continue;
      if (c.playerOnly && who !== 'player') continue;
      if (c.maxY < p.y + 0.35 || c.minY > p.y + height) continue;
      if (p.x + r < c.minX || p.x - r > c.maxX || p.z + r < c.minZ || p.z - r > c.maxZ) continue;
      const nx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - nx, dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 1e-8) {
        if (d2 < r * r) {
          const d = Math.sqrt(d2);
          p.x = nx + (dx / d) * r;
          p.z = nz + (dz / d) * r;
        }
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pen = [p.x - c.minX + r, c.maxX - p.x + r, p.z - c.minZ + r, c.maxZ - p.z + r];
        const m = Math.min(...pen);
        if (m === pen[0]) p.x = c.minX - r;
        else if (m === pen[1]) p.x = c.maxX + r;
        else if (m === pen[2]) p.z = c.minZ - r;
        else p.z = c.maxZ + r;
      }
    }
  }
}

function segHitsBox(ax, az, bx, bz, c, pad = 0) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const minX = c.minX - pad, maxX = c.maxX + pad, minZ = c.minZ - pad, maxZ = c.maxZ + pad;
  if (Math.abs(dx) < 1e-9) { if (ax < minX || ax > maxX) return false; }
  else {
    let ta = (minX - ax) / dx, tb = (maxX - ax) / dx;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (az < minZ || az > maxZ) return false; }
  else {
    let ta = (minZ - az) / dz, tb = (maxZ - az) / dz;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Count blocking colliders between two points at height y.
 * opts: { pad, occludeOnly (default true), max, who }
 */
export function segmentBlockers(ax, az, bx, bz, y, colliders, opts = {}) {
  const pad = opts.pad || 0;
  const max = opts.max ?? 99;
  let n = 0;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.off) continue;
    if ((opts.occludeOnly ?? true) && !c.occlude) continue;
    if (c.ajanOnly && opts.who !== 'ajan') continue;
    if (c.playerOnly && opts.who === 'ajan') continue;
    if (y < c.minY || y > c.maxY) continue;
    if (segHitsBox(ax, az, bx, bz, c, pad)) { n++; if (n >= max) return n; }
  }
  return n;
}

export function lineOfSight(a, b, colliders) {
  // Different floors never see each other except along a staircase.
  const la = levelOf(a.y), lb = levelOf(b.y);
  if (la !== lb && !(inStairs(a) && inStairs(b))) return false;
  const y = (a.y + b.y) / 2 + 1.3;
  return segmentBlockers(a.x, a.z, b.x, b.z, y, colliders, { max: 1 }) === 0;
}

/**
 * How well a sound at `src` carries to `dst`: 1 = clear, smaller = muffled.
 * Walls/closed doors and floors between the two points attenuate it.
 */
export function soundTransmission(src, dst, colliders, wallK = 0.55) {
  const walls = segmentBlockers(src.x, src.z, dst.x, dst.z, Math.max(src.y, dst.y) + 1.2, colliders, { max: 4 });
  const dl = Math.abs(levelOf(src.y) - levelOf(dst.y));
  const stairs = inStairs(src) || inStairs(dst);
  const floorK = dl === 0 ? 1 : Math.pow(stairs ? 0.55 : 0.28, dl);
  return { k: Math.pow(wallK, walls) * floorK, walls, floors: dl };
}
