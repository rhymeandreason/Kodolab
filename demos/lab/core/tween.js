/* Promise-based tweens.
 *
 *   await anim(0.8, (e, k) => { ... });   // e = eased progress, k = linear progress
 *   await moveTo(obj, { pos, quat, dur, arc });
 *
 * Instant mode (used while the lesson replays steps) makes every tween jump to
 * its end and resolve right away, so a whole procedure can be replayed in a
 * few milliseconds. clearTweens() drops everything in flight: actions awaiting
 * a dropped tween simply never resume.
 *
 * Measuring (inside instant mode) also runs a virtual clock, so a lesson can
 * learn how long a step plays without playing it: each tween starts at the
 * clock's time when called and pushes the clock to its end once it resolves.
 * Awaited one after another they add; started together (Promise.all) they
 * overlap and count once. A tween nobody awaits still counts to its end.
 *
 * ?speed=4 in the URL speeds every animation up (handy for testing).
 */
import { Ease, clamp } from './math.js';

const DEBUG_SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;
const tweens = new Set();
let instant = false;
let measuring = false, vnow = 0;
let pausedAt = 0; // performance.now() when paused, 0 while running

export const debugSpeed = DEBUG_SPEED;
export const setInstant = (on) => { instant = !!on; };
export const isInstant = () => instant;
/** Start (true) or stop measuring; measured() is the virtual seconds since the last start. */
export const setMeasuring = (on) => { measuring = !!on; vnow = 0; };
export const measured = () => vnow;

/** Freeze every tween in place (Watch mode's pause), then carry on from there. */
export function setPaused(on) {
  if (on && !pausedAt) pausedAt = performance.now();
  else if (!on && pausedAt) {
    const d = performance.now() - pausedAt;
    tweens.forEach((tw) => { tw.t0 += d; });
    pausedAt = 0;
  }
}
export const isPaused = () => pausedAt > 0;

export function anim(dur, update, ease = Ease.inOut) {
  dur /= DEBUG_SPEED;
  if (instant || dur <= 0) {
    update(1, 1);
    if (!measuring || dur <= 0) return Promise.resolve();
    const end = vnow + dur;
    return Promise.resolve().then(() => { if (end > vnow) vnow = end; });
  }
  return new Promise((resolve) => {
    tweens.add({ t0: pausedAt || performance.now(), dur: dur * 1000, update, ease, resolve });
  });
}

export function tickTweens(now) {
  if (pausedAt) return;
  for (const tw of Array.from(tweens)) {
    const k = clamp((now - tw.t0) / tw.dur, 0, 1);
    tw.update(tw.ease(k), k);
    if (k >= 1) { tweens.delete(tw); tw.resolve(); }
  }
}

export function clearTweens() { tweens.clear(); pausedAt = 0; }

export const wait = (s) => anim(s, () => {}, Ease.linear);

export function moveTo(obj, { pos, quat, dur = 1, arc = 0, ease = Ease.inOut }) {
  const p0 = obj.position.clone();
  const q0 = obj.quaternion.clone();
  return anim(dur, (e) => {
    if (pos) {
      obj.position.lerpVectors(p0, pos, e);
      if (arc) obj.position.y += Math.sin(Math.PI * e) * arc;
    }
    if (quat) obj.quaternion.copy(q0).slerp(quat, e);
  }, ease);
}
