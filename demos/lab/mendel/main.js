/* Mendel's peas: cross a green-pea plant with yellow-pea pollen, open the pod (F₁, all yellow),
 * grow the F₁ and let it self-pollinate, shell the F₂ pods and count (3 yellow : 1 green).
 *
 * Bench state is S, recreated by rebuild(): one 0..1 progress per hand action (em, pol, dab,
 * bag, open1, sow), the cross pod's days S.ripen, the F₁ garden's weeks S.week, and one 0..1 per
 * F₁ plant for shelling, S.shell[p]. pose() places everything from S alone, so replays and
 * scrubbing agree. Every pea's genotype is drawn once per session (R) and the panel counts
 * those, never a typed number. Answers given in the panel live in ANS, off the bench. */
import * as THREE from 'three';
import {
  V3, Q, clamp, lerp, smooth, Ease, anim, newSession, reseed, rand, disposeTree, toast, isInstant, worldOf,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, createIntro, createPropArt, createZoom, chromeInsets, bindChrome, PHONE,
  makeBench, makeTray, makeDish, makeBenchCard, makeForceps, mesh, T, fmt,
  makePot, makePea, PEA_COLORS, peaMaterial, makePeaPod, makePeaPlant, makeBrush, makePollinationBag, makePlantTag,
} from '../lab.js';
import { createCell } from './cell.js';
import { createMolecule } from './molecule.js';

const $ = (s) => document.querySelector(s);
const ph = (t, a, b, ease = Ease.inOut) => ease(clamp((t - a) / (b - a)));
const win = (t, a, b, c, d) => ph(t, a, b) * (1 - ph(t, c, d));

// =========================================================================
// The science
// =========================================================================
/* Days from a flower opening to a dry pod, and the F₁ garden's calendar. Garden peas emerge in
 * about a week, flower 7 to 8 weeks after sowing, set pods for 3 weeks and dry 2 to 3 weeks
 * later. Each higher node flowers a few days after the one below it. */
const DAYS = 40;                    // cross: pollination to a dry pod
const WEEKS = 15;                   // F₁: sowing to the last pod dry
const FLOWER0 = 49, NODE_DAYS = 3;  // F₁: first flower opens on day 49, each node 3 days later
const ANTHERS = 10;                 // a pea flower's stamens
const MENDEL = { yellow: 6022, green: 2001 };   // Mendel 1866, F₂ seed colour
const F1_POTS = 4, F1_SITES = 5;
const isYellow = (g) => g.includes('Y');
const allele = () => (rand() < 0.5 ? 'Y' : 'y');
/** A genotype as written: dominant first ('yY' → 'Yy'). */
const geno = (a, b) => (a === 'Y' || b !== 'Y' ? a + b : b + a);

/** Every pea of the session. Parents are true-breeding (YY, yy); the cross gives Yy; each F₁
 *  pea comes from one egg and one pollen grain of a Yy plant, each Y or y by chance. */
function drawPeas() {
  reseed('peas');
  const n = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const line = (g) => Array.from({ length: 4 }, () => Array.from({ length: n(5, 8) }, () => g));
  return {
    yellow: line('YY'),
    green: line('yy'),
    f1: Array.from({ length: n(6, 8) }, () => 'Yy'),
    f2: Array.from({ length: F1_POTS }, () => Array.from({ length: F1_SITES }, () => Array.from({ length: n(4, 8) }, () => geno(allele(), allele())))),
  };
}

// =========================================================================
// Layout and views
// =========================================================================
/* Parents at the back left with their own peas in dishes in front; the tools on a tray at the
 * front left; the F₁ pots at the back right with the sorting tray in front of them. */
const POS = {
  yellow: V3(-48, 0, -16), green: V3(-28, 0, -16),
  dishY: V3(-48, 0, 5), dishG: V3(-28, 0, 5),
  tools: V3(-34, 0, 23), dishF1: V3(-8, 0, 14),
  tray: V3(24, 0, 17), husks: V3(4, 0, 23),
};
const F1_X = [2, 17, 32, 47], F1_Z = -16;
const TOOL = { forceps: V3(-42, 0, 21), brush: V3(-34, 0, 25.5), bag: V3(-25, 0, 22) };   // tip / mouth rest points
const TRAY = { w: 26, d: 14 };
const CROSS = 2, DONOR = 2;         // which site on each parent carries the cross
/* Each parent site's age in days on the cross day (bottom node first). The cross site's own
   timing is the cross. */
const PARENT_AGE = [26, 13, 1, -6];

const VIEWS = {
  overview: { t: V3(-5, 13, -5), p: V3(-5, 76, 124) },
  parents: { t: V3(-42, 20, -12), p: V3(-40, 42, 56) },
  bud: { t: V3(), p: V3() },        // filled from the plant once it is built
  donor: { t: V3(), p: V3() },
  pod: { t: V3(), p: V3() },
  dish: { t: V3(-14, 3, 10), p: V3(-14, 34, 52) },
  pots: { t: V3(24, 19, -12), p: V3(24, 52, 82) },
  tray: { t: V3(28, 8, 6), p: V3(28, 50, 66) },
  done: { t: V3(12, 14, -2), p: V3(12, 60, 98) },
};
const CLOSE = V3(2.5, 2.5, 10);         // a close-up's camera: right, up, out from the flower's face

// =========================================================================
// Stage and zoom levels
// =========================================================================
const PANEL_W = 320;
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  controls: { minDistance: 6, maxDistance: 180 },
  insets: (w, h) => {
    const r = chromeInsets(w, h, { bottom: w > PHONE ? [] : ['.pea-panel'] });
    if (w > PHONE) r.right = Math.min(PANEL_W + 24, w * 0.3);
    return r;
  },
});
const mat = createMaterials(stage);

let S = null, B = null, R = null, root = null;
let lesson, ix;
const ANS = { guess1: null, predict: null, count: null, cells: [null, null, null, null], garden: null };

const STEP_IDS = ['emasculate', 'pollen', 'pollinate', 'bag', 'ripen', 'guess1', 'open1', 'sow', 'grow', 'predict', 'shell', 'count', 'punnett'];
const stepId = () => (lesson && STEPS[lesson.step] ? STEPS[lesson.step].id : null);
const after = (id) => lesson && (lesson.step > STEP_IDS.indexOf(id) || lesson.step >= STEPS.length);

