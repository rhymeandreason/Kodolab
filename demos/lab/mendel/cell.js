/* Cell level (≈20 µm): the one homologous pair that carries the seed-colour gene, through
 * meiosis in an anther (left) and an ovule (right), then fertilization, then the four possible
 * fertilizations as a 2×2 Punnett square below. +Y up, the camera looking down -Z.
 *
 * Pea is a dicot, so the two sides divide differently, and both are drawn as they happen:
 * microsporogenesis is simultaneous (no wall after meiosis I; the four microspores cleave at once
 * into a tetrahedral tetrad inside a callose wall, seen here down a 2-fold axis so all four show),
 * megasporogenesis successive (a dyad, then a linear tetrad; the chalazal megaspore, at the top,
 * survives and the three micropylar ones degenerate). Which homolog reaches which pole at
 * metaphase I is chance; t.pick decides it here, so the surviving megaspore and the pollen grain
 * that lands carry the focal seed's alleles.
 *
 * Illustrative, not to scale: chromosomes are drawn condensed and thick so the allele band reads,
 * and stigma, style and ovule (millimetres apart in a flower) are pulled into one frame.
 *
 * Everything is posed from t (meiosis, fert, grid, mother, father, self, pick); `time` only bobs. */
import * as THREE from 'three';
import { LIGHT } from '../core/three-compat.js';
import { clamp, lerp, smooth } from '../core/math.js';
import { cueAt } from '../lesson.js';
import { T, fmt } from '../text.js';
import { PEA_COLORS as SEED } from '../props/peas.js';   // the dry pea each zygote makes (grid), as the bench draws it

export const ALLELE_COLORS = { Y: '#e0a800', y: '#3f8f3a' };
const PAIRS = 7;          // Pisum sativum, 2n = 14; one pair carries SGR
const PRODUCTS = 4;       // meiosis: one mother cell, four products

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), X = V(1, 0, 0);
const win = (x, a, b) => smooth(clamp((x - a) / (b - a)));
const seedOf = (g) => (g.includes('Y') ? 'yellow' : 'green');
const geno = (a, b) => [a, b].sort().join('');   // 'Y' sorts before 'y'

const COL = {
  chrom: '#5d53a6',
  cell: ['#f6f3fd', '#a596d8'], nuc: ['#ece6fb', '#b3a5e4'], callose: ['#ffffff', '#c9c0e2'],
  pollen: ['#fbf0d6', '#c7a26e'], colpus: '#b8955f', dying: ['#ece6dc', '#b6a993'],
  egg: ['#fcf0f4', '#d49ab4'], zygote: ['#fdf1ea', '#d79a7c'], stigma: ['#eef5e6', '#a5c28c'],
  spindle: '#7a6cc0', tile: '#fbfaff', tileHot: '#efe6ff', ring: '#8b5cf6',
};

/* sizes (µm-ish) */
const CH = { L: 4.4, R: 0.5, cen: 0.6, band: -1.0, bandH: 0.62 };   // chromatid: centromere on +y of centre, SGR band on the long arm
const G_PAIR = 2.1 * CH.R, NUC = V(2.0, 0.95, 0.95);           // homologs' half-gap when paired; a product's nucleus
const P0 = V(-11.5, 0.5, 0), PR = 6.6;                                 // pollen mother cell
const TET = { x: 3.0, yz: 1.9, r: 2.6 };                            // tetrahedral tetrad: vertices (±x, ±yz, ±yz)
const POLL = { d: 3.6, s: V(2.5, 3.1, 2.5) };                        // pollen grains: 2×2 spacing, shape
const E0 = V(10, 0, 0), EM = V(4.2, 7.0, 4.2), ED = V(3.8, 3.5, 3.8), ET = V(3.4, 1.75, 3.4);  // ovule: mother, dyad, tetrad cells
const EGG_C = V(10, 0.6, 0), EGG_S = V(3.6, 4.6, 3.6);
const LAND = V(0.6, 11.6, 0);
const G0 = V(0, -27, 0), GS = 6.4;                                   // Punnett square centre, cell pitch

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

