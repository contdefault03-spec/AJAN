// Procedurally generated, dirty, aged textures (no external texture files needed):
// stained wallpaper, worn floorboards, grimy tiles, concrete, carpet, old wood...
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function noiseLayer(ctx, size, rnd, amount, scale = 1) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount * scale;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function stains(ctx, size, rnd, count, color, maxR, alpha = 0.18) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * size, y = rnd() * size, r = maxR * (0.3 + rnd());
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${alpha * (0.5 + rnd())})`);
    g.addColorStop(0.7, `rgba(${color},${alpha * 0.4})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rnd() * 0.8), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drips(ctx, size, rnd, count, color) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const y0 = rnd() * size * 0.5;
    const len = size * (0.2 + rnd() * 0.5);
    const w = 2 + rnd() * 6;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, `rgba(${color},0.25)`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, w, len);
  }
}

function toTexture(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function wallpaper(seed, base, ink, style = 'damask', dirt = 1) {
  const S = 512, rnd = mulberry32(seed);
  const [c, x] = canvas(S);
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  x.fillStyle = ink;
  x.strokeStyle = ink;
  if (style === 'damask') {
    // Vertical stripes + damask-ish motifs
    x.globalAlpha = 0.22;
    for (let i = 0; i < 8; i++) x.fillRect(i * 64 + 28, 0, 8, S);
    x.globalAlpha = 0.18;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const cx = col * 128 + (row % 2) * 64 + 64, cy = row * 64 + 32;
        x.beginPath();
        x.moveTo(cx, cy - 22);
        x.bezierCurveTo(cx + 18, cy - 10, cx + 18, cy + 10, cx, cy + 22);
        x.bezierCurveTo(cx - 18, cy + 10, cx - 18, cy - 10, cx, cy - 22);
        x.fill();
        x.fillRect(cx - 2, cy - 30, 4, 60);
      }
    }
  } else if (style === 'floral') {
    // little roses and leaves on a diagonal grid
    for (let row = 0; row < 10; row++) for (let col = 0; col < 8; col++) {
      const cx = col * 64 + (row % 2) * 32 + 16, cy = row * 52 + 20;
      x.globalAlpha = 0.32;
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; x.beginPath(); x.arc(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 5, 0, Math.PI * 2); x.fill(); }
      x.globalAlpha = 0.2;
      x.beginPath(); x.ellipse(cx + 12, cy + 12, 8, 3, 0.7, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(cx - 12, cy + 10, 8, 3, -0.7, 0, Math.PI * 2); x.fill();
    }
  } else if (style === 'stripe') {
    // broad regency stripes with pin lines
    for (let i = 0; i < 8; i++) {
      x.globalAlpha = 0.24; x.fillRect(i * 64, 0, 30, S);
      x.globalAlpha = 0.35; x.fillRect(i * 64 + 40, 0, 3, S); x.fillRect(i * 64 + 50, 0, 3, S);
    }
  } else if (style === 'diamond') {
    // lattice of thin diagonal lines with dots
    x.globalAlpha = 0.25; x.lineWidth = 2;
    for (let i = -8; i < 16; i++) {
      x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64 + S, S); x.stroke();
      x.beginPath(); x.moveTo(i * 64 + S, 0); x.lineTo(i * 64, S); x.stroke();
    }
    x.globalAlpha = 0.35;
    for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) { x.beginPath(); x.arc(q * 64 + 32, r * 64 + 32, 4, 0, Math.PI * 2); x.fill(); }
  } else if (style === 'kids') {
    // faded nursery print: stars, moons and little ducks
    for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) {
      const cx = col * 86 + (row % 2) * 43 + 20, cy = row * 64 + 30;
      x.globalAlpha = 0.3;
      const kind = (row * 7 + col * 3) % 3;
      if (kind === 0) { x.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 4 : 10; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill(); }
      else if (kind === 1) { x.beginPath(); x.arc(cx, cy, 10, 0.6, Math.PI * 2 - 0.6); x.arc(cx + 5, cy, 8, Math.PI * 2 - 0.9, 0.9, true); x.fill(); }
      else { x.beginPath(); x.ellipse(cx, cy + 3, 11, 7, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(cx + 9, cy - 6, 5, 0, Math.PI * 2); x.fill(); }
    }
  } else if (style === 'panel') {
    // dark wood boards (library / office)
    for (let i = 0; i < 8; i++) {
      x.globalAlpha = 0.2 + rnd() * 0.2; x.fillRect(i * 64, 0, 64, S);
      x.globalAlpha = 0.6; x.fillRect(i * 64, 0, 2, S);
      x.globalAlpha = 0.12;
      for (let k = 0; k < 6; k++) { x.lineWidth = 1; x.beginPath(); const xx = i * 64 + 6 + rnd() * 52; x.moveTo(xx, 0); x.bezierCurveTo(xx + 6, S * 0.3, xx - 6, S * 0.6, xx + 3, S); x.stroke(); }
    }
  }
  // plain: nothing but the base colour and the grime below
  x.globalAlpha = 1;
  stains(x, S, rnd, Math.round(14 * dirt), '60,45,20', 90, 0.22);
  drips(x, S, rnd, Math.round(18 * dirt), '50,35,15');
  // Grime toward the bottom
  const g = x.createLinearGradient(0, S * 0.55, 0, S);
  g.addColorStop(0, 'rgba(30,20,10,0)');
  g.addColorStop(1, 'rgba(30,20,10,0.45)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  // Peeling patches showing plaster
  for (let i = 0; i < 4; i++) {
    x.fillStyle = 'rgba(150,140,120,0.5)';
    x.beginPath();
    const px = rnd() * S, py = rnd() * S;
    x.moveTo(px, py);
    for (let k = 0; k < 7; k++) x.lineTo(px + (rnd() - 0.3) * 50, py + (rnd() - 0.3) * 50);
    x.fill();
  }
  noiseLayer(x, S, rnd, 26);
  return toTexture(c);
}

