// Auto-rigging for the supplied static (unrigged, T-pose) Tripo meshes.
// We build a simple skeleton and assign smooth skin weights by body region so
// the characters can be animated procedurally (walk, run, crouch, grab, eat...).
import * as THREE from 'three';
import { clamp } from './util.js';

// Joint layouts in the meshes' own units (both meshes stand on y=0, face +Z,
// arms along ±X). Measured from renders of the supplied GLBs.
export const RIG_SPECS = {
  player: {
    height: 1.0,
    hipsY: 0.5, spineY: 0.6, chestY: 0.7, neckY: 0.835,
    shoulderX: 0.155, shoulderY: 0.775, armHalf: 0.075, elbowX: 0.3,
    legX: 0.075, hipJointY: 0.485, kneeY: 0.27,
    // shirt/pants recolour masks
    shirt: { yMin: 0.515, yMax: 0.86, xMax: 0.2 },
    pants: { yMin: 0.055, yMax: 0.53, xMax: 0.2 },
  },
  ajan: {
    height: 0.696,
    hipsY: 0.29, spineY: 0.37, chestY: 0.45, neckY: 0.555,
    shoulderX: 0.155, shoulderY: 0.523, armHalf: 0.07, elbowX: 0.31,
    legX: 0.095, hipJointY: 0.275, kneeY: 0.15,
  },
};

const ramp = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

function weightsFor(x, y, s) {
  const ax = Math.abs(x);
  const side = x >= 0 ? 'L' : 'R';
  // Arms (horizontal in T-pose)
  if (ax > s.shoulderX - 0.025 && y > s.shoulderY - s.armHalf - 0.01) {
    const tFore = ramp(ax, s.elbowX - 0.025, s.elbowX + 0.025);
    if (tFore > 0) return [['fore' + side, tFore], ['upper' + side, 1 - tFore]];
    const tArm = ramp(ax, s.shoulderX - 0.025, s.shoulderX + 0.03);
    return [['upper' + side, tArm], ['chest', 1 - tArm]];
  }
  // Legs
  if (y < s.hipJointY + 0.01) {
    const tShin = 1 - ramp(y, s.kneeY - 0.03, s.kneeY + 0.03);
    if (tShin > 0) return [['shin' + side, tShin], ['thigh' + side, 1 - tShin]];
    const tHip = ramp(y, s.hipJointY - 0.08, s.hipJointY + 0.01);
    return [['thigh' + side, 1 - tHip * 0.55], ['hips', tHip * 0.55]];
  }
  // Head
  if (y > s.neckY - 0.03) {
    const t = ramp(y, s.neckY - 0.03, s.neckY + 0.03);
    return [['head', t], ['chest', 1 - t]];
  }
  // Torso
  if (y < s.spineY + 0.02) {
    const t = ramp(y, s.spineY - 0.05, s.spineY + 0.02);
    return [['spine', t], ['hips', 1 - t]];
  }
  const t = ramp(y, s.chestY - 0.05, s.chestY + 0.02);
  return [['chest', t], ['spine', 1 - t]];
}

const BONE_NAMES = ['root', 'hips', 'spine', 'chest', 'head', 'upperL', 'foreL', 'upperR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR'];

/** Build a SkinnedMesh with a procedural skeleton from a static mesh geometry. */
export function autoRig(geometry, material, s) {
  geometry = geometry.clone();
  const pos = geometry.attributes.position;
  const n = pos.count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const idx = Object.fromEntries(BONE_NAMES.map((b, i) => [b, i]));
  for (let i = 0; i < n; i++) {
    const w = weightsFor(pos.getX(i), pos.getY(i), s);
    let sum = 0;
    w.forEach(([, v]) => { sum += v; });
    w.forEach(([b, v], k) => {
      skinIndex[i * 4 + k] = idx[b];
      skinWeight[i * 4 + k] = sum > 0 ? v / sum : (k === 0 ? 1 : 0);
    });
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const B = {};
  BONE_NAMES.forEach(name => { B[name] = new THREE.Bone(); B[name].name = name; });
  const place = (child, parent, p, pp) => {
    B[parent].add(B[child]);
    B[child].position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
  };
  const J = {
    root: [0, 0, 0], hips: [0, s.hipsY, 0], spine: [0, s.spineY, 0], chest: [0, s.chestY, 0], head: [0, s.neckY, 0],
    upperL: [s.shoulderX, s.shoulderY, 0], foreL: [s.elbowX, s.shoulderY, 0],
    upperR: [-s.shoulderX, s.shoulderY, 0], foreR: [-s.elbowX, s.shoulderY, 0],
    thighL: [s.legX, s.hipJointY, 0], shinL: [s.legX, s.kneeY, 0],
    thighR: [-s.legX, s.hipJointY, 0], shinR: [-s.legX, s.kneeY, 0],
  };
  const parent = { hips: 'root', spine: 'hips', chest: 'spine', head: 'chest', upperL: 'chest', foreL: 'upperL', upperR: 'chest', foreR: 'upperR', thighL: 'hips', shinL: 'thighL', thighR: 'hips', shinR: 'thighR' };
  for (const [c, p] of Object.entries(parent)) place(c, p, J[c], J[p]);

  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(B.root);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONE_NAMES.map(b => B[b]));
  mesh.bind(skeleton);
  mesh.frustumCulled = false;
  return { mesh, bones: B, joints: J, spec: s };
}

/** Fallback T-pose figure (used only if a GLB is missing) in the same units as RIG_SPECS. */
export function fallbackFigure(kind) {
  const s = RIG_SPECS[kind];
  const h = s.height;
  const parts = [];
  const box = (w, hh, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, hh, d, 2, 4, 2);
    g.translate(x, y, z);
    parts.push(g);
  };
  const thick = kind === 'ajan' ? 1.6 : 1;
  box(0.26 * thick, s.neckY - s.hipJointY + 0.02, 0.14 * thick, 0, (s.neckY + s.hipJointY) / 2, 0); // torso
  box(0.13 * thick, h - s.neckY, 0.13 * thick, 0, (h + s.neckY) / 2, 0); // head
  for (const sx of [1, -1]) {
    box(0.36 * h, 0.07 * thick, 0.07 * thick, sx * (s.shoulderX + 0.18 * h - 0.02), s.shoulderY, 0); // arm
    box(0.09 * thick, s.hipJointY, 0.1 * thick, sx * s.legX, s.hipJointY / 2, 0); // leg
  }
  const merged = mergeGeoms(parts);
  return merged;
}

function mergeGeoms(geoms) {
  const ng = geoms.map(g => g.toNonIndexed());
  let total = 0;
  ng.forEach(g => { total += g.attributes.position.count; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  ng.forEach(g => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
