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
  mat.customProgramCacheKey = () => 'ajan-avatar-' + (spec.shirt ? 'p' : 'a') + spec.height;
}

/**
 * Restrained secondary motion (soft-tissue follow-through) for a dancing
 * character: small spring-driven offsets applied after skinning to two soft
 * regions of the rest mesh (upper chest front, seat at the back). The offsets are
 * at most ~2.7 cm (clamped in club.js), so the mesh and clothing never tear or warp.
 * club.js drives uJigC / uJigB (mesh-local units) from the body's motion.
 */
function addSecondaryMotion(mat, uniforms) {
  uniforms.uJigC = { value: new THREE.Vector3() };
  uniforms.uJigB = { value: new THREE.Vector3() };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => {
    prev(sh);
    sh.uniforms.uJigC = uniforms.uJigC;
    sh.uniforms.uJigB = uniforms.uJigB;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uJigC; uniform vec3 uJigB;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
{
  vec3 p = position;
  float side = 1.0 - smoothstep(0.075, 0.115, abs(p.x));
  float mC = smoothstep(0.635, 0.665, p.y) * (1.0 - smoothstep(0.715, 0.745, p.y)) * smoothstep(0.04, 0.08, p.z) * side;
  float mB = smoothstep(0.415, 0.445, p.y) * (1.0 - smoothstep(0.535, 0.565, p.y)) * smoothstep(-0.02, -0.06, p.z) * side;
  transformed += uJigC * mC + uJigB * mB;
}`);
  };
  const key = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => key() + '-sm';
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
  constructor(kind, gltf, { height, shirt, pants, jiggle = false, spec: specKey } = {}) {
    this.kind = kind;
    const spec = RIG_SPECS[specKey || kind];
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
    if (jiggle) addSecondaryMotion(material, this.uniforms);
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
    // NPCs (club.js) drive their own bones through _set()
    if (this.custom) { this.custom(dt, this.t); return; }
    // Human-shaped monsters (Guy) walk and look around with the players' gait; the
    // grab / sleep / stun / dance poses still come from the monster set.
    if (this.kind === 'ajan' && this.spec.human && (!st.mode || st.mode === 'move' || st.mode === 'search')) {
      this._animPlayer(dt, { speed: st.speed || 0, crouch: 0, run: (st.speed || 0) > 3, mode: 'normal', interactT: 9, turn: 0, flash: false, pitch: st.mode === 'search' ? Math.sin(this.t * 1.6) * 0.15 : 0 });
      if (st.mode === 'search') this.bones.head.rotation.y = Math.sin(this.t * 1.6) * 0.7;
    } else if (this.kind === 'ajan') this._animAjan(dt, st);
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

    if (st.mode !== 'prone') this.body.rotation.x = 0;
    if (st.mode === 'sit' || st.mode === 'prone') {
      // seen by others while hiding/sitting: on a chair or car seat, or flat on the floor under furniture
      const sit = st.mode === 'sit';
      this._set('thighL', sit ? -1.5 : 0, 0, 0.05, k); this._set('thighR', sit ? -1.5 : 0, 0, -0.05, k);
      this._set('shinL', sit ? 1.5 : 0.1, 0, 0, k); this._set('shinR', sit ? 1.5 : 0.1, 0, 0, k);
      this._set('upperL', sit ? -0.5 : -2.6, 0, sit ? -1.1 : -0.2, k); this._set('upperR', sit ? -0.5 : -2.6, 0, sit ? 1.1 : 0.2, k);
      this._set('foreL', 0, sit ? -0.6 : 0, 0, k); this._set('foreR', 0, sit ? 0.6 : 0, 0, k);
      for (const n of ['hips', 'spine', 'chest']) this._set(n, 0, 0, 0, k);
      this._set('head', sit ? 0 : -0.9, 0, 0, k);
      this.body.rotation.x = sit ? 0 : Math.PI / 2;
      this.body.position.y = damp(this.body.position.y, sit ? -0.42 : 0.14, 10, dt);
      return;
    }
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
    const DOWN = this.spec.armDown ?? 1.12;
    const mode = st.mode || 'move';
    const mt = st.modeT || 0;

    if (this.butcherTools) for (const tool of this.butcherTools) tool.visible = mode === 'butcher';
    if (mode === 'butcher') {
      if (!this.butcherTools) {
        const steel = new THREE.MeshStandardMaterial({ color: 0x72756c, metalness: 0.45, roughness: 0.7 });
        const meat = new THREE.MeshStandardMaterial({ color: 0x54251e, roughness: 0.7 });
        const cleaver = new THREE.Group(); cleaver.name = 'butcher-cleaver';
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.025), steel); blade.position.set(0, -0.17, 0);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.15, 0.055), meat);
        cleaver.add(blade, handle); cleaver.scale.setScalar(1 / this.scale); cleaver.position.x = -0.13;
        const morsel = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.18, 3, 7), meat); morsel.name = 'butcher-food';
        morsel.scale.setScalar(1 / this.scale); morsel.position.x = 0.13;
        this.bones.foreR.add(cleaver); this.bones.foreL.add(morsel); this.butcherTools = [cleaver, morsel];
      }
      const eating = mt % 10 >= 6, chop = Math.max(0, Math.sin(mt * 5));
      this._set('hips', 0, 0, 0, k);
      this._set('thighL', -0.05, 0, 0.06, k); this._set('thighR', -0.05, 0, -0.06, k);
      this._set('shinL', 0.05, 0, 0, k); this._set('shinR', 0.05, 0, 0, k);
      this._set('spine', 0.2, 0, 0, k); this._set('chest', 0.18, 0, 0, k);
      this._set('head', eating ? 0.08 + Math.sin(mt * 12) * 0.06 : 0.45, 0, 0, k);
      this._set('upperR', -0.9, 0.2, eating ? 0.65 : 0.3 + chop * 1.1, k);
      this._set('foreR', 0, eating ? 0.5 : 1.1, 0, k);
      this._set('upperL', eating ? -1.5 : -0.75, -0.2, -0.6, k);
      this._set('foreL', 0, eating ? -1.6 : -0.8, 0, k);
      this.body.position.y = damp(this.body.position.y, -0.08, 6, dt);
      this.body.scale.set(1, 1, 1);
      return;
    }
    if (mode === 'dance') {
      // dance2.fbx (retargeted) when loaded; the procedural routine otherwise
      if (this.dancePlayer) { this.body.position.y = 0; this.dancePlayer.seek(mt); this.dancePlayer.apply(); }
      else this._danceAjan(dt, t, mt);
      return;
    }
    if (mode === 'sleep' || mode === 'sit' || mode === 'stun' || mode === 'floorsleep') {
      // Seated: thighs forward, hips lowered onto the seat. Asleep he leans back
      // against the headboard with legs out and breathes slowly.
      const kk = 1 - Math.exp(-4 * dt);
      const sleep = mode === 'sleep' || mode === 'stun' || mode === 'floorsleep';
      const stun = mode === 'stun';
      const onFloor = mode === 'floorsleep';
      const br = Math.sin(t * (sleep ? 1.15 : 1.6));
      this._set('thighL', -1.5, 0, 0.12, kk);
      this._set('thighR', -1.5, 0, -0.12, kk);
      this._set('shinL', sleep ? 0.05 : 1.45, 0, 0, kk);
      this._set('shinR', sleep ? 0.05 : 1.45, 0, 0, kk);
      this._set('hips', sleep ? -0.15 : 0, 0, 0, kk);
      this._set('spine', (sleep ? -0.32 : 0.05) + br * 0.025, 0, 0, kk);
      this._set('chest', (sleep ? -0.18 : 0.05) + br * 0.035, 0, 0, kk);
      this._set('head', sleep ? 0.35 + br * 0.03 : -0.05, sleep ? 0.35 : Math.sin(t * 0.3) * 0.1, sleep ? 0.2 : 0, kk);
      this._set('upperL', -0.55, -0.15, -0.85 - br * 0.03, kk);
      this._set('upperR', -0.55, 0.15, 0.85 + br * 0.03, kk);
      this._set('foreL', 0, -1.15, 0, kk);
      this._set('foreR', 0, 1.15, 0, kk);
      if (stun) { this._set('spine', 0.45, 0.2, 0.15, kk); this._set('head', 0.7, -0.4, 0.3, kk); }
      if (onFloor) { this._set('spine', -0.5 + br * 0.03, 0.1, 0.1, kk); this._set('head', 0.55 + br * 0.03, 0.4, 0.35, kk); }
      // on the floor he sits right down on it and slumps back (slowly, not a drop)
      this.body.position.y = damp(this.body.position.y, (stun || onFloor ? -0.95 : -0.42) + (sleep ? br * 0.012 : 0), stun ? 9 : onFloor ? 2.5 : 6, dt);
      this.body.scale.set(1 + br * (sleep ? 0.012 : 0.005), 1, 1 + br * (sleep ? 0.018 : 0.006));
      return;
    }
    this.body.scale.set(1, 1, 1);

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
    } else if (mode === 'inspect') {
      // Leans right in to the closet/bed with his head cocked, grinning.
      const r = clamp(mt / 0.8, 0, 1);
      this._set('upperL', -0.6 * r, 0, -DOWN + 0.2, k);
      this._set('upperR', -0.6 * r, 0, DOWN - 0.2, k);
      this._set('foreL', 0, -0.6, 0, k);
      this._set('foreR', 0, 0.6, 0, k);
      lean = 0.15 + 0.4 * r;
      headX = 0.15 * r;
      this._set('head', headX, Math.sin(t * 0.7) * 0.15, 0.35 * r, k);
      this._set('spine', lean * 0.5, 0, 0, k);
      this._set('chest', lean * 0.5, 0, 0, k);
      this.body.position.y = damp(this.body.position.y, -0.12 * r, 6, dt);
      return;
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

/** AJAN's pole dance: a big, goofy gorilla groove. Distinct from Yasmin's. */
Avatar.prototype._danceAjan = function (dt, t, mt) {
  const k = 1 - Math.exp(-7 * dt);
  const beat = t * Math.PI * 2 * 1.9;
  const bounce = Math.abs(Math.sin(beat));
  // three alternating routines, each ~6 s: raise-the-roof, chest drum, the sprinkler
  const routine = Math.floor(mt / 6) % 3;
  this._set('thighL', -0.25 - bounce * 0.25, 0, 0.35 + Math.sin(beat) * 0.12, k);
  this._set('thighR', -0.25 - bounce * 0.25, 0, -0.35 + Math.sin(beat) * 0.12, k);
  this._set('shinL', 0.45 + bounce * 0.4, 0, 0, k);
  this._set('shinR', 0.45 + bounce * 0.4, 0, 0, k);
  this._set('hips', 0, Math.sin(beat / 2) * 0.35, Math.sin(beat) * 0.16, k);
  this._set('spine', 0.08, -Math.sin(beat / 2) * 0.2, -Math.sin(beat) * 0.08, k);
  this._set('chest', -0.05 + bounce * 0.05, -Math.sin(beat / 2) * 0.15, 0, k);
  this._set('head', -0.2 + Math.sin(beat * 2) * 0.1, Math.sin(beat / 2) * 0.3, Math.sin(beat) * 0.12, k);
  if (routine === 0) {
    const up = 0.95 + Math.sin(beat) * 0.35;
    this._set('upperL', 0, -0.2, up, k);
    this._set('upperR', 0, 0.2, -up, k);
    this._set('foreL', 0, -0.9 + Math.sin(beat) * 0.4, 0, k);
    this._set('foreR', 0, 0.9 - Math.sin(beat) * 0.4, 0, k);
  } else if (routine === 1) {
    const hit = Math.sin(beat * 2) > 0;
    this._set('upperL', -0.2, -1.0, -0.4, k * 1.6);
    this._set('upperR', -0.2, 1.0, 0.4, k * 1.6);
    this._set('foreL', 0, hit ? -1.7 : -1.2, 0, k * 2);
    this._set('foreR', 0, hit ? 1.2 : 1.7, 0, k * 2);
    this._set('chest', -0.15, 0, 0, k);
    this._set('head', -0.4, Math.sin(beat) * 0.2, 0, k);
  } else {
    // one hand on the pole, the other arm sprinkling
    this._set('upperR', -0.3, 0.7, 0.1, k);
    this._set('foreR', 0, 0.6, 0, k);
    const sw = Math.sin(beat / 2);
    this._set('upperL', -0.1, -0.3 + sw * 0.6, 0.15, k);
    this._set('foreL', 0, -1.5, 0, k);
  }
  this.body.scale.set(1, 1, 1);
  this.body.position.y = damp(this.body.position.y, -0.12 + bounce * 0.07, 12, dt);
};

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