/* a chromatid: rounded rod with a centromere waist; origin at the centromere */
function chromatidGeo() {
  const { L, R } = CH, pts = [];
  const waist = (y) => 1 - 0.42 * Math.exp(-(((y - CH.cen) / 0.2) ** 2));
  const add = (r, y) => pts.push(new THREE.Vector2(r * waist(y), y - CH.cen));
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI / 2; add(R * Math.cos(a), -L / 2 + R + R * Math.sin(a)); }
  for (let i = 1; i < 40; i++) add(R, -L / 2 + R + (i / 40) * (L - 2 * R));
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; add(R * Math.cos(a), L / 2 - R + R * Math.sin(a)); }
  return new THREE.LatheGeometry(pts, 28);
}
function bandGeo() {
  const r = CH.R * 1.13, h = CH.bandH / 2, e = 0.07;
  const pts = [[CH.R * 0.8, -h], [r - e, -h], [r, -h + e], [r, h - e], [r - e, h], [CH.R * 0.8, h]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 28);
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

export function createCell(env, { stepIds = [] } = {}) {
  const TX = T.levels.cell, L = TX.labels, W = TX.words;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d0e6, 0.55 * LIGHT));
  const key = new THREE.DirectionalLight(0xffffff, 0.75 * LIGHT);
  key.position.set(-20, 40, 50);
  scene.add(key);
  const back = new THREE.DirectionalLight(0xf3eaff, 0.35 * LIGHT);
  back.position.set(30, -20, -40);
  scene.add(back);

  /* ---------- parts ---------- */
  const chromMat = new THREE.MeshPhysicalMaterial({ color: COL.chrom, roughness: 0.5, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.5, envMapIntensity: 0.25 });
  const bandMat = {};
  for (const a of ['Y', 'y']) bandMat[a] = new THREE.MeshBasicMaterial({ color: ALLELE_COLORS[a], toneMapped: false });   // flat, the legend's exact colour
  const CHR_GEO = chromatidGeo(), BAND_GEO = bandGeo();

  function chromatid(parent) {
    const g = new THREE.Group();
    const band = new THREE.Mesh(BAND_GEO, bandMat.Y);
    band.position.y = CH.band - CH.cen;
    g.add(new THREE.Mesh(CHR_GEO, chromMat), band);
    parent.add(g);
    const c = { g, band, allele: 'Y' };
    c.set = (a) => { if (a !== c.allele) { c.allele = a; band.material = bandMat[a]; } };
    c.pose = (p, d, k = 1) => {
      g.visible = k > 0.01;
      if (!g.visible) return;
      g.position.copy(p);
      g.quaternion.setFromUnitVectors(UP, d);
      g.scale.setScalar(k);
    };
    return c;
  }

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

  const root = new THREE.Group();
  scene.add(root);

  /* ovule side: roles A (goes to the chalazal pole, survives) and B; sisters 0 (upper) and 1 */
  const eCh = [0, 1].map(() => [chromatid(root), chromatid(root)]);
  const eMother = shell(root, COL.cell, { seg: [64, 48] });
  const eDyad = [0, 1].map(() => shell(root, COL.cell, { seg: [56, 40] }));
  const eTet = [0, 1, 2, 3].map(() => shell(root, COL.cell));
  const eMNuc = shell(root, COL.nuc, { a: 0.03, rimA: 0.5, order: 2 });
  const eNuc = [0, 1, 2, 3].map(() => shell(root, COL.nuc, { a: 0.03, rimA: 0.5, order: 2, seg: [32, 20] }));

  /* anther side: role A goes to the +x pole (toward the stigma), its sister 0 is the grain that lands */
  const pCh = [0, 1].map(() => [chromatid(root), chromatid(root)]);
  const pMother = shell(root, COL.cell, { seg: [64, 48] });
  const pMNuc = shell(root, COL.nuc, { a: 0.03, rimA: 0.5, order: 2 });
  const pNuc = [0, 1, 2, 3].map(() => shell(root, COL.nuc, { a: 0.03, rimA: 0.5, order: 2, seg: [32, 20] }));
  const colpusMat = new THREE.MeshBasicMaterial({ color: COL.colpus, transparent: true, opacity: 0, depthWrite: false });
  const colpusGeo = (() => {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const la = -0.8 + (i / 24) * 1.6; pts.push(V(Math.cos(la) * 1.005, Math.sin(la) * 1.005, 0)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.022, 6, false);
  })();
  const pSpore = [0, 1, 2, 3].map(() => {
    const s = shell(root, COL.cell, { seg: [40, 28] });
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(colpusGeo, colpusMat);
      c.rotation.y = (k / 3) * Math.PI * 2 + 0.5;
      c.renderOrder = 4;
      s.mesh.add(c);
    }
    return s;
  });

  /* spindle fibres: meiosis I and II, kinetochore fibres only (plants have no centrosomes) */
  const spindle = [0, 1].map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 8 * 3 * 2 * 3), 3));
    const ln = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COL.spindle, transparent: true, opacity: 0, depthWrite: false }));
    ln.frustumCulled = false;
    ln.renderOrder = 1;
    root.add(ln);
    return ln;
  });

  /* fertilization: stigma papillae, the tube along a fixed path, the sperm nucleus */
  const stigma = new THREE.Group();
  root.add(stigma);
  const stigMat = memMat(COL.stigma, 0.16, 0.55);
  stigMat.uniforms.uOpacity.value = 0;
  {
    const base = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), stigMat);
    base.scale.set(7.5, 1.3, 2.6);
    base.position.set(0.6, 7.0, 0);
    base.renderOrder = 3;
    stigma.add(base);
    const pap = new THREE.CapsuleGeometry(0.55, 1.6, 6, 16);
    for (let i = 0; i < 11; i++) {
      const x = -5 + i * 1.12;
      if (Math.abs(x - LAND.x) < 1.2) continue;   // the grain sits in the gap
      const m = new THREE.Mesh(pap, stigMat);
      m.position.set(x, 8.6 + 0.25 * Math.cos(i * 1.7), 0.4 * Math.sin(i * 2.3));
      m.rotation.z = (x - LAND.x) * -0.03;
      m.renderOrder = 3;
      stigma.add(m);
    }
  }
  const PATH = new THREE.CatmullRomCurve3([V(0.6, 9.0, 0), V(0.8, 6.0, 0.3), V(2.0, 1.5, 0.8), V(4.0, -4.2, 1.0), V(6.6, -7.8, 0.7),
    V(9.4, -8.3, 0.2), V(10.1, -4.3, 0)], false, 'centripetal');
  const TUBE_N = 220, TUBE_RAD = 12, TUBE_R = 0.85;
  const tubeMat = memMat(COL.pollen, 0.2, 0.8);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(PATH, TUBE_N, TUBE_R, TUBE_RAD, false), tubeMat);
  tube.renderOrder = 3;
  const tubeTip = new THREE.Mesh(new THREE.SphereGeometry(TUBE_R, 20, 14), tubeMat);
  tubeTip.renderOrder = 3;
  root.add(tube, tubeTip);

  /* the Punnett square: tiles, header gametes, a zygote and the pea it makes in each cell */
  const grid = new THREE.Group();
  root.add(grid);
  const tileShape = (() => {
    const s = new THREE.Shape(), h = 2.9, r = 0.8;
    s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r); s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
    s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
    return s;
  })();
  const tileGeo = new THREE.ExtrudeGeometry(tileShape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3, curveSegments: 8 });
  const gx = (j) => G0.x + (j - 0.5) * GS, gy = (i) => G0.y + (0.5 - i) * GS;
  const HDR_P = (j) => V(gx(j), G0.y + 8.3, 0), HDR_E = (i) => V(G0.x - 8.0, gy(i), 0);
  const cells = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const mat = new THREE.MeshBasicMaterial({ color: COL.tile, transparent: true, opacity: 0, toneMapped: false });
      const tile = new THREE.Mesh(tileGeo, mat);
      tile.position.set(gx(j), gy(i), -2.6);
      grid.add(tile);
      const pea = new THREE.Mesh(new THREE.SphereGeometry(0.78, 24, 16), new THREE.MeshStandardMaterial({ color: SEED.yellow, roughness: 0.5, metalness: 0, envMapIntensity: 0.5 }));
      grid.add(pea);
      cells.push({ i, j, tile, mat, pea, zyg: shell(grid, COL.zygote, { seg: [32, 24] }), chE: chromatid(grid), chP: chromatid(grid) });
    }
  }
  const ringMat = new THREE.MeshBasicMaterial({ color: COL.ring, transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.ShapeGeometry(tileShape, 8), ringMat);
  ring.renderOrder = -1;
  grid.add(ring);
  const hdrP = [0, 1].map(() => ({ s: shell(grid, COL.pollen, { a: 0.3, seg: [32, 24] }), ch: chromatid(grid) }));
  const hdrE = [0, 1].map(() => ({ s: shell(grid, COL.egg, { a: 0.2, seg: [32, 24] }), ch: chromatid(grid) }));

  /* ---------- pose ---------- */
  const tA = V(), tB = V(), tC = V(), tD = V(), tN = V(), sc = V();
  const cV = V(), dV = V(), nV = V(), pV = V(), aV = V(), qV = V(), gV = V();
  const st = {   // what the last update decided, for labels and info cards
    mg: 'yy', fg: 'YY', eA: 'y', pA: 'Y', zg: 'Yy', m: 0, f: 0, g: 0, u: 0, pick: [0, 0],
    eChW: [[V(), V()], [V(), V()]], pChW: [[V(), V()], [V(), V()]], pGrain: [V(), V(), V(), V()], sperm: V(), dyingAt: V(),
  };
  const spPos = [[], []];   // spindle fibre endpoints, per division
  const fibres = (k, pole, p, d) => {
    for (const o of [-0.22, 0, 0.22]) spPos[k].push(pole.x + d.x * o * 4, pole.y + d.y * o * 4, pole.z + d.z * o * 4, p.x + d.x * o, p.y + d.y * o, p.z + d.z * o);   // broad plant poles
  };
  function flushSpindle(k, op) {
    const ln = spindle[k], arr = ln.geometry.attributes.position.array;
    arr.fill(0);
    arr.set(spPos[k].slice(0, arr.length));
    ln.geometry.attributes.position.needsUpdate = true;
    ln.material.opacity = op * 0.85;
    ln.visible = op > 0.01;
    spPos[k].length = 0;
  }

  function update(t, time) {
    const m = clamp(t.meiosis || 0), f = clamp(t.fert || 0), g = clamp(t.grid || 0);
    const mg = t.mother || 'yy', fg = t.father || 'YY', pick = t.pick || [0, 0];
    const eA = mg[pick[0]], eB = mg[1 - pick[0]], pA = fg[pick[1]], pB = fg[1 - pick[1]];
    Object.assign(st, { mg, fg, eA, pA, zg: geno(eA, pA), m, f, g, pick, selfing: !!t.self });

    // the meiosis clock, shared by both sides
    const rep = win(m, 0.08, 0.22), env0 = 1 - win(m, 0.22, 0.30), pair = win(m, 0.22, 0.34);
    const a1 = win(m, 0.40, 0.52), c1 = win(m, 0.46, 0.58), ik = win(m, 0.58, 0.66);
    const a2 = win(m, 0.70, 0.80), tel = win(m, 0.80, 0.90), c2 = win(m, 0.78, 0.88), nuc = win(m, 0.84, 0.92);
    const dg = win(m, 0.88, 0.97), grow = win(m, 0.90, 1.0), k4 = win(m, 0.79, 0.88), rel = win(m, 0.88, 0.98), pol = win(m, 0.90, 1.0);
    const sp1 = win(m, 0.30, 0.36) * (1 - win(m, 0.53, 0.60)), sp2 = win(m, 0.62, 0.68) * (1 - win(m, 0.80, 0.86));
    const w0 = CH.R * 0.95, kT = lerp(1, 0.78, tel);
    // fertilization
    const move = win(f, 0, 0.18), u = win(f, 0.2, 0.7), leave = win(u, 0, 0.1), enter = win(f, 0.7, 0.82), fuse = win(f, 0.8, 0.92), zyg = win(f, 0.9, 1.0);
    st.u = u;

    /* ovule: roles A/B start loose, pair at the plate (long axis x, sisters stacked in y), split up and down twice */
    const I_E = [[V(-0.9, 1.3, 0.4), V(0.45, 0.9, 0).normalize()], [V(1.0, -1.1, -0.4), V(-0.35, 0.94, 0).normalize()]];
    for (let R = 0; R < 2; R++) {
      const sgn = R === 0 ? 1 : -1;
      const c = tA.copy(I_E[R][0]).lerp(tB.set(0, sgn * G_PAIR, 0), pair);
      c.y += sgn * (3.5 - G_PAIR) * a1;
      const d = tC.copy(I_E[R][1]).lerp(X, pair).normalize();
      const n = tN.set(-d.y, d.x, 0);
      const w = lerp(0, w0, rep) + (1.75 - w0) * a2;
      for (let s = 0; s < 2; s++) {
        const ch = eCh[R][s];
        ch.set(R === 0 ? eA : eB);
        const p = tD.copy(E0).add(c).addScaledVector(n, s === 0 ? w : -w);
        let k = kT;
        const survivor = R === 0 && s === 0;
        if (survivor) {
          p.y += (EGG_C.y - p.y) * grow;
          p.y += 0.42 * fuse;   // makes room for the sperm's chromosome
        } else k *= 1 - dg;
        if (s === 1 && rep < 0.02) k = 0;
        st.eChW[R][s].copy(p);
        ch.pose(p, d, k);
        if (sp1 > 0.01) fibres(0, tB.copy(E0).add(V(0, sgn * 6.0, 0)), p, d);
        if (sp2 > 0.01) fibres(1, tB.copy(E0).add(V(0, sgn * 3.5 + (s === 0 ? 3 : -3), 0)), p, d);
      }
    }
    eMNuc.pose(tA.copy(E0).add(V(0, 0.1, 0)), sc.set(3.5, 3.6, 3.5), 0, env0);
    eMother.pose(E0, sc.copy(EM).lerp(ED, c1), c1, c1 < 0.999 ? 1 : 0);
    for (let R = 0; R < 2; R++) eDyad[R].pose(tA.copy(E0).add(V(0, R === 0 ? 3.5 : -3.5, 0)), sc.copy(ED).lerp(ET, c2), c2, c1 >= 0.999 && c2 < 0.999 ? 1 : 0);
    for (let i = 0; i < 4; i++) {
      const R = i >> 1, s = i & 1, y = (R === 0 ? 3.5 : -3.5) + (s === 0 ? 1.75 : -1.75), on = c2 >= 0.999 ? 1 : 0;
      const p = tA.copy(E0).add(V(0, y, 0));
      if (i === 0) {
        p.lerp(EGG_C, grow);
        eTet[0].pose(p, sc.copy(ET).lerp(EGG_S, grow), 0, on);
        tint(eTet[0].mat, COL.cell, COL.egg, grow);
        if (zyg > 0) tint(eTet[0].mat, COL.egg, COL.zygote, zyg);
        eNuc[0].pose(p, sc.set(NUC.x, NUC.y, NUC.z).lerp(V(2.1, 1.1, 1.1), grow).lerp(V(2.25, 1.75, 1.45), fuse), 0, nuc);
      } else {
        eTet[i].pose(p, sc.copy(ET).multiplyScalar(1 - 0.55 * dg), 0, on * (1 - dg));
        tint(eTet[i].mat, COL.cell, COL.dying, win(m, 0.86, 0.93));
        eNuc[i].pose(p, sc.set(NUC.x, NUC.y, NUC.z).multiplyScalar(1 - dg), 0, nuc * (1 - dg));
      }
    }
    st.dyingAt.copy(E0).add(V(ET.x * 0.75, -5.25, 0));

    /* anther: pair at a vertical plate, homologs part along x; no wall, the frame turns, sisters part
       along each group's own axis to the tetrahedron's vertices; four cells cleave at once, then round up */
    const I_P = [[V(1.3, 0.8, 0.3), V(0.3, 0.95, 0).normalize()], [V(-1.4, -0.5, -0.3), V(-0.45, 0.89, 0).normalize()]];
    for (let R = 0; R < 2; R++) {
      const sgn = R === 0 ? 1 : -1;
      const c = cV.copy(I_P[R][0]).lerp(tB.set(sgn * G_PAIR, 0, 0), pair);
      c.x += sgn * (TET.x - G_PAIR) * a1;
      const d = dV.copy(I_P[R][1]).lerp(UP, pair).normalize();
      const n = nV.set(d.y, -d.x, 0);
      const ax2 = aV.set(0, 1, sgn).normalize();   // this group's meiosis II axis
      if (ik > 0) {
        d.lerp(X, ik).normalize();
        n.lerp(ax2, ik);
        n.addScaledVector(d, -n.dot(d)).normalize();
      }
      const w = lerp(0, w0, rep) + (Math.SQRT2 * TET.yz - w0) * a2;
      for (let s = 0; s < 2; s++) {
        const i = R * 2 + s, ch = pCh[R][s];
        ch.set(R === 0 ? pA : pB);
        const p = pV.copy(P0).add(c).addScaledVector(n, s === 0 ? w : -w);
        p.lerp(tB.set(P0.x + sgn * POLL.d, P0.y + (s === 0 ? POLL.d : -POLL.d), 0), rel);
        st.pGrain[i].copy(p);
        if (sp1 > 0.01) fibres(0, tB.copy(P0).add(tC.set(sgn * 6.0, 0, 0)), p, d);
        if (sp2 > 0.01) fibres(1, tB.copy(P0).add(c).addScaledVector(ax2, s === 0 ? 3.6 : -3.6), p, d);
        let k = s === 1 && rep < 0.02 ? 0 : kT;
        const dir = qV.copy(d), grainP = gV.copy(p), nucS = sc.set(NUC.x, NUC.y, NUC.z);
        let nucOp = nuc;
        // the grain that lands: to the stigma, then its sperm nucleus down the tube and into the egg
        if (i === 0 && f > 0) {
          const b = move, q = 1 - b;
          grainP.set(q * q * p.x + 2 * q * b * -3 + b * b * LAND.x, q * q * p.y + 2 * q * b * 14 + b * b * LAND.y, q * q * p.z + 2 * q * b * 2 + b * b * LAND.z);
          st.pGrain[0].copy(grainP);
          const ut = clamp(u - 0.07);
          p.copy(grainP).lerp(PATH.getPointAt(ut, tC), leave);
          dir.lerp(PATH.getTangentAt(ut, tC).negate(), leave).normalize();
          k = lerp(kT, 0.6, leave);
          nucS.lerp(tC.set(1.75, 0.75, 0.75), leave);
          if (enter > 0) {
            p.lerp(tB.copy(EGG_C).add(tC.set(0, -0.42 * fuse - 0.1 * (1 - fuse), 0)), enter);
            dir.lerp(X, enter).normalize();
            k = lerp(0.6, 0.78, enter);
            nucS.lerp(tC.set(1.0, 0.75, 0.75), enter);
          }
          nucOp = nuc * (1 - fuse);
          st.sperm.copy(p);
        }
        ch.pose(p, dir, k);
        pNuc[i].pose(p, nucS, 0, nucOp);
        pNuc[i].mesh.quaternion.setFromUnitVectors(X, dir);
        // microspore → pollen grain
        const sp = pSpore[i];
        grainP.y += rel * 0.08 * Math.sin(time * 0.9 + i * 1.7);
        const dim = i === 0 ? 1 : lerp(1, 0.55, win(f, 0, 0.15));
        sp.pose(grainP, tA.setScalar(TET.r * k4).lerp(POLL.s, pol), 0, (k4 > 0.001 ? 1 : 0) * dim);
        tint(sp.mat, COL.cell, COL.pollen, pol);
        sp.mat.uniforms.uA.value = lerp(0.05, 0.16, pol);
      }
    }
    colpusMat.opacity = 0.3 * pol;
    pMNuc.pose(tA.copy(P0).add(V(0, 0.1, 0)), sc.setScalar(3.6), 0, env0);
    pMother.pose(P0, sc.setScalar(PR), 0, 1 - win(m, 0.88, 0.95));
    tint(pMother.mat, COL.cell, COL.callose, win(m, 0.78, 0.88));
    pMother.mat.uniforms.uRimA.value = lerp(0.75, 1.1, win(m, 0.78, 0.88));
    flushSpindle(0, sp1);
    flushSpindle(1, sp2);

    /* fertilization */
    stigMat.uniforms.uOpacity.value = win(f, 0, 0.08) * (1 - win(g, 0, 0.3));
    stigma.visible = f > 0;
    const segs = Math.round(u * TUBE_N);
    tube.visible = tubeTip.visible = segs > 0;
    tube.geometry.setDrawRange(0, segs * TUBE_RAD * 6);
    tubeTip.position.copy(PATH.getPointAt(u));

    /* the Punnett square: headers, then each cell's two gametes meet in turn, then the focal cell lights */
    grid.visible = g > 0;
    if (grid.visible) {
      const hdr = win(g, 0, 0.2);
      for (let j = 0; j < 2; j++) {
        hdrP[j].s.pose(HDR_P(j), sc.copy(POLL.s).multiplyScalar(0.5 * hdr));
        hdrP[j].ch.set(fg[j]);
        hdrP[j].ch.pose(HDR_P(j), X, 0.5 * hdr);
      }
      for (let i = 0; i < 2; i++) {
        hdrE[i].s.pose(HDR_E(i), sc.set(1.7, 1.7, 1.7).multiplyScalar(hdr));
        hdrE[i].ch.set(mg[i]);
        hdrE[i].ch.pose(HDR_E(i), X, 0.5 * hdr);
      }
      const hot = win(g, 0.9, 1.0);
      for (const cl of cells) {
        const k = cl.i * 2 + cl.j, a = 0.22 + k * 0.16, local = win(g, a, a + 0.22);
        const ctr = tC.set(gx(cl.j), gy(cl.i), 0);
        const isHot = cl.i === pick[0] && cl.j === pick[1];
        cl.mat.opacity = 0.85 * hdr;
        cl.mat.color.set(COL.tile).lerp(_ca.set(COL.tileHot), isHot ? hot : 0);
        cl.chE.set(mg[cl.i]);
        cl.chP.set(fg[cl.j]);
        cl.chE.pose(tA.copy(HDR_E(cl.i)).lerp(tB.copy(ctr).add(V(-0.3, 0.33, 0)), local), X, local > 0 ? 0.5 : 0);
        cl.chP.pose(tA.copy(HDR_P(cl.j)).lerp(tB.copy(ctr).add(V(-0.3, -0.33, 0)), local), X, local > 0 ? 0.5 : 0);
        const z = win(local, 0.6, 1);
        cl.zyg.pose(tA.copy(ctr).add(V(-0.3, 0, 0)), sc.set(1.75, 1.45, 1.4).multiplyScalar(z), 0, z);
        cl.pea.visible = z > 0.01;
        cl.pea.position.set(ctr.x + 1.85, ctr.y - 1.85, 0.2);
        cl.pea.scale.setScalar(Math.max(1e-3, z));
        cl.pea.material.color.set(SEED[seedOf(geno(mg[cl.i], fg[cl.j]))]);
        if (isHot) {
          ring.position.set(ctr.x, ctr.y, -2.75);
          ring.scale.setScalar(1 + 0.07 * hot);
          ringMat.opacity = 0.85 * hot;
        }
      }
    }
  }

  /* ---------- labels, info, views, cues ---------- */
  const fmtCount = (gt) => {
    const [a, b] = gt;
    return a === b ? fmt(W.count, { n: PRODUCTS, a }) : [a, b].map((x) => fmt(W.count, { n: PRODUCTS / 2, a: x })).join(W.sep);
  };
  const orOf = (gt) => (gt[0] === gt[1] ? fmt(W.all, { a: gt[0] }) : fmt(W.or, { a: gt[0], b: gt[1] }));
  const seedWord = (gt) => W[seedOf(gt)];
  const bandAt = (c, out) => c.band.getWorldPosition(out);
  const tipOf = (c, out) => out.copy(c.g.position).addScaledVector(tN.copy(UP).applyQuaternion(c.g.quaternion), (CH.L / 2 - CH.cen) * c.g.scale.x);
  const an = {};
  const at = (k) => (an[k] = an[k] || V());
  const egged = (t) => clamp(t.meiosis || 0) >= 0.97;
  const fe = (t) => clamp(t.fert || 0), me = (t) => clamp(t.meiosis || 0), gr = (t) => clamp(t.grid || 0);
  const labels = [
    { key: 'pmc', text: L.pmc.text, sub: () => fmt(st.selfing ? L.pmc.self : L.pmc.cross, { g: st.fg }),
      anchor: () => at('pmc').copy(P0).add(V(0, PR, 0)), show: (t) => me(t) < 0.34 && fe(t) === 0 && gr(t) === 0 },
    { key: 'mmc', text: L.mmc.text, sub: () => fmt(st.selfing ? L.mmc.self : L.mmc.cross, { g: st.mg }),
      anchor: () => at('mmc').copy(E0).add(V(0, EM.y, 0)), show: (t) => me(t) < 0.34 && fe(t) === 0 && gr(t) === 0 },
    { key: 'homologs', text: L.homologs.text, sub: fmt(L.homologs.sub, { n: PAIRS, d: 2 * PAIRS }),
      anchor: () => tipOf(pCh[1][0], at('homologs')), show: (t) => me(t) < 0.1 && gr(t) === 0 },
    { key: 'allele', text: L.allele.text, sub: () => fmt(L.allele.sub, { a: st.eA }),
      anchor: () => bandAt(eCh[0][0], at('allele')), show: (t) => me(t) < 0.1 && gr(t) === 0 },
    { key: 'sisters', text: L.sisters.text, sub: L.sisters.sub,
      anchor: () => tipOf(pCh[0][0], at('sisters')), show: (t) => me(t) >= 0.12 && me(t) < 0.38 },
    { key: 'm1', text: L.m1.text, sub: L.m1.sub,
      anchor: () => at('m1').copy(E0).add(V(ED.x * 0.9, 0, 0)), show: (t) => me(t) >= 0.38 && me(t) < 0.6 },
    { key: 'm2', text: L.m2.text, sub: L.m2.sub,
      anchor: () => at('m2').copy(P0).add(V(0, PR, 0)), show: (t) => me(t) >= 0.62 && me(t) < 0.86 },
    { key: 'megaspores', text: L.megaspores.text, sub: fmt(L.megaspores.sub, { dead: PRODUCTS - 1, all: PRODUCTS }),
      anchor: () => st.dyingAt, show: (t) => me(t) >= 0.86 && me(t) < 0.97 && fe(t) === 0 },
    { key: 'pollen', text: L.pollen.text, sub: () => fmt(L.pollen.sub, { s: fmtCount(st.fg) }),
      anchor: () => at('pollen').copy(P0).add(V(-POLL.d, POLL.d + POLL.s.y, 0)), show: (t) => me(t) >= 0.94 && fe(t) < 0.05 && gr(t) === 0 },
    { key: 'egg', text: L.egg.text, sub: () => fmt(L.egg.sub, { a: st.eA }),
      anchor: () => at('egg').copy(EGG_C).add(V(0, EGG_S.y, 0)), show: (t) => egged(t) && fe(t) < 0.8 && gr(t) === 0 },
    { key: 'stigma', text: L.stigma.text, sub: L.stigma.sub,
      anchor: () => at('stigma').set(5.2, 9.5, 0), show: (t) => fe(t) > 0.02 && fe(t) < 0.4 && gr(t) === 0 },
    { key: 'tube', text: L.tube.text, sub: L.tube.sub,
      anchor: () => PATH.getPointAt(Math.max(0.3, st.u * 0.55), at('tube')), show: (t) => fe(t) > 0.3 && fe(t) < 0.72 && gr(t) === 0 },
    { key: 'sperm', text: L.sperm.text, sub: () => fmt(L.sperm.sub, { a: st.pA }),
      anchor: () => at('sperm').copy(st.sperm).add(V(0, 0.8, 0)), show: (t) => fe(t) > 0.6 && fe(t) < 0.86 && gr(t) === 0 },
    { key: 'zygote', text: L.zygote.text, sub: () => fmt(L.zygote.sub, { g: st.zg, seed: seedWord(st.zg) }),
      anchor: () => at('zygote').copy(EGG_C).add(V(0, EGG_S.y, 0)), show: (t) => fe(t) >= 0.9 && gr(t) === 0 },
    { key: 'gPollen', text: L.gPollen.text, sub: () => orOf(st.fg),
      anchor: () => at('gPollen').copy(G0).add(V(0, 8.3 + POLL.s.y * 0.5, 0)), show: (t) => gr(t) > 0.15 },
    { key: 'gEgg', text: L.gEgg.text, sub: () => orOf(st.mg),
      anchor: () => at('gEgg').copy(G0).add(V(-8.0, GS / 2 + 1.7, 0)), show: (t) => gr(t) > 0.15 },
  ];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const k = i * 2 + j, done = 0.22 + k * 0.16 + 0.2;
      const g = () => geno(st.mg[i], st.fg[j]);
      labels.push({ key: `g${i}${j}`, text: '', sub: () => fmt(L.gCell.sub, { g: g(), seed: seedWord(g()) }),
        anchor: () => at(`g${i}${j}`).set(gx(j) - 0.3, gy(i) + 1.55, 0), show: (t) => gr(t) >= done });
    }
  }

  const I = TX.info;
  const word = (n) => (W.num && W.num[n]) || n;
  const BASE = { n: PAIRS, d: 2 * PAIRS, all: word(PRODUCTS), dead: word(PRODUCTS - 1) };
  const card = (c, vars = {}) => ({ title: fmt(c.title, { ...BASE, ...vars }), text: fmt(c.text, { ...BASE, ...vars }) });
  const chromInfo = (t) => card(me(t) > 0.1 && me(t) < 0.8 ? I.copied : I.chromosome);
  const interactives = [];
  const addChrom = (c, priority = 2) => {
    interactives.push({ root: c.g.children[0], priority, info: chromInfo });
    interactives.push({ root: c.band, priority: priority + 1, info: () => card(I['allele' + c.allele], { a: c.allele }) });
  };
  [...eCh.flat(), ...pCh.flat()].forEach((c) => addChrom(c));
  interactives.push({ root: pMother.mesh, priority: 1, info: (t) => card(me(t) > 0.8 ? I.callose : I.pmc) });
  interactives.push({ root: eMother.mesh, priority: 1, info: () => card(I.mmc) });
  eDyad.forEach((d) => interactives.push({ root: d.mesh, priority: 1, info: () => card(I.dyad) }));
  interactives.push({ root: eTet[0].mesh, priority: 1, info: (t) => (fe(t) >= 0.9 ? card(I.zygote, { g: st.zg, seed: seedWord(st.zg) })
    : egged(t) ? card(I.egg, { a: st.eA }) : card(I.megaspore)) });
  for (let i = 1; i < 4; i++) interactives.push({ root: eTet[i].mesh, priority: 1, info: () => card(I.dying) });
  pSpore.forEach((s, i) => interactives.push({ root: s.mesh, priority: 1,
    info: (t) => card(me(t) >= 0.94 ? I.pollen : I.microspore, { a: pCh[i >> 1][i & 1].allele }) }));
  interactives.push({ root: tube, priority: 1, info: () => card(I.tube) });
  interactives.push({ root: stigma, priority: 0, info: () => card(I.stigma) });
  cells.forEach((cl) => {
    const info = () => { const gt = geno(st.mg[cl.i], st.fg[cl.j]); return card(I.cell, { e: st.mg[cl.i], p: st.fg[cl.j], g: gt, seed: seedWord(gt) }); };
    interactives.push({ root: cl.tile, priority: 1, info });
    interactives.push({ root: cl.zyg.mesh, priority: 2, info });
    interactives.push({ root: cl.pea, priority: 2, info });
  });
  hdrP.forEach((h, j) => interactives.push({ root: h.s.mesh, priority: 2, info: () => card(I.pollen, { a: st.fg[j] }) }));
  hdrE.forEach((h, i) => interactives.push({ root: h.s.mesh, priority: 2, info: () => card(I.egg, { a: st.mg[i] }) }));

  const VIEW = {
    wide: { pos: V(-1.5, 5, 46), target: V(-1.5, 2, 0) },
    tube: { pos: V(-1, 7, 50), target: V(-1, 3.2, 0) },
    egg: { pos: V(6.5, 3, 38), target: V(6, -0.5, 0) },
    zygote: { pos: V(9, 2.5, 26), target: V(9.5, 0.4, 0) },
    grid: { pos: V(-1.2, G0.y + 3.8, 38), target: V(-1.2, G0.y + 1.6, 0) },
  };
  const VIEW_OF = { emasculate: 'wide', pollen: 'wide', pollinate: 'tube', bag: 'tube', ripen: 'egg', guess1: 'zygote', open1: 'zygote',
    sow: 'wide', grow: 'tube', predict: 'zygote', shell: 'zygote', count: 'zygote', punnett: 'grid' };
  const views = [...stepIds.map((id) => VIEW[VIEW_OF[id] || 'wide']), VIEW.grid];

  /* Watch captions: meiosis beats, then fertilization beats, then the square */
  const C = TX.cues;
  const cueM = [[0, ['interphase', 'homologs']], [0.12, ['replicate', 'sisters']], [0.22, ['pair', 'sisters']], [0.38, ['m1', 'm1']],
    [0.62, ['m2', 'm2']], [0.86, ['products', 'megaspores']], [0.95, ['gametes', 'pollen']]];
  const cueF = [[0, ['land', 'stigma']], [0.3, ['tube', 'tube']], [0.68, ['sperm', 'sperm']], [0.82, ['fuse', 'sperm']], [0.92, ['zygote', 'zygote']]];
  const cueG = [[0, ['gridIntro', 'gPollen']], [0.22, ['gridFill', null]], [0.92, ['gridDone', null]]];
  const MEIOSIS_STEPS = new Set(['emasculate', 'pollen', 'grow']);
  function cue(t) {
    const m = me(t), f = fe(t), g = gr(t);
    const vars = { a: st.pA, e: st.eA, g: st.zg, seed: seedWord(st.zg), ...BASE };
    const out = ([k, mark]) => ({ text: fmt(C[k], vars), mark });
    if (t.step === 'punnett' || (t.step == null && g > 0)) {
      const [k, mark] = cueAt(cueG, g);
      if (k !== 'gridDone') return out([k, mark]);
      const tally = {}, seeds = { yellow: 0, green: 0 };
      for (const a of st.mg) for (const b of st.fg) { const x = geno(a, b); tally[x] = (tally[x] || 0) + 1; seeds[seedOf(x)]++; }
      const ratio = Object.keys(tally).sort().map((x) => `${tally[x]} ${x}`).join(' : ');
      return { text: fmt(C.gridDone, { ratio, y: seeds.yellow, n: seeds.yellow + seeds.green }), mark: `g${st.pick[0]}${st.pick[1]}` };
    }
    if (t.step === 'sow' && m === 0 && f === 0) return out(['f1', 'pmc']);
    if (f > 0.001 || (m >= 0.999 && !MEIOSIS_STEPS.has(t.step))) return out(cueAt(cueF, f));
    if (m >= 0.95) return out([st.fg[0] === st.fg[1] ? 'gametes' : 'segregate', 'pollen']);
    return out(cueAt(cueM, m));
  }
  return {
    scene, update, labels, interactives, views, cue,
    fov: 38, near: 0.5, far: 400, minDist: 8, maxDist: 120,
  };
}
