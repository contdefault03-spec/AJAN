// Asset discovery and loading. The server lists the asset folder so we can pick
// the right filename (and report anything missing) without spamming 404s.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSETS } from './config.js';

function canPlayMp4() {
  try { return !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'); } catch { return true; }
}

export const assetState = { files: new Set(), resolved: {}, missing: [] };

export async function discoverAssets() {
  try {
    const res = await fetch('/api/assets');
    const json = await res.json();
    json.files.forEach(f => assetState.files.add(f));
  } catch (e) {
    console.warn('Asset listing unavailable, assuming default names.', e);
    Object.values(ASSETS).forEach(a => assetState.files.add(a.names[0]));
  }
  assetState.missing = [];
  for (const [key, def] of Object.entries(ASSETS)) {
    let found = def.names.find(n => assetState.files.has(n));
    // Browsers without H.264 support (some Linux Chromium builds) get the WebM copy.
    if (def.webm && assetState.files.has(def.webm) && (!found || !canPlayMp4())) found = def.webm;
    if (found) assetState.resolved[key] = '/assets/' + found;
    else {
      assetState.resolved[key] = null;
      assetState.missing.push(def.names[0]);
    }
  }
  if (assetState.missing.length) console.warn('[AJAN] Missing assets (fallbacks in use):', assetState.missing.join(', '));
  return assetState;
}

export const assetUrl = key => assetState.resolved[key] || null;

const gltfLoader = new GLTFLoader();
const gltfCache = new Map();
export function loadGLTF(key) {
  if (gltfCache.has(key)) return gltfCache.get(key);
  const url = assetUrl(key);
  const p = url
    ? new Promise(resolve => gltfLoader.load(url, g => resolve(g), undefined, err => { console.warn('GLB failed', key, err); resolve(null); }))
    : Promise.resolve(null);
  gltfCache.set(key, p);
  return p;
}

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
export function loadTexture(key) {
  if (texCache.has(key)) return texCache.get(key);
  const url = assetUrl(key);
  const p = url
    ? new Promise(resolve => texLoader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; resolve(t); }, undefined, () => resolve(null)))
    : Promise.resolve(null);
  texCache.set(key, p);
  return p;
}

const bufferCache = new Map();
export function loadAudioBuffer(ctx, key) {
  if (bufferCache.has(key)) return bufferCache.get(key);
  const url = assetUrl(key);
  const p = url
    ? fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).catch(e => { console.warn('Audio failed', key, e); return null; })
    : Promise.resolve(null);
  bufferCache.set(key, p);
  return p;
}

/** Rig spec for whichever player model was found (player1.glb is the current one). */
export const playerSpec = () => (assetUrl('playerModel') || '').endsWith('player1.glb') ? 'player1' : 'player';
