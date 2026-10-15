// The secret nightclub behind the attic's west wall.
//  - a bar with Fai the bartender (talk → fai.mp3 → drink menu → she fetches
//    the drink from the back bar and serves it on the counter)
//  - a lit dance floor, a disco ball, moving coloured lights
//  - Yasmin dancing at her pole; AJAN's pole beside it
//  - a table and chair in front of Yasmin's pole: sit, press E to make it rain
//  - song1.mp3 plays only while you are inside the room
// Shared state (Fai's serving, money, the AJAN visit) is decided by the host
// and broadcast; NPC motion is a pure function of server time, so every client
// sees the same thing.
import * as THREE from 'three';
import { audio } from './audio.js';
import { loadGLTF } from './assets.js';
import { Avatar } from './avatar.js';
import { GeoBuilder } from './house.js';
import { mulberry32, clamp, damp, angleLerp } from './util.js';

const AY = 6.8, TOP = 9.4;
export const CLUB = { x0: 2, x1: 18, z0: 8, z1: 21 };
export const inClub = p => p.x > CLUB.x0 && p.x < CLUB.x1 && p.z > CLUB.z0 && p.z < CLUB.z1 && p.y > 5.6 && p.y < TOP;
export const POLE_Y = new THREE.Vector3(5.0, AY, 18.2);   // Yasmin's pole
export const POLE_A = new THREE.Vector3(8.8, AY, 18.2);   // AJAN's pole
export const DRINKS = { vodka: { x: 5.4, name: 'Vodka' }, beer: { x: 8.0, name: 'Beer' }, wine: { x: 10.6, name: 'Glass of Wine' } };
export const RAIN_COST = 20;
export const START_MONEY = 500;
const SEAT = new THREE.Vector3(5.0, AY, 15.3);
const TABLE = new THREE.Vector3(5.0, AY, 16.05);
// a second table and chair, right in front of AJAN's pole
const SEAT2 = new THREE.Vector3(8.8, AY, 15.3);
const TABLE2 = new THREE.Vector3(8.8, AY, 16.05);
export const CLUB_SEATS = ['club_seat', 'club_seat2'];
const FAI_HOME = new THREE.Vector3(8.0, AY, 9.3);
const COUNTER_Y = AY + 1.1, COUNTER_Z = 10.3;
// AJAN's way in (after walking through the house to the foot of the attic stairs):
// up the stairs in the upstairs hall, across the attic, through the club door and
// across the dance floor to his pole. He leaves the same way, reversed.
export const AJAN_ROUTE = [
  [19.2, 10.25], [20.0, 10.25], [25.9, 10.25], [26.6, 10.25], [26.6, 12.3], [19.6, 14.55], [18.6, 14.55], [17.2, 14.55], [14.2, 15.8], [11.0, 17.2], [9.4, 17.6],
];
export const AJAN_POLE_R = 0.72;

// ---------------------------------------------------------------- drinks
export function makeDrinkMesh(type) {
  const g = new THREE.Group();
  if (type === 'vodka') {
    const glass = new THREE.MeshStandardMaterial({ color: 0xdfeef2, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.2, 14), glass); body.position.y = 0.1;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.07, 12), glass); neck.position.y = 0.235;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.025, 12), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.9, roughness: 0.2 })); cap.position.y = 0.282;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0375, 0.0375, 0.07, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x2050c0 })); label.position.y = 0.09;
    g.add(body, neck, cap, label);
  } else if (type === 'beer') {
    const brown = new THREE.MeshStandardMaterial({ color: 0x4a2408, transparent: true, opacity: 0.85, roughness: 0.15 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.15, 14), brown); body.position.y = 0.075;
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.031, 0.05, 14), brown); shoulder.position.y = 0.175;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.06, 12), brown); neck.position.y = 0.23;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 12), new THREE.MeshStandardMaterial({ color: 0xc8a020, metalness: 0.8 })); cap.position.y = 0.265;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0315, 0.0315, 0.06, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a6a2a })); label.position.y = 0.07;
    g.add(body, shoulder, neck, cap, label);
  } else {
    // wine: a stemmed glass of red
    const glass = new THREE.MeshStandardMaterial({ color: 0xeef4f4, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.006, 16), glass); base.position.y = 0.003;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 8), glass); stem.position.y = 0.05;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 10, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), glass); bowl.position.y = 0.13;
    const wine = new THREE.Mesh(new THREE.SphereGeometry(0.039, 16, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), new THREE.MeshStandardMaterial({ color: 0x5a0610, roughness: 0.1 })); wine.position.y = 0.13;
    g.add(base, stem, bowl, wine);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------- the club
export class Club {
  constructor(game) {
    this.game = game;
    this.house = game.house;
    this.group = new THREE.Group();
    this.house.group.add(this.group);
    this.money = new Map();
    for (const p of game.players.values()) this.money.set(p.id, START_MONEY);
    this.fai = { busy: false, mode: 'idle', plan: null, customer: null, drinkMesh: null, served: 0 };
    this.bills = [];
    this.musicVol = 0;
    this.build();
  }

  balance(pid) { return this.money.get(pid) ?? START_MONEY; }

