// Local first-person controller: movement, collisions, crouch, sprint stamina,
// flashlight, head bob, footsteps (which make noise Ajan can hear) and
// visible first-person hands.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { collideCircle, groundAt } from './physics.js';
import { clamp, damp } from './util.js';
import { settings } from './settings.js';
import { audio } from './audio.js';

export class LocalPlayer {
  constructor(game, camera, colors) {
    this.game = game;
    this.camera = camera;
    this.pos = new THREE.Vector3(14, 0, 14);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = 0;
    this.crouch = false;
    this.crouchK = 0;
    this.run = false;
    this.stamina = PLAYER.stamina;
    this.exhausted = false;
    this.flash = true;
    this.speed = 0;
    this.stepDist = 0;
    this.bobT = 0;
    this.keys = new Set();
    this.frozen = true;
    this.hidden = null;
    this.hideLook = 0;
    this.actT = 9;
    this.actCount = 0;
    this.turnRate = 0;

    // Flashlight
    this.light = new THREE.SpotLight(0xfff0d8, 0, 26, 0.6, 0.55, 1.5);
    this.light.position.set(0.18, -0.15, 0.1);
    this.light.target.position.set(0.1, -0.3, -5);
    camera.add(this.light, this.light.target);
    // Small fill so the area right around you isn't pitch black
    this.fill = new THREE.PointLight(0xa0b0d0, 0.8, 4.5, 1.6);
    camera.add(this.fill);

    this.buildHands(colors);
    this.bindInput();
  }

  setShadows(q) {
    this.light.castShadow = q !== 'low';
    const s = q === 'high' ? 1024 : 512;
    this.light.shadow.mapSize.set(s, s);
    this.light.shadow.bias = -0.0008;
    this.light.shadow.camera.near = 0.2;
    this.light.shadow.camera.far = 24;
  }

