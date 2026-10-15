// Ajan's AI. Runs only on the authority (single-player client or the room host)
// and is replicated to everyone else as snapshots. A plain state machine:
//   dormant → patrol ⇄ investigate → search → patrol
//   chase → (kill | drag a seen hider out | lose → search)
//   inspect a hiding spot · nap in his bed · sit facing a wall
// He never plans a path into the attic and ignores anyone inside it.
import * as THREE from 'three';
import { AJAN } from './config.js';
import { collideCircle, groundAt, lineOfSight, levelOf, segmentBlockers, soundTransmission } from './physics.js';
import { isSafeZone, RAMPS, rampHeight } from './layout.js';
import { AJAN_ROUTE, POLE_A, AJAN_POLE_R } from './club.js';
import { nearestNode, findPath } from './nav.js';
import { angleDiff, clamp } from './util.js';

const tmp = new THREE.Vector3();

export class AjanBrain {
  constructor(game, rnd) {
    this.game = game;
    this.house = game.house;
    this.rnd = rnd;
    this.pos = new THREE.Vector3(36.8, -50, 4);
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
    // Idle routines (seconds of active play)
    this.sleepTimer = 180 + rnd() * 60;
    this.sitTimer = 100 + rnd() * 80;
    this.whisperT = 25 + rnd() * 35;
    this.restLeft = 0;
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
    return [...this.game.players.values()].filter(p => p.alive && !p.escaped && !p.dying && p.pos && !isSafeZone(p.pos));
  }

  canSee(p) {
    if (p.hidden || isSafeZone(p.pos)) return false;
    if (this.state === 'sleep' || this.state === 'dormant' || this.state === 'stun') return false;
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

  /**
   * A noise event. Loudness falls off with distance, walls/closed doors and
   * floors (soundTransmission). He only learns an approximate position, except
   * for "exact" sources like a creaking floorboard or a radio.
   */
  hear(n) {
    if (this.state === 'dormant' || this.state === 'kill' || this.state === 'drag' || this.state === 'stun') return;
    if (isSafeZone(n.pos)) return;
    const d = Math.hypot(n.pos.x - this.pos.x, n.pos.z - this.pos.z) + Math.abs(n.pos.y - this.pos.y) * 0.5;
    // Low, booming sources (radio, elevator) carry through walls better than footsteps.
    const tr = soundTransmission(n.pos, this.pos, this.house.colliders, n.kind === 'radio' || n.kind === 'elevator' || n.kind === 'gunshot' ? 0.75 : 0.55);
    let r = n.radius * tr.k;
    r *= this.game.hearMul ?? 1; // difficulty
    if (this.state === 'sleep') r *= 0.4; // dozing: only loud, close noises wake him
    if (d > r) return;
    // A hider making noise right in front of him gives themselves away.
    if (this.state === 'inspect' && this.inspecting && n.pid && this.inspecting.spot.occupant === n.pid && d < 4) {
      const p = this.game.players.get(n.pid);
      if (p) p.hideSeen = true;
      return;
    }
    if (this.state === 'chase') {
      if (n.pid && n.pid === this.target) { this.lastSeen = n.pos.clone(); this.lastSeenT = 0; }
      return;
    }
    if (this.state === 'sleep' || this.state === 'sit') this.wakeUp();
    const err = n.exact ? 0 : Math.min(3.5, d * 0.12 + tr.walls * 0.6 + tr.floors * 1.5);
    const a = this.rnd() * Math.PI * 2;
    const guess = new THREE.Vector3(n.pos.x + Math.cos(a) * err * this.rnd(), n.pos.y, n.pos.z + Math.sin(a) * err * this.rnd());
    const loud = r / Math.max(1, d);
    if (this.state === 'investigate' && this.goal && loud < this.goalLoud * 0.8 && !n.exact) return;
    this.goalLoud = loud;
    const wasCalm = this.state === 'patrol' || this.state === 'sit' || this.state === 'sleep';
    this.inspecting = null;
    this.setState('investigate');
    this.pauseT = wasCalm ? 0.6 : 0;
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
    // Only walk the last stretch off-graph if it's actually clear (and not into the attic).
    const last = this.path[this.path.length - 1];
    const clear = segmentBlockers(last.x, last.z, p.x, p.z, last.y + 0.6, cols, { pad: AJAN.radius, occludeOnly: false, max: 1, who: 'ajan' }) === 0;
    if (clear && Math.abs(p.y - last.y) < 1.2 && !isSafeZone(p)) this.path.push({ x: p.x, y: p.y, z: p.z, id: null });
    this.pathIdx = 0;
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
    this.pos.x += nx * speed * dt;
    this.pos.z += nz * speed * dt;
    collideCircle(this.pos, AJAN.radius, AJAN.height, this.house.colliders, 'ajan');
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);
    this.speed = speed;
  }

