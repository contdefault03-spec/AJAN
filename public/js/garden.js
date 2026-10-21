// The walled garden behind the house: grass, hedges, flower beds, a bench, a hose reel
// and an old stone well. The well's crank lever is missing: it lies somewhere in the
// house (a different spot each round). Bring it to the well, fit it, crank the bucket up
// and take what's inside. Players get into the garden by climbing through the child's
// bedroom window; Ajan uses his own door (bolted for everyone else).
// The host decides everything (lever fitted, cranking, who takes the item).
import * as THREE from 'three';
import { audio } from './audio.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const WELL = V(20, 0, -7);
const CRANK_TIME = 4;
// where the lever can turn up (floor spots that are clear in every round)
const LEVER_SPOTS = [[25.6, 0, 19.4], [44.2, 0, 11.6], [8.9, 3.4, 3.4], [16.4, 3.4, 15.2], [31.6, -3.2, 17.2], [53.6, 3.4, 11.8], [2.6, 0, 18.8]];
// the climbable window (child's bedroom, north wall) — inside and outside standing points
const WIN = { x: 16.0, inside: V(16.0, 0, 0.75), outside: V(16.0, 0, -0.85) };

export class Garden {
  constructor(game) {
    this.game = game;
    this.state = { lever: false, cranking: false, up: false };
    this.crankAt = 0;
    this.bucketY = -2.6;
  }

