/* Brain level: the membrane between Juniper's blood and an astrocyte, the brain cell whose
 * endfeet wrap the vessel. A world for Lab's zoom.js. Illustrative scale: beads are molecules,
 * the box is ~15 nm across, the membrane is drawn ~2× thick.
 *
 * It follows the bench through st = { na }: blood Na⁺ in mEq/L. Water beads random-walk and
 * cross the membrane, fast through aquaporin-4 and slowly through the bilayer. Na⁺ and Cl⁻
 * never cross (the vessel's tight junctions hold them in the blood; this one membrane stands
 * for both barriers). Each crossing is a coin flip, weighted toward the split
 *   water in cell / water in blood = astroVolume(na),
 * the Boyle–van 't Hoff volume from model.js. So the net flow is the model's, and every
 * individual bead still moves at random, both ways. */
import * as THREE from 'three';
import { clamp, seeded, T, fmt, LIGHT } from '../lab.js';
import { astroVolume, plasmaOsm, CELL_OSM, HEALTHY_NA } from './model.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TX = T.levels.brain;
const XL = -12, XR = 12, YH = 8, ZH = 5, MEM = 0.7;      // box and membrane half-thickness
const NW = 320;                                          // water beads
const NCELL = 34;                                        // solute beads inside the cell
const AQP = [[5.5, 2.6], [5.8, -2.4], [2.4, 0.2], [1.6, 3.6], [1.9, -3.4], [-1.2, -1.2], [-1.6, 2.4], [-4.4, 3.4], [-4.6, -0.6], [-5.6, -3.6], [-2.2, -3.8], [3.4, -0.6]];   // (y, z) of each channel
const AQP_R = 1.1;
/* odds per hit. Kept low: a bead that fails stays at the wall and tries again next frame, so
   high odds would let nearly every visit cross either way and wash out the bias */
const P_AQP = 0.85, P_LIPID = 0.04;
const SPEED = 12, TURN = 5;                              // water: units/s, and how hard it turns (per √s)
const STEP = 3;                                          // solute jitter, units/s

