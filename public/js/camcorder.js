// The handheld camcorder (camera.glb), found on the table in the back room where
// everyone wakes up. Pick it up like any item; others see it in your hand; drop it with G.
// While it's the selected item:
//   R  record / pause      Z / X  zoom in / out      V  selfie      T  camera light
// The flip-out screen shows what the lens sees, rendered live from the camera's own
// position (in selfie mode it turns round and films you). Recording captures that
// picture plus the game's audio mix (footsteps, monsters, music, other players' voice
// chat as you hear it) and your own microphone, and pauses cut cleanly. At the end of
// the round you can watch the clip and save it (a normal browser download) or bin it.
import * as THREE from 'three';
import { audio } from './audio.js';
import { loadGLTF } from './assets.js';
import { mic } from './voice.js';
import { settings } from './settings.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const W = 480, H = 270, FPS = 24;
export const CAMCORDER_SPOT = [16.25, 0.71, 11.6]; // the back-room table

export class Camcorder {
  constructor(game) {
    this.game = game;
    this.zoom = 1;
    this.selfie = false;
    this.lightOn = true;
    this.rec = null;      // { recorder, chunks, state: 'rec' | 'paused', t, started }
    this.clip = null;     // finished Blob
  }

  async init() {
    const G = this.game;
    const gl = await loadGLTF('cameraModel');
    // the model's lens points down its −x axis: turn it so the lens faces −z (forward),
    // and tone its very light texture down to a dark, worn plastic
    this.model = fit(gl?.scene, 0.24) || fallbackModel();
    this.model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.42); o.material.roughness = 0.6; } });
    G.placeItem('camcorder', 'camcorder', { pos: CAMCORDER_SPOT });
    const it = G.items.get('camcorder');
    const fm = this.model.clone(); fm.rotation.y = -Math.PI / 2; it.mesh.add(fm); // lens along the item's facing
    // the camcorder's own camera, its render target and the light on it
    this.cam = new THREE.PerspectiveCamera(60, W / H, 0.05, 60);
    this.cam.layers.enable(0);
    this.rt = new THREE.WebGLRenderTarget(W, H);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.light = new THREE.SpotLight(0xfff4e0, 0, 20, 0.45, 0.5, 1.4);
    G.scene.add(this.light, this.light.target);
    this.camQ = new THREE.Quaternion();
    // recording surface
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx2d = this.canvas.getContext('2d');
    this.pix = new Uint8Array(W * H * 4);
    this.img = this.ctx2d.createImageData(W, H);
    // HUD
    this.hud = document.createElement('div');
    this.hud.className = 'camHud vt';
    document.getElementById('hud')?.appendChild(this.hud);
    this.onKey = e => {
      if (!this.holding() || e.repeat) return;
      if (e.code === 'KeyR') this.toggleRecord();
      else if (e.code === 'KeyZ') this.setZoom(this.zoom * 1.4);
      else if (e.code === 'KeyX') this.setZoom(this.zoom / 1.4);
      else if (e.code === 'KeyV') { this.selfie = !this.selfie; audio.play('click', { vol: 0.3, rate: 1.4 }); }
      else if (e.code === 'KeyT') { this.lightOn = !this.lightOn; audio.play('click', { vol: 0.3, rate: 2 }); }
    };
    addEventListener('keydown', this.onKey);
  }

  /** The model held in someone else's hand (no screen). */
  remoteModel() {
    // in someone's (avatar) hand: lens toward where they face (+z for avatars)
    const g = new THREE.Group(), m = this.model.clone();
    m.rotation.y = Math.PI / 2;
    g.add(m);
    return g;
  }

  /** The first-person model: the camcorder with its flip-out screen showing the live picture. */
  localModel() {
    const g = new THREE.Group();
    const m = this.model.clone();
    m.scale.multiplyScalar(0.7);
    m.rotation.y = -Math.PI / 2; // lens forward, the bulky back toward you
    m.position.set(0, -0.05, -0.05);
    g.add(m);
    // the flip-out screen: swung open on the left side, facing you, showing the live picture
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.058), new THREE.MeshBasicMaterial({ map: this.rt.texture, toneMapped: false }));
    screen.position.set(-0.115, 0.03, 0.02);
    screen.rotation.y = 0.25;
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.068, 0.008), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.5 }));
    bezel.position.set(-0.116, 0.03, 0.015);
    bezel.rotation.y = 0.25;
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.012), bezel.material);
    hinge.position.set(-0.06, 0.03, 0.0);
    g.add(bezel, screen, hinge);
    return g;
  }

  holding() {
    const G = this.game;
    return !G.localDead && !G.me?.dying && G.selectedItem()?.type === 'camcorder';
  }

  setZoom(z) {
    this.zoom = Math.max(1, Math.min(6, z));
    audio.play('click', { vol: 0.2, rate: 2.4 });
  }

  // ------------------------------------------------------------ recording
  toggleRecord() {
    if (!this.rec) return this.startRecording();
    if (this.rec.state === 'rec') { this.rec.recorder.pause(); this.rec.state = 'paused'; }
    else { this.rec.recorder.resume(); this.rec.state = 'rec'; }
    audio.play('click', { vol: 0.4, rate: 0.8 });
  }

  startRecording() {
    const G = this.game;
    if (typeof MediaRecorder === 'undefined' || !this.canvas.captureStream) { G.message('This browser can\'t record video.', 3); return; }
    const stream = this.canvas.captureStream(FPS);
    // the game's whole mix (it already includes other players' voices as you hear them)
    // plus your own microphone, unless it's muted
    this.audioOk = false;
    try {
      const ctx = audio.ctx;
      this.dest = ctx.createMediaStreamDestination();
      audio.master.connect(this.dest);
      if (mic.stream && !settings.micMuted) { this.micSrc = ctx.createMediaStreamSource(mic.stream); this.micSrc.connect(this.dest); }
      for (const t of this.dest.stream.getAudioTracks()) stream.addTrack(t);
      this.audioOk = true;
    } catch (e) { console.warn('[AJAN] camcorder audio unavailable', e); }
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const mimeType = types.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    let recorder;
    try { recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_000_000 } : undefined); } catch (e) { G.message('Recording failed to start.', 3); return; }
    const rec = { recorder, chunks: [], state: 'rec', t: 0, mimeType: recorder.mimeType || mimeType || 'video/webm', stream };
    recorder.ondataavailable = e => { if (e.data?.size) rec.chunks.push(e.data); };
    recorder.start(1000);
    this.rec = rec;
    audio.play('click', { vol: 0.5, rate: 0.6 });
    G.message(this.audioOk ? 'Recording. R pauses.' : 'Recording (no audio: this browser won\'t mix it in). R pauses.', 3);
  }

  /** Stop the recorder and hand back the finished clip (null if nothing was recorded). */
  finish() {
    const rec = this.rec;
    if (!rec) return Promise.resolve(this.clip);
    this.rec = null;
    return new Promise(resolve => {
      rec.recorder.onstop = () => {
        try { audio.master.disconnect(this.dest); } catch { /* already */ }
        this.micSrc?.disconnect();
        rec.stream.getTracks().forEach(t => t.stop());
        const blob = rec.chunks.length ? new Blob(rec.chunks, { type: rec.mimeType.split(';')[0] }) : null;
        this.clip = blob && blob.size > 0 ? blob : null;
        resolve(this.clip);
      };
      try { rec.recorder.state === 'inactive' ? rec.recorder.onstop() : rec.recorder.stop(); } catch { resolve(null); }
    });
  }

  /** End of the round: show the clip, with SAVE and DISCARD. */
  async offerReview() {
    const hadRec = !!this.rec;
    const blob = await this.finish();
    if (!blob) { if (hadRec) this.game.toast?.('The recording was empty.', 4000); return; }
    const url = URL.createObjectURL(blob);
    const box = document.createElement('div');
    box.className = 'clipReview vt';
    box.innerHTML = `<div class="crTitle">YOUR TAPE</div><video controls playsinline src="${url}"></video>
      <div class="crRow"><button class="btn" data-a="save">SAVE TO COMPUTER</button><button class="btn ghost" data-a="discard">DISCARD</button></div>
      <div class="crNote">${this.audioOk ? '' : 'No audio track (your browser could not mix the game sound in).'}</div>`;
    document.body.appendChild(box);
    const close = () => { box.remove(); URL.revokeObjectURL(url); this.clip = null; };
    box.querySelector('[data-a="save"]').onclick = () => {
      const a = document.createElement('a');
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      a.href = url;
      a.download = `AJAN-tape-round-${(this.game.seed >>> 0).toString(36)}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(close, 500);
    };
    box.querySelector('[data-a="discard"]').onclick = close;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const G = this.game;
    const held = this.holding();
    const it = G.items.get('camcorder');
    // somebody else picked it up while you were recording: your tape ends there
    if (this.rec && it?.holder && it.holder !== G.localId) { this.finish(); }
    // dropped (you put it down, died or were knocked out) while recording: it keeps
    // filming from where it lies, and if you're down you watch through it
    const onFloor = !!this.rec && it && !it.holder && !it.used;
    this.povActive = onFloor && (G.localDead || !!G.me?.knocked || !!G.me?.dying);
    this.light.intensity = held && this.lightOn ? 16 : 0;
    this.hud.classList.toggle('show', held || this.povActive);
    if (onFloor) {
      it.mesh.updateMatrixWorld(true);
      const ry = it.mesh.rotation.y, p = it.mesh.getWorldPosition(V()).add(V(-Math.sin(ry) * 0.17, 0.1, -Math.cos(ry) * 0.17)); // just past its own lens
      this.cam.position.copy(p);
      this.cam.rotation.set(0.05, it.mesh.rotation.y, 0, 'YXZ');
      this.cam.layers.enable(1);
      this.cam.fov = 62; this.cam.updateProjectionMatrix();
      this.renderLens(dt);
      if (this.povActive) this.hud.innerHTML = `<b class="recDot">●</b> REC ${this.clock()} · YOUR CAMERA IS STILL RUNNING<span>it's lying where you dropped it</span>`;
      return;
    }
    if (!held) return;
    // the lens: a little in front of and below your eyes, lagging behind your view
    const eye = G.camera.getWorldPosition(V()), q = G.camera.getWorldQuaternion(new THREE.Quaternion());
    const fwd = V(0, 0, -1).applyQuaternion(q), right = V(1, 0, 0).applyQuaternion(q), up = V(0, 1, 0).applyQuaternion(q);
    const cam = this.cam;
    if (this.selfie) {
      cam.position.copy(eye).addScaledVector(fwd, 0.55).addScaledVector(right, 0.12).addScaledVector(up, -0.05);
      cam.lookAt(eye.x, eye.y - 0.05, eye.z);
      cam.layers.enable(1); // your own body
    } else {
      cam.position.copy(eye).addScaledVector(right, 0.14).addScaledVector(up, -0.12).addScaledVector(fwd, 0.15);
      this.camQ.slerp(q, 1 - Math.exp(-dt * 9));
      cam.quaternion.copy(this.camQ);
      cam.rotateZ(Math.sin(G.time * 1.7) * 0.004);
      cam.layers.disable(1);
    }
    cam.fov = 62 / this.zoom;
    cam.updateProjectionMatrix();
    const dir = V(0, 0, -1).applyQuaternion(cam.quaternion);
    this.light.position.copy(cam.position).addScaledVector(dir, 0.3); // ahead of the lens, so it doesn't light the camera itself
    this.light.target.position.copy(cam.position).addScaledVector(dir, 5);
    this.renderLens(dt);
    const clock = this.clock();
    this.hud.innerHTML = `${this.rec?.state === 'rec' ? '<b class="recDot">●</b> REC' : this.rec ? '❚❚ PAUSED' : 'STANDBY'} ${clock} · ×${this.zoom.toFixed(1)}${this.selfie ? ' · SELFIE' : ''}${this.lightOn ? ' · LIGHT' : ''}<span>R record/pause · Z/X zoom · V selfie · T light · G drop</span>`;
  }

  /** Render the lens view (live screen; ~24 fps) and, while recording, grab the frame. */
  renderLens(dt) {
    const G = this.game;
    this.frameT = (this.frameT || 0) - dt;
    if (this.frameT <= 0) {
      this.frameT = 1 / FPS;
      const r = G.renderer, prev = r.getRenderTarget();
      r.setRenderTarget(this.rt);
      r.render(G.scene, this.cam);
      r.setRenderTarget(prev);
      if (this.rec?.state === 'rec') this.captureFrame();
    }
    if (this.rec?.state === 'rec') this.rec.t += dt;
  }

  clock() {
    const t = this.rec ? this.rec.t : 0;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`;
  }

  /** While you're down and your camera is still filming on the floor, you see what it sees. */
  applyPOV(camera) {
    if (!this.povActive) return;
    camera.position.copy(this.cam.position);
    camera.quaternion.copy(this.cam.quaternion);
  }

  /** Copy the lens picture into the recording canvas (flipped: GL rows run bottom-up). */
  captureFrame() {
    const G = this.game;
    G.renderer.readRenderTargetPixels(this.rt, 0, 0, W, H, this.pix);
    const d = this.img.data, row = W * 4;
    for (let y = 0; y < H; y++) d.set(this.pix.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    const c = this.ctx2d;
    c.putImageData(this.img, 0, 0);
    // a little camcorder overlay burned in
    c.fillStyle = 'rgba(255,40,40,0.9)'; c.beginPath(); c.arc(18, 18, 6, 0, 7); c.fill();
    c.font = '16px "VT323", monospace'; c.fillStyle = '#fff'; c.fillText('REC', 30, 23);
    const t = this.rec.t;
    c.fillText(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`, W - 52, 23);
  }

  dispose() {
    removeEventListener('keydown', this.onKey);
    this.hud?.remove();
    this.light?.parent?.remove(this.light);
    this.rt?.dispose();
  }
}

function fit(src, size) {
  if (!src) return null;
  const m = src.clone();
  const box = new THREE.Box3().setFromObject(m), s = box.getSize(V()), c = box.getCenter(V());
  const k = size / Math.max(s.x, s.y, s.z, 1e-3);
  const g = new THREE.Group();
  m.position.set(-c.x, -box.min.y, -c.z);
  g.add(m);
  g.scale.setScalar(k);
  return g;
}

function fallbackModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  body.position.y = 0.045;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0x080808 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.05, -0.12);
  g.add(body, lens);
  return g;
}
