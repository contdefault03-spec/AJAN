// The house: builds the four-level layout from layout.js (walls with door
// openings, floors, ceilings, stairs), furniture (furniture.js), colliders,
// lights, windows, interactables (doors, drawers, hiding spots, TV, monitors,
// fuse box) and Ajan's navigation graph.
import * as THREE from 'three';
import { buildMaterials } from './textures.js';
import { segmentBlockers } from './physics.js';
import { AJAN } from './config.js';
import { shuffle } from './util.js';
import {
  LEVELS, ROOMS, DOORS, OPENINGS, ELEV_DOORS, WALLS, RAMPS, DOOR_H, FLOORBOARDS, ELEVATOR,
  roomAt, rampHeight, levelIndex, SPAWN_POINTS, onDoorway, WINDOWS, WINDOW_CUTS } from './layout.js';
import { buildWing, furnishWing, furnishSparse } from './wing.js';
import { buildThirdFloor } from './thirdfloor.js';
import { buildFurniture } from './furniture.js';
import { buildDecor } from './decor.js';
import { makeStairPieceMesh } from './attic.js';

export { roomAt, SPAWN_POINTS };

const T = 0.2; // wall thickness

const TEX_SCALE = {
  wallA: 2.4, wallB: 2.4, wallC: 2.4, wallTile: 1.6, wallBase: 3, floorWood: 3, floorWoodDark: 3, floorTile: 2.4,
  floorBath: 2, floorConcrete: 4, carpet: 2, carpetB: 2, ceiling: 3, wood: 1.2, woodDark: 1.2, woodPale: 1.2,
  fabricRed: 1, fabricGreen: 1, fabricBed: 1.2, metal: 1, frame: 0.6, boardCreak: 1,
  wallRose: 2.4, wallKids: 2.4, wallStripe: 2.4, wallGreenStripe: 2.4, wallDiamond: 2.4, wallPlain: 2.4, wallPanel: 2.4, wallFilth: 2.4,
  safeSteel: 1, sheet: 1.5, brick: 1.2, floorClub: 2, wallClub: 2.4,
};

// ---------------------------------------------------------------------------
export class GeoBuilder {
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
      M[key].side = THREE.DoubleSide; // no seeing through a wall or floor from behind
      const m = new THREE.Mesh(g, M[key]);
      m.receiveShadow = true;
      m.castShadow = !key.startsWith('floor') && !key.startsWith('carpet') && key !== 'ceiling';
      m.name = 'static_' + key;
      meshes.push(m);
    }
    return meshes;
  }
}

export const YAW = { '+z': 0, '+x': Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 };
export const DIR = { '+z': [0, 1], '-z': [0, -1], '+x': [1, 0], '-x': [-1, 0] };

