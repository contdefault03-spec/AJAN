// The nursery spider: a huge spider that sits in the far corner and guards the
// storage room key on the crib in the opposite corner. It doesn't leave the
// nursery. Going for the key (or running in its room) sets it off; it rears up,
// hisses, then scuttles after you and kills on contact. Grab the key and run for
// the door. Logic runs on the host; clients get a 10 Hz snapshot.
import * as THREE from 'three';
import { audio } from './audio.js';
import { collideCircle } from './physics.js';
import { clamp, damp, angleLerp } from './util.js';

const U = 3.4;
export const SPIDER_ROOM = { x0: 0, x1: 10, z0: 11, z1: 21, y: U };
export const SPIDER_HOME = new THREE.Vector3(9.1, U, 20.1);   // south-east corner
export const SPIDER_KEY = new THREE.Vector3(1.2, U + 0.57, 19.7); // crib, south-west corner
const SPEED = { easy: 3.8, medium: 4.4, hard: 4.9 };
const POUNCE = 2.4;      // within this range it lunges at full speed
const KEY_RADIUS = 2.6;   // "going for the key"
const KILL_RANGE = 1.15; // its legs reach about this far (the model is 1.35x scale)
const ST = ['wait', 'alert', 'hunt', 'return', 'feed', 'dead'];

const inRoom = (p, pad = 0) => p.x > SPIDER_ROOM.x0 - pad && p.x < SPIDER_ROOM.x1 + pad && p.z > SPIDER_ROOM.z0 - pad && p.z < SPIDER_ROOM.z1 + pad && p.y > U - 0.6 && p.y < U + 2.2;

export class Spider {
  constructor(game) {
    this.game = game;
    this.pos = SPIDER_HOME.clone();
    this.ry = Math.atan2(5 - SPIDER_HOME.x, 15 - SPIDER_HOME.z); // facing into the room
    this.state = 'wait';
    this.t = 0;
    this.target = null;
    this.speed = 0;
    this.rear = 0;      // 0 = crouched, 1 = reared up
    this.walkPhase = 0;
    this.skitterT = 0;
    this.snap = null;
    this.build();
  }

