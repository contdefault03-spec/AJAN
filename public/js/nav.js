// A* over the hand-placed waypoint graph. Locked doors are impassable.
import { segmentBlockers, levelOf, inStairs } from './physics.js';

export function nearestNode(nav, p, colliders, requireLOS = true) {
  const lvl = levelOf(p.y);
  const cands = [];
  for (const n of nav.nodes) {
    if (!n.edges.length) continue;
    const sameLevel = n.room?.startsWith('stair') ? inStairs(p) || Math.abs(n.y - p.y) < 1.8 : levelOf(n.y) === lvl;
    if (!sameLevel) continue;
    cands.push([Math.hypot(n.x - p.x, n.z - p.z) + Math.abs(n.y - p.y), n]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  if (!requireLOS) return cands[0]?.[1] || null;
  for (let i = 0; i < Math.min(10, cands.length); i++) {
    const n = cands[i][1];
    if (segmentBlockers(p.x, p.z, n.x, n.z, n.y + 1.0, colliders, { max: 1, occludeOnly: true }) === 0) return n;
  }
  return cands[0]?.[1] || null;
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
