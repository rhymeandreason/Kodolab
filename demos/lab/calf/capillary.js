/* Brain level: one brain capillary cut open lengthwise, and the astrocyte whose endfeet wrap it.
 * A world for Lab's zoom.js. Lengths are roughly µm: a 6 µm lumen that red cells pass through
 * single file, a thin endothelial wall sealed by tight junctions, the endfoot sleeve outside it.
 *
 * It follows the bench through st = { na, cellOsm?, mode?, phase? }: blood Na⁺ in mEq/L, what
 * the astrocyte holds (CELL_OSM until it adapts), and which story the cue tells
 * ('night' · 'drip' · 'slow' · 'done').
 *
 * THE ASTROCYTE'S SIZE IS THE MODEL'S. Its volume is astroVolume(na, cellOsm): the endfoot
 * sleeve is that much thicker (it can only swell away from the vessel) and the cell body's
 * radius grows by the cube root. Red cells thicken by cellVolume(), the number the slides show.
 *
 * WHAT IS NOT TO SCALE: the beads. Water, Na⁺, Cl⁻ and K⁺ are drawn thousands of times too big
 * so the traffic shows; membrane.js's level is where a molecule is its own size. Beads live in
 * a thin slab on the cut face. Water crosses the wall anywhere, each crossing a coin flip
 * weighted toward the same density of water on both sides, so a swelling sleeve draws a net
 * flow. Na⁺ and Cl⁻ never leave the lumen. An adapting cell sends K⁺ beads out to the blood.
 *
 * LEFT OUT: the basement membrane, pericytes, neurons, and the red cells' biconcave shape. */
import * as THREE from 'three';
import { clamp, seeded, T, fmt, LIGHT } from '../lab.js';
import { astroVolume, cellVolume, plasmaOsm, CELL_OSM, HEALTHY_NA, JUNIPER, SAFE_24H } from './model.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TX = T.levels.brain;
const LX = 26;                        // half-length of the vessel drawn
const R = 3, RW = 3.55, E0 = 3.7;     // lumen radius, wall's outer radius, where the endfoot sleeve starts
const T0 = 1.6;                       // sleeve thickness at the cell's normal size
const SOMA = V3(3, 10, -1.6), SOMA_R = 2.6;
const Z0 = 0.15, Z1 = 0.9, PAD = 0.22;                    // the bead slab, in front of the cut face
const JUNCTIONS = [-21, -14, -7, 0, 7, 14, 21];           // where two endothelial cells meet
const FEET = [[-LX, -13.2], [-12.8, -0.2], [0.2, 12.8], [13.2, LX]];   // the endfeet along the vessel, a cleft between each
const NRBC = 7, RBC_R = 2.35, RBC_T = 0.95;
const NW = 420, NCELL = 30;
const P_CROSS = 0.12;                 // odds per hit. Low: a bead that fails tries again next frame, so high odds would wash out the bias
const SPEED = 5, TURN = 5, STEP = 1.4, FLOW = 2.4, EXIT = 2.5;
const RATE = 2.5;                     // 1/s: how fast the sleeve follows the model
const COL = {
  lumen: '#f6cfc7', wall: '#cf6f61', wallCut: '#c9675a', junction: '#5f1d1d',
  astro: '#7f97d8', astroCut: '#cdd8f4', rbc: '#a31919',
  water: '#1f7fd1', glow: '#fde047', na: '#7c3aed', cl: '#16a34a', k: '#d97706',
  more: '#3b9ee6', less: '#f59e0b',
};

