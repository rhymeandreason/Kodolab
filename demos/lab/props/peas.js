/* Garden pea (Pisum sativum): the seed and the pod, at real size. The flower is flower.js. From
 * the Mendel lab.
 *
 *   const pea = makePea(mat, { color: 'yellow', seed: 3 });   // a dry seed, 0.8 cm: 'yellow' | 'green'
 *   PEA_COLORS, peaMaterial(mat, 'green'), peaGeometry(v)        // the same look, for an InstancedMesh
 *
 *   const pod = makePeaPod(mat, { peas: ['Y', 'y', 'Y'] });   // 'Y' a yellow seed, 'y' a green one
 *   pod.setGrowth(g); pod.setDry(d); pod.setOpen(o); pod.setPeas(list); pod.setPeaVisible(i, on); pod.peaLocal(i)
 *
 * Pod: origin at the stalk end, hanging along -y. Its width (dorsal seam to ventral seam) runs
 * along +x and the two valves face ±z. It is 6 to 9.5 cm long, longer with more seeds, so
 * they never overlap. Opening splits the ventral seam and swings each valve about the dorsal
 * one; each seed rides in the valve its funiculus joins, alternating. Laid on its side with
 * the ventral seam up, Q(0, 0, π/2), the valves open upward. Growth 0 hides the pod: on the
 * plant the flower is still there. All seeds are green while they fill; once the pod is half
 * dry the 'Y' ones turn yellow (SGR breaks down their chlorophyll), the 'y' ones stay green.
 *
 */
import * as THREE from 'three';
import { V3, clamp, lerp, smooth } from '../core/math.js';
import { seeded } from '../core/random.js';
import { mesh } from '../core/geometry.js';
import { makeCanvas, canvasTex } from '../core/canvas.js';
import { toLinear } from '../materials.js';
import { ss, lc, AX, AY, geoCache, matCache, texCache, curve, sheet, weld, addMorphs, tint, live, paint } from './shapes.js';

/* ---------- seed ---------- */
const PEA_R = 0.4;
/** Dry yellow seed (golden cream), dry green seed (sage), and a filling seed (fresh green, any genotype). */
export const PEA_COLORS = { yellow: '#cfa846', green: '#7f9a50', fresh: '#78ad40' };

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
/** A pea, radius 0.4: flattened where its neighbours pressed in the pod, a few dimples, the hilum
 *  at +x. Three variants. */
export function peaGeometry(v = 0) {
  v = Math.abs(v) % 3;
  return geoCache('pea' + v, () => {
    const g = new THREE.SphereGeometry(PEA_R, 28, 18);
    const R = seeded(17 + v * 31);
    const dir = () => V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    const flats = [V3(0.3 * (R() - 0.5), 0.3 * (R() - 0.5), 1).normalize(), V3(0.3 * (R() - 0.5), 0.3 * (R() - 0.5), -1).normalize()];
    const dimples = [dir(), dir(), dir()];
    const p = g.attributes.position, n = V3();
    for (let i = 0; i < p.count; i++) {
      n.fromBufferAttribute(p, i).normalize();
      let r = 1 + 0.02 * Math.sin(n.x * 5 + v * 2) * Math.cos(n.y * 4 - v);
      flats.forEach((f, k) => { const d = n.dot(f); if (d > 0.5) r = smin(r, (0.9 + 0.03 * k) / d, 0.08); });
      dimples.forEach((d) => { r -= 0.03 * Math.exp(-(1 - n.dot(d)) / 0.025); });
      r -= 0.025 * Math.exp(-(1 - n.x) / 0.006);
      p.setXYZ(i, n.x * r * PEA_R, n.y * r * PEA_R * 0.95, n.z * r * PEA_R);
    }
    g.computeVertexNormals();
    return weld(g);
  });
}

/** The seed coat: faint marbling, and the hilum (u 0.5, v 0.5: +x on the sphere), a pale oval scar
 *  with a slit. Colourless, as in white-flowered lines. */
