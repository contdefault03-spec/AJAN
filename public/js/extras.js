// Gameplay additions that sit on top of the house: the capture rooms players wake up
// in after being knocked out (TV room, cage, operating table, chair, car trunk), the two
// one-use poison sprays, the fridge Ajan raids for his dollma, his music-room dance and
// the bar's slot machine. Shared state is decided by the host and sent as events.
import * as THREE from 'three';
import { audio } from './audio.js';
import { loadGLTF, assetUrl } from './assets.js';
import { settings } from './settings.js';
import { FRIDGE, MUSIC_SPOT } from './ajan.js';
import { lineOfSight } from './physics.js';
import { SlotMachine } from './slots.js';
import { Garden } from './garden.js';
import { Security } from './security.js';
import { Passages } from './passages.js';
import { Skinwalker } from './skinwalker.js';
import { Camcorder } from './camcorder.js';
import { Shed } from './shed.js';
import { Arcade } from './arcade.js';
import { hangGuitars } from './guitars.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BY = -3.2, U = 3.4, AY = 6.8;
const $ = id => document.getElementById(id);

// Where knocked-out players wake up. `drop` is where the monster leaves the body,
// `pos`/`ry` where (and facing which way) the player comes to.
export const CAPTURE_SPOTS = [
  // the TV room on top of the east-wing tower: carried up the spiral stair, tied to a chair
  { id: 'tv', name: 'THE TV ROOM', pos: V(52.5, AY, 12.3), drop: V(50.6, U, 10.0), yaw: Math.PI, presses: 26 },
  { id: 'cage', name: 'THE CAGE', pos: V(41.7, U, 1.7), drop: V(44.3, U, 2.6), yaw: -Math.PI / 2, presses: 20, cage: true },
  { id: 'table', name: 'THE OPERATING ROOM', pos: V(48.5, U, 2.9), drop: V(48.5, U, 4.1), yaw: 0, presses: 30 },
  { id: 'chair', name: 'THE CHAIR', pos: V(53.5, U, 2.2), drop: V(53.5, U, 4.1), yaw: 0, presses: 24 },
  // the trunk of the car in the garage (only while the car is still parked there)
  { id: 'trunk', name: 'THE TRUNK OF THE CAR', pos: V(32.35, BY, 21.0), drop: V(31.7, BY, 21.0), yaw: -Math.PI / 2, presses: 22, trunk: true },
];
const TV_ROOM = { x0: 49, x1: 56, z0: 7, z1: 14, y: AY };
const inTVRoom = p => p.x > TV_ROOM.x0 && p.x < TV_ROOM.x1 && p.z > TV_ROOM.z0 && p.z < TV_ROOM.z1 && p.y > AY - 0.4;

const SPRAY_SPOTS = [[25.2, 0.98, 11.42], [15.0, U, 16.0]]; // kitchen counter (ground floor) · library floor (upstairs)
const SPRAY_RANGE = 3.6;
const STUN_SPRAY = 60;

// The bar's slot machine (slots.js)
const SLOT_POS = V(16.9, AY, 12.2);
const SLOT_RY = -Math.PI / 2;

export class Extras {
  constructor(game) {
    this.game = game;
    this.house = game.house;
    this.restrained = null; // local struggle state
    this.lastSpot = new Map(); // host: pid -> last capture spot id
    this.koUntil = null;
  }

  async init() {
    const G = this.game, H = this.house, scene = G.scene;
    const colliderStart = H.colliders.length;
    this.group = new THREE.Group();
    H.group.add(this.group);
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; this.group.add(b); return b; };

