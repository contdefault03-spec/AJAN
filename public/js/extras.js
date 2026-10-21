// Gameplay additions that sit on top of the house: the capture rooms players wake up
// in after being knocked out (TV room, cage, restraint table, basement storage), the two
// one-use poison sprays, the fridge Ajan raids for his dollma, his music-room dance and
// the bar's slot machine. Shared state is decided by the host and sent as events.
import * as THREE from 'three';
import { audio } from './audio.js';
import { loadGLTF, assetUrl } from './assets.js';
import { settings } from './settings.js';
import { FRIDGE, SNACK_CHAIR, MUSIC_SPOT } from './ajan.js';
import { lineOfSight } from './physics.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BY = -3.2, U = 3.4, AY = 6.8;
const $ = id => document.getElementById(id);

// Where knocked-out players wake up. `drop` is where the monster leaves the body,
// `pos`/`ry` where (and facing which way) the player comes to.
export const CAPTURE_SPOTS = [
  { id: 'tv', name: 'THE TV ROOM', pos: V(23.5, BY, 21.6), drop: V(23.5, BY, 20.4), yaw: 0, presses: 26 },
  { id: 'cage', name: 'THE CAGE', pos: V(31.4, U, 6.6), drop: V(33.4, U, 6.6), yaw: -Math.PI / 2, presses: 20, cage: true },
  { id: 'table', name: 'THE RESTRAINT TABLE', pos: V(12.4, U, 7.0), drop: V(13.8, U, 7.3), yaw: 0, presses: 30 },
  { id: 'storage', name: 'BASEMENT STORAGE', pos: V(6.4, BY, 23.4), drop: V(7.4, BY, 22.6), yaw: 0, presses: 22, dark: true },
];
const TV_CENTER = CAPTURE_SPOTS[0].pos;

const SPRAY_SPOTS = [[25.2, 0.98, 11.42], [15.0, U, 16.0]]; // kitchen counter (ground floor) · library floor (upstairs)
const SPRAY_RANGE = 3.6;
const STUN_SPRAY = 60;

// Slot machine
const SYMBOLS = ['7', 'CLOVER', 'BELL', 'BAR', 'CHERRY'];
const WEIGHTS = [2, 3, 4, 5, 6];
const PAYOUT = { '7': 50, CLOVER: 20, BELL: 15, BAR: 10, CHERRY: 5 };
export const BETS = [5, 10, 20, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const SLOT_POS = V(16.9, AY, 12.2);
const SLOT_RY = -Math.PI / 2;
const SLOT_H = 1.75;
const SPIN_TIME = 2.2;

function spinReel(rnd) {
  let r = rnd() * WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SYMBOLS.length; i++) { r -= WEIGHTS[i]; if (r < 0) return i; }
  return SYMBOLS.length - 1;
}
/** Winnings multiplier for three reels (indices into SYMBOLS). */
export function slotMultiplier(r) {
  const s = r.map(i => SYMBOLS[i]);
  if (s[0] === s[1] && s[1] === s[2]) return PAYOUT[s[0]];
  const cherries = s.filter(x => x === 'CHERRY').length;
  if (cherries === 2) return 2;
  if (s.filter(x => x === '7').length === 2) return 3;
  return 0;
}

export class Extras {
  constructor(game) {
    this.game = game;
    this.house = game.house;
    this.restrained = null; // local struggle state
    this.lastSpot = new Map(); // host: pid -> last capture spot id
    this.slot = { user: null, userT: 0, spinUntil: 0, reels: [0, 1, 2], anim: null, bet: 20 };
    this.koUntil = null;
  }

  async init() {
    const G = this.game, H = this.house, scene = G.scene;
    this.group = new THREE.Group();
    H.group.add(this.group);
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; this.group.add(b); return b; };

