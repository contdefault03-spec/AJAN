// CRT television + security monitors: render-target camera feeds, static,
// scanlines, distortion, labels and timestamps.
import * as THREE from 'three';
import { CAMERAS } from './house.js';

const SCREEN_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SCREEN_FRAG = `
uniform sampler2D tex; uniform float mode; uniform float time; uniform float glitch; uniform float tint; uniform float bright;
varying vec2 vUv;
float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 cc = vUv - 0.5;
  vec2 uv = 0.5 + cc * (1.0 + dot(cc, cc) * 0.25);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
  float line = floor(uv.y * 220.0);
  float jit = (rand(vec2(line, floor(time * 24.0))) - 0.5) * 0.012 * (0.3 + glitch * 3.0);
  float tear = step(0.985 - glitch * 0.2, rand(vec2(floor(time * 8.0), floor(uv.y * 12.0))));
  uv.x += jit + tear * 0.05;
  float n = rand(uv * vec2(260.0, 200.0) + fract(time * 7.13) * 100.0);
  vec3 col = vec3(n * 0.85);
  if (mode > 1.5) {
    vec3 img;
    img.r = texture2D(tex, uv + vec2(0.003 * (1.0 + glitch * 4.0), 0.0)).r;
    img.g = texture2D(tex, uv).g;
    img.b = texture2D(tex, uv - vec2(0.003 * (1.0 + glitch * 4.0), 0.0)).b;
    float g = dot(img, vec3(0.3, 0.59, 0.11));
    vec3 mono = mix(vec3(g), vec3(g * 0.8, g * 1.05, g * 0.85), tint);
    col = mix(img, mono, 0.45 + tint * 0.4) * bright + (n - 0.5) * (0.07 + glitch * 0.3);
    col = mix(col, vec3(n), glitch * 0.3);
  }
  float roll = smoothstep(0.0, 0.08, abs(fract(uv.y * 1.2 - time * 0.11) - 0.5));
  col *= 0.82 + 0.18 * roll;
  col *= 0.78 + 0.22 * sin(uv.y * 700.0);
  col *= 1.0 - dot(cc, cc) * 1.6;
  if (mode < 0.5) col = vec3(0.012);
  gl_FragColor = vec4(col, 1.0);
}`;

function screenMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: null }, mode: { value: 0 }, time: { value: 0 }, glitch: { value: 0 }, tint: { value: 1 }, bright: { value: 2.6 },
    },
    vertexShader: SCREEN_VERT,
    fragmentShader: SCREEN_FRAG,
    toneMapped: false,
  });
}

const TV_TEXTS = ['HE CAN HEAR YOU', 'DON\'T RUN', 'BASEMENT', 'FIND THE FUSE', 'HE IS HUNGRY', 'LOOK BEHIND YOU', 'STAY QUIET', 'HIDE'];

export class Screens {
  constructor(house, paintingTextures) {
    this.house = house;
    this.paintingTextures = paintingTextures;
    this.cams = CAMERAS.map(c => {
      const cam = new THREE.PerspectiveCamera(72, 4 / 3, 0.05, 40);
      cam.position.set(...c.pos);
      cam.lookAt(...c.look);
      cam.layers.enable(1);
      // Render targets hold linear light (no tone mapping), so sample them as linear.
      const rt = new THREE.WebGLRenderTarget(256, 192, { type: THREE.HalfFloatType });
      return { ...c, cam, rt, lastRender: -1 };
    });
    // Little camera housings so players can spot them
    for (const c of CAMERAS) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      m.position.set(...c.pos);
      m.lookAt(...c.look);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      led.position.set(0.04, 0.03, 0.11);
      m.add(led);
      house.group.add(m);
    }

    // Security monitors
    this.monitorSel = [0, 2, 3, 4];
    this.monitorGlitch = [0, 0, 0, 0];
    this.monitors = house.monitors.map((mon, i) => {
      const mat = screenMaterial();
      mat.uniforms.tint.value = 1;
      mon.screen.material = mat;
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 192;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      mon.label.material.map = tex;
      mon.label.material.needsUpdate = true;
      return { mon, mat, cv, tex, i };
    });

