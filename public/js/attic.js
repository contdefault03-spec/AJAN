// The attic is sealed off. Its staircase has been taken apart: the lower and
// upper sections lie side by side in the basement. Carry them up to the attic
// stairwell (upstairs hall, behind the attic door), fit the lower section,
// then the upper one on top of it. A locked trapdoor closes the top of the
// stairs: the attic key opens it. Only then can anyone climb up (or ride the
// elevator to the attic). Host-authoritative; clients animate the events.
import * as THREE from 'three';
import { audio } from './audio.js';
import { RAMPS, rampHeight, LEVELS } from './layout.js';

const U = LEVELS[2].y, AY = LEVELS[3].y;
export const STAIR_R3 = RAMPS.find(r => r.id === 'R3');
const SPLIT = 16.0;                 // where the two sections meet (z)
const HATCH = { x0: 20.15, x1: 23.85, z0: 16.55, z1: 19.45 };

/** Steps for one section of the attic staircase (world space), as a group. */
function buildSection(M, z0, z1) {
  const r = STAIR_R3;
  const g = new THREE.Group();
  const steps = Math.round((z1 - z0) / 0.58);
  const wood = M.floorWoodDark, side = M.woodDark;
  for (let i = 0; i < steps; i++) {
    const a = z0 + (z1 - z0) * (i / steps), b = z0 + (z1 - z0) * ((i + 1) / steps);
    const top = rampHeight(r, r.x0, (a + b) / 2) + 0.04;
    const tread = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.05, b - a + 0.02), wood);
    tread.position.set((r.x0 + r.x1) / 2, top - 0.025, (a + b) / 2);
    const riser = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.29, 0.03), side);
    riser.position.set((r.x0 + r.x1) / 2, top - 0.17, a);
    g.add(tread, riser);
  }
  // stringers along both sides
  const y0 = rampHeight(r, r.x0, z0), y1 = rampHeight(r, r.x0, z1);
  const len = Math.hypot(z1 - z0, y1 - y0);
  for (const x of [r.x0 + 0.04, r.x1 - 0.04]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, len), side);
    s.position.set(x, (y0 + y1) / 2 - 0.08, (z0 + z1) / 2);
    s.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
    g.add(s);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Item mesh for a loose staircase section lying on the floor (≈1.6 m long). */