  // --------------------------------------------------------------- update
  update(dt) {
    this.stateClock = (this.stateClock || 0) + dt;
    this.stateT += dt;
    this.animT += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    this.speed = 0;
    if (this.state === 'club') { this.updateClub(dt); return; }
    if (this.state === 'dormant') {
      this.dormantLeft -= dt;
      this.pos.set(36.8, -50, 4);
      if (this.dormantLeft <= 0) {
        // He wakes up in his own room upstairs.
        this.pos.copy(this.house.ajanBed.stand);
        this.ry = Math.PI;
        this.setState('patrol');
        this.game.ajanSound('roar');
        this.pickPatrol();
      }
      return;
    }
    if (this.state === 'kill') return;
    if (this.state === 'stun') {
      // Shot: down on the floor, blind and deaf, then back up and furious.
      this.anim = 'stun';
      this.stunLeft -= dt;
      if (this.stunLeft <= 0) {
        this.anim = 'move';
        this.setState('patrol');
        this.pauseT = 1.2;
        this.game.ajanSound('roar');
        this.pickPatrol();
      }
      return;
    }

    this.sleepTimer -= dt;
    this.sitTimer -= dt;
    this.whisperT -= dt;

    if (this.state === 'sleep' || this.state === 'sit') { this.updateRest(dt); return; }

    // Vision
    this.visionT -= dt;
    if (this.visionT <= 0) {
      this.visionT = 0.12;
      this.look(0.12);
    }

    if (this.pauseT > 0) {
      this.pauseT -= dt;
      this.anim = this.state === 'inspect' ? 'inspect' : this.state === 'patrol' || this.state === 'search' ? 'search' : 'move';
      this.headYaw = this.state === 'inspect' ? Math.sin(this.stateT * 0.8) * 0.25 : Math.sin(this.stateT * 1.5) * 0.6;
      if (this.state === 'inspect' && this.pauseT <= 0) this.finishInspect();
      return;
    }
    this.headYaw *= 0.9;
    this.anim = 'move';

    switch (this.state) {
      case 'patrol':
        if (this.whisperT <= 0) { this.whisperT = 30 + this.rnd() * 45; this.game.ajanSound('whisper'); }
        if (this.sleepTimer <= 0) { this.goToBed(); break; }
        if (this.sitTimer <= 0) { this.goToChair(); break; }
        if (this.step(dt, AJAN.patrol)) {
          this.pauseT = 1 + this.rnd() * 2.5;
          if (!(this.rnd() < 0.2 && this.tryInspect(6))) this.pickPatrol();
        }
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
          else if (!(this.rnd() < 0.6 && this.tryInspect(8))) { this.setState('patrol'); this.pickPatrol(); }
        }
        break;
      case 'inspectGo':
        if (this.step(dt, AJAN.search)) this.startInspect();
        break;
      case 'gotobed':
        if (this.step(dt, AJAN.patrol)) this.lieDown();
        break;
      case 'gotochair':
        if (this.step(dt, AJAN.patrol)) this.sitDown();
        break;
      case 'chase':
        this.updateChase(dt);
        break;
      case 'drag':
        this.updateDrag(dt);
        break;
    }