export function createCapillaryLevel(env) {
  const rnd = seeded(31);
  const rand = (a, b) => a + rnd() * (b - a);
  const gauss = () => { let s = 0; for (let i = 0; i < 3; i++) s += rnd() * 2 - 1; return s / 1.7; };
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight('#ffffff', '#dfe6ec', 1.0 * LIGHT));
  const dir = new THREE.DirectionalLight('#ffffff', 0.7 * LIGHT); dir.position.set(4, 9, 8); scene.add(dir);
  const dummy = new THREE.Object3D();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide, ...o });
  const flat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });

  /* the far half of a pipe along x, radius 1 and length 1: scale (r, length, r) */
  const halfPipe = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true, Math.PI / 2, Math.PI);
  const pipe = (mat, r, x0, x1) => {
    const m = new THREE.Mesh(halfPipe, mat);
    m.rotation.z = Math.PI / 2; m.scale.set(r, x1 - x0, r); m.position.x = (x0 + x1) / 2;
    return m;
  };
  /* a strip of the cut face (z = 0) between two radii, above (s = 1) or below (s = −1) the lumen */
  const faceGeo = new THREE.PlaneGeometry(1, 1);
  const face = (mat, x0, x1, z = 0) => { const m = new THREE.Mesh(faceGeo, mat); m.position.set((x0 + x1) / 2, 0, z); m.scale.x = x1 - x0; return m; };
  const setFace = (m, s, r0, r1) => { m.visible = r1 - r0 > 0.01; m.scale.y = Math.max(0.001, r1 - r0); m.position.y = s * (r0 + r1) / 2; };

  /* ---------- the vessel wall ---------- */
  const wallG = new THREE.Group();
  wallG.add(pipe(std(COL.lumen), R, -LX, LX), pipe(std(COL.wall), RW, -LX, LX));
  for (const s of [1, -1]) { const f = face(flat(COL.wallCut), -LX, LX); setFace(f, s, R, RW); wallG.add(f); }
  const jMat = flat(COL.junction);
  for (const x of JUNCTIONS) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.06, 6, 32, Math.PI), jMat);
    seam.rotation.set(0, Math.PI / 2, -Math.PI / 2); seam.position.x = x;
    wallG.add(seam);
    for (const s of [1, -1]) { const f = face(jMat, x - 0.09, x + 0.09, 0.01); setFace(f, s, R, RW); wallG.add(f); }
  }
  scene.add(wallG);

  /* ---------- the astrocyte: endfoot sleeve, cell body, processes ---------- */
  const astroMat = std(COL.astro), astroG = new THREE.Group();
  const feet = FEET.map(([x0, x1]) => {
    const shell = pipe(astroMat, 1, x0, x1);
    const cuts = [1, -1].map((s) => ({ s, m: face(flat(COL.astroCut), x0, x1) }));
    astroG.add(shell, ...cuts.map((c) => c.m));
    return { shell, cuts };
  });
  const bands = [1, -1].map((s) => ({ s, m: face(flat(COL.more, 0.55), -LX, LX, 0.02) }));
  bands.forEach((b) => astroG.add(b.m));
  /* the cell body and its processes swell about the body's centre */
  const body = new THREE.Group(); body.position.copy(SOMA);
  body.add(new THREE.Mesh(new THREE.SphereGeometry(SOMA_R, 32, 20), astroMat));
  const limb = (pts, r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 10), astroMat);
  const footY = E0 + T0 - 0.3 - SOMA.y;
  body.add(
    limb([V3(-1, -1, 0), V3(-5, -3.2, 0.3), V3(-9, footY, 0.4)], 0.55),      // down to two endfeet
    limb([V3(1, -1.5, 0), V3(3.5, -3.6, 0.3), V3(5.5, footY, 0.4)], 0.55),
    limb([V3(-1.5, 1, 0), V3(-6, 3.5, -1), V3(-12, 5, -2)], 0.4),            // and off to synapses, out of frame
    limb([V3(1.5, 1.5, 0), V3(5, 4.5, -1), V3(9, 8, -2)], 0.4),
    limb([V3(2, 0, 0), V3(7, 0.5, -1), V3(13, -0.5, -2.5)], 0.4),
    limb([V3(0, 2, -0.5), V3(-0.8, 6, -2), V3(-0.4, 10, -3)], 0.36),
  );
  /* the lower endfeet belong to a neighbour, off the bottom of the frame */
  const neighbour = limb([V3(-5, -(E0 + T0 - 0.3), -1.2), V3(-7, -9, -2), V3(-11, -15, -3)], 0.55);
  astroG.add(body, neighbour);
  scene.add(astroG);

  /* the normal size, dashed: the sleeve's outer edge, and the cell body's outline */
  const dashed = new THREE.LineDashedMaterial({ color: '#334155', dashSize: 0.45, gapSize: 0.32, transparent: true, opacity: 0.75, depthTest: false });
  const line = (pts) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), dashed); l.computeLineDistances(); l.renderOrder = 5; return l; };
  const restLines = [1, -1].map((s) => line([V3(-LX, s * (E0 + T0), 0.03), V3(LX, s * (E0 + T0), 0.03)]));
  const restRing = line(Array.from({ length: 65 }, (_, i) => V3(Math.cos(i / 64 * Math.PI * 2) * SOMA_R, Math.sin(i / 64 * Math.PI * 2) * SOMA_R, 0)));
  restRing.position.copy(SOMA);
  scene.add(...restLines, restRing);

  /* ---------- red cells, single file ---------- */
  const rbcG = new THREE.Group();
  const rbcGeo = new THREE.SphereGeometry(1, 28, 18), rbcMat = std(COL.rbc, { roughness: 0.5, side: THREE.FrontSide });
  const rbcs = Array.from({ length: NRBC }, (_, i) => {
    const m = new THREE.Mesh(rbcGeo, rbcMat);
    m.position.x = -LX - 3 + (i + 0.5) * (2 * LX + 6) / NRBC;
    rbcG.add(m);
    return m;
  });
  scene.add(rbcG);

  /* ---------- beads ---------- */
  let th = T0;   // the sleeve's thickness now
  const sign = () => (rnd() < 0.5 ? -1 : 1);
  const inLumen = () => V3(rand(-LX, LX), rand(-R + PAD, R - PAD), rand(Z0, Z1));
  const inFoot = () => V3(rand(-LX, LX), sign() * rand(E0 + PAD, E0 + th - PAD), rand(Z0, Z1));
  const bIn0 = 2 * (R - PAD), cIn0 = 2 * (T0 - 2 * PAD);
  const water = Array.from({ length: NW }, () => {
    const inside = rnd() < cIn0 / (bIn0 + cIn0);
    return { p: inside ? inFoot() : inLumen(), v: V3(gauss(), gauss(), gauss()).setLength(SPEED), in: inside, glow: 0 };
  });
  const waterM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), NW);
  waterM.frustumCulled = false;
  const cWater = new THREE.Color(COL.water), cGlow = new THREE.Color(COL.glow), tmpC = new THREE.Color();
  scene.add(waterM);

  // Healthy, lumen and sleeve hold the same solute beads per unit of cut face.
  const NION = Math.round(NCELL * bIn0 / cIn0 * plasmaOsm(HEALTHY_NA) / CELL_OSM / 2) * 2;
  const ions = Array.from({ length: NION }, () => ({ p: inLumen() }));
  const cellS = Array.from({ length: NCELL }, () => ({ p: inFoot(), out: 0 }));   // out: 0 in the cell … 1 carried off
  const ionGeo = new THREE.SphereGeometry(0.2, 12, 10);
  const ionMesh = (c, n) => new THREE.InstancedMesh(ionGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }), n);
  const naM = ionMesh(COL.na, NION / 2), clM = ionMesh(COL.cl, NION / 2), kM = ionMesh(COL.k, NCELL);
  [naM, clM, kM].forEach((mm) => { mm.frustumCulled = false; scene.add(mm); });

  /* ---------- the walk ---------- */
  const tot = { in: 0, out: 0 };   // crossings since the blood was last healthy
  let last = null, na = HEALTHY_NA, cellOsm = CELL_OSM, shownIons = NION, shownCell = NCELL;
  const nIn = () => water.reduce((s, w) => s + (w.in ? 1 : 0), 0);
  const wrap = (x) => (x > LX ? x - 2 * LX : x < -LX ? x + 2 * LX : x);

  function walk(dt) {
    th += (T0 * astroVolume(na, cellOsm) - th) * (1 - Math.exp(-RATE * dt));
    const cIn = 2 * (th - 2 * PAD);
    // steer the coin toward the same water density in the lumen and the sleeve, whatever its thickness
    const bias = clamp(Math.exp(0.08 * (NW * cIn / (bIn0 + cIn) - nIn())), 0.5, 2);
    const kick = TURN * Math.sqrt(dt) * SPEED;
    for (const w of water) {
      w.v.x += gauss() * kick; w.v.y += gauss() * kick; w.v.z += gauss() * kick;
      w.v.setLength(SPEED);
      w.p.addScaledVector(w.v, dt);
      if (w.p.z < Z0 || w.p.z > Z1) { w.v.z *= -1; w.p.z = clamp(w.p.z, Z0, Z1); }
      const s = w.p.y < 0 ? -1 : 1, a = Math.abs(w.p.y);
      if (!w.in) {
        w.p.x = wrap(w.p.x + FLOW * dt);
        if (a > R - PAD) {
          if (rnd() < P_CROSS * bias) { w.p.y = s * (E0 + PAD + 0.05); w.in = true; w.glow = 1; tot.in++; }
          else { w.p.y = s * (R - PAD); w.v.y *= -1; }
        }
      } else {
        if (Math.abs(w.p.x) > LX) { w.v.x *= -1; w.p.x = clamp(w.p.x, -LX, LX); }
        if (a < E0 + PAD) {
          if (rnd() < P_CROSS / bias) { w.p.y = s * (R - PAD - 0.05); w.in = false; w.glow = 1; tot.out++; }
          else { w.p.y = s * (E0 + PAD); w.v.y *= -1; }
        } else if (a > E0 + th - PAD) { w.p.y = s * (E0 + th - PAD); w.v.y *= -1; }
      }
      w.glow = Math.max(0, w.glow - dt * 1.2);
    }
    const jit = (p) => { p.x += gauss() * STEP * dt; p.y += gauss() * STEP * dt; p.z = clamp(p.z + gauss() * STEP * dt, Z0, Z1); };
    for (const s of ions) { jit(s.p); s.p.x = wrap(s.p.x + FLOW * dt); s.p.y = clamp(s.p.y, -R + PAD, R - PAD); }
    cellS.forEach((s, i) => {
      const sg = s.p.y < 0 ? -1 : 1;
      if (i < shownCell) {
        if (s.out > 0) { s.out = 0; s.p.copy(inFoot()); }   // scrubbed back: it was never exported
        jit(s.p);
        s.p.x = clamp(s.p.x, -LX, LX); s.p.y = sg * clamp(Math.abs(s.p.y), E0 + PAD, E0 + th - PAD);
      } else if (s.out < 1) {
        // exported: through the wall, then carried off in the blood
        if (Math.abs(s.p.y) > R - 0.6) s.p.y -= sg * EXIT * dt;
        else { s.out = Math.min(1, s.out + dt * 0.8); s.p.x += FLOW * dt; }
      }
    });
    for (const m of rbcs) { m.position.x += FLOW * dt; if (m.position.x > LX + 3) m.position.x -= 2 * LX + 6; }
  }

  function paint() {
    const rOut = E0 + th, rest = E0 + T0;
    for (const f of feet) {
      f.shell.scale.x = f.shell.scale.z = rOut;
      f.cuts.forEach((c) => setFace(c.m, c.s, E0, rOut));
    }
    bands.forEach((b) => { setFace(b.m, b.s, Math.min(rOut, rest), Math.max(rOut, rest)); b.m.material.color.set(rOut > rest ? COL.more : COL.less); });
    body.scale.setScalar(Math.cbrt(th / T0));
    if (world.camera) restRing.quaternion.copy(world.camera.quaternion);
    restLines.forEach((l) => { l.visible = off(); });
    const fat = RBC_T * cellVolume(plasmaOsm(na));
    for (const m of rbcs) m.scale.set(fat, RBC_R, RBC_R);
    water.forEach((w, i) => {
      dummy.position.copy(w.p); dummy.scale.setScalar(1 + w.glow * 0.9); dummy.updateMatrix();
      waterM.setMatrixAt(i, dummy.matrix);
      waterM.setColorAt(i, tmpC.copy(cWater).lerp(cGlow, w.glow));
    });
    waterM.instanceMatrix.needsUpdate = true; waterM.instanceColor.needsUpdate = true;
    for (let i = 0; i < NION / 2; i++) {
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
  const off = () => Math.abs(th - T0) > 0.06;
  const lead = () => rbcs.reduce((b, m) => (Math.abs(m.position.x + 4) < Math.abs(b.position.x + 4) ? m : b));
  const labels = [
    { key: 'blood', ...TX.labels.blood, anchor: () => V3(-13, R - 0.5, 0.2), show: () => true },
    { key: 'rbc', ...TX.labels.rbc, anchor: () => V3(lead().position.x, RBC_R * 0.7, 0.8), show: () => true },
    { key: 'wall', ...TX.labels.wall, anchor: () => V3(7, -(R + RW) / 2, 0.1), show: () => true },
    { key: 'endfoot', ...TX.labels.endfoot, anchor: () => V3(13, E0 + th / 2, 0.1), show: () => true },
    { key: 'astro', ...TX.labels.astro, anchor: () => V3(SOMA.x, SOMA.y + SOMA_R, SOMA.z), show: () => true },
    { key: 'normal', ...TX.labels.normal, anchor: () => V3(-16, -(E0 + T0), 0.1), show: off },
  ];
  const interactives = [
    { root: rbcG, priority: 2, info: () => TX.info.rbc },
    { root: wallG, priority: 1, info: () => TX.info.wall },
    { root: astroG, priority: 1, info: () => TX.info.astro },
    { root: waterM, priority: 0, info: () => TX.info.water },
  ];
  function cue(st) {
    const v = astroVolume(st.na, st.cellOsm || CELL_OSM), pct = Math.round((v - 1) * 100);
    if (st.mode === 'done') return { text: TX.cues.done, mark: 'astro' };
    if (st.mode === 'slow') {
      if (st.phase === 'adapt') return { text: TX.cues.adapt, mark: 'astro' };
      if (st.phase === 'fast') return { text: fmt(TX.cues.fast, { na: HEALTHY_NA, pct: -pct }), mark: 'normal' };
      return { text: fmt(TX.cues.limit, { limit: SAFE_24H }), mark: 'normal' };
    }
    if (st.mode === 'drip') {
      const key = st.na < JUNIPER.na - 0.3 ? 'dripWorse' : st.na > JUNIPER.na + 0.5 ? 'dripShrink' : 'dripStill';
      return { text: fmt(TX.cues[key], { pct }), mark: 'normal' };
    }
    if (st.na >= HEALTHY_NA - 2) return { text: TX.cues.even, mark: 'endfoot' };
    if (pct >= 15) return { text: fmt(TX.cues.swollen, { pct }), mark: 'normal' };
    if (st.na > 128) return { text: TX.cues.tight, mark: 'wall' };
    return { text: TX.cues.falling, mark: 'endfoot' };
  }
  const tally = () => ({ in: tot.in, out: tot.out, cell: nIn(), total: NW });

  const world = {
    scene, labels, interactives, update, cue, tally,
    get thickness() { return th / T0; },
    fov: 34, near: 0.1, far: 300, minDist: 10, maxDist: 110,
    views: [{ pos: V3(0, 7, 50), target: V3(0, 3.6, 0) }],
  };
  return world;
}
