// Only DOM/canvas/audio are stubbed. Geometry, physics, AI and game handlers are real.
import * as THREE from 'three';

const context = new Proxy({
  getImageData: () => ({ data: new Uint8ClampedArray(0) }),
  createImageData: () => ({ data: new Uint8ClampedArray(0) }),
  measureText: () => ({ width: 30 }),
}, { get: (target, key) => key in target ? target[key] : () => context });
const element = () => ({
  getContext: () => context, style: {}, classList: { add() {}, remove() {}, toggle() {} },
  appendChild() {}, addEventListener() {}, removeEventListener() {},
  querySelectorAll: () => [], querySelector: () => element(),
});
globalThis.document = {
  createElement: element, getElementById: () => null, body: element(),
  addEventListener() {}, removeEventListener() {}, fonts: { load: async () => {} },
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const { House } = await import('../../public/js/house.js');
const { Game } = await import('../../public/js/game.js');
const { Extras } = await import('../../public/js/extras.js');
const { audio } = await import('../../public/js/audio.js');
const { mulberry32 } = await import('../../public/js/util.js');
audio.play = () => ({ stop() {} });

export async function world(extras = false, seed = 12345) {
  const game = Object.assign(Object.create(Game.prototype), {
    house: new House(mulberry32(seed)), scene: new THREE.Scene(), items: new Map(),
    rnd: mulberry32(seed), glints: [], players: new Map(), localId: 'host',
    difficulty: 'medium', pickSeq: 0, time: 0, events: [], net: { isHost: true, online: false }, chase: false,
    updateHUD() {}, message() {}, toast() {}, markAct() {}, hostNoise() {}, emitNoise() {},
    club: { balance: () => 500 },
    hostSetDoor(id, open) { this.house.setDoor(id, open); },
  });
  game.broadcast = function (event) {
    this.events.push(event);
    if (event.k !== 'need') this.applyEvent(event);
  };
  for (const id of ['host', 'guest']) game.players.set(id, {
    id, alive: true, dying: false, escaped: false,
    pos: new THREE.Vector3(31.15, 0, -6.25),
  });
  game.extras = new Extras(game);
  const initialNav = game.house.nav;
  const initialColliders = game.house.colliders.length;
  if (extras) await game.extras.init();
  return { game, house: game.house, initialNav, initialColliders };
}

export function openDoors(house) {
  for (const d of house.doors.values()) {
    if (d.secret || d.ajanOnly) continue;
    d.locked = false;
    if (d.collider) house.setDoor(d.id, true);
  }
}
