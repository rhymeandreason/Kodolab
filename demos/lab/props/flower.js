/* A white pea flower (Pisum sativum), 2 cm. From the Mendel lab.
 *
 *   const f = makePeaFlower(mat);
 *   f.setOpen(o); f.setKeelOpen(k); f.setAnthers(a); f.setPollen(p); f.setShed(s); f.setWither(w)
 *
 * Origin where the pedicel joins the peduncle; the calyx sits 0.45 cm below it and
 * the flower faces +z, banner up. Papilionaceous: banner, two wings, and the keel (two petals
 * joined along their lower edge) around ten stamens, nine filaments fused into a sheath plus
 * one free, around the pistil. The keel hides them, so they draw only while setKeelOpen > 0.
 * Withering turns the flower down along -y, which puts its calyx where the pod's is, and the
 * petals drop. anchors follow the pose.
 */
import * as THREE from 'three';
import { V3, clamp, lerp, smooth } from '../core/math.js';
import { seeded } from '../core/random.js';
import { mesh } from '../core/geometry.js';
import { makeCanvas, canvasTex } from '../core/canvas.js';
import { toLinear } from '../materials.js';
import { ss, lc, AX, AY, geoCache, matCache, texCache, curve, sheet, addMorphs, merge, tint, live, paint } from './shapes.js';
import { P0, calyxGeometry, calyxMat } from './peas.js';

/* ---------- flower ---------- */
const COL_PTS = [[0, 0, 0.22], [0, 0, 0.6], [0, 0.04, 0.95], [0, 0.15, 1.2], [0, 0.31, 1.33]];
const COL = curve(COL_PTS);                    // staminal column and style, in the calyx frame
const KEEL = curve([[0, 0.03, 0.18], [0, 0.03, 0.6], [0, 0.07, 0.96], [0, 0.18, 1.22], [0, 0.35, 1.37], [0, 0.47, 1.43]]);
const upN = (c, t, out = V3()) => { const T = c.getTangentAt(t); return out.set(0, T.z, -T.y).normalize(); };
const keelR = (t) => 0.2 * (0.42 + 0.58 * ss(0, 0.3, t)) * Math.pow(1 - ss(0.7, 1, t), 0.55) + 0.012;
const ANTHER_S = 0.86, RING = 0.075;
const antherAngle = (j) => (j === 0 ? 0 : 0.7 + ((j - 1) * (2 * Math.PI - 1.4)) / 8);
function ring(s, a, r, out = V3()) {
  const N = upN(COL, s);
  return out.copy(COL.getPointAt(s)).addScaledVector(N, Math.cos(a) * r).addScaledVector(AX, Math.sin(a) * r);
}

/** Banner (standard): petal frame, base at the origin, length +y, inner face +z. Morph 0 is the bud:
 *  folded round the wings and keel, its tip curled over them. */
