// Animated characters built on the auto-rigged GLB meshes. Used for remote
// players, the local player's body (seen by security cameras / death cam) and Ajan.
import * as THREE from 'three';
import { autoRig, fallbackFigure, RIG_SPECS } from './rig.js';
import { damp, clamp } from './util.js';

const NOISE_GLSL = `
float h3(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

function prepareMaterial(mat, spec, uniforms) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLocal;
uniform vec3 uShirt; uniform vec3 uPants; uniform float uRecolor; uniform float uDissolve;
uniform vec3 uShirtBox; uniform vec3 uPantsBox; uniform float uHeight;
${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float dEdge = 0.0;
if (uDissolve > 0.0) {
  float v = vnoise(vLocal * 34.0) * 0.55 + (vLocal.y / uHeight) * 0.45;
  float th = 1.05 - uDissolve * 1.2;
  if (v > th) discard;
  dEdge = smoothstep(th - 0.07, th, v);
}
if (uRecolor > 0.5) {
  vec3 c = diffuseColor.rgb;
  float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b));
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float grey = 1.0 - smoothstep(0.05, 0.12, mx - mn);
  float ax = abs(vLocal.x);
  float shirtM = step(uShirtBox.x, vLocal.y) * step(vLocal.y, uShirtBox.y) * step(ax, uShirtBox.z);
  float pantsM = step(uPantsBox.x, vLocal.y) * step(vLocal.y, uPantsBox.y) * step(ax, uPantsBox.z) * (1.0 - shirtM);
  float k = grey * step(0.08, lum);
  float shade = clamp(lum / 0.55, 0.25, 1.35);
  diffuseColor.rgb = mix(c, uShirt * shade, shirtM * k);
  diffuseColor.rgb = mix(diffuseColor.rgb, uPants * shade, pantsM * k);
}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
gl_FragColor.rgb += dEdge * vec3(1.6, 0.35, 0.08);`);
  };
  mat.customProgramCacheKey = () => 'ajan-avatar-' + (spec.shirt ? 'p' : 'a');
}

function findMesh(root) {
  let found = null;
  root?.traverse(o => { if (!found && o.isMesh) found = o; });
  return found;
}

export class Avatar {
  /**
   * kind: 'player' | 'ajan'
   * gltf: loaded GLTF (or null → fallback figure)
   */
  constructor(kind, gltf, { height, shirt, pants } = {}) {
    this.kind = kind;
    const spec = RIG_SPECS[kind];
    this.spec = spec;
    this.height = height || (kind === 'ajan' ? 2.25 : 1.75);
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

    const src = findMesh(gltf?.scene);
    let geometry, material;
    if (src) {
      geometry = src.geometry;
      material = src.material.clone();
      material.metalness = 0;
      material.roughness = kind === 'ajan' ? 0.75 : 0.85;
    } else {
      geometry = fallbackFigure(kind);
      material = new THREE.MeshStandardMaterial({ color: kind === 'ajan' ? 0x1b1716 : 0xbdb6aa, roughness: 0.9 });
    }
    this.uniforms = {
      uShirt: { value: new THREE.Color(shirt || '#d8d8d8') },
      uPants: { value: new THREE.Color(pants || '#55555e') },
      uRecolor: { value: kind === 'player' ? 1 : 0 },
      uDissolve: { value: 0 },
      uShirtBox: { value: new THREE.Vector3(spec.shirt?.yMin ?? 0, spec.shirt?.yMax ?? 0, spec.shirt?.xMax ?? 0) },
      uPantsBox: { value: new THREE.Vector3(spec.pants?.yMin ?? 0, spec.pants?.yMax ?? 0, spec.pants?.xMax ?? 0) },
      uHeight: { value: spec.height },
    };
    prepareMaterial(material, spec, this.uniforms);
    this.material = material;
    this.rig = autoRig(geometry, material, spec);
    this.mesh = this.rig.mesh;
    this.mesh.castShadow = true;
    this.scale = this.height / spec.height;
    this.mesh.scale.setScalar(this.scale);
    this.body.add(this.mesh);
    this.bones = this.rig.bones;

    this.phase = Math.random() * 10;
    this.t = Math.random() * 10;
    this.cur = {};
    this.state = { speed: 0, crouch: 0, run: false, mode: 'normal', interactT: 9, turn: 0, flash: false, pitch: 0 };
    this.crouchSm = 0;
    this.speedSm = 0;
    this._v = new THREE.Vector3();
  }

