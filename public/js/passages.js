// Secret passages and peepholes.
//  - Three bookcase doors (library ↔ nursery, wardrobe ↔ laundry, chapel ↔ studio) are
//    locked until someone finds their trigger: a red book that sticks out, a coat hook,
//    a candlestick. Once open they're ordinary doors, and the monsters use them too.
//  - Every door that opens onto a hallway has a peephole on its room side. Looking through
//    shows the real hall through a fish-eye. Watch long enough while a monster patrols
//    nearby and it comes right up to the door, grins into the lens, and walks off.
//    Patrolling monsters also stop now and then to stare into a peephole.
import * as THREE from 'three';
import { audio } from './audio.js';
import { DOORS, LEVELS, levelIndex } from './layout.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GY = LEVELS[1].y, UY = LEVELS[2].y, AY = LEVELS[3].y;
const TRIGGERS = [
  { door: 'd_secret_lib', pos: V(12.0, UY + 1.32, 20.36), label: 'PULL THE RED BOOK', make: 'book' },
  { door: 'd_secret_wardrobe', pos: V(7.9, GY + 1.7, 5.6), label: 'PULL THE COAT HOOK', make: 'hook' },
  { door: 'd_secret_chapel', pos: V(15.7, AY + 1.06, 0.5), label: 'TWIST THE CANDLESTICK', make: 'candle' },
];
// hallway lines: [line c, level y, which side is the hall (+1: z > c)]
const HALL_LINES = [[8, GY, 1], [11, GY, -1], [8, UY, 1], [11, UY, -1], [5.6, AY, 1], [5, GY, 1], [7, GY, -1], [5, UY, 1], [7, UY, -1]];
const PEEP_SCARE_AFTER = 20;

export class Passages {
  constructor(game) {
    this.game = game;
    this.peep = null;              // local: { hole, t }
    this.peepers = new Map();      // host: pid -> { hole, since }
    this.scareCooldown = new Map(); // host: pid -> time
    this.stareT = 3;
  }

