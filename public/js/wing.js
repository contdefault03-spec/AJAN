// The east wing's own geometry that the generic room/wall builder doesn't cover:
// landings and ceilings of the back stairs, the roof, the spiral stair up to the
// TV room (steps, centre post, rail) and the TV room's ceiling.
import * as THREE from 'three';
import { RAMPS, spiralHeight, LEVELS } from './layout.js';

export function buildWing(h) {
  const G = h.geo;
  const GY = LEVELS[1].y, UY = LEVELS[2].y, AY = LEVELS[3].y;
  // back stairs: bottom and top landings, ceiling over the stairwell
  G.plane('floorWoodDark', 46, 7, 49, 7.6, GY, true);
  G.plane('floorWood', 46, 13, 49, 14, UY, true);
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
}
