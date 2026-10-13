// Ajan's AI. Runs only on the authority (single-player client or the room host)
// and is replicated to everyone else as snapshots. A plain state machine:
// dormant -> patrol <-> investigate -> chase -> search -> patrol, plus kill / drag.
import * as THREE from 'three';
import { AJAN } from './config.js';
import { collideCircle, groundAt, lineOfSight, levelOf, segmentBlockers, inStairs } from './physics.js';
import { nearestNode, findPath } from './nav.js';
import { angleDiff, clamp } from './util.js';

const tmp = new THREE.Vector3();

export class AjanBrain {
  constructor(game, rnd) {
    this.game = game;
    this.house = game.house;
    this.rnd = rnd;
    this.pos = new THREE.Vector3(17, 0, 4);
    this.ry = 0;
    this.speed = 0;
    this.state = 'dormant';
    this.stateT = 0;
    this.dormantLeft = AJAN.dormant;
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.target = null; // player id being chased
    this.lastSeen = null;
    this.lastSeenT = 0;
    this.awareness = new Map();
    this.visionT = 0;
    this.pauseT = 0;
    this.searchPoints = [];
    this.cooldown = 0;
    this.stuckT = 0;
    this.lastPos = this.pos.clone();
    this.anim = 'move';
    this.animT = 0;
    this.headYaw = 0;
    this.lastPatrol = null;
    this.dragHide = null;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    this.game.onAjanState?.(s);
  }

  snapshot() {
    return {
      x: +this.pos.x.toFixed(3), y: +this.pos.y.toFixed(3), z: +this.pos.z.toFixed(3), ry: +this.ry.toFixed(3),
      sp: +this.speed.toFixed(2), st: this.state, m: this.anim, mt: +this.animT.toFixed(2), hy: +this.headYaw.toFixed(2),
    };
  }

  // ------------------------------------------------------------ perception
  candidates() {
    return [...this.game.players.values()].filter(p => p.alive && !p.escaped && !p.dying && p.pos);
  }