function bannerGeometry() {
  return geoCache('banner', () => {
    const L = 1.75;
    const hw = (t) => 0.1 + 0.92 * Math.pow(Math.max(0, 1 - ((t * 1.04 - 0.58) / 0.5) ** 2), 0.65);
    const shape = (folded) => sheet(22, 30, (u, t, out) => {
      const s = u * 2 - 1, w = hw(t), x = s * w;
      const y = L * t - 0.17 * Math.exp(-((x / 0.2) ** 2)) * ss(0.78, 1, t);
      if (!folded) {
        out.set(x, y, -0.2 * t * t - 0.28 * x * x * ss(0.2, 0.9, t) + 0.4 * x * x * (1 - ss(0.05, 0.4, t)) + 0.09 * Math.abs(x) * ss(0.1, 0.6, t) + 0.025 * Math.sin(s * 9 + t * 4) * ss(0.5, 1, Math.abs(s)));
      } else {
        const Rb = Math.max(0.3, w / 2.6), a = x / Rb;
        out.set(Rb * Math.sin(a), y * 0.94, Rb * (1 - Math.cos(a)) + 0.24 * ss(0.5, 1, t) ** 2);
      }
    });
    return addMorphs(shape(false), [shape(true)]);
  });
}
/** Wing: petal frame like the banner; cupped toward its inner face, round the keel. */
function wingGeometry() {
  return geoCache('wing', () => {
    const L = 1.32;
    const hw = (t) => 0.05 + 0.3 * Math.pow(Math.max(0, 1 - ((t * 1.04 - 0.62) / 0.5) ** 2), 0.7);
    return sheet(12, 22, (u, t, out) => {
      const s = u * 2 - 1, x = s * hw(t);
      out.set(x, L * t, 0.16 * (x / 0.35) ** 2 * ss(0.1, 0.5, t) - 0.06 * Math.sin(Math.PI * t));
    });
  });
}
/** Keel half, side ±1, in the calyx frame: from the fused lower seam (u 0) up over the column. */
function keelGeometry(side) {
  return geoCache('keel' + side, () => sheet(10, 30, (u, t, out) => {
    const psi = u * 2.72, R = keelR(t);
    const N = upN(KEEL, t);
    out.copy(KEEL.getPointAt(t)).addScaledVector(N, -Math.cos(psi) * 1.15 * R).addScaledVector(AX, side * Math.sin(psi) * 0.78 * R);
  }, side < 0));
}
const subCurve = (c, a, b, n = 8) => curve([...Array(n + 1)].map((_, i) => c.getPointAt(a + ((b - a) * i) / n)));
/** The ten filaments: nine fused into a sheath round the ovary, their tips free, and one free on top. */
function stamenGeometry() {
  return geoCache('stamens', () => {
    const parts = [new THREE.TubeGeometry(subCurve(COL, 0.03, 0.7), 20, 0.052, 8)];
    for (let j = 0; j < 10; j++) {
      const a = antherAngle(j), A = ring(ANTHER_S, a, RING);
      const pts = j === 0
        ? [0.05, 0.3, 0.55, 0.74].map((s) => COL.getPointAt(s).addScaledVector(upN(COL, s), 0.068)).concat([A])
        : [ring(0.66, a, 0.035), ring(0.77, a, 0.06), A];
      parts.push(new THREE.TubeGeometry(curve(pts), j === 0 ? 18 : 8, 0.011, 4));
    }
    return merge(parts);
  });
}
/** Ovary (inside the sheath; it becomes the pod), the curved style, the stigma. */
function pistilGeometry() {
  return geoCache('pistil', () => {
    const stig = new THREE.SphereGeometry(0.036, 12, 8);
    stig.translate(...COL.getPointAt(1).addScaledVector(COL.getTangentAt(1), 0.02).toArray());
    return merge([
      tint(new THREE.TubeGeometry(subCurve(COL, 0.04, 0.62), 14, 0.042, 8), '#9fc06a'),
      tint(new THREE.TubeGeometry(subCurve(COL, 0.6, 0.995), 12, 0.019, 6), '#e6edd2'),
      tint(stig, '#c4d878'),
    ]);
  });
}
/** Anther: two pollen sacs side by side, long axis +y. */
function antherGeometry() {
  return geoCache('anther', () => merge([-1, 1].map((s) => {
    const e = new THREE.SphereGeometry(1, 10, 8);
    e.scale(0.024, 0.055, 0.026); e.translate(s * 0.02, 0.03, 0);
    return e;
  })));
}
const GRAIN = geoCache('grain', () => new THREE.IcosahedronGeometry(0.009, 0));
/** Petals: white, a green flush and veins at the base (v = 0), veins following the outline. */
function petalTex() {
  return texCache('petal', () => {
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    const base = g.createLinearGradient(0, S, 0, S * 0.55);
    base.addColorStop(0, 'rgba(150,190,120,0.75)'); base.addColorStop(1, 'rgba(190,215,170,0)');
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    const R = seeded(4);
    g.lineCap = 'round';
    for (let k = 0; k < 26; k++) {
      let x = ((k + 0.5) / 26) * S, y = S;
      const end = S * (0.08 + R() * 0.25);
      const vein = g.createLinearGradient(0, S, 0, 0);
      vein.addColorStop(0, 'rgba(110,150,100,0.55)'); vein.addColorStop(0.5, 'rgba(165,185,160,0.22)'); vein.addColorStop(1, 'rgba(200,210,200,0.06)');
      g.strokeStyle = vein; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y);
      while (y > end) { y -= 12; x += (R() - 0.5) * 3; g.lineTo(x, y); }
      g.stroke();
    }
    return canvasTex(c);
  });
}
const FLOWER_C = { white: '#f6f5ef', bud: '#b9d69b', wither: '#b89c6c', anther: '#e2c457', shed: '#efab36', pollen: '#f1c048' };
const ANTHER_ORDER = [0, 5, 4, 6, 3, 7, 2, 8, 1, 9];   // the free one first, then round the ring from the top