  setColors(shirt, pants) {
    this.uniforms.uShirt.value.set(shirt);
    this.uniforms.uPants.value.set(pants);
  }
  setDissolve(v) { this.uniforms.uDissolve.value = v; }
  setLayer(layer) { this.group.traverse(o => o.layers.set(layer)); }

  /** World position of the top of the head (for name labels). */
  headTop(out = new THREE.Vector3()) {
    out.set(0, (this.spec.height - this.spec.neckY) + 0.03, 0);
    return this.bones.head.localToWorld(out);
  }
  /** Approximate world position of a hand ('L' or 'R'). */
  hand(side, out = new THREE.Vector3()) {
    out.set((side === 'L' ? 1 : -1) * 0.13, 0, 0);
    return this.bones['fore' + side].localToWorld(out);
  }
  mouth(out = new THREE.Vector3()) {
    out.set(0, 0.06, 0.08);
    return this.bones.head.localToWorld(out);
  }

  _set(name, x, y, z, k) {
    const c = this.cur[name] || (this.cur[name] = [0, 0, 0]);
    c[0] += (x - c[0]) * k; c[1] += (y - c[1]) * k; c[2] += (z - c[2]) * k;
    this.bones[name].rotation.set(c[0], c[1], c[2]);
  }

  update(dt, st = this.state) {
    this.t += dt;
    if (this.kind === 'ajan') this._animAjan(dt, st);
    else this._animPlayer(dt, st);
  }

