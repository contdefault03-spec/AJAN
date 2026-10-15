// Furniture, hiding places, containers, notes and prop anchors for every floor.
import * as THREE from 'three';
import { bx } from './house.js';

const BY = -3.2, U = 3.4, AY = 6.8;

export function buildFurniture(h) {
  h.anchors = {};
  buildGround(h);
  buildUpstairs(h);
  buildBasement(h);
  buildAttic(h);
  buildNotes(h);
  // The giant wobbly thing appears in one of three bedrooms each session.
  const spots = [
    { room: 'bed2', pos: new THREE.Vector3(16.2, 0, 2.8) },
    { room: 'guest', pos: new THREE.Vector3(18.8, U, 4.4) },
  ];
  h.jellySpot = spots[Math.floor(h.rnd() * spots.length)];
  // The weapon safe stands in one of three places each session.
  const safes = [
    { x: 9.5, y: U, z: 6.6, f: '-x', room: 'master' },
    { x: 2.45, y: BY, z: 22.6, f: '+x', room: 'base' },
    { x: 32.4, y: U, z: 11.45, f: '+z', room: 'sitting' },
  ];
  const sp = safes[Math.floor(h.rnd() * safes.length)];
  h.safe('c_safe', sp.x, sp.y, sp.z, sp.f);
  h.safeSpot = sp;
  const p = h.jellySpot.pos;
  h.collider(p.x - 0.5, p.z - 0.36, p.x + 0.5, p.z + 0.36, p.y, p.y + 2.6, { furniture: true });
}

