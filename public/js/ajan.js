// Ajan's AI. Runs only on the authority (single-player client or the room host)
// and is replicated to everyone else as snapshots. A plain state machine:
//   dormant → patrol ⇄ investigate → search → patrol
//   chase → (kill | drag a seen hider out | lose → search)
//   inspect a hiding spot · nap in his bed · sit facing a wall
// He never plans a path into the attic and ignores anyone inside it.
import { BUTCHER } from './butcher.js';
import * as THREE from 'three';
import { AJAN, MONSTERS, DIFFICULTY } from './config.js';
import { collideCircle, groundAt, lineOfSight, levelOf, segmentBlockers, soundTransmission } from './physics.js';
import { isSafeZone, RAMPS, rampHeight, inElevator } from './layout.js';
import { AJAN_ROUTE, POLE_A, AJAN_POLE_R } from './club.js';
import { nearestNode, findPath } from './nav.js';
import { inSecOffice, SEC_DOOR, SEC_WINDOW } from './security.js';
import { angleDiff, clamp } from './util.js';

const tmp = new THREE.Vector3();

// Where each monster first appears when its dormant timer runs out.
// Fixed first appearances: Ajan in his own bedroom, Ajanita in the third-floor
// butcher room, and Guy in the 15-TV tower room. Once awake, all use normal AI patrols.
const WAKE_AT = {
  ajan: [36.8, 3.4, 4.0, Math.PI],
  ajanita: [28.0, 6.8, 4.4, Math.PI],
  guy: [52.6, 6.8, 12.0, Math.PI],
};
const DORMANT = { ajan: AJAN.dormant, guy: 50, ajanita: 70 };
// Ajan's snack: the fridge, then a kitchen chair facing the table.
export const FRIDGE = { stand: new THREE.Vector3(18.6, 0, 11.6), ry: -Math.PI / 2 };
export const SNACK_CHAIR = { front: new THREE.Vector3(25.3, 0, 15.8), seat: new THREE.Vector3(24.45, 0, 15.8), ry: -Math.PI / 2 };
export const MUSIC_SPOT = new THREE.Vector3(27, 3.4, 16);

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export class AjanBrain {
  constructor(game, rnd, def = MONSTERS.ajan) {
    this.game = game;
    this.house = game.house;
    this.rnd = rnd;
    this.def = def;
    this.id = def.id;
    const k = def.speed * (DIFFICULTY[game.difficulty]?.speed ?? 1);
    this.v = { patrol: AJAN.patrol * k, investigate: AJAN.investigate * k, search: AJAN.search * k, chase: AJAN.chase * k };
    this.ignore = new Map(); // pid -> seconds he won't go after them (unreachable)
    this.pos = new THREE.Vector3(36.8, -50, 4);
    this.ry = 0;
    this.speed = 0;
    this.state = 'dormant';
    this.stateT = 0;
    this.dormantLeft = DORMANT[def.id] ?? AJAN.dormant;
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
    this.sleepTimer = def.id === 'ajanita' ? 90 + rnd() * 40 : 180 + rnd() * 60;
    this.eatTimer = 120 + rnd() * 90;
    this.danceTimer = 160 + rnd() * 120;
    this.sitTimer = 100 + rnd() * 80;
    this.whisperT = 25 + rnd() * 35;
    this.fartNext = 45 + rnd() * 70;
    this.fartPauseLeft = 0;
    this.restLeft = 0;
    this.butcherNext = BUTCHER.interval;
    this.butcherRetryAt = 0;
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    this.game.onAjanState?.(s, this);
  }

  snapshot() {
    return {
      x: +this.pos.x.toFixed(3), y: +this.pos.y.toFixed(3), z: +this.pos.z.toFixed(3), ry: +this.ry.toFixed(3),
      sp: +this.speed.toFixed(2), st: this.state, m: this.anim, mt: +this.animT.toFixed(2), hy: +this.headYaw.toFixed(2),
      cv: this.carry?.pid || null,
      ...(this.id === 'ajan' ? { bt: Math.max(0, this.butcherNext - (this.stateClock || 0)), bl: this.butcherLeft || 0 } : {}),
    };
  }

  // ------------------------------------------------------------ perception
  candidates() {
    return [...this.game.players.values()].filter(p => p.alive && !p.escaped && !p.dying && !p.restrained && p.pos && !isSafeZone(p.pos));
  }

  canSee(p) {
    if (p.hidden || isSafeZone(p.pos)) return false;
    if (['sleep', 'dormant', 'stun', 'carry', 'dance', 'eatsit', 'gotoshed', 'shedsit', 'gotobutcher', 'butcher'].includes(this.state)) return false;
    if (this.ignore.get(p.id) > 0) return false;
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
    if (['dormant', 'kill', 'drag', 'stun', 'carry', 'spot', 'fridge', 'knock', 'peepscare', 'gotoshed', 'shedsit', 'gotobutcher', 'butcher'].includes(this.state)) return;
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
    if (['sleep', 'sit', 'eatsit', 'dance'].includes(this.state)) this.wakeUp();
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
    if (loud > 2.5 && this.rnd() < 0.5) this.game.ajanSound(this, 'growl');
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
    const clear = segmentBlockers(last.x, last.z, p.x, p.z, last.y + 0.35, cols, { pad: AJAN.radius, height: AJAN.height - 0.35, occludeOnly: false, max: 1, who: 'ajan' }) === 0;
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
    // The spiral staircase has narrow rail/post colliders that can trap the AI
    // between turns. Its dedicated nav chain already constrains movement, so ignore
    // overlapping stairwell colliders while on the spiral itself; keep normal
    // collision everywhere else.
    const spiral = RAMPS.find(r => r.spiral && this.pos.x >= r.x0 - 0.15 && this.pos.x <= r.x1 + 0.15 &&
      this.pos.z >= r.z0 - 0.15 && this.pos.z <= r.z1 + 0.15);
    const cols = spiral
      ? this.house.colliders.filter(c => !(c.maxX > spiral.x0 && c.minX < spiral.x1 &&
          c.maxZ > spiral.z0 && c.minZ < spiral.z1 && c.maxY > spiral.ya && c.minY < spiral.yb + 1.2))
      : this.house.colliders;
    collideCircle(this.pos, AJAN.radius, AJAN.height, cols, 'ajan');
    const gy = groundAt(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);
    this.speed = speed;
  }

  // --------------------------------------------------------------- update
  update(dt) {
    this.stateClock = (this.stateClock || 0) + dt;
    this.stateT += dt;
    if (this.id === 'ajan' && !this.game.freePlay && !['dormant','kill','drag','stun','carry'].includes(this.state)) {
      if (this.fartPauseLeft > 0) {
        this.fartPauseLeft -= dt; this.speed = 0; this.anim = 'move';
        if (this.fartPauseLeft <= 0) {
          this.game.broadcast({ k: 'ajanFart', x: this.pos.x, y: this.pos.y, z: this.pos.z, ry: this.ry });
          this.fartNext = 55 + this.rnd() * 85;
        }
        return;
      }
      this.fartNext -= dt;
      if (this.fartNext <= 0) {
        this.fartPauseLeft = 5; this.speed = 0; this.anim = 'move';
        return;
      }
    }
    this.animT += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    this.speed = 0;
    if (this.id === 'ajan' && !this.game.freePlay && this.stateClock >= this.butcherNext && this.stateClock >= this.butcherRetryAt) this.startButcherVisit();
    if (this.state === 'club') { this.updateClub(dt); return; }
    if (this.state === 'dormant') {
      this.dormantLeft -= dt;
      this.pos.set(36.8, -50, 4);
      if (this.dormantLeft <= 0) {
        // Ajan wakes up in his own room upstairs; the others in their own corners.
        const w = WAKE_AT[this.id];
        if (w) { this.pos.set(w[0], w[1], w[2]); this.ry = w[3]; }
        else { this.pos.copy(this.house.ajanBed.stand); this.ry = Math.PI; }
        this.setState('patrol');
        this.game.ajanSound(this, 'roar');
        this.pickPatrol();
      }
      return;
    }
    if (this.state === 'kill') return;
    if (this.state === 'stun') {
      // Shot: down on the floor, blind and deaf, then back up and furious.
      this.anim = this.sprayed ? 'sprayed' : 'stun';
      this.stunLeft -= dt;
      if (this.stunLeft <= 0) {
        this.anim = 'move';
        this.sprayed = false;
        this.setState('patrol');
        this.pauseT = 1.2;
        this.game.ajanSound(this, 'roar');
        this.pickPatrol();
      }
      return;
    }

    if (this.state === 'carry') { this.updateCarry(dt); return; }
    if (this.state === 'knock') { this.updateKnock(dt); return; }
    if (this.state === 'peepscare') { this.updatePeepScare(dt); return; }
    if (this.state === 'spot') { this.updateSpot(dt); return; }
    if (this.state === 'fridge') { this.updateFridge(dt); return; }
    if (this.state === 'shedsit') { this.anim = 'sit'; this.restLeft -= dt; if (this.restLeft <= 0) { this.standUp(); for (const id of this.game.players.keys()) this.ignore.set(id, 60); this.sleepTimer = 0; this.setState('patrol'); this.goToBed(); } return; }

    if (this.state === 'butcher') {
      this.anim = 'butcher'; this.butcherLeft -= dt;
      if (this.butcherLeft <= 0) { this.anim = 'move'; this.setState('patrol'); this.pickPatrol(); }
      return;
    }

    this.sleepTimer -= dt;
    this.sitTimer -= dt;
    this.whisperT -= dt;
    this.eatTimer -= dt;
    this.danceTimer -= dt;
    for (const [id, t] of this.ignore) { if (t - dt <= 0) this.ignore.delete(id); else this.ignore.set(id, t - dt); }

    if (['sleep', 'sit', 'eatsit', 'dance'].includes(this.state)) { this.updateRest(dt); return; }

    // Vision
    this.visionT -= dt;
    if (this.visionT <= 0) {
      this.visionT = 0.12;
      this.look(0.12);
    }

    if (this.pauseT > 0) {
      this.pauseT -= dt;
      this.anim = this.state === 'inspect' || this.giveUpAfter ? 'inspect' : this.state === 'patrol' || this.state === 'search' ? 'search' : 'move';
      this.headYaw = this.state === 'inspect' ? Math.sin(this.stateT * 0.8) * 0.25 : Math.sin(this.stateT * 1.5) * 0.6;
      if (this.state === 'inspect' && this.pauseT <= 0) this.finishInspect();
      if (this.giveUpAfter && this.pauseT <= 0) { this.giveUpAfter = false; this.anim = 'move'; this.pickPatrol(); }
      return;
    }
    this.headYaw *= 0.9;
    this.anim = 'move';

    switch (this.state) {
      case 'patrol':
        if (this.whisperT <= 0) { this.whisperT = 30 + this.rnd() * 45; if (this.def.sounds.whisper) this.game.ajanSound(this, 'whisper'); }
        if (this.sleepTimer <= 0 && this.def.bed) { this.goToBed(); break; }
        if (this.id === 'ajan' && this.eatTimer <= 0) { this.goTo('gotofridge', FRIDGE.stand, () => { this.eatTimer = 60; }); break; }
        if (this.id === 'ajan' && this.danceTimer <= 0) { this.goTo('gotodance', MUSIC_SPOT, () => { this.danceTimer = 60; }); break; }
        if (this.sitTimer <= 0) { this.goToChair(); break; }
        if (this.step(dt, this.v.patrol)) {
          this.pauseT = 1 + this.rnd() * 2.5;
          if (!(this.rnd() < 0.2 && this.tryInspect(6))) this.pickPatrol();
        }
        break;
      case 'investigate':
        if (this.step(dt, this.v.investigate)) {
          this.pauseT = 2 + this.rnd() * 1.5;
          this.beginSearch(this.goal, 2);
        }
        break;
      case 'search':
        if (this.step(dt, this.v.search)) {
          this.pauseT = 1.2 + this.rnd();
          const next = this.searchPoints.shift();
          if (next) this.moveTo(next);
          else if (!(this.rnd() < 0.6 && this.tryInspect(8))) { this.setState('patrol'); this.pickPatrol(); }
        }
        break;
      case 'inspectGo':
        if (this.step(dt, this.v.search)) this.startInspect();
        break;
      case 'gotobed':
        if (this.step(dt, this.v.patrol)) this.lieDown();
        break;
      case 'gotochair':
        if (this.step(dt, this.v.patrol)) this.sitDown();
        break;
      case 'gotofridge':
        if (this.step(dt, this.v.patrol)) this.openFridge();
        break;
      case 'gotoeat':
        if (this.step(dt, this.v.patrol)) this.sitToEat();
        break;
      case 'gotodance':
        if (this.step(dt, this.v.patrol)) this.startDance();
        break;
      case 'gotobutcher':
        if (this.step(dt, this.v.patrol)) this.arriveButcher();
        break;
      case 'gotoshed':
        if (this.step(dt, this.v.patrol)) this.sitInShed();
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
          if (this.state === 'gotobutcher') this.butcherRetryAt = this.stateClock + 15;
          if (this.state === 'gotobed') this.sleepTimer = 30;
          if (this.state === 'gotochair') this.sitTimer = 60;
          if (this.state === 'gotofridge' || this.state === 'gotoeat') this.eatTimer = 90;
          if (this.state === 'gotodance') this.danceTimer = 90;
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
        this.target = best.id;
        this.inspecting = null;
        this.pauseT = 0;
        this.chaseProg = null;
        if (this.state !== 'chase') {
          // He stops, stares at you while his "I see you" sound plays, then comes for you.
          this.standUp();
          this.spotLeft = Math.max(0.8, this.game.soundLength(this.def.sounds.see));
          this.setState('spot');
          this.game.ajanSound(this, 'see');
        } else this.setState('chase');
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
    // Shut in the security office behind the shutter: knock, stare through the window, leave.
    if (this.game.extras?.security?.closed && inSecOffice(p.pos)) { this.startKnock(p); return; }
    if (p.hidden) {
      if (p.hideSeen) { this.beginDrag(p); return; }
      this.loseTarget(true);
      return;
    }
    const visible = this.lastSeenT < 0.3;
    if (this.lastSeenT < 1.0) this.lastSeen = p.pos.clone();
    // Can't get to them (inside the elevator, up somewhere he can't climb): don't camp.
    // Check every 3 s whether he got any closer; twice without progress and he walks away.
    const prog = this.chaseProg || (this.chaseProg = { t: 0, d: Infinity, fails: 0 });
    prog.t += dt;
    if (prog.t > 3) {
      const dNow = p.pos.distanceTo(this.pos);
      prog.fails = dNow > prog.d - 0.4 ? prog.fails + 1 : 0;
      prog.d = dNow; prog.t = 0;
      const unreachable = inElevator(p.pos.x, p.pos.z) || prog.fails >= 2;
      if (unreachable) { this.giveUpOn(p, inElevator(p.pos.x, p.pos.z)); return; }
    }
    const tgt = this.lastSeen;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    const sameLvl = Math.abs(p.pos.y - this.pos.y) < 1.2;
    if (visible && d < AJAN.catchDist && sameLvl && !inElevator(p.pos.x, p.pos.z) && !inElevator(this.pos.x, this.pos.z)) {
      this.game.hostStartKill(p.id, this);
      return;
    }
    const direct = visible && segmentBlockers(this.pos.x, this.pos.z, tgt.x, tgt.z, this.pos.y + 0.6, this.house.colliders, { pad: 0.3, occludeOnly: false, max: 1, who: 'ajan' }) === 0;
    if (direct) {
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
      const dd = Math.hypot(dx, dz) || 1;
      this.faceTo(Math.atan2(dx, dz), dt, 7);
      this.advance(dt, this.v.chase, dx / dd, dz / dd);
      this.path = null;
    } else {
      if (!this.path || this.repathT === undefined || (this.repathT -= dt) <= 0) {
        this.moveTo(tgt);
        this.repathT = 0.6;
      }
      const done = this.step(dt, this.v.chase * 0.92);
      if (done && this.lastSeenT > 1.0) this.loseTarget(true);
    }
    if (this.lastSeenT > 7) this.loseTarget(true);
  }

  /** Target out of reach: (squeeze at the elevator,) then turn away and ignore them for a while. */
  giveUpOn(p, elevator) {
    this.ignore.set(p.id, 12);
    this.awareness.delete(p.id);
    this.chaseProg = null;
    this.target = null;
    this.path = null;
    if (elevator) {
      this.setState('patrol');
      this.anim = 'inspect';
      this.animT = 0;
      this.pauseT = 2.8; // tries to squeeze in, can't
      this.game.ajanSound(this, 'squeeze');
      this.giveUpAfter = true;
    } else {
      this.game.ajanSound(this, 'laugh');
      this.setState('patrol');
      this.pickPatrol();
    }
  }

  /** Someone is watching through a peephole. kind 'walkby': he strolls past the lens and on
   *  down the hall. kind 'scare': he walks up, grins into it (jumpscare), and half the time
   *  waits at the door for 5 s ("he knows you're in there") and then opens it. */
  startPeepScare(hole, pid, kind = 'scare') {
    this.standUp();
    this.target = null;
    // come from a little way down the hall, out of sight, so it happens now and not in a minute
    const nodes = this.house.nav.nodes.filter(n => Math.abs(n.y - hole.y) < 0.5);
    const dist = n => Math.hypot(n.x - hole.hall.x, n.z - hole.hall.z);
    const from = nodes.filter(n => dist(n) > 5 && dist(n) < 11 && Math.abs(n.z - hole.hall.z) < 2.5).sort((p, q) => Math.abs(dist(p) - 7) - Math.abs(dist(q) - 7))[0];
    if (from && this.pos.distanceTo(hole.hall) > 9) { this.pos.set(from.x, from.y, from.z); this.lastPos.copy(this.pos); }
    // where a walk-by ends up: the other way down the hall
    const away = nodes.filter(n => dist(n) > 5 && dist(n) < 14 && Math.sign(n.x - hole.hall.x) !== Math.sign(this.pos.x - hole.hall.x)).sort((p, q) => dist(p) - dist(q))[0];
    this.peepScare = { hole, pid, kind, t: 0, at: false, away };
    this.setState('peepscare');
    if (!this.moveTo(hole.hall)) this.path = null;
    return true;
  }

  updatePeepScare(dt) {
    const s = this.peepScare, G = this.game;
    s.t += dt;
    const done = () => { this.peepScare = null; this.anim = 'move'; this.setState('patrol'); this.pickPatrol(); };
    if (!s.at) {
      this.anim = 'move';
      const arrived = !this.path || this.step(dt, s.kind === 'walkby' ? this.v.patrol : this.v.chase * 0.8) || this.pos.distanceTo(s.hole.hall) < 0.6;
      if (arrived || s.t > 25) {
        if (s.kind === 'walkby') {
          // past the lens and on down the hall
          if (s.away && this.moveTo(V3(s.away.x, s.away.y, s.away.z))) { this.peepScare = null; this.setState('patrol'); } else done();
          return;
        }
        s.at = true; s.t = 0; this.animT = 0;
        s.open = this.rnd() < 0.5;
        G.broadcast({ k: 'peepscare', pid: s.pid, m: this.id });
      }
      return;
    }
    this.speed = 0;
    this.anim = s.t > 2.6 && s.open ? 'search' : 'inspect';
    this.faceTo(s.hole.side > 0 ? Math.PI : 0, dt, 12);
    if (s.t > 2.6 && !s.open) { G.ajanSound(this, 'laugh'); done(); return; }
    if (s.open && !s.warned && s.t > 2.6) { s.warned = true; G.broadcast({ k: 'doorwarn', pid: s.pid, sec: 5 }); G.ajanSound(this, 'laugh'); }
    if (s.open && s.t > 7.6) {
      // the door swings open: he's coming in for whoever is behind it
      G.hostSetDoor(s.hole.door, true, 'ajan');
      const p = G.players.get(s.pid);
      this.peepScare = null;
      if (p && p.alive && !p.dying && !p.hidden && !isSafeZone(p.pos)) { this.target = p.id; this.lastSeen = p.pos.clone(); this.lastSeenT = 0; this.spotLeft = 0.8; this.setState('spot'); G.ajanSound(this, 'see'); } else done();
    }
  }

  startKnock(p) {
    this.knock = { pid: p.id, phase: 'door', t: 0 };
    this.target = null;
    this.chaseProg = null;
    this.setState('knock');
    if (!this.moveTo(SEC_DOOR.outside)) this.path = null;
  }

  updateKnock(dt) {
    const k = this.knock, sec = this.game.extras?.security;
    k.t += dt;
    const p = this.game.players.get(k.pid);
    // the shutter went up while he was there: back to the chase
    if (!sec?.closed && p && p.alive && !p.dying && (k.phase === 'knocking' || k.phase === 'stare')) { this.target = p.id; this.lastSeen = p.pos.clone(); this.lastSeenT = 0; this.knock = null; this.setState('chase'); return; }
    const face = () => this.faceTo(0, dt, 6); // the office is to the +z side of the hall
    if (k.phase === 'door' || k.phase === 'towin') {
      this.anim = 'move';
      const arrived = !this.path || this.step(dt, this.v.investigate);
      if (arrived || k.t > 12) {
        k.phase = k.phase === 'door' ? 'knocking' : 'stare';
        k.t = 0;
        this.animT = 0;
        if (k.phase === 'knocking') this.game.broadcast({ k: 'knock' });
      }
      return;
    }
    this.speed = 0;
    this.anim = 'inspect';
    face();
    if (k.phase === 'knocking' && k.t > 3.2) { k.phase = 'towin'; k.t = 0; if (!this.moveTo(SEC_WINDOW.outside)) this.path = null; }
    else if (k.phase === 'stare' && k.t > 2.6) {
      // a long grin through the glass, then the "didn't find you" sound, and off he goes
      this.game.ajanSound(this, 'laugh');
      this.ignore.set(k.pid, 20);
      this.knock = null;
      this.anim = 'move';
      this.setState('patrol');
      this.pauseT = 0.8;
      this.pickPatrol();
    }
  }

  // "I see you": stands still, facing them, until the sound is over.
  updateSpot(dt) {
    const p = this.game.players.get(this.target);
    this.spotLeft -= dt;
    this.speed = 0;
    this.anim = 'roar';
    if (!p || !p.alive || p.escaped || p.dying || isSafeZone(p.pos)) { this.target = null; this.setState('patrol'); this.pickPatrol(); return; }
    if (!p.hidden) { this.lastSeen = p.pos.clone(); this.lastSeenT = 0; this.faceTo(Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z), dt, 8); }
    if (this.spotLeft <= 0) { this.anim = 'move'; this.setState('chase'); }
  }

  loseTarget(laugh = true) {
    const where = this.lastSeen && !isSafeZone(this.lastSeen) ? this.lastSeen : this.pos.clone();
    this.target = null;
    this.awareness.clear();
    // Sometimes he laughs quietly to himself when he loses you.
    if (laugh && this.rnd() < 0.6) this.game.ajanSound(this, 'laugh');
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
    this.game.ajanSound(this, 'laugh');
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
    if (d < 0.9 || this.step(dt, this.v.chase * 0.8)) {
      this.faceTo(Math.atan2(spot.inside.x - this.pos.x, spot.inside.z - this.pos.z), dt, 10);
      this.game.hostDragOut(pid, this);
      this.dragHide = null;
    }
  }

  // Host-only routine: due every eight minutes of active play; defer while busy.
  startButcherVisit() {
    if (this.id !== 'ajan' || !this.house.butcher || !['patrol', 'search', 'investigate', 'sit', 'gotochair', 'gotobed', 'sleep', 'eatsit'].includes(this.state)) return false;
    this.standUp();
    if (!this.moveTo(BUTCHER.stand)) { this.butcherRetryAt = this.stateClock + 15; return false; }
    this.target = null; this.inspecting = null; this.pauseT = 0;
    this.setState('gotobutcher');
    return true;
  }

  arriveButcher() {
    if (this.pos.distanceTo(BUTCHER.stand) > 0.65) {
      this.butcherRetryAt = this.stateClock + 15; this.setState('patrol'); this.pickPatrol(); return;
    }
    this.pos.copy(BUTCHER.stand); this.ry = BUTCHER.ry;
    this.butcherLeft = BUTCHER.duration; this.animT = 0; this.anim = 'butcher';
    // Keep the schedule anchored to round time, including visits deferred by a chase.
    this.butcherNext += (Math.floor(Math.max(0, this.stateClock - this.butcherNext) / BUTCHER.interval) + 1) * BUTCHER.interval;
    this.setState('butcher');
  }

  // Host migration preserves the current visit and remaining wait from snapshots.
  restoreButcher(s) {
    if (this.id !== 'ajan') return false;
    if (Number.isFinite(s.bt)) this.butcherNext = s.bt;
    if (s.st === 'butcher' && this.pos.distanceTo(BUTCHER.stand) < 0.65) {
      this.state = 'butcher'; this.anim = 'butcher'; this.animT = s.mt || 0;
      this.butcherLeft = Math.min(BUTCHER.duration, Math.max(0, s.bl ?? BUTCHER.duration));
      return true;
    }
    if (s.st === 'gotobutcher' && this.moveTo(BUTCHER.stand)) { this.state = 'gotobutcher'; return true; }
    return false;
  }

  // ------------------------------------------------------ naps & chairs
  goToBed() {
    const bed = this.house[this.def.bed];
    if (this.game.brains?.some(b => b !== this && (b.state === 'sleep' || b.state === 'gotobed'))) { this.sleepTimer = 45; return; }
    if (!bed || !this.moveTo(bed.stand)) { this.sleepTimer = 30; this.pickPatrol(); return; }
    this.setState('gotobed');
  }

  lieDown() {
    const bed = this.house[this.def.bed];
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
    this.anim = this.state === 'eatsit' ? 'sit' : this.state;
    // Sitting he still watches what's in front of him (the wall, mostly).
    if (this.state === 'sit' || this.state === 'eatsit' || this.state === 'dance') {
      this.visionT -= dt;
      if (this.visionT <= 0) { this.visionT = 0.2; const was = this.state; this.state = 'sit'; this.look(0.2); if (this.state === 'sit') this.state = was; if (this.state === 'spot' || this.state === 'chase') { this.standUp(); return; } }
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
    const r3 = RAMPS.find(q => q.id === 'R3');
    if (this.pos.x > r3.x0 - 0.1 && this.pos.x < r3.x1 + 0.1 && this.pos.z > r3.z0 && this.pos.z < r3.z1) sp *= 0.35; // climbing the ladder
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
      if (this.step(dt, this.v.investigate) || this.clubT > 45) { this.pos.set(fx, this.clubGround(fx, fz), fz); this.clubPhase = 'enter'; this.clubWp = 0; }
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
      // in front of his pole, facing the room (dance2.fbx plays on the client avatar)
      const spot = { x: POLE_A.x, z: POLE_A.z - 0.85 };
      this.pos.x += (spot.x - this.pos.x) * Math.min(1, dt * 3);
      this.pos.z += (spot.z - this.pos.z) * Math.min(1, dt * 3);
      this.pos.y = 6.8;
      this.ry = this.ry + clamp(angleDiff(this.ry, Math.PI), -dt * 3, dt * 3);
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
  stun(sec, sprayed = false) {
    if (['dormant', 'kill', 'drag', 'club', 'carry'].includes(this.state)) return false;
    this.sprayed = sprayed;
    this.standUp();
    this.target = null;
    this.path = null;
    this.inspecting = null;
    this.stunLeft = sec;
    this.anim = sprayed ? 'sprayed' : 'stun';
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
    if (was === 'eatsit') this.eatTimer = 160 + this.rnd() * 80;
    if (was === 'dance') this.danceTimer = 200 + this.rnd() * 100;
    if (['sleep', 'sit', 'eatsit', 'dance'].includes(was)) { this.setState('patrol'); this.pauseT = 1.5; this.pickPatrol(); }
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

  // ------------------------------------------------------ snack, dance
  goTo(state, where, fail) {
    if (!this.moveTo(where)) { fail(); this.pickPatrol(); return; }
    this.setState(state);
  }

  openFridge() {
    if (this.pos.distanceTo(FRIDGE.stand) > 1.6) { this.eatTimer = 90; this.setState('patrol'); this.pickPatrol(); return; }
    this.ry = FRIDGE.ry;
    this.fridgeLeft = 3;
    this.anim = 'inspect';
    this.animT = 0;
    this.setState('fridge');
    this.game.hostFridge(true);
  }

  updateFridge(dt) {
    this.fridgeLeft -= dt;
    this.anim = 'inspect';
    if (this.fridgeLeft <= 0) {
      this.game.hostFridge(false);
      this.anim = 'move';
      this.goTo('gotoeat', SNACK_CHAIR.front, () => { this.eatTimer = 90; this.setState('patrol'); });
    }
  }

  sitToEat() {
    const c = SNACK_CHAIR;
    if (this.pos.distanceTo(c.front) > 1.6) { this.eatTimer = 90; this.setState('patrol'); this.pickPatrol(); return; }
    this.restFrom = c.front.clone();
    this.pos.copy(c.seat);
    this.ry = c.ry;
    this.restLeft = 20;
    this.anim = 'sit';
    this.animT = 0;
    this.setState('eatsit');
  }

  /** Host: the shed's hotboxed — he wanders over for a smoke, then goes to bed. */
  startShedVisit(seat) {
    if (!['patrol', 'investigate', 'search', 'sit', 'gotochair'].includes(this.state)) return false;
    this.standUp();
    this.shedSeat = seat;
    this.target = null;
    if (!this.moveTo(seat.front)) return false;
    this.setState('gotoshed');
    return true;
  }

  sitInShed() {
    const c = this.shedSeat;
    if (!c || this.pos.distanceTo(c.front) > 1.6) { this.setState('patrol'); this.pickPatrol(); return; }
    this.restFrom = c.front.clone();
    this.pos.copy(c.seat);
    this.ry = c.ry;
    this.restLeft = 25;
    this.anim = 'sit';
    this.animT = 0;
    this.setState('shedsit');
  }

  startDance() {
    if (this.pos.distanceTo(MUSIC_SPOT) > 2) { this.danceTimer = 90; this.setState('patrol'); this.pickPatrol(); return; }
    this.restFrom = this.pos.clone();
    this.restLeft = 30;
    this.anim = 'dance';
    this.animT = 0;
    this.setState('dance');
  }

  // ------------------------------------------------------ knocked out: carry them away
  /** Drag an unconscious player to the place they will wake up. */
  startCarry(pid, spot) {
    this.carry = { pid, spot };
    this.target = null;
    this.awareness.clear();
    this.setState('carry');
    if (!this.moveTo(spot.pos)) this.path = null;
  }

  updateCarry(dt) {
    const c = this.carry;
    this.anim = 'move';
    const arrived = !this.path || this.step(dt, this.v.patrol * 1.15);
    if (arrived || this.pos.distanceTo(c.spot.pos) < 0.8) {
      this.carry = null;
      this.game.hostRevive(c.pid, c.spot);
      this.finishKill();
      return;
    }
    // stuck while carrying: re-plan every 1.5 s, and after a few tries drop them off where he stands
    this.carryStuck = (this.carryStuck || 0) + dt;
    if (this.carryStuck > 1.5) {
      this.carryStuck = 0;
      if (this.carryLast && this.carryLast.distanceTo(this.pos) < 0.15) {
        this.carryFails = (this.carryFails || 0) + 1;
        if (this.carryFails > 4) { this.carryFails = 0; this.carry = null; this.game.hostRevive(c.pid, c.spot); this.finishKill(); return; }
        this.moveTo(c.spot.pos);
      }
      this.carryLast = this.pos.clone();
    }
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
