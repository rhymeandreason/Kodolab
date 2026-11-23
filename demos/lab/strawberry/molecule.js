/* Molecule scale: chromatin and free DNA, histones, a lipid bilayer, detergent micelles, Na+ ions, alcohol. 1 unit = 1 nm.
 * Sim-local. Poses are a function of the experiment clock t (0..6, one unit per
 * original step), so the lesson can replay and scrub it.
 *
 * DNA is kit/duplex.js drawn by kit/nucleic.js, and every colour is palette.js's,
 * so this view and the protein benches agree. strawberry-lab.html loads all three
 * as classic scripts; Duplex and MolPalette are read by their global names. */
import * as THREE from 'three';
import { LIGHT } from '../core/three-compat.js';
import { cueAt } from '../lesson.js';
import { T as TEXT } from '../text.js';
import { C, V, ph, win, clamp, lerp, rng, linear, easeOut, randDir, fibSphere, makeGlass, makeDissolve, makeTexture, dotTexture, mergeColored } from './util.js';
const phys = (c, o) => new THREE.MeshPhysicalMaterial(Object.assign({ color: C(c), roughness: 0.4, metalness: 0 }, o || {}));
const UP = V(0, 1, 0);

const PAL = globalThis.MolPalette;
const css = (n) => '#' + n.toString(16).padStart(6, '0');