/** What the zoom levels show (mendel-contract: the cross, then one seed maturing). */
function zoomState() {
  const id = stepId();
  const Z = { step: id, mother: 'yy', father: 'YY', self: false, meiosis: 0, fert: 0, pick: [0, 0], grid: 0, seed: 'Yy', mature: 0 };
  if (!S) return Z;
  const i = lesson.step;
  if (i <= STEP_IDS.indexOf('ripen')) {
    Z.meiosis = clamp(S.em * 0.5 + S.pol * 0.5);
    Z.fert = clamp(0.25 * S.dab + 0.25 * S.bag + 0.5 * ph(S.ripen, 0, 0.25, Ease.linear));
    Z.mature = ph(S.ripen, 0.2, 1, Ease.linear);
    return Z;
  }
  if (i <= STEP_IDS.indexOf('open1')) { Z.meiosis = Z.fert = Z.mature = 1; return Z; }
  Object.assign(Z, { mother: 'Yy', father: 'Yy', self: true, pick: [1, 1], seed: 'yy' });
  if (i === STEP_IDS.indexOf('sow')) { Z.seed = 'Yy'; Z.mature = 1; return Z; }
  const day = S.week * 7;
  Z.meiosis = ph(day, FLOWER0 - 6, FLOWER0 - 1, Ease.linear);
  Z.fert = ph(day, FLOWER0 - 1, FLOWER0 + 4, Ease.linear);
  Z.mature = ph(day, FLOWER0 + 4, FLOWER0 + DAYS, Ease.linear);
  Z.grid = id === 'punnett' || id === null ? 1 : 0;
  return Z;
}
const zoom = createZoom(stage, {
  levels: [
    { key: 'cell', world: createCell(stage.env, { stepIds: STEP_IDS }), name: T.levels.cell.name, meta: T.levels.cell.meta, bg: '#f3eee4' },
    { key: 'mol', world: createMolecule(stage.env, { stepIds: STEP_IDS }), name: T.levels.mol.name, meta: T.levels.mol.meta, bg: '#e8f1e4' },
  ],
  getT: zoomState,
  getStep: () => (lesson ? Math.min(lesson.step, STEPS.length) : 0),
});

// =========================================================================
// The bench
// =========================================================================
function place(prop, pos, yaw = 0) {
  prop.group.position.copy(pos);
  prop.group.rotation.y = yaw;
  root.add(prop.group);
  return prop;
}
const objText = (k, vars) => {
  const o = T.objects[k];
  return { name: fmt(o.name, vars), short: fmt(o.short || o.name, vars), desc: fmt(o.desc, vars) };
};
const pheno = (list) => list.map((g) => (isYellow(g) ? 'Y' : 'y'));

/** A potted plant: the pot, the plant in it, an optional tag, all in one group so they hover
 *  and click together. */
function station(pos, { seed, label, tag, sites = 4, yaw = 0 }) {
  const g = new THREE.Group();
  g.position.copy(pos);
  root.add(g);
  const pot = makePot(mat, { label, labelColor: '#7c3aed' });
  g.add(pot.group);
  const plant = makePeaPlant(mat, { seed, sites });
  plant.group.position.copy(pot.anchors.soil);
  plant.group.rotation.y = yaw;
  g.add(plant.group);
  plant.sites.forEach((s) => s.setManual(true));
  if (tag) {
    const t = makePlantTag(mat, tag);
    t.group.position.copy(pot.anchors.soil).add(V3(pot.r * 0.55, -1.5, pot.r * 0.35));
    t.group.rotation.y = -0.4;
    g.add(t.group);
  }
  return { group: g, pot, plant };
}

/** A dish of loose peas, scattered on its floor. */
function peaDish(pos, colors, seed) {
  const dish = place(makeDish(mat, { r: 4.6 }), pos);
  const peas = colors.map((c, k) => {
    const p = makePea(mat, { color: c, seed: seed + k });
    const a = k * 2.399 + seed, r = 0.7 + 2.9 * Math.sqrt((k + 0.5) / Math.max(colors.length, 12));
    p.group.position.set(Math.cos(a) * r, dish.anchors.floor.y + p.r, Math.sin(a) * r);
    p.group.rotation.set(a, a * 0.7, 0);
    dish.group.add(p.group);
    return p;
  });
  return { dish, peas };
}

function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group();
  stage.scene.add(root);
  R = drawPeas();
  S = { em: 0, pol: 0, dab: 0, bag: 0, ripen: 0, open1: 0, sow: 0, week: 0, shell: Array(F1_POTS).fill(0), order: [], key: {} };

  place(makeBench(mat), V3());
  const yellow = station(POS.yellow, { seed: 3, label: T.props.yellow, yaw: 0.4 });
  const green = station(POS.green, { seed: 8, label: T.props.green, yaw: -0.5 });
  yellow.plant.setPeas(R.yellow.map(pheno));
  green.plant.setPeas(R.green.map(pheno));
  const f1 = F1_X.map((x, p) => station(V3(x, 0, F1_Z), { seed: 20 + p, sites: F1_SITES, tag: { title: fmt(T.props.f1n, { n: p + 1 }), color: '#7c3aed' }, yaw: p * 1.3 }));
  f1.forEach((s, p) => s.plant.setPeas(R.f2[p].map(pheno)));

  const dishY = peaDish(POS.dishY, Array(14).fill('yellow'), 1);
  const dishG = peaDish(POS.dishG, Array(14).fill('green'), 40);
  const dishF1 = place(makeDish(mat, { r: 4.6 }), POS.dishF1);
  [[POS.dishY, T.props.dishYellow], [POS.dishG, T.props.dishGreen], [POS.dishF1, T.props.dishF1]].forEach(([p, title]) => place(makeBenchCard(mat, { title }), V3(p.x, 0, p.z + 7)));

  const tools = place(makeTray(mat, { w: 30, d: 11 }), POS.tools);
  const forceps = place(makeForceps(mat), V3());
  const brush = place(makeBrush(mat), V3());
  const bag = place(makePollinationBag(mat, { w: 6, h: 12 }), V3());
  const tray = place(makeTray(mat, { w: TRAY.w, d: TRAY.d, h: 1.4, color: 0xf4f1ea }), POS.tray);
  const divider = mesh(new THREE.BoxGeometry(0.3, 1.2, TRAY.d - 0.6), mat.make.solid(0xd8d2c4, 0.6), { cast: false });
  divider.position.set(0, 0.7, 0);
  tray.group.add(divider);

  // the F₁ peas: drawn loose once they leave the pod
  const f1Peas = R.f1.map((g, k) => { const p = makePea(mat, { color: 'yellow', seed: 70 + k }); p.group.visible = false; root.add(p.group); return p; });
  // the F₂ peas: one instanced mesh per colour, filled as pods are shelled
  const ref = makePea(mat, { color: 'yellow' });
  let peaGeo = null;
  ref.group.traverse((m) => { if (!peaGeo && m.isMesh) peaGeo = m.geometry; });
  const nF2 = R.f2.flat(2).length;
  const inst = ['yellow', 'green'].map((c) => {
    const m = new THREE.InstancedMesh(peaGeo, peaMaterial(mat, c), nF2);
    m.count = 0; m.castShadow = true; m.frustumCulled = false;
    root.add(m);
    return m;
  });

  B = { yellow, green, f1, dishY, dishG, dishF1, tools, forceps, brush, bag, tray, f1Peas, inst, where: {} };
  B.cross = green.plant.sites[CROSS];
  B.donor = yellow.plant.sites[DONOR];
  // turn each parent so the flower worked on faces the reader, a little to the right
  const faceFront = (st, site) => {
    root.updateMatrixWorld(true);
    const f = V3(0, 0, 1).transformDirection(site.flower.group.matrixWorld);
    st.plant.group.rotation.y += 0.3 - Math.atan2(f.x, f.z);
  };
  faceFront(green, B.cross);
  faceFront(yellow, B.donor);
  B.crossPod = B.cross.pod;
  B.podHome = homeOf(B.crossPod.group);
  B.f2Home = f1.map((s) => s.plant.sites.map((site) => homeOf(site.pod.group)));
  B.crossPod.setPeas(pheno(R.f1));
  B.anther = mesh(new THREE.SphereGeometry(0.09, 10, 8), mat.make.standard({ color: 0xe8c547, roughness: 0.7 }));
  B.anther.scale.set(1, 0.6, 1.6);
  root.add(B.anther);

  ix.register('yellow', yellow.group, { ...objText('potYellow'), anchor: V3() });
  ix.register('green', green.group, { ...objText('potGreen'), anchor: V3() });
  ix.register('forceps', forceps.group, { ...objText('forceps') });
  ix.register('brush', brush.group, { ...objText('brush') });
  ix.register('bag', bag.group, { ...objText('bag') });
  ix.register('dishY', dishY.dish.group, { ...objText('dishYellow') });
  ix.register('dishG', dishG.dish.group, { ...objText('dishGreen') });
  ix.register('dishF1', dishF1.group, { ...objText('dishF1') });
  ix.register('tray', tray.group, { ...objText('tray') });
  f1.forEach((s, p) => ix.register('f1_' + p, s.group, { ...objText('plantF1', { n: p + 1 }), anchor: V3() }));

  pose(true);
  aimViews();
}
const homeOf = (o) => ({ p: o.position.clone(), q: o.quaternion.clone(), parent: o.parent });