    // Stuck detection → repath / give up
    this.stuckT += dt;
    if (this.stuckT > 1.5) {
      const moved = this.pos.distanceTo(this.lastPos);
      this.lastPos.copy(this.pos);
      this.stuckT = 0;
      if (moved < 0.15 && this.pauseT <= 0 && this.state !== 'chase' && this.state !== 'drag') {
        this.stuckCount = (this.stuckCount || 0) + 1;
        if (this.state === 'patrol' || this.stuckCount > 2) {
          this.stuckCount = 0;
          if (this.state === 'gotobed') this.sleepTimer = 30;
          if (this.state === 'gotochair') this.sitTimer = 60;
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
        this.inspecting = null;
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
    if (!p || !p.alive || p.escaped || p.dying) { this.loseTarget(false); return; }
    // Reached the attic: he stops dead and won't follow.
    if (isSafeZone(p.pos)) { this.loseTarget(true); return; }
    if (p.hidden) {
      if (p.hideSeen) { this.beginDrag(p); return; }
      this.loseTarget(true);
      return;
    }
    const visible = this.lastSeenT < 0.3;
    if (this.lastSeenT < 1.0) this.lastSeen = p.pos.clone();
    const tgt = this.lastSeen;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const sameLvl = Math.abs(p.pos.y - this.pos.y) < 1.2;
    if (visible && d < AJAN.catchDist && sameLvl) {
      this.game.hostStartKill(p.id);
      return;
    }
    const direct = visible && segmentBlockers(this.pos.x, this.pos.z, tgt.x, tgt.z, this.pos.y + 0.6, this.house.colliders, { pad: 0.3, occludeOnly: false, max: 1, who: 'ajan' }) === 0;
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
      if (done && this.lastSeenT > 1.0) this.loseTarget(true);
    }
    if (this.lastSeenT > 7) this.loseTarget(true);
  }

  loseTarget(laugh = true) {
    const where = this.lastSeen && !isSafeZone(this.lastSeen) ? this.lastSeen : this.pos.clone();
    this.target = null;
    this.awareness.clear();
    // Sometimes he laughs quietly to himself when he loses you.
    if (laugh && this.rnd() < 0.6) this.game.ajanSound('laugh');
    this.beginSearch(where, 3);
  }

  beginSearch(center, count) {
    this.setState('search');
    this.searchPoints = [];
    const nodes = this.house.nav.nodes.filter(n => Math.hypot(n.x - center.x, n.z - center.z) < 9 && levelOf(n.y) === levelOf(center.y) && n.edges.length);
    for (let i = 0; i < count && nodes.length; i++) {
      const n = nodes.splice(Math.floor(this.rnd() * nodes.length), 1)[0];
      this.searchPoints.push(new THREE.Vector3(n.x, n.y, n.z));
    }
    this.moveTo(center);
  }

  // ------------------------------------------------------ hiding spots
  /** Walk up to a nearby hiding place and stare at it for a while. */
  tryInspect(radius) {
    const spots = [...this.house.hides.values()].filter(s => levelOf(s.exit.y) === levelOf(this.pos.y) && s.exit.distanceTo(this.pos) < radius);
    if (!spots.length) return false;
    const spot = spots[Math.floor(this.rnd() * spots.length)];
    if (!this.moveTo(spot.exit)) return false;
    this.inspecting = { spot };
    this.setState('inspectGo');
    return true;
  }

  startInspect() {
    const spot = this.inspecting?.spot;
    if (!spot) { this.setState('patrol'); this.pickPatrol(); return; }
    this.ry = Math.atan2(spot.inside.x - this.pos.x, spot.inside.z - this.pos.z);
    this.setState('inspect');
    this.animT = 0;
    this.pauseT = 2.6 + this.rnd() * 1.4;
  }

  finishInspect() {
    const spot = this.inspecting?.spot;
    this.inspecting = null;
    const pid = spot?.occupant;
    const p = pid && this.game.players.get(pid);
    if (p && p.hidden && p.hideSeen) { this.beginDrag(p); return; }
    // Nothing (as far as he knows). He leaves, laughing.
    this.game.ajanSound('laugh');
    this.setState('patrol');
    this.pickPatrol();
  }

  beginDrag(p) {
    const spot = this.house.hides.get(p.hideId);
    if (!spot) { this.loseTarget(false); return; }
    this.dragHide = { pid: p.id, spot };
    this.setState('drag');
    this.moveTo(spot.exit);
  }

  updateDrag(dt) {
    const { pid, spot } = this.dragHide;
    const p = this.game.players.get(pid);
    if (!p || !p.alive || !p.hidden) { this.dragHide = null; this.loseTarget(false); return; }
    const d = Math.hypot(spot.exit.x - this.pos.x, spot.exit.z - this.pos.z);
    if (d < 0.9 || this.step(dt, AJAN.chase * 0.8)) {
      this.faceTo(Math.atan2(spot.inside.x - this.pos.x, spot.inside.z - this.pos.z), dt, 10);
      this.game.hostDragOut(pid);
      this.dragHide = null;
    }
  }

  // ------------------------------------------------------ naps & chairs
  goToBed() {
    const bed = this.house.ajanBed;
    if (!bed || !this.moveTo(bed.stand)) { this.sleepTimer = 30; this.pickPatrol(); return; }
    this.setState('gotobed');
  }

  lieDown() {
    const bed = this.house.ajanBed;
    if (this.pos.distanceTo(bed.stand) > 1.6) { this.sleepTimer = 30; this.setState('patrol'); this.pickPatrol(); return; }
    this.restFrom = bed.stand.clone();
    this.pos.copy(bed.seat);
    this.ry = bed.ry;
    this.restLeft = 30;
    this.anim = 'sleep';
    this.animT = 0;
    this.setState('sleep');
  }

  goToChair() {
    const chairs = this.house.wallChairs.filter(c => levelOf(c.seat.y) === levelOf(this.pos.y) || this.rnd() < 0.5);
    const chair = chairs[Math.floor(this.rnd() * chairs.length)];
    if (!chair || !this.moveTo(chair.front)) { this.sitTimer = 60; this.pickPatrol(); return; }
    this.chair = chair;
    this.setState('gotochair');
  }

  sitDown() {
    const c = this.chair;
    if (!c || this.pos.distanceTo(c.front) > 1.6) { this.sitTimer = 60; this.setState('patrol'); this.pickPatrol(); return; }
    this.restFrom = c.front.clone();
    this.pos.copy(c.seat);
    this.ry = c.ry;
    this.restLeft = 14 + this.rnd() * 12;
    this.anim = 'sit';
    this.animT = 0;
    this.setState('sit');
  }

  updateRest(dt) {
    this.restLeft -= dt;
    this.anim = this.state;
    // Sitting he still watches what's in front of him (the wall, mostly).
    if (this.state === 'sit') {
      this.visionT -= dt;
      if (this.visionT <= 0) { this.visionT = 0.2; this.look(0.2); if (this.state === 'chase') { this.standUp(); return; } }
    }
    if (this.restLeft <= 0) this.wakeUp();
  }

  // ------------------------------------------------------------ the club visit (scripted, host)
  /** Lured by the music: walks to the attic stairs, climbs them, crosses the attic, comes through the club door to his pole. */
  startClub() {
    if (['kill', 'drag'].includes(this.state)) return false;
    this.standUp();
    this.target = null; this.path = null; this.inspecting = null;
    const was = this.state;
    this.setState('club');
    this.clubWp = 0;
    this.clubThen = null;
    this.anim = 'move';
    this.animT = 0;
    // out of the house (dormant)? He comes in from his room like he always does.
    if (was === 'dormant' && this.house.ajanBed) { this.pos.copy(this.house.ajanBed.stand); this.ry = Math.PI; }
    const [x, z] = AJAN_ROUTE[0];
    const foot = new THREE.Vector3(x, this.clubGround(x, z), z);
    this.clubT = 0;
    if (this.pos.distanceTo(foot) > 0.6 && this.moveTo(foot)) this.clubPhase = 'approach';
    else { this.pos.copy(foot); this.clubPhase = 'enter'; }
    return true;
  }

  /** Floor height along the scripted club route: the upstairs hall, the attic stairs, then the attic. */
  clubGround(x, z) {
    const r = RAMPS.find(q => q.id === 'R3');
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 - 0.2 && z <= r.z1 + 0.2) return rampHeight(r, x, z);
    if (x < r.x0 && z < 11) return r.ya;
    return r.yb;
  }