    // ---------------------------------------------------------- the TV room (boiler room)
    // Ten old sets of different sizes stacked on stands around a bolted-down chair, all
    // showing the same tv.mp4 from one shared <video> (one decoder, one audio source).
    const metal = mat(0x2a2a2a, { metalness: 0.6, roughness: 0.4 });
    const casing = mat(0x1d1a17, { roughness: 0.6 });
    this.tvVideo = document.createElement('video');
    this.tvVideo.loop = true; this.tvVideo.muted = false; this.tvVideo.playsInline = true; this.tvVideo.preload = 'auto';
    this.tvVideo.crossOrigin = 'anonymous';
    const tvUrl = assetUrl('tvVideo');
    if (tvUrl) this.tvVideo.src = tvUrl;
    else G.toast('Missing asset: tv.mp4 (the TV room screens stay dark).', 6000);
    this.tvVideo.onerror = () => { this.tvError = true; console.warn('[AJAN] tv.mp4 failed to load'); };
    const vt = new THREE.VideoTexture(this.tvVideo);
    vt.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshBasicMaterial({ map: vt, toneMapped: false });
    this.tvScreenMat = screenMat;
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    this.tvDark = darkMat;
    this.tvScreens = [];
    const sizes = [0.9, 0.55, 0.7, 0.45, 1.1, 0.6, 0.5, 0.8, 0.65, 0.4];
    for (let i = 0; i < 10; i++) {
      const a = -1.25 + (i / 9) * 2.5; // arc in front of the chair
      const r = 2.1 + (i % 2) * 0.35;
      const w = sizes[i], h = w * 0.75;
      const x = TV_CENTER.x + Math.sin(a) * r, z = TV_CENTER.z - Math.cos(a) * r;
      const y = BY + 0.5 + (i % 3) * 0.75 + h / 2;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.lookAt(TV_CENTER.x, BY + 1.2, TV_CENTER.z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, w * 0.7), casing);
      body.position.z = -w * 0.35;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), darkMat);
      scr.position.z = 0.002;
      g.add(body, scr);
      // stand down to the floor
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, y - h / 2 - BY, 6), metal);
      leg.position.set(0, -(y - BY) / 2 - h / 4, -w * 0.35);
      g.add(leg);
      this.group.add(g);
      this.tvScreens.push(scr);
    }
    this.tvLight = new THREE.PointLight(0x9fb6ff, 0, 7, 1.4);
    this.tvLight.position.set(TV_CENTER.x, BY + 1.6, TV_CENTER.z - 1.2);
    this.group.add(this.tvLight);
    // the chair they wake up strapped to
    const chairM = mat(0x3a2a1a);
    box(0.55, 0.06, 0.55, chairM, TV_CENTER.x, BY + 0.48, TV_CENTER.z);
    box(0.55, 0.7, 0.06, chairM, TV_CENTER.x, BY + 0.85, TV_CENTER.z + 0.27);
    for (const [dx, dz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) box(0.05, 0.48, 0.05, chairM, TV_CENTER.x + dx, BY + 0.24, TV_CENTER.z + dz);
    this.straps = [];
    const strapM = mat(0x111111, { roughness: 0.9 });
    for (const dx of [-0.24, 0.24]) this.straps.push(box(0.08, 0.04, 0.3, strapM, TV_CENTER.x + dx, BY + 0.66, TV_CENTER.z));

    // ---------------------------------------------------------- the cage beside Ajan's bed
    const c = CAPTURE_SPOTS[1].pos;
    const bars = mat(0x3b3631, { metalness: 0.7, roughness: 0.45 });
    const cx0 = c.x - 1.0, cx1 = c.x + 1.0, cz0 = c.z - 1.0, cz1 = c.z + 1.0, ch = 2.0;
    const bar = (x, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ch, 6), bars); m.position.set(x, U + ch / 2, z); this.group.add(m); return m; };
    for (let t = 0; t <= 1.001; t += 0.1) { bar(cx0 + t * 2, cz0); bar(cx0 + t * 2, cz1); bar(cx0, cz0 + t * 2); }
    box(2.05, 0.05, 2.05, bars, c.x, U + ch, c.z);
    box(1.9, 0.12, 1.2, mat(0x6a5a48, { roughness: 1 }), c.x - 0.05, U + 0.06, c.z + 0.2); // mattress
    // the door is the east side: bars on a hinge at the south corner
    this.cageDoor = new THREE.Group();
    this.cageDoor.position.set(cx1, U, cz0);
    for (let t = 0; t <= 1.001; t += 0.1) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ch, 6), bars); m.position.set(0, ch / 2, t * 2); this.cageDoor.add(m); }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.06), mat(0x9a8040, { metalness: 0.8 }));
    lock.position.set(0, 1.0, 1.95);
    this.cageDoor.add(lock);
    this.group.add(this.cageDoor);
    const col = (x0, z0, x1, z1, y0, y1) => H.collider(x0, z0, x1, z1, y0, y1, { occlude: false });
    col(cx0 - 0.03, cz0 - 0.03, cx1 + 0.03, cz0 + 0.03, U, U + ch);
    col(cx0 - 0.03, cz1 - 0.03, cx1 + 0.03, cz1 + 0.03, U, U + ch);
    col(cx0 - 0.03, cz0, cx0 + 0.03, cz1, U, U + ch);
    this.cageDoorCol = col(cx1 - 0.03, cz0, cx1 + 0.03, cz1, U, U + ch);
    this.setCage(true, true);

    // ---------------------------------------------------------- the restraint table (linen room)
    const t = V(12.4, U, 6.0);
    box(2.0, 0.08, 0.8, mat(0x8a8a8a, { metalness: 0.5, roughness: 0.35 }), t.x, U + 0.82, t.z);
    for (const [dx, dz] of [[-0.9, -0.33], [0.9, -0.33], [-0.9, 0.33], [0.9, 0.33]]) box(0.05, 0.82, 0.05, metal, t.x + dx, U + 0.41, t.z + dz);
    for (const dx of [-0.6, 0, 0.6]) this.straps.push(box(0.08, 0.03, 0.85, strapM, t.x + dx, U + 0.875, t.z));
    col(t.x - 1.0, t.z - 0.4, t.x + 1.0, t.z + 0.4, U, U + 0.86);

    // ---------------------------------------------------------- basement storage: a flickering bulb
    const s = CAPTURE_SPOTS[3].pos;
    this.storageLight = new THREE.PointLight(0xffd8a0, 0, 6, 1.6);
    this.storageLight.position.set(s.x, BY + 2.4, s.z);
    this.group.add(this.storageLight);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
    bulb.position.copy(this.storageLight.position);
    this.bulb = bulb;
    this.group.add(bulb);

    // ---------------------------------------------------------- the fridge door and Ajan's dollma
    this.fridgePivot = new THREE.Group();
    this.fridgePivot.position.set(17.975, 0, 11.15);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.85), mat(0xe8e4d8, { roughness: 0.35 }));
    door.position.set(0, 0.92, 0.425);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03), metal);
    handle.position.set(0.04, 1.1, 0.78);
    this.fridgePivot.add(door, handle);
    this.group.add(this.fridgePivot);
    this.fridgeLight = new THREE.PointLight(0xe8f4ff, 0, 3, 1.5);
    this.fridgeLight.position.set(18.3, 1.1, 11.6);
    this.group.add(this.fridgeLight);
    this.fridgeOpen = 0; this.fridgeTarget = 0;
    const dg = await loadGLTF('dollmaModel');
    this.dollma = fitModel(dg?.scene, 0.22) || new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 12), mat(0x4a6a2a));
    this.dollma.visible = false;
    scene.add(this.dollma);

    // ---------------------------------------------------------- poison sprays
    SPRAY_SPOTS.forEach((p, i) => G.placeItem('spray_' + i, 'spray', { pos: p }));

    // ---------------------------------------------------------- slot machine in the club
    const sg = await loadGLTF('slotModel');
    const sm = sg?.scene ? sg.scene.clone() : null;
    this.slotGroup = new THREE.Group();
    this.slotGroup.position.copy(SLOT_POS);
    this.slotGroup.rotation.y = SLOT_RY;
    if (sm) {
      sm.scale.setScalar(SLOT_H);
      sm.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
      this.slotGroup.add(sm);
    } else {
      G.toast('Missing asset: slot.glb', 5000);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, SLOT_H, 0.35), mat(0x801010));
      b.position.y = SLOT_H / 2;
      this.slotGroup.add(b);
    }
    // The model's white screen (measured from its texture: x ±0.088, y 0.425–0.55, z 0.036
    // in model units) becomes a live canvas showing the reels.
    this.slotCanvas = document.createElement('canvas');
    this.slotCanvas.width = 384; this.slotCanvas.height = 272;
    this.slotTex = new THREE.CanvasTexture(this.slotCanvas);
    this.slotTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.176 * SLOT_H, 0.125 * SLOT_H), new THREE.MeshBasicMaterial({ map: this.slotTex, toneMapped: false }));
    scr.position.set(0, 0.4875 * SLOT_H, 0.0375 * SLOT_H);
    this.slotGroup.add(scr);
    this.slotLight = new THREE.PointLight(0xffd070, 2, 2.5, 1.5);
    this.slotLight.position.set(0, 0.9 * SLOT_H * 0.6, 0.4);
    this.slotGroup.add(this.slotLight);
    H.group.add(this.slotGroup);
    H.collider(SLOT_POS.x - 0.3, SLOT_POS.z - 0.3, SLOT_POS.x + 0.3, SLOT_POS.z + 0.3, AY, AY + SLOT_H, { furniture: true });
    const pick = H.pickBox(SLOT_POS.x - 0.32, AY + 0.3, SLOT_POS.z - 0.3, SLOT_POS.x + 0.32, AY + SLOT_H, SLOT_POS.z + 0.3);
    H.register('slot', 'slot', [pick], V(SLOT_POS.x, AY + 1.1, SLOT_POS.z));
    this.drawSlot(0);
    this.buildUI();
  }

  buildUI() {
    const hud = $('hud') || document.body;
    const mk = (id, cls, html = '') => { let el = $(id); if (!el) { el = document.createElement('div'); el.id = id; el.className = cls; el.innerHTML = html; hud.appendChild(el); } return el; };
    this.ui = {
      lives: mk('livesHud', 'livesHud vt'),
      back: mk('comingBack', 'comingBack vt', '<div class="cbTitle">COMING BACK IN</div><div class="cbNum">--</div><div class="cbSub"></div>'),
      struggle: mk('struggle', 'struggle vt', '<div class="stTitle">YOU ARE TIED UP</div><div class="stBar"><i></i></div><div class="stSub">MASH [E] TO BREAK FREE</div>'),
    };
    let sl = $('slotUI');
    if (!sl) {
      sl = document.createElement('div');
      sl.id = 'slotUI';
      sl.className = 'slotUI vt';
      sl.innerHTML = `<div class="slTitle">LUCKY HOUSE SLOTS</div><div class="slBal">$<span id="slBal">0</span></div>
        <div class="slBets">${BETS.map(b => `<button data-bet="${b}">$${b}</button>`).join('')}</div>
        <div class="slRow"><button id="slSpin" class="btn">SPIN</button><button id="slLeave" class="btn ghost">LEAVE [ESC]</button></div>
        <div id="slMsg" class="slMsg"></div>
        <div class="slTable">777 ×50 · ☘☘☘ ×20 · 🔔🔔🔔 ×15 · BAR BAR BAR ×10 · 🍒🍒🍒 ×5 · any two 7 ×3 · two 🍒 ×2</div>`;
      document.body.appendChild(sl);
    }
    sl.querySelectorAll('[data-bet]').forEach(b => { b.onclick = () => { this.slot.bet = +b.dataset.bet; this.refreshSlotUI(); audio.play('click', { vol: 0.3 }); }; });
    $('slSpin').onclick = () => this.spin();
    $('slLeave').onclick = () => this.closeSlot();
    this.onKey = e => {
      if (!this.slotOpen) return;
      if (e.code === 'Escape') { e.preventDefault(); this.closeSlot(); }
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.spin(); }
    };
    addEventListener('keydown', this.onKey, true);
  }

  // ======================================================================= host
  /** Host: where should this knocked-out player wake up? (never the same room twice in a row) */
  pickSpot(pid) {
    const last = this.lastSpot.get(pid);
    const pool = CAPTURE_SPOTS.filter(s => s.id !== last);
    const s = pool[Math.floor(this.game.rnd() * pool.length)];
    this.lastSpot.set(pid, s.id);
    return s;
  }

  /** Host: requests this module owns. Returns true if handled. */
  request(pid, r, p) {
    const G = this.game;
    switch (r.k) {
      case 'free': {
        if (!p.restrained) return true;
        p.restrained = false;
        G.broadcast({ k: 'freed', pid, spot: p.captureSpot });
        G.hostNoise(p.pos, 6, 'struggle', pid);
        return true;
      }
      case 'spray': {
        const it = G.items.get(r.id);
        if (!it || it.type !== 'spray' || it.holder !== pid || it.used) return true;
        it.used = true; // one use, and only by whoever holds it
        const o = V(...r.o), d = V(...r.d).normalize();
        const hits = [];
        for (const b of G.brains) {
          if (['dormant', 'kill', 'carry'].includes(b.state)) continue;
          const to = b.pos.clone().add(V(0, 1.6, 0)).sub(o);
          const dist = to.length();
          if (dist > SPRAY_RANGE || to.normalize().dot(d) < 0.82) continue;
          if (!lineOfSight(p.pos, b.pos, G.house.colliders)) continue;
          if (b.stun(STUN_SPRAY, true)) hits.push(b.id);
        }
        G.broadcast({ k: 'spray', id: r.id, by: pid, hits, ox: o.x, oy: o.y, oz: o.z, dx: d.x, dy: d.y, dz: d.z });
        G.hostNoise(p.pos, 5, 'spray', pid);
        return true;
      }
      case 'slotclaim': {
        const s = this.slot, now = G.time;
        if (s.user && s.user !== pid && now - s.userT < 25) { G.broadcast({ k: 'msg', text: 'Someone else is playing the slot machine.' }, pid); return true; }
        s.user = pid; s.userT = now;
        G.broadcast({ k: 'slotuser', pid });
        return true;
      }
      case 'slotleave': {
        if (this.slot.user === pid) { this.slot.user = null; G.broadcast({ k: 'slotuser', pid: null }); }
        return true;
      }
      case 'slot': {
        const s = this.slot, now = G.time, club = G.club;
        if (s.user !== pid || now < s.spinUntil) return true;
        const bet = BETS.includes(r.bet) ? r.bet : 0;
        const bal = club.balance(pid);
        if (!bet || bal < bet) { G.broadcast({ k: 'msg', text: `Not enough money for a $${bet} bet ($${bal}).` }, pid); return true; }
        const reels = [spinReel(Math.random), spinReel(Math.random), spinReel(Math.random)];
        const win = bet * slotMultiplier(reels);
        s.userT = now;
        s.spinUntil = now + SPIN_TIME;
        G.broadcast({ k: 'slot', pid, bet, reels, win, money: bal - bet + win });
        return true;
      }
    }
    return false;
  }

  // ======================================================================= events
  event(e) {
    const G = this.game;
    switch (e.k) {
      case 'freed': {
        if (e.spot === 'cage') this.setCage(false);
        if (e.pid === G.localId) { this.endStruggle(); G.message('You\'re free. Get out — quietly.', 4); }
        else G.toast(`${G.players.get(e.pid)?.name || 'Someone'} broke free.`);
        audio.play('rattle', { pos: CAPTURE_SPOTS.find(s => s.id === e.spot)?.pos || G.camera.position, vol: 0.8 });
        return true;
      }
      case 'spray': {
        const it = G.items.get(e.id);
        if (it) { it.used = true; it.mesh.visible = false; }
        const o = V(e.ox, e.oy, e.oz), d = V(e.dx, e.dy, e.dz);
        for (let i = 1; i <= 6; i++) G.fx.emit(o.clone().addScaledVector(d, i * 0.45), 0.15, 0.5, 6);
        audio.play('hiss', { pos: o, vol: 0.8, ref: 2 }) || audio.play('static', { pos: o, vol: 0.5, ref: 2, duration: 1.2 });
        const who = e.by === G.localId ? 'You' : G.players.get(e.by)?.name || 'Someone';
        if (e.hits.length) {
          for (const id of e.hits) audio.play('roar', { pos: G.monsters.get(id)?.vis.pos.clone().add(V(0, 1.8, 0)) || o, vol: 1, ref: 3, rate: 1.15 });
          G.message(`${who} sprayed ${e.hits.map(id => G.monsters.get(id)?.def.name || id).join(' and ')} in the eyes! Blind for 60 seconds.`, 5);
        } else if (e.by === G.localId) G.message('Missed — the spray is empty now.', 3);
        G.updateHUD();
        return true;
      }
      case 'fridge': this.fridgeTarget = e.open ? 1 : 0; audio.play(e.open ? 'creak' : 'clunk', { pos: V(17.9, 1, 11.6), vol: 0.6 }); return true;
      case 'slotuser': this.slot.user = e.pid; if (e.pid === G.localId) this.openSlot(); return true;
      case 'slot': {
        G.club.money.set(e.pid, e.money);
        this.slot.reels = e.reels;
        this.slot.anim = { t: 0, reels: e.reels, win: e.win, bet: e.bet, pid: e.pid };
        audio.play('click', { pos: SLOT_POS.clone().add(V(0, 1, 0)), vol: 0.6, rate: 0.7 });
        if (e.pid === G.localId) { $('slMsg').textContent = 'SPINNING…'; this.refreshSlotUI(); }
        return true;
      }
    }
    return false;
  }

  /** Called on every client when a player wakes up in a capture room. */
  onRevive(e) {
    const G = this.game;
    const spot = CAPTURE_SPOTS.find(s => s.id === e.spot);
    if (!spot) return;
    if (spot.cage) this.setCage(true);
    if (e.pid === G.localId) this.startStruggle(spot);
  }

  setCage(closed, instant = false) {
    this.cageClosed = closed;
    this.cageDoorCol.off = !closed;
    if (instant) this.cageDoor.rotation.y = closed ? 0 : -1.7;
  }

  // ======================================================================= local: struggle
  startStruggle(spot) {
    this.restrained = { spot, k: 0, need: spot.presses };
    this.ui.struggle.querySelector('.stBar i').style.width = '0%';
    this.ui.struggle.classList.add('show');
    this.ui.struggle.querySelector('.stTitle').textContent = spot.cage ? 'LOCKED IN A CAGE' : spot.id === 'storage' ? 'LOCKED IN THE DARK' : 'YOU ARE TIED UP';
    this.ui.struggle.querySelector('.stSub').textContent = spot.cage ? 'MASH [E] TO FORCE THE LOCK' : spot.id === 'storage' ? 'MASH [E] TO PULL FREE OF THE CHAINS' : 'MASH [E] TO BREAK FREE';
    this.game.dizzy = Math.max(this.game.dizzy || 0, 0.8);
  }
  press() {
    const r = this.restrained;
    if (!r || r.sent) return;
    r.k += 1;
    this.ui.struggle.querySelector('.stBar i').style.width = Math.min(100, r.k / r.need * 100) + '%';
    audio.play('rattle', { vol: 0.35, rate: 0.9 + Math.random() * 0.3 });
    this.game.post?.glitch(0.08);
    if (r.k >= r.need) { r.sent = true; this.game.request({ k: 'free' }); }
  }
  endStruggle() {
    this.restrained = null;
    this.ui.struggle.classList.remove('show');
    this.game.local.frozen = false;
  }

  // ======================================================================= local: spray
  /** Left click with a spray in hand. */
  useSpray(it) {
    const G = this.game, cam = G.camera;
    const d = V(); cam.getWorldDirection(d);
    const o = cam.getWorldPosition(V());
    G.local.act?.();
    G.request({ k: 'spray', id: it.id, o: [o.x, o.y, o.z].map(v => +v.toFixed(2)), d: [d.x, d.y, d.z].map(v => +v.toFixed(3)) });
  }

  // ======================================================================= local: slot machine
  interactSlot() {
    const G = this.game;
    if (this.slot.user && this.slot.user !== G.localId) { G.message('Someone else is playing the slot machine.', 2.5); return; }
    G.request({ k: 'slotclaim' });
  }
  openSlot() {
    const G = this.game;
    this.slotOpen = true;
    G.slotOpen = true;
    G.local.keys?.clear?.();
    $('slotUI').classList.add('show');
    $('slMsg').textContent = 'PICK A BET AND SPIN.';
    try { document.exitPointerLock?.(); } catch { /* fine */ }
    this.refreshSlotUI();
  }
  closeSlot() {
    if (!this.slotOpen) return;
    const G = this.game;
    this.slotOpen = false;
    G.slotOpen = false;
    G.slotClosedAt = performance.now();
    $('slotUI').classList.remove('show');
    G.request({ k: 'slotleave' });
    G.lockPointer();
  }
  spin() {
    const G = this.game;
    if (!this.slotOpen || this.slot.anim) return;
    const bal = G.club.balance(G.localId);
    if (bal < this.slot.bet) { $('slMsg').textContent = `NOT ENOUGH MONEY ($${bal}).`; audio.play('rattle', { vol: 0.3 }); return; }
    G.request({ k: 'slot', bet: this.slot.bet });
  }
  refreshSlotUI() {
    const G = this.game;
    $('slBal').textContent = G.club.balance(G.localId);
    document.querySelectorAll('#slotUI [data-bet]').forEach(b => {
      b.classList.toggle('sel', +b.dataset.bet === this.slot.bet);
      b.disabled = +b.dataset.bet > G.club.balance(G.localId);
    });
  }

  drawSlot(t, anim = null) {
    const c = this.slotCanvas.getContext('2d');
    const W = c.canvas.width, Hh = c.canvas.height;
    const g = c.createLinearGradient(0, 0, 0, Hh);
    g.addColorStop(0, '#1a0410'); g.addColorStop(1, '#3a0a14');
    c.fillStyle = g; c.fillRect(0, 0, W, Hh);
    const rw = W / 3;
    for (let i = 0; i < 3; i++) {
      c.fillStyle = '#f4efe2';
      c.fillRect(i * rw + 8, 30, rw - 16, Hh - 80);
      const stop = anim ? SPIN_TIME * (0.45 + i * 0.25) : 0;
      const spinning = anim && t < stop;
      let idx = this.slot.reels[i];
      let off = 0;
      if (spinning) { const v = t * 22 + i * 3; idx = Math.floor(v) % SYMBOLS.length; off = (v % 1) * 60; }
      c.save();
      c.beginPath(); c.rect(i * rw + 8, 30, rw - 16, Hh - 80); c.clip();
      for (let k = -1; k <= 1; k++) drawSymbol(c, SYMBOLS[(idx + k + SYMBOLS.length) % SYMBOLS.length], i * rw + rw / 2, 30 + (Hh - 80) / 2 + k * 60 + off - (spinning ? 30 : 0), k === 0 && !spinning ? 1 : 0.55);
      c.restore();
    }
    c.strokeStyle = '#ff3030'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(4, 30 + (Hh - 80) / 2); c.lineTo(W - 4, 30 + (Hh - 80) / 2); c.stroke();
    c.font = 'bold 22px "VT323", monospace'; c.textAlign = 'center';
    c.fillStyle = '#ffd040';
    c.fillText('LUCKY HOUSE SLOTS', W / 2, 22);
    const done = anim && t >= SPIN_TIME;
    if (done && anim.win > 0) {
      const flash = Math.floor(t * 6) % 2;
      c.fillStyle = flash ? '#40ff60' : '#ffff40';
      c.font = 'bold 34px "VT323", monospace';
      c.fillText(`WIN $${anim.win}!`, W / 2, Hh - 14);
    } else if (done) { c.fillStyle = '#ff6060'; c.font = 'bold 28px "VT323", monospace'; c.fillText('NO WIN', W / 2, Hh - 16); } else { c.fillStyle = '#ffd040'; c.font = '24px "VT323", monospace'; c.fillText(anim ? `BET $${anim.bet}` : 'PRESS E TO PLAY', W / 2, Hh - 16); }
    this.slotTex.needsUpdate = true;
  }

  // ======================================================================= per frame
  update(dt) {
    const G = this.game;
    const cp = G.camera.position;
    // --- TV room: play only when someone local is near enough to see or hear it
    const tvd = cp.distanceTo(TV_CENTER);
    const wantTV = tvd < 16 && cp.y < -1 && !!this.tvVideo.src && !this.tvError;
    if (wantTV) {
      const v = this.tvVideo;
      if (v.paused) { v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
      // everyone sees the same frame: the round clock decides the playback position
      if (v.duration > 0) {
        const want = ((G.net.serverNow() - (G.startAt || 0)) / 1000) % v.duration;
        if (Math.abs(v.currentTime - want) > 0.6) { try { v.currentTime = want; } catch { /* not seekable yet */ } }
      }
      // one audio source, volume by distance (it would be ten tracks otherwise)
      v.volume = Math.max(0, Math.min(1, (1 - tvd / 14) * settings.master * settings.sfx));
      if (this.tvScreens[0].material !== this.tvScreenMat) this.tvScreens.forEach(s => { s.material = this.tvScreenMat; });
      this.tvLight.intensity = 2.5 + Math.random() * 1.2;
    } else if (!this.tvVideo.paused) {
      this.tvVideo.pause();
      this.tvScreens.forEach(s => { s.material = this.tvDark; });
      this.tvLight.intensity = 0;
    }
    // --- storage bulb flickers
    if (Math.abs(cp.y - BY) < 3 && cp.distanceTo(this.storageLight.position) < 12) {
      const on = Math.random() > (Math.random() < 0.08 ? 0.9 : 0.15);
      this.storageLight.intensity = on ? 4 + Math.random() * 2 : 0.1;
      this.bulb.visible = on;
    }
    // --- cage door swings
    const cageTo = this.cageClosed ? 0 : -1.7;
    this.cageDoor.rotation.y += (cageTo - this.cageDoor.rotation.y) * Math.min(1, dt * 4);
    // --- fridge
    this.fridgeOpen += (this.fridgeTarget - this.fridgeOpen) * Math.min(1, dt * 3);
    this.fridgePivot.rotation.y = this.fridgeOpen * 1.6;
    this.fridgeLight.intensity = this.fridgeOpen * 3;
    // --- Ajan's snack and his dance
    const aj = G.monsters.get('ajan');
    const st = aj?.vis.st;
    const eating = st === 'eatsit' || (st === 'fridge' && (aj.vis.mt || 0) > 1.5);
    this.dollma.visible = !!eating && aj.avatar.group.visible;
    if (this.dollma.visible) {
      aj.avatar.group.updateMatrixWorld(true);
      const hand = aj.avatar.hand('R');
      if (st === 'eatsit') hand.lerp(aj.avatar.mouth(), 0.5 + Math.sin(G.time * 2.2) * 0.35);
      this.dollma.position.copy(hand);
    }
    if (st === 'eatsit' && !this.eatSound) this.eatSound = audio.play('eat', { pos: SNACK_CHAIR.seat.clone().add(V(0, 1.4, 0)), loop: true, vol: 1, ref: 2.5 });
    else if (st !== 'eatsit' && this.eatSound) { this.eatSound.stop(0.4); this.eatSound = null; }
    if (st === 'dance' && !this.danceSound) this.danceSound = audio.play('song1', { pos: MUSIC_SPOT.clone().add(V(0, 1.5, 0)), loop: true, vol: 0.9, ref: 3, rolloff: 1.4 });
    else if (st !== 'dance' && this.danceSound) { this.danceSound.stop(1); this.danceSound = null; }
    // --- slot machine screen
    const s = this.slot;
    if (s.anim) {
      s.anim.t += dt;
      const nearSlot = cp.distanceTo(SLOT_POS) < 12;
      if (nearSlot) this.drawSlot(s.anim.t, s.anim);
      const stopAt = [0.45, 0.7, 0.95].map(k => SPIN_TIME * k);
      s.anim.stops = s.anim.stops || 0;
      while (s.anim.stops < 3 && s.anim.t >= stopAt[s.anim.stops]) { s.anim.stops++; if (nearSlot) audio.play('clunk', { pos: SLOT_POS.clone().add(V(0, 1, 0)), vol: 0.5, rate: 1.6 }); }
      if (s.anim.t >= SPIN_TIME && !s.anim.paid) {
        s.anim.paid = true;
        if (nearSlot && s.anim.win > 0) { for (let i = 0; i < Math.min(12, 3 + s.anim.win / s.anim.bet); i++) audio.play('pickup', { pos: SLOT_POS.clone().add(V(0, 0.6, 0)), vol: 0.5, rate: 1.4 + Math.random() * 0.6, delay: i * 0.07 }); }
        if (s.anim.pid === G.localId) { $('slMsg').textContent = s.anim.win > 0 ? `YOU WIN $${s.anim.win}!` : 'NO LUCK. AGAIN?'; this.refreshSlotUI(); }
      }
      this.slotLight.intensity = s.anim.t >= SPIN_TIME && s.anim.win > 0 ? 2 + Math.sin(s.anim.t * 20) * 1.5 : 2;
      if (s.anim.t > SPIN_TIME + 2.5) { s.anim = null; if (nearSlot) this.drawSlot(0); }
    }
    // --- HUD: lives, coming back
    const me = G.me;
    const left = G.livesLeft?.(G.localId);
    this.ui.lives.textContent = G.freePlay || left === undefined ? '' : `LIVES ${'♥'.repeat(Math.max(0, left + (G.localDead ? 0 : 1)))}`;
    if (this.koUntil && me) {
      const sec = Math.max(0, Math.ceil((this.koUntil - G.net.serverNow()) / 1000));
      this.ui.back.querySelector('.cbNum').textContent = sec;
    }
  }

  showComingBack(eta, by) {
    this.koUntil = eta;
    this.ui.back.classList.add('show');
    this.ui.back.querySelector('.cbSub').textContent = `${by} is dragging you away. You can't do anything.`;
  }
  hideComingBack() { this.koUntil = null; this.ui.back.classList.remove('show'); }

  prompt(it) {
    if (it.kind === 'slot') return this.slot.user && this.slot.user !== this.game.localId ? '<span class="dim">SOMEONE IS PLAYING</span>' : `E — PLAY SLOTS  <span class="dim">$${this.game.club.balance(this.game.localId)}</span>`;
    return null;
  }

  dispose() {
    removeEventListener('keydown', this.onKey, true);
    this.tvVideo.pause();
    this.tvVideo.removeAttribute('src');
    this.tvVideo.load();
    this.eatSound?.stop(); this.danceSound?.stop();
    $('slotUI')?.classList.remove('show');
    ['livesHud', 'comingBack', 'struggle'].forEach(id => $(id)?.classList.remove('show'));
  }
}