  async init() {
    const [yg, fg] = await Promise.all([loadGLTF('yasminModel'), loadGLTF('faiModel')]);
    this.missing = [];
    if (!yg) this.missing.push('yasmin.glb');
    if (!fg) this.missing.push('bartender.glb');
    this.yasmin = new Avatar('yasmin', yg, { height: 1.7, jiggle: true });
    this.faiAv = new Avatar('bartender', fg, { height: 1.64 });
    for (const av of [this.yasmin, this.faiAv]) { av.mesh.castShadow = true; this.group.add(av.group); }
    this.yasmin.custom = (dt) => this.animYasmin(dt);
    this.faiAv.group.position.copy(FAI_HOME);
    this.faiRy = 0;
    // talking to Fai: aim at her
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = 0.85;
    this.faiAv.group.add(pick);
    this.house.register('fai', 'fai', [pick], FAI_HOME.clone().add(new THREE.Vector3(0, 1.3, 0)), { club: this });
    this.yasJig = { c: new THREE.Vector3(), cv: new THREE.Vector3(), b: new THREE.Vector3(), bv: new THREE.Vector3(), last: null, lastV: new THREE.Vector3() };
  }

  // ------------------------------------------------------------ geometry
  build() {
    const H = this.house, M = H.M, G = new GeoBuilder();
    const col = (x0, z0, x1, z1, y1, opts = {}) => H.collider(x0, z0, x1, z1, AY, AY + y1, { furniture: true, ...opts });
    // ceiling
    G.plane('ceiling', CLUB.x0, CLUB.z0, CLUB.x1, CLUB.z1, TOP, false);
    // ---- the bar: back bar with shelves, front counter, closed ends
    G.box(4.0, AY, 8.1, 12.0, AY + 0.9, 8.7, 'woodDark');
    G.box(3.95, AY + 0.9, 8.05, 12.05, AY + 0.95, 8.75, 'porcelain');
    for (let k = 0; k < 3; k++) G.box(4.0, AY + 1.35 + k * 0.4, 8.1, 12.0, AY + 1.38 + k * 0.4, 8.42, 'woodDark');
    G.box(4.0, AY + 1.2, 8.1, 12.0, AY + 2.6, 8.12, 'black');
    col(4.0, 8.1, 12.0, 8.75, 2.6);
    G.box(4.0, AY, 10.0, 12.0, AY + 1.05, 10.55, 'woodDark');
    G.box(3.9, AY + 1.05, 9.95, 12.1, AY + 1.1, 10.65, 'frame');
    G.box(4.0, AY + 0.1, 10.55, 12.0, AY + 0.14, 10.62, 'brass');
    col(3.9, 9.95, 12.1, 10.65, 1.1);
    for (const x of [3.8, 12.0]) { G.box(x, AY, 8.7, x + 0.2, AY + 1.1, 10.0, 'woodDark'); col(x, 8.7, x + 0.2, 10.0, 1.1); }
    // bar stools
    for (const x of [5.0, 6.5, 8.0, 9.5, 11.0]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0x701030, roughness: 0.5 }));
      s.position.set(x, AY + 0.75, 11.0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.75, 8), M.metal); leg.position.set(x, AY + 0.37, 11.0);
      this.group.add(s, leg);
      col(x - 0.2, 10.8, x + 0.2, 11.2, 0.78);
    }
    // bottles on the back bar shelves
    const bottleCols = [0xdfeef2, 0x4a2408, 0x2a4a10, 0x5a0610, 0xc89a30, 0x103050];
    const rnd = mulberry32(77);
    for (let k = 0; k < 3; k++) for (let x = 4.25; x < 11.9; x += 0.22 + rnd() * 0.08) {
      const h = 0.22 + rnd() * 0.12;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, h, 10), new THREE.MeshStandardMaterial({ color: bottleCols[Math.floor(rnd() * bottleCols.length)], transparent: true, opacity: 0.8, roughness: 0.1, emissive: 0x050208 }));
      b.position.set(x, AY + 1.38 + k * 0.4 + h / 2, 8.27);
      this.group.add(b);
    }
    // the three drink stations on the back counter (where Fai fetches from)
    for (const [type, d] of Object.entries(DRINKS)) {
      for (let i = 0; i < 3; i++) { const m = makeDrinkMesh(type); m.position.set(d.x - 0.15 + i * 0.15, AY + 0.95, 8.45); this.group.add(m); }
      const sign = this.textPlane(type.toUpperCase(), 256, 64, '#ffd8f0', 0.5, 0.12);
      sign.position.set(d.x, AY + 1.22, 8.76);
      this.group.add(sign);
    }
    // ---- the dance floor: lit tiles
    const tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ color: 0xffffff }), 30);
    let n = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
      const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(10.0 + i + 0.5, AY + 0.012, 12.2 + j + 0.5);
      tiles.setMatrixAt(n, m); tiles.setColorAt(n, new THREE.Color(0x200830)); n++;
    }
    tiles.instanceColor.needsUpdate = true;
    this.group.add(tiles);
    this.tiles = tiles;
    // ---- the two poles on round platforms
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdadfe6, metalness: 1.0, roughness: 0.12 });
    for (const [pole, r, rim] of [[POLE_Y, 1.0, 0xff40c0], [POLE_A, 1.25, 0xff3010]]) {
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 40), new THREE.MeshStandardMaterial({ color: 0x18101c, roughness: 0.3, metalness: 0.4 }));
      plat.position.set(pole.x, AY + 0.025, pole.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 48), new THREE.MeshBasicMaterial({ color: rim }));
      ring.rotation.x = Math.PI / 2; ring.position.set(pole.x, AY + 0.05, pole.z);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, TOP - AY, 16), chrome);
      p.position.set(pole.x, (AY + TOP) / 2, pole.z);
      this.group.add(plat, ring, p);
      col(pole.x - 0.07, pole.z - 0.07, pole.x + 0.07, pole.z + 0.07, TOP - AY);
    }
    // ---- a table with a chair in front of each pole (Yasmin's, and AJAN's)
    for (const [T, S] of [[TABLE, SEAT], [TABLE2, SEAT2]]) {
      const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 24), M.woodDark); tbl.position.set(T.x, AY + 0.74, T.z);
      const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.74, 10), M.metal); tleg.position.set(T.x, AY + 0.37, T.z);
      this.group.add(tbl, tleg);
      col(T.x - 0.36, T.z - 0.36, T.x + 0.36, T.z + 0.36, 0.76);
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0xff3060, emissive: 0x801030 })); candle.position.set(T.x + 0.15, AY + 0.795, T.z); this.group.add(candle);
      G.box(S.x - 0.25, AY + 0.45, S.z - 0.25, S.x + 0.25, AY + 0.52, S.z + 0.25, 'fabricRed');
      for (const [dx, dz] of [[-0.22, -0.22], [0.18, -0.22], [-0.22, 0.18], [0.18, 0.18]]) G.box(S.x + dx, AY, S.z + dz, S.x + dx + 0.04, AY + 0.45, S.z + dz + 0.04, 'metal');
      G.box(S.x - 0.25, AY + 0.52, S.z - 0.27, S.x + 0.25, AY + 1.1, S.z - 0.22, 'fabricRed');
      col(S.x - 0.27, S.z - 0.27, S.x + 0.27, S.z + 0.27, 0.9);
    }
    // ---- lounge: booths along the west wall, sofas by the south wall, DJ booth, speakers
    for (const z0 of [9.2, 12.4]) {
      G.box(2.1, AY, z0, 2.9, AY + 0.45, z0 + 2.4, 'fabricRed'); G.box(2.1, AY + 0.45, z0, 2.35, AY + 1.1, z0 + 2.4, 'fabricRed');
      col(2.1, z0, 2.9, z0 + 2.4, 1.1);
      G.box(3.3, AY + 0.45, z0 + 0.7, 3.9, AY + 0.5, z0 + 1.7, 'woodDark'); col(3.3, z0 + 0.7, 3.9, z0 + 1.7, 0.5);
    }
    for (const x0 of [11.4, 14.4]) { G.box(x0, AY, 20.1, x0 + 2.4, AY + 0.45, 20.9, 'fabricRed'); G.box(x0, AY + 0.45, 20.65, x0 + 2.4, AY + 1.1, 20.9, 'fabricRed'); col(x0, 20.1, x0 + 2.4, 20.9, 1.1); }
    G.box(15.2, AY, 8.2, 17.8, AY + 1.1, 9.4, 'black'); col(15.2, 8.2, 17.8, 9.4, 1.1);
    for (let i = 0; i < 2; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0x101010, metalness: 0.5 })); d.position.set(15.9 + i * 1.1, AY + 1.12, 8.8); this.group.add(d); this.deck = this.deck || []; this.deck.push(d); }
    for (const [x, z] of [[2.3, 20.5], [17.5, 20.5], [17.5, 10.1]]) { G.box(x - 0.3, AY, z - 0.3, x + 0.3, AY + 1.6, z + 0.3, 'black'); col(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1.6); }
    // neon signs
    const s1 = this.textPlane("FAI'S BAR", 512, 128, '#ff4fd0', 2.4, 0.6, true); s1.position.set(8.0, AY + 2.85, 8.05); this.group.add(s1);
    const s2 = this.textPlane('THE ATTIC CLUB', 512, 128, '#40e0ff', 3.2, 0.8, true); s2.position.set(2.05, AY + 1.9, 15.6); s2.rotation.y = Math.PI / 2; this.group.add(s2);
    this.signs = [s1, s2];
    // disco ball
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08, flatShading: true }));
    ball.position.set(12.8, TOP - 0.55, 14.6);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.25, 4), M.metal); wire.position.set(12.8, TOP - 0.12, 14.6);
    this.group.add(ball, wire);
    this.ball = ball;
    // moving coloured lights (only lit while someone is up here)
    // (kept in the scene permanently, only dimmed: toggling lights in and out changes the
    // light count, which makes three.js recompile every material — a long hitch)
    this.lights = [0xff2080, 0x20c0ff, 0xffd020].map(c => { const l = new THREE.PointLight(c, 0, 9, 1.4); l.position.set(12.8, TOP - 0.4, 14.6); H.group.add(l); return l; });
    for (const m of G.build(M)) { this.group.add(m); H.staticMeshes.push(m); }
    // seats: hiding-spot style (synced occupancy), each facing its pole
    this.seats = [];
    for (const [id, S, label] of [['club_seat', SEAT, 'SIT AT YASMIN\'S TABLE'], ['club_seat2', SEAT2, 'SIT IN FRONT OF AJAN\'S POLE']]) {
      const spot = { id, type: 'clubseat', doors: [], open: 0, target: 0, inside: S.clone(), exit: new THREE.Vector3(S.x, AY, S.z - 0.95), yaw: Math.PI, camY: 1.12, occupant: null, label };
      H.hides.set(spot.id, spot);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(S.x, AY + 0.6, S.z);
      this.group.add(pick);
      H.register(id, 'hide', [pick], S.clone().add(new THREE.Vector3(0, 0.6, 0)), { spot });
      this.seats.push(spot);
    }
    this.seat = this.seats[0];
    this.group.updateMatrixWorld(true);
  }

  textPlane(text, w, h, color, sw, sh, neon = false) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    x.font = `bold ${Math.floor(h * 0.62)}px VT323, monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (neon) { x.shadowColor = color; x.shadowBlur = h * 0.25; }
    x.fillStyle = color; x.fillText(text, w / 2, h / 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    return m;
  }

  // ------------------------------------------------------------ music: inside the room only
  updateMusic(dt, here) {
    const want = here ? 0.85 : 0;
    this.musicVol = damp(this.musicVol, want, here ? 2.5 : 3.5, dt);
    if (here && !this.music) {
      // one instance per visit; it loops until we leave, then fades out
      this.music = audio.play('song1', { loop: true, vol: 0, bus: audio.musicBus });
    }
    if (this.music) {
      this.music.setVol(this.musicVol);
      if (!here && this.musicVol < 0.01) { this.music.stop(0.05); this.music = null; this.musicVol = 0; }
    }
    // the house's own music ducks while you're in the club
    audio.musicBus && (this.game.clubDuck = here);
  }

  // ------------------------------------------------------------ Yasmin
  /** Her dance is a function of server time: same on every client. */
  yasminPose(T) {
    // slow walk around the pole, with a quicker spin every 14 s and a short pause every 30 s
    const cyc = Math.floor(T / 14), u = T - cyc * 14;
    const spinK = clamp((u - 9) / 3, 0, 1), spinS = spinK * spinK * (3 - 2 * spinK);
    const theta = T * 0.42 + cyc * 1.7 * 1.5 + 1.7 * 1.5 * spinS;
    const pause = (T % 30) > 26;
    return { theta, spin: u > 9 && u < 12 ? Math.sin((u - 9) / 3 * Math.PI) : 0, pause };
  }

  animYasmin(dt) {
    const av = this.yasmin, T = this.game.net.serverNow() / 1000;
    const { theta, spin, pause } = this.yasminPose(T);
    const R = 0.44;
    const x = POLE_Y.x + Math.sin(theta) * R, z = POLE_Y.z + Math.cos(theta) * R;
    av.group.position.set(x, AY + 0.05, z);
    // facing along the circle (counter-clockwise); the pole is on her right
    const ry = theta + Math.PI / 2 + 0.25;
    av.group.rotation.y = angleLerp(av.group.rotation.y, ry, Math.min(1, dt * 8));
    const k = 1 - Math.exp(-8 * dt), t = av.t;
    const beat = T * Math.PI * 2 * 1.65;
    const sway = Math.sin(beat / 2), step = Math.sin(beat);
    // legs: small heel-to-toe steps in time; a leg kicks out during the spin
    this._set3(av, 'thighL', -0.12 - Math.max(0, step) * 0.25 - spin * 0.5, 0, 0.05 + spin * 0.35, k);
    this._set3(av, 'thighR', -0.12 - Math.max(0, -step) * 0.25, 0, -0.05, k);
    this._set3(av, 'shinL', 0.2 + Math.max(0, step) * 0.35 + spin * 0.6, 0, 0, k);
    this._set3(av, 'shinR', 0.2 + Math.max(0, -step) * 0.35, 0, 0, k);
    // hips sway side to side, torso rolls the other way; she leans out from the pole when spinning
    this._set3(av, 'hips', 0, sway * 0.22, sway * 0.12 + spin * 0.18, k);
    const roll = Math.sin(beat / 4);
    this._set3(av, 'spine', 0.05 + roll * 0.08, -sway * 0.12, -sway * 0.06 - spin * 0.15, k);
    this._set3(av, 'chest', -0.05 - roll * 0.1, -sway * 0.1, -spin * 0.1, k);
    this._set3(av, 'head', -0.05 + Math.sin(beat / 2 + 1) * 0.08 - spin * 0.25, sway * 0.25 - 0.35, spin * 0.2, k);
    // right hand on the pole (raised), left arm flowing
    this._set3(av, 'upperR', 0.1, 0.55, -0.6 - spin * 0.25, k);
    this._set3(av, 'foreR', 0, 0.55, 0, k);
    this._set3(av, 'upperL', pause ? 0 : Math.sin(beat / 2) * 0.4, -0.2, pause ? -1.1 : -0.45 + Math.sin(beat / 4) * 0.5, k);
    this._set3(av, 'foreL', 0, pause ? -0.2 : -0.6 - Math.sin(beat / 2) * 0.4, 0, k);
    av.body.position.y = damp(av.body.position.y, -0.02 - Math.abs(step) * 0.035 + spin * 0.02, 10, dt);
    // soft-tissue follow-through: springs driven by the body's vertical/lateral motion
    const J = this.yasJig;
    av.mesh.updateMatrixWorld(true);
    const hp = av.bones.hips.getWorldPosition(new THREE.Vector3());
    if (J.last && dt > 0) {
      const v = hp.clone().sub(J.last).divideScalar(dt);
      const acc = v.clone().sub(J.lastV).divideScalar(dt).clampLength(0, 30);
      J.lastV.copy(v);
      // her steps land on the beat: a bounce on every step, a softer sway with the hips
      const drive = pause ? 0.35 : 1;
      acc.y += drive * 1.8 * Math.sin(beat);
      acc.x += drive * 0.9 * Math.cos(beat / 2);
      // to the mesh's local frame (the avatar only rotates about y)
      const c = Math.cos(-av.group.rotation.y), s = Math.sin(-av.group.rotation.y);
      const ax = acc.x * c - acc.z * s, az = acc.x * s + acc.z * c;
      // softer, bouncier springs (less damping, more drive) for a livelier follow-through
      // (gain is metres of sway per m/s² of hip acceleration; her dance bob is ~5 m/s²)
      for (const [o, ov, K, D, gain] of [[J.c, J.cv, 95, 3.2, 0.0024], [J.b, J.bv, 80, 3.0, 0.0028]]) {
        ov.x += (-K * o.x - D * ov.x - ax * gain * K) * dt;
        ov.y += (-K * o.y - D * ov.y - acc.y * gain * K) * dt;
        ov.z += (-K * o.z - D * ov.z - az * gain * K) * dt;
        o.addScaledVector(ov, dt);
        o.clampLength(0, 0.016); // capped at ~2.7 cm on the real character: bouncy, never deforming
      }
    }
    J.last = hp;
    av.uniforms.uJigC.value.copy(J.c);
    av.uniforms.uJigB.value.copy(J.b);
  }

  _set3(av, name, x, y, z, k) { av._set(name, x, y, z, k); }

  /** Where money aimed at Yasmin should land / be aimed. */
  yasminTarget() { return this.yasmin ? this.yasmin.group.position.clone().add(new THREE.Vector3(0, 1.15, 0)) : POLE_Y.clone().add(new THREE.Vector3(0, 1.2, 0)); }

  // ------------------------------------------------------------ Fai
  faiPrompt() {
    if (this.fai.busy) return this.fai.customer === this.game.localId ? '<span class="dim">Fai is getting your drink…</span>' : '<span class="dim">FAI IS BUSY</span>';
    return 'E — TALK TO FAI';
  }

  /** Host: someone wants to talk to Fai. */
  hostTalk(pid) {
    const G = this.game;
    if (this.fai.busy) { G.broadcast({ k: 'msg', text: 'Fai is busy with someone else.' }, pid); return; }
    this.fai.busy = true;
    this.fai.customer = pid;
    clearTimeout(this.fai.timeout);
    this.fai.timeout = setTimeout(() => { if (this.fai.mode === 'talk' || this.fai.mode === 'menu') G.broadcast({ k: 'faidone' }); }, 25000);
    G.broadcast({ k: 'faitalk', pid, at: G.net.serverNow() });
  }

  /** Host: the customer picked a drink. */
  hostDrink(pid, drink) {
    const G = this.game;
    if (!this.fai.busy || this.fai.customer !== pid || this.fai.mode === 'serve') return;
    if (!DRINKS[drink]) { G.broadcast({ k: 'faidone' }); return; }
    const p = G.players.get(pid);
    const serveX = clamp(p?.pos.x ?? 8, 4.6, 11.4);
    const id = `drink_${++this.fai.served}`;
    const at = G.net.serverNow() + 150;
    G.broadcast({ k: 'faiserve', pid, drink, serveX, id, at });
    clearTimeout(this.fai.timeout);
    const plan = this.servePlan(drink, serveX, at);
    this.fai.timeout = setTimeout(() => G.broadcast({ k: 'faidone' }), plan.end - G.net.serverNow() + 200);
  }

  applyTalk(e) {
    const G = this.game;
    this.fai.busy = true;
    this.fai.customer = e.pid;
    this.fai.mode = 'talk';
    this.fai.talkAt = e.at;
    audio.play('fai', { pos: FAI_HOME.clone().add(new THREE.Vector3(0, 1.5, 0)), vol: 1.0, ref: 3, rolloff: 1.4 });
    if (e.pid === G.localId) {
      const dur = (audio.duration('fai') || 2.7) * 1000;
      setTimeout(() => { if (this.fai.mode === 'talk' && this.fai.customer === G.localId) { this.fai.mode = 'menu'; G.openDrinkMenu(); } }, dur);
    }
  }

  applyServe(e) {
    this.fai.mode = 'serve';
    this.fai.customer = e.pid;
    this.fai.plan = this.servePlan(e.drink, e.serveX, e.at);
    this.fai.plan.drink = e.drink;
    this.fai.plan.id = e.id;
    if (this.fai.drinkMesh) this.fai.drinkMesh.parent?.remove(this.fai.drinkMesh);
    this.fai.drinkMesh = makeDrinkMesh(e.drink);
    this.fai.drinkMesh.visible = false;
    this.group.add(this.fai.drinkMesh);
    this.game.closeDrinkMenu?.();
  }

  applyDone() {
    this.fai.busy = false;
    this.fai.customer = null;
    if (this.fai.mode !== 'serve' || !this.fai.plan) this.fai.mode = 'idle';
    if (this.game.drinkMenuOpen) this.game.closeDrinkMenu();
  }

  /** Fai's serving route: to the drink, reach for it, bring it to the customer, hand it over. */
  servePlan(drink, serveX, at) {
    const sx = DRINKS[drink].x;
    const walk = 1.25;
    const seg = [];
    let t = at;
    const add = (type, dur, data) => { seg.push({ type, t0: t, t1: t + dur * 1000, ...data }); t += dur * 1000; };
    add('turn', 0.45, { to: Math.PI });
    add('walk', Math.abs(sx - FAI_HOME.x) / walk + 0.15, { from: FAI_HOME.x, to: sx, z0: FAI_HOME.z, z1: 9.0 });
    add('reach', 1.1, { x: sx });          // takes the drink at the midpoint
    add('turn', 0.5, { from: Math.PI, to: 0 });
    add('walk', Math.abs(serveX - sx) / walk + 0.15, { from: sx, to: serveX, z0: 9.0, z1: 9.6 });
    add('serve', 1.2, { x: serveX });      // sets it down on the counter at the midpoint
    add('walk', Math.abs(FAI_HOME.x - serveX) / walk + 0.15, { from: serveX, to: FAI_HOME.x, z0: 9.6, z1: FAI_HOME.z });
    const r = seg.find(q => q.type === 'reach'), v = seg.find(q => q.type === 'serve');
    return { seg, end: t, tTake: r.t0 + (r.t1 - r.t0) * 0.5, tGive: v.t0 + (v.t1 - v.t0) * 0.55 };
  }

  animFai(dt, now) {
    const av = this.faiAv, F = this.fai;
    if (!av) { this.tickServe(now); return; }
    const g = av.group;
    let speed = 0, arm = null, faceTo = null;
    if (F.mode === 'serve' && F.plan) {
      // Everything follows the shared timeline, so a long frame (or a client that
      // wasn't looking) never skips the walk, the pick-up or the hand-over.
      const P = F.plan;
      let x = FAI_HOME.x, z = FAI_HOME.z, s = P.seg[P.seg.length - 1];
      for (const q of P.seg) {
        if (q.type === 'walk' && now >= q.t0) {
          const kk = clamp((now - q.t0) / (q.t1 - q.t0), 0, 1), e = kk * kk * (3 - 2 * kk);
          x = q.from + (q.to - q.from) * e; z = q.z0 + (q.z1 - q.z0) * e;
        }
        if (now < q.t1) { s = q; break; }
      }
      g.position.set(x, AY, z);
      const k = clamp((now - s.t0) / (s.t1 - s.t0), 0, 1);
      if (s.type === 'walk') {
        speed = now >= s.t0 && now < s.t1 ? 1.2 : 0;
        if (Math.abs(s.to - s.from) > 0.05) faceTo = Math.atan2(s.to - s.from, 0);
        else faceTo = s.z1 > s.z0 ? 0 : Math.PI;
      } else if (s.type === 'turn') {
        faceTo = s.to;
      } else if (s.type === 'reach') {
        faceTo = Math.PI;
        arm = { kind: 'reach', k: Math.sin(k * Math.PI) };
      } else if (s.type === 'serve') {
        faceTo = 0;
        arm = { kind: 'serve', k: Math.sin(k * Math.PI) };
      }
      if (F.drinkMesh && !F.drinkMesh.userData.placed) F.drinkMesh.userData.inHand = now >= P.tTake && now < P.tGive;
      this.tickServe(now);
    } else if (F.mode === 'talk' || F.mode === 'menu') {
      const c = this.game.players.get(F.customer);
      if (c?.pos) faceTo = Math.atan2(c.pos.x - g.position.x, c.pos.z - g.position.z);
      arm = { kind: 'talk', k: 1 };
    } else {
      // idle: wipe the counter, glance at whoever's nearest
      g.position.x = damp(g.position.x, FAI_HOME.x, 3, dt);
      g.position.z = damp(g.position.z, FAI_HOME.z, 3, dt);
      let best = null, bd = 6;
      for (const p of this.game.players.values()) { if (!p.pos || !p.alive) continue; const d = p.pos.distanceTo(g.position); if (d < bd) { bd = d; best = p; } }
      faceTo = best ? Math.atan2(best.pos.x - g.position.x, best.pos.z - g.position.z) : 0;
      faceTo = clamp(faceTo, -1.0, 1.0);
      arm = { kind: 'wipe', k: 1 };
    }
    if (faceTo !== null) this.faiRy = angleLerp(this.faiRy, faceTo, Math.min(1, dt * 6));
    g.rotation.y = this.faiRy;
    av.update(dt, { speed, crouch: 0, run: false, mode: 'normal', interactT: 9, turn: 0, flash: false, pitch: 0 });
    const k = 1 - Math.exp(-10 * dt), t = av.t;
    if (arm?.kind === 'reach') {
      av._set('upperR', -0.4 * arm.k, 1.0 * arm.k, 1.3 - 1.0 * arm.k, k * 2);
      av._set('foreR', 0, 0.4 - 0.3 * arm.k, 0, k * 2);
    } else if (arm?.kind === 'serve') {
      av._set('upperR', -0.15 * arm.k, 1.2 * arm.k, 1.3 - 1.15 * arm.k, k * 2);
      av._set('foreR', 0, 0.3 * (1 - arm.k), 0, k * 2);
    } else if (arm?.kind === 'talk') {
      av._set('upperR', 0, 0.5 + Math.sin(t * 3) * 0.15, 1.1, k);
      av._set('foreR', 0, 1.2 + Math.sin(t * 4) * 0.25, 0, k);
      av._set('head', -0.05 + Math.sin(t * 5) * 0.04, 0, 0, k);
    } else if (arm?.kind === 'wipe') {
      av._set('upperR', -0.1, 0.9 + Math.sin(t * 2.2) * 0.15, 0.55 + Math.cos(t * 2.2) * 0.12, k);
      av._set('foreR', 0, 0.5, 0, k);
    }
    // the drink travels in her right hand
    const D = F.drinkMesh;
    if (D?.userData.inHand) {
      D.visible = true;
      av.mesh.updateMatrixWorld(true);
      D.position.copy(av.hand('R')).add(new THREE.Vector3(0, -0.06, 0));
      D.rotation.set(0, 0, 0);
    } else if (D && F.mode === 'serve' && F.plan && !D.userData.placed) D.visible = false;
  }

  /** Timeline bookkeeping that must happen on every client, looking or not. */
  tickServe(now) {
    const F = this.fai, P = F.plan;
    if (F.mode !== 'serve' || !P) return;
    if (now >= P.tGive && !P.given) this.putDownDrink();
    if (now >= P.end) { F.mode = 'idle'; F.plan = null; }
  }

  putDownDrink() {
    const F = this.fai, P = F.plan, D = F.drinkMesh;
    P.given = true;
    if (D) { D.userData.inHand = false; D.userData.placed = true; D.parent?.remove(D); }
    // the drink is a real item now, on the counter in front of the customer
    const x = P.seg.find(s => s.type === 'serve').x;
    this.game.placeItem(P.id, P.drink, { pos: [x, COUNTER_Y, COUNTER_Z] });
    audio.play('click', { pos: new THREE.Vector3(x, COUNTER_Y, COUNTER_Z), vol: 0.5, rate: 0.8 });
    if (F.customer === this.game.localId) this.game.message(`Fai slides you a ${DRINKS[P.drink].name.toLowerCase()}. It's on the counter.`, 4);
    F.drinkMesh = null;
  }

  // ------------------------------------------------------------ money
  /** Which dancer the local player is aiming money at (or null). */
  aimTarget() {
    const G = this.game, cam = G.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const best = [];
    const test = (name, p) => { const d = p.clone().sub(cam.position); const a = dir.angleTo(d.normalize()); best.push([a, name]); };
    test('yasmin', this.yasminTarget());
    test('yasmin', POLE_Y.clone().add(new THREE.Vector3(0, 1.2, 0))); // her pole counts too, wherever she is round it
    const v = G.ajanVis;
    if (v && (v.m === 'dance' || v.m === 'move') && v.st === 'club' && inClub(v.pos)) test('ajan', v.pos.clone().add(new THREE.Vector3(0, 1.4, 0)));
    best.sort((a, b) => a[0] - b[0]);
    return best[0] && best[0][0] < 0.45 ? best[0][1] : null;
  }

  targetPoint(target) {
    if (target === 'yasmin') return this.yasminTarget().setY(AY);
    if (target === 'ajan') return this.game.ajanVis.pos.clone().setY(AY);
    const cam = this.game.camera;
    return cam.position.clone().addScaledVector(cam.getWorldDirection(new THREE.Vector3()).setY(0).normalize(), 3).setY(AY);
  }

  /** Bills fly from the thrower's hand to the target and flutter down around it. */
  throwBills(from, target, seed) {
    const R = mulberry32(seed);
    const to = this.targetPoint(target);
    if (!this.billMesh) {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
      const x = cv.getContext('2d'); x.fillStyle = '#5a8a4a'; x.fillRect(0, 0, 64, 32); x.strokeStyle = '#2a4a20'; x.lineWidth = 3; x.strokeRect(3, 3, 58, 26);
      x.fillStyle = '#2a4a20'; x.beginPath(); x.arc(32, 16, 8, 0, 7); x.fill(); x.font = 'bold 12px monospace'; x.fillText('20', 6, 14);
      this.billMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.155, 0.066), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide, roughness: 0.9 }), 400);
      this.billMesh.count = 0;
      this.billMesh.frustumCulled = false;
      this.group.add(this.billMesh);
    }
    for (let i = 0; i < 7; i++) {
      const land = to.clone().add(new THREE.Vector3((R() - 0.5) * 1.2, 0, (R() - 0.5) * 1.2));
      const T = 0.75 + R() * 0.35;
      const v = new THREE.Vector3((land.x - from.x) / T, (land.y - from.y + 0.5 * 4.0 * T * T) / T, (land.z - from.z) / T);
      if (this.bills.length >= 400) this.bills.shift();
      this.bills.push({ p: from.clone().add(new THREE.Vector3((R() - 0.5) * 0.1, (R() - 0.5) * 0.05, (R() - 0.5) * 0.1)), v, rot: new THREE.Euler(R() * 6, R() * 6, R() * 6), w: new THREE.Vector3((R() - 0.5) * 14, (R() - 0.5) * 10, (R() - 0.5) * 14), ph: R() * 6, rest: false });
    }
  }

  updateBills(dt) {
    if (!this.billMesh) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (const b of this.bills) {
      if (!b.rest) {
        // paper: light gravity, lots of drag, a sideways flutter
        b.v.y -= 4.0 * dt;
        b.v.multiplyScalar(1 - Math.min(0.9, dt * 0.25));
        b.p.addScaledVector(b.v, dt);
        b.p.x += Math.sin(performance.now() / 180 + b.ph) * 0.15 * dt;
        b.rot.x += b.w.x * dt; b.rot.y += b.w.y * dt; b.rot.z += b.w.z * dt;
        const floor = AY + 0.006 + (b.ph % 1) * 0.004;
        if (b.p.y <= floor) {
          b.p.y = floor; b.rest = true;
          b.rot.set(-Math.PI / 2, 0, b.rot.z); // flat on the floor
        }
        // keep them inside the room
        b.p.x = clamp(b.p.x, CLUB.x0 + 0.15, CLUB.x1 - 0.15);
        b.p.z = clamp(b.p.z, CLUB.z0 + 0.15, CLUB.z1 - 0.15);
      }
    }
    this.bills.forEach((b, i) => { q.setFromEuler(b.rot); m4.compose(b.p, q, one); this.billMesh.setMatrixAt(i, m4); });
    this.billMesh.count = this.bills.length;
    this.billMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ host: money and the AJAN visit
  hostRain(pid, target) {
    const G = this.game, p = G.players.get(pid), b = G.brain;
    if (!p || !p.alive || !p.hidden || !CLUB_SEATS.includes(p.hideId)) return;
    const now = Date.now();
    this.lastRain = this.lastRain || new Map();
    if (now - (this.lastRain.get(pid) || 0) < 650) return; // one throw at a time
    const bal = this.balance(pid);
    if (bal < RAIN_COST) { G.broadcast({ k: 'msg', text: `You're out of money ($${bal}).` }, pid); return; }
    if (target === 'ajan' && !(b?.state === 'club' && (b.clubPhase === 'dance' || b.clubPhase === 'enter'))) target = null;
    if (target !== 'yasmin' && target !== 'ajan') target = null;
    this.lastRain.set(pid, now);
    G.broadcast({ k: 'rain', pid, target, money: bal - RAIN_COST, seed: (Math.random() * 1e9) | 0 });
    if (target === 'yasmin') {
      // her reaction, exactly two seconds after the first throw of this visit
      // (announced now with its server-time due moment; every client schedules it on its audio clock)
      if (!this.visitYasmin) { this.visitYasmin = true; G.broadcast({ k: 'clubsnd', s: 'yasmin', at: G.net.serverNow() + 2000 }); }
      // and five seconds after the very first one, he hears the party
      if (!this.eventStarted) { this.eventStarted = true; this.ajanDueAt = now + 5000; }
    }
    if (target === 'ajan') {
      if (now - (this.lastAjanSnd || 0) > 2500) { this.lastAjanSnd = now; G.broadcast({ k: 'clubsnd', s: 'ajanmoney' }); }
      // the nap countdown starts at the first money he gets and is never reset
      if (!this.ajanPaidAt) { this.ajanPaidAt = now; this.ajanSleepAt = now + 15000 + Math.random() * 5000; }
    }
  }

  hostUpdate(dt) {
    const G = this.game, b = G.brain, now = Date.now();
    if (!b) return;
    if (this.ajanDueAt && now >= this.ajanDueAt) {
      if (b.startClub()) { this.ajanDueAt = 0; G.broadcast({ k: 'clubsnd', s: 'ajanenters' }); } else this.ajanDueAt = now + 1000;
    }
    // the nap timer: he wanders off to his own bed (never just drops by the pole)
    if (this.ajanSleepAt && now >= this.ajanSleepAt && b.state === 'club') { b.clubSleep(); this.ajanSleepAt = 0; G.broadcast({ k: 'clubsnd', s: 'ajanleaves' }); }
    const up = [...G.players.values()].some(p => p.alive && !p.escaped && p.pos && p.pos.y > 5.6);
    this.emptyFor = up ? 0 : (this.emptyFor || 0) + dt;
    if (this.emptyFor > 10) this.visitYasmin = false; // a fresh visit next time
    // everyone left the attic while he was still dancing: he leaves too and the hunt resumes
    if (b.state === 'club' && b.clubPhase === 'dance' && this.emptyFor > 30) b.endClub();
  }

  applyRain(e) {
    const G = this.game;
    this.money.set(e.pid, e.money);
    const p = G.players.get(e.pid);
    let from;
    if (e.pid === G.localId) {
      G.local.throwMoney?.();
      from = G.camera.position.clone().add(G.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.4)).add(new THREE.Vector3(0.15, -0.15, 0));
    } else from = (p?.pos || SEAT).clone().add(new THREE.Vector3(0, 1.2, 0));
    // bills leave the hand a beat into the throw
    setTimeout(() => this.throwBills(from, e.target, e.seed), e.pid === G.localId ? 180 : 0);
    audio.play('pickup', { pos: from, vol: 0.4, rate: 1.6 });
    G.updateHUD();
  }

  applySound(e) {
    const G = this.game, here = inClub(G.camera.position);
    if (e.s === 'yasmin' && here) {
      const delay = Math.max(0, ((e.at ?? G.net.serverNow()) - G.net.serverNow()) / 1000);
      audio.play('yasmin', { pos: this.yasminTarget(), vol: 1.0, ref: 3, rolloff: 1.2, delay });
    }
    if (e.s === 'ajanmoney' && here) audio.play('sleep', { pos: G.ajanVis.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), vol: 1.1, ref: 3, duration: 3 });
    if (e.s === 'ajanenters' && G.camera.position.y > 5.6) G.message('Heavy footsteps somewhere below… coming this way.', 4);
    if (e.s === 'ajanleaves' && here) G.message('AJAN yawns, waves the money away and shuffles off to bed…', 4);
  }

  // ------------------------------------------------------------ per frame
  update(dt, now) {
    if (this.game.isHost && this.game.phase === 'play') this.hostUpdate(dt);
    const G = this.game, cam = G.camera.position;
    const here = inClub(cam);
    this.updateMusic(dt, here && G.phase !== 'ended');
    const near = cam.y > 5.2 && cam.x < 26;   // up here: animate the club
    this.group.visible = near;
    this.updateBills(dt);
    if (!near) { this.lights.forEach(l => { l.intensity = 0; }); this.tickServe(now); return; }
    const t = now / 1000;
    // dance floor tiles chase in colour with the beat
    const beat = Math.floor(t * 1.65 * 2);
    const pal = [0xff2080, 0x20c0ff, 0xffd020, 0x9040ff, 0x20ff80, 0x200830];
    const c = new THREE.Color();
    for (let i = 0; i < 30; i++) {
      const a = i % 6, b = Math.floor(i / 6);
      c.setHex(pal[(a + b + beat) % pal.length]).multiplyScalar(((a + b + beat) % 3 === 0) ? 0.8 : 0.25);
      this.tiles.setColorAt(i, c);
    }
    this.tiles.instanceColor.needsUpdate = true;
    this.ball.rotation.y = t * 0.6;
    this.lights.forEach((l, i) => {
      const a = t * (0.7 + i * 0.25) + i * 2.1;
      l.position.set(12.8 + Math.sin(a) * 2.6, TOP - 0.4, 14.6 + Math.cos(a * 1.3) * 2.4);
      l.intensity = 7 + Math.sin(t * 6 + i) * 2;
    });
    this.deck?.forEach(d => { d.rotation.y = t * 3.5; });
    if (this.yasmin) this.yasmin.update(dt);
    this.animFai(dt, now);
  }

  dispose() {
    this.music?.stop(0.1);
    this.music = null;
  }
}
