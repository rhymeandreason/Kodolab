/* Seeded randomness.
 *
 * Every random choice in a sim should go through rand()/gauss() so the lesson
 * can rebuild the bench and get the same result. The lesson reseeds before
 * each student action with (step, click number), so replaying the same clicks
 * reproduces the same disks, bubbles and outcomes.
 */

let base = (Math.random() * 2 ** 32) >>> 0;
let s = base;

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Next float in [0, 1). mulberry32. */
export function random() {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rand = (a = 0, b = 1) => a + random() * (b - a);

export function gauss() {
  let u = 0, v = 0;
  while (!u) u = random();
  while (!v) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Restart the stream from the session seed plus any keys, e.g. reseed(step, click). */
export function reseed(...keys) { s = hash(base + ':' + keys.join(':')); }

/** Pick a new session seed (a fresh lab run). */
export function newSession(seed = (Math.random() * 2 ** 32) >>> 0) { base = seed >>> 0; reseed(); }

/** A separate deterministic stream, for props whose look is fixed by a seed
 * (a strawberry's seed pattern, ice cubes). Doesn't touch the lesson's stream. */
export function seeded(seed = 1) {
  let t0 = seed >>> 0 || 1;
  return () => {
    t0 = (t0 + 0x6d2b79f5) >>> 0;
    let t = t0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