// ============================================================ ground floor
function buildGround(h) {
  const G = h.geo, M = h.M;
  // Bedroom 1
  h.bed(0.2, 0.36, 2.3, 2.6, 0, true);
  h.underHide('u_bed1', 0.2, 0.36, 2.3, 2.6, 0, '+z', 'HIDE UNDER BED');
  h.furnitureBox(2.45, 0, 0.12, 3.05, 0.6, 0.62, 'woodDark');
  h.container('c_ns1', 'drawer', 2.75, 0.38, 0.4, 0.5, 0.16, 0.42, '+z', 'wood', 'Nightstand');
  h.hideSpot('h_bed1', 7.15, 0.62, 1.2, 0.8, 2.15, '+z', 'woodDark');
  h.furnitureBox(0.12, 0, 4.4, 0.62, 0.95, 6.0, 'wood');
  G.box(0.1, 0.002, 3, 3.5, 0.008, 5.4, 'fabricRed');
  h.chair(1.2, 6.9);
  // walk-in wardrobe: shoe boxes and a hanging rail
  h.furnitureBox(7.35, 0, 3.0, 7.88, 0.45, 3.6, 'woodPale');
  G.box(7.6, 1.75, 1.6, 7.64, 1.78, 6.8, 'metal');
  h.painting(7.88, 1.7, 4.2, '-x');
  h.painting(0.12, 1.85, 5.2, '+x');

  // Bathroom
  h.furnitureBox(8.12, 0, 0.12, 9.9, 0.6, 1.95, 'porcelain', true);
  G.box(8.3, 0.3, 0.3, 9.72, 0.61, 1.77, 'dark');
  h.furnitureBox(12.2, 0, 0.15, 12.8, 0.45, 0.85, 'porcelain');
  G.box(12.2, 0.45, 0.12, 12.8, 0.95, 0.3, 'porcelain');
  h.furnitureBox(11.0, 0, 0.12, 11.9, 0.85, 0.62, 'porcelain');
  G.box(11.05, 1.25, 0.11, 11.85, 1.95, 0.13, 'metal');
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x9aa4a6, metalness: 0.9, roughness: 0.25 }));
  mirror.position.set(11.45, 1.6, 0.135);
  h.group.add(mirror);
  h.collider(12.4, 2.95, 12.9, 4.25, 0, 0.9);
  h.container('c_bath', 'cabinet', 12.65, 0.05, 3.6, 1.2, 0.85, 0.5, '-x', 'woodPale', 'Cabinet');
  h.painting(8.12, 1.75, 5.5, '+x', 0.5, 0.7);

  // Child's room
  h.bed(18.6, 0.36, 20.8, 2.6, 0, true);
  h.underHide('u_bed2', 18.6, 0.36, 20.8, 2.6, 0, '+z', 'HIDE UNDER BED');
  h.hideSpot('h_bed2', 13.85, 0.62, 1.2, 0.8, 2.15, '+z', 'wood');
  h.furnitureBox(19.95, 0, 2.9, 20.88, 0.76, 4.5, 'wood');
  h.container('c_desk2', 'drawer', 20.16, 0.52, 3.7, 0.55, 0.16, 0.42, '-x', 'woodPale', 'Desk');
  h.chair(19.4, 3.7);
  G.box(14, 0.002, 5.5, 17.5, 0.008, 7.6, 'fabricGreen');
  h.furnitureBox(15.2, 0, 6.6, 15.9, 0.5, 7.3, 'woodPale');
  h.painting(13.12, 1.7, 3.2, '+x');
  h.painting(20.88, 1.8, 6.6, '-x', 0.5, 0.7);

  // Security room
  h.furnitureBox(21.5, 0, 0.12, 26.8, 0.78, 1.25, 'woodDark');
  h.chair(24.2, 2.1, 0, 'metal');
  h.shelf(27.12, 6.6, 29.0, 7.88, 2.0, 'metal', 0, true);
  h.shelf(29.3, 2.5, 29.88, 6.5, 2.0, 'metal', 0, true);
  h.furnitureBox(21.15, 0, 6.2, 22.0, 1.3, 7.7, 'metal', true);
  for (let i = 0; i < 4; i++) {
    const x = 22.3 + i * 1.25;
    const casing = bx(1.0, 0.75, 0.55, M.dark);
    casing.position.set(x, 0.78 + 0.4, 0.55);
    h.group.add(casing);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.6), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    scr.position.set(x, 0.78 + 0.41, 0.835);
    h.group.add(scr);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false }));
    label.position.set(x, 0.78 + 0.41, 0.84);
    label.renderOrder = 2;
    h.group.add(label);
    const mon = { index: i, screen: scr, label, pos: new THREE.Vector3(x, 1.2, 0.86) };
    h.monitors.push(mon);
    h.register('mon' + i, 'monitor', [scr, casing], mon.pos, { monitor: mon });
  }

  // Office (locked: office key)
  h.table(35.0, 1.6, 37.6, 2.6, 0.78, 'woodDark');
  h.container('c_office', 'drawer', 36.3, 0.55, 2.39, 0.6, 0.16, 0.42, '+z', 'wood', 'Desk');
  h.underHide('u_desk', 35.0, 1.6, 37.6, 2.6, 0, '+z', 'HIDE UNDER DESK', 0.45);
  h.chair(36.3, 3.3);
  h.shelf(39.3, 0.3, 39.88, 4.3, 2.2, 'woodDark', 0, true);
  h.shelf(39.3, 5.0, 39.88, 7.6, 2.0, 'woodDark', 0, true);
  h.furnitureBox(30.2, 0, 0.2, 30.8, 1.3, 1.0, 'metal');
  h.furnitureBox(30.2, 0, 1.1, 30.8, 1.3, 1.9, 'metal');
  G.box(32, 0.002, 5.0, 38, 0.008, 7.5, 'carpet');
  h.painting(30.12, 1.7, 5.0, '+x');

  // Hallway
  h.furnitureBox(19.0, 0, 8.12, 20.2, 0.8, 8.55, 'wood');
  h.furnitureBox(8.0, 0, 10.45, 9.0, 0.8, 10.88, 'wood');
  h.furnitureBox(37.0, 0, 8.12, 38.2, 0.8, 8.55, 'wood');
  G.box(1, 0.002, 9.1, 39, 0.008, 9.9, 'fabricRed');
  h.painting(7.0, 1.7, 8.12, '+z');
  h.painting(13.4, 1.75, 8.12, '+z', 0.5, 0.7);
  h.painting(28.0, 1.7, 8.12, '+z');
  h.painting(2.5, 1.7, 10.88, '-z');
  h.painting(18.5, 1.75, 10.88, '-z', 0.5, 0.7);
  h.painting(27.0, 1.7, 10.88, '-z');

  // Living room
  h.furnitureBox(0.12, 0, 14.4, 0.85, 0.55, 16.1, 'woodDark');
  h.furnitureBox(3.4, 0, 14.0, 4.3, 0.45, 16.6, 'fabricRed');
  G.box(4.0, 0.45, 14.0, 4.3, 0.95, 16.6, 'fabricRed');
  G.box(3.4, 0.45, 14.0, 4.0, 0.7, 14.25, 'fabricRed');
  G.box(3.4, 0.45, 16.35, 4.0, 0.7, 16.6, 'fabricRed');
  h.table(1.8, 14.6, 2.8, 15.9, 0.45, 'wood');
  h.furnitureBox(1.0, 0, 18.5, 1.85, 0.45, 19.4, 'fabricGreen');
  G.box(1.0, 0.45, 19.15, 1.85, 1.0, 19.4, 'fabricGreen');
  h.shelf(7.5, 11.12, 9.5, 11.55, 2.0, 'woodDark', 0, true);
  h.furnitureBox(10.35, 0, 17.8, 10.9, 1.2, 19.8, 'woodDark', true);
  G.box(10.3, 0.1, 18.3, 10.36, 0.8, 19.3, 'black');
  G.box(1.2, 0.002, 13, 6.5, 0.008, 17.5, 'carpet');
  h.painting(2.6, 1.75, 11.12, '+z');
  h.painting(10.88, 1.7, 12.4, '-x', 0.5, 0.7);
  h.painting(1.8, 1.7, 20.88, '-z');
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
  h.group.add(tv);
  h.tv = { group: tv, screen, pos: new THREE.Vector3(0.8, 0.85, 15.25) };
  h.register('tv', 'tv', [screen, body], h.tv.pos);

  // Back room (spawn)
  h.furnitureBox(11.3, 0, 15.2, 13.1, 0.22, 16.8, 'fabricBed');
  h.furnitureBox(15.5, 0, 15.6, 16.8, 0.7, 16.8, 'woodPale');
  h.furnitureBox(16.0, 0.7, 15.9, 16.6, 1.05, 16.5, 'woodPale');
  h.table(15.8, 11.25, 16.75, 11.95, 0.7, 'woodDark');
  h.chair(12.0, 12.0);
  h.painting(14.3, 1.7, 16.88, '-z');

  // Kitchen (east counter split around the dining-room door)
  for (const [z0, z1] of [[12.0, 14.7], [17.4, 20.0]]) {
    h.furnitureBox(29.3, 0, z0, 29.9, 0.92, z1, 'woodPale');
    G.box(29.25, 0.92, z0, 29.9, 0.97, z1, 'porcelain');
    G.box(29.5, 1.6, z0, 29.9, 2.3, z1, 'woodPale');
  }
  G.box(29.3, 0.93, 13.0, 29.9, 0.98, 14.0, 'metal');
  h.furnitureBox(24.0, 0, 11.12, 29.3, 0.92, 11.7, 'woodPale');
  G.box(24.0, 0.92, 11.1, 29.3, 0.97, 11.75, 'porcelain');
  h.container('c_kit1', 'drawer', 29.575, 0.68, 18.0, 0.6, 0.18, 0.55, '-x', 'woodPale', 'Drawer');
  h.container('c_kit2', 'drawer', 26.5, 0.68, 11.43, 0.6, 0.18, 0.5, '+z', 'woodPale', 'Drawer');
  h.furnitureBox(17.15, 0, 11.15, 17.95, 1.85, 12.0, 'porcelain', true, true);
  h.table(22.0, 15.0, 24.0, 16.6, 0.76, 'wood');
  h.underHide('u_ktable', 22.0, 15.0, 24.0, 16.6, 0, '-z', 'HIDE UNDER TABLE', 0.45);
  h.chair(21.6, 15.8);
  h.chair(24.4, 15.8);
  h.chair(23.0, 14.55);
  h.hideSpot('h_pantry', 26.6, 20.48, 1.2, 0.7, 2.15, '-z', 'woodPale');
  h.painting(17.12, 1.7, 16.2, '+x', 0.5, 0.7);
  h.painting(22.5, 1.7, 20.88, '-z');

  // Dining room
  h.table(32.2, 15.0, 34.0, 18.4, 0.78, 'woodDark');
  h.underHide('u_dining', 32.2, 15.0, 34.0, 18.4, 0, '-z', 'HIDE UNDER TABLE', 0.45);
  h.chair(33.1, 18.85);
  h.furnitureBox(30.12, 0, 19.6, 30.62, 0.9, 20.9, 'woodDark');
  h.container('c_side', 'drawer', 30.41, 0.62, 20.25, 0.6, 0.16, 0.42, '+x', 'wood', 'Sideboard');
  h.painting(35.88, 1.7, 16.5, '-x');
  G.box(31.0, 0.002, 14.6, 35.0, 0.008, 19.4, 'carpet');
}

