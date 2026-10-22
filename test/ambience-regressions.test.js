import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { world, openDoors } from './helpers/world.js';
import { AjanBrain } from '../public/js/ajan.js';
import { BUTCHER } from '../public/js/butcher.js';
import { SkyLightning } from '../public/js/weather.js';
import { Avatar } from '../public/js/avatar.js';
import { MONSTERS } from '../public/js/config.js';
import { ROOMS } from '../public/js/layout.js';

function calmBrain(game, def = MONSTERS.ajan) {
  const b = new AjanBrain(game, () => 0.5, def);
  b.state = 'patrol'; b.stateClock = 0; b.pos.set(29.1, 6.8, 7);
  b.sleepTimer = b.eatTimer = b.danceTimer = b.sitTimer = b.whisperT = 1e6;
  game.brains = [b];
  return b;
}

test('former sewing room is a reachable butcher set without progression items', async () => {
  const { house, game } = await world(true); openDoors(house);
  const r = ROOMS.find(r => r.id === BUTCHER.room);
  assert.equal(r.name, 'BUTCHER ROOM'); assert.equal(r.floor, 'floorTile');
  const set = house.group.getObjectByName('butcher-room'); assert.ok(set);
  let corpses = 0, limbs = 0;
  set.traverse(o => { if (o.name === 'corpse') corpses++; if (o.name === 'severed-limb') limbs++; });
  assert.equal(corpses, 3); assert.equal(limbs, 3);
  const b = calmBrain(game); b.stateClock = 480;
  assert.ok(b.startButcherVisit());
  for (let i = 0; i < 1800 && b.state === 'gotobutcher'; i++) b.update(1 / 60);
  assert.equal(b.state, 'butcher'); assert.ok(b.pos.distanceTo(BUTCHER.stand) < 0.01);
  assert.equal(b.butcherLeft, 30);
});

test('Ajan visits at 8 minutes, stays 30 seconds and schedules the next visit', async () => {
  const { house, game } = await world(); openDoors(house);
  const b = calmBrain(game); b.stateClock = 479.8;
  b.update(0.1); assert.notEqual(b.state, 'gotobutcher');
  b.update(0.11); assert.equal(b.state, 'gotobutcher');
  for (let i = 0; i < 1800 && b.state !== 'butcher'; i++) b.update(1 / 60);
  assert.equal(b.state, 'butcher'); assert.equal(b.butcherNext, 960);
  b.update(29.9); assert.equal(b.state, 'butcher'); assert.equal(b.anim, 'butcher');
  b.update(0.11); assert.equal(b.state, 'patrol');
  assert.ok(b.path?.length, 'resume patrol after the visit');
});

test('busy encounters defer the visit, blocked routes retry and free play stays dormant', async () => {
  const { house, game } = await world(); openDoors(house);
  const b = calmBrain(game); b.stateClock = 480; b.state = 'carry';
  assert.equal(b.startButcherVisit(), false);
  b.state = 'patrol'; house.doors.get('d_sewing').locked = true;
  assert.equal(b.startButcherVisit(), false); assert.equal(b.butcherNext, 480); assert.equal(b.butcherRetryAt, 495);
  house.doors.get('d_sewing').locked = false; b.stateClock = 495;
  assert.ok(b.startButcherVisit());
  game.freePlay = true; const free = new AjanBrain(game, () => 0.5); free.dormantLeft = Infinity;
  free.update(481); assert.equal(free.state, 'dormant');
  const other = calmBrain(game, MONSTERS.guy); assert.equal(other.startButcherVisit(), false);
});

test('host migration retains butcher duration, animation phase and next due time', async () => {
  const { game, house } = await world(); openDoors(house);
  const b = calmBrain(game); b.pos.copy(BUTCHER.stand); b.stateClock = 481; b.arriveButcher(); b.update(12);
  const s = b.snapshot();
  game.monsterDefs = [MONSTERS.ajan]; game.makeBrains(999, { ajan: s });
  const restored = game.brain;
  assert.equal(restored.state, 'butcher'); assert.equal(restored.butcherLeft, 18);
  assert.equal(restored.animT, s.mt); assert.equal(restored.butcherNext, s.bt);
  restored.update(18.01); assert.equal(restored.state, 'patrol');
  restored.stateClock = s.bt + 1; restored.pos.copy(BUTCHER.stand); restored.arriveButcher();
  assert.equal(restored.butcherNext, s.bt + BUTCHER.interval, 'keep the next 8-minute interval across migration');
});

test('cutting/eating pose shows tools and clears them when normal patrol resumes', () => {
  const a = new Avatar('ajan', null, { spec: 'ajan' });
  for (const t of [1, 7]) {
    a.update(1 / 60, { mode: 'butcher', modeT: t, speed: 0 });
    assert.ok(a.butcherTools.every(o => o.visible));
  }
  a.update(1 / 60, { mode: 'move', speed: 1 });
  assert.ok(a.butcherTools.every(o => !o.visible));
});

test('sky strikes share deterministic geometry and fade without retaining light', () => {
  const a = new SkyLightning(new THREE.Scene()), b = new SkyLightning(new THREE.Scene());
  a.strike(123); b.strike(123);
  assert.deepEqual([...a.geometry.attributes.position.array], [...b.geometry.attributes.position.array]);
  assert.ok(a.group.visible && a.light.intensity > 0);
  const first = [...a.geometry.attributes.position.array]; b.strike(124);
  assert.notDeepEqual(first, [...b.geometry.attributes.position.array]);
  a.update(0.5); assert.equal(a.group.visible, false); assert.equal(a.light.intensity, 0);
});
