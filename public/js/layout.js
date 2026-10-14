// Floor plan data for the four-level house: levels, rooms, walls, doors,
// stair ramps, walkable floor areas, creaky floorboards and spawn data.
// x runs east, z runs south. All units are metres.

export const LEVELS = [
  { id: 'B', name: 'BASEMENT', y: -3.2, top: -0.25 },
  { id: 'G', name: 'GROUND FLOOR', y: 0, top: 3.0 },
  { id: 'U', name: 'UPSTAIRS', y: 3.4, top: 6.4 },
  { id: 'A', name: 'ATTIC', y: 6.8, top: 9.0 },
];
export const levelIndex = y => (y < -1.4 ? 0 : y < 1.9 ? 1 : y < 5.3 ? 2 : 3);
const BY = -3.2, GY = 0, UY = 3.4, AY = 6.8;

// Elevator shaft (interior) and stair ramps
export const ELEVATOR = { x0: 33.4, x1: 35.8, z0: 11, z1: 13.4, stops: [BY, GY, UY, AY], speed: 1.4 };
export const inElevator = (x, z) => x > ELEVATOR.x0 + 0.1 && x < ELEVATOR.x1 - 0.1 && z > ELEVATOR.z0 + 0.1 && z < ELEVATOR.z1 - 0.1;

export const RAMPS = [
  // basement stairs: descend westward
  { id: 'R1', x0: 11.5, x1: 16, z0: 17.1, z1: 20.9, axis: 'x', a: 16, ya: GY, b: 11.5, yb: BY },
  // grand staircase ground → upstairs: rises northward
  { id: 'R2', x0: 36.15, x1: 39.85, z0: 13, z1: 19.5, axis: 'z', a: 19.5, ya: GY, b: 13, yb: UY },
  // attic stairs upstairs → attic: rises southward
  { id: 'R3', x0: 20.15, x1: 23.85, z0: 12.5, z1: 19.5, axis: 'z', a: 12.5, ya: UY, b: 19.5, yb: AY },
];
export function rampHeight(r, x, z) {
  const c = r.axis === 'x' ? x : z;
  let t = (c - r.a) / (r.b - r.a);
  t = Math.max(0, Math.min(1, t));
  return r.ya + (r.yb - r.ya) * t;
}