  init() {
    const G = this.game, H = G.house;
    const g = this.group = new THREE.Group();
    H.group.add(g);
    const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
    const box = (w, h, d, m, x, y, z, ry = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
    // ground: grass with a gravel path from the window to the well
    const T = gardenTextures();
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(36, 14), new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1, color: 0x9aa890 }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(20, 0.002, -7); grass.receiveShadow = true; g.add(grass);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 6.2), mat(0x4a4640));
    path.rotation.x = -Math.PI / 2; path.position.set(18, 0.006, -3.6); path.rotation.z = 0.35; g.add(path);
    // fence pickets on top of the low garden walls
    const wood = new THREE.MeshStandardMaterial({ map: T.bark, roughness: 0.95, color: 0x8a7a68 });
    const stone = new THREE.MeshStandardMaterial({ map: T.stone, roughness: 0.95 });
    const leaf = new THREE.MeshStandardMaterial({ map: T.leaves, roughness: 0.9, color: 0x8aa080 });
    const dark = mat(0x111111, { metalness: 0.5, roughness: 0.5 });
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.5);
      for (let i = 0; i <= n; i++) box(0.08, 0.9, 0.08, wood, x0 + (x1 - x0) * i / n, 1.65, z0 + (z1 - z0) * i / n);
      const ry = Math.atan2(x1 - x0, z1 - z0);
      box(0.05, 0.08, len, wood, (x0 + x1) / 2, 1.85, (z0 + z1) / 2, ry);
    };
    fence(2, -14, 38, -14); fence(2, -14, 2, 0); fence(38, -14, 38, 0);
    // hedges and flower beds
    for (const [x, z, w, d] of [[5, -12.6, 5, 1.2], [14, -12.6, 6, 1.2], [27, -12.6, 6, 1.2], [35, -12.6, 4, 1.2], [3.2, -6, 1.2, 7], [36.8, -6, 1.2, 7]]) {
      // a hedge: a leafy core with clumps bulging out of it, so the top isn't a flat box
      const core = box(w, 1.0, d, leaf, x, 0.5, z);
      core.material = leaf;
      for (let k = 0; k < Math.round((w + d) * 2.2); k++) {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 + Math.random() * 0.22, 1), leaf);
        c.position.set(x + (Math.random() - 0.5) * w, 0.75 + Math.random() * 0.4, z + (Math.random() - 0.5) * d);
        c.scale.y = 0.7; c.castShadow = true; g.add(c);
      }
      H.collider(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0, 1.1, { furniture: true });
    }
    const flowerCols = [0x7a1020, 0xc0a020, 0x8a3a8a, 0xd0d0c0];
    for (const [x, z] of [[9, -4], [30, -4], [9, -10], [30, -10]]) {
      box(3, 0.25, 1.2, new THREE.MeshStandardMaterial({ map: T.soil, roughness: 1 }), x, 0.12, z);
      H.collider(x - 1.5, z - 0.6, x + 1.5, z + 0.6, 0, 0.3, { furniture: true });
      for (let i = 0; i < 14; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), mat(flowerCols[i % 4])); f.position.set(x - 1.3 + (i % 7) * 0.43, 0.38, z - 0.3 + Math.floor(i / 7) * 0.6); g.add(f); }
    }
    // a bench, a hose reel on the house wall, a lamp post
    box(1.8, 0.08, 0.5, wood, 25, 0.48, -2.2); box(1.8, 0.5, 0.06, wood, 25, 0.75, -1.97);
    for (const dx of [-0.8, 0.8]) box(0.08, 0.48, 0.45, dark, 25 + dx, 0.24, -2.2);
    H.collider(24.1, -2.45, 25.9, -1.95, 0, 0.55, { furniture: true });
    const reel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 18), mat(0x2a6a2a));
    reel.position.set(11.5, 0.8, -0.25); g.add(reel);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(11.5, 0.55, -0.3), V(11.0, 0.05, -1.2), V(12.2, 0.05, -2.0), V(13.4, 0.05, -1.4)]), 24, 0.03, 6), mat(0x2a6a2a));
    g.add(hose);
    box(0.12, 2.6, 0.12, dark, 12, 1.3, -6.2); box(0.35, 0.35, 0.35, mat(0xfff0c0, { emissive: 0x806030 }), 12, 2.7, -6.2);
    H.collider(11.9, -6.3, 12.1, -6.1, 0, 2.6);

    // ---------------------------------------------------------- grass tufts: thousands of crossed
    // blade cards (one instanced draw call), thinner on the path and under the beds
    const tuft = new THREE.PlaneGeometry(0.42, 0.34); tuft.translate(0, 0.17, 0);
    const tuft2 = tuft.clone(); tuft2.rotateY(Math.PI / 2);
    const blades = mergeTwo(tuft, tuft2);
    const bladeMat = new THREE.MeshStandardMaterial({ map: T.blades, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xa0b090 });
    const N = 5200, im = new THREE.InstancedMesh(blades, bladeMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0);
    let n = 0;
    for (let i = 0; i < N * 2 && n < N; i++) {
      const x = 2.3 + Math.random() * 35.4, z = -13.7 + Math.random() * 13.4;
      if (Math.hypot(x - WELL.x, z - WELL.z) < 1.2) continue;
      if (Math.abs((z + 3.6) - (x - 18) * -0.37) < 0.8 && z > -6.8) continue; // the gravel path
      if ([[9, -4], [30, -4], [9, -10], [30, -10]].some(([bx, bz]) => Math.abs(x - bx) < 1.6 && Math.abs(z - bz) < 0.7)) continue;
      const k = 0.6 + Math.random() * 0.9;
      m4.compose(V(x, 0, z), q.setFromAxisAngle(up, Math.random() * Math.PI), V(k, k * (0.7 + Math.random() * 0.6), k));
      im.setMatrixAt(n++, m4);
    }
    im.count = n;
    im.receiveShadow = true;
    g.add(im);
    // a few stepping stones and rocks
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.25, 0), stone);
      r.position.set(4 + Math.random() * 32, 0.05, -1 - Math.random() * 12); r.scale.y = 0.45; r.rotation.y = Math.random() * 6; g.add(r);
    }

    // ---------------------------------------------------------- the well
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.85, 20, 1, true), stone);
    ring.material.side = THREE.DoubleSide;
    ring.position.set(WELL.x, 0.42, WELL.z); g.add(ring);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.08, 6, 20), stone);
    rim.rotation.x = Math.PI / 2; rim.position.set(WELL.x, 0.86, WELL.z); g.add(rim);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0x020202 }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(WELL.x, 0.3, WELL.z); g.add(hole);
    for (const dx of [-1.0, 1.0]) box(0.12, 2.0, 0.12, wood, WELL.x + dx, 1.0, WELL.z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 4), wood);
    roof.position.set(WELL.x, 2.35, WELL.z); roof.rotation.y = Math.PI / 4; g.add(roof);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 10), wood);
    axle.rotation.z = Math.PI / 2; axle.position.set(WELL.x, 1.6, WELL.z); g.add(axle);
    this.axle = axle;
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), mat(0x8a7a5a));
    g.add(this.rope);
    this.bucket = new THREE.Group();
    const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 12, 1, true), mat(0x6a5030, { side: THREE.DoubleSide }));
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), mat(0x4a3820));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.14;
    this.bucket.add(pail, bottom);
    g.add(this.bucket);
    // the crank: hidden until the lever is fitted
    this.crank = new THREE.Group();
    this.crank.position.set(WELL.x + 1.08, 1.6, WELL.z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), dark); arm.position.y = -0.2;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), wood); handle.rotation.z = Math.PI / 2; handle.position.set(0.1, -0.42, 0);
    this.crank.add(arm, handle);
    this.crank.visible = false;
    g.add(this.crank);
    H.collider(WELL.x - 1.05, WELL.z - 1.05, WELL.x + 1.05, WELL.z + 1.05, 0, 1.0, { furniture: true });
    const pick = H.pickBox(WELL.x - 1.2, 0.3, WELL.z - 1.2, WELL.x + 1.2, 2.0, WELL.z + 1.2);
    H.register('well', 'well', [pick], V(WELL.x, 1.2, WELL.z));
    this.placeBucket();

    // ---------------------------------------------------------- the lever and the bucket's item
    const spot = LEVER_SPOTS[Math.floor(G.rnd() * LEVER_SPOTS.length)];
    G.placeItem('well_lever', 'well_lever', { pos: spot });
    G.placeItem('spray_well', 'spray', { pos: [WELL.x, -2.4, WELL.z] });
    const it = G.items.get('spray_well');
    it.inWell = true;
    it.mesh.visible = false;

    // ---------------------------------------------------------- the window, and Ajan's garden door
    for (const [side, p] of [['in', WIN.inside], ['out', WIN.outside]]) {
      const b = H.pickBox(WIN.x - 0.7, 1.0, side === 'in' ? 0.0 : -0.3, WIN.x + 0.7, 2.2, side === 'in' ? 0.3 : 0.0);
      H.register('win_' + side, 'climbwin', [b], V(WIN.x, 1.6, side === 'in' ? 0.2 : -0.2), { side, to: side === 'in' ? WIN.outside : WIN.inside });
    }
    const d = H.doors.get('d_garden');
    if (d) H.collider(d.a0, -0.12, d.a0 + d.w, 0.12, 0, 2.3, { playerOnly: true }); // he can come and go, you can't
  }

  placeBucket() {
    const y = this.bucketY;
    this.bucket.position.set(WELL.x, y, WELL.z);
    const top = 1.6, len = Math.max(0.05, top - (y + 0.15));
    this.rope.scale.y = len;
    this.rope.position.set(WELL.x, top - len / 2, WELL.z);
    const it = this.game.items.get('spray_well');
    if (it && !it.holder && !it.used && it.inWell === false && this.state.up && !it.dropped) it.mesh.position.set(WELL.x, y + 0.02, WELL.z);
  }

  // ------------------------------------------------------------ prompts / local input
  prompt(it) {
    const G = this.game;
    if (it.kind === 'climbwin') return it.side === 'in' ? 'E — CLIMB OUT INTO THE GARDEN' : 'E — CLIMB BACK INSIDE';
    if (it.kind !== 'well') return null;
    const s = this.state;
    if (!s.lever) return G.playerHas(G.localId, 'well_lever') ? 'E — FIT THE CRANK LEVER' : 'E — USE THE WELL  <span class="dim">[THE CRANK IS MISSING]</span>';
    if (s.cranking) return '<span class="dim">CRANKING…</span>';
    if (!s.up) return 'E — CRANK THE BUCKET UP';
    const item = G.items.get('spray_well');
    return item && !item.holder && !item.used ? 'E — TAKE WHAT\'S IN THE BUCKET' : '<span class="dim">THE BUCKET IS EMPTY</span>';
  }

  interact(it) {
    const G = this.game, L = G.local;
    if (it.kind === 'climbwin') {
      if (L.hidden || L.frozen) return true;
      L.act?.();
      G.post?.glitch(0.2);
      L.pos.copy(it.to);
      L.yaw = it.side === 'in' ? 0 : Math.PI;
      audio.play('creak', { vol: 0.6, rate: 1.2 });
      G.request({ k: 'noise', x: WIN.x, y: 0.5, z: 0, r: 4, kind: 'window' });
      return true;
    }
    if (it.kind !== 'well') return false;
    if (this.state.up) { const item = G.items.get('spray_well'); if (item && !item.holder && !item.used) G.request({ k: 'pickup', id: 'spray_well' }); return true; }
    L.act?.();
    G.request({ k: 'well' });
    return true;
  }

  // ------------------------------------------------------------ host
  request(pid, r) {
    if (r.k !== 'well') return false;
    const G = this.game, s = this.state;
    if (!s.lever) {
      if (!G.playerHas(pid, 'well_lever')) { G.broadcast({ k: 'msg', text: 'The well has no crank. Its lever must be somewhere in the house.' }, pid); return true; }
      G.broadcast({ k: 'well', s: 'lever', by: pid });
      G.hostNoise(WELL, 6, 'well', pid);
      return true;
    }
    if (s.cranking || s.up) return true;
    G.broadcast({ k: 'well', s: 'crank', by: pid });
    G.hostNoise(WELL, 10, 'well', pid);
    setTimeout(() => { if (!G.disposed && !this.state.up) G.broadcast({ k: 'well', s: 'up' }); }, CRANK_TIME * 1000);
    return true;
  }

  event(e) {
    if (e.k !== 'well') return false;
    const G = this.game, s = this.state;
    if (e.s === 'lever') {
      s.lever = true;
      const it = G.items.get('well_lever');
      if (it) { it.used = true; it.holder = null; it.mesh.visible = false; }
      this.crank.visible = true;
      audio.play('clank', { pos: WELL, vol: 0.8, ref: 3 });
      if (e.by === G.localId) G.message('The lever fits the well\'s axle.', 3);
    } else if (e.s === 'crank') {
      s.cranking = true;
      this.crankFrom = performance.now();
      audio.play('creak', { pos: WELL, vol: 0.9, ref: 4, rate: 0.6 });
      audio.play('rattle', { pos: WELL, vol: 0.6, ref: 3, rate: 0.7, delay: 1.2 });
      audio.play('creak', { pos: WELL, vol: 0.9, ref: 4, rate: 0.55, delay: 2.4 });
    } else if (e.s === 'up') {
      s.cranking = false; s.up = true;
      const it = G.items.get('spray_well');
      if (it) { it.inWell = false; it.mesh.visible = true; }
      audio.play('clunk', { pos: WELL, vol: 0.8, ref: 3 });
      G.message('The bucket comes up out of the dark. There\'s something in it.', 3.5);
    }
    G.updateHUD();
    return true;
  }

  update(dt) {
    const s = this.state;
    const want = s.up ? 0.95 : s.cranking ? -2.6 + Math.min(1, (performance.now() - this.crankFrom) / (CRANK_TIME * 1000)) * 3.55 : -2.6;
    if (Math.abs(want - this.bucketY) > 0.001) {
      this.bucketY += (want - this.bucketY) * Math.min(1, dt * 6);
      this.axle.rotation.x = this.bucketY * 6;
      this.crank.rotation.x = this.bucketY * 6;
      this.placeBucket();
    }
  }
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'uv']) {
    const A = a.attributes[key].array, B = b.attributes[key].array;
    const arr = new Float32Array(A.length + B.length); arr.set(A); arr.set(B, A.length);
    g.setAttribute(key, new THREE.BufferAttribute(arr, a.attributes[key].itemSize));
  }
  const ia = a.index.array, ib = b.index.array, off = a.attributes.position.count;
  g.setIndex([...ia, ...Array.from(ib, i => i + off)]);
  return g;
}