export function createBrainLevel(env) {
  const rnd = seeded(23);
  const rand = (a, b) => a + rnd() * (b - a);
  const gauss = () => { let s = 0; for (let i = 0; i < 3; i++) s += rnd() * 2 - 1; return s / 1.7; };
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight('#ffffff', '#dfe6ec', 1.0 * LIGHT));
  const dir = new THREE.DirectionalLight('#ffffff', 0.7 * LIGHT); dir.position.set(4, 9, 8); scene.add(dir);
  const dummy = new THREE.Object3D();

  /* ---------- the two sides ---------- */
  const side = (x0, x1, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, YH * 2, ZH * 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }));
    m.position.set((x0 + x1) / 2, 0, 0); scene.add(m);
  };
  side(XL, -MEM, '#f3b9b0');   // plasma
  side(MEM, XR, '#c9d8f2');    // cytoplasm

  /* ---------- the membrane: a bilayer of head beads, with aquaporin tetramers ---------- */
  const heads = [];
  for (let y = -YH + 0.4; y < YH; y += 0.75) for (let z = -ZH + 0.4; z < ZH; z += 0.75) {
    if (AQP.some(([ay, az]) => (y - ay) ** 2 + (z - az) ** 2 < (AQP_R + 0.6) ** 2)) continue;
    heads.push([y, z]);
  }
  const headM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshStandardMaterial({ color: '#e7c98a', roughness: 0.6 }), heads.length * 2);
  heads.forEach(([y, z], i) => [-MEM, MEM].forEach((x, s) => {
    dummy.position.set(x, y, z); dummy.updateMatrix(); headM.setMatrixAt(i * 2 + s, dummy.matrix);
  }));
  scene.add(headM);
  const core = new THREE.Mesh(new THREE.BoxGeometry(MEM * 2 - 0.5, YH * 2, ZH * 2), new THREE.MeshStandardMaterial({ color: '#f4e4bf', roughness: 0.8, transparent: true, opacity: 0.55 }));
  scene.add(core);
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
  scene.add(aqpGroup);

  /* ---------- beads ---------- */
  const water = [];
  for (let i = 0; i < NW; i++) {
    const left = i % 2 === 0;
    water.push({ p: V3(left ? rand(XL + 0.5, -MEM - 0.4) : rand(MEM + 0.4, XR - 0.5), rand(-YH + 0.3, YH - 0.3), rand(-ZH + 0.3, ZH - 0.3)), v: V3(gauss(), gauss(), gauss()).setLength(SPEED), glow: 0 });
  }
  const waterM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), NW);
  waterM.frustumCulled = false;
  const cWater = new THREE.Color('#5fb4ea'), cGlow = new THREE.Color('#fef08a'), tmpC = new THREE.Color();
  scene.add(waterM);

  // solutes: Na⁺/Cl⁻ pairs in the blood, as many as its osmolality allows; K⁺ and others in the cell
  const NION = Math.round(NCELL * plasmaOsm(HEALTHY_NA) / CELL_OSM / 2) * 2;
  const solute = (n, x0, x1) => Array.from({ length: n }, () => ({ p: V3(rand(x0, x1), rand(-YH + 0.5, YH - 0.5), rand(-ZH + 0.5, ZH - 0.5)), x0, x1 }));
  const ions = solute(NION, XL + 0.6, -MEM - 0.6), cellS = solute(NCELL, MEM + 0.6, XR - 0.6);
  const ionGeo = new THREE.SphereGeometry(0.42, 12, 10);
  const naM = new THREE.InstancedMesh(ionGeo, new THREE.MeshStandardMaterial({ color: '#8b5cf6', roughness: 0.4 }), NION / 2);
  const clM = new THREE.InstancedMesh(ionGeo, new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.4 }), NION / 2);
  const kM = new THREE.InstancedMesh(ionGeo, new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.4 }), NCELL);
  [naM, clM, kM].forEach((m) => { m.frustumCulled = false; scene.add(m); });

  /* ---------- the walk ---------- */
  const inAqp = (p) => AQP.some(([y, z]) => (p.y - y) ** 2 + (p.z - z) ** 2 < AQP_R * AQP_R);
  const tot = { in: 0, out: 0 };   // crossings since the blood was last healthy          // recent crossings: [time, +1 into the cell | −1 out]
  let last = null, na = HEALTHY_NA, shownIons = NION;
  const nIn = () => water.reduce((s, w) => s + (w.p.x > 0 ? 1 : 0), 0);

  function walk(dt, time) {
    // steer the coin toward the model's split: water in cell / in blood = astroVolume(na)
    const k = astroVolume(na), want = NW * k / (1 + k);
    const bias = clamp(Math.exp(0.08 * (want - nIn())), 0.5, 2);
    const kick = TURN * Math.sqrt(dt) * SPEED;
    for (const w of water) {
      const was = w.p.x > 0;
      w.v.x += gauss() * kick; w.v.y += gauss() * kick; w.v.z += gauss() * kick;
      w.v.setLength(SPEED);
      w.p.addScaledVector(w.v, dt);
      if (w.p.y < -YH + 0.3 || w.p.y > YH - 0.3) { w.v.y *= -1; w.p.y = clamp(w.p.y, -YH + 0.3, YH - 0.3); }
      if (w.p.z < -ZH + 0.3 || w.p.z > ZH - 0.3) { w.v.z *= -1; w.p.z = clamp(w.p.z, -ZH + 0.3, ZH - 0.3); }
      if (w.p.x < XL + 0.3 || w.p.x > XR - 0.3) { w.v.x *= -1; w.p.x = clamp(w.p.x, XL + 0.3, XR - 0.3); }
      const hit = was ? w.p.x < MEM + 0.3 : w.p.x > -MEM - 0.3;
      if (hit) {
        const odds = (inAqp(w.p) ? P_AQP : P_LIPID) * (was ? 1 / bias : bias);
        if (rnd() < odds) { w.p.x = was ? -MEM - 0.35 : MEM + 0.35; w.glow = 1; tot[was ? 'out' : 'in']++; }
        else { w.p.x = was ? MEM + 0.35 : -MEM - 0.35; w.v.x *= -1; }
      }
      w.glow = Math.max(0, w.glow - dt * 1.2);
    }
    for (const s of [...ions, ...cellS]) {
      s.p.x = clamp(s.p.x + gauss() * STEP * dt, s.x0, s.x1);
      s.p.y = clamp(s.p.y + gauss() * STEP * dt, -YH + 0.5, YH - 0.5);
      s.p.z = clamp(s.p.z + gauss() * STEP * dt, -ZH + 0.5, ZH - 0.5);
    }
  }

  function paint() {
    water.forEach((w, i) => {
      dummy.position.copy(w.p); dummy.scale.setScalar(1 + w.glow * 0.5); dummy.updateMatrix();
      waterM.setMatrixAt(i, dummy.matrix);
      waterM.setColorAt(i, tmpC.copy(cWater).lerp(cGlow, w.glow));
    });
    waterM.instanceMatrix.needsUpdate = true; waterM.instanceColor.needsUpdate = true;
    const half = NION / 2;
    for (let i = 0; i < half; i++) {
      const on = i * 2 < shownIons;
      [naM, clM].forEach((m, j) => {
        dummy.position.copy(ions[i * 2 + j].p); dummy.scale.setScalar(on ? 1 : 1e-4); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      });
    }
    cellS.forEach((s, i) => { dummy.position.copy(s.p); dummy.scale.setScalar(1); dummy.updateMatrix(); kM.setMatrixAt(i, dummy.matrix); });
    [naM, clM, kM].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  }

  function update(st, time) {
    na = st.na;
    if (na >= HEALTHY_NA - 0.5) { tot.in = 0; tot.out = 0; }
    shownIons = Math.round(NION * plasmaOsm(na) / plasmaOsm(HEALTHY_NA) / 2) * 2;
    const dt = last == null ? 0 : Math.min(0.05, time - last);
    last = time;
    if (dt > 0) walk(dt, time);
    paint();
  }

  /* ---------- labels, hover info, cues ---------- */
  const aq = AQP[0];
  const labels = [
    { key: 'blood', ...TX.labels.blood, anchor: () => V3(XL + 4, YH + 1, 0), show: () => true },
    { key: 'cell', ...TX.labels.cell, anchor: () => V3(XR - 4, YH + 1, 0), show: () => true },
    { key: 'aqp', ...TX.labels.aqp, anchor: () => V3(0, aq[0] + 1, aq[1]), show: () => true },
    { key: 'bilayer', ...TX.labels.bilayer, anchor: () => V3(0, -YH + 1, ZH - 1), show: () => true },
  ];
  const interactives = [
    { root: aqpGroup, priority: 2, info: () => TX.info.aqp },
    { root: waterM, priority: 1, info: () => TX.info.water },
    { root: headM, priority: 0, info: () => TX.info.bilayer },
  ];
  function cue(st) {
    const pct = Math.round((astroVolume(st.na) - 1) * 100);
    if (st.na >= HEALTHY_NA - 2) return { text: TX.cues.even, mark: 'aqp' };
    if (pct >= 15) return { text: fmt(TX.cues.swollen, { pct }), mark: 'cell' };
    if (st.na > 128) return { text: TX.cues.tight, mark: 'blood' };
    return { text: TX.cues.falling + ' · ' + fmt(TX.tally, tally()), mark: 'aqp' };
  }
  const tally = () => ({ in: tot.in, out: tot.out, cell: nIn(), total: NW });

  return {
    scene, labels, interactives, update, cue, tally,
    fov: 34, near: 0.1, far: 200, minDist: 12, maxDist: 90,
    views: [{ pos: V3(-6, 10, 40), target: V3(0, 0, 0) }],
  };
}
