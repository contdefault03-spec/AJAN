// Microphone capture + voice-activity detection, and peer-to-peer WebRTC voice
// chat with positional audio (distance, direction, wall/floor muffling).
import { audio } from './audio.js';
import { settings, setSetting } from './settings.js';
import { clamp } from './util.js';

class Mic {
  constructor() {
    this.stream = null;
    this.level = 0;
    this.speaking = false;
    this.hold = 0;
    this.deviceId = '';
    this.error = null;
    this.listeners = new Set();
  }

  get supported() { return !!navigator.mediaDevices?.getUserMedia; }

  async listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'audioinput');
  }

  async open(deviceId = settings.micId) {
    if (!this.supported) { this.error = 'Microphone access is not supported in this browser.'; return null; }
    const ctx = audio.init();
    this.close();
    const constraints = {
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      },
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      if (deviceId) {
        try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e2) { this.error = e2.message; return null; }
      } else { this.error = e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : e.message; return null; }
    }
    this.error = null;
    const track = this.stream.getAudioTracks()[0];
    this.deviceId = track?.getSettings?.().deviceId || deviceId || '';
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser);
    this.applyMute();
    this.listeners.forEach(fn => fn(this.stream));
    return this.stream;
  }

  onStream(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  get track() { return this.stream?.getAudioTracks()[0] || null; }

  applyMute() {
    const t = this.track;
    if (t) t.enabled = !settings.micMuted;
  }
  setMuted(m) { setSetting('micMuted', m); this.applyMute(); }

  threshold() { return 0.72 - settings.micSensitivity * 0.55; }

  update(dt) {
    if (!this.analyser) { this.level = 0; this.speaking = false; return; }
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    const db = 20 * Math.log10(rms + 1e-8);
    const lvl = clamp((db + 62) / 52, 0, 1);
    this.level += (lvl - this.level) * Math.min(1, dt * (lvl > this.level ? 25 : 8));
    const active = !settings.micMuted && this.level > this.threshold();
    if (active) this.hold = 0.35; else this.hold -= dt;
    this.speaking = this.hold > 0;
  }

  setMonitor(on) {
    if (!this.source) return;
    const ctx = audio.ctx;
    if (on && !this.monitorNode) {
      this.monitorNode = ctx.createDelay(1);
      this.monitorNode.delayTime.value = 0.25;
      this.source.connect(this.monitorNode);
      this.monitorNode.connect(audio.master);
    } else if (!on && this.monitorNode) {
      try { this.source.disconnect(this.monitorNode); } catch { /* not connected */ }
      this.monitorNode.disconnect();
      this.monitorNode = null;
    }
  }

  close() {
    this.setMonitor(false);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    try { this.source?.disconnect(); } catch { /* ignore */ }
    this.source = this.analyser = null;
    this.level = 0;
    this.speaking = false;
  }
}

export const mic = new Mic();

let iceCache = null;
async function iceServers() {
  if (iceCache) return iceCache;
  try { iceCache = (await (await fetch('/api/config')).json()).iceServers; } catch { iceCache = [{ urls: 'stun:stun.l.google.com:19302' }]; }
  return iceCache;
}

export class VoiceChat {
  constructor(net) {
    this.net = net;
    this.peers = new Map();
    this.offs = [];
    this.active = false;
  }

  async start(peerIds) {
    if (!this.net.online) return;
    this.active = true;
    this.ice = await iceServers();
    this.offs.push(this.net.on('rtc', (from, data) => this.onSignal(from, data)));
    this.offs.push(this.net.on('peerLeft', id => this.removePeer(id)));
    this.offs.push(mic.onStream(() => this.refreshTracks()));
    for (const id of peerIds) if (id !== this.net.id && this.net.id < id) this.ensurePeer(id, true);
  }

  ensurePeer(id, initiator) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer = { id, pc, initiator, makingOffer: false, nodes: null, audioEl: null, sender: null };
    this.peers.set(id, peer);
    // The initiator creates the single audio transceiver (sendrecv even without a
    // mic so the other side can still talk); the answerer attaches to it on offer.
    if (initiator) {
      const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      peer.sender = tr.sender;
      if (mic.track) tr.sender.replaceTrack(mic.track).catch(() => {});
    }
    pc.onicecandidate = e => { if (e.candidate) this.net.rtc(id, { ice: e.candidate }); };
    pc.ontrack = e => this.attachRemote(peer, e.streams[0] || new MediaStream([e.track]));
    pc.onnegotiationneeded = async () => {
      if (!peer.initiator) return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription(await pc.createOffer());
        this.net.rtc(id, { sdp: pc.localDescription });
      } catch (e) { console.warn('offer failed', e); } finally { peer.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        console.warn('Voice connection to', id, 'failed (a TURN server may be required).');
        if (peer.initiator) pc.restartIce?.();
      }
    };
    return peer;
  }

  async onSignal(from, data) {
    if (!this.active) return;
    const peer = this.ensurePeer(from, this.net.id < from);
    const pc = peer.pc;
    try {
      if (data.sdp) {
        if (data.sdp.type === 'offer') {
          await pc.setRemoteDescription(data.sdp);
          const tr = pc.getTransceivers().find(t => t.receiver.track?.kind === 'audio');
          if (tr) {
            tr.direction = 'sendrecv';
            peer.sender = tr.sender;
            if (mic.track) await tr.sender.replaceTrack(mic.track).catch(() => {});
          }
          await pc.setLocalDescription(await pc.createAnswer());
          this.net.rtc(from, { sdp: pc.localDescription });
        } else {
          await pc.setRemoteDescription(data.sdp);
        }
      } else if (data.ice) {
        await pc.addIceCandidate(data.ice).catch(() => {});
      }
    } catch (e) { console.warn('signal error', e); }
  }

  attachRemote(peer, stream) {
    if (peer.nodes) return;
    const ctx = audio.ctx;
    // Chrome only pipes remote WebRTC audio into Web Audio if it's also attached to a media element.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    el.play().catch(() => {});
    peer.audioEl = el;
    const src = ctx.createMediaStreamSource(stream);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = audio.makePanner({ x: 0, y: 0, z: 0 }, 1.6, 40, 1.25);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(audio.voiceBus);
    peer.nodes = { src, filter, gain, panner };
  }

  refreshTracks() {
    const track = mic.track;
    for (const peer of this.peers.values()) {
      if (peer.sender) peer.sender.replaceTrack(track).catch(() => {});
    }
  }

  removePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch { /* ignore */ }
    if (p.nodes) { try { p.nodes.panner.disconnect(); } catch { /* ignore */ } }
    if (p.audioEl) p.audioEl.srcObject = null;
    this.peers.delete(id);
  }

  /**
   * Route every peer's voice. fn(id) returns { pos, gain (0..1), muffle (0..1), spatial (bool) }.
   */
  update(fn) {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    for (const peer of this.peers.values()) {
      if (!peer.nodes) continue;
      const r = fn(peer.id);
      const n = peer.nodes;
      if (!r) { n.gain.gain.setTargetAtTime(0, t, 0.1); continue; }
      audio.setPannerPos(n.panner, r.pos);
      n.panner.rolloffFactor = r.spatial ? 1.25 : 0;
      n.gain.gain.setTargetAtTime(r.gain, t, 0.08);
      n.filter.frequency.setTargetAtTime(20000 * Math.pow(1 - r.muffle, 2.2) + 380, t, 0.08);
    }
  }

  stop() {
    this.active = false;
    this.offs.forEach(off => off());
    this.offs = [];
    for (const id of [...this.peers.keys()]) this.removePeer(id);
  }
}
