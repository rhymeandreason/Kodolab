/* Cell scale: a strawberry fruit cell, its breakdown, and the DNA released from it. Ported from the original Strawberry lab
 * (/Strawberry/js/cell.js); sim-local. Everything is a pure function of the
 * experiment clock t (0..6, one unit per original step), so the lesson can
 * replay and scrub it. */
import * as THREE from 'three';
import { cueAt } from '../lesson.js';
import { C, V, ph, win, clamp, lerp, rng, linear, easeOut, randDir, fibSphere, makeGlass, makeDissolve, makeTexture, dotTexture, mergeColored } from './util.js';

const phys = (c, o) => new THREE.MeshPhysicalMaterial(Object.assign({ color: C(c), roughness: 0.4, metalness: 0 }, o || {}));

export function createCell(env) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe7ee, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(-8, 14, 12);
  scene.add(key);
  const back = new THREE.DirectionalLight(0xfff0f4, 0.45);
  back.position.set(10, -6, -12);
  scene.add(back);

  const R = rng(21);
  const RAD = V(6.2, 5.2, 5.0);
  const dot = dotTexture();
  const tmp = V(), tmp2 = V(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = V();
  const pointsMat = (color, size, opacity) => new THREE.PointsMaterial({
    color: C(color), size, map: dot, transparent: true, opacity, depthWrite: false, sizeAttenuation: true,
  });
  const insideEllipsoid = (k) => {
    for (;;) {
      const p = V(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1);
      if (p.lengthSq() <= 1) return p.multiply(RAD).multiplyScalar(k);
    }
  };

  /* ---------- neighbouring cells (tissue context) ---------- */
  const ghostMat = makeGlass({ color: '#b8dcb2', opacity: 0.16, rim: 0.3, roughness: 0.4, env: 0.6 });
  const ghostNuc = phys('#a99cf2', { transparent: true, opacity: 0.25, depthWrite: false });
  const neighbors = [];
  const nbRoot = new THREE.Group();
  scene.add(nbRoot);
  [[12.9, 0.6, -1], [-12.9, -0.4, -1.5], [0.4, 10.9, -1.2], [-0.6, -10.9, -1], [11.8, 10.2, -3], [-11.6, -10.0, -2.5], [12.0, -9.8, -2.2], [-12.4, 9.9, -2.8], [0, 0, -10.8]].forEach((p, i) => {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), ghostMat);
    shell.scale.copy(RAD).multiplyScalar(0.96 + R() * 0.08);
    shell.renderOrder = 3;
    const nuc = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), ghostNuc);
    nuc.position.set((R() - 0.5) * 5, (R() - 0.5) * 3, (R() - 0.5) * 3);
    g.add(nuc, shell);
    g.position.set(p[0], p[1], p[2]);
    nbRoot.add(g);
    neighbors.push({ g, home: g.position.clone(), dir: g.position.clone().normalize() });
  });

  /* ---------- cell wall (breakable patches) ---------- */
  const wallTex = makeTexture((ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      ctx.strokeStyle = `rgba(70,130,80,${0.1 + Math.random() * 0.22})`;
      ctx.lineWidth = 1 + Math.random() * 2.5;
      ctx.beginPath();
      const y0 = Math.random() * h;
      const s = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.6);
      ctx.moveTo(-20, y0);
      ctx.bezierCurveTo(w * 0.3, y0 + s * w * 0.3, w * 0.7, y0 + s * w * 0.5, w + 20, y0 + s * w);
      ctx.stroke();
    }
  }, 256, 256);
  const wallMat = makeGlass({ color: '#9fd49a', opacity: 0.16, rim: 0.5, roughness: 0.45, env: 0.6 });
  wallMat.map = wallTex;
  const wall = new THREE.Group();
  scene.add(wall);
  const patches = [];
  const NP = 8, NT = 6;
  for (let i = 0; i < NP; i++) {
    for (let j = 0; j < NT; j++) {
      const gap = 0.022;
      const g = new THREE.SphereGeometry(1, 7, 6,
        ((i + gap) / NP) * Math.PI * 2, ((1 - 2 * gap) / NP) * Math.PI * 2,
        ((j + gap) / NT) * Math.PI, ((1 - 2 * gap) / NT) * Math.PI);
      g.scale(RAD.x, RAD.y, RAD.z);
      const p = g.attributes.position;
      const ctr = V();
      for (let k = 0; k < p.count; k++) ctr.add(tmp.fromBufferAttribute(p, k));
      ctr.divideScalar(p.count);
      g.translate(-ctr.x, -ctr.y, -ctr.z);
      const m = new THREE.Mesh(g, wallMat);
      m.position.copy(ctr);
      m.renderOrder = 4;
      wall.add(m);
      patches.push({
        mesh: m, home: ctr.clone(), dir: ctr.clone().normalize(),
        axis: randDir(R), spin: (R() - 0.5) * 3, dist: 2.5 + R() * 4.5, delay: R(),
        sweep: V(22 + R() * 10, (R() - 0.5) * 10, (R() - 0.5) * 8), sd: R() * 0.35,
      });
    }
  }

  const wallLabelPatch = patches.reduce((best, p) => (p.dir.dot(V(0.55, 0.45, 0.7)) > best.dir.dot(V(0.55, 0.45, 0.7)) ? p : best), patches[0]);

  /* ---------- membrane ---------- */
  const memMat = makeDissolve({
    color: C('#f39bb0'), roughness: 0.3, transparent: true, opacity: 0.26,
    side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.6,
  }, { edge: '#ff5d84', scale: 2.4 });
  const membrane = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), memMat);
  membrane.scale.copy(RAD).multiplyScalar(0.95);
  membrane.renderOrder = 3;
  scene.add(membrane);

  // micelles (membrane fragments)
  const MIC = 180;
  const micelles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), phys('#f6a5b8', { roughness: 0.35, clearcoat: 0.5 }), MIC);
  micelles.frustumCulled = false;
  scene.add(micelles);
  const micData = [];
  for (let i = 0; i < MIC; i++) {
    const d = randDir(R);
    const home = d.clone().multiply(RAD).multiplyScalar(0.95);
    micData.push({ home, out: home.clone().addScaledVector(d, 1 + R() * 3.5).add(randDir(R).multiplyScalar(R() * 1.5)), d, s: 0.11 + R() * 0.1, delay: R(), f: V(R() * 2 + 0.5, R() * 2 + 0.5, R() * 2 + 0.5), p: R() * 6 });
  }

  // cytoplasm
  const cytoGeo = new THREE.BufferGeometry();
  const cp = [];
  for (let i = 0; i < 520; i++) { const p = insideEllipsoid(0.9); cp.push(p.x, p.y, p.z); }
  cytoGeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  const cytoMat = pointsMat('#e3a8b6', 0.16, 0.5);
  const cyto = new THREE.Points(cytoGeo, cytoMat);
  scene.add(cyto);

  /* ---------- vacuole + pigment ---------- */
  const VAC = V(1.4, -0.4, 0.2);
  const vacGeo = new THREE.SphereGeometry(1, 48, 32);
  {
    const p = vacGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      tmp.fromBufferAttribute(p, i);
      tmp.multiplyScalar(1 + 0.07 * Math.sin(tmp.x * 3 + 1) * Math.sin(tmp.y * 2.5 + 2) + 0.05 * Math.sin(tmp.z * 4));
      p.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    vacGeo.computeVertexNormals();
  }
  const vacMat = makeDissolve({
    color: C('#e2445f'), roughness: 0.25, transparent: true, opacity: 0.4, depthWrite: false, clearcoat: 0.8, side: THREE.DoubleSide,
  }, { edge: '#ff3a5c', scale: 2.2 });
  const vacuole = new THREE.Mesh(vacGeo, vacMat);
  vacuole.position.copy(VAC);
  vacuole.scale.set(3.0, 2.9, 2.7);
  vacuole.renderOrder = 2;
  scene.add(vacuole);
  const pigGeo = new THREE.BufferGeometry();
  const pp = [];
  for (let i = 0; i < 650; i++) { const d = randDir(R).multiplyScalar(Math.cbrt(R()) * 2.6); pp.push(d.x, d.y, d.z); }
  pigGeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
  const pigMat = pointsMat('#e0244a', 0.13, 0.75);
  const pigment = new THREE.Points(pigGeo, pigMat);
  pigment.position.copy(VAC);
  scene.add(pigment);

  /* ---------- nucleus ---------- */
  const N0 = V(-2.4, 0.9, 0.6), NR = 1.75;
  const envMat = makeDissolve({
    color: C('#9d8df1'), roughness: 0.3, transparent: true, opacity: 0.22, depthWrite: false, clearcoat: 0.7, side: THREE.DoubleSide,
  }, { edge: '#7a5cff', scale: 3.2 });
  const envelope = new THREE.Mesh(new THREE.SphereGeometry(NR, 56, 40), envMat);
  envelope.position.copy(N0);
  envelope.renderOrder = 2;
  scene.add(envelope);
  const PORES = 64;
  const poreMat = phys('#7f6ee6', { transparent: true, opacity: 0.8, roughness: 0.4 });
  const pores = new THREE.InstancedMesh(new THREE.TorusGeometry(0.11, 0.035, 6, 14), poreMat, PORES);
  {
    const o = new THREE.Object3D();
    for (let i = 0; i < PORES; i++) {
      const d = fibSphere(i, PORES);
      o.position.copy(N0).addScaledVector(d, NR * 1.005);
      o.lookAt(tmp.copy(N0).addScaledVector(d, NR * 2));
      o.updateMatrix();
      pores.setMatrixAt(i, o.matrix);
    }
  }
  scene.add(pores);
  const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), phys('#6f5bd6', { roughness: 0.5, transparent: true, opacity: 0.9 }));
  nucleolus.position.copy(N0).add(V(0.5, 0.35, 0.3));
  scene.add(nucleolus);

  /* ---------- chromatin / DNA strands (morph: packed → released → clumped → rope) ---------- */
  const chromMat = new THREE.MeshPhysicalMaterial({
    color: C('#6a4cf0'), roughness: 0.35, clearcoat: 0.5, morphTargets: true, morphNormals: true,
    emissive: new THREE.Color(0x000000),
  });
  const chromGroup = new THREE.Group();
  scene.add(chromGroup);
  const strands = [];
  const ropeA = V(-3.8, -1.3, 0.6), ropeB = V(3.8, 1.5, -0.6);
  const ropeAxis = ropeB.clone().sub(ropeA).normalize();
  const n1 = V(0, 0, 1).cross(ropeAxis).normalize(), n2 = ropeAxis.clone().cross(n1).normalize();
  const relPts = [];
  for (let k = 0; k < 8; k++) {
    const base = [], rel = [], clump = [], rope = [];
    let p = randDir(R).multiplyScalar(R() * 0.9), d = randDir(R);
    const off = randDir(R).multiplyScalar(0.5);
    const N = 52;
    for (let i = 0; i < N; i++) {
      d.add(randDir(R).multiplyScalar(0.95)).normalize();
      p.addScaledVector(d, 0.27);
      if (p.length() > 1.35) { p.multiplyScalar(1.35 / p.length()); d.addScaledVector(p.clone().normalize(), -1.6).normalize(); }
      base.push(N0.clone().add(p));
      rel.push(p.clone().multiplyScalar(3.4).add(off.clone().multiplyScalar(3)).add(V(Math.sin(i * 0.4 + k), Math.cos(i * 0.3 + k * 2), Math.sin(i * 0.25 - k)).multiplyScalar(0.5)));
      clump.push(p.clone().multiplyScalar(1.05).add(off.clone().multiplyScalar(0.3)));
      const s = i / (N - 1), th = (k / 8) * Math.PI * 2 + s * 13, rr = 0.42 + 0.08 * Math.sin(s * 20 + k);
      rope.push(ropeA.clone().lerp(ropeB, s).addScaledVector(n1, Math.cos(th) * rr).addScaledVector(n2, Math.sin(th) * rr));
    }
    relPts.push(rel[Math.floor(N / 2)]);
    const mk = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, r, 6);
    const g = mk(base, 0.065), gr = mk(rel, 0.075), gc = mk(clump, 0.1), gp = mk(rope, 0.14);
    g.morphAttributes.position = [gr.attributes.position, gc.attributes.position, gp.attributes.position];
    g.morphAttributes.normal = [gr.attributes.normal, gc.attributes.normal, gp.attributes.normal];
    const m = new THREE.Mesh(g, chromMat);
    m.updateMorphTargets();
    m.frustumCulled = false;
    strands.push(m);
    chromGroup.add(m);
  }

  /* ---------- organelles ---------- */
  const organelles = [];
  const plastidMat = phys('#ff8c42', { roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 1 });
  const mitoMat = phys('#ffc15e', { roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 1 });
  const orgGeo = new THREE.SphereGeometry(1, 20, 14);
  const placeOrg = () => {
    for (let tries = 0; tries < 200; tries++) {
      const p = insideEllipsoid(0.82);
      const dv = tmp.copy(p).sub(VAC).divide(V(3.0, 2.9, 2.7)).length();
      if (dv < 1.2 || p.distanceTo(N0) < NR + 0.7) continue;
      return p;
    }
    return insideEllipsoid(0.85);
  };
  for (let i = 0; i < 13; i++) {
    const isP = i < 7;
    const m = new THREE.Mesh(orgGeo, isP ? plastidMat : mitoMat);
    const sc = isP ? V(0.36, 0.36, 0.72) : V(0.26, 0.26, 0.58);
    m.scale.copy(sc);
    const home = placeOrg();
    m.position.copy(home);
    m.rotation.set(R() * 3, R() * 3, R() * 3);
    scene.add(m);
    organelles.push({ m, home, sc, dir: home.clone().normalize(), rot: m.rotation.clone(), sweep: V(22 + R() * 8, (R() - 0.5) * 8, (R() - 0.5) * 6), sd: R() * 0.3, isP });
  }

  /* ---------- update ---------- */
  function update(t, time) {
    // neighbours drift away as tissue is mashed
    const nb = ph(t, 1.15, 1.75);
    neighbors.forEach((n) => n.g.position.copy(n.home).addScaledVector(n.dir, nb * 9));
    ghostMat.opacity = 0.16 * (1 - nb);
    ghostMat.userData.rim.value = 0.3 * (1 - nb);
    ghostNuc.opacity = 0.25 * (1 - nb);
    nbRoot.visible = nb < 0.999;

    // wall cracks + flies apart, then is swept away by the filter
    const crack = ph(t, 1.3, 1.5);
    const fly = ph(t, 1.48, 1.95, linear);
    const shake = win(t, 1.3, 1.33, 1.88, 1.92) * 0.05;
    patches.forEach((p, i) => {
      const f = easeOut(clamp((fly - p.delay * 0.35) / 0.65));
      const sw = ph(t, 3.0 + p.sd * 0.4, 3.35 + p.sd * 0.4);
      p.mesh.position.copy(p.home).addScaledVector(p.dir, crack * 0.22 + f * p.dist).addScaledVector(p.sweep, sw);
      p.mesh.position.x += Math.sin(time * 47 + i) * shake;
      p.mesh.quaternion.setFromAxisAngle(p.axis, f * p.spin + f * Math.sin(time * 0.3 + i) * 0.15);
      p.mesh.visible = sw < 0.999;
    });
    wallMat.opacity = 0.16 * (1 - 0.35 * ph(t, 3.0, 3.4));

    // membrane dissolves
    const md = ph(t, 2.1, 2.6, linear);
    memMat.userData.u.uDissolve.value = lerp(-0.02, 1.02, md);
    membrane.visible = md < 0.999;
    const microOut = ph(t, 3.0, 3.9);
    for (let i = 0; i < MIC; i++) {
      const c = micData[i];
      const a = ph(t, 2.14 + c.delay * 0.4, 2.3 + c.delay * 0.4);
      if (a <= 0.001) { micelles.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); continue; }
      tmp.lerpVectors(c.home, c.out, a).addScaledVector(c.d, microOut * 2.5);
      tmp.x += Math.sin(time * c.f.x + c.p) * 0.25 * a;
      tmp.y += Math.sin(time * c.f.y + c.p * 2) * 0.25 * a;
      tmp.z += Math.sin(time * c.f.z + c.p * 3) * 0.25 * a;
      tmpM.compose(tmp, tmpQ.identity(), tmpS.setScalar(c.s * a));
      micelles.setMatrixAt(i, tmpM);
    }
    micelles.instanceMatrix.needsUpdate = true;

    const cy = ph(t, 2.2, 2.8);
    cyto.scale.setScalar(1 + 1.8 * cy);
    cytoMat.opacity = 0.5 * (1 - 0.85 * cy);
    cyto.rotation.y = time * 0.02;

    // vacuole bursts, pigment spreads (and stays — the filtrate is pink)
    const vd = ph(t, 2.06, 2.45, linear);
    vacMat.userData.u.uDissolve.value = lerp(-0.02, 1.02, vd);
    vacuole.visible = vd < 0.999;
    const rel = ph(t, 2.1, 2.8);
    pigment.position.lerpVectors(VAC, V(0, 0, 0), rel * 0.6);
    pigment.scale.setScalar(1 + rel * 2.4);
    pigMat.opacity = 0.75 - rel * 0.42;
    pigment.rotation.y = time * 0.03;

    // nuclear envelope dissolves
    const nd = ph(t, 2.3, 2.75, linear);
    envMat.userData.u.uDissolve.value = lerp(-0.02, 1.02, nd);
    envelope.visible = nd < 0.999;
    poreMat.opacity = 0.8 * (1 - ph(t, 2.3, 2.55));
    pores.visible = poreMat.opacity > 0.01;
    const nl = 1 - ph(t, 2.4, 2.8);
    nucleolus.scale.setScalar(Math.max(0.001, nl));
    nucleolus.visible = nl > 0.01;

    // organelles drift, then get filtered out
    organelles.forEach((o, i) => {
      const dr = ph(t, 2.35, 3.0);
      const sw = ph(t, 3.0 + o.sd, 3.4 + o.sd);
      o.m.position.copy(o.home).addScaledVector(o.dir, dr * 2.2).addScaledVector(o.sweep, sw);
      o.m.position.y += Math.sin(time * 0.7 + i) * 0.08;
      o.m.rotation.set(o.rot.x + time * 0.1, o.rot.y + time * 0.07, o.rot.z);
      const k = 1 - sw;
      o.m.scale.copy(o.sc).multiplyScalar(Math.max(0.001, k));
      o.m.visible = k > 0.01;
    });

    // chromatin
    const r1 = ph(t, 2.4, 3.0) * (1 - ph(t, 4.25, 4.85));
    const r2 = ph(t, 4.25, 4.85) * (1 - ph(t, 5.2, 5.8));
    const r3 = ph(t, 5.2, 5.8);
    strands.forEach((s) => {
      s.morphTargetInfluences[0] = r1;
      s.morphTargetInfluences[1] = r2;
      s.morphTargetInfluences[2] = r3;
    });
    const white = ph(t, 4.25, 4.85);
    chromMat.color.copy(C('#6a4cf0')).lerp(C('#e4e2f2'), white);
    chromMat.roughness = 0.35 + 0.3 * white;
    chromGroup.quaternion.setFromAxisAngle(ropeAxis, r3 * (time * 0.6));
    chromGroup.rotation.y += Math.sin(time * 0.25) * 0.06 * r1;
  }

  /* ---------- labels / interactives / views ---------- */
  const labels = [
    { text: 'Cell wall', sub: 'tough cellulose', anchor: () => wallLabelPatch.mesh.position.clone(), show: (t) => t < 1.3 },
    { text: 'Cell membrane', anchor: () => V(0, -RAD.y * 0.95, RAD.z * 0.25), show: (t) => t < 2.1 },
    { text: 'Nucleus', sub: 'holds the DNA', anchor: () => N0.clone().add(V(0, NR, 0)), show: (t) => t < 2.35 },
    { text: 'Vacuole', sub: 'red anthocyanin pigment', anchor: () => VAC.clone().add(V(0.8, 2.6, 0.5)), show: (t) => t < 2.05 },
    { text: 'Plastid', anchor: () => organelles[0].m.position.clone(), show: (t) => t < 1.0 },
    { text: 'Broken cell wall', anchor: () => patches[NT * 2 + 2].mesh.position.clone(), show: (t) => t >= 1.75 && t < 2.1 },
    { text: 'Micelles', sub: 'membrane fragments', anchor: () => micelles.localToWorld(tmp2.setFromMatrixPosition(getInst(micelles, 3))), show: (t) => t >= 2.5 && t < 3.1 },
    { text: 'Released DNA', anchor: () => chromGroup.localToWorld(relPts[2].clone()), show: (t) => t >= 2.85 && t < 4.25 },
    { text: 'Debris caught by the filter', anchor: () => patches[NT * 6 + 3].mesh.position.clone(), show: (t) => t >= 3.04 && t < 3.25 },
    { text: 'DNA strands clump together', anchor: () => V(0, 1.7, 0), show: (t) => t >= 4.7 && t < 5.25 },
    { text: 'Fibres wind around each other', anchor: () => chromGroup.localToWorld(ropeB.clone().lerp(ropeA, 0.2)), show: (t) => t >= 5.65 },
  ];
  const _m4 = new THREE.Matrix4();
  function getInst(mesh, i) { mesh.getMatrixAt(i, _m4); return _m4; }

  const interactives = [
    { root: chromGroup, priority: 3, info: (t) => ({ title: t < 4.3 ? 'DNA (chromatin)' : 'Precipitated DNA', text: t < 2.4 ? 'Long DNA molecules packed with proteins inside the nucleus.' : t < 4.3 ? 'Freed DNA strands floating in the salty buffer.' : 'Strands stuck together in the alcohol.', dive: 'mol' }) },
    { root: envelope, priority: 2, info: () => ({ title: 'Nucleus', text: 'Wrapped in a double membrane (the nuclear envelope).', dive: 'mol' }) },
    { root: nucleolus, priority: 2, info: () => ({ title: 'Nucleolus', text: 'Where ribosomes are assembled.', dive: 'mol' }) },
    { root: vacuole, priority: 1, info: () => ({ title: 'Central vacuole', text: 'Stores water, sugars and red anthocyanin pigments.' }) },
    { root: membrane, priority: 0, info: () => ({ title: 'Cell membrane', text: 'A thin, fatty phospholipid bilayer. Soap dissolves it.', dive: 'mol' }) },
    { root: wall, priority: 0, info: () => ({ title: 'Cell wall', text: 'Rigid cellulose fibres. Mashing breaks it open.' }) },
    { root: micelles, priority: 1, info: () => ({ title: 'Micelles', text: 'Tiny balls of soap and membrane lipids.', dive: 'mol' }) },
  ];
  organelles.forEach((o) => interactives.push({ root: o.m, priority: 1, info: () => (o.isP
    ? { title: 'Chromoplast', text: 'Plastids that store coloured pigments in ripe fruit.' }
    : { title: 'Mitochondrion', text: 'Releases energy from sugars for the cell.' }) }));

  const views = [
    { pos: V(5, 7, 25), target: V(0, 0, 0) },
    { pos: V(6, 8, 30), target: V(0, 0, 0) },
    { pos: V(2, 5, 23), target: V(-0.5, 0.3, 0) },
    { pos: V(3, 6, 25), target: V(0, 0, 0) },
    { pos: V(2, 3, 15), target: V(0, 0, 0) },
    { pos: V(6, 4, 16), target: V(0, 0, 0) },
  ];

  const legend = [
    { c: '#9fd49a', l: 'Cell wall' }, { c: '#f39bb0', l: 'Membrane' }, { c: '#9d8df1', l: 'Nucleus' },
    { c: '#6a4cf0', l: 'DNA' }, { c: '#e2445f', l: 'Vacuole / pigment' }, { c: '#ff8c42', l: 'Plastids' },
  ];

  /* Watch's caption at this level; times match the labels' windows above */
  const CUES = [
    [0, { text: 'One cell of the fruit, boxed in by a rigid <b>cellulose wall</b>', mark: 'Cell wall' }],
    [0.45, { text: 'Its DNA is packed inside the <b>nucleus</b>', mark: 'Nucleus' }],
    [0.9, { text: 'The big <b>vacuole</b> stores the red pigment', mark: 'Vacuole' }],
    [1.28, { text: 'Mashing tears the cell walls apart', mark: 'Cell wall' }],
    [1.75, { text: 'Cells separate. Only a thin <b>membrane</b> holds each one together', mark: 'Broken cell wall' }],
    [2.0, { text: 'Soap dissolves the <b>cell membrane</b>', mark: 'Cell membrane' }],
    [2.15, { text: 'The vacuole and the nucleus break open too', mark: 'Nucleus' }],
    [2.5, { text: 'Membrane fats end up in <b>micelles</b>, tiny balls of soap and lipid', mark: 'Micelles' }],
    [2.85, { text: 'The <b>DNA</b> spills out into the salty buffer', mark: 'Released DNA' }],
    [3.04, { text: 'The filter catches wall pieces and other large debris', mark: 'Debris caught by the filter' }],
    [3.3, { text: 'DNA, micelles and pigment pass straight through', mark: 'Released DNA' }],
    [4.0, { text: 'The DNA is still dissolved, so you cannot see it yet', mark: 'Released DNA' }],
    [4.7, { text: 'In alcohol, DNA comes out of solution and <b>clumps</b>', mark: 'DNA strands clump together' }],
    [5.0, { text: 'Millions of strands tangle into threads thick enough to see' }],
    [5.65, { text: 'Twirling winds the fibres around each other, like spaghetti on a fork', mark: 'Fibres wind around each other' }],
  ];
  const cue = (t) => cueAt(CUES, t);

  return { scene, update, labels, interactives, views, legend, cue, minDist: 5, maxDist: 42, fov: 38, near: 0.1, far: 300 };
}
