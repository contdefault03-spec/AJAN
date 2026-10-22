// The alley and the shed.
//  Alley: down the west side of the house behind a fence (in from the garden). Junk, a
//  hose, bins, and the DEALER leaning on the wall smoking. E: buy 4 mushrooms (€20),
//  4 bags of flour (€30) or 4 joints (€25).
//  Shed: locked (the SHED KEY is somewhere in the house). Hotboxed, couches, posters,
//  music5.mp3 on a low loop (only inside), two NPCs at their own table, a second slot
//  machine and a boxing machine (€1 a punch, score up to 1000).
//  The free table: put what you bought on it and everyone can take one at a time.
//  Joints and mushrooms: pick up, then left click. Flour: E on a line on the table.
//  A high lasts 2 minutes (or until the next one). Nobody can kill you while you're high.
//  Now and then Ajan wanders in too, sits down for a smoke, then goes to bed.
import * as THREE from 'three';
import { audio } from './audio.js';
import { Avatar } from './avatar.js';
import { playerSpec } from './assets.js';
import { SlotMachine } from './slots.js';
import { INV_SLOTS, itemSlots, ITEM_INFO } from './config.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const SHED = { x0: 26, x1: 37, z0: -13.2, z1: -7 };
export const inShed = p => p.x > SHED.x0 && p.x < SHED.x1 && p.z > SHED.z0 && p.z < SHED.z1 && p.y < 2.5;
const DEALER = V(-0.42, 0, 9.0);
const MENU = { bag_mushrooms: { price: 20, label: '4 MUSHROOMS' }, bag_flour: { price: 30, label: '4 BAGS OF FLOUR' }, bag_weed: { price: 25, label: '4 JOINTS' } };
const TABLE = { x: 28.7, z: -10.7, y: 0.46 };
const SLOTS = []; // 12 spots on the free table, never stacked
for (let i = 0; i < 12; i++) SLOTS.push(V(TABLE.x - 0.66 + (i % 6) * 0.26, TABLE.y, TABLE.z - 0.22 + Math.floor(i / 6) * 0.44));
const KEY_SPOTS = [[3.2, 0.8, 1.3], [14.0, 3.4, 15.0], [44.6, 0, 8.6], [21.3, 0.76, 15.8], [9.1, 3.4, 6.6], [33.5, -3.2, 25.4]];
export const SEAT = { front: V(28.6, 0, -11.9), seat: V(28.6, 0, -12.6), ry: 0 }; // Ajan's spot on the back couch
const HIGH = 120;

export class Shed {
  constructor(game) {
    this.game = game;
    this.table = new Map(); // slot index -> { id, kind }
    this.effect = null;     // local: { kind, until, t }
    this.seq = 0;
    this.box = { score: 0, best: 0, swing: 0, by: null };
  }