/** Close-up views on the cross bud, the donor flower and the cross pod, read off the plants. */
function aimViews() {
  root.updateMatrixWorld(true);
  // a close-up looks into the flower's face; the tools come in from the side, handle up and away
  const face = (site, anchor, v) => {
    const p = worldOf(site.flower.group, site.flower.anchors[anchor]);
    const fwd = V3(0, 0, 1).transformDirection(site.flower.group.matrixWorld).setY(0).normalize();
    let side = V3().crossVectors(V3(0, 1, 0), fwd).normalize();
    if (side.x < 0) side.negate();                 // the tools sit on the viewer's right
    v.t.copy(p);
    v.p.copy(p).addScaledVector(fwd, CLOSE.z).addScaledVector(side, CLOSE.x).add(V3(0, CLOSE.y, 0));
    const legs = V3().addScaledVector(fwd, 0.35).addScaledVector(side, 0.75).add(V3(0, 0.55, 0)).normalize();
    return new THREE.Quaternion().setFromUnitVectors(V3(0, 0, -1), legs);
  };
  B.qBud = face(B.cross, 'keel', VIEWS.bud);
  B.qDonor = face(B.donor, 'anthers', VIEWS.donor);
  B.inBud = V3().subVectors(VIEWS.bud.p, VIEWS.bud.t).normalize().multiplyScalar(4);      // the approach, from the viewer's side
  B.inDonor = V3().subVectors(VIEWS.donor.p, VIEWS.donor.t).normalize().multiplyScalar(4);
  const pod = B.cross.group.getWorldPosition(V3()).add(V3(0, -3, 0));
  // the pod hangs below the bud: the same face, a step back
  VIEWS.pod.t.copy(pod);
  VIEWS.pod.p.copy(VIEWS.bud.p).sub(VIEWS.bud.t).multiplyScalar(1.6).add(pod);
  // the markers point at what the step is about
  const local = (key, w) => ix.objects[key].anchor.copy(B[key].group.worldToLocal(w.clone()));
  local('green', VIEWS.bud.t);
  local('yellow', VIEWS.donor.t);
  B.f1.forEach((s, p) => ix.objects['f1_' + p].anchor.set(0, 24, 0));
}

// =========================================================================
// pose(): the bench from S
// =========================================================================
const _a = V3(), _b = V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = V3(1, 1, 1);
const track = (w, keys, out) => {
  if (w <= keys[0][0]) return out.copy(keys[0][1]);
  for (let k = 1; k < keys.length; k++) {
    if (w <= keys[k][0]) {
      const [w0, p0] = keys[k - 1], [w1, p1] = keys[k];
      return out.lerpVectors(p0, p1, smooth((w - w0) / (w1 - w0)));
    }
  }
  return out.copy(keys[keys.length - 1][1]);
};
const up = (p, dy) => V3(p.x, p.y + dy, p.z);

/** One flower-and-pod site at `age` days since its flower opened. */
function poseSite(site, age) {
  site.group.visible = age > -14;
  if (!site.group.visible) return;
  const F = site.flower, P = site.pod;
  F.setOpen(age < -1 ? ph(age, -14, -4) * 0.5 : 0.5 + 0.5 * ph(age, -1, 1));
  F.setShed(ph(age, -1.5, 0));       // a pea's anthers open inside the bud: it has pollinated itself
  F.setKeelOpen(0);
  F.setAnthers(1);
  F.setPollen(ph(age, -1.5, 0));
  F.setWither(ph(age, 3, 8));
  F.group.visible = age < 10;
  P.group.visible = age > 4;
  P.setGrowth(ph(age, 5, 22));
  P.setDry(ph(age, 28, 38, Ease.linear));
  P.setOpen(0);
}