/** Procedural textures for the garden (canvas-painted once, cached): grass, blades, leaves, soil, bark, stone. */
let TEX = null;
function gardenTextures() {
  if (TEX) return TEX;
  const mk = (size, draw, repeat = 1, alpha = false) => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'); draw(x, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    if (alpha) t.premultiplyAlpha = false;
    return t;
  };
  const R = Math.random;
  const noise = (x, s, cols, n, rmin, rmax) => { for (let i = 0; i < n; i++) { x.fillStyle = cols[Math.floor(R() * cols.length)]; x.globalAlpha = 0.25 + R() * 0.5; x.beginPath(); x.arc(R() * s, R() * s, rmin + R() * (rmax - rmin), 0, 7); x.fill(); } x.globalAlpha = 1; };
  TEX = {
    grass: mk(512, (x, s) => {
      x.fillStyle = '#26361c'; x.fillRect(0, 0, s, s);
      noise(x, s, ['#1d2c15', '#34482a', '#2e3a1e', '#3b4a26', '#45391f'], 2600, 1, 6);
      x.lineWidth = 1.2;
      for (let i = 0; i < 9000; i++) { const px = R() * s, py = R() * s, l = 4 + R() * 9, a = -Math.PI / 2 + (R() - 0.5) * 0.9; x.strokeStyle = ['#4a6a30', '#3a5626', '#5d7a3a', '#2a4018', '#6a7a40'][i % 5]; x.globalAlpha = 0.5 + R() * 0.5; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
      x.globalAlpha = 1;
    }, 9),
    blades: mk(256, (x, s) => {
      x.clearRect(0, 0, s, s);
      for (let i = 0; i < 46; i++) {
        const bx = s * 0.08 + R() * s * 0.84, h = s * (0.45 + R() * 0.55), lean = (R() - 0.5) * s * 0.25, w = 2 + R() * 4;
        const gr = x.createLinearGradient(0, s, 0, s - h);
        gr.addColorStop(0, '#1a2a10'); gr.addColorStop(0.6, ['#4a6e2c', '#3c5a24', '#5a7a34'][i % 3]); gr.addColorStop(1, '#8a9a50');
        x.fillStyle = gr;
        x.beginPath(); x.moveTo(bx - w, s); x.quadraticCurveTo(bx + lean * 0.4, s - h * 0.5, bx + lean, s - h); x.quadraticCurveTo(bx + lean * 0.4 + w * 0.3, s - h * 0.5, bx + w, s); x.fill();
      }
    }, 1, true),
    leaves: mk(256, (x, s) => {
      x.fillStyle = '#132a10'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) {
        x.save(); x.translate(R() * s, R() * s); x.rotate(R() * 6.3);
        x.fillStyle = ['#1f4a18', '#2c5a20', '#183a12', '#3a6a28', '#244018'][i % 5]; x.globalAlpha = 0.7 + R() * 0.3;
        x.beginPath(); x.ellipse(0, 0, 3 + R() * 4, 1.5 + R() * 2, 0, 0, 7); x.fill();
        x.restore();
      }
      x.globalAlpha = 1;
    }, 2),
    soil: mk(256, (x, s) => { x.fillStyle = '#2e2014'; x.fillRect(0, 0, s, s); noise(x, s, ['#22160c', '#3a2a1a', '#4a3a28', '#1a120a'], 1800, 0.8, 3.5); }, 2),
    bark: mk(128, (x, s) => {
      x.fillStyle = '#3a2c1e'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 160; i++) { x.strokeStyle = ['#2a1e12', '#4a3826', '#1e140a'][i % 3]; x.globalAlpha = 0.6; x.lineWidth = 1 + R() * 2; const px = R() * s; x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + (R() - 0.5) * 8, s * 0.3, px + (R() - 0.5) * 8, s * 0.7, px + (R() - 0.5) * 6, s); x.stroke(); }
      x.globalAlpha = 1;
    }, 1),
    stone: mk(256, (x, s) => {
      x.fillStyle = '#5a5650'; x.fillRect(0, 0, s, s);
      // mortar grid of irregular stones
      for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) {
        const w = s / 6, h = s / 8, ox = row % 2 ? w / 2 : 0;
        x.fillStyle = ['#6a665e', '#55524a', '#726c62', '#4a4842'][(row * 7 + col * 3) % 4];
        x.fillRect(col * w + ox + 2, row * h + 2, w - 4, h - 4);
      }
      noise(x, s, ['#3a3834', '#7a766c', '#2e3a26'], 900, 0.6, 2.4);
    }, 2),
  };
  return TEX;
}
