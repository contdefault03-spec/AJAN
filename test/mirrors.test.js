import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { world } from './helpers/world.js';
import { LiveMirror } from '../public/js/mirrors.js';
import { Props } from '../public/js/props.js';
import { Car } from '../public/js/car.js';

function rendererStub(render) {
  const previous = new THREE.WebGLRenderTarget(8, 8);
  return {
    target: previous, previous, xr: { enabled: true }, shadowMap: { autoUpdate: true },
    state: { buffers: { depth: { setMask() {} } } }, autoClear: true,
    getRenderTarget() { return this.target; },
    setRenderTarget(target) { this.target = target; }, render,
  };
}

function eye(x, y, z, tx, ty, tz) {
  const camera = new THREE.PerspectiveCamera(72, 1.5, 0.05, 180);
  camera.position.set(x, y, z); camera.lookAt(tx, ty, tz); camera.updateMatrixWorld(true);
  camera.layers.enable(2);
  return camera;
}

test('reflection mirrors the eye, clips behind the wall, and includes bodies without first-person hands', () => {
  const scene = new THREE.Scene(), mirror = new LiveMirror(0.75, 0.65);
  mirror.position.set(12.85, 5, 0.135); scene.add(mirror); scene.updateMatrixWorld(true);
  const camera = eye(12.65, 5, 1.635, 12.85, 5, 0.135);
  let calls = 0;
  const renderer = rendererStub((s, reflected) => {
    calls++; assert.equal(s, scene); assert.equal(mirror.visible, false);
    assert.ok(reflected.position.distanceTo(new THREE.Vector3(12.65, 5, -1.365)) < 1e-9);
    for (const layer of [0, 1]) { const object = new THREE.Object3D(); object.layers.set(layer); assert.ok(reflected.layers.test(object.layers)); }
    const hands = new THREE.Object3D(); hands.layers.set(2); assert.equal(reflected.layers.test(hands.layers), false);
    assert.ok(Math.abs(new THREE.Vector3(12.85, 5, 1).project(reflected).z) <= 1, 'room side remains visible');
    assert.ok(Math.abs(new THREE.Vector3(12.85, 5, -0.2).project(reflected).z) > 1, 'wall side is clipped');
  });
  mirror.onBeforeRender(renderer, scene, camera);
  assert.equal(calls, 1); assert.equal(mirror.visible, true);
  assert.equal(renderer.target, renderer.previous); assert.ok(renderer.xr.enabled && renderer.shadowMap.autoUpdate);
  camera.position.x += 0.3; camera.updateMatrixWorld(true);
  renderer.render = (s, reflected) => assert.ok(Math.abs(reflected.position.x - 12.95) < 1e-9);
  mirror.onBeforeRender(renderer, scene, camera);
  mirror.dispose();
});

test('rotated moving mirrors reflect world transforms and bound recursion/distance', () => {
  const scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent);
  parent.position.set(3, 2, 1); parent.rotation.y = Math.PI / 2;
  const mirror = new LiveMirror(1, 1), other = new LiveMirror(1, 1);
  mirror.position.z = 0.5; parent.add(mirror); scene.add(other); scene.updateMatrixWorld(true);
  const camera = eye(5.5, 2, 1, 3.5, 2, 1);
  let calls = 0;
  const renderer = rendererStub((s, reflected) => {
    calls++;
    assert.ok(reflected.position.distanceTo(new THREE.Vector3(1.5, 2, 1)) < 1e-9);
    other.onBeforeRender(renderer, scene, camera);
  });
  mirror.onBeforeRender(renderer, scene, camera); assert.equal(calls, 1, 'nested pass is suppressed');
  const back = eye(2.5, 2, 1, 3.5, 2, 1); mirror.onBeforeRender(renderer, scene, back);
  const far = eye(25, 2, 1, 3.5, 2, 1); mirror.onBeforeRender(renderer, scene, far);
  assert.equal(calls, 1, 'back side and distant mirrors do not render');
  parent.position.x += 1; scene.updateMatrixWorld(true);
  renderer.render = (s, reflected) => { calls++; assert.ok(Math.abs(reflected.position.x - 3.5) < 1e-9); };
  mirror.onBeforeRender(renderer, scene, camera); assert.equal(calls, 2, 'moving parent changes reflection');
  let targetDisposed = false, materialDisposed = false;
  mirror.getRenderTarget().addEventListener('dispose', () => { targetDisposed = true; });
  mirror.material.addEventListener('dispose', () => { materialDisposed = true; });
  mirror.dispose(); other.dispose();
  assert.ok(targetDisposed && materialDisposed, 'GPU resources are released');
});

test('all exposed house and car mirrors are live and bathroom writing stays a separate overlay', async () => {
  const { game, house } = await world();
  house.group.updateMatrixWorld(true);
  for (const mirror of house.mirrors) {
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mirror.quaternion);
    const from = mirror.position.clone().addScaledVector(normal, 1.3);
    const hits = new THREE.Raycaster(from, normal.negate(), 0, 1.5).intersectObject(house.group, true)
      .filter(h => h.object.material?.visible !== false);
    assert.equal(hits[0]?.object, mirror, `${mirror.name} must sit in front of its wall/frame`);
  }
  const props = Object.assign(Object.create(Props.prototype), { house, group: new THREE.Group() });
  house.group.add(props.group); props.buildMirror();
  const car = Object.assign(Object.create(Car.prototype), { house, group: new THREE.Group(), width: 2.1, height: 1.8 });
  house.group.add(car.group); car.buildInterior();
  assert.deepEqual(house.mirrors.map(m => m.name).sort(), [
    'bathroom_mirror', 'bedroom_mirror', 'car_rearview_mirror', 'old_bathroom_mirror', 'upstairs_bathroom_mirror',
  ]);
  assert.ok(house.mirrors.every(m => m.isReflector && m.getRenderTarget().width === 512));
  const text = props.group.children.find(o => o.material?.map === props.mirror.tex);
  assert.ok(text.material.transparent); assert.equal(text.material.depthWrite, false);
  const upstairs = house.mirrors.find(m => m.name === 'upstairs_bathroom_mirror');
  assert.ok(Math.abs(text.position.z - upstairs.position.z - 0.004) < 1e-9);
  assert.equal(props.mirror.index, 0); props.setMirror(1); assert.equal(props.mirror.index, 1);
  assert.equal(house.mirrors.find(m => m.name === 'car_rearview_mirror').parent, car.interior);
  assert.equal(game.house, house);
  for (const m of house.mirrors) m.dispose();
});