    // TV
    this.tvMat = screenMaterial();
    this.tvMat.uniforms.tint.value = 0.2;
    house.tv.screen.material = this.tvMat;
    this.tvCanvas = document.createElement('canvas');
    this.tvCanvas.width = 320; this.tvCanvas.height = 240;
    this.tvTex = new THREE.CanvasTexture(this.tvCanvas);
    this.tvTex.colorSpace = THREE.SRGBColorSpace;
    this.tvLight = new THREE.PointLight(0x9fb6ff, 0, 5, 1.5);
    this.tvLight.position.set(1.2, 0.9, 15.25);
    house.group.add(this.tvLight);
    this.tv = { mode: 'off', content: 0 };
    this.labelT = 0;
  }

  /** mode: off | static | cam | image ; content: cam index or image index */
  setTV(mode, content = 0) {
    this.tv = { mode, content };
    const u = this.tvMat.uniforms;
    if (mode === 'off') u.mode.value = 0;
    else if (mode === 'static') u.mode.value = 1;
    else if (mode === 'cam') { u.mode.value = 2; u.tex.value = this.cams[content % this.cams.length].rt.texture; u.tint.value = 0.9; }
    else if (mode === 'image') { u.mode.value = 2; this.drawTVImage(content); u.tex.value = this.tvTex; u.tint.value = 0.1; }
  }

  drawTVImage(k) {
    const c = this.tvCanvas.getContext('2d');
    const W = c.canvas.width, Hh = c.canvas.height;
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, Hh);
    const imgs = this.paintingTextures.filter(Boolean).map(t => t.image);
    if (k % 2 === 0 && imgs.length) {
      const img = imgs[k % imgs.length];
      const s = Math.min(W / img.width, Hh / img.height) * 1.25;
      c.filter = 'grayscale(1) contrast(2.2) brightness(0.7)';
      c.drawImage(img, (W - img.width * s) / 2, (Hh - img.height * s) / 2 + 10, img.width * s, img.height * s);
      c.filter = 'none';
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = '#c02020';
      c.fillRect(0, 0, W, Hh);
      c.globalCompositeOperation = 'source-over';
    }
    const text = TV_TEXTS[k % TV_TEXTS.length];
    c.font = 'bold 34px "Courier New", monospace';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.shadowColor = '#f00';
    c.shadowBlur = 12;
    c.fillText(text, W / 2, k % 2 === 0 ? Hh - 24 : Hh / 2 + 12);
    c.shadowBlur = 0;
    this.tvTex.needsUpdate = true;
  }

  setMonitor(i, camIndex) {
    this.monitorSel[i] = camIndex % this.cams.length;
    this.monitorGlitch[i] = 1;
  }

  drawLabels(timeStr) {
    for (const m of this.monitors) {
      const c = m.cv.getContext('2d');
      c.clearRect(0, 0, 256, 192);
      if (!this.house.power) { m.tex.needsUpdate = true; continue; }
      const cam = this.cams[this.monitorSel[m.i]];
      c.font = '15px "VT323", "Courier New", monospace';
      c.fillStyle = 'rgba(230,255,230,0.85)';
      c.fillText(cam.label, 12, 22);
      c.fillText(timeStr, 12, 180);
      if (Math.floor(performance.now() / 600) % 2) {
        c.fillStyle = '#ff2a2a';
        c.beginPath(); c.arc(226, 17, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(230,255,230,0.85)';
        c.fillText('REC', 196, 22);
      }
      m.tex.needsUpdate = true;
    }
  }

  /**
   * Render camera feeds that are currently visible. viewerPos decides which
   * screens matter so we don't waste GPU time.
   */
  update(dt, time, renderer, scene, viewerPos, timeStr) {
    const nearSec = viewerPos.x > 20 && viewerPos.z < 11 && viewerPos.y > -1;
    const nearTV = viewerPos.x < 12 && viewerPos.z > 9 && viewerPos.y > -1;
    const want = new Set();
    if (nearSec && this.house.power) this.monitorSel.forEach(i => want.add(i));
    if (nearTV && this.tv.mode === 'cam') want.add(this.tv.content % this.cams.length);
    // Render at most two feeds per frame, oldest first
    const list = [...want].map(i => this.cams[i]).sort((a, b) => a.lastRender - b.lastRender).slice(0, 2);
    if (list.length) {
      const prevTarget = renderer.getRenderTarget();
      const prevShadow = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      // Screens can't appear in a feed that they themselves display (feedback loop).
      const screens = [this.house.tv.screen, ...this.house.monitors.map(m => m.screen)];
      screens.forEach(s => { s.visible = false; });
      for (const c of list) {
        renderer.setRenderTarget(c.rt);
        renderer.render(scene, c.cam);
        c.lastRender = time;
      }
      screens.forEach(s => { s.visible = true; });
      renderer.setRenderTarget(prevTarget);
      renderer.shadowMap.autoUpdate = prevShadow;
    }
    this.monitors.forEach(m => {
      const u = m.mat.uniforms;
      u.time.value = time;
      this.monitorGlitch[m.i] = Math.max(0, this.monitorGlitch[m.i] - dt * 1.5);
      if (Math.random() < dt * 0.06) this.monitorGlitch[m.i] = 0.6;
      u.glitch.value = this.monitorGlitch[m.i];
      if (!this.house.power) u.mode.value = 0;
      else { u.mode.value = 2; u.tex.value = this.cams[this.monitorSel[m.i]].rt.texture; }
    });
    this.labelT -= dt;
    if (this.labelT <= 0 && nearSec) { this.labelT = 0.5; this.drawLabels(timeStr); }
    const tu = this.tvMat.uniforms;
    tu.time.value = time;
    tu.glitch.value = this.tv.mode === 'image' ? 0.08 + Math.max(0, Math.sin(time * 2.3)) * 0.3 : this.tv.mode === 'cam' ? 0.08 + (Math.random() < 0.03 ? 0.7 : 0) : 0.1;
    this.tvLight.intensity = this.tv.mode === 'off' ? 0 : 1.2 + Math.random() * 0.8;
  }
}