// ================================================================ upstairs
function buildUpstairs(h) {
  const G = h.geo;
  // Master bedroom
  h.bed(0.5, 0.4, 3.0, 2.8, U, true);
  h.underHide('u_master', 0.5, 0.4, 3.0, 2.8, U, '+z', 'HIDE UNDER BED');
  h.furnitureBox(3.1, U, 0.12, 3.7, U + 0.6, 0.62, 'woodDark');
  h.container('c_ns_m', 'drawer', 3.4, U + 0.38, 0.4, 0.5, 0.16, 0.42, '+z', 'wood', 'Nightstand');
  h.hideSpot('h_master', 8.6, 0.62, 1.2, 0.8, 2.15, '+z', 'woodDark', U);
  h.furnitureBox(0.12, U, 5.0, 0.62, U + 0.95, 6.6, 'wood');
  G.box(1, U + 0.002, 3.5, 6, U + 0.008, 6.8, 'fabricRed');
  h.painting(9.88, U + 1.7, 4.0, '-x');
  h.painting(0.12, U + 1.8, 3.6, '+x', 0.5, 0.7);

  // Upstairs bathroom (mirror message + blood live in props.js)
  h.furnitureBox(10.12, U, 0.12, 11.9, U + 0.6, 1.95, 'porcelain');
  G.box(10.3, U + 0.3, 0.3, 11.72, U + 0.61, 1.77, 'dark');
  h.furnitureBox(14.2, U, 0.15, 14.8, U + 0.45, 0.85, 'porcelain');
  G.box(14.2, U + 0.45, 0.12, 14.8, U + 0.95, 0.3, 'porcelain');
  h.furnitureBox(12.4, U, 0.12, 13.3, U + 0.85, 0.62, 'porcelain');
  G.box(12.45, U + 1.25, 0.11, 13.25, U + 1.95, 0.13, 'metal');
  h.anchors.mirror = new THREE.Vector3(12.85, U + 1.6, 0.135);
  h.furnitureBox(14.4, U, 5.5, 14.88, U + 1.8, 6.6, 'woodPale');

  // Guest room
  h.bed(20.5, 0.4, 22.8, 2.6, U, true);
  h.underHide('u_guest', 20.5, 0.4, 22.8, 2.6, U, '-x', 'HIDE UNDER BED');
  h.furnitureBox(19.7, U, 0.15, 20.3, U + 0.6, 0.65, 'woodDark');
  h.anchors.phone = new THREE.Vector3(20.0, U + 0.6, 0.42);
  h.furnitureBox(15.12, U, 3.4, 16.0, U + 0.76, 5.0, 'wood');
  h.container('c_guest', 'drawer', 15.79, U + 0.52, 4.2, 0.55, 0.16, 0.42, '+x', 'woodPale', 'Desk');
  h.hideSpot('h_guest', 22.48, 5.5, 1.2, 0.8, 2.15, '-x', 'wood', U);
  h.painting(15.12, U + 1.7, 6.6, '+x');

  // Storage room (locked: storage key)
  h.shelf(23.4, 0.12, 26.6, 0.55, 2.0, 'woodDark', U, true);
  h.collider(27.1, 0.15, 28.1, 0.65, U, U + 0.95);
  h.container('c_storage', 'cabinet', 27.6, U + 0.05, 0.4, 1.0, 0.9, 0.5, '+z', 'woodPale', 'Cabinet');
  for (const [x, z, s] of [[24.0, 6.6, 0.8], [25.1, 6.9, 0.6], [28.6, 5.6, 0.9], [28.8, 4.4, 0.6], [24.3, 3.6, 0.7]]) h.furnitureBox(x - s / 2, U, z - s / 2, x + s / 2, U + s, z + s / 2, 'woodPale');
  h.furnitureBox(29.2, U, 1.5, 29.85, U + 1.9, 3.3, 'fabricBed');

  // Ajan's room: dirty bed, bones, food bowl (more in props.js)
  h.bed(35.0, 0.4, 38.6, 3.0, U, false);
  h.ajanBed = { stand: new THREE.Vector3(36.8, U, 4.0), seat: new THREE.Vector3(36.8, U + 0.32, 1.25), ry: 0 };
  h.furnitureBox(30.2, U, 6.6, 31.8, U + 0.8, 7.85, 'woodDark');
  h.furnitureBox(39.1, U, 4.5, 39.85, U + 1.4, 6.5, 'woodDark');
  h.painting(30.12, U + 1.7, 3.5, '+x');

  // Upstairs hall
  G.box(1, U + 0.002, 9.1, 39, U + 0.008, 9.9, 'fabricGreen');
  h.wallChair(0.85, 9.5, U, '-x');
  h.furnitureBox(16.2, U, 8.12, 17.4, U + 0.8, 8.55, 'wood');
  h.painting(8.0, U + 1.7, 8.12, '+z');
  h.painting(24.0, U + 1.75, 10.88, '-z', 0.5, 0.7);
  h.painting(31.5, U + 1.7, 8.12, '+z');

  // Nursery: the spider's room. The storage key lies on the crib (south-west
  // corner); the spider waits in the south-east corner (spider.js). No hiding
  // places in here, and the floor along the south wall is kept clear.
  h.crib(0.5, 18.8, 1.9, 20.6, U);
  h.furnitureBox(0.12, U, 13.0, 0.62, U + 0.9, 14.6, 'woodPale');
  h.container('c_nursery', 'drawer', 0.41, U + 0.6, 13.8, 0.6, 0.16, 0.42, '+x', 'wood', 'Dresser');
  h.furnitureBox(2.35, U, 12.05, 2.65, U + 0.3, 12.35, 'fabricRed', false);
  h.painting(9.88, U + 1.7, 14.0, '-x', 0.5, 0.7);

  // Library
  h.shelf(10.12, 12.0, 10.6, 20.0, 2.4, 'woodDark', U, true);
  h.shelf(19.4, 12.0, 19.88, 20.0, 2.4, 'woodDark', U, true);
  h.shelf(11.0, 20.4, 19.0, 20.88, 2.4, 'woodDark', U, true);
  h.table(13.5, 15.0, 16.5, 17.0, 0.76, 'woodDark', U);
  h.underHide('u_library', 13.5, 15.0, 16.5, 17.0, U, '-z', 'HIDE UNDER TABLE', 0.45);
  h.chair(15.0, 17.6, U);
  h.anchors.radio1 = new THREE.Vector3(14.0, U + 0.76, 16.4);
  h.furnitureBox(17.4, U, 12.3, 18.3, U + 0.45, 13.2, 'fabricGreen');
  G.box(17.4, U + 0.45, 12.3, 17.65, U + 1.0, 13.2, 'fabricGreen');

  // Music room
  h.furnitureBox(24.2, U, 18.6, 26.4, U + 1.25, 20.85, 'woodDark');
  G.box(24.2, U + 0.95, 18.5, 26.4, U + 1.0, 18.6, 'porcelain');
  h.shelf(35.3, 14.0, 35.88, 20.0, 1.6, 'woodDark', U, true);
  h.anchors.boombox = new THREE.Vector3(31.0, U, 19.6);
  h.chair(28.0, 14.0, U); h.chair(29.0, 14.2, U);
  h.wallChair(28.5, 20.2, U, '+z');
  h.painting(24.12, U + 1.7, 15.0, '+x');
}

