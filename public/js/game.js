// The running session: world, local player, remote players, Ajan, authority
// logic (when we're single-player or the host), replication, kill sequences,
// spectating, escaping and the in-game HUD.
import * as THREE from 'three';
import { House, makeItemMesh, ITEM_SPAWNS, SPAWN_POINTS } from './house.js';
import { Avatar, DissolveFX } from './avatar.js';
import { AjanBrain } from './ajan.js';
import { LocalPlayer } from './player.js';
import { Screens } from './screens.js';
import { PostFX } from './postfx.js';
import { VoiceChat, mic } from './voice.js';
import { audio } from './audio.js';
import { loadGLTF, loadTexture } from './assets.js';
import { settings } from './settings.js';
import { CHARACTERS, charById, ITEM_INFO, AJAN, PLAYER, DEATH_GAIN, DIFFICULTY, difficultyOf } from './config.js';

const GUN_RELOAD_MS = 180000; // the revolver reloads one round every 3 minutes
import { Props, DEATH_KEYS, MIRROR_TEXTS } from './props.js';
import { Spider } from './spider.js';
import { isSafeZone, levelIndex, LEVELS, inElevator } from './layout.js';
import { mulberry32, clamp, damp, angleLerp, escapeHtml } from './util.js';
import { lineOfSight, segmentBlockers, levelOf, inStairs, elevatorState, soundTransmission } from './physics.js';
import { roomAt } from './house.js';

const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const EAT_START = 1.6;

export class Game {
  constructor(app, { net, seed, players, startAt, freePlay = false, difficulty = 'medium' }) {
    this.app = app;
    this.net = net;
    this.seed = seed;
    this.rnd = mulberry32(seed);
    this.roster = players;
    this.localId = net.id;
    this.single = !net.online;
    // Free play: the normal house and puzzles, but Ajan never comes out (single-player only).
    this.freePlay = freePlay && this.single;
    this.difficulty = difficultyOf(difficulty);
    this.hearMul = DIFFICULTY[this.difficulty].hear;
    this.startAt = startAt;
    this.players = new Map();
    this.items = new Map();
    this.kills = new Map();
    this.phase = 'loading';
    this.time = 0;
    this.offs = [];
    this.eventSeq = 0;
    this.chase = false;
    this.ajanSnap = null;
    this.sendT = 0;
    this.ajanSendT = 0;
    this.voiceNoiseT = 0;
    this.pickT = 0;
    this.focus = null;
    this.ambientT = 8;
    this.directorT = { tv: 40 + this.rnd() * 40, flash: 15 + this.rnd() * 20, blackout: 80, ambush: 0 };
    this.lightningK = 0;
    this.msgT = 0;
    this.spectate = { target: null, yaw: 0, pitch: 0.25, dist: 2.8 };
    this.localDead = false;
    this.localEscaped = false;
    this.ended = false;
    this.ajanStepDist = 0;
    this.lastAjanState = 'dormant';
    this.heartT = 0;
  }

  get me() { return this.players.get(this.localId); }
  get isHost() { return this.net.isHost; }