function planks(seed, base) {
  const S = 512, rnd = mulberry32(seed);
  const [c, x] = canvas(S);
  const rows = 6;
  const h = S / rows;
  for (let r = 0; r < rows; r++) {
    let xo = -rnd() * 200;
    while (xo < S) {
      const len = 160 + rnd() * 260;
      const shade = 0.75 + rnd() * 0.35;
      const [br, bg, bb] = base;
      x.fillStyle = `rgb(${br * shade | 0},${bg * shade | 0},${bb * shade | 0})`;
      x.fillRect(xo, r * h, len, h);
      // grain
      x.strokeStyle = `rgba(20,10,5,${0.15 + rnd() * 0.15})`;
      for (let k = 0; k < 9; k++) {
        x.lineWidth = 0.5 + rnd() * 1.5;
        x.beginPath();
        const yy = r * h + rnd() * h;
        x.moveTo(xo, yy);
        x.bezierCurveTo(xo + len * 0.3, yy + (rnd() - 0.5) * 8, xo + len * 0.6, yy + (rnd() - 0.5) * 8, xo + len, yy + (rnd() - 0.5) * 6);
        x.stroke();
      }
      x.fillStyle = 'rgba(10,5,0,0.7)';
      x.fillRect(xo, r * h, 2, h);
      xo += len;
    }
    x.fillStyle = 'rgba(8,4,0,0.8)';
    x.fillRect(0, r * h, S, 2);
  }
  stains(x, S, rnd, 10, '25,15,5', 80, 0.3);
  noiseLayer(x, S, rnd, 22);
  return toTexture(c);
}

function tiles(seed, a, b, grout, n = 8) {
  const S = 512, rnd = mulberry32(seed);
  const [c, x] = canvas(S);
  const t = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const col = (i + j) % 2 ? a : b;
    const sh = 0.85 + rnd() * 0.2;
    x.fillStyle = `rgb(${col[0] * sh | 0},${col[1] * sh | 0},${col[2] * sh | 0})`;
    x.fillRect(i * t, j * t, t, t);
    if (rnd() < 0.12) { // cracked tile
      x.strokeStyle = 'rgba(30,25,20,0.6)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(i * t + rnd() * t, j * t);
      x.lineTo(i * t + rnd() * t, j * t + t * 0.5);
      x.lineTo(i * t + rnd() * t, j * t + t);
      x.stroke();
    }
  }
  x.strokeStyle = grout;
  x.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    x.beginPath(); x.moveTo(i * t, 0); x.lineTo(i * t, S); x.stroke();
    x.beginPath(); x.moveTo(0, i * t); x.lineTo(S, i * t); x.stroke();
  }
  stains(x, S, rnd, 12, '50,40,20', 70, 0.25);
  noiseLayer(x, S, rnd, 18);
  return toTexture(c);
}

