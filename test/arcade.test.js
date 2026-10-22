import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { cabinetDecision, CABINETS, canUseCabinet } from '../public/js/arcade-state.js';
import { world } from './helpers/world.js';
import { collideCircle, segmentBlockers } from '../public/js/physics.js';
const player=c=>({alive:true,pos:{x:c.x,y:c.y,z:c.z+1.3}});
test('cabinet lease rejects contention, duplicate ownership and stale/foreign release',()=>{
 const leases=new Map(),c=CABINETS[0],p=player(c),r={id:c.id,token:'one',enter:true};
 const grant=cabinetDecision(leases,'a',r,p);assert.equal(grant.pid,'a');leases.set(c.id,grant);
 assert.equal(cabinetDecision(leases,'b',r,p),null);
 assert.equal(cabinetDecision(leases,'b',{...r,enter:false},p),null);
 assert.equal(cabinetDecision(leases,'a',{...r,enter:false,token:'old'},p),null);
 assert.equal(cabinetDecision(leases,'a',{id:CABINETS[1].id,token:'two',enter:true},player(CABINETS[1])),null);
 assert.equal(cabinetDecision(leases,'a',{...r,enter:false},p).pid,null);
});
test('cabinet authorization requires live unrestrained player at its front on the same floor',()=>{
 const c=CABINETS[0],p=player(c);assert.ok(canUseCabinet(p,c));
 for(const change of [{alive:false},{dying:true},{escaped:true},{restrained:true},{hideId:'seat'},{pos:{x:c.x,y:0,z:c.z+1}},{pos:{x:c.x,y:c.y,z:c.z-1}},{pos:{x:0,y:c.y,z:0}}])assert.equal(canUseCabinet({...p,...change},c),false);
 assert.equal(cabinetDecision(new Map(),'a',{id:'missing',token:'x',enter:true},p),null);
});
test('both cabinets have solid colliders and final navigation avoids their footprint',async()=>{
 const {game,house}=await world(true);
 for(const c of CABINETS){
  assert.equal(house.interactables.get(c.id).kind,'arcade');
  const col=game.extras.arcade.machines.get(c.id).collider;
  for(const who of ['player','ajan']){
   const p=new THREE.Vector3(c.x,c.y,c.z+.66);collideCircle(p,.42,1.8,[col],who);assert.ok(p.z>=c.z+.655+.419);
  }
  // Full-world collider clearance for both approach and side escape, including shed furnishings.
  assert.equal(segmentBlockers(c.x,c.z+1.25,c.x,c.z+2,c.y+.5,house.colliders,{pad:.3,occludeOnly:false,max:1}),0);
  for(const n of house.nav.nodes)for(const e of n.edges){const target=house.nav.byId[e.to];if(!target)continue;assert.equal(segmentBlockers(n.x,n.z,target.x,target.z,n.y+.5,[col],{pad:.42,occludeOnly:false,max:1}),0);}
 }
});
