import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { world, openDoors } from './helpers/world.js';
import { AjanBrain } from '../public/js/ajan.js';
import { LocalPlayer } from '../public/js/player.js';
import { AJAN } from '../public/js/config.js';
import { segmentBlockers } from '../public/js/physics.js';
import { findPath, nearestNode } from '../public/js/nav.js';

function walkBrain(game, from, to) {
  const brain = new AjanBrain(game, () => 0.5);
  brain.pos.set(...from);
  assert.ok(brain.moveTo(new THREE.Vector3(...to)), 'route must exist');
  for (let i = 0; i < 60 * 40; i++) {
    if (brain.step(1 / 60, brain.v.patrol)) {
      assert.ok(brain.pos.distanceTo(new THREE.Vector3(...to)) < 1.6, 'must arrive close enough to interact');
      return brain;
    }
  }
  assert.fail(`monster stalled at ${brain.pos.toArray()} toward ${to}`);
}

// Drive the actual controller using its normal forward input and changing headings.
function walkPlayer(game, points) {
  const player = new LocalPlayer(game, new THREE.PerspectiveCamera(), { shirt: '#888888' });
  player.frozen = false;
  player.pos.set(...points[0]);
  player.keys.add('KeyW');
  try {
    for (const point of points.slice(1)) {
      const target = new THREE.Vector3(...point);
      let reached = false;
      for (let i = 0; i < 60 * 15; i++) {
        const dx = target.x - player.pos.x, dz = target.z - player.pos.z;
        if (Math.hypot(dx, dz) < 0.12) { reached = true; break; }
        player.yaw = Math.atan2(-dx, -dz);
        player.update(1 / 60);
      }
      assert.ok(reached, `player stalled at ${player.pos.toArray()} toward ${point}`);
    }
    assert.ok(Math.abs(player.pos.y - points.at(-1)[1]) < 0.12);
  } finally { player.dispose(); }
}

const backStairs = [[48.3, 0, 7.75], [48.3, 0, 13.15], [46.95, 0, 13.15], [46.95, 3.4, 6.25]];
for (const reverse of [false, true]) {
  test(`back stairs: monster and player ${reverse ? 'descend' : 'ascend'} through lower turn`, async () => {
    const { game, house } = await world();
    openDoors(house);
    const points = reverse ? [...backStairs].reverse() : backStairs;
    walkBrain(game, points[0], points.at(-1));
    walkPlayer(game, points);
  });
}

test('office has a solid east wall and retains its original key-gated route', async () => {
  const { game, house } = await world(true);
  assert.equal(house.doors.has('d_east_g'), false);
  assert.equal(house.doors.get('d_office').lock, 'office_key');
  assert.equal(house.doors.get('d_office').locked, true);
  assert.ok(house.colliders.some(c => c.minX === 39.3 && c.maxX === 39.88 && c.minZ === 0.3 && c.maxZ === 4.3));
  for (const z of [1.8, 2.25, 2.7]) assert.ok(segmentBlockers(38.5, z, 41.1, z, 1, house.colliders,
    { pad: AJAN.radius, occludeOnly: false, max: 1, who: 'ajan' }));
  house.group.updateMatrixWorld(true);
  for (const [x, dx] of [[39, 1], [41, -1]]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.5, 2.25), new THREE.Vector3(dx, 0, 0), 0, 2);
    assert.ok(ray.intersectObjects(house.staticMeshes, false).length, 'former doorway must be rendered as wall');
  }
  const hall = nearestNode(house.nav, new THREE.Vector3(35, 0, 9), house.colliders);
  const office = nearestNode(house.nav, new THREE.Vector3(38.5, 0, 2.25), house.colliders);
  assert.equal(findPath(house.nav, hall.id, office.id, id => !house.doors.get(id)?.locked), null);
  game.handleRequest('guest', { k: 'door', id: 'd_office' });
  assert.deepEqual(game.events.at(-1), { k: 'need', what: 'office_key' });
  game.placeItem('office_key', 'office_key', { pos: [35, 0.02, 9] });
  game.handleRequest('guest', { k: 'pickup', id: 'office_key' });
  game.handleRequest('guest', { k: 'door', id: 'd_office' });
  house.setDoor('d_study', true);
  assert.ok(findPath(house.nav, hall.id, office.id, id => !house.doors.get(id)?.locked));
  walkPlayer(game, [[35.05, 0, 9], [35.05, 0, 6.2], [37.05, 0, 6.2], [37.05, 0, 3.65]]);
});

