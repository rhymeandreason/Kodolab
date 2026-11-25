/* Classic kit/ scripts inside a lab, on the lab's three.js.
 *
 *   await loadClassic(['../lib/palette.js', '../cell-division/core.js', …]);   // relative to lab/
 *
 * The kit stack reads a global THREE. This sets it to the lab's own module before loading the
 * scripts in order, so a kit scene builds objects from the same three.js the lab renders with:
 * one copy, one revision, the same one lib/three.r186.min.js gives a classic page. A script that
 * adds to THREE cannot run here, since a module namespace is frozen, and THREE.OrbitControls is
 * the classic bundle's alone; take controls from zoom.js instead.
 */
import * as THREE from 'three';

export function loadClassic(srcs) {
  const prev = globalThis.THREE;
  if (prev && prev !== THREE) console.warn(`kit.js: replacing a global THREE r${prev.REVISION} with the lab's r${THREE.REVISION}`);
  globalThis.THREE = THREE;
  return srcs.reduce((p, src) => p.then(() => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL(src, import.meta.url).href;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`kit.js: could not load ${src}`));
    document.head.appendChild(s);
  })), Promise.resolve());
}
