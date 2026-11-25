/* Molecule level (≈50 nm): a patch of pigment-granule membrane in a pigment cell of the pupal eye.
 * 1 unit = 1 nm. Cytoplasm up, the granule's inside down; the patch curves gently, as the surface
 * of a granule a few hundred nm across.
 *
 * White is a half ABC transporter of the ABCG family: an N-terminal nucleotide-binding domain (NBD)
 * in the cytoplasm, then a six-helix transmembrane domain. It pairs with Brown (the guanine pump,
 * toward the red drosopterins) or with Scarlet (the 3-hydroxykynurenine pump, toward the brown
 * ommochromes). No structure of White, Brown or Scarlet has been deposited, so the halves are a
 * schematic in the proportions of human ABCG2 (cryo-EM, PDB 6VXI): the two TMDs side by side in
 * the bilayer, the NBDs below them on the cytoplasmic side.
 *
 * One stroke, as for any ABC transporter: inward-open, the precursor enters the cavity from the
 * cytoplasm; two ATP bind at the NBD interface (front and back, about the dimer's 2-fold axis) and
 * the NBDs close, flipping the TMDs to face the granule; the precursor leaves into the granule;
 * ATP is split, phosphate and ADP leave, and the pump resets.
 *
 * What the state drives: the offspring's genotype (mother[pick[0]], father[pick[1]]) sets how many
 * White halves there are, and t.pigment how full the granule is. A male's one X is read about twice
 * as hard (dosage compensation), so X^W Y draws as many Whites as X^W X^W; X^W X^w draws half;
 * no X^W, none, and Brown and Scarlet sit alone and idle. `time` only runs the pump strokes and
 * the drifting precursors, and only while the granule is filling. */
import * as THREE from 'three';
import { LIGHT } from '../core/three-compat.js';
import { clamp, smooth } from '../core/math.js';
import { T, fmt } from '../lab.js';

const LEVELS = T.levels;
const PAL = globalThis.MolPalette;

