import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { world } from './helpers/world.js';
import { Club, START_MONEY } from '../public/js/club.js';
import { Props, MIRROR_TEXTS } from '../public/js/props.js';
import { Extras } from '../public/js/extras.js';
import { audio } from '../public/js/audio.js';
import { ROOMS } from '../public/js/layout.js';

test('each player starts with 100 euros and host spending cannot overdraw it', async () => {
  const { game } = await world();
  const club = new Club(game);
  assert.equal(START_MONEY, 100);
  for (const id of ['host', 'guest', 'new-player']) assert.equal(club.balance(id), 100);
  const p = game.players.get('guest'); p.hidden = true; p.hideId = 'club_seat';
  const events = [];
  game.broadcast = e => { events.push(e); if (e.k === 'rain') club.money.set(e.pid, e.money); };
  for (let i = 0; i < 5; i++) { club.lastRain?.clear(); club.hostRain('guest', null); }
  assert.equal(club.balance('guest'), 0); assert.equal(club.balance('host'), 100);
  club.lastRain.clear(); club.hostRain('guest', null);
  assert.equal(events.filter(e => e.k === 'rain').length, 5);
  assert.match(events.at(-1).text, /€0/);
});

test('bathroom entry randomly chooses only the new phrases and shares the mirror event', async () => {
  const { game } = await world();
  assert.deepEqual(MIRROR_TEXTS.map(s => s.replace(/\n/g, ' ')), ['PUS, GET UP BRO WE NEED TO WORK', '5 MORE MINUTES DADDY']);
  game.props = Object.assign(Object.create(Props.prototype), { mirror: { cv: document.createElement('canvas'), tex: {}, index: -1 } });
  game.rnd = () => 0.99;
  const host = game.players.get('host'), guest = game.players.get('guest');
  host.pos.set(12, 3.4, 2); game.updateMirrorVisits();
  assert.equal(game.events.at(-1).i, 1); assert.equal(game.props.mirror.index, 1);
  game.updateMirrorVisits(); assert.equal(game.events.length, 1, 'no reroll while staying');
  game.rnd = () => 0.01;
  guest.pos.copy(host.pos); game.updateMirrorVisits();
  assert.equal(game.events.at(-1).i, 0, 'another entrant rerolls even while occupied');
  guest.pos.set(12, 3.4, 9); game.updateMirrorVisits();
  guest.pos.set(12, 3.4, 2); game.updateMirrorVisits();
  assert.equal(game.events.length, 3, 'immediate re-entry also rerolls');
  assert.equal(game.props.mirror.index, 0, 'random choices may repeat');
});

test('north facade follows room sections with distinct textures and closed geometry', async () => {
  const { house } = await world(); house.group.updateMatrixWorld(true);
  for (const r of ROOMS.filter(r => !r.outdoor && r.exterior)) assert.ok(house.M[r.exterior]?.map, r.id);
  const materials = new Set();
  for (const [x, y, expected] of [[3, 0.5, 'facadePlaster'], [10, 0.5, 'facadeBrick'], [16, 0.5, 'facadeOchre'], [24, 0.5, 'facadeMoss'], [16, 4, 'facadePlaster'], [24, 4, 'facadeBrick']]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, -0.6), new THREE.Vector3(0, 0, 1), 0, 1);
    const hits = ray.intersectObjects(house.staticMeshes, false);
    assert.ok(hits.length, `wall gap at ${x},${y}`);
    assert.equal(hits[0].object.name, 'static_' + expected);
    materials.add(hits[0].object.material);
  }
  assert.equal(materials.size, 4);
  for (const x of [5.6, 8, 13, 21, 27, 30]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 0.5, -0.6), new THREE.Vector3(0, 0, 1), 0, 1);
    assert.ok(ray.intersectObjects(house.staticMeshes, false).length, `section seam at ${x}`);
  }
});

test('butcher and kitchen use one eating loop that follows Ajan and stops on exit', () => {
  const ex = Object.create(Extras.prototype), calls = [], stops = [], positions = [];
  const original = audio.play;
  audio.play = (key, opts) => { calls.push({ key, opts }); return { stop: t => stops.push(t), setPos: p => positions.push(p.clone()) }; };
  try {
    const aj = { vis: { st: 'butcher', pos: new THREE.Vector3(29.2, 6.8, 3.25) } };
    ex.updateEatingAudio(aj); ex.updateEatingAudio(aj);
    assert.equal(calls.length, 1); assert.equal(calls[0].key, 'eat'); assert.ok(calls[0].opts.loop);
    assert.deepEqual(calls[0].opts.pos.toArray(), [29.2, 8.2, 3.25]);
    assert.deepEqual(positions.at(-1).toArray(), [29.2, 8.2, 3.25]);
    aj.vis.st = 'patrol'; ex.updateEatingAudio(aj);
    assert.deepEqual(stops, [0.4]); assert.equal(ex.eatSound, null);
    aj.vis.st = 'eatsit'; aj.vis.pos.set(24.45, 0, 15.8); ex.updateEatingAudio(aj);
    assert.equal(calls.length, 2); assert.deepEqual(calls[1].opts.pos.toArray(), [24.45, 1.4, 15.8]);
    ex.updateEatingAudio(null); assert.equal(stops.length, 2);
  } finally { audio.play = original; }
});
