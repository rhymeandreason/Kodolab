/* Molecule scale: yeast catalase in water, and the H₂O₂ it splits. 1 unit = 1 Å.
 * A protein is real ångströms in a scene of its own (MolecularGeometry.md §1.5), so the small
 * molecules here are at true size beside it.
 *
 * The enzyme is 1A4E's tetramer (yeast catalase A, the lab's enzyme), baked as 1A4E-tetramer in
 * 1A4E's frame. Chain A is the subject: kit/ribbon.js over its CA trace and the file's own
 * secondary structure, its heme from the bake's pocket atoms. Chains B-D are its partners, drawn
 * whole in their registry hues on the first step, then ghosted. The azide on each iron is the
 * crystal's inhibitor and is not drawn; chain A's N1 marks the distal side, where H₂O₂ binds.
 * catalase-lab.html loads palette.js, ribbon.js and proteins/proteins.js as classic scripts;
 * MolPalette, RibbonLib and ProteinLib are read by their global names.
 *
 * What the state drives:
 *   whole = step 'yeast' or 'boil'                 the four chains in their hues, or chain A alone
 *   fold = boiled ? 1 : step 'boil' ? heat : 0   partners drift off by SPLIT, then chain A unfolds
 *   conc → how many H₂O₂ drift in the water      rate → how often a cycle starts at the iron
 * `time` only moves what carries no meaning: diffusion, tumbling, a cycle already under way.
 * fold is never eased: easing it back would draw a boiled enzyme refolding.
 */
import * as THREE from 'three';
import { LIGHT } from '../core/three-compat.js';
import { clamp, lerp, smooth } from '../core/math.js';
import { cueAt } from '../lesson.js';
import { T as TEXT, fmt } from '../text.js';

const PAL = globalThis.MolPalette;
const DATA = new URL('../../proteins/catalase/data/catalase-1A4E-tetramer.json', import.meta.url);
const HUE = globalThis.ProteinLib.byKey('catalase').draw.byStrand;

/* Catalase's turnover number, kcat = 4 × 10⁷ s⁻¹ (Lehninger, Table 6-7). One cycle here takes
   CYCLE seconds and splits two H₂O₂, so the caption's slow-down is read off these two. */
const KCAT = 4e7;
const CYCLE = 6;
/* Heat first parts the subunits (fold 0..SPLIT, each pushed APART Å from the tetramer's centre),
   then chain A unfolds over the rest. Drawn in that order so each change reads on its own; in the
   tube they overlap, and the free chains clump. */
const SPLIT = 0.3, APART = 30;

/* Bondi van der Waals radii, drawn at VDW_K so the atoms of one molecule stay separate lumps. */
const VDW = { O: 1.52, H: 1.20 };
const VDW_K = 0.8;
/* Gas-phase geometries (Å, degrees); FeO is Compound I's ferryl bond, dock the peroxide O on Fe. */
const GEO = { OO: 1.475, OH: 0.950, HOO: 94.8, dihedral: 111.5, wOH: 0.958, HOH: 104.5, O2: 1.208, FeO: 1.65, dock: 2.0 };
/* Schematic counts: at 3 % H₂O₂ there are ~60 waters per peroxide and ~2000 peroxides in this
   box. Water is thinned out most, so the peroxide reads. */
const NH2O2 = 48, PER_PCT = 12, NWAT = 30, NPO2 = 8, NPW = 16, LIFE = 6;

const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const DEG = Math.PI / 180;
const ramp = (x, a, b) => smooth(clamp((x - a) / (b - a)));
const foldOf = (t) => (t.boiled ? 1 : t.step === 'boil' ? clamp(t.heat || 0) : 0);
const unfoldOf = (fold) => clamp((fold - SPLIT) / (1 - SPLIT));
const wholeOf = (t) => t.step === 'yeast' || t.step === 'boil';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randDir = (R) => { const z = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - z * z); return V(r * Math.cos(a), z, r * Math.sin(a)); };

/* Local frames. Peroxide: O–O along y, Oa at -y. Water: O at the origin, both H toward +y. */
function peroxideLocal() {
  const h = GEO.OO / 2, a = GEO.HOO * DEG, d = GEO.dihedral * DEG;
  const Oa = V(0, -h, 0), Ob = V(0, h, 0);
  const Ha = Oa.clone().addScaledVector(V(Math.sin(a), Math.cos(a), 0), GEO.OH);
  const Hb = Ob.clone().addScaledVector(V(Math.sin(a) * Math.cos(d), -Math.cos(a), Math.sin(a) * Math.sin(d)), GEO.OH);
  return [Oa, Ob, Ha, Hb];
}
function waterLocal() {
  const a = GEO.HOH * DEG / 2;
  return [V(), V(Math.sin(a), Math.cos(a), 0).multiplyScalar(GEO.wOH), V(-Math.sin(a), Math.cos(a), 0).multiplyScalar(GEO.wOH)];
}
const PER = peroxideLocal(), WAT = waterLocal(), OXY = [V(0, -GEO.O2 / 2, 0), V(0, GEO.O2 / 2, 0)];
{
  const [Oa, Ob, Ha, Hb] = PER;
  const ang = (o, h, other) => h.clone().sub(o).angleTo(other.clone().sub(o)) / DEG;
  console.assert(Math.abs(Ha.distanceTo(Oa) - GEO.OH) < 1e-6 && Math.abs(Hb.distanceTo(Ob) - GEO.OH) < 1e-6
    && Math.abs(ang(Oa, Ha, Ob) - GEO.HOO) < 0.01 && Math.abs(ang(Ob, Hb, Oa) - GEO.HOO) < 0.01, 'catalase: H₂O₂ geometry');
}

