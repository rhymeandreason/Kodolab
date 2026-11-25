/* Hand actions labs repeat: pour from a bottle, carry something over a container wall, drop a
 * used item in a bin, and micropipette (tip on, draw, dispense, eject). Each animates only with
 * core/tween.js and draws randomness only from core/random.js, so a timeline replay reproduces
 * it (AddingALab.md §4). Positions are world space; an object moved here should sit in the
 * bench root, or a parent with no transform.
 *
 *   await carry(tube, slotPos);                          // lift, carry level, lower
 *   pourPose(bottle.group, home, q0, bottle.anchors.spout, target, Z, -1.9, kMove, kTilt, 4);
 *   await dropIn(root, used, binFloor);                  // falls, tips over, stays
 *   await takeTip(pip, tipPos); await pipetteDraw(pip, { above, into, color });
 *   await pipetteDispense(pip, { above, into, onDispense: (e) => {...} }); await ejectTip(pip, root, over, binFloor);
 */
import * as THREE from 'three';
import { V3, lerp, clamp, smooth, Ease } from './core/math.js';
import { anim, moveTo } from './core/tween.js';
import { rand } from './core/random.js';

const _q = new THREE.Quaternion(), _p = new THREE.Vector3();

/** Pose a container tilted `angle·kTilt` about `axis` with its spout (local) on `target`,
 *  `kMove` of the way from `home` along an arc `arc` high. Drive kMove, then kTilt, from anim(). */
export function pourPose(obj, home, q0, spoutLocal, target, axis, angle, kMove, kTilt, arc = 0) {
  _q.setFromAxisAngle(axis, angle * kTilt).multiply(q0);
  _p.copy(spoutLocal).applyQuaternion(_q);
  obj.position.lerpVectors(home, target.clone().sub(_p), kMove);
  obj.position.y += Math.sin(Math.PI * kMove) * arc;
  obj.quaternion.copy(_q);
}

/** Lift straight up, carry level, lower straight down: clears the walls of whatever it leaves
 *  and enters. `obj` is a prop or an Object3D. */
export function carry(obj, to, dur = 1.4, clear = 7) {
  const o = obj.group || obj, a = o.position.clone(), b = to.clone(), top = Math.max(a.y, b.y) + clear;
  return anim(dur, (e, k) => {
    const h = smooth(clamp((k - 0.25) / 0.5));
    o.position.x = lerp(a.x, b.x, h); o.position.z = lerp(a.z, b.z, h);
    o.position.y = k < 0.5 ? lerp(a.y, top, smooth(clamp(k / 0.3))) : lerp(top, b.y, smooth(clamp((k - 0.7) / 0.3)));
  }, Ease.linear);
}

/** Drop `obj` (re-parented to `parent`, keeping where it is) onto `floor`, scattered within
 *  `spread` cm, tipping onto its side. It stays there. `within` (cm) is the radius of a container's
 *  floor: both ends of an object `len` cm long (its y axis) then land inside it, centred on `floor`. */
export function dropIn(parent, obj, floor, { dur = 0.45, spread = 0.9, tip = [1.1, 1.5], within, len = 0 } = {}) {
  parent.attach(obj);
  const a = obj.position.clone();
  const rz = rand(tip[0], tip[1]), ry = rand(0, Math.PI * 2);
  let x = floor.x + rand(-spread, spread), z = floor.z + rand(-spread, spread);
  if (within != null) {
    // The point sits at the origin and the far end reaches `reach` along (-cos ry, sin ry).
    const reach = len * Math.sin(rz), dx = -Math.cos(ry) * reach, dz = Math.sin(ry) * reach;
    const room = Math.max(0, within - reach / 2) * Math.random();     // slack to slide the pair off-centre
    const sa = rand(0, Math.PI * 2);
    x = floor.x - dx / 2 + Math.cos(sa) * room; z = floor.z - dz / 2 + Math.sin(sa) * room;
  }
  return anim(dur, (e) => {
    obj.position.set(lerp(a.x, x, e), lerp(a.y, floor.y, e), lerp(a.z, z, e));
    obj.rotation.set(0, ry, rz * e);
  }, Ease.in);
}

/* ---------- micropipetting (props/micropipette.js) ----------
 * The pipette's origin is its tip point, so every position below is where the point goes. */

/** Seat a fresh tip: down onto the tip at `tipPos` (its point), and back up. onSeat runs as it
 *  seats (empty that hole in the box there). */
export async function takeTip(pip, tipPos, { lift = 3.5, onSeat } = {}) {
  const g = pip.group;
  await moveTo(g, { pos: tipPos.clone().add(V3(0, lift, 0)), dur: 0.8, arc: 3 });
  await moveTo(g, { pos: tipPos, dur: 0.25 });
  pip.setTip(true);
  if (onSeat) onSeat();
  await moveTo(g, { pos: tipPos.clone().add(V3(0, lift + 0.5, 0)), dur: 0.25 });
}

/** Draw the set volume: plunger to the first stop above the liquid, point in at `into`, release
 *  while the tip fills, back out to `above`. onDraw(e) follows the fill (lower the source). */
export async function pipetteDraw(pip, { above, into, color, onDraw }) {
  const g = pip.group;
  await moveTo(g, { pos: above, dur: 0.6, arc: 2 });
  await anim(0.2, (e) => pip.setPlunger(0.75 * e));
  await moveTo(g, { pos: into, dur: 0.3 });
  await anim(0.4, (e) => { pip.setPlunger(0.75 * (1 - e)); pip.setFill(e, color); if (onDraw) onDraw(e); });
  await moveTo(g, { pos: above, dur: 0.3 });
}

/** Dispense: point to `into`, press to the first stop while the tip empties, on to the second
 *  stop for the last drop, out to `above`, and let the plunger up. onDispense(e) follows it. */
export async function pipetteDispense(pip, { above, into, onDispense }) {
  const g = pip.group;
  await moveTo(g, { pos: above, dur: 0.8, arc: 2 });
  await moveTo(g, { pos: into, dur: 0.3 });
  await anim(0.6, (e) => { pip.setPlunger(0.75 * e); pip.setFill(1 - e); if (onDispense) onDispense(e); });
  await anim(0.15, (e) => pip.setPlunger(0.75 + 0.25 * e));
  await moveTo(g, { pos: above, dur: 0.3 });
  anim(0.2, (e) => pip.setPlunger(1 - e));
}

/** Carry the pipette to `over` and eject its tip, which drops into the bin at `floor` and stays.
 *  `within` is the bin's floor radius, so the tip lies inside it. */
export async function ejectTip(pip, parent, over, floor, { within } = {}) {
  await moveTo(pip.group, { pos: over, dur: 0.7, arc: 2 });
  if (pip.setEject) await anim(0.15, (e) => pip.setEject(e));
  pip.group.updateMatrixWorld(true);
  const t = pip.tip.clone();
  pip.group.localToWorld(t.position.set(0, 0, 0));
  pip.setTip(false);
  parent.add(t);
  if (pip.setEject) anim(0.25, (e) => pip.setEject(1 - e));
  return dropIn(parent, t, floor, within == null ? {} : { within, len: pip.tipLen, tip: [0.7, 1.0] });
}