  /** Follow a list of [x, z] waypoints; true when the last one is reached. */
  walkRoute(route, dt, sp) {
    const [tx, tz] = route[this.clubWp];
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { this.clubWp++; if (this.clubWp >= route.length) return true; }
    else {
      const step = Math.min(d, sp * dt);
      this.pos.x += dx / d * step; this.pos.z += dz / d * step;
      this.speed = sp;
      this.ry = this.ry + clamp(angleDiff(this.ry, Math.atan2(dx, dz)), -dt * 6, dt * 6);
    }
    this.pos.y = this.clubGround(this.pos.x, this.pos.z);
    this.anim = 'move';
    return false;
  }

  updateClub(dt) {
    if (this.clubPhase === 'approach') {
      // through the house to the foot of the attic stairs, on the nav graph
      this.clubT += dt;
      const [fx, fz] = AJAN_ROUTE[0];
      // (if a door or a player is in the way for too long, he still gets there)
      if (this.step(dt, AJAN.investigate) || this.clubT > 45) { this.pos.set(fx, this.clubGround(fx, fz), fz); this.clubPhase = 'enter'; this.clubWp = 0; }
      this.anim = 'move';
      return;
    }
    if (this.clubPhase === 'enter') {
      if (this.walkRoute(AJAN_ROUTE, dt, 1.6)) {
        this.clubPhase = 'dance'; this.danceT = 0; this.danceA = Math.atan2(this.pos.x - POLE_A.x, this.pos.z - POLE_A.z);
        if (this.clubThen) this.leaveClub(this.clubThen); // the money already got to him on the way in
      }
      // he opens the club door himself on the way through
      const door = this.house.doors.get('d_club');
      if (door && !door.open && Math.hypot(this.pos.x - 18, this.pos.z - 14.55) < 2.2) this.game.broadcast({ k: 'door', id: 'd_club', open: true, by: 'ajan' });
      return;
    }
    if (this.clubPhase === 'dance') {
      this.danceT += dt;
      // shuffle round the pole; ease in from the walk so there's no snap
      const want = AJAN_POLE_R;
      this.danceA += dt * 0.35;
      const cur = Math.hypot(this.pos.x - POLE_A.x, this.pos.z - POLE_A.z);
      const r = cur + (want - cur) * Math.min(1, dt * 2);
      this.pos.set(POLE_A.x + Math.sin(this.danceA) * r, 6.8, POLE_A.z + Math.cos(this.danceA) * r);
      // he faces out to the room, pole at his right hand
      const face = this.danceA + Math.PI / 2 - 0.5;
      this.ry = this.ry + clamp(angleDiff(this.ry, face), -dt * 3, dt * 3);
      this.speed = 0;
      this.anim = 'dance';
      this.animT = this.danceT;
      return;
    }
    if (this.clubPhase === 'leave') {
      // back out the way he came: off the dance floor, through the door, down the stairs
      if (this.walkRoute(this.clubExit, dt, 1.3)) this.finishClub();
    }
  }

