// The attic is sealed off. Its staircase has been taken apart: the lower and
// upper sections lie side by side in the basement. Carry them to the marked spot
// in the middle of the upstairs hall, fit the lower section, then the upper one
// on top of it. A locked trapdoor in the attic floor closes the top of the
// stairs: the attic key opens it. Only then can anyone climb up (or ride the
// elevator to the attic). Host-authoritative; clients animate the events.
import * as THREE from 'three';
import { audio } from './audio.js';
import { RAMPS, rampHeight, LEVELS, ATTIC_OPENING } from './layout.js';

const U = LEVELS[2].y, AY = LEVELS[3].y;
export const STAIR_R3 = RAMPS.find(r => r.id === 'R3');
const R = STAIR_R3;
const SPLIT = (R.a + R.b) / 2;         // where the two sections meet (x)
const HATCH = ATTIC_OPENING;
const ZC = (R.z0 + R.z1) / 2, ZW = R.z1 - R.z0;

/** One section of the attic ladder (rises along +x), as a group pivoting on its own centre. */
function buildSection(M, x0, x1, top = false) {
  const g = new THREE.Group();
  const pivot = new THREE.Vector3((x0 + x1) / 2, rampHeight(R, (x0 + x1) / 2, ZC), ZC);
  g.position.copy(pivot);
  g.userData.pivot = pivot.clone();
  const add = (mesh, x, y, z) => { mesh.position.set(x - pivot.x, y - pivot.y, z - pivot.z); g.add(mesh); return mesh; };
  const rail = M.woodDark, rung = M.floorWoodDark;
  const y0 = rampHeight(R, x0, ZC), y1 = rampHeight(R, x1, ZC) + (top ? 1.0 : 0); // the top rails reach up past the hatch as handholds
  const xe = top ? x1 + 1.0 * (x1 - x0) / (rampHeight(R, x1, ZC) - y0) : x1;
  const len = Math.hypot(xe - x0, y1 - y0), ang = Math.atan2(y1 - y0, xe - x0);
  for (const z of [ZC - 0.38, ZC + 0.38]) {
    const r = add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.05), rail), (x0 + xe) / 2, (y0 + y1) / 2, z);
    r.rotation.z = ang;
  }
  // rungs every ~28 cm of height
  const n = Math.max(1, Math.round((rampHeight(R, x1, ZC) - y0) / 0.28));
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * ((i + 0.5) / n);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.76, 8), rung), x, rampHeight(R, x, ZC), ZC).rotation.x = Math.PI / 2;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Item mesh for a loose ladder section lying on the floor (≈1.7 m long). */
export function makeStairPieceMesh(M, upper) {
  const g = new THREE.Group();
  for (const z of [-0.36, 0.36]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.05), M.woodDark);
    r.position.set(0, 0.04, z);
    g.add(r);
  }
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 8), M.floorWoodDark);
    c.rotation.x = Math.PI / 2; c.position.set(-0.7 + i * 0.28, 0.05, 0);
    g.add(c);
  }
  // a painted number so the two sections are told apart: I lower, II upper
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const x = cv.getContext('2d'); x.fillStyle = '#d8d0b8'; x.font = 'bold 54px serif'; x.textAlign = 'center'; x.fillText(upper ? 'II' : 'I', 64, 52);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.11), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
  label.position.set(-0.6, 0.1, 0.39);
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
      lower: buildSection(M, R.a, SPLIT),
      upper: buildSection(M, SPLIT, R.b, true),
    };
    for (const g of Object.values(this.sections)) { g.visible = false; H.group.add(g); }
    // brackets on the wall and a chalk outline on the floor show where the staircase goes
    for (const x of [R.a + 0.3, SPLIT, R.b - 0.3]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.05), M.metal);
      b.position.set(x, rampHeight(R, x, ZC) - 0.05, R.z1 + 0.02);
      H.group.add(b);
    }
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const c = cv.getContext('2d'); c.strokeStyle = 'rgba(230,225,210,0.8)'; c.lineWidth = 6; c.setLineDash([18, 12]);
    c.strokeRect(8, 8, 496, 112); c.beginPath(); c.moveTo(256, 14); c.lineTo(256, 114); c.stroke();
    c.fillStyle = 'rgba(230,225,210,0.85)'; c.font = 'bold 40px monospace'; c.textAlign = 'center'; c.fillText('I', 128, 78); c.fillText('II', 384, 78);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(R.b - R.a, ZW), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.set((R.a + R.b) / 2, U + 0.012, ZC);
    H.group.add(mark);
    this.mark = mark;
    // yellow tape round the empty spot, so nobody stands where the stairs go
    this.gate = H.collider(R.a, R.z0 - 0.05, R.b, R.z1, U, U + 1.2, { playerOnly: true });
    const tape = new THREE.Group();
    const tm = new THREE.MeshStandardMaterial({ color: 0xc8a010, emissive: 0x302000 });
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(R.b - R.a, 0.05, 0.02), tm); t1.position.set((R.a + R.b) / 2, U + 0.95, R.z0 - 0.04);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, ZW), tm); t2.position.set(R.a - 0.01, U + 0.95, ZC);
    for (const [x, z] of [[R.a, R.z0 - 0.04], [R.b, R.z0 - 0.04]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.0, 8), M.metal); p.position.set(x, U + 0.5, z); tape.add(p); }
    tape.add(t1, t2);
    H.group.add(tape);
    this.tape = tape;
    // once both sections are in: the open side and the high end are solid down to the hall floor
    this.side = H.collider(R.a + 0.45, R.z0 - 0.1, R.b, R.z0 + 0.02, U, AY + 1.05);
    this.endCap = H.collider(R.b - 0.15, R.z0, R.b + 0.05, R.z1, U, AY - 0.4);
    this.side.off = this.endCap.off = true;
    // interaction target: the marked spot
    const pick = new THREE.Mesh(new THREE.BoxGeometry(R.b - R.a, 1.2, ZW), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set((R.a + R.b) / 2, U + 0.6, ZC);
    H.group.add(pick);
    H.register('stairframe', 'stairframe', [pick], new THREE.Vector3((R.a + R.b) / 2, U + 0.6, ZC), { attic: this });
    // the floor slab round the opening (hall ceiling up to the attic floor), so nothing is see-through
    const slab = M.woodDark, y0 = LEVELS[2].top, y1 = AY;
    for (const [x0, z0, x1, z1] of [[HATCH.x0, HATCH.z0 - 0.02, HATCH.x1, HATCH.z0], [HATCH.x0 - 0.02, HATCH.z0, HATCH.x0, HATCH.z1], [HATCH.x1, HATCH.z0, HATCH.x1 + 0.02, HATCH.z1]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), slab);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      H.group.add(m);
    }
    // the trapdoor, hinged on its long south edge, flush with the attic floor
    const W = HATCH.z1 - HATCH.z0, Lx = HATCH.x1 - HATCH.x0, hx = (HATCH.x0 + HATCH.x1) / 2;
    const hatch = new THREE.Group();
    hatch.position.set(hx, AY - 0.03, HATCH.z1);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(Lx, 0.06, W), M.woodDark);
    panel.position.z = -W / 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.22), M.brass);
    plate.position.set(-Lx / 2 + 0.35, -0.036, -W + 0.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 14), M.metal);
    ring.rotation.x = Math.PI / 2; ring.position.set(-Lx / 2 + 0.6, -0.05, -W + 0.25);
    for (let i = 1; i < 4; i++) { const plank = new THREE.Mesh(new THREE.BoxGeometry(Lx, 0.065, 0.012), M.black); plank.position.set(0, 0, -W * i / 4); hatch.add(plank); }
    hatch.add(panel, plate, ring);
    panel.castShadow = true;
    H.group.add(hatch);
    this.hatch = hatch;
    this.hatchAngle = 0;
    // while it's shut, nobody gets further up the stairs than just under it (close enough to reach the lock)
    this.hatchCol = H.collider(R.a + 0.55, R.z0 - 0.05, R.a + 0.75, R.z1 + 0.05, U + 0.3, AY + 0.05);
    // standing open, the hatch is the railing on that side
    this.hatchWall = H.collider(HATCH.x0, HATCH.z1, HATCH.x1, HATCH.z1 + 0.14, AY, AY + 1.4);
    this.hatchWall.off = true;
    this.hatchPos = new THREE.Vector3(hx, AY - 0.1, (HATCH.z0 + HATCH.z1) / 2);
    H.register('trapdoor', 'trapdoor', [panel, plate, ring], this.hatchPos.clone(), { attic: this });
    hatch.updateMatrixWorld(true);
    pick.updateMatrixWorld(true);
  }

  /** Text for the interaction prompt at the stairwell. */
  framePrompt() {
    const G = this.game, me = G.localId;
    if (this.assembled) return '';
    const hasL = G.playerHas(me, 'stair_lower'), hasU = G.playerHas(me, 'stair_upper');
    if (!this.placed.lower) return hasL ? 'E — FIT THE LOWER LADDER SECTION (I)' : `ATTIC LADDER  <span class="dim">— missing: section I${hasU ? ' (fit I first)' : ''}, section II</span>`;
    return hasU ? 'E — FIT THE UPPER LADDER SECTION (II)' : 'ATTIC LADDER  <span class="dim">— missing: section II</span>';
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
      if (!G.playerHas(pid, 'stair_lower')) { G.broadcast({ k: 'msg', text: G.playerHas(pid, 'stair_upper') ? 'That\'s the upper section (II). The lower one (I) has to go in first.' : 'The attic ladder is missing. Both sections are lying in the basement.' }, pid); return; }
      G.broadcast({ k: 'stairs', part: 'lower', by: pid });
    } else if (!this.placed.upper) {
      if (!G.playerHas(pid, 'stair_upper')) { G.broadcast({ k: 'msg', text: 'Now the upper section (II).' }, pid); return; }
      G.broadcast({ k: 'stairs', part: 'upper', by: pid });
    }
    G.hostNoise(new THREE.Vector3((R.a + R.b) / 2, U, ZC), 10, 'drawer');
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
    // swing it in from the hall and settle it down against the wall
    this.anims.push({ g, t: 0, dur: 1.3, from: new THREE.Vector3(0, 0.9, -1.3), rot: 0.35 });
    const at = g.userData.pivot.clone().setY(U + 1);
    audio.play('clank', { pos: at, vol: 0.9, ref: 3 });
    audio.play('slam', { pos: at, vol: 0.5, rate: 0.7 });
    if (this.assembled) {
      STAIR_R3.disabled = false;
      this.gate.off = true;
      this.side.off = this.endCap.off = false;
      this.tape.visible = false;
      this.mark.visible = false;
      this.house.interactables.delete('stairframe');
    }
    if (e.by === G.localId) G.message(this.assembled ? 'The ladder is up. A trapdoor at the top is locked.' : 'Lower section in. Now fit the upper section (II) on top.');
    G.updateHUD();
  }

  applyHatch(e) {
    const G = this.game;
    if (e.unlock) {
      this.unlocked = true;
      const k = G.items.get('attic_key');
      if (k) k.used = true;
      audio.play('clunk', { pos: this.hatchPos, vol: 0.8, rate: 1.2 });
      if (e.by === G.localId) G.message('The attic key turns. The trapdoor is unlocked.');
    }
    if (e.open && !this.open) {
      this.open = true;
      this.hatchCol.off = true;
      this.hatchWall.off = false;
      this.hatchOpening = true;
      audio.play('creak', { pos: this.hatchPos, vol: 0.9, rate: 0.7 });
      this.house.interactables.delete('trapdoor');
      if (e.by === G.localId) G.message('The trapdoor swings up. The attic is open.');
    }
    G.updateHUD();
  }

  update(dt) {
    for (const a of this.anims) {
      a.t = Math.min(a.dur, a.t + dt);
      const k = a.t / a.dur, e = 1 - Math.pow(1 - k, 3);
      a.g.position.copy(a.g.userData.pivot).addScaledVector(a.from, 1 - e);
      a.g.rotation.x = -a.rot * (1 - e); // tilted towards the hall, then settles flat against the wall
      if (a.t >= a.dur && !a.done) { a.done = true; this.game.fx.emit(a.g.userData.pivot.clone().setY(U + 0.3), 1.5, 0.3, 14); }
    }
    this.anims = this.anims.filter(a => !a.done);
    if (this.hatchOpening) {
      // swings up past vertical and rests against the floor beyond its hinge
      this.hatchAngle = Math.min(1.68, this.hatchAngle + dt * 2.2);
      this.hatch.rotation.x = this.hatchAngle;
      if (this.hatchAngle >= 1.68) this.hatchOpening = false;
    }
  }

  dispose() { STAIR_R3.disabled = false; }
}