/** A tool (forceps, brush) with its tip at `tip`, turned `hold` of the way from resting to `q`. */
const Q_REST = Q(0, -Math.PI / 2, 0);               // lying along the tray, tips to the left
const Q_DOWN = Q(1.15, 0.3, 0);                     // tips down into a pot
function toolAt(tool, tip, hold, q) {
  _q.copy(Q_REST).slerp(q, hold);
  tool.group.quaternion.copy(_q);
  tool.group.position.copy(tip).sub(tool.anchors.tip.clone().applyQuaternion(_q));
}
/** A tool's round trip from its rest point to `at` and back: [to, work, back] as fractions of k. */
function trip(k, rest, at, approach, a = 0.22, b = 0.82) {
  const over = up(rest, 14), near = at.clone().add(approach);
  if (k <= 0 || k >= 1) return { p: rest.clone(), hold: 0 };
  if (k < a) return { p: track(k / a, [[0, rest], [0.35, over], [0.8, near], [1, at]], V3()), hold: ph(k, 0, a * 0.6) };
  if (k > b) return { p: track((k - b) / (1 - b), [[0, at], [0.2, near], [0.65, over], [1, rest]], V3()), hold: 1 - ph(k, b + (1 - b) * 0.4, 1) };
  return { p: at.clone(), hold: 1 };
}

const flowerPt = (site, name) => worldOf(site.flower.group, site.flower.anchors[name]);
/** A tool's tip as it lies on the tool tray. */
const restTip = (key) => V3(TOOL[key].x, TOOL_FLOOR, TOOL[key].z).add(B[key].anchors.tip.clone().applyQuaternion(Q_REST));
const TOOL_FLOOR = 0.2;

function pose(force = false) {
  const changed = (k, v) => { if (!force && S.key[k] === v) return false; S.key[k] = v; return true; };
  root.updateMatrixWorld(true);

  // the parents' own sites age with the cross pod's days
  const day = S.ripen * DAYS;
  if (changed('parents', day)) {
    [B.yellow, B.green].forEach((st) => st.plant.sites.forEach((site, s) => {
      if (st === B.green && s === CROSS) return;
      if (st === B.yellow && s === DONOR) { poseSite(site, PARENT_AGE[s] + day); site.flower.setShed(1); return; }
      poseSite(site, PARENT_AGE[s] + day);
    }));
    const g = 0.8 + 0.1 * ph(day, 20, DAYS);    // past 0.8 the leaves start to yellow
    B.yellow.plant.setGrowth(g); B.green.plant.setGrowth(g);
  }

  // the cross flower: a full-size bud, opened and emptied, dusted, bagged, then a pod
  const crossKey = [S.em, S.dab, S.ripen, S.open1].join();
  if (changed('cross', crossKey)) {
    const F = B.cross.flower, P = B.crossPod;
    B.cross.group.visible = true;
    F.setOpen(0.5);
    F.setShed(0);
    F.setKeelOpen(ph(S.em, 0.22, 0.34) * (1 - 0.6 * ph(day, 1, 4)));
    F.setAnthers(1 - ph(S.em, 0.34, 0.8, Ease.linear));
    F.setPollen(ph(S.dab, 0.3, 0.7));
    F.setWither(ph(day, 2, 7));
    F.group.visible = day < 9;
    P.group.visible = day > 3;
    P.setGrowth(ph(day, 4, 22));
    P.setDry(ph(day, 26, 38, Ease.linear));
  }

  // forceps: emasculate, then sow
  if (changed('forceps', [S.em, S.sow].join())) {
    const F = B.forceps, rest = restTip('forceps');
    B.anther.visible = false;
    if (S.em > 0 && S.em < 1) {
      const keel = flowerPt(B.cross, 'keel'), anth = flowerPt(B.cross, 'anthers');
      const t = trip(S.em, rest, keel, B.inBud);
      let tip = t.p;
      // five plucks, two anthers each, between 0.34 and 0.8: in, grip, out to the side, drop
      const w = (S.em - 0.34) / 0.46;
      if (w > 0 && w < 1) {
        const j = (w * 5) % 1;
        const out = anth.clone().addScaledVector(B.inBud, 0.6).add(V3(0, 0.6, 0));
        tip = j < 0.4 ? anth.clone().lerp(keel, 1 - ph(j, 0, 0.4)) : anth.clone().lerp(out, win(j, 0.4, 0.7, 0.85, 1));
        if (j > 0.45 && j < 0.92) { B.anther.visible = true; B.anther.position.copy(tip); }
      }
      toolAt(F, tip, t.hold, B.qBud);
      F.setOpen(S.em > 0.22 && S.em < 0.82 ? 0.25 + 0.2 * Math.sin(S.em * 60) ** 2 : 0);
    } else if (S.sow > 0 && S.sow < 1) {
      const u = S.sow * F1_POTS, k = Math.min(F1_POTS - 1, Math.floor(u)), w = u - k;
      const from = f1PeaHome(k), soil = soilOf(k);
      const p = track(w, [[0, k === 0 ? rest : soilOf(k - 1)], [0.2, up(from, 6)], [0.3, from], [0.4, up(from, 10)], [0.7, up(soil, 6)], [0.85, up(soil, -1.2)], [1, up(soil, 4)]], V3());
      toolAt(F, p, k === 0 ? ph(w, 0, 0.2) : 1, Q_DOWN);
      F.setOpen(win(w, 0.24, 0.3, 0.8, 0.86) > 0 && w < 0.32 ? 0.6 : 0);
    } else {
      toolAt(F, rest, 0, Q_REST);
      F.setOpen(0);
    }
    if (S.sow >= 1) { toolAt(F, rest, 0, Q_REST); F.setOpen(0); }
  }

  // brush: pollen from the yellow parent's open flower onto the emptied bud
  if (changed('brush', [S.pol, S.dab].join())) {
    const Br = B.brush, rest = restTip('brush');
    if (S.pol > 0 && S.pol < 1) {
      const at = flowerPt(B.donor, 'anthers'), t = trip(S.pol, rest, at, B.inDonor);
      const wig = win(S.pol, 0.22, 0.28, 0.76, 0.82) * Math.sin(S.pol * 70) * 0.25;
      toolAt(Br, t.p.add(V3(0, wig, 0)), t.hold, B.qDonor);
      Br.setPollen(ph(S.pol, 0.3, 0.75));
    } else if (S.dab > 0 && S.dab < 1) {
      const at = flowerPt(B.cross, 'stigma'), t = trip(S.dab, rest, at, B.inBud);
      const wig = win(S.dab, 0.22, 0.28, 0.76, 0.82) * Math.sin(S.dab * 70) * 0.2;
      toolAt(Br, t.p.add(V3(0, wig, 0)), t.hold, B.qBud);
      Br.setPollen(1 - 0.6 * ph(S.dab, 0.3, 0.7));
    } else {
      toolAt(Br, rest, 0, Q_REST);
      Br.setPollen(S.pol >= 1 && S.dab <= 0 ? 1 : S.dab >= 1 ? 0.4 : 0);
    }
  }

  // bag: from the tray, opened and turned mouth down over the flower, tied; off again to open the pod
  if (changed('bag', [S.bag, S.open1].join())) {
    const G = B.bag, rest = V3(TOOL.bag.x, TOOL_FLOOR, TOOL.bag.z), mouth = flowerPt(B.cross, 'keel').add(V3(0, 2.6, 0));   // over the flower, room below for the pod
    const over = up(mouth, 9);
    if (S.open1 > 0) {          // lifted off and laid back on the tray
      const k = ph(S.open1, 0, 0.18);
      G.group.position.copy(track(k, [[0, mouth], [0.3, over], [0.7, up(rest, 12)], [1, rest]], V3()));
      G.group.quaternion.copy(Q(Math.PI, 0, 0)).slerp(Q(-Math.PI / 2, 0, 0), ph(k, 0.4, 1));
      G.setOpen(1 - 0.5 * ph(k, 0.5, 1)); G.setTie(1 - ph(k, 0, 0.2));
    } else {
      const k = S.bag;
      G.group.position.copy(track(k, [[0, rest], [0.25, up(rest, 12)], [0.6, over], [0.85, mouth], [1, mouth]], V3()));
      G.group.quaternion.copy(Q(-Math.PI / 2, 0, 0)).slerp(Q(Math.PI, 0, 0), ph(k, 0.2, 0.55));
      G.setOpen(ph(k, 0.25, 0.5)); G.setTie(ph(k, 0.85, 1));
    }
    const host = S.bag >= 1 && S.open1 <= 0 ? 'green' : 'bag';
    if (B.where.bag !== host) { ix.addGroup(host, G.group); B.where.bag = host; }
  }

  // the cross pod: picked, laid in the F₁ dish, split, its peas rolled out
  if (changed('open1', [S.open1, day].join())) {
    const P = B.crossPod, k = S.open1;
    const moving = k > 0.18;
    reparent(P.group, moving ? root : B.podHome.parent, moving ? null : B.podHome);
    if (moving) {
      const hang = homeWorld(B.podHome);
      const lie = V3(POS.dishF1.x - 3, 1.2, POS.dishF1.z), q1 = Q(0, 0.2, Math.PI / 2);
      const w = ph(k, 0.18, 0.5);
      P.group.position.copy(track(w, [[0, hang.p], [0.3, up(hang.p, 6)], [0.75, up(lie, 10)], [1, lie]], V3()));
      P.group.quaternion.copy(hang.q).slerp(q1, ph(w, 0.2, 0.8));
    }
    P.setOpen(ph(k, 0.52, 0.66));
    R.f1.forEach((g, i) => {
      const pea = B.f1Peas[i], out = ph(k, 0.68 + i * 0.035, 0.8 + i * 0.035);
      P.setPeaVisible(i, out <= 0);
      if (out <= 0 || sownBy(i)) { if (!sownBy(i)) pea.group.visible = false; return; }
      pea.group.visible = true;
      const from = worldOf(P.group, P.peaLocal(i)), to = f1PeaHome(i);
      pea.group.position.lerpVectors(from, to, out);
      pea.group.position.y += Math.sin(Math.PI * out) * 1.5;
    });
  }

  // sowing: the forceps carry F₁ peas 0..3 into the pots
  if (changed('sow', S.sow)) {
    for (let i = 0; i < F1_POTS; i++) {
      const u = S.sow * F1_POTS - i, pea = B.f1Peas[i];
      if (S.open1 < 1) break;
      if (u <= 0.3) { pea.group.visible = true; pea.group.position.copy(f1PeaHome(i)); continue; }
      const soil = soilOf(i);
      if (u >= 0.85) { pea.group.visible = false; continue; }
      pea.group.visible = true;
      // in the forceps' tips while carried
      const tip = B.forceps.group.localToWorld(B.forceps.anchors.tip.clone());
      pea.group.position.copy(u < 0.85 ? tip : up(soil, -1.5));
    }
  }

  // the F₁ garden over S.week
  if (changed('garden', S.week)) {
    const d = S.week * 7;
    // shoot, leaves, the reproductive nodes by day 62; the leaves yellow as the last pods dry
    const g = d < 6 ? 0 : d < 42 ? 0.6 * ph(d, 6, 42, Ease.out) : d < 62 ? 0.6 + 0.2 * ph(d, 42, 62) : 0.8 + 0.2 * ph(d, FLOWER0 + 30, WEEKS * 7);
    B.f1.forEach((st, p) => {
      st.plant.group.visible = S.sow * F1_POTS - p >= 0.85;
      st.plant.setGrowth(g);
      st.plant.sites.forEach((site, s) => poseSite(site, d - (FLOWER0 + s * NODE_DAYS)));
    });
  }

  // shelling: each F₁ plant's pods to the sorting tray, split, peas sorted by colour
  if (changed('shell', S.shell.join() + '|' + S.order.join() + '|' + S.week)) poseShell();
  root.updateMatrixWorld(true);
}

