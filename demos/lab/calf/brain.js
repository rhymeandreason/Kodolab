/* Brain level: the membrane between Juniper's blood and an astrocyte, the brain cell whose
 * endfeet wrap the vessel. A world for Lab's zoom.js. Illustrative scale: beads are molecules,
 * the box is ~15 nm across, the membrane is drawn ~2× thick.
 *
 * It follows the bench through st = { na, cellOsm?, mode?, phase? }: blood Na⁺ in mEq/L, what
 * the astrocyte holds (CELL_OSM until it adapts), and which story the cue tells
 * ('night' · 'drip' · 'slow' · 'done').
 *
 * THE MEMBRANE MOVES. The cell side's width is its volume, astroVolume(na, cellOsm) from
 * model.js, so a swollen astrocyte pushes the membrane into the blood side, past a dashed line
 * at its normal size. A real membrane 15 nm across does not slide like this: the width stands
 * for the whole cell's volume, at the model's own percentage. Water beads random-walk and cross,
 * fast through aquaporin-4 and slowly through the bilayer; each crossing is a coin flip weighted
 * toward the same density of water on both sides, so a moving membrane draws a net flow that
 * shows in the tally. Na⁺ and Cl⁻ never cross (the vessel's tight junctions hold them in the
 * blood; this one membrane stands for both barriers). An adapting cell pushes K⁺ beads out
 * through the membrane, where the blood carries them off. */
import * as THREE from 'three';
import { clamp, seeded, T, fmt, LIGHT } from '../lab.js';
import { astroVolume, plasmaOsm, CELL_OSM, HEALTHY_NA, JUNIPER, SAFE_24H } from './model.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TX = T.levels.brain;
const XL = -12, XR = 18, YH = 8, ZH = 4, MEM = 0.7;      // box and membrane half-thickness: the cell side is wider, so its volume change shows
const REST = 0;                                          // the membrane at the cell's normal size
const NW = 360;                                          // water beads
const NCELL = 48;                                        // solute beads inside the cell
const AQP = [[5.5, 2.2], [5.8, -2.1], [2.4, 0.2], [1.6, 2.8], [1.9, -2.8], [-1.2, -1.2], [-1.6, 2.2], [-4.4, 2.6], [-4.6, -0.6], [-5.6, -2.8], [-2.2, -3.0], [3.4, -0.6]];   // (y, z) of each channel
const AQP_R = 1.1;
/* odds per hit. Kept low: a bead that fails stays at the wall and tries again next frame, so
   high odds would let nearly every visit cross either way and wash out the bias */
const P_AQP = 0.85, P_LIPID = 0.04;
const SPEED = 12, TURN = 5;                              // water: units/s, and how hard it turns (per √s)
const STEP = 3;                                          // solute jitter, units/s
const MEM_RATE = 2.5;                                    // 1/s: how fast the membrane follows the model
const EXIT = 6;                                          // units/s an exported K⁺ drifts toward the blood

/** Membrane x for an astrocyte volume v (1 = normal): the cell side is XR − x wide. */
const memAt = (v) => XR - (XR - REST) * v;

