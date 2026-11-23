/* Cell level: one E. coli cell, ported from the original lab's "Inside one cell" panel
 * (/Ecoli/index.html, MICRO VIEW); sim-local. A world for Lab's zoom.js.
 *
 * It follows the bench through `st` = { stage, ara, uv }:
 *   stage 0  a plain cell        4  on ice: stiff membrane, plasmids settle
 *         1  Ca²⁺ at the surface 5  heat shock: pores open, plasmids slip in
 *         2  competent cell      6  recovery: plasmid copies, β-lactamase
 *         3  plasmids arrive     7  on the amp plate: ampicillin broken down
 *                                8  arabinose (if `ara`) switches on GFP
 * Each quantity eases toward its value for the stage (from the original), so a
 * jump on the timeline settles in a second or two. Its look is fixed by a seed. */
import * as THREE from 'three';
import { clamp, smooth, Ease, seeded, T, LIGHT, DECAY } from '../lab.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const TX = T.levels.cell;
/** The card's "why" while zoomed in: what the cell is doing at this stage. */
export const captionFor = (st) => (st.stage < 8 ? TX.stages[st.stage] : st.ara ? TX.stageAra : TX.stageNoAra);

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(0.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createCell(env) {
  const rnd = seeded(31);
  const rand = (a, b) => a + rnd() * (b - a);
  const scene = new THREE.Scene();
  scene.environment = env;
  const MBG = new THREE.Color('#f5f7fb'), MUV = new THREE.Color('#0a0820');
  const BG = MBG.clone(), IBG = new THREE.Color();
  scene.background = BG;
  const hemi = new THREE.HemisphereLight('#ffffff', '#e3e6f3', 0.95 * LIGHT); scene.add(hemi);
  const dir = new THREE.DirectionalLight('#ffffff', 0.65 * LIGHT); dir.position.set(3, 6, 7); scene.add(dir);
  const uvLight = new THREE.PointLight('#7c3aed', 0, 30, DECAY); uvLight.position.set(0, 6, 6); scene.add(uvLight);
  const GLOW = glowTexture();
  const dummy = new THREE.Object3D();

  const cell = new THREE.Group(); scene.add(cell);
  const CR = 1.3, CL = 3.6;
  function capsulePts(R, L, n = 18) {
    const p = [];
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI / 2; p.push(new THREE.Vector2(Math.max(0, R * Math.cos(a)), -L / 2 + R * Math.sin(a))); }
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI / 2; p.push(new THREE.Vector2(Math.max(0, R * Math.cos(a)), L / 2 + R * Math.sin(a))); }
    return p;
  }
  function fresnelMat(color, base, rim, pow = 2.2) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uBase: { value: base }, uRim: { value: rim }, uPow: { value: pow }, uTime: { value: 0 }, uWob: { value: 0 } },
      vertexShader: `uniform float uTime;uniform float uWob;varying vec3 vN;varying vec3 vV;
        void main(){vec3 p=position;float w=sin(p.y*2.6+uTime*7.0)*sin(p.x*3.1+uTime*5.3)+sin(p.z*3.7-uTime*6.1)*.6;
        p+=normal*w*.085*uWob;vec4 mv=modelViewMatrix*vec4(p,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform vec3 uColor;uniform float uBase;uniform float uRim;uniform float uPow;varying vec3 vN;varying vec3 vV;
        void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),uPow);gl_FragColor=vec4(uColor,clamp(uBase+f*uRim,0.,1.));}`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
  }
  const shellOuter = new THREE.Mesh(new THREE.LatheGeometry(capsulePts(CR, CL), 72), fresnelMat('#e2875c', 0.035, 0.8, 2.4));
  shellOuter.rotation.z = Math.PI / 2; shellOuter.renderOrder = 5; cell.add(shellOuter);
  const shellInner = new THREE.Mesh(new THREE.LatheGeometry(capsulePts(CR - 0.12, CL), 72), fresnelMat('#f0a27a', 0.0, 0.45, 3.0));
  shellInner.rotation.z = Math.PI / 2; shellInner.renderOrder = 4; cell.add(shellInner);
  const fillMat = new THREE.MeshBasicMaterial({ color: '#ffe8d4', transparent: true, opacity: 0.42, depthWrite: false });
  const fill = new THREE.Mesh(new THREE.LatheGeometry(capsulePts(CR - 0.14, CL), 48), fillMat);
  fill.rotation.z = Math.PI / 2; fill.renderOrder = 1; cell.add(fill);

  function interiorPoint(pad = 0.35) {
    for (;;) {
      const x = rand(-CL / 2 - CR * 0.5, CL / 2 + CR * 0.5), ex = Math.max(0, Math.abs(x) - CL / 2), mr2 = (CR - pad) ** 2 - ex * ex;
      if (mr2 <= 0) continue;
      const r = Math.sqrt(rnd() * mr2), a = rnd() * Math.PI * 2;
      return V3(x, Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  function surfacePoint(off = 0, front = false) {
    const t = rand(-CL / 2 - CR * 0.7, CL / 2 + CR * 0.7); let d;
    for (;;) {
      d = V3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      if (Math.abs(t) <= CL / 2) d.x = 0; else if (Math.sign(d.x) !== Math.sign(t)) d.x *= -1;
      if (front && d.z < 0.25) continue;
      if (d.lengthSq() > 0.05) break;
    }
    d.normalize();
    return { p: V3(clamp(t, -CL / 2, CL / 2), 0, 0).addScaledVector(d, CR + off), n: d };
  }
  const mStd = (c, em = 0.12, r = 0.45) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: em, roughness: r });

  // chromosome (nucleoid)
  const nucPts = []; for (let i = 0; i < 70; i++) nucPts.push(V3(rand(-1.5, 1.5), rand(-0.55, 0.55), rand(-0.55, 0.55)));
  const nucleoid = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(nucPts), 700, 0.026, 6), mStd('#5b8def', 0.15, 0.5));
  cell.add(nucleoid);
  // ribosomes
  const ribo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), mStd('#b9a7ef', 0.1), 170);
  ribo.frustumCulled = false;
  for (let i = 0; i < 170; i++) { dummy.position.copy(interiorPoint(0.25)); dummy.scale.setScalar(rand(0.7, 1.2)); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); ribo.setMatrixAt(i, dummy.matrix); }
  cell.add(ribo);
  // flagella
  class Helix extends THREE.Curve {
    constructor(len, r, turns) { super(); this.len = len; this.r = r; this.turns = turns; }
    getPoint(t, o = new THREE.Vector3()) { const a = t * this.turns * Math.PI * 2, fade = Math.min(1, t * 6); return o.set(t * this.len, Math.cos(a) * this.r * fade, Math.sin(a) * this.r * fade); }
  }
  const flagella = [];
  const flagMat = mStd('#c9a27e', 0.08, 0.55);
  for (let i = 0; i < 6; i++) {
    const s = surfacePoint(0); s.p.x = Math.min(s.p.x, CL / 2 * 0.5);
    const d = s.n.clone().multiplyScalar(0.6).add(V3(-1, 0, 0)).normalize();
    const g = new THREE.Group(); g.position.copy(s.p); g.quaternion.setFromUnitVectors(V3(1, 0, 0), d);
    const m = new THREE.Mesh(new THREE.TubeGeometry(new Helix(rand(3.6, 5), 0.13, rand(6, 8)), 220, 0.022, 5), flagMat);
    g.add(m); cell.add(g); flagella.push(m);
  }

  // plasmids: a ring with the GFP (green), bla (amber) and araC (violet) genes
  function plasmidMesh() {
    const g = new THREE.Group(), R = 0.3;
    g.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.034, 8, 56), mStd('#94a3b8', 0.05)));
    [[0.02, 0.3, '#22c55e'], [0.38, 0.2, '#f59e0b'], [0.64, 0.13, '#8b5cf6']].forEach(([s, l, c]) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(R, 0.062, 12, 40, l * Math.PI * 2), mStd(c, 0.25, 0.35)); m.rotation.z = s * Math.PI * 2; g.add(m);
    });
    return g;
  }
  const PORES = [{ t: -0.8, a: 0.35 }, { t: 0.95, a: -0.25 }, { t: 0.05, a: 1.0 }, { t: -1.6, a: -0.75 }, { t: 1.7, a: 0.75 }].map((o) => {
    const n = V3(0, Math.sin(o.a), Math.cos(o.a)); return { n, p: V3(o.t, 0, 0).addScaledVector(n, CR) };
  });
  const poreMeshes = PORES.map((P) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 28), mStd('#f97316', 0.3));
    m.position.copy(P.p); m.quaternion.setFromUnitVectors(V3(0, 0, 1), P.n); m.scale.setScalar(1e-4); cell.add(m); return m;
  });
  const plasmidRoot = new THREE.Group(); cell.add(plasmidRoot);
  const plasOut = [];
  for (let i = 0; i < 7; i++) {
    const g = plasmidMesh(); g.scale.setScalar(1e-4); plasmidRoot.add(g);
    let stick, pore = null, inner = null;
    if (i < 2) { pore = PORES[i].p.clone(); stick = pore.clone().addScaledVector(PORES[i].n, 0.36); inner = pore.clone().addScaledVector(PORES[i].n, -0.75); } else stick = surfacePoint(0.36, true).p;
    const s2 = surfacePoint(rand(1.0, 2.4), i < 4);
    plasOut.push({ g, base: s2.p, stick, pore, inner, ph: rand(0, 10) });
    g.rotation.set(rand(0, 3), rand(0, 3), 0);
  }
  const plasCopies = [0, 1, 2].map(() => { const g = plasmidMesh(); g.scale.setScalar(1e-4); g.userData.p = interiorPoint(0.55); g.rotation.set(rand(0, 3), rand(0, 3), 0); plasmidRoot.add(g); return g; });

  // particles
  function particles(n, geo, m, init) { const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; const d = []; for (let i = 0; i < n; i++) d.push(init(i)); im.userData.d = d; cell.add(im); return im; }
  function setI(m, i, p, s, r) { dummy.position.copy(p); if (r) dummy.rotation.copy(r); else dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(s, 1e-4)); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }
  const caMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 0.35, transparent: true, opacity: 0, roughness: 0.3 });
  const caM = particles(90, new THREE.SphereGeometry(0.06, 10, 8), caMat, () => ({ p: surfacePoint(rand(0.06, 0.9)).p, ph: rand(0, 10) }));
  const enzM = particles(26, new THREE.IcosahedronGeometry(0.085, 0), mStd('#f59e0b', 0.25, 0.4), () => ({ from: interiorPoint(0.6), to: surfacePoint(rand(-0.07, 0.18)).p, d: rnd(), ph: rand(0, 10) }));
  const ampM = particles(34, new THREE.TetrahedronGeometry(0.1, 0), mStd('#ef4444', 0.25, 0.4), () => ({ p: surfacePoint(rand(0.4, 1.8)).p, d: rand(0.6, 4.2), ph: rand(0, 10), r: new THREE.Euler(rand(0, 3), rand(0, 3), 0) }));
  const araM = particles(30, new THREE.CylinderGeometry(0.075, 0.075, 0.035, 6), mStd('#fcd34d', 0.2, 0.4), () => ({ out: surfacePoint(rand(0.8, 2.2)).p, in: interiorPoint(0.4), d: rand(0, 2.5), ph: rand(0, 10), r: new THREE.Euler(rand(0, 3), rand(0, 3), 0) }));
  const gfpMat = new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 0.2, roughness: 0.35 });
  const gfpM = particles(120, new THREE.CylinderGeometry(0.055, 0.055, 0.12, 11), gfpMat, () => ({ p: interiorPoint(0.3), d: rnd(), r: new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3)) }));
  const gfpGlow = (() => {
    const d = gfpM.userData.d, pos = new Float32Array(d.length * 3);
    d.forEach((q, i) => { pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.p.y; pos[i * 3 + 2] = q.p.z; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ map: GLOW, color: '#3dff86', size: 0.9, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    p.renderOrder = 9; cell.add(p); return p;
  })();

  /* ---------- state: eased toward each stage's values ---------- */
  const M = { stage: 0, time: 0, t5: -1e9, t7: -1e9, tAra: -1e9, araWas: false, ca: 0, cold: 0, heat: 0, out: 0, stick: 0, inside: 0, enz: 0, araM: 0, gfp: 0, uv: 0 };
  const C_BASE = new THREE.Color('#e2875c'), C_COLD = new THREE.Color('#4d9de0'), C_HEAT = new THREE.Color('#f0532f'), C_GFP = new THREE.Color('#4ade80'), C_LAV = new THREE.Color('#8b7cf6');
  const F_BASE = new THREE.Color('#ffe8d4'), F_UV = new THREE.Color('#1b1638'), F_GFP = new THREE.Color('#0f5130'), WHITE = new THREE.Color('#ffffff');
  const tmpV = V3(), tmpC = new THREE.Color();
  let lastTime = null;

  function update(st, time) {
    const dt = lastTime == null ? 0 : Math.min(0.05, Math.max(0, time - lastTime));
    lastTime = time;
    M.time += dt;
    const t = M.time;
    if (st.stage !== M.stage) { if (st.stage === 5) M.t5 = t; if (st.stage === 7) M.t7 = t; M.stage = st.stage; }
    const s = M.stage;
    const sm = (c, g, r) => c + (g - c) * (1 - Math.exp(-dt * r));
    M.ca = sm(M.ca, s >= 1 && s <= 5 ? 1 : (s >= 6 ? 0.25 : 0), 3);
    M.cold = sm(M.cold, s === 4 ? 1 : (s >= 1 && s <= 3 ? 0.3 : 0), 2.5);
    M.heat = sm(M.heat, s === 5 ? 1 : 0, 4);
    M.out = sm(M.out, s >= 3 && s <= 5 ? 1 : 0, 2.5);
    M.stick = sm(M.stick, s >= 4 ? 1 : 0, 1.6);
    M.inside = sm(M.inside, s >= 6 ? 1 : 0, 1.2);
    M.enz = sm(M.enz, s >= 6 ? 1 : 0, 0.8);
    const araOn = s >= 8 && st.ara;
    if (araOn && !M.araWas) M.tAra = t;
    M.araWas = araOn;
    M.araM = sm(M.araM, araOn ? 1 : 0, 1.5);
    M.gfp = sm(M.gfp, araOn && t - M.tAra > 1.2 ? 1 : 0, 0.9);
    M.uv = sm(M.uv, st.uv > 0.5 ? 1 : 0, 2.5);
    const motion = 1 - 0.75 * M.cold;

    cell.rotation.y = Math.sin(time * 0.18) * 0.35; cell.position.y = Math.sin(time * 0.6) * 0.06;
    [shellOuter, shellInner].forEach((sh) => { sh.material.uniforms.uTime.value = time; sh.material.uniforms.uWob.value = M.heat; });
    tmpC.copy(C_BASE).lerp(C_COLD, M.cold).lerp(C_HEAT, M.heat).lerp(C_LAV, M.uv * (1 - M.gfp)).lerp(C_GFP, M.uv * M.gfp);
    shellOuter.material.uniforms.uColor.value.copy(tmpC); shellInner.material.uniforms.uColor.value.copy(tmpC).lerp(WHITE, 0.25);
    fillMat.color.copy(F_BASE).lerp(F_UV, M.uv).lerp(F_GFP, M.uv * M.gfp);
    BG.copy(MBG).lerp(MUV, M.uv);
    hemi.intensity = 0.95 * LIGHT * (1 - 0.8 * M.uv); dir.intensity = 0.65 * LIGHT * (1 - 0.75 * M.uv); uvLight.intensity = 1.4 * LIGHT * M.uv;
    flagella.forEach((f, i) => { f.rotation.x += dt * (9 + i) * motion; });

    caMat.opacity = M.ca;
    caM.userData.d.forEach((q, i) => { tmpV.copy(q.p); tmpV.x += Math.sin(t * 1.4 * motion + q.ph) * 0.05; tmpV.y += Math.cos(t * 1.1 * motion + q.ph * 2) * 0.05; setI(caM, i, tmpV, M.ca); });
    caM.instanceMatrix.needsUpdate = true;
    poreMeshes.forEach((m, i) => m.scale.setScalar(Math.max(1e-4, M.heat * (1 + 0.18 * Math.sin(t * 14 + i)))));
    plasOut.forEach((P, i) => {
      const pos = V3(P.base.x + Math.sin(t * 0.5 * motion + P.ph) * 0.3, P.base.y + Math.cos(t * 0.45 * motion + P.ph * 1.3) * 0.3, P.base.z + Math.sin(t * 0.4 * motion + P.ph * 0.7) * 0.3)
        .lerp(P.stick, smooth(clamp(M.stick)));
      let sc = M.out;
      if (i < 2) {
        const e = s === 5 ? clamp((t - M.t5 - 0.5 - i * 0.7) / 1.8) : (s > 5 ? 1 : 0);
        if (e > 0) { if (e < 0.5) pos.lerpVectors(P.stick, P.pore, smooth(e * 2)); else pos.lerpVectors(P.pore, P.inner, smooth((e - 0.5) * 2)); }
        if (s >= 5) sc = 1;
        if (s > 5) { pos.x += Math.sin(t * 0.7 + i) * 0.05; pos.y += Math.cos(t * 0.6 + i) * 0.05; }
      }
      P.g.position.copy(pos); P.g.scale.setScalar(Math.max(1e-4, sc));
      P.g.rotation.x += dt * 0.5 * motion; P.g.rotation.y += dt * 0.35 * motion;
    });
    plasCopies.forEach((g, j) => { g.scale.setScalar(Math.max(1e-4, clamp(M.inside * 1.6 - j * 0.3))); g.position.copy(g.userData.p); g.position.y += Math.sin(t * 0.8 + j) * 0.05; g.rotation.x += dt * 0.4; g.rotation.z += dt * 0.3; });
    enzM.userData.d.forEach((q, i) => { const k = clamp(M.enz * 1.5 - q.d * 0.5); tmpV.lerpVectors(q.from, q.to, Ease.out(k)); tmpV.y += Math.sin(t + q.ph) * 0.03; setI(enzM, i, tmpV, k); });
    enzM.instanceMatrix.needsUpdate = true;
    const appear = s >= 7 ? clamp((t - M.t7) / 0.5) : 0;
    ampM.userData.d.forEach((q, i) => { const dk = s >= 7 ? clamp((t - M.t7 - q.d) / 0.35) : 0; const sc = appear * (1 - dk) * (1 + dk * 1.2); tmpV.copy(q.p); tmpV.x += Math.sin(t * 0.8 + q.ph) * 0.12; tmpV.y += Math.cos(t * 0.7 + q.ph) * 0.12; q.r.x += dt; setI(ampM, i, tmpV, s >= 7 ? sc : 0, q.r); });
    ampM.instanceMatrix.needsUpdate = true;
    araM.userData.d.forEach((q, i) => { const k = araOn ? smooth(clamp((t - M.tAra - q.d) / 2.2)) : 1; tmpV.lerpVectors(q.out, q.in, k); tmpV.y += Math.sin(t * 1.2 + q.ph) * 0.05; q.r.y += dt * 0.8; setI(araM, i, tmpV, M.araM, q.r); });
    araM.instanceMatrix.needsUpdate = true;
    gfpMat.emissiveIntensity = 0.2 + 2.4 * M.uv;
    gfpM.userData.d.forEach((q, i) => { q.r.y += dt * 0.3; setI(gfpM, i, q.p, clamp(M.gfp * 1.6 - q.d * 0.6), q.r); });
    gfpM.instanceMatrix.needsUpdate = true;
    gfpGlow.material.opacity = M.uv * M.gfp * 0.9;
  }

  /* ---------- labels (names only) and hover info ---------- */
  const world = (o, local) => { cell.updateMatrixWorld(); return o.localToWorld(local.clone()); };
  const st = (t) => t.stage;
  const labels = [
    { key: 'chromosome', ...TX.labels.chromosome, anchor: () => world(cell, V3(-0.9, 0.35, 0.3)), show: (t) => st(t) === 0 },
    { key: 'flagellum', ...TX.labels.flagellum, anchor: () => world(cell, V3(-4.6, 0.6, 0.2)), show: (t) => st(t) === 0 },
    { key: 'membrane', ...TX.labels.membrane, anchor: () => world(cell, V3(1.6, CR, 0)), show: (t) => st(t) <= 2 },
    { key: 'calcium', ...TX.labels.calcium, anchor: () => world(cell, V3(-1.2, CR + 0.4, 0.4)), show: (t) => st(t) >= 1 && st(t) <= 2 },
    { key: 'plasmid', ...TX.labels.plasmid, anchor: () => plasOut[2].g.getWorldPosition(V3()), show: (t) => st(t) >= 3 && st(t) <= 4 && M.out > 0.6 },
    { key: 'pore', ...TX.labels.pore, anchor: () => poreMeshes[0].getWorldPosition(V3()), show: (t) => st(t) === 5 && M.heat > 0.6 },
    { key: 'copies', ...TX.labels.copies, anchor: () => plasCopies[0].getWorldPosition(V3()), show: (t) => st(t) === 6 && M.inside > 0.6 },
    { key: 'enzyme', ...TX.labels.enzyme, anchor: () => world(cell, enzM.userData.d[0].to), show: (t) => st(t) === 6 && M.enz > 0.6 },
    { key: 'amp', ...TX.labels.amp, anchor: () => world(cell, ampM.userData.d[0].p), show: (t) => st(t) === 7 && M.t7 > -1e8 && M.time - M.t7 < ampM.userData.d[0].d },
    { key: 'arabinose', ...TX.labels.arabinose, anchor: () => world(cell, araM.userData.d[0].out), show: (t) => st(t) >= 8 && t.ara && M.gfp < 0.5 },
    { key: 'gfp', ...TX.labels.gfp, anchor: () => world(cell, gfpM.userData.d[0].p), show: (t) => st(t) >= 8 && t.ara && M.gfp > 0.6 },
  ];
  const interactives = [
    { root: shellOuter, priority: 0, info: () => TX.info.membrane },
    { root: nucleoid, priority: 1, info: () => TX.info.chromosome },
    { root: ribo, priority: 1, info: () => TX.info.ribosomes },
    { root: plasmidRoot, priority: 2, info: () => TX.info.plasmid },
    { root: enzM, priority: 2, info: () => TX.info.enzyme },
    { root: ampM, priority: 2, info: () => TX.info.amp },
    { root: araM, priority: 2, info: () => TX.info.arabinose },
    { root: gfpM, priority: 2, info: () => TX.info.gfp },
  ];

  /* Watch's caption at this level: one or two beats per stage, the second when its change shows */
  const C = (k, mark = null) => ({ text: TX.cues[k], mark });
  function cue(t) {
    switch (st(t)) {
      case 0: return C('cell', 'chromosome');
      case 1: return C('calcium', 'calcium');
      case 2: return C('competent', 'membrane');
      case 3: return C('plasmids', 'plasmid');
      case 4: return C('ice', 'plasmid');
      case 5: return M.heat < 0.6 ? C('heat') : C('pores', 'pore');
      case 6: return M.enz < 0.6 ? C('recover', 'copies') : C('enzyme', 'enzyme');
      case 7: return C('amp', 'amp');
      default:
        if (!t.ara) return C('noAra');
        return M.gfp < 0.5 ? C('arabinose', 'arabinose') : C('glow', 'gfp');
    }
  }

  const api = {
    scene, labels, interactives, update, cue,
    insetBg: (bg) => IBG.copy(bg).lerp(MUV, M.uv), // the circle darkens with the room under UV
    fov: 32, near: 0.1, far: 100, minDist: 4, maxDist: 24,
    views: [{ pos: V3(1.2, 3.2, 12.5), target: V3(0, 0, 0) }],
  };
  return api;
}