const f1PeaHome = (i) => {
  const a = i * 2.399 + 0.6, r = 0.8 + 2.6 * Math.sqrt((i + 0.5) / 8);
  return V3(POS.dishF1.x + Math.cos(a) * r, 0.12 + B.f1Peas[i].r, POS.dishF1.z + Math.sin(a) * r);
};
const sownBy = (i) => i < F1_POTS && S.sow * F1_POTS - i > 0.3;
const soilOf = (p) => B.f1[p].group.localToWorld(B.f1[p].pot.anchors.soil.clone());
function reparent(obj, parent, home) {
  if (obj.parent === parent) return;
  parent.attach(obj);
  if (home) { obj.position.copy(home.p); obj.quaternion.copy(home.q); }
}
/** A home (local transform under its parent) in world space. */
function homeWorld(h) {
  h.parent.updateWorldMatrix(true, false);
  _m.compose(h.p, h.q, _s).premultiply(h.parent.matrixWorld);
  const p = V3(), q = new THREE.Quaternion(), s = V3();
  _m.decompose(p, q, s);
  return { p, q };
}

/* Sorting tray slots: yellow in the left half, green in the right, filled front to back. */
function slot(color, n) {
  const cols = 9, dx = 1.15, dz = 1.1;
  const c = n % cols, r = Math.floor(n / cols), layer = Math.floor(r / 11), rr = r % 11;
  const half = color === 'yellow' ? -1 : 1;
  const jit = Math.sin(n * 12.9898) * 0.18;
  return V3(POS.tray.x + half * (TRAY.w / 4) + (c - (cols - 1) / 2) * dx + jit + (layer ? 0.5 : 0),
    0.35 + 0.4 + layer * 0.7, POS.tray.z + TRAY.d / 2 - 1.1 - rr * dz + jit * 0.6);
}
const SH_POD = 1.05, SH_SPAN = 1.7;
const shellLen = () => (F1_SITES - 1) * SH_POD + SH_SPAN;
/** Tray counts so far: { yellow, green } over every pea that has landed. */
function counted() {
  const c = { yellow: 0, green: 0 };
  R.f2.forEach((plant, p) => plant.forEach((pod, s) => pod.forEach((g, i) => { if (peaLanded(p, s, i)) c[isYellow(g) ? 'yellow' : 'green']++; })));
  return c;
}
const podW = (p, s) => (S.shell[p] * shellLen() - s * SH_POD) / SH_SPAN;
const peaW = (p, s, i) => ph(podW(p, s), 0.44 + i * 0.045, 0.62 + i * 0.045, Ease.linear);
const peaLanded = (p, s, i) => peaW(p, s, i) >= 1;