export function createMolecule(env) {
  const TX = TEXT.levels.mol;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe0e2ee, 0.7 * LIGHT));
  const key = new THREE.DirectionalLight(0xffffff, 0.9 * LIGHT);
  key.position.set(-10, 18, 14);
  scene.add(key);
  const back = new THREE.DirectionalLight(0xf0ecff, 0.4 * LIGHT);
  back.position.set(12, -8, -14);
  scene.add(back);

  const R = rng(99);
  const tmp = V(), tmp2 = V(), tmp3 = V(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = V();
  const sphere = new THREE.SphereGeometry(1, 18, 14);
  const sphereLo = new THREE.SphereGeometry(1, 12, 9);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1);

  /* ---------- DNA: kit/duplex.js's ideal B-DNA, drawn by kit/nucleic.js ----------
     Chromatin first: two nucleosomes on linker DNA, each 146 bp wound 1.9 times
     left-handed round a histone octamer, the wrap calibrated to 1AOI. Salt strips
     the octamers and the same molecule relaxes to a straight duplex far longer
     than the frame. Duplex works in A; S takes it to this scene's nm. */
  const S = 0.1;
  const NUC = Duplex.NUCLEOSOME;
  const dnaMat = (hex) => phys(hex, { roughness: 0.4, clearcoat: 0.4 });
  const tilt = new THREE.Vector3(0, 0.45, 1).normalize();          // the octamers' axis: face-on, a little from above
  const D3 = [tilt.x, tilt.y, tilt.z], DYAD = [0, -1, 0];
  const wraps = [-78, 78].map((x) => Duplex.superhelix({ centre: [x, -6, 0], axis: D3, dyad: DYAD }));
  const end = (pts, last) => {
    const i = last ? pts.length - 1 : 0, j = last ? i - 1 : 1;
    const p = pts[i], q = pts[j], d = last ? [p[0] - q[0], p[1] - q[1], p[2] - q[2]] : [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    return { p, t: d };
  };
  const in1 = end(wraps[0], false), out1 = end(wraps[0], true), in2 = end(wraps[1], false), out2 = end(wraps[1], true);
  const wrappedPath = Duplex.join(
    Duplex.hermite([-330, -60, -40], [1, 0, 0], in1.p, in1.t, 30),
    wraps[0],
    Duplex.hermite(out1.p, out1.t, in2.p, in2.t, 40),
    wraps[1],
    Duplex.hermite(out2.p, out2.t, [330, -60, 40], [1, 0, 0], 30));
  const wArc = Duplex.arc(wrappedPath);
  const NBP = Math.round(wArc.total / Duplex.B.rise) + 1;
  const M = 900;
  const wrappedR = [], straightR = [];
  for (let i = 0; i <= M; i++) {
    wrappedR.push(wArc.at(wArc.total * i / M).p);
    straightR.push([wArc.total * (i / M - 0.5), 0, 0]);
  }
  const seq = Duplex.trace({ n: NBP, seed: 5 }).chains.A.seq;
  function chromatin(k) {
    const axis = wrappedR.map((a, i) => [a[0] + (straightR[i][0] - a[0]) * k, a[1] + (straightR[i][1] - a[1]) * k, a[2] + (straightR[i][2] - a[2]) * k]);
    return Duplex.trace({ axis, seq, fit: true, bpPerTurn: lerp(NUC.bpPerTurn, Duplex.B.bpPerTurn, k) });
  }
  let mainK = 0, mainTrace = chromatin(0);
  const main = { group: Duplex.group(THREE, mainTrace, { scale: S, sub: 4, material: dnaMat }) };
  const straight = chromatin(1);
  // where Na+ lands: phosphates of the relaxed duplex, in the frame
  main.phosLocal = [];
  straight.order.forEach((id) => straight.chains[id].P.forEach((p) => { if (Math.abs(p[0]) < 90) main.phosLocal.push(V(p[0] * S, p[1] * S, p[2] * S)); }));
  main.phosLocal.sort((a, b) => a.x - b.x);
  const pairMid = (tr, i) => { const m = tr.pairs[i].mid; return V(m[0] * S, m[1] * S, m[2] * S); };
  const linkerPair = Math.round(NBP / 2);

  const dnaRoot = new THREE.Group();
  scene.add(dnaRoot);
  dnaRoot.add(main.group);
  const others = [];
  const HEX = 2.35;
  for (let k = 0; k < 6; k++) {
    const h = { group: Duplex.group(THREE, Duplex.trace({ n: 120, seed: 40 + k, phase: k }), { scale: S, sub: 4, material: dnaMat }) };
    h.group.visible = false;
    dnaRoot.add(h.group);
    const a = (k / 6) * Math.PI * 2;
    const freeDir = randDir(R);
    freeDir.y *= 0.5;
    freeDir.normalize();
    others.push({
      h,
      free: freeDir.clone().multiplyScalar(9 + R() * 5).add(V(0, -1, 0)),
      far: freeDir.clone().multiplyScalar(36),
      q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)),
      axis: randDir(R),
      bundle: V((R() - 0.5) * 1.5, Math.cos(a) * HEX, Math.sin(a) * HEX),
      p: R() * 6,
    });
  }

  /* ---------- histone octamers: (H3-H4)2 and two H2A-H2B, in palette.js's four ----------
     Eight lobes in two layers, one per chain; the layers are dyad mates, so each
     histone's two copies sit mirror to each other. Sized to fill the wrap. */
  const HIS = PAL.histones;
  const histMats = {};
  ['H3', 'H4', 'H2A', 'H2B'].forEach((k) => { histMats[k] = phys(HIS[k], { roughness: 0.5, clearcoat: 0.3, transparent: true, opacity: 1 }); });
  const LOBES = [['H3', 0.35], ['H4', 1.9], ['H2B', 3.5], ['H2A', 5.0]];
  const histones = [];
  const Dv = tilt.clone(), Uv = V(...DYAD).addScaledVector(Dv, -V(...DYAD).dot(Dv)).normalize(), Wv = V().crossVectors(Dv, Uv);
  const histQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Uv, Wv, Dv));
  wraps.forEach((_, k) => {
    const g = new THREE.Group();
    [1, -1].forEach((layer) => LOBES.forEach(([name, phi]) => {
      const m = new THREE.Mesh(sphere, histMats[name]);
      const a = layer * phi;                              // the dyad (local x) maps phi to -phi
      m.position.set(Math.cos(a) * 1.55, Math.sin(a) * 1.55, layer * 0.95);
      m.scale.setScalar(1.45);
      m.userData.histone = name;
      g.add(m);
    }));
    const home = V([-78, 78][k] * S, -6 * S, 0);
    g.position.copy(home);
    g.quaternion.copy(histQ);
    scene.add(g);
    histones.push({ g, home, away: V(home.x * 1.6 + (R() - 0.5) * 4, -10 - R() * 3, (R() - 0.5) * 8), q: histQ.clone(), axis: randDir(R), p: R() * 6 });
  });

  /* ---------- phospholipid bilayer → micelles ---------- */
  const lipidHeadMat = phys(PAL.organelles.plasma.head, { roughness: 0.35, clearcoat: 0.5 });
  const lipidTailMat = phys(PAL.organelles.plasma.tail, { roughness: 0.5 });
  const detHeadMat = phys(PAL.atoms.S, { roughness: 0.3, clearcoat: 0.6 });   // a sulfate head: dish soap is mostly sodium laureth sulfate
  const detTailMat = phys(PAL.atoms.C, { roughness: 0.5 });
  const BY = 6.8;
  const lipids = [];
  for (let leaf = 0; leaf < 2; leaf++) {
    for (let ix = 0; ix < 17; ix++) {
      for (let iz = 0; iz < 8; iz++) {
        const x = -8 + ix * 1.0 + (iz % 2) * 0.5 + (R() - 0.5) * 0.12, z = -3.5 + iz * 0.9 + (R() - 0.5) * 0.12;
        const y = BY + (leaf === 0 ? 1.45 : -1.45);
        lipids.push({ bp: V(x, y, z), bd: V(0, leaf === 0 ? -1 : 1, 0), p: R() * 6, delay: R() });
      }
    }
  }
  const NMIC = 6;
  const micelles = [];
  for (let k = 0; k < NMIC; k++) {
    micelles.push({ c0: V(-11.5 + k * 4.6, BY + (k % 2 ? 2.4 : -0.6) + (R() - 0.5), (R() - 0.5) * 5), drift: V((k - 2.5) * 0.8, 1 + R() * 2, (R() - 0.5) * 3), p: R() * 6, c: V() });
  }
  const NDET = 66;
  const dets = [];
  for (let i = 0; i < NDET; i++) {
    const d = randDir(R);
    const anchor = lipids[Math.floor(R() * lipids.length)];
    dets.push({
      far: d.clone().setZ(-Math.abs(d.z) - 0.3).normalize().multiplyScalar(26 + R() * 8).add(V(0, BY, 0)),
      near: anchor.bp.clone().addScaledVector(anchor.bd, -1.0).add(V((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6)),
      nd: anchor.bd.clone(), p: R() * 6, delay: R(),
    });
  }
  const perMic = Math.ceil(lipids.length / NMIC) + Math.ceil(NDET / NMIC);
  lipids.forEach((l, i) => { l.m = i % NMIC; l.slot = Math.floor(i / NMIC); });
  dets.forEach((d, i) => { d.m = i % NMIC; d.slot = Math.ceil(lipids.length / NMIC) + Math.floor(i / NMIC); });
  const slotDirs = [];
  for (let i = 0; i < perMic; i++) slotDirs.push(fibSphere(i, perMic));
  const MR = 2.35;

  const lHeads = new THREE.InstancedMesh(sphereLo, lipidHeadMat, lipids.length);
  const lTails = new THREE.InstancedMesh(cyl, lipidTailMat, lipids.length * 2);
  const dHeads = new THREE.InstancedMesh(sphereLo, detHeadMat, NDET);
  const dTails = new THREE.InstancedMesh(cyl, detTailMat, NDET);
  [lHeads, lTails, dHeads, dTails].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });

  const _side = V(), _q = new THREE.Quaternion(), _c = V();
  function placeAmphiphile(i, head, dir, headMesh, tailMesh, hs, tailLen, tailR, twoTails, s) {
    tmpM.compose(head, tmpQ.identity(), tmpS.setScalar(hs * s));
    headMesh.setMatrixAt(i, tmpM);
    _q.setFromUnitVectors(UP, dir);
    _side.set(1, 0, 0).applyQuaternion(_q);
    const n = twoTails ? 2 : 1;
    for (let k = 0; k < n; k++) {
      _c.copy(head).addScaledVector(dir, hs * 0.8 + tailLen / 2);
      if (twoTails) _c.addScaledVector(_side, k === 0 ? -0.15 : 0.15);
      tmpM.compose(_c, _q, tmpS.set(tailR * s, tailLen * s, tailR * s));
      tailMesh.setMatrixAt(i * n + k, tmpM);
    }
  }

  /* ---------- Na+ ions ---------- */
  const ionMat = phys(PAL.atoms.Na, { roughness: 0.25, clearcoat: 0.8, emissive: C(PAL.atoms.Na), emissiveIntensity: 0.25 });
  const NION = 70;
  const ions = new THREE.InstancedMesh(sphere, ionMat, NION);
  ions.frustumCulled = false;
  scene.add(ions);
  const ionData = [];
  for (let i = 0; i < NION; i++) {
    const pi = Math.floor((i / NION) * main.phosLocal.length);
    const pl = main.phosLocal[pi];
    const radial = V(0, pl.y, pl.z).normalize();
    ionData.push({
      far: (() => { const d = randDir(R).multiplyScalar(30); d.z = -Math.abs(d.z) - 8; return d; })(),
      free: V((R() - 0.5) * 26, (R() - 0.5) * 14, (R() - 0.5) * 14),
      bound: pl.clone().addScaledVector(radial, 0.62).add(V((R() - 0.5) * 0.3, 0, 0)),
      delay: R(), p: R() * 6, f: 0.5 + R(),
    });
  }

  /* ---------- water + alcohol ---------- */
  const waterGeo = new THREE.BufferGeometry();
  const wp = [];
  for (let i = 0; i < 1300; i++) wp.push((R() - 0.5) * 38, (R() - 0.5) * 24, (R() - 0.5) * 24);
  waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  const waterMat = new THREE.PointsMaterial({ color: C('#7cc6f2'), size: 0.28, map: dotTexture(), transparent: true, opacity: 0.5, depthWrite: false });
  const water = new THREE.Points(waterGeo, waterMat);
  scene.add(water);

  const alcGeo = mergeColored([
    { geo: sphereLo.clone().scale(0.38, 0.38, 0.38), color: css(PAL.atoms.C) },
    { geo: sphereLo.clone().scale(0.36, 0.36, 0.36).translate(0.62, 0.32, 0), color: css(PAL.atoms.C) },
    { geo: sphereLo.clone().scale(0.36, 0.36, 0.36).translate(-0.62, 0.32, 0), color: css(PAL.atoms.C) },
    { geo: sphereLo.clone().scale(0.34, 0.34, 0.34).translate(0, -0.6, 0.15), color: css(PAL.atoms.O) },
    { geo: sphereLo.clone().scale(0.18, 0.18, 0.18).translate(0.1, -0.95, 0.45), color: css(PAL.atoms.H) },
  ]);
  const NALC = 95;
  const alc = new THREE.InstancedMesh(alcGeo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, clearcoat: 0.5 }), NALC);
  alc.frustumCulled = false;
  scene.add(alc);
  const alcData = [];
  for (let i = 0; i < NALC; i++) {
    const p = V((R() - 0.5) * 32, (R() - 0.5) * 16, (R() - 0.5) * 14 - 2);
    if (Math.hypot(p.y, p.z) < 4.5 && Math.abs(p.x) < 8) p.y += p.y > 0 ? 4.5 : -4.5;
    alcData.push({ p, from: p.clone().add(V((R() - 0.5) * 6, 26 + R() * 10, 0)), axis: randDir(R), sp: 0.3 + R(), delay: R(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)) });
  }

  /* ---------- update ---------- */
  const qI = new THREE.Quaternion();
  let spin = 0, spoolSpin = 0, lastTime = 0;
  const X = V(1, 0, 0), qSpin = new THREE.Quaternion();
  function update(t, time) {
    // DNA spin + bundle
    const ionBind = ph(t, 2.6, 2.95);
    // unwrap as the octamers leave; the geometry is rebuilt only while it moves
    const uk = ph(t, 2.55, 3.1);
    if (Math.abs(uk - mainK) > 0.02 || ((uk === 0 || uk === 1) && uk !== mainK)) {
      mainK = uk;
      mainTrace = chromatin(uk);
      main.group.userData.rebuild(mainTrace);
    }
    // spin about its own axis only once it is a straight duplex
    const dt = clamp(time - lastTime, 0, 0.1);
    lastTime = time;
    spin += dt * 0.12 * ionBind;
    main.group.rotation.x = spin;
    const enter = ph(t, 3.15, 3.75);
    const spool = ph(t, 5.15, 5.9);
    others.forEach((o, i) => {
      o.h.group.visible = enter > 0.001;
      const k = ph(t, 4.3 + i * 0.05, 4.78 + i * 0.05);
      tmp.lerpVectors(o.far, o.free, enter);
      tmp.y += Math.sin(time * 0.5 + o.p) * 0.6;
      tmp.x += Math.cos(time * 0.4 + o.p) * 0.6;
      // bundled, a strand turns rigidly with the main helix: same spin about x, its slot carried round
      qSpin.setFromAxisAngle(X, spin);
      o.h.group.position.lerpVectors(tmp, tmp2.copy(o.bundle).applyQuaternion(qSpin), k);
      tmpQ.setFromAxisAngle(o.axis, time * 0.12 + o.p).multiply(o.q0);
      o.h.group.quaternion.copy(tmpQ).slerp(qSpin, k);
    });
    spoolSpin += dt * 0.35 * spool;
    dnaRoot.rotation.set(spoolSpin, 0, spool * 0.35);
    dnaRoot.position.y = -spool * 0.5;
    // lifted out on the skewer: everything still dissolved falls away below the DNA
    const lift = ph(t, 5.72, 6.0);
    const drop = lift * 30;

    // histones release (salt) and drift away
    const hr = ph(t, 2.55, 2.95);
    histones.forEach((h) => {
      h.g.position.lerpVectors(h.home, h.away, hr);
      h.g.position.y += Math.sin(time * 0.6 + h.p) * 0.3 * hr - drop;
      h.g.quaternion.setFromAxisAngle(h.axis, (time * 0.2 + h.p) * hr).multiply(h.q);
    });
    Object.values(histMats).forEach((m) => { m.opacity = (1 - 0.45 * hr) * (1 - lift); });

    // bilayer → micelles
    const micOut = ph(t, 2.8, 4.6);
    micelles.forEach((m) => {
      m.c.copy(m.c0).addScaledVector(m.drift, micOut * 3);
      m.c.y += Math.sin(time * 0.5 + m.p) * 0.3 - drop;
    });
    const rotY = time * 0.25;
    for (let i = 0; i < lipids.length; i++) {
      const l = lipids[i];
      const k = ph(t, 2.35 + l.delay * 0.18, 2.65 + l.delay * 0.18);
      const m = micelles[l.m];
      const sd = tmp3.copy(slotDirs[l.slot]).applyAxisAngle(UP, rotY + m.p);
      const mp = tmp2.copy(m.c).addScaledVector(sd, MR);
      tmp.lerpVectors(l.bp, mp, k);
      tmp.y += Math.sin(time * 1.3 + l.p) * 0.06;
      const dir = V().copy(l.bd).lerp(sd.negate(), k).normalize();
      if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
      placeAmphiphile(i, tmp, dir, lHeads, lTails, 0.42, 1.15, 0.1, true, 1);
    }
    for (let i = 0; i < NDET; i++) {
      const d = dets[i];
      const a = ph(t, 2.0 + d.delay * 0.1, 2.28 + d.delay * 0.1);
      const k = ph(t, 2.35 + d.delay * 0.18, 2.65 + d.delay * 0.18);
      const m = micelles[d.m];
      const sd = tmp3.copy(slotDirs[d.slot]).applyAxisAngle(UP, rotY + m.p);
      tmp.lerpVectors(d.far, d.near, a);
      tmp2.copy(m.c).addScaledVector(sd, MR);
      tmp.lerp(tmp2, k);
      tmp.x += Math.sin(time * 1.1 + d.p) * 0.1 * (1 - k);
      const dir = V().copy(d.nd).lerp(sd.negate(), k).normalize();
      if (dir.lengthSq() < 0.01) dir.set(0, -1, 0);
      placeAmphiphile(i, tmp, dir, dHeads, dTails, 0.32, 1.0, 0.09, false, a > 0.001 ? 1 : 0);
    }
    [lHeads, lTails, dHeads, dTails].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    dHeads.visible = dTails.visible = t > 1.99;

    // Na+ ions
    main.group.updateMatrixWorld(true);
    const ionIn = ph(t, 2.35, 2.6);
    for (let i = 0; i < NION; i++) {
      const d = ionData[i];
      if (ionIn <= 0.001) { ions.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); continue; }
      tmp.lerpVectors(d.far, d.free, ionIn);
      tmp.x += Math.sin(time * d.f + d.p) * 0.7;
      tmp.y += Math.cos(time * d.f * 0.8 + d.p) * 0.7;
      const kb = ph(t, 2.6 + d.delay * 0.2, 2.8 + d.delay * 0.2);
      if (kb > 0) {
        main.group.localToWorld(tmp2.copy(d.bound));
        tmp2.x += Math.sin(time * 2 + d.p) * 0.06;
        tmp.lerp(tmp2, kb);
      }
      tmpM.compose(tmp, qI, tmpS.setScalar(0.32));
      ions.setMatrixAt(i, tmpM);
    }
    ions.instanceMatrix.needsUpdate = true;

    // water + alcohol
    water.rotation.y = time * 0.01;
    water.rotation.x = Math.sin(time * 0.05) * 0.05;
    waterMat.opacity = (0.5 - 0.3 * ph(t, 4.3, 4.8)) * (1 - lift);
    water.position.y = -drop;
    const alcIn = ph(t, 4.05, 4.6);
    alc.visible = alcIn > 0.001;
    for (let i = 0; i < NALC; i++) {
      const a = alcData[i];
      const k = ph(t, 4.05 + a.delay * 0.15, 4.45 + a.delay * 0.15);
      tmp.lerpVectors(a.from, a.p, k);
      tmp.y += Math.sin(time * a.sp + i) * 0.4 - drop;
      tmpQ.setFromAxisAngle(a.axis, time * a.sp).multiply(a.q);
      tmpM.compose(tmp, tmpQ, tmpS.setScalar(k > 0.001 ? 1 : 0));
      alc.setMatrixAt(i, tmpM);
    }
    alc.instanceMatrix.needsUpdate = true;
  }

  /* ---------- labels / interactives / views ---------- */
  const wpos = (obj, local) => obj.localToWorld(local.clone());
  const _m4 = new THREE.Matrix4();
  const instPos = (mesh, i) => { mesh.getMatrixAt(i, _m4); return V().setFromMatrixPosition(_m4); };
  const labels = [
    { key: 'backbone', ...TX.labels.backbone, anchor: () => { const p = mainTrace.chains.A.P[linkerPair - 4]; return wpos(main.group, V(p[0] * S, p[1] * S, p[2] * S)); }, show: (t) => t < 2.35 },
    { key: 'bases', ...TX.labels.bases, anchor: () => wpos(main.group, pairMid(mainTrace, linkerPair + 6)), show: (t) => t < 2.35 },
    { key: 'histones', ...TX.labels.histones, anchor: () => histones[1].g.position.clone().add(V(0, -3.4, 0)), show: (t) => t < 2.55 },
    { key: 'membrane', ...TX.labels.membrane, anchor: () => V(-6, BY + 2, 3.2), show: (t) => t < 2.3 },
    { key: 'soap', ...TX.labels.soap, anchor: () => instPos(dHeads, 5), show: (t) => t >= 2.08 && t < 2.4 },
    { key: 'micelle', ...TX.labels.micelle, anchor: () => micelles[1].c.clone().add(V(0, MR + 0.6, 0)), show: (t) => t >= 2.72 && t < 3.15 },
    { key: 'ions', ...TX.labels.ions, anchor: () => instPos(ions, 20), show: (t) => t >= 2.85 && t < 3.9 },
    { key: 'drift', ...TX.labels.drift, anchor: () => histones[0].g.position.clone(), show: (t) => t >= 2.9 && t < 3.15 },
    { key: 'passes', ...TX.labels.passes, anchor: () => micelles[2].c.clone().add(V(0, MR + 0.6, 0)), show: (t) => t >= 3.15 && t < 3.55 },
    { key: 'unwinds', ...TX.labels.unwinds, anchor: () => wpos(main.group, pairMid(mainTrace, linkerPair)), show: (t) => t >= 2.95 && t < 3.15 },
    { key: 'many', ...TX.labels.many, anchor: () => others[1].h.group.position.clone(), show: (t) => t >= 3.6 && t < 4.3 },
    { key: 'alcohol', ...TX.labels.alcohol, anchor: () => instPos(alc, 7), show: (t) => t >= 4.45 && t < 4.9 },
    { key: 'stick', ...TX.labels.stick, anchor: () => dnaRoot.localToWorld(V(-3, 3.6, 0)), show: (t) => t >= 4.85 && t < 5.78 },
    { key: 'lifted', ...TX.labels.lifted, anchor: () => dnaRoot.localToWorld(V(-3, 3.6, 0)), show: (t) => t >= 5.78 },
  ];

  const interactives = [
    { root: main.group, priority: 2, info: (t) => TX.info[t < 2.6 ? 'chromatin' : 'helix'] },
    { root: lHeads, priority: 1, info: () => TX.info.lipids },
    { root: lTails, priority: 1, info: () => TX.info.lipids },
    { root: dHeads, priority: 1, info: () => TX.info.soap },
    { root: ions, priority: 2, info: () => TX.info.ion },
    { root: alc, priority: 1, info: () => TX.info.alcohol },
  ];
  histones.forEach((h) => interactives.push({ root: h.g, priority: 3, info: () => TX.info.histones }));
  others.forEach((o) => interactives.push({ root: o.h.group, priority: 1, info: () => TX.info.other }));

  const views = [
    { pos: V(9, 8, 36), target: V(0, 2.5, 0) },
    { pos: V(-8, 7, 35), target: V(0, 2.5, 0) },
    { pos: V(5, 11, 37), target: V(0, 4, 0) },
    { pos: V(12, 9, 42), target: V(0, 1, 0) },
    { pos: V(12, 7, 29), target: V(0, 0.5, 0) },
    { pos: V(16, 9, 33), target: V(0, 0, 0) },
  ];
  const legend = [
    { c: css(PAL.bases.A), l: TX.legend.A }, { c: css(PAL.bases.T), l: TX.legend.T }, { c: css(PAL.bases.G), l: TX.legend.G }, { c: css(PAL.bases.C), l: TX.legend.C },
    { c: css(PAL.strands.a), l: TX.legend.backbone }, { c: css(PAL.strands.b), l: TX.legend.partner }, { c: css(PAL.atoms.Na), l: TX.legend.ion },
    { c: css(PAL.histones.H3), l: TX.legend.histone }, { c: css(PAL.organelles.plasma.head), l: TX.legend.lipid }, { c: css(PAL.atoms.S), l: TX.legend.soap }, { c: css(PAL.atoms.C), l: TX.legend.alcohol },
  ];

  /* Watch's caption at this level; times match the labels' windows above */
  const CUES = [   // [t, caption key in text.js, label key it points at]
    [0, 'octoploid', null], [0.3, 'helix', 'bases'], [0.6, 'histones', 'histones'], [0.95, 'membrane', 'membrane'],
    [1.28, 'mash', 'membrane'],
    [2.0, 'soap', 'soap'], [2.2, 'pry', 'soap'], [2.72, 'micelles', 'micelle'], [2.85, 'ions', 'ions'], [2.95, 'unwind', 'unwinds'],
    [3.15, 'filter', 'passes'], [3.6, 'free', 'many'],
    [4.45, 'alcohol', 'alcohol'], [4.85, 'stick', 'stick'], [5.78, 'lifted', 'lifted'],
  ].map(([t, k, mark]) => [t, { text: TX.cues[k], mark }]);
  const cue = (t) => cueAt(CUES, t);

  return { scene, update, labels, interactives, views, legend, cue, minDist: 6, maxDist: 70, fov: 38, near: 0.1, far: 400 };
}
