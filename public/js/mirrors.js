// Planar reflections use the actual scene, including the local player's body.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

let reflecting = false;

export class LiveMirror extends Reflector {
  constructor(width, height) {
    super(new THREE.PlaneGeometry(width, height), {
      color: new THREE.Color(0.5, 0.5, 0.5), textureWidth: 512, textureHeight: 512,
      clipBias: 0.003, multisample: 0,
    });
    // Layer 1 is our full avatar; layer 2 is the camera's first-person hands.
    this.camera.layers.enable(1);
    const reflect = this.onBeforeRender;
    const eye = new THREE.Vector3(), surface = new THREE.Vector3();
    this.onBeforeRender = (renderer, scene, camera) => {
      // Other mirrors may appear in this image, but never launch nested passes.
      if (reflecting) return;
      camera.getWorldPosition(eye);
      this.getWorldPosition(surface);
      if (eye.distanceToSquared(surface) > 16 * 16) return;
      reflecting = true;
      try { reflect(renderer, scene, camera); }
      finally { reflecting = false; }
    };
  }
}
