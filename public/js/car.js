// The garage escape. car.glb sits in the basement garage, facing the big
// garage door. Fit an engine (with a wrench), pour in oil and connect a battery,
// then everyone piles in. Whoever is in the driver's seat floors it: the car
// rams the door, backs up, rams it again, backs up, and on the third hit the
// door bursts apart (simple rigid-body debris) and the car drives up the
// driveway into the night. Riders watch it from their own seat, then the shot
// cuts to Ajan sitting in the garage, furious, and ajan.mp3 plays.
// The drive is a fixed timeline started at a server time, so every client
// sees the same thing.
import * as THREE from 'three';
import { audio } from './audio.js';
import { loadGLTF } from './assets.js';
import { RAMPS, rampHeight } from './layout.js';
import { mulberry32, clamp } from './util.js';

const BY = -3.2;
export const CAR_START = new THREE.Vector3(35.0, BY, 21.0);
const HEADING = Math.PI / 2;        // car-space +z (forward) → world +x
const LEN = 3.9;                    // metres, bumper to bumper
const MODEL_FLIP = false;           // turned 180° so the model's own steering wheel lines up with the driver's seat
export const CAR_PARTS = ['engine', 'oil', 'battery'];
export const PART_NAMES = { engine: 'engine', oil: 'oil', battery: 'battery' };

// Seats in car space (+x is the driver's side, +z forward).
const SEATS = [
  { id: 'seat_driver', seat: 'driver', lx: 0.45, lz: 0.15, label: "GET IN — DRIVER'S SEAT" },
  { id: 'seat_front', seat: 'front', lx: -0.45, lz: 0.15, label: 'GET IN — FRONT SEAT' },
  { id: 'seat_rearL', seat: 'rear', lx: 0.45, lz: -0.85, label: 'GET IN — BACK SEAT' },
  { id: 'seat_rearR', seat: 'rear', lx: -0.45, lz: -0.85, label: 'GET IN — BACK SEAT' },
];

// Drive timeline: [t0, t1, from, to, ease] in metres travelled along +x.
const HIT = 2.85; // front bumper touches the door
const TL = [
  [1.3, 2.1, 0, HIT, 'in'],          // ram 1
  [2.1, 2.4, HIT, HIT - 0.35, 'out'],
  [2.6, 3.8, HIT - 0.35, -0.7, 'inout'],
  [4.0, 4.8, -0.7, HIT, 'in'],       // ram 2
  [4.8, 5.1, HIT, HIT - 0.4, 'out'],
  [5.3, 6.5, HIT - 0.4, -1.4, 'inout'],
  [6.7, 7.4, -1.4, HIT, 'in'],       // ram 3: through
  [7.4, 11.6, HIT, 24, 'drive'],
];
export const IMPACTS = [2.1, 4.8, 7.4];
const BREAK_AT = 7.4;
const CUT_AT = 9.8;       // riders: out through the broken door → escapecar.mp4
export const DRIVE_TOTAL = CUT_AT + 0.2; // host sends the escape at this point

const DRIVE = RAMPS.find(r => r.id === 'R4');
/** Ground under the car / debris: garage floor, the driveway, then the yard. */
function surface(x, z) {
  if (x >= DRIVE.x0 && x <= DRIVE.x1 && z >= DRIVE.z0 - 0.3 && z <= DRIVE.z1 + 0.3) return rampHeight(DRIVE, x, z);
  if (x > DRIVE.x1) return 0;
  return BY;
}

const ease = (k, e) => e === 'in' ? k * k : e === 'out' ? 1 - (1 - k) * (1 - k) : e === 'drive' ? k * (0.35 + 0.65 * k) : k * k * (3 - 2 * k);

/** Distance travelled (and current speed) at time t into the drive. */
function travel(t) {
  let x = 0, prev = 0;
  for (const [t0, t1, a, b, e] of TL) {
    if (t < t0) return { x: prev, v: 0 };
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const x1 = a + (b - a) * ease(k, e);
      const k2 = Math.min(1, k + 0.01);
      const v = ((a + (b - a) * ease(k2, e)) - x1) / ((t1 - t0) * 0.01);
      return { x: x1, v };
    }
    prev = b; x = b;
  }
  return { x, v: 0 };
}

export class Car {
  constructor(game) {
    this.game = game;
    this.house = game.house;
    this.parts = { engine: false, oil: false, battery: false };
    this.state = 'parked';   // parked | driving | gone
    this.broken = false;     // the garage door
    this.driveAt = 0;
    this.riders = [];
    this.dent = 0;
    this.debris = [];
    this.rnd = mulberry32(game.seed ^ 0xca7);
  }