// ================================================================ basement
function buildBasement(h) {
  const G = h.geo, M = h.M;
  h.shelf(2.15, 18.0, 2.7, 21.0, 2.0, 'metal', BY, true);
  h.furnitureBox(14.5, BY, 25.9, 16.85, BY + 0.9, 26.85, 'wood');
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.0, 16), M.metal);
  boiler.position.set(9.6, BY + 1.0, 26.2);
  boiler.castShadow = true;
  h.group.add(boiler);
  h.collider(9.1, 25.7, 10.1, 26.7, BY, BY + 2);
  h.furnitureBox(4.0, BY, 18.0, 5.0, BY + 0.8, 18.8, 'woodPale');
  h.furnitureBox(4.2, BY + 0.8, 18.1, 4.9, BY + 1.3, 18.7, 'woodPale');
  h.furnitureBox(9.8, BY, 21.6, 10.7, BY + 0.7, 22.4, 'woodPale');
  h.furnitureBox(5.5, BY, 25.8, 7.6, BY + 0.85, 26.8, 'woodDark');
  h.hideSpot('h_locker', 3.4, 26.5, 0.8, 0.6, 2.0, '-z', 'metal', BY);
  h.painting(2.12, BY + 1.6, 24.0, '+x');
  for (const [z, x0, x1] of [[18.0, 2, 17], [24.5, 2, 40], [14.2, 30, 40]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, x1 - x0, 8), M.metal);
    p.rotation.z = Math.PI / 2;
    p.position.set((x0 + x1) / 2, -0.4, z);
    h.group.add(p);
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
  h.group.add(fb);
  h.collider(12.6, 26.7, 13.4, 26.95, BY, BY + 2);
  h.fusebox = { group: fb, lever, slot: fbSlot, pos: new THREE.Vector3(13, BY + 1.45, 26.6) };
  h.register('fusebox', 'fusebox', [fbBody, lever, fbSlot], h.fusebox.pos);
  const fuseVisual = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), M.brass);
  fuseVisual.position.set(-0.15, 0.1, -0.15);
  fuseVisual.visible = false;
  fb.add(fuseVisual);
  h.fusebox.fuseVisual = fuseVisual;

  // Boiler room
  for (const x of [20.5, 23.5]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 18), M.metal);
    b.position.set(x, BY + 1.2, 25.6);
    b.castShadow = true;
    h.group.add(b);
    h.collider(x - 0.7, 24.9, x + 0.7, 26.3, BY, BY + 2.4, { occlude: true });
  }
  h.shelf(18.0, 17.12, 26.0, 17.6, 1.8, 'metal', BY, true);
  h.furnitureBox(27.6, BY, 18.0, 28.6, BY + 0.7, 19.0, 'woodPale');
  h.anchors.radio2 = new THREE.Vector3(28.1, BY + 0.7, 18.5);
  h.furnitureBox(25.0, BY, 25.9, 27.2, BY + 0.8, 26.8, 'wood');
  h.wallChair(18.2, 26.3, BY, '+z');

  // Workshop
  h.furnitureBox(35.8, BY, 25.8, 38.6, BY + 0.9, 26.85, 'wood');
  G.box(35.8, BY + 1.2, 26.85, 38.6, BY + 2.4, 26.9, 'woodDark');
  h.hideSpot('h_workshop', 30.48, 24.6, 1.0, 0.7, 2.0, '+x', 'metal', BY);
  for (const [x, z, s] of [[30.7, 18.0, 0.7], [31.0, 15.0, 0.8], [38.8, 14.4, 0.7], [39.3, 26.2, 0.7]]) h.furnitureBox(x - s / 2, BY, z - s / 2, x + s / 2, BY + s, z + s / 2, 'woodPale');
  h.table(31.2, 25.9, 33.2, 26.85, 0.9, 'woodDark', BY);
  // The car (car.js) is parked in the middle facing the garage door in the east wall.
  h.carCollider = h.collider(33.05, 19.9, 36.95, 22.1, BY, BY + 1.7, { furniture: true, occlude: true });
  h.garageDoorCollider = h.collider(39.85, 19.4, 40.15, 22.6, BY, BY + 2.5, { occlude: true, wall: true });
  h.wallChair(34.5, 24.8, BY, '+x');
}

