/* Instruments that read a number off a sample. A top-loading balance.
 *
 *   const bal = makeBalance(mat);
 *   bal.show(61.4)            // grams on the display, to 0.1 g; show(null) reads 0.0
 *   bal.anchors.pan           // the top of the pan, local space: rest a sample at its y
 *
 * Origin: centre of the base. 16 × 20 cm, pan 4.3 cm above the bench. */
import * as THREE from 'three';
import { V3 } from '../core/math.js';
import { mesh, rbox } from '../core/geometry.js';
import { makeCanvas, canvasTex, FONT } from '../core/canvas.js';
import { toLinear } from '../materials.js';

export function makeBalance(mat, { color = toLinear('#e9edf2'), trim = toLinear('#3a4350') } = {}) {
  const g = new THREE.Group();
  const W = 16, D = 20, H = 3.4;
  g.add(mesh(rbox(W, H, D, 1.1), mat.make.solid(color, 0.45)));
  // the sloped display strip along the front
  const strip = mesh(new THREE.BoxGeometry(W - 1.6, 0.5, 3.6), mat.make.solid(trim, 0.5));
  strip.position.set(0, H + 0.05, D / 2 - 2.6); strip.rotation.x = 0.22;
  g.add(strip);
  const c = makeCanvas(512, 128), tex = canvasTex(c);
  const screen = mesh(new THREE.PlaneGeometry(7.2, 1.8), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), { cast: false });
  screen.position.set(-1.8, H + 0.32, D / 2 - 2.55); screen.rotation.x = -Math.PI / 2 + 0.22;
  screen.userData.noSketch = true;
  g.add(screen);
  [3.6, 5.6].forEach((x) => {
    const b = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 20), mat.make.solid(toLinear(x < 5 ? '#f08a4b' : '#cbd5e1'), 0.45));
    b.position.set(x, H + 0.42, D / 2 - 2.5); b.rotation.x = 0.22;
    g.add(b);
  });
  // a square steel pan floating on a dark support, behind the display; a round pan reads as a hot plate
  const post = mesh(rbox(9, 0.55, 9, 0.5), mat.charcoal);
  post.position.set(0, H - 0.05, -1.6);
  const pan = mesh(rbox(12, 0.35, 12, 0.6), mat.steel);
  pan.position.set(0, H + 0.5, -1.6);
  g.add(post, pan);

  let last = '';
  const api = {
    group: g, pan,
    anchors: { pan: V3(0, H + 0.9, -1.6) },
    show(grams) {
      const str = grams == null ? '0.0' : grams.toFixed(1);
      if (str === last) return;
      last = str;
      const x = c.getContext('2d');
      x.fillStyle = '#16211c'; x.fillRect(0, 0, 512, 128);
      x.fillStyle = grams == null ? '#5f7d6e' : '#8ef0b8';
      x.font = `600 92px 'JetBrains Mono', ui-monospace, monospace`;
      x.textAlign = 'right'; x.textBaseline = 'middle';
      x.fillText(str, 430, 68);
      x.font = `600 40px ${FONT}`; x.fillStyle = '#5f7d6e';
      x.fillText('g', 490, 74);
      tex.needsUpdate = true;
    },
  };
  api.show(null);
  return api;
}
