/* Cell level (≈10 µm): the sex chromosomes of a fruit fly cross. The father's X and Y go through
 * meiosis in a primary spermatocyte (left) into four sperm, two X and two Y. The mother's two X's
 * wait in the oocyte (right), paused at metaphase I. One sperm enters the egg through the
 * micropyle and only then does the egg finish meiosis: four nuclei in a row, the innermost the
 * female pronucleus, the outer three polar bodies. The pronuclei meet; a 2×2 grid below lays out
 * every egg × sperm pairing. +Y up, the camera looking down -Z.
 *
 * Drosophila 2n = 8: X (acrocentric rod, white near its far tip), Y (J-shaped, about X-sized,
 * no white), 2 and 3 (large metacentrics), 4 (a dot). The sex pair is in colour, the autosomes
 * faint. Male meiosis has no crossing over, so none is drawn on either side. Female meiosis is
 * acentrosomal (broad spindle poles); the spermatocyte's spindle has centrosomes.
 *
 * Illustrative, not to scale: chromosomes are drawn condensed and thick so the allele band reads;
 * the egg (≈0.5 mm long) is drawn barely larger than the spermatocyte, and the sperm (≈1.9 mm) short.
 *
 * Everything is posed from t (meiosis, fert, grid, mother, father, pick); `time` only beats the
 * sperm tails. */
import * as THREE from 'three';
import { LIGHT } from '../core/three-compat.js';
import { clamp, lerp, smooth } from '../core/math.js';
import { cueAt } from '../lesson.js';
import { T, fmt } from '../lab.js';

export const LEVELS = T.levels;
export const EYE = { red: '#a8231c', white: '#efe9dc' };
export const ALLELE_COLORS = { W: EYE.red, w: EYE.white };
const PAIRS = 4;          // Drosophila melanogaster, 2n = 8
const PRODUCTS = 4;       // meiosis: one mother cell, four products
const SPERM_MM = 1.9, EGG_MM = 0.5;

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), X = V(1, 0, 0);
const win = (x, a, b) => smooth(clamp((x - a) / (b - a)));
export const eyeOf = (e, p) => (e === 'W' || p === 'W' ? 'red' : 'white');
export const whoOf = (p) => (p === 'Y' ? 'son' : 'daughter');

const COL = {
  x: '#2a3a9c', y: '#08766c', auto: '#8f89b0',
  cell: ['#f3f5fb', '#93a3cf'], nuc: ['#eceffa', '#a7b3db'], egg: ['#fff8ea', '#bfa478'], chorion: ['#fbf6ea', '#c2ad86'],
  zygote: ['#fdf2ea', '#d79a7c'], pro: ['#fff4e6', '#d8a979'], spindle: '#7f8cc4', centro: '#56609e',
  sperm: ['#eef1fb', '#7f8fc4'], tail: '#9aa6d2', tile: '#fbfaff', tileHot: '#fbe8e6', ring: '#c2453b',
};

/* chromosome shapes: centromere at the origin, the arm(s) along -y; the centromere faces the pole (+y) */
const SHAPE = {
  X: { R: 0.36, pts: [[0, 0.3], [0, 0], [0, -1.2], [0, -2.4]], band: 2.3 },
  Y: { R: 0.36, pts: [[0.8, 0.5], [0.45, 0.66], [0.12, 0.38], [0, 0], [0, -1.0], [0, -1.95]] },
  M: { R: 0.3, pts: [[0, 2.2], [0, 0], [0, -2.2]] },
  D: { R: 0.28, pts: [[0, 0.12], [0, -0.4]] },
};
const BAND_H = 0.56;