  /** The money (and the song) finally gets to him: he wanders off to his own bed to sleep it off. */
  clubSleep() { this.leaveClub('bed'); }

  /** Leave the club on foot; `then` is 'bed' (sleep it off) or 'patrol' (back to the hunt). */
  leaveClub(then = 'patrol') {
    if (this.state !== 'club' || this.clubPhase === 'leave') return;
    if (this.clubPhase === 'approach' || this.clubPhase === 'enter') {
      if (then === 'bed' || !this.clubThen) this.clubThen = then;
      if (this.clubPhase === 'approach') this.finishClub(); // never got upstairs: just carry on
      return;
    }
    this.clubThen = then;
    this.clubPhase = 'leave';
    this.clubWp = 0;
    this.clubExit = AJAN_ROUTE.slice().reverse();
    this.anim = 'move';
  }

  /** Back to the ordinary horror at the foot of the attic stairs. */
  finishClub() {
    const then = this.clubThen || 'patrol';
    this.clubPhase = null;
    this.clubThen = null;
    this.path = null;
    this.anim = 'move';
    this.setState('patrol');
    if (then === 'bed') this.goToBed();
    else this.pickPatrol();
  }

  /** Everyone left while he was still dancing: he leaves too. */
  endClub() { this.leaveClub('patrol'); }