  canSee(p) {
    if (p.hidden) return false;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) + Math.abs(p.pos.y - this.pos.y) * 0.5;
    let range = 13;
    if (p.flash) range = 20;
    else if (!this.house.power) range = 9;
    if (p.crouch && !p.flash) range *= 0.6;
    if (d > range) return false;
    const ang = Math.abs(angleDiff(this.ry, Math.atan2(dx, dz)));
    if (ang > 1.1 && d > 2.2) return false;
    return lineOfSight(this.pos, p.pos, this.house.colliders);
  }

  /** A noise event from anywhere in the house. */
  hear(n) {
    if (this.state === 'dormant' || this.state === 'kill' || this.state === 'drag') return;
    const d = Math.hypot(n.pos.x - this.pos.x, n.pos.z - this.pos.z);
    let r = n.radius;
    if (levelOf(n.pos.y) !== levelOf(this.pos.y) && !inStairs(n.pos) && !inStairs(this.pos)) r *= 0.35;
    const walls = segmentBlockers(this.pos.x, this.pos.z, n.pos.x, n.pos.z, Math.max(n.pos.y, this.pos.y) + 1.2, this.house.colliders, { max: 4 });
    r *= Math.pow(0.62, walls);
    if (d > r) return;
    if (this.state === 'chase') {
      if (n.pid && n.pid === this.target) { this.lastSeen = n.pos.clone(); this.lastSeenT = 0; }
      return;
    }
    // Only an approximate location: error grows with distance and walls.
    const err = Math.min(3.5, d * 0.12 + walls * 0.6);
    const a = this.rnd() * Math.PI * 2;
    const guess = new THREE.Vector3(n.pos.x + Math.cos(a) * err * this.rnd(), n.pos.y, n.pos.z + Math.sin(a) * err * this.rnd());
    const loud = n.radius / Math.max(1, d);
    if (this.state === 'investigate' && this.goal && loud < this.goalLoud * 0.8) return;
    this.goalLoud = loud;
    const wasPatrol = this.state === 'patrol';
    this.setState('investigate');
    this.pauseT = wasPatrol ? 0.6 : 0;
    this.moveTo(guess);
    if (loud > 2.5 && this.rnd() < 0.5) this.game.ajanSound('growl');
  }

  // ------------------------------------------------------------- movement
  moveTo(p) {
    const cols = this.house.colliders;
    const from = nearestNode(this.house.nav, this.pos, cols);
    const to = nearestNode(this.house.nav, p, cols);
    this.goal = p.clone();
    if (!from || !to) { this.path = null; return false; }
    const path = findPath(this.house.nav, from.id, to.id, id => !this.house.doors.get(id)?.locked);
    if (!path) { this.path = null; return false; }
    this.path = path.map(id => { const n = this.house.nav.byId[id]; return { x: n.x, y: n.y, z: n.z, id }; });
    // Only walk the last stretch off-graph if it's actually clear.
    const last = this.path[this.path.length - 1];
    const clear = segmentBlockers(last.x, last.z, p.x, p.z, last.y + 0.6, cols, { pad: AJAN.radius, occludeOnly: false, max: 1 }) === 0;
    if (clear && Math.abs(p.y - last.y) < 1.2) this.path.push({ x: p.x, y: p.y, z: p.z, id: null });
    this.pathIdx = 0;
    // Skip the first node if we're already past it
    if (this.path.length > 2) {
      const a = this.path[0], b = this.path[1];
      if (Math.hypot(b.x - this.pos.x, b.z - this.pos.z) < Math.hypot(b.x - a.x, b.z - a.z)) this.pathIdx = 1;
    }
    return true;
  }

  step(dt, speed) {
    if (!this.path || this.pathIdx >= this.path.length) { this.speed = 0; return true; }
    const wp = this.path[this.pathIdx];
    // Doors along the way: open them (loudly) when close.
    if (this.pathIdx > 0) {
      const prev = this.path[this.pathIdx - 1];
      const e = prev.id && this.house.nav.byId[prev.id]?.edges.find(x => x.to === wp.id);
      if (e?.door) {
        const door = this.house.doors.get(e.door);
        if (door && !door.open && !door.locked) {
          const dd = Math.hypot(door.center.x - this.pos.x, door.center.z - this.pos.z);
          if (dd < 1.7) { this.game.hostSetDoor(e.door, true, 'ajan'); this.pauseT = 0.35; }
        }
      }
    }
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < (wp.id ? 0.55 : 0.35)) { this.pathIdx++; return this.pathIdx >= this.path.length; }
    this.faceTo(Math.atan2(dx, dz), dt, 6);
    this.advance(dt, speed, dx / d, dz / d);
    return false;
  }

  faceTo(target, dt, rate) {
    const diff = angleDiff(this.ry, target);
    this.ry += clamp(diff, -rate * dt, rate * dt);
  }

  advance(dt, speed, nx, nz) {
    // Slow down for sharp turns
    const v = speed;
    this.pos.x += nx * v * dt;
    this.pos.z += nz * v * dt;
    collideCircle(this.pos, AJAN.radius, AJAN.height, this.house.colliders);
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);
    this.speed = v;
  }

  // --------------------------------------------------------------- update
  update(dt) {
    this.stateT += dt;
    this.animT += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    this.speed = 0;
    if (this.state === 'dormant') {
      this.dormantLeft -= dt;
      this.pos.set(17, -50, 4);
      if (this.dormantLeft <= 0) {
        this.pos.set(17.6, 0, 3.6);
        this.ry = Math.PI;
        this.setState('patrol');
        this.game.ajanSound('roar');
        this.pickPatrol();
      }
      return;
    }
    if (this.state === 'kill') { this.anim = this.anim || 'grab'; return; }

    // Vision
    this.visionT -= dt;
    if (this.visionT <= 0) {
      this.visionT = 0.12;
      this.look(0.12);
    }

    if (this.pauseT > 0) {
      this.pauseT -= dt;
      this.anim = this.state === 'patrol' || this.state === 'search' ? 'search' : 'move';
      this.headYaw = Math.sin(this.stateT * 1.5) * 0.6;
      return;
    }
    this.headYaw *= 0.9;
    this.anim = 'move';

    switch (this.state) {
      case 'patrol':
        if (this.step(dt, AJAN.patrol)) { this.pauseT = 1 + this.rnd() * 2.5; this.pickPatrol(); }
        break;
      case 'investigate':
        if (this.step(dt, AJAN.investigate)) {
          this.pauseT = 2 + this.rnd() * 1.5;
          this.beginSearch(this.goal, 2);
        }
        break;
      case 'search':
        if (this.step(dt, AJAN.search)) {
          this.pauseT = 1.2 + this.rnd();
          const next = this.searchPoints.shift();
          if (next) this.moveTo(next);
          else { this.setState('patrol'); this.pickPatrol(); }
        }
        break;
      case 'chase':
        this.updateChase(dt);
        break;
      case 'drag':
        this.updateDrag(dt);
        break;
    }

    // Stuck detection → repath
    this.stuckT += dt;
    if (this.stuckT > 1.5) {
      const moved = this.pos.distanceTo(this.lastPos);
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
      if (moved < 0.15 && this.pauseT <= 0 && this.state !== 'chase' && this.state !== 'drag') {
        this.stuckCount = (this.stuckCount || 0) + 1;
        if (this.state === 'patrol' || this.stuckCount > 2) {
          this.stuckCount = 0;
          this.setState('patrol');
          this.pickPatrol();
        } else if (this.goal) this.moveTo(this.goal);
      } else if (moved >= 0.15) this.stuckCount = 0;
    }
  }

  look(dt) {
    if (this.state === 'drag' || this.cooldown > 0) return;
    let best = null, bestD = Infinity;
    for (const p of this.candidates()) {
      const seen = this.canSee(p);
      let a = this.awareness.get(p.id) || 0;
      if (seen) {
        const d = p.pos.distanceTo(this.pos);
        a += dt * (d < 4 ? 6 : d < 8 ? 2.6 : 1.3) * (p.run ? 1.5 : 1);
        if (d < bestD && a >= 1) { best = p; bestD = d; }
      } else a = Math.max(0, a - dt * 0.35);
      this.awareness.set(p.id, Math.min(1.5, a));
    }
    if (best) {
      if (this.state !== 'chase' || this.target !== best.id) {
        if (this.state !== 'chase') this.game.ajanSound('roar');
        this.target = best.id;
        this.setState('chase');
        this.pauseT = 0;
      }
      this.lastSeen = best.pos.clone();
      this.lastSeenT = 0;
    }
  }

  updateChase(dt) {
    const p = this.game.players.get(this.target);
    this.lastSeenT += dt;
    if (!p || !p.alive || p.escaped || p.dying) { this.loseTarget(); return; }
    // If they hid while we were watching closely, go and drag them out.
    if (p.hidden) {
      if (p.hideSeen) { this.beginDrag(p); return; }
      this.loseTarget();
      return;
    }
    const visible = this.lastSeenT < 0.3;
    // Short memory: keep heading toward a live position for a moment after LOS breaks.
    if (this.lastSeenT < 1.0) this.lastSeen = p.pos.clone();
    const tgt = this.lastSeen;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const sameLvl = Math.abs(p.pos.y - this.pos.y) < 1.2;
    if (visible && d < AJAN.catchDist && sameLvl) {
      this.game.hostStartKill(p.id);
      return;
    }
    const direct = visible && segmentBlockers(this.pos.x, this.pos.z, tgt.x, tgt.z, this.pos.y + 0.6, this.house.colliders, { pad: 0.3, occludeOnly: false, max: 1 }) === 0;
    if (direct) {
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
      const dd = Math.hypot(dx, dz) || 1;
      this.faceTo(Math.atan2(dx, dz), dt, 7);
      this.advance(dt, AJAN.chase, dx / dd, dz / dd);
      this.path = null;
    } else {
      if (!this.path || this.repathT === undefined || (this.repathT -= dt) <= 0) {
        this.moveTo(tgt);
        this.repathT = 0.6;
      }
      const done = this.step(dt, AJAN.chase * 0.92);
      if (done && this.lastSeenT > 1.0) this.loseTarget();
    }
    if (this.lastSeenT > 7) this.loseTarget();
  }

  loseTarget() {
    const where = this.lastSeen || this.pos.clone();
    this.target = null;
    this.awareness.clear();
    this.beginSearch(where, 3);
  }

  beginSearch(center, count) {
    this.setState('search');
    this.searchPoints = [];
    const nodes = this.house.nav.nodes.filter(n => Math.hypot(n.x - center.x, n.z - center.z) < 9 && levelOf(n.y) === levelOf(center.y));
    for (let i = 0; i < count && nodes.length; i++) {
      const n = nodes.splice(Math.floor(this.rnd() * nodes.length), 1)[0];
      this.searchPoints.push(new THREE.Vector3(n.x, n.y, n.z));
    }
    this.moveTo(center);
  }

  beginDrag(p) {
    const spot = this.house.hides.get(p.hideId);
    if (!spot) { this.loseTarget(); return; }
    this.dragHide = { pid: p.id, spot };
    this.setState('drag');
    this.moveTo(spot.exit);
  }

  updateDrag(dt) {
    const { pid, spot } = this.dragHide;
    const p = this.game.players.get(pid);
    if (!p || !p.alive || !p.hidden) { this.dragHide = null; this.loseTarget(); return; }
    const d = Math.hypot(spot.exit.x - this.pos.x, spot.exit.z - this.pos.z);
    if (d < 0.9 || this.step(dt, AJAN.chase * 0.8)) {
      this.faceTo(Math.atan2(spot.inside.x - this.pos.x, spot.inside.z - this.pos.z), dt, 10);
      this.game.hostDragOut(pid);
      this.dragHide = null;
    }
  }

  pickPatrol() {
    const cols = this.house.colliders;
    const here = nearestNode(this.house.nav, this.pos, cols);
    const passable = id => !this.house.doors.get(id)?.locked;
    this.recent = this.recent || [];
    let nodes = this.house.patrolNodes.filter(id => {
      const n = this.house.nav.byId[id];
      if (id === this.lastPatrol || Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 3) return false;
      return !here || !!findPath(this.house.nav, here.id, id, passable);
    });
    // Prefer rooms he hasn't checked recently so the whole house gets covered.
    const fresh = nodes.filter(id => !this.recent.includes(this.house.nav.byId[id].room));
    if (fresh.length) nodes = fresh;
    if (!nodes.length) { this.pauseT = 2; return; }
    let choice = null;
    // Mild "director": sometimes wander toward a region where somebody is,
    // without knowing anyone's exact position.
    const alive = this.candidates();
    if (alive.length && this.rnd() < 0.35) {
      const p = alive[Math.floor(this.rnd() * alive.length)];
      const near = nodes.filter(id => {
        const n = this.house.nav.byId[id];
        return Math.hypot(n.x - p.pos.x, n.z - p.pos.z) < 12 && levelOf(n.y) === levelOf(p.pos.y);
      });
      if (near.length) choice = near[Math.floor(this.rnd() * near.length)];
    }
    if (!choice) choice = nodes[Math.floor(this.rnd() * nodes.length)];
    this.lastPatrol = choice;
    const n = this.house.nav.byId[choice];
    this.recent.push(n.room);
    if (this.recent.length > 4) this.recent.shift();
    if (!this.moveTo(tmp.set(n.x, n.y, n.z).clone())) this.path = null;
  }

  /** Called by the kill sequence once finished. */
  finishKill() {
    this.cooldown = 5;
    this.awareness.clear();
    this.target = null;
    this.anim = 'move';
    this.setState('patrol');
    this.pauseT = 1.5;
    this.pickPatrol();
  }
}