export function bx(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const PICK_MAT = new THREE.MeshBasicMaterial({ visible: false });

// ---------------------------------------------------------------------------
export class House {
  constructor(rnd = Math.random) {
    this.rnd = rnd;
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
    this.monitors = [];
    this.notes = [];
    this.wallChairs = [];
    this.staticMeshes = [];
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

  /** Invisible box used purely as an interaction target. */
  pickBox(x0, y0, z0, x1, y1, z1) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), PICK_MAT);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.group.add(m);
    return m;
  }

  /**
   * Skirting, chair rail and wood wainscoting along one wall segment, on each
   * side according to the room there (rooms carry `trim`). Segments already
   * stop at doorways, so trim never runs across a door.
   */
  addTrim(line, c, p, q, y) {
    const G = this.geo;
    for (const side of [-1, 1]) {
      const mid = (p + q) / 2;
      const r = line === 'x' ? roomAt(mid, c + side * 0.35, y + 0.5) : roomAt(c + side * 0.35, mid, y + 0.5);
      if (!r || r.L === 0 || r.L === 3 || !r.trim || r.trim === 'none') continue;
      const face = c + side * T / 2;
      const strip = (h0, h1, th, mat) => {
        const a = face, b = face + side * th;
        if (line === 'x') G.box(p, y + h0, Math.min(a, b), q, y + h1, Math.max(a, b), mat);
        else G.box(Math.min(a, b), y + h0, p, Math.max(a, b), y + h1, q, mat);
      };
      const pale = r.trim === 'wainscotPale';
      const wood = pale ? 'woodPale' : 'woodDark';
      if (r.trim.startsWith('wainscot')) {
        strip(0, 0.95, 0.014, pale ? 'woodPale' : 'wood');
        strip(0.95, 1.01, 0.04, wood);
      } else if (r.trim === 'rail') strip(0.9, 0.95, 0.03, wood);
      strip(0, 0.15, 0.03, wood);
    }
  }

  wallMat(axis, sign, c) {
    if (axis === 'y') return 'wallBase';
    const off = 0.35;
    const x = c.x + (axis === 'x' ? sign * off : 0);
    const z = c.z + (axis === 'z' ? sign * off : 0);
    const r = roomAt(x, z, c.y);
    if (!r) return 'wallBase';
    return r.wall || 'wallBase';
  }

  build() {
    const G = this.geo;
    // ---------------- walls (split per level band so wall materials match each room)
    const cuts = [
      ...DOORS.map(d => ({ ...d, y0: d.y, h: DOOR_H })),
      ...OPENINGS,
      ...ELEV_DOORS,
    ];
    for (const [line, c, a0, a1, y0, wallTop] of WALLS) {
      // Floor/ceiling planes have no slab sides: close the band up to the next floor.
      const nextFloor = LEVELS.find((L, i) => i > 0 && LEVELS[i - 1].top === wallTop);
      const y1 = nextFloor?.y ?? wallTop;
      const mine = cuts.filter(d => d.line === line && d.c === c && d.a0 >= a0 - 0.01 && d.a0 + d.w <= a1 + 0.01 && d.y0 < y1 && d.y0 + d.h > y0);
      const bands = [];
      let ya = y0;
      for (const L of LEVELS) for (const yy of [L.y, L.top]) if (yy > ya + 0.05 && yy < y1 - 0.05) { bands.push([ya, yy]); ya = yy; }
      bands.push([ya, y1]);
      for (const [ba, bb] of bands) {
        const bandCuts = mine.filter(d => d.y0 < bb && d.y0 + d.h > ba).sort((p, q) => p.a0 - q.a0);
        let s = a0 - T / 2;
        const segs = [];
        for (const d of bandCuts) {
          segs.push([s, d.a0, ba, bb]);
          const top = d.y0 + d.h;
          if (top < bb) segs.push([d.a0, d.a0 + d.w, Math.max(ba, top), bb]);
          if (d.y0 > ba) segs.push([d.a0, d.a0 + d.w, ba, d.y0]);
          s = d.a0 + d.w;
        }
        segs.push([s, a1 + T / 2, ba, bb]);
        for (const [p, q, yA, yB] of segs) {
          if (q - p < 0.01 || yB - yA < 0.01) continue;
          if (Math.abs(yA - ba) < 1e-6 && LEVELS.some(L => Math.abs(L.y - ba) < 1e-6)) this.addTrim(line, c, p, q, ba);
          if (line === 'x') {
            G.box(p, yA, c - T / 2, q, yB, c + T / 2, (ax, sg, ce) => this.wallMat(ax, sg, ce));
            this.collider(p, c - T / 2, q, c + T / 2, yA, yB, { occlude: true, wall: true });
          } else {
            G.box(c - T / 2, yA, p, c + T / 2, yB, q, (ax, sg, ce) => this.wallMat(ax, sg, ce));
            this.collider(c - T / 2, p, c + T / 2, q, yA, yB, { occlude: true, wall: true });
          }
        }
      }
    }
    // Door frames (trim)
    for (const d of [...DOORS, ...ELEV_DOORS.map(e => ({ ...e, y: e.y0, metal: true }))]) {
      const t = 0.08, y = d.y;
      const mat = d.metal ? 'metal' : 'woodDark';
      if (d.line === 'x') {
        G.box(d.a0 - t, y, d.c - T / 2 - 0.02, d.a0, y + DOOR_H, d.c + T / 2 + 0.02, mat);
        G.box(d.a0 + d.w, y, d.c - T / 2 - 0.02, d.a0 + d.w + t, y + DOOR_H, d.c + T / 2 + 0.02, mat);
        G.box(d.a0 - t, y + DOOR_H, d.c - T / 2 - 0.02, d.a0 + d.w + t, y + DOOR_H + t, d.c + T / 2 + 0.02, mat);
      } else {
        G.box(d.c - T / 2 - 0.02, y, d.a0 - t, d.c + T / 2 + 0.02, y + DOOR_H, d.a0, mat);
        G.box(d.c - T / 2 - 0.02, y, d.a0 + d.w, d.c + T / 2 + 0.02, y + DOOR_H, d.a0 + d.w + t, mat);
        G.box(d.c - T / 2 - 0.02, y + DOOR_H, d.a0 - t, d.c + T / 2 + 0.02, y + DOOR_H + t, d.a0 + d.w + t, mat);
      }
    }

    // ---------------- floors, ceilings, baseboards
    for (const r of ROOMS) {
      const L = LEVELS[r.L];
      if (!r.noFloor) for (const [x0, x1, z0, z1] of (r.floors || [[r.x0, r.x1, r.z0, r.z1]])) G.plane(r.floor, x0, z0, x1, z1, L.y, true);
      if (r.outdoor) continue; // no ceiling outdoors (garden, balconies)
      if (r.L !== 3 || !r.safe) for (const [x0, x1, z0, z1] of (r.ceilings || r.floors || [[r.x0, r.x1, r.z0, r.z1]])) G.plane('ceiling', x0, z0, x1, z1, L.top, false);
    }
    // Shaft landings and ceilings
    G.plane('floorWoodDark', 16, 17, 17, 21, 0, true);
    G.plane('ceiling', 11, 17, 17, 21, 3.0, false);
    G.plane('floorWoodDark', 36, 19.5, 40, 21, 0, true);
    G.plane('floorWood', 36, 11, 40, 13, 3.4, true);
    G.plane('ceiling', 36, 11, 40, 21, 6.4, false);
    this.buildStairs();
    buildWing(this);
    furnishWing(this);
    buildThirdFloor(this);
    this.buildAtticRoof();
    this.buildFloorboards();

    // Ajan can never enter the attic stairs or the elevator shaft.
    this.collider(20.05, 10.7, 23.95, 12.8, 3.4, 6.4, { ajanOnly: true });
    this.collider(ELEVATOR.x0, ELEVATOR.z0 - 0.4, ELEVATOR.x1, ELEVATOR.z1 + 0.4, -4, 10, { ajanOnly: true });

    buildFurniture(this);
    buildDecor(this);
    furnishSparse(this);
    this.buildDoors();
    this.buildLights();
    this.buildWindows();
    this.buildNav();

    for (const m of G.build(this.M)) {
      this.group.add(m);
      this.staticMeshes.push(m);
    }
    // Outside the front door: a dark porch so the doorway isn't a void.
    const porch = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), this.M.floorConcrete);
    porch.rotation.x = -Math.PI / 2;
    porch.position.set(4.65, -0.02, 23);
    this.group.add(porch);
    this.collider(2, 22.6, 8, 23, 0, 3);
    this.collider(2, 21, 2.4, 23, 0, 3);
    this.collider(7.2, 21, 7.6, 23, 0, 3);
  }

  buildStairs() {
    const G = this.geo;
    for (const r of RAMPS) {
      if (r.outside) { this.buildDriveway(r); continue; }
      if (r.spiral) continue; // wing.js
      if (r.puzzle) {
        // the attic staircase is built by attic.js once assembled; Ajan's patrols never use its footprint
        this.collider(r.x0 - 0.1, r.z0 - 0.15, r.x1 + 0.1, r.z1, r.ya, r.ya + 2.4, { ajanOnly: true });
        continue;
      }
      const len = Math.abs(r.b - r.a);
      const steps = Math.round(len / 0.28);
      const lo = Math.min(r.ya, r.yb);
      for (let i = 0; i < steps; i++) {
        const c0 = r.a + (r.b - r.a) * (i / steps), c1 = r.a + (r.b - r.a) * ((i + 1) / steps);
        const mid = (c0 + c1) / 2;
        const yTop = rampHeight(r, r.axis === 'x' ? mid : r.x0, r.axis === 'z' ? mid : r.z0) + 0.04;
        const a = Math.min(c0, c1), b = Math.max(c0, c1);
        if (r.axis === 'x') G.box(a, lo, r.z0, b, yTop, r.z1, 'floorWoodDark', { skip: ['z+', 'z-'] });
        else G.box(r.x0, lo, a, r.x1, yTop, b, 'floorWoodDark', { skip: ['x+', 'x-'] });
      }
      // handrail posts
      const n = Math.max(4, Math.round(len / 0.75));
      for (let i = 0; i <= n; i++) {
        const c = r.a + (r.b - r.a) * (i / n);
        const x = r.axis === 'x' ? c : r.x0 + 0.08;
        const z = r.axis === 'z' ? c : r.z0 + 0.12;
        const y = rampHeight(r, x, z);
        G.box(x - 0.03, y, z - 0.03, x + 0.03, y + 0.95, z + 0.03, 'woodDark');
      }
    }
  }

  /** Concrete driveway from the garage door up to the yard, with retaining walls. */
  buildDriveway(r) {
    const G = this.geo;
    G.box(r.x0, r.ya - 0.2, r.z0, r.a, r.ya, r.z1, 'floorConcrete', { skip: ['x-'] });
    const n = 24;
    for (let i = 0; i < n; i++) {
      const c0 = r.a + (r.b - r.a) * i / n, c1 = r.a + (r.b - r.a) * (i + 1) / n;
      const y0 = rampHeight(r, c0, r.z0), y1 = rampHeight(r, c1, r.z0);
      const nl = Math.hypot(y1 - y0, c1 - c0);
      G.quad('floorConcrete', [[c0, y0, r.z1], [c1, y1, r.z1], [c1, y1, r.z0], [c0, y0, r.z0]], [-(y1 - y0) / nl, (c1 - c0) / nl, 0], p => [p[0] / 3, p[2] / 3]);
    }
    for (const z of [r.z0 - 0.25, r.z1]) {
      G.box(40.1, r.ya, z, r.b, 0.4, z + 0.25, 'wallBase');
      this.collider(40.1, z, r.b, z + 0.25, r.ya, 0.4, { occlude: true, wall: true });
    }
    // the yard: dark ground, a fence, a few dead trees
    G.plane('floorConcrete', 49, 12, 64, 30, 0, true);
    for (const z of [12, 30]) G.box(49, 0, z - 0.05, 64, 1.2, z + 0.05, 'woodDark');
    G.box(64, 0, 12, 64.1, 1.2, 30, 'woodDark');
    const trunk = this.M.woodDark;
    for (const [x, z, h] of [[53, 15, 4], [58, 26, 5], [61, 17, 3.5], [55, 27.5, 4.5]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, h, 6), trunk);
      t.position.set(x, h / 2, z);
      this.group.add(t);
      for (let k = 0; k < 4; k++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 1.6, 4), trunk); br.position.set(x, h * (0.55 + k * 0.1), z); br.rotation.set(0.9 * Math.cos(k * 1.7), k * 1.6, 0.9 * Math.sin(k * 1.7)); this.group.add(br); }
    }
  }

  buildAtticRoof() {
    const G = this.geo;
    const AY = LEVELS[3].y;
    G.plane('ceiling', 18, 8, 40, 21, AY + 2.2, false);
    for (let x = 19; x < 40; x += 2.2) G.box(x, AY + 1.95, 8.1, x + 0.18, AY + 2.2, 20.9, 'woodDark', { bottom: true });
    for (const z of [11.5, 17.5]) G.box(18.1, AY + 1.8, z, 39.9, AY + 1.95, z + 0.2, 'woodDark', { bottom: true });
    for (const [x, z] of [[27, 14.5], [31, 11.0], [37, 14.5]]) {
      G.box(x - 0.1, AY, z - 0.1, x + 0.1, AY + 2.2, z + 0.1, 'woodDark');
      this.collider(x - 0.12, z - 0.12, x + 0.12, z + 0.12, AY, AY + 2.2);
    }
  }

  /** Creaky boards: a slightly darker, warped plank patch — easy to miss, learnable. */
  buildFloorboards() {
    this.floorboards = FLOORBOARDS.map((b, i) => {
      this.geo.box(b.x - 0.5, b.y, b.z - 0.12, b.x + 0.5, b.y + 0.006, b.z + 0.12, 'boardCreak', { skip: ['x+', 'x-', 'z+', 'z-'] });
      this.geo.box(b.x - 0.42, b.y, b.z - 0.5, b.x - 0.3, b.y + 0.005, b.z + 0.5, 'boardCreak', { skip: ['x+', 'x-', 'z+', 'z-'] });
      return { ...b, i };
    });
  }

  // ------------------------------------------------------------- furniture helpers
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

  /** Old spindle-back chair with a worn cushion (back toward −z). */
  chair(x, z, y = 0, mat = 'wood') {
    const G = this.geo, s = 0.22;
    G.box(x - s, y + 0.42, z - s, x + s, y + 0.47, z + s, mat, { bottom: true });
    G.box(x - s + 0.04, y + 0.47, z - s + 0.06, x + s - 0.04, y + 0.5, z + s - 0.03, 'fabricRed');
    for (const [dx, dz] of [[-s, -s], [s - 0.04, -s], [-s, s - 0.04], [s - 0.04, s - 0.04]]) G.box(x + dx, y, z + dz, x + dx + 0.04, y + 0.42, z + dz + 0.04, mat);
    G.box(x - s, y + 0.16, z + s - 0.04, x + s, y + 0.2, z + s, mat);
    G.box(x - s, y + 0.47, z - s, x - s + 0.04, y + 1.08, z - s + 0.04, mat);
    G.box(x + s - 0.04, y + 0.47, z - s, x + s, y + 1.08, z - s + 0.04, mat);
    G.box(x - s - 0.02, y + 1.0, z - s - 0.01, x + s + 0.02, y + 1.1, z - s + 0.05, mat);
    for (const dx of [-0.1, -0.015, 0.07]) G.box(x + dx, y + 0.5, z - s + 0.005, x + dx + 0.03, y + 1.0, z - s + 0.03, mat);
    this.collider(x - s, z - s, x + s, z + s, y, y + 0.9);
  }

  /** A big chair Ajan sometimes sits in, facing the wall. facing = direction the sitter looks. */
  wallChair(x, z, y, facing) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = YAW[facing];
    const mat = this.M.woodDark;
    const seat = bx(0.9, 0.08, 0.8, mat); seat.position.set(0, 0.5, 0);
    const back = bx(0.9, 1.1, 0.08, mat); back.position.set(0, 1.0, -0.38);
    g.add(seat, back);
    for (const [dx, dz] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) { const l = bx(0.07, 0.5, 0.07, mat); l.position.set(dx, 0.25, dz); g.add(l); }
    this.group.add(g);
    this.collider(x - 0.45, z - 0.45, x + 0.45, z + 0.45, y, y + 0.55);
    const [fx, fz] = DIR[facing];
    this.wallChairs.push({ seat: new THREE.Vector3(x, y, z), front: new THREE.Vector3(x - fx * 1.0, y, z - fz * 1.0), ry: YAW[facing] });
  }

  bed(x0, z0, x1, z1, y = 0, open = false) {
    const G = this.geo;
    if (open) {
      // raised frame on legs so you can crawl underneath
      for (const [x, z] of [[x0, z0], [x1 - 0.08, z0], [x0, z1 - 0.08], [x1 - 0.08, z1 - 0.08]]) G.box(x, y, z, x + 0.08, y + 0.42, z + 0.08, 'woodDark');
      G.box(x0, y + 0.3, z0, x1, y + 0.42, z0 + 0.06, 'woodDark', { bottom: true });
      G.box(x0, y + 0.3, z1 - 0.06, x1, y + 0.42, z1, 'woodDark', { bottom: true });
      G.box(x0, y + 0.3, z0, x0 + 0.06, y + 0.42, z1, 'woodDark', { bottom: true });
      G.box(x1 - 0.06, y + 0.3, z0, x1, y + 0.42, z1, 'woodDark', { bottom: true });
      G.box(x0 + 0.05, y + 0.4, z0 + 0.05, x1 - 0.05, y + 0.6, z1 - 0.05, 'fabricBed', { bottom: true });
    } else {
      G.box(x0, y, z0, x1, y + 0.35, z1, 'woodDark');
      G.box(x0 + 0.05, y + 0.35, z0 + 0.05, x1 - 0.05, y + 0.55, z1 - 0.05, 'fabricBed');
    }
    G.box(x0, y, z0 - 0.06, x1, y + 1.0, z0, 'woodDark');
    G.box((x0 + x1) / 2 - 0.35, y + 0.58, z0 + 0.1, (x0 + x1) / 2 + 0.35, y + 0.7, z0 + 0.45, 'fabricBed');
    G.box(x0 + 0.04, y + 0.58, z0 + 0.9, x1 - 0.04, y + 0.63, z1 - 0.1, 'fabricRed');
    this.collider(x0, z0 - 0.06, x1, z1, y, y + 0.62);
  }

  /** Old baby crib: low slatted sides (you can reach over them), thin mattress. */
  crib(x0, z0, x1, z1, y = 0) {
    const G = this.geo, top = 0.78;
    for (const [x, z] of [[x0, z0], [x1 - 0.06, z0], [x0, z1 - 0.06], [x1 - 0.06, z1 - 0.06]]) G.box(x, y, z, x + 0.06, y + top + 0.08, z + 0.06, 'woodPale');
    G.box(x0 + 0.04, y + 0.38, z0 + 0.04, x1 - 0.04, y + 0.5, z1 - 0.04, 'woodPale');
    G.box(x0 + 0.06, y + 0.5, z0 + 0.06, x1 - 0.06, y + 0.56, z1 - 0.06, 'fabricBed');
    for (const [a0, a1, zz, along] of [[x0, x1, z0, 'x'], [x0, x1, z1 - 0.03, 'x'], [z0, z1, x0, 'z'], [z0, z1, x1 - 0.03, 'z']]) {
      if (along === 'x') G.box(a0, y + top, zz, a1, y + top + 0.04, zz + 0.03, 'woodPale');
      else G.box(zz, y + top, a0, zz + 0.03, y + top + 0.04, a1, 'woodPale');
      for (let a = a0 + 0.12; a < a1 - 0.08; a += 0.12) {
        if (along === 'x') G.box(a, y + 0.5, zz, a + 0.025, y + top, zz + 0.025, 'woodPale');
        else G.box(zz, y + 0.5, a, zz + 0.025, y + top, a + 0.025, 'woodPale');
      }
    }
    this.collider(x0, z0, x1, z1, y, y + top);
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

  /** Tall closet you can hide inside, with louvered doors you can see out through. */
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
      const pw = w / 2 - 0.01;
      const cxp = -side * (w / 4);
      // frame + horizontal louvers with gaps you can see out through
      for (const [a, b, px, py] of [[pw, 0.08, 0, 0.04], [pw, 0.08, 0, h - 0.06], [0.06, h - 0.02, -pw / 2 + 0.03, h / 2], [0.06, h - 0.02, pw / 2 - 0.03, h / 2]]) {
        const m = bx(a, b, 0.03, mat);
        m.position.set(cxp + px, py, 0);
        pivot.add(m);
      }
      for (let yy = 0.12; yy < h - 0.12; yy += 0.12) {
        const s = bx(pw - 0.1, 0.05, 0.02, mat);
        s.position.set(cxp, yy, 0);
        s.rotation.x = -0.45;
        pivot.add(s);
      }
      const knob = bx(0.03, 0.08, 0.04, this.M.brass);
      knob.position.set(-side * (w / 2 - 0.06), h / 2, 0.03);
      pivot.add(knob);
      g.add(pivot);
      doors.push({ pivot, side });
    }
    this.group.add(g);
    const [fx, fz] = DIR[facing];
    const ww = facing === '+x' || facing === '-x' ? d : w, dd = facing === '+x' || facing === '-x' ? w : d;
    this.collider(cx - ww / 2, cz - dd / 2, cx + ww / 2, cz + dd / 2, y, y + h, { occlude: true, furniture: true });
    const spot = {
      id, type: 'closet', group: g, doors, open: 0, target: 0,
      inside: new THREE.Vector3(cx + fx * (d / 2 - 0.2), y, cz + fz * (d / 2 - 0.2)),
      exit: new THREE.Vector3(cx + fx * (d / 2 + 0.6), y, cz + fz * (d / 2 + 0.6)),
      yaw: Math.atan2(-fx, -fz), camY: 1.45, occupant: null, label: 'HIDE',
    };
    this.hides.set(id, spot);
    this.register(id, 'hide', [g], new THREE.Vector3(cx + fx * d / 2, y + 1.2, cz + fz * d / 2), { spot });
    return spot;
  }

  /** Crawl space under a bed/table. side = the edge you crawl in from (you look out of it). */
  underHide(id, x0, z0, x1, z1, y, side, label, camY = 0.24) {
    const [fx, fz] = DIR[side];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const ex = fx > 0 ? x1 : fx < 0 ? x0 : cx, ez = fz > 0 ? z1 : fz < 0 ? z0 : cz;
    const pick = this.pickBox(x0, y, z0, x1, y + 0.75, z1);
    const spot = {
      id, type: 'under', doors: [], open: 0, target: 0,
      inside: new THREE.Vector3(ex - fx * 0.45, y, ez - fz * 0.45),
      exit: new THREE.Vector3(ex + fx * 0.6, y, ez + fz * 0.6),
      yaw: Math.atan2(-fx, -fz), camY, occupant: null, label,
    };
    this.hides.set(id, spot);
    this.register(id, 'hide', [pick], new THREE.Vector3(ex, y + 0.4, ez), { spot });
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

  /** Heavy steel safe (a locked cabinet). Opening it needs the weapon key. */
  safe(id, cx, y, cz, facing) {
    const w = 0.8, h = 0.95, d = 0.65;
    const c = this.container(id, 'cabinet', cx, y, cz, w, h, d, facing, 'safeSteel', 'Safe');
    const M = this.M;
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.035, 20), M.brass);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(w / 2, h * 0.58, 0.06);
    const handle = bx(0.03, 0.18, 0.04, M.brass);
    handle.position.set(w - 0.12, h * 0.42, 0.06);
    const plate = bx(0.22, 0.06, 0.01, M.brass);
    plate.position.set(w / 2, h * 0.85, 0.04);
    c.part.add(dial, handle, plate);
    c.part.traverse(o => { if (o.isMesh) { o.userData.iid = id; if (!this.pickMeshes.includes(o)) this.pickMeshes.push(o); } });
    const feet = bx(w, 0.06, d, M.black);
    feet.position.set(0, -0.03, 0);
    c.group.add(feet);
    c.group.position.y += 0.06;
    c.lock = 'weapon_key';
    c.locked = true;
    const [fx, fz] = DIR[facing];
    const ww = facing === '+x' || facing === '-x' ? d : w, dd = facing === '+x' || facing === '-x' ? w : d;
    this.collider(cx - ww / 2, cz - dd / 2, cx + ww / 2, cz + dd / 2, y, y + h + 0.06, { furniture: true });
    void fx; void fz;
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

  painting(x, y, z, facing, w = 0.62, h = 0.86, pick12 = false) {
    if (onDoorway(x, z, y, w / 2 + 0.06)) { console.warn('painting over a doorway skipped', x, z); return null; }
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
    g.rotation.z = (Math.sin(x * 13.1 + z * 7.7) * 0.04);
    this.group.add(g);
    this.paintingSlots.push({ group: g, mesh: canvasMesh, pick12, pos: new THREE.Vector3(x + fx * 0.05, y, z + fz * 0.05) });
  }

  // ----------------------------------------------------------------- doors
  buildDoors() {
    for (const d of DOORS) {
      const pivot = new THREE.Group();
      const mat = d.exit || d.secret ? this.M.woodDark : this.M.wood;
      const panel = bx(d.line === 'x' ? d.w - 0.02 : 0.05, DOOR_H - 0.02, d.line === 'x' ? 0.05 : d.w - 0.02, mat);
      const knob = bx(0.05, 0.05, 0.05, this.M.brass);
      if (d.line === 'x') {
        pivot.position.set(d.a0, d.y, d.c);
        panel.position.set(d.w / 2, DOOR_H / 2, 0);
        knob.position.set(d.w - 0.12, 1.0, 0.05 * -d.swing);
      } else {
        pivot.position.set(d.c, d.y, d.a0);
        panel.position.set(0, DOOR_H / 2, d.w / 2);
        knob.position.set(0.05 * -d.swing, 1.0, d.w - 0.12);
      }
      const knob2 = knob.clone();
      if (d.line === 'x') knob2.position.z *= -1; else knob2.position.x *= -1;
      if (d.secret) {
        // a bookcase on hinges: shelves and books on both faces, no handles
        knob.visible = knob2.visible = false;
        for (const sgn of [-1, 1]) for (let k = 0; k < 4; k++) {
          const y = 0.35 + k * 0.5;
          const shelf = d.line === 'x' ? bx(d.w - 0.06, 0.03, 0.2, this.M.woodDark) : bx(0.2, 0.03, d.w - 0.06, this.M.woodDark);
          const book = d.line === 'x' ? bx(d.w - 0.2, 0.26, 0.16, this.M.fabricRed || this.M.wood) : bx(0.16, 0.26, d.w - 0.2, this.M.fabricRed || this.M.wood);
          if (d.line === 'x') { shelf.position.set(d.w / 2, y, sgn * 0.11); book.position.set(d.w / 2, y + 0.15, sgn * 0.11); }
          else { shelf.position.set(sgn * 0.11, y, d.w / 2); book.position.set(sgn * 0.11, y + 0.15, d.w / 2); }
          pivot.add(shelf, book);
        }
      }
      pivot.add(panel, knob, knob2);
      if (d.lock && d.lock !== 'power' && !d.secret) {
        // A padlock plate on both faces so locked doors read as locked.
        for (const s of [-1, 1]) {
          const plate = bx(d.line === 'x' ? 0.1 : 0.03, 0.14, d.line === 'x' ? 0.03 : 0.1, this.M.brass);
          if (d.line === 'x') plate.position.set(d.w - 0.12, 1.22, 0.04 * s);
          else plate.position.set(0.04 * s, 1.22, d.w - 0.12);
          pivot.add(plate);
        }
        pivot.userData.lockPlates = true;
      }
      if (d.chain) {
        const chain = new THREE.Group();
        for (let i = 0; i < 9; i++) {
          const link = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 10), this.M.metal);
          link.position.set(d.w * 0.12 + i * d.w * 0.095, 1.05 - Math.sin(i / 8 * Math.PI) * 0.12, 0.06 * d.swing);
          link.rotation.y = i % 2 ? Math.PI / 2 : 0;
          chain.add(link);
        }
        const lock = bx(0.08, 0.1, 0.04, this.M.brass);
        lock.position.set(d.w / 2, 0.88, 0.07 * d.swing);
        chain.add(lock);
        pivot.add(chain);
        this.exitChain = chain;
      }
      this.group.add(pivot);
      const col = d.line === 'x'
        ? this.collider(d.a0, d.c - 0.05, d.a0 + d.w, d.c + 0.05, d.y, d.y + DOOR_H, { occlude: true, door: d.id })
        : this.collider(d.c - 0.05, d.a0, d.c + 0.05, d.a0 + d.w, d.y, d.y + DOOR_H, { occlude: true, door: d.id });
      const center = d.line === 'x' ? new THREE.Vector3(d.a0 + d.w / 2, d.y + 1.1, d.c) : new THREE.Vector3(d.c, d.y + 1.1, d.a0 + d.w / 2);
      const door = { ...d, pivot, panel, collider: col, angle: 0, target: 0, open: false, locked: !!d.lock, chained: !!d.chain, center };
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
      // the fixtures nearest the camera each frame.
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
      const L = { light, bulb, room, base: intensity, always: !!opts.always, flicker: opts.flicker ?? 0.15, seed: Math.random() * 100 };
      this.lights.push(L);
      return L;
    };
    const G = 2.55, U = 5.95, B = -0.6;
    add('bed1', 2.8, G, 4); add('wardrobe', 6.8, G, 4, 0xffd8b0, 3, 6, { flicker: 0.4 });
    add('bath', 10.5, G, 2.3, 0xe8f0ff, 5, 7); add('laundry', 10.5, G, 6.3, 0xe8f0e0, 3, 6, { flicker: 0.6 });
    add('bed2', 17, G, 2.5); add('playroom', 17, G, 6.5, 0xffd8c0, 4, 8);
    add('sec', 24, G, 4, 0xd8e8ff, 6); add('archive', 28.5, G, 4, 0xe0e8ff, 3, 7, { flicker: 0.7 });
    add('office', 35, G, 2.3, 0xffd8a0, 6, 8, { flicker: 0.3 }); add('frontoffice', 35, G, 6.3, 0xffd8a0, 4, 8);
    add('hall', 7, G, 9.5, 0xffc98a, 6, 10); add('hall', 22, G, 9.5, 0xffc98a, 6, 10, { flicker: 0.5 }); add('hall', 33, G, 9.5, 0xffc98a, 5, 9);
    add('living', 3.5, G, 16, 0xffc98a, 7, 9); add('parlor', 9, G, 16, 0xffb878, 5, 8, { flicker: 0.25 }); add('start', 14, G, 14, 0xffc98a, 6);
    add('kitchen', 23.5, G, 14, 0xf0ffe0, 7, 10, { flicker: 0.35 }); add('mudroom', 23.5, G, 19, 0xe8e0c8, 4, 8, { flicker: 0.5 });
    add('dining', 32.5, G, 17, 0xffc080, 6, 9);
    add('stairB', 16.5, 2.6, 19.2, 0xffc98a, 4, 8); add('stairU', 38, 5.9, 16, 0xffc98a, 6, 11, { flicker: 0.3 });
    add('master', 3.3, U, 4); add('dressing', 8.3, U, 4, 0xffd8b0, 3, 6);
    add('ubath', 12.5, U, 2.3, 0xe8f0ff, 4, 7, { flicker: 0.7 }); add('linen', 12.5, U, 6.3, 0xfff0e0, 2.5, 6, { flicker: 0.5 });
    add('guest', 19, U, 4);
    add('storage', 26.5, U, 4, 0xffffff, 3, 7, { flicker: 0.6 }); add('ajanroom', 35, U, 4, 0xff5030, 3, 8, { flicker: 0.2 });
    add('uhall', 6, U, 9.5, 0xffc98a, 5, 10); add('uhall', 18, U, 9.5, 0xffc98a, 5, 10, { flicker: 0.4 }); add('uhall', 30, U, 9.5, 0xffc98a, 5, 10);
    add('nursery', 5, U, 16, 0xffd0d0, 4, 9, { flicker: 0.3 }); add('library', 15, U, 16, 0xffc98a, 6, 10);
    add('music', 27, U, 16, 0xffc98a, 5, 9); add('sitting', 33, U, 17, 0xffc080, 5, 9, { flicker: 0.2 });
    // east wing
    add('ehall', 44, G, 6, 0xffc98a, 5, 9, { flicker: 0.4 }); add('ehall', 52, G, 6, 0xffc98a, 5, 9);
    add('gallery', 44, G, 2.5, 0xfff0d0, 6, 9); add('smoking', 52, G, 2.5, 0xffa860, 4, 8, { flicker: 0.3 });
    add('pantry2', 43, G, 10.5, 0xf0ffe0, 4, 8, { flicker: 0.5 }); add('secoffice', 52.5, G, 10.5, 0xd8e8ff, 5, 8, { flicker: 0.1 });
    add('garden', 12, 2.6, -6.2, 0xffe2b0, 7, 16, { noFixture: true, flicker: 0.05 }); add('garden', 28, 3, -8, 0xa8b8ff, 6, 16, { noFixture: true, flicker: 0.05 });
    add('garden', 20, 2.9, -7, 0xa8b8ff, 5, 12, { noFixture: true, flicker: 0.1 });
    add('estair', 47.5, 5.9, 11, 0xffc98a, 4, 9, { flicker: 0.4 });
    add('uehall', 44, U, 6, 0xff7040, 3, 8, { flicker: 0.6 }); add('uehall', 52, U, 6, 0xff7040, 3, 8, { flicker: 0.5 });
    add('cageroom', 43, U, 2.5, 0xff3020, 3, 7, { flicker: 0.8 }); add('operating', 48.5, U, 2.5, 0xe0fff0, 6, 7, { flicker: 0.7 });
    add('chairroom', 53.5, U, 2.5, 0xfff4d0, 4, 7, { flicker: 0.9 });
    add('nurse', 43, U, 10.5, 0xe8f0ff, 4, 8, { flicker: 0.4 }); add('spiralroom', 51, U, 12.5, 0xffc98a, 4, 8);
    // third floor (a little dimmer and flickery)
    const T = 6.8 + 2.15;
    add('thall', 6, T, 6.8, 0xffc98a, 4, 9, { flicker: 0.5 }); add('thall', 20, T, 6.8, 0xffc98a, 4, 9, { flicker: 0.3 }); add('thall', 34, T, 6.8, 0xffc98a, 4, 9, { flicker: 0.6 });
    add('dollroom', 3.5, T, 2.8, 0xffd0e0, 4, 8, { flicker: 0.4 }); add('oldbath', 9, T, 2.8, 0xe8f0ff, 3, 6, { flicker: 0.8 });
    add('chapel', 15, T, 2.8, 0xff9a50, 4, 9, { flicker: 0.2 }); add('studio', 23, T, 2.8, 0xfff4e0, 5, 9);
    add('sewing', 29.2, T, 2.8, 0xffd8b0, 3, 7, { flicker: 0.4 }); add('observ', 36.5, T, 2.8, 0xc0d0ff, 4, 9, { flicker: 0.2 });
    add('base', 6, B, 22, 0xffb070, 6, 10, { flicker: 0.4 }); add('base', 13, B, 24, 0xffb070, 6, 10);
    add('boiler', 23, B, 22, 0xffa060, 6, 11, { flicker: 0.5 }); add('garage', 33, B, 18, 0xfff0d0, 6, 10); add('garage', 35, B, 24.5, 0xfff0d0, 5, 9, { flicker: 0.3 });
    // Always-on: candles in the back room, emergency light, Ajan's red lamp, attic lamps.
    const cl = add('start', 16.25, 1.0, 11.6, 0xff9a40, 4, 7, { always: true, noFixture: true, flicker: 1 });
    cl.candle = true;
    for (const [dx, dz, h] of [[-0.15, 0.05, 0.14], [0.05, -0.08, 0.1], [0.2, 0.1, 0.18]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 8), this.M.paper);
      c.position.set(16.25 + dx, 0.7 + h / 2, 11.6 + dz);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
      f.position.set(16.25 + dx, 0.7 + h + 0.02, 11.6 + dz);
      this.group.add(c, f);
    }
    add('base', 3.0, -1.0, 18.5, 0xff3020, 1.4, 7, { always: true, noFixture: true, flicker: 0.2 });
    add('ajanroom', 37.5, 4.2, 6.5, 0xff2010, 1.6, 6, { always: true, noFixture: true, flicker: 0.4 });
    add('attic', 30, 8.7, 15, 0xffb070, 4, 10, { always: true });
    add('club', 10, 9.2, 14.5, 0x9050ff, 3, 14, { always: true, noFixture: true, flicker: 0.05 });
    // spotlights over the two poles and the bar
    add('club', 5.0, 9.15, 17.5, 0xff70c8, 9, 6, { always: true, noFixture: true, flicker: 0.02 });
    add('club', 8.8, 9.15, 17.5, 0xff5030, 6, 6, { always: true, noFixture: true, flicker: 0.02 });
    add('club', 8.0, 9.15, 9.8, 0xffc090, 6, 7, { always: true, noFixture: true, flicker: 0.02 });
    add('club', 15.5, 9.15, 18.5, 0x8040ff, 4, 9, { always: true, noFixture: true, flicker: 0.02 });
    // a lamp over the yard at the top of the driveway
    add('yard', 51, 3.2, 18.5, 0xb8c8ff, 7, 16, { always: true, flicker: 0.3 });
    add('attic', 22, 8.7, 10, 0xffb070, 3, 8, { always: true, flicker: 0.2 });
    add('attic', 37, 8.7, 18, 0xffb070, 3, 8, { always: true });
    add('uhall', 23.6, U, 9.0, 0xffc98a, 4, 8);
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
      const on = L.always || (this.power && this.blackout <= 0);
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
    const vl = levelIndex(viewer.y);
    const ranked = this.lights
      .filter(L => L.light.intensity > 0.02)
      .map(L => ({ L, d: L.light.position.distanceTo(viewer) + Math.abs(levelIndex(L.light.position.y - 2) - vl) * 8 - (L.always ? 2 : 0) }))
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
    // line, wall coordinate (inner face), along, sill y, width, height, normal sign
    const W = WINDOWS;
    for (const [line, c, a, y, w, h, n] of W) {
      const g = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.M.glassWin);
      g.add(glass);
      const bar = (bw, bh, px, py) => { const m = bx(bw, bh, 0.05, this.M.woodDark); m.position.set(px, py, 0.02); g.add(m); };
      bar(w + 0.12, 0.08, 0, h / 2 + 0.04); bar(w + 0.12, 0.1, 0, -h / 2 - 0.05);
      bar(0.07, h, -w / 2 - 0.03, 0); bar(0.07, h, w / 2 + 0.03, 0);
      bar(0.05, h, 0, 0); bar(w, 0.05, 0, 0);
      const board = bx(w + 0.2, 0.14, 0.03, this.M.wood);
      board.position.set(0, h * 0.18, 0.05);
      board.rotation.z = 0.25;
      g.add(board);
      // real openings in the outside walls: glass you can see through both ways (and can't walk through)
      if (WINDOW_CUTS.has(`${line}:${c}:${a}:${y}`)) {
        const wc = Math.round(c);
        if (line === 'x') this.collider(a - w / 2, wc - 0.12, a + w / 2, wc + 0.12, y, y + h, { occlude: true });
        else this.collider(wc - 0.12, a - w / 2, wc + 0.12, a + w / 2, y, y + h, { occlude: true });
      }
      if (line === 'x') { g.position.set(a, y + h / 2, c); g.rotation.y = n > 0 ? 0 : Math.PI; }
      else { g.position.set(c, y + h / 2, a); g.rotation.y = n > 0 ? Math.PI / 2 : -Math.PI / 2; }
      this.group.add(g);
      this.windows.push(g);
    }
  }

  // -------------------------------------------------------------------- nav
  /**
   * Ajan's waypoint graph, generated from the layout: nodes on a grid inside
   * every room he may enter, nodes either side of each door/opening, and chains
   * along the two staircases he can use. The attic, its stairs and the elevator
   * are deliberately absent, so he can never plan a path into them.
   */
  buildNav(extraColliders = []) {
    const N = [];
    const solid = this.colliders.filter(c => !c.door && !c.playerOnly);
    const extra = new Set(extraColliders);
    const clear = (x, z, y, r = 0.5) => !solid.some(c => !c.off && c.minY < y + 1.5 && c.maxY > y + 0.3 && x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r);
    let k = 0;
    const node = (x, z, y, room) => { const n = { id: 'n' + (k++), x, z, y, room, edges: [] }; N.push(n); return n; };
    this.roomNodes = {};
    for (const r of ROOMS) {
      if (r.safe) continue;
      const y = LEVELS[r.L].y;
      const list = [];
      for (const [x0, x1, z0, z1] of (r.floors || [[r.x0, r.x1, r.z0, r.z1]])) {
        const nx = Math.max(1, Math.round((x1 - x0 - 0.9) / 2.0)), nz = Math.max(1, Math.round((z1 - z0 - 0.9) / 2.0));
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const x = x0 + 0.45 + (x1 - x0 - 0.9) * (i + 0.5) / nx, z = z0 + 0.45 + (z1 - z0 - 0.9) * (j + 0.5) / nz;
          for (const [ox, oz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0, 0.2], [0, -0.2]]) {
            const px = x + ox, pz = z + oz;
            if (px < x0 + 0.45 || px > x1 - 0.45 || pz < z0 + 0.45 || pz > z1 - 0.45) continue;
            const at = roomAt(px, pz, y + 0.5);
            if (at && at !== r && ROOMS.includes(at)) continue; // another room sits inside this one's rectangle (the shed in the garden)
            if (clear(px, pz, y)) { list.push(node(px, pz, y, r.id)); break; }
          }
        }
      }
      this.roomNodes[r.id] = list;
    }
    // Keep narrow routes around late furniture connected when the room grid misses them.
    for (const c of extraColliders) {
      if (c.off || c.door || c.playerOnly) continue;
      for (const L of LEVELS) {
        if (c.minY > L.y + AJAN.height || c.maxY < L.y + 0.35) continue;
        for (const x of [c.minX - 0.5, c.maxX + 0.5]) for (const z of [c.minZ - 0.5, c.maxZ + 0.5]) {
          const room = roomAt(x, z, L.y + 0.5), list = this.roomNodes[room?.id];
          if (!list || room.safe || !clear(x, z, L.y)) continue;
          if (!list.some(n => Math.hypot(n.x - x, n.z - z) < 0.05)) list.push(node(x, z, L.y, room.id));
        }
      }
    }
    const portals = [];
    const addPortal = (d, y, doorId) => {
      const cx = d.line === 'x' ? d.a0 + d.w / 2 : d.c, cz = d.line === 'x' ? d.c : d.a0 + d.w / 2;
      const nx = d.line === 'x' ? 0 : 1, nz = d.line === 'x' ? 1 : 0;
      const a = node(cx - nx * 0.75, cz - nz * 0.75, y, roomAt(cx - nx * 0.75, cz - nz * 0.75, y + 0.5)?.id);
      const b = node(cx + nx * 0.75, cz + nz * 0.75, y, roomAt(cx + nx * 0.75, cz + nz * 0.75, y + 0.5)?.id);
      portals.push([a, b, doorId]);
    };
    for (const d of DOORS) if (!d.exit && !d.ajanBlocked) addPortal(d, d.y, d.id);
    for (const o of OPENINGS) if (!o.noNav) addPortal(o, o.y0, o.navDoor || null);
    const s1 = [node(16.5, 19.15, 0, 'stairB'), node(13.75, 19.0, -1.6, 'stairB:ramp'), node(11.25, 19.0, -3.2, 'stairB:low'), node(9.8, 19.0, -3.2, 'base')];
    const s2 = [node(38, 20.25, 0, 'stairU'), node(38, 16.25, 1.7, 'stairU:ramp'), node(38, 12.0, 3.4, 'stairU:top'), node(38, 9.6, 3.4, 'uhall')];
    const s3 = [node(48.3, 7.75, 0, 'estair'), node(48.3, 13.15, 0, 'estair'), node(46.95, 13.15, 0, 'estair'), node(46.95, 9.9, 1.7, 'estair:ramp'), node(46.95, 6.25, 3.4, 'uehall')];
    const s5 = [node(32.55, 7.25, 3.4, 'ajanroom'), node(32.55, 3.7, 5.1, 'tstair:ramp'), node(32.55, 0.6, 6.8, 'tstair:top'), node(33.8, 0.62, 6.8, 'observ')];
    // The upstairs hall narrows to 1.3 m past the attic-stair footprint (z 9.4–10.9 is
    // off limits to him): a lane of nodes along its north side keeps the west half of
    // the upstairs (master, guest, nursery, library…) connected to the rest.
    for (const x of [20.6, 22.6, 24.6, 26.6, 28.6]) this.roomNodes.uhall?.push(node(x, 8.62, 3.4, 'uhall'));

    const byId = {};
    N.forEach(n => { byId[n.id] = n; });
    const link = (A, B, door = null) => {
      if (A.edges.some(e => e.to === B.id)) return;
      const len = Math.hypot(A.x - B.x, A.z - B.z) + Math.abs(A.y - B.y);
      A.edges.push({ to: B.id, door, len });
      B.edges.push({ to: A.id, door, len });
    };
    for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
      const a = N[i], b = N[j];
      if (!a.room || a.room !== b.room || Math.abs(a.y - b.y) > 0.4) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > 4.6) continue;
      // only test colliders near the segment
      const mnx = Math.min(a.x, b.x) - 0.5, mxx = Math.max(a.x, b.x) + 0.5, mnz = Math.min(a.z, b.z) - 0.5, mxz = Math.max(a.z, b.z) + 0.5;
      const near = solid.filter(c => c.maxX > mnx && c.minX < mxx && c.maxZ > mnz && c.minZ < mxz);
      // Late props include sofas/tables below the original graph's 0.6 m sample.
      const blocked = segmentBlockers(a.x, a.z, b.x, b.z, a.y + 0.6, near, { pad: AJAN.radius, occludeOnly: false, max: 1, who: 'ajan' }) ||
        segmentBlockers(a.x, a.z, b.x, b.z, a.y + 0.35, near.filter(c => extra.has(c)), { pad: AJAN.radius, height: AJAN.height - 0.35, occludeOnly: false, max: 1, who: 'ajan' });
      if (!blocked) link(a, b);
    }
    for (const [a, b, d] of portals) link(a, b, d);
    for (const chain of [s1, s2, s3, s5]) for (let i = 0; i < chain.length - 1; i++) link(chain[i], chain[i + 1]);
    // Keep only the main connected graph (all links, locked doors included): a node
    // boxed in by furniture would otherwise be a patrol target he can never reach.
    const comp = new Map();
    let best = null, bestN = 0;
    for (const n of N) {
      if (comp.has(n.id)) continue;
      const stack = [n.id], members = [n.id];
      comp.set(n.id, n.id);
      while (stack.length) for (const e of byId[stack.pop()].edges) if (!comp.has(e.to)) { comp.set(e.to, n.id); stack.push(e.to); members.push(e.to); }
      if (members.length > bestN) { bestN = members.length; best = n.id; }
    }
    const main = N.filter(n => comp.get(n.id) === best);
    const mainById = Object.fromEntries(main.map(n => [n.id, n]));
    this.nav = { nodes: main, byId: mainById };
    this.navDropped = N.length - main.length;
    this.navAll = N;
    for (const id of Object.keys(this.roomNodes)) this.roomNodes[id] = this.roomNodes[id].filter(n => mainById[n.id]);
    // one patrol point per room: the reachable node nearest the room's middle
    this.patrolNodes = ROOMS.filter(r => !r.safe && this.roomNodes[r.id]?.length).map(r => {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      return this.roomNodes[r.id].reduce((a, n) => (Math.hypot(n.x - cx, n.z - cz) < Math.hypot(a.x - cx, a.z - cz) ? n : a)).id;
    });
  }

  // ------------------------------------------------------------- per frame
  update(dt, time, viewer) {
    if (this.decorAnims) for (const f of this.decorAnims) f(dt, time);
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
      if (h.doors.length && Math.abs(h.open - h.target) > 0.001) {
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
      if (!avail.length) { slot.mesh.material.color.set(0x2a2622); return; }
      // the newer frames show image1 or image2, decided per round from the shared seed
      // (so every player sees the same picture in the same frame)
      if (slot.pick12 && (textures[0] || textures[1])) {
        const k = textures[0] && textures[1] ? (rnd() < 0.5 ? 0 : 1) : textures[0] ? 0 : 1;
        slot.mesh.material = new THREE.MeshStandardMaterial({ map: textures[k], roughness: 0.75, color: 0xbbbbbb });
        slot.imageIndex = k;
        return;
      }
      if (!pool.length) pool = shuffle(avail.map((_, k) => k), rnd);
      const tex = avail[pool.pop()];
      slot.mesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, color: 0xbbbbbb });
      slot.imageIndex = i;
    });
  }
}