  // =============================================================== setup
  async init(progress = () => {}) {
    const app = this.app;
    this.renderer = app.renderer;
    this.canvas = this.renderer.domElement;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030304);
    scene.fog = new THREE.FogExp2(0x050506, 0.045);
    this.hemi = new THREE.HemisphereLight(0x46506a, 0x16110d, 1.0);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x262a36, 0.6);
    scene.add(this.ambient);
    // While hiding, the room you look out into is lit up so you can actually watch it.
    this.hideLight = new THREE.PointLight(0xffe4c0, 0, 16, 1.0);
    scene.add(this.hideLight);
    this.muzzle = new THREE.PointLight(0xffc070, 0, 14, 1.4);
    scene.add(this.muzzle);
    this.hideK = 0;

    progress(0.1, 'Building the house...');
    this.house = new House(mulberry32(this.seed ^ 0x51ed));
    this.house.createLightPool(settings.quality === 'low' ? 4 : settings.quality === 'high' ? 7 : 6);
    scene.add(this.house.group);

    progress(0.3, 'Loading models...');
    const [pg, ag] = await Promise.all([loadGLTF('playerModel'), loadGLTF('ajanModel')]);
    this.playerGLTF = pg;
    progress(0.55, 'Hanging the paintings...');
    const tex = await Promise.all([1, 2, 3, 4, 5].map(i => loadTexture('image' + i)));
    this.paintingTextures = tex;
    this.house.assignPaintings(tex, this.rnd);
    this.placeItems();
    this.screens = new Screens(this.house, tex);
    this.props = new Props(this);
    await this.props.init();
    this.spider = new Spider(this);
    await this.fitRevolver();

    progress(0.7, 'Waking him up...');
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 70);
    this.camera.layers.enable(2);
    scene.add(this.camera);
    const meProfile = this.roster.find(p => p.id === this.localId) || this.roster[0];
    this.local = new LocalPlayer(this, this.camera, meProfile);
    this.local.setShadows(settings.quality);

    // Players
    const sorted = [...this.roster].sort((a, b) => (a.id < b.id ? -1 : 1));
    sorted.forEach((p, i) => {
      const isLocal = p.id === this.localId;
      const av = new Avatar('player', pg, { shirt: p.shirt, pants: p.pants });
      scene.add(av.group);
      if (isLocal) av.setLayer(1);
      const sp = SPAWN_POINTS[i % SPAWN_POINTS.length];
      const pl = {
        id: p.id, name: p.name, character: p.character, shirt: p.shirt, pants: p.pants, isLocal, avatar: av,
        pos: V(sp[0], 0, sp[1]), target: V(sp[0], 0, sp[1]), yaw: Math.PI, tyaw: Math.PI, pitch: 0, speed: 0,
        crouch: 0, run: false, flash: true, hidden: false, hideId: null, alive: true, dying: false, escaped: false,
        speaking: false, act: 0, actT: 9, spawn: sp, label: null, light: null,
      };
      if (isLocal) this.local.pos.set(sp[0], 0, sp[1]);
      else {
        pl.label = this.makeLabel(pl);
      }
      this.players.set(p.id, pl);
    });

    // Two pooled spotlights for other players' flashlights (nearest ones get them).
    this.remoteLights = [0, 1].map(() => {
      const l = new THREE.SpotLight(0xfff0d8, 0, 18, 0.5, 0.5, 1.6);
      scene.add(l, l.target);
      return l;
    });

    this.ajan = new Avatar('ajan', ag);
    this.ajan.group.position.set(17, -50, 4);
    scene.add(this.ajan.group);
    this.ajanVis = { pos: V(17, -50, 4), ry: 0, st: 'dormant', m: 'move', mt: 0, sp: 0, hy: 0 };
    this.fx = new DissolveFX(scene);
    this.buildDust();

    if (this.isHost) this.brain = new AjanBrain(this, mulberry32(this.seed ^ 0x9e3779b9));
    if (this.freePlay && this.brain) {
      this.brain.dormantLeft = Infinity; // he stays out of the house
      this.brain.hear = () => {};
    }

    this.post = new PostFX(this.renderer, scene, this.camera);
    this.applyGraphics();
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.resize();

    this.bindNet();
    this.bindInput();
    this.voice = new VoiceChat(this.net);
    if (this.net.online) await this.voice.start(this.roster.map(p => p.id));
    if (!mic.stream && settings.micConfigured && settings.micId !== 'none') await mic.open(settings.micId);

    // Warm up shaders so the first frames don't hitch.
    this.renderer.compile(scene, this.camera);
    progress(1, 'Ready');
    this.phase = 'intro';
    this.updateHUD();
  }

  /** Floating dust motes around the viewer (wrapped into a box that follows the camera). */
  buildDust() {
    const n = settings.quality === 'low' ? 150 : 400;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 10;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd8ccb0, size: 0.018, transparent: true, opacity: 0.32, depthWrite: false, fog: true }));
    this.dust.frustumCulled = false;
    this.dustVel = Float32Array.from({ length: n * 3 }, () => (Math.random() - 0.5) * 0.04);
    this.scene.add(this.dust);
  }

  updateDust(dt) {
    const a = this.dust.geometry.attributes.position.array;
    const c = this.camera.position;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += this.dustVel[i] * dt;
      a[i + 1] += (this.dustVel[i + 1] - 0.006) * dt;
      a[i + 2] += this.dustVel[i + 2] * dt;
      for (let k = 0; k < 3; k++) {
        const d = a[i + k] - (k === 0 ? c.x : k === 1 ? c.y : c.z);
        if (d > 5) a[i + k] -= 10; else if (d < -5) a[i + k] += 10;
      }
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }

  applyGraphics() {
    const q = settings.quality;
    const pr = q === 'low' ? 0.7 : q === 'high' ? Math.min(devicePixelRatio, 1.5) : 1;
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.local?.setShadows(q);
    this.post?.setLevel(settings.vhs);
    this.resize();
  }

  resize() {
    if (!this.camera) return;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post?.setSize(innerWidth, innerHeight);
  }

  placeItems() {
    for (const [type, cands] of Object.entries(ITEM_SPAWNS)) {
      const c = cands[Math.floor(this.rnd() * cands.length)];
      const mesh = makeItemMesh(type, this.house.M);
      const item = { id: type, type, holder: null, used: false, mesh, container: c.container || null, dropped: null };
      if (c.container) {
        const cont = this.house.containers.get(c.container);
        mesh.position.copy(cont.slot);
        mesh.rotation.y = 0.4;
        (cont.type === 'drawer' ? cont.part : cont.group).add(mesh);
      } else {
        mesh.position.set(...c.pos);
        mesh.rotation.y = this.rnd() * 6;
        this.house.group.add(mesh);
      }
      // Invisible, generous pick volume so small items are easy to aim at.
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      mesh.add(proxy);
      const wp = new THREE.Vector3();
      mesh.getWorldPosition(wp);
      this.house.register('item_' + type, 'item', [mesh], wp, { item });
      this.items.set(type, item);
    }
  }

  makeLabel(p) {
    const el = document.createElement('div');
    el.className = 'nameLabel';
    el.innerHTML = `<span class="mic">&#127908;</span><span class="nm">${escapeHtml(p.name)}</span>`;
    $('labels').appendChild(el);
    return el;
  }

  // =============================================================== input
  bindInput() {
    this.onKeyDown = e => {
      if (this.phase !== 'play') return;
      if (e.code === 'Escape' && $('noteView').classList.contains('show')) { this.closeNote(); return; }
      if (e.code === 'KeyE' && !e.repeat) this.interact();
      if (e.code === 'KeyM' && !e.repeat) { mic.setMuted(!settings.micMuted); this.updateHUD(); }
      // Inside the elevator car, 1–4 pick a floor (B, ground, upstairs, attic).
      const fl = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (fl >= 0 && !e.repeat && this.inElevatorCar()) this.pressElevator(fl);
      if (this.isSpectating()) {
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.cycleSpectate(1);
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.cycleSpectate(-1);
      }
    };
    this.onMouseDown = e => {
      if (this.phase !== 'play') return;
      if (document.pointerLockElement !== this.canvas) {
        if (!this.app.paused && !$('noteView').classList.contains('show')) this.lockPointer();
        return;
      }
      if (this.isSpectating()) { this.cycleSpectate(e.button === 2 ? -1 : 1); return; }
      if (e.button === 0) this.tryShoot();
    };
    this.onMouseMove = e => {
      if (!this.isSpectating() || document.pointerLockElement !== this.canvas) return;
      const s = 0.003 * settings.mouse;
      this.spectate.yaw -= e.movementX * s;
      this.spectate.pitch = clamp(this.spectate.pitch + e.movementY * s, -0.2, 1.1);
    };
    this.onLockChange = () => {
      if (this.phase !== 'play') return;
      if (document.pointerLockElement !== this.canvas && !$('noteView').classList.contains('show')) this.app.pause(true);
    };
    addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  lockPointer() {
    // Raw (unaccelerated) mouse input where supported avoids OS acceleration spikes.
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      p?.catch?.(() => { try { this.canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* not allowed yet */ } });
    } catch { try { this.canvas.requestPointerLock(); } catch { /* not allowed yet */ } }
  }

  inElevatorCar() {
    const p = this.local.pos;
    return inElevator(p.x, p.z) && Math.abs(p.y - elevatorState.y) < 0.4;
  }

  pressElevator(level) {
    const L = this.local;
    if (!this.me || this.localDead || this.localEscaped || L.hidden || L.frozen) return;
    const st = this.props.elev;
    if (!st.unlocked && !this.playerHas(this.localId, 'elevator_key')) { this.message(this.needText('elevator_key')); audio.play('rattle', { vol: 0.3, rate: 2 }); return; }
    L.act();
    audio.play('pickup', { vol: 0.4, rate: 0.7 });
    this.request({ k: 'elev', to: level });
  }

  isSpectating() { return !!((this.localDead || this.localEscaped) && this.spectate.active); }

  // ============================================================ networking
  bindNet() {
    const n = this.net;
    this.offs.push(n.on('relay', (from, t, d) => this.onRelay(from, t, d)));
    this.offs.push(n.on('peerLeft', id => this.onPeerLeft(id)));
    this.offs.push(n.on('hostChanged', () => this.onHostChanged()));
  }

  onRelay(from, t, d) {
    if (t === 'p') this.onPlayerState(from, d);
    else if (t === 'a') { if (!this.isHost) this.ajanSnap = d; }
    else if (t === 's') { if (!this.isHost) this.spider.snap = d; }
    else if (t === 'rq') { if (this.isHost) this.handleRequest(from, d); }
    else if (t === 'ev') this.applyEvent(d);
    else if (t === 'spk') { const p = this.players.get(from); if (p) p.speaking = !!d; }
  }

  onPlayerState(from, d) {
    const p = this.players.get(from);
    if (!p || p.isLocal) return;
    p.target.set(d[0], d[1], d[2]);
    p.tyaw = d[3];
    p.pitch = d[4];
    p.speed = d[5];
    p.crouch = d[6];
    p.run = !!d[7];
    p.flash = !!d[8];
    if (d[9] !== p.act) { p.act = d[9]; p.actT = 0; }
    if (!p.seen) { p.pos.copy(p.target); p.yaw = p.tyaw; p.seen = true; }
  }

  /** Ask the authority to do something (runs locally when we are the host). */
  request(req) {
    if (this.isHost) this.handleRequest(this.localId, req);
    else this.net.send('rq', req);
  }

  /** Authority broadcasts an event (applied locally too). */
  broadcast(ev, to = null) {
    ev.seq = ++this.eventSeq;
    if (to && to !== this.localId) { this.net.send('ev', ev, to); return; }
    if (to === this.localId) { this.applyEvent(ev); return; }
    this.net.send('ev', ev);
    this.applyEvent(ev);
  }

  onPeerLeft(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.isHost) this.dropItems(id, p.pos);
    p.label?.remove();
    this.scene.remove(p.avatar.group);
    if (p.hideId) { const h = this.house.hides.get(p.hideId); if (h) { h.occupant = null; h.target = 0; } }
    this.players.delete(id);
    this.toast(`${p.name} left the game.`);
    if (this.spectate.target === id) this.cycleSpectate(1);
    if (this.isHost) this.checkEnd();
  }

  onHostChanged() {
    if (this.isHost && !this.brain) {
      // Take over Ajan from the last replicated snapshot.
      this.brain = new AjanBrain(this, mulberry32(this.seed ^ Date.now()));
      const s = this.ajanSnap;
      if (s && s.st !== 'dormant') {
        this.brain.pos.set(s.x, s.y, s.z);
        this.brain.ry = s.ry;
        this.brain.state = 'patrol';
        this.brain.pickPatrol();
      } else this.brain.dormantLeft = 10;
      this.toast('You are now the host.');
    }
  }

  // ===================================================== authority logic
  playerHas(pid, type) {
    const it = this.items.get(type);
    return !!it && it.holder === pid && !it.used;
  }

  handleRequest(pid, r) {
    const p = this.players.get(pid);
    if (!p || !p.alive || p.escaped || p.dying) return;
    const H = this.house;
    switch (r.k) {
      case 'door': {
        const d = H.doors.get(r.id);
        if (!d) return;
        if (d.chained) {
          if (!this.playerHas(pid, 'bolt_cutters')) { this.broadcast({ k: 'need', what: 'bolt_cutters' }, pid); return; }
          this.broadcast({ k: 'chain', id: d.id, by: pid });
          this.hostNoise(d.center, 7, 'chain');
          return;
        }
        if (d.locked) {
          if (d.lock === 'power') { this.broadcast({ k: 'need', what: 'power' }, pid); return; }
          if (!this.playerHas(pid, d.lock)) { this.broadcast({ k: 'need', what: d.lock }, pid); return; }
          this.broadcast({ k: 'unlock', id: d.id, by: pid, item: d.lock });
          this.broadcast({ k: 'door', id: d.id, open: true, by: pid });
          this.hostNoise(d.center, 9, 'door');
          return;
        }
        this.hostSetDoor(d.id, !d.open, pid);
        return;
      }
      case 'container': {
        const c = H.containers.get(r.id);
        if (!c) return;
        if (c.locked) {
          if (!this.playerHas(pid, c.lock)) { this.broadcast({ k: 'need', what: c.lock }, pid); return; }
          this.broadcast({ k: 'unlockCont', id: r.id, by: pid, item: c.lock });
        }
        this.broadcast({ k: 'cont', id: r.id, open: c.target < 0.5 });
        this.hostNoise(c.group.position, 3.5, 'drawer');
        return;
      }
      case 'pickup': {
        const it = this.items.get(r.id);
        if (!it || it.holder || it.used) return;
        it.holder = pid; // claim immediately so a second request is rejected
        this.broadcast({ k: 'item', id: r.id, holder: pid });
        return;
      }
      case 'fuse': {
        if (H.power) return;
        if (!this.playerHas(pid, 'fuse')) { this.broadcast({ k: 'need', what: 'fuse' }, pid); return; }
        this.broadcast({ k: 'power', on: true, by: pid });
        this.hostNoise(H.fusebox.pos, 14, 'power');
        return;
      }
      case 'tv': {
        const on = this.screens.tv.mode === 'off';
        this.broadcast({ k: 'tv', mode: on ? 'static' : 'off', content: 0 });
        if (on) this.directorT.tvChannel = 3 + this.rnd() * 4;
        return;
      }
      case 'mon': {
        if (!H.power) { this.broadcast({ k: 'need', what: 'power' }, pid); return; }
        const cur = this.screens.monitorSel[r.i];
        this.broadcast({ k: 'mon', i: r.i, cam: (cur + 1) % this.screens.cams.length });
        return;
      }
      case 'hide': {
        const h = H.hides.get(r.id);
        if (!h) return;
        if (r.enter) {
          if (h.occupant || p.hidden) return;
          const b = this.brain;
          // He knows where you are if he was chasing you a moment ago or is looking right at you.
          const seen = !!b && b.state !== 'sleep' && b.state !== 'dormant' && b.pos.distanceTo(p.pos) < 9 &&
            ((b.state === 'chase' && b.target === pid && b.lastSeenT < 0.6) || b.canSee(p));
          h.occupant = pid;
          p.hideSeen = seen;
          this.broadcast({ k: 'hide', pid, id: r.id, on: true });
          this.hostNoise(h.inside, 3, 'hide');
        } else if (h.occupant === pid) {
          h.occupant = null;
          this.broadcast({ k: 'hide', pid, id: r.id, on: false });
        }
        return;
      }
      case 'noise': {
        const pos = V(r.x, r.y, r.z);
        if (isSafeZone(pos)) return; // nothing in the attic reaches him
        if (this.brain) this.brain.hear({ pos, radius: Math.min(r.r, 25), kind: r.kind, pid });
        return;
      }
      case 'board': {
        const b = H.floorboards[r.i];
        if (!b) return;
        const now = this.time;
        if ((b.lastHost || -9) > now - 2.5) return; // per-board cooldown
        b.lastHost = now;
        this.broadcast({ k: 'creak', i: r.i, pid });
        if (this.brain) this.brain.hear({ pos: V(b.x, b.y, b.z), radius: 17, kind: 'board', pid, exact: true });
        return;
      }
      case 'elev': {
        const P = this.props, st = P.elev, now = this.net.serverNow();
        if (P.elevatorMoving(now)) return;
        if (!st.unlocked) {
          if (!this.playerHas(pid, 'elevator_key')) { this.broadcast({ k: 'need', what: 'elevator_key' }, pid); return; }
          this.broadcast({ k: 'elevUnlock', by: pid });
        }
        if (r.to === 0 && H.doors.get('d_basement').locked && !this.playerHas(pid, 'basement_key')) { this.broadcast({ k: 'need', what: 'basement_key' }, pid); return; }
        const curY = P.elevatorY(now);
        if (Math.abs(curY - LEVELS[r.to].y) < 0.05) return;
        // Nobody may be standing in a doorway when the doors close.
        const blocked = [...this.players.values()].some(q => q.alive && !q.escaped && Math.abs(q.pos.x - 34.6) < 0.8 && (Math.abs(q.pos.z - 11) < 0.35 || Math.abs(q.pos.z - 13.4) < 0.35));
        if (blocked) { this.broadcast({ k: 'msg', text: 'Someone is standing in the elevator doors.' }, pid); return; }
        this.broadcast({ k: 'elev', fromY: curY, to: r.to, at: now + 1300 });
        this.elevNoiseT = 0;
        return;
      }
      case 'radio': {
        const radio = this.props.radios.get(r.id);
        if (!radio) return;
        const on = !radio.on;
        this.broadcast({ k: 'radio', id: r.id, on });
        if (on) { radio.offAt = this.time + 25; radio.noiseT = 0; }
        return;
      }
      case 'boom': {
        const bb = this.props.boombox;
        if (!bb || performance.now() < bb.until) return;
        const keys = DEATH_KEYS.filter(k => audio.buffers[k]);
        if (!keys.length) return;
        this.broadcast({ k: 'boom', key: keys[Math.floor(this.rnd() * keys.length)] });
        return;
      }
      case 'cinema': {
        const now = this.net.serverNow();
        const P = this.props;
        const cur = Math.max(0, P.cinemaTime(now));
        const s = P.cinema.state;
        let next;
        if (r.a === 'restart') next = { playing: true, pos: 0, at: now + 300 };
        else next = s.playing ? { playing: false, pos: cur, at: now } : { playing: true, pos: cur, at: now + 300 };
        this.broadcast({ k: 'cinema', ...next });
        return;
      }
      case 'shoot': this.hostShoot(pid, r); return;
      case 'jelly': {
        if ((this.jellyHostT || 0) > this.time - 0.25) return;
        this.jellyHostT = this.time;
        this.broadcast({ k: 'jelly', ix: clamp(r.ix, -1.5, 1.5), iz: clamp(r.iz, -1.5, 1.5) });
        return;
      }
      case 'escape': {
        const d = H.doors.get('d_front');
        if (!d || d.locked || !d.open) return;
        const group = [...this.players.values()].filter(q => q.alive && !q.escaped && !q.dying && Math.hypot(q.pos.x - 4.65, q.pos.z - 21.2) < 3.2).map(q => q.id);
        if (!group.includes(pid)) group.push(pid);
        // Anything they still carry stays inside for the others.
        group.forEach(id => this.dropItems(id, V(4.65, 0, 19.8)));
        this.broadcast({ k: 'escape', pids: group, at: this.net.serverNow() + 600 });
        return;
      }
    }
  }

  hostSetDoor(id, open, by) {
    const d = this.house.doors.get(id);
    if (!d || d.locked) return;
    this.broadcast({ k: 'door', id, open, by });
    this.hostNoise(d.center, by === 'ajan' ? 14 : 8, 'door', by === 'ajan' ? 'ajan' : by);
  }

  hostNoise(pos, radius, kind, pid = null, exact = false) {
    if (!this.brain || pid === 'ajan') return;
    const p = pos.clone ? pos.clone() : V(pos.x, pos.y, pos.z);
    if (isSafeZone(p)) return;
    this.brain.hear({ pos: p, radius, kind, pid, exact });
  }

  hostStartKill(pid) {
    const p = this.players.get(pid);
    if (!p || !p.alive || p.dying || this.kills.has(pid)) return;
    if (isSafeZone(p.pos)) return; // the attic is sacred
    if (this.freePlay) return;
    p.dying = true;
    const b = this.brain;
    b.setState('kill');
    b.anim = 'grab';
    b.animT = 0;
    // Face the victim
    b.ry = Math.atan2(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
    const dur = EAT_START + this.eatDuration(p.character) + 0.4;
    this.broadcast({ k: 'kill', pid, x: b.pos.x, y: b.pos.y, z: b.pos.z, ry: b.ry, vx: p.pos.x, vy: p.pos.y, vz: p.pos.z });
    setTimeout(() => {
      if (this.disposed) return;
      this.broadcast({ k: 'dead', pid, x: p.pos.x, y: p.pos.y, z: p.pos.z });
      this.dropItems(pid, p.pos);
      b.finishKill();
      this.checkEnd();
    }, dur * 1000);
  }

  // ============================================================ revolver
  /** object.glb shrunk to pistol size: placed in the safe and used as the in-hand model. */
  async fitRevolver() {
    this.gunReadyAt = 0;
    const gltf = await loadGLTF('objectModel');
    let src = null;
    gltf?.scene.traverse(o => { if (!src && o.isMesh) src = o; });
    const inner = src
      ? new THREE.Mesh(src.geometry, src.material.clone())
      : new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 }));
    inner.geometry.computeBoundingBox();
    const bb = inner.geometry.boundingBox, size = bb.getSize(V()), ctr = bb.getCenter(V());
    // longest axis → forward (−z), about 0.28 m long: fits in the hand
    const k = 0.28 / Math.max(size.x, size.y, size.z, 1e-3);
    inner.scale.setScalar(k);
    inner.position.copy(ctr).multiplyScalar(-k);
    const holder = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.add(inner);
    if (size.y >= size.x && size.y >= size.z) pivot.rotation.x = -Math.PI / 2;
    else if (size.x >= size.z) pivot.rotation.y = Math.PI / 2;
    holder.add(pivot);
    holder.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material.metalness = Math.max(o.material.metalness || 0, 0.35); } });
    this.revolverModel = holder;
    const it = this.items.get('revolver');
    if (it) { const m = holder.clone(); m.position.y = 0.06; it.mesh.add(m); }
  }

  gunStatus() {
    const left = (this.gunReadyAt || 0) - this.net.serverNow();
    if (left <= 0) return 'LOADED';
    const sec = Math.ceil(left / 1000);
    return `RELOADING ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  tryShoot() {
    const L = this.local;
    if (!this.playerHas(this.localId, 'revolver') || this.localDead || this.localEscaped || L.hidden || L.frozen || this.me?.dying) return false;
    if (this.net.serverNow() < (this.gunReadyAt || 0)) {
      audio.play('click', { vol: 0.35, rate: 1.5 });
      this.message(`Revolver: ${this.gunStatus().toLowerCase()}.`, 2);
      return true;
    }
    this.camera.updateMatrixWorld();
    const o = this.camera.getWorldPosition(V()), d = this.camera.getWorldDirection(V());
    this.request({ k: 'shoot', o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] });
    return true;
  }

  /** Host: resolve a shot. One round, then three minutes to reload. */
  hostShoot(pid, r) {
    const now = this.net.serverNow();
    const p = this.players.get(pid);
    if (!p || !p.alive || p.dying || !this.playerHas(pid, 'revolver') || now < (this.gunReadyAt || 0)) return;
    const o = V(...r.o), d = V(...r.d);
    if (!(d.lengthSq() > 0.5) || o.distanceTo(p.pos) > 2.6) return;
    d.normalize();
    const b = this.brain;
    let hit = null;
    if (b && b.state !== 'dormant') {
      for (let t = 0.3; t < 40; t += 0.06) {
        const q = o.clone().addScaledVector(d, t);
        if (Math.hypot(q.x - b.pos.x, q.z - b.pos.z) < 0.55 && q.y > b.pos.y + 0.15 && q.y < b.pos.y + 2.4) { hit = q; break; }
      }
      if (hit) {
        const sameFloor = levelOf(o.y - 1.4) === levelOf(b.pos.y) || (inStairs(o) && inStairs(b.pos));
        if (!sameFloor || segmentBlockers(o.x, o.z, hit.x, hit.z, (o.y + hit.y) / 2, this.house.colliders, { max: 1 }) > 0) hit = null;
      }
    }
    const stunned = hit ? b.stun(25) : false;
    this.broadcast({ k: 'shot', by: pid, at: now, ox: o.x, oy: o.y, oz: o.z, hit: !!hit, stunned, hx: hit?.x, hy: hit?.y, hz: hit?.z });
    // A gunshot is the loudest thing in the house. If he's still up, he comes.
    if (!stunned) this.hostNoise(p.pos, 45, 'gunshot', pid, true);
  }

  applyShot(e) {
    this.gunReadyAt = e.at + GUN_RELOAD_MS;
    const local = e.by === this.localId;
    const at = V(e.ox, e.oy, e.oz);
    audio.play('gunshot', local ? { vol: 1.0, limit: true } : { pos: at, vol: 1.0, ref: 6, rolloff: 0.8 });
    this.muzzle.position.copy(at);
    this.muzzle.intensity = 40;
    if (local) { this.local.recoil = 1; this.post.glitch(0.25); }
    if (e.hit) {
      const hp = V(e.hx, e.hy, e.hz);
      this.fx.emit(hp, 0.2, 0.4, 14);
      audio.play('roar', { pos: hp, vol: 1.0, ref: 3, rate: 0.8 });
    }
    const who = this.players.get(e.by)?.name || 'Someone';
    if (local) this.message(e.stunned ? 'Hit! He goes down — you have about 25 seconds.' : e.hit ? 'Hit… but it didn\'t stop him.' : 'Missed. He heard that.', 4);
    else this.message(e.stunned ? `${who} shot Ajan! He's down.` : `${who} fired a gun.`, 3);
    this.updateHUD();
  }

  /** The nursery spider caught someone: a fast, brutal death (no eating sequence). */
  hostSpiderKill(pid) {
    const p = this.players.get(pid);
    if (!p || !p.alive || p.dying || this.kills.has(pid) || this.freePlay) return;
    p.dying = true;
    const sp = this.spider.pos;
    this.broadcast({ k: 'spiderkill', pid, x: sp.x, z: sp.z });
    setTimeout(() => {
      if (this.disposed) return;
      this.broadcast({ k: 'dead', pid, x: p.pos.x, y: p.pos.y, z: p.pos.z });
      this.dropItems(pid, p.pos);
      this.checkEnd();
    }, 1800);
  }

  applySpiderKill(e) {
    const p = this.players.get(e.pid);
    if (!p) return;
    p.dying = true;
    this.spider.hiss();
    const c = charById(p.character);
    const snd = c.id === 'AJAN' ? 'ajandie' : c.sound;
    const gain = DEATH_GAIN[c.id] ?? 1;
    if (snd) audio.play(snd, p.isLocal ? { vol: gain, limit: gain > 1 } : { pos: p.pos.clone().add(V(0, 1.4, 0)), vol: gain, ref: 3, limit: gain > 1 });
    if (p.label) p.label.style.opacity = 0;
    if (p.isLocal) {
      this.local.frozen = true;
      if (this.local.hidden) { this.local.hidden = null; $('hideOverlay').classList.remove('show'); }
      this.post.vhs.uniforms.redFlash.value = 0.6;
      this.post.glitch(1.8);
      $('hud').classList.add('dying');
      this.spiderDeath = { t: 0, from: this.camera.position.clone() };
    } else {
      p.avatar.state = { mode: 'grabbed', speed: 0 };
    }
  }

  updateSpiderDeath(dt) {
    const s = this.spiderDeath;
    if (!s || s.done) return;
    s.t += dt;
    const cam = this.camera;
    const head = this.spider.pos.clone().add(V(0, 0.55, 0));
    // dragged down to the floor, face to face with it
    cam.position.lerp(V(head.x + Math.sin(this.spider.ry) * 1.25, this.spider.pos.y + 0.45, head.z + Math.cos(this.spider.ry) * 1.25), Math.min(1, dt * 6));
    cam.position.x += (Math.random() - 0.5) * 0.06;
    cam.position.y += (Math.random() - 0.5) * 0.06;
    cam.lookAt(head);
    this.local.hands.visible = false;
    this.post.vhs.uniforms.redFlash.value = Math.min(0.8, this.post.vhs.uniforms.redFlash.value + dt * 0.4);
    if (s.t > 1.8) { s.done = true; this.onLocalDeath(); }
  }

  hostDragOut(pid) {
    const p = this.players.get(pid);
    if (!p || !p.hidden) return;
    const h = this.house.hides.get(p.hideId);
    if (h) h.occupant = null;
    this.broadcast({ k: 'hide', pid, id: p.hideId, on: false, forced: true });
    this.hostStartKill(pid);
  }

  dropItems(pid, pos) {
    if (pos.x > 33.2 && pos.x < 36 && pos.z > 10.8 && pos.z < 13.6) pos = V(34.6, pos.y, pos.y < -1.4 ? 14.3 : 10.0);
    for (const it of this.items.values()) {
      if (it.holder === pid && !it.used) {
        this.broadcast({ k: 'drop', id: it.id, x: pos.x + (this.rnd() - 0.5) * 0.6, y: pos.y, z: pos.z + (this.rnd() - 0.5) * 0.6 });
      }
    }
  }

  checkEnd() {
    if (this.ended || !this.isHost) return;
    const remaining = [...this.players.values()].filter(p => p.alive && !p.escaped);
    if (remaining.length === 0) {
      const results = [...this.players.values()].map(p => ({ id: p.id, name: p.name, escaped: p.escaped }));
      this.broadcast({ k: 'end', results });
    }
  }

  eatDuration(character) {
    const c = charById(character);
    const key = c.id === 'AJAN' || !c.sound ? null : c.sound;
    return Math.max(3.4, (key ? audio.duration(key) : 0) + 0.4);
  }

  ajanSound(kind) {
    if (this.brain) this.broadcast({ k: 'ajs', s: kind });
  }

  onAjanState(s) {
    const chase = s === 'chase' || s === 'drag';
    if (chase !== this.chase && this.isHost) this.broadcast({ k: 'music', chase });
  }

  // ================================================= events (all clients)
  applyEvent(e) {
    const H = this.house;
    const me = this.me;
    switch (e.k) {
      case 'need': {
        this.message(this.needText(e.what));
        audio.play('rattle', { vol: 0.5 });
        break;
      }
      case 'door': {
        const d = H.doors.get(e.id);
        if (!d) break;
        H.setDoor(e.id, e.open);
        audio.play(e.by === 'ajan' ? 'slam' : 'creak', { pos: d.center, vol: e.by === 'ajan' ? 0.9 : 0.55, rate: 0.9 + Math.random() * 0.2 });
        this.markAct(e.by);
        break;
      }
      case 'unlock': {
        const d = H.doors.get(e.id);
        if (!d) break;
        d.locked = false;
        audio.play('clunk', { pos: d.center, vol: 0.7 });
        const it = this.items.get(e.item);
        if (it && e.item !== 'basement_key') it.used = true;
        if (e.by === this.localId) this.message(`Unlocked: ${d.name}`);
        this.updateHUD();
        break;
      }
      case 'unlockCont': {
        const c = H.containers.get(e.id);
        if (!c) break;
        c.locked = false;
        const it = this.items.get(e.item);
        if (it) it.used = true;
        audio.play('safeOpen', { pos: c.group.position, vol: 0.9, ref: 2.5 });
        if (e.by === this.localId) this.message('The weapon key turns. The safe swings open.');
        this.updateHUD();
        break;
      }
      case 'shot': this.applyShot(e); break;
      case 'cont': {
        H.setContainer(e.id, e.open);
        const c = H.containers.get(e.id);
        audio.play('drawer', { pos: c.group.position, vol: 0.6 });
        break;
      }
      case 'item': {
        const it = this.items.get(e.id);
        if (!it) break;
        it.holder = e.holder;
        it.mesh.parent?.remove(it.mesh);
        H.interactables.delete('item_' + e.id);
        const who = this.players.get(e.holder);
        this.markAct(e.holder);
        if (e.holder === this.localId) {
          audio.play('pickup', { vol: 0.7 });
          this.message(`Picked up: ${ITEM_INFO[e.id].name}`);
        } else if (who) this.toast(`${who.name} found the ${ITEM_INFO[e.id].name}.`);
        this.updateHUD();
        break;
      }
      case 'drop': {
        const it = this.items.get(e.id);
        if (!it) break;
        it.holder = null;
        it.container = null;
        it.mesh.parent?.remove(it.mesh);
        it.mesh.position.set(e.x, e.y + 0.02, e.z);
        H.group.add(it.mesh);
        H.register('item_' + e.id, 'item', [it.mesh], V(e.x, e.y, e.z), { item: it });
        this.updateHUD();
        break;
      }
      case 'power': {
        H.power = true;
        const fuse = this.items.get('fuse');
        if (fuse) fuse.used = true;
        H.fusebox.fuseVisual.visible = true;
        H.fusebox.lever.rotation.x = -0.7;
        const sec = H.doors.get('d_sec');
        if (sec) sec.locked = false;
        audio.play('powerUp', { pos: H.fusebox.pos, vol: 0.9 });
        audio.play('hum', { pos: H.fusebox.pos, vol: 0.25, loop: true, ref: 1 });
        this.post?.glitch(1.2);
        this.message(e.by === this.localId ? 'The power is back on.' : 'Somebody restored the power.');
        this.markAct(e.by);
        this.updateHUD();
        break;
      }
      case 'tv': {
        this.screens.setTV(e.mode, e.content);
        this.tvAudio(e.mode);
        break;
      }
      case 'mon':
        this.screens.setMonitor(e.i, e.cam);
        audio.play('pickup', { pos: this.house.monitors[e.i].pos, vol: 0.4, rate: 0.6 });
        break;
      case 'hide': this.applyHide(e); break;
      case 'kill': this.startKillSeq(e); break;
      case 'spiderkill': this.applySpiderKill(e); break;
      case 'spider': if (e.s === 'hiss') this.spider.hiss(); break;
      case 'dead': {
        const p = this.players.get(e.pid);
        if (p) { p.alive = false; p.dying = false; p.avatar.group.visible = false; }
        // (our own death sequence, if one is still playing, calls onLocalDeath when it ends)
        if (p?.isLocal && !this.localDead && !this.kills.has(e.pid) && !(this.spiderDeath && !this.spiderDeath.done)) this.onLocalDeath();
        if (p?.label) p.label.style.opacity = 0;
        if (this.spectate.target === e.pid) this.cycleSpectate(1);
        this.updateHUD();
        break;
      }
      case 'escape': this.applyEscape(e); break;
      case 'music': this.chase = e.chase; this.updateMusic(); break;
      case 'ajs': {
        const pos = this.ajanVis.pos.clone().add(V(0, 1.9, 0));
        if (e.s === 'roar') { audio.play('roar', { pos, vol: 1.0, ref: 3 }); this.post?.glitch(0.6); }
        else if (e.s === 'laugh') audio.play('sleep', { pos, vol: 0.9, ref: 2.5, duration: 3 }); // first 3 s of sleep.mp3
        else if (e.s === 'whisper') audio.play('ajan', { pos, vol: 0.45, ref: 1.6, rolloff: 1.6, rate: 0.92 });
        else audio.play('growl', { pos, vol: 0.8, ref: 2.5, rate: 0.9 + Math.random() * 0.2 });
        break;
      }
      case 'msg': this.message(e.text); break;
      case 'chain': {
        const d = H.doors.get(e.id);
        if (!d) break;
        d.chained = false;
        if (H.exitChain) H.exitChain.visible = false;
        const it = this.items.get('bolt_cutters');
        if (it) it.used = true;
        audio.play('clunk', { pos: d.center, vol: 0.9, rate: 1.4 });
        audio.play('rattle', { pos: d.center, vol: 0.7 });
        this.markAct(e.by);
        if (e.by === this.localId) this.message('You cut the chain.');
        this.updateHUD();
        break;
      }
      case 'elevUnlock':
        this.props.elev.unlocked = true;
        { const it = this.items.get('elevator_key'); if (it) it.used = true; }
        if (e.by === this.localId) this.message('The elevator key turns. The elevator is working.');
        this.updateHUD();
        break;
      case 'elev':
        this.props.elevatorMove(e);
        audio.play('clunk', { pos: V(34.6, e.fromY + 1, 12.2), vol: 0.6 });
        break;
      case 'radio': this.props.setRadio(e.id, e.on); break;
      case 'boom': this.props.playBoombox(e.key); break;
      case 'phone': this.props.phoneRecording(e.offset); break;
      case 'cinema': this.props.setCinema({ playing: e.playing, pos: e.pos, at: e.at }); break;
      case 'jelly': this.props.pokeJelly(e.ix, e.iz); break;
      case 'mirror': this.props.setMirror(e.i); break;
      case 'creak': {
        const b = H.floorboards[e.i];
        if (b && e.pid !== this.localId) audio.play('boardCreak', { pos: V(b.x, b.y + 0.1, b.z), vol: 1.0, ref: 2.5, rate: 0.9 + (e.i % 3) * 0.06, muffle: this.muffleFor(V(b.x, b.y, b.z)) });
        break;
      }
      case 'flash': this.lightning(); break;
      case 'blackout':
        H.blackout = e.dur;
        audio.play('clunk', { vol: 0.5 });
        break;
      case 'end': this.onEnd(e.results); break;
    }
  }

  needText(what) {
    if (what === 'power') return 'You need power for that';
    if (what === 'bolt_cutters') return 'You need Bolt Cutters for that';
    const name = ITEM_INFO[what]?.name || what;
    return `You need ${/^[AEIOU]/i.test(name) ? 'an' : 'a'} ${name} for that`;
  }

  markAct(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    if (p.isLocal) this.local.act();
    else p.actT = 0;
  }

  tvAudio(mode) {
    if (this.tvSound) { this.tvSound.stop(0.2); this.tvSound = null; }
    if (mode !== 'off') {
      this.tvSound = audio.play('static', { pos: this.house.tv.pos, loop: true, vol: mode === 'static' ? 0.35 : 0.18, ref: 1.2 });
    }
  }

  applyHide(e) {
    const p = this.players.get(e.pid);
    const h = this.house.hides.get(e.id);
    if (!p || !h) return;
    if (e.on) {
      p.hidden = true;
      p.hideId = e.id;
      h.occupant = e.pid;
      h.target = 1;
      // closets shut again behind you — you watch the room through the louvers
      setTimeout(() => { if (h.occupant === e.pid) h.target = 0; }, 650);
      audio.play('creak', { pos: h.inside, vol: 0.35, rate: 1.4 });
      if (p.isLocal) {
        this.local.hidden = h;
        this.local.hideLook = 0;
        this.local.pitch = 0;
        $('hideOverlay').classList.add('show');
      }
    } else {
      p.hidden = false;
      p.hideId = null;
      p.hideSeen = false;
      if (h.occupant === e.pid) h.occupant = null;
      h.target = 1;
      setTimeout(() => { if (!h.occupant) h.target = 0; }, 700);
      audio.play(e.forced ? 'slam' : 'creak', { pos: h.inside, vol: 0.45, rate: 1.3 });
      if (p.isLocal) {
        this.local.hidden = null;
        this.local.pos.copy(h.exit);
        this.local.yaw = h.yaw + Math.PI;
        $('hideOverlay').classList.remove('show');
      } else {
        p.pos.copy(h.exit);
        p.target.copy(h.exit);
      }
    }
    this.markAct(e.pid);
  }

  // ======================================================== kill sequence
  startKillSeq(e) {
    const p = this.players.get(e.pid);
    if (!p || this.kills.has(e.pid)) return;
    p.dying = true;
    const c = charById(p.character);
    const sound = c.id === 'AJAN' ? null : c.sound;
    const seq = {
      pid: e.pid, p, t: 0, ajanPos: V(e.x, e.y, e.z), ry: e.ry, start: V(e.vx, e.vy, e.vz),
      sound, isAjanChar: c.id === 'AJAN', eatDur: this.eatDuration(p.character), stage: 0, chewT: 0, local: p.isLocal,
    };
    this.kills.set(e.pid, seq);
    p.avatar.group.visible = true;
    p.avatar.state.mode = 'grabbed';
    if (p.label) p.label.style.opacity = 0;
    if (seq.isAjanChar) {
      const gain = DEATH_GAIN.AJAN ?? 1;
      audio.play('ajandie', seq.local ? { vol: gain, limit: gain > 1 } : { pos: seq.start.clone().add(V(0, 1.5, 0)), vol: gain, ref: 3, limit: gain > 1 });
    }
    audio.play('growl', { pos: seq.ajanPos.clone().add(V(0, 2, 0)), vol: 1, ref: 3 });
    if (seq.local) {
      this.local.frozen = true;
      if (this.local.hidden) { this.local.hidden = null; $('hideOverlay').classList.remove('show'); }
      this.camera.layers.enable(1);
      this.post.vhs.uniforms.redFlash.value = 0.4;
      this.post.glitch(1.5);
      $('hud').classList.add('dying');
    }
  }

  updateKills(dt) {
    for (const [pid, s] of this.kills) {
      s.t += dt;
      const t = s.t;
      const av = s.p.avatar;
      const aj = this.ajan;
      // Ajan pose
      aj.group.position.copy(s.ajanPos);
      aj.group.rotation.y = s.ry;
      const mode = t < 0.6 ? 'grab' : t < EAT_START ? 'lift' : 'eat';
      aj.state = { speed: 0, mode, modeT: t < 0.6 ? t : t - 0.6 };
      aj.group.visible = true;
      aj.update(dt);
      aj.group.updateMatrixWorld(true);
      const fwd = V(Math.sin(s.ry), 0, Math.cos(s.ry));
      av.group.rotation.y = s.ry + Math.PI;
      if (t < 0.6) {
        const k = t / 0.6;
        const tgt = s.ajanPos.clone().addScaledVector(fwd, 0.75).add(V(0, 0.35, 0));
        av.group.position.lerpVectors(s.start, tgt, k * k);
      } else {
        const hand = aj.hand('R');
        // While eating, the victim's head is pulled right up to the mouth.
        if (t >= EAT_START) hand.lerp(aj.mouth().addScaledVector(fwd, 0.18), 0.65);
        const tgt = hand.add(V(0, -1.45, 0)).addScaledVector(fwd, -0.05);
        av.group.position.lerp(tgt, t < 0.9 ? 0.25 : 0.5);
      }
      av.state = { mode: 'grabbed', speed: 0 };
      av.update(dt);
      if (t >= EAT_START) {
        if (s.stage === 0) {
          s.stage = 1;
          if (s.sound) {
            const gain = DEATH_GAIN[s.p.character] ?? 1;
            audio.play(s.sound, s.local ? { vol: gain, limit: gain > 1 } : { pos: av.group.position.clone().add(V(0, 1.4, 0)), vol: gain, ref: 3, limit: gain > 1 });
          }
        }
        const k = clamp((t - EAT_START) / s.eatDur, 0, 1);
        av.setDissolve(k);
        s.chewT -= dt;
        if (s.chewT <= 0 && k < 1) {
          s.chewT = 0.4 + Math.random() * 0.2;
          audio.play('chew', { pos: aj.mouth(), vol: 0.8, rate: 0.8 + Math.random() * 0.4 });
        }
        if (k < 1) this.fx.emit(av.group.position.clone().add(V(0, 0.4 + (1 - k) * 1.0, 0)), 0.25, 0.6, 6);
        if (k >= 1 && s.stage === 1) {
          s.stage = 2;
          av.group.visible = false;
          audio.play('ajan', { pos: aj.mouth(), vol: 1, ref: 3 });
        }
      }
      if (s.local) this.updateDeathCam(s, dt);
      if (s.stage === 2 && t > EAT_START + s.eatDur + 1.6) {
        this.kills.delete(pid);
        av.setDissolve(0);
        if (s.local) this.onLocalDeath();
      }
    }
  }

  updateDeathCam(s, dt) {
    const cam = this.camera;
    const aj = this.ajan;
    const mouth = aj.mouth();
    const u = this.post.vhs.uniforms;
    if (s.t < EAT_START) {
      const head = s.p.avatar.group.position.clone().add(V(0, 1.5, 0));
      cam.position.lerp(head, 0.3);
      cam.lookAt(mouth);
      cam.position.x += (Math.random() - 0.5) * 0.05;
      cam.position.y += (Math.random() - 0.5) * 0.05;
      u.redFlash.value = Math.min(0.7, u.redFlash.value + dt * 0.3);
      this.local.hands.visible = false;
    } else {
      const a = s.ry + 0.9 + (s.t - EAT_START) * 0.12;
      const target = s.ajanPos.clone().add(V(Math.sin(a) * 3.4, 2.1, Math.cos(a) * 3.4));
      cam.position.lerp(target, s.t < EAT_START + 0.2 ? 1 : 0.08);
      cam.lookAt(mouth.x, mouth.y - 0.3, mouth.z);
      u.redFlash.value = damp(u.redFlash.value, 0.35, 2, dt);
    }
    this.heartT -= dt;
    if (this.heartT <= 0) { this.heartT = 0.55; audio.play('heartbeat', { vol: 0.6 }); }
  }

  onLocalDeath() {
    this.localDead = true;
    $('hud').classList.remove('dying');
    this.post.vhs.uniforms.redFlash.value = 0;
    $('deathOverlay').classList.add('show');
    setTimeout(() => {
      if (this.disposed) return;
      $('deathOverlay').classList.remove('show');
      const others = [...this.players.values()].some(p => !p.isLocal && p.alive && !p.escaped);
      if (this.ended || this.single || !others) {
        this.ended = true;
        if (!this.results) this.results = this.resultList();
        this.showEndScreen();
        return;
      }
      this.startSpectating();
    }, 2600);
    this.updateHUD();
  }

  // ============================================================ spectating
  startSpectating() {
    this.spectate.active = true;
    this.spectate.target = null;
    this.camera.layers.enable(1);
    this.cycleSpectate(1);
    $('spectateHud').classList.add('show');
    this.updateHUD();
  }

  spectateCandidates() {
    return [...this.players.values()].filter(p => p.alive && !p.escaped && !p.isLocal);
  }

  cycleSpectate(dir) {
    const list = this.spectateCandidates();
    if (!list.length) { this.spectate.target = null; this.updateHUD(); return; }
    const i = list.findIndex(p => p.id === this.spectate.target);
    const next = list[(i + dir + list.length) % list.length];
    this.spectate.target = next.id;
    this.spectate.yaw = next.yaw + Math.PI;
    $('spectateName').textContent = next.name;
    this.updateHUD();
  }

  updateSpectateCam(dt) {
    let p = this.players.get(this.spectate.target);
    if (!p || !p.alive || p.escaped) { this.cycleSpectate(1); p = this.players.get(this.spectate.target); }
    if (!p) return;
    const sp = this.spectate;
    const focus = p.pos.clone().add(V(0, 1.45, 0));
    let dist = sp.dist;
    const dir = V(Math.sin(sp.yaw) * Math.cos(sp.pitch), Math.sin(sp.pitch), Math.cos(sp.yaw) * Math.cos(sp.pitch));
    // Pull the camera in if a wall is in the way
    for (let d = sp.dist; d > 0.6; d -= 0.2) {
      const c = focus.clone().addScaledVector(dir, d);
      if (segmentBlockers(focus.x, focus.z, c.x, c.z, focus.y, this.house.colliders, { max: 1, pad: 0.15 }) === 0) { dist = d; break; }
      dist = d;
    }
    const want = focus.clone().addScaledVector(dir, dist);
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(focus);
    $('spectateName').textContent = p.name;
  }

  // =============================================================== escape
  applyEscape(e) {
    for (const pid of e.pids) {
      const p = this.players.get(pid);
      if (!p) continue;
      p.escaped = true;
      p.avatar.group.visible = false;
      if (p.label) p.label.style.opacity = 0;
    }
    if (e.pids.includes(this.localId) && !this.localEscaped) {
      this.localEscaped = true;
      this.local.frozen = true;
      const delay = Math.max(0, e.at - this.net.serverNow());
      setTimeout(() => this.app.playEscape(() => { this.escapeVideoDone = true; this.afterEscapeVideo(); }), delay);
    }
    if (this.isHost) this.checkEnd();
    this.updateHUD();
  }

  resultList() {
    return [...this.players.values()].map(p => ({ id: p.id, name: p.name, escaped: p.escaped }));
  }

  afterEscapeVideo() {
    if (this.disposed) return;
    if (this.ended || this.single) {
      this.ended = true;
      if (!this.results) this.results = this.resultList();
      this.showEndScreen();
      return;
    }
    this.updateMusic();
    if (this.spectateCandidates().length) this.startSpectating();
  }

  onEnd(results) {
    if (this.ended) return;
    this.ended = true;
    this.results = results;
    // Escaped players finish their cinematic first; the dying finish being eaten.
    if (this.app.cinemaPlaying || this.kills.has(this.localId) || $('deathOverlay').classList.contains('show')) return;
    if (this.localEscaped && !this.escapeVideoDone) return;
    this.showEndScreen();
  }

  showEndScreen() {
    if (this.endShown) return;
    this.endShown = true;
    this.phase = 'ended';
    $('hud').classList.remove('show');
    document.exitPointerLock?.();
    audio.setMusic('off');
    this.app.showEnd(this.results || [], this);
  }

  // ================================================================ play
  begin() {
    this.phase = 'play';
    this.local.frozen = false;
    const pl = this.me;
    if (pl) this.local.pos.set(pl.spawn[0], 0, pl.spawn[1]);
    this.local.yaw = Math.PI * 0.75;
    $('hud').classList.add('show');
    this.updateMusic();
    this.lockPointer();
    this.message(this.freePlay ? 'FREE PLAY — he isn\'t home. Explore freely.' : `Find a way out. Stay quiet.  [${DIFFICULTY[this.difficulty].label}]`, 6);
    this.wind = audio.play('wind', { loop: true, vol: 0.12 });
    if (this.house.clockSound) this.clockTick = audio.play('tick', { pos: this.house.clockSound, loop: true, vol: 0.5, ref: 1.6, rolloff: 1.5 });
    this.amb = {};
    for (const k of ['ambBase', 'ambHouse', 'ambUp', 'ambAttic']) this.amb[k] = audio.play(k, { loop: true, vol: 0 });
  }

  updateMusic() {
    if (this.phase !== 'play' || this.app.cinemaPlaying) return;
    audio.setMusic(this.chase ? 'chase' : 'ambient');
  }

  emitNoise(pos, radius, kind) {
    if (this.localDead || this.localEscaped) return;
    this.request({ k: 'noise', x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), r: radius, kind });
  }

  interact() {
    const L = this.local;
    if (this.localDead || this.localEscaped || L.frozen) return;
    if ($('noteView').classList.contains('show')) { this.closeNote(); return; }
    if (L.hidden) { this.request({ k: 'hide', id: L.hidden.id, enter: false }); return; }
    const f = this.focus;
    if (!f) return;
    const it = f.it;
    const me = this.localId;
    switch (it.kind) {
      case 'door': {
        const d = it.door;
        const rattle = what => {
          this.message(this.needText(what));
          audio.play('rattle', { pos: d.center, vol: 0.5 });
          this.request({ k: 'noise', x: d.center.x, y: d.y, z: d.center.z, r: 4, kind: 'rattle' });
        };
        if (d.chained && !this.playerHas(me, 'bolt_cutters')) { rattle('bolt_cutters'); return; }
        if (!d.chained && d.locked) {
          if (d.lock === 'power') { rattle('power'); return; }
          if (!this.playerHas(me, d.lock)) { rattle(d.lock); return; }
        }
        L.act();
        this.request({ k: 'door', id: d.id });
        break;
      }
      case 'container':
        if (it.container.locked && !this.playerHas(me, it.container.lock)) { this.message(this.needText(it.container.lock)); audio.play('rattle', { pos: it.container.group.position, vol: 0.4, rate: 1.6 }); return; }
        L.act(); this.request({ k: 'container', id: it.id }); break;
      case 'item': L.act(); this.request({ k: 'pickup', id: it.item.id }); break;
      case 'hide':
        if (it.spot.occupant) { this.message('Someone is already hiding in there.'); return; }
        L.act();
        this.request({ k: 'hide', id: it.id, enter: true });
        break;
      case 'fusebox':
        if (this.house.power) return;
        if (!this.playerHas(me, 'fuse')) { this.message('You need a Fuse for that'); return; }
        L.act();
        this.request({ k: 'fuse' });
        break;
      case 'tv': L.act(); this.request({ k: 'tv' }); break;
      case 'monitor':
        if (!this.house.power) { this.message('You need power for that'); return; }
        L.act();
        this.request({ k: 'mon', i: it.monitor.index });
        break;
      case 'note': L.act(); this.openNote(it.text); break;
      case 'elevbtn':
      case 'elevcall': this.pressElevator(it.level); break;
      case 'radio': L.act(); this.request({ k: 'radio', id: it.id }); break;
      case 'boombox': L.act(); this.request({ k: 'boom' }); break;
      case 'cinema': L.act(); this.request({ k: 'cinema', a: 'toggle' }); break;
      case 'vcr': L.act(); this.request({ k: 'cinema', a: 'restart' }); break;
      case 'jelly': {
        L.act();
        const j = this.props.jelly;
        const dx = j.pos.x - L.pos.x, dz = j.pos.z - L.pos.z, d = Math.hypot(dx, dz) || 1;
        this.request({ k: 'jelly', ix: dx / d, iz: dz / d });
        break;
      }
    }
  }

  openNote(text) {
    $('noteText').textContent = text;
    $('noteView').classList.add('show');
    audio.play('drawer', { vol: 0.3, rate: 1.8 });
    document.exitPointerLock?.();
  }
  closeNote() {
    $('noteView').classList.remove('show');
    this.lockPointer();
  }

  promptFor(it) {
    const me = this.localId;
    switch (it.kind) {
      case 'door': {
        const d = it.door;
        if (d.chained) return this.playerHas(me, 'bolt_cutters') ? 'E — CUT THE CHAIN' : 'E — OPEN  <span class="dim">[CHAINED]</span>';
        if (d.locked) {
          if (d.lock !== 'power' && this.playerHas(me, d.lock)) return `E — UNLOCK (${ITEM_INFO[d.lock].name})`;
          return `E — OPEN  <span class="dim">[LOCKED — ${d.lock === 'power' ? 'NO POWER' : ITEM_INFO[d.lock].name.toUpperCase()}]</span>`;
        }
        if (d.exit && d.open) return 'GET OUT!';
        return d.open ? 'E — CLOSE' : 'E — OPEN';
      }
      case 'container': return it.container.locked ? `E — OPEN ${it.name.toUpperCase()}${this.playerHas(this.localId, it.container.lock) ? '  <span class="dim">[USE ' + ITEM_INFO[it.container.lock].name.toUpperCase() + ']</span>' : '  <span class="dim">[LOCKED — ' + ITEM_INFO[it.container.lock].name.toUpperCase() + ']</span>'}` : it.container.target > 0.5 ? `E — CLOSE ${it.name.toUpperCase()}` : `E — OPEN ${it.name.toUpperCase()}`;
      case 'item': return `E — PICK UP ${ITEM_INFO[it.item.type].name.toUpperCase()}`;
      case 'hide': return it.spot.occupant ? '<span class="dim">OCCUPIED</span>' : `E — ${it.spot.label}`;
      case 'fusebox': return this.house.power ? '<span class="dim">POWER RESTORED</span>' : this.playerHas(me, 'fuse') ? 'E — USE FUSE' : 'E — USE';
      case 'tv': return this.screens.tv.mode === 'off' ? 'E — TURN ON' : 'E — TURN OFF';
      case 'monitor': return 'E — SWITCH CAMERA';
      case 'note': return 'E — READ';
      case 'elevbtn': return `E — GO TO ${['BASEMENT', 'GROUND FLOOR', 'UPSTAIRS', 'ATTIC'][it.level]}${!this.props.elev.unlocked ? '  <span class="dim">[NEEDS ELEVATOR KEY]</span>' : it.level === 0 && this.house.doors.get('d_basement').locked && !this.playerHas(this.localId, 'basement_key') ? '  <span class="dim">[NEEDS BASEMENT KEY]</span>' : ''}`;
      case 'elevcall': return `E — CALL ELEVATOR${this.props.elev.unlocked ? '' : '  <span class="dim">[NEEDS ELEVATOR KEY]</span>'}`;
      case 'radio': return it.radio.on ? 'E — TURN OFF RADIO' : 'E — TURN ON RADIO';
      case 'boombox': return 'E — PRESS PLAY';
      case 'cinema': return this.props.cinema.state.playing ? 'E — PAUSE FILM' : 'E — PLAY FILM';
      case 'vcr': return 'E — RESTART FILM';
      case 'jelly': return 'E — POKE';
    }
    return '';
  }

  updateFocus() {
    const L = this.local;
    if (L.hidden) { this.setPrompt('E — LEAVE'); this.focus = null; return; }
    if (L.frozen || this.localDead || this.localEscaped) { this.setPrompt(''); this.focus = null; return; }
    const rc = this.raycaster || (this.raycaster = new THREE.Raycaster());
    this.camera.updateMatrixWorld();
    rc.setFromCamera({ x: 0, y: 0 }, this.camera);
    rc.far = 2.6;
    rc.layers.set(0);
    const objs = this.house.pickMeshes.concat(this.house.staticMeshes);
    const hits = rc.intersectObjects(objs, false);
    let found = null;
    for (const h of hits) {
      const id = h.object.userData.iid;
      if (!id) break; // wall/static geometry first → blocked
      let it = this.house.interactables.get(id);
      if (!it) continue;
      // Looking at an open drawer/cabinet with something in it → target the item.
      if (it.kind === 'container' && it.container.target > 0.5) {
        const inside = [...this.items.values()].find(i => i.container === it.id && !i.holder && !i.used && this.house.interactables.has('item_' + i.id));
        if (inside) it = this.house.interactables.get('item_' + inside.id);
      }
      if (it.kind === 'item' && it.item.container) {
        const c = this.house.containers.get(it.item.container);
        if (c && c.open < 0.5) continue;
      }
      found = { it, dist: h.distance };
      break;
    }
    this.focus = found;
    this.setPrompt(found ? this.promptFor(found.it) : this.inElevatorCar() ? '1 B · 2 GROUND · 3 UPSTAIRS · 4 ATTIC <span class="dim">— or press a button</span>' : '');
  }

  setPrompt(html) {
    if (this._prompt === html) return;
    this._prompt = html;
    const el = $('prompt');
    el.innerHTML = html;
    el.classList.toggle('show', !!html);
    $('crosshair').classList.toggle('active', !!html);
  }

  message(text, sec = 5) {
    const el = $('message');
    el.textContent = text;
    el.classList.add('show');
    this.msgT = sec;
  }

  toast(text) { this.app.toast(text); }

  // ============================================================== HUD
  objective() {
    const H = this.house;
    const me = this.localId;
    const holderName = type => {
      const h = this.items.get(type)?.holder;
      return h && h !== me ? this.players.get(h)?.name : null;
    };
    const has = t => this.playerHas(me, t);
    const step = (type, haveMsg, findMsg, otherMsg) => {
      if (has(type)) return haveMsg;
      const n = holderName(type);
      return n ? `${n} ${otherMsg}` : findMsg;
    };
    const office = H.doors.get('d_office'), base = H.doors.get('d_basement'), storage = H.doors.get('d_storage');
    const front = H.doors.get('d_front');
    if (base.locked) {
      if (office.locked) return step('office_key', 'Unlock the office at the east end of the hallway.', 'Search the ground floor for the office key.', 'has the office key.');
      return step('basement_key', 'Unlock the basement door in the kitchen.', 'Find the basement key in the office.', 'has the basement key.');
    }
    if (!H.power) {
      if (has('fuse')) return 'Put the fuse in the fuse box in the basement.';
      if (holderName('fuse')) return `${holderName('fuse')} has the fuse. Restore the power in the basement.`;
      if (storage.locked) return step('storage_key', 'Unlock the storage room upstairs.', 'Get the storage room key from the nursery crib. Beware what waits in the corner.', 'has the storage room key.');
      return 'Find the spare fuse in the storage room upstairs.';
    }
    if (front.locked && !has('exit_key')) return step('exit_key', '', 'Find the front door key in the security room.', 'has the front door key.');
    if (front.chained) return step('bolt_cutters', 'Cut the chain on the front door.', 'Find bolt cutters for the front door chain (basement).', 'has the bolt cutters.');
    if (front.locked) return step('exit_key', 'Unlock the front door in the living room.', 'Find the front door key in the security room.', 'has the front door key.');
    return 'The front door is open. ESCAPE!';
  }

  updateHUD() {
    if (!this.house) return;
    $('objective').textContent = this.localDead ? 'You were eaten.' : this.localEscaped ? 'You escaped.' : this.objective();
    const inv = [...this.items.values()].filter(i => i.holder === this.localId && !i.used);
    $('inventory').innerHTML = inv.length
      ? inv.map(i => `<div class="slot"><span class="ico ${i.type}"></span>${escapeHtml(ITEM_INFO[i.type].name)}${i.type === 'revolver' ? ` <span class="dim">${this.gunStatus()}</span>` : ''}</div>`).join('')
      : '<div class="slot empty">— empty —</div>';
    $('micState').classList.toggle('muted', settings.micMuted || !mic.stream);
    $('micState').title = !mic.stream ? 'No microphone' : settings.micMuted ? 'Muted (M)' : 'Mic on (M to mute)';
    $('spectateHud').classList.toggle('show', this.isSpectating());
    const tgt = this.players.get(this.spectate.target);
    $('spectateName').textContent = tgt ? tgt.name : 'Nobody left to watch';
  }

  // ============================================================ lightning
  lightning() {
    this.lightningK = 1;
    const d = 0.4 + Math.random() * 1.4;
    setTimeout(() => !this.disposed && audio.play('thunder', { vol: 0.65 }), d * 1000);
  }

  // ============================================================== director
  hostDirector(dt) {
    const D = this.directorT;
    const P = this.props;
    // Radios: noisy until switched off; Ajan turns them off when he arrives.
    for (const r of P.radios.values()) {
      if (!r.on) continue;
      r.noiseT = (r.noiseT || 0) - dt;
      if (r.noiseT <= 0) { r.noiseT = 2; this.hostNoise(r.pos, 48, 'radio', null, true); }
      const b = this.brain;
      const ajanNear = b && b.state !== 'dormant' && b.pos.distanceTo(r.pos) < 2.2;
      if (this.time > r.offAt || ajanNear) {
        this.broadcast({ k: 'radio', id: r.id, on: false });
        if (ajanNear) this.ajanSound('growl');
      }
    }
    // The elevator is loud while it moves.
    if (P.elevatorMoving(this.net.serverNow())) {
      this.elevNoiseT = (this.elevNoiseT || 0) - dt;
      if (this.elevNoiseT <= 0) { this.elevNoiseT = 1.5; this.hostNoise(V(34.6, elevatorState.y, 12.2), 22, 'elevator'); }
    }
    // The phone in the guest room: when someone is in there, sometimes it plays.
    D.phone = (D.phone ?? 12) - dt;
    if (D.phone <= 0) {
      D.phone = 15;
      const someone = [...this.players.values()].some(p => p.alive && !p.escaped && roomAt(p.pos.x, p.pos.z, p.pos.y + 0.5)?.id === 'guest');
      if (someone && !P.phone?.playing && this.rnd() < 0.3) this.broadcast({ k: 'phone', offset: +(this.rnd() * 190).toFixed(1) });
    }
    // The bathroom mirror changes its message between visits.
    const inBath = [...this.players.values()].some(p => p.alive && !p.escaped && roomAt(p.pos.x, p.pos.z, p.pos.y + 0.5)?.id === 'ubath');
    if (inBath && !this.bathOccupied) {
      this.bathVisits = (this.bathVisits || 0) + 1;
      if (this.bathVisits > 1 && this.time - (this.bathLeftT || 0) > 3) this.broadcast({ k: 'mirror', i: (this.bathVisits - 1) % MIRROR_TEXTS.length });
    }
    if (!inBath && this.bathOccupied) this.bathLeftT = this.time;
    this.bathOccupied = inBath;
    D.flash -= dt;
    if (D.flash <= 0) { D.flash = 25 + this.rnd() * 40; this.broadcast({ k: 'flash' }); }
    const tvMode = this.screens.tv.mode;
    if (D.tvChannel !== undefined) {
      D.tvChannel -= dt;
      if (D.tvChannel <= 0) {
        D.tvChannel = undefined;
        if (tvMode !== 'off') {
          const cam = this.rnd() < 0.55;
          this.broadcast({ k: 'tv', mode: cam ? 'cam' : 'image', content: Math.floor(this.rnd() * 8) });
          D.tvBack = 5 + this.rnd() * 5;
        }
      }
    }
    if (D.tvBack !== undefined) {
      D.tvBack -= dt;
      if (D.tvBack <= 0) {
        D.tvBack = undefined;
        if (this.screens.tv.mode !== 'off') {
          this.broadcast({ k: 'tv', mode: D.tvAuto ? 'off' : 'static', content: 0 });
          if (!D.tvAuto) D.tvChannel = 6 + this.rnd() * 8;
          D.tvAuto = false;
        }
      }
    }
    D.tv -= dt;
    if (D.tv <= 0) {
      D.tv = 70 + this.rnd() * 60;
      if (tvMode === 'off') {
        D.tvAuto = true;
        this.broadcast({ k: 'tv', mode: 'static', content: 0 });
        D.tvChannel = 1.5 + this.rnd() * 2;
      }
    }
    if (this.house.power) {
      D.blackout -= dt;
      if (D.blackout <= 0) {
        D.blackout = 70 + this.rnd() * 80;
        if (this.rnd() < 0.6) this.broadcast({ k: 'blackout', dur: 2.5 + this.rnd() * 3.5 });
      }
    }
  }

  // ============================================================= frame
  update(dt) {
    this.time += dt;
    const L = this.local;
    const H = this.house;
    const me = this.me;

    // The first-person controller owns the camera only while we're alive and in the house.
    const inBody = !this.localDead && !this.localEscaped && !(me && me.dying) && !this.kills.has(this.localId) && !(this.spiderDeath && !this.spiderDeath.done);
    if ((this.phase === 'play' || this.phase === 'ended') && inBody) {
      if (!this.app.paused || this.net.online) L.update(this.app.paused ? 0 : dt);
    } else if (!inBody) {
      L.light.intensity = 0;
      L.fill.intensity = 0;
      L.hands.visible = false;
    }

    // Local player record (for authority + replication)
    if (me) {
      if (!this.localDead && !this.localEscaped && !me.dying) {
        me.pos.copy(L.pos);
        me.yaw = L.yaw + Math.PI;
        me.pitch = L.pitch;
        me.speed = L.speed;
        me.crouch = L.crouch ? 1 : 0;
        me.run = L.run;
        me.flash = L.flash;
      }
      me.speaking = mic.speaking && !this.localDead && !this.localEscaped ? true : mic.speaking;
    }

    // Send our state
    this.sendT -= dt;
    if (this.sendT <= 0 && this.net.online && me && this.phase === 'play') {
      this.sendT = 1 / 15;
      this.net.vsend('p', [+L.pos.x.toFixed(3), +L.pos.y.toFixed(3), +L.pos.z.toFixed(3), +(L.yaw + Math.PI).toFixed(3), +L.pitch.toFixed(2), +L.speed.toFixed(2), L.crouch ? 1 : 0, L.run ? 1 : 0, L.flash ? 1 : 0, L.actCount]);
    }
    // Speaking flag
    const spk = mic.speaking;
    if (spk !== this.lastSpk) {
      this.lastSpk = spk;
      if (this.net.online) this.net.send('spk', spk ? 1 : 0);
    }
    // Voice is audible to Ajan
    this.voiceNoiseT -= dt;
    if (spk && this.voiceNoiseT <= 0 && this.phase === 'play' && !this.localDead && !this.localEscaped && !(me?.dying)) {
      this.voiceNoiseT = 0.45;
      const r = (4 + mic.level * 9) * Math.min(2, settings.micVolume ?? 1);
      this.emitNoise(L.hidden ? L.hidden.inside : L.pos, L.hidden ? r * 0.6 : r, 'voice');
    }

    // Authority
    if (this.isHost && this.phase === 'play') {
      this.brain.update(dt);
      this.hostDirector(dt);
      this.ajanSendT -= dt;
      if (this.ajanSendT <= 0) {
        this.ajanSendT = 0.1;
        this.ajanSnap = this.brain.snapshot();
        if (this.net.online) this.net.vsend('a', this.ajanSnap);
        if (this.net.online) this.net.vsend('s', this.spider.snapshot());
      }
      // Ajan uses the escape route? No: but escaping players on the threshold.
    }

    // Escape trigger: walk out through the open front door
    if (this.phase === 'play' && !this.localDead && !this.localEscaped && me && !me.dying) {
      const fd = H.doors.get('d_front');
      if (fd.open && !fd.locked && L.pos.z > 21.25 && L.pos.x > 3.6 && L.pos.x < 5.7 && !this.escapeAsked) {
        this.escapeAsked = true;
        this.request({ k: 'escape' });
        setTimeout(() => { this.escapeAsked = false; }, 1500);
      }
    }

    this.updateRemotePlayers(dt);
    this.updateAjanVisual(dt);
    this.updateKills(dt);
    this.fx.update(dt);
    this.updateDust(dt);
    this.props.update(dt, this.net.serverNow());
    this.spider.update(dt);
    const hasGun = !!this.revolverModel && this.playerHas(this.localId, 'revolver');
    if (hasGun !== !!this.gunShown) { this.local.setWeapon(hasGun ? this.revolverModel.clone() : null); this.gunShown = hasGun; if (hasGun) this.message('Revolver: one round. LEFT CLICK to shoot. Reloading takes 3 minutes.', 6); }
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 400);
    if (hasGun) {
      this.gunHudT = (this.gunHudT || 0) - dt;
      const ready = this.net.serverNow() >= (this.gunReadyAt || 0);
      if (this.gunHudT <= 0 || ready !== this.gunWasReady) {
        if (ready && this.gunWasReady === false) { audio.play('click', { vol: 0.5 }); this.message('Revolver reloaded.', 3); }
        this.gunWasReady = ready;
        this.gunHudT = 1;
        this.updateHUD();
      }
    }
    this.updateSpiderDeath(dt);
    this.updateFloorboards(dt);
    this.updateJellyTouch(dt);
    this.updateSleepAudio();
    H.update(dt, this.time, this.camera.position);

    // Lightning flash
    if (this.lightningK > 0) this.lightningK = Math.max(0, this.lightningK - dt * 2.2);
    const lk = this.lightningK > 0 ? this.lightningK * (0.6 + 0.4 * Math.sin(this.time * 60)) : 0;
    // Hiding: brighten the room in front of the hiding spot (local view only).
    const hk = this.hideK = damp(this.hideK, L.hidden && !this.localDead ? 1 : 0, 4, dt);
    if (L.hidden) {
      const h = L.hidden, r = roomAt(h.exit.x, h.exit.z, h.exit.y + 0.5);
      const fx = h.exit.x - h.inside.x, fz = h.exit.z - h.inside.z, fl = Math.hypot(fx, fz) || 1;
      let lx = h.exit.x + (fx / fl) * 2.2, lz = h.exit.z + (fz / fl) * 2.2;
      if (r) { lx = clamp(lx, r.x0 + 0.5, r.x1 - 0.5); lz = clamp(lz, r.z0 + 0.5, r.z1 - 0.5); }
      this.hideLight.position.set(lx, h.exit.y + 2.3, lz);
    }
    // From inside a closet you see the room, not the back of its doors (on your
    // screen only: everyone else still sees the closet shut).
    const seeThrough = L.hidden && L.hidden.doors.length && hk > 0.5 ? L.hidden : null;
    if (seeThrough !== this.seeThroughHide) {
      if (this.seeThroughHide) for (const d of this.seeThroughHide.doors) d.pivot.visible = true;
      if (seeThrough) for (const d of seeThrough.doors) d.pivot.visible = false;
      this.seeThroughHide = seeThrough;
    }
    // Dead or spectating: everything is easier to see too.
    const sk = this.specK = damp(this.specK || 0, (this.localDead || this.localEscaped) && this.phase === 'play' ? 1 : 0, 2, dt);
    if (!L.hidden && sk > 0.01) this.hideLight.position.copy(this.camera.position).add(V(0, 0.6, 0));
    const bk = Math.max(hk, sk);
    this.hideLight.intensity = Math.max(hk * 18, sk * 16);
    this.app.renderer.toneMappingExposure = 1.15 + Math.max(hk * 0.45, sk * 0.55);
    this.hemi.intensity = 1.0 + lk * 4 + bk * 1.6;
    H.M.glassWin.emissiveIntensity = 1 + lk * 25;
    this.ambient.intensity = 0.6 + (H.power ? 0.2 : 0) + Math.max(hk * 2.0, sk * 2.4);

    // Local avatar mirrors us (for cameras and the death cam)
    if (me && !me.dying) {
      const av = me.avatar;
      av.group.visible = !L.hidden && !this.localDead && !this.localEscaped;
      av.group.position.copy(L.pos);
      av.group.rotation.y = L.yaw + Math.PI;
      av.state = { speed: L.speed, crouch: L.crouchK, run: L.run, flash: L.flash, interactT: L.actT, turn: L.turnRate, pitch: L.pitch, mode: 'normal' };
      av.update(dt);
    }

    // Camera / spectator
    if (this.isSpectating()) this.updateSpectateCam(dt);

    // Interaction focus
    this.pickT -= dt;
    if (this.pickT <= 0 && this.phase === 'play') { this.pickT = 0.08; this.updateFocus(); }

    // Messages
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) $('message').classList.remove('show'); }

    // Audio listener
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const cp = new THREE.Vector3();
    this.camera.getWorldPosition(cp);
    audio.setListener(cp, fwd);
    this.updateVoice(cp);
    this.updateLabels(cp);
    this.ambience(dt, cp);
    this.updateHudLive(dt);

    // Screens (TV & security cams)
    this.screens.update(dt, this.time, this.renderer, this.scene, cp, this.vhsClock(true));
    this.post.update(dt, this.time);
  }

  updateRemotePlayers(dt) {
    for (const p of this.players.values()) {
      if (p.isLocal) continue;
      p.actT += dt;
      const av = p.avatar;
      if (p.dying) continue; // posed by the kill sequence
      const visible = p.alive && !p.escaped && !p.hidden && p.seen;
      av.group.visible = visible;
      if (!visible) continue;
      p.pos.lerp(p.target, 1 - Math.exp(-dt * 12));
      if (p.pos.distanceTo(p.target) > 4) p.pos.copy(p.target);
      p.yaw = angleLerp(p.yaw, p.tyaw, 1 - Math.exp(-dt * 12));
      av.group.position.copy(p.pos);
      av.group.rotation.y = p.yaw;
      av.state = { speed: p.speed, crouch: p.crouch, run: p.run, flash: p.flash, interactT: p.actT, pitch: p.pitch, turn: 0, mode: 'normal' };
      av.update(dt);
    }
    // Assign the pooled flashlights to the nearest remote players with a torch on.
    const cp = this.camera.position;
    const lit = [...this.players.values()]
      .filter(p => !p.isLocal && p.flash && p.alive && !p.escaped && !p.hidden && !p.dying && p.seen)
      .sort((a, b) => a.pos.distanceTo(cp) - b.pos.distanceTo(cp));
    this.remoteLights.forEach((l, i) => {
      const p = lit[i];
      if (!p) { l.intensity = 0; return; }
      const head = p.pos.clone().add(V(0, 1.5 - p.crouch * 0.55, 0));
      l.intensity = 22;
      l.position.copy(head).add(V(Math.sin(p.yaw) * 0.3, -0.1, Math.cos(p.yaw) * 0.3));
      l.target.position.copy(head).add(V(Math.sin(p.yaw) * 5 * Math.cos(p.pitch), Math.sin(p.pitch) * 5 - 0.5, Math.cos(p.yaw) * 5 * Math.cos(p.pitch)));
    });
  }

  updateAjanVisual(dt) {
    const v = this.ajanVis;
    let s = this.isHost ? this.brain?.snapshot() : this.ajanSnap;
    if (s) {
      const tp = V(s.x, s.y, s.z);
      if (v.pos.distanceTo(tp) > 5 || v.pos.y < -20) v.pos.copy(tp);
      else v.pos.lerp(tp, 1 - Math.exp(-dt * (this.isHost ? 30 : 10)));
      v.ry = angleLerp(v.ry, s.ry, 1 - Math.exp(-dt * 10));
      v.st = s.st; v.m = s.m; v.mt = s.mt; v.sp = s.sp; v.hy = s.hy;
    }
    if (this.kills.size) return; // kill sequences pose Ajan themselves
    const aj = this.ajan;
    aj.group.visible = v.st !== 'dormant';
    aj.group.position.copy(v.pos);
    aj.group.rotation.y = v.ry;
    const ajMode = ['search', 'sleep', 'sit', 'inspect', 'stun'].includes(v.m) ? v.m : 'move';
    aj.state = { speed: v.sp, mode: ajMode, modeT: v.mt, headYaw: v.m === 'search' ? undefined : v.hy };
    aj.update(dt);
    // Heavy footsteps
    if (v.st !== 'dormant' && v.sp > 0.2) {
      this.ajanStepDist += v.sp * dt;
      const stride = v.sp > 3 ? 1.5 : 1.15;
      if (this.ajanStepDist > stride) {
        this.ajanStepDist = 0;
        audio.play('stepHeavy', { pos: v.pos.clone().add(V(0, 0.2, 0)), vol: v.sp > 3 ? 1 : 0.7, ref: 2.2, rolloff: 1.1, rate: 0.85 + Math.random() * 0.15, muffle: this.muffleFor(v.pos) });
      }
    }
  }

  muffleFor(pos) {
    const cp = this.camera.position;
    const walls = segmentBlockers(cp.x, cp.z, pos.x, pos.z, Math.max(cp.y, pos.y + 1), this.house.colliders, { max: 3 });
    const floors = levelOf(cp.y) !== levelOf(pos.y) && !inStairs(cp) && !inStairs(pos) ? 1 : 0;
    return Math.min(0.85, walls * 0.3 + floors * 0.5);
  }

  updateVoice(listener) {
    const meAlive = !this.localDead && !this.localEscaped;
    this.voice.update(id => {
      const p = this.players.get(id);
      if (!p) return null;
      const pAlive = p.alive && !p.escaped;
      if (pAlive) {
        const pos = p.pos.clone().add(V(0, 1.55, 0));
        const m = this.muffleFor(p.pos);
        return { pos, gain: (p.dying ? 1 : 1) * (1 - m * 0.45), muffle: m, spatial: true };
      }
      if (!meAlive) return { pos: listener, gain: 0.85, muffle: 0, spatial: false };
      return null; // the dead can't talk to the living
    });
  }

  updateLabels(cp) {
    const w = innerWidth, h = innerHeight;
    const v = new THREE.Vector3();
    for (const p of this.players.values()) {
      if (!p.label) continue;
      const vis = p.alive && !p.escaped && !p.hidden && !p.dying && p.seen && this.phase === 'play';
      if (!vis) { p.label.style.opacity = 0; continue; }
      p.avatar.headTop(v);
      v.y += 0.18;
      const dist = v.distanceTo(cp);
      const blocked = !lineOfSight(V(cp.x, cp.y - 1.5, cp.z), p.pos, this.house.colliders);
      v.project(this.camera);
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      let op = 0;
      if (onScreen && !blocked && dist < 16) {
        if (p.speaking) op = clamp(1.2 - dist / 16, 0.35, 1);
        else op = dist < 5 ? 0.55 : dist < 8 ? 0.55 * (8 - dist) / 3 : 0;
      }
      p.label.style.opacity = op.toFixed(2);
      p.label.classList.toggle('speaking', !!p.speaking);
      if (op > 0) {
        const sc = clamp(1.3 - dist / 14, 0.65, 1.1);
        p.label.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
      }
    }
  }

  /** Creaky boards: trigger once when the local player steps onto one (edge-triggered + cooldown). */
  updateFloorboards(dt) {
    const L = this.local;
    if (this.phase !== 'play' || this.localDead || this.localEscaped || L.hidden || L.frozen || this.me?.dying) { this.onBoard = -1; return; }
    let on = -1;
    for (const b of this.house.floorboards) {
      if (Math.abs(L.pos.y - b.y) < 0.4 && Math.abs(L.pos.x - b.x) < 0.5 && Math.abs(L.pos.z - b.z) < 0.5) { on = b.i; break; }
    }
    if (on >= 0 && on !== this.onBoard) {
      const b = this.house.floorboards[on];
      const now = this.time;
      if ((b.lastLocal || -9) < now - 2.5) {
        b.lastLocal = now;
        audio.play('boardCreak', { pos: V(b.x, b.y + 0.1, b.z), vol: L.crouch ? 0.7 : 1.0, ref: 2.5, rate: 0.9 + (on % 3) * 0.06 });
        this.request({ k: 'board', i: on });
      }
    }
    this.onBoard = on;
  }

  /** Bumping into the wobbly thing makes it bounce (no noise for Ajan). */
  updateJellyTouch(dt) {
    const j = this.props.jelly;
    if (!j || this.phase !== 'play' || this.localDead || this.localEscaped) return;
    const L = this.local;
    j.cool -= dt;
    const dx = j.pos.x - L.pos.x, dz = j.pos.z - L.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.0 && Math.abs(L.pos.y - (j.pos.y - 1.3)) < 0.5 && L.speed > 0.6 && j.cool <= 0) {
      const vx = L.vel.x, vz = L.vel.z, vl = Math.hypot(vx, vz) || 1;
      if ((vx * dx + vz * dz) / (vl * (d || 1)) > 0.3) {
        j.cool = 0.6;
        this.request({ k: 'jelly', ix: (vx / vl) * Math.min(1.5, L.speed / 3), iz: (vz / vl) * Math.min(1.5, L.speed / 3) });
      }
    }
  }

  /** sleep.mp3 loops at his bed while he naps (from the replicated state). */
  updateSleepAudio() {
    const sleeping = this.ajanVis.st === 'sleep';
    if (sleeping && !this.sleepSound) {
      const pos = this.ajanVis.pos.clone().add(V(0, 1.2, 0));
      this.sleepSound = audio.play('sleep', { pos, loop: true, vol: 1.7, ref: 3.5, rolloff: 1.0, limit: true });
    } else if (!sleeping && this.sleepSound) {
      this.sleepSound.stop(0.6);
      this.sleepSound = null;
    }
  }

  /** Per-area ambience loops crossfaded by the floor you're on. */
  updateAreaAmbience(cp) {
    if (!this.amb) return;
    const room = roomAt(cp.x, cp.z, cp.y);
    const L = levelIndex(cp.y);
    const want = room?.id === 'attic' || room?.id === 'stairA' ? 'ambAttic' : L === 0 ? 'ambBase' : L === 2 ? 'ambUp' : 'ambHouse';
    for (const [k, h] of Object.entries(this.amb)) h?.setVol(k === want ? (k === 'ambAttic' ? 0.5 : 0.22) : 0);
  }

  ambience(dt, cp) {
    if (this.phase !== 'play') return;
    // Things in the house that make their own little noises (rocking chairs).
    for (const s of this.house.periodic || []) {
      s.t = (s.t ?? Math.random() * s.every) - dt;
      if (s.t <= 0) { s.t += s.every; if (s.pos.distanceTo(cp) < s.range) audio.play(s.key, { pos: s.pos, vol: s.vol, rate: s.rate * (0.95 + Math.random() * 0.1), ref: 1.2, muffle: this.muffleFor(s.pos) }); }
    }
    this.updateAreaAmbience(cp);
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = 6 + Math.random() * 12;
      const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 8;
      const pos = V(cp.x + Math.cos(a) * r, cp.y + (Math.random() - 0.3) * 2, cp.z + Math.sin(a) * r);
      const pick = Math.random();
      const muffle = 0.3 + Math.random() * 0.5;
      if (pick < 0.4) audio.play('creak', { pos, vol: 0.25, rate: 0.5 + Math.random() * 0.6, muffle });
      else if (pick < 0.6) audio.play('knock', { pos, vol: 0.3, muffle: 0.6 });
      else if (pick < 0.85) audio.play('step', { pos, vol: 0.3, rate: 0.7, muffle: 0.7 });
      else audio.play('slam', { pos, vol: 0.2, muffle: 0.8 });
    }
    // Heartbeat when Ajan is chasing nearby
    const v = this.ajanVis;
    if (this.chase && !this.localDead && !this.localEscaped && v.pos.distanceTo(this.local.pos) < 12) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 0.6; audio.play('heartbeat', { vol: 0.45 }); }
    }
  }

  vhsClock(short) {
    const t = Math.floor(this.time);
    const hh = 3 + Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60;
    const p = n => String(n).padStart(2, '0');
    return short ? `OCT 13 1996  ${p(hh)}:${p(mm)}:${p(ss)}` : `${p(hh)}:${p(mm)}:${p(ss)}`;
  }

  updateHudLive(dt) {
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    $('osdTime').textContent = this.vhsClock(false);
    const L = this.local;
    const st = $('stamina');
    st.style.setProperty('--v', (L.stamina / PLAYER.stamina).toFixed(3));
    st.classList.toggle('show', L.stamina < PLAYER.stamina - 0.05);
    st.classList.toggle('tired', L.exhausted);
    $('micState').classList.toggle('talking', mic.speaking);
    const room = roomAt(this.camera.position.x, this.camera.position.z, this.camera.position.y);
    $('osdRoom').textContent = room ? room.name : '';
    $('crouchState').classList.toggle('show', L.crouch);
  }

  render() {
    this.post.render();
  }

  dispose() {
    this.disposed = true;
    this.app.renderer.toneMappingExposure = 1.15;
    this.offs.forEach(o => o());
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('mousemove', this.onMouseMove);
    removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.local?.dispose();
    this.voice?.stop();
    this.tvSound?.stop();
    this.wind?.stop();
    this.clockTick?.stop();
    this.sleepSound?.stop();
    if (this.amb) Object.values(this.amb).forEach(h => h?.stop());
    this.props?.dispose();
    for (const p of this.players.values()) p.label?.remove();
    $('labels').innerHTML = '';
    $('hud').classList.remove('show', 'dying');
    $('hideOverlay').classList.remove('show');
    $('spectateHud').classList.remove('show');
    $('deathOverlay').classList.remove('show');
    $('noteView').classList.remove('show');
    this.scene?.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
    this.screens?.cams.forEach(c => c.rt.dispose());
    this.post?.composer.dispose?.();
    this.renderer?.renderLists.dispose();
  }
}