// Rooms. L = level index. `floors` overrides the walkable rectangles when the
// room isn't a plain rectangle (holes for shafts). Stair/elevator shafts span levels.
export const ROOMS = [
  // ---- basement
  { id: 'base', name: 'BASEMENT', L: 0, x0: 2, x1: 17, z0: 17, z1: 27, floor: 'floorConcrete', wall: 'wallBase' },
  { id: 'boiler', name: 'BOILER ROOM', L: 0, x0: 17, x1: 30, z0: 17, z1: 27, floor: 'floorConcrete', wall: 'wallBase' },
  { id: 'workshop', name: 'WORKSHOP', L: 0, x0: 30, x1: 40, z0: 13.4, z1: 27, floor: 'floorConcrete', wall: 'wallBase' },
  // ---- ground floor
  { id: 'bed1', name: 'BEDROOM', L: 1, x0: 0, x1: 8, z0: 0, z1: 8, floor: 'carpet', wall: 'wallRose', trim: 'rail' },
  { id: 'bath', name: 'BATHROOM', L: 1, x0: 8, x1: 13, z0: 0, z1: 8, floor: 'floorBath', wall: 'wallTile', trim: 'base' },
  { id: 'bed2', name: "CHILD'S ROOM", L: 1, x0: 13, x1: 21, z0: 0, z1: 8, floor: 'carpetB', wall: 'wallKids', trim: 'wainscotPale' },
  { id: 'sec', name: 'SECURITY ROOM', L: 1, x0: 21, x1: 30, z0: 0, z1: 8, floor: 'floorTile', wall: 'wallPlain', trim: 'base' },
  { id: 'office', name: 'OFFICE', L: 1, x0: 30, x1: 40, z0: 0, z1: 8, floor: 'floorWoodDark', wall: 'wallGreenStripe', trim: 'wainscot' },
  { id: 'hall', name: 'HALLWAY', L: 1, x0: 0, x1: 40, z0: 8, z1: 11, floor: 'floorWoodDark', wall: 'wallA', trim: 'wainscot' },
  { id: 'living', name: 'LIVING ROOM', L: 1, x0: 0, x1: 11, z0: 11, z1: 21, floor: 'floorWood', wall: 'wallB', trim: 'wainscot' },
  { id: 'start', name: 'BACK ROOM', L: 1, x0: 11, x1: 17, z0: 11, z1: 17, floor: 'floorWoodDark', wall: 'wallPlain', trim: 'rail' },
  { id: 'kitchen', name: 'KITCHEN', L: 1, x0: 17, x1: 30, z0: 11, z1: 21, floor: 'floorTile', wall: 'wallDiamond', trim: 'base' },
  { id: 'dining', name: 'DINING ROOM', L: 1, x0: 30, x1: 36, z0: 11, z1: 21, floor: 'floorWood', wall: 'wallStripe', trim: 'wainscot', floors: [[30, 33.4, 11, 21], [33.4, 36, 13.4, 21], [35.8, 36, 11, 13.4]] },
  // ---- upstairs
  { id: 'master', name: 'MASTER BEDROOM', L: 2, x0: 0, x1: 10, z0: 0, z1: 8, floor: 'carpet', wall: 'wallRose', trim: 'wainscot' },
  { id: 'ubath', name: 'UPSTAIRS BATHROOM', L: 2, x0: 10, x1: 15, z0: 0, z1: 8, floor: 'floorBath', wall: 'wallTile', trim: 'base' },
  { id: 'guest', name: 'GUEST ROOM', L: 2, x0: 15, x1: 23, z0: 0, z1: 8, floor: 'carpetB', wall: 'wallC', trim: 'rail' },
  { id: 'storage', name: 'STORAGE ROOM', L: 2, x0: 23, x1: 30, z0: 0, z1: 8, floor: 'floorWoodDark', wall: 'wallBase', trim: 'none' },
  { id: 'ajanroom', name: '???', L: 2, x0: 30, x1: 40, z0: 0, z1: 8, floor: 'floorWoodDark', wall: 'wallFilth', trim: 'base' },
  { id: 'uhall', name: 'UPSTAIRS HALL', L: 2, x0: 0, x1: 40, z0: 8, z1: 11, floor: 'floorWood', wall: 'wallC', trim: 'wainscot' },
  { id: 'nursery', name: 'NURSERY', L: 2, x0: 0, x1: 10, z0: 11, z1: 21, floor: 'carpetB', wall: 'wallKids', trim: 'wainscotPale' },
  { id: 'library', name: 'LIBRARY', L: 2, x0: 10, x1: 20, z0: 11, z1: 21, floor: 'floorWoodDark', wall: 'wallPanel', trim: 'wainscot' },
  { id: 'music', name: 'MUSIC ROOM', L: 2, x0: 24, x1: 36, z0: 11, z1: 21, floor: 'floorWood', wall: 'wallGreenStripe', trim: 'rail', floors: [[24, 33.4, 11, 21], [33.4, 36, 13.4, 21], [35.8, 36, 11, 13.4]] },
  // ---- attic (safe zone)
  { id: 'attic', name: 'ATTIC', L: 3, x0: 18, x1: 40, z0: 8, z1: 21, floor: 'floorWood', wall: 'wallBase', safe: true,
    floors: [[18, 20, 8, 21], [20, 24, 8, 11], [24, 33.4, 8, 21], [33.4, 35.8, 8, 11], [33.4, 35.8, 13.4, 21], [35.8, 40, 8, 21]] },
];

// Multi-level shafts (checked before ordinary rooms)
export const SHAFTS = [
  { id: 'elevator', name: 'ELEVATOR', x0: 33.4, x1: 35.8, z0: 11, z1: 13.4, yMin: -4, yMax: 10 },
  { id: 'stairB', name: 'STAIRWELL', x0: 11, x1: 17, z0: 17, z1: 21, yMin: -4, yMax: 1.9, floors: { 1: [[16, 17.2, 17, 21]] } },
  { id: 'stairU', name: 'STAIRCASE', x0: 36, x1: 40, z0: 11, z1: 21, yMin: -0.5, yMax: 5.3, floors: { 1: [[36, 40, 19.5, 21]], 2: [[36, 40, 11, 13]] } },
  { id: 'stairA', name: 'ATTIC STAIRS', x0: 20, x1: 24, z0: 11, z1: 21, yMin: 1.9, yMax: 10, safeAbove: 3.9, floors: { 2: [[20, 24, 11, 12.5]], 3: [[20, 24, 19.5, 21]] } },
];

export function roomAt(x, z, y = 0) {
  for (const s of SHAFTS) {
    if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1 && y >= s.yMin && y < s.yMax) return s;
  }
  const L = levelIndex(y);
  for (const r of ROOMS) {
    if (r.L !== L) continue;
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  }
  return null;
}

/** Walkable floor rectangles per level (for groundAt). */
export const FLOORS = [[], [], [], []];
for (const r of ROOMS) for (const f of (r.floors || [[r.x0, r.x1, r.z0, r.z1]])) FLOORS[r.L].push(f);
// The porch outside the front door (escaping players step onto it).
FLOORS[1].push([1.65, 7.65, 21, 25]);
for (const s of SHAFTS) if (s.floors) for (const [L, rects] of Object.entries(s.floors)) rects.forEach(f => FLOORS[L].push(f));
export function floorAt(L, x, z) {
  const F = FLOORS[L];
  for (let i = 0; i < F.length; i++) { const f = F[i]; if (x >= f[0] && x <= f[1] && z >= f[2] && z <= f[3]) return true; }
  return false;
}

