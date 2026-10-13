// AJAN game server: serves the static client, the asset folder, and a small
// Socket.IO relay for co-op rooms and WebRTC voice signalling.
// The room host's browser is the game authority (Ajan's AI, items, doors, kills);
// this server only manages rooms, picks the host and relays messages.
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ASSET_DIR = path.join(__dirname, 'assets');
const MAX_PLAYERS = 8;
const CHARACTERS = ['MAX', 'AJAN', 'MASKED', 'RIZE', 'LUCKY', 'MIDO', 'NONE'];

const app = express();
app.disable('x-powered-by');
app.use('/assets', express.static(ASSET_DIR, { maxAge: '1h' }));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

app.get('/api/assets', (req, res) => {
  let files = [];
  try { files = fs.readdirSync(ASSET_DIR).filter(f => !f.startsWith('.')); } catch { /* no asset dir */ }
  res.json({ files });
});

// ICE servers for voice chat. STUN works for most home networks; set TURN_URL,
// TURN_USERNAME and TURN_CREDENTIAL for players behind strict NATs.
app.get('/api/config', (req, res) => {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map(s => s.trim()),
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  }
  res.json({ iceServers });
});

app.get('/healthz', (req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6, pingInterval: 25000, pingTimeout: 60000 });

/** code -> { code, hostId, players: Map<id, {id, profile, joinedAt}>, started, seed } */
const rooms = new Map();

function stripControl(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    const bad = c < 32 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff;
    if (!bad) out += ch;
  }
  return out;
}

function sanitizeName(name) {
  return stripControl(String(name ?? '').normalize('NFKC'))
    .replace(/[<>&"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}
function sanitizeColor(c, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(c)) ? String(c) : fallback;
}
function sanitizeProfile(p = {}) {
  const character = CHARACTERS.includes(p.character) ? p.character : 'NONE';
  let name = character === 'NONE' ? sanitizeName(p.name) : character;
  if (!name) name = 'STRANGER';
  return {
    character,
    name,
    shirt: sanitizeColor(p.shirt, '#d8d8d8'),
    pants: sanitizeColor(p.pants, '#5a5a62'),
  };
}
function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
function roomInfo(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    players: [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt).map(p => ({ id: p.id, ...p.profile })),
  };
}
function broadcastRoom(room) { io.to(room.code).emit('room:update', roomInfo(room)); }

function leaveRoom(socket) {
  const code = socket.data.room;
  if (!code) return;
  socket.data.room = null;
  socket.leave(code);
  const room = rooms.get(code);
  if (!room) return;
  room.players.delete(socket.id);
  if (room.players.size === 0) { rooms.delete(code); return; }
  socket.to(code).emit('peer:left', { id: socket.id });
  if (room.hostId === socket.id) {
    const next = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    room.hostId = next.id;
    io.to(code).emit('host:changed', { hostId: room.hostId });
  }
  broadcastRoom(room);
}

io.on('connection', socket => {
  socket.data.room = null;

  socket.on('time', cb => { if (typeof cb === 'function') cb(Date.now()); });

  socket.on('room:create', (profile, cb) => {
    if (typeof cb !== 'function') return;
    leaveRoom(socket);
    const code = makeCode();
    const room = { code, hostId: socket.id, players: new Map(), started: false, seed: 0 };
    room.players.set(socket.id, { id: socket.id, profile: sanitizeProfile(profile), joinedAt: Date.now() });
    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    cb({ ok: true, room: roomInfo(room), you: socket.id });
    broadcastRoom(room);
  });

  socket.on('room:join', (code, profile, cb) => {
    if (typeof cb !== 'function') return;
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: 'Room not found.' });
    if (room.started) return cb({ ok: false, error: 'That game has already started.' });
    if (room.players.size >= MAX_PLAYERS) return cb({ ok: false, error: 'Room is full.' });
    leaveRoom(socket);
    room.players.set(socket.id, { id: socket.id, profile: sanitizeProfile(profile), joinedAt: Date.now() });
    socket.join(code);
    socket.data.room = code;
    cb({ ok: true, room: roomInfo(room), you: socket.id });
    socket.to(code).emit('peer:joined', { id: socket.id });
    broadcastRoom(room);
  });

  socket.on('room:leave', () => leaveRoom(socket));

  socket.on('room:profile', profile => {
    const room = rooms.get(socket.data.room);
    const p = room?.players.get(socket.id);
    if (!p) return;
    p.profile = sanitizeProfile(profile);
    broadcastRoom(room);
  });

  // Host starts (or restarts) the session. Everyone gets the same seed and a
  // shared start time so the intro cinematic begins simultaneously.
  socket.on('room:start', () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id) return;
    room.started = true;
    room.seed = Math.floor(Math.random() * 2 ** 31);
    io.to(room.code).emit('game:start', { seed: room.seed, startAt: Date.now() + 2500, room: roomInfo(room) });
  });

  socket.on('room:lobby', () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.hostId !== socket.id) return;
    room.started = false;
    io.to(room.code).emit('game:lobby');
    broadcastRoom(room);
  });

  // Generic game relay. `to` targets a single peer, otherwise everyone else in the room.
  socket.on('relay', msg => {
    const code = socket.data.room;
    if (!code || !msg || typeof msg.t !== 'string') return;
    const out = { from: socket.id, t: msg.t, d: msg.d };
    if (msg.to) io.to(msg.to).emit('relay', out);
    else socket.to(code).emit('relay', out);
  });
  // Unreliable high-frequency updates (positions, Ajan snapshots).
  socket.on('vrelay', msg => {
    const code = socket.data.room;
    if (!code || !msg || typeof msg.t !== 'string') return;
    socket.volatile.to(code).emit('relay', { from: socket.id, t: msg.t, d: msg.d });
  });

  // WebRTC signalling for voice chat.
  socket.on('rtc', msg => {
    const code = socket.data.room;
    if (!code || !msg?.to) return;
    const room = rooms.get(code);
    if (!room?.players.has(msg.to)) return;
    io.to(msg.to).emit('rtc', { from: socket.id, data: msg.data });
  });

  socket.on('disconnect', reason => {
    if (socket.data.room) console.log(`[${socket.data.room}] ${socket.id} disconnected: ${reason}`);
    leaveRoom(socket);
  });
});

server.listen(PORT, () => console.log(`AJAN server listening on :${PORT}`));