export function createBrainLevel(env) {
  const rnd = seeded(23);
  const rand = (a, b) => a + rnd() * (b - a);
  const gauss = () => { let s = 0; for (let i = 0; i < 3; i++) s += rnd() * 2 - 1; return s / 1.7; };
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight('#ffffff', '#dfe6ec', 1.0 * LIGHT));
  const dir = new THREE.DirectionalLight('#ffffff', 0.7 * LIGHT); dir.position.set(4, 9, 8); scene.add(dir);
  const dummy = new THREE.Object3D();

  /* ---------- the two sides, resized every frame to the membrane ---------- */
  const sideGeo = new THREE.BoxGeometry(1, YH * 2, ZH * 2);
  const sideMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const blood = new THREE.Mesh(sideGeo, sideMat('#f3b9b0', 0.2));
  const cell = new THREE.Mesh(sideGeo, sideMat('#c9d8f2', 0.24));
  /* the change from normal size: blue where the cell took on water, amber where it lost it */
  const band = new THREE.Mesh(sideGeo, sideMat('#3b9ee6', 0.4));
  scene.add(blood, cell, band);
  const span = (m, x0, x1) => { m.visible = x1 - x0 > 0.02; m.scale.x = Math.max(0.001, x1 - x0); m.position.x = (x0 + x1) / 2; };

  /* the normal size: a dashed outline where the membrane sits in healthy blood */
  const rest = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    V3(REST, -YH, -ZH), V3(REST, YH, -ZH), V3(REST, YH, ZH), V3(REST, -YH, ZH), V3(REST, -YH, -ZH),
  ]), new THREE.LineDashedMaterial({ color: '#334155', dashSize: 0.55, gapSize: 0.4, transparent: true, opacity: 0.7 }));
  rest.computeLineDistances();
  scene.add(rest);

  /* ---------- the membrane: a bilayer of head beads, with aquaporin tetramers ---------- */
  const memG = new THREE.Group();
  const heads = [];
  for (let y = -YH + 0.4; y < YH; y += 0.75) for (let z = -ZH + 0.4; z < ZH; z += 0.75) {
    if (AQP.some(([ay, az]) => (y - ay) ** 2 + (z - az) ** 2 < (AQP_R + 0.6) ** 2)) continue;
    heads.push([y, z]);
  }
  const headM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshStandardMaterial({ color: '#e7c98a', roughness: 0.6 }), heads.length * 2);
  heads.forEach(([y, z], i) => [-MEM, MEM].forEach((x, s) => {
    dummy.position.set(x, y, z); dummy.updateMatrix(); headM.setMatrixAt(i * 2 + s, dummy.matrix);
  }));
  const core = new THREE.Mesh(new THREE.BoxGeometry(MEM * 2 - 0.5, YH * 2, ZH * 2), new THREE.MeshStandardMaterial({ color: '#f4e4bf', roughness: 0.8, transparent: true, opacity: 0.55 }));
  const aqpMat = new THREE.MeshStandardMaterial({ color: '#3fa7a0', roughness: 0.45 });
  const aqpGroup = new THREE.Group();
  for (const [y, z] of AQP) {
    for (let k = 0; k < 4; k++) {   // four subunits, each with its own pore; drawn as one ring
      const a = k * Math.PI / 2 + Math.PI / 4;
      const sub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, MEM * 2 + 0.9, 12), aqpMat);
      sub.rotation.z = Math.PI / 2;
      sub.position.set(0, y + Math.cos(a) * 0.55, z + Math.sin(a) * 0.55);
      aqpGroup.add(sub);
    }
  }
  memG.add(headM, core, aqpGroup);
  scene.add(memG);

  /* ---------- beads ---------- */
  let m = REST;   // the membrane's x now
  const water = [];
  for (let i = 0; i < NW; i++) {
    const left = rnd() < (REST - XL) / (XR - XL);
    water.push({ p: V3(left ? rand(XL + 0.5, -MEM - 0.4) : rand(MEM + 0.4, XR - 0.5), rand(-YH + 0.3, YH - 0.3), rand(-ZH + 0.3, ZH - 0.3)), v: V3(gauss(), gauss(), gauss()).setLength(SPEED), glow: 0 });
  }
  const waterM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), NW);
  waterM.frustumCulled = false;
  const cWater = new THREE.Color('#5fb4ea'), cGlow = new THREE.Color('#fef08a'), tmpC = new THREE.Color();
  scene.add(waterM);

  // solutes: Na⁺/Cl⁻ pairs in the blood, as many as its osmolality allows; K⁺ and others in the cell.
  // Healthy, both sides hold the same beads per unit width.
  const NION = Math.round(NCELL * (REST - XL) / (XR - REST) * plasmaOsm(HEALTHY_NA) / CELL_OSM / 2) * 2;
  const at = (x0, x1) => V3(rand(x0, x1), rand(-YH + 0.5, YH - 0.5), rand(-ZH + 0.5, ZH - 0.5));
  const ions = Array.from({ length: NION }, () => ({ p: at(XL + 0.6, -MEM - 0.6) }));
  const cellS = Array.from({ length: NCELL }, () => ({ p: at(MEM + 0.6, XR - 0.6), out: 0 }));   // out: 0 in the cell … 1 carried off
  const ionGeo = new THREE.SphereGeometry(0.42, 12, 10);
  const naM = new THREE.InstancedMesh(ionGeo, new THREE.MeshStandardMaterial({ color: '#8b5cf6', roughness: 0.4 }), NION / 2);
  const clM = new THREE.InstancedMesh(ionGeo, new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.4 }), NION / 2);
  const kM = new THREE.InstancedMesh(ionGeo, new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.4 }), NCELL);
  [naM, clM, kM].forEach((mm) => { mm.frustumCulled = false; scene.add(mm); });

  /* ---------- the walk ---------- */
  const inAqp = (p) => AQP.some(([y, z]) => (p.y - y) ** 2 + (p.z - z) ** 2 < AQP_R * AQP_R);
  const tot = { in: 0, out: 0 };   // crossings since the blood was last healthy
  let last = null, na = HEALTHY_NA, cellOsm = CELL_OSM, shownIons = NION, shownCell = NCELL;
  const nIn = () => water.reduce((s, w) => s + (w.p.x > m ? 1 : 0), 0);

  function walk(dt) {
    m += (memAt(astroVolume(na, cellOsm)) - m) * (1 - Math.exp(-MEM_RATE * dt));
    const bIn = m - MEM - XL, cIn = XR - m - MEM;
    // steer the coin toward the same water density on both sides of wherever the membrane is
    const want = NW * cIn / (bIn + cIn);
    const bias = clamp(Math.exp(0.08 * (want - nIn())), 0.5, 2);
    const kick = TURN * Math.sqrt(dt) * SPEED;
    for (const w of water) {
      const was = w.p.x > m;
      w.v.x += gauss() * kick; w.v.y += gauss() * kick; w.v.z += gauss() * kick;
      w.v.setLength(SPEED);
      w.p.addScaledVector(w.v, dt);
      if (w.p.y < -YH + 0.3 || w.p.y > YH - 0.3) { w.v.y *= -1; w.p.y = clamp(w.p.y, -YH + 0.3, YH - 0.3); }
      if (w.p.z < -ZH + 0.3 || w.p.z > ZH - 0.3) { w.v.z *= -1; w.p.z = clamp(w.p.z, -ZH + 0.3, ZH - 0.3); }
      if (w.p.x < XL + 0.3 || w.p.x > XR - 0.3) { w.v.x *= -1; w.p.x = clamp(w.p.x, XL + 0.3, XR - 0.3); }
      const hit = was ? w.p.x < m + MEM + 0.3 : w.p.x > m - MEM - 0.3;
      if (hit) {
        const odds = (inAqp(w.p) ? P_AQP : P_LIPID) * (was ? 1 / bias : bias);
        if (rnd() < odds) { w.p.x = was ? m - MEM - 0.35 : m + MEM + 0.35; w.glow = 1; tot[was ? 'out' : 'in']++; }
        else { w.p.x = was ? m + MEM + 0.35 : m - MEM - 0.35; w.v.x *= -1; }
      }
      w.glow = Math.max(0, w.glow - dt * 1.2);
    }
    const jit = (s, x0, x1) => {
      s.p.x = clamp(s.p.x + gauss() * STEP * dt, x0, x1);
      s.p.y = clamp(s.p.y + gauss() * STEP * dt, -YH + 0.5, YH - 0.5);
      s.p.z = clamp(s.p.z + gauss() * STEP * dt, -ZH + 0.5, ZH - 0.5);
    };
    for (const s of ions) jit(s, XL + 0.6, m - MEM - 0.6);
    cellS.forEach((s, i) => {
      if (i < shownCell) {
        if (s.out > 0) { s.out = 0; s.p.copy(at(m + MEM + 0.6, XR - 0.6)); }   // scrubbed back: it was never exported
        jit(s, m + MEM + 0.6, XR - 0.6);
      } else if (s.out < 1) {
        // exported: through the membrane, then carried off in the blood
        if (s.p.x > m - MEM - 1) s.p.x -= EXIT * dt;
        else s.out = Math.min(1, s.out + dt * 0.8);
        jit(s, XL + 0.6, XR - 0.6);
      }
    });
  }

  function paint() {
    span(blood, XL, m); span(cell, m, XR);
    span(band, Math.min(m, REST), Math.max(m, REST));
    band.material.color.set(m < REST ? '#3b9ee6' : '#f59e0b');
    memG.position.x = m;
    water.forEach((w, i) => {
      dummy.position.copy(w.p); dummy.scale.setScalar(1 + w.glow * 0.5); dummy.updateMatrix();
      waterM.setMatrixAt(i, dummy.matrix);
      waterM.setColorAt(i, tmpC.copy(cWater).lerp(cGlow, w.glow));
    });
    waterM.instanceMatrix.needsUpdate = true; waterM.instanceColor.needsUpdate = true;
    const half = NION / 2;
    for (let i = 0; i < half; i++) {
      const on = i * 2 < shownIons;
      [naM, clM].forEach((mm, j) => {
        dummy.position.copy(ions[i * 2 + j].p); dummy.scale.setScalar(on ? 1 : 1e-4); dummy.updateMatrix(); mm.setMatrixAt(i, dummy.matrix);
      });
    }
    cellS.forEach((s, i) => { dummy.position.copy(s.p); dummy.scale.setScalar(Math.max(1e-4, 1 - s.out)); dummy.updateMatrix(); kM.setMatrixAt(i, dummy.matrix); });
    [naM, clM, kM].forEach((mm) => { mm.instanceMatrix.needsUpdate = true; });
  }

  function update(st, time) {
    na = st.na;
    cellOsm = st.cellOsm || CELL_OSM;
    shownCell = Math.round(NCELL * cellOsm / CELL_OSM);
    if (na >= HEALTHY_NA - 0.5) { tot.in = 0; tot.out = 0; }
    shownIons = Math.round(NION * plasmaOsm(na) / plasmaOsm(HEALTHY_NA) / 2) * 2;
    const dt = last == null ? 0 : Math.min(0.05, time - last);
    last = time;
    if (dt > 0) walk(dt);
    paint();
  }

  /* ---------- labels, hover info, cues ---------- */
  const aq = AQP[0];
  const off = () => Math.abs(m - REST) > 0.35;
  const labels = [
    { key: 'blood', ...TX.labels.blood, anchor: () => V3((XL + m) / 2, YH + 0.6, 0), show: () => true },
    { key: 'cell', ...TX.labels.cell, anchor: () => V3((m + XR) / 2, YH + 0.6, 0), show: () => true },
    { key: 'aqp', ...TX.labels.aqp, anchor: () => V3(m, aq[0] + 1, aq[1]), show: () => !off() },
    { key: 'bilayer', ...TX.labels.bilayer, anchor: () => V3(m, -YH + 1, ZH - 1), show: () => !off() },
    { key: 'normal', ...TX.labels.normal, anchor: () => V3(REST, -YH, ZH), show: off },
  ];
  const interactives = [
    { root: aqpGroup, priority: 2, info: () => TX.info.aqp },
    { root: waterM, priority: 1, info: () => TX.info.water },
    { root: headM, priority: 0, info: () => TX.info.bilayer },
  ];
  function cue(st) {
    const v = astroVolume(st.na, st.cellOsm || CELL_OSM), pct = Math.round((v - 1) * 100);
    if (st.mode === 'done') return { text: TX.cues.done, mark: 'normal' };
    if (st.mode === 'slow') {
      if (st.phase === 'adapt') return { text: TX.cues.adapt, mark: 'cell' };
      if (st.phase === 'fast') return { text: fmt(TX.cues.fast, { na: HEALTHY_NA, pct: -pct }), mark: 'normal' };
      return { text: fmt(TX.cues.limit, { limit: SAFE_24H }), mark: 'normal' };
    }
    if (st.mode === 'drip') {
      const key = st.na < JUNIPER.na - 0.3 ? 'dripWorse' : st.na > JUNIPER.na + 0.5 ? 'dripShrink' : 'dripStill';
      return { text: fmt(TX.cues[key], { pct }), mark: 'normal' };
    }
    if (st.na >= HEALTHY_NA - 2) return { text: TX.cues.even, mark: 'aqp' };
    if (pct >= 15) return { text: fmt(TX.cues.swollen, { pct }), mark: 'normal' };
    if (st.na > 128) return { text: TX.cues.tight, mark: 'blood' };
    return { text: TX.cues.falling + ' · ' + fmt(TX.tally, tally()), mark: 'cell' };
  }
  const tally = () => ({ in: tot.in, out: tot.out, cell: nIn(), total: NW });

  return {
    scene, labels, interactives, update, cue, tally,
    get membrane() { return m; },
    fov: 34, near: 0.1, far: 200, minDist: 12, maxDist: 90,
    views: [{ pos: V3(-2, 8, 60), target: V3(3, 1.5, 0) }],
  };
}