/* a tube of radius R along a planar centreline, rounded at both ends, waisted at the centromere */
function sweep(curve, R, { cen = null, s0 = 0, s1 = null, flat = false, n = 56, seg = 18 } = {}) {
  const L = curve.getLength();
  if (s1 == null) s1 = L;
  const pos = [], idx = [], P = V(), Tg = V();
  for (let i = 0; i <= n; i++) {
    const s = s0 + (i / n) * (s1 - s0), u = clamp(s / L);
    curve.getPointAt(u, P); curve.getTangentAt(u, Tg);
    const nx = -Tg.y, ny = Tg.x, nl = Math.hypot(nx, ny) || 1;
    let r = R;
    if (!flat) {
      const d = Math.min(s, L - s);
      if (d < R) r = R * Math.sqrt(Math.max(0, 1 - ((R - d) / R) ** 2));
      if (cen != null) r *= 1 - 0.42 * Math.exp(-(((s - cen) / 0.17) ** 2));
    }
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(P.x + r * Math.cos(a) * nx / nl, P.y + r * Math.cos(a) * ny / nl, P.z + r * Math.sin(a));
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function shapeGeos() {
  const out = {};
  for (const k in SHAPE) {
    const sh = SHAPE[k], curve = new THREE.CatmullRomCurve3(sh.pts.map(([x, y]) => V(x, y, 0)), false, 'centripetal');
    const L = curve.getLength();
    let cen = 0, best = Infinity;
    for (let i = 0; i <= 200; i++) { const d = curve.getPointAt(i / 200).length(); if (d < best) { best = d; cen = (i / 200) * L; } }
    out[k] = { body: sweep(curve, sh.R, { cen }), L, cen, curve };
    if (sh.band) {
      out[k].band = sweep(curve, sh.R * 1.18, { s0: sh.band - BAND_H / 2, s1: sh.band + BAND_H / 2, flat: true, n: 4 });
      out[k].bandAt = curve.getPointAt(sh.band / L);
    }
    out[k].tip = curve.getPointAt(1);
    const ys = sh.pts.map((p) => p[1]);
    out[k].mid = -(Math.max(...ys) + Math.min(...ys)) / 2;   // centromere → middle of the chromosome, along +y
  }
  return out;
}

const MEM_VS = `varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
/* a soft membrane: faint fill, a fresnel rim, one window highlight */
const MEM_FS = `uniform vec3 uFill; uniform vec3 uRim; uniform float uA; uniform float uRimA; uniform float uOpacity;
varying vec3 vN; varying vec3 vV;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float f = pow(1.0 - abs(dot(n, v)), 2.2);
  float spec = pow(max(dot(reflect(-v, n), normalize(vec3(-0.4, 0.7, 0.6))), 0.0), 36.0);
  gl_FragColor = vec4(mix(uFill, uRim, f) + spec * 0.35, clamp((uA + f * uRimA + spec * 0.3) * uOpacity, 0.0, 1.0));
  #include <colorspace_fragment>
}`;
function memMat([fill, rim], a = 0.05, rimA = 0.75) {
  return new THREE.ShaderMaterial({
    uniforms: { uFill: { value: new THREE.Color(fill) }, uRim: { value: new THREE.Color(rim) }, uA: { value: a }, uRimA: { value: rimA }, uOpacity: { value: 1 } },
    vertexShader: MEM_VS, fragmentShader: MEM_FS, transparent: true, depthWrite: false,
  });
}
const _ca = new THREE.Color(), _cb = new THREE.Color();
function tint(mat, from, to, k) {
  mat.uniforms.uFill.value.copy(_ca.set(from[0])).lerp(_cb.set(to[0]), k);
  mat.uniforms.uRim.value.copy(_ca.set(from[1])).lerp(_cb.set(to[1]), k);
}
/* a peanut: two unit spheres at ±c on y, joined (c = 0 a sphere, c = 1 two spheres touching) */
function pinch(geo, base, c) {
  const p = geo.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {
    const x = base[i], y = base[i + 1], z = base[i + 2];
    const d = Math.abs(y) * c + Math.sqrt(Math.max(0, 1 - c * c * (1 - y * y)));
    p[i] = x * d; p[i + 1] = y * d; p[i + 2] = z * d;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

/* layout */
const P0 = V(-12.5, 1.2, 0), PR = 6.4, D1M = 3.3, D2M = 2.6;             // spermatocyte; MI along y, MII along x
const E0 = V(11.5, -0.8, 0), ES = V(5.2, 10.8, 5.2);                     // egg, long axis up, micropyle at the top
const EF = V(10.3, 3.6, 0), D1F = 2.8, D2F = 1.4;                        // the egg's meiotic plate; both divisions along -y (inward)
const WIDE = [V(0, 0, 1.3), V(-3.0, 0, -0.8), V(3.0, 0, -0.8), V(0, 0.2, -2.0)];    // bivalents on the MI plate: sex, 2, 3, 4
const TIGHT = [V(0, 0, 0.7), V(-1.15, 0, -0.5), V(1.15, 0, -0.5), V(0, 0.9, -1.1)];  // one set after meiosis I
const HEAD = V(1.9, 0.42, 0.42), TAIL = 9, NB = 110;                       // sperm head half-size, tail length, beads per tail
const HCOL = [3.9, 1.3, -1.3, -3.9];                                       // sperm column, top to bottom: A0 A1 B0 B1
const IN_HEAD = [[V(-0.75, 0, 0.12), 0.42], [V(0.25, 0.1, -0.12), 0.3], [V(0.25, -0.1, -0.12), 0.3], [V(1.25, 0, 0), 0.42]];
const MEET = V(E0.x + 0.1, E0.y - 3.0, 0), MP0 = V(E0.x + 2.3, E0.y + 1.6, 0);
const ROSETTE = [V(-0.8, 0.5, 0), V(0.8, 0.5, 0), V(0, -0.5, 0.5)];
const ROS0 = V(EF.x, EF.y + 3.4, 0);
const G0 = V(0, -28, 0), GS = 6.6;

export function createCell(env, { stepIds = [] } = {}) {
  const TX = LEVELS.cell, L = TX.labels, W = TX.words;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4e6, 0.2 * LIGHT));
  const key = new THREE.DirectionalLight(0xffffff, 0.5 * LIGHT);
  key.position.set(-20, 40, 50);
  scene.add(key);
  const back = new THREE.DirectionalLight(0xf0f0ff, 0.2 * LIGHT);
  back.position.set(30, -20, -40);
  scene.add(back);

  const GEO = shapeGeos();
  const xa = (a) => (a === 'Y' ? W.y : fmt(W.x, { a }));
  const gtOf = (e, p) => (p === 'Y' ? `${xa(e)}${W.y}` : [e, p].sort().map(xa).join(''));   // 'W' sorts before 'w'

  /* ---------- chromatids ---------- */
  const root = new THREE.Group();
  scene.add(root);
  const bandMats = {};
  for (const a of ['W', 'w']) bandMats[a] = new THREE.MeshBasicMaterial({ color: ALLELE_COLORS[a], toneMapped: false, transparent: true });
  function chromatid(parent) {
    const g = new THREE.Group(), inner = new THREE.Group();
    g.add(inner);
    parent.add(g);
    const mat = new THREE.MeshPhysicalMaterial({ color: COL.x, roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45, envMapIntensity: 0.04, transparent: true });
    const body = new THREE.Mesh(GEO.X.body, mat);
    const bmat = bandMats.W.clone();
    const band = new THREE.Mesh(GEO.X.band, bmat);
    inner.add(body, band);
    const c = { g, inner, body, band, mat, bmat, type: 'X', allele: 'W', op: 1 };
    c.set = (type, allele) => {
      c.type = type; c.allele = allele;
      body.geometry = GEO[type].body;
      band.visible = type === 'X';
      if (type === 'X') bmat.color.set(ALLELE_COLORS[allele] || EYE.white);
      const faint = type === 'M' || type === 'D';
      mat.color.set(faint ? COL.auto : type === 'Y' ? COL.y : COL.x);
      c.base = faint ? 0.22 : 1;
      mat.depthWrite = !faint;
      body.renderOrder = faint ? 1 : 2;
    };
    c.flip = (f) => { inner.rotation.y = f ? Math.PI : 0; };
    /* p is the chromosome's middle; the centromere sits toward d by the shape's own offset */
    c.pose = (p, d, k = 1, op = 1) => {
      g.visible = k > 0.01 && op > 0.01;
      if (!g.visible) return;
      g.position.copy(p).addScaledVector(d, GEO[c.type].mid * k);
      g.quaternion.setFromUnitVectors(UP, d);
      g.scale.setScalar(k);
      mat.opacity = c.base * op;
      bmat.opacity = op;
    };
    c.set('X', 'W');
    return c;
  }
  // [bivalent][homolog A/B][sister]
  const mkSide = () => [0, 1, 2, 3].map(() => [0, 1].map(() => [0, 1].map((s) => { const c = chromatid(root); c.flip(s === 1); return c; })));
  const mCh = mkSide(), fCh = mkSide();

  /* fixed interphase positions inside each nucleus */
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const loose = () => [0, 1, 2, 3].map(() => [0, 1].map(() => ({
    p: V((rnd() - 0.5) * 4.4, (rnd() - 0.5) * 3.2, (rnd() - 0.5) * 2.4),
    d: V(rnd() - 0.5, 1.2, rnd() - 0.5).normalize().multiplyScalar(rnd() < 0.5 ? 1 : -1),
  })));
  const mLoose = loose(), fLoose = loose();
  mLoose[0][0].p.set(-0.9, 0.9, 1.2); mLoose[0][1].p.set(1.1, -0.6, 1.2);    // the sex pair in front, apart
  fLoose[0][0].p.set(-0.8, 0.7, 1.0); fLoose[0][1].p.set(0.9, -0.5, 1.0);
  for (const lo of [mLoose, fLoose]) for (const b of [1, 2]) for (const h of lo[b]) h.p.multiplyScalar(0.7);

  /* ---------- membranes ---------- */
  function shell(parent, colors, { a, rimA, order = 3, seg = [48, 32] } = {}) {
    const geo = new THREE.SphereGeometry(1, seg[0], seg[1]);
    const base = geo.attributes.position.array.slice();
    const mat = memMat(colors, a, rimA);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = order;
    parent.add(mesh);
    let lastC = 0;
    return {
      mesh, mat,
      pose(p, s, c = 0, op = 1) {
        mesh.visible = op > 0.004 && s.x > 0.01;
        if (!mesh.visible) return;
        mesh.position.copy(p);
        mesh.scale.copy(s);
        mat.uniforms.uOpacity.value = op;
        if (Math.abs(c - lastC) > 1e-4) { pinch(geo, base, c); lastC = c; }
      },
    };
  }
  const mCell = shell(root, COL.cell, { seg: [64, 48] });
  const mNuc = shell(root, COL.nuc, { a: 0.03, rimA: 0.5, order: 2 });
  const mDyad = [0, 1].map(() => { const s = shell(root, COL.cell, { seg: [56, 40] }); s.mesh.rotation.z = Math.PI / 2; return s; });
  const mSpd = [0, 1, 2, 3].map(() => shell(root, COL.cell, { seg: [40, 28] }));
  const centro = [0, 1, 2, 3, 4, 5].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: COL.centro, roughness: 0.5 })); root.add(m); return m; });

  const egg = shell(root, COL.egg, { a: 0.16, rimA: 0.9, seg: [72, 56] });
  const gv = shell(root, COL.nuc, { a: 0.03, rimA: 0.5, order: 2 });
  const fPro = shell(root, COL.pro, { a: 0.05, rimA: 0.6, order: 2, seg: [32, 24] });
  const mPro = shell(root, COL.pro, { a: 0.05, rimA: 0.6, order: 2, seg: [32, 24] });
  /* the eggshell's front: the micropyle's cone and the two dorsal appendages */
  const chorMat = memMat(COL.chorion, 0.25, 0.8);
  const front = new THREE.Group();
  root.add(front);
  {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.2, 0.9, 24, 1, true), chorMat);
    cone.position.set(E0.x, E0.y + ES.y + 0.1, 0);
    cone.renderOrder = 4;
    front.add(cone);
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([V(E0.x + sx * 1.1, E0.y + ES.y - 2.2, -3.0), V(E0.x + sx * 1.8, E0.y + ES.y - 0.2, -3.6), V(E0.x + sx * 2.5, E0.y + ES.y + 1.3, -3.8)]);
      const m = new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.26, 10, false), chorMat);
      m.renderOrder = 4;
      front.add(m);
    }
  }

  /* sperm heads and tails: the four from one spermatocyte; tail beads as one instanced mesh */
  const beadMat = new THREE.MeshStandardMaterial({ color: COL.tail, roughness: 0.6, transparent: true, opacity: 0.85 });
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), beadMat, 4 * NB);
  beads.frustumCulled = false;
  beads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(beads);

  /* the chosen sperm's route: its own tail line, out over the gap, down through the micropyle, into the egg */
  const H0 = V(P0.x + 3.0, P0.y + HCOL[0], 0);
  const hPos = HCOL.map((y) => V(H0.x, P0.y + y, 0));
  const MIC = V(E0.x, E0.y + ES.y + 0.2, 0);
  const R1 = new THREE.CatmullRomCurve3([H0, V(H0.x + 4, H0.y + 4.5, 0.5), V(-1, 15.5, 1), V(7, 15.5, 0.6), V(MIC.x - 0.2, MIC.y + 2.5, 0.1), MIC], false, 'centripetal');
  const R2 = new THREE.CatmullRomCurve3([MIC, V(E0.x + 1.2, E0.y + 7.0, 0.3), V(E0.x + 2.4, E0.y + 4.0, 0.2), MP0], false, 'centripetal');
  const L1 = R1.getLength(), L2 = R2.getLength();
  const routeAt = (s, out, tan) => {
    if (s <= TAIL) { out.copy(H0).addScaledVector(X, s - TAIL); if (tan) tan.copy(X); return out; }
    if (s <= TAIL + L1) { const u = (s - TAIL) / L1; R1.getPointAt(u, out); if (tan) R1.getTangentAt(u, tan); return out; }
    const u = clamp((s - TAIL - L1) / L2);
    R2.getPointAt(u, out); if (tan) R2.getTangentAt(u, tan);
    return out;
  };

  /* spindles: male MI, male MII, egg MI, egg MII */
  const spindle = [0, 1, 2, 3].map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 2 * 3), 3));
    const ln = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL.spindle, transparent: true, opacity: 0, depthWrite: false }));
    ln.frustumCulled = false;
    ln.renderOrder = 1;
    root.add(ln);
    return ln;
  });
  const spPos = [[], [], [], []];
  /* one fibre per chromatid; a broad pole spreads the fibre ends with the chromatid's own offset */
  const fibres = (k, pole, p, broad) => { spPos[k].push(pole.x + (p.x - pole.x) * broad * 0.12, pole.y, pole.z + (p.z - pole.z) * broad * 0.12, p.x, p.y, p.z); };
  const fibresX = (k, pole, p) => { spPos[k].push(pole.x, pole.y, pole.z, p.x, p.y, p.z); };
  function flushSpindle(k, op) {
    const ln = spindle[k], arr = ln.geometry.attributes.position.array;
    arr.fill(0);
    arr.set(spPos[k].slice(0, arr.length));
    ln.geometry.attributes.position.needsUpdate = true;
    ln.material.opacity = op * 0.8;
    ln.visible = op > 0.01;
    spPos[k].length = 0;
  }

  /* ---------- the grid ---------- */
  const grid = new THREE.Group();
  root.add(grid);
  const tileShape = (() => {
    const s = new THREE.Shape(), h = 2.95, r = 0.8;
    s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r); s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
    s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
    return s;
  })();
  const tileGeo = new THREE.ExtrudeGeometry(tileShape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3, curveSegments: 8 });
  const gx = (j) => G0.x + (j - 0.5) * GS, gy = (i) => G0.y + (0.5 - i) * GS;
  const HDR_S = (j) => V(gx(j), G0.y + 8.4, 0), HDR_E = (i) => V(G0.x - 8.4, gy(i), 0);
  const eyeGeo = new THREE.SphereGeometry(0.8, 32, 24);
  const cells = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const mat = new THREE.MeshBasicMaterial({ color: COL.tile, transparent: true, opacity: 0, toneMapped: false });
      const tile = new THREE.Mesh(tileGeo, mat);
      tile.position.set(gx(j), gy(i), -2.6);
      grid.add(tile);
      const eye = new THREE.Mesh(eyeGeo, new THREE.MeshStandardMaterial({ color: EYE.red, roughness: 0.4, metalness: 0, envMapIntensity: 0.05 }));
      eye.scale.set(1, 1.2, 0.8);
      grid.add(eye);
      cells.push({ i, j, tile, mat, eye, zyg: shell(grid, COL.zygote, { seg: [32, 24] }), chE: chromatid(grid), chP: chromatid(grid) });
    }
  }
  const ringMat = new THREE.MeshBasicMaterial({ color: COL.ring, transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.ShapeGeometry(tileShape, 8), ringMat);
  ring.renderOrder = -1;
  grid.add(ring);
  const hdrTail = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, k) => V(-1.0 - k * 0.45, 0.18 * Math.sin(k * 1.3), 0))), 32, 0.07, 6, false);
  const hdrS = [0, 1].map(() => {
    const s = shell(grid, COL.sperm, { a: 0.3, seg: [32, 20] });
    const tl = new THREE.Mesh(hdrTail, beadMat);
    grid.add(tl);
    return { s, tl, ch: chromatid(grid) };
  });
  const hdrE = [0, 1].map(() => ({ s: shell(grid, COL.egg, { a: 0.25, seg: [32, 24] }), ch: chromatid(grid) }));

  /* ---------- pose ---------- */
  const tA = V(), tB = V(), tC = V(), tD = V(), sc = V(), dV = V(), pV = V();
  const mat4 = new THREE.Matrix4(), qI = new THREE.Quaternion();
  const st = {   // what the last update decided, for labels, info and cues
    mg: ['W', 'W'], fg: ['w', 'Y'], eA: 'W', pA: 'Y', m: 0, f: 0, g: 0, pick: [0, 1],
    head0: V(), headQ: new THREE.Quaternion(), fPro: V(), mPro: V(), egg: V(),
  };
  /* the chromatid pose through meiosis, for one side */
  function meioticPose(side, b, R, s, out) {
    const { C, lo, dirA, ax2, D1, D2, clk } = side;
    const sgnR = R === 0 ? 1 : -1, sgnS = s === 0 ? 1 : -1;
    const gp = 0.78 * (1 - clk.a1);
    const plate = tA.copy(WIDE[b]).addScaledVector(X, -sgnR * gp);
    const grp = tB.copy(TIGHT[b]).addScaledVector(dirA, sgnR * D1);
    const c = tC.copy(lo[b][R].p).lerp(plate, clk.pair).lerp(grp, clk.a1);
    const w = SHAPE.X.R * 0.95 * clk.rep;
    out.copy(C).add(c).addScaledVector(X, sgnS * w * (1 - clk.a2)).addScaledVector(ax2, sgnS * D2 * clk.a2);
    dV.copy(lo[b][R].d).lerp(tD.copy(dirA).multiplyScalar(sgnR), clk.pair).normalize();
    return dV;
  }
  const productCentre = (side, R, s, out) => out.copy(side.C).addScaledVector(side.dirA, (R === 0 ? 1 : -1) * side.D1).addScaledVector(side.ax2, (s === 0 ? 1 : -1) * side.D2);
  const sideM = { C: P0, lo: mLoose, dirA: UP, ax2: X, D1: D1M, D2: D2M, clk: {} };
  const sideF = { C: EF, lo: fLoose, dirA: V(0, -1, 0), ax2: V(0, -1, 0), D1: D1F, D2: D2F, clk: {} };

  function setTypes(mg, fg, pick) {
    const mA = fg[pick[1]], mB = fg[1 - pick[1]], fA = mg[pick[0]], fB = mg[1 - pick[0]];
    const T4 = ['X', 'M', 'M', 'D'];
    for (let b = 0; b < 4; b++) for (let R = 0; R < 2; R++) for (let s = 0; s < 2; s++) {
      const ma = R === 0 ? mA : mB, fa = R === 0 ? fA : fB;
      const mc = mCh[b][R][s], fc = fCh[b][R][s];
      if (b === 0) {
        const mt = ma === 'Y' ? 'Y' : 'X';
        if (mc.type !== mt || mc.allele !== ma) mc.set(mt, ma);
        if (fc.allele !== fa || fc.type !== 'X') fc.set('X', fa);
      } else {
        if (mc.type !== T4[b]) mc.set(T4[b], '');
        if (fc.type !== T4[b]) fc.set(T4[b], '');
      }
    }
  }

  function update(t, time) {
    const m = clamp(t.meiosis || 0), f = clamp(t.fert || 0), g = clamp(t.grid || 0);
    const mg = t.mother || ['W', 'W'], fg = t.father || ['w', 'Y'], pick = t.pick || [0, 1];
    Object.assign(st, { mg, fg, pick, eA: mg[pick[0]], pA: fg[pick[1]], m, f, g });
    setTypes(mg, fg, pick);

    // male clock (meiosis), egg clock (paused at MI during meiosis, the rest during fert)
    const rep = win(m, 0.08, 0.22), pair = win(m, 0.22, 0.34), env0 = 1 - win(m, 0.24, 0.32);
    Object.assign(sideM.clk, { rep, pair, a1: win(m, 0.40, 0.52), a2: win(m, 0.66, 0.78) });
    const c1 = win(m, 0.46, 0.58), c2 = win(m, 0.74, 0.86), nuc = win(m, 0.82, 0.9), el = win(m, 0.86, 0.98);
    const kTm = lerp(1, 0.78, win(m, 0.78, 0.88));
    const sp1 = win(m, 0.30, 0.36) * (1 - win(m, 0.53, 0.60)), sp2 = win(m, 0.60, 0.66) * (1 - win(m, 0.78, 0.84));
    Object.assign(sideF.clk, { rep, pair, a1: win(f, 0.18, 0.32), a2: win(f, 0.36, 0.50) });
    const fsp1 = win(m, 0.32, 0.40) * (1 - win(f, 0.30, 0.36)), fsp2 = win(f, 0.33, 0.38) * (1 - win(f, 0.50, 0.56));
    const fnuc = win(f, 0.5, 0.6), fros = win(f, 0.55, 0.72), fmig = win(f, 0.62, 0.84), zyg = win(f, 0.88, 1.0);
    const kTf = lerp(lerp(1, 0.82, win(f, 0.3, 0.36)), 0.6, win(f, 0.44, 0.52));
    const swim = win(f, 0.02, 0.2), enter = win(f, 0.2, 0.36), dec = win(f, 0.36, 0.52);

    /* ---------- male ---------- */
    const sH = TAIL + L1 * swim + L2 * enter;
    routeAt(sH, st.head0, tC);
    st.headQ.setFromUnitVectors(X, tC);
    st.mPro.copy(MP0).lerp(tA.copy(MEET).addScaledVector(X, 1.45), fmig);
    for (let i = 0; i < 4; i++) {
      const R = i >> 1, s = i & 1, chosen = i === 0 && f > 0;
      const hp = chosen ? st.head0 : hPos[i];
      const hq = chosen ? st.headQ : qI;
      const dim = i === 0 ? 1 : 1 - 0.45 * win(f, 0, 0.12);
      for (let b = 0; b < 4; b++) {   // product i = (R, s) holds sister s of homolog R of every bivalent
        const ch = mCh[b][R][s];
        const dir = tD.copy(meioticPose(sideM, b, R, s, pV));
        let k = s === 1 && rep < 0.02 ? 0 : kTm;
        if (el > 0) {
          const [off, kh] = IN_HEAD[b];
          pV.lerp(tB.copy(off).applyQuaternion(hq).add(hp), el);
          dir.lerp(tC.set(-1, 0, 0).applyQuaternion(hq), el).normalize();
          k = lerp(k, kh, el);
        }
        if (chosen && dec > 0) {   // the sperm head unpacks into the male pronucleus
          pV.lerp(tB.copy(TIGHT[b]).multiplyScalar(0.55).add(st.mPro), dec);
          dir.lerp(UP, dec).normalize();
          k = lerp(k, b === 0 ? 0.55 : 0.45, dec);
        }
        if (chosen && zyg > 0) k = lerp(k, b === 0 ? 0.62 : 0.5, zyg);
        if (sp1 > 0.01) fibres(0, tB.copy(P0).addScaledVector(UP, (R === 0 ? 1 : -1) * 5.4), pV, 0);
        if (sp2 > 0.01) fibresX(1, tB.copy(P0).addScaledVector(UP, (R === 0 ? 1 : -1) * D1M).addScaledVector(X, (s === 0 ? 1 : -1) * 4.6), pV);
        ch.pose(pV, dir, k, dim);
      }
      // spermatid → sperm head → (chosen) male pronucleus
      const spd = mSpd[i];
      const hNow = pV.copy(productCentre(sideM, R, s, tA)).lerp(hp, el);
      spd.pose(hNow, sc.setScalar(2.35).lerp(HEAD, el), 0,
        (c2 >= 0.999 ? 1 : 0) * dim * (1 - (chosen ? dec : 0)));
      spd.mesh.quaternion.copy(hq);
      tint(spd.mat, COL.cell, COL.sperm, el);
      spd.mat.uniforms.uA.value = lerp(0.05, 0.16, el);
      // tail: beads trailing the head, a travelling wave growing toward the end
      const tl = TAIL * el;
      for (let k = 0; k < NB; k++) {
        const u = (k + 1) / NB, back = HEAD.x + u * tl;
        if (chosen) routeAt(sH - back, tD, tC);
        else { tD.copy(hNow).addScaledVector(X, -back); tC.copy(X); }
        const amp = 0.32 * u * Math.min(1, u * 3) * Math.sin(time * 5.5 - u * 9 + i * 1.3);
        tD.x -= tC.y * amp; tD.y += tC.x * amp;
        let sz = el > 0.01 ? 1 - 0.35 * u : 0;
        if (i === 0) sz *= 1 - win(f, 0.5, 0.7);
        else sz *= lerp(1, 0.7, win(f, 0, 0.12));
        beads.setMatrixAt(i * NB + k, mat4.compose(tD, qI, tA.setScalar(Math.max(1e-4, sz))));
      }
    }
    beads.instanceMatrix.needsUpdate = true;
    beads.visible = el > 0.01;
    mNuc.pose(tA.copy(P0).add(V(0, 0.1, 0.4)), sc.set(4.2, 3.6, 3.4), 0, env0);
    mCell.pose(P0, sc.set(PR, PR, PR).lerp(V(4.4, D1M, 4.4), c1), c1, c1 < 0.999 ? 1 : 0);
    for (let R = 0; R < 2; R++) {
      // rotated a quarter turn, so local y (the pinch) runs along x
      mDyad[R].pose(tA.copy(P0).addScaledVector(UP, (R === 0 ? 1 : -1) * D1M), sc.set(D1M, 4.4, 4.4).lerp(V(D1M * 0.78, D2M, 3.0), c2), c2, c1 >= 0.999 && c2 < 0.999 ? 1 : 0);
    }
    for (let k = 0; k < 6; k++) {
      const mi = k < 2, op = mi ? sp1 : sp2, c = centro[k];
      c.visible = op > 0.01;
      if (!c.visible) continue;
      if (mi) c.position.copy(P0).addScaledVector(UP, (k === 0 ? 1 : -1) * 5.4);
      else c.position.copy(P0).addScaledVector(UP, (k < 4 ? 1 : -1) * D1M).addScaledVector(X, (k % 2 ? -1 : 1) * 4.6);
      c.scale.setScalar(op);
    }
    flushSpindle(0, sp1);
    flushSpindle(1, sp2);

    /* ---------- egg ---------- */
    st.fPro.copy(productCentre(sideF, 0, 0, tA)).lerp(tB.copy(MEET).addScaledVector(X, -1.45), fmig);
    for (let b = 0; b < 4; b++) for (let R = 0; R < 2; R++) for (let s = 0; s < 2; s++) {
      const ch = fCh[b][R][s];
      const d = meioticPose(sideF, b, R, s, pV);
      const dir = tD.copy(d);
      let k = kTf, op = 1;
      if (s === 1 && rep < 0.02) k = 0;
      const i = R * 2 + s;
      if (i === 0) {
        if (fmig > 0) pV.add(tA.copy(st.fPro).sub(productCentre(sideF, 0, 0, tB)));
        if (zyg > 0) k = lerp(k, b === 0 ? 0.62 : 0.5, zyg);
      } else if (fros > 0) {   // polar bodies: gather near the surface, condensed, fading
        tB.copy(ROS0).add(ROSETTE[i - 1]).add(tC.copy(TIGHT[b]).multiplyScalar(0.45));
        pV.lerp(tB, fros);
        k = lerp(k, 0.4, fros);
        op = 1 - 0.6 * fros;
      }
      if (fsp1 > 0.01) fibres(2, tB.copy(EF).addScaledVector(UP, (R === 0 ? -1 : 1) * 3.6), pV, 3.2);
      if (fsp2 > 0.01) fibres(3, tB.copy(EF).addScaledVector(UP, (R === 0 ? -1 : 1) * D1F + (s === 0 ? -1 : 1) * 2.3), pV, 1.4);
      ch.pose(pV, dir, k, op);
    }
    flushSpindle(2, fsp1);
    flushSpindle(3, fsp2);
    egg.pose(E0, ES, 0, 1);
    tint(egg.mat, COL.egg, COL.zygote, zyg);
    gv.pose(tA.copy(EF).add(V(0, 0, 0.3)), sc.set(3.9, 3.0, 3.0), 0, env0);
    fPro.pose(st.fPro, sc.setScalar(1.35), 0, fnuc * (1 - zyg));
    mPro.pose(st.mPro, sc.setScalar(1.35), 0, dec * (1 - zyg));

    /* ---------- the grid: headers, then each cell's two gametes meet in turn, then the focal cell lights ---------- */
    grid.visible = g > 0;
    if (grid.visible) {
      const hdr = win(g, 0, 0.2);
      for (let j = 0; j < 2; j++) {
        const h = hdrS[j], p = HDR_S(j);
        h.s.pose(p, sc.set(1.2, 0.36, 0.36).multiplyScalar(hdr));
        h.tl.position.copy(p).add(V(-0.1, 0, 0));
        h.tl.scale.setScalar(Math.max(1e-3, hdr));
        h.ch.set(fg[j] === 'Y' ? 'Y' : 'X', fg[j]);
        h.ch.pose(tA.copy(p).add(V(-0.35, 0, 0.1)), tB.set(-1, 0, 0), 0.36 * hdr);
      }
      for (let i = 0; i < 2; i++) {
        hdrE[i].s.pose(HDR_E(i), sc.set(1.3, 2.0, 1.3).multiplyScalar(hdr));
        hdrE[i].ch.set('X', mg[i]);
        hdrE[i].ch.pose(tA.copy(HDR_E(i)).add(V(0, 0.7, 0.3)), UP, 0.5 * hdr);
      }
      const hot = win(g, 0.9, 1.0);
      for (const cl of cells) {
        const k = cl.i * 2 + cl.j, a = 0.22 + k * 0.16, local = win(g, a, a + 0.22);
        const ctr = tC.set(gx(cl.j), gy(cl.i), 0);
        const isHot = cl.i === pick[0] && cl.j === pick[1];
        cl.mat.opacity = 0.85 * hdr;
        cl.mat.color.set(COL.tile).lerp(_ca.set(COL.tileHot), isHot ? hot : 0);
        cl.chE.set('X', mg[cl.i]);
        cl.chP.set(fg[cl.j] === 'Y' ? 'Y' : 'X', fg[cl.j]);
        cl.chP.flip(true);
        cl.chE.pose(tA.copy(HDR_E(cl.i)).lerp(tB.copy(ctr).add(V(-0.95, 1.0, 0.3)), local), UP, local > 0 ? 0.55 : 0);
        cl.chP.pose(tA.copy(HDR_S(cl.j)).lerp(tB.copy(ctr).add(V(0.25, 1.0, 0.3)), local), UP, local > 0 ? 0.55 : 0);
        const z = win(local, 0.6, 1);
        cl.zyg.pose(tA.copy(ctr).add(V(-0.35, 0.35, 0)), sc.set(1.75, 1.55, 1.3).multiplyScalar(z), 0, z);
        cl.eye.visible = z > 0.01;
        cl.eye.position.set(ctr.x + 1.75, ctr.y - 1.75, 0.3);
        cl.eye.scale.set(1, 1.2, 0.8).multiplyScalar(Math.max(1e-3, z));
        cl.eye.material.color.set(EYE[eyeOf(mg[cl.i], fg[cl.j])]);
        if (isHot) {
          ring.position.set(ctr.x, ctr.y, -2.75);
          ring.scale.setScalar(1 + 0.07 * hot);
          ringMat.opacity = 0.85 * hot;
        }
      }
    }
  }

  /* ---------- labels, info, views, cues ---------- */
  const word = (n) => (W.num && W.num[n]) || n;
  const BASE = { n: PAIRS, d: 2 * PAIRS, all: word(PRODUCTS), dead: word(PRODUCTS - 1), mm: SPERM_MM, egg: EGG_MM };
  const zVars = () => {
    const e = st.eA, p = st.pA;
    return { g: gtOf(e, p), who: W[whoOf(p)], eye: W[eyeOf(e, p)] };
  };
  const spermCount = () => [st.fg[0], 'Y'].map((a) => fmt(W.count, { n: PRODUCTS / 2, a: xa(a) })).join(W.sep);
  const an = {};
  const at = (k) => (an[k] = an[k] || V());
  const tipOf = (c, out) => out.copy(GEO[c.type].tip).applyMatrix4(c.inner.matrixWorld);
  const bandAt = (c, out) => out.copy(GEO.X.bandAt).applyMatrix4(c.inner.matrixWorld);
  const fe = (t) => clamp(t.fert || 0), me = (t) => clamp(t.meiosis || 0), gr = (t) => clamp(t.grid || 0);
  const none = (t) => fe(t) === 0 && gr(t) === 0;
  const labels = [
    { key: 'spermatocyte', text: L.spermatocyte.text, sub: () => fmt(L.spermatocyte.sub, { g: `${xa(st.fg[0])}${W.y}` }),
      anchor: () => at('sc').copy(P0).add(V(0, PR, 0)), show: (t) => me(t) < 0.1 && none(t) },
    { key: 'oocyte', text: L.oocyte.text, sub: () => fmt(L.oocyte.sub, { g: st.mg.map(xa).join('') }),
      anchor: () => at('oo').copy(E0).add(V(-ES.x * 0.72, ES.y * 0.62, 0)), show: (t) => me(t) < 0.1 && none(t) },
    { key: 'xy', text: L.xy.text, sub: L.xy.sub, anchor: () => tipOf(mCh[0][1][0], at('xy')), show: (t) => me(t) < 0.1 && none(t) },
    { key: 'xx', text: L.xx.text, sub: L.xx.sub, anchor: () => tipOf(fCh[0][1][0], at('xx')), show: (t) => me(t) < 0.1 && none(t) },
    { key: 'autosomes', text: L.autosomes.text, sub: fmt(L.autosomes.sub, BASE), anchor: () => tipOf(fCh[2][0][0], at('au')), show: (t) => me(t) >= 0.1 && me(t) < 0.2 && none(t) },
    { key: 'white', text: L.white.text, sub: () => fmt(L.white.sub, { a: xa(st.eA) }), anchor: () => bandAt(fCh[0][0][0], at('wh')), show: (t) => me(t) >= 0.2 && me(t) < 0.38 && none(t) },
    { key: 'yNone', text: L.yNone.text, sub: L.yNone.sub, anchor: () => tipOf(mCh[0][st.pA === 'Y' ? 0 : 1][0], at('yn')), show: (t) => me(t) >= 0.22 && me(t) < 0.38 && none(t) },
    { key: 'sisters', text: L.sisters.text, sub: L.sisters.sub, anchor: () => tipOf(mCh[0][0][0], at('si')), show: (t) => me(t) >= 0.12 && me(t) < 0.22 && none(t) },
    { key: 'm1', text: L.m1.text, sub: L.m1.sub, anchor: () => at('m1').copy(P0).add(V(-PR * 0.8, 0, 0)), show: (t) => me(t) >= 0.4 && me(t) < 0.62 && none(t) },
    { key: 'arrest', text: L.arrest.text, sub: L.arrest.sub, anchor: () => at('ar').copy(EF).add(V(3.2, 0.4, 0)), show: (t) => me(t) >= 0.4 && fe(t) < 0.12 && gr(t) === 0 },
    { key: 'm2', text: L.m2.text, sub: L.m2.sub, anchor: () => at('m2').copy(P0).add(V(0, PR - 0.5, 0)), show: (t) => me(t) >= 0.62 && me(t) < 0.86 && none(t) },
    { key: 'sperm', text: L.sperm.text, sub: () => fmt(L.sperm.sub, { s: spermCount() }), anchor: () => at('sp').set(H0.x - TAIL * 0.6, P0.y + HCOL[3] - 0.6, 0), show: (t) => me(t) >= 0.92 && fe(t) < 0.04 && gr(t) === 0 },
    { key: 'micropyle', text: L.micropyle.text, sub: L.micropyle.sub, anchor: () => at('mi').copy(MIC).add(V(0, 0.6, 0)), show: (t) => fe(t) > 0.02 && fe(t) < 0.26 && gr(t) === 0 },
    { key: 'eggM1', text: L.eggM1.text, sub: L.eggM1.sub, anchor: () => at('e1').copy(EF).add(V(-2.6, 2.2, 0)), show: (t) => fe(t) >= 0.18 && fe(t) < 0.34 && gr(t) === 0 },
    { key: 'eggM2', text: L.eggM2.text, sub: fmt(L.eggM2.sub, BASE), anchor: () => at('e2').copy(EF).add(V(-2.4, 4.2, 0)), show: (t) => fe(t) >= 0.36 && fe(t) < 0.55 && gr(t) === 0 },
    { key: 'polar', text: L.polar.text, sub: fmt(L.polar.sub, BASE), anchor: () => at('pb').copy(ROS0).add(V(0, 1.3, 0)), show: (t) => fe(t) >= 0.58 && fe(t) < 0.88 && gr(t) === 0 },
    { key: 'female', text: L.female.text, sub: () => fmt(L.female.sub, { a: xa(st.eA) }), anchor: () => at('fp').copy(st.fPro).add(V(-0.6, -1.4, 0)), show: (t) => fe(t) >= 0.6 && fe(t) < 0.88 && gr(t) === 0 },
    { key: 'male', text: L.male.text, sub: () => fmt(L.male.sub, { a: xa(st.pA) }), anchor: () => at('mp').copy(st.mPro).add(V(0.6, 1.4, 0)), show: (t) => fe(t) >= 0.5 && fe(t) < 0.88 && gr(t) === 0 },
    { key: 'zygote', text: L.zygote.text, sub: () => fmt(L.zygote.sub, zVars()), anchor: () => at('zy').copy(MEET).add(V(0, 1.6, 0)), show: (t) => fe(t) >= 0.88 && gr(t) === 0 },
    { key: 'gSperm', text: L.gSperm.text, sub: () => fmt(W.or, { a: xa(st.fg[0]), b: W.y }), anchor: () => at('gs').copy(G0).add(V(0, 9.4, 0)), show: (t) => gr(t) > 0.15 },
    { key: 'gEgg', text: L.gEgg.text, sub: () => (st.mg[0] === st.mg[1] ? fmt(W.all, { a: xa(st.mg[0]) }) : fmt(W.or, { a: xa(st.mg[0]), b: xa(st.mg[1]) })),
      anchor: () => at('ge').copy(G0).add(V(-8.4, GS / 2 + 2.3, 0)), show: (t) => gr(t) > 0.15 },
  ];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const k = i * 2 + j, done = 0.22 + k * 0.16 + 0.2;
      const v = () => { const e = st.mg[i], p = st.fg[j]; return { g: gtOf(e, p), who: W[whoOf(p)], eye: W[eyeOf(e, p)] }; };
      labels.push({ key: `g${i}${j}`, text: '', sub: () => fmt(L.gCell.sub, v()),
        anchor: () => at(`g${i}${j}`).set(gx(j) - 0.35, gy(i) + 2.2, 0), show: (t) => gr(t) >= done });
    }
  }

  const I = TX.info;
  const card = (c, vars = {}) => ({ title: fmt(c.title, { ...BASE, ...vars }), text: fmt(c.text, { ...BASE, ...vars }) });
  const interactives = [];
  const addChrom = (c, copied) => {
    interactives.push({ root: c.body, priority: 2, info: (t) => {
      if (c.type === 'M' || c.type === 'D') return card(I.autosome);
      if (copied(t)) return card(I.copied);
      return card(c.type === 'Y' ? I.y : I.x);
    } });
    interactives.push({ root: c.band, priority: 3, info: () => card(I['allele' + c.allele]) });
  };
  mCh.flat(2).forEach((c) => addChrom(c, (t) => me(t) > 0.1 && me(t) < 0.75));
  fCh.flat(2).forEach((c) => addChrom(c, (t) => me(t) > 0.1 && fe(t) < 0.45));
  interactives.push({ root: mCell.mesh, priority: 1, info: () => card(I.spermatocyte) });
  mDyad.forEach((d) => interactives.push({ root: d.mesh, priority: 1, info: () => card(I.dyad) }));
  mSpd.forEach((s, i) => interactives.push({ root: s.mesh, priority: 1, info: (t) => {
    const a = xa(mCh[0][i >> 1][i & 1].allele || 'Y');
    return card(me(t) >= 0.9 ? I.sperm : I.spermatid, { a });
  } }));
  interactives.push({ root: egg.mesh, priority: 0, info: (t) => (fe(t) >= 0.88 ? card(I.zygote, zVars()) : card(I.oocyte)) });
  interactives.push({ root: front, priority: 1, info: () => card(I.micropyle) });
  interactives.push({ root: fPro.mesh, priority: 2, info: () => card(I.female, { a: xa(st.eA) }) });
  interactives.push({ root: mPro.mesh, priority: 2, info: () => card(I.male, { a: xa(st.pA) }) });
  cells.forEach((cl) => {
    const info = () => { const e = st.mg[cl.i], p = st.fg[cl.j]; return card(I.cell, { e: xa(e), p: xa(p), g: gtOf(e, p), who: W[whoOf(p)], eye: W[eyeOf(e, p)] }); };
    interactives.push({ root: cl.tile, priority: 1, info });
    interactives.push({ root: cl.zyg.mesh, priority: 2, info });
    interactives.push({ root: cl.eye, priority: 2, info });
  });
  hdrS.forEach((h, j) => interactives.push({ root: h.s.mesh, priority: 2, info: () => card(I.sperm, { a: xa(st.fg[j]) }) }));
  hdrE.forEach((h, i) => interactives.push({ root: h.s.mesh, priority: 2, info: () => card(I.egg, { a: xa(st.mg[i]) }) }));

  const VIEW = {
    wide: { pos: V(0.5, 9, 47), target: V(0.5, 2.4, 0) },
    egg: { pos: V(7.5, 4, 40), target: V(8, 3, 0) },
    zygote: { pos: V(11.5, -0.5, 30), target: V(11.5, -2.4, 0) },
    grid: { pos: V(-1.2, G0.y + 4, 40), target: V(-1.2, G0.y + 1.8, 0) },
  };
  const VIEW_OF = { knock: 'wide', sort: 'wide', setup: 'wide', predict1: 'wide', wait1: 'wide', clear1: 'egg', hatch1: 'zygote', count1: 'zygote',
    mate2: 'wide', predict2: 'wide', wait2: 'wide', clear2: 'egg', hatch2: 'zygote', count2: 'zygote', test: 'zygote', punnett: 'grid' };
  const views = [...stepIds.map((id) => VIEW[VIEW_OF[id] || 'wide']), VIEW.grid];

  /* Watch captions: meiosis beats, fertilization beats, then the grid */
  const C = TX.cues;
  const cueM = [[0, ['interphase', 'xy']], [0.12, ['replicate', 'sisters']], [0.22, ['pair', 'yNone']], [0.38, ['m1', 'm1']],
    [0.62, ['m2', 'm2']], [0.9, ['sperm', 'sperm']]];
  const cueF = [[0, ['enter', 'micropyle']], [0.18, ['eggM1', 'eggM1']], [0.36, ['eggM2', 'eggM2']], [0.56, ['polar', 'polar']],
    [0.68, ['meet', 'female']], [0.88, ['zygote', 'zygote']]];
  const cueG = [[0, ['gridIntro', 'gEgg']], [0.22, ['gridFill', null]], [0.92, ['gridDone', null]]];
  function cue(t) {
    const m = me(t), f = fe(t), g = gr(t);
    const vars = { ...BASE, ...zVars(), a: xa(st.pA), e: xa(st.eA), x: xa(st.fg[0]), e0: xa(st.mg[0]), e1: xa(st.mg[1]), s0: xa(st.fg[0]) };
    const out = ([k, mark]) => ({ text: fmt(C[k], vars), mark });
    if (t.step === 'punnett' || (t.step == null && g > 0)) {
      const [k, mark] = cueAt(cueG, g);
      if (k !== 'gridDone') return out([k, mark]);
      const tally = { daughter: { red: 0, white: 0 }, son: { red: 0, white: 0 } };
      for (const e of st.mg) for (const p of st.fg) tally[whoOf(p)][eyeOf(e, p)]++;
      const list = (x) => ['red', 'white'].filter((c) => x[c]).map((c) => fmt(c === 'red' ? W.nRed : W.nWhite, { n: x[c] })).join(W.list);
      const txt = `${fmt(W.daughters, { list: list(tally.daughter) })}${W.sep}${fmt(W.sons, { list: list(tally.son) })}`;
      return { text: fmt(C.gridDone, { tally: txt }), mark: `g${st.pick[0]}${st.pick[1]}` };
    }
    if (f > 0.001 || (m >= 0.999 && /^(wait|clear|hatch|count|test)/.test(t.step || ''))) return out(cueAt(cueF, f));
    return out(cueAt(cueM, m));
  }
  return {
    scene, update, labels, interactives, views, cue,
    fov: 38, near: 0.5, far: 400, minDist: 8, maxDist: 130,
  };
}
