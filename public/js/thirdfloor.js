// The third floor's furnishings: a doll room, an old bathroom, a chapel, a painting
// studio, a sewing room and an observatory along a long hall, plus the two balconies.
// Walls, floors, doors and the stairs come from layout.js like every other floor.
import * as THREE from 'three';
import { LEVELS } from './layout.js';

export function buildThirdFloor(h) {
  const G = h.geo;
  const Y = LEVELS[3].y, U = LEVELS[2].y;
  const add = m => { m.castShadow = true; h.group.add(m); return m; };
  const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return add(m); };
  // roof over the third floor, and nobody walks under the high end of the stairs in Ajan's room
  G.plane('floorConcrete', 0, 0, 40, 8, 9.42, true);
  h.collider(31.95, 1.0, 33.15, 4.0, U, U + 1.2);

  // ---- hall: a runner rug, chairs against the walls, and paintings (image1 / image2, picked per round)
  G.box(1, Y + 0.002, 6.4, 39, Y + 0.008, 7.2, 'fabricRed');
  for (const x of [5.2, 18.6, 30.4]) h.painting(x, Y + 1.6, 7.88, '-z', 0.7, 0.95, true);
  for (const x of [12.2, 25.2]) h.painting(x, Y + 1.6, 5.72, '-z', 0.6, 0.8, true);
  h.wallChair(39.5, 7.0, Y, '-x');

  // ---- the doll room: shelves of dolls, a crib, a wardrobe to hide in
  h.shelf(0.12, 1.0, 0.6, 4.6, 2.0, 'woodPale', Y, false);
  const porcelain = h.M.porcelain, dress = new THREE.MeshStandardMaterial({ color: 0x7a3048, roughness: 0.9 });
  for (let i = 0; i < 12; i++) {
    const z = 1.2 + (i % 6) * 0.6, y = Y + 0.55 + Math.floor(i / 6) * 0.75;
    mesh(new THREE.SphereGeometry(0.07, 10, 8), porcelain, 0.38, y + 0.2, z);
    mesh(new THREE.ConeGeometry(0.09, 0.22, 8), dress, 0.38, y + 0.05, z);
  }
  h.crib(1.0, 3.9, 2.4, 4.7, Y);
  h.hideSpot('h_doll', 6.2, 0.62, 1.2, 0.8, 2.1, '+z', 'woodPale', Y);
  h.painting(3.4, Y + 1.7, 0.06, '+z', 0.55, 0.75, true);

  // ---- old bathroom: a clawfoot tub, sink and a cracked mirror
  h.furnitureBox(7.2, Y, 0.2, 8.9, Y + 0.6, 1.0, 'porcelain');
  h.furnitureBox(10.2, Y, 2.4, 10.85, Y + 0.85, 3.2, 'porcelain');
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x9aa4ac, metalness: 0.9, roughness: 0.12 }));
  mirror.position.set(10.94, Y + 1.6, 2.8); mirror.rotation.y = -Math.PI / 2; add(mirror);

  // ---- chapel: pews, an altar with candles, a cross; hide under the altar cloth
  for (let r = 0; r < 4; r++) for (const x of [12.4, 16.2]) {
    h.furnitureBox(x, Y, 1.4 + r * 0.95, x + 2.4, Y + 0.45, 1.75 + r * 0.95, 'woodDark');
    G.box(x, Y + 0.45, 1.72 + r * 0.95, x + 2.4, Y + 0.95, 1.78 + r * 0.95, 'woodDark');
  }
  h.table(14.0, 0.25, 16.0, 0.95, 0.95, 'woodDark', Y);
  h.underHide('u_altar', 14.0, 0.25, 16.0, 0.95, Y, '+z', 'HIDE UNDER THE ALTAR', 0.3);
  G.box(14.95, Y + 1.3, 0.1, 15.05, Y + 2.6, 0.16, 'woodDark'); G.box(14.6, Y + 2.15, 0.1, 15.4, Y + 2.25, 0.16, 'woodDark');
  const wax = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, emissive: 0x302010 });
  for (const x of [14.3, 14.6, 15.4, 15.7]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), wax, x, Y + 1.06, 0.5);

  // ---- painting studio: easels (their canvases are image1 / image2), a paint table, a closet
  for (const [x, z] of [[21.0, 3.0], [23.4, 2.4], [25.4, 3.4]]) {
    G.box(x - 0.03, Y, z - 0.03, x + 0.03, Y + 1.6, z + 0.03, 'wood');
    h.painting(x, Y + 1.25, z + 0.06, '+z', 0.6, 0.8, true);
    h.collider(x - 0.35, z - 0.25, x + 0.35, z + 0.25, Y, Y + 1.6, { furniture: true });
  }
  h.table(19.4, 0.3, 21.2, 1.2, 0.8, 'woodPale', Y);
  h.hideSpot('h_studio', 26.2, 0.62, 1.2, 0.8, 2.1, '+z', 'woodDark', Y);

  // ---- sewing room: dress forms and a sewing table
  for (const [x, z] of [[28.0, 1.2], [30.6, 1.3]]) {
    mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10), dress, x, Y + 1.15, z);
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), h.M.metal, x, Y + 0.4, z);
    h.collider(x - 0.25, z - 0.25, x + 0.25, z + 0.25, Y, Y + 1.6, { furniture: true });
  }
  h.table(27.4, 2.4, 29.0, 3.4, 0.75, 'wood', Y);
  h.chair(28.2, 3.8, Y);

  // ---- observatory: a brass telescope at the east window, a desk with charts
  const brass = h.M.brass || h.M.metal;
  const tube = mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.4, 14), brass, 39.0, Y + 1.5, 0.95);
  tube.rotation.x = -1.0;
  mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.2, 8), h.M.metal, 39.0, Y + 0.6, 1.1);
  h.collider(38.7, 0.6, 39.3, 1.3, Y, Y + 1.8, { furniture: true });
  h.table(34.2, 3.8, 36.6, 4.8, 0.8, 'woodDark', Y);
  h.underHide('u_observ', 34.2, 3.8, 36.6, 4.8, Y, '-z', 'HIDE UNDER THE DESK', 0.28);
  h.painting(36.5, Y + 1.7, 0.06, '+z', 0.8, 0.6, true);

  // ---- balconies: a bench and potted plants on the north one, chairs on the roof terrace
  h.furnitureBox(18.0, Y, -2.0, 20.0, Y + 0.45, -1.55, 'woodDark');
  const leaf = new THREE.MeshStandardMaterial({ color: 0x1a3a18, roughness: 1 });
  for (const x of [12.6, 25.4]) { mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.4, 10), h.M.floorConcrete || h.M.metal, x, Y + 0.2, -0.4); mesh(new THREE.IcosahedronGeometry(0.35, 1), leaf, x, Y + 0.65, -0.4); }
  h.chair(42.0, 2.5, Y); h.chair(44.0, 2.2, Y);
}