function poseShell() {
  const over = V3(POS.tray.x, 9, POS.tray.z - 2);
  const n = { yellow: 0, green: 0 };
  // a pile of empty pods, filled in the order the plants were shelled, so nothing jumps
  const husk = (k) => V3(POS.husks.x + Math.cos(k * 2.4) * (1 + k * 0.12), 0.7 + (k % 3) * 0.25, POS.husks.z + Math.sin(k * 2.4) * (1 + k * 0.12) * 0.7);
  const plants = [...S.order, ...R.f2.map((x, p) => p).filter((p) => !S.order.includes(p))];
  plants.forEach((p, rank) => R.f2[p].forEach((pod, s) => {
    const P = B.f1[p].plant.sites[s].pod, home = B.f2Home[p][s], w = podW(p, s);
    const moving = w > 0;
    reparent(P.group, moving ? root : home.parent, moving ? null : home);
    if (moving) {
      const hang = homeWorld(home);
      const qLie = Q(0, 0.15 * s, Math.PI / 2);
      const end = husk(rank * F1_SITES + s);
      if (w < 0.8) {
        const k = ph(w, 0, 0.3);
        P.group.position.copy(track(k, [[0, hang.p], [0.25, up(hang.p, 4)], [1, over]], V3()));
        P.group.quaternion.copy(hang.q).slerp(qLie, ph(k, 0.2, 0.9));
      } else {
        const k = ph(w, 0.8, 1);
        P.group.position.copy(track(k, [[0, over], [0.5, up(end, 5)], [1, end]], V3()));
        P.group.quaternion.copy(qLie).multiply(Q(0, 0, k * 0.8 * (s % 2 ? 1 : -1)));
      }
      P.setOpen(ph(w, 0.3, 0.42));
    } else P.setOpen(0);
    pod.forEach((g, i) => {
      const color = isYellow(g) ? 'yellow' : 'green', k = peaW(p, s, i);
      P.setPeaVisible(i, k <= 0);
      if (k <= 0) return;
      const m = B.inst[color === 'yellow' ? 0 : 1], idx = n[color]++;
      const to = slot(color, idx);
      const from = moving ? worldOf(P.group, P.peaLocal(i)) : to;
      _a.lerpVectors(from, to, k);
      _a.y += Math.sin(Math.PI * k) * 3;
      _q.setFromEuler(new THREE.Euler(idx * 1.7, idx * 2.3, 0));
      _m.compose(_a, _q, _s);
      m.setMatrixAt(idx, _m);
    });
  }));
  B.inst[0].count = n.yellow; B.inst[1].count = n.green;
  B.inst.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
}

// =========================================================================
// The panel: counts, predictions, the question, the Punnett square
// =========================================================================
const P = T.panel;
const ratio = (y, g) => (g ? fmt(P.ratioFmt, { r: (y / g).toFixed(2) }) : '–');
const PUN = { rows: ['Y', 'y'], cols: ['Y', 'y'] };      // egg alleles down the side, pollen across
const PUN_CYCLE = [null, 'YY', 'Yy', 'yy'];
const punRight = (i) => geno(PUN.rows[Math.floor(i / 2)], PUN.cols[i % 2]);
const punDone = () => ANS.cells.every((c, i) => c === punRight(i));

function buildPanel() {
  $('#peaPanel').innerHTML = `
    <div class="panel-head"><span class="panel-title"><i class="ph ph-plant"></i>${P.title}</span><span class="clock" id="peaClock"></span></div>
    <table class="pea-table">
      <thead><tr><th>${P.gen}</th><th><i class="dot y"></i>${P.yellow}</th><th><i class="dot g"></i>${P.green}</th><th>${P.ratio}</th></tr></thead>
      <tbody>
        <tr data-r="p"><td>${P.p}</td><td colspan="3" class="muted">${P.allYellow} · ${P.allGreen}</td></tr>
        <tr data-r="f1"><td>${P.f1}</td><td data-k="y"></td><td data-k="g"></td><td data-k="r"></td></tr>
        <tr data-r="f2"><td>${P.f2}</td><td data-k="y"></td><td data-k="g"></td><td data-k="r"></td></tr>
        <tr data-r="mendel"><td>${P.mendel}</td><td>${MENDEL.yellow.toLocaleString()}</td><td>${MENDEL.green.toLocaleString()}</td><td>${ratio(MENDEL.yellow, MENDEL.green)}</td></tr>
      </tbody>
    </table>
    <div class="pea-ask" id="askGuess1" hidden>${askHTML('guess1', P.guess1)}</div>
    <div class="pea-ask" id="askPredict" hidden>${askHTML('predict', P.predict)}</div>
    <div class="pea-ask" id="askCount" hidden>${askHTML('count', P.count)}
      <button type="button" class="pea-garden" id="peaGarden" hidden>${P.garden}</button><p class="pea-note" id="peaGardenNote"></p></div>
    <div class="pea-punnett" id="peaPunnett" hidden>
      <p class="pun-title">${P.punnett.title} <span>${P.punnett.parent} × ${P.punnett.parent}</span></p>
      <div class="pun-grid">
        <span class="pun-corner"><small>${P.punnett.egg} ↓</small><small>${P.punnett.pollen} →</small></span>
        ${PUN.cols.map((a) => `<span class="pun-head a-${a}">${a}</span>`).join('')}
        ${PUN.rows.map((r, ri) => `<span class="pun-head a-${r}">${r}</span>${PUN.cols.map((c, ci) => `<button type="button" class="pun-cell" data-i="${ri * 2 + ci}"></button>`).join('')}`).join('')}
      </div>
      <p class="pea-verdict" id="punVerdict"></p>
    </div>`;
  $('#peaPanel').addEventListener('click', (ev) => {
    const a = ev.target.closest('button[data-a]');
    if (a) return answer(a.dataset.q, a.dataset.a);
    const c = ev.target.closest('.pun-cell');
    if (c && canPunnett()) {
      const i = +c.dataset.i;
      ANS.cells[i] = PUN_CYCLE[(PUN_CYCLE.indexOf(ANS.cells[i]) + 1) % PUN_CYCLE.length];
      panelKey = '';
      if (punDone() && lesson.step === STEP_IDS.indexOf('punnett')) lesson.jumpTo(lesson.step + 1);
      return;
    }
    if (ev.target.closest('#peaGarden')) { growGarden(); panelKey = ''; }
  });
}
function askHTML(q, A) {
  return `<p>${A.ask}</p><div class="pea-answers">${Object.entries(A.answers).map(([k, t]) => `<button type="button" data-q="${q}" data-a="${k}">${t}</button>`).join('')}</div><p class="pea-verdict" data-v="${q}"></p>`;
}
const asking = (q) => lesson && lesson.mode !== 'watch' && stepId() === q;
const canPunnett = () => asking('punnett');
function answer(q, a) {
  if (!asking(q)) return;
  ANS[q] = a;
  panelKey = '';
  const right = q !== 'count' || a === 'quarter';
  if (right) lesson.jumpTo(lesson.step + 1);
}
/** Mendel's sample size of the same cross: each pea yellow unless both alleles are y. */
function growGarden() {
  const n = MENDEL.yellow + MENDEL.green;
  let g = 0;
  for (let i = 0; i < n; i++) if (rand() < 0.5 && rand() < 0.5) g++;
  ANS.garden = { n, y: n - g, g };
}