/** True for positions Ajan must never enter or attack (attic + attic stairs). */
export function isSafeZone(p) {
  if (levelIndex(p.y) === 3) return true;
  return p.x > 20 && p.x < 24 && p.z > 11 && p.z < 21 && p.y > 3.0;
}

// Doors: line 'x' = wall runs along X at z=c; line 'z' = wall runs along Z at x=c. y = floor level.
export const DOORS = [
  // ground floor
  { id: 'd_bed1', line: 'x', c: 8, a0: 3.0, w: 1.1, swing: -1, y: GY, name: 'Bedroom Door' },
  { id: 'd_bath', line: 'x', c: 8, a0: 10.0, w: 1.1, swing: -1, y: GY, name: 'Bathroom Door' },
  { id: 'd_bed2', line: 'x', c: 8, a0: 16.0, w: 1.1, swing: -1, y: GY, name: 'Bedroom Door' },
  { id: 'd_sec', line: 'x', c: 8, a0: 25.0, w: 1.1, swing: -1, y: GY, lock: 'power', name: 'Security Room Door' },
  { id: 'd_office', line: 'x', c: 8, a0: 34.5, w: 1.1, swing: -1, y: GY, lock: 'office_key', name: 'Office Door' },
  { id: 'd_living', line: 'x', c: 11, a0: 5.0, w: 1.1, swing: 1, y: GY, name: 'Living Room Door' },
  { id: 'd_start_n', line: 'x', c: 11, a0: 13.5, w: 1.1, swing: 1, y: GY, name: 'Door' },
  { id: 'd_kitchen', line: 'x', c: 11, a0: 22.0, w: 1.1, swing: 1, y: GY, name: 'Kitchen Door' },
  { id: 'd_dining', line: 'x', c: 11, a0: 31.0, w: 1.1, swing: 1, y: GY, name: 'Dining Room Door' },
  { id: 'd_start_w', line: 'z', c: 11, a0: 13.5, w: 1.1, swing: -1, y: GY, name: 'Door' },
  { id: 'd_start_e', line: 'z', c: 17, a0: 13.5, w: 1.1, swing: 1, y: GY, name: 'Door' },
  { id: 'd_dining_k', line: 'z', c: 30, a0: 15.0, w: 1.1, swing: 1, y: GY, name: 'Door' },
  { id: 'd_stairs', line: 'z', c: 36, a0: 19.7, w: 1.1, swing: -1, y: GY, name: 'Staircase Door' },
  { id: 'd_basement', line: 'z', c: 17, a0: 18.6, w: 1.1, swing: 1, y: GY, lock: 'basement_key', name: 'Basement Door' },
  { id: 'd_front', line: 'x', c: 21, a0: 4.0, w: 1.3, swing: -1, y: GY, lock: 'exit_key', chain: true, name: 'Front Door', exit: true },
  // upstairs
  { id: 'd_master', line: 'x', c: 8, a0: 4.0, w: 1.1, swing: -1, y: UY, name: 'Bedroom Door' },
  { id: 'd_ubath', line: 'x', c: 8, a0: 11.9, w: 1.1, swing: -1, y: UY, name: 'Bathroom Door' },
  { id: 'd_guest', line: 'x', c: 8, a0: 18.4, w: 1.1, swing: -1, y: UY, name: 'Guest Room Door' },
  { id: 'd_storage', line: 'x', c: 8, a0: 26.0, w: 1.1, swing: -1, y: UY, lock: 'storage_key', name: 'Storage Room Door' },
  { id: 'd_ajan', line: 'x', c: 8, a0: 34.2, w: 1.1, swing: -1, y: UY, name: 'Door' },
  { id: 'd_nursery', line: 'x', c: 11, a0: 4.5, w: 1.1, swing: 1, y: UY, name: 'Nursery Door' },
  { id: 'd_library', line: 'x', c: 11, a0: 14.5, w: 1.1, swing: 1, y: UY, name: 'Library Door' },
  { id: 'd_attic', line: 'x', c: 11, a0: 21.45, w: 1.1, swing: -1, y: UY, name: 'Attic Door', ajanBlocked: true },
  { id: 'd_music', line: 'x', c: 11, a0: 27.5, w: 1.1, swing: 1, y: UY, name: 'Music Room Door' },
  // basement
  { id: 'd_workshop', line: 'z', c: 30, a0: 22.0, w: 1.1, swing: 1, y: BY, name: 'Workshop Door' },
];
export const DOOR_H = 2.3;

