// Slot machines (slot.glb). Everything happens on the machine itself: the reels and
// your balance are drawn on its screen (the model's white screen area) and three
// buttons on the deck below it — BET −, SPIN and BET + — are pressed with E.
// The host draws every result and moves the money, so nobody can cheat or double-pay.
import * as THREE from 'three';
import { audio } from './audio.js';
import { loadGLTF } from './assets.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SYMBOLS = ['7', 'CLOVER', 'BELL', 'BAR', 'CHERRY'];
const WEIGHTS = [2, 3, 4, 5, 6];
const PAYOUT = { '7': 50, CLOVER: 20, BELL: 15, BAR: 10, CHERRY: 5 };
export const BETS = [5, 10, 20, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const H = 1.75;        // machine height in metres (the model is 1 unit tall)
const SPIN_TIME = 2.2;
// Measured from slot.glb's texture/vertices (model units): the white screen spans
// x ±0.088, y 0.43–0.55 and leans back (z 0.045 at the bottom, 0.025 at the top);
// below it a deck sticks out to z 0.10 at y ≈ 0.46.
const SCREEN = { w: 0.176, h: 0.125, y: 0.49, z: 0.041, tilt: -0.165 };
const DECK = { w: 0.18, d: 0.05, y: 0.4655, z: 0.073, tilt: 0.3 };

function spinReel(rnd) {
  let r = rnd() * WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SYMBOLS.length; i++) { r -= WEIGHTS[i]; if (r < 0) return i; }
  return SYMBOLS.length - 1;
}
/** Winnings multiplier for three reels (indices into SYMBOLS). */
export function slotMultiplier(r) {
  const s = r.map(i => SYMBOLS[i]);
  if (s[0] === s[1] && s[1] === s[2]) return PAYOUT[s[0]];
  if (s.filter(x => x === '7').length === 2) return 3;
  if (s.filter(x => x === 'CHERRY').length === 2) return 2;
  return 0;
}

export class SlotMachine {
  /** id: unique name; pos: floor point; ry: facing (model +z turned by ry); y: floor height */
  constructor(game, id, pos, ry) {
    this.game = game;
    this.id = id;
    this.pos = pos.clone();
    this.ry = ry;
    this.reels = [0, 1, 2];
    this.anim = null;
    this.spinUntil = 0; // host clock
    this.bet = 20;      // this client's chosen bet
    this.last = null;   // last result on the screen
  }