    // ---------------------------------------------------------- the TV room (top of the tower)
    // Sixteen old sets of different sizes stacked along the walls round a bolted-down
    // chair, all showing the same tv.mp4 from one shared <video> (one decoder, one sound,
    // heard only inside the room).
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
    this.tvScreenMat = new THREE.MeshBasicMaterial({ map: vt, toneMapped: false });
    this.tvDark = new THREE.MeshBasicMaterial({ color: 0x050505 });
    this.tvScreens = [];
    const tv = (x, y, z, w, ry) => {
      const h2 = w * 0.75;
      const g = new THREE.Group();
      g.position.set(x, y + h2 / 2, z);
      g.rotation.y = ry;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h2 + 0.08, w * 0.6), casing);
      body.position.z = -w * 0.3;
      body.castShadow = true;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h2), this.tvDark);
      scr.position.z = 0.002;
      g.add(body, scr);
      this.group.add(g);
      this.tvScreens.push(scr);
      return y + h2 + 0.08;
    };
    // one more on the north balcony, on a cabinet against the house wall (heard only out there)
    box(1.2, 0.6, 0.45, casing, 20.9, AY + 0.3, -0.3);
    tv(20.9, AY + 0.6, -0.52, 1.0, Math.PI);
    // south wall (z 14) — the chair faces it — in stacks on low cabinets
    const sz = 13.65;
    for (const [x, sizes] of [[50.0, [0.7, 0.5, 0.4]], [51.1, [0.9, 0.6]], [52.5, [1.1, 0.7]], [53.9, [0.8, 0.55, 0.4]], [55.2, [0.6, 0.7]]]) {
      let y = AY + 0.35;
      box(1.0, 0.35, 0.5, casing, x, AY + 0.175, sz - 0.05);
      for (const w of sizes) y = tv(x, y, sz, w, Math.PI);
    }
    // a few on the east wall, angled toward the chair, and two on the floor
    for (const [z, w, y] of [[12.6, 0.6, AY + 0.6], [11.9, 0.45, AY + 1.25]]) tv(55.7, y, z, w, -Math.PI / 2 - 0.4);
    tv(51.6, AY, 13.0, 0.45, Math.PI - 0.5);
    tv(53.6, AY, 13.1, 0.4, Math.PI + 0.4);
    this.tvLight = new THREE.PointLight(0x9fb6ff, 0, 7, 1.4);
    this.tvLight.position.set(52.5, AY + 1.4, 13.0);
    this.group.add(this.tvLight);
    // the chair they wake up strapped to
    const chairM = mat(0x3a2a1a);
    const chair = (x, y, z, ry) => {
      const g = new THREE.Group();
      g.position.set(x, y, z); g.rotation.y = ry;
      const b = (w, hh, d, px, py, pz, m = chairM) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); };
      b(0.55, 0.06, 0.55, 0, 0.48, 0); b(0.55, 0.7, 0.06, 0, 0.85, -0.27);
      for (const [dx, dz] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) b(0.05, 0.48, 0.05, dx, 0.24, dz);
      for (const dx of [-0.24, 0.24]) b(0.08, 0.04, 0.3, dx, 0.66, 0, mat(0x111111, { roughness: 0.9 }));
      this.group.add(g);
    };
    const tvSpot = CAPTURE_SPOTS[0];
    chair(tvSpot.pos.x, AY, tvSpot.pos.z - 0.25, 0);
    const strapM = mat(0x111111, { roughness: 0.9 });

    // ---------------------------------------------------------- the cage room
    const bars = mat(0x3b3631, { metalness: 0.7, roughness: 0.45 });
    const cx0 = 40.6, cx1 = 42.8, cz0 = 0.6, cz1 = 2.8, ch = 2.0, cw = cz1 - cz0;
    const bar = (x, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ch, 6), bars); m.position.set(x, U + ch / 2, z); this.group.add(m); return m; };
    for (let t = 0; t <= 1.001; t += 0.1) { bar(cx0 + t * (cx1 - cx0), cz0); bar(cx0 + t * (cx1 - cx0), cz1); bar(cx0, cz0 + t * cw); }
    box(cx1 - cx0 + 0.05, 0.05, cw + 0.05, bars, (cx0 + cx1) / 2, U + ch, (cz0 + cz1) / 2);
    box(1.9, 0.14, 1.0, mat(0x6a5a48, { roughness: 1 }), (cx0 + cx1) / 2 - 0.05, U + 0.07, cz0 + 0.65); // filthy mattress
    this.cageDoor = new THREE.Group();
    this.cageDoor.position.set(cx1, U, cz0);
    for (let t = 0; t <= 1.001; t += 0.1) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, ch, 6), bars); m.position.set(0, ch / 2, t * cw); this.cageDoor.add(m); }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.06), mat(0x9a8040, { metalness: 0.8 }));
    lock.position.set(0, 1.0, cw - 0.05);
    this.cageDoor.add(lock);
    this.group.add(this.cageDoor);
    const col = (x0, z0, x1, z1, y0, y1) => H.collider(x0, z0, x1, z1, y0, y1, { occlude: false });
    col(cx0 - 0.03, cz0 - 0.03, cx1 + 0.03, cz0 + 0.03, U, U + ch);
    col(cx0 - 0.03, cz1 - 0.03, cx1 + 0.03, cz1 + 0.03, U, U + ch);
    col(cx0 - 0.03, cz0, cx0 + 0.03, cz1, U, U + ch);
    this.cageDoorCol = col(cx1 - 0.03, cz0, cx1 + 0.03, cz1, U, U + ch);
    this.setCage(true, true);
    // chains and a bucket in the corner
    for (const x of [44.8, 45.4]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 4), metal); m.position.set(x, U + 2.1, 0.3); this.group.add(m); }

    // ---------------------------------------------------------- the operating room: restraint table
    const t = V(48.5, U, 1.6);
    box(2.0, 0.08, 0.8, mat(0x8a8a8a, { metalness: 0.5, roughness: 0.35 }), t.x, U + 0.82, t.z);
    for (const [dx, dz] of [[-0.9, -0.33], [0.9, -0.33], [-0.9, 0.33], [0.9, 0.33]]) box(0.05, 0.82, 0.05, metal, t.x + dx, U + 0.41, t.z + dz);
    for (const dx of [-0.6, 0, 0.6]) box(0.08, 0.03, 0.85, strapM, t.x + dx, U + 0.875, t.z);
    col(t.x - 1.0, t.z - 0.4, t.x + 1.0, t.z + 0.4, U, U + 0.86);
    box(0.6, 0.9, 0.45, metal, 50.4, U + 0.45, 0.4); // instrument trolley
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.15, 16, 1, true), metal);
    lamp.position.set(t.x, U + 2.4, t.z);
    this.group.add(lamp);

    // ---------------------------------------------------------- the chair room: one chair under a bare bulb
    const cs = CAPTURE_SPOTS[3];
    chair(cs.pos.x, U, cs.pos.z - 0.6, 0);
    tv(cs.pos.x, U + 0.9, 0.25, 0.8, 0); // a single set on a shelf in front of you
    box(1.0, 0.06, 0.4, casing, cs.pos.x, U + 0.87, 0.3);
    this.storageLight = new THREE.PointLight(0xffd8a0, 0, 6, 1.6);
    this.storageLight.position.set(cs.pos.x, U + 2.4, cs.pos.z - 0.6);
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
    this.slots = [new SlotMachine(G, 'slot_club', SLOT_POS, SLOT_RY)];
    for (const m of this.slots) await m.init();
    this.garden = new Garden(G);
    this.garden.init();
    this.security = new Security(G);
    this.security.init();
    this.passages = new Passages(G);
    this.passages.init();
    this.skin = new Skinwalker(G);
    this.cam = new Camcorder(G);
    await this.cam.init();
    this.shed = new Shed(G);
    await this.shed.init();
    await hangGuitars(G);
    this.arcade = new Arcade(G);
    // Include every late obstacle (garden, capture rooms, security office and shed).
    H.buildNav(H.colliders.slice(colliderStart));
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
  }

  // ======================================================================= host
  /** Host: where should this knocked-out player wake up? (never the same room twice in a row) */
  pickSpot(pid) {
    const last = this.lastSpot.get(pid);
    const pool = CAPTURE_SPOTS.filter(s => s.id !== last && (!s.trunk || this.game.car?.state === 'parked'));
    const s = pool[Math.floor(this.game.rnd() * pool.length)];
    this.lastSpot.set(pid, s.id);
    return s;
  }

  /** Host: requests this module owns. Returns true if handled. */
  request(pid, r, p) {
    const G = this.game;
    if (this.arcade.request(pid, r, p) || this.garden.request(pid, r, p) || this.security.request(pid, r, p) || this.passages.request(pid, r, p) || this.shed.request(pid, r, p)) return true;
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
      case 'slot': {
        const m = this.slots.find(x => x.id === r.m);
        if (m) m.hostSpin(pid, r.bet);
        return true;
      }
    }
    return false;
  }

  // ======================================================================= events
  event(e) {
    const G = this.game;
    if (this.arcade.event(e) || this.garden.event(e) || this.security.event(e) || this.passages.event(e) || this.skin.event(e) || this.shed.event(e)) return true;
    switch (e.k) {
      case 'freed': {
        const fp = G.players.get(e.pid);
        if (fp) fp.restrained = false;
        if (e.spot === 'cage') this.setCage(false);
        if (e.spot === 'trunk') { audio.play('slam', { pos: V(33, BY + 1, 21), vol: 1, ref: 3, rate: 0.7 }); audio.play('creak', { pos: V(33, BY + 1, 21), vol: 0.8, ref: 3 }); }
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
      case 'slotres': this.slots.find(x => x.id === e.m)?.applyResult(e); return true;
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
    this.ui.struggle.querySelector('.stTitle').textContent = spot.cage ? 'LOCKED IN A CAGE' : spot.trunk ? 'LOCKED IN THE TRUNK' : 'YOU ARE TIED UP';
    this.ui.struggle.querySelector('.stSub').textContent = spot.cage ? 'MASH [E] TO FORCE THE LOCK' : spot.trunk ? 'MASH [E] TO BANG THE LID OPEN' : 'MASH [E] TO BREAK FREE';
    this.game.dizzy = Math.max(this.game.dizzy || 0, 0.8);
  }
  press() {
    const r = this.restrained;
    if (!r || r.sent) return;
    r.k += 1;
    if (r.spot.trunk) { audio.play('thud', { vol: 0.9, rate: 0.8 + Math.random() * 0.3 }); this.game.post?.glitch(0.15); }
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

  // ======================================================================= per frame
  update(dt) {
    const G = this.game;
    const cp = G.camera.position;
    // --- TV room: the video runs while you're in the TV room or the chair room (one decoder);
    // its sound is only heard inside the TV room
    const inTV = inTVRoom(cp);
    const inChair = cp.x > 51 && cp.x < 56 && cp.z > 0 && cp.z < 5 && Math.abs(cp.y - U - 1.4) < 1.6;
    const inBalc = cp.x > 12 && cp.x < 26 && cp.z > -2.4 && cp.z < 0.2 && cp.y > AY - 0.4;
    const wantTV = (inTV || inChair || inBalc) && !!this.tvVideo.src && !this.tvError;
    if (wantTV) {
      const v = this.tvVideo;
      if (v.paused) { v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
      // everyone sees the same frame: the round clock decides the playback position
      if (v.duration > 0) {
        const want = ((G.net.serverNow() - (G.startAt || 0)) / 1000) % v.duration;
        if (Math.abs(v.currentTime - want) > 0.6) { try { v.currentTime = want; } catch { /* not seekable yet */ } }
      }
      v.volume = inTV || inBalc ? Math.min(1, settings.master * settings.sfx) : 0;
      if (this.tvScreens[0].material !== this.tvScreenMat) this.tvScreens.forEach(s => { s.material = this.tvScreenMat; });
      this.tvLight.intensity = inTV ? 2.5 + Math.random() * 1.2 : 0;
    } else if (!this.tvVideo.paused) {
      this.tvVideo.pause();
      this.tvScreens.forEach(s => { s.material = this.tvDark; });
      this.tvLight.intensity = 0;
    }
    // --- locked in the trunk: you see the inside of the lid in the dark, and it shakes when you bang
    if (this.restrained?.spot.trunk) {
      const cam = G.camera;
      cam.position.set(33.55 + (Math.random() - 0.5) * 0.01 * Math.min(1, this.restrained.k), BY + 0.72, 21.0);
      cam.lookAt(32.9, BY + 1.05, 21.0 + Math.sin(G.time * 0.7) * 0.15);
      G.local.hands.visible = false;
      G.local.light.intensity = 0;
    }
    // --- the chair room's bulb flickers
    if (cp.distanceTo(this.storageLight.position) < 12) {
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
    this.updateEatingAudio(aj);
    if (st === 'dance' && !this.danceSound) this.danceSound = audio.play('song1', { pos: MUSIC_SPOT.clone().add(V(0, 1.5, 0)), loop: true, vol: 0.9, ref: 3, rolloff: 1.4 });
    else if (st !== 'dance' && this.danceSound) { this.danceSound.stop(1); this.danceSound = null; }
    for (const m of this.slots) m.update(dt);
    this.garden.update(dt);
    this.security.update(dt);
    this.passages.update(dt);
    this.skin.hostTick();
    this.skin.update(dt);
    this.cam.update(dt);
    this.shed.update(dt);
    this.arcade.update(dt);
    if (G.isHost) this.shed.hostUpdate();
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
    if (it.kind === 'slotbtn') return it.machine.prompt(it.btn);
    return this.arcade.prompt(it) ?? this.garden.prompt(it) ?? this.security.prompt(it) ?? this.passages.prompt(it) ?? this.shed.prompt(it);
  }

  /** E on one of this module's interactables. */
  interact(it) {
    return this.arcade.interact(it) || this.garden.interact(it) || this.security.interact(it) || this.passages.interact(it) || this.shed.interact(it);
  }

  // Replicated monster state drives the same positional loop on host and guests.
  updateEatingAudio(aj) {
    const eating = aj?.vis.st === 'eatsit' || aj?.vis.st === 'butcher';
    if (eating) {
      const pos = aj.vis.pos.clone().add(V(0, 1.4, 0));
      if (!this.eatSound) this.eatSound = audio.play('eat', { pos, loop: true, vol: 1.5, ref: 2.5, limit: true });
      else this.eatSound.setPos(pos);
    } else if (this.eatSound) { this.eatSound.stop(0.4); this.eatSound = null; }
  }

  dispose() {
    this.arcade?.dispose();
    this.security?.dispose();
    this.passages?.dispose();
    this.skin?.dispose();
    this.cam?.dispose();
    this.shed?.dispose();
    this.tvVideo.pause();
    this.tvVideo.removeAttribute('src');
    this.tvVideo.load();
    this.eatSound?.stop(); this.danceSound?.stop();
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

