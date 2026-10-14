// App controller: screens and flow (splash → mic setup → WHO ARE YOU? → menu →
// single-player / multiplayer lobby → intro → game → escape/death → end).
import * as THREE from 'three';
import { discoverAssets, assetState, assetUrl, loadGLTF } from './assets.js';
import { audio } from './audio.js';
import { settings, setSetting, profile, saveProfile, onSettingChange } from './settings.js';
import { mic } from './voice.js';
import { CHARACTERS, charById, DIFFICULTY } from './config.js';
import { LocalNet, SocketNet } from './net.js';
import { Game } from './game.js';
import { Avatar } from './avatar.js';
import { randomColor, sanitizeName, escapeHtml } from './util.js';

const $ = id => document.getElementById(id);
const SCREENS = ['splash', 'menu', 'micSetup', 'charSelect', 'mpScreen', 'settingsScreen', 'quitScreen', 'loading', 'cinema', 'pause', 'endScreen'];

class App {
  constructor() {
    this.game = null;
    this.paused = false;
    this.cinemaPlaying = false;
    this.mpNet = null;
    this.last = performance.now();
    this.menuStart = performance.now();
  }

  // ------------------------------------------------------------- screens
  show(id, keep = []) {
    for (const s of SCREENS) if (s !== id && !keep.includes(s)) $(s).classList.remove('show');
    if (id) $(id).classList.add('show');
    this.current = id;
  }

  toast(text, ms = 3500) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  displayName(p = profile) {
    return p.character === 'NONE' ? (p.name || 'STRANGER') : charById(p.character).label;
  }
  netProfile() {
    return { character: profile.character, name: this.displayName(), shirt: profile.shirt, pants: profile.pants };
  }

  // ---------------------------------------------------------------- boot
  async boot() {
    await discoverAssets();
    if (assetState.missing.length) {
      const w = $('assetWarn');
      w.innerHTML = `<b>Missing assets</b> (fallbacks in use):<br>${assetState.missing.map(escapeHtml).join(', ')}`;
      w.classList.remove('hidden');
      setTimeout(() => w.classList.add('hidden'), 12000);
    }
    $('splashBtn').onclick = () => this.enter();
    this.bindMenu();
    this.bindMicSetup();
    this.bindCharSelect();
    this.bindMultiplayer();
    this.bindSettings();
    this.bindPauseEnd();
    requestAnimationFrame(t => this.frame(t));
  }

  async enter() {
    $('splashBtn').disabled = true;
    $('splashStatus').textContent = 'Loading sounds…';
    audio.init();
    audio.resume();
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(innerWidth, innerHeight);
    $('gameRoot').appendChild(this.renderer.domElement);
    await audio.loadAll(['ajan', 'ajandie', 'ajanescape', 'max', 'masked', 'rize', 'lucky', 'mido', 'music1', 'music2', 'musicchase', 'sleep', 'noise']);
    // creaky floorboards use noise.mp3 (the synthesized creak stays as a fallback)
    if (audio.buffers.noise) audio.buffers.boardCreak = audio.buffers.noise;
    loadGLTF('objectModel');
    loadGLTF('carModel');
    loadGLTF('playerModel');
    loadGLTF('ajanModel');
    if (!settings.micConfigured) this.openMicSetup(() => this.openCharSelect(() => this.openMenu()));
    else {
      if (settings.micId !== 'none') mic.open(settings.micId).catch(() => {});
      if (!profile.character) this.openCharSelect(() => this.openMenu());
      else this.openMenu();
    }
  }

  // ---------------------------------------------------------------- menu
  bindMenu() {
    document.querySelectorAll('.mbtn').forEach(b => {
      b.addEventListener('mouseenter', () => audio.play('pickup', { vol: 0.12, rate: 0.6 + Math.random() * 0.2 }));
      b.addEventListener('click', () => {
        audio.play('clunk', { vol: 0.35 });
        const act = b.dataset.act;
        if (act === 'play') this.startSingle();
        else if (act === 'multiplayer') this.openMultiplayer();
        else if (act === 'settings') this.openSettings(() => this.openMenu());
        else if (act === 'quit') { this.stopMenuVideo(); this.show('quitScreen'); try { window.close(); } catch { /* ignore */ } }
      });
    });
    $('changeChar').onclick = e => { e.preventDefault(); this.openCharSelect(() => this.openMenu()); };
    $('quitBack').onclick = () => this.openMenu();
  }

