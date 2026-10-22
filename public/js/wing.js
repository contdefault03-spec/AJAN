// The east wing's own geometry that the generic room/wall builder doesn't cover:
// landings and ceilings of the back stairs, the roof, the spiral stair up to the
// TV room (steps, centre post, rail) and the TV room's ceiling.
import * as THREE from 'three';
import { RAMPS, spiralHeight, LEVELS, ROOMS, DOORS, OPENINGS } from './layout.js';

export function buildWing(h) {
  const G = h.geo;
  const GY = LEVELS[1].y, UY = LEVELS[2].y, AY = LEVELS[3].y;
  // back stairs: bottom and top landings, ceiling over the stairwell
  G.plane('floorWoodDark', 46, 7, 49, 14, GY, true);
  for (const [x0, x1, z0, z1] of [[47.65, 49, 7, 14], [46, 47.65, 13.2, 14]]) { G.plane('floorWood', x0, z0, x1, z1, UY, true); G.plane('ceiling', x0, z0, x1, z1, UY - 0.01, false); }
  G.plane('ceiling', 46, 7, 49, 14, 6.4, false);
  // flat roof over the wing (seen from the TV room windows) and the TV room's ceiling
  G.plane('floorConcrete', 40, 0, 56, 7, 6.42, true);
  G.plane('floorConcrete', 40, 7, 49, 14, 6.42, true);
  G.plane('ceiling', 49, 7, 56, 14, AY + 2.4, false);
  G.plane('floorConcrete', 49, 7, 56, 14, 9.22, true);

  // ---------------------------------------------------------------- spiral stair
  const r = RAMPS.find(q => q.id === 'R6');
  const wood = h.M.floorWoodDark, metal = h.M.metal;
  const total = r.turns * Math.PI * 2;
  const N = Math.round(total / 0.26);
  const rm = (r.r0 + r.r1) / 2, len = r.r1 - r.r0;
  const stepW = total / N * r.r1 * 1.05;
  const stepGeo = new THREE.BoxGeometry(len, 0.07, stepW);
  const steps = new THREE.InstancedMesh(stepGeo, wood, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const a = r.a0 + t * total;
    const x = r.cx + Math.cos(a) * rm, z = r.cz + Math.sin(a) * rm;
    const y = spiralHeight(r, x, z, r.ya + (r.yb - r.ya) * t) - 0.035;
    q.setFromAxisAngle(up, -a);
    m4.compose(new THREE.Vector3(x, y, z), q, one);
    steps.setMatrixAt(i, m4);
  }
  steps.castShadow = true;
  steps.receiveShadow = true;
  h.group.add(steps);
  // centre post and an outer handrail on posts
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, r.yb - r.ya + 1.1, 12), metal);
  post.position.set(r.cx, (r.ya + r.yb + 1.1) / 2, r.cz);
  h.group.add(post);
  h.collider(r.cx - 0.2, r.cz - 0.2, r.cx + 0.2, r.cz + 0.2, r.ya, r.yb + 1.2);
  const railPts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48, a = r.a0 + t * total;
    railPts.push(new THREE.Vector3(r.cx + Math.cos(a) * (r.r1 - 0.05), r.ya + (r.yb - r.ya) * t + 0.95, r.cz + Math.sin(a) * (r.r1 - 0.05)));
    if (i % 4 === 0) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6), metal);
      p.position.set(railPts[i].x, railPts[i].y - 0.475, railPts[i].z);
      h.group.add(p);
    }
  }
  const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 96, 0.025, 6, false), metal);
  h.group.add(rail);
  // up top: a guard rail round the stairwell opening (the top step lands on the corner past it)
  for (const [x0, z0, x1, z1] of [[52, 8.5, 52, 11.5], [52, 11.5, 55, 11.5], [55, 10, 55, 11.5], [53.5, 10, 55, 10]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), bar = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.05, 0.05, z1 - z0 + 0.05), wood);
    bar.position.set((x0 + x1) / 2, AY + 0.95, (z0 + z1) / 2);
    h.group.add(bar);
    for (let i = 0; i <= Math.round(len / 0.5); i++) {
      const t = i / Math.round(len / 0.5), b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.95, 0.04), wood);
      b.position.set(x0 + (x1 - x0) * t, AY + 0.475, z0 + (z1 - z0) * t);
      h.group.add(b);
    }
    h.collider(Math.min(x0, x1) - 0.04, Math.min(z0, z1) - 0.04, Math.max(x0, x1) + 0.04, Math.max(z0, z1) + 0.04, AY, AY + 1);
  }
}

