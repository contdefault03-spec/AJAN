// The house: layout, walls with door openings, furniture, colliders, lights,
// windows, interactables (doors, drawers, hiding spots, TV, monitors, fuse box),
// painting slots, item spawn candidates and Ajan's navigation graph.
import * as THREE from 'three';
import { buildMaterials } from './textures.js';
import { segmentBlockers, groundAt, BASEMENT_Y } from './physics.js';
import { shuffle } from './util.js';

const T = 0.2; // wall thickness
const H = 3.0; // ground floor wall height
const BY = BASEMENT_Y;
const BC = -0.25; // basement ceiling

const TEX_SCALE = {
  wallA: 2.4, wallB: 2.4, wallC: 2.4, wallTile: 1.6, wallBase: 3, floorWood: 3, floorWoodDark: 3, floorTile: 2.4,
  floorBath: 2, floorConcrete: 4, carpet: 2, carpetB: 2, ceiling: 3, wood: 1.2, woodDark: 1.2, woodPale: 1.2,
  fabricRed: 1, fabricGreen: 1, fabricBed: 1.2, metal: 1, frame: 0.6,
};

export const ROOMS = [
  { id: 'bed1', name: 'BEDROOM', x0: 0, x1: 8, z0: 0, z1: 8, y: 0, floor: 'carpet', wall: 'wallB' },
  { id: 'bath', name: 'BATHROOM', x0: 8, x1: 13, z0: 0, z1: 8, y: 0, floor: 'floorBath', wall: 'wallTile' },
  { id: 'bed2', name: "CHILD'S ROOM", x0: 13, x1: 21, z0: 0, z1: 8, y: 0, floor: 'carpetB', wall: 'wallC' },
  { id: 'sec', name: 'SECURITY ROOM', x0: 21, x1: 30, z0: 0, z1: 8, y: 0, floor: 'floorTile', wall: 'wallA' },
  { id: 'hall', name: 'HALLWAY', x0: 0, x1: 30, z0: 8, z1: 11, y: 0, floor: 'floorWoodDark', wall: 'wallA' },
  { id: 'living', name: 'LIVING ROOM', x0: 0, x1: 11, z0: 11, z1: 21, y: 0, floor: 'floorWood', wall: 'wallB' },
  { id: 'start', name: 'BACK ROOM', x0: 11, x1: 17, z0: 11, z1: 17, y: 0, floor: 'floorWoodDark', wall: 'wallC' },
  { id: 'stair', name: 'STAIRWELL', x0: 11, x1: 17, z0: 17, z1: 21, y: 0, floor: null, wall: 'wallBase' },
  { id: 'kitchen', name: 'KITCHEN', x0: 17, x1: 30, z0: 11, z1: 21, y: 0, floor: 'floorTile', wall: 'wallA' },
  { id: 'base', name: 'BASEMENT', x0: 2, x1: 17, z0: 17, z1: 27, y: BY, floor: 'floorConcrete', wall: 'wallBase' },
];

export function roomAt(x, z, y = 0) {
  const basement = y < -1.4;
  if (z > 17 && z < 21 && x > 11 && x < 17) return ROOMS.find(r => r.id === 'stair');
  for (const r of ROOMS) {
    if ((r.y < -1) !== basement) continue;
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  }
  return null;
}

// Doors: line 'x' = wall runs along X at z=c; line 'z' = wall runs along Z at x=c.
export const DOORS = [
  { id: 'd_bed1', line: 'x', c: 8, a0: 3.0, w: 1.1, swing: -1, name: 'Bedroom Door' },
  { id: 'd_bath', line: 'x', c: 8, a0: 10.0, w: 1.1, swing: -1, name: 'Bathroom Door' },
  { id: 'd_bed2', line: 'x', c: 8, a0: 16.0, w: 1.1, swing: -1, name: 'Bedroom Door' },
  { id: 'd_sec', line: 'x', c: 8, a0: 25.0, w: 1.1, swing: -1, lock: 'power', name: 'Security Room Door' },
  { id: 'd_living', line: 'x', c: 11, a0: 5.0, w: 1.1, swing: 1, name: 'Living Room Door' },
  { id: 'd_start_n', line: 'x', c: 11, a0: 13.5, w: 1.1, swing: 1, name: 'Door' },
  { id: 'd_kitchen', line: 'x', c: 11, a0: 22.0, w: 1.1, swing: 1, name: 'Kitchen Door' },
  { id: 'd_start_w', line: 'z', c: 11, a0: 13.5, w: 1.1, swing: -1, name: 'Door' },
  { id: 'd_start_e', line: 'z', c: 17, a0: 13.5, w: 1.1, swing: 1, name: 'Door' },
  { id: 'd_basement', line: 'z', c: 17, a0: 18.6, w: 1.1, swing: 1, lock: 'basement_key', name: 'Basement Door' },
  { id: 'd_front', line: 'x', c: 21, a0: 4.0, w: 1.3, swing: -1, lock: 'exit_key', name: 'Front Door', exit: true },
];
const OPENINGS = [{ line: 'z', c: 8, a0: 23.0, w: 1.4, y0: BY, h: 2.3 }];
const DOOR_H = 2.3;

// line, c, a0, a1, y0, y1
const WALLS = [
  ['x', 0, 0, 30, 0, H], ['x', 8, 0, 30, 0, H], ['x', 11, 0, 30, 0, H],
  ['x', 17, 11, 17, BY, H],
  ['x', 21, 0, 11, 0, H], ['x', 21, 11, 17, BY, H], ['x', 21, 17, 30, 0, H],
  ['z', 0, 0, 21, 0, H], ['z', 30, 0, 21, 0, H],
  ['z', 8, 0, 8, 0, H], ['z', 13, 0, 8, 0, H], ['z', 21, 0, 8, 0, H],
  ['z', 11, 11, 17, 0, H], ['z', 11, 17, 21, -0.2, H],
  ['z', 17, 11, 17, 0, H], ['z', 17, 17, 21, 0, H], ['z', 17, 17, 21, BY, 0],
  // basement
  ['z', 2, 17, 27, BY, BC], ['x', 27, 2, 17, BY, BC], ['z', 17, 21, 27, BY, BC], ['x', 17, 2, 11, BY, BC],
  ['z', 8, 21, 27, BY, BC],
];

