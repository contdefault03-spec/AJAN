// Persistent settings stored in localStorage (wrapped so private mode still works).

const KEY = 'ajan.settings.v1';
const PROFILE_KEY = 'ajan.profile.v1';

export const DEFAULTS = {
  master: 0.85,
  music: 0.3,
  sfx: 0.8,
  voice: 1.0,
  micId: '',
  micSensitivity: 0.55, // 0..1, higher = picks up quieter speech
  micMuted: false,
  micConfigured: false,
  mouse: 1.0,
  quality: 'medium', // low | medium | high
  vhs: 'full', // off | low | full
  invertY: false,
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const settings = load(KEY, DEFAULTS);
const listeners = new Set();
export function setSetting(k, v) {
  settings[k] = v;
  save(KEY, settings);
  listeners.forEach(fn => fn(k, v));
}
export function onSettingChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const profile = load(PROFILE_KEY, { character: '', name: '', shirt: '', pants: '' });
export function saveProfile(p) {
  Object.assign(profile, p);
  save(PROFILE_KEY, profile);
}