  openMenu() {
    audio.setMusic('off'); // the menu's only music is the video's own soundtrack
    this.show('menu');
    $('menuName').textContent = this.displayName();
    const v = $('menuVideo');
    const url = assetUrl('menuVideo');
    if (url && !v.src.endsWith(url)) v.src = url;
    v.muted = false;
    v.volume = Math.min(1, settings.master * Math.max(0.05, settings.music) * 2);
    if (url) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }
  stopMenuVideo() { $('menuVideo').pause(); }

  // ------------------------------------------------------------ mic setup
  bindMicSetup() {
    $('micAllow').onclick = async () => {
      await mic.open('');
      if (!mic.stream) { $('micError').textContent = mic.error || 'Could not open a microphone.'; return; }
      await this.fillMicSelect($('micSelect'));
      $('micNeedPerm').classList.add('hidden');
      $('micControls').classList.remove('hidden');
      $('micConfirm').disabled = false;
      $('micError').textContent = '';
    };
    $('micSelect').onchange = async e => { await mic.open(e.target.value); };
    $('micSens').value = settings.micSensitivity;
    $('micSens').oninput = e => setSetting('micSensitivity', +e.target.value);
    $('micMonitor').onchange = e => mic.setMonitor(e.target.checked);
    $('micConfirm').onclick = () => {
      mic.setMonitor(false);
      $('micMonitor').checked = false;
      setSetting('micId', mic.deviceId || '');
      setSetting('micConfigured', true);
      this.micDone?.();
    };
    $('micSkip').onclick = () => {
      mic.setMonitor(false);
      mic.close();
      setSetting('micId', 'none');
      setSetting('micConfigured', true);
      this.micDone?.();
    };
  }

  openMicSetup(done) {
    this.micDone = done;
    if (!mic.supported) $('micError').textContent = 'This browser does not support microphone capture. You can still play.';
    this.show('micSetup');
  }