// ================================================================== attic
function buildAttic(h) {
  const G = h.geo;
  G.box(26, AY + 0.002, 15.5, 34, AY + 0.008, 19.8, 'carpet');
  G.box(19, AY + 0.002, 9, 26, AY + 0.008, 12, 'carpetB');
  // TV stand for the cinema TV (props.js builds the set)
  h.furnitureBox(28.6, AY, 20.2, 31.4, AY + 0.55, 20.9, 'woodDark');
  h.anchors.cinema = new THREE.Vector3(30, AY + 0.55, 20.55);
  // sofa facing the TV
  h.furnitureBox(28.0, AY, 16.0, 32.0, AY + 0.45, 16.9, 'fabricRed');
  G.box(28.0, AY + 0.45, 16.0, 32.0, AY + 0.95, 16.25, 'fabricRed');
  h.chair(26.8, 17.5, AY, 'woodPale');
  h.chair(33.2, 17.5, AY, 'woodPale');
  for (const [x, z, s] of [[19.0, 9.0, 0.8], [26.0, 20.3, 0.9], [38.8, 9.2, 0.9], [38.6, 20.0, 0.8], [25.4, 9.0, 0.6], [39.0, 15.0, 0.7]]) h.furnitureBox(x - s / 2, AY, z - s / 2, x + s / 2, AY + s, z + s / 2, 'woodPale');
  h.furnitureBox(36.5, AY, 10.0, 37.5, AY + 0.3, 12.0, 'fabricBed');
  h.painting(18.12, AY + 1.1, 11.2, '+x', 0.5, 0.7);
}