// ---------------------------------------------------------------------------
class GeoBuilder {
  constructor() { this.buckets = new Map(); }
  bucket(key) {
    let b = this.buckets.get(key);
    if (!b) { b = { pos: [], nor: [], uv: [], idx: [] }; this.buckets.set(key, b); }
    return b;
  }
  quad(key, pts, n, uvFn) {
    const b = this.bucket(key);
    const base = b.pos.length / 3;
    for (const p of pts) {
      b.pos.push(p[0], p[1], p[2]);
      b.nor.push(n[0], n[1], n[2]);
      const [u, v] = uvFn(p);
      b.uv.push(u, v);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Axis-aligned box from extents. mat: key or fn(axis, sign, center) => key. */
  box(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    const f = typeof mat === 'function' ? mat : () => mat;
    const ts = k => TEX_SCALE[k] || 1;
    const faces = [
      ['x', 1, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], p => [-p[2], p[1]]],
      ['x', -1, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], p => [p[2], p[1]]],
      ['z', 1, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], p => [p[0], p[1]]],
      ['z', -1, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], p => [-p[0], p[1]]],
      ['y', 1, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], p => [p[0], -p[2]]],
      ['y', -1, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], p => [p[0], p[2]]],
    ];
    for (const [axis, sign, pts, n, uvf] of faces) {
      if (axis === 'y' && sign === -1 && !opts.bottom) continue;
      if (opts.skip && opts.skip.includes(axis + (sign > 0 ? '+' : '-'))) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
      const key = f(axis, sign, { x: cx, y: cy, z: cz });
      if (!key) continue;
      const s = ts(key);
      this.quad(key, pts, n, p => { const [u, v] = uvf(p); return [u / s, v / s]; });
    }
  }
  /** Horizontal plane (floor if up, ceiling if down). */
  plane(key, x0, z0, x1, z1, y, up = true) {
    const s = TEX_SCALE[key] || 1;
    const pts = up
      ? [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]]
      : [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
    this.quad(key, pts, [0, up ? 1 : -1, 0], p => [p[0] / s, p[2] / s]);
  }
  build(M) {
    const meshes = [];
    for (const [key, b] of this.buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, M[key]);
      m.receiveShadow = true;
      m.castShadow = !key.startsWith('floor') && !key.startsWith('carpet') && key !== 'ceiling';
      m.name = 'static_' + key;
      meshes.push(m);
    }
    return meshes;
  }
}

const YAW = { '+z': 0, '+x': Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 };
const DIR = { '+z': [0, 1], '-z': [0, -1], '+x': [1, 0], '-x': [-1, 0] };