  buildHands(colors) {
    const skin = new THREE.MeshStandardMaterial({ color: 0x9c7258, roughness: 0.75, emissive: 0x120806 });
    const sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.shirt), roughness: 0.9, emissive: new THREE.Color(colors.shirt).multiplyScalar(0.03) });
    this.hands = new THREE.Group();
    const arm = (side) => {
      const g = new THREE.Group();
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.3, 10), sleeve);
      fore.rotation.x = Math.PI / 2;
      fore.position.z = 0.06;
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.06, 8), skin);
      wrist.rotation.x = Math.PI / 2;
      wrist.position.z = -0.11;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.032, 0.08), skin);
      hand.position.z = -0.17;
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.04), skin);
      thumb.position.set(side * -0.033, 0.01, -0.15);
      g.add(fore, hand, thumb);
      return g;
    };
    this.leftArm = arm(-1);
    this.rightArm = arm(1);
    const torch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.4 }));
    body.rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
    lens.position.z = -0.101;
    lens.rotation.y = Math.PI;
    this.lens = lens;
    torch.add(body, lens);
    torch.position.set(0, 0.03, -0.19);
    this.leftArm.add(torch);
    this.hands.add(this.leftArm, this.rightArm);
    this.hands.traverse(o => { o.layers.set(2); o.castShadow = false; });
    this.camera.add(this.hands);
  }

  bindInput() {
    this.onKey = e => {
      if (e.repeat) return;
      const down = e.type === 'keydown';
      const k = e.code;
      if (down) this.keys.add(k); else this.keys.delete(k);
      if (!down || this.frozen) return;
      if (k === 'KeyF') this.toggleFlash();
      if (k === 'KeyC' || k === 'ControlLeft') this.crouch = !this.crouch;
    };
    // Mouse look: events only accumulate deltas; update() applies them once per
    // frame, so the camera has exactly one writer and stops the moment the
    // mouse stops. Spurious deltas Chrome emits right after pointer lock is
    // (re)acquired, and absurd single-event spikes, are discarded.
    this.lookDX = 0;
    this.lookDY = 0;
    this.lockAt = 0;
    this.onMouse = e => {
      if (document.pointerLockElement !== this.game.canvas) return;
      if (performance.now() - this.lockAt < 120) return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (Math.abs(dx) > 350 || Math.abs(dy) > 350) return;
      this.lookDX += dx;
      this.lookDY += dy;
    };
    // Losing focus or the pointer lock drops held keys and pending look input.
    this.onReset = () => {
      this.keys.clear();
      this.lookDX = this.lookDY = 0;
      this.vel.set(0, 0, 0);
    };
    this.onLock = () => {
      this.lockAt = performance.now();
      this.lookDX = this.lookDY = 0;
      if (document.pointerLockElement !== this.game.canvas) this.onReset();
    };
    this.onVis = () => { if (document.hidden) this.onReset(); };
    addEventListener('keydown', this.onKey);
    addEventListener('keyup', this.onKey);
    addEventListener('mousemove', this.onMouse);
    addEventListener('blur', this.onReset);
    document.addEventListener('pointerlockchange', this.onLock);
    document.addEventListener('visibilitychange', this.onVis);
  }

  applyLook() {
    const dx = this.lookDX, dy = this.lookDY;
    this.lookDX = this.lookDY = 0;
    if (!dx && !dy) { this.turnRate = 0; return; }
    const s = 0.0022 * settings.mouse;
    const inv = settings.invertY ? -1 : 1;
    if (this.hidden) {
      const lim = this.hidden.type === 'seat' ? 1.7 : 0.7; // in a car seat you can look out of the side windows
      this.hideLook = clamp(this.hideLook - dx * s, -lim, lim);
      this.pitch = clamp(this.pitch - dy * s * inv, -0.5, 0.5);
      return;
    }
    if (this.frozen) return;
    this.yaw -= dx * s;
    // keep the angle bounded so float error can't accumulate over a long session
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2; else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    this.turnRate = -dx * s * 60;
    this.pitch = clamp(this.pitch - dy * s * inv, -1.45, 1.45);
  }

  dispose() {
    removeEventListener('keydown', this.onKey);
    removeEventListener('keyup', this.onKey);
    removeEventListener('mousemove', this.onMouse);
    removeEventListener('blur', this.onReset);
    document.removeEventListener('pointerlockchange', this.onLock);
    document.removeEventListener('visibilitychange', this.onVis);
    this.camera.remove(this.light, this.light.target, this.fill, this.hands);
  }

  /** Put an object (the revolver) in the right hand, or null to empty it. */
  setWeapon(obj) {
    if (this.weapon) this.rightArm.remove(this.weapon);
    this.weapon = obj;
    if (obj) {
      obj.position.set(0, 0.035, -0.24);
      obj.traverse(o => { o.layers.set(2); o.castShadow = false; });
      this.rightArm.add(obj);
    }
  }

  toggleFlash() {
    this.flash = !this.flash;
    audio.play('pickup', { vol: 0.25, rate: 2.2 });
  }

  act() { this.actT = 0; this.actCount++; }

  get eyeHeight() { return PLAYER.eye - (PLAYER.eye - PLAYER.crouchEye) * this.crouchK; }

  update(dt) {
    const k = this.keys;
    this.actT += dt;
    this.applyLook();
    this.crouchK = damp(this.crouchK, this.crouch ? 1 : 0, 10, dt);
    let mx = 0, mz = 0;
    if (!this.frozen && !this.hidden) {
      if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    }
    const moving = mx || mz;
    const wantRun = (k.has('ShiftLeft') || k.has('ShiftRight')) && moving && mz <= 0 && !this.exhausted;
    if (wantRun && this.crouch) this.crouch = false;
    this.run = wantRun;
    if (this.run) this.stamina -= dt;
    else this.stamina = Math.min(PLAYER.stamina, this.stamina + dt * (moving ? 0.6 : 1.1));
    if (this.stamina <= 0) { this.exhausted = true; this.run = false; }
    if (this.exhausted && this.stamina > PLAYER.stamina * 0.45) this.exhausted = false;

    const target = this.run ? PLAYER.run : this.crouch ? PLAYER.crouch : PLAYER.walk;
    const len = Math.hypot(mx, mz) || 1;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = (mx * cos + mz * sin) / len, wz = (-mx * sin + mz * cos) / len;
    const accel = moving ? 12 : 14;
    this.vel.x = damp(this.vel.x, moving ? wx * target : 0, accel, dt);
    this.vel.z = damp(this.vel.z, moving ? wz * target : 0, accel, dt);
    if (!this.hidden && !this.frozen) {
      const before = this.pos.clone();
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      collideCircle(this.pos, PLAYER.radius, PLAYER.height, this.game.house.colliders);
      const gy = groundAt(this.pos.x, this.pos.z, this.pos.y);
      this.pos.y = damp(this.pos.y, gy, 18, dt);
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      this.speed = moved / Math.max(dt, 1e-4);
      this.stepDist += moved;
      const stride = this.run ? 1.05 : this.crouch ? 0.55 : 0.75;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        this.footstep();
      }
    } else this.speed = 0;
    this.bobT += dt * (this.speed > 0.2 ? this.speed * 2.4 : 0);

    // Camera
    const cam = this.camera;
    if (this.hidden) {
      const spot = this.hidden;
      cam.position.set(spot.inside.x, spot.inside.y + (spot.camY ?? 1.45), spot.inside.z);
      cam.rotation.set(this.pitch, spot.yaw + this.hideLook, 0, 'YXZ');
      this.light.intensity = 0;
    } else {
      const bob = Math.sin(this.bobT) * 0.035 * Math.min(1, this.speed / 2.5);
      const sway = Math.cos(this.bobT * 0.5) * 0.02 * Math.min(1, this.speed / 2.5);
      cam.position.set(this.pos.x + sway * Math.cos(this.yaw), this.pos.y + this.eyeHeight + bob, this.pos.z - sway * Math.sin(this.yaw));
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      const flick = this.flash ? (Math.random() < 0.004 ? 0.2 : 1) : 0;
      this.light.intensity = damp(this.light.intensity, 40 * flick, 30, dt);
    }
    this.fill.intensity = this.hidden ? 0.05 : 0.8;
    this.lens.material.color.setScalar(this.flash ? 1 : 0.15);

    // Hands
    const t = performance.now() / 1000;
    const hb = Math.sin(this.bobT) * 0.012 * Math.min(1, this.speed / 2.5);
    const breath = Math.sin(t * 1.6) * 0.004;
    this.hands.visible = !this.hidden && !this.frozen;
    this.leftArm.position.set(-0.2, -0.2 + hb + breath, -0.3);
    this.leftArm.rotation.set(0.06, 0.08, 0.05);
    this.leftArm.visible = this.flash || this.actT < 0.6;
    // Right hand only comes up to interact (doors, items, switches, TV, monitors)
    const reach = Math.sin(clamp(this.actT / 0.55, 0, 1) * Math.PI);
    this.recoil = damp(this.recoil || 0, 0, 9, dt);
    if (this.weapon) {
      // Holding the revolver: the right hand stays up, pointing where you look.
      this.rightArm.position.set(0.15 - reach * 0.05, -0.16 + hb * 0.8 + this.recoil * 0.03, -0.32 + this.recoil * 0.06);
      this.rightArm.rotation.set(0.04 + this.recoil * 0.45, -0.04, -0.02);
      this.rightArm.visible = true;
    } else {
      this.rightArm.position.set(0.2 - reach * 0.05, -0.38 + reach * 0.2 + hb * 0.8, -0.28 - reach * 0.18);
      this.rightArm.rotation.set(0.15 + reach * 0.25, -0.1, -0.1);
      this.rightArm.visible = reach > 0.02;
    }
  }

  footstep() {
    const vol = this.run ? 0.55 : this.crouch ? 0.12 : 0.3;
    audio.play('step', { vol, rate: 0.85 + Math.random() * 0.3 });
    // Crouching is near silent, walking carries a few metres, running is loud.
    const r = this.run ? 11 : this.crouch ? 0.9 : 3.5;
    if (r >= 1) this.game.emitNoise(this.pos, r, this.run ? 'run' : 'step');
  }
}