/** Furniture for the east wing's rooms (they were bare). Kept clear of every doorway. */
export function furnishWing(h) {
  const G = h.geo;
  const GY = LEVELS[1].y, UY = LEVELS[2].y;
  const add = m => { m.castShadow = true; h.group.add(m); return m; };
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return add(m); };
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.7 });
  // ---- halls: runners and paintings (image1 / image2)
  G.box(40.5, GY + 0.002, 5.6, 55.5, GY + 0.008, 6.4, 'fabricRed');
  G.box(40.5, UY + 0.002, 5.6, 45.8, UY + 0.008, 6.4, 'fabricGreen');
  G.box(48.2, UY + 0.002, 5.6, 55.5, UY + 0.008, 6.4, 'fabricGreen');
  for (const x of [46.6, 55.0]) h.painting(x, GY + 1.6, 5.08, '+z', 0.55, 0.72, true);
  for (const x of [45.6, 50.8]) h.painting(x, UY + 1.6, 5.08, '+z', 0.55, 0.72, true);
  // ---- gallery: framed pictures, a viewing bench, two busts on plinths
  for (const x of [41.6, 46.4]) h.painting(x, GY + 1.6, 0.08, '+z', 0.9, 1.1, true);
  h.painting(47.92, GY + 1.6, 2.5, '-x', 0.9, 1.1, true);
  h.furnitureBox(42.6, GY, 2.2, 45.4, GY + 0.45, 2.7, 'woodDark');
  for (const [x, z] of [[41.0, 4.3], [47.0, 4.2]]) {
    h.furnitureBox(x - 0.25, GY, z - 0.25, x + 0.25, GY + 1.0, z + 0.25, 'porcelain');
    mesh(new THREE.SphereGeometry(0.17, 14, 12), stoneMat, x, GY + 1.25, z);
    mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.18, 12), stoneMat, x, GY + 1.07, z);
  }
  // ---- smoking room: fireplace with embers, armchair and side table, a bookshelf
  h.furnitureBox(55.35, GY, 1.6, 55.95, GY + 1.25, 3.4, 'woodDark');
  G.box(55.3, GY, 2.05, 55.36, GY + 0.75, 2.95, 'black');
  const ember = new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff4010, emissiveIntensity: 0.9 });
  for (let i = 0; i < 5; i++) mesh(new THREE.SphereGeometry(0.05 + i * 0.01, 8, 6), ember, 55.55, GY + 0.08, 2.2 + i * 0.13);
  h.chair(53.6, 2.5, GY, 'fabricRed');
  h.table(52.4, 1.9, 53.1, 3.1, 0.55, 'woodDark', GY);
  h.shelf(48.12, 0.5, 48.6, 4.3, 2.0, 'woodDark', GY, true);
  G.box(50, GY + 0.002, 1.2, 54.6, GY + 0.008, 4.2, 'carpet');
  // ---- pantry: shelves of jars and tins, sacks and a crate
  h.shelf(40.12, 11.0, 40.6, 13.8, 2.0, 'woodPale', GY, true);
  h.shelf(44.0, 13.4, 45.9, 13.88, 2.0, 'woodPale', GY, true);
  for (const [x, z] of [[45.3, 8.0], [44.7, 8.1]]) h.furnitureBox(x - 0.28, GY, z - 0.25, x + 0.28, GY + 0.55, z + 0.25, 'fabricBed');
  h.furnitureBox(41.0, GY, 7.2, 41.9, GY + 0.7, 7.9, 'wood');
  h.hideSpot('h_pantry2', 42.8, 13.35, 1.2, 0.8, 2.1, '-z', 'woodPale', GY);
  // ---- security office: filing cabinets
  h.furnitureBox(49.15, GY, 12.4, 49.8, GY + 1.3, 13.85, 'metal');
  // ---- nurse's room: a hospital bed, a cabinet, an IV stand
  h.bed(40.6, 10.2, 41.8, 12.6, UY, true);
  h.underHide('u_nurse', 40.6, 10.2, 41.8, 12.6, UY, '+x', 'HIDE UNDER THE BED', 0.24);
  h.furnitureBox(44.9, UY, 13.3, 45.85, UY + 1.1, 13.85, 'porcelain');
  mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.8, 6), h.M.metal, 42.3, UY + 0.9, 10.6);
  mesh(new THREE.BoxGeometry(0.12, 0.2, 0.04), new THREE.MeshStandardMaterial({ color: 0xc8e0f0, transparent: true, opacity: 0.6 }), 42.3, UY + 1.7, 10.6);
  // ---- tower room: bookshelves round the spiral stair, two reading chairs, a rug
  h.shelf(49.12, 8.6, 49.6, 12.8, 2.2, 'woodDark', UY, true);
  h.shelf(55.4, 12.4, 55.88, 13.9, 2.2, 'woodDark', UY, true);
  h.chair(50.8, 13.2, UY, 'fabricGreen'); h.chair(54.2, 13.0, UY, 'fabricGreen');
  G.box(50.2, UY + 0.002, 11.9, 55.0, UY + 0.008, 13.8, 'carpetB');
  h.hideSpot('h_tower', 55.35, 8.4, 0.8, 1.1, 2.1, '-x', 'woodDark', UY);
}