export function makeStairPieceMesh(M, upper) {
  const g = new THREE.Group();
  const n = 5, run = 0.3, rise = 0.16;
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(run + 0.02, 0.04, 0.82), M.floorWoodDark);
    t.position.set(-0.75 + i * run + run / 2, 0.14 + i * rise, 0);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, rise, 0.82), M.woodDark);
    r.position.set(-0.75 + i * run, 0.07 + i * rise, 0);
    g.add(t, r);
  }
  for (const z of [-0.4, 0.4]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.07, 0.06), M.woodDark);
    s.position.set(0.05, 0.12 + n * rise / 2, z);
    s.rotation.z = Math.atan2(n * rise, n * run);
    g.add(s);
  }
  // a painted number so the two sections are told apart: I lower, II upper
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const x = cv.getContext('2d'); x.fillStyle = '#d8d0b8'; x.font = 'bold 54px serif'; x.textAlign = 'center'; x.fillText(upper ? 'II' : 'I', 64, 52);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
  label.position.set(-0.6, 0.2, 0.425);
  g.add(label);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class AtticPuzzle {
  constructor(game) {
    this.game = game;
    this.house = game.house;
    this.placed = { lower: false, upper: false };
    this.unlocked = false;
    this.open = false;
    STAIR_R3.disabled = true; // not climbable until both sections are in
    this.anims = [];
    this.build();
  }

  get assembled() { return this.placed.lower && this.placed.upper; }
  /** The attic can be reached (stairs + trapdoor, and the elevator's top stop). */
  get accessible() { return this.assembled && this.open; }

  build() {
    const H = this.house, M = H.M;
    this.sections = {
      lower: buildSection(M, STAIR_R3.a, SPLIT),
      upper: buildSection(M, SPLIT, STAIR_R3.b),
    };
    for (const g of Object.values(this.sections)) { g.visible = false; H.group.add(g); }
    // brackets and chalk marks show where the staircase goes
    const brk = M.metal;
    for (const x of [20.12, 23.88]) for (const z of [12.6, 16.0, 19.4]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.18), brk);
      b.position.set(x, rampHeight(STAIR_R3, x, z) - 0.05, z);
      H.group.add(b);
    }
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d'); c.strokeStyle = 'rgba(230,225,210,0.8)'; c.lineWidth = 6; c.setLineDash([16, 12]);
    c.strokeRect(10, 10, 236, 108); c.fillStyle = 'rgba(230,225,210,0.8)'; c.font = 'bold 30px monospace'; c.textAlign = 'center'; c.fillText('STAIRS  I  +  II', 128, 76);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(22, U + 0.012, 12.15);
    H.group.add(mark);
    this.mark = mark;
    // until the stairs are in, a barrier keeps people out of the empty stairwell
    this.gate = H.collider(20.0, 12.5, 24.0, 12.75, U, U + 2.3, { playerOnly: true });
    const tape = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0xc8a010, emissive: 0x302000 }));
    tape.position.set(22, U + 0.95, 12.62);
    H.group.add(tape);
    this.tape = tape;
    // interaction target: the stairwell opening
    const pick = new THREE.Mesh(new THREE.BoxGeometry(3.7, 1.2, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(22, U + 0.6, 12.7);
    H.group.add(pick);
    H.register('stairframe', 'stairframe', [pick], new THREE.Vector3(22, U + 0.6, 12.7), { attic: this });
    // the trapdoor, hinged on its top (z) edge, flush with the attic floor
    const hatch = new THREE.Group();
    hatch.position.set((HATCH.x0 + HATCH.x1) / 2, AY - 0.03, HATCH.z1);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(HATCH.x1 - HATCH.x0, 0.06, HATCH.z1 - HATCH.z0), M.woodDark);
    panel.position.z = -(HATCH.z1 - HATCH.z0) / 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.16), M.brass);
    plate.position.set(0, -0.036, -(HATCH.z1 - HATCH.z0) + 0.25);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 14), M.metal);
    ring.rotation.x = Math.PI / 2; ring.position.set(0, -0.05, -(HATCH.z1 - HATCH.z0) + 0.4);
    hatch.add(panel, plate, ring);
    panel.castShadow = true;
    H.group.add(hatch);
    this.hatch = hatch;
    this.hatchAngle = 0;
    this.hatchCol = H.collider(HATCH.x0 - 0.1, HATCH.z0 - 0.15, HATCH.x1 + 0.1, HATCH.z1 + 0.15, AY - 0.12, AY + 0.05);
    H.register('trapdoor', 'trapdoor', [panel, plate, ring], new THREE.Vector3(22, AY - 0.1, 17.8), { attic: this });
    hatch.updateMatrixWorld(true);
    pick.updateMatrixWorld(true);
  }

  /** Text for the interaction prompt at the stairwell. */
  framePrompt() {
    const G = this.game, me = G.localId;
    if (this.assembled) return '';
    const hasL = G.playerHas(me, 'stair_lower'), hasU = G.playerHas(me, 'stair_upper');
    if (!this.placed.lower) return hasL ? 'E — FIT THE LOWER STAIR SECTION (I)' : `ATTIC STAIRS  <span class="dim">— missing: section I${hasU ? ' (fit I first)' : ''}, section II</span>`;
    return hasU ? 'E — FIT THE UPPER STAIR SECTION (II)' : 'ATTIC STAIRS  <span class="dim">— missing: section II</span>';
  }

  hatchPrompt() {
    if (this.open) return '';
    if (!this.unlocked) return this.game.playerHas(this.game.localId, 'attic_key') ? 'E — UNLOCK THE TRAPDOOR  <span class="dim">[ATTIC KEY]</span>' : 'TRAPDOOR  <span class="dim">[LOCKED — ATTIC KEY]</span>';
    return 'E — OPEN THE TRAPDOOR';
  }

  // ---------------------------------------------------------- host
  hostPlace(pid) {
    const G = this.game;
    if (!this.placed.lower) {
      if (!G.playerHas(pid, 'stair_lower')) { G.broadcast({ k: 'msg', text: G.playerHas(pid, 'stair_upper') ? 'That\'s the upper section (II). The lower one (I) has to go in first.' : 'The attic staircase is missing. Both sections are lying in the basement.' }, pid); return; }
      G.broadcast({ k: 'stairs', part: 'lower', by: pid });
    } else if (!this.placed.upper) {
      if (!G.playerHas(pid, 'stair_upper')) { G.broadcast({ k: 'msg', text: 'Now the upper section (II).' }, pid); return; }
      G.broadcast({ k: 'stairs', part: 'upper', by: pid });
    }
    G.hostNoise(new THREE.Vector3(22, U, 13), 10, 'drawer');
  }

  hostHatch(pid) {
    const G = this.game;
    if (this.open || !this.assembled) return;
    if (!this.unlocked) {
      if (!G.playerHas(pid, 'attic_key')) { G.broadcast({ k: 'need', what: 'attic_key' }, pid); return; }
      G.broadcast({ k: 'hatch', unlock: true, by: pid });
      return;
    }
    G.broadcast({ k: 'hatch', open: true, by: pid });
  }

  // ---------------------------------------------------------- events (all clients)
  applyStairs(e) {
    const G = this.game;
    const part = e.part;
    if (this.placed[part]) return;
    this.placed[part] = true;
    const it = G.items.get(part === 'lower' ? 'stair_lower' : 'stair_upper');
    if (it) it.used = true;
    const g = this.sections[part];
    g.visible = true;
    // swing it in from the hallway and settle it down onto its brackets
    this.anims.push({ g, t: 0, dur: 1.3, from: new THREE.Vector3(0, 0.9, -2.2), rot: 0.35 });
    audio.play('clank', { pos: new THREE.Vector3(22, U + 1, 14), vol: 0.9, ref: 3 });
    audio.play('slam', { pos: new THREE.Vector3(22, U + 1, 14), vol: 0.5, rate: 0.7 });
    if (this.assembled) {
      STAIR_R3.disabled = false;
      this.gate.off = true;
      this.tape.visible = false;
      this.mark.visible = false;
      this.house.interactables.delete('stairframe');
    }
    if (e.by === G.localId) G.message(this.assembled ? 'The staircase is complete. A trapdoor at the top is locked.' : 'Lower section in. Now fit the upper section (II) on top.');
    G.updateHUD();
  }

  applyHatch(e) {
    const G = this.game;
    if (e.unlock) {
      this.unlocked = true;
      const k = G.items.get('attic_key');
      if (k) k.used = true;
      audio.play('clunk', { pos: new THREE.Vector3(22, AY, 18), vol: 0.8, rate: 1.2 });
      if (e.by === G.localId) G.message('The attic key turns. The trapdoor is unlocked.');
    }
    if (e.open && !this.open) {
      this.open = true;
      this.hatchCol.off = true;
      this.hatchOpening = true;
      audio.play('creak', { pos: new THREE.Vector3(22, AY, 18), vol: 0.9, rate: 0.7 });
      this.house.interactables.delete('trapdoor');
      if (e.by === G.localId) G.message('The trapdoor swings up. The attic is open.');
    }
    G.updateHUD();
  }

  update(dt) {
    for (const a of this.anims) {
      a.t = Math.min(a.dur, a.t + dt);
      const k = a.t / a.dur, e = 1 - Math.pow(1 - k, 3);
      a.g.position.copy(a.from).multiplyScalar(1 - e);
      a.g.rotation.x = a.rot * (1 - e);
      if (a.t >= a.dur && !a.done) { a.done = true; this.game.fx.emit(new THREE.Vector3(22, a.g === this.sections.lower ? U + 0.4 : U + 2.2, a.g === this.sections.lower ? 14 : 17.6), 1.5, 0.3, 14); }
    }
    this.anims = this.anims.filter(a => !a.done);
    if (this.hatchOpening) {
      this.hatchAngle = Math.min(1.95, this.hatchAngle + dt * 2.2);
      this.hatch.rotation.x = this.hatchAngle;
      if (this.hatchAngle >= 1.95) this.hatchOpening = false;
    }
  }

  dispose() { STAIR_R3.disabled = false; }
}