/** Item meshes (keys, fuse, bolt cutters). */
export function makeItemMesh(type, M) {
  const g = new THREE.Group();
  if (type === 'camcorder') return g; // camera.glb is added once loaded (camcorder.js)
  if (type.startsWith('bag_')) {
    // a little zip bag (or a cigarette-pack for the joints)
    const col = { bag_mushrooms: 0xc8b8a0, bag_flour: 0xf0f0f0, bag_weed: 0x305a28 }[type];
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: col, transparent: type !== 'bag_weed', opacity: 0.85, roughness: 0.3 }));
    bag.position.y = 0.012;
    const seal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.012), new THREE.MeshStandardMaterial({ color: 0x2050c0 }));
    seal.position.set(0, 0.013, -0.045);
    g.add(bag, seal);
    return g;
  }
  if (type === 'joint') {
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.09, 8), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.9 }));
    j.rotation.z = Math.PI / 2; j.position.y = 0.01;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }));
    tip.rotation.z = Math.PI / 2; tip.position.set(0.05, 0.01, 0);
    g.add(j, tip);
    return g;
  }
  if (type === 'mushroom') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xf4f0e0 }));
    stem.position.y = 0.025;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc01010, roughness: 0.5 }));
    cap.position.y = 0.045;
    g.add(stem, cap);
    for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff })); const a = i * 1.05; d.position.set(Math.cos(a) * 0.022, 0.07, Math.sin(a) * 0.022); g.add(d); }
    return g;
  }
  if (type === 'well_lever') {
    // an iron crank handle off the well's axle
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.7, roughness: 0.5 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), iron); arm.position.set(0, 0.03, 0);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.8 }));
    grip.position.set(0.19, 0.1, 0);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), iron); hub.position.set(-0.19, 0.03, 0);
    g.add(arm, grip, hub);
    return g;
  }
  if (type === 'spray') {
    // a small aerosol can with a red cap and a skull label
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 14), new THREE.MeshStandardMaterial({ color: 0x3a7a20, metalness: 0.6, roughness: 0.35 }));
    can.position.y = 0.08;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xb01010, roughness: 0.5 }));
    cap.position.y = 0.18;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0355, 0.0355, 0.06, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8e0a0, roughness: 0.8 }));
    label.position.y = 0.08;
    g.add(can, cap, label);
    return g;
  }
  if (type === 'fuse') {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0xa0d0ff, transparent: true, opacity: 0.7, emissive: 0x112233, roughness: 0.1 }));
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.025, 12), M.brass);
    c1.position.y = 0.055;
    const c2 = c1.clone();
    c2.position.y = -0.055;
    g.add(glass, c1, c2);
    g.rotation.z = Math.PI / 2;
    g.position.y = 0.025;
  } else if (type === 'bolt_cutters') {
    const red = new THREE.MeshStandardMaterial({ color: 0x9a1a10, roughness: 0.6, emissive: 0x200000 });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.025), red);
      h.position.set(-0.12, 0.012, s * 0.03);
      h.rotation.y = s * 0.08;
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.03), M.metal);
      jaw.position.set(0.15, 0.014, s * 0.012);
      g.add(h, jaw);
    }
  } else if (type === 'stair_lower' || type === 'stair_upper') {
    return makeStairPieceMesh(M, type === 'stair_upper');
  } else if (type === 'engine') {
    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.45), M.metal);
    blk.position.y = 0.19;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.34), new THREE.MeshStandardMaterial({ color: 0x7a1010, metalness: 0.5, roughness: 0.5 }));
    head.position.y = 0.43;
    g.add(blk, head);
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8), M.brass); c.position.set(-0.18 + i * 0.12, 0.51, 0); g.add(c); }
    const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 14), M.black); pulley.rotation.z = Math.PI / 2; pulley.position.set(0.3, 0.2, 0); g.add(pulley);
  } else if (type === 'wrench') {
    const steel = new THREE.MeshStandardMaterial({ color: 0xaab0b6, metalness: 0.9, roughness: 0.25 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.015, 0.03), steel);
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 6, 12, Math.PI * 1.4), steel);
    jaw.rotation.x = Math.PI / 2; jaw.position.x = 0.17;
    g.add(shaft, jaw);
    g.position.y = 0.01;
  } else if (type === 'oil') {
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.1), new THREE.MeshStandardMaterial({ color: 0xc89a10, metalness: 0.3, roughness: 0.5 }));
    can.position.y = 0.13;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0x101010 }));
    cap.position.set(0.05, 0.28, 0);
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.182, 0.1, 0.102), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    label.position.y = 0.12;
    g.add(can, cap, label);
  } else if (type === 'battery') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.18), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }));
    box.position.y = 0.1;
    g.add(box);
    for (const [x, c] of [[-0.09, 0xb01010], [0.09, 0x202020]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), new THREE.MeshStandardMaterial({ color: c, metalness: 0.5 })); t.position.set(x, 0.22, 0); g.add(t); }
  } else if (type === 'bullet') {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.045, 10), M.brass);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.022, 10), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, metalness: 0.8, roughness: 0.3 }));
    tip.position.y = 0.033;
    g.add(shell, tip);
    g.position.y = 0.023;
  } else if (type === 'revolver') {
    // object.glb is fitted in later (game.js) once the model has loaded
    g.userData.revolver = true;
  } else {
    const tint = { exit_key: 0x301008, office_key: 0x102030, storage_key: 0x103010, elevator_key: 0x202020, weapon_key: 0x200820, attic_key: 0x082020 }[type] ?? 0x201505;
    const mat = M.brass.clone();
    mat.emissive = new THREE.Color(tint);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 16), mat);
    ring.rotation.x = Math.PI / 2;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.014), mat);
    shaft.position.x = 0.085;
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.03), mat);
    t1.position.set(0.12, 0, 0.015);
    const t2 = t1.clone();
    t2.position.x = 0.1;
    g.add(ring, shaft, t1, t2);
    const tagColor = { exit_key: 0xaa1515, office_key: 0x2050a0, storage_key: 0x2a8a2a, elevator_key: 0xd0b020, weapon_key: 0x7a1aa0, attic_key: 0x10a0a0 }[type];
    if (tagColor) {
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.04), new THREE.MeshStandardMaterial({ color: tagColor, emissive: new THREE.Color(tagColor).multiplyScalar(0.25) }));
      tag.position.set(-0.055, 0, 0.0);
      g.add(tag);
    }
    if (type === 'exit_key') g.scale.setScalar(1.3);
    g.position.y = 0.008;
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Candidate spawn spots for progression items (one is picked per session). */
export const ITEM_SPAWNS = {
  office_key: [{ pos: [8.5, 1.36, 11.33] }, { pos: [19.6, 0.8, 8.33] }, { container: 'c_side' }],
  basement_key: [{ container: 'c_office' }],
  storage_key: [{ pos: [1.2, 3.97, 19.7] }], // on the crib, guarded by the nursery spider
  fuse: [{ container: 'c_storage' }],
  bolt_cutters: [{ pos: [37.2, -2.3, 26.3] }, { pos: [26.0, -2.4, 26.3] }],
  exit_key: [{ pos: [23.75, 0.78, 0.95] }, { pos: [21.9, 0.78, 0.95] }],
  elevator_key: [{ container: 'c_kit1' }, { container: 'c_kit2' }, { container: 'c_desk2' }, { container: 'c_bath' }, { container: 'c_ns1' }],
  // Opens the safe with the revolver; anywhere in the house.
  weapon_key: [{ container: 'c_nursery' }, { container: 'c_ns_m' }, { container: 'c_guest' }, { pos: [16.2, 4.16, 16.6] }, { pos: [32.2, -2.29, 26.4] }, { pos: [26.0, 7.71, 20.3] }, { pos: [2.5, 0.45, 15.6] }],
  revolver: [{ container: 'c_safe' }],
  // the attic staircase, taken apart: both sections lie side by side in the basement
  stair_lower: [{ pos: [12.4, -3.2, 24.55] }],
  stair_upper: [{ pos: [12.4, -3.2, 25.6] }],
  attic_key: [{ pos: [30.37, 0.9, 20.6] }, { pos: [15.4, 4.16, 4.6] }, { pos: [10.5, 1.32, 18.6] }, { pos: [25.0, 4.7, 19.6] }],
  // car parts for the garage escape (car.js)
  engine: [{ pos: [22.0, -3.2, 21.5] }, { pos: [26.3, 3.4, 3.0] }, { pos: [37.5, 6.8, 17.0] }, { pos: [28.6, 0, 4.6] }],
  wrench: [{ pos: [38.2, -2.3, 26.2] }, { pos: [29.6, 0.97, 18.3] }, { pos: [8.5, 0.85, 7.55] }],
  oil: [{ pos: [15.0, -2.3, 26.2] }, { pos: [28.0, 0, 20.3] }, { pos: [25.3, 0.97, 11.45] }],
  battery: [{ pos: [23.0, 0, 6.6] }, { pos: [31.2, 0, 3.6] }, { pos: [31.5, -3.2, 23.2] }],
};

