import assert from 'node:assert/strict';
import { test } from 'node:test';
import { world } from './helpers/world.js';
import { INV_SLOTS } from '../public/js/config.js';

function tableJoint(game, shed, id = 'table_joint', slot = 0) {
  const at = [28.7, 0.46, -10.7];
  game.placeItem(id, 'joint', { pos: at });
  shed.table.set(slot, { id, kind: 'joint' });
  return game.items.get(id);
}

test('E on shed table takes an available joint and synchronizes inventory/table state', async () => {
  const { game } = await world(true);
  const shed = game.extras.shed;
  const guest = game.players.get('guest');
  guest.pos.set(28.7, 0, -10.7);
  const item = tableJoint(game, shed);

  game.handleRequest('guest', { k: 'taketable' });

  assert.equal(item.holder, 'guest');
  assert.equal(shed.table.has(0), false);
  assert.ok(game.events.some(e => e.k === 'shedtake' && e.pid === 'guest' && e.id === item.id));
  assert.ok(game.events.some(e => e.k === 'item' && e.holder === 'guest' && e.id === item.id));
});

test('shed table pickup refuses when inventory has no free slots', async () => {
  const { game } = await world(true);
  const shed = game.extras.shed;
  const guest = game.players.get('guest');
  guest.pos.set(28.7, 0, -10.7);
  const item = tableJoint(game, shed);
  for (let i = 0; i < INV_SLOTS; i++) {
    game.placeItem(`held_${i}`, 'office_key', { pos: [28, 0.1, -10] });
    game.items.get(`held_${i}`).holder = 'guest';
  }

  game.handleRequest('guest', { k: 'taketable' });

  assert.equal(item.holder, null);
  assert.equal(shed.table.has(0), true);
  assert.ok(game.events.some(e => e.k === 'msg' && /hands are full/i.test(e.text)));
  assert.equal(game.events.some(e => e.k === 'shedtake'), false);
});

test('empty-handed table interaction does not consume flour; snorting still works', async () => {
  const { game } = await world(true);
  const shed = game.extras.shed;
  const guest = game.players.get('guest');
  guest.pos.set(28.7, 0, -10.7);
  game.placeItem('flour_bag', 'bag_flour', { pos: [28.7, 0.5, -10.7] });
  game.items.get('flour_bag').holder = 'guest';
  game.handleRequest('guest', { k: 'puttable', id: 'flour_bag' });
  const flour = [...shed.table.entries()].find(([, item]) => item.kind === 'flour');
  assert.ok(flour, 'putting a flour bag on the table creates flour lines');

  game.handleRequest('guest', { k: 'taketable' });
  assert.equal(shed.table.has(flour[0]), true);

  game.handleRequest('guest', { k: 'snort', id: flour[1].id });
  assert.equal(guest.highUntil, game.time + 120);
  assert.ok(game.events.some(e => e.k === 'snorted' && e.id === flour[1].id));
});
