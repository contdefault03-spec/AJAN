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
import { CHARACTERS, charById, ITEM_INFO, AJAN, PLAYER } from './config.js';
import { mulberry32, clamp, damp, angleLerp, escapeHtml } from './util.js';
import { lineOfSight, segmentBlockers, levelOf, inStairs } from './physics.js';
import { roomAt } from './house.js';

const $ = id => document.getElementById(id);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const EAT_START = 1.6;

export class Game {
  constructor(app, { net, seed, players, startAt }) {
    this.app = app;
    this.net = net;
    this.seed = seed;
    this.rnd = mulberry32(seed);
    this.roster = players;
    this.localId = net.id;
    this.single = !net.online;
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

    progress(0.1, 'Building the house...');
    this.house = new House();
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

    if (this.isHost) this.brain = new AjanBrain(this, mulberry32(this.seed ^ 0x9e3779b9));

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
      if (e.code === 'KeyE' && !e.repeat) this.interact();
      if (e.code === 'KeyM' && !e.repeat) { mic.setMuted(!settings.micMuted); this.updateHUD(); }
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
      if (this.isSpectating()) this.cycleSpectate(e.button === 2 ? -1 : 1);
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
    try { const p = this.canvas.requestPointerLock(); p?.catch?.(() => {}); } catch { /* not allowed yet */ }
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
          const seen = !!b && (b.state === 'chase' && b.target === pid && b.lastSeenT < 0.6 && b.pos.distanceTo(p.pos) < 8);
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
      case 'noise':
        if (this.brain) this.brain.hear({ pos: V(r.x, r.y, r.z), radius: Math.min(r.r, 25), kind: r.kind, pid });
        return;
      case 'escape': {
        const d = H.doors.get('d_front');
        if (!d || d.locked || !d.open) return;
        const group = [...this.players.values()].filter(q => q.alive && !q.escaped && !q.dying && Math.hypot(q.pos.x - 4.65, q.pos.z - 21.2) < 3.2).map(q => q.id);
        if (!group.includes(pid)) group.push(pid);
        this.broadcast({ k: 'escape', pids: group, at: this.net.serverNow() + 600 });
        return;
      }
    }
  }

  hostSetDoor(id, open, by) {
    const d = this.house.doors.get(id);
    if (!d || d.locked) return;
    this.broadcast({ k: 'door', id, open, by });
    this.hostNoise(d.center, by === 'ajan' ? 14 : 8, 'door');
  }

  hostNoise(pos, radius, kind, pid = null) {
    if (this.brain && pid !== 'ajan') this.brain.hear({ pos: pos.clone ? pos.clone() : V(pos.x, pos.y, pos.z), radius, kind, pid });
  }

  hostStartKill(pid) {
    const p = this.players.get(pid);
    if (!p || !p.alive || p.dying || this.kills.has(pid)) return;
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

  hostDragOut(pid) {
    const p = this.players.get(pid);
    if (!p || !p.hidden) return;
    const h = this.house.hides.get(p.hideId);
    if (h) h.occupant = null;
    this.broadcast({ k: 'hide', pid, id: p.hideId, on: false, forced: true });
    this.hostStartKill(pid);
  }

  dropItems(pid, pos) {
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
        const what = e.what === 'power' ? 'power' : (ITEM_INFO[e.what]?.name || e.what);
        this.message(e.what === 'power' ? 'You need power for that' : `You need a ${what} for that`);
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
        if (d.exit && H.exitChain) H.exitChain.visible = false;
        const it = this.items.get(e.item);
        if (it && e.item !== 'basement_key') it.used = true;
        if (e.by === this.localId) this.message(`Unlocked: ${d.name}`);
        this.updateHUD();
        break;
      }
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
      case 'dead': {
        const p = this.players.get(e.pid);
        if (p) { p.alive = false; p.dying = false; p.avatar.group.visible = false; }
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
        else audio.play('growl', { pos, vol: 0.8, ref: 2.5, rate: 0.9 + Math.random() * 0.2 });
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
      setTimeout(() => { if (h.occupant === e.pid) h.target = 0.1; }, 650);
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
    if (seq.isAjanChar) audio.play('ajandie', seq.local ? { vol: 1 } : { pos: seq.start.clone().add(V(0, 1.5, 0)), vol: 1, ref: 3 });
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
          if (s.sound) audio.play(s.sound, s.local ? { vol: 1 } : { pos: av.group.position.clone().add(V(0, 1.4, 0)), vol: 1, ref: 3 });
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
    this.message('Find a way out. Stay quiet.', 6);
    this.wind = audio.play('wind', { loop: true, vol: 0.12 });
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
        if (d.locked) {
          if (d.lock === 'power') { this.message('You need power for that'); audio.play('rattle', { pos: d.center, vol: 0.5 }); this.request({ k: 'noise', x: d.center.x, y: 0, z: d.center.z, r: 4, kind: 'rattle' }); return; }
          if (!this.playerHas(me, d.lock)) {
            this.message(`You need a ${ITEM_INFO[d.lock].name} for that`);
            audio.play('rattle', { pos: d.center, vol: 0.5 });
            this.request({ k: 'noise', x: d.center.x, y: 0, z: d.center.z, r: 4, kind: 'rattle' });
            return;
          }
        }
        L.act();
        this.request({ k: 'door', id: d.id });
        break;
      }
      case 'container': L.act(); this.request({ k: 'container', id: it.id }); break;
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
        if (d.locked) {
          if (d.lock !== 'power' && this.playerHas(me, d.lock)) return `E — UNLOCK (${ITEM_INFO[d.lock].name})`;
          return `E — OPEN  <span class="dim">[LOCKED]</span>`;
        }
        if (d.exit && d.open) return 'GET OUT!';
        return d.open ? 'E — CLOSE' : 'E — OPEN';
      }
      case 'container': return it.container.target > 0.5 ? `E — CLOSE ${it.name.toUpperCase()}` : `E — OPEN ${it.name.toUpperCase()}`;
      case 'item': return `E — PICK UP ${ITEM_INFO[it.item.type].name.toUpperCase()}`;
      case 'hide': return it.spot.occupant ? '<span class="dim">OCCUPIED</span>' : 'E — HIDE';
      case 'fusebox': return this.house.power ? '<span class="dim">POWER RESTORED</span>' : this.playerHas(me, 'fuse') ? 'E — USE FUSE' : 'E — USE';
      case 'tv': return this.screens.tv.mode === 'off' ? 'E — TURN ON' : 'E — TURN OFF';
      case 'monitor': return 'E — SWITCH CAMERA';
      case 'note': return 'E — READ';
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
    this.setPrompt(found ? this.promptFor(found.it) : '');
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
    const base = H.doors.get('d_basement');
    if (base.locked) {
      if (this.playerHas(me, 'basement_key')) return 'Unlock the basement door in the kitchen.';
      const n = holderName('basement_key');
      return n ? `${n} has the basement key. Get to the kitchen.` : 'Find the basement key.';
    }
    if (!H.power) {
      if (this.playerHas(me, 'fuse')) return 'Put the fuse in the fuse box in the basement.';
      const n = holderName('fuse');
      return n ? `${n} has the fuse. Restore the power in the basement.` : 'Find a fuse to restore the power.';
    }
    const front = H.doors.get('d_front');
    if (front.locked) {
      if (this.playerHas(me, 'exit_key')) return 'Unlock the front door in the living room.';
      const n = holderName('exit_key');
      return n ? `${n} has the front door key.` : 'Find the front door key in the security room.';
    }
    return 'The front door is open. ESCAPE!';
  }

  updateHUD() {
    if (!this.house) return;
    $('objective').textContent = this.localDead ? 'You were eaten.' : this.localEscaped ? 'You escaped.' : this.objective();
    const inv = [...this.items.values()].filter(i => i.holder === this.localId && !i.used);
    $('inventory').innerHTML = inv.length
      ? inv.map(i => `<div class="slot"><span class="ico ${i.type}"></span>${escapeHtml(ITEM_INFO[i.type].name)}</div>`).join('')
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

    if (this.phase === 'play' || this.phase === 'ended') {
      if (!this.app.paused || this.net.online) L.update(this.app.paused ? 0 : dt);
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
      const r = 5 + mic.level * 12;
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
    H.update(dt, this.time, this.camera.position);

    // Lightning flash
    if (this.lightningK > 0) this.lightningK = Math.max(0, this.lightningK - dt * 2.2);
    const lk = this.lightningK > 0 ? this.lightningK * (0.6 + 0.4 * Math.sin(this.time * 60)) : 0;
    this.hemi.intensity = 1.0 + lk * 4;
    H.M.glassWin.emissiveIntensity = 1 + lk * 25;
    this.ambient.intensity = 0.6 + (H.power ? 0.2 : 0);

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
    aj.state = { speed: v.sp, mode: v.m === 'search' ? 'search' : 'move', modeT: v.mt, headYaw: v.m === 'search' ? undefined : v.hy };
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

  ambience(dt, cp) {
    if (this.phase !== 'play') return;
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