  async init() {
    const G = this.game, H = G.house;
    const g = this.group = new THREE.Group();
    H.group.add(g);
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
    const box = (w, h, d, m, x, y, z, ry = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
    const wood = mat(0x3a2a1c), metal = mat(0x4a4e52, { metalness: 0.6, roughness: 0.5 });
    // ---------------------------------------------------------- the alley
    const gravel = new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1 });
    for (const [x0, x1, z0, z1] of [[-3.2, 2, -14, 0], [-3.2, 0, 0, 21]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), gravel);
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.003, (z0 + z1) / 2); m.receiveShadow = true; g.add(m);
      m.material.map.repeat.set((x1 - x0) / 2, (z1 - z0) / 2);
    }
    for (let z = -14; z <= 21; z += 0.5) box(0.08, 1.0, 0.08, wood, -3.2, 1.7, z); // pickets on the wall
    box(0.05, 0.08, 35, wood, -3.2, 1.95, 3.5);
    // bins, crates, a coiled hose, a broken bike
    for (const [x, z] of [[-2.6, 2.0], [-2.6, 2.8]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.9, 14), mat(0x1e2a1e, { metalness: 0.3 })); b.position.set(x, 0.45, z); g.add(b); H.collider(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, 0.9, { furniture: true }); }
    for (const [x, z] of [[-2.5, 14.0], [-2.4, 14.7]]) { box(0.6, 0.45, 0.6, wood, x, 0.225, z); H.collider(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, 0.45, { furniture: true }); }
    const hose = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 22), mat(0x2a6a2a)); hose.rotation.x = Math.PI / 2; hose.position.set(-0.5, 0.04, 5.0); g.add(hose);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 18), metal); wheel.position.set(-2.9, 0.3, 18.0); wheel.rotation.y = 0.3; g.add(wheel);
    const alleyLamp = new THREE.PointLight(0xffb070, 4, 9, 1.5); alleyLamp.position.set(-0.4, 2.6, 9.0); g.add(alleyLamp);
    box(0.25, 0.25, 0.12, mat(0xffd8a0, { emissive: 0x805020 }), -0.12, 2.6, 9.0);
    // ---------------------------------------------------------- the dealer
    this.dealer = this.makeNPC(DEALER, -Math.PI / 2, false);
    const dpick = H.pickBox(DEALER.x - 0.4, 0.2, DEALER.z - 0.4, DEALER.x + 0.4, 1.9, DEALER.z + 0.4);
    H.register('dealer', 'dealer', [dpick], DEALER.clone().add(V(0, 1.4, 0)));
    H.collider(DEALER.x - 0.3, DEALER.z - 0.3, DEALER.x + 0.3, DEALER.z + 0.3, 0, 1.8);
    this.label = document.createElement('div');
    this.label.className = 'nameLabel dealerLabel';
    this.label.innerHTML = '<span class="nm">DEALER</span>';
    document.getElementById('labels')?.appendChild(this.label);
    this.buildMenu();
    // ---------------------------------------------------------- the shed
    // roof, a dim warm bulb, couches, the free table, the NPCs' table, posters
    G_plane(H, 26, -13.2, 37, -7, 3.02);
    // its own plank floor, just above the garden's lawn (which runs underneath)
    const flg = new THREE.PlaneGeometry(11, 6.2), uv = flg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5.5, uv.getY(i) * 3.1);
    const fl = new THREE.Mesh(flg, H.M.floorWoodDark);
    fl.rotation.x = -Math.PI / 2; fl.position.set(31.5, 0.012, -10.1); fl.receiveShadow = true;
    g.add(fl);
    this.shedLight = new THREE.PointLight(0xffa060, 5, 12, 1.4);
    this.shedLight.position.set(31.5, 2.6, -10.2);
    g.add(this.shedLight);
    const couch = mat(0x5a2a3a), cushion = mat(0x6a3a4a);
    const sofa = (x0, z0, x1, z1, backSide) => {
      box(x1 - x0, 0.42, z1 - z0, couch, (x0 + x1) / 2, 0.21, (z0 + z1) / 2);
      H.collider(x0, z0, x1, z1, 0, 0.45, { furniture: true });
      const w = x1 - x0, d = z1 - z0;
      if (backSide === 'z-') box(w, 0.5, 0.2, cushion, (x0 + x1) / 2, 0.67, z0 + 0.1);
      else box(0.2, 0.5, d, cushion, x0 + 0.1, 0.67, (z0 + z1) / 2);
    };
    sofa(26.6, -13.1, 30.6, -12.2, 'z-');
    sofa(26.1, -11.8, 26.9, -8.0, 'x-');
    box(1.8, 0.06, 0.9, wood, TABLE.x, 0.43, TABLE.z);
    for (const [dx, dz] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) box(0.05, 0.4, 0.05, wood, TABLE.x + dx, 0.2, TABLE.z + dz);
    H.collider(TABLE.x - 0.9, TABLE.z - 0.45, TABLE.x + 0.9, TABLE.z + 0.45, 0, 0.46, { furniture: true });
    const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.03, 14), mat(0x777777, { metalness: 0.7 })); ash.position.set(TABLE.x + 0.75, 0.475, TABLE.z + 0.3); g.add(ash);
    const tpick = H.pickBox(TABLE.x - 0.9, 0.3, TABLE.z - 0.45, TABLE.x + 0.9, 0.62, TABLE.z + 0.45);
    H.register('shedtable', 'shedtable', [tpick], V(TABLE.x, 0.6, TABLE.z));
    // the NPCs' table with two smokers
    box(1.2, 0.06, 0.8, wood, 33.0, 0.72, -11.0);
    box(0.1, 0.7, 0.1, wood, 33.0, 0.35, -11.0);
    H.collider(32.4, -11.4, 33.6, -10.6, 0, 0.75, { furniture: true });
    this.npcs = [this.makeNPC(V(32.0, 0, -11.0), Math.PI / 2, true), this.makeNPC(V(34.0, 0, -11.0), -Math.PI / 2, true)];
    for (const n of this.npcs) H.collider(n.pos.x - 0.3, n.pos.z - 0.3, n.pos.x + 0.3, n.pos.z + 0.3, 0, 1.4, { furniture: true });
    // posters
    for (const [x, z, ry, k] of [[29.0, -13.08, 0, 0], [33.5, -13.08, 0, 1], [26.12, -9.5, Math.PI / 2, 2], [36.88, -10.0, -Math.PI / 2, 3]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), new THREE.MeshStandardMaterial({ map: posterTexture(k), roughness: 0.9 }));
      p.position.set(x, 1.6, z); p.rotation.y = ry; g.add(p);
    }
    // the smoke: big soft sprites drifting near the ceiling
    this.haze = [];
    const hazeTex = smokeTexture();
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, transparent: true, opacity: 0.22, depthWrite: false, color: 0xd0d8d0 }));
      s.position.set(26.5 + Math.random() * 10, 1.4 + Math.random() * 1.4, -12.8 + Math.random() * 5.5);
      s.scale.setScalar(2.4 + Math.random() * 2);
      s.userData.ph = Math.random() * 6;
      g.add(s); this.haze.push(s);
    }
    this.puffs = [];
    this.puffTex = hazeTex;
    // the second slot machine and the boxing machine
    this.slot = new SlotMachine(G, 'slot_shed', V(36.55, 0, -12.4), -Math.PI / 2);
    await this.slot.init();
    G.extras.slots.push(this.slot);
    this.buildBoxing(V(36.45, 0, -8.4));
    // the shed key: somewhere in the house
    const k = KEY_SPOTS[Math.floor(G.rnd() * KEY_SPOTS.length)];
    G.placeItem('shed_key', 'shed_key', { pos: k });
    this.buildBoxUI();
  }

  /** A person in random clothes: smoking, standing against the wall or sitting at a table. */
  makeNPC(pos, ry, sitting) {
    const G = this.game;
    const rc = () => '#' + new THREE.Color().setHSL(Math.random(), 0.35 + Math.random() * 0.4, 0.22 + Math.random() * 0.35).getHexString();
    const av = new Avatar('player', G.playerGLTF, { shirt: rc(), pants: rc(), spec: playerSpec() });
    av.group.position.copy(pos);
    av.group.rotation.y = ry;
    G.scene.add(av.group);
    const cig = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0xf0ece0 }));
    stick.rotation.z = Math.PI / 2;
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff5010 }));
    ember.position.x = -0.04;
    cig.add(stick, ember);
    cig.scale.setScalar(1 / av.scale);
    cig.position.set(-0.15, 0, 0.01);
    av.bones.foreR.add(cig);
    const npc = { av, pos: pos.clone(), sitting, cig, ember, t: Math.random() * 6, next: 2 + Math.random() * 4 };
    return npc;
  }

  /** Smoking: the hand comes up to the mouth, a drag, the hand goes down, smoke comes out. */
  animNPC(n, dt) {
    n.t += dt;
    const av = n.av, cyc = n.t % 7, k = 1 - Math.exp(-10 * dt);
    av.update(dt, { speed: 0, crouch: 0, mode: n.sitting ? 'sit' : 'normal', interactT: 9, turn: 0, flash: false, pitch: -0.05 });
    const up = cyc < 1.4 ? Math.min(1, cyc / 0.5) : cyc < 2.0 ? Math.max(0, 1 - (cyc - 1.4) / 0.6) : 0;
    av._set('upperR', -0.4 - up * 0.9, 0.2 + up * 0.5, 1.15 - up * 0.55, k);
    av._set('foreR', 0, 0.5 + up * 1.7, 0, k);
    if (!n.sitting) av._set('upperL', 0.1, 0, -1.25, k);
    av._set('head', -0.05 + up * 0.15, Math.sin(n.t * 0.3) * 0.2, 0, k * 0.5);
    n.ember.material.color.setHex(up > 0.8 ? 0xffa040 : 0xff5010);
    if (cyc > 2.0 && cyc < 2.1 && !n.puffed) { n.puffed = true; this.puff(av.mouth(V()), av.group.rotation.y, 6); }
    if (cyc < 1) n.puffed = false;
    if (Math.random() < dt * 0.8) this.puff(n.ember.getWorldPosition(V()), 0, 1, 0.15);
  }

  puff(at, ry, n = 4, size = 0.3) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, opacity: 0.45, depthWrite: false, color: 0xe0e0e0 }));
      s.position.copy(at);
      s.scale.setScalar(size);
      s.userData = { v: V(Math.sin(ry) * 0.25 + (Math.random() - 0.5) * 0.15, 0.25 + Math.random() * 0.2, Math.cos(ry) * 0.25 + (Math.random() - 0.5) * 0.15), life: 0 };
      this.game.scene.add(s);
      this.puffs.push(s);
    }
  }

  // ------------------------------------------------------------ the dealer's menu
  buildMenu() {
    let m = document.getElementById('dealerMenu');
    if (!m) {
      m = document.createElement('div');
      m.id = 'dealerMenu';
      m.className = 'dealerMenu vt';
      document.body.appendChild(m);
    }
    m.innerHTML = `<div class="dmTitle">"What do you want?"</div>${Object.entries(MENU).map(([k, v]) => `<button data-buy="${k}">[${Object.keys(MENU).indexOf(k) + 1}] ${v.label} — €${v.price}</button>`).join('')}<button data-buy="">NOTHING [ESC]</button><div class="dmBal"></div>`;
    m.querySelectorAll('[data-buy]').forEach(b => { b.onclick = () => { const k = b.dataset.buy; this.closeMenu(); if (k) this.game.request({ k: 'buy', what: k }); }; });
    this.onMenuKey = e => {
      if (!this.menuOpen) return;
      const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
      if (e.code === 'Escape' || n !== undefined) { e.preventDefault(); e.stopImmediatePropagation(); this.closeMenu(); }
      if (n !== undefined) this.game.request({ k: 'buy', what: Object.keys(MENU)[n] });
    };
    addEventListener('keydown', this.onMenuKey, true);
  }
  openMenu() {
    const G = this.game;
    this.menuOpen = true;
    G.drinkMenuOpen = true; // the game treats it like the bar menu (no pause when the mouse is freed)
    const m = document.getElementById('dealerMenu');
    m.querySelector('.dmBal').textContent = `You have €${G.club.balance(G.localId)}`;
    m.classList.add('show');
    try { document.exitPointerLock?.(); } catch { /* fine */ }
    audio.play('click', { vol: 0.3, rate: 0.7 });
  }
  closeMenu() {
    const G = this.game;
    if (!this.menuOpen) return;
    this.menuOpen = false;
    G.drinkMenuOpen = false;
    G.drinkMenuClosedAt = performance.now();
    document.getElementById('dealerMenu').classList.remove('show');
    G.lockPointer();
  }

  // ------------------------------------------------------------ boxing machine
  buildBoxing(pos) {
    const G = this.game, H = G.house;
    const g = new THREE.Group();
    g.position.copy(pos); g.rotation.y = -Math.PI / 2;
    const red = new THREE.MeshStandardMaterial({ color: 0xa01818, roughness: 0.5 }), black = new THREE.MeshStandardMaterial({ color: 0x151515 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.5), black); cab.position.y = 1.0; g.add(cab);
    this.boxArm = new THREE.Group(); this.boxArm.position.set(0, 1.45, 0.25); g.add(this.boxArm);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), red); pad.position.set(0, -0.25, 0.25); pad.scale.set(1, 1.2, 0.8);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), black); arm.position.set(0, -0.1, 0.12); arm.rotation.x = 0.8;
    this.boxArm.add(pad, arm);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    this.boxCanvas = cv;
    this.boxTex = new THREE.CanvasTexture(cv); this.boxTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: this.boxTex, toneMapped: false }));
    scr.position.set(0, 1.82, 0.252); g.add(scr);
    H.group.add(g);
    this.boxGroup = g;
    H.collider(pos.x - 0.3, pos.z - 0.4, pos.x + 0.3, pos.z + 0.4, 0, 2.0, { furniture: true });
    const pick = H.pickBox(pos.x - 0.6, 0.9, pos.z - 0.4, pos.x - 0.1, 1.8, pos.z + 0.4);
    H.register('boxing', 'boxing', [pick], pos.clone().add(V(-0.4, 1.3, 0)));
    this.drawBox();
  }
  drawBox() {
    const c = this.boxCanvas.getContext('2d');
    c.fillStyle = '#100'; c.fillRect(0, 0, 256, 96);
    c.font = 'bold 22px "VT323", monospace'; c.fillStyle = '#ff4040'; c.textAlign = 'center';
    c.fillText('PUNCH METER  €1', 128, 22);
    c.font = 'bold 52px "VT323", monospace'; c.fillStyle = '#ffd040';
    c.fillText(String(Math.round(this.box.score)).padStart(4, '0'), 128, 72);
    c.font = '16px "VT323", monospace'; c.fillStyle = '#9f9'; c.fillText(`BEST ${this.box.best}`, 128, 92);
    this.boxTex.needsUpdate = true;
  }
  buildBoxUI() {
    let el = document.getElementById('boxUI');
    if (!el) { el = document.createElement('div'); el.id = 'boxUI'; el.className = 'boxUI vt'; document.getElementById('hud')?.appendChild(el); }
    el.innerHTML = '<div class="bxTitle">HIT [E] OR CLICK ON GREEN</div><div class="bxBar"><i class="g"></i><i class="y1"></i><i class="y2"></i><b></b></div>';
    this.boxUI = el;
    this.onBoxKey = e => {
      if (!this.boxing) return;
      if (e.code === 'KeyE' || e.type === 'mousedown') { e.preventDefault?.(); e.stopImmediatePropagation?.(); this.hit(); }
    };
    addEventListener('keydown', this.onBoxKey, true);
    addEventListener('mousedown', this.onBoxKey, true);
  }
  hit() {
    const b = this.boxing;
    if (!b) return;
    const x = b.x, d = Math.abs(x - 0.5);
    const score = d < 0.06 ? 1000 - d / 0.06 * 150 : d < 0.2 ? 800 - (d - 0.06) / 0.14 * 400 : Math.max(40, 300 - (d - 0.2) / 0.3 * 260);
    this.boxing = null;
    this.boxUI.classList.remove('show');
    this.game.local.frozen = false;
    this.game.request({ k: 'boxhit', score: Math.round(score) });
  }

  // ------------------------------------------------------------ prompts / input
  prompt(it) {
    const G = this.game;
    if (it.kind === 'dealer') return 'E — TALK TO THE DEALER';
    if (it.kind === 'boxing') return this.box.by && this.box.by !== G.localId && G.time - (this.box.at || 0) < 4 ? '<span class="dim">SOMEONE\'S PUNCHING</span>' : `E — PUNCH (€1)  <span class="dim">€${G.club.balance(G.localId)}</span>`;
    if (it.kind === 'shedtable') {
      const bag = this.heldBag();
      if (bag) return `E — PUT THE ${(ITEM_INFO[bag.type]?.name || bag.type).toUpperCase()} ON THE TABLE`;
      return this.table.size ? '<span class="dim">TAKE SOMETHING OFF THE TABLE</span>' : '<span class="dim">THE TABLE — BUY SOMETHING FROM THE DEALER IN THE ALLEY</span>';
    }
    if (it.kind === 'flour') return 'E — SNORT THE LINE';
    return null;
  }

  heldBag() {
    const it = this.game.selectedItem();
    return it && it.type.startsWith('bag_') ? it : this.game.heldList().find(i => i.type.startsWith('bag_')) || null;
  }

  interact(it) {
    const G = this.game;
    if (it.kind === 'dealer') { this.openMenu(); return true; }
    if (it.kind === 'boxing') { G.request({ k: 'box' }); return true; }
    if (it.kind === 'shedtable') {
      const bag = this.heldBag();
      // Empty hands: ask the host to claim a bag already on the table.
      // A held bag still follows the existing put-on-table path.
      G.request(bag ? { k: 'puttable', id: bag.id } : { k: 'taketable' });
      return true;
    }
    if (it.kind === 'flour') { G.request({ k: 'snort', id: it.flour.id }); return true; }
    return false;
  }

  /** Left click with a joint or a mushroom in hand. */
  use(item) { this.game.request({ k: 'usedrug', id: item.id }); }

  // ------------------------------------------------------------ host
  request(pid, r, p) {
    const G = this.game;
    switch (r.k) {
      case 'buy': {
        const m = MENU[r.what];
        if (!m || p.pos.distanceTo(DEALER) > 3.5) return true;
        const bal = G.club.balance(pid);
        if (bal < m.price) { G.broadcast({ k: 'msg', text: `"${m.price} euros. Come back when you have it." (€${bal})` }, pid); return true; }
        if (G.slotsUsed(pid) + 1 > INV_SLOTS) { G.broadcast({ k: 'msg', text: 'Your hands are full. Drop something first (G).' }, pid); return true; }
        G.broadcast({ k: 'shedbuy', pid, type: r.what, id: `${r.what}_${++this.seq}_${pid.slice(0, 4)}`, money: bal - m.price });
        return true;
      }
      case 'puttable': {
        const it = G.items.get(r.id);
        if (!it || it.holder !== pid || it.used || !it.type.startsWith('bag_') || !inShed(p.pos)) return true;
        const free = SLOTS.map((_, i) => i).filter(i => !this.table.has(i));
        if (free.length < 4) { G.broadcast({ k: 'msg', text: 'The table is full.' }, pid); return true; }
        const kind = { bag_mushrooms: 'mushroom', bag_flour: 'flour', bag_weed: 'joint' }[it.type];
        const put = free.slice(0, 4).map(i => ({ slot: i, id: `${kind}_${++this.seq}` }));
        G.broadcast({ k: 'shedput', pid, bag: r.id, kind, put });
        return true;
      }
      case 'taketable': {
        // Resolve the pickup from shared host state, not a client-supplied item ID.
        if (!inShed(p.pos) || p.pos.distanceTo(V(TABLE.x, 0, TABLE.z)) > 2.6) return true;
        const candidates = [...this.table.entries()]
          .filter(([, item]) => item.kind !== 'flour')
          .map(([slot, item]) => ({ slot, item, distance: SLOTS[slot].distanceTo(p.pos) }))
          .sort((a, b) => a.distance - b.distance);
        const entry = candidates[0];
        if (!entry) return true;
        const { slot, item } = entry;
        const it = G.items.get(item.id);
        if (!it || it.holder || it.used || !['joint', 'mushroom'].includes(it.type) || it.type !== item.kind) return true;
        const used = G.slotsUsed(pid);
        const needed = itemSlots(it.type);
        if (used + needed > INV_SLOTS) {
          G.broadcast({ k: 'msg', text: `Your hands are full (${used}/${INV_SLOTS}; ${ITEM_INFO[it.type].name} takes ${needed}). Drop something with G.` }, pid);
          return true;
        }
        // Claim synchronously on the host before emitting the replicated event.
        it.holder = pid;
        G.broadcast({ k: 'shedtake', pid, id: it.id, slot });
        return true;
      }
      case 'snort': {
        const e = [...this.table.entries()].find(([, v]) => v.id === r.id && v.kind === 'flour');
        if (!e || p.pos.distanceTo(V(TABLE.x, 0, TABLE.z)) > 2.6) return true;
        p.highUntil = G.time + HIGH;
        G.broadcast({ k: 'snorted', pid, id: r.id, slot: e[0] });
        return true;
      }
      case 'usedrug': {
        const it = G.items.get(r.id);
        if (!it || it.holder !== pid || it.used || !['joint', 'mushroom'].includes(it.type)) return true;
        p.highUntil = G.time + HIGH;
        G.broadcast({ k: 'drugused', pid, id: r.id, kind: it.type });
        return true;
      }
      case 'box': {
        if (this.box.by && this.box.by !== pid && G.time - (this.box.at || 0) < 4) return true;
        const bal = G.club.balance(pid);
        if (bal < 1) { G.broadcast({ k: 'msg', text: 'You need €1.' }, pid); return true; }
        this.box.by = pid; this.box.at = G.time;
        G.broadcast({ k: 'boxstart', pid, money: bal - 1 });
        return true;
      }
      case 'boxhit': {
        if (this.box.by !== pid) return true;
        this.box.by = null;
        G.broadcast({ k: 'boxscore', pid, score: Math.max(0, Math.min(1000, r.score | 0)) });
        G.hostNoise(V(36.4, 1, -8.4), 9, 'punch', pid);
        return true;
      }
    }
    return false;
  }

  event(e) {
    const G = this.game;
    switch (e.k) {
      case 'shedbuy': {
        G.club.money.set(e.pid, e.money);
        G.placeItem(e.id, e.type, { pos: [DEALER.x - 0.5, 0.9, DEALER.z] });
        G.applyEvent({ k: 'item', id: e.id, holder: e.pid });
        if (e.pid === G.localId) G.message(`"Pleasure doing business." You got ${MENU[e.type].label.toLowerCase()}.`, 3);
        G.updateHUD();
        return true;
      }
      case 'shedput': {
        const bag = G.items.get(e.bag);
        if (bag) { bag.used = true; bag.holder = null; bag.mesh.visible = false; }
        for (const { slot, id } of e.put) {
          const at = SLOTS[slot];
          if (e.kind === 'flour') {
            // a white line on the table, snorted in place
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.006, 0.025), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x202020 }));
            line.position.set(at.x, at.y + 0.004, at.z);
            line.rotation.y = 0.2;
            this.group.add(line);
            const pick = G.house.pickBox(at.x - 0.11, at.y - 0.02, at.z - 0.08, at.x + 0.11, at.y + 0.08, at.z + 0.08);
            G.house.register(id, 'flour', [pick], at.clone(), { flour: { id, mesh: line, pick } });
            this.table.set(slot, { id, kind: 'flour', mesh: line, pick });
          } else {
            G.placeItem(id, e.kind, { pos: [at.x, at.y, at.z] });
            this.table.set(slot, { id, kind: e.kind });
          }
        }
        audio.play('drawer', { pos: V(TABLE.x, 0.6, TABLE.z), vol: 0.5, rate: 1.4 });
        G.updateHUD();
        return true;
      }
      case 'shedtake': {
        this.table.delete(e.slot);
        // Use the existing item replication path for model removal, held state,
        // selection and HUD updates on every client.
        G.applyEvent({ k: 'item', id: e.id, holder: e.pid });
        return true;
      }
      case 'snorted': {
        const t = this.table.get(e.slot);
        if (t) { t.mesh.visible = false; G.house.interactables.delete(t.id); t.pick.visible = false; this.table.delete(e.slot); }
        const p = G.players.get(e.pid);
        if (p) audio.play('snort', p.isLocal ? { vol: 1 } : { pos: p.pos.clone().add(V(0, 1.4, 0)), vol: 1, ref: 2.5 });
        if (e.pid === G.localId) this.startSnort(SLOTS[e.slot]);
        return true;
      }
      case 'drugused': {
        const it = G.items.get(e.id);
        if (it) { it.used = true; it.holder = null; it.mesh.visible = false; }
        for (const [slot, v] of this.table) if (v.id === e.id) this.table.delete(slot);
        const p = G.players.get(e.pid);
        if (p && e.kind === 'joint') this.puff(p.pos.clone().add(V(0, 1.55, 0)), p.yaw || 0, 6);
        if (e.pid === G.localId) this.startHigh(e.kind === 'joint' ? 'weed' : 'shrooms');
        G.updateHUD();
        return true;
      }
      case 'boxstart': {
        G.club.money.set(e.pid, e.money);
        this.box.by = e.pid; this.box.at = G.time;
        if (e.pid === G.localId) { this.boxing = { x: 0, dir: 1 }; this.boxUI.classList.add('show'); G.local.frozen = true; }
        return true;
      }
      case 'boxscore': {
        this.box.score = e.score; this.box.best = Math.max(this.box.best, e.score); this.box.swing = e.score / 1000;
        this.box.by = null;
        audio.play('thud', { pos: V(36.4, 1.3, -8.4), vol: 0.5 + e.score / 1200, ref: 3, rate: 0.7 + e.score / 2500 });
        if (e.score > 850) audio.play('ding', { pos: V(36.4, 2, -8.4), vol: 0.8, ref: 3 });
        this.drawBox();
        const who = e.pid === G.localId ? 'You' : G.players.get(e.pid)?.name || 'Someone';
        G.message(`${who} punched ${e.score}${e.score > 850 ? ' — MONSTER HIT!' : e.score < 300 ? '. Weak.' : '.'}`, 3);
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ local: highs
  startSnort(at) {
    this.snort = { t: 0, at: at.clone() };
    this.game.local.frozen = true;
    this.startHigh('flour');
  }

  startHigh(kind) {
    const G = this.game;
    this.endHallucinations();
    this.effect = { kind, until: G.time + HIGH, t: 0 };
    G.message(kind === 'weed' ? 'Everything slows down…' : kind === 'flour' ? 'Your heart is pounding.' : 'The walls start to breathe…', 3);
    if (kind === 'shrooms') this.startHallucinations();
  }

  startHallucinations() {
    const G = this.game;
    this.hallu = [];
    const emojis = ['🦄', '🦌', '🎅', '🦄', '🌈', '🍄', '👁️', '🦌'];
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emojis[i % emojis.length]), transparent: true, depthWrite: false }));
      s.scale.setScalar(1.2 + Math.random() * 1.2);
      s.userData = { a: Math.random() * 6.28, r: 3 + Math.random() * 4, h: 0.6 + Math.random() * 1.8, sp: 0.3 + Math.random() * 0.6 };
      G.scene.add(s); this.hallu.push(s);
    }
    // extra Ajans, only on your screen, dancing out there
    // a rainbow wash over everything
    this.rainbow = document.createElement('div');
    this.rainbow.className = 'rainbowFX';
    document.getElementById('hud')?.appendChild(this.rainbow);
    const aj = G.monsters.get('ajan');
    this.ghostAjans = [];
    for (let i = 0; i < 2; i++) {
      if (!G.ajanGLTF) break;
      const av = new Avatar('ajan', G.ajanGLTF, { spec: aj?.def?.spec || 'ajan', height: aj?.def?.height || 2.25 });
      G.scene.add(av.group);
      av.userData = { a: i * Math.PI, t: Math.random() * 5 };
      this.ghostAjans.push(av);
    }
  }

  endHallucinations() {
    for (const s of this.hallu || []) s.parent?.remove(s);
    for (const a of this.ghostAjans || []) a.group.parent?.remove(a.group);
    this.rainbow?.remove(); this.rainbow = null;
    this.hallu = null; this.ghostAjans = null;
  }

  updateEffect(dt) {
    const G = this.game, e = this.effect, cam = G.camera, L = G.local;
    if (this.snort) {
      // face down at the table, the powder flies up the nose
      const s = this.snort; s.t += dt;
      const k = Math.min(1, s.t / 0.5);
      cam.position.lerp(s.at.clone().add(V(0, 0.16, 0.12)), k);
      cam.lookAt(s.at);
      if (s.t < 1.4 && Math.random() < 0.6) G.fx.emit(s.at.clone().lerp(cam.position, Math.random()), 0.05, 0.25, 2);
      if (s.t > 1.8) { this.snort = null; L.frozen = false; }
    }
    if (!e) return;
    e.t += dt;
    if (G.time > e.until || G.localDead) { this.effect = null; this.endHallucinations(); G.canvas.style.filter = ''; this.beep?.stop?.(); return; }
    const fade = Math.min(1, e.t / 4, (e.until - G.time) / 6);
    // a dragging, delayed view (the camera lags behind where you look)
    this.lagQ = this.lagQ || cam.quaternion.clone();
    this.lagQ.slerp(cam.quaternion, 1 - Math.exp(-dt * (e.kind === 'flour' ? 6 : 2.5)));
    cam.quaternion.copy(cam.quaternion.clone().slerp(this.lagQ, 0.75 * fade));
    if (e.kind === 'weed') {
      G.canvas.style.filter = `blur(${(1.4 * fade).toFixed(2)}px) saturate(${1 + 0.4 * fade}) brightness(${1 + 0.1 * fade})`;
    } else if (e.kind === 'flour') {
      G.canvas.style.filter = `blur(${(1.0 * fade).toFixed(2)}px) saturate(${1 + 1.2 * fade}) hue-rotate(${-25 * fade}deg) contrast(${1 + 0.35 * fade}) sepia(${0.35 * fade})`;
      cam.position.x += (Math.random() - 0.5) * 0.01 * fade; cam.position.y += (Math.random() - 0.5) * 0.01 * fade;
      this.beepT = (this.beepT || 0) - dt;
      if (this.beepT <= 0) { this.beepT = 0.55; audio.play('ding', { vol: 0.25 * fade, rate: 3.2 }); }
    } else if (e.kind === 'shrooms') {
      G.canvas.style.filter = `hue-rotate(${(e.t * 70) % 360}deg) saturate(${1 + 1.5 * fade}) blur(${(0.6 * fade).toFixed(2)}px)`;
      // your feet don't quite go where you tell them to
      if (L.speed > 0.3) { const a = Math.sin(e.t * 0.9) * 1.2; L.pos.x += Math.cos(a) * dt * 0.9 * fade; L.pos.z += Math.sin(a) * dt * 0.9 * fade; }
      cam.rotation.z += Math.sin(e.t * 0.7) * 0.12 * fade;
      const me = L.pos;
      for (const s of this.hallu || []) {
        const u = s.userData; u.a += dt * u.sp;
        s.position.set(me.x + Math.cos(u.a) * u.r, me.y + u.h + Math.sin(e.t * 2 + u.a) * 0.4, me.z + Math.sin(u.a) * u.r);
        s.material.opacity = fade;
      }
      for (const av of this.ghostAjans || []) {
        const u = av.userData; u.t += dt;
        av.group.position.set(me.x + Math.cos(u.a + e.t * 0.2) * 5, me.y, me.z + Math.sin(u.a + e.t * 0.2) * 5);
        av.group.lookAt(me.x, me.y, me.z);
        av.update(dt, { speed: 0, mode: 'dance', modeT: u.t });
        av.group.visible = fade > 0.3;
      }
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const G = this.game, cam = G.camera.position;
    const near = Math.abs(cam.x - 31) < 22 && cam.z < 22 && cam.y < 3;
    if (near || cam.x < 6) { this.animNPC(this.dealer, dt); }
    if (near) for (const n of this.npcs) this.animNPC(n, dt);
    for (const s of this.haze) { s.userData.ph += dt * 0.15; s.position.x += Math.sin(s.userData.ph) * dt * 0.05; }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const s = this.puffs[i], u = s.userData;
      u.life += dt;
      s.position.addScaledVector(u.v, dt);
      s.scale.multiplyScalar(1 + dt * 0.9);
      s.material.opacity = Math.max(0, 0.45 - u.life * 0.15);
      if (u.life > 3) { s.parent?.remove(s); this.puffs.splice(i, 1); }
    }
    // the shed: hotboxed (thicker fog), and music5 low on a loop, only while you're inside
    const inside = inShed(cam);
    if (inside && !this.music) this.music = audio.play('music5', { loop: true, vol: 0.32, bus: audio.musicBus });
    else if (!inside && this.music) { this.music.stop(0.8); this.music = null; }
    if (G.scene.fog) { this.baseFog ??= G.scene.fog.density; G.scene.fog.density += ((inside ? 0.16 : this.baseFog) - G.scene.fog.density) * Math.min(1, dt * 2); }
    // dealer label
    const head = this.dealer.av.headTop(V()).add(V(0, 0.25, 0)), pr = head.clone().project(G.camera);
    const vis = pr.z < 1 && head.distanceTo(cam) < 9 && cam.x < 2.3;
    this.label.style.opacity = vis ? 1 : 0;
    if (vis) this.label.style.transform = `translate(-50%, -100%) translate(${(pr.x * 0.5 + 0.5) * innerWidth}px, ${(-pr.y * 0.5 + 0.5) * innerHeight}px)`;
    // boxing: the marker sweeps fast; the pad swings after a hit
    if (this.boxing) {
      const b = this.boxing; b.x += b.dir * dt * 1.6;
      if (b.x > 1) { b.x = 1; b.dir = -1; } else if (b.x < 0) { b.x = 0; b.dir = 1; }
      this.boxUI.querySelector('b').style.left = (b.x * 100).toFixed(1) + '%';
    }
    this.box.swing *= Math.exp(-dt * 3);
    this.boxArm.rotation.x = -this.box.swing * 1.3 * Math.abs(Math.sin(G.time * 9));
    this.updateEffect(dt);
    // Ajan's smoke break: smoke rises from where he sits
    const aj = G.monsters.get('ajan');
    if (aj?.vis.st === 'shedsit' && Math.random() < dt * 2) this.puff(aj.avatar.mouth(V()), aj.vis.ry, 2, 0.25);
  }

  /** Host: somebody's in the shed for the first time this round — 50 % chance Ajan comes too. */
  hostUpdate() {
    const G = this.game;
    if (this.ajanRolled || !G.brain) return;
    if (![...G.players.values()].some(p => p.alive && !p.dying && p.pos && inShed(p.pos))) return;
    this.ajanRolled = true;
    if (Math.random() >= 0.5) return;
    // he has his own key
    if (G.house.doors.get('d_shed')?.locked) G.broadcast({ k: 'unlock', id: 'd_shed', by: 'ajan', item: null });
    G.brain.startShedVisit(SEAT);
  }

  dispose() {
    removeEventListener('keydown', this.onMenuKey, true);
    removeEventListener('keydown', this.onBoxKey, true);
    removeEventListener('mousedown', this.onBoxKey, true);
    this.music?.stop();
    this.label?.remove();
    this.endHallucinations();
    this.closeMenu();
    for (const s of this.puffs) s.parent?.remove(s);
    if (this.game.canvas) this.game.canvas.style.filter = '';
  }
}