  async fillMicSelect(sel) {
    const devs = await mic.listDevices();
    sel.innerHTML = '';
    const none = document.createElement('option');
    none.value = 'none';
    none.textContent = '— no microphone —';
    if (sel.id === 'setMic') sel.appendChild(none);
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `Microphone ${i + 1}`;
      sel.appendChild(o);
    });
    sel.value = mic.stream ? (mic.deviceId || devs[0]?.deviceId || '') : (sel.id === 'setMic' ? 'none' : '');
    if (sel.selectedIndex < 0 && sel.options.length) sel.selectedIndex = sel.id === 'setMic' && sel.options.length > 1 ? 1 : 0;
  }

  updateMeters() {
    for (const id of ['micOut', 'setOut']) { const el = $(id); if (el?.offsetParent) el.style.width = (mic.outLevel * 100).toFixed(1) + '%'; }
    document.querySelectorAll('[data-pct]').forEach(el => { const v = Math.round((settings[el.dataset.pct] ?? 1) * 100) + '%'; if (el.textContent !== v) el.textContent = v; });
    const lvl = mic.level;
    const thr = mic.threshold();
    for (const [m, t, s] of [['micMeter', 'micThreshold', 'micSpeaking'], ['setMeter', 'setThreshold', 'setSpeaking']]) {
      const el = $(m);
      if (!el.offsetParent) continue;
      el.style.width = (lvl * 100).toFixed(1) + '%';
      $(t).style.left = (thr * 100).toFixed(1) + '%';
      $(s).classList.toggle('on', mic.speaking);
    }
  }

  // -------------------------------------------------------- character select
  bindCharSelect() {
    const grid = $('charGrid');
    CHARACTERS.forEach(c => {
      const b = document.createElement('button');
      b.className = 'charBtn' + (c.id === 'NONE' ? ' none' : '');
      b.textContent = c.label;
      b.dataset.id = c.id;
      b.onclick = () => this.pickChar(c.id);
      b.onmouseenter = () => audio.play('pickup', { vol: 0.1, rate: 0.7 });
      grid.appendChild(b);
    });
    $('randomColors').onclick = () => {
      this.draft.shirt = randomColor();
      this.draft.pants = randomColor();
      this.refreshPreview();
      audio.play('drawer', { vol: 0.3, rate: 1.6 });
    };
    $('nameInput').oninput = () => this.validateChar();
    $('charConfirm').onclick = () => {
      if (!this.validateChar()) return;
      const d = this.draft;
      saveProfile({ character: d.character, name: d.character === 'NONE' ? sanitizeName($('nameInput').value) : '', shirt: d.shirt, pants: d.pants });
      this.mpNet?.room && this.mpNet.updateProfile(this.netProfile());
      audio.play('clunk', { vol: 0.4 });
      this.closePreview();
      this.charDone?.();
    };
  }

  openCharSelect(done) {
    this.charDone = done;
    this.stopMenuVideo();
    const base = charById(profile.character || 'MAX');
    this.draft = {
      character: profile.character || '',
      shirt: profile.shirt || base.shirt,
      pants: profile.pants || base.pants,
    };
    $('nameInput').value = profile.name || '';
    this.show('charSelect');
    this.pickChar(this.draft.character, true);
    this.openPreview();
  }

  pickChar(id, silent) {
    this.draft.character = id;
    document.querySelectorAll('.charBtn').forEach(b => b.classList.toggle('sel', b.dataset.id === id));
    $('nameBox').classList.toggle('hidden', id !== 'NONE');
    if (id === 'NONE' && !silent) setTimeout(() => $('nameInput').focus(), 50);
    if (!silent && id && !profile.shirt && this.draft.colorsDefault !== false) {
      const c = charById(id);
      this.draft.shirt = c.shirt;
      this.draft.pants = c.pants;
    }
    this.validateChar();
    this.refreshPreview();
    if (!silent) audio.play('clunk', { vol: 0.25, rate: 1.3 });
  }

  validateChar() {
    const d = this.draft;
    let ok = !!d.character;
    if (d.character === 'NONE') {
      const raw = $('nameInput').value;
      const clean = sanitizeName(raw);
      if (!clean) { ok = false; $('nameError').textContent = raw ? 'That name has no usable characters.' : ''; }
      else if (clean !== raw.trim()) $('nameError').textContent = `Will appear as "${clean}"`;
      else $('nameError').textContent = '';
    }
    $('charConfirm').disabled = !ok;
    return ok;
  }

  async openPreview() {
    if (!this.prev) {
      const canvas = $('charPreview');
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xc0c8ff, 0x201010, 1.4));
      const key = new THREE.SpotLight(0xffd0a0, 60, 12, 0.6, 0.6, 1.5);
      key.position.set(1.5, 3.5, 3);
      scene.add(key);
      const rim = new THREE.PointLight(0xff2010, 10, 6);
      rim.position.set(-1.5, 1.5, -1.5);
      scene.add(rim);
      const cam = new THREE.PerspectiveCamera(30, 3 / 4, 0.1, 20);
      cam.position.set(0, 1.15, 4.3);
      cam.lookAt(0, 0.9, 0);
      const g = await loadGLTF('playerModel');
      const av = new Avatar('player', g, { shirt: this.draft.shirt, pants: this.draft.pants });
      scene.add(av.group);
      this.prev = { r, scene, cam, av, t: 0 };
    }
    this.prev.active = true;
    this.refreshPreview();
  }
  closePreview() { if (this.prev) this.prev.active = false; }

  refreshPreview() {
    $('swShirt').style.background = this.draft.shirt;
    $('swPants').style.background = this.draft.pants;
    if (this.prev) this.prev.av.setColors(this.draft.shirt, this.draft.pants);
  }

  renderPreview(dt) {
    const p = this.prev;
    if (!p?.active) return;
    const c = $('charPreview');
    const w = c.clientWidth, h = c.clientHeight;
    if (w && (c.width !== w || c.height !== h)) { p.r.setSize(w, h, false); p.cam.aspect = w / h; p.cam.updateProjectionMatrix(); }
    p.t += dt;
    p.av.group.rotation.y = Math.sin(p.t * 0.5) * 0.6;
    p.av.update(dt, { speed: 0, crouch: 0, mode: 'normal', interactT: 9, turn: 0, flash: false, pitch: 0 });
    p.r.render(p.scene, p.cam);
  }

  // --------------------------------------------------------- multiplayer
  bindMultiplayer() {
    $('mpCreate').onclick = async () => {
      $('mpError').textContent = '';
      try {
        await this.ensureNet();
        const r = await this.mpNet.createRoom(this.netProfile());
        if (!r.ok) throw new Error(r.error);
        this.showLobby();
      } catch (e) { $('mpError').textContent = e.message; }
    };
    $('mpJoin').onclick = async () => {
      $('mpError').textContent = '';
      const code = $('mpCode').value.trim().toUpperCase();
      if (code.length < 5) { $('mpError').textContent = 'Enter the 5-character room code.'; return; }
      try {
        await this.ensureNet();
        const r = await this.mpNet.joinRoom(code, this.netProfile());
        if (!r.ok) throw new Error(r.error);
        this.showLobby();
      } catch (e) { $('mpError').textContent = e.message; }
    };
    $('mpCode').onkeydown = e => { if (e.key === 'Enter') $('mpJoin').click(); };
    $('mpLeave').onclick = () => { this.mpNet?.leaveRoom(); this.showConnect(); };
    $('mpBack').onclick = () => { this.mpNet?.leaveRoom(); this.openMenu(); };
    $('mpStart').onclick = () => this.mpNet?.startGame(settings.difficulty);
    $('mpDiff').onchange = e => { setSetting('difficulty', e.target.value); this.mpNet?.setDifficulty(e.target.value); };
    $('mpCopy').onclick = () => { navigator.clipboard?.writeText(this.mpNet?.room?.code || ''); this.toast('Room code copied.'); };
  }

  async ensureNet() {
    if (!this.mpNet) {
      this.mpNet = new SocketNet();
      this.mpNet.on('room', () => this.renderLobby());
      this.mpNet.on('gameStart', m => this.launchMultiplayer(m));
      this.mpNet.on('disconnected', () => {
        if (this.game?.net === this.mpNet) { this.toast('Disconnected from the server.'); this.leaveGame(); }
        else if (this.current === 'mpScreen') { $('mpError').textContent = 'Disconnected from the server.'; this.showConnect(); }
      });
    }
    await this.mpNet.connect();
  }

  openMultiplayer() {
    this.stopMenuVideo();
    this.show('mpScreen');
    if (this.mpNet?.room) this.showLobby(); else this.showConnect();
  }
  showConnect() {
    $('mpConnect').classList.remove('hidden');
    $('mpLobby').classList.add('hidden');
  }
  showLobby() {
    $('mpConnect').classList.add('hidden');
    $('mpLobby').classList.remove('hidden');
    this.renderLobby();
  }
  renderLobby() {
    const room = this.mpNet?.room;
    if (!room) return;
    $('mpRoomCode').textContent = room.code;
    $('mpPlayers').innerHTML = room.players.map(p => `<li><span class="sw"><i style="background:${p.shirt}"></i><i style="background:${p.pants}"></i></span>${escapeHtml(p.name)}${p.id === this.mpNet.id ? ' <span class="dim">(you)</span>' : ''}<span class="tagx ${p.id === room.hostId ? 'host' : ''}">${p.id === room.hostId ? 'HOST' : ''}</span></li>`).join('');
    const host = room.hostId === this.mpNet.id;
    $('mpStart').disabled = !host;
    $('mpStart').classList.toggle('hidden', !host);
    $('mpDiff').value = settings.difficulty;
    if (host && room.difficulty !== settings.difficulty) this.mpNet.setDifficulty(settings.difficulty);
    $('mpDiff').classList.toggle('hidden', !host);
    $('mpDiffText').textContent = host ? '' : (DIFFICULTY[room.difficulty]?.label || 'MEDIUM');
    $('mpWaiting').textContent = host ? 'Share the code. Start when everyone is in — the game is also fully playable alone.' : 'Waiting for the host to start…';
  }

  // ---------------------------------------------------------- game start
  startSingle(freePlay = false) {
    const net = new LocalNet();
    this.launchGame({ net, seed: Math.floor(Math.random() * 2 ** 31), players: [{ id: 'local', ...this.netProfile() }], startAt: Date.now(), freePlay, difficulty: settings.difficulty });
  }

  launchMultiplayer(m) {
    this.launchGame({ net: this.mpNet, seed: m.seed, players: m.room.players, startAt: m.startAt, difficulty: m.difficulty });
  }

  async launchGame(opts) {
    if (this.game) this.disposeGame();
    this.stopMenuVideo();
    this.closePreview();
    this.paused = false;
    audio.setMusic('off');
    this.show('loading');
    $('loadBar').style.width = '0%';
    const game = new Game(this, opts);
    this.game = game;
    try {
      await game.init((p, text) => { $('loadBar').style.width = (p * 100).toFixed(0) + '%'; $('loadText').textContent = text.toUpperCase(); });
    } catch (e) {
      console.error(e);
      this.toast('Failed to start: ' + e.message, 6000);
      this.disposeGame();
      this.openMenu();
      return;
    }
    if (this.game !== game) return;
    await this.playIntro(opts.net, opts.startAt, !opts.net.online);
    if (this.game !== game) return;
    this.show(null);
    game.begin();
  }

  // ----------------------------------------------------------- cinematics
  playVideo(key, { startAt = null, net = null, skippable = false, onTime = null, fallbackText = '' } = {}) {
    return new Promise(resolve => {
      const v = $('cinemaVideo');
      const fb = $('cinemaFallback');
      const url = assetUrl(key);
      this.cinemaPlaying = true;
      this.show('cinema');
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        v.pause();
        v.onended = v.onerror = v.ontimeupdate = null;
        removeEventListener('keydown', skip);
        fb.classList.remove('show');
        this.cinemaPlaying = false;
        resolve();
      };
      const skip = e => { if (skippable && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) finish(); };
      addEventListener('keydown', skip);
      if (!url) {
        fb.textContent = fallbackText || '…';
        fb.classList.add('show');
        setTimeout(finish, 4500);
        return;
      }
      v.src = url;
      v.volume = Math.min(1, settings.master);
      v.muted = false;
      v.onended = finish;
      v.onerror = () => { fb.textContent = fallbackText; fb.classList.add('show'); setTimeout(finish, 3500); };
      if (onTime) {
        const tick = () => { if (done) return; onTime(v.currentTime); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }
      const go = () => {
        if (startAt && net) {
          const late = (net.serverNow() - startAt) / 1000;
          if (late > 0.2) { try { v.currentTime = Math.min(late, Math.max(0, (v.duration || 99) - 0.3)); } catch { /* not seekable yet */ } }
        }
        v.play().catch(() => { v.muted = true; v.play().catch(finish); });
      };
      const wait = startAt && net ? Math.max(0, startAt - net.serverNow()) : 0;
      if (wait > 0) {
        $('cinemaFallback').textContent = '';
        setTimeout(go, wait);
      } else go();
      // Safety net if the video stalls
      setTimeout(() => { if (!done && (v.paused || v.readyState < 2)) finish(); }, 30000);
    });
  }

  playIntro(net, startAt, skippable) {
    audio.setMusic('off');
    return this.playVideo('introVideo', { startAt: net.online ? startAt : null, net, skippable, fallbackText: 'OCTOBER 13, 1996.\nTHE HOUSE AT THE END OF THE ROAD.' });
  }

  playEscape(onDone) {
    audio.setMusic('off');
    document.exitPointerLock?.();
    let fired = false;
    $('hud').classList.remove('show');
    this.playVideo('escapeVideo', {
      fallbackText: 'YOU GOT OUT.',
      onTime: t => { if (!fired && t >= 5) { fired = true; audio.play('ajanescape', { vol: 1 }); } },
    }).then(() => {
      if (!fired) audio.play('ajanescape', { vol: 1 });
      if (this.game && !this.game.endShown) { $('hud').classList.add('show'); this.show(null); }
      onDone?.();
    });
  }

  // ------------------------------------------------------------ settings
  bindSettings() {
    document.querySelectorAll('[data-set]').forEach(el => {
      const k = el.dataset.set;
      const sync = () => { if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = settings[k]; };
      sync();
      onSettingChange(key => { if (key === k) sync(); });
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
        const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
        setSetting(k, v);
        if (k === 'micMuted') mic.applyMute();
        if (k === 'quality' || k === 'vhs') this.game?.applyGraphics();
        if (k === 'master' || k === 'music') $('menuVideo').volume = Math.min(1, settings.master * Math.max(0.05, settings.music) * 2);
        this.game?.updateHUD();
      });
    });
    $('setMic').onchange = async e => {
      const id = e.target.value;
      if (id === 'none') { mic.close(); setSetting('micId', 'none'); }
      else { await mic.open(id); setSetting('micId', mic.deviceId || id); }
      this.game?.updateHUD();
    };
    $('setMonitor').onchange = e => mic.setMonitor(e.target.checked);
    $('setFullscreen').onchange = e => {
      if (e.target.checked) document.documentElement.requestFullscreen?.().catch(() => { e.target.checked = false; });
      else if (document.fullscreenElement) document.exitFullscreen?.();
    };
    document.addEventListener('fullscreenchange', () => { $('setFullscreen').checked = !!document.fullscreenElement; });
    $('settingsBack').onclick = () => {
      mic.setMonitor(false);
      $('setMonitor').checked = false;
      this.settingsDone?.();
    };
    $('settingsFreePlay').onclick = () => {
      if (this.game) return;
      mic.setMonitor(false);
      $('setMonitor').checked = false;
      this.startSingle(true);
    };
    $('setChangeChar').onclick = () => {
      if (this.game) { this.toast('Change your character from the main menu.'); return; }
      this.openCharSelect(() => this.openSettings(this.settingsDone));
    };
  }

  async openSettings(done) {
    this.settingsDone = done;
    this.show('settingsScreen', this.game ? ['pause'] : []);
    $('freePlayRow').classList.toggle('hidden', !!this.game);
    if (!this.game) this.stopMenuVideo();
    if (settings.micId !== 'none' && !mic.stream) await mic.open(settings.micId);
    await this.fillMicSelect($('setMic'));
  }

  // --------------------------------------------------------- pause / end
  bindPauseEnd() {
    addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.game && this.current === 'pause') this.pause(false);
    });
    $('pauseResume').onclick = () => this.pause(false);
    $('pauseSettings').onclick = () => this.openSettings(() => this.show('pause'));
    $('pauseLeave').onclick = () => this.leaveGame();
    $('endMenu').onclick = () => this.leaveGame();
    $('endRestart').onclick = () => {
      if (!this.game) return;
      if (this.game.single) this.startSingle(this.game.freePlay);
      else if (this.mpNet?.isHost) this.mpNet.startGame();
    };
  }

  pause(on) {
    if (!this.game || this.game.phase !== 'play') return;
    if (on) {
      this.paused = true;
      this.game.local.keys.clear();
      $('pauseHint').textContent = this.game.single ? 'The game is paused.' : 'Multiplayer keeps running — you are still in the house!';
      this.show('pause');
    } else {
      this.paused = false;
      this.show(null);
      this.game.lockPointer();
    }
  }

  showEnd(results, game) {
    const me = results.find(r => r.id === game.localId);
    let title;
    if (game.single) title = me?.escaped ? 'YOU ESCAPED' : 'YOU WERE EATEN';
    else if (results.every(r => !r.escaped)) title = 'GAME OVER';
    else title = me?.escaped ? 'YOU ESCAPED' : 'THE NIGHT IS OVER';
    $('endTitle').textContent = title;
    $('endTitle').dataset.text = title;
    $('endResults').innerHTML = results.map(r => `<li>${escapeHtml(r.name)}<span class="tagx ${r.escaped ? 'ok' : 'dead'}">${r.escaped ? 'ESCAPED' : 'EATEN'}</span></li>`).join('');
    const canRestart = game.single || this.mpNet?.isHost;
    $('endRestart').disabled = !canRestart;
    $('endHint').textContent = canRestart ? '' : 'Waiting for the host to restart…';
    this.show('endScreen');
  }

  disposeGame() {
    if (!this.game) return;
    this.game.dispose();
    this.game = null;
    audio.setMusic('off');
  }

  leaveGame() {
    const wasOnline = this.game?.net.online;
    this.disposeGame();
    this.paused = false;
    document.exitPointerLock?.();
    if (wasOnline) this.mpNet?.leaveRoom();
    this.openMenu();
  }

  // ---------------------------------------------------------------- loop
  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    mic.update(dt);
    this.updateMeters();
    if (this.current === 'menu') {
      const s = Math.floor((now - this.menuStart) / 1000);
      $('menuClock').textContent = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }
    this.renderPreview(dt);
    const g = this.game;
    if (g && g.phase !== 'loading') {
      if (!(this.paused && g.single) && !this.cinemaPlaying) g.update(dt);
      else if (this.cinemaPlaying && g.net.online) g.update(dt); // keep the world in sync during cinematics
      if (!this.cinemaPlaying) g.render();
    }
    requestAnimationFrame(t => this.frame(t));
  }
}

const app = new App();
// Debug/test hook: advance the simulation without rendering.
app.step = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) app.game?.update(dt); };
window.__ajan = app;
app.boot();
