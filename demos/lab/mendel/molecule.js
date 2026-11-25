/* Molecule scale: inside the focal pea's cotyledon as it matures. 1 unit = 1 Å, real coordinates
 * (MolecularGeometry.md §1.5): one LHCII trimer on a patch of thylakoid membrane, with its
 * chlorophylls and carotenoids where the structure puts them, and SGR taking chlorophyll apart.
 *
 * LHCII is from 5XNL, the PSII–LHCII supercomplex of pea (Pisum sativum), as baked by
 * proteins/photosystems/tools/prep.js in OPM's membrane frame. Which chains form the trimer is read:
 * antenna chains whose centroids sit within TRIMER Å of each other, three of one name (the minor
 * antennas are monomers and fall out). The cofactor bake carries class per atom but no residue
 * name, so each pigment is a bonded component, owned by the chain nearest its centroid, and
 * chlorophyll b is told from a by its formyl group: a terminal O on a carbon with one other heavy
 * neighbour (Chl a has five O and no such group, Chl b six). Lutein is the carotenoid with two O.
 *
 * SGR (STAY-GREEN, Mendel's I gene) is the Mg-dechelatase (Shimoda, Ito & Tanaka 2016): it takes
 * Mg²⁺ out of chlorophyll a, leaving pheophytin a. No structure of it exists, so it is drawn as a
 * blob of about a 25–30 kDa protein's size and makes no claim about shape. How it reaches a buried
 * chlorophyll is not known either: the Mg²⁺'s straight route up into the blob is schematic.
 * Chlorophyll b is never its substrate: other enzymes, which SGR gathers on LHCII (Sakuraba et al.
 * 2012), turn b into a first, drawn as the formyl O going and the carbons taking a's green.
 *
 * What the state drives (everything is a function of t.seed and t.mature, so it scrubs):
 *   working SGR copies = PER_ALLELE × (Y alleles); y-allele copies sit by, inactive
 *   each working copy runs one pigment every EV of mature from START, the same speed in every
 *   genotype, so Yy (half the enzyme) takes twice as long as YY and still ends by mature ≈ 0.93
 * `time` only spins the blobs and bobs the inactive ones. palette.js and ribbon.js are classic
 * scripts on the page; MolPalette and RibbonLib are read by their global names.
 */
import * as THREE from 'three';
import { LIGHT } from '../core/three-compat.js';
import { clamp, smooth } from '../core/math.js';
import { T as TEXT, fmt } from '../text.js';
import { ALLELE_COLORS } from './cell.js';

const PAL = globalThis.MolPalette;
const DATA = new URL('../../proteins/photosystems/data/photosystems-5XNL.json', import.meta.url);
const COF = new URL('../../proteins/photosystems/data/photosystems-5XNL-cofactors.json', import.meta.url);

const TRIMER = 38;             // Å between the centroids of two subunits of one LHCII trimer (5XNL: ~34)
const SCALE = 1.9;             // lib/molecules.js's display scale: deposited atoms take PAL.radii / SCALE
const BALL = 0.85, MG_BALL = 3.2, STICK = 0.36;   // proteinbox.js's pocket proportions, balls a little fuller
const HEAD = 7.5, TAIL = 0.55;  // Å from the Mg that counts as the ring; the phytol tail beyond is drawn TAIL as thick
const CAR_W = 1.25;            // carotenoids a little fuller: they are what is left to see at the end
const SGR_R = 20;              // Å; Erickson's minimum radius for a ~30 kDa globular protein is ~2.0 nm
const PER_ALLELE = 1;          // SGR copies drawn per allele
const START = 0.45, END_ONE = 0.88, LEAVE = 0.05, FREE = 0.05;   // in mature: first pigment, one copy's last, a pigment's exit, an ion's
const ARRIVE = [0.36, 0.44];    // SGR (working or not) is made as the seed starts to dry
const SEEN = ARRIVE[1] - 0.02;  // from here SGR's labels and cues show
const PATCH = 80, HEAD_GAP = 8.5, HEAD_R = 2.1;   // membrane patch radius, lipid spacing (~65 Å² a lipid)

const C = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
const ramp = (x, a, b) => smooth(clamp((x - a) / (b - a)));
const front = (p) => p.z + 0.5 * p.y - 0.3 * Math.abs(p.x);   // how far toward the default camera
const nYof = (seed) => (String(seed || '').match(/Y/g) || []).length;

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