function concrete(seed, base = [92, 90, 86]) {
  const S = 512, rnd = mulberry32(seed);
  const [c, x] = canvas(S);
  x.fillStyle = `rgb(${base.join(',')})`;
  x.fillRect(0, 0, S, S);
  stains(x, S, rnd, 30, '40,38,34', 70, 0.25);
  stains(x, S, rnd, 10, '70,50,30', 50, 0.2);
  x.strokeStyle = 'rgba(25,22,20,0.55)';
  for (let i = 0; i < 6; i++) {
    x.lineWidth = 1 + rnd();
    x.beginPath();
    let px = rnd() * S, py = rnd() * S;
    x.moveTo(px, py);
    for (let k = 0; k < 8; k++) { px += (rnd() - 0.5) * 60; py += (rnd() - 0.5) * 60; x.lineTo(px, py); }
    x.stroke();
  }
  noiseLayer(x, S, rnd, 40);
  return toTexture(c);
}

function fabric(seed, base, stripe = null) {
  const S = 256, rnd = mulberry32(seed);
  const [c, x] = canvas(S);
  x.fillStyle = `rgb(${base.join(',')})`;
  x.fillRect(0, 0, S, S);
  if (stripe) {
    x.fillStyle = stripe;
    for (let i = 0; i < S; i += 32) x.fillRect(i, 0, 10, S);
  }
  x.globalAlpha = 0.25;
  for (let i = 0; i < S; i += 2) {
    x.fillStyle = i % 4 ? '#000' : '#fff';
    x.fillRect(0, i, S, 1);
  }
  x.globalAlpha = 1;
  stains(x, S, rnd, 8, '40,30,15', 40, 0.3);
  noiseLayer(x, S, rnd, 30);
  return toTexture(c);
}

function woodFurniture(seed, base) {
  const S = 256, rnd = mulberry32(seed);
  const [c, x] = canvas(S);
  x.fillStyle = `rgb(${base.join(',')})`;
  x.fillRect(0, 0, S, S);
  for (let k = 0; k < 40; k++) {
    x.strokeStyle = `rgba(15,8,3,${0.1 + rnd() * 0.25})`;
    x.lineWidth = 0.5 + rnd() * 2;
    x.beginPath();
    const yy = rnd() * S;
    x.moveTo(0, yy);
    x.bezierCurveTo(S * 0.3, yy + (rnd() - 0.5) * 20, S * 0.6, yy + (rnd() - 0.5) * 20, S, yy + (rnd() - 0.5) * 10);
    x.stroke();
  }
  stains(x, S, rnd, 6, '10,5,0', 40, 0.3);
  noiseLayer(x, S, rnd, 20);
  return toTexture(c);
}

function rust(seed) {
  const S = 256, rnd = mulberry32(seed);
  const [c, x] = canvas(S);
  x.fillStyle = '#5b5f60';
  x.fillRect(0, 0, S, S);
  stains(x, S, rnd, 25, '110,50,20', 40, 0.45);
  stains(x, S, rnd, 15, '30,25,20', 30, 0.4);
  noiseLayer(x, S, rnd, 30);
  return toTexture(c);
}

function brick(seed) {
  const S = 512, rnd = mulberry32(seed);
  const [c, x] = canvas(S);
  x.fillStyle = '#2a1a14'; x.fillRect(0, 0, S, S);
  const bh = 32, bw = 96;
  for (let r = 0; r < S / bh; r++) for (let k = -1; k < S / bw + 1; k++) {
    const xo = k * bw + (r % 2) * bw / 2;
    const sh = 0.7 + rnd() * 0.45;
    x.fillStyle = `rgb(${110 * sh | 0},${52 * sh | 0},${38 * sh | 0})`;
    x.fillRect(xo + 3, r * bh + 3, bw - 6, bh - 6);
  }
  stains(x, S, rnd, 16, '10,5,0', 90, 0.35);
  noiseLayer(x, S, rnd, 26);
  return toTexture(c);
}

function plaster(seed) {
  const S = 256, rnd = mulberry32(seed);
  const [c, x] = canvas(S);
  x.fillStyle = '#8e877a';
  x.fillRect(0, 0, S, S);
  stains(x, S, rnd, 10, '70,55,25', 70, 0.35);
  noiseLayer(x, S, rnd, 18);
  return toTexture(c);
}