  _animPlayer(dt, st) {
    const k = 1 - Math.exp(-14 * dt);
    const t = this.t;
    this.speedSm = damp(this.speedSm, st.speed || 0, 10, dt);
    this.crouchSm = damp(this.crouchSm, st.crouch || 0, 8, dt);
    const sp = this.speedSm;
    const cr = this.crouchSm;
    const turning = Math.abs(st.turn || 0) > 0.8 && sp < 0.3;
    const stepRate = sp > 0.1 ? sp * 2.6 / (1 + cr * 0.3) : turning ? 7 : 0;
    this.phase += stepRate * dt;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const runK = clamp((sp - 2.8) / 2, 0, 1);
    const walkK = clamp(sp / 1.2, 0, 1) * (turning ? 0.35 : 1) + (turning ? 0.35 : 0);
    const legA = (0.45 + runK * 0.35) * walkK * (1 - cr * 0.4);
    const armA = (0.35 + runK * 0.45) * walkK;
    const DOWN = 1.3;
    const breath = Math.sin(t * 1.7) * 0.025;
    const P = this.spec;

    if (st.mode === 'grabbed') {
      const f = t * 13;
      this._set('upperL', Math.sin(f) * 0.5, -0.3, -0.2 + Math.sin(f * 1.3) * 0.5, k);
      this._set('upperR', Math.cos(f) * 0.5, 0.3, 0.2 + Math.cos(f * 1.1) * 0.5, k);
      this._set('foreL', 0, -0.8 + Math.sin(f * 0.9) * 0.4, 0, k);
      this._set('foreR', 0, 0.8 + Math.cos(f) * 0.4, 0, k);
      this._set('thighL', -0.4 + Math.sin(f * 0.8) * 0.5, 0, 0.05, k);
      this._set('thighR', -0.4 + Math.cos(f * 0.8) * 0.5, 0, -0.05, k);
      this._set('shinL', 0.6 + Math.sin(f) * 0.3, 0, 0, k);
      this._set('shinR', 0.6 + Math.cos(f) * 0.3, 0, 0, k);
      this._set('chest', -0.2, Math.sin(f * 0.5) * 0.2, 0, k);
      this._set('spine', -0.1, 0, 0, k);
      this._set('head', -0.4 + Math.sin(f * 0.7) * 0.2, Math.sin(f * 0.6) * 0.4, 0, k);
      this._set('hips', 0, 0, 0, k);
      this.body.position.y = damp(this.body.position.y, 0, 10, dt);
      return;
    }

    // Legs
    const kneeL = Math.max(0, Math.sin(this.phase + 1.4)) * (0.6 + runK * 0.6) * walkK;
    const kneeR = Math.max(0, Math.sin(this.phase + 1.4 + Math.PI)) * (0.6 + runK * 0.6) * walkK;
    this._set('thighL', -s * legA - cr * 1.25, 0, 0.02, k);
    this._set('thighR', s * legA - cr * 1.25, 0, -0.02, k);
    this._set('shinL', kneeL + cr * 2.1, 0, 0, k);
    this._set('shinR', kneeR + cr * 2.1, 0, 0, k);
    // Torso
    this._set('hips', 0, Math.sin(this.phase) * 0.08 * walkK, 0, k);
    this._set('spine', breath + cr * 0.35 + runK * 0.12, -Math.sin(this.phase) * 0.05 * walkK, 0, k);
    this._set('chest', breath * 0.6 + runK * 0.1, -Math.sin(this.phase) * 0.06 * walkK, 0, k);
    this._set('head', clamp(-(st.pitch || 0) * 0.7, -0.6, 0.7) - cr * 0.2, 0, 0, k);

    // Arms
    const reach = clamp(1 - (st.interactT ?? 9) / 0.7, 0, 1);
    const reachK = Math.sin(reach * Math.PI);
    if (st.flash) {
      this._set('upperL', -0.15, -0.55, -0.95, k);
      this._set('foreL', 0, -0.9, 0, k);
    } else {
      this._set('upperL', s * armA + cr * -0.3, 0, -DOWN + 0.05 + breath, k);
      this._set('foreL', 0, -0.25 - runK * 0.9, 0, k);
    }
    this._set('upperR', -s * armA * (1 - reachK) + cr * -0.3 * (1 - reachK), 1.25 * reachK, (DOWN - 0.05 - breath) * (1 - reachK) + 0.05 * reachK, k);
    this._set('foreR', 0, 0.25 + runK * 0.9 - reachK * 0.2, 0, k);

    const bob = Math.abs(Math.sin(this.phase)) * 0.035 * walkK * (1 + runK);
    this.body.position.y = damp(this.body.position.y, -cr * (P.hipsY * this.scale) * 0.45 + bob, 14, dt);
    this.body.position.z = damp(this.body.position.z, -cr * 0.12, 10, dt);
  }

