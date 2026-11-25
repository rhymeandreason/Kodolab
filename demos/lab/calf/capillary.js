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
 * ONE MODEL, TWO VIEWS. Left of XW the vessel is cut lengthwise, for the traffic: red cells in
 * single file, water crossing the wall, Na⁺ held in. From XW to XE it is whole, and ends in a
 * cross-section where the endfeet are separate lobes around the ring. view(st) says which the
 * camera should face: side-on while the blood is still close to normal, end-on once the
 * astrocyte's size is the story.
 *
 * WHAT IS NOT TO SCALE: the beads. Water, Na⁺, Cl⁻ and K⁺ are drawn thousands of times too big
 * so the traffic shows; membrane.js's level is where a molecule is its own size. Beads live in
 * a thin slab on the cut face. Water crosses the wall anywhere, each crossing a coin flip
 * weighted toward the same density of water on both sides, so a swelling sleeve draws a net
 * flow. Na⁺ and Cl⁻ never leave the lumen. An adapting cell sends K⁺ beads out to the blood.
 * The cross-section carries the same traffic on its own face, by the same rule in polar form,
 * so the swelling there has a visible cause.
 *
 * LEFT OUT: the basement membrane, pericytes, neurons, and the red cells' biconcave shape. */
import * as THREE from 'three';
import { clamp, seeded, T, fmt, LIGHT } from '../lab.js';
import { astroVolume, cellVolume, plasmaOsm, CELL_OSM, HEALTHY_NA, JUNIPER, SAFE_24H } from './model.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TX = T.levels.brain;
const LX = 26;                        // the vessel runs from −LX …
const XW = 10, XE = 18;               // … is whole from XW, and is cut across at XE
const R = 3, RW = 3.55, E0 = 3.7;     // lumen radius, wall's outer radius, where the endfoot sleeve starts
const T0 = 2.4;                       // sleeve thickness at the cell's normal size
const SOMA = V3(3, 11, -1.6), SOMA_R = 2.6;
const Z0 = 0.15, Z1 = 0.9, PAD = 0.22;                    // the bead slab, in front of the cut face
const JUNCTIONS = [-21, -14, -7, 0, 7];                   // where two endothelial cells meet, along the cut-open part
const SEAMS = [0.9, 0.9 + Math.PI];                       // and around the ring: two cells wrap this capillary
const LOBES = 4, CLEFT = 0.04;                            // endfeet around the ring, and half the angle between two
const FEET = [[-LX, -13.2], [-12.8, -0.2], [0.2, XW]];    // the endfeet along the cut-open part, a cleft between each
const NRBC = 7, RBC_R = 2.35, RBC_T = 0.95;
const NW = 420, NCELL = 30;
const NW2 = 170, NCELL2 = 30;          // and on the cross-section's face
const P_CROSS = 0.12;                 // odds per hit. Low: a bead that fails tries again next frame, so high odds would wash out the bias
const SPEED = 5, TURN = 5, STEP = 1.4, FLOW = 2.4, EXIT = 2.5;
const RATE = 2.5;                     // 1/s: how fast the sleeve follows the model
const COL = {
  lumen: '#f6cfc7', wall: '#cf6f61', wallCut: '#c9675a', junction: '#5f1d1d',
  astro: '#7f97d8', astroCut: '#cdd8f4', rbc: '#a31919',
  water: '#1f7fd1', glow: '#fde047', na: '#7c3aed', cl: '#16a34a', k: '#d97706',
  more: '#1d4ed8', less: '#f59e0b',
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
  /* part of a whole pipe along x, between two angles about the axis (0 faces the side-on camera) */
  const arcPipe = (mat, r, x0, x1, a0 = 0, a1 = Math.PI * 2) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, Math.max(8, Math.round(48 * (a1 - a0) / (Math.PI * 2))), 1, true, a0, a1 - a0), mat);
    m.rotation.z = Math.PI / 2; m.scale.set(r, x1 - x0, r); m.position.x = (x0 + x1) / 2;
    return m;
  };
  /* a flat arc across the vessel at x, between two angles; set(r0, r1) moves its radii */
  const arcFace = (mat, x, a0, a1) => {
    const n = Math.max(6, Math.round(64 * (a1 - a0) / (Math.PI * 2))), pos = new Float32Array((n + 1) * 6), idx = [];
    for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
    const set = (r0, r1) => {
      mesh.visible = r1 - r0 > 0.01;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n, sy = Math.sin(a), cz = Math.cos(a);
        pos.set([x, r0 * sy, r0 * cz, x, r1 * sy, r1 * cz], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
    };
    return { mesh, set };
  };
  const flat2 = (color, opacity) => Object.assign(flat(color, opacity), { side: THREE.DoubleSide });

  /* ---------- the vessel wall ---------- */
  const wallG = new THREE.Group();
  wallG.add(pipe(std(COL.lumen), R, -LX, XW), pipe(std(COL.wall), RW, -LX, XW));
  wallG.add(arcPipe(std(COL.lumen), R, XW, XE), arcPipe(std(COL.wall), RW, XW, XE));
  for (const s of [1, -1]) { const f = face(flat(COL.wallCut), -LX, XW); setFace(f, s, R, RW); wallG.add(f); }
  /* where the lengthwise cut stops, and the cross-section at the end */
  for (const [x, a0, a1] of [[XW, -Math.PI / 2, Math.PI / 2], [XE, 0, Math.PI * 2]]) { const f = arcFace(flat2(COL.wallCut), x, a0, a1); f.set(R, RW); wallG.add(f.mesh); }
  const jMat = flat2(COL.junction);
  for (const a of SEAMS) { const f = arcFace(jMat, XE + 0.01, a - 0.035, a + 0.035); f.set(R, RW); wallG.add(f.mesh); }
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
  const bands = [1, -1].map((s) => ({ s, m: face(flat(COL.more, 0.8), -LX, XW, 0.02) }));
  bands.forEach((b) => astroG.add(b.m));
  /* the whole part: LOBES endfeet around the ring, the first centred on top */
  const step = Math.PI * 2 / LOBES;
  const lobes = Array.from({ length: LOBES }, (_, i) => {
    const a0 = Math.PI / 2 + (i - 0.5) * step + CLEFT, a1 = Math.PI / 2 + (i + 0.5) * step - CLEFT;
    const shell = arcPipe(astroMat, 1, XW, XE, a0, a1);
    const cut = arcFace(flat2(COL.astroCut), XE, a0, a1), band = arcFace(flat2(COL.more, 0.85), XE + 0.02, a0, a1);
    astroG.add(shell, cut.mesh, band.mesh);
    return { shell, cut, band };
  });
  const stop = arcFace(flat2(COL.astroCut), XW, -Math.PI / 2, Math.PI / 2);
  astroG.add(stop.mesh);
  /* the cell body and its processes swell about the body's centre */
  const body = new THREE.Group(); body.position.copy(SOMA);
  body.add(new THREE.Mesh(new THREE.SphereGeometry(SOMA_R, 32, 20), astroMat));
  const limb = (pts, r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 10), astroMat);
  const footY = E0 + T0 - 0.3 - SOMA.y;
  body.add(
    limb([V3(-1, -1, 0), V3(-5, -3.2, 0.3), V3(-9, footY, 0.4)], 0.55),      // down to two endfeet
    limb([V3(1, -1.5, 0), V3(3.5, -3.6, 0.3), V3(5.5, footY, 0.4)], 0.55),
    limb([V3(2, -1, 0), V3(7.5, -3, 1), V3(XE - 4 - SOMA.x, footY, 1.6)], 0.55),   // and to the top lobe of the whole part
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
  const restLines = [1, -1].map((s) => line([V3(-LX, s * (E0 + T0), 0.03), V3(XW, s * (E0 + T0), 0.03)]));
  restLines.push(line(Array.from({ length: 97 }, (_, i) => V3(XE + 0.04, Math.sin(i / 96 * Math.PI * 2) * (E0 + T0), Math.cos(i / 96 * Math.PI * 2) * (E0 + T0)))));
  const restRing = line(Array.from({ length: 65 }, (_, i) => V3(Math.cos(i / 64 * Math.PI * 2) * SOMA_R, Math.sin(i / 64 * Math.PI * 2) * SOMA_R, 0)));
  restRing.position.copy(SOMA);
  scene.add(...restLines, restRing);

  /* ---------- red cells, single file ---------- */
  const rbcG = new THREE.Group();
  const rbcGeo = new THREE.SphereGeometry(1, 28, 18), rbcMat = std(COL.rbc, { roughness: 0.5, side: THREE.FrontSide });
  const rbcs = Array.from({ length: NRBC }, (_, i) => {
    const m = new THREE.Mesh(rbcGeo, rbcMat);
    m.position.x = -LX - 3 + (i + 0.5) * (LX + XE + 3) / NRBC;
    rbcG.add(m);
    return m;
  });
  scene.add(rbcG);

  /* ---------- beads ---------- */
  let th = T0;   // the sleeve's thickness now
  const sign = () => (rnd() < 0.5 ? -1 : 1);
  const inLumen = () => V3(rand(-LX, XE), rand(-R + PAD, R - PAD), rand(Z0, Z1));
  const inFoot = () => V3(rand(-LX, XE), sign() * rand(E0 + PAD, E0 + th - PAD), rand(Z0, Z1));
  const bIn0 = 2 * (R - PAD), cIn0 = 2 * (T0 - 2 * PAD);
  const water = Array.from({ length: NW }, () => {
    const inside = rnd() < cIn0 / (bIn0 + cIn0);
    return { p: inside ? inFoot() : inLumen(), v: V3(gauss(), gauss(), gauss()).setLength(SPEED), in: inside, glow: 0 };
  });
  /* the cross-section's beads: a thin slab in front of its face, lumen inside R, lobes outside E0 */
  const RL = R - PAD, RS = E0 + PAD, aL = RL * RL, aS0 = (E0 + T0 - PAD) ** 2 - RS * RS;   // areas over π
  const polar = (r0, r1) => { const a = rand(0, Math.PI * 2), r = Math.sqrt(rand(r0 * r0, r1 * r1)); return V3(rand(XE + 0.15, XE + 0.7), r * Math.sin(a), r * Math.cos(a)); };
  const water2 = Array.from({ length: NW2 }, () => {
    const inside = rnd() < aS0 / (aL + aS0);
    return { p: inside ? polar(RS, E0 + T0 - PAD) : polar(0, RL), v: V3(0, gauss(), gauss()).setLength(SPEED), in: inside, glow: 0 };
  });
  const allWater = water.concat(water2);
  const waterM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), NW + NW2);
  waterM.frustumCulled = false;
  const cWater = new THREE.Color(COL.water), cGlow = new THREE.Color(COL.glow), tmpC = new THREE.Color();
  scene.add(waterM);

  // Healthy, lumen and sleeve hold the same solute beads per unit of cut face.
  const NION = Math.round(NCELL * bIn0 / cIn0 * plasmaOsm(HEALTHY_NA) / CELL_OSM / 2) * 2;
  const ions = Array.from({ length: NION }, () => ({ p: inLumen() }));
  const cellS = Array.from({ length: NCELL }, () => ({ p: inFoot(), out: 0 }));   // out: 0 in the cell … 1 carried off
  const ionGeo = new THREE.SphereGeometry(0.2, 12, 10);
  const ionMesh = (c, n) => new THREE.InstancedMesh(ionGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }), n);
  const NION2 = Math.round(NCELL2 * aL / aS0 * plasmaOsm(HEALTHY_NA) / CELL_OSM / 2) * 2;
  const ions2 = Array.from({ length: NION2 }, () => ({ p: polar(0, RL - 0.1) }));
  const cell2 = Array.from({ length: NCELL2 }, () => ({ p: polar(RS + 0.1, E0 + T0 - PAD - 0.1) }));
  const naM = ionMesh(COL.na, (NION + NION2) / 2), clM = ionMesh(COL.cl, (NION + NION2) / 2), kM = ionMesh(COL.k, NCELL + NCELL2);
  [naM, clM, kM].forEach((mm) => { mm.frustumCulled = false; scene.add(mm); });

  /* ---------- the walk ---------- */
  const tot = { in: 0, out: 0 };   // crossings since the blood was last healthy
  let last = null, na = HEALTHY_NA, cellOsm = CELL_OSM, shownIons = NION, shownCell = NCELL;
  const nIn = () => water.reduce((s, w) => s + (w.in ? 1 : 0), 0);
  const wrap = (x) => (x > XE ? x - (LX + XE) : x < -LX ? x + (LX + XE) : x);

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
        if (w.p.x < -LX || w.p.x > XE) { w.v.x *= -1; w.p.x = clamp(w.p.x, -LX, XE); }
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
        s.p.x = clamp(s.p.x, -LX, XE); s.p.y = sg * clamp(Math.abs(s.p.y), E0 + PAD, E0 + th - PAD);
      } else if (s.out < 1) {
        // exported: through the wall, then carried off in the blood
        if (Math.abs(s.p.y) > R - 0.6) s.p.y -= sg * EXIT * dt;
        else { s.out = Math.min(1, s.out + dt * 0.8); s.p.x += FLOW * dt; }
      }
    });
    walkFace(dt, kick);
    for (const m of rbcs) { m.position.x += FLOW * dt; if (m.position.x > XE) m.position.x -= LX + XE + 3; }
  }

  /* put a bead at radius r along its own direction; `bounce` turns its radial velocity round */
  const toRadius = (w, r, bounce) => {
    const d = Math.hypot(w.p.y, w.p.z) || 1, ny = w.p.y / d, nz = w.p.z / d;
    w.p.y = ny * r; w.p.z = nz * r;
    if (bounce) { const vr = w.v.y * ny + w.v.z * nz; w.v.y -= 2 * vr * ny; w.v.z -= 2 * vr * nz; }
  };
  function walkFace(dt, kick) {
    const rs = E0 + th - PAD, aS = rs * rs - RS * RS;
    const bias = clamp(Math.exp(0.12 * (NW2 * aS / (aL + aS) - water2.reduce((n, w) => n + (w.in ? 1 : 0), 0))), 0.5, 2);
    for (const w of water2) {
      w.v.y += gauss() * kick; w.v.z += gauss() * kick; w.v.x = 0;
      w.v.setLength(SPEED);
      w.p.addScaledVector(w.v, dt);
      const r = Math.hypot(w.p.y, w.p.z);
      if (!w.in) {
        // the lumen's edge is shorter than the lobes' inner edge, so its hits count for more
        if (r > RL) { if (rnd() < P_CROSS * bias * RS / RL) { toRadius(w, RS + 0.05); w.in = true; w.glow = 1; tot.in++; } else toRadius(w, RL, true); }
      } else if (r < RS) {
        if (rnd() < P_CROSS / bias) { toRadius(w, RL - 0.05); w.in = false; w.glow = 1; tot.out++; } else toRadius(w, RS, true);
      } else if (r > rs) toRadius(w, rs, true);
      w.glow = Math.max(0, w.glow - dt * 1.2);
    }
    const drift = (p, r0, r1) => {
      p.y += gauss() * STEP * dt; p.z += gauss() * STEP * dt;
      const r = Math.hypot(p.y, p.z) || 1, to = clamp(r, r0, r1) / r;
      p.y *= to; p.z *= to;
    };
    for (const s of ions2) drift(s.p, 0, RL - 0.1);
    for (const s of cell2) drift(s.p, RS + 0.1, rs - 0.1);
  }

  function paint() {
    const rOut = E0 + th, rest = E0 + T0;
    for (const f of feet) {
      f.shell.scale.x = f.shell.scale.z = rOut;
      f.cuts.forEach((c) => setFace(c.m, c.s, E0, rOut));
    }
    bands.forEach((b) => { setFace(b.m, b.s, Math.min(rOut, rest), Math.max(rOut, rest)); b.m.material.color.set(rOut > rest ? COL.more : COL.less); });
    for (const l of lobes) {
      l.shell.scale.x = l.shell.scale.z = rOut;
      l.cut.set(E0, rOut);
      l.band.set(Math.min(rOut, rest), Math.max(rOut, rest)); l.band.mesh.material.color.set(rOut > rest ? COL.more : COL.less);
    }
    stop.set(E0, rOut);
    body.scale.setScalar(Math.cbrt(th / T0));
    if (world.camera) restRing.quaternion.copy(world.camera.quaternion);
    restLines.forEach((l) => { l.visible = off(); });
    const fat = RBC_T * cellVolume(plasmaOsm(na));
    // a red cell shrinks out of sight as it reaches the cross-section, where the vessel stops being drawn
    for (const m of rbcs) { const k = clamp((XE - 0.3 - m.position.x) / 2); m.scale.set(fat * k, RBC_R * k, RBC_R * k); }
    allWater.forEach((w, i) => {
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
    const put = (mm, i, p, on) => { dummy.position.copy(p); dummy.scale.setScalar(on ? 1 : 1e-4); dummy.updateMatrix(); mm.setMatrixAt(i, dummy.matrix); };
    ions2.forEach((s, i) => put(i % 2 ? clM : naM, NION / 2 + (i >> 1), s.p, i < NION2 * shownIons / NION));
    cell2.forEach((s, i) => put(kM, NCELL + i, s.p, i < NCELL2 * shownCell / NCELL));
    [naM, clM, kM].forEach((mm) => { mm.instanceMatrix.needsUpdate = true; });
  }

  function update(st, time) {
    endOn = view(st) === 1;
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
  const pct = () => Math.round((th / T0 - 1) * 100);
  let endOn = false;
  /** Which of views[] the camera belongs at: 1, the cross-section, once the cell's size is the story. */
  const view = (st) => (st.mode && st.mode !== 'night' ? 1 : st.na <= 128 ? 1 : 0);
  const lead = () => rbcs.reduce((b, m) => (Math.abs(m.position.x + 4) < Math.abs(b.position.x + 4) ? m : b));
  const labels = [
    { key: 'blood', ...TX.labels.blood, anchor: () => V3(-13, R - 0.5, 0.2), show: () => true },
    { key: 'rbc', ...TX.labels.rbc, anchor: () => V3(lead().position.x, RBC_R * 0.7, 0.8), show: () => true },
    { key: 'wall', ...TX.labels.wall, anchor: () => (endOn ? V3(XE, -(R + RW) / 2, 0) : V3(4, -(R + RW) / 2, 0.1)), show: () => true },
    { key: 'endfoot', ...TX.labels.endfoot, sub: () => (pct() > 0 ? fmt(TX.labels.bigger, { pct: pct() }) : pct() < 0 ? fmt(TX.labels.smaller, { pct: -pct() }) : TX.labels.endfoot.sub),
      anchor: () => (endOn ? V3(XE, E0 + th / 2, 0) : V3(5, E0 + th / 2, 0.1)), show: () => true },
    { key: 'astro', ...TX.labels.astro, anchor: () => V3(SOMA.x, SOMA.y + SOMA_R, SOMA.z), show: () => true },
    { key: 'normal', ...TX.labels.normal, anchor: () => (endOn ? V3(XE, -(E0 + T0), 0) : V3(-16, -(E0 + T0), 0.1)), show: off },
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
    if (pct >= 15) return { text: fmt(TX.cues.swollen, { pct }), mark: 'endfoot' };
    if (st.na > 128) return { text: TX.cues.tight, mark: 'wall' };
    return { text: TX.cues.falling, mark: 'endfoot' };
  }
  const tally = () => ({ in: tot.in, out: tot.out, cell: nIn(), total: NW });

  const world = {
    scene, labels, interactives, update, cue, tally, view,
    get thickness() { return th / T0; },
    fov: 34, near: 0.1, far: 300, minDist: 10, maxDist: 110,
    views: [{ pos: V3(-6, 7, 50), target: V3(-6, 3.6, 0) }, { pos: V3(XE + 26, 4, 9), target: V3(XE - 1, 0.8, 0) }],
  };
  return world;
}
