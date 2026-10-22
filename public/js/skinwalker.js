// The skinwalker: a rare thing (5 % chance, rolled once per round by the host) that wears
// the face, clothes and name of one of the players. It doesn't hunt like Ajan. It finds
// someone, stands still and stares at them, then walks toward them slowly and silently,
// never looking away. Up close its mouth splits and a long tongue lashes out, drags the
// victim in and eats them (through the normal death / respawn rules).
// Ajan won't go for a victim the skinwalker is facing at close range.
import * as THREE from 'three';
import { audio } from './audio.js';
import { Avatar } from './avatar.js';
import { playerSpec } from './assets.js';
import { nearestNode, findPath } from './nav.js';
import { collideCircle, groundAt, lineOfSight, levelOf } from './physics.js';
import { isSafeZone } from './layout.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const SKIN_CHANCE = 0.05;
const WALK = 1.25, CREEP = 0.85, REACH = 2.4, SIGHT = 22;

export class Skinwalker {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.snap = null;
    this.vis = null;
  }

  // ------------------------------------------------------------ host
  /** Called once when the round starts (host only): one roll per round, never again. */
  hostRoll() {
    if (this.rolled) return;
    this.rolled = true;
    if (this.game.freePlay || Math.random() >= SKIN_CHANCE) return;
    this.spawnAt = this.game.time + 45 + Math.random() * 60;
  }

  /** Host: bring it into the house, wearing `copy`'s appearance (a random player if null). */
  hostSpawn(copy = null) {
    const G = this.game, H = G.house;
    if (this.active) return;
    const ps = [...G.players.values()].filter(p => p.alive && !p.escaped);
    const who = G.players.get(copy) || ps[Math.floor(Math.random() * ps.length)];
    if (!who) return;
    // start on a patrol point well away from everyone
    const nodes = H.patrolNodes.map(id => H.nav.byId[id]).filter(n => ps.every(p => Math.hypot(n.x - p.pos.x, n.z - p.pos.z) > 15 || levelOf(n.y) !== levelOf(p.pos.y)));
    const n = nodes[Math.floor(Math.random() * nodes.length)] || H.nav.byId[H.patrolNodes[0]];
    G.broadcast({ k: 'skin', s: 'spawn', copy: who.id, x: n.x, y: n.y, z: n.z });
    this.brain = { pos: V(n.x, n.y, n.z), ry: 0, state: 'roam', t: 0, target: null, path: null, idx: 0, lost: 0, speed: 0 };
    this.pickRoam();
  }

  pickRoam() {
    const H = this.game.house, b = this.brain;
    const id = H.patrolNodes[Math.floor(Math.random() * H.patrolNodes.length)];
    this.routeTo(V().copy(H.nav.byId[id]));
    b.state = 'roam';
  }

  routeTo(p) {
    const H = this.game.house, b = this.brain;
    const a = nearestNode(H.nav, b.pos, H.colliders), z = nearestNode(H.nav, p, H.colliders);
    const path = a && z && findPath(H.nav, a.id, z.id, id => !H.doors.get(id)?.locked);
    b.path = path ? path.map(id => V().copy(H.nav.byId[id])).concat([p.clone()]) : null;
    b.idx = 0;
  }

  /** Walk along the path at `speed`; facing `faceAt` if given (it keeps its eyes on you). */
  walk(dt, speed, faceAt = null) {
    const H = this.game.house, b = this.brain;
    if (!b.path || b.idx >= b.path.length) { b.speed = 0; return true; }
    const wp = b.path[b.idx];
    const dx = wp.x - b.pos.x, dz = wp.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.45) { b.idx++; return b.idx >= b.path.length; }
    // doors on the way open quietly
    for (const door of H.doors.values()) if (!door.open && !door.locked && door.center && Math.hypot(door.center.x - b.pos.x, door.center.z - b.pos.z) < 1.2 && Math.abs(door.center.y - 1.1 - b.pos.y) < 1) this.game.hostSetDoor(door.id, true, 'ajan');
    b.pos.x += dx / d * speed * dt;
    b.pos.z += dz / d * speed * dt;
    collideCircle(b.pos, 0.3, 1.75, H.colliders, 'ajan');
    b.pos.y += (groundAt(b.pos.x, b.pos.z, b.pos.y) - b.pos.y) * Math.min(1, dt * 12);
    const look = faceAt ? Math.atan2(faceAt.x - b.pos.x, faceAt.z - b.pos.z) : Math.atan2(dx, dz);
    b.ry += Math.atan2(Math.sin(look - b.ry), Math.cos(look - b.ry)) * Math.min(1, dt * 5);
    b.speed = speed;
    return false;
  }

  seen(p) {
    const b = this.brain;
    if (!p.alive || p.dying || p.escaped || p.hidden || p.restrained || isSafeZone(p.pos)) return false;
    if (levelOf(p.pos.y) !== levelOf(b.pos.y) || p.pos.distanceTo(b.pos) > SIGHT) return false;
    return lineOfSight(b.pos, p.pos, this.game.house.colliders);
  }

  hostUpdate(dt) {
    const G = this.game;
    if (!this.active && this.spawnAt && G.time >= this.spawnAt) { this.spawnAt = 0; this.hostSpawn(); }
    const b = this.brain;
    if (!b || !this.active) return;
    b.t += dt;
    const target = b.target && G.players.get(b.target);
    if (b.state === 'roam') {
      if (this.walk(dt, WALK)) this.pickRoam();
      const p = [...G.players.values()].find(q => this.seen(q));
      if (p) { b.state = 'stare'; b.target = p.id; b.t = 0; b.stareFor = 6 + Math.random() * 4; b.speed = 0; }
    } else if (b.state === 'stare') {
      // stands perfectly still and stares
      b.speed = 0;
      if (!target || !this.seen(target)) { b.lost += dt; if (b.lost > 3) { b.lost = 0; b.target = null; this.pickRoam(); } return; }
      b.lost = 0;
      const look = Math.atan2(target.pos.x - b.pos.x, target.pos.z - b.pos.z);
      b.ry += Math.atan2(Math.sin(look - b.ry), Math.cos(look - b.ry)) * Math.min(1, dt * 3);
      if (b.t > b.stareFor) { b.state = 'approach'; b.t = 0; this.routeTo(target.pos); }
    } else if (b.state === 'approach') {
      if (!target || !target.alive || target.dying || target.hidden || isSafeZone(target.pos)) { b.target = null; this.pickRoam(); return; }
      if (this.seen(target)) b.lost = 0; else b.lost += dt;
      if (b.lost > 5) { b.target = null; this.pickRoam(); return; }
      if ((b.repath = (b.repath || 0) - dt) <= 0) { b.repath = 1; this.routeTo(target.pos); }
      this.walk(dt, CREEP, target.pos);
      if (target.pos.distanceTo(b.pos) < REACH && b.lost === 0) this.hostEat(target);
    } else if (b.state === 'eat') {
      b.speed = 0;
      if (b.t > 4) { b.target = null; this.pickRoam(); }
    }
    this.sendT = (this.sendT || 0) - dt;
    if (this.sendT <= 0) {
      this.sendT = 0.1;
      this.snap = { x: +b.pos.x.toFixed(2), y: +b.pos.y.toFixed(2), z: +b.pos.z.toFixed(2), ry: +b.ry.toFixed(2), sp: +b.speed.toFixed(2), st: b.state, tg: b.target };
      if (G.net.online) G.net.vsend('k', this.snap);
    }
  }

  /** Host: the tongue. The victim dies (or, with lives left, wakes up later in a capture room). */
  hostEat(p) {
    const G = this.game, b = this.brain;
    if (p.dying || G.freePlay || p.highUntil > G.time) return;
    b.state = 'eat'; b.t = 0;
    p.dying = true;
    const left = G.lives.get(p.id) ?? 0;
    const final = left <= 0;
    if (!final) G.lives.set(p.id, left - 1);
    G.broadcast({ k: 'skin', s: 'eat', pid: p.id, final, lives: G.lives.get(p.id) });
    G.dropItems(p.id, p.pos);
    setTimeout(() => {
      if (G.disposed) return;
      if (final) { G.broadcast({ k: 'dead', pid: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z }); G.checkEnd(); return; }
      const spot = G.extras.pickSpot(p.id);
      G.hostRevive(p.id, { id: spot.id, final: false });
    }, 2600);
  }

  /** Ajan's wariness: is the skinwalker right in front of this player, facing them? */
  facing(p) {
    const b = this.active && this.brain;
    if (!b || !p?.pos) return false;
    const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d > 3 || Math.abs(p.pos.y - b.pos.y) > 1) return false;
    return (Math.sin(b.ry) * dx + Math.cos(b.ry) * dz) / (d || 1) > 0.7;
  }

  // ------------------------------------------------------------ all clients
  event(e) {
    if (e.k !== 'skin') return false;
    const G = this.game;
    if (e.s === 'spawn') this.spawnVisual(e);
    else if (e.s === 'eat') this.startEat(e);
    return true;
  }

  spawnVisual(e) {
    const G = this.game;
    const who = G.players.get(e.copy);
    this.active = true;
    this.copyName = who?.name || 'STRANGER';
    // wears the copied player's model, clothes and name
    this.av = new Avatar('player', G.playerGLTF, { shirt: who?.shirt, pants: who?.pants, spec: playerSpec() });
    G.scene.add(this.av.group);
    this.vis = { pos: V(e.x, e.y, e.z), ry: 0, sp: 0, st: 'roam' };
    this.label = document.createElement('div');
    this.label.className = 'nameLabel';
    this.label.innerHTML = `<span class="mic">&#127908;</span><span class="nm">${this.copyName.replace(/[<>&]/g, '')}</span>`;
    document.getElementById('labels')?.appendChild(this.label);
    // the tongue: a tube that is rebuilt along a wiggling curve while it lashes out
    this.tongueMat = new THREE.MeshStandardMaterial({ color: 0x9a2a3a, roughness: 0.35, metalness: 0.05, emissive: 0x200408 });
    this.tongue = new THREE.Mesh(new THREE.BufferGeometry(), this.tongueMat);
    this.tongue.visible = false;
    G.scene.add(this.tongue);
  }

  startEat(e) {
    const G = this.game;
    const p = G.players.get(e.pid);
    if (!p) return;
    this.eat = { pid: e.pid, t: 0, final: e.final, start: p.pos.clone() };
    p.dying = true;
    if (p.isLocal) {
      G.lives.set(e.pid, e.lives);
      G.local.frozen = true;
      if (G.local.hidden) { G.local.hidden = null; document.getElementById('hideOverlay')?.classList.remove('show'); }
      G.post.vhs.uniforms.redFlash.value = 0.6;
      G.post.glitch(2);
    }
    if (p.label) p.label.style.opacity = 0;
    const at = this.vis.pos.clone().add(V(0, 1.6, 0));
    audio.play('skintongue', { pos: at, vol: 1.3, ref: 3, limit: true });
    audio.play('skinscream', { pos: at, vol: 1.2, ref: 4, limit: true, delay: 0.25 });
  }

  update(dt) {
    const G = this.game;
    if (G.isHost) this.hostUpdate(dt);
    if (!this.active || !this.av) return;
    const s = G.isHost ? this.snap : this.netSnap;
    if (s) {
      const tp = V(s.x, s.y, s.z);
      if (this.vis.pos.distanceTo(tp) > 4) this.vis.pos.copy(tp); else this.vis.pos.lerp(tp, 1 - Math.exp(-dt * 10));
      this.vis.ry = s.ry; this.vis.sp = s.sp; this.vis.st = s.st;
    }
    const av = this.av, v = this.vis;
    av.group.position.copy(v.pos);
    av.group.rotation.y = v.ry;
    // moves just a little too smoothly: no arm swing, no head bob
    av.state = { speed: v.sp * 0.6, crouch: 0, run: false, mode: 'normal', interactT: 9, turn: 0, flash: false, pitch: 0 };
    av.update(dt);
    if (v.st === 'stare' || v.st === 'approach') { av.bones.upperL.rotation.set(0, 0, -1.35); av.bones.upperR.rotation.set(0, 0, 1.35); }
    // name label, like a real player's
    const head = av.headTop(V()).add(V(0, 0.25, 0));
    const pr = head.clone().project(G.camera);
    const vis = pr.z < 1 && v.pos.distanceTo(G.camera.position) < 14 && !this.eat;
    this.label.style.opacity = vis ? 1 : 0;
    if (vis) this.label.style.transform = `translate(-50%, -100%) translate(${(pr.x * 0.5 + 0.5) * innerWidth}px, ${(-pr.y * 0.5 + 0.5) * innerHeight}px)`;
    this.updateEat(dt);
  }

  hostTick() { if (this.game.isHost && this.game.phase === 'play') this.hostRoll(); }

  updateEat(dt) {
    const G = this.game, e = this.eat;
    if (!e) { this.tongue.visible = false; return; }
    e.t += dt;
    const p = G.players.get(e.pid);
    const mouth = this.av.mouth(V());
    const victimHead = (p ? e.start.clone() : mouth.clone()).add(V(0, 1.5, 0));
    // 0–0.45 s lash out, 0.45–1.6 s wrap and drag the victim in, then gone
    const out = Math.min(1, e.t / 0.45);
    const pull = Math.max(0, Math.min(1, (e.t - 0.45) / 1.15));
    const tip = mouth.clone().lerp(victimHead.clone().lerp(mouth, pull * 0.92), out);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const k = i / 12, q = mouth.clone().lerp(tip, k);
      q.y += Math.sin(k * Math.PI) * 0.25 * (1 - pull) + Math.sin(e.t * 30 + k * 9) * 0.04 * k;
      q.x += Math.sin(e.t * 23 + k * 7) * 0.05 * k;
      pts.push(q);
    }
    this.tongue.geometry.dispose();
    this.tongue.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.045, 7, false);
    this.tongue.visible = e.t < 1.9;
    if (p) {
      const av = p.avatar;
      av.group.visible = !p.isLocal || this.game.camera.layers.isEnabled(1);
      av.group.position.copy(e.start).lerp(mouth.clone().add(V(0, -1.4, 0)), pull * 0.9);
      av.state = { mode: 'grabbed', speed: 0 };
      av.update(dt);
      av.setDissolve(Math.max(0, (e.t - 1.2) / 0.8));
      if (p.isLocal) {
        const cam = G.camera;
        cam.position.lerp(av.group.position.clone().add(V(0, 1.5, 0)), 0.4);
        cam.lookAt(mouth);
        G.local.hands.visible = false;
      }
      if (e.t > 2.0) { av.group.visible = false; av.setDissolve(0); }
    }
    if (Math.random() < dt * 8 && e.t < 1.6) G.fx.emit(tip, 0.12, 0.3, 4);
    if (e.t > 2.6) this.eat = null;
  }

  dispose() {
    this.label?.remove();
    this.av?.group.parent?.remove(this.av.group);
    this.tongue?.parent?.remove(this.tongue);
  }
}

