import * as THREE from 'three';
import { CABINETS, canUseCabinet, cabinetDecision } from './arcade-state.js';

export class Arcade {
  constructor(game) {
    this.game=game; this.leases=new Map(); this.machines=new Map(); this.session=null; this.closedAt=-Infinity;
    this.group=new THREE.Group(); game.house.group.add(this.group);
    for (const c of CABINETS) this.build(c);
    this.onMessage=e=>{
      if(e.origin!==location.origin || e.source!==this.frame?.contentWindow || e.data?.type!=='ajan-arcade')return;
      if(e.data.action==='exit')this.leave(true);
      if(e.data.action==='ready' && this.session){this.session.ready=true;this.frame.contentWindow.focus();}
      if(e.data.action==='error'){game.toast('Arcade failed to start: '+String(e.data.message).slice(0,180),7000);this.leave(false);}
    };
    this.onKey=e=>{
      if(!this.session)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(e.type==='keydown'&&!e.repeat&&(e.code==='KeyE'||e.code==='Escape'))this.leave(true);
    };
    this.onHidden=()=>{if(document.hidden)this.leave(false);};
    addEventListener('message',this.onMessage);
    addEventListener('keydown',this.onKey,true); addEventListener('keyup',this.onKey,true);
    document.addEventListener('visibilitychange',this.onHidden);
    this.offDisconnect=game.net.on('disconnected',()=>this.leave(false,false));
  }
  get active(){return !!this.session;}
  get releasesPointer(){return this.active || performance.now()-this.closedAt<800;}
  build(c){
    const H=this.game.house,g=new THREE.Group();g.position.set(c.x,c.y,c.z);this.group.add(g);
    const shell=new THREE.MeshStandardMaterial({color:0x251b24,roughness:0.7});
    const box=(w,h,d,x,y,z,material=shell)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;};
    box(.95,1.95,.8,0,.975,0);box(1.02,.12,.35,0,1,.48);
    const cv=document.createElement('canvas');cv.width=320;cv.height=200;
    const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.generateMipmaps=false;
    const display=new THREE.Mesh(new THREE.PlaneGeometry(.8,.6),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));
    display.position.set(0,1.45,.405);g.add(display);
    box(.13,.04,.13,-.25,1.09,.5,new THREE.MeshStandardMaterial({color:0xc22a30}));
    box(.1,.04,.1,.23,1.09,.5,new THREE.MeshStandardMaterial({color:0xe8c35b}));
    const collider=H.collider(c.x-.475,c.z-.4,c.x+.475,c.z+.655,c.y,c.y+1.95,{furniture:true});
    const pick=H.pickBox(c.x-.5,c.y+.8,c.z+.4,c.x+.5,c.y+1.95,c.z+.67);
    H.register(c.id,'arcade',[pick],new THREE.Vector3(c.x,c.y+1.45,c.z+.65));
    this.machines.set(c.id,{cv,tex,collider});this.drawIdle(c.id);
  }
  drawIdle(id){
    const m=this.machines.get(id),ctx=m.cv.getContext('2d');ctx.fillStyle='#100b0c';ctx.fillRect(0,0,320,200);
    ctx.textAlign='center';ctx.fillStyle='#dd5649';ctx.font='bold 36px monospace';ctx.fillText('FREEDOOM',160,74);
    ctx.fillStyle='#ddd';ctx.font='16px monospace';ctx.fillText('PHASE 1',160,110);
    ctx.fillText(this.leases.has(id)?'IN USE':'E — PLAY',160,155);m.tex.needsUpdate=true;
  }
  prompt(it){if(it.kind==='arcade')return this.leases.has(it.id)?'ARCADE — IN USE':'E — PLAY FREEDOOM';return null;}
  interact(it){
    if(it.kind!=='arcade')return false;
    const G=this.game,L=G.local;
    if(G.phase!=='play'||G.app.paused||this.active||L.frozen||L.hidden||G.localDead||G.localEscaped||G.me?.dying)return true;
    if(this.leases.has(it.id)){G.toast('Someone is using this cabinet.');return true;}
    const token=crypto.randomUUID();this.session={id:it.id,token,started:performance.now(),ready:false};
    L.frozen=true;this.clearInput();
    // Mark arcade mode before the asynchronous pointerlockchange event arrives.
    if(document.pointerLockElement)document.exitPointerLock();
    G.request({k:'arcade',id:it.id,token,enter:true});return true;
  }
  clearInput(){const L=this.game.local;L.keys.clear();L.vel.set(0,0,0);L.lookDX=L.lookDY=0;L.speed=0;}
  request(pid,r,p){
    if(r.k!=='arcade')return false;
    const result=cabinetDecision(this.leases,pid,r,p);
    if(result)this.game.broadcast({k:'arcadeLease',...result});
    else if(r.enter)this.game.broadcast({k:'arcadeDenied',token:r.token},pid);
    return true;
  }
  event(e){
    if(e.k==='arcadeDenied'){if(this.session?.token===e.token){this.game.toast('Cabinet unavailable.');this.leave(false);}return true;}
    if(e.k!=='arcadeLease')return false;
    if(!this.machines.has(e.id))return true;
    if(e.pid)this.leases.set(e.id,{pid:e.pid,token:e.token});else this.leases.delete(e.id);
    this.drawIdle(e.id);
    if(e.pid===this.game.localId){
      if(this.session?.token===e.token && this.session.id===e.id)this.open();
      else this.game.request({k:'arcade',id:e.id,token:e.token,enter:false});
    }else if(this.session?.id===e.id)this.leave(false,false);
    return true;
  }
  open(){
    if(this.frame||!this.session)return;
    const overlay=this.overlay=document.createElement('div');
    Object.assign(overlay.style,{position:'fixed',inset:'3vh 5vw',zIndex:'1000',background:'#050505',border:'2px solid #744',boxShadow:'0 0 0 100vmax #0009'});
    const frame=this.frame=document.createElement('iframe');frame.title='Playable Freedoom arcade';frame.src='/arcade/';frame.allow='autoplay';
    Object.assign(frame.style,{width:'100%',height:'100%',border:'0'});overlay.append(frame);document.body.append(overlay);
  }
  leave(relock=false,notify=true){
    const s=this.session;if(!s)return;
    this.session=null;this.closedAt=performance.now();
    this.frame?.contentWindow?.stopArcade?.();
    this.frame?.remove();this.overlay?.remove();this.frame=null;this.overlay=null;
    this.clearInput();
    const G=this.game;
    // A death/capture sequence owns its own freeze; never undo it here.
    if(!G.localDead&&!G.localEscaped&&!G.me?.dying&&!G.me?.restrained&&!G.extras.restrained&&!G.kills.has(G.localId))G.local.frozen=false;
    if(notify&&!G.disposed)G.request({k:'arcade',id:s.id,token:s.token,enter:false});
    this.drawIdle(s.id);
    if(relock&&!G.disposed&&!G.localDead&&!G.localEscaped&&!G.me?.dying){G.canvas.focus();G.lockPointer();}
  }
  releasePeer(pid){
    if(!this.game.isHost)return;
    for(const [id,s] of this.leases)if(s.pid===pid)this.game.broadcast({k:'arcadeLease',id,pid:null,token:s.token});
  }
  update(dt){
    const G=this.game;
    if(G.isHost){for(const [id,s] of this.leases){const p=G.players.get(s.pid),c=CABINETS.find(c=>c.id===id);if(!canUseCabinet(p,c))this.releasePeer(s.pid);}}
    if(!this.session)return;
    if(G.phase!=='play'||G.localDead||G.localEscaped||G.me?.dying||G.me?.restrained||G.extras.restrained||G.kills.has(G.localId)){this.leave(false);return;}
    if(!this.session.ready&&performance.now()-this.session.started>60000){G.toast('Arcade loading timed out. Try again.');this.leave(false);return;}
    this.copyT=(this.copyT||0)-dt;
    if(this.session.ready&&this.copyT<=0){
      this.copyT=1/15;const source=this.frame?.contentDocument?.querySelector('canvas'),m=this.machines.get(this.session.id);
      if(source){m.cv.getContext('2d').drawImage(source,0,0,320,200);m.tex.needsUpdate=true;}
    }
  }
  dispose(){
    this.leave(false,false);this.offDisconnect?.();
    removeEventListener('message',this.onMessage);removeEventListener('keydown',this.onKey,true);removeEventListener('keyup',this.onKey,true);
    document.removeEventListener('visibilitychange',this.onHidden);
    for(const m of this.machines.values())m.tex.dispose();
    this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.group.removeFromParent();
  }
}
