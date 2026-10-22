// AJAN Freedoom browser adapter. GPL-2.0-or-later; see licenses/.
import createDoom from './doom.js';
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d', { alpha: false });
const status = document.querySelector('#status'), image = ctx.createImageData(320, 200);
const keys = new Map([['ArrowUp',173],['ArrowDown',175],['ArrowLeft',172],['ArrowRight',174],['KeyW',173],['KeyS',175],['KeyA',172],['KeyD',174],['ControlLeft',163],['ControlRight',163],['ShiftLeft',182],['ShiftRight',182],['AltLeft',184],['AltRight',184],['Space',162],['Enter',13],['Escape',27],['Backspace',127],['Tab',9]]);
const held = new Set();
// A click/key also resumes audio on browsers requiring a fresh gesture in the iframe.
const resumeAudio=()=>engine?.audioContext?.resume().catch(()=>{});
addEventListener('pointerdown',resumeAudio); addEventListener('keydown',resumeAudio);
let engine, running = true, timer;
function notify(type, extra={}) { if (parent !== window) parent.postMessage({type:'ajan-arcade', action:type, ...extra}, location.origin); }
function release() { for (const key of held) engine?._arcade_key(key,0); held.clear(); }
function shutdown() { running=false; clearTimeout(timer); release(); engine?.audioContext?.close().catch(()=>{}); }
window.stopArcade=shutdown;
function stop() { shutdown(); notify('exit'); }
document.querySelector('#exit').onclick=stop;
addEventListener('keydown',e=>{
  if (e.code==='KeyE') { e.preventDefault(); if (!e.repeat) stop(); return; }
  if (e.code==='Escape') { e.preventDefault(); if (!e.repeat) stop(); return; }
  let k=keys.get(e.code);
  if (k===undefined && /^Digit[1-7]$/.test(e.code)) k=e.code.charCodeAt(5);
  if (k===undefined) return;
  resumeAudio(); e.preventDefault(); e.stopImmediatePropagation();
  if (!held.has(k)) { held.add(k); engine?._arcade_key(k,1); }
},true);
addEventListener('keyup',e=>{ const k=keys.get(e.code) ?? (/^Digit[1-7]$/.test(e.code)?e.code.charCodeAt(5):undefined); if(k!==undefined){e.preventDefault();held.delete(k);engine?._arcade_key(k,0);} },true);
addEventListener('blur',release);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
addEventListener('pagehide',shutdown);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{
  e.preventDefault();
  const k=e.button===0?163:e.button===2?162:null; // left click fires, right click uses doors
  if(k!==null){engine?._arcade_key(k,1);held.add(k);}
});
addEventListener('mouseup',e=>{
  const k=e.button===0?163:e.button===2?162:null;
  if(k!==null){engine?._arcade_key(k,0);held.delete(k);}
});
async function start() {
  const response=await fetch('./freedoom1.wad'); if(!response.ok)throw Error('Freedoom data failed to load');
  const wad=new Uint8Array(await response.arrayBuffer());
  engine=await createDoom({noInitialRun:true, canvas, print:console.log, printErr:console.warn,
    onAbort:message=>{status.textContent='Engine error: '+message;notify('error',{message:String(message)});},
    onFrame(ptr){
      const bytes=engine.HEAPU8;
      for(let i=0;i<320*200;i++){const o=i*4;image.data[o]=bytes[ptr+o+2];image.data[o+1]=bytes[ptr+o+1];image.data[o+2]=bytes[ptr+o];image.data[o+3]=255;}
      ctx.putImageData(image,0,0);
    }
  });
  if(!running)return;
  engine.FS.writeFile('/freedoom1.wad',wad);
  engine.FS.writeFile('/arcade.cfg','vanilla_savegame_limit 0\nvanilla_demo_limit 0\n');
  engine.callMain(['-iwad','/freedoom1.wad','-config','/arcade.cfg','-extraconfig','/arcade.cfg','-warp','1','1','-skill','3','-nomusic']);
  engine.audioContext=engine.SDL2?.audioContext;
  window.arcadeEngine=engine;
  status.textContent='FREEDOOM — PHASE 1';
  canvas.focus(); engine.audioContext?.resume().catch(()=>{}); notify('ready');
  // Fixed single-tic scheduling avoids the original engine's busy waits and catch-up bursts.
  let next=performance.now();
  function tick(){if(!running)return;try{engine._arcade_tick();next+=1000/35;const now=performance.now();if(next<now-100)next=now;timer=setTimeout(tick,Math.max(0,next-now));}catch(e){running=false;status.textContent='Engine stopped: '+e.message;notify('error',{message:e.message});}}
  tick();
}
start().catch(e=>{status.textContent='Unable to start Freedoom: '+e.message;notify('error',{message:e.message});});