  async init() {
    const G = this.game, house = G.house;
    const g = this.group = new THREE.Group();
    g.position.copy(this.pos);
    g.rotation.y = this.ry;
    const gl = await loadGLTF('slotModel');
    if (gl?.scene) {
      const m = gl.scene.clone();
      m.scale.setScalar(H);
      m.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.add(m);
    } else {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, H, 0.35), new THREE.MeshStandardMaterial({ color: 0x801010 }));
      b.position.y = H / 2;
      g.add(b);
    }
    const canvasMesh = (cw, ch, w, h) => {
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      return { cv, tex, mesh };
    };
    this.screen = canvasMesh(384, 272, SCREEN.w * H, SCREEN.h * H);
    this.screen.mesh.position.set(0, SCREEN.y * H, SCREEN.z * H + 0.006);
    this.screen.mesh.rotation.x = SCREEN.tilt;
    this.deck = canvasMesh(384, 108, DECK.w * H, DECK.d * H);
    this.deck.mesh.position.set(0, DECK.y * H + 0.004, DECK.z * H);
    this.deck.mesh.rotation.x = -Math.PI / 2 + DECK.tilt;
    g.add(this.screen.mesh, this.deck.mesh);
    this.light = new THREE.PointLight(0xffd070, 2, 2.5, 1.5);
    this.light.position.set(0, SCREEN.y * H, 0.45);
    g.add(this.light);
    house.group.add(g);
    g.updateMatrixWorld(true);
    // collision + the three buttons as interaction targets
    const w = g.localToWorld(V(0, 0, 0));
    house.collider(w.x - 0.28, w.z - 0.28, w.x + 0.28, w.z + 0.28, this.pos.y, this.pos.y + H, { furniture: true });
    this.buttons = ['down', 'spin', 'up'].map((btn, i) => {
      const lx = (i - 1) * DECK.w * H / 3;
      const pick = new THREE.Mesh(new THREE.BoxGeometry(DECK.w * H / 3 - 0.01, 0.06, DECK.d * H + 0.02), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(lx, DECK.y * H + 0.03, DECK.z * H);
      g.add(pick);
      pick.updateMatrixWorld(true);
      house.register(`${this.id}_${btn}`, 'slotbtn', [pick], pick.getWorldPosition(V()), { machine: this, btn });
      return { btn, lx };
    });
    this.press = null;
    this.drawScreen(0);
    this.drawDeck();
  }

  // ------------------------------------------------------------ local
  prompt(btn) {
    const G = this.game, bal = G.club.balance(G.localId);
    if (btn === 'spin') return this.anim ? '<span class="dim">SPINNING…</span>' : bal < this.bet ? `<span class="dim">SPIN €${this.bet} — NOT ENOUGH MONEY (€${bal})</span>` : `E — SPIN (€${this.bet})`;
    return `E — BET ${btn === 'up' ? 'UP' : 'DOWN'}  <span class="dim">(now €${this.bet})</span>`;
  }

  pressButton(btn) {
    const G = this.game;
    this.press = { btn, t: 0 };
    audio.play('click', { pos: this.worldPos(), vol: 0.5, rate: btn === 'spin' ? 0.8 : 1.4 });
    if (btn !== 'spin') {
      const i = BETS.indexOf(this.bet);
      this.bet = BETS[Math.max(0, Math.min(BETS.length - 1, i + (btn === 'up' ? 1 : -1)))];
      this.drawDeck();
      if (!this.anim) this.drawScreen(0);
      return;
    }
    if (this.anim) return;
    const bal = G.club.balance(G.localId);
    if (bal < this.bet) { G.message(`Not enough money for a €${this.bet} spin (€${bal}).`, 2.5); return; }
    G.request({ k: 'slot', m: this.id, bet: this.bet });
  }

  worldPos() { return this.pos.clone().add(V(0, SCREEN.y * H, 0)); }

  // ------------------------------------------------------------ host
  hostSpin(pid, bet) {
    const G = this.game, now = G.time;
    if (now < this.spinUntil) { G.broadcast({ k: 'msg', text: 'The machine is still spinning.' }, pid); return; }
    if (!BETS.includes(bet)) return;
    const bal = G.club.balance(pid);
    if (bal < bet) { G.broadcast({ k: 'msg', text: `Not enough money for a €${bet} spin (€${bal}).` }, pid); return; }
    const reels = [spinReel(Math.random), spinReel(Math.random), spinReel(Math.random)];
    const win = bet * slotMultiplier(reels);
    this.spinUntil = now + SPIN_TIME + 0.3;
    G.broadcast({ k: 'slotres', m: this.id, pid, bet, reels, win, money: bal - bet + win });
  }

  // ------------------------------------------------------------ all clients
  applyResult(e) {
    const G = this.game;
    G.club.money.set(e.pid, e.money);
    this.reels = e.reels;
    this.anim = { t: 0, ...e };
    this.last = null;
    audio.play('click', { pos: this.worldPos(), vol: 0.6, rate: 0.7 });
    G.updateHUD();
  }

  update(dt) {
    const G = this.game;
    const near = G.camera.position.distanceTo(this.pos) < 12;
    if (this.press) { this.press.t += dt; if (near) this.drawDeck(); if (this.press.t > 0.25) { this.press = null; this.drawDeck(); } }
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    if (near) this.drawScreen(a.t, a);
    const stopAt = [0.45, 0.7, 0.95].map(k => SPIN_TIME * k);
    a.stops = a.stops || 0;
    while (a.stops < 3 && a.t >= stopAt[a.stops]) { a.stops++; if (near) audio.play('clunk', { pos: this.worldPos(), vol: 0.5, rate: 1.6 }); }
    if (a.t >= SPIN_TIME && !a.paid) {
      a.paid = true;
      if (near && a.win > 0) for (let i = 0; i < Math.min(12, 3 + a.win / a.bet); i++) audio.play('pickup', { pos: this.worldPos(), vol: 0.5, rate: 1.4 + Math.random() * 0.6, delay: i * 0.07 });
      if (a.pid === G.localId) G.message(a.win > 0 ? `JACKPOT-ish! You win €${a.win}.` : 'No luck.', 2.5);
    }
    this.light.intensity = a.t >= SPIN_TIME && a.win > 0 ? 2 + Math.sin(a.t * 20) * 1.5 : 2;
    if (a.t > SPIN_TIME + 2.5) { this.last = a; this.anim = null; if (near) this.drawScreen(0); this.drawDeck(); }
  }

  // ------------------------------------------------------------ drawing
  drawScreen(t, anim = null) {
    const G = this.game;
    const c = this.screen.cv.getContext('2d');
    const W = c.canvas.width, Hh = c.canvas.height;
    const g = c.createLinearGradient(0, 0, 0, Hh);
    g.addColorStop(0, '#1a0410'); g.addColorStop(1, '#3a0a14');
    c.fillStyle = g; c.fillRect(0, 0, W, Hh);
    const top = 34, rh = Hh - 92, rw = W / 3;
    for (let i = 0; i < 3; i++) {
      c.fillStyle = '#f4efe2';
      c.fillRect(i * rw + 8, top, rw - 16, rh);
      const stop = anim ? SPIN_TIME * (0.45 + i * 0.25) : 0;
      const spinning = anim && t < stop;
      let idx = this.reels[i], off = 0;
      if (spinning) { const v = t * 22 + i * 3; idx = Math.floor(v) % SYMBOLS.length; off = (v % 1) * 60; }
      c.save();
      c.beginPath(); c.rect(i * rw + 8, top, rw - 16, rh); c.clip();
      for (let k = -1; k <= 1; k++) drawSymbol(c, SYMBOLS[(idx + k + SYMBOLS.length) % SYMBOLS.length], i * rw + rw / 2, top + rh / 2 + k * 60 + off - (spinning ? 30 : 0), k === 0 && !spinning ? 1 : 0.5);
      c.restore();
    }
    c.strokeStyle = '#ff3030'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(4, top + rh / 2); c.lineTo(W - 4, top + rh / 2); c.stroke();
    c.textAlign = 'center';
    c.font = 'bold 24px "VT323", monospace'; c.fillStyle = '#ffd040';
    c.fillText('LUCKY HOUSE SLOTS', W / 2, 24);
    const res = anim && t >= SPIN_TIME ? anim : !anim ? this.last : null;
    c.font = 'bold 30px "VT323", monospace';
    if (res && res.win > 0) { c.fillStyle = Math.floor(t * 6) % 2 ? '#40ff60' : '#ffff40'; c.fillText(`WIN €${res.win}!`, W / 2, Hh - 30); }
    else if (res) { c.fillStyle = '#ff6060'; c.fillText('NO WIN', W / 2, Hh - 30); }
    else if (anim) { c.fillStyle = '#ffd040'; c.fillText(`BET €${anim.bet}`, W / 2, Hh - 30); }
    else { c.fillStyle = '#ffd040'; c.fillText('777 ×50 · ☘ ×20 · 🔔 ×15', W / 2, Hh - 30); }
    c.font = '20px "VT323", monospace'; c.fillStyle = '#9f9';
    c.textAlign = 'left'; c.fillText(`BAL €${G.club.balance(G.localId)}`, 10, Hh - 8);
    c.textAlign = 'right'; c.fillStyle = '#ffd040'; c.fillText(`BET €${this.bet}`, W - 10, Hh - 8);
    this.screen.tex.needsUpdate = true;
  }

  drawDeck() {
    const c = this.deck.cv.getContext('2d');
    const W = c.canvas.width, Hh = c.canvas.height, bw = W / 3;
    c.fillStyle = '#1b1b1f'; c.fillRect(0, 0, W, Hh);
    const labels = [['BET', '−'], ['SPIN', `€${this.bet}`], ['BET', '+']];
    labels.forEach(([a, b], i) => {
      const pressed = this.press && this.press.btn === ['down', 'spin', 'up'][i];
      const x = i * bw + 8, y = 10 + (pressed ? 4 : 0), w = bw - 16, h = Hh - 24;
      c.fillStyle = i === 1 ? (this.anim ? '#5a1010' : '#c01818') : '#d4a020';
      c.shadowColor = i === 1 ? '#ff4040' : '#ffd060'; c.shadowBlur = pressed ? 2 : 14;
      roundRect(c, x, y, w, h, 14); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = i === 1 ? '#fff' : '#200';
      c.textAlign = 'center';
      c.font = 'bold 30px "VT323", monospace'; c.fillText(a, x + w / 2, y + h * 0.45);
      c.font = 'bold 34px "VT323", monospace'; c.fillText(b, x + w / 2, y + h * 0.85);
    });
    this.deck.tex.needsUpdate = true;
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath();
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
