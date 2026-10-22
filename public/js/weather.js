// Visible sky bolts share the host's existing lightning event and its seed.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export class SkyLightning {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'sky-lightning'; this.group.visible = false;
    this.material = new THREE.LineBasicMaterial({ color: 0xc9dcff, transparent: true, toneMapped: false, fog: false });
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(28 * 6), 3));
    this.bolt = new THREE.LineSegments(this.geometry, this.material);
    this.group.add(this.bolt); scene.add(this.group);
    this.light = new THREE.DirectionalLight(0xc5d4ff, 0);
    this.light.target.position.set(25, 0, 7); scene.add(this.light, this.light.target);
    this.age = Infinity;
  }

  strike(seed = 1) {
    const rnd = mulberry32(seed), angle = rnd() * Math.PI * 2, radius = 65 + rnd() * 25;
    const x = 25 + Math.cos(angle) * radius, z = 7 + Math.sin(angle) * radius;
    const points = [], segments = [];
    for (let i = 0; i <= 16; i++) points.push(new THREE.Vector3(x + (rnd() - 0.5) * 6, 72 - i * 4, z + (rnd() - 0.5) * 4));
    const line = (a, b) => segments.push(...a.toArray(), ...b.toArray());
    for (let i = 1; i < points.length; i++) {
      line(points[i - 1], points[i]);
      if (i % 4 === 0) {
        let a = points[i];
        for (let j = 0; j < 3; j++) { const b = a.clone().add(new THREE.Vector3((rnd() - 0.5) * 11, -2 - rnd() * 3, (rnd() - 0.5) * 8)); line(a, b); a = b; }
      }
    }
    this.geometry.attributes.position.array.set(segments);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.light.position.set(x, 50, z); this.age = 0; this.group.visible = true;
    this.update(0);
  }

  update(dt) {
    this.age += dt;
    const a = this.age;
    const strength = a < 0.055 ? 1 : a < 0.12 ? 0.08 : a < 0.2 ? 0.85 : Math.max(0, (0.45 - a) * 2.5);
    this.group.visible = a < 0.45;
    this.material.opacity = strength;
    this.light.intensity = strength * 3;
  }
}
