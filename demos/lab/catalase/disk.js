/* Disk level (≈100 µm): a patch of the filter-paper disk, seen from a little above.
 * 1 unit = 1 µm, +Y up, the disk lying flat at y ≈ 0 with its top surface facing +Y.
 *
 * Filter paper is a felt of flattened cellulose ribbons (15-30 µm wide, a few µm thick,
 * the lumen collapsed), crossing at random with pores between. Yeast (S. cerevisiae,
 * 4-6 µm ovals, some budding) lodges on and between the fibres. In peroxide, O₂ from
 * catalase supersaturates the liquid and comes out as bubbles on the cells and in the
 * fibres' crevices; they grow and merge until the trapped gas floats the disk.
 *
 * Everything that carries meaning is posed from the state (wet, o2, rise, inLiquid,
 * boiled, rate), so the timeline scrubs. `time` drives only wobble, the fizz cycle and
 * the liquid tint's easing. Its look is fixed by a seed. */
import * as THREE from 'three';
import { LIGHT, srgb } from '../core/three-compat.js';
import { clamp, lerp, smooth } from '../core/math.js';
import { seeded } from '../core/random.js';
import { cueAt } from '../lesson.js';
import { T, fmt } from '../text.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const sm = (x) => smooth(clamp(x));

/* sizes in µm */
const FIBRES = 32, DEPTH = 52, HALF_LEN = 190;     // fibres stacked from y = -3 down to -55
const FIB_W = [15, 30], FIB_FLAT = [0.22, 0.34];   // width; thickness as a fraction of width
const YEAST = 200, YEAST_L = [4, 6], YEAST_ASPECT = [0.72, 0.88], BUD_P = 0.25;
const SITES = 34, BUB_R = [6, 20];                 // nucleation sites; each one's own share of the gas at o2 = 1, as a radius
const FIZZ = 90, MICRO_R = 1.3;                    // newborn microbubbles on the cells
const STREAM = 40, RISE_UM = 900, STREAM_LO = 6, STREAM_H = 200;  // shed bubbles the climbing disk leaves behind

const COL = {
  fibreTop: '#f4efe3', fibreDeep: '#cdc4b0', wet: '#d6d3c9', under: '#cfc8b6',
  yeast: '#c99a5b', rim: '#5f7a8c', liquid: '#a9bccb', fogDry: '#e6eef4', fogWet: '#c6d4de',
};