function bx(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
export class House {
  constructor() {
    this.M = buildMaterials();
    this.group = new THREE.Group();
    this.colliders = [];
    this.doors = new Map();
    this.containers = new Map();
    this.hides = new Map();
    this.interactables = new Map();
    this.pickMeshes = [];
    this.lights = [];
    this.windows = [];
    this.paintingSlots = [];
    this.paintingMeshes = [];
    this.monitors = [];
    this.notes = [];
    this.itemMeshes = new Map();
    this.flickerT = 0;
    this.power = false;
    this.blackout = 0;
    this.geo = new GeoBuilder();
    this.build();
  }

  collider(x0, z0, x1, z1, y0, y1, opts = {}) {
    const c = { minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), minY: y0, maxY: y1, occlude: opts.occlude ?? false, ...opts };
    this.colliders.push(c);
    return c;
  }

  register(id, kind, meshes, pos, data = {}) {
    const it = { id, kind, meshes, pos, ...data };
    this.interactables.set(id, it);
    meshes.forEach(m => m.traverse(o => { if (o.isMesh) { o.userData.iid = id; this.pickMeshes.push(o); } }));
    return it;
  }

  wallMat(axis, sign, c) {
    if (axis === 'y') return 'wallBase';
    const off = 0.35;
    const x = c.x + (axis === 'x' ? sign * off : 0);
    const z = c.z + (axis === 'z' ? sign * off : 0);
    const r = roomAt(x, z, c.y);
    if (!r) return 'wallBase';
    if (c.y < -0.1 && r.id !== 'base' && r.id !== 'stair') return 'wallBase';
    return r.wall;
  }

  build() {
    const G = this.geo;
    // ---------------- walls
    const all = [...DOORS.map(d => ({ ...d, y0: 0, h: DOOR_H })), ...OPENINGS];
    for (const [line, c, a0, a1, y0, y1] of WALLS) {
      const cuts = all.filter(d => d.line === line && d.c === c && d.a0 >= a0 - 0.01 && d.a0 + d.w <= a1 + 0.01 && d.y0 < y1 && d.y0 + d.h > y0)
        .sort((p, q) => p.a0 - q.a0);
      let s = a0 - T / 2;
      const segs = [];
      for (const d of cuts) {
        segs.push([s, d.a0, y0, y1]);
        if (d.y0 + d.h < y1) segs.push([d.a0, d.a0 + d.w, d.y0 + d.h, y1]);
        s = d.a0 + d.w;
      }
      segs.push([s, a1 + T / 2, y0, y1]);
      for (const [p, q, ya, yb] of segs) {
        if (q - p < 0.01) continue;
        if (line === 'x') {
          G.box(p, ya, c - T / 2, q, yb, c + T / 2, (ax, sg, ce) => this.wallMat(ax, sg, ce));
          this.collider(p, c - T / 2, q, c + T / 2, ya, yb, { occlude: true, wall: true });
        } else {
          G.box(c - T / 2, ya, p, c + T / 2, yb, q, (ax, sg, ce) => this.wallMat(ax, sg, ce));
          this.collider(c - T / 2, p, c + T / 2, q, ya, yb, { occlude: true, wall: true });
        }
      }
    }
    // Door frames (trim)
    for (const d of DOORS) {
      const t = 0.08;
      if (d.line === 'x') {
        G.box(d.a0 - t, 0, d.c - T / 2 - 0.02, d.a0, DOOR_H, d.c + T / 2 + 0.02, 'woodDark');
        G.box(d.a0 + d.w, 0, d.c - T / 2 - 0.02, d.a0 + d.w + t, DOOR_H, d.c + T / 2 + 0.02, 'woodDark');
        G.box(d.a0 - t, DOOR_H, d.c - T / 2 - 0.02, d.a0 + d.w + t, DOOR_H + t, d.c + T / 2 + 0.02, 'woodDark');
      } else {
        G.box(d.c - T / 2 - 0.02, 0, d.a0 - t, d.c + T / 2 + 0.02, DOOR_H, d.a0, 'woodDark');
        G.box(d.c - T / 2 - 0.02, 0, d.a0 + d.w, d.c + T / 2 + 0.02, DOOR_H, d.a0 + d.w + t, 'woodDark');
        G.box(d.c - T / 2 - 0.02, DOOR_H, d.a0 - t, d.c + T / 2 + 0.02, DOOR_H + t, d.a0 + d.w + t, 'woodDark');
      }
    }

    // ---------------- floors & ceilings
    for (const r of ROOMS) {
      if (r.id === 'stair') continue;
      if (r.id === 'base') {
        G.plane(r.floor, r.x0, r.z0, r.x1, r.z1, BY, true);
        G.plane('ceiling', 2, 17, 11, 21, BC, false);
        G.plane('ceiling', 2, 21, 17, 27, BC, false);
        continue;
      }
      G.plane(r.floor, r.x0, r.z0, r.x1, r.z1, 0, true);
      G.plane('ceiling', r.x0, r.z0, r.x1, r.z1, H, false);
      // Baseboards
      const bb = 0.12;
      G.box(r.x0 + T / 2, 0, r.z0 + T / 2, r.x1 - T / 2, bb, r.z0 + T / 2 + 0.02, 'woodDark', { skip: ['y-'] });
      G.box(r.x0 + T / 2, 0, r.z1 - T / 2 - 0.02, r.x1 - T / 2, bb, r.z1 - T / 2, 'woodDark');
    }
    // Stairwell: landing, steps, ceiling, rail
    G.plane('floorWoodDark', 16, 17, 17, 21, 0, true);
    G.plane('ceiling', 11, 17, 17, 21, H, false);
    const steps = 16, run = 4.5 / steps, rise = 3.2 / steps;
    for (let i = 0; i < steps; i++) {
      const xa = 16 - (i + 1) * run, xb = 16 - i * run;
      G.box(xa, BY, 17.1, xb, -(i + 1) * rise + rise * 0.5, 20.9, 'floorWoodDark', { skip: ['x+', 'x-'] });
      G.box(xb - 0.02, -(i + 1) * rise, 17.1, xb, -(i + 1) * rise + rise * 0.5, 20.9, 'woodDark');
    }
    // Stair rail along the north side
    for (let i = 0; i <= 6; i++) {
      const x = 16 - i * 0.75;
      const y = groundAt(x, 18, 0);
      G.box(x - 0.03, y, 17.2, x + 0.03, y + 0.95, 17.26, 'woodDark');
    }

    this.buildFurniture();
    this.buildDoors();
    this.buildLights();
    this.buildWindows();
    this.buildNav();

    for (const m of G.build(this.M)) {
      this.group.add(m);
      this.staticMeshes = this.staticMeshes || [];
      this.staticMeshes.push(m);
    }
    // Outside the front door: a dark porch so the doorway isn't a void.
    const porch = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), this.M.floorConcrete);
    porch.rotation.x = -Math.PI / 2;
    porch.position.set(4.65, -0.02, 23);
    this.group.add(porch);
    this.collider(2, 22.6, 8, 23, 0, 3); // invisible porch boundary
    this.collider(2, 21, 2.4, 23, 0, 3);
    this.collider(7.2, 21, 7.6, 23, 0, 3);
  }

  // ------------------------------------------------------------- furniture
  furnitureBox(x0, y0, z0, x1, y1, z1, mat, collide = true, occlude = false) {
    this.geo.box(x0, y0, z0, x1, y1, z1, mat);
    if (collide) this.collider(x0, z0, x1, z1, y0, y1, { occlude, furniture: true });
  }

  table(x0, z0, x1, z1, h, mat = 'wood', y = 0) {
    const G = this.geo, l = 0.06;
    G.box(x0, y + h - 0.05, z0, x1, y + h, z1, mat, { bottom: true });
    for (const [x, z] of [[x0, z0], [x1 - l, z0], [x0, z1 - l], [x1 - l, z1 - l]]) G.box(x, y, z, x + l, y + h - 0.05, z + l, mat);
    this.collider(x0, z0, x1, z1, y, y + h);
  }

  chair(x, z, y = 0, mat = 'wood') {
    const G = this.geo, s = 0.22;
    G.box(x - s, y + 0.42, z - s, x + s, y + 0.47, z + s, mat, { bottom: true });
    for (const [dx, dz] of [[-s, -s], [s - 0.04, -s], [-s, s - 0.04], [s - 0.04, s - 0.04]]) G.box(x + dx, y, z + dz, x + dx + 0.04, y + 0.42, z + dz + 0.04, mat);
    G.box(x - s, y + 0.47, z - s, x + s, y + 0.95, z - s + 0.04, mat);
    this.collider(x - s, z - s, x + s, z + s, y, y + 0.9);
  }

  bed(x0, z0, x1, z1) {
    const G = this.geo;
    G.box(x0, 0, z0, x1, 0.35, z1, 'woodDark');
    G.box(x0 + 0.05, 0.35, z0 + 0.05, x1 - 0.05, 0.55, z1 - 0.05, 'fabricBed');
    G.box(x0, 0, z0 - 0.06, x1, 1.0, z0, 'woodDark');
    G.box((x0 + x1) / 2 - 0.35, 0.55, z0 + 0.1, (x0 + x1) / 2 + 0.35, 0.68, z0 + 0.45, 'fabricBed');
    G.box(x0 + 0.04, 0.55, z0 + 0.9, x1 - 0.04, 0.6, z1 - 0.1, 'fabricRed');
    this.collider(x0, z0 - 0.06, x1, z1, 0, 0.6);
  }

  shelf(x0, z0, x1, z1, h, mat = 'woodDark', y = 0, boxes = true) {
    const G = this.geo;
    const n = Math.max(2, Math.round(h / 0.45));
    const vert = (x1 - x0) > (z1 - z0);
    G.box(x0, y, z0, vert ? x0 + 0.04 : x1, y + h, vert ? z1 : z0 + 0.04, mat);
    G.box(vert ? x1 - 0.04 : x0, y, vert ? z0 : z1 - 0.04, x1, y + h, z1, mat);
    for (let i = 0; i <= n; i++) {
      const yy = y + (i / n) * (h - 0.03);
      G.box(x0, yy, z0, x1, yy + 0.03, z1, mat, { bottom: true });
      if (boxes && i < n) {
        // clutter: books / jars
        let p = 0.05;
        const L = vert ? x1 - x0 : z1 - z0;
        while (p < L - 0.1) {
          const w = 0.04 + Math.abs(Math.sin(p * 37 + i * 11)) * 0.12;
          const hh = 0.12 + Math.abs(Math.sin(p * 13 + i)) * 0.2;
          if (Math.sin(p * 91 + i * 7) > -0.3) {
            const k = ['woodDark', 'fabricRed', 'fabricGreen', 'woodPale'][(Math.floor(p * 31) + i) % 4];
            if (vert) G.box(x0 + p, yy + 0.03, z0 + 0.03, x0 + p + w, yy + 0.03 + hh, z1 - 0.03, k);
            else G.box(x0 + 0.03, yy + 0.03, z0 + p, x1 - 0.03, yy + 0.03 + hh, z0 + p + w, k);
          }
          p += w + 0.02;
        }
      }
    }
    this.collider(x0, z0, x1, z1, y, y + h, { occlude: h > 1.6 });
  }

  /** Tall cabinet you can hide inside. facing = direction its doors face. */
  hideSpot(id, cx, cz, w, d, h, facing, matKey, y = 0) {
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    g.rotation.y = YAW[facing];
    const mat = this.M[matKey];
    const t = 0.04;
    const parts = [
      [w, h, t, 0, h / 2, -d / 2 + t / 2],
      [t, h, d, -w / 2 + t / 2, h / 2, 0],
      [t, h, d, w / 2 - t / 2, h / 2, 0],
      [w, t, d, 0, h - t / 2, 0],
      [w, t, d, 0, t / 2, 0],
    ];
    for (const [a, b, c, px, py, pz] of parts) { const m = bx(a, b, c, mat); m.position.set(px, py, pz); g.add(m); }
    const doors = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * w / 2, 0, d / 2);
      const panel = bx(w / 2 - 0.01, h - 0.02, 0.03, mat);
      panel.position.set(-side * (w / 4), h / 2, 0);
      const knob = bx(0.03, 0.08, 0.04, this.M.brass);
      knob.position.set(-side * (w / 2 - 0.06), h / 2, 0.03);
      pivot.add(panel, knob);
      // slats so you can peek out
      g.add(pivot);
      doors.push({ pivot, side });
    }
    this.group.add(g);
    const [fx, fz] = DIR[facing];
    const ww = facing === '+x' || facing === '-x' ? d : w, dd = facing === '+x' || facing === '-x' ? w : d;
    this.collider(cx - ww / 2, cz - dd / 2, cx + ww / 2, cz + dd / 2, y, y + h, { occlude: true, furniture: true });
    const spot = {
      id, group: g, doors, open: 0, target: 0,
      inside: new THREE.Vector3(cx + fx * 0.05, y, cz + fz * 0.05),
      exit: new THREE.Vector3(cx + fx * (d / 2 + 0.55), y, cz + fz * (d / 2 + 0.55)),
      yaw: Math.atan2(-fx, -fz), // camera yaw looking out of the doors
      occupant: null,
    };
    this.hides.set(id, spot);
    this.register(id, 'hide', [g], new THREE.Vector3(cx + fx * d / 2, y + 1.2, cz + fz * d / 2), { spot });
    return spot;
  }

  /** A drawer (slides) or cabinet (hinged door) that can hold an item. */
  container(id, type, cx, y, cz, w, h, d, facing, matKey, name) {
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    g.rotation.y = YAW[facing];
    const mat = this.M[matKey];
    const part = new THREE.Group();
    if (type === 'drawer') {
      const front = bx(w - 0.02, h - 0.02, 0.03, mat);
      front.position.set(0, h / 2, d / 2 + 0.02);
      const bottom = bx(w - 0.06, 0.02, d - 0.05, this.M.woodDark);
      bottom.position.set(0, 0.03, 0);
      const knob = bx(0.08, 0.025, 0.03, this.M.brass);
      knob.position.set(0, h / 2, d / 2 + 0.045);
      part.add(front, bottom, knob);
    } else {
      const panel = bx(w - 0.02, h - 0.02, 0.03, mat);
      panel.position.set(w / 2 - 0.01, h / 2, 0.02);
      const knob = bx(0.025, 0.08, 0.03, this.M.brass);
      knob.position.set(w - 0.07, h / 2, 0.045);
      part.add(panel, knob);
      part.position.set(-w / 2, 0, d / 2);
      // hollow shell so the contents are visible when the door opens
      const t = 0.03;
      for (const [a, b, c2, px, py, pz] of [[w, h, t, 0, h / 2, -d / 2 + t / 2], [t, h, d, -w / 2 + t / 2, h / 2, 0], [t, h, d, w / 2 - t / 2, h / 2, 0], [w, t, d, 0, h - t / 2, 0], [w, t, d, 0, t / 2, 0]]) {
        const m = bx(a, b, c2, mat);
        m.position.set(px, py, pz);
        g.add(m);
      }
    }
    g.add(part);
    this.group.add(g);
    const [fx, fz] = DIR[facing];
    const c = { id, type, group: g, part, open: 0, target: 0, d, w, h, name, facing, slot: new THREE.Vector3(0, type === 'drawer' ? 0.05 : 0.08, type === 'drawer' ? 0 : -d / 2 + 0.12) };
    this.containers.set(id, c);
    this.register(id, 'container', [part], new THREE.Vector3(cx + fx * d / 2, y + h / 2, cz + fz * d / 2), { container: c, name });
    return c;
  }

  note(id, x, y, z, rotY, text) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), this.M.paper);
    m.rotation.set(-Math.PI / 2, 0, rotY);
    m.position.set(x, y + 0.005, z);
    m.receiveShadow = true;
    this.group.add(m);
    this.notes.push(m);
    this.register(id, 'note', [m], new THREE.Vector3(x, y, z), { text });
  }

  painting(x, y, z, facing, w = 0.62, h = 0.86) {
    const [fx, fz] = DIR[facing];
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = YAW[facing];
    const fr = 0.06;
    for (const [a, b, px, py] of [[w + fr * 2, fr, 0, h / 2 + fr / 2], [w + fr * 2, fr, 0, -h / 2 - fr / 2], [fr, h, -w / 2 - fr / 2, 0], [fr, h, w / 2 + fr / 2, 0]]) {
      const m = bx(a, b, 0.05, this.M.frame);
      m.position.set(px, py, 0.025);
      g.add(m);
    }
    const back = bx(w, h, 0.02, this.M.dark);
    back.position.z = 0.01;
    const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8 }));
    canvasMesh.position.z = 0.025;
    canvasMesh.receiveShadow = true;
    g.add(back, canvasMesh);
    // Slight random tilt for an unkempt look
    g.rotation.z = (Math.sin(x * 13.1 + z * 7.7) * 0.04);
    this.group.add(g);
    this.paintingSlots.push({ group: g, mesh: canvasMesh, pos: new THREE.Vector3(x + fx * 0.05, y, z + fz * 0.05) });
  }

  buildFurniture() {
    const G = this.geo;
    const M = this.M;

    // ===== Bedroom 1
    this.bed(0.2, 0.36, 2.3, 2.6);
    this.furnitureBox(2.45, 0, 0.12, 3.05, 0.6, 0.62, 'woodDark');
    this.container('c_ns1', 'drawer', 2.75, 0.38, 0.62 - 0.22, 0.5, 0.16, 0.42, '+z', 'wood', 'Nightstand');
    this.hideSpot('h_bed1', 7.15, 0.62, 1.2, 0.8, 2.15, '+z', 'woodDark');
    this.furnitureBox(0.12, 0, 4.4, 0.62, 0.95, 6.0, 'wood');
    G.box(0.1, 0.002, 3, 3.5, 0.008, 5.4, 'fabricRed');
    this.chair(5.2, 6.4);
    this.furnitureBox(5.6, 0, 3.0, 6.1, 0.45, 3.5, 'woodPale');
    this.painting(7.88, 1.7, 4.2, '-x');
    this.painting(0.12, 1.85, 5.2, '+x');

    // ===== Bathroom
    this.furnitureBox(8.12, 0, 0.12, 9.9, 0.6, 1.95, 'porcelain', true);
    G.box(8.3, 0.3, 0.3, 9.72, 0.61, 1.77, 'dark');
    this.furnitureBox(12.2, 0, 0.15, 12.8, 0.45, 0.85, 'porcelain');
    G.box(12.2, 0.45, 0.12, 12.8, 0.95, 0.3, 'porcelain');
    this.furnitureBox(11.0, 0, 0.12, 11.9, 0.85, 0.62, 'porcelain');
    G.box(11.05, 1.25, 0.11, 11.85, 1.95, 0.13, 'metal'); // mirror frame
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x9aa4a6, metalness: 0.9, roughness: 0.25 }));
    mirror.position.set(11.45, 1.6, 0.135);
    this.group.add(mirror);
    this.collider(12.4, 2.95, 12.9, 4.25, 0, 0.9);
    this.container('c_bath', 'cabinet', 12.65, 0.05, 3.6, 1.2, 0.85, 0.5, '-x', 'woodPale', 'Cabinet');
    this.painting(8.12, 1.75, 5.5, '+x', 0.5, 0.7);

    // ===== Bedroom 2
    this.bed(18.6, 0.36, 20.8, 2.6);
    this.hideSpot('h_bed2', 13.85, 0.62, 1.2, 0.8, 2.15, '+z', 'wood');
    this.furnitureBox(19.95, 0, 3.9, 20.88, 0.76, 5.5, 'wood');
    this.container('c_desk2', 'drawer', 20.16, 0.52, 4.7, 0.55, 0.16, 0.42, '-x', 'woodPale', 'Desk');
    this.chair(19.35, 5.65);
    G.box(14, 0.002, 3.5, 17.5, 0.008, 6, 'fabricGreen');
    this.furnitureBox(15.2, 0, 6.6, 15.9, 0.5, 7.3, 'woodPale');
    this.painting(13.12, 1.7, 4.6, '+x');
    this.painting(20.88, 1.8, 6.6, '-x', 0.5, 0.7);

    // ===== Security room
    this.furnitureBox(23.4, 0, 0.12, 28.6, 0.78, 1.25, 'woodDark');
    this.chair(26, 2.1, 0, 'metal');
    this.shelf(29.3, 2.5, 29.88, 6.5, 2.0, 'metal', 0, true);
    this.furnitureBox(21.15, 0, 6.2, 22.0, 1.3, 7.7, 'metal', true);
    for (let i = 0; i < 4; i++) {
      const x = 24.1 + i * 1.25;
      const casing = bx(1.0, 0.75, 0.55, M.dark);
      casing.position.set(x, 0.78 + 0.4, 0.55);
      this.group.add(casing);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.6), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      scr.position.set(x, 0.78 + 0.41, 0.83 + 0.005);
      this.group.add(scr);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false }));
      label.position.set(x, 0.78 + 0.41, 0.84);
      label.renderOrder = 2;
      this.group.add(label);
      const mon = { index: i, screen: scr, label, pos: new THREE.Vector3(x, 1.2, 0.86) };
      this.monitors.push(mon);
      this.register('mon' + i, 'monitor', [scr, casing], mon.pos, { monitor: mon });
    }

    // ===== Hallway
    this.furnitureBox(19.0, 0, 8.12, 20.2, 0.8, 8.55, 'wood');
    this.furnitureBox(8.0, 0, 10.45, 9.0, 0.8, 10.88, 'wood');
    G.box(1, 0.002, 9.1, 29, 0.008, 9.9, 'fabricRed');
    this.painting(7.0, 1.7, 8.12, '+z');
    this.painting(13.4, 1.75, 8.12, '+z', 0.5, 0.7);
    this.painting(28.0, 1.7, 8.12, '+z');
    this.painting(2.5, 1.7, 10.88, '-z');
    this.painting(18.5, 1.75, 10.88, '-z', 0.5, 0.7);
    this.painting(27.0, 1.7, 10.88, '-z');

    // ===== Living room
    this.furnitureBox(0.12, 0, 14.4, 0.85, 0.55, 16.1, 'woodDark');
    this.furnitureBox(3.4, 0, 14.0, 4.3, 0.45, 16.6, 'fabricRed');
    G.box(4.0, 0.45, 14.0, 4.3, 0.95, 16.6, 'fabricRed');
    G.box(3.4, 0.45, 14.0, 4.0, 0.7, 14.25, 'fabricRed');
    G.box(3.4, 0.45, 16.35, 4.0, 0.7, 16.6, 'fabricRed');
    this.table(1.8, 14.6, 2.8, 15.9, 0.45, 'wood');
    this.furnitureBox(1.0, 0, 18.5, 1.85, 0.45, 19.4, 'fabricGreen');
    G.box(1.0, 0.45, 19.15, 1.85, 1.0, 19.4, 'fabricGreen');
    this.shelf(7.5, 11.12, 9.5, 11.55, 2.0, 'woodDark', 0, true);
    this.furnitureBox(10.35, 0, 17.8, 10.9, 1.2, 19.8, 'woodDark', true);
    G.box(10.3, 0.1, 18.3, 10.36, 0.8, 19.3, 'black');
    G.box(1.2, 0.002, 13, 6.5, 0.008, 17.5, 'carpet');
    this.painting(2.6, 1.75, 11.12, '+z');
    this.painting(10.88, 1.7, 12.4, '-x', 0.5, 0.7);
    this.painting(1.8, 1.7, 20.88, '-z');
    // CRT television on the stand, facing +x
    const tv = new THREE.Group();
    tv.position.set(0.48, 0.55, 15.25);
    const body = bx(0.55, 0.52, 0.66, M.woodDark);
    body.position.y = 0.26;
    const bezel = bx(0.04, 0.44, 0.56, M.black);
    bezel.position.set(0.27, 0.27, 0);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.36), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    screen.rotation.y = Math.PI / 2;
    screen.position.set(0.295, 0.28, -0.02);
    const ant = bx(0.02, 0.4, 0.02, M.metal);
    ant.position.set(0, 0.7, 0.1);
    ant.rotation.x = 0.4;
    const ant2 = ant.clone();
    ant2.position.z = -0.1;
    ant2.rotation.x = -0.4;
    tv.add(body, bezel, screen, ant, ant2);
    this.group.add(tv);
    this.tv = { group: tv, screen, pos: new THREE.Vector3(0.8, 0.85, 15.25) };
    this.register('tv', 'tv', [screen, body], this.tv.pos);

    // ===== Start (back) room
    this.furnitureBox(11.3, 0, 15.2, 13.1, 0.22, 16.8, 'fabricBed');
    this.furnitureBox(15.5, 0, 15.6, 16.8, 0.7, 16.8, 'woodPale');
    this.furnitureBox(16.0, 0.7, 15.9, 16.6, 1.05, 16.5, 'woodPale');
    this.table(15.8, 11.25, 16.75, 11.95, 0.7, 'woodDark');
    this.chair(12.0, 12.0);
    this.painting(14.3, 1.7, 16.88, '-z');

    // ===== Kitchen
    this.furnitureBox(29.3, 0, 12.0, 29.9, 0.92, 20.0, 'woodPale');
    G.box(29.25, 0.92, 12.0, 29.9, 0.97, 20.0, 'porcelain');
    G.box(29.3, 0.93, 13.0, 29.9, 0.98, 14.0, 'metal'); // stove top
    G.box(29.5, 1.6, 12.0, 29.9, 2.3, 20.0, 'woodPale'); // upper cupboards
    this.furnitureBox(24.0, 0, 11.12, 29.3, 0.92, 11.7, 'woodPale');
    G.box(24.0, 0.92, 11.1, 29.3, 0.97, 11.75, 'porcelain');
    this.container('c_kit1', 'drawer', 29.575, 0.68, 16.5, 0.6, 0.18, 0.55, '-x', 'woodPale', 'Drawer');
    this.container('c_kit2', 'drawer', 26.5, 0.68, 11.7 - 0.27, 0.6, 0.18, 0.5, '+z', 'woodPale', 'Drawer');
    this.furnitureBox(17.15, 0, 11.15, 17.95, 1.85, 12.0, 'porcelain', true, true);
    this.table(22.0, 15.0, 24.0, 16.6, 0.76, 'wood');
    this.chair(21.6, 15.8);
    this.chair(24.4, 15.8);
    this.chair(23.0, 17.0);
    this.hideSpot('h_pantry', 26.6, 20.48, 1.2, 0.7, 2.15, '-z', 'woodPale');
    this.painting(17.12, 1.7, 16.2, '+x', 0.5, 0.7);
    this.painting(22.5, 1.7, 20.88, '-z');

    // ===== Basement
    this.shelf(2.15, 18.0, 2.7, 21.0, 2.0, 'metal', BY, true);
    this.furnitureBox(14.5, BY, 25.9, 16.85, BY + 0.9, 26.85, 'wood');
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.0, 16), M.metal);
    boiler.position.set(9.6, BY + 1.0, 26.2);
    boiler.castShadow = true;
    this.group.add(boiler);
    this.collider(9.1, 25.7, 10.1, 26.7, BY, BY + 2);
    this.furnitureBox(4.0, BY, 18.0, 5.0, BY + 0.8, 18.8, 'woodPale');
    this.furnitureBox(4.2, BY + 0.8, 18.1, 4.9, BY + 1.3, 18.7, 'woodPale');
    this.furnitureBox(9.8, BY, 21.6, 10.7, BY + 0.7, 22.4, 'woodPale');
    this.furnitureBox(5.5, BY, 25.8, 7.6, BY + 0.85, 26.8, 'woodDark');
    this.hideSpot('h_locker', 3.4, 26.5, 0.8, 0.6, 2.0, '-z', 'metal', BY);
    this.painting(2.12, BY + 1.6, 24.0, '+x');
    // pipes along the ceiling
    for (const z of [18.0, 24.5]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 15, 8), M.metal);
      p.rotation.z = Math.PI / 2;
      p.position.set(9.5, BC - 0.15, z);
      this.group.add(p);
    }
    // Electrical panel (fuse box) on the south wall
    const fb = new THREE.Group();
    fb.position.set(13, BY + 1.45, 26.85);
    const fbBody = bx(0.7, 0.9, 0.2, M.metal);
    const fbSlot = bx(0.12, 0.2, 0.05, M.black);
    fbSlot.position.set(-0.15, 0.1, -0.11);
    const lever = new THREE.Group();
    lever.position.set(0.2, 0.0, -0.12);
    const lv = bx(0.05, 0.3, 0.05, M.red);
    lv.position.y = 0.12;
    lever.add(lv);
    lever.rotation.x = 0.7;
    const warn = bx(0.25, 0.12, 0.01, new THREE.MeshBasicMaterial({ color: 0xb08a10 }));
    warn.position.set(0, 0.36, -0.105);
    fb.add(fbBody, fbSlot, lever, warn);
    this.group.add(fb);
    this.collider(12.6, 26.7, 13.4, 26.95, BY, BY + 2);
    this.fusebox = { group: fb, lever, slot: fbSlot, pos: new THREE.Vector3(13, BY + 1.45, 26.6) };
    this.register('fusebox', 'fusebox', [fbBody, lever, fbSlot], this.fusebox.pos);
    const fuseVisual = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), M.brass);
    fuseVisual.position.set(-0.15, 0.1, -0.15);
    fuseVisual.visible = false;
    fb.add(fuseVisual);
    this.fusebox.fuseVisual = fuseVisual;

    // ===== Notes (clues)
    this.note('note_start', 12.4, 0.22, 16.0, 0.3,
      'Day 41.\n\nHe came back again last night. I could hear him BREATHING behind the walls.\n\nHe follows noise. Walk slowly. Don\'t talk. Don\'t run unless he has already seen you.\n\nThe front door key is locked in the security room - the electric lock won\'t open without power.');
    this.note('note_living', 2.3, 0.45, 15.0, -0.4,
      'The breaker blew when the storm hit.\n\nThere is a spare FUSE somewhere upstairs. The fuse box is in the BASEMENT, and I hid the basement key in one of the rooms so he couldn\'t get down there.');
    this.note('note_kitchen', 23.0, 0.76, 15.6, 0.8,
      'If he sees you, break line of sight and HIDE.\n\nWardrobes. The pantry. The locker downstairs.\n\nHe forgets fast. He doesn\'t forget if he watches you climb in.');
    this.note('note_base', 15.4, BY + 0.9, 26.3, 0.2,
      'Fuse goes in the left slot. Then pull the lever.\n\nThe security door and the cameras run on the same circuit.');
  }

  // ----------------------------------------------------------------- doors
  buildDoors() {
    for (const d of DOORS) {
      const pivot = new THREE.Group();
      const mat = d.exit ? this.M.woodDark : this.M.wood;
      const panel = bx(d.line === 'x' ? d.w - 0.02 : 0.05, DOOR_H - 0.02, d.line === 'x' ? 0.05 : d.w - 0.02, mat);
      const knob = bx(0.05, 0.05, 0.05, this.M.brass);
      if (d.line === 'x') {
        pivot.position.set(d.a0, 0, d.c);
        panel.position.set(d.w / 2, DOOR_H / 2, 0);
        knob.position.set(d.w - 0.12, 1.0, 0.05 * -d.swing);
      } else {
        pivot.position.set(d.c, 0, d.a0);
        panel.position.set(0, DOOR_H / 2, d.w / 2);
        knob.position.set(0.05 * -d.swing, 1.0, d.w - 0.12);
      }
      const knob2 = knob.clone();
      if (d.line === 'x') knob2.position.z *= -1; else knob2.position.x *= -1;
      pivot.add(panel, knob, knob2);
      if (d.exit) {
        // a few boards / chain to make the front door read as "the way out"
        const chain = bx(d.line === 'x' ? d.w * 0.8 : 0.03, 0.04, d.line === 'x' ? 0.03 : d.w * 0.8, this.M.metal);
        chain.position.set(d.w / 2, 1.1, -0.04 * d.swing);
        pivot.add(chain);
        this.exitChain = chain;
      }
      this.group.add(pivot);
      const col = d.line === 'x'
        ? this.collider(d.a0, d.c - 0.05, d.a0 + d.w, d.c + 0.05, 0, DOOR_H, { occlude: true, door: d.id })
        : this.collider(d.c - 0.05, d.a0, d.c + 0.05, d.a0 + d.w, 0, DOOR_H, { occlude: true, door: d.id });
      const center = d.line === 'x' ? new THREE.Vector3(d.a0 + d.w / 2, 1.1, d.c) : new THREE.Vector3(d.c, 1.1, d.a0 + d.w / 2);
      const door = { ...d, pivot, panel, collider: col, angle: 0, target: 0, open: false, locked: !!d.lock, center };
      this.doors.set(d.id, door);
      this.register(d.id, 'door', [panel], center, { door });
    }
  }

  setDoor(id, open) {
    const d = this.doors.get(id);
    if (!d) return;
    d.open = open;
    const sgn = d.line === 'x' ? -d.swing : d.swing;
    d.target = open ? sgn * 1.6 : 0;
    d.collider.off = open;
  }

  setContainer(id, open) {
    const c = this.containers.get(id);
    if (c) c.target = open ? 1 : 0;
  }

  setHideDoors(id, open) {
    const h = this.hides.get(id);
    if (h) h.target = open ? 1 : 0;
  }

  // ---------------------------------------------------------------- lights
  buildLights() {
    const add = (room, x, y, z, color = 0xffc98a, intensity = 7, distance = 9, opts = {}) => {
      // Fixtures only hold data; a small pool of real PointLights is assigned to
      // the fixtures nearest the camera each frame (constant light count = no
      // shader recompiles, and cheap on weak GPUs).
      const light = { position: new THREE.Vector3(x, y, z), color: new THREE.Color(color), distance, intensity: 0 };
      let bulb = null;
      if (!opts.noFixture) {
        const cord = bx(0.015, 0.4, 0.015, this.M.black);
        cord.position.set(x, y + 0.25, z);
        bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this.M.bulb.clone());
        bulb.position.set(x, y, z);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 12, 1, true), this.M.metal);
        shade.position.set(x, y + 0.08, z);
        this.group.add(cord, bulb, shade);
      }
      const L = { light, bulb, room, base: intensity, powered: !opts.always, always: !!opts.always, flicker: opts.flicker ?? 0.15, seed: Math.random() * 100 };
      this.lights.push(L);
      return L;
    };
    add('bed1', 4, 2.55, 4);
    add('bath', 10.5, 2.55, 4, 0xe8f0ff, 5);
    add('bed2', 17, 2.55, 4);
    add('sec', 25.5, 2.55, 4, 0xd8e8ff, 6);
    add('hall', 7, 2.55, 9.5, 0xffc98a, 6, 10);
    add('hall', 22, 2.55, 9.5, 0xffc98a, 6, 10, { flicker: 0.5 });
    add('living', 5.5, 2.55, 16, 0xffc98a, 8, 11);
    add('start', 14, 2.55, 14, 0xffc98a, 6);
    add('kitchen', 23.5, 2.55, 16, 0xf0ffe0, 8, 11, { flicker: 0.35 });
    add('stair', 16.5, 2.6, 19.2, 0xffc98a, 4, 8);
    add('base', 6, BC - 0.35, 22, 0xffb070, 6, 10, { flicker: 0.4 });
    add('base', 13, BC - 0.35, 24, 0xffb070, 6, 10);
    // Always-on candles in the start room so the spawn is never pitch black.
    const cl = add('start', 16.25, 1.0, 11.6, 0xff9a40, 4, 7, { always: true, noFixture: true, flicker: 1 });
    cl.candle = true;
    for (const [dx, dz, h] of [[-0.15, 0.05, 0.14], [0.05, -0.08, 0.1], [0.2, 0.1, 0.18]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 8), this.M.paper);
      c.position.set(16.25 + dx, 0.7 + h / 2, 11.6 + dz);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
      f.position.set(16.25 + dx, 0.7 + h + 0.02, 11.6 + dz);
      this.group.add(c, f);
    }
    // Dim emergency light in the basement so it's navigable before power returns.
    add('base', 3.0, BY + 2.2, 18.5, 0xff3020, 1.4, 7, { always: true, noFixture: true, flicker: 0.2 });
  }

  createLightPool(n) {
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 1.6);
      l.position.set(0, -100, 0);
      this.group.add(l);
      this.pool.push({ light: l, fixture: null });
    }
  }

  updateLights(dt, time, viewer) {
    for (const L of this.lights) {
      let on = L.always || (this.power && this.blackout <= 0);
      let k = 1;
      if (L.candle) k = 0.75 + Math.sin(time * 9 + L.seed) * 0.12 + Math.sin(time * 23 + L.seed) * 0.08;
      else if (on && L.flicker > 0) {
        const n = Math.sin(time * 3.1 + L.seed) + Math.sin(time * 7.3 + L.seed * 2) + Math.sin(time * 17 + L.seed);
        if (n > 2.6 - L.flicker) k = Math.random() < 0.5 ? 0.15 : 0.6;
      }
      const target = on ? L.base * k : 0;
      L.light.intensity += (target - L.light.intensity) * Math.min(1, dt * 25);
      if (L.bulb) L.bulb.material.color.setScalar(on ? 0.6 + 0.4 * k : 0.08);
    }
    if (this.blackout > 0) this.blackout -= dt;
    if (!this.pool || !viewer) return;
    // Pick the most relevant lit fixtures for the pool.
    const ranked = this.lights
      .filter(L => L.light.intensity > 0.02)
      .map(L => ({ L, d: L.light.position.distanceTo(viewer) - (L.always ? 3 : 0) }))
      .filter(o => o.d < 22)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.pool.length)
      .map(o => o.L);
    for (const slot of this.pool) if (slot.fixture && !ranked.includes(slot.fixture)) slot.fixture = null;
    for (const L of ranked) {
      if (this.pool.some(s => s.fixture === L)) continue;
      const free = this.pool.find(s => !s.fixture);
      if (free) free.fixture = L;
    }
    for (const slot of this.pool) {
      const l = slot.light;
      const L = slot.fixture;
      if (!L) { l.intensity = 0; continue; }
      l.position.copy(L.light.position);
      l.color.copy(L.light.color);
      l.distance = L.light.distance;
      l.intensity = L.light.intensity;
    }
  }

  // --------------------------------------------------------------- windows
  buildWindows() {
    const W = [
      ['x', 0.11, 4.4, 1.0, 1.4, 1.2, 1], // bed1 north
      ['x', 0.11, 16.0, 1.0, 1.4, 1.2, 1], // bed2 north
      ['x', 0.11, 22.3, 1.0, 1.4, 1.2, 1], // security north
      ['z', 0.11, 18.2, 1.0, 1.4, 1.2, 1], // living west
      ['x', 20.89, 8.2, 1.0, 1.4, 1.2, -1], // living south
      ['z', 29.89, 16.8, 1.25, 1.4, 1.0, -1], // kitchen east (above counter)
      ['x', 20.89, 19.5, 1.0, 1.4, 1.2, -1], // kitchen south
      ['z', 0.11, 9.5, 1.0, 1.0, 1.3, 1], // hallway west end
    ];
    for (const [line, c, a, y, w, h, n] of W) {
      const g = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.M.glassWin);
      g.add(glass);
      const bar = (bw, bh, px, py) => { const m = bx(bw, bh, 0.05, this.M.woodDark); m.position.set(px, py, 0.02); g.add(m); };
      bar(w + 0.12, 0.08, 0, h / 2 + 0.04); bar(w + 0.12, 0.1, 0, -h / 2 - 0.05);
      bar(0.07, h, -w / 2 - 0.03, 0); bar(0.07, h, w / 2 + 0.03, 0);
      bar(0.05, h, 0, 0); bar(w, 0.05, 0, 0);
      // a couple of nailed boards across
      const board = bx(w + 0.2, 0.14, 0.03, this.M.wood);
      board.position.set(0, h * 0.18, 0.05);
      board.rotation.z = 0.25;
      g.add(board);
      if (line === 'x') { g.position.set(a, y + h / 2, c); g.rotation.y = n > 0 ? 0 : Math.PI; }
      else { g.position.set(c, y + h / 2, a); g.rotation.y = n > 0 ? Math.PI / 2 : -Math.PI / 2; }
      this.group.add(g);
      this.windows.push(g);
    }
  }

  // -------------------------------------------------------------------- nav
  buildNav() {
    const N = [];
    const node = (id, x, z, room, y = 0) => { N.push({ id, x, z, y, room, edges: [] }); };
    // Bedroom 1
    node('b1a', 4, 4, 'bed1'); node('b1b', 1.6, 6.2, 'bed1'); node('b1c', 5.0, 2.2, 'bed1'); node('b1d', 6.4, 6.5, 'bed1'); node('b1door', 3.55, 7.3, 'bed1');
    // Bathroom
    node('baa', 10.5, 3.6, 'bath'); node('badoor', 10.55, 7.3, 'bath'); node('bab', 9.2, 5.5, 'bath');
    // Bedroom 2
    node('b2a', 17, 4, 'bed2'); node('b2b', 15, 5.6, 'bed2'); node('b2c', 18.6, 6.4, 'bed2'); node('b2door', 16.55, 7.3, 'bed2');
    // Security
    node('sa', 25.5, 4, 'sec'); node('sb', 23, 5.5, 'sec'); node('sc', 28, 5.6, 'sec'); node('sdoor', 25.55, 7.3, 'sec');
    // Hallway
    const hx = [1.0, 3.55, 5.55, 8.0, 10.55, 14.05, 16.55, 19.2, 22.55, 25.55, 28.6];
    hx.forEach((x, i) => node('h' + i, x, 9.5, 'hall'));
    // Living room
    node('ldoor', 5.55, 11.9, 'living'); node('la', 3, 12.8, 'living'); node('lb', 8.4, 13.2, 'living'); node('lc', 6.2, 16.2, 'living');
    node('ld', 2.6, 20.0, 'living'); node('le', 8.4, 19.6, 'living'); node('lw', 9.9, 14.05, 'living'); node('lf', 5.0, 19.8, 'living'); node('lg', 2.3, 17.2, 'living');
    // Start room
    node('sn', 14.05, 11.9, 'start'); node('sw', 12.0, 14.05, 'start'); node('se', 16.1, 14.05, 'start'); node('sm', 14.2, 14.2, 'start'); node('ss', 14.2, 15.8, 'start');
    // Kitchen
    node('kn', 22.55, 11.9, 'kitchen'); node('kw', 17.9, 14.05, 'kitchen'); node('kb', 17.9, 19.15, 'kitchen');
    node('ka', 20, 13.2, 'kitchen'); node('kc', 20.4, 18.4, 'kitchen'); node('kd', 25.6, 13.6, 'kitchen'); node('ke', 25.8, 18.2, 'kitchen'); node('kf', 28.2, 15.6, 'kitchen');
    // Stairs
    node('st0', 16.5, 19.15, 'stair'); node('st1', 13.75, 19.0, 'stair', -1.6); node('st2', 11.3, 19.0, 'stair', BY);
    // Basement
    node('ba', 9.4, 19.0, 'base', BY); node('bb', 5.2, 19.6, 'base', BY); node('bc', 5.0, 22.5, 'base', BY);
    node('bd', 8.9, 23.7, 'base', BY); node('be', 12.5, 23.4, 'base', BY); node('bf', 14.0, 25.0, 'base', BY); node('bg', 11.5, 21.8, 'base', BY);
    node('ua', 7.1, 23.7, 'util', BY); node('ub', 4.6, 24.8, 'util', BY); node('uc', 3.6, 22.5, 'util', BY);

    const byId = Object.fromEntries(N.map(n => [n.id, n]));
    const link = (a, b, door = null) => {
      const A = byId[a], B = byId[b];
      const len = Math.hypot(A.x - B.x, A.z - B.z);
      A.edges.push({ to: b, door, len });
      B.edges.push({ to: a, door, len });
    };
    // Automatic links inside each room when the straight line is clear.
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
      const a = N[i], b = N[j];
      if (a.room !== b.room || a.room === 'stair') continue;
      const blocked = segmentBlockers(a.x, a.z, b.x, b.z, a.y + 0.6, this.colliders.filter(c => !c.door), { pad: 0.38, occludeOnly: false, max: 1 });
      if (!blocked) link(a.id, b.id);
    }
    link('b1door', 'h1', 'd_bed1'); link('badoor', 'h4', 'd_bath'); link('b2door', 'h6', 'd_bed2'); link('sdoor', 'h9', 'd_sec');
    link('h2', 'ldoor', 'd_living'); link('h5', 'sn', 'd_start_n'); link('h8', 'kn', 'd_kitchen');
    link('sw', 'lw', 'd_start_w'); link('se', 'kw', 'd_start_e'); link('kb', 'st0', 'd_basement');
    link('st0', 'st1'); link('st1', 'st2'); link('st2', 'ba'); link('bd', 'ua');
    this.nav = { nodes: N, byId };
    // Rooms Ajan patrols between (one representative node each)
    this.patrolNodes = ['b1a', 'baa', 'b2a', 'sa', 'h3', 'h7', 'h10', 'lc', 'ld', 'sm', 'kd', 'kc', 'bc', 'be', 'ub'];
  }

  // ------------------------------------------------------------- per frame
  update(dt, time, viewer) {
    for (const d of this.doors.values()) {
      if (Math.abs(d.angle - d.target) > 0.001) {
        d.angle += (d.target - d.angle) * Math.min(1, dt * 6);
        d.pivot.rotation.y = d.angle;
      }
    }
    for (const c of this.containers.values()) {
      if (Math.abs(c.open - c.target) > 0.001) {
        c.open += (c.target - c.open) * Math.min(1, dt * 7);
        if (c.type === 'drawer') c.part.position.z = c.open * c.d * 0.75;
        else c.part.rotation.y = c.open * 1.8;
      }
    }
    for (const h of this.hides.values()) {
      if (Math.abs(h.open - h.target) > 0.001) {
        h.open += (h.target - h.open) * Math.min(1, dt * 8);
        for (const dd of h.doors) dd.pivot.rotation.y = dd.side * h.open * 1.4;
      }
    }
    this.updateLights(dt, time, viewer);
  }

  /** Assign shuffled painting images to the slots (no repeats until all used). */
  assignPaintings(textures, rnd) {
    const avail = textures.filter(Boolean);
    let pool = [];
    this.paintingSlots.forEach((slot, i) => {
      if (!avail.length) {
        slot.mesh.material.color.set(0x2a2622);
        return;
      }
      if (!pool.length) pool = shuffle(avail.map((_, k) => k), rnd);
      const tex = avail[pool.pop()];
      slot.mesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, color: 0xbbbbbb });
      slot.imageIndex = i;
    });
  }
}