const GRANULE_R = 250;                 // nm, the curvature of the patch
const PATCH = { x: 30, back: -22, front: 4 };   // x half-extent; z runs back to front, the front a cut face
const HALF_T = 2.0, HEAD_R = 0.34, HEAD_GAP = 0.85;   // bilayer half-thickness to the head centres; lipid head spacing
const SLOTS = [V3(-19.5, 0, 1.2), V3(-6.5, 0, 0.6), V3(6.5, 0, 1.2), V3(19.5, 0, 0.6)];   // Brown, Scarlet, Brown, Scarlet: at the cut face
const PARTNER = ['brown', 'scarlet', 'brown', 'scarlet'];
const WHITES_PER_DOSE = 2;             // White halves drawn per working X^W dose
const HX = 2.0, NBD_Y = 5.1, LINK_Y = 3.15, NBD_OPEN = 0.75;
const HELIX = [[-0.85, -1.05], [0.25, -1.25], [1.1, -0.45], [1.0, 0.75], [-0.05, 1.2], [-0.95, 0.25]];
const TILT = 0.17;
const RATE = { 4: 1.4, 2: 1.06 };      // granule fill per unit pigment, by White count: one dose still fills by the end
const N_DEPOSIT = 1700, N_FREE = 10;
const COL = {
  white: '#4257c6', brown: '#23907a', scarlet: '#8846c4', alone: '#9aa0ac',
  head: '#d6c49c', core: '#f0dfa8', tail: '#cdae5e', guanine: '#d0685a', hk: '#d6990f',
  drosopterin: '#a3170f', ommochrome: '#4d2813', base: '#6684c8', ribose: '#c2ae6c',
};
function V3(x = 0, y = 0, z = 0) { return new THREE.Vector3(x, y, z); }
const ramp = (x, a, b) => smooth(clamp((x - a) / (b - a)));
const yMem = (x, z) => -(x * x + z * z) / (2 * GRANULE_R);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* a lumpy sphere: says "a folded domain is here", nothing about its fold */
function blobGeometry(seed) {
  const g = new THREE.SphereGeometry(1, 40, 28), p = g.attributes.position, R = rng(seed);
  const waves = Array.from({ length: 4 }, () => ({ d: V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), f: 0.8 + R() * 1.2, ph: R() * 6, a: 0.04 + R() * 0.04 }));
  const v = V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 1;
    for (const w of waves) k += w.a * Math.sin(w.f * v.dot(w.d) * Math.PI + w.ph);
    v.multiplyScalar(k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createMolecule(env, { stepIds = [] } = {}) {
  const TX = LEVELS.mol, L = TX.labels, I = TX.info, W = TX.words, CU = TX.cues;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe6e0dc, 0.6 * LIGHT));
  const key = new THREE.DirectionalLight(0xffffff, 0.95 * LIGHT);
  key.position.set(-30, 60, 50);
  scene.add(key);
  const back = new THREE.DirectionalLight(0xfff0f0, 0.35 * LIGHT);
  back.position.set(40, -30, -60);
  scene.add(back);
  const root = new THREE.Group();
  scene.add(root);
  const tmp = V3(), tmp2 = V3(), mat4 = new THREE.Matrix4(), qI = new THREE.Quaternion();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, envMapIntensity: 0.4, ...extra });
  const P_COL = PAL ? PAL.atoms.P : 0xe07b1f;

  /* ---------- the membrane: two leaflets of heads, a pale core between, thinning at the edge ---------- */
  const R = rng(5113), heads = [];
  const footprint = (x, z) => SLOTS.some((s) => Math.abs(x - s.x) < 5.4 && z > s.z - 2.8);   // and the heads in front of a pump, so it shows
  for (const side of [1, -1]) {
    for (let x = -PATCH.x; x <= PATCH.x; x += HEAD_GAP) {
      for (let k = 0, z = PATCH.back; z <= PATCH.front; z += HEAD_GAP * 0.866, k++) {
        const hx = x + (k % 2) * HEAD_GAP / 2 + (R() - 0.5) * 0.25, hz = Math.min(PATCH.front, z + (R() - 0.5) * 0.25);
        const e = Math.max(Math.abs(hx) / PATCH.x, (PATCH.front - hz) / (PATCH.front - PATCH.back));
        if (e > 1 || footprint(hx, hz)) continue;
        heads.push({ p: V3(hx, yMem(hx, hz) + side * HALF_T + (R() - 0.5) * 0.15, hz), s: 1 - ramp(e, 0.86, 1) * 0.8 });
      }
    }
  }
  /* the cut face: two tails under each front-row head, down to the bilayer's middle */
  const front = heads.filter((h) => h.p.z > PATCH.front - 0.75 && h.s > 0.99);
  const tailMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 5), std(COL.tail, { roughness: 0.9 }), front.length * 2);
  front.forEach((h, i) => {
    const side = Math.sign(h.p.y - yMem(h.p.x, h.p.z)), len = HALF_T - 0.45;
    for (let k = 0; k < 2; k++) {
      tmp.set(h.p.x + (k ? 0.14 : -0.14), h.p.y - side * (HEAD_R + len / 2 - 0.05), h.p.z + 0.05);
      tailMesh.setMatrixAt(i * 2 + k, mat4.compose(tmp, qI, tmp2.set(1, len, 1)));
    }
  });
  root.add(tailMesh);
  const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(HEAD_R, 8, 6), std(COL.head, { roughness: 0.85 }), heads.length);
  heads.forEach((h, i) => headMesh.setMatrixAt(i, mat4.compose(h.p, qI, tmp.setScalar(h.s))));
  root.add(headMesh);
  const coreGeo = new THREE.PlaneGeometry(PATCH.x * 2 - 1, PATCH.front - PATCH.back, 48, 24);
  coreGeo.rotateX(-Math.PI / 2);
  coreGeo.translate(0, 0, (PATCH.front + PATCH.back) / 2);
  { const p = coreGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, yMem(p.getX(i), p.getZ(i))); coreGeo.computeVertexNormals(); }
  const coreMat = std(COL.core, { transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.renderOrder = -1;     // drawn first, so the pumps through it are not veiled by three sheets
  root.add(core);
  const coreTop = core.clone(), coreBot = core.clone();
  coreTop.position.y = HALF_T * 0.55; coreBot.position.y = -HALF_T * 0.55;
  root.add(coreTop, coreBot);

  /* ---------- half transporters ---------- */
  const helixGeo = new THREE.CapsuleGeometry(0.5, 4.4, 4, 12);
  const NBD_GEO = [blobGeometry(31), blobGeometry(77)];
  const linkGeo = blobGeometry(53);
  function makeHalf(color, seed) {
    const g = new THREE.Group(), mat = std(color, { transparent: true, opacity: 1 });
    const helices = HELIX.map(() => { const m = new THREE.Mesh(helixGeo, mat); g.add(m); return m; });
    const nbd = new THREE.Mesh(NBD_GEO[seed % 2], mat);
    nbd.scale.set(2.1, 1.55, 1.9);
    const link = new THREE.Mesh(linkGeo, mat);
    link.scale.set(1.75, 0.75, 1.55);
    link.position.y = LINK_Y;
    g.add(nbd, link);
    root.add(g);
    const h = { g, mat, nbd, link, helices, color };
    /* sx: −1 left half, +1 right, 0 alone; o: 0 inward-open, 1 ATP-bound and outward-facing */
    h.pose = (base, sx, o, op = 1) => {
      g.visible = op > 0.01;
      if (!g.visible) return;
      const s = sx || 1;
      g.position.copy(base).add(tmp.set(sx * HX, 0, 0));
      g.rotation.y = s > 0 ? Math.PI : 0;   // the second half is the first turned about the 2-fold axis
      const tilt = sx ? TILT * (2 * o - 1) : -TILT * 0.4;
      helices.forEach((m, i) => {
        const [hx, hz] = HELIX[i];
        m.position.set(hx, 0, hz);
        m.rotation.set(0, 0, -tilt);
      });
      nbd.position.set(sx ? -NBD_OPEN * (1 - o) : 0, NBD_Y, 0);
      link.position.x = sx ? -0.3 * (1 - o) : 0;
      mat.opacity = op;
      mat.depthWrite = op > 0.99;
    };
    return h;
  }
  const pumps = SLOTS.map((s, i) => ({
    base: V3(s.x, yMem(s.x, s.z), s.z),
    white: makeHalf(COL.white, i * 2),
    partner: makeHalf(COL[PARTNER[i]], i * 2 + 1),
    kind: PARTNER[i],
    on: new THREE.Color(COL[PARTNER[i]]), off: new THREE.Color(COL[PARTNER[i]]).lerp(new THREE.Color(COL.alone), 0.3),
  }));

  /* ---------- small molecules: ATP (base, ribose, three phosphates), phosphate, precursors, pigment ---------- */
  const sph = (r) => new THREE.SphereGeometry(r, 14, 10);
  const pMat = std(P_COL, { roughness: 0.35, transparent: true }), baseMat = std(COL.base, { transparent: true }), riboMat = std(COL.ribose, { transparent: true });
  function makeATP() {
    const g = new THREE.Group();
    const bm = baseMat.clone(), rm = riboMat.clone(), pm = pMat.clone();
    const parts = [[sph(0.36), bm, -0.75, 0.15], [sph(0.28), rm, -0.15, -0.05], [sph(0.22), pm, 0.3, 0], [sph(0.22), pm, 0.68, 0.05], [sph(0.22), pm, 1.06, 0]];
    const meshes = parts.map(([geo, m, x, y]) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, 0); g.add(me); return me; });
    root.add(g);
    return { g, gamma: meshes[4] };
  }
  const atps = pumps.map(() => [makeATP(), makeATP()]);
  const pis = pumps.map(() => [0, 1].map(() => { const m = new THREE.Mesh(sph(0.24), pMat); root.add(m); return m; }));
  const precursor = (kind) => {
    const g = new THREE.Group(), m = std(COL[kind], { transparent: true });
    const parts = kind === 'guanine' ? [[0.34, 0, 0], [0.3, 0.52, 0.1]] : [[0.32, 0, 0], [0.22, 0.48, 0.12], [0.2, 0.82, -0.1]];
    for (const [r, x, y] of parts) { const me = new THREE.Mesh(sph(r), m); me.position.set(x, y, 0); g.add(me); }
    root.add(g);
    return { g, m };
  };
  const cargo = pumps.map((p) => precursor(p.kind === 'brown' ? 'guanine' : 'hk'));
  const free = Array.from({ length: N_FREE * 2 }, (_, i) => {
    const kind = i < N_FREE ? 'guanine' : 'hk', Rf = rng(900 + i);
    return { ...precursor(kind), kind, home: V3((Rf() - 0.5) * 54, 9 + Rf() * 6, -14 + Rf() * 16), ph: Rf() * 6.3, sp: 0.3 + Rf() * 0.3 };
  });
  /* pigment inside the granule: drosopterin red and ommochrome brown, appearing as the granule fills */
  const Rd = rng(2207), dep = [];
  for (let i = 0; i < N_DEPOSIT; i++) {
    const x = (Rd() - 0.5) * 2 * (PATCH.x - 1), z = PATCH.back + 1 + Rd() * (PATCH.front - PATCH.back - 2.2), y = yMem(x, z) - HALF_T - 1.5 - Math.pow(Rd(), 0.8) * 11;
    dep.push({ p: V3(x, y, z), r: 0.4 + Rd() * 0.35, red: Rd() < 0.55, at: Rd() });
  }
  dep.sort((a, b) => a.at - b.at);
  const depMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std('#ffffff', { roughness: 0.6 }), N_DEPOSIT);
  const cR = new THREE.Color(COL.drosopterin), cB = new THREE.Color(COL.ommochrome);
  dep.forEach((d, i) => { depMesh.setMatrixAt(i, mat4.compose(d.p, qI, tmp.setScalar(d.r))); depMesh.setColorAt(i, d.red ? cR : cB); });
  depMesh.count = 0;
  root.add(depMesh);

  /* ---------- state ---------- */
  const S = { nW: 0, doses: 0, fill: 0, pig: 0, male: false, active: false };
  function genotype(t) {
    const mg = t.mother || ['W', 'W'], fg = t.father || ['w', 'Y'], pick = t.pick || [0, 1];
    const e = mg[pick[0]], p = fg[pick[1]], male = p === 'Y';
    const nAlleles = (e === 'W' ? 1 : 0) + (p === 'W' ? 1 : 0);
    const doses = male ? 2 * nAlleles : nAlleles;   // dosage compensation doubles the male's one X
    return { male, nAlleles, doses };
  }
  const phase = (i, time) => (time * 0.27 + i * 0.29) % 1;

  function update(t, time) {
    t = t || {};
    const gt = genotype(t), pig = clamp(t.pigment || 0);
    S.male = gt.male; S.nAlleles = gt.nAlleles; S.doses = gt.doses; S.nW = Math.min(4, gt.doses * WHITES_PER_DOSE); S.pig = pig;
    S.fill = S.nW ? clamp(pig * RATE[S.nW]) : 0;
    S.active = S.nW > 0 && pig > 0.004 && S.fill < 0.999;
    pumps.forEach((p, i) => {
      const hasW = i < S.nW;
      const ph = phase(i, time);
      const run = S.active && hasW;
      const o = run ? ramp(ph, 0.30, 0.45) * (1 - ramp(ph, 0.76, 0.94)) : 0;
      p.o = o;
      p.white.pose(p.base, -1, o, hasW ? 1 : 0);
      p.partner.pose(p.base, hasW ? 1 : 0, o, hasW ? 1 : 0.85);
      p.partner.mat.color.copy(hasW ? p.on : p.off);
      // ATP: arrive, bind at the interface, split; the phosphate leaves, then the ADP
      for (let k = 0; k < 2; k++) {
        const a = atps[i][k], pi = pis[i][k], zs = k === 0 ? 1 : -1;
        const site = tmp.copy(p.base).add(tmp2.set(0, NBD_Y - 0.2, zs * 1.15));
        const arrive = ramp(ph, 0.1 + k * 0.05, 0.3 + k * 0.03), split = ramp(ph, 0.6, 0.66), leave = ramp(ph, 0.8, 0.96);
        a.g.visible = run && arrive > 0.001 && leave < 0.999;
        if (a.g.visible) {
          const from = tmp2.copy(p.base).add(V3(zs * 2.5, NBD_Y + 5.5, zs * 3.5));
          a.g.position.copy(from).lerp(site, arrive);
          a.g.position.lerp(tmp2.copy(p.base).add(V3(-zs * 2.5, NBD_Y + 5.5, zs * 3.8)), leave);
          a.g.rotation.set(0, zs * 0.6, (1 - arrive) * 1.2);
          a.gamma.visible = split < 0.5;
          const op = 1 - leave;
          a.g.children.forEach((c) => { c.material.opacity = op; });
        }
        pi.visible = run && split > 0.5 && ph < 0.86;
        if (pi.visible) {
          const u = ramp(ph, 0.64, 0.84);
          pi.position.copy(site).add(tmp2.set(0.9 + u * 2.5 * zs, u * 4.5, zs * (0.4 + u * 2.5)));
          pi.scale.setScalar(1 - ramp(ph, 0.76, 0.86));
        }
      }
      // the precursor: into the cavity, down through the open TMDs, out into the granule
      const c = cargo[i];
      c.g.visible = run && ph < 0.66;
      if (c.g.visible) {
        const b = p.base, inn = ramp(ph, 0, 0.25), down = ramp(ph, 0.32, 0.47), out = ramp(ph, 0.47, 0.65);
        c.g.position.copy(b).add(V3(-3.2, 8.5, 2.2)).lerp(tmp2.copy(b).add(V3(0, 1.3, 0)), inn);
        c.g.position.lerp(tmp2.copy(b).add(V3(0, -2.1, 0)), down);
        c.g.position.lerp(tmp2.copy(b).add(V3(0.8, -6.5, 1.2)), out);
        c.g.rotation.set(time * 0.7, time * 0.5 + i, 0);
        c.m.opacity = 1 - ramp(ph, 0.55, 0.65);
      }
    });
    free.forEach((m, i) => {
      m.g.visible = true;
      const w = time * m.sp + m.ph;
      m.g.position.copy(m.home).add(tmp.set(Math.sin(w) * 1.6, Math.sin(w * 1.3 + i) * 0.9, Math.cos(w * 0.8) * 1.2));
      m.g.rotation.set(w, w * 0.7, 0);
    });
    depMesh.count = Math.round(S.fill * N_DEPOSIT);
    depMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- labels, info, views, cues ---------- */
  const an = {};
  const at = (k) => (an[k] = an[k] || V3());
  const top = (h, out, dy = 0) => out.copy(h.nbd.position).applyMatrix4(h.g.matrixWorld).add(tmp.set(0, 1.6 + dy, 0));
  const hasW = (i) => i < S.nW;
  const nearest = (kind, p) => free.reduce((b, m, i) => (m.kind === kind && (b < 0 || m.home.distanceTo(p) < free[b].home.distanceTo(p)) ? i : b), -1);
  const TAG = { g: nearest('guanine', V3(-15, 12, -4)), h: nearest('hk', V3(15, 12, -4)) };
  const firstAlone = (kind) => { const i = pumps.findIndex((p, k) => p.kind === kind && !hasW(k)); return i < 0 ? 0 : i; };
  const fillWord = () => (S.fill >= 0.999 ? W.full : S.fill > 0.01 ? W.filling : W.empty);
  const labels = [
    { key: 'membrane', text: L.membrane.text, sub: L.membrane.sub, anchor: () => at('m').set(-14, yMem(14, PATCH.front) - HALF_T - 0.4, PATCH.front), show: () => S.pig < 0.01 },
    { key: 'cytoplasm', text: L.cytoplasm.text, anchor: () => at('c').set(0, 15, -6), show: () => S.pig < 0.01 },
    /* a White sits 4 nm from its partner, closer than two tags fit, so each tag takes a different pump */
    { key: 'white', text: L.white.text, sub: L.white.sub, anchor: () => top(pumps[S.nW === 4 ? 2 : 0].white, at('w')), show: () => S.nW > 0 },
    { key: 'brown', text: L.brown.text, sub: L.brown.sub, anchor: () => top(pumps[0].partner, at('b')), show: () => S.nW === 4 },
    { key: 'scarlet', text: L.scarlet.text, sub: L.scarlet.sub, anchor: () => top(pumps[3].partner, at('s')), show: () => S.nW === 4 },
    { key: 'brownAlone', text: L.brownAlone.text, sub: L.brownAlone.sub, anchor: () => top(pumps[firstAlone('brown')].partner, at('ba')), show: () => S.nW < 4 },
    { key: 'scarletAlone', text: L.scarletAlone.text, sub: L.scarletAlone.sub, anchor: () => top(pumps[firstAlone('scarlet')].partner, at('sa')), show: () => S.nW < 4 },
    { key: 'atp', text: L.atp.text, sub: L.atp.sub, anchor: () => at('a').copy(atps[1][0].g.position).add(V3(0, 0.6, 0)), show: () => S.active && atps[1][0].g.visible },
    { key: 'guanine', text: L.guanine.text, sub: L.guanine.sub, anchor: () => at('g').copy(free[TAG.g].g.position).add(V3(0, 0.5, 0)), show: () => S.pig > 0.004 && S.fill < 0.999 },
    { key: 'hk', text: L.hk.text, sub: L.hk.sub, anchor: () => at('h').copy(free[TAG.h].g.position).add(V3(0, 0.5, 0)), show: () => S.pig > 0.004 && S.fill < 0.999 },
    { key: 'lumen', text: L.lumen.text, sub: () => fmt(L.lumen.sub, { fill: fillWord() }), anchor: () => at('l').set(4, -9, PATCH.front - 1), show: () => S.pig > 0.004 },
  ];
  const whiteInfo = () => ({ title: I.white.title, text: S.nAlleles === 1 ? `${I.white.text} ${I.dose.text}` : I.white.text });
  const interactives = [
    { root: headMesh, priority: 0, info: () => I.membrane },
    { root: depMesh, priority: 1, info: () => I.pigment },
  ];
  pumps.forEach((p, i) => {
    interactives.push({ root: p.white.g, priority: 2, info: whiteInfo });
    interactives.push({ root: p.partner.g, priority: 2, info: () => (hasW(i) ? I[p.kind] : I.alone) });
    atps[i].forEach((a) => interactives.push({ root: a.g, priority: 3, info: () => I.atp }));
    pis[i].forEach((m) => interactives.push({ root: m, priority: 3, info: () => I.atp }));
    interactives.push({ root: cargo[i].g, priority: 3, info: () => (p.kind === 'brown' ? I.guanine : I.hk) });
  });
  free.forEach((m) => interactives.push({ root: m.g, priority: 2, info: () => (m.kind === 'guanine' ? I.guanine : I.hk) }));

  const OVER = { pos: V3(2, 7, 74), target: V3(2, 0.5, 0) };
  const WORK = { pos: V3(2, 5, 62), target: V3(2, 1.5, 0) };
  const VIEW_OF = { hatch1: WORK, count1: OVER, hatch2: WORK, count2: OVER, test: OVER, wait1: WORK, wait2: WORK, clear1: WORK, clear2: WORK };
  const views = [...stepIds.map((id) => VIEW_OF[id] || OVER), OVER];

  const EARLY = new Set(['knock', 'sort', 'setup', 'predict1', 'mate2', 'predict2']);
  function cue(t) {
    if (!t) return null;
    const pig = clamp(t.pigment || 0);
    if (EARLY.has(t.step) && pig < 0.004) return { text: CU.before, mark: 'membrane' };
    const gt = genotype(t), nW = Math.min(4, gt.doses * WHITES_PER_DOSE);
    if (!nW) return pig < 0.4 ? { text: CU.none, mark: 'brownAlone' } : { text: CU.empty, mark: 'lumen' };
    const fill = clamp(pig * RATE[nW]);
    const note = gt.nAlleles === 1 && !gt.male ? CU.half : undefined;
    if (pig < 0.004) return { text: CU.idle, mark: 'white' };
    if (fill < 0.35) return { text: CU.pump, mark: 'white', note };
    if (fill < 0.999) return { text: CU.fill, mark: 'lumen', note };
    return { text: CU.full, mark: 'lumen', note };
  }

  /* the circle and the backdrop warm toward the eye's red as the granule fills */
  const RED = new THREE.Color('#e8c4bd');
  return {
    scene, update, labels, interactives, views, cue,
    fov: 38, near: 0.5, far: 1000, minDist: 12, maxDist: 160,
    insetBg: (bg) => bg.clone().lerp(RED, S.fill * 0.6),
  };
}