/** Build the shared material library. */
export function buildMaterials() {
  const std = (map, opts = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...opts });
  const M = {};
  M.wallA = std(wallpaper(11, '#6f6a4e', '#2f2a18'));
  M.wallB = std(wallpaper(23, '#5d4a4a', '#2a1515'));
  M.wallC = std(wallpaper(37, '#4f5a54', '#18241e'));
  M.wallRose = std(wallpaper(201, '#7a5552', '#3a1818', 'floral'));
  M.wallKids = std(wallpaper(203, '#7d8a90', '#2c3a44', 'kids', 1.6));
  M.wallStripe = std(wallpaper(205, '#4a2a2c', '#1a0808', 'stripe'));
  M.wallGreenStripe = std(wallpaper(207, '#3e4a3c', '#121a10', 'stripe'));
  M.wallDiamond = std(wallpaper(209, '#857a56', '#3a301a', 'diamond'));
  M.wallPlain = std(wallpaper(211, '#6e6a60', '#000000', 'plain', 1.4));
  M.wallPanel = std(wallpaper(213, '#3b2717', '#120a04', 'panel', 0.6));
  M.wallFilth = std(wallpaper(215, '#4a3a30', '#1a0e08', 'plain', 3.0));
  M.wallTile = std(tiles(41, [150, 156, 146], [128, 136, 126], 'rgba(40,40,30,0.8)', 10), { roughness: 0.55 });
  M.wallBase = std(concrete(51, [80, 78, 72]));
  M.floorWood = std(planks(61, [92, 62, 38]));
  M.floorWoodDark = std(planks(67, [62, 42, 28]));
  // Creaky boards: a little darker and more worn than the floor around them.
  M.boardCreak = std(planks(69, [50, 33, 22]), { roughness: 0.98, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  M.floorTile = std(tiles(71, [150, 146, 130], [40, 40, 38], 'rgba(20,20,15,0.9)', 8), { roughness: 0.6 });
  M.floorBath = std(tiles(73, [110, 130, 128], [90, 110, 108], 'rgba(30,30,25,0.9)', 12), { roughness: 0.5 });
  M.floorConcrete = std(concrete(79));
  M.carpet = std(fabric(83, [74, 36, 34]));
  M.carpetB = std(fabric(85, [44, 52, 64]));
  M.ceiling = std(plaster(89));
  M.wood = std(woodFurniture(97, [88, 58, 36]));
  M.woodDark = std(woodFurniture(101, [45, 30, 20]));
  M.woodPale = std(woodFurniture(103, [120, 98, 70]));
  M.fabricRed = std(fabric(107, [90, 30, 28], 'rgba(0,0,0,0.15)'));
  M.fabricGreen = std(fabric(109, [52, 62, 44]));
  M.fabricBed = std(fabric(113, [150, 140, 118], 'rgba(90,70,40,0.25)'));
  M.metal = std(rust(127), { metalness: 0.5, roughness: 0.6 });
  M.porcelain = new THREE.MeshStandardMaterial({ color: 0xb8b5a8, roughness: 0.35 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.9 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xcfc6a8, roughness: 1 });
  M.safeSteel = std(rust(139), { metalness: 0.65, roughness: 0.45, color: 0x55605a });
  // nightclub: glossy black floor, deep purple velvet walls
  M.floorClub = std(tiles(221, [22, 18, 26], [14, 12, 18], 'rgba(120,60,160,0.35)', 6), { roughness: 0.25, metalness: 0.2 });
  M.wallClub = std(wallpaper(223, '#2a1030', '#0a0410', 'damask', 0.3), { roughness: 0.8 });
  M.sheet = std(fabric(217, [170, 164, 148], 'rgba(60,50,30,0.15)'));
  M.brick = std(brick(219));
  M.brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.8, roughness: 0.35 });
  M.red = new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.5, emissive: 0x200000 });
  M.frame = std(woodFurniture(131, [70, 46, 22]), { roughness: 0.6 });
  M.glassWin = new THREE.MeshStandardMaterial({ color: 0x6a7a8a, roughness: 0.08, metalness: 0.3, emissive: 0x0b1420, emissiveIntensity: 1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  M.bulb = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  M.blood = new THREE.MeshStandardMaterial({ color: 0x3a0505, roughness: 0.3, transparent: true, opacity: 0.85 });
  return M;
}
