/* Gel level: a 3.6 µm stretch of 1% agarose with the crime scene's DNA pieces in it. A world for
 * Lab's zoom.js. 1 unit = 0.1 µm.
 *
 * It follows the bench through `st` = { stage, run, stain, field }:
 *   stage 0  an empty gel: the fiber mesh      2  field on: the pieces move toward +
 *         1  loaded: pieces drift in place     3  stained: the pieces glow
 * Each piece is posed from `run` alone, so a scrub on the timeline poses it exactly.
 *
 * Reptation: a piece longer than the pores is confined to a tube through the mesh and can only
 * move along it, head first, so each piece slides along its own fixed path. Lengths are to
 * scale (0.34 nm per base pair); the strands are drawn ~100× thicker than DNA's 2 nm, and the
 * fibers ~5× thicker than an agarose bundle, so both read at this scale. */
import * as THREE from 'three';
import { clamp, smooth, seeded, T, fmt, LIGHT } from '../lab.js';
import { SAMPLES, travel } from './model.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TX = T.levels.gel;
const UNIT_UM = 0.1;
const BP_UM = 0.00034;
const X0 = -18, X1 = 18, YH = 5.5, ZH = 4;
const STEP = 0.35;                       // path sample spacing
const BEAD = 0.2;                        // bead spacing along a strand
const PIECES = SAMPLES.find((s) => s.key === 'cs').bands;   // the crime scene's fragments
const SHORT = Math.min(...PIECES), LONG = Math.max(...PIECES);
/** units a piece travels over the whole run: the shortest goes 30 units (3 µm) */
const travelUnits = (bp) => 30 * travel(bp) / travel(SHORT);

export const captionFor = (st) => TX.stages[st.stage];

