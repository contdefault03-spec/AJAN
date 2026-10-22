// Restrained VHS post-processing: grain, scanlines, chromatic aberration,
// occasional tracking distortion, muted colour, vignette and damage flashes.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VHSShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    amount: { value: 1 },
    tracking: { value: 0 },
    redFlash: { value: 0 },
    fade: { value: 0 },
    res: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float amount; uniform float tracking; uniform float redFlash; uniform float fade; uniform vec2 res;
    varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      float bandPos = fract(time * 0.23);
      float band = tracking * smoothstep(0.07, 0.0, abs(uv.y - bandPos));
      uv.x += band * 0.025 * sin(uv.y * 180.0 + time * 40.0);
      uv.x += amount * 0.0007 * sin(uv.y * 260.0 + time * 9.0);
      float ab = amount * 0.0018 + band * 0.008;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + vec2(ab, 0.0)).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - vec2(ab, 0.0)).b;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l), 0.3 * amount);
      c *= mix(vec3(1.0), vec3(1.03, 1.0, 0.92), amount);
      c *= 1.0 - amount * 0.07 * (0.5 + 0.5 * sin(vUv.y * res.y * 1.5708));
      float g = rand(vUv * res + fract(time * 3.7) * 91.0) - 0.5;
      c += g * 0.028 * amount * (0.4 + l);
      c += band * (rand(vec2(time, floor(uv.y * 160.0))) - 0.5) * 0.12;
      vec2 cc = vUv - 0.5;
      c *= 1.0 - dot(cc, cc) * (0.55 + 0.4 * amount);
      c = mix(c, vec3(l * 0.9 + 0.08, l * 0.05, l * 0.05), redFlash);
      c *= 1.0 - fade;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.vhs = new ShaderPass(VHSShader);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.vhs);
    this.composer.addPass(this.output);
    this.trackingT = 0;
    this.trackingTimer = 8;
  }
  setCamera(cam) { this.renderPass.camera = cam; }
  setSize(w, h) {
    this.composer.setSize(w, h);
    this.vhs.uniforms.res.value.set(w, h);
  }
  setLevel(level) {
    this.vhs.enabled = level !== 'off';
    this.vhs.uniforms.amount.value = level === 'low' ? 0.45 : 1;
  }
  update(dt, time) {
    const u = this.vhs.uniforms;
    u.time.value = time;
    this.trackingTimer -= dt;
    if (this.trackingTimer <= 0) { this.trackingT = 1.2 + Math.random() * 1.5; this.trackingTimer = 14 + Math.random() * 30; }
    if (this.trackingT > 0) this.trackingT -= dt;
    const target = this.trackingT > 0 ? 1 : 0;
    u.tracking.value += (target * u.amount.value - u.tracking.value) * Math.min(1, dt * 5);
  }
  glitch(sec = 0.8) { this.trackingT = Math.max(this.trackingT, sec); }
  render() { if (this.renderer.shadowMap.enabled === false && this.vhs.enabled === false) this.renderer.render(this.renderPass.scene, this.renderPass.camera); else this.composer.render(); }
}