/** A white pea flower; see the file header for its frame. */
export function makePeaFlower(mat, { seed = 1 } = {}) {
  const R = seeded(seed);
  const petal = live(mat.make.physical({
    color: toLinear(FLOWER_C.white), map: petalTex(), roughness: 0.55, sheen: 0.7, sheenRoughness: 0.45, sheenColor: lc('#ffffff'),
    emissive: lc('#1c1d18'), side: THREE.DoubleSide,
  }));
  const anther = mat.make.standard({ color: toLinear(FLOWER_C.anther), roughness: 0.65 });
  const fil = matCache(mat, 'filament', () => mat.make.standard({ color: toLinear('#eef1e2'), roughness: 0.5 }));
  const pistilM = matCache(mat, 'pistil', () => mat.make.physical({ color: 0xffffff, vertexColors: true, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 }));
  const pollenM = matCache(mat, 'pollen', () => mat.make.standard({ color: toLinear(FLOWER_C.pollen), roughness: 0.85 }));

  const g = new THREE.Group();
  const pedicel = mesh(geoCache('flowerPedicel', () => new THREE.TubeGeometry(curve([[0, 0, 0], [0, -0.17, -0.07], [0, -0.36, -0.08], [0, -0.45, 0]]), 10, 0.035, 6)), calyxMat(mat));
  g.add(pedicel);
  const F = new THREE.Group();               // the flower, in its calyx frame
  F.position.copy(P0);
  g.add(F);
  const calyx = mesh(calyxGeometry(), calyxMat(mat));
  F.add(calyx);
  const cor = new THREE.Group();             // corolla and what it encloses: grows out of the calyx
  F.add(cor);

  const bPiv = new THREE.Group();
  bPiv.position.set(0, 0.13, 0.4);
  const banner = mesh(bannerGeometry(), petal);
  bPiv.add(banner);
  cor.add(bPiv);

  const wings = [1, -1].map((side) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.15, -0.03, 0.32);
    const m = mesh(wingGeometry(), petal);
    const Y = V3(side * 0.06, 0.3, 0.95).normalize(), Z = V3(-side, 0, 0);
    Z.addScaledVector(Y, -Z.dot(Y)).normalize();
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3().crossVectors(Y, Z), Y, Z));
    piv.add(m);
    cor.add(piv);
    return { side, piv };
  });
  const seam = KEEL.getPointAt(0.45).addScaledVector(upN(KEEL, 0.45), -1.15 * keelR(0.45));
  const keelAxis = KEEL.getTangentAt(0.45);
  const keel = [1, -1].map((side) => {
    const piv = new THREE.Group();
    piv.position.copy(seam);
    const m = mesh(keelGeometry(side), petal);
    m.position.copy(seam).negate();
    piv.add(m);
    cor.add(piv);
    return { side, piv };
  });

  const inner = new THREE.Group();
  inner.add(mesh(stamenGeometry(), fil), mesh(pistilGeometry(), pistilM));
  const anthers = new THREE.InstancedMesh(antherGeometry(), anther, 10);
  const dust = new THREE.InstancedMesh(GRAIN, pollenM, 10 * 12);
  const stigmaDust = new THREE.InstancedMesh(GRAIN, pollenM, 40);
  anthers.castShadow = true;
  inner.add(anthers, dust, stigmaDust);
  cor.add(inner);

  // anthers and the pollen on them, placed once; setAnthers / setShed only rescale
  const A = [], grains = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V3(), one = V3(1, 1, 1);
  for (let j = 0; j < 10; j++) {
    const a = antherAngle(j), T = COL.getTangentAt(ANTHER_S);
    const pos = ring(ANTHER_S, a, RING);
    const out = V3().copy(pos).sub(COL.getPointAt(ANTHER_S)).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(AY, T.clone().addScaledVector(out, 0.35).normalize());
    A.push({ pos, quat });
    for (let k = 0; k < 12; k++) {
      const d = V3(R() - 0.5, R() * 1.2, R() - 0.5).normalize();
      grains.push(V3(d.x * 0.045, 0.03 + d.y * 0.06, d.z * 0.04).applyQuaternion(quat).add(pos));
    }
  }
  const stigma = COL.getPointAt(1).addScaledVector(COL.getTangentAt(1), 0.02);
  const sGrains = [...Array(40)].map(() => V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(0.036 + R() * 0.006).add(stigma));
  sGrains.forEach((v, i) => { m4.compose(v, q.set(R(), R(), R(), 1).normalize(), one); stigmaDust.setMatrixAt(i, m4); });

  const st = { open: 0.5, keel: 0, anthers: 1, pollen: 0, shed: 0, wither: 0 };
  const cWhite = lc(FLOWER_C.white), cBud = lc(FLOWER_C.bud), cWither = lc(FLOWER_C.wither), cEm = lc('#1c1d18');
  const anchors = { stigma: V3(), anthers: V3(), keel: V3(), ovary: V3() };
  const LOCAL = {
    stigma: stigma.clone(), anthers: COL.getPointAt(ANTHER_S),
    keel: KEEL.getPointAt(0.55).addScaledVector(upN(KEEL, 0.55), keelR(0.55)), ovary: COL.getPointAt(0.33),
  };
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

  function pose() {
    const { open, keel: k0, wither: w } = st;
    const k = smooth(clamp(k0)), e = ss(0.55, 1, open), grow = ss(0, 0.5, open);
    calyx.scale.setScalar(lerp(0.62, 1, grow));
    calyx.morphTargetInfluences[0] = 1 - ss(0.05, 0.4, open);
    cor.scale.setScalar(lerp(0.3, 1, grow) * (1 - 0.3 * ss(0.15, 0.8, w)));
    F.rotation.x = (Math.PI / 2) * ss(0.05, 0.5, w);
    const lift = Math.max(e, 0.6 * k) * (1 - ss(0.1, 0.6, w));
    bPiv.rotation.x = lerp(1.5, 0.06, lift);
    banner.morphTargetInfluences[0] = 1 - lift;
    const spread = (0.2 * e + 0.5 * k) * (1 - ss(0.1, 0.6, w)), droop = 0.55 * k;
    wings.forEach(({ side, piv }) => {
      qa.setFromAxisAngle(AY, side * spread); qb.setFromAxisAngle(V3(0, 0, 1), -side * droop);
      piv.quaternion.copy(qa).multiply(qb);
      piv.scale.setScalar(lerp(0.86, 1, Math.max(e, k)));   // tucked under the banner in the bud
      piv.position.y = lerp(-0.08, -0.03, Math.max(e, k));
    });
    keel.forEach(({ side, piv }) => piv.quaternion.setFromAxisAngle(keelAxis, -side * 1.15 * k));
    paint(g, petal, (m) => {
      m.color.copy(cBud).lerp(cWhite, ss(0.1, 0.5, open)).lerp(cWither, ss(0.05, 0.6, w));
      m.emissive.copy(cEm).multiplyScalar(1 - ss(0.05, 0.4, w));
    });
    bPiv.visible = w < 0.82;
    wings.forEach(({ piv }) => { piv.visible = w < 0.88; });
    keel.forEach(({ piv }) => { piv.visible = w < 0.94; });
    calyx.visible = pedicel.visible = w < 0.99;
    inner.visible = k > 0.001 && w < 0.5;
    // anthers: round(a*10) of them, split and dusty as they shed
    const n = Math.round(clamp(st.anthers) * 10), sh = clamp(st.shed);
    anthers.material.color.copy(lc(FLOWER_C.anther)).lerp(lc(FLOWER_C.shed), sh);
    anthers.material.roughness = lerp(0.65, 0.95, sh);
    ANTHER_ORDER.forEach((j, r) => {
      const on = r >= 10 - n ? 1 : 0;
      m4.compose(A[j].pos, A[j].quat, p.set(1, 1 - 0.15 * sh, 1).multiplyScalar(on));
      anthers.setMatrixAt(j, m4);
      for (let i = 0; i < 12; i++) {
        m4.compose(grains[j * 12 + i], A[j].quat, p.setScalar(on * sh * (i < 12 * sh + 1 ? 1 : 0)));
        dust.setMatrixAt(j * 12 + i, m4);
      }
    });
    anthers.instanceMatrix.needsUpdate = dust.instanceMatrix.needsUpdate = true;
    dust.visible = sh > 0.01;
    stigmaDust.count = Math.round(clamp(st.pollen) * 40);
    stigmaDust.visible = stigmaDust.count > 0;
    // anchors in the flower's own frame
    cor.updateMatrix(); F.updateMatrix();
    for (const key in LOCAL) anchors[key].copy(LOCAL[key]).applyMatrix4(cor.matrix).applyMatrix4(F.matrix);
  }

  const set = (key) => (v) => { st[key] = clamp(v); pose(); };
  pose();
  return {
    group: g, anchors,
    setOpen: set('open'), setKeelOpen: set('keel'), setAnthers: set('anthers'),
    setPollen: set('pollen'), setShed: set('shed'), setWither: set('wither'),
    /** How many anthers are left: round(a * 10). */
    get antherCount() { return Math.round(clamp(st.anthers) * 10); },
  };
}