// Three loose revolver bullets are scattered on every floor (picked from these spots).
export const BULLET_SPOTS = [
  [[16.3, -2.3, 26.4], [10.25, -2.5, 22.0], [6.8, -2.35, 26.3], [26.8, -2.4, 26.3], [27.8, -2.5, 18.2], [32.8, -2.29, 26.2], [36.2, -2.29, 26.4]],
  [[8.2, 0.8, 10.6], [37.15, 0.8, 8.3], [22.2, 0.76, 16.4], [32.6, 0.78, 15.2], [26.2, 0.78, 1.0], [35.3, 0.78, 1.8], [2.75, 0.6, 0.35], [29.6, 0.97, 19.5]],
  [[13.8, 4.16, 16.6], [15.5, 4.16, 3.6], [3.4, 4.0, 0.3], [24.0, 4.24, 6.6], [16.4, 4.2, 8.3], [3.6, 4.2, 8.3], [33.55, 3.85, 17.6], [30.6, 4.2, 7.6]],
  [[19.0, 7.6, 9.0], [38.8, 7.7, 9.2], [38.6, 7.6, 20.0], [34.8, 7.42, 19.8], [39.0, 7.5, 15.0], [28.9, 7.35, 20.55]],
];

export const CAMERAS = [
  { label: 'CAM 01  HALLWAY W', pos: [0.4, 2.75, 8.4], look: [9, 0.8, 10] },
  { label: 'CAM 02  HALLWAY E', pos: [39.6, 2.75, 10.6], look: [28, 0.8, 9] },
  { label: 'CAM 03  KITCHEN', pos: [29.6, 2.75, 16.6], look: [21, 0.6, 12.5] },
  { label: 'CAM 04  LIVING RM', pos: [6.6, 2.75, 20.6], look: [1.5, 0.6, 13.5] },
  { label: 'CAM 05  BASEMENT', pos: [16.6, -0.55, 26.6], look: [6, -2.9, 19.5] },
  { label: 'CAM 06  BACK ROOM', pos: [16.7, 2.75, 11.3], look: [12.5, 0.4, 16] },
  { label: 'CAM 07  UPSTAIRS', pos: [0.4, 6.15, 8.4], look: [12, 3.6, 10] },
  { label: 'CAM 08  GARAGE', pos: [39.6, -0.55, 26.6], look: [33, -2.9, 18] },
  { label: 'CAM 09  GARDEN', pos: [2.4, 3.2, -13.6], look: [20, 0, -5] },
  { label: 'CAM 10  EAST HALL', pos: [40.3, 2.75, 5.2], look: [52, 0.6, 6.4] },
  { label: 'CAM 11  EAST WING UP', pos: [55.7, 6.15, 5.2], look: [43, 3.6, 6.2] },
  { label: 'CAM 12  BACK STAIRS', pos: [48.7, 6.1, 13.7], look: [47.4, 0.8, 7.8] },
  { label: 'CAM 13  STAIRCASE', pos: [36.3, 6.1, 20.7], look: [38.5, 1.2, 13] },
  { label: 'CAM 14  SECURITY DOOR', pos: [48.4, 2.7, 5.2], look: [53, 0.8, 6.8] },
];