function mergeColored(parts) {
  const pos = [], nor = [], col = [];
  for (const { geo, color } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position.array, n = g.attributes.normal.array, c = C(color);
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const spaceFill = (local, els, seg = 12) => mergeColored(local.map((p, i) =>
  ({ geo: new THREE.SphereGeometry(VDW[els[i]] * VDW_K, seg, Math.round(seg * 0.75)).translate(p.x, p.y, p.z), color: PAL.atoms[els[i]] })));
const stick = (a, b, r) => {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 8, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
};
const elOf = (el) => (el.length > 1 ? el[0] + el.slice(1).toLowerCase() : el);

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

  const R = rng(1701);
  const tmp = V(), tmp2 = V(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), one = V(1, 1, 1);
  const qI = new THREE.Quaternion();

  /* ---------- the frame: the iron at the origin, the channel running up and a little left ----------
     After the data lands, root turns the structure so the channel's line points along CH_UP and the
     bulk of the protein sits behind the iron as seen from +z. */
  const CH_UP = V(-0.3, 0.95, 0.1).normalize();
  const root = new THREE.Group();
  scene.add(root);
  const nW = CH_UP.clone();                                  // distal axis of the iron, world
  let CH = [], chT = CH_UP.clone(), chLen = 27;              // channel samples, dock end first
  const setChannel = (pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    CH = curve.getSpacedPoints(64);
    chT = curve.getTangentAt(1).normalize();
    chLen = curve.getLength();
  };
  setChannel([nW.clone().multiplyScalar(GEO.dock + GEO.OO / 2), nW.clone().multiplyScalar(30)]);
  function chanAt(s, out) {
    if (s >= 1) return out.copy(CH[CH.length - 1]).addScaledVector(chT, (s - 1) * chLen);
    const f = Math.max(0, s) * (CH.length - 1), i = Math.floor(f);
    return out.copy(CH[i]).lerp(CH[Math.min(i + 1, CH.length - 1)], f - i);
  }

  /* Docking poses, from nW. P1 docks O-first on the iron; P2 sits above Compound I's O with both
     H pointing down at it, so they can move across and make water. */
  const D = { q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), c1: V(), c2: V(), oxo: V() };
  const mL = PER[2].clone().sub(PER[0]).add(PER[3].clone().sub(PER[1])).setY(0).normalize();
  const hm = (PER[2].dot(mL) + PER[3].dot(mL)) / 2;
  function setDock() {
    const e1 = V().crossVectors(nW, Math.abs(nW.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0)).normalize();
    D.q1.setFromUnitVectors(Y, nW);
    const down = nW.clone().negate();
    const Lm = new THREE.Matrix4().makeBasis(Y, mL, V().crossVectors(Y, mL));
    const Wm = new THREE.Matrix4().makeBasis(e1, down, V().crossVectors(e1, down));
    D.q2.setFromRotationMatrix(Wm.multiply(Lm.transpose()));
    D.c1.copy(nW).multiplyScalar(GEO.dock + GEO.OO / 2);
    D.oxo.copy(nW).multiplyScalar(GEO.FeO);
    D.c2.copy(nW).multiplyScalar(GEO.FeO + 1.9 + hm);
  }
  setDock();

  /* ---------- the subunit: a stand-in until 1A4E lands, then the ribbon ---------- */
  const protGroup = new THREE.Group();
  root.add(protGroup);
  const placeholder = new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16),
    new THREE.MeshStandardMaterial({ color: C(PAL.ss.C), roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false }));
  protGroup.add(placeholder);
  /* Translucent, so the heme and the traffic inside read; no depth write, or the near wall
     would hide the far one (kit/proteinbox.js's setGhost). Groups 0/1/2 are coil/helix/strand. */
  const ghostMat = (hex) => new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.55, transparent: true, opacity: 0.6, depthWrite: false });
  const ribMats = ['C', 'H', 'E'].map((k) => ghostMat(PAL.ss[k]));
  const hueA = ghostMat(HUE.A);
  let ribbon = null, ribbonHue = null, ribOp = 0.6, whole = 1, nSub = 4;
  /* Chains B-D: one group each, so the boil can push it off; ribbon and heme share its fade. */
  const partners = new THREE.Group();
  root.add(partners);
  const parts = [];       // { group, rib, heme, out }

  const hemeGroup = new THREE.Group();
  root.add(hemeGroup);
  const feMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshStandardMaterial({ color: C(PAL.atoms.Fe), roughness: 0.35, metalness: 0.35 }));
  feMesh.visible = false;
  hemeGroup.add(feMesh);
  const hemeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });

  const wormGroup = new THREE.Group();
  wormGroup.visible = false;
  root.add(wormGroup);
  const wormMat = new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: true, opacity: 0 });
  let worm = null;     // { balls, sticks, native, coil, cur, ssCol, n }

  const P = { ready: false, fe: V(), drift: V(), driftAxis: V(1, 0, 0), anchorIdx: 0 };

  function build(j) {
    const ch = j.chains.A;
    const toV = (c) => c.CA.map((p) => V(p[0], p[1], p[2]));
    const CA = toV(ch);
    const n = CA.length;
    const others = j.order.filter((id) => id !== 'A');
    const caOf = Object.fromEntries(others.map((id) => [id, toV(j.chains[id])]));
    const allCA = CA.concat(...others.map((id) => caOf[id]));
    nSub = j.order.length;
    const atoms = j.pocket.atoms;
    const hemeOf = (id) => atoms.map((a, i) => (a.group === 'heme' && a.chain === id ? i : -1)).filter((i) => i >= 0);
    const hemeIdx = hemeOf('A');
    const feA = atoms.find((a) => a.group === 'heme' && a.chain === 'A' && elOf(a.el) === 'Fe');
    const fe = V(...feA.p);
    P.fe.copy(fe);

    /* Distal axis: toward the inhibitor's bound N, which sits where peroxide binds; failing that,
       the porphyrin's normal on the side away from the proximal Tyr. */
    let nD;
    const az = atoms.find((a) => a.group === 'inhibitor' && a.chain === 'A' && a.name === 'N1');
    if (az) nD = V(...az.p).sub(fe).normalize();
    else {
      const at = (nm) => V(...atoms.find((a) => a.group === 'heme' && a.chain === 'A' && a.name === nm).p);
      nD = V().crossVectors(at('NC').sub(at('NA')), at('ND').sub(at('NB'))).normalize();
      const tyr = atoms.find((a) => a.group === 'proximal' && a.name === 'OH');
      if (tyr && V(...tyr.p).sub(fe).dot(nD) > 0) nD.negate();
    }

    /* The channel, approximated: from just above the iron, step 2 Å at a time toward the most
       open point within a cone, biased outward, until clear of the protein. Clearance is to every
       chain's CA atoms (a neighbour's arm lines part of the way), so this is the most open route
       on the trace, not a computed tunnel. */
    const cen = V();
    CA.forEach((p) => cen.add(p));
    cen.divideScalar(n);
    const xyz = new Float32Array(allCA.length * 3);
    allCA.forEach((p, i) => { xyz[i * 3] = p.x; xyz[i * 3 + 1] = p.y; xyz[i * 3 + 2] = p.z; });
    const clearance = (q) => {
      let m = Infinity;
      for (let i = 0; i < xyz.length; i += 3) {
        const dx = xyz[i] - q.x, dy = xyz[i + 1] - q.y, dz = xyz[i + 2] - q.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < m) m = d2;
      }
      return Math.sqrt(m);
    };
    const dirs = [];
    for (let i = 0; i < 240; i++) {
      const z = 1 - (2 * (i + 0.5)) / 240, r = Math.sqrt(1 - z * z), a = i * 2.399963;
      dirs.push(V(r * Math.cos(a), z, r * Math.sin(a)));
    }
    const pts = [fe.clone().addScaledVector(nD, GEO.dock + GEO.OO / 2)];
    const p = fe.clone().addScaledVector(nD, GEO.dock + GEO.OO / 2 + 2), d = nD.clone(), q = V();
    pts.push(p.clone());
    for (let k = 0; k < 40 && clearance(p) < 10; k++) {
      let best = -Infinity, bu = null;
      const r0 = p.distanceTo(cen);
      for (const u of dirs) {
        if (u.dot(d) < 0.8 || (k < 4 && u.dot(nD) < 0.6)) continue;
        q.copy(p).addScaledVector(u, 2);
        const s = clearance(q) + 1.5 * (q.distanceTo(cen) - r0);
        if (s > best) { best = s; bu = u; }
      }
      if (!bu) break;
      p.addScaledVector(bu, 2);
      d.add(bu).normalize();
      pts.push(p.clone());
    }
    pts.push(p.clone().addScaledVector(d, 6));

    /* Turn the channel's line onto CH_UP, then roll about it so the protein's bulk lies behind the iron. */
    const cDir = pts[pts.length - 1].clone().sub(fe).normalize();
    const qR = new THREE.Quaternion().setFromUnitVectors(cDir, CH_UP);
    const g = cen.clone().sub(fe).applyQuaternion(qR).projectOnPlane(CH_UP);
    const want = V(0, 0, -1).projectOnPlane(CH_UP);
    if (g.lengthSq() > 1e-6) {
      g.normalize(); want.normalize();
      const ang = Math.atan2(CH_UP.dot(V().crossVectors(g, want)), g.dot(want));
      qR.premultiply(new THREE.Quaternion().setFromAxisAngle(CH_UP, ang));
    }
    root.quaternion.copy(qR);
    root.position.copy(fe).applyQuaternion(qR).negate();
    root.updateMatrixWorld(true);
    const toW = (v) => v.clone().sub(fe).applyQuaternion(qR);
    nW.copy(nD).applyQuaternion(qR);
    setChannel(pts.map(toW));
    setDock();

    /* Ribbon: one build over the whole chain (ribbon.js's header: never slice it per element). */
    const geoA = RibbonLib.build(THREE, CA, ch.ss.split(''), { sub: 4 });
    ribbon = new THREE.Mesh(geoA, ribMats);
    ribbonHue = new THREE.Mesh(geoA, hueA);     // one material: groups ignored, the whole chain in A's hue
    protGroup.remove(placeholder);
    protGroup.add(ribbon, ribbonHue);

    /* Heme, ball-and-stick in proteinbox's proportions, a little larger; the iron its own metal mesh. */
    const HB = 0.53, rOf = (el) => (PAL.radii[el] || PAL.radii.C) * HB, rFe = PAL.radii.C * HB * 2.7;
    const hemeGeo = (idx, origin, withFe) => {
      const local = (a) => V(...a.p).sub(origin), bits = [];
      for (const i of idx) {
        const a = atoms[i], el = elOf(a.el);
        if (el === 'Fe' && !withFe) continue;
        const v = local(a);
        bits.push({ geo: new THREE.SphereGeometry(el === 'Fe' ? rFe : rOf(el), 12, 9).translate(v.x, v.y, v.z), color: PAL.atoms[el] });
      }
      const inHeme = new Set(idx);
      for (const [i, k] of j.pocket.bonds) {
        if (!inHeme.has(i) || !inHeme.has(k)) continue;
        const a = local(atoms[i]), b = local(atoms[k]), mid = a.clone().add(b).multiplyScalar(0.5);
        bits.push({ geo: stick(a, mid, 0.2), color: PAL.atoms[elOf(atoms[i].el)] });
        bits.push({ geo: stick(mid, b, 0.2), color: PAL.atoms[elOf(atoms[k].el)] });
      }
      return mergeColored(bits);
    };
    hemeGroup.add(new THREE.Mesh(hemeGeo(hemeIdx, fe, false), hemeMat));

    /* The partners, each pushed out along the line from the tetramer's centre to its own, less
       chain A's push, so A holds still under the camera while the four come apart. */
    const mean = (pts) => pts.reduce((a, v) => a.add(v), V()).divideScalar(pts.length);
    const tc = mean(allCA), outA = cen.clone().sub(tc).normalize();
    for (const id of others) {
      const group = new THREE.Group();
      const rib = new THREE.Mesh(RibbonLib.build(THREE, caOf[id], j.chains[id].ss.split(''), { sub: 4 }), ghostMat(HUE[id]));
      const heme = new THREE.Mesh(hemeGeo(hemeOf(id), V(), true), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, transparent: true }));
      group.add(rib, heme);
      partners.add(group);
      parts.push({ group, rib, heme, out: mean(caOf[id]).sub(tc).normalize().sub(outA).multiplyScalar(APART) });
    }
    feMesh.scale.setScalar(rFe);
    feMesh.visible = true;
    hemeGroup.position.copy(fe);
    P.drift.copy(cDir).multiplyScalar(22).add(V().crossVectors(cDir, nD.clone().add(V(0.3, 0.1, 0))).normalize().multiplyScalar(8));
    P.driftAxis.copy(V().crossVectors(nD, cDir).add(V(0.2, 0.5, 0.1)).normalize());

    /* The unfolded chain. ILLUSTRATIVE, NOT A STRUCTURE: a seeded walk of 3.8 Å steps whose
       virtual bond angles are random, pulled loosely toward each residue's native place pushed
       35 % outward, so it reads as the same chain swollen and disordered. A real boiled protein
       has no one shape and mostly clumps with its neighbours. */
    const Rw = rng(4242), coil = [];
    let w = cen.clone().add(CA[0].clone().sub(cen).multiplyScalar(1.35)), dir = randDir(Rw);
    coil.push(w.clone());
    for (let i = 1; i < n; i++) {
      const perp = V().crossVectors(dir, randDir(Rw)).normalize();
      const turn = (35 + Rw() * 50) * DEG;
      const step = dir.clone().applyAxisAngle(perp, turn);
      const target = cen.clone().add(CA[i].clone().sub(cen).multiplyScalar(1.35));
      step.addScaledVector(target.sub(w).normalize(), 0.55).normalize();
      w = w.clone().addScaledVector(step, 3.8);
      coil.push(w);
      dir = step;
    }
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.85, 6, 5), wormMat, n);
    const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 6, 1), wormMat, n - 1);
    const ssCol = [...ch.ss].map((s) => C(PAL.ss[s] != null ? PAL.ss[s] : PAL.ss.C));
    for (let i = 0; i < n; i++) { balls.setColorAt(i, ssCol[i]); if (i < n - 1) sticks.setColorAt(i, ssCol[i]); }
    [balls, sticks].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); wormGroup.add(m); });
    worm = { balls, sticks, native: CA, coil, cur: CA.map((v) => v.clone()), ssCol, coilCol: C(PAL.ss.C), n, last: -1 };

    // a CA on the right-hand edge, for the subunit's label
    let bx = -Infinity;
    CA.forEach((v, i) => { const x = toW(v); if (x.x + 0.3 * x.y > bx) { bx = x.x + 0.3 * x.y; P.anchorIdx = i; } });

    // bulk molecules: off the chain, and out of the line between camera and iron
    const caW = allCA.map(toW);
    const clear = (v) => caW.every((c) => c.distanceToSquared(v) > 64);

    // the tetramer's label on its topmost CA; the first two steps' cameras frame all four
    P.top = caW.reduce((a, v) => (v.y > a.y ? v : a), caW[0]).clone();
    const tcW = toW(tc);
    const frame = (v, target, dist) => { const d = v.pos.clone().sub(v.target).normalize(); v.target.copy(target); v.pos.copy(target).addScaledVector(d, dist); };
    frame(views[0], tcW, 270);
    frame(views[1], tcW.clone().multiplyScalar(0.6), 290);
    bulkH2O2.forEach((b, i) => { if (i > 0) placeBulk(b.base, clear, 28); });
    bulkWat.forEach((b) => placeBulk(b.base, clear, 28));
    bulkH2O2[0].base.copy(chanAt(1.1, V())).add(V(9, -4, 5));
    P.ready = true;
  }

  fetch(DATA)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(build)
    .catch((e) => console.error('catalase molecule: could not load 1A4E', e));

  /* ---------- bulk water and peroxide ---------- */
  function placeBulk(out, ok = () => true, rMin = 46) {
    for (let tries = 0; tries < 60; tries++) {
      out.copy(randDir(R).multiplyScalar(rMin + R() * (84 - rMin)));
      if (out.z > 25 && Math.hypot(out.x, out.y) < 35) continue;
      if (ok(out)) return out;
    }
    return out;
  }
  const mkBulk = (k) => Array.from({ length: k }, () => ({ base: placeBulk(V()), ax: randDir(R), ph: R() * 6, f: 0.4 + R() * 0.5, q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)) }));
  const bulkH2O2 = mkBulk(NH2O2), bulkWat = mkBulk(NWAT);
  const molMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
  const geoPer = spaceFill(PER, ['O', 'O', 'H', 'H'], 8), geoWat = spaceFill(WAT, ['O', 'H', 'H'], 8), geoO2 = spaceFill(OXY, ['O', 'O'], 10);
  const instanced = (geo, k) => { const m = new THREE.InstancedMesh(geo, molMat, k); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
  const h2o2Mesh = instanced(geoPer, NH2O2), watMesh = instanced(geoWat, NWAT);
  const prodO2Mesh = instanced(geoO2, NPO2), prodWatMesh = instanced(geoWat, NPW);
  const bulkPos = (b, clock, out) => out.copy(b.base).add(tmp2.set(Math.sin(clock * b.f + b.ph), Math.cos(clock * b.f * 0.8 + b.ph * 1.3), Math.sin(clock * b.f * 0.6 + b.ph * 0.7)).multiplyScalar(3));
  let nShown = 0;

  /* ---------- products leaving the channel ---------- */
  const mkPool = (k) => Array.from({ length: k }, () => ({ alive: false, birth: 0, p0: V(), v: V(), q0: new THREE.Quaternion(), ax: V(1, 0, 0), cur: V() }));
  const poolO2 = mkPool(NPO2), poolW = mkPool(NPW);
  let lastO2 = null, lastW = null, clock = 0;
  function spawn(pool, c, q) {
    let it = pool[0];
    for (const p of pool) { if (!p.alive) { it = p; break; } if (p.birth < it.birth) it = p; }
    it.alive = true; it.birth = clock; it.p0.copy(c); it.cur.copy(c); it.q0.copy(q);
    it.v.copy(chT).add(randDir(R).multiplyScalar(0.8)).normalize().multiplyScalar(5);
    it.ax.copy(randDir(R));
    return it;
  }
  function posePool(pool, mesh) {
    pool.forEach((p, i) => {
      const age = clock - p.birth;
      if (!p.alive || age > LIFE) { p.alive = false; mesh.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); return; }
      p.cur.copy(p.p0).addScaledVector(p.v, 2.5 * (1 - Math.exp(-age / 2.5)));
      p.cur.y += Math.sin(clock * 0.9 + i) * 0.6 * Math.min(1, age);
      tmpQ.setFromAxisAngle(p.ax, age * 0.9).multiply(p.q0);
      mesh.setMatrixAt(i, tmpM.compose(p.cur, tmpQ, tmp.setScalar(1 - ramp(age, LIFE - 1.2, LIFE))));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- one catalytic cycle at the iron ----------
     Atoms 0-3 are the first H₂O₂ (Oa, Ob, Ha, Hb), 4-7 the second. The first leaves Oa on the iron
     (Compound I) and goes as water, Ob with both H. The second gives its two H to that O, which
     leaves as water; its own two O leave together as O₂, their bond never broken. */
  const EL = ['O', 'O', 'H', 'H', 'O', 'O', 'H', 'H'];
  const evGroup = new THREE.Group();
  scene.add(evGroup);
  const atomMat = { O: new THREE.MeshStandardMaterial({ color: C(PAL.atoms.O), roughness: 0.4 }), H: new THREE.MeshStandardMaterial({ color: C(PAL.atoms.H), roughness: 0.4 }) };
  const atomGeo = { O: new THREE.SphereGeometry(VDW.O * VDW_K, 14, 10), H: new THREE.SphereGeometry(VDW.H * VDW_K, 12, 9) };
  const ev = EL.map((el) => { const m = new THREE.Mesh(atomGeo[el], atomMat[el]); m.visible = false; evGroup.add(m); return m; });
  const flashMat = new THREE.MeshBasicMaterial({ color: C(PAL.atoms.O), transparent: true, opacity: 0, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 40), flashMat);
  flash.visible = false;
  scene.add(flash);
  const E = { on: false, u: 0, idle: 1e9, w1: false, done: false, ax1: V(1, 0, 0), ax2: V(0, 1, 0), oxo: false };
  const at = ev.map(() => V());
  const vis = ev.map(() => 0);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), cA = V(), cB = V();

  function placeRigid(idx, local, c, q, s) {
    idx.forEach((k, i) => { at[k].copy(local[i]).applyQuaternion(q).add(c); vis[k] = s; });
  }
  // in from the water, down the channel, onto a docking pose: k is 0..1 of the trip
  function approach(k, dockC, dockQ, ax, out, outQ) {
    const s = 1.35 * (1 - k), b = ramp(k, 0.7, 1);
    chanAt(s, out).lerp(dockC, b);
    outQ.setFromAxisAngle(ax, clock * 1.4).slerp(dockQ, b);
  }
  // rigid exit from a start centre up the channel and out
  function exit(k, startC, out) {
    chanAt(1.15 * k, out).add(tmp.copy(startC).sub(chanAt(0, tmp2)).multiplyScalar(1 - ramp(k, 0, 0.35)));
  }
  const wPos = (o, k) => tmp.copy(WAT[k]).applyQuaternion(D.q1).add(o);

  function poseEvent(u) {
    vis.fill(0);
    E.oxo = u >= 0.28 && u < 0.7;
    // first H₂O₂: in, then split
    if (u < 0.22) {
      approach(ramp(u, 0, 0.22), D.c1, D.q1, E.ax1, cA, qa);
      placeRigid([0, 1, 2, 3], PER, cA, qa, smooth(clamp(u / 0.03)));
    } else if (u < 0.30) {
      const k = ramp(u, 0.22, 0.30);
      placeRigid([0, 1, 2, 3], PER, D.c1, D.q1, 1);
      const ob = cA.copy(at[1]).addScaledVector(nW, 0.3 * k);
      at[0].lerp(D.oxo, k);
      at[2].lerp(wPos(ob, 1), k);
      at[3].lerp(wPos(ob, 2), k);
      at[1].copy(ob);
    } else {
      at[0].copy(D.oxo); vis[0] = 1;
      if (u < 0.48) {
        const ob0 = cB.copy(D.c1).addScaledVector(nW, GEO.OO / 2 + 0.3);
        exit(ramp(u, 0.30, 0.48), ob0, cA);
        placeRigid([1, 2, 3], WAT, cA, qa.setFromAxisAngle(nW, ramp(u, 0.30, 0.48) * 2).multiply(D.q1), 1);
      }
    }
    // second H₂O₂: in, hand over two H, leave as O₂
    if (u >= 0.46 && u < 0.66) {
      approach(ramp(u, 0.46, 0.66), D.c2, D.q2, E.ax2, cA, qa);
      placeRigid([4, 5, 6, 7], PER, cA, qa, smooth(clamp((u - 0.46) / 0.03)));
    } else if (u >= 0.66 && u < 0.74) {
      const k = ramp(u, 0.66, 0.74);
      placeRigid([4, 5, 6, 7], PER, D.c2, D.q2, 1);
      const sc = 1 + (GEO.O2 / GEO.OO - 1) * k;
      [4, 5].forEach((i) => at[i].sub(D.c2).multiplyScalar(sc).add(D.c2));
      at[6].lerp(wPos(D.oxo, 1), k);
      at[7].lerp(wPos(D.oxo, 2), k);
    } else if (u >= 0.74 && u < 0.94) {
      exit(ramp(u, 0.74, 0.90), D.c2, cA);
      qa.setFromAxisAngle(E.ax2, ramp(u, 0.74, 0.94) * 3).multiply(D.q2);
      placeRigid([4, 5], OXY, cA, qa, 1);
      exit(ramp(u, 0.77, 0.94), D.oxo, cB);
      qb.setFromAxisAngle(nW, ramp(u, 0.74, 0.94) * 2).multiply(D.q1);
      placeRigid([0, 6, 7], WAT, cB, qb, 1);
    }
    if (u >= 0.94) vis.fill(0);
    ev.forEach((m, i) => { m.visible = vis[i] > 0.001; m.position.copy(at[i]); m.scale.setScalar(vis[i]); });
    // bond events: the O–O break, then the H hand-over
    const fk = u >= 0.25 && u < 0.33 ? (u - 0.25) / 0.08 : u >= 0.69 && u < 0.77 ? (u - 0.69) / 0.08 : -1;
    flash.visible = fk >= 0;
    if (fk >= 0) {
      flash.position.copy(u < 0.5 ? D.c1 : D.oxo);
      flash.quaternion.copy(D.q1).multiply(tmpQ.setFromAxisAngle(V(1, 0, 0), Math.PI / 2));
      flash.scale.setScalar(1.5 + 5 * fk);
      flashMat.opacity = 0.7 * (1 - fk);
    }
  }
  function stopEvent() {
    E.on = false; E.oxo = false; E.idle = 1e9;
    ev.forEach((m) => { m.visible = false; });
    flash.visible = false;
  }

  /* ---------- the fold ---------- */
  let shownFold = -1;
  function poseParts(fold) {
    const sep = ramp(fold, 0, SPLIT), op = lerp(0.12, ribOp, whole) * (1 - sep);
    partners.visible = op > 0.005;
    for (const q of parts) {
      q.group.position.copy(q.out).multiplyScalar(sep);
      q.rib.material.opacity = op;
      q.heme.material.opacity = Math.min(1, op * 1.6);
      q.heme.material.depthWrite = op > 0.5;
    }
  }
  function poseFold(raw) {
    if (!P.ready) return;
    poseParts(raw);
    const fold = unfoldOf(raw);
    ribbon.visible = ribbonHue.visible = fold < 0.18;
    const fade = ribOp * (1 - ramp(fold, 0, 0.18));
    ribMats.forEach((m) => { m.opacity = fade * (1 - whole); });
    hueA.opacity = fade * whole;
    wormGroup.visible = fold > 0.001;
    const h = ramp(fold, 0.35, 1);
    hemeGroup.position.copy(P.fe).addScaledVector(P.drift, h);
    hemeGroup.quaternion.setFromAxisAngle(P.driftAxis, h * 1.4);
    if (!wormGroup.visible) { shownFold = fold; return; }
    const op = ramp(fold, 0, 0.18);
    wormMat.opacity = op;
    wormMat.transparent = op < 0.99;
    wormMat.depthWrite = !wormMat.transparent;
    const m = ramp(fold, 0.12, 1);
    if (fold === shownFold && m < 0.02) return;
    const W = worm, wig = 0.45 * m;
    for (let i = 0; i < W.n; i++) {
      W.cur[i].lerpVectors(W.native[i], W.coil[i], m);
      if (wig) W.cur[i].add(tmp.set(Math.sin(clock * 0.9 + i * 0.7), Math.sin(clock * 1.1 + i * 1.3), Math.sin(clock * 0.8 + i * 0.4)).multiplyScalar(wig));
      W.balls.setMatrixAt(i, tmpM.compose(W.cur[i], qI, one));
    }
    for (let i = 0; i < W.n - 1; i++) {
      const a = W.cur[i], b = W.cur[i + 1];
      tmp.subVectors(b, a);
      const len = tmp.length();
      tmpQ.setFromUnitVectors(Y, tmp.divideScalar(len || 1));
      W.sticks.setMatrixAt(i, tmpM.compose(tmp2.addVectors(a, b).multiplyScalar(0.5), tmpQ, tmp.set(1, len, 1)));
    }
    W.balls.instanceMatrix.needsUpdate = W.sticks.instanceMatrix.needsUpdate = true;
    if (fold !== shownFold) {
      const k = ramp(fold, 0.12, 0.6), col = new THREE.Color();
      for (let i = 0; i < W.n; i++) {
        col.copy(W.ssCol[i]).lerp(W.coilCol, k);
        W.balls.setColorAt(i, col);
        if (i < W.n - 1) W.sticks.setColorAt(i, col);
      }
      W.balls.instanceColor.needsUpdate = W.sticks.instanceColor.needsUpdate = true;
    }
    shownFold = fold;
  }

  /* ---------- update ---------- */
  let lastTime = null;
  function update(t, time) {
    t = t || {};
    const dt = lastTime == null ? 0 : clamp(time - lastTime, 0, 0.1);
    lastTime = time;
    clock += dt;
    const fold = foldOf(t);
    const close = t.step === 'disks' || t.step === 'read';
    ribOp += ((close ? 0.4 : 0.6) - ribOp) * Math.min(1, dt * 2);
    whole += ((wholeOf(t) ? 1 : 0) - whole) * Math.min(1, dt * 2);
    poseFold(fold);

    // peroxide in the water, in number ∝ concentration
    const liquid = !!t.inLiquid && (t.conc || 0) > 0;
    const target = liquid ? clamp(Math.max(1, Math.round(t.conc * PER_PCT)), 0, NH2O2) : 0;
    nShown += (target - nShown) * Math.min(1, dt * 2.5);
    bulkH2O2.forEach((b, i) => {
      const s = clamp(nShown - i);
      tmpQ.setFromAxisAngle(b.ax, clock * b.f).multiply(b.q0);
      h2o2Mesh.setMatrixAt(i, tmpM.compose(bulkPos(b, clock, tmp), tmpQ, tmp2.setScalar(s)));
    });
    h2o2Mesh.instanceMatrix.needsUpdate = true;
    bulkWat.forEach((b, i) => {
      tmpQ.setFromAxisAngle(b.ax, clock * b.f).multiply(b.q0);
      watMesh.setMatrixAt(i, tmpM.compose(bulkPos(b, clock, tmp), tmpQ, one));
    });
    watMesh.instanceMatrix.needsUpdate = true;

    // cycles at the iron: a new one starts when the enzyme has idled 1/rate − 1 cycles' worth
    const rate = clamp(t.rate || 0);
    const can = liquid && fold < 0.15;
    if (!can) { if (E.on || flash.visible) stopEvent(); }
    else if (E.on) {
      E.u += dt / CYCLE;
      if (!E.w1 && E.u >= 0.48) { E.w1 = true; lastW = spawn(poolW, at[1], tmpQ.setFromAxisAngle(nW, 2).multiply(D.q1)); }
      if (!E.done && E.u >= 0.94) {
        E.done = true;
        lastO2 = spawn(poolO2, cA.copy(at[4]).add(at[5]).multiplyScalar(0.5), qa);
        lastW = spawn(poolW, at[0], qb);
      }
      if (E.u >= 1) { E.on = false; E.idle = 0; }
    } else {
      E.idle += dt;
      if (rate > 0 && E.idle >= CYCLE * (1 / rate - 1)) {
        E.on = true; E.u = 0; E.w1 = false; E.done = false;
        E.ax1.copy(randDir(R)); E.ax2.copy(randDir(R));
      }
    }
    if (E.on) poseEvent(E.u);
    else { ev.forEach((m) => { m.visible = false; }); flash.visible = false; E.oxo = false; }
    posePool(poolO2, prodO2Mesh);
    posePool(poolW, prodWatMesh);
  }

  /* ---------- labels, interactives, views, cues ---------- */
  const wp = (obj) => obj.getWorldPosition(V());
  const instAt = (mesh, i) => { mesh.getMatrixAt(i, tmpM); return V().setFromMatrixPosition(tmpM); };
  const o2Now = () => (lastO2 && lastO2.alive) || (E.on && E.u >= 0.66 && E.u < 0.94);
  const L = TX.labels;
  const labels = [
    { key: 'tetramer', text: L.tetramer.text, sub: () => fmt(L.tetramer.sub, { n: nSub }),
      anchor: () => (P.ready ? root.localToWorld(P.top.clone()) : V(0, 40, 0)), show: (t) => wholeOf(t) && foldOf(t) < SPLIT / 2 },
    { key: 'subunit', text: L.subunit.text, sub: () => fmt(L.subunit.sub, { n: nSub }),
      anchor: () => (P.ready ? root.localToWorld((wormGroup.visible ? worm.cur : worm.native)[P.anchorIdx].clone()) : V(30, 0, 0)),
      show: (t) => foldOf(t) < 0.5 && !(t.step === 'yeast') },
    { key: 'channel', ...L.channel, anchor: () => chanAt(0.85, V()), show: (t) => foldOf(t) < 0.18 },
    { key: 'iron', text: L.iron.text, sub: () => (E.oxo ? L.iron.oxo : L.iron.sub), anchor: () => wp(feMesh), show: (t) => foldOf(t) < 0.5 },
    { key: 'h2o2', ...L.h2o2, anchor: () => instAt(h2o2Mesh, 0), show: (t) => !!t.inLiquid && t.conc > 0 },
    { key: 'o2', ...L.o2, anchor: () => (lastO2 && lastO2.alive ? lastO2.cur.clone() : at[4].clone().add(at[5]).multiplyScalar(0.5)),
      show: (t) => foldOf(t) < 0.5 && t.rate > 0 && o2Now() },
    { key: 'water', ...L.water, anchor: () => (lastW && lastW.alive ? lastW.cur.clone() : instAt(watMesh, 0)),
      show: (t) => foldOf(t) < 0.5 && (!(t.inLiquid && t.conc > 0) || t.rate > 0) },
    { key: 'unfolded', ...L.unfolded, anchor: () => (P.ready ? root.localToWorld(worm.cur[Math.floor(worm.n * 0.45)].clone()) : V()), show: (t) => foldOf(t) > 0.5 },
  ];

  const I = TX.info;
  const interactives = [
    { root: protGroup, priority: 1, info: () => ({ title: I.subunit.title, text: fmt(I.subunit.text, { n: nSub }) }) },
    { root: partners, priority: 1, info: () => ({ title: I.subunit.title, text: fmt(I.subunit.text, { n: nSub }) }) },
    { root: wormGroup, priority: 1, info: () => I.unfolded },
    { root: hemeGroup, priority: 3, info: () => I.heme },
    { root: evGroup, priority: 3, info: () => I.reaction },
    { root: h2o2Mesh, priority: 2, info: () => I.h2o2 },
    { root: prodO2Mesh, priority: 2, info: () => I.o2 },
    { root: prodWatMesh, priority: 2, info: () => I.water },
    { root: watMesh, priority: 1, info: () => I.water },
  ];

  // steps: yeast, boil, disks, boiled, read, complete. The iron is the origin; the channel runs up.
  const views = [
    { pos: V(38, 22, 140), target: V(0, 6, 0) },
    { pos: V(-40, 30, 165), target: V(0, 2, 0) },
    { pos: V(24, 32, 88), target: V(-5, 16, 0) },
    { pos: V(30, 28, 170), target: V(0, 4, 0) },
    { pos: V(32, 30, 105), target: V(-4, 12, 0) },
    { pos: V(42, 26, 145), target: V(0, 6, 0) },
  ];

  const CU = TX.cues;
  const slowNote = fmt(CU.slow, { slow: Math.round((KCAT * CYCLE) / 2 / 1e6), kcat: Math.round(KCAT / 1e6) });
  const HEAT = [[0, { text: CU.heat, mark: 'subunit' }], [SPLIT + 0.3 * (1 - SPLIT), { text: CU.unfold, mark: 'unfolded' }]];
  function cue(t) {
    if (!t) return null;
    const f = foldOf(t);
    switch (t.step) {
      case 'yeast': return { text: fmt(CU.yeast, { n: nSub }), mark: 'tetramer' };
      case 'boil': return cueAt(HEAT, t.heat || 0);
      case 'disks':
        if (t.inLiquid && t.conc > 0) return { text: CU.react, note: slowNote, mark: 'iron' };
        return t.inLiquid ? { text: CU.noPeroxide, mark: 'water' } : { text: CU.waiting, mark: 'channel' };
      case 'boiled':
        if (f > 0.5) return t.inLiquid ? { text: CU.boiled, mark: 'unfolded' } : { text: CU.unfolded, mark: 'unfolded' };
        return { text: CU.waiting, mark: 'channel' };
      case 'read': return { text: CU.read, mark: 'iron' };
      case null: return { text: CU.complete, mark: 'iron' };
      default: return null;
    }
  }

  return { scene, update, labels, interactives, views, cue, fov: 38, near: 0.5, far: 2000, minDist: 15, maxDist: 420 };
}
