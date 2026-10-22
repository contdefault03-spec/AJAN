// The former sewing room has no progression items or scripted puzzle roles.
// Keep its layout IDs stable, and build all solid props before House.buildNav().
import * as THREE from 'three';
import { splatTexture } from './textures.js';

export const BUTCHER = {
  room: 'sewing', interval: 8 * 60, duration: 30,
  stand: new THREE.Vector3(29.2, 6.8, 3.25), ry: Math.PI,
};

export function buildButcherRoom(h) {
  const Y = BUTCHER.stand.y, M = h.M;
  const group = new THREE.Group(); group.name = 'butcher-room'; h.group.add(group);
  h.butcher = BUTCHER;
  const skin = new THREE.MeshStandardMaterial({ color: 0x898575, roughness: 0.96 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x59211c, roughness: 0.65 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xb8b19a, roughness: 1 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x40463d, roughness: 1 });
  const mesh = (geo, mat, x, y, z, parent = group) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (w, ht, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, ht, d), mat, x, Y + y, z);
  const decalMat = kind => new THREE.MeshStandardMaterial({ map: splatTexture(701, kind), color: 0x907a68, transparent: true, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pool = decalMat('pool'), splat = decalMat('wall');
  const stain = (x, y, z, sx, sy, wall = false, ry = 0) => {
    const m = mesh(new THREE.PlaneGeometry(sx, sy), wall ? splat : pool, x, Y + y, z);
    m.castShadow = false;
    if (wall) m.rotation.y = ry; else m.rotation.x = -Math.PI / 2;
  };
  // Workbench with a clear working side and a broad aisle back to the original door.
  box(2.25, 0.12, 1.0, M.woodPale, 29.2, 0.94, 1.95);
  for (const x of [28.22, 30.18]) for (const z of [1.56, 2.34]) box(0.09, 0.9, 0.09, M.metal, x, 0.45, z);
  box(2.15, 0.08, 0.85, M.woodDark, 29.2, 0.22, 1.95);
  h.collider(28.075, 1.45, 30.325, 2.45, Y, Y + 1.45, { furniture: true });
  stain(29.2, 1.007, 1.95, 2.1, 0.95);
  // A clothed corpse with a visible head, arms and legs; separate limbs on the slab.
  const corpse = (x, y, z, hanging = false) => {
    const body = new THREE.Group(); body.name = 'corpse'; body.position.set(x, Y + y, z);
    if (!hanging) body.rotation.x = Math.PI / 2;
    group.add(body);
    const part = (geo, mat, px, py, pz) => mesh(geo, mat, px, py, pz, body);
    part(new THREE.CylinderGeometry(0.18, 0.23, 0.62, 8), cloth, 0, 0.25, 0);
    const head = part(new THREE.SphereGeometry(0.145, 10, 8), skin, 0, 0.72, 0); head.scale.set(0.85, 1.15, 0.92);
    for (const side of [-1, 1]) {
      part(new THREE.CapsuleGeometry(0.07, 0.42, 3, 6), skin, side * 0.28, 0.15, 0);
      part(new THREE.CapsuleGeometry(0.09, 0.5, 3, 6), cloth, side * 0.12, -0.36, 0);
      part(new THREE.SphereGeometry(0.075, 8, 6), flesh, side * 0.14, -0.65, 0);
    }
    return body;
  };
  const slabBody = corpse(28.9, 1.18, 1.8); slabBody.rotation.z = Math.PI / 2;
  for (const [x, z, angle] of [[29.8, 2.1, 0.8], [30, 1.65, -0.5], [27.65, 3.8, 1.2]]) {
    const limb = mesh(new THREE.CapsuleGeometry(0.085, 0.38, 3, 7), skin, x, Y + (x < 28 ? 0.11 : 1.1), z);
    limb.name = 'severed-limb'; limb.rotation.set(Math.PI / 2, 0, angle);
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.025, 8), flesh); end.position.y = 0.27; limb.add(end);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 6), bone); tip.position.y = 0.29; limb.add(tip);
  }
  for (const [x, z] of [[27.48, 0.85], [30.98, 0.85]]) {
    // Alternating chain links and rusted hooks, suspended from the ceiling.
    for (let i = 0; i < 10; i++) {
      const link = mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 7), M.metal, x, Y + 2.6 - i * 0.065, z);
      link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    }
    const hook = mesh(new THREE.TorusGeometry(0.1, 0.018, 5, 10, Math.PI * 1.6), M.metal, x, Y + 1.88, z);
    hook.rotation.z = -0.6;
    corpse(x, 1.08, z, true);
    h.collider(x - 0.32, z - 0.24, x + 0.32, z + 0.24, Y, Y + 2, { furniture: true });
  }
  // Rusted wall pipes, shelves and a drain: keep the activity area and doorway clear.
  for (const y of [1.9, 2.25]) {
    const pipe = mesh(new THREE.CylinderGeometry(0.055, 0.055, 4.1, 8), M.metal, 29.2, Y + y, 0.19); pipe.rotation.z = Math.PI / 2;
  }
  box(0.4, 1.5, 1.0, M.metal, 31.12, 0.75, 4.1);
  h.collider(30.92, 3.6, 31.32, 4.6, Y, Y + 1.5, { furniture: true });
  const drain = box(0.36, 0.015, 0.36, M.dark, 29.9, 0.017, 4.6);
  for (let i = 0; i < 6; i++) box(0.025, 0.02, 0.35, M.metal, drain.position.x - 0.15 + i * 0.06, 0.03, 4.6);
  for (const [x, z, size] of [[28.9, 2.9, 2.2], [27.6, 0.8, 1], [30.7, 0.8, 1.1], [29.5, 4.4, 1.2]]) stain(x, 0.014, z, size, size);
  stain(29.2, 1.25, 0.108, 3.9, 2.3, true);
  stain(27.108, 1.2, 2.5, 2.5, 2.2, true, Math.PI / 2);
  stain(31.392, 1.3, 2.5, 2.5, 2.2, true, -Math.PI / 2);
}
