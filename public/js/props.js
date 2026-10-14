// Interactive set pieces added in the house expansion: elevator, radios,
// boombox, phone, attic cinema TV, the wobbly object, the bathroom mirror
// message and blood decals. All state changes arrive as host events (game.js);
// this module owns the visuals, audio and per-frame animation.
import * as THREE from 'three';
import { audio } from './audio.js';
import { assetUrl, loadGLTF } from './assets.js';
import { screenMaterial } from './screens.js';
import { elevatorState } from './physics.js';
import { ELEVATOR, ELEV_DOORS, LEVELS } from './layout.js';
import { bx } from './house.js';
import { mulberry32, clamp } from './util.js';
import { CHARACTERS, DEATH_GAIN } from './config.js';

export const DEATH_KEYS = ['max', 'masked', 'rize', 'lucky', 'mido', 'ajandie'];
export const MIRROR_TEXTS = ['I HAVE NO\nLOVE LIFE BRO', 'WHO WANTS\nMY CUCK', 'IM AN\nUNLOVEABLE\nFRACK BRO'];
const LEVEL_LABEL = ['B', '1', '2', 'A'];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function splatTexture(seed, kind = 'splat') {
  const rnd = mulberry32(seed);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const red = a => `rgba(${70 + rnd() * 40 | 0},${4 + rnd() * 8 | 0},${4 + rnd() * 6 | 0},${a})`;
  if (kind === 'scratch') {
    x.strokeStyle = 'rgba(15,8,6,0.85)';
    for (let k = 0; k < 4; k++) {
      x.lineWidth = 3 + rnd() * 2;
      x.beginPath();
      const x0 = 50 + k * 40 + rnd() * 10;
      x.moveTo(x0, 30);
      x.bezierCurveTo(x0 + 10, 90, x0 - 6, 160, x0 + 14, 230);
      x.stroke();
    }
  } else {
    const blobs = kind === 'pool' ? 6 : 14;
    for (let i = 0; i < blobs; i++) {
      const r = (kind === 'pool' ? 50 : 12) + rnd() * (kind === 'pool' ? 40 : 30);
      const px = S / 2 + (rnd() - 0.5) * (kind === 'pool' ? 80 : 160), py = S / 2 + (rnd() - 0.5) * (kind === 'pool' ? 80 : 160);
      x.fillStyle = red(0.75 + rnd() * 0.2);
      x.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        const rr = r * (0.7 + rnd() * 0.5);
        x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
      }
      x.fill();
    }
    for (let i = 0; i < 40; i++) {
      x.fillStyle = red(0.8);
      x.beginPath();
      x.arc(S / 2 + (rnd() - 0.5) * 220, S / 2 + (rnd() - 0.5) * 220, 1 + rnd() * 5, 0, Math.PI * 2);
      x.fill();
    }
    if (kind === 'wall') {
      for (let i = 0; i < 8; i++) {
        const dx = 40 + rnd() * 180;
        x.fillStyle = red(0.7);
        x.fillRect(dx, S / 2, 3 + rnd() * 4, 40 + rnd() * 100);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Props {
  constructor(game) {
    this.game = game;
    this.house = game.house;
    this.group = new THREE.Group();
    this.house.group.add(this.group);
    this.buildElevator();
    this.buildRadios();
    this.buildBoombox();
    this.buildPhone();
    this.buildCinema();
    this.buildMirror();
    this.buildBlood();
    this.buildAjanRoom();
    this.group.updateMatrixWorld(true); // interaction raycasts can run before the first frame
  }

  async init() {
    await this.buildJelly();
  }

  // ================================================================ elevator
  buildElevator() {
    const H = this.house, M = H.M;
    const E = ELEVATOR;
    const w = E.x1 - E.x0 - 0.04, d = E.z1 - E.z0 - 0.04;
    const cx = (E.x0 + E.x1) / 2, cz = (E.z0 + E.z1) / 2;
    const car = new THREE.Group();
    const floor = bx(w, 0.06, d, M.metal); floor.position.y = -0.03;
    const ceil = bx(w, 0.05, d, M.metal); ceil.position.y = 2.45;
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    lamp.rotation.x = Math.PI / 2; lamp.position.y = 2.42;
    const rail = bx(0.04, 0.05, d - 0.2, M.brass); rail.position.set(w / 2 - 0.05, 0.95, 0);
    car.add(floor, ceil, lamp, rail);
    // Button panel on the west wall inside the car: four big labelled buttons.
    // (the shaft wall's inner face is ~0.1 m inside the car footprint)
    const panel = bx(0.04, 1.0, 0.5, M.brass);
    panel.position.set(-w / 2 + 0.13, 1.3, 0);
    car.add(panel);
    const NAMES = [['B', 'BASEMENT'], ['1', 'GROUND'], ['2', 'UPSTAIRS'], ['A', 'ATTIC']];
    this.carButtons = [];
    for (let L = 0; L < 4; L++) {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 96;
      const g = cv.getContext('2d');
      g.fillStyle = '#1b1712'; g.fillRect(0, 0, 256, 96);
      g.strokeStyle = '#b08d4a'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
      g.fillStyle = '#f2e6c8';
      g.font = 'bold 64px monospace'; g.textBaseline = 'middle';
      g.fillText(NAMES[L][0], 18, 50);
      g.font = 'bold 30px monospace';
      g.fillText(NAMES[L][1], 80, 52);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0x333333, roughness: 0.6 });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.15), mat);
      b.rotation.y = Math.PI / 2; // faces into the car (+x)
      b.position.set(-w / 2 + 0.156, 0.98 + L * 0.21, 0);
      car.add(b);
      this.carButtons.push(b);
      H.register('elevbtn' + L, 'elevbtn', [b], V(cx, 0, cz), { level: L });
    }
    car.position.set(cx, 0, cz);
    this.group.add(car);
    this.car = car;
    // Landing doors + call buttons
    this.landings = ELEV_DOORS.map(e => {
      const y = e.y0;
      const halves = [0, 1].map(i => {
        const p = bx(e.w / 2, 2.28, 0.04, M.metal);
        p.position.set(e.a0 + e.w / 4 + i * e.w / 2, y + 1.14, e.c + e.out * 0.12);
        this.group.add(p);
        return p;
      });
      const col = H.collider(e.a0, e.c - 0.08, e.a0 + e.w, e.c + 0.08, y, y + 2.3, { occlude: true });
      const call = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.04), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x220000 }));
      call.position.set(e.a0 - 0.32, y + 1.2, e.c + e.out * 0.14);
      this.group.add(call);
      H.register('elevcall' + e.L, 'elevcall', [call], call.position.clone(), { level: e.L });
      // floor indicator above the door
      return { ...e, halves, col, call, open: 0 };
    });
    this.elev = { unlocked: false, fromY: 0, toY: 0, startAt: 0, arriveAt: 0, level: 1 };
    this.elevHum = null;
    elevatorState.y = 0;
  }

  /** Host event: car travels from its current position to a level. */
  elevatorMove(e) {
    const st = this.elev;
    st.fromY = e.fromY;
    st.toY = LEVELS[e.to].y;
    st.level = e.to;
    st.startAt = e.at;
    st.arriveAt = e.at + Math.abs(st.toY - st.fromY) / ELEVATOR.speed * 1000;
    st.dinged = false;
    st.target = e.to;
  }

  elevatorY(now) {
    const st = this.elev;
    if (now <= st.startAt) return st.fromY;
    if (now >= st.arriveAt) return st.toY;
    const k = (now - st.startAt) / (st.arriveAt - st.startAt);
    const s = k * k * (3 - 2 * k);
    return st.fromY + (st.toY - st.fromY) * s;
  }

  elevatorMoving(now) { const st = this.elev; return now < st.arriveAt + 400 && st.arriveAt > 0 && now > st.startAt - 1300; }

  updateElevator(dt, now) {
    const st = this.elev;
    const y = this.elevatorY(now);
    elevatorState.y = y;
    this.car.position.y = y;
    const moving = now >= st.startAt && now < st.arriveAt;
    for (const ld of this.landings) {
      const atStop = Math.abs(y - ld.y0) < 0.02 && now > st.arriveAt + 300;
      const target = atStop ? 1 : 0;
      ld.open += (target - ld.open) * Math.min(1, dt * 4);
      ld.halves[0].position.x = ld.a0 + ld.w / 4 - ld.open * (ld.w / 2 - 0.05);
      ld.halves[1].position.x = ld.a0 + ld.w * 0.75 + ld.open * (ld.w / 2 - 0.05);
      ld.col.off = ld.open > 0.85;
      ld.call.material.emissive.setHex(st.unlocked ? (atStop ? 0x003300 : 0x332200) : 0x220000);
    }
    this.carButtons.forEach((b, L) => b.material.emissive.setHex(L === st.level ? (moving ? 0xffaa44 : 0x66ff88) : st.unlocked ? 0x777777 : 0x333333));
    const pos = V((ELEVATOR.x0 + ELEVATOR.x1) / 2, y + 1.2, (ELEVATOR.z0 + ELEVATOR.z1) / 2);
    if (moving && !this.elevHum) this.elevHum = audio.play('elevHum', { pos, loop: true, vol: 0.55, ref: 2.5 });
    if (this.elevHum) this.elevHum.setPos(pos);
    if (!moving && this.elevHum) { this.elevHum.stop(0.4); this.elevHum = null; }
    if (!moving && st.arriveAt && now >= st.arriveAt && !st.dinged) {
      st.dinged = true;
      audio.play('ding', { pos, vol: 0.7, ref: 3 });
      audio.play('clunk', { pos, vol: 0.5 });
    }
  }

  // ================================================================== radios
  buildRadios() {
    this.radios = new Map();
    for (const [id, anchor] of [['radio1', this.house.anchors.radio1], ['radio2', this.house.anchors.radio2]]) {
      if (!anchor) continue;
      const M = this.house.M;
      const g = new THREE.Group();
      g.position.copy(anchor);
      const body = bx(0.46, 0.26, 0.2, M.woodDark); body.position.y = 0.13;
      const grille = bx(0.2, 0.18, 0.01, M.metal); grille.position.set(-0.1, 0.13, 0.1);
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshBasicMaterial({ color: 0x331a00 }));
      dial.position.set(0.12, 0.14, 0.101);
      const ant = bx(0.01, 0.35, 0.01, M.metal); ant.position.set(0.18, 0.4, -0.05); ant.rotation.z = -0.4;
      g.add(body, grille, dial, ant);
      this.group.add(g);
      const r = { id, group: g, dial, on: false, sound: null, pos: anchor.clone().add(V(0, 0.15, 0)) };
      this.radios.set(id, r);
      this.house.register(id, 'radio', [body, grille], r.pos, { radio: r });
    }
  }

  setRadio(id, on) {
    const r = this.radios.get(id);
    if (!r || r.on === on) return;
    r.on = on;
    r.dial.material.color.setHex(on ? 0xffa030 : 0x331a00);
    audio.play('clunk', { pos: r.pos, vol: 0.4, rate: 1.6 });
    if (r.sound) { r.sound.stop(0.2); r.static?.stop(0.2); r.sound = r.static = null; }
    if (on) {
      const key = audio.buffers.music2 ? 'music2' : 'music1';
      r.sound = audio.play(key, { pos: r.pos, loop: true, vol: 0.9, ref: 2.5, rolloff: 0.9, muffle: 0.55, offset: Math.random() * 10 });
      r.static = audio.play('static', { pos: r.pos, loop: true, vol: 0.12, ref: 2 });
    }
  }

  // ================================================================ boombox
  buildBoombox() {
    const a = this.house.anchors.boombox;
    if (!a) return;
    const M = this.house.M;
    const g = new THREE.Group();
    g.position.copy(a);
    const body = bx(1.3, 0.75, 0.45, new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.5, metalness: 0.3 }));
    body.position.y = 0.375;
    const handle = bx(1.0, 0.06, 0.08, M.metal); handle.position.set(0, 0.86, 0);
    g.add(body, handle);
    this.speakers = [-0.38, 0.38].map(x => {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(x, 0.36, 0.23);
      g.add(cone);
      return cone;
    });
    const deck = bx(0.3, 0.16, 0.02, M.metal); deck.position.set(0, 0.55, 0.23);
    g.add(deck);
    this.group.add(g);
    this.house.collider(a.x - 0.68, a.z - 0.25, a.x + 0.68, a.z + 0.25, a.y, a.y + 0.9);
    this.boombox = { group: g, pos: a.clone().add(V(0, 0.5, 0.2)), until: 0 };
    this.house.register('boombox', 'boombox', [body, deck, ...this.speakers], this.boombox.pos);
  }

  playBoombox(key) {
    const bb = this.boombox;
    if (!bb) return;
    const dur = audio.duration(key) || 2;
    bb.until = performance.now() + dur * 1000;
    const ch = CHARACTERS.find(c => c.sound === key);
    const g = (ch && DEATH_GAIN[ch.id]) || 1;
    audio.play(key, { pos: bb.pos, vol: 1.2 * g, ref: 3.5, rolloff: 0.9, limit: g > 1 });
  }

  // ================================================================== phone
  buildPhone() {
    const a = this.house.anchors.phone;
    if (!a) return;
    const M = this.house.M;
    const g = new THREE.Group();
    g.position.copy(a);
    const base = bx(0.22, 0.09, 0.2, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.4 })); base.position.y = 0.045;
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16), M.metal); dial.position.set(0, 0.095, 0.03);
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.4 }));
    hand.rotation.z = Math.PI / 2; hand.position.set(0, 0.12, -0.05);
    g.add(base, dial, hand);
    this.group.add(g);
    this.phone = { group: g, hand, pos: a.clone().add(V(0, 0.1, 0)), playing: false };
  }

  /** Plays ~10 s of cinema.mp4's soundtrack through the phone (Ajan can't hear it). */
  phoneRecording(offset) {
    const ph = this.phone;
    if (!ph || ph.playing) return;
    const url = assetUrl('cinemaVideo');
    ph.playing = true;
    audio.play('ring', { pos: ph.pos, vol: 0.5, ref: 1.5 });
    setTimeout(() => {
      if (this.disposed) { ph.playing = false; return; }
      if (!url) { ph.playing = false; return; }
      if (!ph.el) {
        ph.el = new Audio();
        ph.el.src = url;
        ph.el.preload = 'auto';
        const ctx = audio.ctx;
        const src = ctx.createMediaElementSource(ph.el);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
        const gain = ctx.createGain(); gain.gain.value = 1.4;
        const pan = audio.makePanner(ph.pos, 1.5, 20, 1.3);
        src.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(pan); pan.connect(audio.sfxBus);
      }
      const el = ph.el;
      const start = () => {
        try { el.currentTime = offset; } catch { /* not seekable yet */ }
        el.play().catch(() => { ph.playing = false; });
        clearTimeout(ph.stopT);
        ph.stopT = setTimeout(() => { el.pause(); ph.playing = false; }, 10000);
      };
      if (el.readyState >= 1) start(); else el.addEventListener('loadedmetadata', start, { once: true });
    }, 2400);
  }

  // ================================================================= cinema
  buildCinema() {
    const a = this.house.anchors.cinema;
    if (!a) return;
    const M = this.house.M;
    const g = new THREE.Group();
    g.position.copy(a);
    g.rotation.y = Math.PI; // screen faces -z, toward the sofa
    const W = 1.6, Hh = 0.9;
    const body = bx(W + 0.24, Hh + 0.3, 0.55, M.woodDark); body.position.set(0, Hh / 2 + 0.2, 0);
    const bezel = bx(W + 0.08, Hh + 0.08, 0.02, M.black); bezel.position.set(0, Hh / 2 + 0.2, 0.28);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), screenMaterial());
    screen.position.set(0, Hh / 2 + 0.2, 0.295);
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = 512; overlayCanvas.height = 288;
    const overlayTex = new THREE.CanvasTexture(overlayCanvas);
    overlayTex.colorSpace = THREE.SRGBColorSpace;
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: overlayTex, transparent: true, depthWrite: false }));
    overlay.position.set(0, Hh / 2 + 0.2, 0.3);
    overlay.renderOrder = 2;
    const vcr = bx(0.5, 0.1, 0.35, M.dark); vcr.position.set(-0.6, 0.06, 0.12);
    const vcrLed = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.025), new THREE.MeshBasicMaterial({ color: 0x00ff40 }));
    vcrLed.position.set(-0.45, 0.07, 0.296);
    g.add(body, bezel, screen, overlay, vcr, vcrLed);
    this.group.add(g);
    const mat = screen.material;
    const u = mat.uniforms;
    u.tint.value = 0; u.mono.value = 0.06; u.bright.value = 1.15; u.curve.value = 0.06; u.mode.value = 1;
    const pos = a.clone().add(V(0, 0.7, -0.3));
    this.cinema = { group: g, screen, mat, overlay, overlayCanvas, overlayTex, vcrLed, pos, state: { playing: false, pos: 0, at: 0 }, el: null, ready: false, lastLabel: '' };
    this.house.register('cinema', 'cinema', [screen, body, bezel], pos);
    this.house.register('vcr', 'vcr', [vcr], a.clone().add(V(0.6, 0.06, -0.12)));
    this.drawCinemaOverlay('▶  PRESS E TO PLAY');
  }

  ensureCinemaVideo() {
    const C = this.cinema;
    if (C.el) return C.el;
    const url = assetUrl('cinemaVideo');
    const el = document.createElement('video');
    el.playsInline = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    if (url) el.src = url;
    el.addEventListener('error', () => { C.error = true; this.drawCinemaOverlay('VIDEO UNAVAILABLE IN THIS BROWSER'); });
    el.addEventListener('loadeddata', () => { C.ready = true; });
    const tex = new THREE.VideoTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    C.tex = tex;
    // Route the film's own soundtrack through Web Audio, positioned at the TV.
    const ctx = audio.ctx;
    const src = ctx.createMediaElementSource(el);
    const gain = ctx.createGain(); gain.gain.value = 1.0;
    const pan = audio.makePanner(C.pos, 3.5, 40, 0.9);
    src.connect(gain); gain.connect(pan); pan.connect(audio.sfxBus);
    C.el = el;
    return el;
  }

  drawCinemaOverlay(text, sub = '') {
    const C = this.cinema;
    if (!C || C.lastLabel === text + sub) return;
    C.lastLabel = text + sub;
    const g = C.overlayCanvas.getContext('2d');
    g.clearRect(0, 0, 512, 288);
    if (text) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, 100, 512, 90);
      g.fillStyle = '#e8e8e8';
      g.font = '34px "VT323", "Courier New", monospace';
      g.textAlign = 'center';
      g.fillText(text, 256, 145);
      if (sub) { g.font = '24px "VT323", "Courier New", monospace'; g.fillText(sub, 256, 175); }
    }
    C.overlayTex.needsUpdate = true;
  }

  setCinema(state) {
    this.cinema.state = { ...state };
    this.ensureCinemaVideo();
  }

  cinemaTime(now) {
    const s = this.cinema.state;
    return s.playing ? s.pos + (now - s.at) / 1000 : s.pos;
  }

  updateCinema(dt, now) {
    const C = this.cinema;
    if (!C) return;
    const s = C.state;
    const el = C.el;
    const u = C.mat.uniforms;
    u.time.value = performance.now() / 1000;
    u.glitch.value = 0.03;
    const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    C.vcrLed.material.color.setHex(s.playing ? 0x00ff40 : s.pos > 0 ? 0xffaa00 : 0x113311);
    if (!el) { u.mode.value = 1; return; }
    const target = this.cinemaTime(now);
    const dur = el.duration || 0;
    if (s.playing) {
      if (dur && target >= dur - 0.05) {
        if (this.game.isHost && !C.endSent) { C.endSent = true; this.game.broadcast({ k: 'cinema', playing: false, pos: 0, at: now }); }
      } else C.endSent = false;
      if (el.paused && !C.error) el.play().catch(() => { this.drawCinemaOverlay('CLICK TO ALLOW SOUND'); });
      if (el.readyState >= 1 && Math.abs(el.currentTime - target) > 0.35) { try { el.currentTime = target; } catch { /* not seekable yet */ } }
      if (C.tex && el.readyState >= 2) { u.tex.value = C.tex; u.mode.value = 2; }
      if (!C.error) this.drawCinemaOverlay('');
    } else {
      if (!el.paused) el.pause();
      if (el.readyState >= 1 && Math.abs(el.currentTime - target) > 0.3) { try { el.currentTime = target; } catch { /* ignore */ } }
      if (C.tex && el.readyState >= 2 && target > 0) { u.tex.value = C.tex; u.mode.value = 2; }
      else u.mode.value = 1;
      if (!C.error) this.drawCinemaOverlay(target > 0 ? '❚❚  PAUSED' : '▶  PRESS E TO PLAY', target > 0 ? `${fmt(target)} / ${fmt(dur)}` : 'VCR: restart');
    }
  }

  // =============================================================== mirror
  buildMirror() {
    const a = this.house.anchors.mirror;
    if (!a) return;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.65), new THREE.MeshStandardMaterial({ color: 0x2c3436, metalness: 0.6, roughness: 0.15 }));
    glass.position.copy(a);
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 440;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const text = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.65), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    text.position.copy(a).add(V(0, 0, 0.004));
    text.renderOrder = 2;
    this.group.add(glass, text);
    this.mirror = { cv, tex, index: -1 };
    this.setMirror(0);
    // Redraw once the horror font is available to the canvas.
    document.fonts?.load('80px "Creepster"').then(() => { const i = this.mirror.index; this.mirror.index = -1; this.setMirror(i); }).catch(() => {});
  }

  setMirror(i) {
    const m = this.mirror;
    if (!m || m.index === i) return;
    m.index = i;
    const g = m.cv.getContext('2d');
    g.clearRect(0, 0, 512, 440);
    const lines = MIRROR_TEXTS[i % MIRROR_TEXTS.length].split('\n');
    const rnd = mulberry32(i * 77 + 3);
    g.textAlign = 'center';
    lines.forEach((ln, k) => {
      const size = lines.length > 2 ? 104 : 118;
      g.font = `${size}px "Creepster", "Chiller", Impact, fantasy`;
      const y = (lines.length > 2 ? 110 : 160) + k * (size + 14);
      g.save();
      g.translate(256, y);
      g.rotate((rnd() - 0.5) * 0.12);
      g.fillStyle = 'rgba(150,8,6,0.97)';
      g.fillText(ln, 0, 0, 500);
      g.restore();
      // drips
      for (let d = 0; d < 6; d++) {
        const x = 70 + rnd() * 370;
        g.fillStyle = 'rgba(110,5,5,0.85)';
        g.fillRect(x, y + 4, 3 + rnd() * 3, 18 + rnd() * 50);
      }
    });
    m.tex.needsUpdate = true;
  }

  // ================================================================ blood
  buildBlood() {
    const U = 3.4, B = -3.2;
    const tex = [splatTexture(11, 'splat'), splatTexture(23, 'pool'), splatTexture(37, 'wall'), splatTexture(41, 'scratch')];
    const mats = tex.map(t => new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const floor = (x, y, z, s, m = 0, rot = 0) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mats[m]);
      p.rotation.set(-Math.PI / 2, 0, rot);
      p.position.set(x, y + 0.012, z);
      this.group.add(p);
    };
    const wall = (x, y, z, s, ry, m = 2) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mats[m]);
      p.rotation.y = ry;
      p.position.set(x, y, z);
      this.group.add(p);
    };
    // upstairs bathroom
    floor(12.0, U, 2.9, 1.9, 1, 0.4); floor(13.6, U, 5.0, 0.9, 0, 1.2); floor(11.2, U, 6.6, 0.7, 0, 2.2);
    wall(14.88, U + 1.3, 1.6, 1.0, -Math.PI / 2);
    // trail to Ajan's room and inside it
    floor(29.5, U, 9.6, 0.6, 0, 0.3); floor(31.8, U, 9.3, 0.7, 0, 1.0); floor(34.7, U, 8.6, 0.6, 0, 2.0);
    floor(36.5, U, 4.6, 2.2, 1, 0.8); floor(33.0, U, 2.0, 1.0, 0, 0.2);
    floor(36.8, U + 0.56, 1.9, 1.3, 1, 0.5);
    wall(33.0, U + 1.4, 0.11, 1.0, 0, 3); wall(38.2, U + 1.6, 0.11, 0.9, 0, 3);
    wall(39.89, U + 1.2, 3.0, 1.2, -Math.PI / 2, 2);
    // ground floor + basement details
    floor(18.6, 0, 12.9, 0.8, 0, 0.7); floor(10.4, 0, 5.2, 0.6, 0, 1.4); floor(26.0, 0, 9.6, 0.5, 0, 0.1);
    floor(34.0, B, 23.0, 1.4, 1, 0.3); floor(22.0, B, 20.4, 0.9, 0, 2.4); floor(12.0, B, 20.0, 0.7, 0, 0.9);
    wall(36.0, B + 1.3, 26.89, 1.0, Math.PI, 2);
  }

  /** Bones, a bowl of something and other signs he lives here. */
  buildAjanRoom() {
    const U = 3.4, M = this.house.M;
    const bone = new THREE.MeshStandardMaterial({ color: 0xc9bea2, roughness: 0.7 });
    const rnd = mulberry32(99);
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.32 + rnd() * 0.2, 6), bone);
      b.rotation.set(Math.PI / 2, 0, rnd() * 6);
      b.position.set(33 + rnd() * 2.2, U + 0.03, 5.3 + rnd() * 2);
      this.group.add(b);
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bone);
    skull.position.set(34.2, U + 0.09, 6.4);
    skull.scale.set(1, 0.85, 1.2);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.1, 16, 1, true), M.metal);
    bowl.position.set(31.0, U + 0.85, 7.2);
    const stew = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshStandardMaterial({ color: 0x5a0d08, roughness: 0.3 }));
    stew.rotation.x = -Math.PI / 2;
    stew.position.set(31.0, U + 0.88, 7.2);
    this.group.add(skull, bowl, stew);
  }

  // ================================================================= jelly
  async buildJelly() {
    const spot = this.house.jellySpot;
    if (!spot) return;
    const gltf = await loadGLTF('objectModel');
    let mesh = null;
    gltf?.scene.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
    const uniforms = { uJ: { value: new THREE.Vector2() }, uT: { value: 0 }, uS: { value: 0 } };
    let geo, mat;
    if (mesh) { geo = mesh.geometry; mat = mesh.material.clone(); }
    else { geo = new THREE.CapsuleGeometry(0.18, 0.64, 8, 16); geo.translate(0, 0.5, 0); mat = new THREE.MeshStandardMaterial({ color: 0xd8a088 }); }
    mat.roughness = 0.35;
    mat.metalness = 0;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec2 uJ; uniform float uT; uniform float uS;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float w = smoothstep(0.3, 1.0, position.y); w = w * w;
transformed.x += uJ.x * w + sin(uT * 13.0 + position.y * 6.0) * uS * 0.04 * w;
transformed.z += uJ.y * w + cos(uT * 11.0 + position.y * 5.0) * uS * 0.04 * w;
transformed.y -= length(uJ) * 0.25 * w;
transformed.xz *= 1.0 + length(uJ) * 0.35 * w;`);
    };
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(2.6);
    m.position.copy(spot.pos);
    m.rotation.y = 0.6;
    m.castShadow = true;
    this.group.add(m);
    this.jelly = { mesh: m, uniforms, J: new THREE.Vector2(), Vv: new THREE.Vector2(), pos: spot.pos.clone().add(V(0, 1.3, 0)), room: spot.room, cool: 0 };
    this.house.register('jelly', 'jelly', [m], this.jelly.pos);
  }

  /** Impulse in world units (direction the thing gets pushed). */
  pokeJelly(ix, iz) {
    const j = this.jelly;
    if (!j) return;
    // convert world impulse into the mesh's local frame (rotation + scale)
    const c = Math.cos(-j.mesh.rotation.y), s = Math.sin(-j.mesh.rotation.y);
    const lx = (ix * c - iz * s) / 2.6, lz = (ix * s + iz * c) / 2.6;
    j.Vv.x += lx * 2.4;
    j.Vv.y += lz * 2.4;
    const strength = clamp(Math.hypot(ix, iz), 0.3, 1.5);
    audio.play('boing', { pos: j.pos, vol: 0.9 * strength, rate: 0.85 + Math.random() * 0.35, ref: 2.5 });
  }

  updateJelly(dt) {
    const j = this.jelly;
    if (!j) return;
    const k = 34, c = 2.4;
    j.Vv.x += (-k * j.J.x - c * j.Vv.x) * dt;
    j.Vv.y += (-k * j.J.y - c * j.Vv.y) * dt;
    j.J.x += j.Vv.x * dt;
    j.J.y += j.Vv.y * dt;
    const L = j.J.length();
    if (L > 0.28) j.J.multiplyScalar(0.28 / L);
    j.uniforms.uJ.value.copy(j.J);
    j.uniforms.uT.value += dt;
    j.uniforms.uS.value = Math.min(1, L * 6);
  }

  // ================================================================= frame
  update(dt, now) {
    this.updateElevator(dt, now);
    this.updateCinema(dt, now);
    this.updateJelly(dt);
    if (this.boombox) {
      const playing = performance.now() < this.boombox.until;
      const t = performance.now() / 1000;
      this.speakers.forEach((s, i) => s.scale.setScalar(playing ? 1 + Math.max(0, Math.sin(t * 22 + i)) * 0.08 : 1));
    }
  }

  dispose() {
    this.disposed = true;
    this.elevHum?.stop();
    for (const r of this.radios.values()) { r.sound?.stop(); r.static?.stop(); }
    if (this.cinema?.el) { this.cinema.el.pause(); this.cinema.el.removeAttribute('src'); this.cinema.el.load(); }
    if (this.phone?.el) { this.phone.el.pause(); this.phone.el.removeAttribute('src'); }
    clearTimeout(this.phone?.stopT);
    elevatorState.y = 0;
  }
}