  _animAjan(dt, st) {
    const k = 1 - Math.exp(-10 * dt);
    const t = this.t;
    this.speedSm = damp(this.speedSm, st.speed || 0, 6, dt);
    const sp = this.speedSm;
    this.phase += sp * 1.7 * dt;
    const s = Math.sin(this.phase);
    const runK = clamp((sp - 2.2) / 2, 0, 1);
    const walkK = clamp(sp / 1, 0, 1);
    const breath = Math.sin(t * 1.3) * 0.04;
    const DOWN = 1.12;
    const mode = st.mode || 'move';
    const mt = st.modeT || 0;

    // Legs: heavy waddle
    const legA = (0.32 + runK * 0.35) * walkK;
    this._set('thighL', -s * legA - 0.12, 0, 0.06, k);
    this._set('thighR', s * legA - 0.12, 0, -0.06, k);
    this._set('shinL', Math.max(0, Math.sin(this.phase + 1.4)) * 0.6 * walkK + 0.15, 0, 0, k);
    this._set('shinR', Math.max(0, Math.sin(this.phase + 1.4 + Math.PI)) * 0.6 * walkK + 0.15, 0, 0, k);
    this._set('hips', 0, Math.sin(this.phase) * 0.1 * walkK, Math.sin(this.phase) * 0.06 * walkK, k);

    let lean = 0.12 + runK * 0.3 + breath;
    let headX = -0.1, headY = 0;
    if (mode === 'search') headY = Math.sin(t * 1.6) * 0.7;
    if (st.headYaw !== undefined) headY = st.headYaw;

    if (mode === 'grab') {
      const r = clamp(mt / 0.5, 0, 1);
      this._set('upperL', -0.2, -1.25 * r, -DOWN * (1 - r) - 0.15, k * 2);
      this._set('upperR', -0.2, 1.25 * r, DOWN * (1 - r) + 0.15, k * 2);
      this._set('foreL', 0, -0.5 * r, 0, k * 2);
      this._set('foreR', 0, 0.5 * r, 0, k * 2);
      lean = 0.35;
      headX = -0.15;
    } else if (mode === 'lift' || mode === 'eat') {
      // Right hand brings the victim up to the mouth; left hand steadies.
      const r = mode === 'lift' ? clamp(mt / 1.0, 0, 1) : 1;
      const chewK = mode === 'eat' ? 1 : 0;
      this._set('upperR', -0.15, 1.15, 0.15 - 0.75 * r, k * 2);
      this._set('foreR', 0, 0.35 + 1.25 * r, 0, k * 2);
      this._set('upperL', -0.1, -1.0, -0.3 + Math.sin(t * 6) * 0.06 * chewK, k * 2);
      this._set('foreL', 0, -1.1, 0, k * 2);
      lean = 0.18 + 0.05 * chewK * Math.sin(t * 7);
      headX = -0.25 * r + chewK * (0.25 + Math.sin(t * 9) * 0.2);
    } else if (mode === 'roar') {
      this._set('upperL', 0, -0.4, -0.2 + Math.sin(t * 20) * 0.05, k);
      this._set('upperR', 0, 0.4, 0.2 + Math.sin(t * 20) * 0.05, k);
      this._set('foreL', 0, -0.9, 0, k);
      this._set('foreR', 0, 0.9, 0, k);
      lean = -0.1;
      headX = -0.45;
    } else {
      const armA = (0.3 + runK * 0.6) * walkK;
      this._set('upperL', s * armA - 0.35 - runK * 0.3, 0, -DOWN + breath, k);
      this._set('upperR', -s * armA - 0.35 - runK * 0.3, 0, DOWN - breath, k);
      this._set('foreL', 0, -0.3 - runK * 0.4, 0, k);
      this._set('foreR', 0, 0.3 + runK * 0.4, 0, k);
    }
    this._set('spine', lean * 0.5, -s * 0.05 * walkK, 0, k);
    this._set('chest', lean * 0.5, -s * 0.07 * walkK, 0, k);
    this._set('head', headX, headY, 0, k);
    const bob = Math.abs(Math.sin(this.phase)) * 0.05 * walkK;
    this.body.position.y = damp(this.body.position.y, bob, 10, dt);
  }
}

/** Ember/ash particles used while a character disintegrates. */
export class DissolveFX {
  constructor(scene) {
    this.max = 400;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.col = new Float32Array(this.max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.035, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.cursor = 0;
    scene.add(this.points);
  }
  emit(center, radius, height, count) {
    for (let i = 0; i < count; i++) {
      const j = this.cursor++ % this.max;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.pos[j * 3] = center.x + Math.cos(a) * r;
      this.pos[j * 3 + 1] = center.y + Math.random() * height;
      this.pos[j * 3 + 2] = center.z + Math.sin(a) * r;
      this.vel[j * 3] = (Math.random() - 0.5) * 0.6;
      this.vel[j * 3 + 1] = 0.2 + Math.random() * 0.8;
      this.vel[j * 3 + 2] = (Math.random() - 0.5) * 0.6;
      this.life[j] = 1 + Math.random() * 0.8;
    }
  }
  update(dt) {
    for (let j = 0; j < this.max; j++) {
      if (this.life[j] <= 0) { this.col[j * 3] = this.col[j * 3 + 1] = this.col[j * 3 + 2] = 0; continue; }
      this.life[j] -= dt;
      this.pos[j * 3] += this.vel[j * 3] * dt;
      this.pos[j * 3 + 1] += this.vel[j * 3 + 1] * dt;
      this.pos[j * 3 + 2] += this.vel[j * 3 + 2] * dt;
      const l = Math.max(0, Math.min(1, this.life[j]));
      this.col[j * 3] = 1.0 * l;
      this.col[j * 3 + 1] = 0.28 * l * l;
      this.col[j * 3 + 2] = 0.05 * l;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
