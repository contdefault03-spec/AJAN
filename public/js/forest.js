// The night forest round the house: dark ground, a few hundred instanced pines in a
// ring (dense further out, thinner near the walls), some dead birches and bushes,
// all as a handful of draw calls. Fog does the distance.
import * as THREE from 'three';

const HOUSE = { x0: -3, x1: 59, z0: -3, z1: 33 }; // house, wing, porch, driveway and yard stay clear

export function buildForest(scene, rnd = Math.random) {
  const g = new THREE.Group();
  const ground = new THREE.MeshStandardMaterial({ color: 0x0d120c, roughness: 1 });
  // ground round the house (never under it: the basement and the driveway trench stay open)
  for (const [x0, x1, z0, z1] of [[-80, -0.2, -80, 110], [56.2, 140, -80, 12], [64, 140, 12, 110], [-0.2, 56.2, -80, -0.2], [-0.2, 40, 21.2, 110], [40, 64, 30, 110]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), ground);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, -0.03, (z0 + z1) / 2);
    m.receiveShadow = true;
    g.add(m);
  }
  const spots = [];
  const tries = 4000;
  for (let i = 0; i < tries && spots.length < 520; i++) {
    const x = -60 + rnd() * 180, z = -60 + rnd() * 150;
    const dx = Math.max(HOUSE.x0 - x, 0, x - HOUSE.x1), dz = Math.max(HOUSE.z0 - z, 0, z - HOUSE.z1);
    const d = Math.hypot(dx, dz);
    if (d < 4) continue;
    if (d < 12 && rnd() > 0.35) continue; // a clearing round the house
    spots.push([x, z, 0.75 + rnd() * 0.7, rnd() * Math.PI * 2, d]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const inst = (geo, mat, list, fn) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => { fn(s, m4); im.setMatrixAt(i, m4); });
    im.castShadow = false;
    g.add(im);
    return im;
  };
  const pines = spots.filter((s, i) => i % 7 !== 0), dead = spots.filter((s, i) => i % 7 === 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1e1610, roughness: 1 });
  const needleMat = new THREE.MeshStandardMaterial({ color: 0x0f1d12, roughness: 1 });
  inst(new THREE.CylinderGeometry(0.12, 0.2, 3, 6), trunkMat, pines, ([x, z, k, r], m) => m.compose(new THREE.Vector3(x, 1.5 * k, z), q.setFromAxisAngle(up, r), new THREE.Vector3(k, k, k)));
  for (const [y, rad, h] of [[2.6, 2.2, 3.4], [4.3, 1.7, 3.0], [5.8, 1.1, 2.4]]) {
    inst(new THREE.ConeGeometry(rad, h, 7), needleMat, pines, ([x, z, k, r], m) => m.compose(new THREE.Vector3(x, y * k, z), q.setFromAxisAngle(up, r), new THREE.Vector3(k, k, k)));
  }
  const birch = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.9 });
  inst(new THREE.CylinderGeometry(0.06, 0.14, 7, 5), birch, dead, ([x, z, k, r], m) => m.compose(new THREE.Vector3(x, 3.5 * k, z), q.setFromEuler(new THREE.Euler(0.08 * Math.sin(r), r, 0.08 * Math.cos(r))), new THREE.Vector3(k, k, k)));
  const bushes = spots.filter(s => s[4] < 20).slice(0, 80);
  inst(new THREE.IcosahedronGeometry(0.7, 0), needleMat, bushes, ([x, z, k, r], m) => m.compose(new THREE.Vector3(x + 1.6, 0.35, z - 1.2), q.setFromAxisAngle(up, r), new THREE.Vector3(k * 1.3, k * 0.7, k)));
  // a moon you can glimpse through the windows (no extra light: it would leak through every wall)
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3, 24), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
  disc.position.set(-60, 45, -50);
  disc.lookAt(28, 2, 10);
  g.add(disc);
  scene.add(g);
  return g;
}
