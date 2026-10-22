// Host-authoritative cabinet leases. Kept independent of rendering for regression tests.
export const CABINETS = [
  { id: 'arcade_club', x: 13.6, y: 6.8, z: 8.65 },
  { id: 'arcade_shed', x: 34.8, y: 0, z: -12.65 },
];
export function canUseCabinet(p, c) {
  return !!(p && c && p.alive && !p.dying && !p.escaped && !p.restrained && !p.hideId &&
    Math.abs(p.pos.y-c.y)<0.65 && p.pos.z>c.z+0.4 &&
    Math.hypot(p.pos.x-c.x,p.pos.z-c.z)<2.2);
}
export function cabinetDecision(leases, pid, request, player) {
  const c=CABINETS.find(c=>c.id===request.id);
  if (!c || typeof request.token!=='string' || request.token.length>80 || !request.token) return null;
  const current=leases.get(c.id);
  if (!request.enter) return current?.pid===pid && current.token===request.token ? {id:c.id,pid:null,token:request.token} : null;
  if (current || [...leases.values()].some(s=>s.pid===pid) || !canUseCabinet(player,c)) return null;
  return {id:c.id,pid,token:request.token};
}