  // ---------------------------------------------------------------- visuals
  build() {
    const g = new THREE.Group();
    const hair = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.95 });
    const shell = new THREE.MeshStandardMaterial({ color: 0x23170f, roughness: 0.55, metalness: 0.1 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1a08, emissiveIntensity: 2.2 });
    this.body = new THREE.Group();
    g.add(this.body);
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), shell);
    thorax.scale.set(1, 0.7, 1.15);
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), hair);
    abdomen.scale.set(1, 0.85, 1.3);
    abdomen.position.set(0, 0.12, -0.62);
    // pale hourglass-ish markings on the abdomen
    const mark = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6a1010, roughness: 0.6 }));
    mark.scale.set(0.8, 0.35, 1.6);
    mark.position.set(0, 0.5, -0.66);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), shell);
    head.scale.set(1, 0.8, 1);
    head.position.set(0, 0.04, 0.33);
    this.body.add(thorax, abdomen, mark, head);
    for (const [x, y, r] of [[-0.06, 0.1, 0.035], [0.06, 0.1, 0.035], [-0.13, 0.08, 0.024], [0.13, 0.08, 0.024], [-0.04, 0.15, 0.02], [0.04, 0.15, 0.02], [-0.1, 0.14, 0.017], [0.1, 0.14, 0.017]]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), eyeMat);
      e.position.set(x, y, 0.47);
      this.body.add(e);
    }
    this.fangs = [-1, 1].map(s => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 6), shell);
      f.position.set(s * 0.06, -0.08, 0.46);
      f.rotation.x = Math.PI * 0.85;
      this.body.add(f);
      return f;
    });
    // eight legs, two segments each
    const segGeo = new THREE.CylinderGeometry(0.035, 0.025, 1, 6);
    segGeo.translate(0, 0.5, 0);
    this.legs = [];
    const angles = [0.75, 0.3, -0.2, -0.7];
    for (const side of [-1, 1]) {
      angles.forEach((a, i) => {
        const upper = new THREE.Mesh(segGeo, hair);
        const lower = new THREE.Mesh(segGeo, hair);
        g.add(upper, lower);
        this.legs.push({ side, a, i, upper, lower, phase: (i % 2 === 0 ? 0 : Math.PI) + (side > 0 ? Math.PI : 0) });
      });
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.scale.setScalar(1.35); // leg span ≈ 2.6 m
    this.group = g;
    this.game.scene.add(g);
    this.hipLocal = new THREE.Vector3();
  }

  placeSeg(mesh, a, b) {
    const d = b.clone().sub(a);
    const len = d.length();
    mesh.position.copy(a);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  animate(dt) {
    const g = this.group;
    g.position.copy(this.pos);
    g.rotation.y = this.ry;
    if (this.state === 'dead') {
      // flipped onto its back, legs curled up
      this.deadK = Math.min(1, (this.deadK || 0) + dt * 2.5);
      const k = this.deadK;
      g.rotation.z = Math.PI * k;
      g.position.y = this.pos.y + 0.75 * k;
      this.body.position.y = 0.38;
      this.body.rotation.x = 0;
      g.updateMatrixWorld(true);
      for (const L of this.legs) {
        const hip = new THREE.Vector3(L.side * 0.2, 0.38, 0.05 + L.a * 0.18);
        const knee = new THREE.Vector3(L.side * 0.5, 0.75 + 0.2 * k, 0.05 + L.a * 0.4);
        const foot = new THREE.Vector3(L.side * (0.55 - 0.35 * k), 0.95 + 0.3 * k, L.a * 0.3);
        this.placeSeg(L.upper, g.localToWorld(hip.clone()), g.localToWorld(knee.clone()));
        this.placeSeg(L.lower, g.localToWorld(knee.clone()), g.localToWorld(foot.clone()));
      }
      return;
    }
    const moving = this.speed > 0.2;
    this.walkPhase += dt * (moving ? 6 + this.speed * 3 : 0.6);
    const t = performance.now() / 1000;
    const bodyY = 0.38 + this.rear * 0.25 + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.03 : Math.sin(t * 1.3) * 0.01);
    this.body.position.y = bodyY;
    this.body.rotation.x = -this.rear * 0.55;
    this.fangs.forEach((f, i) => { f.rotation.z = (i ? 1 : -1) * (0.15 + this.rear * 0.35 * (0.5 + 0.5 * Math.sin(t * 14))); });
    g.updateMatrixWorld(true);
    for (const L of this.legs) {
      const ang = L.a + (L.side > 0 ? 0 : Math.PI);
      const dirX = Math.sin(ang) * (L.side > 0 ? 1 : 1), dirZ = Math.cos(L.a);
      // hip on the thorax side, foot out on the floor
      const hip = new THREE.Vector3(L.side * 0.2, bodyY, 0.05 + L.a * 0.18);
      const swing = moving ? Math.sin(this.walkPhase + L.phase) * 0.22 : Math.sin(t * 0.8 + L.phase) * 0.02;
      const lift = moving ? Math.max(0, Math.cos(this.walkPhase + L.phase)) * 0.14 : 0;
      // front legs rise when the spider rears up
      const raise = L.i === 0 ? this.rear * 0.6 : L.i === 1 ? this.rear * 0.25 : 0;
      const foot = new THREE.Vector3(L.side * (0.95 - Math.abs(L.a) * 0.1), lift + raise, dirZ * 0.85 + swing + L.a * 0.25);
      const knee = hip.clone().lerp(foot, 0.45);
      knee.x += L.side * 0.15;
      knee.y = bodyY + 0.42 + raise * 0.5;
      void dirX;
      const hipW = g.localToWorld(hip.clone()), kneeW = g.localToWorld(knee.clone()), footW = g.localToWorld(foot.clone());
      this.placeSeg(L.upper, hipW, kneeW);
      this.placeSeg(L.lower, kneeW, footW);
    }
  }

  // ---------------------------------------------------------------- logic (host)
  candidates() {
    return [...this.game.players.values()].filter(p => p.alive && !p.dying && !p.escaped && !p.hidden && p.pos && inRoom(p.pos));
  }

  keyOnCrib() {
    const it = this.game.items.get('storage_key');
    return it && !it.holder && !it.dropped && !it.used;
  }

  setState(s) { this.state = s; this.t = 0; }

  /** Shot with the revolver: it dies for good (host decides, everyone animates). */
  kill() {
    if (this.state === 'dead') return false;
    this.target = null;
    this.setState('dead');
    this.speed = 0;
    return true;
  }

  hostUpdate(dt) {
    const G = this.game;
    this.t += dt;
    this.speed = 0;
    if (this.state === 'dead') return;
    if (this.state === 'wait') {
      this.pos.lerp(SPIDER_HOME, Math.min(1, dt * 2));
      this.rear = damp(this.rear, 0, 4, dt);
      for (const p of this.candidates()) {
        const nearKey = this.keyOnCrib() && Math.hypot(p.pos.x - SPIDER_KEY.x, p.pos.z - SPIDER_KEY.z) < KEY_RADIUS;
        const hasKey = G.playerHas(p.id, 'storage_key');
        const running = p.isLocal ? G.local.run && G.local.speed > 3.2 : p.run && p.speed > 3.2;
        if (nearKey || hasKey || running) {
          this.target = p.id;
          this.setState('alert');
          G.broadcast({ k: 'spider', s: 'hiss' });
          break;
        }
      }
      return;
    }
    if (this.state === 'alert') {
      this.rear = damp(this.rear, 1, 8, dt);
      const p = G.players.get(this.target);
      if (p?.pos) this.ry = angleLerp(this.ry, Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), Math.min(1, dt * 8));
      if (this.t > 0.6) this.setState('hunt');
      return;
    }
    if (this.state === 'hunt') {
      this.rear = damp(this.rear, 0.15, 6, dt);
      const p = G.players.get(this.target);
      if (!p || !p.alive || p.dying || p.escaped || p.hidden || !p.pos || !inRoom(p.pos, -0.15)) {
        // lost them (left the nursery or hid): hiss at the doorway, then go back
        G.broadcast({ k: 'spider', s: 'hiss' });
        this.target = null;
        this.setState('return');
        return;
      }
      const dist = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      const sp = dist < POUNCE ? 7.5 : SPEED[G.difficulty] || SPEED.medium;
      this.moveToward(p.pos, sp, dt);
      if (Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < KILL_RANGE) {
        if (G.freePlay) { this.target = null; G.broadcast({ k: 'spider', s: 'hiss' }); this.setState('return'); return; }
        G.hostSpiderKill(p.id);
        this.target = null;
        this.setState('feed');
      }
      return;
    }
    if (this.state === 'feed') {
      if (this.t > 3) this.setState('return');
      return;
    }
    if (this.state === 'return') {
      this.rear = damp(this.rear, 0, 4, dt);
      if (this.t > 0.8) this.moveToward(SPIDER_HOME, 1.8, dt);
      if (this.pos.distanceTo(SPIDER_HOME) < 0.15) {
        this.ry = angleLerp(this.ry, Math.atan2(5 - SPIDER_HOME.x, 15 - SPIDER_HOME.z), 1);
        this.setState('wait');
      }
    }
  }

  moveToward(goal, speed, dt) {
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const step = Math.min(d, speed * dt);
    this.pos.x += dx / d * step;
    this.pos.z += dz / d * step;
    collideCircle(this.pos, 0.35, 0.8, this.game.house.colliders, 'spider');
    this.pos.x = clamp(this.pos.x, SPIDER_ROOM.x0 + 0.45, SPIDER_ROOM.x1 - 0.45);
    this.pos.z = clamp(this.pos.z, SPIDER_ROOM.z0 + 0.45, SPIDER_ROOM.z1 - 0.45);
    this.pos.y = U;
    this.ry = angleLerp(this.ry, Math.atan2(dx, dz), Math.min(1, dt * 10));
    this.speed = step / Math.max(dt, 1e-4);
  }

  snapshot() {
    return [+this.pos.x.toFixed(2), +this.pos.z.toFixed(2), +this.ry.toFixed(2), ST.indexOf(this.state), +this.rear.toFixed(2), +this.speed.toFixed(1)];
  }

  applySnap(s, dt) {
    const k = Math.min(1, dt * 12);
    this.pos.x += (s[0] - this.pos.x) * k;
    this.pos.z += (s[1] - this.pos.z) * k;
    this.ry = angleLerp(this.ry, s[2], k);
    this.state = ST[s[3]] || 'wait';
    this.rear += (s[4] - this.rear) * k;
    this.speed = s[5];
  }

  update(dt) {
    const G = this.game;
    if (G.isHost) { if (G.phase === 'play') this.hostUpdate(dt); }
    else if (this.snap) this.applySnap(this.snap, dt);
    // Only draw it when someone could plausibly see it (same floor, near the nursery).
    const cp = G.camera.position;
    this.group.visible = cp.y > U - 1 && cp.y < U + 3.4 && cp.x < 22 && cp.z > 8;
    if (this.group.visible) this.animate(dt);
    if (this.speed > 1) {
      this.skitterT -= dt;
      if (this.skitterT <= 0) { this.skitterT = 0.3; audio.play('skitter', { pos: this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), vol: 0.8, ref: 2, rate: 0.9 + Math.random() * 0.3 }); }
    }
  }

  /** Centre of the body, for bullets. */
  hitCentre() { return this.pos.clone().add(new THREE.Vector3(0, 0.55, 0)); }

  hiss() { audio.play('hiss', { pos: this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), vol: 1.0, ref: 2.5, rate: 0.85 + Math.random() * 0.2 }); }

  dispose() { this.group.parent?.remove(this.group); }
}