test('wall meshes close ceiling-to-floor bands from both sides', async () => {
  const { house } = await world();
  house.group.updateMatrixWorld(true);
  for (const [origin, direction] of [
    [[30, 6.6, 20], [0, 0, 1]], [[30, 6.6, 22], [0, 0, -1]],
    [[54, 6.6, 9], [1, 0, 0]], [[58, 6.6, 9], [-1, 0, 0]],
    [[20, 3.2, 10], [0, 0, 1]], [[20, 6.6, 10], [0, 0, 1]],
    // Normal upstairs eye height looking down at the exterior floor seam.
    [[30, 5, 19], [0, -1.8, 2]],
  ]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize(), 0, 4);
    assert.ok(ray.intersectObjects(house.staticMeshes, false).length, `missing wall from ${origin}`);
  }
});

test('Extras rebuilds navigation against final garden/shed colliders and preserves patrols', async () => {
  const { game, house, initialNav, initialColliders } = await world(true);
  assert.ok(house.nav !== initialNav, 'must rebuild after Extras adds colliders');
  const extra = house.colliders.slice(initialColliders);
  assert.ok(extra.length > 20);
  const blocked = [];
  for (const a of house.nav.nodes) for (const edge of a.edges) {
    const b = house.nav.byId[edge.to];
    if (a.id > b.id || Math.abs(a.y - b.y) > 0.1) continue;
    if (segmentBlockers(a.x, a.z, b.x, b.z, a.y + 0.35, extra,
      { pad: AJAN.radius, height: AJAN.height - 0.35, occludeOnly: false, max: 1, who: 'ajan' })) blocked.push([a.id, b.id]);
  }
  assert.deepEqual(blocked, [], 'edges must avoid final obstacles');
  for (const room of ['garden', 'shed', 'secoffice', 'office', 'uehall', 'chapel', 'cageroom']) {
    assert.ok(house.patrolNodes.some(id => house.nav.byId[id].room === room), `missing patrol room ${room}`);
  }
  openDoors(house);
  walkBrain(game, [20, 0, -5], [28.6, 0, -11.9]);
  walkBrain(game, [28.6, 0, -11.9], [20, 0, -5]);
  walkBrain(game, [44.3, 3.4, 2.6], [52, 3.4, 6]);
});

test('rebuilt graph respects secret doors, garden restriction and security shutter', async () => {
  const { game, house } = await world(true);
  const route = (from, to) => {
    const a = nearestNode(house.nav, new THREE.Vector3(...from), house.colliders);
    const b = nearestNode(house.nav, new THREE.Vector3(...to), house.colliders);
    assert.ok(a && b);
    return findPath(house.nav, a.id, b.id, id => !house.doors.get(id)?.locked);
  };
  openDoors(house);
  assert.equal(house.doors.get('d_secret_lib').locked, true);
  assert.ok(house.nav.nodes.some(n => n.edges.some(e => e.door === 'd_secret_lib')));
  assert.ok(house.doors.get('d_garden').ajanOnly);
  assert.ok(route([52, 0, 6], [52, 0, 9]));
  game.extras.security.event({ k: 'shutter', closed: true });
  assert.equal(game.extras.security.col.off, false);
  assert.equal(route([52, 0, 6], [52, 0, 9]), null);
  game.extras.security.event({ k: 'shutter', closed: false });
  assert.ok(route([52, 0, 6], [52, 0, 9]));
});

test('shed key pickup/unlock works through host handlers after final nav rebuild', async () => {
  const { game, house } = await world(true);
  const door = house.doors.get('d_shed');
  game.handleRequest('guest', { k: 'door', id: door.id });
  assert.deepEqual(game.events.at(-1), { k: 'need', what: 'shed_key' });
  game.handleRequest('guest', { k: 'pickup', id: 'shed_key' });
  game.handleRequest('host', { k: 'pickup', id: 'shed_key' });
  assert.equal(game.items.get('shed_key').holder, 'guest', 'first claimant wins');
  game.handleRequest('guest', { k: 'door', id: door.id });
  assert.equal(door.locked, false);
  assert.equal(door.open, true);
  assert.equal(door.collider.off, true);
  assert.equal(game.items.get('shed_key').used, true);
});
