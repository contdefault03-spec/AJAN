// Set dressing: the things that make the house feel lived in (and then
// abandoned). Old armchairs and dining chairs, a fireplace, a grandfather clock,
// a rocking chair that rocks on its own, cobwebs, water-stained ceilings, kids'
// drawings, family portraits with the faces scratched out, sheets over the
// furniture... Mostly merged boxes (cheap), plus a few small animated meshes.
import * as THREE from 'three';
import { ROOMS, LEVELS, onDoorway } from './layout.js';
import { mulberry32 } from './util.js';

const BY = -3.2, U = 3.4, AY = 6.8;
const T = 0.2;

// ------------------------------------------------------------ canvas textures
function cv(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {};
function textures() {
  if (TEX.web) return TEX;
  const rnd = mulberry32(991);
  // corner web: anchored on the two top corners, sagging to a point below
  TEX.web = cv(256, 160, (x, w, h) => {
    x.strokeStyle = 'rgba(225,225,215,0.55)';
    x.lineWidth = 1.2;
    const cx = w / 2, cy = 4;
    const ends = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.02 + 0.96 * i / 8); ends.push([cx + Math.cos(a) * w * 0.55, cy + Math.sin(a) * h * 0.95]); }
    for (const [ex, ey] of ends) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(ex, ey); x.stroke(); }
    for (let r = 0.12; r < 1; r += 0.11) {
      x.beginPath();
      ends.forEach(([ex, ey], i) => { const px = cx + (ex - cx) * r, py = cy + (ey - cy) * r + Math.sin(i) * 2; i ? x.lineTo(px, py) : x.moveTo(px, py); });
      x.stroke();
    }
    x.fillStyle = 'rgba(200,200,190,0.25)';
    for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(cx + (rnd() - 0.5) * 60, 10 + rnd() * 40, 2 + rnd() * 3, 0, Math.PI * 2); x.fill(); }
  });
  TEX.stain = cv(256, 256, (x, w) => {
    for (let k = 0; k < 4; k++) {
      const r = w * (0.25 + k * 0.06);
      const g = x.createRadialGradient(w / 2, w / 2, r * 0.6, w / 2, w / 2, r);
      g.addColorStop(0, 'rgba(70,50,20,0.10)');
      g.addColorStop(0.92, `rgba(60,40,15,${0.28 - k * 0.05})`);
      g.addColorStop(1, 'rgba(60,40,15,0)');
      x.fillStyle = g;
      x.beginPath(); x.ellipse(w / 2 + k * 6, w / 2 - k * 4, r, r * 0.8, k, 0, Math.PI * 2); x.fill();
    }
  });
  // crayon drawing: a family of stick figures and a huge dark shape behind them
  TEX.drawing = cv(256, 192, (x, w, h) => {
    x.fillStyle = '#e8e2cf'; x.fillRect(0, 0, w, h);
    x.lineWidth = 3; x.lineCap = 'round';
    const fig = (fx, s, col) => { x.strokeStyle = col; x.beginPath(); x.arc(fx, h - 95 * s, 10 * s, 0, Math.PI * 2); x.moveTo(fx, h - 85 * s); x.lineTo(fx, h - 45 * s); x.moveTo(fx - 15 * s, h - 70 * s); x.lineTo(fx + 15 * s, h - 70 * s); x.moveTo(fx, h - 45 * s); x.lineTo(fx - 12 * s, h - 15 * s); x.moveTo(fx, h - 45 * s); x.lineTo(fx + 12 * s, h - 15 * s); x.stroke(); };
    x.fillStyle = '#1a1414';
    x.beginPath(); x.ellipse(200, 80, 48, 64, 0, 0, Math.PI * 2); x.fill();
    x.fillRect(160, 120, 80, 50);
    x.fillStyle = '#c01010'; x.beginPath(); x.arc(185, 62, 5, 0, 7); x.arc(215, 62, 5, 0, 7); x.fill();
    x.strokeStyle = '#c01010'; x.beginPath(); x.moveTo(180, 95); x.quadraticCurveTo(200, 110, 220, 95); x.stroke();
    fig(40, 1, '#2040c0'); fig(80, 0.8, '#c03070'); fig(115, 0.6, '#208030');
    x.fillStyle = '#c01010'; x.font = 'bold 22px Comic Sans MS, cursive'; x.fillText('HE IS HOME', 18, 26);
  });
  TEX.spiderDrawing = cv(256, 192, (x, w, h) => {
    x.fillStyle = '#e6e0cc'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#151010'; x.lineWidth = 4; x.lineCap = 'round';
    x.fillStyle = '#151010'; x.beginPath(); x.ellipse(128, 100, 34, 26, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(128, 140, 46, 36, 0, 0, 7); x.fill();
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { x.beginPath(); x.moveTo(128 + s * 26, 100 + i * 8); x.lineTo(128 + s * (70 + i * 6), 70 + i * 20); x.lineTo(128 + s * (95 + i * 4), 110 + i * 22); x.stroke(); }
    x.fillStyle = '#d01010'; for (const dx of [-10, -3, 4, 11]) { x.beginPath(); x.arc(128 + dx, 94, 3, 0, 7); x.fill(); }
    x.font = 'bold 20px Comic Sans MS, cursive'; x.fillText('DONT WAKE IT', 50, 28);
  });
  TEX.tally = cv(256, 128, (x, w, h) => {
    x.strokeStyle = 'rgba(30,20,15,0.85)'; x.lineWidth = 3;
    let n = 0;
    for (let row = 0; row < 3; row++) for (let g = 0; g < 7 && n < 41; g++) {
      const gx = 8 + g * 34, gy = 10 + row * 40;
      for (let k = 0; k < 4 && n < 41; k++, n++) { x.beginPath(); x.moveTo(gx + k * 6, gy + (rnd() - 0.5) * 3); x.lineTo(gx + k * 6 + (rnd() - 0.5) * 2, gy + 28); x.stroke(); }
      if (n < 41) { x.beginPath(); x.moveTo(gx - 3, gy + 22); x.lineTo(gx + 24, gy + 6); x.stroke(); n++; }
    }
  });
  TEX.hand = cv(128, 128, (x) => {
    x.fillStyle = 'rgba(90,5,5,0.85)';
    x.beginPath(); x.ellipse(64, 80, 24, 28, 0, 0, 7); x.fill();
    for (const [fx, fy, a] of [[40, 40, -0.3], [55, 30, -0.1], [72, 30, 0.1], [88, 40, 0.3]]) { x.save(); x.translate(fx, fy); x.rotate(a); x.fillRect(-6, -22, 12, 36); x.restore(); }
    x.save(); x.translate(36, 82); x.rotate(-1.0); x.fillRect(-6, -18, 12, 30); x.restore();
    for (let i = 0; i < 5; i++) x.fillRect(50 + i * 7, 104, 3, 10 + rnd() * 20);
  });
  TEX.claws = cv(128, 192, (x) => {
    x.strokeStyle = 'rgba(25,12,8,0.9)'; x.lineCap = 'round';
    for (let i = 0; i < 4; i++) { x.lineWidth = 5 - i * 0.5; x.beginPath(); x.moveTo(20 + i * 22, 10 + i * 4); x.bezierCurveTo(28 + i * 22, 70, 22 + i * 22, 120, 34 + i * 22, 180); x.stroke(); }
  });
  // family portrait with the faces scratched away
  TEX.portrait = cv(160, 200, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#4a3a28'); g.addColorStop(1, '#1e150c'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (const [px, s] of [[48, 1], [108, 1.05], [80, 0.7]]) {
      x.fillStyle = '#2a2018'; x.beginPath(); x.ellipse(px, 200 - 40 * s, 30 * s, 60 * s, 0, Math.PI, 0); x.fill(); x.fillRect(px - 30 * s, 200 - 40 * s, 60 * s, 40 * s);
      x.fillStyle = '#c8b090'; x.beginPath(); x.ellipse(px, 200 - 120 * s, 16 * s, 20 * s, 0, 0, 7); x.fill();
      x.strokeStyle = 'rgba(15,8,4,0.95)'; x.lineWidth = 2;
      for (let k = 0; k < 14; k++) { x.beginPath(); x.moveTo(px - 18 * s + rnd() * 6, 200 - 138 * s + rnd() * 6); x.lineTo(px + 14 * s + rnd() * 6, 200 - 104 * s + rnd() * 8); x.stroke(); }
    }
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, w, h);
  });
  TEX.ember = cv(64, 64, (x, w) => {
    const g = x.createRadialGradient(w / 2, w * 0.8, 2, w / 2, w * 0.8, w * 0.7);
    g.addColorStop(0, 'rgba(255,190,80,1)'); g.addColorStop(0.4, 'rgba(220,70,10,0.9)'); g.addColorStop(1, 'rgba(60,5,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
  return TEX;
}

// ------------------------------------------------------------ helpers
// local frame for a piece facing `f`: +lz is "front" (where a sitter looks), +lx is the right hand.
const FWD = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
function toWorld(ox, oz, f, lx, lz) {
  const [fx, fz] = FWD[f];
  return [ox + fx * lz - fz * lx, oz + fz * lz + fx * lx];
}
function lbox(G, ox, oy, oz, f, lx0, ly0, lz0, lx1, ly1, lz1, mat) {
  const [ax, az] = toWorld(ox, oz, f, lx0, lz0), [bx2, bz] = toWorld(ox, oz, f, lx1, lz1);
  G.box(Math.min(ax, bx2), oy + ly0, Math.min(az, bz), Math.max(ax, bx2), oy + ly1, Math.max(az, bz), mat);
}

export function buildDecor(h) {
  const G = h.geo, M = h.M;
  const tx = textures();
  const rnd = mulberry32(4242);
  h.decorAnims = [];
  h.periodic = [];
  const add = m => { h.group.add(m); return m; };
  const mat = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra });

  /** Flat picture on a wall. facing = direction the picture faces (into the room). */
  const decal = (tex, x, y, z, w, hh, facing, extra = {}) => {
    if (onDoorway(x, z, y, w / 2)) { console.warn('decal over a doorway skipped', x, z); return null; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat(tex, extra));
    const [fx, fz] = FWD[facing];
    m.position.set(x + fx * 0.006, y, z + fz * 0.006);
    m.rotation.y = Math.atan2(fx, fz);
    if (extra.rz) m.rotation.z = extra.rz;
    return add(m);
  };
  const ceilingStain = (x, y, z, s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), mat(tx.stain));
    m.rotation.x = Math.PI / 2;
    m.rotation.z = rnd() * 6;
    m.position.set(x, y - 0.004, z);
    return add(m);
  };
  const webMat = mat(tx.web, { side: THREE.DoubleSide, opacity: 0.85, roughness: 1 });
  /** Cobweb spanning a ceiling corner. sx/sz = which way the room extends from the corner. */
  const web = (x, top, z, sx, sz, s = 0.75) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s * 1.41, s), webMat);
    m.position.set(x + sx * s * 0.5, top - s * 0.5 + 0.02, z + sz * s * 0.5);
    m.rotation.y = Math.atan2(sx, sz);
    return add(m);
  };

  /** Old high-backed armchair with wings, torn upholstery. */
  const wingChair = (x, y, z, f, fab = 'fabricRed') => {
    lbox(G, x, y, z, f, -0.42, 0, -0.4, 0.42, 0.42, 0.4, 'woodDark');        // frame
    lbox(G, x, y, z, f, -0.36, 0.42, -0.3, 0.36, 0.52, 0.38, fab);           // cushion
    lbox(G, x, y, z, f, -0.42, 0.42, -0.42, 0.42, 1.25, -0.28, fab);         // back
    for (const s of [-1, 1]) {
      lbox(G, x, y, z, f, s > 0 ? 0.3 : -0.42, 0.42, -0.42, s > 0 ? 0.42 : -0.3, 0.7, 0.38, fab);  // arms
      lbox(G, x, y, z, f, s > 0 ? 0.3 : -0.42, 0.7, -0.42, s > 0 ? 0.42 : -0.3, 1.15, -0.1, fab);  // wings
    }
    for (const [a, b] of [[-0.42, -0.4], [0.34, -0.4], [-0.42, 0.32], [0.34, 0.32]]) lbox(G, x, y - 0.0, z, f, a, -0.0, b, a + 0.08, 0.06, b + 0.08, 'woodDark');
    h.collider(x - 0.45, z - 0.45, x + 0.45, z + 0.45, y, y + 1.2, { furniture: true });
  };

  /** Spindle-back dining chair (old), optionally without collider. */
  const oldChair = (x, y, z, f, collide = true) => {
    lbox(G, x, y, z, f, -0.22, 0.42, -0.22, 0.22, 0.47, 0.22, 'woodDark');
    lbox(G, x, y, z, f, -0.18, 0.47, -0.16, 0.18, 0.5, 0.18, 'fabricRed');
    for (const [a, b] of [[-0.22, -0.22], [0.18, -0.22], [-0.22, 0.18], [0.18, 0.18]]) lbox(G, x, y, z, f, a, 0, b, a + 0.04, 0.42, b + 0.04, 'woodDark');
    lbox(G, x, y, z, f, -0.22, 0.47, -0.22, -0.18, 1.08, -0.18, 'woodDark');
    lbox(G, x, y, z, f, 0.18, 0.47, -0.22, 0.22, 1.08, -0.18, 'woodDark');
    lbox(G, x, y, z, f, -0.24, 1.0, -0.23, 0.24, 1.1, -0.17, 'woodDark');
    for (const a of [-0.1, -0.02, 0.06]) lbox(G, x, y, z, f, a, 0.5, -0.215, a + 0.03, 1.0, -0.19, 'woodDark');
    lbox(G, x, y, z, f, -0.22, 0.16, 0.18, 0.22, 0.2, 0.22, 'woodDark');
    if (collide) h.collider(x - 0.24, z - 0.24, x + 0.24, z + 0.24, y, y + 0.9, { furniture: true });
  };

  /** A chair that rocks by itself. */
  const rockingChair = (x, y, z, yaw) => {
    const g = new THREE.Group();
    const piv = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = yaw; g.add(piv);
    const wood = M.woodDark;
    const part = (w, hh, d, px, py, pz, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), wood); b.position.set(px, py, pz); b.rotation.x = rx; b.castShadow = true; piv.add(b); };
    for (const s of [-1, 1]) {
      const rocker = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.025, 6, 24, 0.75), wood);
      rocker.rotation.set(0, Math.PI / 2, Math.PI + 1.2);
      rocker.position.set(s * 0.22, 1.21, 0);
      piv.add(rocker);
      part(0.04, 0.45, 0.04, s * 0.22, 0.27, 0.2);
      part(0.04, 1.0, 0.04, s * 0.22, 0.55, -0.2, -0.15);
      part(0.04, 0.04, 0.45, s * 0.22, 0.68, 0.0);
    }
    part(0.48, 0.05, 0.46, 0, 0.47, 0);
    for (let i = 0; i < 5; i++) part(0.03, 0.55, 0.02, -0.16 + i * 0.08, 0.78, -0.24, -0.15);
    part(0.5, 0.06, 0.04, 0, 1.06, -0.28, -0.15);
    add(g);
    h.collider(x - 0.3, z - 0.4, x + 0.3, z + 0.4, y, y + 0.9, { furniture: true });
    const ph = rnd() * 6;
    h.decorAnims.push((dt, t) => { piv.rotation.x = Math.sin(t * 1.3 + ph) * 0.13; });
    h.periodic.push({ pos: new THREE.Vector3(x, y + 0.3, z), key: 'creak', every: 2.42, vol: 0.18, rate: 1.8, range: 9 });
  };

  /** Grandfather clock with a swinging pendulum (and a tick you can hear). */
  const grandfatherClock = (x, y, z, f) => {
    lbox(G, x, y, z, f, -0.25, 0, -0.2, 0.25, 2.15, 0.12, 'woodDark');
    lbox(G, x, y, z, f, -0.28, 2.15, -0.22, 0.28, 2.3, 0.15, 'woodDark');
    const [fx, fz] = FWD[f];
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshStandardMaterial({ color: 0xd8ceb0, roughness: 0.6 }));
    face.position.set(x + fx * 0.125, y + 1.85, z + fz * 0.125); face.rotation.y = Math.atan2(fx, fz); add(face);
    const hands = new THREE.Group(); hands.position.copy(face.position).add(new THREE.Vector3(fx * 0.006, 0, fz * 0.006)); hands.rotation.y = face.rotation.y; add(hands);
    const hm = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const hr = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 0.11), hm); hr.position.y = 0.05; const hrg = new THREE.Group(); hrg.add(hr); hrg.rotation.z = 2.1; hands.add(hrg);
    const mn = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.15), hm); mn.position.y = 0.07; const mng = new THREE.Group(); mng.add(mn); mng.rotation.z = -0.5; hands.add(mng);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.05), new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.55 }));
    glass.position.set(x + fx * 0.126, y + 1.0, z + fz * 0.126); glass.rotation.y = face.rotation.y; add(glass);
    const pend = new THREE.Group(); pend.position.set(x + fx * 0.06, y + 1.5, z + fz * 0.06); pend.rotation.y = face.rotation.y; add(pend);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.7, 0.01), M.brass); rod.position.y = -0.35; pend.add(rod);
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 18), M.brass); bob.rotation.x = Math.PI / 2; bob.position.y = -0.72; pend.add(bob);
    h.decorAnims.push((dt, t) => { pend.rotation.z = Math.sin(t * Math.PI) * 0.2; });
    h.collider(x - 0.3, z - 0.3, x + 0.3, z + 0.3, y, y + 2.3, { furniture: true });
    h.clockSound = new THREE.Vector3(x, y + 1.6, z);
  };

  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb050 });
  const candle = (x, y, z, hh = 0.14) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, hh, 8), new THREE.MeshStandardMaterial({ color: 0xd9d2b8, roughness: 0.8 }));
    c.position.set(x, y + hh / 2, z); add(c);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 6), flameMat);
    fl.position.set(x, y + hh + 0.022, z); add(fl);
    const ph = rnd() * 9;
    h.decorAnims.push((dt, t) => { const k = 0.8 + Math.sin(t * 11 + ph) * 0.12 + Math.sin(t * 23 + ph * 2) * 0.08; fl.scale.set(1, k, 1); });
  };
  const book = (x, y, z, w, hh, d) => G.box(x, y, z, x + w, y + hh, z + d, ['fabricRed', 'fabricGreen', 'woodDark', 'fabricBed'][Math.floor(rnd() * 4)]);
  const bookStack = (x, y, z, n = 4) => { let yy = y; for (let i = 0; i < n; i++) { const w = 0.18 + rnd() * 0.08, d = 0.24 + rnd() * 0.06, hh = 0.03 + rnd() * 0.03; book(x - w / 2 + (rnd() - 0.5) * 0.03, yy, z - d / 2, w, hh, d); yy += hh; } };
  const portrait = (x, y, z, f, w = 0.55, hh = 0.7, tilt = 0) => {
    if (onDoorway(x, z, y, w / 2 + 0.04)) { console.warn('portrait over a doorway skipped', x, z); return; }
    const [fx, fz] = FWD[f];
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, hh + 0.08, 0.04), M.frame);
    fr.position.set(x + fx * 0.02, y, z + fz * 0.02); fr.rotation.y = Math.atan2(fx, fz); fr.rotation.z = tilt; add(fr);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ map: tx.portrait, roughness: 0.7 }));
    p.position.set(x + fx * 0.042, y, z + fz * 0.042); p.rotation.y = fr.rotation.y; p.rotation.z = tilt; add(p);
  };
  const sheetOver = (x0, y, z0, x1, hh, z1) => {
    G.box(x0 - 0.04, y, z0 - 0.04, x1 + 0.04, y + hh + 0.03, z1 + 0.04, 'sheet');
    G.box(x0 - 0.07, y, z0 - 0.07, x1 + 0.07, y + 0.25, z1 + 0.07, 'sheet');
  };
  const rug = (x0, y, z0, x1, z1, m) => G.box(x0, y + 0.002, z0, x1, y + 0.009, z1, m, { skip: ['x+', 'x-', 'z+', 'z-'] });
  const jar = (x, y, z, col) => { const j = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.7, roughness: 0.2 })); j.position.set(x, y + 0.07, z); add(j); };
  const pot = (x, y, z, r = 0.12) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, r * 1.1, 14, 1, true), M.metal); p.position.set(x, y + r * 0.55, z); add(p); };
  const doll = (x, y, z, yaw, s = 1) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; g.scale.setScalar(s);
    const dress = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x7a2a3a, roughness: 0.9 })); dress.position.y = 0.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd8c8b8, roughness: 0.5 })); head.position.y = 0.26;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.064, 12, 8, 0, Math.PI * 2, 0, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a1a10 })); hair.position.y = 0.27; hair.rotation.x = -0.3;
    for (const s2 of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), new THREE.MeshBasicMaterial({ color: 0x050505 })); e.position.set(s2 * 0.022, 0.27, 0.054); g.add(e); }
    g.add(dress, head, hair); add(g); return g;
  };

  // ======================================================== global: webs & ceiling stains
  for (const r of ROOMS) {
    if (r.id.startsWith('hall') || r.id === 'uhall' || r.id === 'club') continue;
    const top = r.L === 3 ? LEVELS[3].y + 2.2 : LEVELS[r.L].top;
    const corners = [[r.x0 + T / 2, r.z0 + T / 2, 1, 1], [r.x1 - T / 2, r.z0 + T / 2, -1, 1], [r.x0 + T / 2, r.z1 - T / 2, 1, -1], [r.x1 - T / 2, r.z1 - T / 2, -1, -1]];
    const want = r.id === 'nursery' ? 4 : r.L === 0 || r.L === 3 ? 3 : 2;
    corners.sort(() => rnd() - 0.5).slice(0, want).forEach(([x, z, sx, sz]) => web(x, top, z, sx, sz, 0.55 + rnd() * 0.45));
    if (r.L !== 3) for (let i = 0; i < (r.L === 0 ? 3 : 1 + Math.floor(rnd() * 2)); i++) ceilingStain(r.x0 + 1 + rnd() * (r.x1 - r.x0 - 2), top, r.z0 + 1 + rnd() * (r.z1 - r.z0 - 2), 1.2 + rnd() * 1.6);
  }

  // ======================================================== ground floor
  // Bedroom: armchair by the window, vanity mirror, portrait
  wingChair(4.6, 0, 2.2, '-x', 'fabricRed');
  G.box(0.14, 1.2, 4.55, 0.18, 2.0, 5.85, 'frame');
  h.addMirror(1.15, 0.7, [0.185, 1.6, 5.2], Math.PI / 2, 'bedroom_mirror');
  candle(0.4, 0.95, 4.6); candle(0.45, 0.95, 5.9, 0.1);
  portrait(1.6, 1.75, 7.88, '-z', 0.5, 0.62, 0.06);
  // Bathroom: stained shower curtain over the tub, bloody handprint
  G.box(8.12, 2.05, 1.95, 9.9, 2.08, 1.98, 'metal');
  const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5, 8, 1), new THREE.MeshStandardMaterial({ color: 0xb8b8a0, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  const cp = cur.geometry.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin(cp.getX(i) * 14) * 0.04); cur.geometry.computeVertexNormals();
  cur.position.set(8.7, 1.3, 1.97); add(cur);
  decal(tx.hand, 8.11, 1.3, 4.4, 0.22, 0.22, '+x');
  // Child's room: crayon drawings, teddy, rocking horse, toy blocks, doll facing the wall
  decal(tx.drawing, 13.11, 1.35, 3.0, 0.6, 0.45, '+x', { rz: 0.04 });
  decal(tx.drawing, 20.89, 1.45, 3.2, 0.5, 0.38, '-x', { rz: -0.06 });
  for (let i = 0; i < 7; i++) { const bx0 = 14.5 + rnd() * 2.5, bz0 = 5.6 + rnd() * 1.6; G.box(bx0, 0, bz0, bx0 + 0.08, 0.08, bz0 + 0.08, ['fabricRed', 'fabricGreen', 'woodPale'][i % 3]); }
  doll(20.75, 0, 6.9, -Math.PI / 2, 1.3); // facing the wall
  doll(19.7, 0.6, 1.0, 0.2, 1.1);           // on the bed
  lbox(G, 14.0, 0, 6.9, '+x', -0.12, 0.35, -0.4, 0.12, 0.6, 0.4, 'woodPale');  // rocking horse body
  lbox(G, 14.0, 0, 6.9, '+x', -0.08, 0.6, 0.25, 0.08, 0.85, 0.45, 'woodPale');
  lbox(G, 14.0, 0, 6.9, '+x', -0.16, 0, -0.5, 0.16, 0.05, 0.5, 'woodDark');
  // Security room: corkboard with photos and string, mug, papers
  G.box(21.1, 1.1, 3.0, 21.13, 1.9, 5.0, 'woodPale');
  decal(tx.portrait, 21.14, 1.55, 3.5, 0.18, 0.22, '+x', { rz: 0.1 });
  decal(tx.portrait, 21.14, 1.4, 4.4, 0.18, 0.22, '+x', { rz: -0.08 });
  decal(tx.drawing, 21.14, 1.7, 4.2, 0.26, 0.2, '+x', { rz: 0.05 });
  pot(24.0, 0.78, 0.9, 0.04);
  for (let i = 0; i < 5; i++) G.box(22 + rnd() * 4, 0.78, 0.3 + rnd() * 0.5, 25 + rnd() * 3 + 0.21, 0.785, 0.3 + rnd() * 0.5 + 0.28, 'fabricBed');
  // Office: typewriter, banker's lamp, armchair, globe, antlers over the door
  G.box(35.6, 0.78, 1.9, 36.05, 0.9, 2.25, 'black'); G.box(35.65, 0.9, 2.1, 36.0, 0.95, 2.25, 'black');
  G.box(36.9, 0.78, 1.95, 37.0, 1.15, 2.05, 'brass');
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 0.12, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a4a2a, emissive: 0x0c2a12, side: THREE.DoubleSide })); shade.position.set(36.95, 1.15, 2.0); add(shade);
  wingChair(31.5, 0, 5.4, '+x', 'fabricGreen');
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: 0x8a7a50, roughness: 0.6 })); globe.position.set(38.6, 0.95, 7.3); add(globe);
  G.box(38.55, 0, 7.25, 38.65, 0.75, 7.35, 'woodDark');
  h.collider(38.35, 7.05, 38.85, 7.55, 0, 1.1, { furniture: true });
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) G.box(35.05 + s * (0.12 + k * 0.1), 2.55 + k * 0.08, 0.1, 35.05 + s * (0.12 + k * 0.1) + 0.03, 2.75 + k * 0.08, 0.13, 'woodPale');
  G.box(34.95, 2.45, 0.1, 35.15, 2.7, 0.2, 'woodDark');
  // Hallway: grandfather clock, fallen chair, dead plant, portraits
  grandfatherClock(11.9, 0, 8.35, '+z');
  const fallen = new THREE.Group(); fallen.position.set(24.6, 0.24, 10.55); fallen.rotation.set(Math.PI / 2, 0, 0.4);
  { const s = 0.22; const parts = [[0.44, 0.05, 0.44, 0, 0.45, 0], [0.04, 0.45, 0.04, -s, 0.22, -s], [0.04, 0.45, 0.04, s, 0.22, -s], [0.04, 0.45, 0.04, -s, 0.22, s], [0.04, 0.45, 0.04, s, 0.22, s], [0.44, 0.5, 0.04, 0, 0.72, -s]]; for (const [w, hh, d, px, py, pz] of parts) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), M.woodDark); b.position.set(px, py, pz); fallen.add(b); } }
  add(fallen);
  pot(37.6, 0.8, 8.35, 0.1);
  for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.45, 4), new THREE.MeshStandardMaterial({ color: 0x3a2a14 })); st.position.set(37.6 + (rnd() - 0.5) * 0.08, 1.1, 8.35 + (rnd() - 0.5) * 0.08); st.rotation.set((rnd() - 0.5) * 0.9, 0, (rnd() - 0.5) * 0.9); add(st); }
  portrait(1.5, 1.75, 8.1, '+z', 0.45, 0.58, -0.05);
  portrait(29.0, 1.75, 10.9, '-z', 0.45, 0.58, 0.04);
  // Living room: fireplace (brick surround, mantel, embers), coat stand, armchair, candles
  G.box(10.25, 0, 17.55, 10.9, 1.25, 17.8, 'brick'); G.box(10.25, 0, 19.8, 10.9, 1.25, 20.05, 'brick'); G.box(10.25, 0.95, 17.8, 10.9, 1.25, 19.8, 'brick');
  G.box(10.1, 1.25, 17.4, 10.9, 1.32, 20.2, 'woodDark');
  G.box(10.35, 0, 17.8, 10.9, 0.08, 19.8, 'black');
  const emb = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: tx.ember, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  emb.position.set(10.4, 0.3, 18.8); emb.rotation.y = -Math.PI / 2; add(emb);
  h.decorAnims.push((dt, t) => { emb.material.opacity = 0.55 + Math.sin(t * 3.1) * 0.12 + Math.sin(t * 7.7) * 0.08; });
  candle(10.5, 1.32, 17.7); candle(10.5, 1.32, 20.0, 0.1); candle(10.55, 1.32, 19.2, 0.18);
  portrait(10.88, 2.0, 18.8, '-x', 0.6, 0.75);
  wingChair(8.6, 0, 15.0, '-x', 'fabricGreen');
  G.box(2.85, 0, 20.35, 2.95, 1.8, 20.45, 'woodDark'); G.box(2.65, 0, 20.15, 3.15, 0.04, 20.65, 'woodDark');
  G.box(2.7, 1.1, 20.3, 3.1, 1.75, 20.5, 'fabricBed'); // coat hanging on it
  h.collider(2.7, 20.2, 3.1, 20.6, 0, 1.8, { furniture: true });
  rug(7.4, 0, 18.0, 9.9, 20.6, 'carpetB');
  // Back room (where you wake up): tally marks over the mattress, candles, bucket
  decal(tx.tally, 12.2, 0.85, 16.89, 1.1, 0.55, '-z');
  candle(13.4, 0, 16.5, 0.1); candle(13.6, 0, 16.6, 0.16);
  pot(16.3, 0, 12.6, 0.14);
  // Kitchen: stove with pots, knife block, plates and jars, hanging pans
  G.box(18.1, 0, 11.15, 18.95, 0.9, 11.75, 'black');
  h.collider(18.1, 11.15, 18.95, 11.75, 0, 0.9, { furniture: true });
  pot(18.3, 0.9, 11.45, 0.11); pot(18.72, 0.9, 11.45, 0.09);
  for (let i = 0; i < 4; i++) { const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - i * 0.01, 0.11 - i * 0.01, 0.04, 14), M.metal); pan.position.set(25 + i * 0.5, 1.75, 11.25); pan.rotation.x = Math.PI / 2; add(pan); }
  G.box(24.9, 1.95, 11.15, 27.0, 1.98, 11.2, 'metal');
  G.box(26.0, 0.97, 11.25, 26.15, 1.2, 11.4, 'woodDark');
  for (const [x, c] of [[24.4, 0x6a7a30], [24.7, 0x8a4a20], [28.6, 0x40302a], [28.9, 0x7a6a40]]) jar(x, 0.97, 11.4, c);
  for (const [x, z] of [[22.4, 15.4], [23.5, 16.2], [22.9, 15.8]]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.02, 16), M.porcelain); pl.position.set(x, 0.77, z); add(pl); }
  G.box(23.3, 0.77, 15.25, 23.55, 0.79, 15.32, 'metal');
  decal(tx.hand, 17.11, 1.1, 20.1, 0.22, 0.22, '+x', { rz: 0.4 });
  // Dining room: a full set of old chairs, chandelier, candelabra, place settings, portraits
  // (tucked in around the table: decoration only, so they never block the way through)
  for (const z of [15.6, 16.7, 17.8]) { oldChair(31.95, 0, z, '+x', false); oldChair(34.25, 0, z, '-x', false); }
  oldChair(33.1, 0, 14.75, '+z', false);
  const chand = new THREE.Group(); chand.position.set(33.1, 2.4, 16.7); add(chand);
  { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.02, 6, 24), M.brass); ring.rotation.x = Math.PI / 2; chand.add(ring);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), M.metal); chain.position.y = 0.3; chand.add(chain);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0xd9d2b8 })); c.position.set(Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45); chand.add(c); } }
  h.decorAnims.push((dt, t) => { chand.rotation.z = Math.sin(t * 0.7) * 0.03; chand.rotation.x = Math.sin(t * 0.53) * 0.02; });
  G.box(33.05, 0.78, 16.65, 33.15, 1.05, 16.75, 'brass');
  candle(32.95, 1.05, 16.7, 0.12); candle(33.25, 1.05, 16.7, 0.12); candle(33.1, 1.05, 16.55, 0.16);
  for (const z of [15.6, 16.7, 17.8]) for (const x of [32.45, 33.75]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.02, 16), M.porcelain); pl.position.set(x, 0.79, z); add(pl); }
  portrait(30.12, 1.8, 13.5, '+x', 0.55, 0.7, 0.03);
  portrait(30.12, 1.8, 17.8, '+x', 0.5, 0.62, -0.05);

  // ======================================================== upstairs
  // Master bedroom: vanity with a sheet over the mirror, armchair, candles, portrait
  G.box(9.35, U, 2.6, 9.88, U + 0.78, 3.7, 'woodDark');
  h.collider(9.35, 2.6, 9.88, 3.7, U, U + 0.78, { furniture: true });
  G.box(9.84, U + 0.78, 2.7, 9.88, U + 1.75, 3.6, 'frame');
  G.box(9.78, U + 0.95, 2.62, 9.84, U + 1.78, 3.68, 'sheet');
  candle(9.5, U + 0.78, 2.8); candle(9.55, U + 0.78, 3.5, 0.1);
  wingChair(7.4, U, 4.6, '-x', 'fabricRed');
  portrait(2.3, U + 1.75, 7.88, '-z', 0.55, 0.7, -0.04);
  // Upstairs bathroom: shower curtain
  G.box(10.12, U + 2.05, 1.95, 11.9, U + 2.08, 1.98, 'metal');
  const cur2 = cur.clone(); cur2.position.set(11.3, U + 1.3, 1.97); add(cur2);
  // Guest room: suitcase, old chair at the desk, rug, portrait
  G.box(16.4, U, 6.9, 17.2, U + 0.22, 7.45, 'fabricBed'); G.box(16.7, U + 0.22, 7.15, 16.9, U + 0.27, 7.2, 'woodDark');
  oldChair(16.5, U, 4.2, '-x');
  rug(17.0, U, 3.0, 20.0, 5.5, 'carpet');
  decal(tx.claws, 22.89, U + 1.4, 3.0, 0.4, 0.6, '-x');
  // Storage: sheets over the crates, a dress form
  for (const [x, z, s] of [[24.0, 6.6, 0.8], [28.6, 5.6, 0.9]]) sheetOver(x - s / 2, U, z - s / 2, x + s / 2, s, z + s / 2);
  { const df = new THREE.Group(); df.position.set(23.7, U, 4.6);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.6, 12), M.sheet); torso.position.y = 1.25;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), M.woodDark); neck.position.y = 1.6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.95, 6), M.woodDark); pole.position.y = 0.48;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 12), M.woodDark); base.position.y = 0.02;
    df.add(torso, neck, pole, base); add(df); h.collider(23.5, 4.4, 23.9, 4.8, U, U + 1.7, { furniture: true }); }
  // Ajan's room: claw marks everywhere, filth on the floor
  for (const [x, z, f] of [[30.11, 2.0, '+x'], [30.11, 5.0, '+x'], [39.89, 2.4, '-x'], [33.0, 7.89, '-z'], [37.5, 0.11, '+z']]) decal(tx.claws, x, U + 1.3, z, 0.5, 0.8, f, { rz: (rnd() - 0.5) * 0.4 });
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), mat(tx.stain, { opacity: 0.9 })); m.rotation.x = -Math.PI / 2; m.position.set(31 + rnd() * 8, U + 0.012, 3 + rnd() * 4); add(m); }
  // Upstairs hall: portraits, a doll on the side table facing the wall
  portrait(9.5, U + 1.75, 8.1, '+z', 0.45, 0.58, 0.05);
  portrait(24.5, U + 1.75, 8.1, '+z', 0.45, 0.58, -0.07);
  portrait(32.5, U + 1.75, 10.9, '-z', 0.5, 0.62);
  doll(16.8, U + 0.8, 8.25, Math.PI, 1.0);
  // Nursery (the spider's room): mobile over the crib, rocking chair, dolls, webs, egg sacs
  rockingChair(8.6, U, 12.4, -2.3);
  const mobile = new THREE.Group(); mobile.position.set(1.2, U + 1.9, 19.7); add(mobile);
  { const str = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 4), M.metal); str.position.y = 0.3; mobile.add(str);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.25, 3), M.metal); s.position.set(Math.cos(a) * 0.22, -0.12, Math.sin(a) * 0.22); mobile.add(s); const toy = new THREE.Mesh(i % 2 ? new THREE.SphereGeometry(0.035, 8, 6) : new THREE.ConeGeometry(0.04, 0.07, 5), new THREE.MeshStandardMaterial({ color: [0x9a6070, 0x60709a, 0x8a8a50][i % 3] })); toy.position.set(Math.cos(a) * 0.22, -0.26, Math.sin(a) * 0.22); mobile.add(toy); } }
  h.decorAnims.push((dt, t) => { mobile.rotation.y = t * 0.25; });
  doll(0.37, U + 0.9, 13.4, Math.PI / 2, 1.0); doll(0.37, U + 0.9, 14.2, Math.PI / 2 + 0.6, 0.9);
  decal(tx.spiderDrawing, 0.11, U + 1.45, 17.0, 0.6, 0.45, '+x', { rz: -0.05 });
  decal(tx.drawing, 9.89, U + 1.4, 14.5, 0.5, 0.38, '-x', { rz: 0.07 });
  for (const [x, y, z, sx, sz] of [[9.9, U + 1.7, 20.9, -1, -1], [9.9, U + 2.3, 20.9, -1, -1], [9.9, U + 0.9, 20.9, -1, -1], [0.1, U + 2.4, 11.1, 1, 1]]) web(x, y, z, sx, sz, 0.9);
  for (let i = 0; i < 5; i++) { const egg = new THREE.Mesh(new THREE.SphereGeometry(0.07 + rnd() * 0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 1 })); egg.scale.y = 1.3; egg.position.set(9.82 - rnd() * 0.15, U + 1.2 + rnd() * 1.2, 20.0 + rnd() * 0.85); add(egg); }
  // Library: reading armchair + lamp, globe, book stacks on the floor and table, candles
  wingChair(11.5, U, 12.6, '+z', 'fabricGreen');
  G.box(12.25, U, 12.0, 12.35, U + 1.45, 12.1, 'brass');
  const lshade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.22, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xc8b088, emissive: 0x2a1a08, side: THREE.DoubleSide })); lshade.position.set(12.3, U + 1.5, 12.05); add(lshade);
  bookStack(13.9, U + 0.76, 15.4, 5); bookStack(16.0, U + 0.76, 15.3, 3);
  bookStack(11.2, U, 18.8, 6); bookStack(11.5, U, 19.5, 4); bookStack(18.6, U, 13.8, 5);
  candle(15.2, U + 0.76, 16.1); candle(15.35, U + 0.76, 16.2, 0.09);
  const g2 = globe.clone(); g2.position.set(18.6, U + 0.95, 19.4); add(g2); G.box(18.55, U, 19.35, 18.65, U + 0.75, 19.45, 'woodDark');
  h.collider(18.35, 19.15, 18.85, 19.65, U, U + 1.1, { furniture: true });
  // Music room: gramophone, music stand, rug, sheet over the piano
  G.box(33.4, U, 16.1, 34.2, U + 0.7, 16.9, 'woodDark');
  h.collider(33.4, 16.1, 34.2, 16.9, U, U + 0.7, { furniture: true });
  G.box(33.55, U + 0.7, 16.25, 34.05, U + 0.85, 16.75, 'woodDark');
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xa07a30, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
  horn.position.set(33.7, U + 1.12, 16.5); horn.rotation.set(0, 0, Math.PI / 2 + 0.6); add(horn);
  G.box(27.0, U, 16.0, 27.04, U + 1.2, 16.04, 'metal'); G.box(26.75, U + 1.15, 15.98, 27.3, U + 1.45, 16.02, 'metal');
  G.box(24.15, U + 1.25, 18.55, 26.45, U + 1.3, 20.9, 'sheet');
  rug(26.5, U, 15.0, 29.6, 18.5, 'carpet');
  portrait(35.88, U + 1.8, 17.0, '-x', 0.5, 0.62, 0.05);

  // ======================================================== the new smaller rooms
  const hangers = (x0, x1, z, y, n) => { for (let i = 0; i < n; i++) { const x = x0 + (i + 0.5) * (x1 - x0) / n; G.box(x - 0.03, y - 0.95 - rnd() * 0.25, z - 0.22, x + 0.03, y - 0.05, z + 0.22, ['fabricRed', 'fabricBed', 'fabricGreen', 'sheet', 'woodDark'][i % 5]); } };
  const hangersZ = (x, z0, z1, y, n) => { for (let i = 0; i < n; i++) { const z = z0 + (i + 0.5) * (z1 - z0) / n; G.box(x - 0.22, y - 0.95 - rnd() * 0.25, z - 0.03, x + 0.22, y - 0.05, z + 0.03, ['fabricRed', 'fabricBed', 'fabricGreen', 'sheet', 'woodDark'][i % 5]); } };
  // Walk-in wardrobe: coats on the rail, boxes
  hangersZ(7.62, 1.7, 6.7, 1.75, 11);
  G.box(5.75, 0, 0.15, 6.3, 0.35, 0.6, 'fabricBed');
  // Laundry: washer and dryer, laundry basket, pipes, a sheet on a line
  for (const x of [8.2, 8.9]) { G.box(x, 0, 7.25, x + 0.65, 0.85, 7.88, 'porcelain'); const door = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.1, metalness: 0.5 })); door.position.set(x + 0.325, 0.48, 7.245); door.rotation.y = Math.PI; add(door); }
  h.collider(8.2, 7.25, 9.55, 7.88, 0, 0.85, { furniture: true });
  pot(12.4, 0, 7.4, 0.2);
  G.box(8.12, 2.2, 6.2, 12.88, 2.21, 6.21, 'metal');
  G.box(9.6, 1.25, 6.18, 11.0, 2.2, 6.22, 'sheet');
  // Playroom: little table and chairs, toy chest (furniture.js), drawings
  G.box(18.4, 0.45, 6.0, 19.4, 0.5, 6.8, 'woodPale'); for (const [a2, b2] of [[18.42, 6.02], [19.34, 6.02], [18.42, 6.74], [19.34, 6.74]]) G.box(a2, 0, b2, a2 + 0.04, 0.45, b2 + 0.04, 'woodPale');
  h.collider(18.4, 6.0, 19.4, 6.8, 0, 0.5, { furniture: true });
  doll(18.6, 0.5, 6.3, 0.5, 0.9); doll(19.2, 0.5, 6.5, 2.6, 0.8);
  decal(tx.drawing, 20.89, 1.3, 6.5, 0.5, 0.38, '-x', { rz: 0.08 });
  // Archive: stacks of boxes and loose files
  for (let i = 0; i < 6; i++) { const x = 27.4 + (i % 2) * 0.7, z = 0.5 + Math.floor(i / 2) * 0.75; sheetOver(x, 0, z, x + 0.55, 0.4 + rnd() * 0.3, z + 0.5); }
  h.collider(27.3, 0.4, 28.85, 2.85, 0, 0.8, { furniture: true });
  for (let i = 0; i < 6; i++) G.box(27.4 + rnd() * 2, 0, 3.5 + rnd() * 2.5, 27.4 + rnd() * 2 + 0.25, 0.005, 3.5 + rnd() * 2.5 + 0.32, 'fabricBed');
  // Reception: waiting bench, coat stand, a dead plant
  G.box(31.0, 0.42, 7.4, 33.0, 0.48, 7.85, 'woodDark'); G.box(31.0, 0.48, 7.8, 33.0, 1.0, 7.86, 'woodDark'); for (const x of [31.05, 32.9]) G.box(x, 0, 7.42, x + 0.05, 0.42, 7.83, 'woodDark');
  h.collider(31.0, 7.4, 33.0, 7.88, 0, 1.0, { furniture: true });
  pot(30.6, 0, 7.4, 0.16);
  // Parlor: second armchair facing the fire, side table with a candle
  wingChair(8.4, 0, 18.2, '+x', 'fabricRed');
  G.box(8.25, 0, 16.9, 8.65, 0.6, 17.3, 'woodDark'); candle(8.45, 0.6, 17.1, 0.12);
  // Mudroom: boots by the basement door, coats on hooks, buckets
  for (let i = 0; i < 4; i++) G.box(17.3 + i * 0.3, 0, 20.5, 17.5 + i * 0.3, 0.3, 20.8, 'black');
  for (let i = 0; i < 4; i++) { G.box(24.0 + i * 0.6, 1.75, 20.85, 24.05 + i * 0.6, 1.8, 20.9, 'brass'); G.box(23.8 + i * 0.6, 0.9, 20.7, 24.25 + i * 0.6, 1.75, 20.88, ['fabricBed', 'fabricRed', 'fabricGreen', 'woodDark'][i]); }
  pot(28.6, 0, 18.0, 0.18); pot(29.0, 0, 18.5, 0.14);
  // Dressing room: rail of clothes, mirror, stool
  hangers(7.0, 9.6, 7.6, U + 1.85, 9); G.box(6.9, U + 1.85, 7.58, 9.7, U + 1.88, 7.62, 'metal');
  h.collider(6.9, 7.35, 9.7, 7.85, U, U + 1.9, { furniture: true });
  // Linen room: shelves of folded sheets
  for (let k = 0; k < 4; k++) G.box(10.12, U + 0.4 + k * 0.45, 4.9, 10.6, U + 0.43 + k * 0.45, 7.6, 'woodPale');
  for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) G.box(10.16, U + 0.43 + k * 0.45, 5.0 + i * 0.43, 10.55, U + 0.55 + k * 0.45, 5.35 + i * 0.43, i % 2 ? 'sheet' : 'fabricBed');
  h.collider(10.12, 4.9, 10.6, 7.6, U, U + 2.0, { furniture: true });
  // Sitting room: two armchairs and a low table
  wingChair(34.6, U, 15.0, '-x', 'fabricGreen'); wingChair(34.6, U, 18.2, '-x', 'fabricRed');
  G.box(33.4, U + 0.4, 17.2, 34.1, U + 0.45, 17.75, 'woodDark'); h.collider(33.4, 17.2, 34.1, 17.75, U, U + 0.45, { furniture: true });
  candle(33.75, U + 0.45, 17.45, 0.14);

  // ======================================================== basement
  for (const [x, z] of [[6.0, 21.0], [12.5, 22.5], [26.0, 21.0], [36.0, 17.0]]) {
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 4), M.metal); ch.position.set(x, BY + 2.3, z); add(ch);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 4, 8, Math.PI * 1.4), M.metal); hook.position.set(x, BY + 1.5, z); add(hook);
    const ph = rnd() * 6; h.decorAnims.push((dt, t) => { ch.rotation.z = Math.sin(t * 0.9 + ph) * 0.05; hook.position.x = x - Math.sin(t * 0.9 + ph) * 0.04; });
  }
  G.box(11.0, BY, 21.0, 12.8, BY + 0.18, 22.9, 'fabricBed');
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), mat(tx.stain, { color: 0x6a1010 })); m.rotation.x = -Math.PI / 2; m.position.set(11.9, BY + 0.185, 21.95); add(m); }
  for (let i = 0; i < 6; i++) jar(2.33 + (i % 2) * 0.17, BY + [0.52, 1.015, 1.51][Math.floor(i / 2)], 18.4 + i * 0.4, [0x5a6a20, 0x6a2a10, 0x3a3a2a][i % 3]);
  for (let i = 0; i < 3; i++) { const pd = new THREE.Mesh(new THREE.CircleGeometry(0.5 + rnd() * 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.8 })); pd.rotation.x = -Math.PI / 2; pd.position.set(4 + rnd() * 10, BY + 0.01, 22 + rnd() * 3); add(pd); }
  decal(tx.tally, 16.89, BY + 1.2, 25.5, 0.9, 0.45, '-x');

  // ======================================================== attic (safe zone, but still creepy)
  sheetOver(36.5, AY, 10.0, 37.5, 0.3, 12.0);
  sheetOver(32.5, AY, 9.0, 34.0, 1.1, 10.0);
  h.collider(32.5, 9.0, 34.0, 10.0, AY, AY + 1.1, { furniture: true });
  rockingChair(26.0, AY, 13.0, 0.8);
  G.box(34.5, AY, 19.6, 35.7, AY + 0.55, 20.4, 'woodDark'); G.box(34.45, AY + 0.55, 19.55, 35.75, AY + 0.62, 20.45, 'brass');
  h.collider(34.5, 19.6, 35.7, 20.4, AY, AY + 0.62, { furniture: true });
  doll(35.1, AY + 0.62, 20.0, Math.PI, 1.2);
}
