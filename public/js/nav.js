// A* over the hand-placed waypoint graph. Locked doors are impassable.
import { segmentBlockers, levelOf, inStairs } from './physics.js';

export function nearestNode(nav, p, colliders, requireLOS = true) {
  let best = null, bestD = Infinity;
  const lvl = levelOf(p.y);
  for (const n of nav.nodes) {
    const sameLevel = n.room === 'stair' ? inStairs(p) || Math.abs(n.y - p.y) < 1.8 : levelOf(n.y) === lvl;
    if (!sameLevel) continue;
    const d = Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y);
    if (d >= bestD) continue;
    if (requireLOS && segmentBlockers(p.x, p.z, n.x, n.z, n.y + 1.0, colliders, { max: 1, occludeOnly: true }) > 0) continue;
    best = n; bestD = d;
  }
  if (!best && requireLOS) return nearestNode(nav, p, colliders, false);
  return best;
}

export function findPath(nav, fromId, toId, passable) {
  if (fromId === toId) return [fromId];
  const N = nav.byId;
  const goal = N[toId];
  const open = new Map([[fromId, 0]]);
  const g = new Map([[fromId, 0]]);
  const came = new Map();
  const h = id => Math.hypot(N[id].x - goal.x, N[id].z - goal.z) + Math.abs(N[id].y - goal.y);
  const f = new Map([[fromId, h(fromId)]]);
  while (open.size) {
    let cur = null, cf = Infinity;
    for (const id of open.keys()) { const v = f.get(id); if (v < cf) { cf = v; cur = id; } }
    if (cur === toId) {
      const path = [cur];
      while (came.has(cur)) { cur = came.get(cur); path.unshift(cur); }
      return path;
    }
    open.delete(cur);
    for (const e of N[cur].edges) {
      if (e.door && !passable(e.door)) continue;
      const ng = g.get(cur) + e.len;
      if (ng < (g.get(e.to) ?? Infinity)) {
        came.set(e.to, cur);
        g.set(e.to, ng);
        f.set(e.to, ng + h(e.to));
        open.set(e.to, true);
      }
    }
  }
  return null;
}

/** Door ids crossed between consecutive path nodes. */
export function doorBetween(nav, a, b) {
  const e = nav.byId[a]?.edges.find(x => x.to === b);
  return e?.door || null;
}