  init() {
    const G = this.game, H = G.house;
    const g = this.group = new THREE.Group();
    H.group.add(g);
    // ---- secret triggers
    for (const t of TRIGGERS) {
      let m;
      if (t.make === 'book') m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.2), new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.7 }));
      else if (t.make === 'hook') m = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI * 1.3), H.M.brass || H.M.metal);
      else m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.3, 10), H.M.brass || H.M.metal);
      m.position.copy(t.pos);
      g.add(m);
      t.mesh = m;
      H.register('secret_' + t.door, 'secret', [m], t.pos.clone(), { trigger: t });
    }
    // ---- peepholes on every door that faces a hallway
    this.holes = [];
    for (const d of DOORS) {
      if (d.line !== 'x' || d.exit || d.secret || d.ajanOnly) continue;
      const hl = HALL_LINES.find(([c, y]) => Math.abs(d.c - c) < 0.01 && Math.abs(d.y - y) < 0.01);
      if (!hl) continue;
      const side = hl[2]; // +1: the hall is on the +z side
      const cx = d.a0 + d.w * 0.5;
      const hole = { door: d.id, y: d.y, side, eye: V(cx, d.y + 1.55, d.c + side * 0.09), look: V(cx, d.y + 1.4, d.c + side * 4), hall: V(cx, d.y, d.c + side * 0.75) };
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), H.M.brass || H.M.metal);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(cx, d.y + 1.55, d.c);
      // the lens sits in the door leaf, so it swings with it (it's on the door, not the wall)
      const door = H.doors.get(d.id);
      door?.pivot.worldToLocal(lens.position);
      door?.pivot.add(lens);
      const pick = H.pickBox(cx - 0.25, d.y + 1.25, d.c - side * 0.28 - 0.1, cx + 0.25, d.y + 1.85, d.c - side * 0.28 + 0.1);
      H.register('peep_' + d.id, 'peephole', [pick], V(cx, d.y + 1.55, d.c - side * 0.2), { hole });
      this.holes.push(hole);
    }
    // the fish-eye overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'peepView';
    document.getElementById('hud')?.appendChild(this.overlay);
    this.onKey = e => {
      if (!this.peep) return;
      if (['KeyE', 'Escape', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); this.leavePeep(); }
    };
    addEventListener('keydown', this.onKey, true);
  }

  // ------------------------------------------------------------ prompts / input
  prompt(it) {
    if (it.kind === 'secret') return this.game.house.doors.get(it.trigger.door)?.locked ? `E — ${it.trigger.label}` : null;
    if (it.kind === 'peephole') return this.game.house.doors.get(it.hole.door)?.open ? null : 'E — LOOK THROUGH THE PEEPHOLE';
    return null;
  }

  interact(it) {
    const G = this.game;
    if (it.kind === 'secret') {
      if (!G.house.doors.get(it.trigger.door)?.locked) return true;
      G.local.act?.();
      G.request({ k: 'secret', id: it.trigger.door });
      return true;
    }
    if (it.kind === 'peephole') {
      if (G.house.doors.get(it.hole.door)?.open || G.local.hidden || G.local.frozen) return true;
      this.enterPeep(it.hole);
      return true;
    }
    return false;
  }

  enterPeep(hole) {
    const G = this.game;
    this.peep = { hole, t: 0, fov: G.camera.fov };
    G.local.frozen = true;
    G.camera.fov = 118;
    G.camera.updateProjectionMatrix();
    this.overlay.classList.add('show');
    document.getElementById('hud')?.classList.add('peeping');
    audio.play('creak', { vol: 0.25, rate: 1.6 });
    G.request({ k: 'peep', id: hole.door, on: true });
  }

  leavePeep() {
    const G = this.game;
    if (!this.peep) return;
    G.camera.fov = this.peep.fov;
    G.camera.updateProjectionMatrix();
    this.peep = null;
    G.local.frozen = false;
    this.overlay.classList.remove('show', 'scare');
    document.getElementById('hud')?.classList.remove('peeping');
    G.request({ k: 'peep', on: false });
  }

  // ------------------------------------------------------------ host
  request(pid, r) {
    const G = this.game;
    if (r.k === 'secret') {
      const d = G.house.doors.get(r.id);
      const t = TRIGGERS.find(q => q.door === r.id);
      if (!d || !t || !d.locked) return true;
      const p = G.players.get(pid);
      if (!p || p.pos.distanceTo(t.pos) > 3.5) return true;
      G.broadcast({ k: 'secretopen', id: r.id, by: pid });
      G.hostNoise(d.center, 7, 'secret', pid);
      return true;
    }
    if (r.k === 'peep') {
      if (r.on) { const hole = this.holes.find(h => h.door === r.id); if (hole) this.peepers.set(pid, { hole, since: G.time }); }
      else this.peepers.delete(pid);
      return true;
    }
    return false;
  }

  event(e) {
    const G = this.game;
    if (e.k === 'secretopen') {
      const d = G.house.doors.get(e.id);
      if (!d) return true;
      d.locked = false;
      G.house.setDoor(e.id, true);
      audio.play('creak', { pos: d.center, vol: 1, ref: 3, rate: 0.6 });
      audio.play('drawer', { pos: d.center, vol: 0.8, ref: 3, rate: 0.5 });
      const t = TRIGGERS.find(q => q.door === e.id);
      if (t?.mesh) t.mesh.rotation.z += 0.5;
      if (e.by === G.localId) G.message('Something clicks. The bookcase swings away from the wall — a hidden passage.', 4);
      return true;
    }
    if (e.k === 'peepscare') {
      if (e.pid === G.localId && this.peep) {
        audio.play('sting', { vol: 1.3, limit: true });
        audio.play('roar', { vol: 0.9, rate: 1.3 });
        G.post?.glitch(1.4);
        this.overlay.classList.add('scare');
        setTimeout(() => this.overlay.classList.remove('scare'), 600);
      }
      return true;
    }
    return false;
  }

  /** Host, every frame: peephole scares and monsters pausing to stare into peepholes. */
  hostUpdate(dt) {
    const G = this.game;
    if (!G.brains) return;
    for (const [pid, pe] of this.peepers) {
      const p = G.players.get(pid);
      if (!p || !p.alive || p.dying) { this.peepers.delete(pid); continue; }
      if (G.time - pe.since < PEEP_SCARE_AFTER || (this.scareCooldown.get(pid) || -1e9) > G.time - 60) continue;
      const b = G.brains.find(m => ['patrol', 'search', 'investigate'].includes(m.state) && levelIndex(m.pos.y) === levelIndex(pe.hole.y + 0.5) && m.pos.distanceTo(pe.hole.hall) < 10);
      if (!b) continue;
      this.scareCooldown.set(pid, G.time);
      b.startPeepScare(pe.hole, pid);
    }
    // now and then a patrolling monster passing a peephole stops and stares into it
    this.stareT -= dt;
    if (this.stareT <= 0) {
      this.stareT = 1.5;
      for (const b of G.brains) {
        if (b.state !== 'patrol' || b.pauseT > 0) continue;
        const hole = this.holes.find(h => Math.abs(h.y - b.pos.y) < 0.5 && Math.hypot(h.hall.x - b.pos.x, h.hall.z - b.pos.z) < 1.3);
        if (hole && b.rnd() < 0.35) { b.pauseT = 2; b.ry = hole.side > 0 ? Math.PI : 0; b.anim = 'inspect'; b.animT = 0; }
      }
    }
  }

  update(dt) {
    const G = this.game;
    if (G.isHost) this.hostUpdate(dt);
    if (!this.peep) return;
    this.peep.t += dt;
    const h = this.peep.hole, cam = G.camera;
    cam.position.copy(h.eye);
    cam.lookAt(h.look.x + Math.sin(G.time * 0.4) * 0.3, h.look.y, h.look.z);
    G.local.hands.visible = false;
    G.local.light.intensity = 0;
    if (G.me?.dying || G.localDead || G.house.doors.get(h.door)?.open) this.leavePeep();
  }

  dispose() {
    removeEventListener('keydown', this.onKey, true);
    this.overlay?.remove();
    document.getElementById('hud')?.classList.remove('peeping');
  }
}