/** Item meshes (keys, fuse). */
export function makeItemMesh(type, M) {
  const g = new THREE.Group();
  if (type === 'fuse') {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0xa0d0ff, transparent: true, opacity: 0.7, emissive: 0x112233, roughness: 0.1 }));
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.025, 12), M.brass);
    c1.position.y = 0.055;
    const c2 = c1.clone();
    c2.position.y = -0.055;
    g.add(glass, c1, c2);
    g.rotation.z = Math.PI / 2;
    g.position.y = 0.025;
  } else {
    const mat = M.brass.clone();
    mat.emissive = new THREE.Color(type === 'exit_key' ? 0x301008 : 0x201505);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 16), mat);
    ring.rotation.x = Math.PI / 2;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.014), mat);
    shaft.position.x = 0.085;
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.03), mat);
    t1.position.set(0.12, 0, 0.015);
    const t2 = t1.clone();
    t2.position.x = 0.1;
    g.add(ring, shaft, t1, t2);
    if (type === 'exit_key') {
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.04), new THREE.MeshStandardMaterial({ color: 0xaa1515, emissive: 0x330000 }));
      tag.position.set(-0.055, 0, 0.0);
      g.add(tag);
      g.scale.setScalar(1.3);
    }
    g.position.y = 0.008;
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Candidate spawn spots for progression items. */
export const ITEM_SPAWNS = {
  basement_key: [
    { container: 'c_ns1' },
    { pos: [8.5, 1.36, 11.33], room: 'living' }, // bookshelf
    { pos: [19.6, 0.8, 8.33], room: 'hall' }, // hallway side table
  ],
  fuse: [
    { container: 'c_bath' },
    { container: 'c_kit1' },
    { container: 'c_desk2' },
    { container: 'c_kit2' },
  ],
  exit_key: [
    { pos: [23.75, 0.78, 0.95], room: 'sec' },
    { pos: [28.3, 0.78, 0.9], room: 'sec' },
  ],
};

export const SPAWN_POINTS = [
  [13.6, 13.4], [14.6, 13.4], [13.6, 14.4], [14.6, 14.4], [13.2, 12.6], [15.4, 12.6], [15.4, 14.6], [12.6, 13.8],
];

export const CAMERAS = [
  { label: 'CAM 01  HALLWAY W', pos: [0.4, 2.75, 8.4], look: [9, 0.8, 10] },
  { label: 'CAM 02  HALLWAY E', pos: [29.6, 2.75, 10.6], look: [20, 0.8, 9] },
  { label: 'CAM 03  KITCHEN', pos: [29.6, 2.75, 20.6], look: [21, 0.6, 14] },
  { label: 'CAM 04  LIVING RM', pos: [10.6, 2.75, 20.6], look: [2.5, 0.6, 13.5] },
  { label: 'CAM 05  BASEMENT', pos: [16.6, -0.55, 26.6], look: [6, -2.9, 19.5] },
  { label: 'CAM 06  BACK ROOM', pos: [16.7, 2.75, 11.3], look: [12.5, 0.4, 16] },
];