/** Scale a loaded model so its largest side is `size` metres, centred on its base. */
function fitModel(src, size) {
  if (!src) return null;
  const m = src.clone();
  const box = new THREE.Box3().setFromObject(m), s = box.getSize(V()), c = box.getCenter(V());
  const k = size / Math.max(s.x, s.y, s.z, 1e-3);
  const g = new THREE.Group();
  m.position.set(-c.x, -c.y, -c.z);
  g.add(m);
  g.scale.setScalar(k);
  return g;
}

function drawSymbol(c, s, x, y, a) {
  c.save();
  c.globalAlpha = a;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (s === '7') { c.font = 'bold 52px Georgia, serif'; c.fillStyle = '#d01010'; c.strokeStyle = '#600'; c.lineWidth = 2; c.fillText('7', x, y); c.strokeText('7', x, y); }
  else if (s === 'BAR') { c.fillStyle = '#111'; c.fillRect(x - 40, y - 15, 80, 30); c.fillStyle = '#fff'; c.font = 'bold 24px Arial'; c.fillText('BAR', x, y + 1); }
  else if (s === 'CHERRY') { c.fillStyle = '#c0102a'; for (const dx of [-12, 12]) { c.beginPath(); c.arc(x + dx, y + 10, 13, 0, 7); c.fill(); } c.strokeStyle = '#2a6a1a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 12, y); c.quadraticCurveTo(x, y - 30, x + 6, y - 22); c.moveTo(x + 12, y); c.quadraticCurveTo(x + 8, y - 20, x + 6, y - 22); c.stroke(); }
  else if (s === 'BELL') { c.fillStyle = '#e8b820'; c.beginPath(); c.moveTo(x - 22, y + 14); c.quadraticCurveTo(x - 20, y - 22, x, y - 22); c.quadraticCurveTo(x + 20, y - 22, x + 22, y + 14); c.closePath(); c.fill(); c.beginPath(); c.arc(x, y + 17, 5, 0, 7); c.fill(); }
  else if (s === 'CLOVER') { c.fillStyle = '#1e9a30'; for (const [dx, dy] of [[0, -11], [11, 0], [0, 11], [-11, 0]]) { c.beginPath(); c.arc(x + dx, y + dy, 10, 0, 7); c.fill(); } c.strokeStyle = '#1e7a20'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8, y + 24); c.stroke(); }
  c.restore();
}