export function peaTex() {
  return texCache('pea', () => {
    const W = 256, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const R = seeded(5);
    for (let i = 0; i < 320; i++) {
      g.fillStyle = R() < 0.55 ? `rgba(110,90,50,${0.02 + R() * 0.035})` : `rgba(255,255,235,${0.05 + R() * 0.08})`;
      g.beginPath(); g.ellipse(R() * W, 14 + R() * (H - 28), 2 + R() * 9, 1 + R() * 4, R() * 3, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(105,85,50,0.4)'; g.beginPath(); g.ellipse(128, 64, 15, 6.5, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,250,232,1)'; g.beginPath(); g.ellipse(128, 64, 12.5, 4.6, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(80,62,34,0.6)'; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(118, 64); g.lineTo(138, 64); g.stroke();
    return canvasTex(c);
  });
}

/** The seed's material: 'yellow' | 'green' | 'fresh' | a hex. One per colour per material set. */
export function peaMaterial(mat, color = 'yellow') {
  const hex = PEA_COLORS[color] || color;
  return matCache(mat, 'pea' + hex, () => mat.make.physical({
    color: toLinear(hex), map: peaTex(), roughness: 0.5, clearcoat: 0.22, clearcoatRoughness: 0.5,
  }));
}

/** One dry pea, ≈ 0.8 cm. Origin at its centre; r is its radius. */
export function makePea(mat, { color = 'yellow', seed = 1 } = {}) {
  const R = seeded(seed), s = 0.95 + R() * 0.1;
  const g = new THREE.Group();
  const m = mesh(peaGeometry(seed), peaMaterial(mat, color));
  m.scale.setScalar(s);
  g.add(m);
  return { group: g, mesh: m, r: PEA_R * s, setColor(c) { m.material = peaMaterial(mat, c); } };
}

/* ---------- calyx and pedicel (flower and pod share them) ---------- */
export const P0 = V3(0, -0.45, 0);    // calyx base, below the pedicel's attachment
const CAL = { tube: 0.4, lobe: 0.82, upper: 0.7 };
/** Five sepals fused into a cup along +z: three narrow lower lobes, two broader upper ones.
 *  Morph 0 closes the lobes over a young bud. */
export function calyxGeometry() {
  return geoCache('calyx', () => {
    const shape = (closed) => sheet(60, 14, (a, t, out) => {
      const ang = a * Math.PI * 2, z = t * CAL.lobe, step = (2 * Math.PI) / 5;
      const k = Math.round((ang + Math.PI / 2) / step), c = -Math.PI / 2 + k * step;
      const upper = ((k % 5) + 5) % 5 === 2 || ((k % 5) + 5) % 5 === 3;
      let r = z < CAL.tube ? 0.075 + 0.13 * Math.sqrt(z / CAL.tube) : 0.205 + 0.03 * (z - CAL.tube) / (CAL.lobe - CAL.tube);
      let A = ang, Z = z;
      if (z > CAL.tube * 0.85) {
        const f = clamp((z - CAL.tube * 0.85) / (CAL.lobe - CAL.tube * 0.85));
        const w = Math.min(1, Math.pow(1 - f, 0.75) * (upper ? 0.95 : 0.8));
        r += 0.07 * f * f;
        A = c + (ang - c) * w;
        if (upper) Z = CAL.tube * 0.85 + (z - CAL.tube * 0.85) * (CAL.upper - CAL.tube * 0.85) / (CAL.lobe - CAL.tube * 0.85);
        if (closed) r *= lerp(1, 0.28, f);
      }
      out.set(r * Math.cos(A), r * Math.sin(A), Z);
    });
    const base = weld(shape(false));
    return addMorphs(base, [weld(shape(true))]);
  });
}
export const calyxMat = (mat) => matCache(mat, 'calyx', () => mat.make.physical({
  color: toLinear('#6f9a55'), roughness: 0.55, sheen: 0.25, sheenRoughness: 0.5, sheenColor: lc('#b9d3bf'), side: THREE.DoubleSide,
}));

/* ---------- pod ---------- */
const POD = { W: 1.3, Y0: -0.62, uA: 0.11, uB: 0.9 };
const podLen = (n) => clamp(3.2 + 0.75 * n, 6, 9.5);
function podShape(n) {
  const L = podLen(n), sp = (POD.uB - POD.uA) / n;
  const us = [...Array(n)].map((_, i) => POD.uA + sp * (i + 0.5));
  const bump = (u) => Math.min(1, us.reduce((a, ui) => a + Math.exp(-(((u - ui) / (sp * 0.45)) ** 2)), 0));
  const cx = (u) => 0.85 * u ** 2.2;
  const wp = (u) => (0.25 + 0.75 * ss(0, 0.2, u)) * Math.pow(1 - ss(0.8, 1, u), 0.5) + 0.004;
  const tp = (u) => (0.2 + 0.8 * ss(0, 0.16, u)) * Math.pow(1 - ss(0.82, 1, u), 0.6) + 0.004;
  const dorsal = (u, out = V3()) => out.set(cx(u) - (POD.W / 2) * wp(u), -L * u, 0);
  const ventral = (u, out = V3()) => out.set(cx(u) + (POD.W / 2) * wp(u), -L * u, 0);
  return { n, L, sp, us, bump, cx, wp, tp, dorsal, ventral };
}
/** A valve, side ±1, in the pod body's frame (top of the body at y = 0). state 0 young and flat,
 *  1 swollen over the seeds, 2 dry: shrunk between the seeds, papery wrinkles. */
function valvePoint(S, u, phi, side, state, out) {
  const b = S.bump(u), sp = Math.pow(Math.sin(phi), 0.6);
  let t = 0.17, wk = 1;
  if (state === 1) { t = 0.3 + 0.24 * b; wk = 1 + 0.06 * b; }
  if (state === 2) { t = 0.21 + 0.28 * b ** 1.4 + 0.022 * Math.sin(u * 71 + phi * 5) * Math.sin(phi * 4 + u * 29); wk = 0.92 + 0.07 * b; }
  out.set(S.cx(u) - (POD.W / 2) * S.wp(u) * Math.cos(phi) * wk, -S.L * u, side * t * S.tp(u) * sp);
}
function valveGeometry(n, side) {
  return geoCache(`valve${n}:${side}`, () => {
    const S = podShape(n);
    const make = (st) => sheet(52, 12, (u, v, out) => valvePoint(S, u, v * Math.PI, side, st, out), side < 0);
    const base = make(0);
    // seams a shade darker, the ventral one most
    const c = new Float32Array(base.attributes.position.count * 3), uv = base.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const v = uv.getY(i), k = 1 - 0.13 * Math.exp(-((v / 0.07) ** 2)) - 0.18 * Math.exp(-(((1 - v) / 0.06) ** 2));
      c[i * 3] = k; c[i * 3 + 1] = k; c[i * 3 + 2] = k * 0.97;
    }
    base.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return addMorphs(base, [make(1), make(2)], true);
  });
}
/** Faint reticulate veins on the valve (u along the pod, v dorsal to ventral). */
function podTex() {
  return texCache('pod', () => {
    const W = 512, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, W, H);
    const R = seeded(9);
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      let x = R() * W, y = R() < 0.5 ? 0 : H;
      const dir = y === 0 ? 1 : -1;
      g.strokeStyle = `rgba(90,90,80,${0.1 + R() * 0.1})`; g.lineWidth = 0.8 + R() * 1.2;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (R() - 0.3) * 26; y += dir * (8 + R() * 14); g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.25})`; g.fillRect(R() * W, R() * H, 1.5, 1.5); }
    const t = canvasTex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}
const POD_C = {
  fresh: '#4b8233', dry: '#ad8d58', innerFresh: '#c4dba8', innerDry: '#d8cba8', calFresh: '#6a9750', calDry: '#9c8152',
};
const FUN_GEO = (() => { const g = new THREE.CylinderGeometry(0.028, 0.04, 1, 6); g.rotateZ(Math.PI / 2); g.userData.shared = true; return g; })();

/** A pea pod; see the file header for its frame. peas: 'Y' | 'y' per seed, 4 to 9. */
export function makePeaPod(mat, { peas = ['Y', 'Y', 'y', 'Y', 'Y', 'y'], seed = 1 } = {}) {
  const R = seeded(seed);
  const g = new THREE.Group();
  const root = new THREE.Group();          // hidden at growth 0, so the lead keeps group.visible
  g.add(root);
  const outer = live(mat.make.physical({ color: toLinear(POD_C.fresh), vertexColors: true, bumpMap: podTex(), bumpScale: 0.4, roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.5 }));
  const inner = live(mat.make.physical({ color: toLinear(POD_C.innerFresh), roughness: 0.6, sheen: 0.3, sheenColor: lc('#ffffff'), side: THREE.BackSide }));
  const cal = live(mat.make.physical({ color: toLinear(POD_C.calFresh), roughness: 0.6, side: THREE.DoubleSide }));
  const peaMat = matCache(mat, 'podpea', () => mat.make.physical({ color: 0xffffff, map: peaTex(), roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.45 }));
  const funMat = matCache(mat, 'funiculus', () => mat.make.standard({ color: toLinear('#c9dca2'), roughness: 0.6 }));

  root.add(mesh(geoCache('podPedicel', () => new THREE.TubeGeometry(curve([[0, 0, 0], [0, -0.22, 0.02], [0, -0.47, 0]]), 8, 0.04, 6)), cal));
  const calyx = mesh(calyxGeometry(), cal);
  calyx.position.copy(P0); calyx.rotation.x = Math.PI / 2; calyx.scale.setScalar(0.97);
  root.add(calyx);
  const body = new THREE.Group();
  body.position.y = POD.Y0;
  body.rotation.y = (R() - 0.5) * 0.3;
  root.add(body);

  let S = null, list = [], vis = [];
  const valves = [1, -1].map((side) => {
    const pivot = new THREE.Group();
    const out = mesh(new THREE.BufferGeometry(), outer), inn = mesh(new THREE.BufferGeometry(), inner, { cast: false });
    pivot.add(out, inn);
    body.add(pivot);
    return { side, pivot, out, inn, peas: null, fun: null, idx: [] };
  });
  const beak = mesh(geoCache('beak', () => tint(new THREE.TubeGeometry(curve([[0, 0, 0], [0.04, -0.16, 0], [0.12, -0.3, 0]]), 6, 0.025, 5), '#ffffff')), outer);
  valves[0].pivot.add(beak);

  const st = { g: 1, d: 0, o: 0 };
  const axis = V3(), H = V3(), tmp = V3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qPea = new THREE.Quaternion().setFromAxisAngle(AX, Math.PI / 2);
  const cFresh = lc(PEA_COLORS.fresh), cY = lc(PEA_COLORS.yellow), cG = lc(PEA_COLORS.green), cc = new THREE.Color();
  const peaAt = (i, out) => out.set(S.cx(S.us[i]) + 0.07, -S.L * S.us[i], (i % 2 ? -1 : 1) * 0.06);
  const spin = [];

  function build(next) {
    list = next.slice(0, 9);
    vis = list.map(() => true);
    S = podShape(Math.max(1, list.length));
    S.dorsal(0.5, H);
    axis.copy(S.dorsal(0.85)).sub(S.dorsal(0.15)).normalize();
    spin.length = 0;
    list.forEach(() => spin.push(R() * Math.PI * 2));
    valves.forEach((v) => {
      v.out.geometry = valveGeometry(S.n, v.side);
      v.inn.geometry = v.out.geometry;
      v.out.updateMorphTargets(); v.inn.updateMorphTargets();
      [v.out, v.inn].forEach((m) => m.position.copy(H).negate());
      v.pivot.position.copy(H);
      if (v.peas) { v.pivot.remove(v.peas, v.fun); v.peas.dispose(); v.fun.dispose(); }
      v.idx = list.map((_, i) => i).filter((i) => (i % 2 ? -1 : 1) === v.side);
      v.peas = new THREE.InstancedMesh(peaGeometry(seed), peaMat, Math.max(1, v.idx.length));
      v.fun = new THREE.InstancedMesh(FUN_GEO, funMat, Math.max(1, v.idx.length));
      v.peas.count = v.fun.count = v.idx.length;
      v.peas.castShadow = true;
      v.pivot.add(v.peas, v.fun);
    });
    S.ventral(1, tmp);
    beak.position.copy(tmp).sub(H);
    beak.position.x = S.cx(1) - H.x;
    pose();
  }

  function pose() {
    const { g: gr, d, o } = st;
    root.visible = gr > 0.001;
    const by = lerp(0.14, 1, ss(0, 0.75, gr)), bxz = lerp(0.22, 1, ss(0, 0.6, gr));
    body.scale.set(bxz, by, bxz);
    const swell = ss(0.4, 1, gr), dk = ss(0.05, 0.9, d);
    const open = smooth(clamp(o)) * 1.2;
    valves.forEach((v) => {
      v.out.morphTargetInfluences[0] = v.inn.morphTargetInfluences[0] = swell;
      v.out.morphTargetInfluences[1] = v.inn.morphTargetInfluences[1] = dk * swell;
      v.pivot.quaternion.setFromAxisAngle(axis, v.side * open);
      v.inn.visible = v.peas.visible = v.fun.visible = o > 0.001;
    });
    paint(g, outer, (m) => {
      m.color.copy(lc(POD_C.fresh)).lerp(lc(POD_C.dry), dk);
      m.roughness = lerp(0.42, 0.85, dk); m.clearcoat = 0.3 * (1 - dk);
      m.bumpScale = lerp(0.4, 2.5, dk);
    });
    paint(g, inner, (m) => m.color.copy(lc(POD_C.innerFresh)).lerp(lc(POD_C.innerDry), dk));
    paint(g, cal, (m) => m.color.copy(lc(POD_C.calFresh)).lerp(lc(POD_C.calDry), ss(0.1, 0.8, d)));
    // seeds: green while filling; yellow ones turn as the pod dries
    const ripe = ss(0.5, 0.66, d), s = lerp(0.2, 1.07, ss(0.2, 1, gr)) * lerp(1, 0.94, ripe);
    valves.forEach((v) => v.idx.forEach((i, k) => {
      const show = vis[i] ? 1 : 0;
      peaAt(i, tmp).sub(H);
      q.setFromAxisAngle(AY, spin[i]).premultiply(qPea);
      m4.compose(tmp, q, V3(s / bxz, s / by, s / bxz).multiplyScalar(show));
      v.peas.setMatrixAt(k, m4);
      cc.copy(cFresh).lerp(list[i] === 'Y' ? cY : cG, ripe);
      v.peas.setColorAt(k, cc);
      const xv = S.ventral(S.us[i]).x - H.x, x0 = tmp.x + PEA_R * s * 0.8;
      const len = Math.max(0.02, xv - x0 - 0.03);
      m4.compose(V3(x0 + len / 2, tmp.y, tmp.z * 0.5), new THREE.Quaternion(), V3(len, 1 / by, 1 / bxz).multiplyScalar(show));
      v.fun.setMatrixAt(k, m4);
    }));
    valves.forEach((v) => {
      v.peas.instanceMatrix.needsUpdate = v.fun.instanceMatrix.needsUpdate = true;
      if (v.peas.instanceColor) v.peas.instanceColor.needsUpdate = true;
    });
    // anchors
    body.updateMatrix();
    const toG = (p, out) => out.copy(p).applyMatrix4(body.matrix);
    toG(S.ventral(0.5, tmp), anchors.seam);
    toG(tmp.set(S.cx(1) + 0.12, -S.L - 0.3, 0), anchors.tip);
  }

  const anchors = { stalk: V3(), tip: V3(), seam: V3() };
  const out = {
    group: g, anchors,
    get count() { return list.length; },
    setGrowth(v) { st.g = clamp(v); pose(); },
    setDry(v) { st.d = clamp(v); pose(); },
    setOpen(v) { st.o = clamp(v); pose(); },
    setPeas(next) { build(next); },
    setPeaVisible(i, on) { if (i >= 0 && i < vis.length) { vis[i] = !!on; pose(); } },
    /** Seed i's centre in the pod's own frame, as posed now. */
    peaLocal(i, target = V3()) {
      const v = valves[i % 2 ? 1 : 0];
      peaAt(i, target).sub(H);
      v.pivot.updateMatrix(); body.updateMatrix(); root.updateMatrix();
      return target.applyMatrix4(v.pivot.matrix).applyMatrix4(body.matrix).applyMatrix4(root.matrix);
    },
  };
  build(peas);
  return out;
}
