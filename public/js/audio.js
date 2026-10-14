// Web Audio engine: buses, music state machine, positional SFX and a set of
// procedurally synthesised sounds (footsteps, creaks, thunder, static, growls...).
import { settings, onSettingChange } from './settings.js';
import { loadAudioBuffer } from './assets.js';

const peaks = new WeakMap();
/** Largest absolute sample in a buffer (cached). */
function bufferPeak(buf) {
  let pk = peaks.get(buf);
  if (pk === undefined) {
    pk = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > pk) pk = a; }
    }
    peaks.set(buf, pk);
  }
  return pk;
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.music = { mode: 'off', current: null, nextIdx: 0, timer: null };
  }

  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.musicBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.voiceBus = c.createGain();
    this.voiceBus.connect(this.master);
    this.applyVolumes();
    onSettingChange(() => this.applyVolumes());
    this.synthesize();
    this.synthesizeExtra();
    return c;
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(settings.voice * 1.6, t, 0.05);
  }

  async loadAll(keys) {
    await Promise.all(keys.map(async k => { this.buffers[k] = await loadAudioBuffer(this.ctx, k); }));
  }

  duration(key) { return this.buffers[key]?.duration || 0; }

  setListener(pos, fwd, up = { x: 0, y: 1, z: 0 }) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  makePanner(pos, ref = 1.5, max = 30, rolloff = 1.2) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = max;
    p.rolloffFactor = rolloff;
    this.setPannerPos(p, pos);
    return p;
  }
  setPannerPos(p, pos) {
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
  }

  /**
   * Play a buffer. opts: { pos, vol, rate, loop, bus, ref, muffle (0..1), offset }
   * Returns a handle with stop(), setPos(), setVol().
   */
  play(keyOrBuf, opts = {}) {
    if (!this.ctx) return null;
    const buf = typeof keyOrBuf === 'string' ? this.buffers[keyOrBuf] : keyOrBuf;
    if (!buf) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = c.createGain();
    gain.gain.value = opts.vol ?? 1;
    let node = src;
    let filter = null;
    if (opts.muffle) {
      filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000 * Math.pow(1 - opts.muffle, 2) + 350;
      node.connect(filter);
      node = filter;
    }
    node.connect(gain);
    // Optional brick-wall limiter for boosted sounds so extra gain doesn't clip.
    // Only engaged when the boosted peak would actually get near 0 dBFS: the
    // compressor adds its own makeup gain, which would overshoot the boost.
    let out = gain;
    if (opts.limit && bufferPeak(buf) * (opts.vol ?? 1) > 0.89) {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -3; comp.knee.value = 2; comp.ratio.value = 20;
      comp.attack.value = 0.002; comp.release.value = 0.12;
      gain.connect(comp);
      out = comp;
    }
    let panner = null;
    if (opts.pos) {
      panner = this.makePanner(opts.pos, opts.ref ?? 1.5, opts.max ?? 40, opts.rolloff ?? 1.2);
      out.connect(panner);
      panner.connect(opts.bus || this.sfxBus);
    } else out.connect(opts.bus || this.sfxBus);
    if (opts.duration) src.start(0, opts.offset || 0, opts.duration);
    else src.start(0, opts.offset || 0);
    const h = {
      src, gain, panner, filter, ended: false,
      stop: (fade = 0.05) => {
        if (h.ended) return;
        h.ended = true;
        const t = c.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + fade);
        try { src.stop(t + fade + 0.02); } catch { /* already stopped */ }
      },
      setPos: p => panner && this.setPannerPos(panner, p),
      setVol: v => gain.gain.setTargetAtTime(v, c.currentTime, 0.05),
      setMuffle: m => filter && filter.frequency.setTargetAtTime(20000 * Math.pow(1 - m, 2) + 350, c.currentTime, 0.05),
    };
    src.onended = () => { h.ended = true; };
    return h;
  }

  // ---------------------------------------------------------------- music
  /** mode: 'off' | 'ambient' | 'chase' */
  setMusic(mode) {
    if (!this.ctx || this.music.mode === mode) return;
    this.music.mode = mode;
    clearTimeout(this.music.timer);
    const old = this.music.current;
    if (old) old.stop(mode === 'chase' ? 0.6 : 2.5);
    this.music.current = null;
    if (mode === 'chase') {
      this.music.current = this.play('musicchase', { loop: true, vol: 0, bus: this.musicBus });
      this.music.current?.gain.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.25);
    } else if (mode === 'ambient') {
      this.music.timer = setTimeout(() => this.nextAmbient(), mode === 'ambient' && old ? 2500 : 200);
    }
  }

  nextAmbient() {
    if (this.music.mode !== 'ambient') return;
    const order = ['music1', 'music2'];
    let key = order[this.music.nextIdx % 2];
    if (!this.buffers[key]) key = order[(this.music.nextIdx + 1) % 2];
    this.music.nextIdx++;
    const buf = this.buffers[key];
    if (!buf) return; // no ambient tracks available
    const h = this.play(buf, { vol: 0, bus: this.musicBus });
    h.gain.gain.setTargetAtTime(0.7, this.ctx.currentTime, 1.2);
    this.music.current = h;
    // Crossfade into the other track a few seconds before this one ends.
    const fadeAt = Math.max(1, buf.duration - 4);
    this.music.timer = setTimeout(() => {
      if (this.music.current !== h) return;
      h.stop(4);
      this.nextAmbient();
    }, fadeAt * 1000);
  }

  // ------------------------------------------- extra sounds for the expansion
  synthesizeExtra() {
    const c = this.ctx;
    const sr = c.sampleRate;
    const mk = (secs, fn, ch = 1) => {
      const b = c.createBuffer(ch, Math.max(1, Math.floor(secs * sr)), sr);
      for (let k = 0; k < ch; k++) fn(b.getChannelData(k), sr, k);
      return b;
    };
    const rnd = () => Math.random() * 2 - 1;
    // Loud, distinctive two-stage floorboard groan
    this.buffers.boardCreak = mk(1.3, (d, sr) => {
      let ph = 0, lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = t < 0.45 ? 140 + t * 260 + Math.sin(t * 40) * 30 : 95 + Math.sin(t * 23) * 25;
        ph += f / sr;
        const saw = (ph % 1) * 2 - 1;
        const stick = Math.sin(t * 2 * Math.PI * (t < 0.45 ? 31 : 17)) > 0.1 ? 1 : 0.2;
        lp += (rnd() - lp) * 0.3;
        const env = Math.min(1, t * 25) * (t < 0.45 ? 1 : Math.exp(-(t - 0.45) * 3.2));
        d[i] = (saw * stick * 0.55 + lp * 0.25) * env;
      }
    });
    this.buffers.boing = mk(1.1, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = 90 + 260 * Math.exp(-t * 5) + Math.sin(t * 38) * 22 * Math.exp(-t * 2);
        ph += f / sr;
        d[i] = Math.sin(ph * 2 * Math.PI) * Math.exp(-t * 3.2) * 0.8;
      }
    });
    this.buffers.ding = mk(1.6, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.sin(t * 2 * Math.PI * 880) + Math.sin(t * 2 * Math.PI * 1320) * 0.4) * Math.exp(-t * 2.5) * 0.35;
      }
    });
    this.buffers.elevHum = mk(2, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.05;
        d[i] = (Math.sin(t * 2 * Math.PI * 55) * 0.4 + Math.sin(t * 2 * Math.PI * 110) * 0.2 + lp * 1.2) * (0.85 + 0.15 * Math.sin(t * 2 * Math.PI * 3)) * 0.5;
      }
    });
    this.buffers.ring = mk(2.4, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const on = (t % 1.2) < 0.8 ? 1 : 0;
        const trill = Math.sin(t * 2 * Math.PI * 20) > 0 ? 1 : 0.3;
        d[i] = (Math.sin(t * 2 * Math.PI * 440) + Math.sin(t * 2 * Math.PI * 480)) * 0.18 * on * trill;
      }
    });
    // Area ambiences (loops)
    this.buffers.ambBase = mk(8, (d, sr) => {
      let lp = 0;
      const drips = [0.7, 2.9, 4.1, 6.6];
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.01;
        let v = lp * 2.5 + Math.sin(t * 2 * Math.PI * 41) * 0.08;
        for (const dt of drips) if (t > dt && t < dt + 0.12) v += Math.sin((t - dt) * 2 * Math.PI * (900 - (t - dt) * 3000)) * Math.exp(-(t - dt) * 40) * 0.4;
        d[i] = v;
      }
    });
    this.buffers.ambHouse = mk(8, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.02;
        const tick = (t % 1) < 0.006 ? Math.sin(t * 2 * Math.PI * 2400) * 0.25 : 0;
        d[i] = lp * 0.9 + tick;
      }
    });
    this.buffers.ambUp = mk(8, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const k = 0.008 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.8));
        lp += (rnd() - lp) * k;
        d[i] = lp * 2.2 * (0.6 + 0.4 * Math.sin(t * Math.PI / 4));
      }
    });
    this.buffers.ambAttic = mk(8, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        lp += (rnd() - lp) * 0.45;
        const drop = Math.random() < 0.0009 ? 1 : 0;
        d[i] = (rnd() - lp) * 0.12 + drop * rnd() * 0.5;
      }
    });
    // Spider: a long breathy hiss with a rattling edge
    this.buffers.hiss = mk(1.4, (d, sr) => {
      let hp = 0, lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const n = rnd();
        lp += (n - lp) * 0.6; hp = n - lp;
        const rattle = 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 38);
        const env = Math.min(1, t * 12) * Math.exp(-Math.max(0, t - 0.5) * 3);
        d[i] = hp * rattle * env * 0.9;
      }
    });
    // Spider legs on floorboards: fast irregular clicks
    this.buffers.skitter = mk(0.6, (d, sr) => {
      for (let k = 0; k < 14; k++) {
        const at = Math.floor((k / 14 + Math.random() * 0.03) * d.length);
        for (let j = 0; j < 260 && at + j < d.length; j++) d[at + j] += rnd() * Math.exp(-j / 40) * (0.5 + Math.random() * 0.5);
      }
    });
    // Revolver: sharp crack + boomy tail
    this.buffers.gunshot = mk(1.6, (d, sr) => {
      let lp = 0, ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * (t < 0.01 ? 0.9 : 0.12);
        ph += (55 + 40 * Math.exp(-t * 18)) / sr;
        const crack = rnd() * Math.exp(-t * 90);
        const boom = Math.sin(ph * 2 * Math.PI) * Math.exp(-t * 7) * 0.8;
        const tail = lp * Math.exp(-t * 2.6) * 0.7;
        d[i] = Math.max(-1, Math.min(1, crack + boom + tail));
      }
    });
    // Cylinder click / reload
    this.buffers.click = mk(0.35, (d, sr) => {
      for (const [at, f] of [[0.0, 2400], [0.12, 1700], [0.22, 3100]]) {
        const s0 = Math.floor(at * sr);
        for (let j = 0; j < 900 && s0 + j < d.length; j++) d[s0 + j] += Math.sin(j / sr * 2 * Math.PI * f) * Math.exp(-j / 160) * 0.7 + rnd() * Math.exp(-j / 60) * 0.3;
      }
    });
    // Heavy safe door: clunk of the bolts + long metal groan
    this.buffers.safeOpen = mk(1.8, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const bolt = (t < 0.08 ? rnd() * Math.exp(-t * 60) : 0) + (t > 0.25 && t < 0.33 ? rnd() * Math.exp(-(t - 0.25) * 60) : 0);
        ph += (70 + 30 * Math.sin(t * 3)) / sr;
        const groan = t > 0.4 ? ((ph % 1) * 2 - 1) * 0.25 * Math.sin(Math.min(1, (t - 0.4) * 2) * Math.PI) : 0;
        d[i] = bolt * 0.9 + groan;
      }
    });
    // Old clock tick-tock (2 s loop)
    this.buffers.tick = mk(2, (d, sr) => {
      for (const [at, f] of [[0.0, 2100], [1.0, 1500]]) {
        const s0 = Math.floor(at * sr);
        for (let j = 0; j < 1400; j++) d[s0 + j] += (Math.sin(j / sr * 2 * Math.PI * f) * 0.6 + rnd() * 0.4) * Math.exp(-j / 220) * 0.6;
      }
    });
  }

  // --------------------------------------------------------- synthesis
  synthesize() {
    const c = this.ctx;
    const sr = c.sampleRate;
    const mk = (secs, fn, ch = 1) => {
      const b = c.createBuffer(ch, Math.max(1, Math.floor(secs * sr)), sr);
      for (let k = 0; k < ch; k++) {
        const d = b.getChannelData(k);
        fn(d, sr, k);
      }
      return b;
    };
    const rnd = () => Math.random() * 2 - 1;

    // Footstep on old wood: short thump + creak-ish click.
    this.buffers.step = mk(0.22, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.12;
        const env = Math.exp(-t * 38);
        d[i] = (lp * 1.6 + Math.sin(t * 2 * Math.PI * 85) * 0.5) * env;
      }
    });
    this.buffers.stepHeavy = mk(0.5, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.05;
        const env = Math.exp(-t * 11);
        d[i] = (lp * 2.2 + Math.sin(t * 2 * Math.PI * 48) * 0.9) * env;
      }
    });
    // Door creak: modulated sawtooth through resonances.
    this.buffers.creak = mk(1.1, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = 180 + Math.sin(t * 7) * 60 + Math.sin(t * 31) * 25 + t * 90;
        ph += f / sr;
        const saw = (ph % 1) * 2 - 1;
        const stick = (Math.sin(t * 2 * Math.PI * 23) > 0.2 ? 1 : 0.25);
        const env = Math.min(1, t * 10) * Math.exp(-t * 1.6);
        d[i] = saw * stick * env * 0.35;
      }
    });
    this.buffers.slam = mk(0.7, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.2;
        d[i] = (lp * 1.4 + Math.sin(t * 2 * Math.PI * 70) * 0.8) * Math.exp(-t * 9);
      }
    });
    this.buffers.rattle = mk(0.5, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const burst = Math.max(0, Math.sin(t * 2 * Math.PI * 14));
        d[i] = rnd() * burst * burst * Math.exp(-t * 4) * 0.6 + Math.sin(t * 2 * Math.PI * 900) * burst * 0.08 * Math.exp(-t * 6);
      }
    });
    this.buffers.pickup = mk(0.25, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.sin(t * 2 * Math.PI * 1300) * 0.3 + rnd() * 0.25) * Math.exp(-t * 30);
      }
    });
    this.buffers.clunk = mk(0.6, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.3;
        d[i] = (lp + Math.sin(t * 2 * Math.PI * 140) * 0.6) * Math.exp(-t * 14) + Math.sin(t * 2 * Math.PI * 60) * 0.4 * Math.exp(-t * 5);
      }
    });
    this.buffers.hum = mk(2, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.sin(t * 2 * Math.PI * 50) * 0.5 + Math.sin(t * 2 * Math.PI * 100) * 0.25 + Math.sin(t * 2 * Math.PI * 150) * 0.1) * 0.3;
      }
    });
    this.buffers.powerUp = mk(2.2, (d, sr) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        ph += (30 + t * 40) / sr;
        d[i] = (Math.sin(ph * 2 * Math.PI) * 0.6 + rnd() * 0.15 * Math.exp(-t * 3)) * Math.min(1, t * 3) * Math.exp(-Math.max(0, t - 1.5) * 4);
      }
    });
    // TV static: band-limited noise, loops.
    this.buffers.static = mk(2, (d) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        lp += (rnd() - lp) * 0.6;
        d[i] = (rnd() - lp) * 0.35;
      }
    });
    // Thunder: long low rumble with crackle.
    this.buffers.thunder = mk(5, (d, sr, ch) => {
      let lp = 0, lp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.02;
        lp2 += (rnd() - lp2) * 0.15;
        const env = Math.min(1, t * 6) * Math.exp(-t * 0.8);
        const crack = t < 0.4 ? lp2 * Math.exp(-t * 8) : 0;
        d[i] = (lp * 5 * (0.7 + 0.3 * Math.sin(t * 3 + ch))) * env + crack;
      }
    }, 2);
    // Ajan growl/roar: low saw + formant-ish noise.
    this.buffers.growl = mk(1.8, (d, sr) => {
      let ph = 0, lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = 62 + Math.sin(t * 9) * 8 + Math.sin(t * 2.3) * 12;
        ph += f / sr;
        lp += (rnd() - lp) * 0.08;
        const saw = (ph % 1) * 2 - 1;
        const env = Math.min(1, t * 4) * Math.exp(-Math.max(0, t - 1.1) * 5);
        d[i] = (saw * 0.45 + lp * 1.4) * env * (0.8 + 0.2 * Math.sin(t * 40));
      }
    });
    this.buffers.roar = mk(2.4, (d, sr) => {
      let ph = 0, lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = 95 + Math.sin(t * 13) * 15 - t * 15;
        ph += f / sr;
        lp += (rnd() - lp) * 0.25;
        const saw = (ph % 1) * 2 - 1;
        const env = Math.min(1, t * 8) * Math.exp(-Math.max(0, t - 1.4) * 3);
        d[i] = (saw * 0.5 + lp * 0.9) * env;
      }
    });
    this.buffers.chew = mk(0.35, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.4;
        d[i] = lp * Math.exp(-t * 14) * (Math.sin(t * 2 * Math.PI * 30) > 0 ? 1 : 0.4);
      }
    });
    this.buffers.knock = mk(1.4, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.15;
        const hits = [0, 0.35, 0.7];
        let v = 0;
        for (const h of hits) if (t >= h) v += Math.exp(-(t - h) * 28);
        d[i] = (lp + Math.sin(t * 2 * Math.PI * 110) * 0.6) * v * 0.8;
      }
    });
    this.buffers.wind = mk(6, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const k = 0.01 + 0.02 * (0.5 + 0.5 * Math.sin(t * 0.9));
        lp += (rnd() - lp) * k;
        d[i] = lp * 2.2 * Math.min(1, t, 6 - t);
      }
    });
    this.buffers.heartbeat = mk(0.9, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const b = (x) => (t > x ? Math.sin((t - x) * 2 * Math.PI * 45) * Math.exp(-(t - x) * 22) : 0);
        d[i] = b(0) * 0.9 + b(0.22) * 0.6;
      }
    });
    this.buffers.sting = mk(2.5, (d, sr) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const env = Math.min(1, t * 30) * Math.exp(-t * 1.5);
        d[i] = (Math.sin(t * 2 * Math.PI * 233) + Math.sin(t * 2 * Math.PI * 247) + Math.sin(t * 2 * Math.PI * 311) * 0.7 + rnd() * 0.3) * env * 0.25;
      }
    });
    this.buffers.drawer = mk(0.5, (d, sr) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (rnd() - lp) * 0.35;
        d[i] = lp * (0.4 + 0.6 * Math.abs(Math.sin(t * 2 * Math.PI * 18))) * Math.min(1, t * 20) * Math.exp(-t * 5) * 0.8;
      }
    });
  }
}

export const audio = new AudioEngine();