  /** Hit by the revolver: knocked down for `sec` seconds. Returns false if it can't take effect. */
  stun(sec) {
    if (['dormant', 'kill', 'drag', 'club'].includes(this.state)) return false;
    this.standUp();
    this.target = null;
    this.path = null;
    this.inspecting = null;
    this.stunLeft = sec;
    this.anim = 'stun';
    this.animT = 0;
    this.speed = 0;
    this.setState('stun');
    return true;
  }

  standUp() {
    if (this.restFrom) this.pos.copy(this.restFrom);
    this.restFrom = null;
    this.anim = 'move';
  }

  wakeUp() {
    const was = this.state;
    this.standUp();
    if (was === 'sleep') this.sleepTimer = 180 + this.rnd() * 60;
    if (was === 'sit') this.sitTimer = 100 + this.rnd() * 80;
    if (was === 'sleep' || was === 'sit') { this.setState('patrol'); this.pauseT = 1.5; this.pickPatrol(); }
  }

  pickPatrol() {
    const cols = this.house.colliders;
    const here = nearestNode(this.house.nav, this.pos, cols);
    const passable = id => !this.house.doors.get(id)?.locked;
    let nodes = this.house.patrolNodes.filter(id => {
      const n = this.house.nav.byId[id];
      if (id === this.lastPatrol || Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 3) return false;
      return !here || !!findPath(this.house.nav, here.id, id, passable);
    });
    if (!nodes.length) { this.pauseT = 2; return; }
    // Prefer the rooms he has gone longest without checking, so over time he
    // covers every reachable room on every floor.
    this.visited = this.visited || {};
    const age = id => this.stateClock - (this.visited[this.house.nav.byId[id].room] ?? -1e9);
    nodes.sort((x, y) => age(y) - age(x));
    nodes = nodes.slice(0, Math.max(3, Math.ceil(nodes.length / 3)));
    let choice = null;
    // Mild "director": sometimes wander toward a floor/region where somebody is,
    // without knowing anyone's exact position.
    const alive = this.candidates();
    if (alive.length && this.rnd() < 0.3) {
      const p = alive[Math.floor(this.rnd() * alive.length)];
      const near = nodes.filter(id => {
        const n = this.house.nav.byId[id];
        return Math.hypot(n.x - p.pos.x, n.z - p.pos.z) < 14 && levelOf(n.y) === levelOf(p.pos.y);
      });
      if (near.length) choice = near[Math.floor(this.rnd() * near.length)];
    }
    if (!choice) choice = nodes[Math.floor(this.rnd() * nodes.length)];
    this.lastPatrol = choice;
    const n = this.house.nav.byId[choice];
    this.visited[n.room] = this.stateClock;
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