let panelKey = '';
function renderPanel() {
  if (!S) return;
  const c = counted(), id = stepId(), i = lesson.step;
  const f1Shown = S.open1 >= 0.8;
  const clock = id === 'ripen' && S.ripen > 0 ? fmt(T.steps.ripen.clock, { d: Math.round(S.ripen * DAYS) })
    : id === 'grow' ? fmt(T.steps.grow.clock, { w: Math.floor(S.week) }) : '';
  const key = JSON.stringify([c, f1Shown, i, lesson.mode, ANS, clock]);
  if (key === panelKey) return;
  panelKey = key;
  $('#peaClock').textContent = clock;
  const row = (r) => $(`#peaPanel tr[data-r="${r}"]`);
  const fill = (r, y, g, show) => {
    const e = row(r);
    e.querySelector('[data-k="y"]').textContent = show ? y : '–';
    e.querySelector('[data-k="g"]').textContent = show ? g : '–';
    e.querySelector('[data-k="r"]').textContent = show ? (g ? ratio(y, g) : P.allYellow) : '–';
  };
  fill('f1', R.f1.length, 0, f1Shown);
  const shelling = c.yellow + c.green > 0;
  fill('f2', c.yellow, c.green, shelling);
  row('f2').classList.toggle('live', id === 'shell');
  row('mendel').hidden = i < STEP_IDS.indexOf('count');

  const showAsk = (el, q, from) => {
    el.hidden = i < STEP_IDS.indexOf(from);
    el.classList.toggle('asking', asking(q));
    el.classList.toggle('done', !!ANS[q] && i > STEP_IDS.indexOf(q));    // answered and moved on: the result line only
    el.querySelectorAll('button[data-a]').forEach((b) => { b.classList.toggle('on', ANS[q] === b.dataset.a); b.disabled = !asking(q); });
  };
  showAsk($('#askGuess1'), 'guess1', 'guess1');
  showAsk($('#askPredict'), 'predict', 'predict');
  showAsk($('#askCount'), 'count', 'count');
  $('#askGuess1').hidden ||= i > STEP_IDS.indexOf('sow');
  const said = (q, A) => (ANS[q] ? fmt(P.yourGuess, { a: A.answers[ANS[q]] }) : '');
  $('[data-v="guess1"]').innerHTML = said('guess1', P.guess1);
  $('[data-v="predict"]').innerHTML = said('predict', P.predict);
  const vc = $('[data-v="count"]'), n = c.yellow + c.green;
  if (ANS.count) {
    const right = ANS.count === 'quarter';
    vc.innerHTML = right ? fmt(P.count.right, { g: c.green, n, pct: Math.round((100 * c.green) / n), mg: MENDEL.green.toLocaleString(), mn: (MENDEL.yellow + MENDEL.green).toLocaleString() })
      : fmt(P.count.wrong, { g: c.green, n });
    vc.className = 'pea-verdict ' + (right ? 'ok' : 'no');
  } else vc.innerHTML = '';
  $('#peaGarden').hidden = ANS.count !== 'quarter' || !!ANS.garden;
  $('#peaGardenNote').innerHTML = ANS.garden ? fmt(P.gardenNote, { n: ANS.garden.n.toLocaleString(), y: ANS.garden.y.toLocaleString(), g: ANS.garden.g.toLocaleString() }) + ' ' + ratio(ANS.garden.y, ANS.garden.g) : '';

  const pun = $('#peaPunnett');
  pun.hidden = i < STEP_IDS.indexOf('punnett');
  pun.classList.toggle('asking', canPunnett());
  const done = punDone() || (lesson.mode === 'watch' && i >= STEPS.length);
  pun.querySelectorAll('.pun-cell').forEach((b) => {
    const g = done ? punRight(+b.dataset.i) : ANS.cells[+b.dataset.i];
    b.innerHTML = g ? `<i class="pea ${isYellow(g) ? 'y' : 'g'}"></i>${g}` : '';
    b.disabled = !canPunnett();
    b.classList.toggle('wrong', !!g && !done && ANS.cells.every(Boolean) && g !== punRight(+b.dataset.i));
  });
  const pv = $('#punVerdict');
  pv.innerHTML = done ? P.punnett.done : ANS.cells.every(Boolean) ? P.punnett.wrong : '';
  pv.className = 'pea-verdict ' + (done ? 'ok' : 'no');
  $('#peaPanel').classList.toggle('has-ask', ['guess1', 'predict', 'count', 'punnett'].some(asking));
}

// =========================================================================
// Steps
// =========================================================================
const C = Object.fromEntries(Object.entries(T.steps).map(([k, v]) => [k, v.captions]));
const card = (id, vars = {}) => {
  const { title, short, action, hint, detail, why } = T.steps[id];
  const f = (s) => (s === undefined ? undefined : fmt(s, vars));
  return Object.fromEntries(Object.entries({ title, short, action, hint: f(hint), detail: f(detail), why: f(why) }).filter(([, v]) => v !== undefined));
};
const go = (key, dur) => anim(dur, (e, k) => { S[key] = k; }, Ease.linear);
const panelStep = (id, vars, extra = {}) => ({
  id, ...card(id, vars), targets: [], view: extra.view || 'overview', caption: T.steps[id].caption,
  isDone: () => lesson.mode === 'watch' || (ANS[id] != null && (id !== 'count' || ANS.count === 'quarter')),
  progress: () => (ANS[id] ? 1 : 0), ...extra,
});
const shellDone = (p) => S.shell[p] >= 1;
const nShelled = () => S.shell.filter((v) => v >= 1).length;