  get ready() { return CAR_PARTS.every(p => this.parts[p]); }
  missing() { return CAR_PARTS.filter(p => !this.parts[p]); }

  async init() {
    const g = new THREE.Group();
    g.position.copy(CAR_START);
    g.rotation.y = HEADING;
    this.group = g;
    this.house.group.add(g);
    // ---- body (car.glb), scaled so it is LEN long
    const gltf = await loadGLTF('carModel');
    let src = null;
    gltf?.scene.traverse(o => { if (!src && o.isMesh) src = o; });
    const body = new THREE.Group();
    if (src) {
      const m = new THREE.Mesh(src.geometry, src.material);
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox, size = bb.getSize(new THREE.Vector3());
      const k = LEN / Math.max(size.z, 1e-3);
      m.scale.setScalar(k);
      m.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k);
      m.castShadow = true; m.receiveShadow = true;
      body.add(m);
      this.height = size.y * k;
      this.width = size.x * k;
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.5, LEN), new THREE.MeshStandardMaterial({ color: 0x3a2a20 }));
      m.position.y = 0.75; body.add(m); this.height = 1.5; this.width = 2.1;
    }
    if (MODEL_FLIP) body.rotation.y = Math.PI;
    g.add(body);
    this.body = body;
    this.buildInterior();
    this.buildLights();
    this.buildDoor();
    this.registerSeats();
    // the bonnet: fit parts here
    g.updateMatrixWorld(true);
    const hoodPos = g.localToWorld(new THREE.Vector3(0, 0.9, LEN / 2 - 0.4));
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
    hood.position.set(0, 0.9, LEN / 2 - 0.35);
    g.add(hood);
    this.house.register('carhood', 'carhood', [hood], hoodPos, { car: this });
    g.updateMatrixWorld(true); // raycasts can happen before the first frame
  }

  // ------------------------------------------------------------ interior
  buildInterior() {
    const M = this.house.M;
    const plastic = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.8 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.95 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x8aa0b0, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const I = new THREE.Group();
    const H = Math.min(this.height || 1.8, 1.9);
    const roof = H * 0.86, belt = H * 0.57, hw = Math.min((this.width || 2.1) / 2 - 0.12, 1.0);
    const box = (w, h, d, x, y, z, mat = plastic, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.rotation.x = rx; I.add(b); return b; };
    box(hw * 2, 0.06, LEN - 0.8, 0, 0.32, -0.2);                              // floor
    box(hw * 2, 0.25, 0.45, 0, belt + 0.05, 0.95, plastic, -0.25);            // dashboard
    box(hw * 2, 0.04, 1.9, 0, roof, -0.45, new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 1 })); // headliner
    for (const s of [-1, 1]) {
      box(0.06, belt - 0.3, LEN - 1.0, s * hw, 0.33 + (belt - 0.3) / 2, -0.25);  // door cards
      // The Tripo body is a closed shell that is invisible from inside (back faces), so the
      // cabin needs its own pillars, roof rails and sills to read as "inside a car".
      box(0.09, (roof - belt) * 1.15, 0.09, s * (hw - 0.05), (roof + belt) / 2, 0.72, plastic, -0.55); // A pillar
      box(0.1, roof - belt, 0.14, s * (hw - 0.04), (roof + belt) / 2, -0.35);                          // B pillar
      box(0.12, (roof - belt) * 1.1, 0.2, s * (hw - 0.05), (roof + belt) / 2, -1.25, plastic, 0.45);   // C pillar
      box(0.12, 0.08, 2.2, s * (hw - 0.05), roof - 0.02, -0.3);                                         // roof rail
      box(0.1, 0.07, LEN - 1.0, s * (hw - 0.02), belt, -0.25);                                          // window sill
    }
    // sun visors and the rear-view mirror
    box(0.4, 0.03, 0.18, 0.45, roof - 0.04, 0.55); box(0.4, 0.03, 0.18, -0.45, roof - 0.04, 0.55);
    // Tilt toward seated eye height so the rear view clears the cabin roof.
    box(0.24, 0.08, 0.03, 0, roof - 0.12, 0.62).rotation.x = -0.22;
    const rearMirror = this.house.addMirror(0.22, 0.06, [0, roof - 0.12, 0.603], Math.PI, 'car_rearview_mirror', I);
    rearMirror.rotation.x = -0.22;
    // windscreen and rear window
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, (roof - belt) * 1.2), glass);
    ws.position.set(0, (roof + belt) / 2, 0.88); ws.rotation.x = -0.55; I.add(ws);
    const rw = ws.clone(); rw.position.z = -1.4; rw.rotation.x = 0.5; I.add(rw);
    // seats
    for (const s of SEATS) {
      box(0.5, 0.14, 0.5, s.lx, 0.5, s.lz, seatMat);
      box(0.5, 0.6, 0.12, s.lx, 0.86, s.lz - 0.26, seatMat, -0.15);
      box(0.28, 0.16, 0.1, s.lx, 1.25, s.lz - 0.31, seatMat);
    }
    // steering wheel + column, gauges, mirror
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 8, 24), plastic);
    wheel.position.set(0.45, belt + 0.22, 0.66); wheel.rotation.x = -0.35; I.add(wheel);
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.022, 0.02), plastic); spoke.position.copy(wheel.position); spoke.rotation.x = -0.35; I.add(spoke);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.35, 8), plastic); col.position.set(0.45, belt + 0.15, 0.8); col.rotation.x = 1.1; I.add(col);
    this.wheel = wheel;
    this.gauges = new THREE.MeshStandardMaterial({ color: 0x101010, emissive: 0x000000 });
    for (const dx of [-0.05, 0.05]) { const gge = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), this.gauges); gge.position.set(0.45 + dx, belt + 0.19, 0.83); gge.rotation.y = Math.PI; gge.rotation.x = 0.25; I.add(gge); }
    box(0.22, 0.06, 0.03, 0, roof - 0.1, 0.55, plastic);
    I.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    this.group.add(I);
    this.interior = I;
    void M;
  }

  buildLights() {
    const g = this.group;
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0x332a10 });
    this.lampMat = lampMat;
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), lampMat);
      l.position.set(s * 0.7, 0.75, LEN / 2 + 0.01); g.add(l);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.1), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0x500000 }));
      r.position.set(s * 0.75, 0.85, -LEN / 2 - 0.01); r.rotation.y = Math.PI; g.add(r);
    }
    const head = new THREE.SpotLight(0xfff0d0, 0, 26, 0.55, 0.5, 1.2);
    head.position.set(0, 0.8, LEN / 2);
    head.target.position.set(0, 0.2, LEN / 2 + 8);
    g.add(head, head.target);
    this.headlight = head;
  }

  // ------------------------------------------------------------ garage door
  buildDoor() {
    const M = this.house.M;
    const steel = new THREE.MeshStandardMaterial({ color: 0x6a6258, metalness: 0.55, roughness: 0.6, map: M.metal.map });
    const rows = 6, z0 = 19.4, z1 = 22.6, h = 2.5;
    this.pieces = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 2; c++) {
        const w = (z1 - z0) / 2, sh = h / rows;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, sh - 0.02, w - 0.02), steel);
        const home = new THREE.Vector3(40.0, BY + sh * (r + 0.5), z0 + w * (c + 0.5));
        m.position.copy(home);
        m.castShadow = true;
        this.house.group.add(m);
        this.pieces.push({ m, home, r, c, v: new THREE.Vector3(), w: new THREE.Vector3(), free: false });
      }
    }
    // a frame and a warning stripe
    const frame = this.house.M.woodDark;
    for (const z of [z0 - 0.08, z1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.24, h + 0.1, 0.08), frame); f.position.set(40, BY + h / 2, z + 0.04); this.house.group.add(f); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, z1 - z0 + 0.16), frame); top.position.set(40, BY + h + 0.05, (z0 + z1) / 2); this.house.group.add(top);
  }

  setDent(level) {
    // each ram buckles the door further outward
    this.dent = level;
    for (const p of this.pieces) {
      if (p.free) continue;
      const mid = 1 - Math.abs(p.r - 2.5) / 3;
      p.m.position.x = p.home.x + level * (0.06 + 0.1 * mid);
      p.m.rotation.y = level * (p.c ? -0.06 : 0.06) * mid;
      p.m.rotation.z = level * 0.04 * (p.r % 2 ? 1 : -1);
    }
  }

  breakDoor() {
    if (this.broken) return;
    this.broken = true;
    if (this.house.garageDoorCollider) this.house.garageDoorCollider.off = true;
    const R = this.rnd;
    for (const p of this.pieces) {
      p.free = true;
      p.v.set(6 + R() * 6, 1.2 + R() * 3.5, (p.home.z - 21) * 1.6 + (R() - 0.5) * 2.5);
      p.w.set((R() - 0.5) * 10, (R() - 0.5) * 8, (R() - 0.5) * 10);
    }
    // chunks of the wall around the opening
    const brick = this.house.M.brick;
    for (let i = 0; i < 18; i++) {
      const s = 0.12 + R() * 0.2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s * 1.6, s, s), brick);
      const side = R() < 0.5 ? 19.35 : 22.65;
      m.position.set(40 + (R() - 0.5) * 0.2, BY + R() * 2.5, i < 12 ? side : 19.4 + R() * 3.2);
      if (i >= 12) m.position.y = BY + 2.45 + R() * 0.1;
      m.castShadow = true;
      this.house.group.add(m);
      this.pieces.push({ m, home: m.position.clone(), free: true, v: new THREE.Vector3(3 + R() * 5, R() * 3, (m.position.z - 21) * 0.8 + (R() - 0.5) * 2), w: new THREE.Vector3(R() * 8, R() * 8, R() * 8) });
    }
    for (let i = 0; i < 4; i++) this.game.fx.emit(new THREE.Vector3(40.2, BY + 0.4 + i * 0.5, 21), 1.4, 0.6, 18);
  }

  updateDebris(dt) {
    for (const p of this.pieces) {
      if (!p.free || p.sleep) continue;
      p.v.y -= 9.8 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.w.x * dt; p.m.rotation.y += p.w.y * dt; p.m.rotation.z += p.w.z * dt;
      const g = surface(p.m.position.x, p.m.position.z);
      if (p.m.position.y < g + 0.04) {
        p.m.position.y = g + 0.04;
        if (p.v.y < -1.5) audio.play('rattle', { pos: p.m.position, vol: Math.min(0.5, -p.v.y * 0.06), rate: 1.4 + Math.random() * 0.6 });
        p.v.y *= -0.32; p.v.x *= 0.62; p.v.z *= 0.62; p.w.multiplyScalar(0.55);
        if (p.v.lengthSq() < 0.05) { p.sleep = true; p.m.rotation.x = Math.round(p.m.rotation.x / (Math.PI / 2)) * Math.PI / 2; p.m.rotation.z = Math.round(p.m.rotation.z / (Math.PI / 2)) * Math.PI / 2; }
      }
    }
  }

  // ------------------------------------------------------------ seats
  registerSeats() {
    const g = this.group;
    g.updateMatrixWorld(true);
    this.seats = SEATS.map(s => {
      const inside = g.localToWorld(new THREE.Vector3(s.lx, 0, s.lz));
      const exit = g.localToWorld(new THREE.Vector3(s.lx > 0 ? 1.75 : -1.75, 0, s.lz));
      const spot = { id: s.id, type: 'seat', seat: s.seat, local: s, doors: [], open: 0, target: 0, inside, exit, yaw: HEADING + Math.PI, camY: 1.22, occupant: null, label: s.label };
      // camera yaw: the player camera looks down −z at yaw 0, so facing +x is yaw −π/2
      spot.yaw = -HEADING;
      this.house.hides.set(s.id, spot);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.85), new THREE.MeshBasicMaterial({ visible: false }));
      door.position.set(s.lx > 0 ? 1.0 : -1.0, 0.95, s.lz);
      g.add(door);
      this.house.register(s.id, 'hide', [door], g.localToWorld(new THREE.Vector3(s.lx > 0 ? 1.1 : -1.1, 0.9, s.lz)), { spot });
      return spot;
    });
    g.updateMatrixWorld(true);
  }

  occupants() { return this.seats.filter(s => s.occupant).map(s => s.occupant); }
  driverSeat() { return this.seats.find(s => s.seat === 'driver'); }

  /** Seat transforms follow the car while it moves. */
  syncSeats() {
    const g = this.group;
    g.updateMatrixWorld(true);
    for (const s of this.seats) {
      s.inside.copy(g.localToWorld(new THREE.Vector3(s.local.lx, 0, s.local.lz)));
      s.exit.copy(g.localToWorld(new THREE.Vector3(s.local.lx > 0 ? 1.75 : -1.75, 0, s.local.lz)));
    }
  }

  // ------------------------------------------------------------ the drive
  startDrive(at, riders) {
    if (this.state !== 'parked') return;
    this.state = 'driving';
    this.driveAt = at;
    this.riders = riders.slice();
    this.impactsDone = 0;
    this.started = false;
    for (const s of this.seats) this.house.interactables.delete(s.id);
    this.house.interactables.delete('carhood');
    if (this.house.carCollider) this.house.carCollider.off = true;
  }

  pose(t) {
    const { x, v } = travel(t);
    const cx = CAR_START.x + x;
    // wheel heights (front/back) → height and pitch on the driveway
    const hf = surface(cx + 1.35, CAR_START.z), hr = surface(cx - 1.35, CAR_START.z);
    return { x: cx, y: (hf + hr) / 2, pitch: Math.atan2(hf - hr, 2.7), v };
  }

  update(dt, now) {
    this.updateDebris(dt);
    if (this.state === 'parked') return;
    const G = this.game;
    const t = (now - this.driveAt) / 1000;
    if (t < 0) return;
    if (!this.started) {
      this.started = true;
      this.engine = audio.play('engine', { pos: this.group.position, loop: true, vol: 0.9, ref: 3 });
      audio.play('ignition', { pos: this.group.position, vol: 1, ref: 3 });
      this.lampMat.emissive.setHex(0xfff0c0);
      this.gauges.emissive.setHex(0x1a4010);
      this.headlight.intensity = 60;
    }
    const P = this.pose(Math.min(t, CUT_AT + 1));
    const g = this.group;
    g.position.set(P.x, P.y, CAR_START.z);
    g.rotation.set(0, HEADING, 0);
    g.rotateX(-P.pitch);
    // engine note follows speed
    if (this.engine) {
      this.engine.setPos?.(g.position);
      const rate = 0.8 + Math.min(2.2, Math.abs(P.v) * 0.25) + (t > 1.0 && t < 1.3 ? 0.6 : 0);
      if (this.engine.src) this.engine.src.playbackRate.value = rate;
    }
    // impacts
    while (this.impactsDone < IMPACTS.length && t >= IMPACTS[this.impactsDone]) {
      const i = this.impactsDone++;
      audio.play('crash', { pos: new THREE.Vector3(40, BY + 1, 21), vol: 1.0, ref: 6, rolloff: 0.7, limit: true });
      this.game.fx.emit(new THREE.Vector3(39.9, BY + 0.6, 21), 1.2, 0.8, 10);
      this.shake = 1;
      if (i < 2) this.setDent(i + 1); else this.breakDoor();
      if (i < 2) setTimeout(() => audio.play('screech', { pos: this.group.position, vol: 0.8, ref: 4 }), 500);
    }
    if (t >= BREAK_AT && !this.broken) this.breakDoor();
    this.shake = Math.max(0, (this.shake || 0) - dt * 2.2);
    this.syncSeats();
    // out of sight up the drive: done
    if (t > CUT_AT + 1 && this.state === 'driving') {
      this.state = 'gone';
      g.visible = false;
      this.engine?.stop(1.0);
      this.engine = null;
      this.headlight.intensity = 0;
    }
    this.updateRider(t, dt);
  }

  /** First-person view from the seat, then the cut to Ajan, for players riding along. */
  updateRider(t, dt) {
    const G = this.game;
    if (!this.riders.includes(G.localId)) return;
    const L = G.local, cam = G.camera;
    const u = G.post.vhs.uniforms;
    if (t < CUT_AT) {
      L.frozen = true;
      $hud('cine', true);
      const spot = L.hidden;
      if (spot && spot.type === 'seat') {
        // eye point in car space, so it tilts with the car on the driveway
        this.group.updateMatrixWorld(true);
        cam.position.copy(this.group.localToWorld(new THREE.Vector3(spot.local.lx, spot.camY, spot.local.lz)));
        cam.rotation.set(L.pitch, spot.yaw + L.hideLook, 0, 'YXZ');
        cam.rotateX(this.pose(t).pitch * Math.cos(L.hideLook));
        const s = this.shake * 0.08;
        cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
      }
      u.fade.value = t > CUT_AT - 0.5 ? (t - (CUT_AT - 0.5)) / 0.5 : 0;
      return;
    }
    // ---- out: hold black until escapecar.mp4 takes over (no Ajan cut any more)
    u.fade.value = 1;
  }

  dispose() {
    this.engine?.stop();
    this.eyes?.forEach(e => e.parent?.remove(e));
  }
}

function $hud(what, on) {
  if (what === 'cine') document.getElementById('hud').classList.toggle('cine', on);
  if (what === 'escapeTitle') document.getElementById('escapeTitle').classList.toggle('show', on);
}
export { clamp };