function G_plane(H, x0, z0, x1, z1, y) {
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), H.M.woodDark);
  roof.rotation.x = -Math.PI / 2; roof.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  H.group.add(roof);
}

const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
function smokeTexture() {
  return canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(240,240,240,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
}
function gravelTexture() {
  const t = canvasTex(256, 256, (c) => { c.fillStyle = '#3a3834'; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 2500; i++) { c.fillStyle = ['#4a4640', '#2a2826', '#5a554c', '#33302c'][i % 4]; c.beginPath(); c.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 0, 7); c.fill(); } });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function emojiTexture(e) {
  return canvasTex(128, 128, (c) => { c.font = '96px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, 64, 70); });
}
function posterTexture(k) {
  return canvasTex(256, 352, (c, w, h) => {
    const bg = ['#1a3a1a', '#2a1a3a', '#3a2a10', '#102a2a'][k];
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    // a seven-pointed leaf
    c.save(); c.translate(w / 2, h * 0.47); c.fillStyle = ['#5ac040', '#b0e050', '#e0c030', '#40d0a0'][k];
    for (let i = -3; i <= 3; i++) { c.save(); c.rotate(i * 0.36); c.beginPath(); c.ellipse(0, -60 * (1 - Math.abs(i) * 0.18), 12, 62 * (1 - Math.abs(i) * 0.18), 0, 0, 7); c.fill(); c.restore(); }
    c.fillRect(-3, 0, 6, 70); c.restore();
    c.font = 'bold 34px Impact, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff';
    c.fillText(['LEGALIZE IT', 'GOOD VIBES', 'STAY HIGH', 'PEACE'][k], w / 2, h - 36);
    c.strokeStyle = '#000'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
  });
}
