// The security office (east wing, ground floor): open to everyone at any time.
//  - A steel shutter over the doorway: the button inside slams it down instantly or
//    lifts it again. While it's down nothing gets in (monsters can't path through it).
//  - A window onto the east hall and a LIGHT button that lights the hall outside for a
//    few seconds, so you can see who's standing at the door.
//  - A CCTV console: sit at it to watch the camera feeds (A/D or the mouse wheel to
//    switch, E or Esc to get up). The feeds are the real house, rendered live.
// If a monster chases you in and finds the shutter down, it knocks, then steps over to
// the window, stares in at you, grins, and leaves (see AjanBrain.startKnock).
import * as THREE from 'three';
import { audio } from './audio.js';
import { CAMERAS } from './house.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const SEC = { x0: 49, x1: 56, z0: 7, z1: 14 };
export const inSecOffice = p => p.x > SEC.x0 && p.x < SEC.x1 && p.z > SEC.z0 + 0.1 && p.z < SEC.z1 && p.y < 2;
export const SEC_DOOR = { x0: 51.4, x1: 52.6, z: 7, outside: V(52.0, 0, 6.15) };
export const SEC_WINDOW = { x0: 53.6, x1: 55.2, outside: V(54.4, 0, 6.2) };
const LIGHT_TIME = 4;

export class Security {
  constructor(game) {
    this.game = game;
    this.closed = false;
    this.shutterY = 0; // 0 = up (open), 1 = down
    this.lightUntil = 0;
    this.console = null; // local: { cam }
  }

