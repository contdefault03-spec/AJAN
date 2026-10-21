// Game-wide constants.

export const CHARACTERS = [
  { id: 'MAX', label: 'MAX', sound: 'max', shirt: '#d9d4c7', pants: '#3b3f4a' },
  { id: 'AJAN', label: 'AJAN', sound: 'ajannew', shirt: '#2b2b2e', pants: '#1f1f22' },
  { id: 'MASKED', label: 'MASKED', sound: 'masked', shirt: '#161616', pants: '#3d4a5c' },
  { id: 'RIZE', label: 'RIZE', sound: 'rize', shirt: '#b07a8c', pants: '#1d1d1d' },
  { id: 'LUCKY', label: 'LUCKY', sound: 'lucky', shirt: '#e0e0d6', pants: '#8a8f7a' },
  { id: 'MIDO', label: 'MIDO', sound: 'mido', shirt: '#26324a', pants: '#40382e' },
  { id: 'ROT', label: 'ROT', sound: 'rot', shirt: '#4a5a2a', pants: '#2a2622' },
  { id: 'BANANA', label: 'BANANA', sound: 'banana', shirt: '#e8c930', pants: '#3a3020' },
  { id: 'VANEX', label: 'VANEX', sound: 'vanex', shirt: '#5a1f6e', pants: '#1b1b24' },
  { id: 'NONE', label: 'NONE OF THESE', sound: null, shirt: '#7a2b2b', pants: '#2e2e36' },
];
export const charById = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[CHARACTERS.length - 1];

// Every asset the game uses. `alts` lists acceptable alternative filenames
// (the uploaded files use slightly different names than the original spec).
export const ASSETS = {
  ajanModel: { names: ['ajan.glb'] },
  playerModel: { names: ['player1.glb', 'player.glb'] },
  guyModel: { names: ['guy.glb'] },
  ajanitaModel: { names: ['ajanita.glb'] },
  slotModel: { names: ['slot.glb'] },
  dollmaModel: { names: ['dollma.glb'] },
  menuVideo: { names: ['mainnew.mp4', 'menu.mp4'], webm: 'mainnew.webm' },
  escapeCarVideo: { names: ['escapecar.mp4'], webm: 'escapecar.webm' },
  tvVideo: { names: ['tv.mp4'], webm: 'tv.webm' },
  introVideo: { names: ['intro.mp4'], webm: 'intro.webm' },
  escapeVideo: { names: ['escape.mp4'], webm: 'escape.webm' },
  cinemaVideo: { names: ['cinema.mp4'] },
  objectModel: { names: ['object.glb'] },
  sleep: { names: ['sleep.mp3'] },
  noise: { names: ['noise.mp3'] },
  carModel: { names: ['car.glb'] },
  song1: { names: ['song1.mp3'] },        // nightclub music (the only club track)
  fai: { names: ['fai.mp3'] },
  yasmin: { names: ['yasmin.mp3'] },
  yasminModel: { names: ['yasmin.glb'] },
  dance1: { names: ['dance1.fbx'] }, dance2: { names: ['dance2.fbx'] }, dance3: { names: ['dance3.fbx'] },
  faiModel: { names: ['bartender.glb'] },
  image1: { names: ['image1.png', '1.png'] },
  image2: { names: ['image2.png', '2.png'] },
  image3: { names: ['image3.png', '3.png'] },
  image4: { names: ['image4.png', '4.png'] },
  image5: { names: ['image5.png', '5.png'] },
  ajan: { names: ['ajan.mp3'] },
  ajandie: { names: ['ajandie.mp3'] },
  ajanescape: { names: ['ajanescape.mp3'] },
  max: { names: ['max.mp3'] },
  masked: { names: ['masked.mp3'] },
  rize: { names: ['rize.mp3'] },
  lucky: { names: ['lucky.mp3'] },
  mido: { names: ['MIDO.mp3', 'mido.mp3'] },
  music1: { names: ['music1.mp3'] },
  music2: { names: ['music2.mp3'] },
  musicchase: { names: ['musicchase.mp3'] },
  rot: { names: ['rot.mp3'] },
  banana: { names: ['banana.mp3'] },
  vanex: { names: ['vanex.mp3'] },
  ajannew: { names: ['ajannew.mp3'] },
  ajansleep: { names: ['ajansleep.mp3'] },
  ajancatch: { names: ['ajancatch.mp3'] },
  ajansee: { names: ['ajansee.mp3'] },
  ajanleaves: { names: ['ajanleaves.mp3'] },
  ajanitasleep: { names: ['ajanitasleep.mp3'] },
  ajanitasee: { names: ['ajanitasee.mp3'] },
  ajanitaleave: { names: ['ajanitaleave.mp3'] },
  ajanita: { names: ['ajanita.mp3'] },
  guyseesyou: { names: ['guyseesyou.mp3'] },
  guyleaves: { names: ['guyleaves.mp3'] },
  guy: { names: ['guy.mp3'] },
  eat: { names: ['eat.mp3'] },
};
export const SOUND_KEYS = ['ajan', 'ajandie', 'ajanescape', 'max', 'masked', 'rize', 'lucky', 'mido', 'rot', 'banana', 'vanex', 'ajannew',
  'music1', 'music2', 'musicchase', 'sleep', 'noise', 'song1', 'fai', 'yasmin', 'ajansleep', 'ajancatch', 'ajansee', 'ajanleaves',
  'ajanitasleep', 'ajanitasee', 'ajanitaleave', 'ajanita', 'guyseesyou', 'guyleaves', 'guy', 'eat'];