// Rooms that were nearly bare get furniture that fits them, set against the walls and
// kept well clear of every doorway and of what's already there.
const SPARSE = {
  wardrobe: [[0.6, 1.9, 1.2, 'woodDark'], [0.6, 1.9, 1.0, 'woodDark'], [0.45, 0.5, 0.9, 'fabricRed']],
  laundry: [[0.62, 0.88, 0.62, 'porcelain'], [0.62, 0.88, 0.62, 'porcelain'], [0.45, 1.8, 1.4, 'woodPale'], [0.5, 0.4, 0.6, 'fabricBed']],
  playroom: [[0.5, 0.5, 0.8, 'fabricRed'], [0.5, 0.5, 0.8, 'fabricGreen'], [0.4, 1.2, 1.2, 'woodPale'], [0.35, 0.35, 0.35, 'fabricBed']],
  mudroom: [[0.45, 0.45, 1.6, 'woodDark'], [0.4, 1.9, 1.2, 'wood'], [0.35, 0.3, 0.9, 'woodDark'], [0.5, 0.7, 0.5, 'metal']],
  linen: [[0.45, 2.0, 1.4, 'woodPale'], [0.45, 2.0, 1.2, 'woodPale'], [0.5, 0.45, 0.6, 'fabricBed']],
  secoffice: [[0.7, 0.76, 1.4, 'woodDark'], [0.45, 1.3, 0.9, 'metal'], [0.4, 1.9, 1.1, 'woodDark']],
  oldbath: [[0.75, 0.6, 1.6, 'porcelain'], [0.45, 0.85, 0.55, 'porcelain'], [0.3, 1.6, 0.6, 'woodPale']],
  observ: [[0.4, 2.0, 1.4, 'woodDark'], [0.6, 0.45, 0.6, 'fabricGreen']],
  operating: [[0.5, 0.9, 0.8, 'metal'], [0.45, 1.8, 1.0, 'porcelain'], [0.4, 0.9, 0.4, 'metal']],
  chairroom: [[0.5, 1.6, 0.9, 'metal'], [0.35, 0.4, 0.35, 'metal'], [0.6, 0.8, 0.6, 'wood']],
  nurse: [[0.45, 1.8, 0.9, 'porcelain'], [0.6, 0.75, 0.9, 'woodPale']],
};

export function furnishSparse(h) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ways = [...DOORS, ...OPENINGS];
  for (const [id, items] of Object.entries(SPARSE)) {
    const r = ROOMS.find(q => q.id === id);
    if (!r) continue;
    const y = LEVELS[r.L].y;
    const clearOf = (x0, z0, x1, z1) => {
      if (x0 < r.x0 + 0.06 || x1 > r.x1 - 0.06 || z0 < r.z0 + 0.06 || z1 > r.z1 - 0.06) return false;
      for (const d of ways) {
        const dy = d.y ?? d.y0 ?? 0;
        if (Math.abs(dy - y) > 1) continue;
        const cx = d.line === 'x' ? d.a0 + d.w / 2 : d.c, cz = d.line === 'x' ? d.c : d.a0 + d.w / 2;
        const dx = Math.max(x0 - cx, 0, cx - x1), dz = Math.max(z0 - cz, 0, cz - z1);
        if (Math.hypot(dx, dz) < 1.25 + d.w / 2) return false;
      }
      return !h.colliders.some(c => { const p = c.furniture ? 0.35 : 0.02; return c.minY < y + 1.8 && c.maxY > y + 0.05 && c.maxX > x0 - p && c.minX < x1 + p && c.maxZ > z0 - p && c.minZ < z1 + p && !c.door; });
    };
    for (const [d, ht, w, mat] of items) {
      for (let tries = 0; tries < 40; tries++) {
        const side = Math.floor(rnd() * 4), t = rnd();
        let x0, z0, x1, z1;
        if (side < 2) { // against a z wall (runs along x)
          const x = r.x0 + 0.17 + w / 2 + t * (r.x1 - r.x0 - w - 0.34);
          x0 = x - w / 2; x1 = x + w / 2;
          if (side === 0) { z0 = r.z0 + 0.17; z1 = z0 + d; } else { z1 = r.z1 - 0.17; z0 = z1 - d; }
        } else {
          const z = r.z0 + 0.17 + w / 2 + t * (r.z1 - r.z0 - w - 0.34);
          z0 = z - w / 2; z1 = z + w / 2;
          if (side === 2) { x0 = r.x0 + 0.17; x1 = x0 + d; } else { x1 = r.x1 - 0.17; x0 = x1 - d; }
        }
        if (!clearOf(x0, z0, x1, z1)) continue;
        h.furnitureBox(x0, y, z0, x1, y + ht, z1, mat);
        h.sparsePlaced = (h.sparsePlaced || 0) + 1;
        break;
      }
    }
  }
}
