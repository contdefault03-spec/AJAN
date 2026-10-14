// Game-wide constants.

export const CHARACTERS = [
  { id: 'MAX', label: 'MAX', sound: 'max', shirt: '#d9d4c7', pants: '#3b3f4a' },
  { id: 'AJAN', label: 'AJAN', sound: 'ajandie', shirt: '#2b2b2e', pants: '#1f1f22' },
  { id: 'MASKED', label: 'MASKED', sound: 'masked', shirt: '#161616', pants: '#3d4a5c' },
  { id: 'RIZE', label: 'RIZE', sound: 'rize', shirt: '#b07a8c', pants: '#1d1d1d' },
  { id: 'LUCKY', label: 'LUCKY', sound: 'lucky', shirt: '#e0e0d6', pants: '#8a8f7a' },
  { id: 'MIDO', label: 'MIDO', sound: 'mido', shirt: '#26324a', pants: '#40382e' },
  { id: 'NONE', label: 'NONE OF THESE', sound: null, shirt: '#7a2b2b', pants: '#2e2e36' },
];
export const charById = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[CHARACTERS.length - 1];

// Every asset the game uses. `alts` lists acceptable alternative filenames
// (the uploaded files use slightly different names than the original spec).
export const ASSETS = {
  ajanModel: { names: ['ajan.glb'] },
  playerModel: { names: ['player.glb'] },
  menuVideo: { names: ['menu.mp4'], webm: 'menu.webm' },
  introVideo: { names: ['intro.mp4'], webm: 'intro.webm' },
  escapeVideo: { names: ['escape.mp4'], webm: 'escape.webm' },
  cinemaVideo: { names: ['cinema.mp4'] },
  objectModel: { names: ['object.glb'] },
  sleep: { names: ['sleep.mp3'] },
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
};

export const ITEM_INFO = {
  office_key: { name: 'Office Key' },
  basement_key: { name: 'Basement Key' },
  storage_key: { name: 'Storage Room Key' },
  fuse: { name: 'Fuse' },
  bolt_cutters: { name: 'Bolt Cutters' },
  exit_key: { name: 'Front Door Key' },
  elevator_key: { name: 'Elevator Key' },
};

// Per-character death-sound gain (1 = unchanged). Boosted sounds go through a
// limiter so they get louder without clipping.
export const DEATH_GAIN = {};

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
