import * as THREE from 'three';
import { V2 } from './math.js';
import { makeCanvas, canvasTex } from './canvas.js';

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

/** Lathe from [[r, y], ...] pairs. */
export const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map((p) => (p.isVector2 ? p : V2(p[0], p[1]))), seg);

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Rounded box with its base at y = 0. */
export function rbox(w, h, d, r = 0.3) {
  const bs = Math.min(r * 0.6, w / 4, d / 4, h / 4);
  const shape = roundedRectShape(w - 2 * bs, d - 2 * bs, Math.max(0.02, r - bs));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: h - 2 * bs, bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 3, curveSegments: 8,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bs, 0);
  g.computeVertexNormals();
  return g;
}

/** A printed label wrapped on a (possibly tapered) cylinder, centred at angle `center` (0 = +z). */
export function wrapLabel({ rTop, rBot, y0, y1, arc, center = 0, w = 512, h = 256, draw, order = 5 }) {
  const c = makeCanvas(w, h); const g = c.getContext('2d');
  draw(g, w, h);
  const geo = new THREE.CylinderGeometry(rTop, rBot, y1 - y0, 48, 1, true, center - arc / 2, arc);
  const mat = new THREE.MeshStandardMaterial({
    map: canvasTex(c), transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const m = mesh(geo, mat, { cast: false });
  m.position.y = (y0 + y1) / 2;
  m.renderOrder = order;
  m.userData.noSketch = true;  // print on a surface: its rectangle is not a shape
  return m;
}

/** Free GPU memory for everything under `root`, skipping materials marked userData.shared. */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
    if (o.customDepthMaterial) o.customDepthMaterial.dispose();
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    mats.forEach((m) => {
      if (m.userData.shared) return;
      ['map', 'alphaMap', 'bumpMap', 'normalMap', 'roughnessMap'].forEach((k) => m[k] && m[k].dispose());
      m.dispose();
    });
  });
}
