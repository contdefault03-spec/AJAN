// Networking. Single-player uses LocalNet (no server traffic at all); co-op uses
// SocketNet, a thin wrapper around the Socket.IO relay. The host's browser is
// authoritative; everyone else sends requests to the host and applies its events.

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(ev, fn) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev).add(fn);
    return () => this.handlers.get(ev)?.delete(fn);
  }
  emit(ev, ...a) { this.handlers.get(ev)?.forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }); }
  clear() { this.handlers.clear(); }
}

export class LocalNet extends Emitter {
  constructor() {
    super();
    this.id = 'local';
    this.isHost = true;
    this.online = false;
  }
  send() {}
  vsend() {}
  rtc() {}
  serverNow() { return Date.now(); }
}

export class SocketNet extends Emitter {
  constructor() {
    super();
    this.online = true;
    this.offset = 0;
    this.room = null;
    this.id = null;
    this.isHost = false;
  }

  async connect() {
    if (this.socket?.connected) return;
    const { io } = await import('/socket.io/socket.io.esm.min.js');
    this.socket = io({ transports: ['websocket', 'polling'], reconnection: true });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Could not reach the game server.')), 12000);
      this.socket.once('connect', () => { clearTimeout(t); resolve(); });
      this.socket.once('connect_error', e => { clearTimeout(t); reject(new Error('Could not reach the game server: ' + e.message)); });
    });
    this.id = this.socket.id;
    const s = this.socket;
    s.on('relay', m => this.emit('relay', m.from, m.t, m.d));
    s.on('room:update', room => {
      this.room = room;
      this.isHost = room.hostId === this.id;
      this.emit('room', room);
    });
    s.on('peer:left', m => this.emit('peerLeft', m.id));
    s.on('peer:joined', m => this.emit('peerJoined', m.id));
    s.on('host:changed', m => { this.isHost = m.hostId === this.id; if (this.room) this.room.hostId = m.hostId; this.emit('hostChanged', m.hostId); });
    s.on('game:start', m => { this.room = m.room; this.isHost = m.room.hostId === this.id; this.emit('gameStart', m); });
    s.on('game:lobby', () => this.emit('lobby'));
    s.on('rtc', m => this.emit('rtc', m.from, m.data));
    s.on('disconnect', reason => { console.warn('Disconnected from server:', reason); this.room = null; this.emit('disconnected', reason); });
    s.on('connect', () => { this.id = s.id; });
    await this.syncTime();
  }

  async syncTime() {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const server = await new Promise(r => this.socket.emit('time', r));
      const t1 = Date.now();
      samples.push({ rtt: t1 - t0, off: server - (t0 + t1) / 2 });
    }
    samples.sort((a, b) => a.rtt - b.rtt);
    this.offset = samples[0].off;
  }
  serverNow() { return Date.now() + this.offset; }

  call(ev, ...args) {
    return new Promise(resolve => this.socket.emit(ev, ...args, resolve));
  }
  async createRoom(profile) {
    const r = await this.call('room:create', profile);
    if (r.ok) { this.room = r.room; this.isHost = true; }
    return r;
  }
  async joinRoom(code, profile) {
    const r = await this.call('room:join', code, profile);
    if (r.ok) { this.room = r.room; this.isHost = r.room.hostId === this.id; }
    return r;
  }
  updateProfile(p) { this.socket?.emit('room:profile', p); }
  leaveRoom() { this.socket?.emit('room:leave'); this.room = null; this.isHost = false; }
  startGame(difficulty) { this.socket?.emit('room:start', difficulty); }
  setDifficulty(d) { this.socket?.emit('room:difficulty', d); }
  backToLobby() { this.socket?.emit('room:lobby'); }

  send(t, d, to) { this.socket?.emit('relay', { t, d, to }); }
  vsend(t, d) { this.socket?.emit('vrelay', { t, d }); }
  rtc(to, data) { this.socket?.emit('rtc', { to, data }); }

  hostId() { return this.room?.hostId; }
}