const BUBBLE_VS = `varying vec3 vN; varying vec3 vV;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 mv = modelViewMatrix * p;
  vN = normalize(normalMatrix * n);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
/* a bubble in a micrograph: clear middle, dark refracting rim, a sharp window highlight */
const BUBBLE_FS = `uniform vec3 uRim; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float f = pow(1.0 - abs(dot(n, v)), 2.2);
  vec3 r = reflect(-v, n);
  float spec = pow(max(dot(r, normalize(vec3(-0.4, 0.7, 0.6))), 0.0), 60.0);
  float soft = pow(max(dot(r, normalize(vec3(0.5, -0.3, 0.8))), 0.0), 16.0) * 0.3;
  float hi = clamp(spec + soft, 0.0, 1.0);
  gl_FragColor = vec4(mix(uRim, vec3(1.0), hi), clamp(0.04 + f * 0.8 + spec, 0.0, 1.0) * uOpacity);
}`;
const bubbleMat = () => new THREE.ShaderMaterial({
  uniforms: { uRim: { value: new THREE.Color(COL.rim) }, uOpacity: { value: 1 } },
  vertexShader: BUBBLE_VS, fragmentShader: BUBBLE_FS, transparent: true, depthWrite: false,
});

/* fibrils: stripes running along the fibre (v goes around its cross-section) */
function fibrilTexture(R) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 32;
  const x = c.getContext('2d');
  for (let i = 0; i < 32; i++) { const g = Math.round(222 + R() * 33); x.fillStyle = `rgb(${g},${g},${g - 3})`; x.fillRect(0, i, 4, 1); }
  const tex = srgb(new THREE.CanvasTexture(c));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createDisk(env) {
  const TX = T.levels.disk;
  const R = seeded(47);
  const rr = (a, b) => a + (b - a) * R();
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4c8, 0.8 * LIGHT));
  const key = new THREE.DirectionalLight(0xffffff, 0.9 * LIGHT);
  key.position.set(-60, 140, 80);
  scene.add(key);
  const back = new THREE.DirectionalLight(0xe8f0ff, 0.35 * LIGHT);
  back.position.set(80, -40, -100);
  scene.add(back);
  const FOG_DRY = new THREE.Color(COL.fogDry), FOG_WET = new THREE.Color(COL.fogWet);
  scene.fog = new THREE.Fog(FOG_DRY.clone(), 260, 700);

  const pT = V(), nT = V(), tA = V(), tB = V(), tC = V(), sc = V(), mtx = new THREE.Matrix4(), qI = new THREE.Quaternion();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  /* ---------- fibres: one merged mesh of flattened, slightly twisted ribbons ---------- */
  const fibres = [];
  for (let i = 0; i < FIBRES; i++) {
    const a = R() * Math.PI, d = V(Math.cos(a), 0, Math.sin(a)), q = V(-d.z, 0, d.x);
    const off = rr(-95, 95), shift = rr(-30, 30), bow = rr(-14, 14), y0 = -3 - (i / (FIBRES - 1)) * DEPTH;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const s = k / 8;
      pts.push(d.clone().multiplyScalar(-HALF_LEN + 2 * HALF_LEN * s + shift)
        .addScaledVector(q, off + bow * Math.sin(Math.PI * s) + rr(-5, 5)).setY(y0 + rr(-2.5, 2.5)));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const w = rr(FIB_W[0], FIB_W[1]);
    // cotton-like convolutions: the ribbon twists one way, then back
    fibres.push({ curve, len: curve.getLength(), w, h: w * rr(FIB_FLAT[0], FIB_FLAT[1]), depth: i / (FIBRES - 1),
      twA: rr(0.15, 0.9), twK: (2 * Math.PI) / rr(120, 220), twP: R() * 6.28 });
  }
  const NS = 48, NC = 10, NV = (NS + 1) * (NC + 1);
  const se = (c) => Math.sign(c) * Math.pow(Math.abs(c), 0.55);   // a squarer cross-section than an ellipse
  const taper = (s) => Math.sqrt(clamp(Math.min(s, 1 - s) / 0.03));
  const fibreGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(FIBRES * NV * 3), nor = new Float32Array(FIBRES * NV * 3);
    const uv = new Float32Array(FIBRES * NV * 2), col = new Float32Array(FIBRES * NV * 3), idx = [];
    const cTop = new THREE.Color(COL.fibreTop), cDeep = new THREE.Color(COL.fibreDeep), cF = new THREE.Color();
    const P0 = V(), T0 = V(), S0 = V(), N0 = V();
    fibres.forEach((f, fi) => {
      f.P = []; f.S = []; f.N = []; f.E = [];
      cF.copy(cTop).lerp(cDeep, f.depth).multiplyScalar(rr(0.96, 1.02));
      const base = fi * NV;
      for (let i = 0; i <= NS; i++) {
        const s = i / NS;
        f.curve.getPointAt(s, P0); f.curve.getTangentAt(s, T0);
        S0.crossVectors(T0, UP).normalize(); N0.crossVectors(S0, T0).normalize();   // N0 points up
        const th = f.twA * Math.sin(s * f.len * f.twK + f.twP), c0 = Math.cos(th), s0 = Math.sin(th);
        const Sx = S0.clone().multiplyScalar(c0).addScaledVector(N0, s0);
        const Nx = N0.clone().multiplyScalar(c0).addScaledVector(S0, -s0);
        const e = taper(s);
        f.P.push(P0.clone()); f.S.push(Sx); f.N.push(Nx); f.E.push(e);
        for (let j = 0; j <= NC; j++) {
          const an = (j / NC) * Math.PI * 2, c = Math.cos(an), sn = Math.sin(an), k = base + i * (NC + 1) + j;
          tA.copy(P0).addScaledVector(Sx, se(c) * f.w * e / 2).addScaledVector(Nx, se(sn) * f.h * e / 2);
          pos[k * 3] = tA.x; pos[k * 3 + 1] = tA.y; pos[k * 3 + 2] = tA.z;
          tA.copy(Sx).multiplyScalar(c / f.w).addScaledVector(Nx, sn / f.h).normalize();
          nor[k * 3] = tA.x; nor[k * 3 + 1] = tA.y; nor[k * 3 + 2] = tA.z;
          uv[k * 2] = (s * f.len) / 60; uv[k * 2 + 1] = j / NC;
          col[k * 3] = cF.r; col[k * 3 + 1] = cF.g; col[k * 3 + 2] = cF.b;
        }
      }
      for (let i = 0; i < NS; i++) {
        for (let j = 0; j < NC; j++) {
          const a = base + i * (NC + 1) + j, b = a + NC + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    });
    fibreGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fibreGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    fibreGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    fibreGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    fibreGeo.setIndex(idx);
    fibreGeo.computeBoundingSphere();
  }
  const fibreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: fibrilTexture(R), roughness: 0.85, metalness: 0, envMapIntensity: 0.4 });
  const fibreMesh = new THREE.Mesh(fibreGeo, fibreMat);
  scene.add(fibreMesh);
  // the rest of the paper's thickness, below the fibres drawn
  const under = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: COL.under, roughness: 1, metalness: 0 }));
  under.rotation.x = -Math.PI / 2;
  under.position.y = -DEPTH - 10;
  scene.add(under);

  /** A point on fibre f's surface at s (0..1 along it), angle ang around it (0 = side edge, π/2 = top face), and its outward normal. */
  function onFibre(f, s, ang, out, n) {
    const i = Math.round(s * NS), e = f.E[i], c = Math.cos(ang), sn = Math.sin(ang);
    out.copy(f.P[i]).addScaledVector(f.S[i], se(c) * f.w * e / 2).addScaledVector(f.N[i], se(sn) * f.h * e / 2);
    n.copy(f.S[i]).multiplyScalar(c / f.w).addScaledVector(f.N[i], sn / f.h).normalize();
  }

  /* ---------- yeast: lodged on fibre faces, in the crevices at their edges, some in clumps ---------- */
  const cells = [];
  const basis = new THREE.Matrix4(), dir = V();
  while (cells.length < YEAST) {
    const prev = cells[cells.length - 1];
    const a = rr(YEAST_L[0], YEAST_L[1]) / 2, b = a * rr(YEAST_ASPECT[0], YEAST_ASPECT[1]);
    let c, n;
    if (prev && R() < 0.3) {
      n = prev.n.clone();
      const t1 = Math.abs(n.y) < 0.9 ? V(0, 1, 0).cross(n).normalize() : V(1, 0, 0).cross(n).normalize(), t2 = n.clone().cross(t1);
      const g = R() * Math.PI * 2, dd = (prev.b + b) * 1.05;
      c = prev.c.clone().addScaledVector(t1, Math.cos(g) * dd).addScaledVector(t2, Math.sin(g) * dd);
    } else {
      const f = fibres[Math.floor(Math.pow(R(), 1.6) * FIBRES * 0.7)];
      const ang = R() < 0.5 ? (R() < 0.5 ? 0 : Math.PI) + rr(-0.5, 0.5) : Math.PI / 2 + rr(-1.1, 1.1);
      onFibre(f, rr(0.2, 0.8), ang, pT, nT);
      if (Math.abs(pT.x) > 110 || Math.abs(pT.z) > 110) continue;
      n = nT.clone();
      c = pT.clone().addScaledVector(n, b * 0.8);
    }
    do { dir.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)); dir.addScaledVector(n, -dir.dot(n)); } while (dir.lengthSq() < 0.05);
    const xA = dir.clone().normalize(), zA = V().crossVectors(xA, n);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis.makeBasis(xA, n, zA));
    let bud = null;
    if (R() < BUD_P) { const r = b * rr(0.5, 0.75); bud = { c: c.clone().addScaledVector(xA, a + r * 0.75), r }; }
    cells.push({ c, n, q, a, b, d: R(), bud });
  }
  const buds = cells.filter((c) => c.bud);
  const yeastMat = new THREE.MeshStandardMaterial({ color: COL.yeast, roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
  const yeastGeo = new THREE.SphereGeometry(1, 12, 8);
  const yeastMesh = new THREE.InstancedMesh(yeastGeo, yeastMat, YEAST);
  const budMesh = new THREE.InstancedMesh(yeastGeo, yeastMat, Math.max(1, buds.length));
  yeastMesh.frustumCulled = budMesh.frustumCulled = false;
  const yeastGroup = new THREE.Group();
  yeastGroup.add(yeastMesh, budMesh);
  scene.add(yeastGroup);
  const nearest = (list, pt, ok = () => true) => {
    let best = -1, bd = Infinity;
    list.forEach((x, i) => { if (!ok(x)) return; const d = x.distanceToSquared(pt); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const yLab = cells[nearest(cells.map((c) => c.c), V(22, 0, 18), (p) => p.y > -8)];
  const vis = [];
  cells.forEach((c, i) => { if (Math.abs(c.c.x) < 80 && Math.abs(c.c.z) < 80 && c.c.y > -20) vis.push(i); });

  /* ---------- O₂ bubbles: nucleation sites on cells and in fibre crevices ---------- */
  const sites = [];
  const spaced = (p) => sites.every((s) => s.p.distanceTo(p) > 16);
  for (let k = vis.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1)); [vis[k], vis[j]] = [vis[j], vis[k]]; }
  for (const i of vis) {
    if (sites.length >= 22) break;
    const p = cells[i].c.clone().addScaledVector(cells[i].n, cells[i].b);
    if (spaced(p)) sites.push({ p });
  }
  for (let k = 0; k < 300 && sites.length < SITES; k++) {
    onFibre(fibres[Math.floor(R() * 8)], rr(0.3, 0.7), R() < 0.5 ? 0 : Math.PI, pT, nT);
    if (Math.abs(pT.x) < 75 && Math.abs(pT.z) < 75 && spaced(pT)) sites.push({ p: pT.clone() });
  }
  sites.forEach((s) => Object.assign(s, { R: rr(BUB_R[0], BUB_R[1]), on: Math.pow(R(), 1.3) * 0.55, into: -1, m: 1, target: false, ph: R() * 6.28, cen: V(), r: 0, v: 0 }));
  sites.reduce((a, b) => (b.on < a.on ? b : a)).on = 0;   // the first bubble shows as soon as gas does
  // small bubbles merge into a larger neighbour as the gas builds; a merge target never merges itself
  sites.map((s, i) => i).sort((i, j) => sites[i].R - sites[j].R).forEach((j) => {
    const sj = sites[j];
    if (sj.target) return;
    let best = -1, bd = 46;
    sites.forEach((si, i) => { if (i !== j && si.into < 0 && si.R >= sj.R) { const d = si.p.distanceTo(sj.p); if (d < bd) { bd = d; best = i; } } });
    if (best >= 0 && R() < 0.6) { sj.into = best; sites[best].target = true; sj.m = Math.min(0.92, Math.max(sj.on, sites[best].on) + rr(0.25, 0.5)); }
  });
  const sitePts = sites.map((s) => s.p);
  const bubMat = bubbleMat();
  const bubMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), bubMat, SITES);
  bubMesh.count = sites.length;
  bubMesh.frustumCulled = false;
  bubMesh.renderOrder = 5;
  scene.add(bubMesh);

  /* newborn microbubbles: grow on a cell, then drift into the nearest big bubble */
  const fizz = [];
  for (let i = 0; i < FIZZ; i++) {
    const ci = vis[Math.floor(R() * vis.length)], c = cells[ci];
    fizz.push({ c, n: c.n.clone().add(V(rr(-0.6, 0.6), rr(-0.6, 0.6), rr(-0.6, 0.6))).normalize(),
      site: sites[nearest(sitePts, c.c)], sp: rr(0.6, 1.4), off: R(), gate: R() });
  }
  const fizzMat = bubbleMat();
  const fizzMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), fizzMat, FIZZ);
  fizzMesh.frustumCulled = false;
  fizzMesh.renderOrder = 6;
  scene.add(fizzMesh);

  /* shed bubbles, fixed in the liquid: the disk climbs past them, so they stream down */
  const stream = [];
  for (let i = 0; i < STREAM; i++) stream.push({ x: rr(-110, 110), z: rr(-110, 110), y0: rr(0, STREAM_H), r: rr(1, 3.5) });
  const streamMat = bubbleMat();
  const streamMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), streamMat, STREAM);
  streamMesh.frustumCulled = false;
  streamMesh.renderOrder = 6;
  scene.add(streamMesh);

  /* the liquid: a faint tint behind everything, plus fog over the fibres */
  const LIQ = new THREE.Color(COL.liquid);
  const liquidMat = new THREE.MeshBasicMaterial({ color: LIQ, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: false });
  const liquid = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), liquidMat);
  liquid.renderOrder = -1;
  scene.add(liquid);

  /* ---------- update ---------- */
  const FIB_DRY = new THREE.Color(0xffffff), FIB_WET = new THREE.Color(COL.wet), IBG = new THREE.Color();
  let last = null, liq = 0, wetLast = -1, phase = 0, rMax = 0, big = -1, conc = 0;

  function poseYeast(wet) {
    let bi = 0;
    for (let i = 0; i < YEAST; i++) {
      const c = cells[i], k = sm((wet - 0.6 * c.d) / 0.4);
      if (k <= 0.001) { yeastMesh.setMatrixAt(i, ZERO); if (c.bud) budMesh.setMatrixAt(bi++, ZERO); continue; }
      const drop = (1 - k) * 12;   // settles out of the suspension into the mesh
      mtx.compose(tA.copy(c.c).addScaledVector(UP, drop), c.q, sc.set(c.a * k, c.b * k, c.b * k));
      yeastMesh.setMatrixAt(i, mtx);
      if (c.bud) budMesh.setMatrixAt(bi++, mtx.compose(tA.copy(c.bud.c).addScaledVector(UP, drop), qI, sc.setScalar(c.bud.r * k)));
    }
    yeastMesh.instanceMatrix.needsUpdate = budMesh.instanceMatrix.needsUpdate = true;
    yeastMesh.boundingSphere = budMesh.boundingSphere = null;   // re-measured on the next pick
    yeastGroup.visible = wet > 0.001;
  }

  function update(t, time) {
    const dt = last == null ? 0 : clamp(time - last, 0, 0.05);
    last = time;
    const wet = clamp(t.wet || 0), inL = !!t.inLiquid, live = inL && !t.boiled;
    conc = inL ? t.conc || 0 : 0;

    // wet paper is darker and glossier; the liquid tint eases in over a fraction of a second
    fibreMat.color.copy(FIB_DRY).lerp(FIB_WET, wet);
    fibreMat.roughness = lerp(0.85, 0.5, wet);
    liq = dt === 0 ? (inL ? 1 : 0) : liq + ((inL ? 1 : 0) - liq) * (1 - Math.exp(-dt * 5));
    liquidMat.opacity = 0.16 * liq;
    liquid.visible = liq > 0.002;
    scene.fog.color.copy(FOG_DRY).lerp(FOG_WET, liq);
    scene.fog.near = lerp(260, 110, liq);
    scene.fog.far = lerp(700, 420, liq);

    if (wet !== wetLast) { poseYeast(wet); wetLast = wet; }

    // big bubbles: gas held ∝ o2, shared out by site, small ones merging into big ones
    const o2 = live ? clamp(t.o2 || 0) : 0;
    rMax = 0; big = -1;
    for (const s of sites) s.v = s.R * s.R * s.R * clamp((o2 - s.on) / (1 - s.on));
    for (const s of sites) if (s.into >= 0) { const tr = s.v * sm((o2 - s.m) / 0.1); s.v -= tr; sites[s.into].v += tr; }
    for (const s of sites) { s.r = Math.cbrt(s.v); s.cen.copy(s.p).addScaledVector(UP, s.r * 0.55); }
    sites.forEach((s, i) => {
      if (s.into >= 0) s.cen.lerp(sites[s.into].cen, sm((o2 - s.m) / 0.1) * 0.85);
      if (s.r < 0.05) { bubMesh.setMatrixAt(i, ZERO); return; }
      if (s.r > rMax) { rMax = s.r; big = i; }
      bubMesh.setMatrixAt(i, mtx.compose(s.cen, qI, sc.setScalar(s.r * (1 + 0.025 * Math.sin(time * 2.3 + s.ph)))));
    });
    bubMesh.instanceMatrix.needsUpdate = true;
    bubMesh.boundingSphere = null;
    bubMesh.visible = big >= 0;

    // fizz: more of it, cycling faster, as the rate rises
    const rate = live ? clamp(t.rate || 0) : 0;
    phase += dt * rate * 0.8;
    fizzMesh.visible = rate > 0;
    if (rate > 0) {
      fizz.forEach((m, i) => {
        if (m.gate > 0.25 + 0.75 * rate) { fizzMesh.setMatrixAt(i, ZERO); return; }
        const p = (phase * m.sp + m.off) % 1;
        let r = MICRO_R;
        tA.copy(m.c.c).addScaledVector(m.n, m.c.b + MICRO_R);
        if (p < 0.65) {
          r = MICRO_R * Math.sqrt(p / 0.65);
          tA.copy(m.c.c).addScaledVector(m.n, m.c.b + r);
        } else {
          const k = (p - 0.65) / 0.35, s = m.site;
          if (s.r > 1) tB.copy(tA).sub(s.cen).normalize().multiplyScalar(s.r * 0.9).add(s.cen);
          else tB.copy(tA).addScaledVector(UP, 25);
          tA.lerp(tB, sm(k));
          r = MICRO_R * (1 - sm((k - 0.8) / 0.2));
        }
        fizzMesh.setMatrixAt(i, r < 0.02 ? ZERO : mtx.compose(tA, qI, sc.setScalar(r)));
      });
      fizzMesh.instanceMatrix.needsUpdate = true;
    }

    // rising: posed from rise, so a scrub replays it
    const rise = live ? clamp(t.rise || 0) : 0;
    const sa = sm(rise * 8) * (1 - sm((rise - 0.9) / 0.1));
    streamMesh.visible = sa > 0.001;
    if (streamMesh.visible) {
      streamMat.uniforms.uOpacity.value = sa;
      stream.forEach((b, i) => {
        const y = STREAM_LO + ((((b.y0 - rise * RISE_UM) % STREAM_H) + STREAM_H) % STREAM_H);
        const k = sm((y - STREAM_LO) / 15) * sm((STREAM_LO + STREAM_H - y) / 15);
        tC.set(b.x + Math.sin(time * 1.3 + i) * 0.6, y, b.z);
        streamMesh.setMatrixAt(i, mtx.compose(tC, qI, sc.setScalar(Math.max(1e-4, b.r * k))));
      });
      streamMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /* ---------- labels, hover info, views ---------- */
  const fmtConc = (c) => String(+c.toFixed(3));
  // the fibre label sits on whichever of the top fibres passes closest to (-35, -10)
  let fLab = fibres[0], fS = 0, fD = Infinity;
  fibres.slice(0, 4).forEach((f) => f.P.forEach((p, k) => {
    const d = Math.hypot(p.x + 35, p.z + 10);
    if (d < fD) { fD = d; fLab = f; fS = k / NS; }
  }));
  const fibreAnchor = V();
  onFibre(fLab, fS, Math.PI / 2, fibreAnchor, nT);
  // the most open pore near the middle: farthest from the edges of the top fibres
  const airAnchor = V();
  {
    let best = -Infinity;
    for (let x = -60; x <= 60; x += 4) {
      for (let z = -60; z <= 60; z += 4) {
        let d = Infinity;
        for (const f of fibres.slice(0, 6)) for (const p of f.P) d = Math.min(d, Math.hypot(p.x - x, p.z - z) - f.w / 2);
        if (d > best) { best = d; airAnchor.set(x, -6, z); }
      }
    }
  }
  const solAnchor = V(-60, 45, 20), bubAnchor = V(), yeastAnchor = V();
  const L = TX.labels;
  const labels = [
    { key: 'fibre', text: L.fibre.text, sub: fmt(L.fibre.sub, { w: Math.round(fLab.w) }), anchor: () => fibreAnchor, show: () => true },
    { key: 'air', text: L.air.text, sub: L.air.sub, anchor: () => airAnchor, show: (t) => t.wet < 0.05 && !t.inLiquid },
    { key: 'yeast', text: L.yeast.text, sub: fmt(L.yeast.sub, { d: Math.round(yLab.a * 2) }),
      anchor: () => yeastAnchor.copy(yLab.c).addScaledVector(yLab.n, yLab.b),
      show: (t) => t.wet > 0.6 && (!t.inLiquid || t.boiled || t.o2 < 0.3) },
    { key: 'bubble', text: L.bubble.text, sub: () => fmt(L.bubble.sub, { d: Math.round(rMax * 2) }),
      anchor: () => (big >= 0 ? bubAnchor.copy(sites[big].cen).addScaledVector(UP, sites[big].r) : bubAnchor),
      show: (t) => t.inLiquid && !t.boiled && t.o2 > 0.1 && rMax > 3 },
    { key: 'solution', text: L.solution.text, sub: () => fmt(conc > 0 ? L.solution.sub : L.solution.none, { conc: fmtConc(conc) }),
      anchor: () => solAnchor, show: (t) => t.inLiquid && (t.conc <= 0 || t.boiled || t.o2 < 0.1) },
  ];
  const interactives = [
    { root: fibreMesh, priority: 0, info: () => TX.info.fibre },
    { root: yeastGroup, priority: 2, info: (t) => ({ ...TX.info[t.boiled ? 'yeastBoiled' : 'yeast'], dive: 'mol' }) },
    { root: bubMesh, priority: 1, info: () => TX.info.bubble },
  ];

  const top = { pos: V(40, 120, 150), target: V(0, -10, 0) };
  const near = { pos: V(55, 85, 135), target: V(0, -5, 0) };
  const wide = { pos: V(75, 100, 165), target: V(0, 0, 0) };
  const views = [top, top, near, near, wide, wide];   // yeast, boil, disks, boiled, read, complete

  /* Watch's caption at this level: one line per step, the in-peroxide beats following o2 */
  const C = {};
  const cueOf = (k, mark = null) => (C[k] = C[k] || { text: TX.cues[k], mark });
  const O2_CUES = [[0, cueOf('split', 'yeast')], [0.12, cueOf('bubbles', 'bubble')], [0.6, cueOf('merge', 'bubble')]];
  function cue(t) {
    if (t.step === 'read' || t.step == null) return cueOf('read');
    if (t.inLiquid) {
      if (t.boiled) return cueOf('boiled', 'yeast');
      if (t.conc <= 0) return cueOf('water', 'solution');
      if (t.rise > 0.001) return cueOf('rise', 'bubble');
      return cueAt(O2_CUES, t.o2 || 0);
    }
    if (t.wet > 0.05) return t.boiled ? cueOf('soakBoiled', 'yeast') : cueOf('soak', 'yeast');
    return t.step === 'boil' ? cueOf('boil', 'fibre') : cueOf('dry', 'fibre');
  }

  return {
    scene, update, labels, interactives, views, cue,
    insetBg: (bg) => IBG.copy(bg).lerp(LIQ, 0.25 * liq),
    fov: 38, near: 0.5, far: 1500, minDist: 30, maxDist: 260,
  };
}