// Doorless openings (cut from walls; Ajan walks through)
export const OPENINGS = [
  { id: 'o_part', line: 'z', c: 8, a0: 23.0, w: 1.4, y0: BY, h: 2.3 },
  { id: 'o_boiler', line: 'z', c: 17, a0: 23.0, w: 1.6, y0: BY, h: 2.3 },
];
// Elevator landing doorways (sliding doors live in props.js)
export const ELEV_DOORS = [
  { L: 0, line: 'x', c: 13.4, a0: 34.0, w: 1.4, y0: BY, h: 2.3, out: 1 },
  { L: 1, line: 'x', c: 11, a0: 34.0, w: 1.4, y0: GY, h: 2.3, out: -1 },
  { L: 2, line: 'x', c: 11, a0: 34.0, w: 1.4, y0: UY, h: 2.3, out: -1 },
  { L: 3, line: 'x', c: 11, a0: 34.0, w: 1.4, y0: AY, h: 2.3, out: -1 },
];

// line, c, a0, a1, y0, y1
export const WALLS = [
  // exterior (ground + upstairs)
  ['x', 0, 0, 40, GY, 6.4], ['x', 21, 0, 11, GY, 6.4], ['x', 21, 11, 17, BY, 6.4], ['x', 21, 17, 40, GY, 6.4],
  ['z', 0, 0, 21, GY, 6.4], ['z', 40, 0, 21, GY, 6.4],
  // ground interior
  ['x', 8, 0, 40, GY, 3], ['x', 11, 0, 33.4, GY, 3], ['x', 11, 35.8, 40, GY, 3],
  ['x', 17, 11, 17, BY, 3],
  ['z', 8, 0, 8, GY, 3], ['z', 13, 0, 8, GY, 3], ['z', 21, 0, 8, GY, 3], ['z', 30, 0, 8, GY, 3],
  ['z', 11, 11, 17, GY, 3], ['z', 11, 17, 21, -0.2, 3],
  ['z', 17, 11, 17, GY, 3], ['z', 17, 17, 21, GY, 3], ['z', 17, 17, 21, BY, GY],
  ['z', 30, 11, 21, GY, 3],
  ['z', 36, 11, 21, GY, 6.4],
  // upstairs interior
  ['x', 8, 0, 40, UY, 6.4], ['x', 11, 0, 33.4, UY, 6.4],
  ['z', 10, 0, 8, UY, 6.4], ['z', 15, 0, 8, UY, 6.4], ['z', 23, 0, 8, UY, 6.4], ['z', 30, 0, 8, UY, 6.4],
  ['z', 10, 11, 21, UY, 6.4], ['z', 20, 11, 21, UY, 6.4], ['z', 24, 11, 21, UY, 6.4],
  // attic
  ['x', 8, 18, 40, AY, 9], ['x', 21, 18, 40, AY, 9], ['z', 18, 8, 21, AY, 9], ['z', 40, 8, 21, AY, 9],
  ['z', 20, 11, 19.5, AY, 7.9], ['z', 24, 11, 19.5, AY, 7.9], ['x', 11, 20, 24, AY, 7.9],
  // elevator shaft (all levels)
  ['x', 11, 33.4, 35.8, BY, 9], ['x', 13.4, 33.4, 35.8, BY, 9], ['z', 33.4, 11, 13.4, BY, 9], ['z', 35.8, 11, 13.4, BY, 9],
  // basement
  ['z', 2, 17, 27, BY, -0.25], ['x', 27, 2, 40, BY, -0.25], ['x', 17, 2, 11, BY, -0.25], ['z', 8, 21, 27, BY, -0.25],
  ['z', 17, 21, 27, BY, -0.25], ['x', 17, 17, 30, BY, -0.25], ['z', 30, 13.4, 27, BY, -0.25],
  ['x', 13.4, 30, 33.4, BY, -0.25], ['x', 13.4, 35.8, 40, BY, -0.25], ['z', 40, 13.4, 27, BY, -0.25],
];

// Creaky floorboards (~1 x 1 m), 2-3 per dangerous level
export const FLOORBOARDS = [
  { x: 8.6, z: 19.6, y: BY }, { x: 22.5, z: 21.8, y: BY }, { x: 34.5, z: 21.0, y: BY },
  { x: 6.5, z: 13.0, y: GY }, { x: 26.5, z: 9.5, y: GY }, { x: 33.0, z: 17.0, y: GY },
  { x: 9.5, z: 9.5, y: UY }, { x: 29.0, z: 9.5, y: UY }, { x: 5.0, z: 5.0, y: UY },
];

export const SPAWN_POINTS = [
  [13.6, 13.4], [14.6, 13.4], [13.6, 14.4], [14.6, 14.4], [13.2, 12.6], [15.4, 12.6], [15.4, 14.6], [12.6, 13.8],
];