// The monsters. Ajan is always in the house; Guy joins on Medium and Hard, Ajanita on Hard.
// kill: 'eat' (grab and eat, like Ajan) or 'punch' (knock down and drag the body away).
export const MONSTERS = {
  ajan: { id: 'ajan', name: 'Ajan', model: 'ajanModel', spec: 'ajan', height: 2.25, speed: 1, kill: 'eat', bed: 'ajanBed', from: 'easy',
    sounds: { see: 'ajansee', catch: 'ajancatch', leave: 'ajanleaves', sleep: 'ajansleep', whisper: 'ajan' } },
  guy: { id: 'guy', name: 'Guy', model: 'guyModel', spec: 'guy', height: 2.0, speed: 0.95, kill: 'punch', bed: null, from: 'medium',
    sounds: { see: 'guyseesyou', catch: 'guy', leave: 'guyleaves' } },
  ajanita: { id: 'ajanita', name: 'Ajanita', model: 'ajanitaModel', spec: 'ajanita', height: 2.1, speed: 0.97, kill: 'eat', bed: 'ajanitaBed', from: 'hard',
    sounds: { see: 'ajanitasee', catch: 'ajanita', leave: 'ajanitaleave', sleep: 'ajanitasleep' } },
};
const DIFF_ORDER = ['easy', 'medium', 'hard'];
export const monstersFor = d => Object.values(MONSTERS).filter(m => DIFF_ORDER.indexOf(m.from) <= DIFF_ORDER.indexOf(d));

// Inventory: everyone carries at most INV_SLOTS slots; bulky things take more than one.
export const INV_SLOTS = 3;
export const itemSlots = type => (type === 'stair_lower' || type === 'stair_upper' ? 2 : 1);

export const ITEM_INFO = {
  office_key: { name: 'Office Key' },
  basement_key: { name: 'Basement Key' },
  storage_key: { name: 'Storage Room Key' },
  fuse: { name: 'Fuse' },
  bolt_cutters: { name: 'Bolt Cutters' },
  exit_key: { name: 'Front Door Key' },
  elevator_key: { name: 'Elevator Key' },
  weapon_key: { name: 'Weapon Key' },
  revolver: { name: 'Revolver' },
  bullet: { name: 'Bullet' },
  stair_lower: { name: 'Ladder Section I (lower)' },
  stair_upper: { name: 'Ladder Section II (upper)' },
  attic_key: { name: 'Attic Key' },
  vodka: { name: 'Vodka' },
  beer: { name: 'Beer' },
  wine: { name: 'Glass of Wine' },
  engine: { name: 'Car Engine' },
  wrench: { name: 'Wrench' },
  oil: { name: 'Motor Oil' },
  battery: { name: 'Car Battery' },
  spray: { name: 'Poison Spray' },
  well_lever: { name: 'Well Crank Lever' },
};

// Per-character death-sound gain (1 = unchanged). Boosted sounds go through a
// limiter so they get louder without clipping.
// MASKED's clip ("Xhiko") is mastered much quieter than the others, so it is boosted ×4.
// How well the monsters hear (every noise radius is multiplied by `hear`), how fast
// they move (`speed`) and how many times a player comes back after being caught.
export const DIFFICULTY = {
  easy: { label: 'EASY', hear: 0.6, speed: 0.92, respawns: 3 },
  medium: { label: 'MEDIUM', hear: 1.0, speed: 1.1, respawns: 2 },
  hard: { label: 'HARD', hear: 1.45, speed: 1.25, respawns: 1 },
};
export const difficultyOf = d => (DIFFICULTY[d] ? d : 'medium');

export const DEATH_GAIN = { MASKED: 4 };
// Character voices (death sounds, monster see / catch / leave lines, chewing) play 150 % louder.
export const VOICE_GAIN = 1.5;

export const PLAYER = {
  height: 1.75,
  eye: 1.6,
  crouchEye: 1.0,
  radius: 0.3,
  walk: 2.6,
  run: 4.9,
  crouch: 1.3,
  stamina: 6,
};

export const AJAN = {
  height: 2.25,
  radius: 0.42,
  patrol: 1.55,
  investigate: 2.5,
  search: 2.1,
  chase: 4.35,
  catchDist: 1.25,
  dormant: 25,
};
