// 2.5D collision: axis-aligned boxes in XZ with a vertical span, circle-vs-box
// resolution for characters, and segment tests for line of sight / occlusion.

export const BASEMENT_Y = -3.2;

/** Ground height for a position (handles the basement stair ramp). */
export function groundAt(x, z, y) {
  if (z > 17 && z < 21) {
    if (x >= 11.5 && x <= 16) return -3.2 * (16 - x) / 4.5;
    if (x > 16 && x < 17.2) return 0;
    if (x >= 10.8 && x < 11.5) return -3.2;
  }
  return y < -1.4 ? BASEMENT_Y : 0;
}

export const levelOf = y => (y < -1.4 ? 'B' : 'G');

/** Push a circle (feet position) out of every overlapping collider. */
export function collideCircle(p, r, height, colliders) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.off) continue;
      if (c.maxY < p.y + 0.35 || c.minY > p.y + height) continue;
      if (p.x + r < c.minX || p.x - r > c.maxX || p.z + r < c.minZ || p.z - r > c.maxZ) continue;
      const nx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      let dx = p.x - nx, dz = p.z - nz;
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
 * Count blocking colliders between two points at eye height y.
 * opts: { pad, occludeOnly (default true), max }
 */
export function segmentBlockers(ax, az, bx, bz, y, colliders, opts = {}) {
  const pad = opts.pad || 0;
  const max = opts.max ?? 99;
  let n = 0;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.off) continue;
    if ((opts.occludeOnly ?? true) && !c.occlude) continue;
    if (y < c.minY || y > c.maxY) continue;
    if (segHitsBox(ax, az, bx, bz, c, pad)) { n++; if (n >= max) return n; }
  }
  return n;
}

export function lineOfSight(a, b, colliders) {
  // Different floors never see each other except via the stair shaft.
  const la = levelOf(a.y), lb = levelOf(b.y);
  if (la !== lb && !(inStairs(a) || inStairs(b))) return false;
  const y = (a.y + b.y) / 2 + 1.3;
  return segmentBlockers(a.x, a.z, b.x, b.z, y, colliders, { max: 1 }) === 0;
}

export const inStairs = p => p.z > 17 && p.z < 21 && p.x > 10.8 && p.x < 17.2;
