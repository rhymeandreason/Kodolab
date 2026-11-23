/* Molecule scale: DNA double helices, histones, a lipid bilayer, detergent micelles, Na+ ions, alcohol. 1 unit = 1 nm. Ported from the original Strawberry lab
 * (/Strawberry/js/molecule.js); sim-local. Everything is a pure function of the
 * experiment clock t (0..6, one unit per original step), so the lesson can
 * replay and scrub it. */
import * as THREE from 'three';
import { C, V, ph, win, clamp, lerp, rng, linear, easeOut, randDir, fibSphere, makeGlass, makeDissolve, makeTexture, dotTexture, mergeColored } from './util.js';
const phys = (c, o) => new THREE.MeshPhysicalMaterial(Object.assign({ color: C(c), roughness: 0.4, metalness: 0 }, o || {}));
const UP = V(0, 1, 0);

const COL = { A: '#ef476f', T: '#ffb703', G: '#06d6a0', C: '#3a86ff' };

export function createMolecule(env) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe0e2ee, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(-10, 18, 14);
  scene.add(key);
  const back = new THREE.DirectionalLight(0xf0ecff, 0.4);
  back.position.set(12, -8, -14);
  scene.add(back);

  const R = rng(99);
  const tmp = V(), tmp2 = V(), tmp3 = V(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = V();
  const sphere = new THREE.SphereGeometry(1, 18, 14);
  const sphereLo = new THREE.SphereGeometry(1, 12, 9);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1);

  const bbMat = phys('#2b3a55', { roughness: 0.32, clearcoat: 0.6 });
  const phMat = phys('#fb8500', { roughness: 0.3, clearcoat: 0.5 });
  const rungMat = phys('#ffffff', { roughness: 0.35, clearcoat: 0.3 });

  /* ---------- DNA double helix (B-form: 2 nm wide, 0.34 nm rise, 10.5 bp/turn) ---------- */
  function makeHelix(nbp, seed) {
    const r = rng(seed);
    const group = new THREE.Group();
    const rise = 0.34, Rr = 1.0, tw = (Math.PI * 2) / 10.5, off = 2.4;
    const len = (nbp - 1) * rise;
    const s1 = [], s2 = [];
    for (let i = 0; i < nbp; i++) {
      const x = -len / 2 + i * rise, a = i * tw;
      s1.push(V(x, Rr * Math.cos(a), Rr * Math.sin(a)));
      s2.push(V(x, Rr * Math.cos(a + off), Rr * Math.sin(a + off)));
    }
    [s1, s2].forEach((s) => {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(s), nbp * 6, 0.19, 8), bbMat);
      group.add(tube);
    });
    const phos = new THREE.InstancedMesh(sphere, phMat, nbp * 2);
    const rungs = new THREE.InstancedMesh(cyl, rungMat, nbp * 2);
    const q = new THREE.Quaternion();
    const phosLocal = [];
    for (let i = 0; i < nbp; i++) {
      [s1[i], s2[i]].forEach((p, j) => {
        tmpM.compose(p, q.identity(), tmpS.setScalar(0.27));
        phos.setMatrixAt(i * 2 + j, tmpM);
        phosLocal.push(p.clone());
      });
      const pair = r() < 0.5 ? ['A', 'T'] : ['G', 'C'];
      if (r() < 0.5) pair.reverse();
      const mid = tmp.copy(s1[i]).add(s2[i]).multiplyScalar(0.5);
      [[s1[i], pair[0]], [s2[i], pair[1]]].forEach(([p, b], j) => {
        const dir = tmp2.copy(mid).sub(p);
        const L = dir.length() - 0.18;
        dir.normalize();
        const c = tmp3.copy(p).addScaledVector(dir, 0.18 + L / 2);
        q.setFromUnitVectors(UP, dir);
        tmpM.compose(c, q, tmpS.set(0.14, L, 0.14));
        rungs.setMatrixAt(i * 2 + j, tmpM);
        rungs.setColorAt(i * 2 + j, C(COL[b]));
      });
    }
    rungs.instanceColor.needsUpdate = true;
    group.add(phos, rungs);
    return { group, phosLocal, s1, len };
  }

  const dnaRoot = new THREE.Group();
  scene.add(dnaRoot);
  const main = makeHelix(38, 5);
  dnaRoot.add(main.group);
  const others = [];
  const HEX = 2.35;
  for (let k = 0; k < 6; k++) {
    const h = makeHelix(30, 40 + k);
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

  /* ---------- histones ---------- */
  const histMat = phys('#cdb4e8', { roughness: 0.5, clearcoat: 0.3, transparent: true, opacity: 1 });
  const histones = [];
  [-4.2, 0.2, 4.4].forEach((x, k) => {
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i % 4) * (Math.PI / 2) + (i < 4 ? 0 : Math.PI / 4);
      const m = new THREE.Mesh(sphere, histMat);
      m.position.set(Math.cos(a) * 0.62, i < 4 ? 0.38 : -0.38, Math.sin(a) * 0.62);
      m.scale.setScalar(0.62);
      g.add(m);
    }
    const home = V(x, -2.25, 0.4);
    g.position.copy(home);
    g.rotation.set(0.3, k, 0.2);
    scene.add(g);
    histones.push({ g, home, away: V(x * 1.5 + (R() - 0.5) * 4, -9 - R() * 3, (R() - 0.5) * 10), rot: g.rotation.clone(), p: R() * 6 });
  });

  /* ---------- phospholipid bilayer → micelles ---------- */
  const lipidHeadMat = phys('#f28482', { roughness: 0.35, clearcoat: 0.5 });
  const lipidTailMat = phys('#f6bd60', { roughness: 0.5 });
  const detHeadMat = phys('#00b4d8', { roughness: 0.3, clearcoat: 0.6 });
  const detTailMat = phys('#90e0ef', { roughness: 0.5 });
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
  const ionMat = phys('#8338ec', { roughness: 0.25, clearcoat: 0.8, emissive: C('#4b1ca8'), emissiveIntensity: 0.35 });
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
    { geo: sphereLo.clone().scale(0.38, 0.38, 0.38), color: '#9aa3b2' },
    { geo: sphereLo.clone().scale(0.36, 0.36, 0.36).translate(0.62, 0.32, 0), color: '#b5bcc8' },
    { geo: sphereLo.clone().scale(0.36, 0.36, 0.36).translate(-0.62, 0.32, 0), color: '#b5bcc8' },
    { geo: sphereLo.clone().scale(0.34, 0.34, 0.34).translate(0, -0.6, 0.15), color: '#ff5a5f' },
    { geo: sphereLo.clone().scale(0.18, 0.18, 0.18).translate(0.1, -0.95, 0.45), color: '#ffffff' },
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
  function update(t, time) {
    // DNA spin + bundle
    const ionBind = ph(t, 2.6, 2.95);
    main.group.rotation.x = time * 0.12 * (0.3 + 0.7 * ionBind);
    const enter = ph(t, 3.15, 3.75);
    const spool = ph(t, 5.15, 5.9);
    others.forEach((o, i) => {
      o.h.group.visible = enter > 0.001;
      const k = ph(t, 4.3 + i * 0.05, 4.78 + i * 0.05);
      tmp.lerpVectors(o.far, o.free, enter);
      tmp.y += Math.sin(time * 0.5 + o.p) * 0.6;
      tmp.x += Math.cos(time * 0.4 + o.p) * 0.6;
      o.h.group.position.lerpVectors(tmp, o.bundle, k);
      tmpQ.setFromAxisAngle(o.axis, time * 0.12 + o.p).multiply(o.q0);
      o.h.group.quaternion.copy(tmpQ).slerp(qI, k);
      if (k > 0) o.h.group.rotation.x += time * 0.12 * k;
    });
    dnaRoot.rotation.set(spool * time * 0.35, 0, spool * 0.35);
    dnaRoot.position.y = -spool * 0.5;

    // histones release (salt) and drift away
    const hr = ph(t, 2.55, 2.95);
    histones.forEach((h) => {
      h.g.position.lerpVectors(h.home, h.away, hr);
      h.g.position.y += Math.sin(time * 0.6 + h.p) * 0.3 * hr;
      h.g.rotation.set(h.rot.x + time * 0.2 * hr, h.rot.y + time * 0.15 * hr, h.rot.z);
    });
    histMat.opacity = 1 - 0.45 * hr;

    // bilayer → micelles
    const micOut = ph(t, 2.8, 4.6);
    micelles.forEach((m) => {
      m.c.copy(m.c0).addScaledVector(m.drift, micOut * 3);
      m.c.y += Math.sin(time * 0.5 + m.p) * 0.3;
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
    waterMat.opacity = 0.5 - 0.3 * ph(t, 4.3, 4.8);
    const alcIn = ph(t, 4.05, 4.6);
    alc.visible = alcIn > 0.001;
    for (let i = 0; i < NALC; i++) {
      const a = alcData[i];
      const k = ph(t, 4.05 + a.delay * 0.15, 4.45 + a.delay * 0.15);
      tmp.lerpVectors(a.from, a.p, k);
      tmp.y += Math.sin(time * a.sp + i) * 0.4;
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
    { text: 'Sugar–phosphate backbone', anchor: () => wpos(main.group, main.s1[6]), show: (t) => t < 2.35 },
    { text: 'Base pairs', sub: 'A–T · G–C', anchor: () => wpos(main.group, V(2.6, 0, 0)), show: (t) => t < 2.35 },
    { text: 'Histone proteins', anchor: () => histones[2].g.position.clone().add(V(0, -1, 0)), show: (t) => t < 2.55 },
    { text: 'Membrane', sub: 'phospholipid bilayer', anchor: () => V(-6, BY + 2, 3.2), show: (t) => t < 2.3 },
    { text: 'Detergent (soap)', anchor: () => instPos(dHeads, 5), show: (t) => t >= 2.08 && t < 2.4 },
    { text: 'Micelle', sub: 'soap + lipids', anchor: () => micelles[1].c.clone().add(V(0, MR + 0.6, 0)), show: (t) => t >= 2.72 && t < 3.6 },
    { text: 'Na⁺ ions', sub: 'shield negative phosphates', anchor: () => instPos(ions, 20), show: (t) => t >= 2.85 && t < 3.9 },
    { text: 'Proteins drift away', anchor: () => histones[0].g.position.clone(), show: (t) => t >= 2.9 && t < 3.4 },
    { text: 'DNA from many cells', anchor: () => others[1].h.group.position.clone(), show: (t) => t >= 3.6 && t < 4.3 },
    { text: 'Alcohol', anchor: () => instPos(alc, 7), show: (t) => t >= 4.45 && t < 4.9 },
    { text: 'Strands stick together', sub: 'and precipitate', anchor: () => dnaRoot.localToWorld(V(-3, 3.6, 0)), show: (t) => t >= 4.85 },
  ];

  const interactives = [
    { root: main.group, priority: 2, info: () => ({ title: 'DNA double helix', text: 'About 2 nm wide. Two backbones twisted around base pairs A–T and G–C.' }) },
    { root: lHeads, priority: 1, info: () => ({ title: 'Phospholipids', text: 'Water-loving heads, fat-loving tails. Two layers make a membrane.' }) },
    { root: lTails, priority: 1, info: () => ({ title: 'Phospholipids', text: 'Water-loving heads, fat-loving tails. Two layers make a membrane.' }) },
    { root: dHeads, priority: 1, info: () => ({ title: 'Detergent molecule', text: 'Pries lipids out of the membrane and wraps them into micelles.' }) },
    { root: ions, priority: 2, info: () => ({ title: 'Na⁺ ion', text: 'From the salt. Neutralizes the negative phosphate groups on DNA.' }) },
    { root: alc, priority: 1, info: () => ({ title: 'Isopropyl alcohol', text: 'DNA can’t dissolve in it, so the strands come out of solution.' }) },
  ];
  histones.forEach((h) => interactives.push({ root: h.g, priority: 1, info: () => ({ title: 'Histone proteins', text: 'Spools that DNA wraps around. Salt helps pull them off.' }) }));
  others.forEach((o) => interactives.push({ root: o.h.group, priority: 1, info: () => ({ title: 'DNA molecule', text: 'Freed DNA from other cells, floating in the buffer.' }) }));

  const views = [
    { pos: V(9, 8, 36), target: V(0, 2.5, 0) },
    { pos: V(-8, 7, 35), target: V(0, 2.5, 0) },
    { pos: V(5, 11, 37), target: V(0, 4, 0) },
    { pos: V(12, 9, 42), target: V(0, 1, 0) },
    { pos: V(12, 7, 29), target: V(0, 0.5, 0) },
    { pos: V(16, 9, 33), target: V(0, 0, 0) },
  ];
  const legend = [
    { c: COL.A, l: 'Adenine' }, { c: COL.T, l: 'Thymine' }, { c: COL.G, l: 'Guanine' }, { c: COL.C, l: 'Cytosine' },
    { c: '#2b3a55', l: 'Backbone' }, { c: '#fb8500', l: 'Phosphate (−)' }, { c: '#8338ec', l: 'Na⁺ ion' },
    { c: '#cdb4e8', l: 'Histone' }, { c: '#f28482', l: 'Lipid' }, { c: '#00b4d8', l: 'Detergent' }, { c: '#9aa3b2', l: 'Alcohol' },
  ];
  return { scene, update, labels, interactives, views, legend, minDist: 6, maxDist: 70, fov: 38, near: 0.1, far: 400 };
}
