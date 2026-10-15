// Mixamo FBX dances retargeted onto the procedural auto-rig (rig.js).
// Both skeletons stand in a T-pose facing +Z, so each Mixamo bone's world-space
// rotation away from its rest pose is copied onto the matching rig bone.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const MAP = {
  hips: 'Hips', spine: 'Spine', chest: 'Spine2', head: 'Head',
  upperL: 'LeftArm', foreL: 'LeftForeArm', upperR: 'RightArm', foreR: 'RightForeArm',
  thighL: 'LeftUpLeg', shinL: 'LeftLeg', thighR: 'RightUpLeg', shinR: 'RightLeg',
};
// parents first, so each bone's parent is already posed when it is solved
const ORDER = ['hips', 'spine', 'chest', 'head', 'upperL', 'foreL', 'upperR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR'];

const cache = new Map();
/** Load an FBX dance once (resolves to null if the file is missing or broken). */
export function loadDance(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise(resolve => new FBXLoader().load(url, obj => resolve(obj.animations?.length ? obj : null), undefined, err => { console.warn('FBX failed', url, err); resolve(null); })));
  }
  return cache.get(url);
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

/** Plays one FBX clip and poses an Avatar's rig bones to match it. */
export class DancePlayer {
  constructor(fbx, avatar, { maxDrift = 0.4 } = {}) {
    this.src = cloneSkeleton(fbx);
    this.clip = fbx.animations[0];
    this.duration = this.clip.duration;
    this.av = avatar;
    this.maxDrift = maxDrift;
    const byName = {};
    this.src.traverse(o => { if (o.isBone) byName[o.name.replace(/^mixamorig\d*:?/, '')] = o; });
    this.sb = {};
    for (const [k, n] of Object.entries(MAP)) if (byName[n]) this.sb[k] = byName[n];
    // rest pose of the source (as loaded, before the clip plays) in its root frame
    this.src.updateMatrixWorld(true);
    this.restQ = {};
    for (const [k, b] of Object.entries(this.sb)) this.restQ[k] = b.getWorldQuaternion(new THREE.Quaternion());
    this.hipsRest = this.sb.hips ? this.sb.hips.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    this.hipsRestLocal = avatar.bones.hips.position.clone();
    this.mixer = new THREE.AnimationMixer(this.src);
    this.action = this.mixer.clipAction(this.clip);
    this.action.play();
  }

  /** Jump to a time in the clip (seconds; wraps). */
  seek(t) { this.mixer.setTime(((t % this.duration) + this.duration) % this.duration); }

  /** Pose the avatar for the clip's current time. */
  apply() {
    const av = this.av, B = av.bones;
    this.src.updateMatrixWorld(true);
    av.group.updateMatrixWorld(true);
    // the rig's rest orientation (all bones identity) is the mesh's world rotation
    const meshQ = av.mesh.getWorldQuaternion(new THREE.Quaternion());
    const solved = {};
    for (const k of ORDER) {
      const sb = this.sb[k], tb = B[k];
      if (!sb || !tb) continue;
      // delta = how far the source bone has turned from its rest, in its root frame
      const delta = sb.getWorldQuaternion(_q).multiply(_q2.copy(this.restQ[k]).invert());
      const want = new THREE.Quaternion().copy(meshQ).multiply(delta).multiply(_q2.copy(meshQ).invert()).multiply(meshQ);
      // world → local under the (already solved) parent
      const parentQ = solved[tb.parent?.name] || tb.parent.getWorldQuaternion(new THREE.Quaternion());
      tb.quaternion.copy(parentQ.clone().invert().multiply(want));
      solved[k] = want;
    }
    // hips travel (bounce, sway, drops), scaled to the avatar and kept near its spot
    if (this.sb.hips) {
      const h = this.sb.hips.getWorldPosition(_v).sub(this.hipsRest);
      const k = (av.spec.hipsY * av.height) / Math.max(1e-3, this.hipsRest.y);
      h.multiplyScalar(k);
      const lim = this.maxDrift;
      h.x = THREE.MathUtils.clamp(h.x, -lim, lim); h.z = THREE.MathUtils.clamp(h.z, -lim, lim);
      // group-space offset → hips' parent local space
      const parent = B.hips.parent;
      h.applyQuaternion(av.group.getWorldQuaternion(_q)).applyQuaternion(parent.getWorldQuaternion(_q2).invert());
      parent.getWorldScale(_s);
      B.hips.position.copy(this.hipsRestLocal).add(h.divide(_s));
    }
  }

  /** Advance by dt and pose. */
  update(dt) { this.mixer.update(dt); this.apply(); }
}
