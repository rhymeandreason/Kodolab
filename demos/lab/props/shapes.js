/* Building blocks for the botanical props (peas.js, flower.js, plants.js, garden.js): parametric
 * sheets, morph targets, merging, and caches so a bench of plants shares its geometry. */
import * as THREE from 'three';
import { V3, clamp, smooth } from '../core/math.js';
import { toLinear } from '../materials.js';

export const ss = (a, b, x) => smooth(clamp((x - a) / (b - a)));
export const lc = (hex) => new THREE.Color(toLinear(hex));
export const AX = V3(1, 0, 0), AY = V3(0, 1, 0);

const GEO = new Map();
/** A geometry built once for every prop (marked shared, so disposeTree keeps it). */
export function geoCache(key, make) {
  if (!GEO.has(key)) { const g = make(); g.userData.shared = true; GEO.set(key, g); }
  return GEO.get(key);
}
const MATS = new WeakMap();
/** A material built once per material set. */
export function matCache(mat, key, make) {
  let m = MATS.get(mat);
  if (!m) MATS.set(mat, (m = new Map()));
  if (!m.has(key)) { const x = make(); x.userData.shared = true; m.set(key, x); }
  return m.get(key);
}
const TEX = new Map();
/** Tag a material a setter changes later. ix.register gives each mesh its own copy (the tag
 *  rides along in userData), so a setter paints every copy now drawing under `root`. */
export function live(m) { m.userData.live = m.uuid; return m; }
export function paint(root, m, fn) {
  const id = m.userData.live, seen = new Set();
  root.traverse((o) => {
    const x = o.material;
    if (x && x.userData && x.userData.live === id && !seen.has(x)) { seen.add(x); fn(x); }
  });
}
export const texCache = (key, make) => { if (!TEX.has(key)) TEX.set(key, make()); return TEX.get(key); };

export const curve = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V3(...p))), false, 'centripetal');

/** An (nu × nv) grid: fn(u, v, out) places each vertex, uv = (u, v). Normals face ∂u × ∂v,
 *  or the other way with flip. */
export function sheet(nu, nv, fn, flip = false) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), uv = new Float32Array((nu + 1) * (nv + 1) * 2), idx = [], p = V3();
  for (let j = 0, k = 0; j <= nv; j++) for (let i = 0; i <= nu; i++, k++) {
    fn(i / nu, j / nv, p);
    pos.set([p.x, p.y, p.z], k * 3); uv.set([i / nu, j / nv], k * 2);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, d, b, a, c, d); else idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Average the normals of vertices that share a position (lathe and sphere seams). */
export function weld(g) {
  const p = g.attributes.position, n = g.attributes.normal, groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  }
  const s = V3();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    s.set(0, 0, 0);
    list.forEach((i) => { s.x += n.getX(i); s.y += n.getY(i); s.z += n.getZ(i); });
    s.normalize();
    list.forEach((i) => n.setXYZ(i, s.x, s.y, s.z));
  }
  return g;
}

/** Morph targets from shapes with the base's topology: absolute, or deltas from the previous
 *  shape when relative (then they stack: base + i0·(s1 − base) + i1·(s2 − s1)). */
export function addMorphs(base, shapes, relative = false) {
  base.morphTargetsRelative = relative;
  const P = [], N = [];
  shapes.forEach((s, k) => {
    const prev = k === 0 ? base : shapes[k - 1];
    const dp = s.attributes.position.array.slice(), dn = s.attributes.normal.array.slice();
    if (relative) {
      const pp = prev.attributes.position.array, pn = prev.attributes.normal.array;
      for (let i = 0; i < dp.length; i++) { dp[i] -= pp[i]; dn[i] -= pn[i]; }
    }
    P.push(new THREE.BufferAttribute(dp, 3)); N.push(new THREE.BufferAttribute(dn, 3));
  });
  base.morphAttributes.position = P;
  base.morphAttributes.normal = N;
  return base;
}

/** One geometry from several (indexed), keeping position, normal, uv, color and morph targets
 *  where every part has them. */
export function merge(parts) {
  const has = (a) => parts.every((g) => g.attributes[a]);
  const names = ['position', 'normal', 'uv', 'color'].filter(has);
  const nm = Math.min(...parts.map((g) => (g.morphAttributes.position || []).length));
  let count = 0, icount = 0;
  parts.forEach((g) => { count += g.attributes.position.count; icount += g.index ? g.index.count : g.attributes.position.count; });
  const out = new THREE.BufferGeometry();
  const arr = {};
  names.forEach((a) => { arr[a] = new Float32Array(count * parts[0].attributes[a].itemSize); });
  const mp = [...Array(nm)].map(() => new Float32Array(count * 3)), mn = [...Array(nm)].map(() => new Float32Array(count * 3));
  const idx = new Uint32Array(icount);
  let v0 = 0, i0 = 0;
  parts.forEach((g) => {
    names.forEach((a) => arr[a].set(g.attributes[a].array, v0 * g.attributes[a].itemSize));
    for (let k = 0; k < nm; k++) {
      mp[k].set(g.morphAttributes.position[k].array, v0 * 3);
      if (g.morphAttributes.normal) mn[k].set(g.morphAttributes.normal[k].array, v0 * 3);
    }
    const n = g.attributes.position.count;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[i0++] = g.index.array[i] + v0;
    else for (let i = 0; i < n; i++) idx[i0++] = i + v0;
    v0 += n;
  });
  names.forEach((a) => out.setAttribute(a, new THREE.BufferAttribute(arr[a], parts[0].attributes[a].itemSize)));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  if (nm) {
    out.morphAttributes.position = mp.map((a) => new THREE.BufferAttribute(a, 3));
    out.morphAttributes.normal = mn.map((a) => new THREE.BufferAttribute(a, 3));
    out.morphTargetsRelative = parts[0].morphTargetsRelative;
  }
  return out;
}

/** Give a geometry a flat vertex colour (for merging parts of different colours). */
export function tint(g, hex) {
  const c = lc(hex), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Rewrite a geometry's uv through fn(u, v) → [u, v] (to place a part in a texture atlas). */
export const remapUV = (g, fn) => {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const [u, v] = fn(uv.getX(i), uv.getY(i)); uv.setXY(i, u, v); }
  return g;
};