  init() {
    const G = this.game, H = G.house;
    const g = this.group = new THREE.Group();
    H.group.add(g);
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
    const steel = mat(0x5a5f66, { metalness: 0.8, roughness: 0.35 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    // shutter: ribbed steel, rolls down out of a housing over the doorway
    this.shutter = new THREE.Group();
    const w = SEC_DOOR.x1 - SEC_DOOR.x0;
    for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.19, 0.05), steel); s.position.set(0, 0.1 + i * 0.19, 0); this.shutter.add(s); }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.06), mat(0xd0a010)); stripe.position.y = 0.06; this.shutter.add(stripe);
    this.shutter.position.set((SEC_DOOR.x0 + SEC_DOOR.x1) / 2, 2.3, SEC_DOOR.z);
    g.add(this.shutter);
    box(w + 0.2, 0.3, 0.3, steel, (SEC_DOOR.x0 + SEC_DOOR.x1) / 2, 2.45, SEC_DOOR.z);
    this.col = H.collider(SEC_DOOR.x0, SEC_DOOR.z - 0.06, SEC_DOOR.x1, SEC_DOOR.z + 0.06, 0, 2.3, { occlude: true });
    this.col.off = true;
    // the nav graph's doorway is a "door" that is locked while the shutter is down
    this.navDoor = { id: 'd_secoffice', locked: false, open: true, center: V((SEC_DOOR.x0 + SEC_DOOR.x1) / 2, 1.1, SEC_DOOR.z) };
    H.doors.set('d_secoffice', this.navDoor);
    // the window onto the hall: glass you can't walk or see through for the AI
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(SEC_WINDOW.x1 - SEC_WINDOW.x0, 0.9), new THREE.MeshStandardMaterial({ color: 0x8aa0b0, transparent: true, opacity: 0.18, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.set((SEC_WINDOW.x0 + SEC_WINDOW.x1) / 2, 1.45, 7);
    g.add(glass);
    H.collider(SEC_WINDOW.x0, 6.94, SEC_WINDOW.x1, 7.06, 1.0, 1.9, { occlude: true });
    // the hall light the LIGHT button switches on (off otherwise: the hall outside is dark)
    // night-vision illuminator that rides with whichever camera the console shows
    this.irLight = new THREE.PointLight(0xd8ffe0, 0, 26, 1.1);
    G.scene.add(this.irLight);
    this.hallLight = new THREE.PointLight(0xfff0d0, 0, 7, 1.4);
    this.hallLight.position.set(53.2, 2.5, 5.8);
    g.add(this.hallLight);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0x302820 }));
    lamp.position.copy(this.hallLight.position); g.add(lamp);
    this.lamp = lamp;
    // control panel on the wall beside the door (inside): DOOR and LIGHT buttons
    box(0.6, 0.45, 0.06, mat(0x222428), 50.5, 1.35, 7.1);
    this.btnDoor = box(0.16, 0.16, 0.06, mat(0xc01010, { emissive: 0x400000 }), 50.35, 1.4, 7.16);
    this.btnLight = box(0.16, 0.16, 0.06, mat(0xd0c040, { emissive: 0x302800 }), 50.65, 1.4, 7.16);
    H.register('sec_door_btn', 'secbtn', [this.btnDoor], V(50.35, 1.4, 7.2));
    H.register('sec_light_btn', 'seclight', [this.btnLight], V(50.65, 1.4, 7.2));
    // CCTV console: desk, chair and a bank of four screens on the east wall
    box(2.4, 0.08, 0.8, mat(0x3a3028), 54.6, 0.78, 10.5);
    for (const [dx, dz] of [[-1.1, -0.35], [1.1, -0.35], [-1.1, 0.35], [1.1, 0.35]]) box(0.06, 0.78, 0.06, mat(0x222222), 54.6 + dz, 0.39, 10.5 + dx);
    H.collider(54.2, 9.3, 55.0, 11.7, 0, 0.82, { furniture: true });
    this.screens = [];
    for (let i = 0; i < 4; i++) {
      const cv = document.createElement('canvas'); cv.width = 192; cv.height = 128;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      m.position.set(55.85, 1.25 + Math.floor(i / 2) * 0.58, 10.05 + (i % 2) * 0.85);
      m.rotation.y = -Math.PI / 2;
      g.add(m);
      box(0.08, 0.56, 0.81, mat(0x111111), 55.92, m.position.y, m.position.z);
      this.screens.push({ cv, tex, cam: (i * 3 + 9) % CAMERAS.length });
    }
    const pick = H.pickBox(54.0, 0.8, 9.6, 55.95, 2.0, 11.4);
    H.register('cctv', 'cctv', [pick], V(54.6, 1.2, 10.5));
    this.drawScreens();
    // console input (only while sitting at it)
    this.onKey = e => {
      if (!this.console) return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.switchCam(-1);
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') this.switchCam(1);
      else if (e.code === 'KeyE' || e.code === 'Escape') this.leaveConsole();
      else return;
      e.preventDefault(); e.stopImmediatePropagation();
    };
    this.onWheel = e => { if (this.console && e.deltaY) { this.switchCam(e.deltaY > 0 ? 1 : -1); e.stopImmediatePropagation(); } };
    addEventListener('keydown', this.onKey, true);
    addEventListener('wheel', this.onWheel, true);
    this.label = document.createElement('div');
    this.label.className = 'camLabel vt';
    document.getElementById('hud')?.appendChild(this.label);
  }

  drawScreens() {
    for (const s of this.screens) {
      const c = s.cv.getContext('2d');
      c.fillStyle = '#081008'; c.fillRect(0, 0, 192, 128);
      c.fillStyle = '#9f9'; c.font = '16px "VT323", monospace';
      c.fillText(CAMERAS[s.cam].label, 8, 18);
      c.fillText('SIT AT THE DESK', 8, 70); c.fillText('TO WATCH', 8, 88);
      s.tex.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ prompts / input
  prompt(it) {
    if (it.kind === 'secbtn') return this.closed ? 'E — RAISE THE SHUTTER' : 'E — SLAM THE SHUTTER DOWN';
    if (it.kind === 'seclight') return 'E — HALL LIGHT';
    if (it.kind === 'cctv') return 'E — WATCH THE CAMERAS';
    return null;
  }

  interact(it) {
    const G = this.game;
    if (it.kind === 'secbtn') { G.local.act?.(); G.request({ k: 'shutter', closed: !this.closed }); return true; }
    if (it.kind === 'seclight') { G.local.act?.(); G.request({ k: 'seclight' }); return true; }
    if (it.kind === 'cctv') { this.enterConsole(); return true; }
    return false;
  }

  enterConsole() {
    const G = this.game, L = G.local;
    if (L.hidden || L.frozen) return;
    this.console = { cam: this.console?.cam ?? 9, back: { pos: L.pos.clone(), yaw: L.yaw, pitch: L.pitch } };
    L.frozen = true;
    G.camBoost = 0.9;
    this.label.classList.add('show');
    document.getElementById('hud')?.classList.add('cctv');
    audio.play('click', { vol: 0.4, rate: 0.7 });
    this.switchCam(0);
  }
  leaveConsole() {
    const G = this.game;
    if (!this.console) return;
    this.console = null;
    this.irLight.intensity = 0;
    G.local.frozen = false;
    G.camBoost = 0;
    this.label.classList.remove('show');
    document.getElementById('hud')?.classList.remove('cctv');
    audio.play('click', { vol: 0.4, rate: 0.9 });
  }
  switchCam(d) {
    if (!this.console) return;
    this.console.cam = (this.console.cam + d + CAMERAS.length) % CAMERAS.length;
    this.game.post?.glitch(0.35);
    if (d) audio.play('pickup', { vol: 0.3, rate: 0.6 });
    this.label.innerHTML = `${CAMERAS[this.console.cam].label}<span>◀ A · D ▶ &nbsp; E — STAND UP</span>`;
  }

  // ------------------------------------------------------------ host
  request(pid, r, p) {
    const G = this.game;
    if (r.k === 'shutter') {
      if (!inSecOffice(p.pos)) return true; // the controls are inside
      if (!!r.closed === this.closed) return true;
      G.broadcast({ k: 'shutter', closed: !!r.closed, by: pid });
      G.hostNoise(V(52, 1, 7), 12, 'shutter', pid);
      return true;
    }
    if (r.k === 'seclight') {
      if (!inSecOffice(p.pos)) return true;
      G.broadcast({ k: 'seclight', until: G.net.serverNow() + LIGHT_TIME * 1000 });
      return true;
    }
    return false;
  }

  event(e) {
    const G = this.game;
    if (e.k === 'shutter') {
      this.closed = e.closed;
      this.col.off = !e.closed;
      this.navDoor.locked = e.closed;
      audio.play(e.closed ? 'slam' : 'rattle', { pos: V(52, 1.5, 7), vol: 1, ref: 4, rate: e.closed ? 0.6 : 0.8 });
      if (e.closed) { audio.play('clank', { pos: V(52, 0.3, 7), vol: 0.9, ref: 3 }); G.post?.glitch(0.2); }
      return true;
    }
    if (e.k === 'seclight') { this.lightUntil = e.until; audio.play('click', { pos: V(50.6, 1.4, 7.2), vol: 0.5 }); return true; }
    if (e.k === 'knock') { for (let i = 0; i < 3; i++) audio.play('knock', { pos: V(52, 1.4, 6.9), vol: 1, ref: 4, delay: i * 0.9 }); return true; }
    return false;
  }

  /** Host: nobody living inside? Lift the shutter so nobody is locked out for good. */
  hostCheck() {
    const G = this.game;
    if (!this.closed) return;
    const anyone = [...G.players.values()].some(p => p.alive && !p.escaped && !p.dying && p.pos && inSecOffice(p.pos));
    if (!anyone) G.broadcast({ k: 'shutter', closed: false, by: null });
  }

  update(dt) {
    const G = this.game;
    // shutter slams down fast, rolls up slower
    const want = this.closed ? 1 : 0;
    this.shutterY += (want - this.shutterY) * Math.min(1, dt * (this.closed ? 30 : 4));
    this.shutter.position.y = 2.3 - this.shutterY * 2.3;
    this.shutter.scale.y = 0.02 + this.shutterY * 0.98;
    const lit = G.net.serverNow() < this.lightUntil;
    this.hallLight.intensity = lit ? 7 + Math.random() * 0.6 : 0;
    this.lamp.material.color.setHex(lit ? 0xfff0c0 : 0x302820);
    if (G.isHost) { this.checkT = (this.checkT || 0) - dt; if (this.checkT <= 0) { this.checkT = 1; this.hostCheck(); } }
    if (this.console) {
      const c = CAMERAS[this.console.cam], cam = G.camera;
      cam.position.set(...c.pos);
      cam.lookAt(...c.look);
      cam.rotation.z += Math.sin(G.time * 0.5) * 0.004;
      this.irLight.position.set(c.pos[0], c.pos[1] - 0.2, c.pos[2]);
      this.irLight.intensity = 30;
      G.local.hands.visible = false;
      G.local.light.intensity = 0;
      if (G.me?.dying || G.localDead) this.leaveConsole();
    }
  }

  dispose() {
    removeEventListener('keydown', this.onKey, true);
    removeEventListener('wheel', this.onWheel, true);
    this.label?.remove();
    this.irLight?.parent?.remove(this.irLight);
    document.getElementById('hud')?.classList.remove('cctv');
  }
}