// ================================================================== notes
function buildNotes(h) {
  h.note('note_start', 12.4, 0.22, 16.0, 0.3,
    'Day 41.\n\nHe came back again last night. I could hear him BREATHING behind the walls.\n\nHe follows noise. Walk slowly. Crouch. Don\'t talk.\n\nThe front door is CHAINED and LOCKED. The key is in the security room (electric lock - no power), and the chain needs cutting.');
  h.note('note_living', 2.3, 0.45, 15.0, -0.4,
    'The breaker blew when the storm hit.\n\nI locked the basement key in my OFFICE so he couldn\'t get down there. Lost the office key somewhere on this floor.\n\nThe spare FUSE is in the storage room upstairs.\n\nDad\'s REVOLVER is locked in his SAFE. The weapon key is hidden somewhere in the house. One round, and it takes forever to load another. It won\'t kill him, but it puts him on the floor.');
  h.note('note_kitchen', 23.0, 0.76, 15.6, 0.8,
    'If he sees you, break line of sight and HIDE.\n\nWardrobes. Under the beds. Under the big tables.\n\nHe forgets fast. He doesn\'t forget if he watches you climb in.\n\nSome floorboards SCREAM. He always comes to check.');
  h.note('note_office', 36.6, 0.78, 2.1, 0.2,
    'Basement key - desk drawer.\n\nStorage room key: it\'s on the crib in the NURSERY. I couldn\'t get it back. Something lives in there.\n\nThe old elevator still runs on its own line, but it needs its key. Kitchen? Bathroom? I keep forgetting where I put things.');
  h.note('note_base', 15.4, BY + 0.9, 26.3, 0.2,
    'Fuse goes in the left slot. Then pull the lever.\n\nThe security door and the cameras run on the same circuit.');
  h.note('note_workshop', 37.0, BY + 0.9, 26.1, -0.3,
    'Took the BOLT CUTTERS back down here.\n\nIf you need to get through that chain on the front door, this is what you want.\n\nThe old car would still run if it had an ENGINE (you\'ll need a WRENCH to fit it), OIL and a BATTERY. Everything got carried off around the house. Floor it and that garage door won\'t hold.');
  h.furnitureBox(2.6, U, 8.12, 3.8, U + 0.8, 8.55, 'woodDark');
  h.note('note_nursery', 3.2, U + 0.8, 8.33, 0,
    'DO NOT GO IN THE NURSERY\n\nIt sits in the far corner and waits. It feels you RUNNING.\n\nThe moment you reach for the key on the crib it comes for you. It is FAST.\n\nGrab it and RUN for the door. It never leaves that room.');
  h.note('note_library', 15.6, U + 0.76, 15.6, 0.5,
    'He goes wherever the radio plays.\n\nTurn it on and run the other way. He switches it off when he gets there.');
  h.note('note_ajan', 31.0, U + 0.8, 7.2, 1.2,
    'he sleeps here every few minutes\n\nhe always comes back to sleep\n\ni heard him laughing in the dark when i hid\n\nhe never goes up to the attic. never. i don\'t know why.');
  h.note('note_attic', 31.5, AY + 0.45, 16.45, 0.1,
    'You\'re safe up here.\n\nHe won\'t climb those stairs.\n\nThe old set still plays the film. Press the button on the VCR to start it over.');
}