/* A lumpy sphere: fixed low-frequency bumps, the same every load. Says "a protein is here", nothing more. */
function blobGeometry(r, seed) {
  const g = new THREE.SphereGeometry(1, 40, 28), p = g.attributes.position, R = rng(seed);   // indexed, so normals come out smooth
  const waves = Array.from({ length: 4 }, () => ({ d: V(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), f: 0.8 + R() * 1.2, ph: R() * 6, a: 0.04 + R() * 0.04 }));
  const v = V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 1;
    for (const w of waves) k += w.a * Math.sin(w.f * v.dot(w.d) * Math.PI + w.ph);
    v.multiplyScalar(r * k);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createMolecule(env, { stepIds = [] } = {}) {
  const TX = TEXT.levels.mol;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe4e6dc, 0.75 * LIGHT));
  const key = new THREE.DirectionalLight(0xffffff, 0.9 * LIGHT);
  key.position.set(-30, 80, 50);
  scene.add(key);
  const back = new THREE.DirectionalLight(0xf4f0ff, 0.35 * LIGHT);
  back.position.set(40, -30, -60);
  scene.add(back);

  const tmp = V(), tmp2 = V(), tmpM = new THREE.Matrix4(), molM = new THREE.Matrix4(), sM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
  const col = new THREE.Color();

  /* ---------- colours: elements from the palette, carbons tinted by pigment (photosystems-test's rule) ---------- */
  const PH = PAL.photosynthesis;
  const TINT = {
    a: C(PH.chlorophyll),
    b: C(PH.chlorophyll).lerp(C(PH.photon), 0.28),                       // chlorophyll b is yellow-green
    pheo: C(PH.chlorophyll).lerp(C(PAL.atoms.C), 0.5).lerp(C(PH.carotenoid), 0.2),   // olive-grey
    car: C(PH.carotenoid),
  };
  const elCol = (el) => C(PAL.atoms[el] != null ? PAL.atoms[el] : PAL.atoms.C);
  const ballR = (el) => BALL * (PAL.radii[el] || PAL.radii.C) / SCALE;
  const stickR = STICK * PAL.radii.C / SCALE;

  /* The level's colour read: a wash from the green pea toward the yellow one as chlorophyll goes. */
  const white = new THREE.Color(1, 1, 1);
  const WASH = { y: new THREE.Color(ALLELE_COLORS.y).lerp(white, 0.55), Y: new THREE.Color(ALLELE_COLORS.Y).lerp(white, 0.45) };
  const washNow = new THREE.Color();
  let gone = 0;                                                         // 0..1 of the chlorophyll broken down
  const backMat = new THREE.MeshBasicMaterial({ color: WASH.Y, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false });
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), backMat);
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  const root = new THREE.Group();
  scene.add(root);

  /* ---------- membrane: two leaflets of lipid heads, thinning out at the patch's edge ---------- */
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.atoms.H).lerp(new THREE.Color(PAL.ss.C), 0.2).lerp(white, 0.6).convertSRGBToLinear(), roughness: 0.9 });
  const headGeo = new THREE.SphereGeometry(HEAD_R, 8, 6);
  let heads = null;

  /* ---------- the protein, pigments, SGR: built when the data lands ---------- */
  const protGroup = new THREE.Group();
  root.add(protGroup);
  const ribMats = ['C', 'H', 'E'].map((k) => new THREE.MeshStandardMaterial({ color: C(PAL.ss[k]), roughness: 0.55, transparent: true, opacity: 0.3, depthWrite: false }));
  const chlGroup = new THREE.Group(), carGroup = new THREE.Group();
  root.add(chlGroup, carGroup);
  const ballMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
  const stickMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  const mgMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.3 });
  let mgMesh = null;

  const sgrGroup = new THREE.Group(), deadGroup = new THREE.Group();
  root.add(sgrGroup, deadGroup);
  /* Lavender, not enzyme-blob.js's blue: blue over the yellowing wash reads green, and green means chlorophyll here. */
  const SGR_COL = '#9a88dc';
  const sgrMat = new THREE.MeshStandardMaterial({ color: C(SGR_COL), roughness: 0.4, transparent: true, opacity: 0.4 });
  const deadMat = new THREE.MeshStandardMaterial({ color: C(SGR_COL).lerp(C(PAL.ss.C), 0.8), roughness: 0.6, transparent: true, opacity: 0.38 });
  const NMAX = 2 * PER_ALLELE;
  const blobs = Array.from({ length: NMAX }, (_, i) => {
    const geo = blobGeometry(SGR_R, 91 + i * 17);
    const live = new THREE.Mesh(geo, sgrMat), dead = new THREE.Mesh(geo, deadMat);
    live.visible = dead.visible = false;
    sgrGroup.add(live); deadGroup.add(dead);
    return { live, dead, spin: V(0.3 + i * 0.2, 1, 0.2 - i * 0.1).normalize(), ph: i * 1.7 };
  });

  const P = { ready: false, mols: [], chl: [], car: [], counts: null, top: 0, lhciiAnchor: V(), membraneAnchor: V(), carAnchor: 0, frontA: 0 };

  function build([b, c]) {
    /* the trimer, by role and proximity */
    const centroid = (id) => { const CA = b.chains[id].CA, m = [0, 0, 0]; CA.forEach((p) => { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }); return m.map((x) => x / CA.length); };
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const ant = b.meta.chains.filter((x) => x.role === 'antenna').map((x) => ({ id: x.chain, name: x.name, c: centroid(x.chain) }));
    let tri = null;
    for (const x of ant) {
      const nb = ant.filter((y) => y !== x && y.name === x.name && dist(x.c, y.c) < TRIMER);
      if (nb.length === 2 && dist(nb[0].c, nb[1].c) < TRIMER) { tri = [x, ...nb]; break; }
    }
    if (!tri) throw new Error('no LHCII trimer among the antenna chains');
    const ids = tri.map((x) => x.id);

    /* world frame: stroma up. OPM's normal is z; the lumen face is b.meta.lumen, the bilayer middle mid. */
    const mid = b.meta.membrane.mid, up = b.meta.lumen === '+z' ? -1 : 1;
    const cx = tri.reduce((s, x) => s + x.c[0], 0) / 3, cy = tri.reduce((s, x) => s + x.c[1], 0) / 3;
    // (x, y, z) → (x, up·(z − mid), −up·y): a rotation, never a mirror
    const toW = (x, y, z) => V(x - cx, up * (z - mid), -up * (y - cy));
    const half = b.meta.membrane.half;

    /* ribbons: one build per whole chain (ribbon.js: never slice by element) */
    const caW = [];
    for (const id of ids) {
      const ch = b.chains[id];
      const CA = ch.CA.map((p) => toW(p[0], p[1], p[2]));
      caW.push(...CA);
      protGroup.add(new THREE.Mesh(RibbonLib.build(THREE, CA, ch.ss.split(''), { sub: 4 }), ribMats));
    }
    P.top = Math.max(...caW.map((p) => p.y));
    let bx = -Infinity;
    caW.forEach((p) => { if (-p.x - 0.7 * p.z > bx) { bx = -p.x - 0.7 * p.z; P.lhciiAnchor.copy(p); } });   // back left

    /* membrane heads, kept off the protein */
    const R = rng(4171), hp = [];
    for (const side of [1, -1]) {
      const yH = side * (half + HEAD_R * 0.9);
      for (let gx = -PATCH; gx <= PATCH; gx += HEAD_GAP) {
        for (let k = 0, gz = -PATCH; gz <= PATCH; gz += HEAD_GAP * 0.866, k++) {
          const x = gx + (k % 2) * HEAD_GAP / 2 + (R() - 0.5) * 2.5, z = gz + (R() - 0.5) * 2.5;
          const r = Math.hypot(x, z);
          if (r > PATCH) continue;
          if (caW.some((p) => Math.abs(p.y - yH) < 11 && (p.x - x) ** 2 + (p.z - z) ** 2 < 40)) continue;
          hp.push({ p: V(x, yH + (R() - 0.5) * 1.2, z), s: 1 - ramp(r, PATCH * 0.7, PATCH) * 0.85 });
        }
      }
    }
    heads = new THREE.InstancedMesh(headGeo, headMat, hp.length);
    hp.forEach((h, i) => heads.setMatrixAt(i, tmpM.compose(h.p, tmpQ.identity(), tmp.set(h.s, h.s * 0.6, h.s))));
    root.add(heads);
    let best = -Infinity;
    hp.forEach((h) => { const s = -h.p.x * 0.6 + h.p.z - Math.abs(Math.hypot(h.p.x, h.p.z) - PATCH * 0.8) * 2 + h.p.y * 0.1; if (s > best) { best = s; P.membraneAnchor.copy(h.p); } });

    /* pigments: bonded components of the cofactor bake */
    const n = c.el.length, par = new Int32Array(n).map((_, i) => i);
    const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const nbrs = Array.from({ length: n }, () => []);
    for (let k = 0; k < c.bonds.length; k += 2) {
      const i = c.bonds[k], j = c.bonds[k + 1];
      nbrs[i].push(j); nbrs[j].push(i);
      const a = find(i), d = find(j);
      if (a !== d) par[a] = d;
    }
    const comps = new Map();
    for (let i = 0; i < n; i++) { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(i); }
    const allCA = [];
    for (const id of b.order) for (const p of b.chains[id].CA) allCA.push({ id, p });
    const CHL = c.classes.indexOf('chlorophyll'), CAR = c.classes.indexOf('carotenoid');
    const heavy = (i) => nbrs[i].filter((j) => c.el[j] !== 'H');
    for (const atoms of comps.values()) {
      const cls = c.cls[atoms[0]];
      if (cls !== CHL && cls !== CAR) continue;
      const m = [0, 1, 2].map((k) => atoms.reduce((s, i) => s + c.xyz[3 * i + k], 0) / atoms.length);
      let bd = Infinity, owner = null;
      for (const { id, p } of allCA) { const d = dist(p, m); if (d < bd) { bd = d; owner = id; } }
      if (!ids.includes(owner)) continue;
      const O = atoms.filter((i) => c.el[i] === 'O');
      const formyl = O.find((i) => heavy(i).length === 1 && c.el[heavy(i)[0]] === 'C' && heavy(heavy(i)[0]).length === 2);
      const kind = cls === CAR ? 'car' : formyl != null ? 'b' : 'a';
      console.assert(kind !== 'a' || O.length === 5, 'mendel: a chlorophyll a without five O');
      console.assert(kind !== 'b' || O.length === 6, 'mendel: a chlorophyll b without six O');
      const pos = atoms.map((i) => toW(c.xyz[3 * i], c.xyz[3 * i + 1], c.xyz[3 * i + 2]));
      const centre = pos.reduce((s, p) => s.add(p), V()).divideScalar(pos.length);
      const mgAt = atoms.findIndex((i) => c.el[i] === 'Mg');
      P.mols.push({ kind, chain: owner, atoms, pos, centre, mgAt, formyl, lutein: kind === 'car' && O.length === 2, mg: mgAt >= 0 ? pos[mgAt].clone() : null });
    }
    P.chl = P.mols.filter((x) => x.kind !== 'car');
    P.car = P.mols.filter((x) => x.kind === 'car');

    /* counts per subunit, read off the data */
    const per = (pred) => ids.map((id) => P.mols.filter((x) => x.chain === id && pred(x)).length);
    const cnt = { a: per((x) => x.kind === 'a'), b: per((x) => x.kind === 'b'), car: per((x) => x.kind === 'car'), lut: per((x) => x.lutein) };
    for (const k in cnt) console.assert(cnt[k].every((v) => v === cnt[k][0]), `mendel: LHCII subunits differ in ${k}`);
    P.counts = { a: cnt.a[0], b: cnt.b[0], car: cnt.car[0], lut: cnt.lut[0], subunits: ids.length };

    /* instanced atoms and split sticks; every instance keeps its rest matrix */
    const index = new Map();
    const mkSet = (mols, group) => {
      let na = 0, nb = 0;
      for (const mo of mols) {
        const loc = new Map(mo.atoms.map((g, k) => [g, k]));
        mo.inst = { atoms: [], sticks: [] };
        const tail = (k) => mo.mg != null && mo.pos[k].distanceTo(mo.mg) > HEAD;
        const w0 = mo.kind === 'car' ? CAR_W : 1;
        mo.atoms.forEach((g, k) => { if (c.el[g] !== 'Mg') { mo.inst.atoms.push({ i: na++, k, el: c.el[g], w: tail(k) ? TAIL : w0 }); } });
        for (const [g, k] of loc) for (const j of nbrs[g]) {
          if (j <= g || !loc.has(j)) continue;
          for (const [from, to] of [[k, loc.get(j)], [loc.get(j), k]]) mo.inst.sticks.push({ i: nb++, from, to, el: c.el[mo.atoms[from]], mgBond: c.el[mo.atoms[from]] === 'Mg' || c.el[mo.atoms[to]] === 'Mg', fBond: mo.formyl === mo.atoms[from] || mo.formyl === mo.atoms[to], w: tail(from) && tail(to) ? TAIL : w0 });
        }
      }
      const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), ballMat, Math.max(1, na));
      const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), stickMat, Math.max(1, nb));
      for (const mo of mols) {
        for (const a of mo.inst.atoms) {
          a.rest = new THREE.Matrix4().compose(mo.pos[a.k], tmpQ.identity(), tmp.setScalar(ballR(a.el) * a.w));
          balls.setMatrixAt(a.i, a.rest);
          balls.setColorAt(a.i, a.el === 'C' ? TINT[mo.kind === 'car' ? 'car' : mo.kind] : elCol(a.el));
        }
        for (const s of mo.inst.sticks) {
          const A = mo.pos[s.from], B = mo.pos[s.to], midp = tmp.addVectors(A, B).multiplyScalar(0.5);
          tmpQ.setFromUnitVectors(Y, tmp2.subVectors(B, A).normalize());
          s.rest = new THREE.Matrix4().compose(tmp2.addVectors(A, midp).multiplyScalar(0.5), tmpQ, V(stickR * s.w, A.distanceTo(B) / 2, stickR * s.w));
          sticks.setMatrixAt(s.i, s.rest);
          sticks.setColorAt(s.i, s.el === 'C' ? TINT[mo.kind === 'car' ? 'car' : mo.kind] : elCol(s.el));
        }
        mo.balls = balls; mo.sticks = sticks;
      }
      [balls, sticks].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); });
      return { balls, sticks };
    };
    P.chlSet = mkSet(P.chl, chlGroup);
    P.carSet = mkSet(P.car, carGroup);
    mgMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), mgMat, P.chl.length);
    mgMesh.frustumCulled = false;
    mgMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    P.chl.forEach((mo, i) => { mgMesh.setColorAt(i, elCol('Mg')); mo.mgI = i; });
    root.add(mgMesh);

    /* dock points: above each chlorophyll's Mg, resting on the stromal face */
    for (const mo of P.chl) {
      let top = -Infinity;
      for (const p of caW) if ((p.x - mo.mg.x) ** 2 + (p.z - mo.mg.z) ** 2 < 120 && p.y > top) top = p.y;
      if (top === -Infinity) top = P.top;
      mo.dock = V(mo.mg.x, top + SGR_R * 0.55, mo.mg.z);
      mo.out = V(mo.centre.x, 0, mo.centre.z).normalize();
      mo.angle = Math.atan2(mo.centre.z, mo.centre.x);
    }
    P.frontA = P.chl.filter((m) => m.kind === 'a').reduce((a, m) => (front(m.mg) > front(a.mg) ? m : a), P.chl.find((m) => m.kind === 'a'));
    const luts = P.car.filter((m) => m.lutein);
    const right = (p) => p.x - 0.3 * p.z + 0.3 * p.y;   // right and a little back: clear of the front-left Mg²⁺ tag
    P.carAnchor = (luts.length ? luts : P.car).reduce((a, m) => (right(m.centre) > right(a.centre) ? m : a));
    plans.clear();
    P.ready = true;
    lastKey = '';
  }

  Promise.all([DATA, COF].map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })))
    .then(build)
    .catch((e) => console.error('mendel molecule: could not load 5XNL', e));

  /* ---------- the work plan for nW working SGR copies ----------
     Each copy takes the pigments of one angular sector of the trimer: its chlorophyll a in a
     nearest-neighbour walk, then the chlorophyll b (converted to a by then). One pigment per EV. */
  const EV_OF = () => (END_ONE - START) / Math.ceil(P.chl.length / PER_ALLELE);
  const plans = new Map();
  function planFor(nW) {
    if (!nW || !P.ready) return null;
    if (plans.has(nW)) return plans.get(nW);
    const EV = EV_OF();
    const sorted = [...P.chl].sort((a, b) => a.angle - b.angle);
    const qs = [];
    for (let k = 0; k < nW; k++) {
      const part = sorted.slice(Math.round((k * sorted.length) / nW), Math.round(((k + 1) * sorted.length) / nW));
      const walk = (list, from) => {
        const left = [...list], out = [];
        let at = from;
        while (left.length) {
          let bi = 0;
          if (at) left.forEach((m, i) => { if (m.dock.distanceToSquared(at) < left[bi].dock.distanceToSquared(at)) bi = i; });
          at = left[bi].dock;
          out.push(left.splice(bi, 1)[0]);
        }
        return out;
      };
      const qa = walk(part.filter((m) => m.kind === 'a'), null);
      const q = qa.concat(walk(part.filter((m) => m.kind === 'b'), qa.length ? qa[qa.length - 1].dock : null));
      qs.push(q);
    }
    const slot = new Map();
    qs.forEach((q, k) => q.forEach((m, j) => {
      const s0 = START + j * EV;
      slot.set(m, { k, j, s0, conv: m.kind === 'b' ? [START + (s0 - START) * 0.15, START + (s0 - START) * 0.55] : null });
    }));
    const end = START + Math.max(...qs.map((q) => q.length)) * EV;
    const plan = { qs, slot, EV, end, done: end + LEAVE };
    plans.set(nW, plan);
    return plan;
  }

  /* ---------- posing ---------- */
  const S = { nY: 0, m: 0, plan: null, cur: [], prev: [] };   // cur[k]/prev[k]: SGR k's target now / the one before
  const entryOf = (q) => q[0].dock.clone().addScaledVector(q[0].out, 25).add(V(0, 55, 0));
  const parkOf = (k) => { const a = Math.PI * (1.1 + 0.8 * k / (NMAX - 1)); return V(Math.cos(a) * 60, P.top + SGR_R * 0.6, Math.sin(a) * 60); };   // blob k's place behind the trimer
  function sgrPos(k, m, out) {
    const pl = S.plan, q = pl.qs[k];
    if (m < START) return out.copy(entryOf(q));
    const j = Math.floor((m - START) / pl.EV);
    // done: off up into the stroma, out of the way of the yellow that is left
    if (j >= q.length) return out.copy(q[q.length - 1].dock).lerp(parkOf(k).add(V(0, 110, 0)), ramp(m, pl.end, pl.end + 0.06));
    const e = (m - START) / pl.EV - j, u = ramp(e, 0, 0.3);
    const from = j === 0 ? entryOf(q) : q[j - 1].dock;
    out.copy(from).lerp(q[j].dock, u);
    out.y += Math.sin(Math.PI * u) * (j === 0 ? 0 : 8);
    return out;
  }

  /* one pigment's pose: offset, scale, tints, Mg */
  function stateOf(mo, m) {
    const st = { s: 1, off: 0, kb: 0, kp: 0, pull: 0, mgFree: 0, leave: 0 };
    const pl = S.plan, sl = pl && pl.slot.get(mo);
    if (!sl) return st;
    const e = (m - sl.s0) / pl.EV, e1 = sl.s0 + pl.EV;
    if (sl.conv) st.kb = ramp(m, sl.conv[0], sl.conv[1]);
    st.kp = ramp(e, 0.35, 0.7);
    st.pull = ramp(e, 0.3, 0.75);
    st.mgFree = clamp((m - e1) / FREE);
    st.leave = ramp(m, e1 + 0.004, e1 + LEAVE);
    st.s = 1 - st.leave;
    return st;
  }

  let lastKey = '';
  const rMg = ballR('C') * MG_BALL;
  function pose(t) {
    if (!P.ready) return;
    const nY = nYof(t.seed), m = clamp(t.mature || 0);
    const key = nY + ':' + m.toFixed(5);
    if (key === lastKey) return;
    lastKey = key;
    S.nY = nY; S.m = m;
    S.plan = planFor(nY * PER_ALLELE);
    let g = 0;
    for (const mo of P.chl) {
      const st = stateOf(mo, m);
      mo.st = st;
      g += st.kp * 0.5 + st.leave * 0.5;
      const tint = col.copy(mo.kind === 'b' ? TINT.b : TINT.a);
      if (st.kb) tint.lerp(TINT.a, st.kb);
      if (st.kp) tint.lerp(TINT.pheo, st.kp);
      const lift = tmp.copy(mo.out).multiplyScalar(18 * st.leave);   // carried off: outward and up into the stroma
      lift.y += 16 * st.leave;
      // scale about the pigment's centre, then lift: s·(p − c) + c + lift
      molM.makeScale(st.s, st.s, st.s);
      tmp2.copy(mo.centre).multiplyScalar(1 - st.s).add(lift);
      molM.setPosition(tmp2);
      mo.molM = (mo.molM || new THREE.Matrix4()).copy(molM);
      const fv = 1 - st.kb;
      for (const a of mo.inst.atoms) {
        tmpM.multiplyMatrices(molM, a.rest);
        if (mo.formyl != null && mo.atoms[a.k] === mo.formyl && fv < 1) tmpM.multiply(sM.makeScale(fv, fv, fv));
        mo.balls.setMatrixAt(a.i, tmpM);
        if (a.el === 'C') mo.balls.setColorAt(a.i, tint);
      }
      const mv = 1 - ramp(st.pull, 0, 0.3);
      for (const s of mo.inst.sticks) {
        tmpM.multiplyMatrices(molM, s.rest);
        const w = s.mgBond ? mv : s.fBond ? fv : 1;
        if (w < 1) tmpM.multiply(sM.makeScale(w, 1, w));
        mo.sticks.setMatrixAt(s.i, tmpM);
        if (s.el === 'C') mo.sticks.setColorAt(s.i, tint);
      }
      /* the Mg²⁺: in the ring, up into SGR, held, then let go into the stroma */
      let sMg = rMg;
      const mp = tmp2;
      if (!st.pull) mp.copy(mo.mg).applyMatrix4(molM);
      else {
        const inBlob = tmp.copy(mo.dock);
        inBlob.y -= SGR_R * 0.3;
        if (st.mgFree <= 0) mp.copy(mo.mg).lerp(inBlob, st.pull);
        else {
          mp.copy(inBlob).addScaledVector(mo.out, 26 * st.mgFree);
          mp.y += 22 * st.mgFree;
          sMg = rMg * (1 - smooth(st.mgFree));
        }
      }
      mo.mgPos = (mo.mgPos || V()).copy(mp);
      mgMesh.setMatrixAt(mo.mgI, tmpM.compose(mp, tmpQ.identity(), tmp.setScalar(sMg)));
    }
    gone = g / P.chl.length;
    const set = P.chlSet;
    set.balls.instanceMatrix.needsUpdate = set.sticks.instanceMatrix.needsUpdate = true;
    set.balls.instanceColor.needsUpdate = set.sticks.instanceColor.needsUpdate = true;
    mgMesh.instanceMatrix.needsUpdate = true;
  }

  function poseBlobs(t, time) {
    const nW = S.nY * PER_ALLELE, m = S.m;
    const arrive = ramp(m, ARRIVE[0], ARRIVE[1]);
    blobs.forEach((bl, k) => {
      const live = k < nW && !!S.plan, dead = !live && P.ready;
      bl.live.visible = live && arrive > 0.001;
      bl.dead.visible = dead && arrive > 0.001;
      const mesh = live ? bl.live : bl.dead;
      if (!mesh.visible) return;
      if (live) sgrPos(k, m, mesh.position);
      else {
        // behind the trimer, off the protein, where they cannot hide the pigments
        mesh.position.copy(parkOf(k));
        mesh.position.y += Math.sin(time * 0.6 + bl.ph) * 1.5;
      }
      mesh.position.y += (1 - arrive) * 60;
      mesh.scale.setScalar(0.3 + 0.7 * arrive);
      mesh.quaternion.setFromAxisAngle(bl.spin, time * 0.15 + bl.ph);
    });
    sgrMat.opacity = 0.4 * arrive;
    deadMat.opacity = 0.32 * arrive;
  }

  function update(t, time) {
    t = t || {};
    pose(t);
    poseBlobs(t, time);
    washNow.copy(WASH.y).lerp(WASH.Y, gone);
    backMat.color.copy(washNow).convertSRGBToLinear();
    backMat.opacity = 0.5 * gone;
  }
  backdrop.onBeforeRender = (r, s, cam) => { backMat.opacity = cam === world.camera ? 0.5 * gone : 0; };

  /* ---------- labels, interactives, views, cues ---------- */
  const L = TX.labels, I = TX.info;
  /* SGR 0's pigment now (the action), and the one before it */
  const curOf = () => {
    const pl = S.plan;
    if (!pl || S.m < START) return null;
    const q = pl.qs[0], j = Math.floor((S.m - START) / pl.EV);
    return { now: j < q.length ? q[j] : null, prev: j > 0 ? q[Math.min(j, q.length) - 1] : null };
  };
  const focal = () => { const c = curOf(); return c ? c.now : P.frontA; };
  /* the Chl a label sits on an intact one well clear of the Mg²⁺ label's, so the two tags never stack */
  const chlaShown = () => {
    const f = focal(), far = f && f.mgPos ? f.mgPos : P.frontA.mg, c = curOf(), ph = c && c.prev ? c.prev.centre : null;
    let best = null, bs = -Infinity;
    for (const mo of P.chl) {
      if (!(mo.kind === 'a' || (mo.st && mo.st.kb > 0.95)) || (mo.st && mo.st.pull > 0)) continue;
      const d = mo.mg.distanceTo(far);
      if (d < 28 || mo.mg.distanceTo(P.carAnchor.centre) < 24 || (ph && mo.mg.distanceTo(ph) < 24)) continue;
      const sc = front(mo.mg) - Math.max(0, d - 45);
      if (sc > bs) { bs = sc; best = mo; }
    }
    return best;
  };
  const ringEdge = (mo) => mo.mg.clone().applyMatrix4(mo.molM || new THREE.Matrix4()).add(V(0, 0, 4));
  const n = () => P.counts || { a: 0, b: 0, car: 0, lut: 0, subunits: 0 };
  /* SGR at work: from arrival until the last pigment has left. The quiet labels step aside meanwhile. */
  const working = () => !!S.plan && S.m >= ARRIVE[0] && S.m < S.plan.done;
  const labels = [
    { key: 'lhcii', text: L.lhcii.text, sub: L.lhcii.sub, anchor: () => P.lhciiAnchor.clone(), show: () => P.ready && !working() },
    { key: 'membrane', ...L.membrane, anchor: () => P.membraneAnchor.clone(), show: () => P.ready && S.m < ARRIVE[0] },
    { key: 'chla', text: L.chla.text, sub: () => fmt(L.chla.sub, { n: n().a }),
      anchor: () => { const m = chlaShown(); return m ? ringEdge(m) : V(); }, show: () => P.ready && !!chlaShown() },
    { key: 'mg', text: L.mg.text, sub: () => { const f = P.ready && focal(); return f && f.st && f.st.pull > 0 ? L.mg.pulled : L.mg.sub; },
      anchor: () => { const f = focal(); return f && f.mgPos ? f.mgPos.clone() : V(); }, show: () => P.ready && !!focal() },
    { key: 'pheo', ...L.pheo, anchor: () => { const c = curOf(); return c && c.prev ? c.prev.centre.clone().applyMatrix4(c.prev.molM) : V(); },
      show: () => { const c = P.ready && curOf(); return !!(c && c.prev && c.prev.st && c.prev.st.leave < 0.85); } },
    { key: 'carotenoid', text: L.carotenoid.text, sub: () => fmt(L.carotenoid.sub, { n: n().car }),
      anchor: () => P.carAnchor.centre.clone(), show: () => P.ready && !working() },
    { key: 'sgr', ...L.sgr, anchor: () => blobs[0].live.position.clone().add(V(0, SGR_R * 0.6, 0)),
      show: () => blobs[0].live.visible && S.m > SEEN && S.plan && S.m < S.plan.end + 0.02 },
    { key: 'sgrDead', ...L.sgrDead, anchor: () => { const b = blobs.find((x) => x.dead.visible); return b ? b.dead.position.clone().add(V(0, SGR_R * 0.6, 0)) : V(); },
      show: () => blobs.some((x) => x.dead.visible) && S.m > SEEN && (!S.plan || S.m < START || S.m >= S.plan.done) },
  ];

  const interactives = [
    { root: protGroup, priority: 1, info: () => ({ title: I.lhcii.title, text: fmt(I.lhcii.text, n()) }) },
    { root: chlGroup, priority: 2, info: () => (gone > 0.01 ? { title: I.chlorophyll.title, text: `${I.chlorophyll.text} ${I.pheophytin.text}` } : I.chlorophyll) },
    { root: carGroup, priority: 2, info: () => ({ title: I.carotenoid.title, text: fmt(I.carotenoid.text, n()) }) },
    { root: sgrGroup, priority: 3, info: () => I.sgr },
    { root: deadGroup, priority: 3, info: () => I.sgrDead },
  ];
  // the Mg²⁺ and the lipid heads exist once the data has landed
  const lateRoots = () => {
    if (mgMesh && !interactives.some((x) => x.root === mgMesh)) interactives.push({ root: mgMesh, priority: 3, info: () => I.mg });
    if (heads && !interactives.some((x) => x.root === heads)) interactives.push({ root: heads, priority: 0, info: () => I.membrane });
  };

  /* One per step id, plus the complete card. The trimer sits at the origin, membrane middle at y = 0, stroma up. */
  const OVER = { pos: V(15, 110, 185), target: V(0, 8, 0) };
  const WORK = { pos: V(-15, 100, 180), target: V(0, 14, 0) };
  const DONE = { pos: V(35, 105, 180), target: V(0, 8, 0) };
  const VIEW_OF = { ripen: WORK, open1: DONE, grow: WORK, predict: DONE, shell: DONE, count: DONE, punnett: DONE };
  const views = [...stepIds.map((id) => VIEW_OF[id] || OVER), DONE];

  const CU = TX.cues;
  function cue(t) {
    if (!t) return null;
    if (['emasculate', 'pollen', 'pollinate', 'bag', 'guess1'].includes(t.step)) return { text: CU.before, mark: 'lhcii' };
    const nY = nYof(t.seed), m = clamp(t.mature || 0);
    if (m < SEEN) return { text: CU.fill, mark: 'chla' };
    if (!nY) return m < 0.6 ? { text: CU.dead, mark: 'sgrDead' } : { text: CU.green, mark: 'chla' };
    const pl = planFor(nY * PER_ALLELE);
    const slow = nY === 1 ? CU.half : undefined;
    if (m < START) return { text: CU.arrive, mark: 'sgr' };
    if (!pl) return { text: CU.pull, mark: 'mg' };
    if (m >= pl.done) return { text: CU.yellow, mark: 'carotenoid', note: nY === 1 ? CU.enough : undefined };
    const phase = (m - START) / (pl.end - START);
    if (phase < 0.3) return { text: CU.pull, mark: 'mg', note: slow };
    if (phase < 0.55) return { text: CU.convert, mark: 'chla', note: slow };
    return { text: CU.pheo, mark: 'pheo', note: slow };
  }

  const world = {
    scene, update, labels, interactives, views, cue, fov: 38, near: 1, far: 4000, minDist: 40, maxDist: 600,
    insetBg: (bg) => bg.clone().lerp(WASH.Y, gone * 0.85),
  };
  const upd = world.update;
  world.update = (t, time) => { lateRoots(); upd(t, time); };
  return world;
}
