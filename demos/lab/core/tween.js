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
 * ?speed=4 in the URL speeds every animation up (handy for testing).
 */
import { Ease, clamp } from './math.js';

const DEBUG_SPEED = Number(new URLSearchParams(location.search).get('speed')) || 1;
const tweens = new Set();
let instant = false;
let pausedAt = 0; // performance.now() when paused, 0 while running

export const debugSpeed = DEBUG_SPEED;
export const setInstant = (on) => { instant = !!on; };
export const isInstant = () => instant;

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
  if (instant || dur <= 0) { update(1, 1); return Promise.resolve(); }
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