export function createGelLevel(env) {
  const rnd = seeded(41);
  const rand = (a, b) => a + rnd() * (b - a);
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight('#ffffff', '#dfe6ec', 1.0 * LIGHT));
  const dir = new THREE.DirectionalLight('#ffffff', 0.7 * LIGHT); dir.position.set(4, 9, 8); scene.add(dir);
  const dummy = new THREE.Object3D();

  /* ---------- the pieces' paths: a random walk biased toward + ---------- */
  const chains = [];
  PIECES.forEach((bp, k) => {
    for (let c = 0; c < 2; c++) {
      const len = bp * BP_UM / UNIT_UM;
      const n = Math.ceil((len + travelUnits(bp) + 6) / STEP);
      const pts = [];
      const p = V3(-11 - len * 0.38 + rand(-1.5, 1.5), rand(-YH + 1.2, YH - 1.2), rand(-ZH + 1, ZH - 1));
      const d = V3(1, rand(-0.4, 0.4), rand(-0.4, 0.4)).normalize();
      for (let i = 0; i < n; i++) {
        pts.push(p.clone());
        d.x += 0.22; d.y += rand(-0.55, 0.55) - (p.y / YH) * 0.25; d.z += rand(-0.55, 0.55) - (p.z / ZH) * 0.25;
        d.normalize();
        p.addScaledVector(d, STEP);
      }
      chains.push({ bp, len, pts, beads: Math.max(3, Math.round(len / BEAD)), s0: len, ph: rand(0, 6.28), k });
    }
  });

  /* ---------- agarose fibers: straight bundles crossing at random, kept out of the paths ---------- */
  const pathPts = chains.flatMap((c) => c.pts.filter((_, i) => i % 2 === 0));
  const segDist2 = (a, b, q) => {
    const ab = b.clone().sub(a), t = clamp(q.clone().sub(a).dot(ab) / ab.lengthSq());
    return a.clone().addScaledVector(ab, t).distanceToSquared(q);
  };
  const fibers = [];
  for (let tries = 0; fibers.length < 240 && tries < 4000; tries++) {
    const c = V3(rand(X0, X1), rand(-YH - 1, YH + 1), rand(-ZH - 1, ZH + 1));
    const d = V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    const h = rand(4, 11);
    const a = c.clone().addScaledVector(d, -h / 2), b = c.clone().addScaledVector(d, h / 2);
    if (pathPts.some((q) => segDist2(a, b, q) < 0.42)) continue;
    fibers.push({ a, b, h, d, c, r: rand(0.07, 0.12) });
  }
  const fiberMat = new THREE.MeshStandardMaterial({ color: '#d8e6dc', roughness: 0.6, transparent: true, opacity: 0.85 });
  const fiberM = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7), fiberMat, fibers.length);
  const up = V3(0, 1, 0);
  fibers.forEach((f, i) => {
    dummy.position.copy(f.c); dummy.quaternion.setFromUnitVectors(up, f.d); dummy.scale.set(f.r, f.h, f.r);
    dummy.updateMatrix(); fiberM.setMatrixAt(i, dummy.matrix);
  });
  scene.add(fiberM);

  /* ---------- DNA: a strand of overlapping beads per piece ---------- */
  const total = chains.reduce((s, c) => s + c.beads, 0);
  const dnaMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, emissive: '#7dff9a', emissiveIntensity: 0 });
  const dnaM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8), dnaMat, total);
  dnaM.frustumCulled = false;
  const cLong = new THREE.Color('#1e40af'), cShort = new THREE.Color('#60a5fa'), tmpC = new THREE.Color();
  let at = 0;
  chains.forEach((c) => {
    c.first = at;
    const k = clamp((Math.log(c.bp) - Math.log(SHORT)) / (Math.log(LONG) - Math.log(SHORT)));
    tmpC.copy(cShort).lerp(cLong, k);
    for (let j = 0; j < c.beads; j++) dnaM.setColorAt(at++, tmpC);
  });
  scene.add(dnaM);

  const tmp = V3();
  const pathAt = (c, s, out) => {
    const f = clamp(s / STEP, 0, c.pts.length - 1.001), i = Math.floor(f);
    return out.lerpVectors(c.pts[i], c.pts[i + 1], f - i);
  };
  const S = { shown: 0 };
  function update(st, time) {
    const show = st.stage >= 1 ? 1 : 0;
    S.shown += (show - S.shown) * 0.08;
    dnaMat.emissiveIntensity = 1.3 * smooth(clamp(st.stain));
    let i = 0;
    for (const c of chains) {
      const head = c.s0 + travelUnits(c.bp) * st.run;
      for (let j = 0; j < c.beads; j++, i++) {
        pathAt(c, head - j * BEAD, tmp);
        // thermal wiggle, smaller toward the middle of a long strand
        const w = 0.07 + 0.05 * st.field;
        tmp.y += Math.sin(time * 2.1 + j * 0.9 + c.ph) * w;
        tmp.z += Math.cos(time * 1.7 + j * 0.7 + c.ph) * w;
        dummy.position.copy(tmp); dummy.quaternion.identity(); dummy.scale.setScalar(Math.max(1e-4, S.shown));
        dummy.updateMatrix(); dnaM.setMatrixAt(i, dummy.matrix);
      }
    }
    dnaM.instanceMatrix.needsUpdate = true;
  }

  /* ---------- labels and hover info ---------- */
  const shortC = chains.find((c) => c.bp === SHORT), longC = chains.find((c) => c.bp === LONG);
  const beadPos = (c, j) => { const m = new THREE.Matrix4(); dnaM.getMatrixAt(c.first + j, m); return V3().setFromMatrixPosition(m); };
  const f0 = fibers.reduce((best, f) => (Math.abs(f.c.x + 6) + Math.abs(f.c.y - 3) < Math.abs(best.c.x + 6) + Math.abs(best.c.y - 3) ? f : best), fibers[0]);
  const labels = [
    { key: 'fibers', ...TX.labels.fibers, anchor: () => f0.c.clone(), show: (t) => t.stage <= 1 },
    { key: 'short', text: TX.labels.short.text, sub: fmt(TX.labels.short.sub, { bp: SHORT.toLocaleString('en-US') }), anchor: () => beadPos(shortC, 0), show: (t) => t.stage >= 1 && t.stage < 3 },
    { key: 'long', text: TX.labels.long.text, sub: fmt(TX.labels.long.sub, { bp: LONG.toLocaleString('en-US') }), anchor: () => beadPos(longC, Math.floor(longC.beads / 2)), show: (t) => t.stage >= 1 && t.stage < 3 },
    { key: 'plus', ...TX.labels.plus, anchor: () => V3(X1 - 2, YH + 1.5, 0), show: (t) => t.stage === 2 },
  ];
  const interactives = [
    { root: fiberM, priority: 0, info: () => TX.info.fibers },
    { root: dnaM, priority: 1, info: () => TX.info.dna },
  ];

  const C = (k, mark = null) => ({ text: TX.cues[k], mark });
  function cue(st) {
    switch (st.stage) {
      case 0: return C('mesh', 'fibers');
      case 1: return C('loaded', 'short');
      case 2: return st.run < 0.12 ? C('pull', 'plus') : st.run < 0.5 ? C('sieve', 'short') : C('snake', 'long');
      default: return C('glow');
    }
  }

  return {
    scene, labels, interactives, update, cue,
    fov: 34, near: 0.1, far: 200, minDist: 8, maxDist: 80,
    views: [{ pos: V3(0, 7, 42), target: V3(0, 0, 0) }],
  };
}