const STEPS = [
  { id: 'emasculate', ...card('emasculate', { n: ANTHERS }), targets: ['green', 'forceps'], view: 'bud',
    caption: () => (S.em < 0.34 ? C.emasculate.open : C.emasculate.pull),
    run: () => go('em', 6.5) },
  { id: 'pollen', ...card('pollen'), targets: ['yellow', 'brush'], view: 'donor', caption: T.steps.pollen.caption,
    run: () => go('pol', 4.2) },
  { id: 'pollinate', ...card('pollinate'), targets: ['green', 'brush'], view: 'bud', caption: T.steps.pollinate.caption,
    run: () => go('dab', 4.2) },
  { id: 'bag', ...card('bag'), targets: ['bag'], view: 'bud', caption: T.steps.bag.caption,
    run: () => go('bag', 3.4) },
  { id: 'ripen', ...card('ripen', { days: DAYS }), targets: ['green', 'bag'], view: 'pod',
    clock: () => (S.ripen > 0 ? fmt(T.steps.ripen.clock, { d: Math.round(S.ripen * DAYS) }) : null),
    caption: () => (S.ripen < 0.6 ? C.ripen.swell : C.ripen.dry),
    run: () => go('ripen', 6) },
  panelStep('guess1', {}, { view: 'pod' }),
  { id: 'open1', ...card('open1'), targets: ['green', 'bag'], view: 'dish',
    caption: () => (S.open1 < 0.5 ? C.open1.pick : S.open1 < 0.68 ? C.open1.open : C.open1.peas),
    run: () => go('open1', 6) },
  { id: 'sow', ...card('sow', { n: F1_POTS }), targets: ['dishF1'], view: 'pots', caption: T.steps.sow.caption,
    run: () => go('sow', 7) },
  { id: 'grow', ...card('grow', { weeks: WEEKS }), targets: [], view: 'pots',
    clock: () => fmt(T.steps.grow.clock, { w: Math.floor(S.week) }),
    caption: () => {
      const d = S.week * 7, c = C.grow;
      return d < 12 ? c.sprout : d < FLOWER0 - 2 ? c.leaves : d < FLOWER0 + 12 ? c.flower : d < FLOWER0 + 30 ? c.pods : c.dry;
    },
    watch: { duration: WEEKS, get: () => S.week, set: (w) => { S.week = w; }, rate: () => WEEKS / 14 } },
  panelStep('predict', {}, { view: 'pots' }),
  { id: 'shell', ...card('shell'), view: 'tray',
    hint: () => (nShelled() === 0 ? T.steps.shell.hint : fmt(T.steps.shell.hintMore, { n: nShelled(), total: F1_POTS })),
    targets: B_KEYS(),
    activeTargets: () => B_KEYS().filter((k, p) => !shellDone(p) && S.shell[p] <= 0),
    run: (key) => { const p = +key.slice(3); S.order.push(p); return anim(shellLen() * 1.05, (e, k) => { S.shell[p] = k; }, Ease.linear); },
    isDone: () => nShelled() === F1_POTS,
    progress: () => nShelled() / F1_POTS,
    caption: () => C.shell.sort },
  panelStep('count', { mendel: (MENDEL.yellow + MENDEL.green).toLocaleString() }, { view: 'tray' }),
  panelStep('punnett', {}, { view: 'tray', isDone: () => lesson.mode === 'watch' || punDone(), progress: () => ANS.cells.filter((c, i) => c === punRight(i)).length / 4 }),
];
function B_KEYS() { return F1_X.map((x, p) => 'f1_' + p); }
STEPS.find((s) => s.id === 'count').detail = () => fmt(T.steps.count.detail, { n: R ? R.f2.flat(2).length : 0, mendel: (MENDEL.yellow + MENDEL.green).toLocaleString() });
const PHASES = [
  { ...T.phases.cross, icon: 'ph-flower', steps: ['emasculate', 'pollen', 'pollinate', 'bag'] },
  { ...T.phases.f1, icon: 'ph-circles-three', steps: ['ripen', 'guess1', 'open1'] },
  { ...T.phases.grow, icon: 'ph-plant', steps: ['sow', 'grow'] },
  { ...T.phases.f2, icon: 'ph-hash', steps: ['predict', 'shell', 'count'] },
  { ...T.phases.explain, icon: 'ph-grid-four', steps: ['punnett'] },
];

// =========================================================================
// Wire it together
// =========================================================================
const SHORT = { emasculate: 'bud', pollinate: 'bud', ripen: 'pod', open1: 'pod' };
let firstEnter = true;
lesson = createLesson({
  steps: STEPS,
  phases: PHASES,
  rebuild,
  panel: $('#stepsPanel'),
  zoom,
  levelCaption: zoom.caption,
  completeHint: T.complete.hint,
  completeWhy: T.complete.why,
  completeCaption: T.complete.caption,
  onEnter: (step) => {
    requestAnimationFrame(() => stage.resize());
    panelKey = '';
    zoom.onStep();
    if (step && ix.objects.green) {
      const s = SHORT[step.id];
      ix.objects.green.short = s ? T.objects[s].short : T.objects.potGreen.short;
      if (s === 'pod') ix.objects.green.anchor.copy(B.green.group.worldToLocal(VIEWS.pod.t.clone()));
    }
    if (!step) { stage.focus('done', 1.6); toast(T.complete.toast, { icon: 'ph-plant' }); return; }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; }
    stage.focus(step.view);
  },
});
ix = createInteraction(stage, {
  targets: lesson.targets,
  busy: lesson.isBusy,
  onClick: lesson.click,
  status: lesson.status,
  zoom,
  markerStyle: new URLSearchParams(location.search).get('marker') || 'circle',
});
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting,
  watching: () => lesson.mode === 'watch',
  rig: { t: V3(-5, 13, -5), p: V3(-5, 76, 124) },
  special: ['bud', 'donor', 'pod', 'done'],
});

function restart() {
  newSession();
  Object.assign(ANS, { guess1: null, predict: null, count: null, cells: [null, null, null, null], garden: null });
  firstEnter = false;
  lesson.restart();
}

buildPanel();
stage.onFrame((dt) => {
  lesson.update(dt);
  follow.update(dt);
  zoom.update(dt);
  if (S) { pose(); renderPanel(); }
  ix.update();
});

const intro = createIntro(stage);
bindChrome({ stage, restart, expose: { get S() { return S; }, get B() { return B; }, get R() { return R; }, zoomState, ANS, lesson, ix, stage, follow, zoom, STEPS, intro, counted } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
