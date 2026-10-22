// Guitars (guitar1–3.glb) hung on the walls as displays: a few random painting spots each
// round (the painting comes down, the guitar goes up) and one on each of three shed walls.
import * as THREE from 'three';
import { loadGLTF } from './assets.js';

// the model stood upright (longest side up), thinnest side against the wall, ~1.05 m tall
function upright(scene, height = 1.05) {
  const inner = scene.clone(true), wrap = new THREE.Group(), box = new THREE.Box3();
  wrap.add(inner);
  let s = box.setFromObject(wrap).getSize(new THREE.Vector3());
  if (s.x > s.y && s.x >= s.z) inner.rotation.z = Math.PI / 2;
  else if (s.z > s.y && s.z > s.x) inner.rotation.x = Math.PI / 2;
  wrap.updateMatrixWorld(true);
  s = box.setFromObject(wrap).getSize(new THREE.Vector3());
  if (s.x < s.z) { inner.rotation.y += Math.PI / 2; wrap.updateMatrixWorld(true); }
  s = box.setFromObject(wrap).getSize(new THREE.Vector3());
  inner.scale.multiplyScalar(height / s.y);
  wrap.updateMatrixWorld(true);
  const c = box.setFromObject(wrap).getCenter(new THREE.Vector3()), b = box.min.z;
  inner.position.sub(new THREE.Vector3(c.x, c.y, b)); // centred, back face on the wall
  inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return wrap;
}

export async function hangGuitars(G) {
  const gl = await Promise.all(['guitar1', 'guitar2', 'guitar3'].map(k => loadGLTF(k).catch(() => null)));
  const models = gl.map(g => g?.scene && upright(g.scene)).filter(Boolean);
  if (!models.length) return;
  const H = G.house, hang = (m, x, y, z, ry, tilt = 0) => {
    const g = m.clone(true);
    g.position.set(x, y, z); g.rotation.set(0, ry, tilt);
    H.group.add(g);
  };
  // random painting spots through the house (seeded: everyone sees the same walls)
  const slots = H.paintingSlots.filter(s => s.group.visible && !s.pick12);
  for (let i = 0; i < 7 && slots.length; i++) {
    const s = slots.splice(Math.floor(G.rnd() * slots.length), 1)[0];
    s.group.visible = false;
    s.guitar = true;
    const p = s.group.position;
    hang(models[i % models.length], p.x, p.y - 0.05, p.z, s.group.rotation.y, (G.rnd() - 0.5) * 0.12);
  }
  // the shed: one on each of three walls
  hang(models[0], 33.6, 1.55, -13.14, 0, 0.05);
  hang(models[1 % models.length], 26.06, 1.55, -9.6, Math.PI / 2, -0.04);
  hang(models[2 % models.length], 36.94, 1.6, -11.3, -Math.PI / 2, 0.03);
}
