/* Fruit fly genetics: Morgan's white-eye cross, both ways, then the F₂ of the first.
 * Knock out two stocks, pick virgin females and males under the stereo microscope, start
 * vials A (red ♀ × white ♂) and B (white ♀ × red ♂), raise and sort their F₁, cross A's F₁ in
 * vial C, raise and sort the F₂, then test autosomal against X-linked inheritance.
 *
 * Bench state is S, recreated by rebuild(): one 0..1 progress per hand action, the vials'
 * calendars S.dayAB and S.dayC in days, and the click order of every multi-click step. pose()
 * places everything from S alone, so replays and scrubbing agree. Every fly of the session is
 * drawn once (R). How the student sorted each set under the microscope lives in SORT, off the
 * bench, as answers to questions do in ANS. */
import * as THREE from 'three';
import {
  V3, Q, clamp, smooth, Ease, anim, newSession, reseed, rand, disposeTree, toast, isInstant, worldOf,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, createIntro, createZoom, chromeInsets, bindChrome, PHONE,
  makeBench, makeTubeRack, makeBrush, T, fmt,
  makeFlyVial, makeFlySwarm, makeFlyPad, makeCO2Gun, makeStereoScope, makeMorgue,
} from '../lab.js';
import { createStereoView } from './stereo.js';
import { createCell } from './cell.js';
import { createMolecule } from './molecule.js';

const $ = (s) => document.querySelector(s);
const ph = (t, a, b, ease = Ease.inOut) => ease(clamp((t - a) / (b - a)));

// =========================================================================
// The science
// =========================================================================
/* 25 °C: egg 1 day, larva ~4.5, pupa ~4.5. Parents out on day 7, before the first offspring
 * emerge (~day 9.5); count on day 12. */
const CLEAR_DAY = 7, COUNT_DAY = 12;
const PAIRS = 3;          // virgin females and males per parental vial
const F1_PAIRS = 5;       // F₁ females and males into vial C
const STOCK = 5;          // flies of each sex per stock on the pad
const STOCK_DAY = 8.5, STOCK_BROOD = 30;   // a stock vial is a lived-in culture: its next brood are pupae
const MORGAN = { fRed: 2459, fWhite: 0, mRed: 1011, mWhite: 782 };   // Morgan 1910, F₂ of the red ♀ × white ♂ cross
const CHI_CRIT = { 2: 5.991, 3: 7.815 };                            // χ² at p = 0.05

const eyeOf = (g) => (g.includes('W') ? 'red' : 'white');
/** A fly from one X allele of its mother and one X allele or Y of its father. */
function child(eggX, spermXorY) {
  const female = spermXorY !== 'Y';
  const geno = female ? (eggX === 'W' || spermXorY !== 'W' ? eggX + spermXorY : spermXorY + eggX) : eggX + 'Y';
  return { sex: female ? 'f' : 'm', geno, eye: eyeOf(geno.replace('Y', '')) };
}

/** Every fly of the session, each with an id (its swarm slot). */
function drawFlies() {
  reseed('flies');
  const all = [];
  const add = (src, f) => { const fly = { id: all.length, src, ...f, emerge: 9.5 + rand() * 2.2 }; all.push(fly); return fly; };
  const n = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = (a) => a[rand() < 0.5 ? 0 : 1];
  const stock = (src, g) => { for (let i = 0; i < STOCK * 2; i++) add(src, i % 2 ? { sex: 'm', geno: g + 'Y', eye: eyeOf(g) } : { sex: 'f', geno: g + g, eye: eyeOf(g) }); };
  stock('W', 'W'); stock('w', 'w');
  const brood = (src, mom, dad, count) => { for (let i = 0; i < count; i++) add(src, child(pick(mom), pick(dad))); };
  brood('A', ['W', 'W'], ['w', 'Y'], n(28, 36));
  brood('B', ['w', 'w'], ['W', 'Y'], n(28, 36));
  brood('C', ['W', 'w'], ['W', 'Y'], n(84, 104));
  const of = (src) => all.filter((f) => f.src === src);
  return { all, of, W: of('W'), w: of('w'), A: of('A'), B: of('B'), C: of('C') };
}

// =========================================================================
// Sorting: the piles each set goes into, and what the student did (SORT)
// =========================================================================
const P = T.panel, SC = T.scope;

const fits = (sex, eye) => (f) => f.sex === sex && f.eye === eye;
/** What to look at again when a fly lands in the wrong pile. */
const pileHint = (eye) => (f) => (f.eye !== eye ? P.hints.eye : f.sex === 'f' ? P.hints.female : P.hints.male);
const COLORS = { fRed: '#be123c', fWhite: '#a8a29e', mRed: '#9f1239', mWhite: '#78716c', A: '#e11d48', B: '#2563eb' };
const COUNT_PILES = [
  { key: 'fRed', label: P.fRed, color: COLORS.fRed, fits: fits('f', 'red') },
  { key: 'fWhite', label: P.fWhite, color: COLORS.fWhite, fits: fits('f', 'white') },
  { key: 'mRed', label: P.mRed, color: COLORS.mRed, fits: fits('m', 'red') },
  { key: 'mWhite', label: P.mWhite, color: COLORS.mWhite, fits: fits('m', 'white') },
].map((p) => ({ ...p, hint: pileHint(p.key.endsWith('Red') ? 'red' : 'white') }));
const PARENT_PILES = [
  { key: 'Af', label: P.Af, color: COLORS.A, fits: fits('f', 'red') },
  { key: 'Am', label: P.Am, color: COLORS.A, fits: fits('m', 'white') },
  { key: 'Bf', label: P.Bf, color: COLORS.B, fits: fits('f', 'white') },
  { key: 'Bm', label: P.Bm, color: COLORS.B, fits: fits('m', 'red') },
].map((p) => ({ ...p, cap: PAIRS, hint: pileHint(p.key === 'Af' || p.key === 'Bm' ? 'red' : 'white') }));

const SORT = { parents: null, A: null, B: null, C: null };
const ANS = { predict1: null, predict2: null, test: null, cells: [null, null, null, null] };
const SETS = { parents: () => [...R.W, ...R.w], A: () => R.A, B: () => R.B, C: () => R.C };
const pilesOf = (set) => (set === 'parents' ? PARENT_PILES : COUNT_PILES);

/** Sort a set the way a careful student would: each fly to the first pile that fits and has room. */
function autoSort(set) {
  const piles = pilesOf(set), out = Object.fromEntries(piles.map((p) => [p.key, []]));
  SETS[set]().forEach((f) => { const p = piles.find((q) => q.fits(f) && out[q.key].length < (q.cap ?? Infinity)); if (p) out[p.key].push(f.id); });
  return out;
}
/** A set's sorting: the student's, or, for a step replayed or skipped, the careful sort (S.auto). */
const sortOf = (set) => (S && S.auto[set] && !sortComplete(set) ? autoSort(set) : SORT[set]);
const sortDone = (set) => (S && S.auto[set]) || sortComplete(set);
const sortComplete = (set) => {
  const s = SORT[set];
  if (!s) return false;
  const piles = pilesOf(set), n = piles.reduce((a, p) => a + (s[p.key] || []).length, 0);
  return set === 'parents' ? piles.every((p) => (s[p.key] || []).length >= p.cap) : n >= SETS[set]().length;
};
/** Tallies of a sorted set: { fRed, fWhite, mRed, mWhite }. */
const tally = (set) => {
  const s = sortOf(set) || {};
  return Object.fromEntries(COUNT_PILES.map((p) => [p.key, (s[p.key] || []).length]));
};
const pileOf = (set, id) => { const s = sortOf(set); if (!s) return null; for (const k in s) if (s[k].includes(id)) return k; return null; };

// =========================================================================
// Layout and views
// =========================================================================
const POS = {
  stocks: V3(-24, 0, 0), scope: V3(0, 0, -12), vials: V3(24, 0, 0),
  gun: V3(-6, 0, 13), brush: V3(5, 0, 4), morgue: V3(8, 0, 14),
};
const LIE = { A: V3(22, 0, 9), B: V3(22, 0, 12.5), C: V3(22, 0, 16) };   // vials on their sides while the parents wake
const VIEWS = {
  overview: { t: V3(0, 7, 0), p: V3(0, 58, 92) },
  stocks: { t: V3(-14, 6, 2), p: V3(-14, 38, 56) },
  pad: { t: V3(), p: V3() },          // filled from the scope once it is built
  vials: { t: V3(14, 6, 2), p: V3(14, 38, 56) },
  culture: { t: V3(), p: V3() },     // close on the rack of crosses, filled once it is built
  done: { t: V3(4, 8, 0), p: V3(4, 52, 82) },
};

// =========================================================================
// Stage and zoom levels
// =========================================================================
const PANEL_W = 340;
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  controls: { minDistance: 4, maxDistance: 160 },
  insets: (w, h) => {
    const r = chromeInsets(w, h, { bottom: w > PHONE ? [] : ['.fly-panel'] });
    if (w > PHONE) r.right = Math.min(PANEL_W + 24, w * 0.3);
    return r;
  },
});
const mat = createMaterials(stage);

let S = null, B = null, R = null, root = null;
let lesson, ix;

const STEP_IDS = ['knock', 'sort', 'setup', 'predict1', 'wait1', 'clear1', 'hatch1', 'count1', 'mate2', 'predict2', 'wait2', 'clear2', 'hatch2', 'count2', 'test', 'punnett'];
const stepId = () => (lesson && STEPS[lesson.step] ? STEPS[lesson.step].id : null);
const stepAt = (id) => STEP_IDS.indexOf(id);

/** What the zoom levels show (CONTRACT.md "Zoom levels"). */
function zoomState() {
  const id = stepId(), i = lesson ? lesson.step : 0;
  const Z = { step: id, vial: 'B', mother: ['w', 'w'], father: ['W', 'Y'], meiosis: 0, fert: 0, pick: [0, 1], grid: 0, pigment: 0 };
  if (!S) return Z;
  if (i < stepAt('mate2')) {
    Z.meiosis = i <= stepAt('setup') ? clamp(S.setup.A * 0.5 + S.setup.B * 0.5) : 1;
    Z.fert = ph(S.dayAB, 0, 1, Ease.linear);
    Z.pigment = ph(S.dayAB, 7.5, 9.5, Ease.linear);
    return Z;
  }
  Object.assign(Z, { vial: 'C', mother: ['W', 'w'], father: ['W', 'Y'], pick: [1, 1] });
  Z.meiosis = clamp(S.mate2 * 2);
  Z.fert = ph(S.dayC, 0, 1, Ease.linear);
  Z.pigment = ph(S.dayC, 7.5, 9.5, Ease.linear);
  Z.grid = id === 'punnett' || id === null ? 1 : 0;
  return Z;
}
const zoom = createZoom(stage, {
  levels: [
    { key: 'cell', world: createCell(stage.env, { stepIds: STEP_IDS }), name: T.levels.cell.name, meta: T.levels.cell.meta, bg: '#eef1f7' },
    { key: 'mol', world: createMolecule(stage.env, { stepIds: STEP_IDS }), name: T.levels.mol.name, meta: T.levels.mol.meta, bg: '#edf0f5' },
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
const VIAL_KEYS = ['W', 'w', 'A', 'B', 'C'];
const IX_KEY = { W: 'stockW', w: 'stockw', A: 'vialA', B: 'vialB', C: 'vialC' };

function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group();
  stage.scene.add(root);
  R = drawFlies();
  S = {
    knock: { W: 0, w: 0 }, setup: { A: 0, B: 0 }, sweep: 0, dayAB: 0, clear1: { A: 0, B: 0 },
    count: { A: 0, B: 0, C: 0 }, mate2: 0, dayC: 0, clear2: 0,
    order: { knock: [], setup: [], clear1: [], count1: [] }, auto: {}, key: {},
  };

  place(makeBench(mat), V3());
  const scope = place(makeStereoScope(mat), POS.scope);
  const pad = makeFlyPad(mat);
  pad.group.position.copy(scope.anchors.stage);
  scope.group.add(pad.group);
  const rackS = place(makeTubeRack(mat, { holes: 2, spacing: 3.4 }), POS.stocks);
  const rackV = place(makeTubeRack(mat, { holes: 3, spacing: 3.4 }), POS.vials);
  const label = (k) => ({ label: T.props[k], sub: T.props[k + 'sub'] });
  const vials = {
    W: makeFlyVial(mat, { ...label('stockW'), seed: 1 }),
    w: makeFlyVial(mat, { ...label('stockw'), seed: 2 }),
    A: makeFlyVial(mat, { ...label('vialA'), seed: 3 }),
    B: makeFlyVial(mat, { ...label('vialB'), seed: 4 }),
    C: makeFlyVial(mat, { ...label('vialC'), seed: 5 }),
  };
  const home = {};
  [['W', rackS, 0], ['w', rackS, 1], ['A', rackV, 0], ['B', rackV, 1], ['C', rackV, 2]].forEach(([k, rack, h]) => {
    root.add(vials[k].group);
    rack.group.updateMatrixWorld(true);
    home[k] = rack.group.localToWorld(rack.holes[h].clone());
  });
  const gun = place(makeCO2Gun(mat), V3());
  const brush = place(makeBrush(mat), V3());
  const morgue = place(makeMorgue(mat, { label: T.props.morgue }), POS.morgue);
  const swarm = makeFlySwarm(mat, R.all.length);
  root.add(swarm.group);

  B = { scope, pad, vials, home, gun, brush, morgue, swarm, rackS, rackV };
  root.updateMatrixWorld(true);
  B.padTop = worldOf(pad.group, pad.anchors.top);
  B.morgueTop = worldOf(morgue.group, morgue.anchors.top);
  VIEWS.pad.t.copy(B.padTop);
  VIEWS.pad.p.copy(B.padTop).add(V3(3, 30, 38));
  VIEWS.culture.t.copy(B.home.B).add(V3(0, 5, 0));
  VIEWS.culture.p.copy(B.home.B).add(V3(-2, 13, 25));

  ix.register('stockW', vials.W.group, { ...objText('stockW') });
  ix.register('stockw', vials.w.group, { ...objText('stockw') });
  ix.register('vialA', vials.A.group, { ...objText('vialA') });
  ix.register('vialB', vials.B.group, { ...objText('vialB') });
  ix.register('vialC', vials.C.group, { ...objText('vialC') });
  ix.register('scope', scope.group, { ...objText('scope') });
  ix.register('gun', gun.group, { ...objText('gun') });
  ix.register('brush', brush.group, { ...objText('brush') });
  ix.register('morgue', morgue.group, { ...objText('morgue') });

  pose(true);
}

// =========================================================================
// pose(): the bench from S
// =========================================================================
const _q = new THREE.Quaternion(), _a = V3(), _b = V3();
const up = (p, dy) => V3(p.x, p.y + dy, p.z);
const X_AXIS = V3(1, 0, 0);
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

/* A vial's knock-out-and-tip action, k in 0..1: the CO₂ needle in beside the plug (0–0.28),
   out (0.28–0.36), the vial lifted over `dest` and unplugged (0.36–0.55), tipped (0.55–0.82),
   back in the rack plugged (0.82–1). Flies leave the mouth from 0.62 to 0.8. */
const KO = { in: [0, 0.28], out: [0.28, 0.36], lift: [0.36, 0.55], tip: [0.55, 0.82], back: [0.82, 1], pour: [0.62, 0.8] };
const LIE_Q = Q(0, 0, Math.PI / 2);            // on its side on the bench, mouth to the left
const HOLD_Q = Q(-Math.PI / 2, 0, 0);          // held on its side, mouth toward the back (into the pad)
const POUR_ANGLE = 2.1;

/** Where the vial is: its world position and rotation from every action that moves it. */
function vialPose(k) {
  const V = B.vials[k], g = V.group, rest = B.home[k], mouthL = V.anchors.mouth;
  let pos = rest.clone(), q = new THREE.Quaternion(), plug = 0;
  /** The vial turned by q with its mouth at m (world). */
  const mouthAt = (m, rot) => { q.copy(rot); pos.copy(m).sub(mouthL.clone().applyQuaternion(rot)); };
  /* A pour onto the pad or into the morgue: carried upright to a point in front of `dest`, then
     tipped toward the back with its mouth sliding in over dest, so the body stays clear of the
     microscope head. */
  const pour = (a, dest) => {
    if (a <= KO.lift[0] || a >= 1) return;
    plug = ph(a, KO.lift[0] + 0.05, KO.lift[1]) * (1 - ph(a, KO.back[0], KO.back[0] + 0.08));
    const move = a < KO.back[0] ? ph(a, KO.lift[0], KO.lift[1]) : 1 - ph(a, KO.back[0], KO.back[1]);
    const tilt = a < KO.back[0] ? ph(a, KO.tip[0], KO.tip[0] + 0.14) : 1 - ph(a, KO.back[0], KO.back[0] + 0.1);
    const target = dest.clone().add(V3(0, 1.6, 0.6)), staging = target.clone().add(V3(0, 5, 8));
    const restMouth = rest.clone().add(mouthL);
    _q.setFromAxisAngle(X_AXIS, -POUR_ANGLE * tilt);
    const m = V3().lerpVectors(staging, target, tilt);
    if (move < 1) m.lerpVectors(restMouth, staging, move).add(V3(0, Math.sin(Math.PI * move) * 5, 0));
    mouthAt(m, _q);
  };
  const padSpot = (dx) => B.padTop.clone().add(V3(dx, 0, 0));
  if (k === 'W' || k === 'w') pour(S.knock[k], padSpot(k === 'W' ? -1.5 : 1.5));
  else {
    const set = k === 'C' ? S.mate2 : S.setup[k];
    const day = k === 'C' ? S.dayC : S.dayAB;
    // brushing parents in: held on its side, mouth at the pad's front edge; then laid on the bench
    if (set > 0 && (k === 'C' ? S.clear2 <= 0 : S.clear1[k] <= 0)) {
      const w = k === 'C' ? clamp(set / 0.8) : set;
      const edge = padSpot(k === 'A' || k === 'C' ? -1.5 : 1.5).add(V3(0, 1.1, PAD.d / 2 + 0.3));
      const lieMouth = LIE[k].clone().add(V3(-4.75, 1.3, 0));
      const restMouth = rest.clone().add(mouthL);
      const stand = ph(day, 0.1, 0.3);
      if (w < 1 || stand <= 0) {
        _q.copy(new THREE.Quaternion().slerp(HOLD_Q, ph(w, 0.04, 0.22)));
        if (w > 0.86) _q.copy(HOLD_Q).slerp(LIE_Q, ph(w, 0.86, 0.98));
        const m = track(w, [[0, restMouth], [0.1, up(restMouth, 6)], [0.24, up(edge, 1)], [0.28, edge], [0.8, edge], [0.86, up(edge, 3)], [1, lieMouth]], V3());
        mouthAt(m, _q);
        plug = w < 0.28 ? ph(w, 0.08, 0.2) : 1 - ph(w, 0.72, 0.8);
      } else {
        _q.copy(LIE_Q).slerp(new THREE.Quaternion(), ph(stand, 0, 0.6));
        mouthAt(track(stand, [[0, lieMouth], [0.5, up(lieMouth, 10)], [1, restMouth]], V3()), _q);
      }
    }
    if (k === 'C') { pour(S.clear2, B.morgueTop); pour(S.count.C, B.padTop); }
    else { pour(S.clear1[k], B.morgueTop); pour(S.count[k], B.padTop); }
  }
  g.position.copy(pos);
  g.quaternion.copy(q);
  V.setPlug(plug);
  V.plug.visible = plug < 0.98;     // out: in the hand, off the bench
}

/** Which flies a vial holds as adults now, awake or not. */
function vialAdults(k) {
  if (k === 'W' || k === 'w') return { flies: S.knock[k] < KO.pour[0] ? R[k] : [], asleep: ph(S.knock[k], 0.08, 0.26) };
  const parents = k === 'C' ? padParents('C') : padParents(k);
  const set = k === 'C' ? clamp(S.mate2 / 0.8) : S.setup[k];
  const clear = k === 'C' ? S.clear2 : S.clear1[k];
  const count = S.count[k];
  const day = k === 'C' ? S.dayC : S.dayAB;
  let flies = [], asleep = 0;
  if (set >= 0.72 && clear < KO.pour[0]) {
    flies = parents;
    asleep = clear > 0 ? ph(clear, 0.08, 0.26) : 1 - ph(day, 0.02, 0.15);
  } else if (clear >= KO.pour[0] && count < KO.pour[0]) {
    flies = R[k].filter((f) => f.emerge <= day);
    asleep = ph(count, 0.08, 0.26);
  }
  return { flies, asleep };
}

/** The parents brushed into vial k: picked under the microscope (A, B), or vial A's first F₁ pairs (C). */
function padParents(k) {
  if (k === 'C') {
    const s = sortOf('A') || autoSort('A');
    const fem = [...(s.fRed || [])].slice(0, F1_PAIRS), mal = [...(s.mRed || [])].slice(0, F1_PAIRS);
    return [...fem, ...mal].map((id) => R.all[id]);
  }
  const s = sortOf('parents') || autoSort('parents');
  return [...(s[k + 'f'] || []), ...(s[k + 'm'] || [])].map((id) => R.all[id]);
}

/* ---------- flies on the pad ---------- */
const PAD = { w: 8, d: 5.5 };       // the usable surface, cm
/** A seeded spot in a region of the pad (fractions of its width, -0.5..0.5). */
function scatter(id, x0, x1) {
  const a = Math.sin(id * 12.9898) * 43758.5453, b = Math.sin(id * 78.233) * 12345.678;
  const u = a - Math.floor(a), v = b - Math.floor(b);
  return V3((x0 + (x1 - x0) * u) * PAD.w, 0, (v - 0.5) * PAD.d * 0.9);
}
/** A pile's spot: four corners of a region, flies stacked in a little grid. */
function pileSpot(pileIndex, n, x0, x1) {
  const cx = x0 + (x1 - x0) * (pileIndex % 2 ? 0.75 : 0.25), cz = pileIndex < 2 ? -0.25 : 0.25;
  const col = n % 4, row = Math.floor(n / 4);
  return V3(cx * PAD.w + (col - 1.5) * 0.32, 0, cz * PAD.d + (row - 1.5) * 0.3);
}
const padWorld = (local) => B.padTop.clone().add(local).add(V3(0, 0.03, 0));

/** Every fly's place on the pad now, or null. Regions: stocks share the pad; vial A's F₁ moves
 *  to the left third when vial B's arrive. */
function padPlace(f) {
  const i = lesson.step, pile = (set, x0, x1) => {
    const piles = pilesOf(set), key = pileOf(set, f.id);
    if (!key) return null;
    return pileSpot(piles.findIndex((p) => p.key === key), sortOf(set)[key].indexOf(f.id), x0, x1);
  };
  if (f.src === 'W' || f.src === 'w') {
    if (S.knock[f.src] < KO.pour[1]) return null;
    const sorted = !!sortOf('parents');
    const p = sorted ? pile('parents', -0.5, 0.5) : null;
    if (p) return S.setup[f.src === 'W' ? (f.sex === 'f' ? 'A' : 'B') : (f.sex === 'f' ? 'B' : 'A')] > 0 ? null : p;
    if (S.sweep >= 1) return null;
    return f.src === 'W' ? scatter(f.id, -0.5, -0.05) : scatter(f.id, 0.05, 0.5);
  }
  if (f.src === 'A' || f.src === 'B') {
    if (S.count[f.src] < KO.pour[1] || S.mate2 >= 1) return null;
    const left = f.src === 'A' && S.count.B > KO.lift[0];
    const sorted = !!pileOf(f.src, f.id);
    if (f.src === 'A' && S.mate2 > 0 && padParents('C').includes(f)) return null;
    const [x0, x1] = f.src === 'A' ? (left ? [-0.5, -0.18] : [-0.5, 0.5]) : [-0.14, 0.5];
    return (sorted && pile(f.src, x0, x1)) || scatter(f.id, x0, x1);
  }
  if (S.count.C < KO.pour[1]) return null;
  return pile('C', -0.5, 0.5) || scatter(f.id, -0.5, 0.5);
}

function pose(force = false) {
  const changed = (k, v) => { if (!force && S.key[k] === v) return false; S.key[k] = v; return true; };
  const { key: _k, ...state } = S;
  if (!changed('all', JSON.stringify([state, SORT]))) return;
  VIAL_KEYS.forEach(vialPose);
  root.updateMatrixWorld(true);

  // what each vial holds
  VIAL_KEYS.forEach((k) => {
    const V = B.vials[k], a = vialAdults(k);
    V.setAdults(a.flies);
    V.setAsleep(a.asleep);
    if (k === 'A' || k === 'B') V.setLife({ day: S.dayAB, eyes: S.setup[k] < 0.72 ? [] : R[k].map((f) => f.eye) });
    if (k === 'C') V.setLife({ day: S.dayC, eyes: S.mate2 < 0.72 ? [] : R.C.map((f) => f.eye) });
    if (k === 'W' || k === 'w') V.setLife({ day: STOCK_DAY, eyes: Array(STOCK_BROOD).fill(k === 'W' ? 'red' : 'white') });
  });

  poseGun();
  poseBrush();
  poseSwarm();
  B.pad.setGas(lesson.step >= stepAt('knock') && S.knock.W + S.knock.w > 0 ? 1 : 0);
}

/* ---------- the CO₂ needle ---------- */
const GUN_REST_Q = new THREE.Quaternion().multiplyQuaternions(Q(0, 0.25, 0), Q(Math.PI / 2, 0, 0));   // flat on its side, grip toward the back, needle toward the scope
const GUN_IN_Q = Q(0, 0, -Math.PI / 2);                 // needle (pointing +x) straight down
function poseGun() {
  const G = B.gun, rest = POS.gun.clone().add(V3(0, 2, 0));
  // the action in progress, if any: which vial and how far
  const act = [['W', S.knock.W], ['w', S.knock.w], ['A', S.clear1.A], ['B', S.clear1.B], ['A', S.count.A], ['B', S.count.B], ['C', S.clear2], ['C', S.count.C]]
    .find(([, a]) => a > 0 && a < KO.out[1]);
  if (!act) { G.group.position.copy(rest); G.group.quaternion.copy(GUN_REST_Q); G.setTrigger(0); return; }
  const [k, a] = act, V = B.vials[k];
  const mouth = worldOf(V.group, V.anchors.mouth), at = up(mouth, -1.2).add(V3(0.7, 0, 0));
  const w = a / KO.out[1];
  G.group.position.copy(track(w, [[0, rest], [0.3, up(at, 6)], [0.45, at], [0.78, at], [0.9, up(at, 6)], [1, rest]], V3()));
  G.group.quaternion.copy(GUN_REST_Q).slerp(GUN_IN_Q, ph(w, 0.05, 0.3) * (1 - ph(w, 0.88, 1)));
  G.setTrigger(ph(w, 0.45, 0.5) * (1 - ph(w, 0.74, 0.78)));
}

/* ---------- the brush: piles from the pad into a vial's mouth, leftovers into the morgue ---------- */
const BRUSH_REST_Q = Q(0, Math.PI / 2 + 0.12, 0);   // lying in front of the scope, tip to the right
const BRUSH_WORK_Q = Q(-0.9, 0, 0);       // tip down toward the pad
function poseBrush() {
  const Br = B.brush, rest = POS.brush.clone();
  const strokes = (from, to, w) => {
    const j = (w * 3) % 1;
    return track(j, [[0, up(from, 0.6)], [0.15, up(from, 0.1)], [0.75, up(to, 0.2)], [1, up(from, 0.6)]], V3());
  };
  let tip = null;
  const brushing = (k, w) => {
    if (w <= 0.24 || w >= 0.72) return;
    const V = B.vials[k], mouth = worldOf(V.group, V.anchors.mouth);
    const from = padWorld(V3(k === 'A' || k === 'C' ? -1.5 : 1.5, 0, 0));
    tip = strokes(from, mouth, (w - 0.24) / 0.48);
  };
  brushing('A', S.setup.A); brushing('B', S.setup.B); brushing('C', clamp(S.mate2 / 0.8));
  if (!tip && S.sweep > 0 && S.sweep < 1) tip = strokes(padWorld(V3()), padWorld(V3(PAD.w / 2, 0, 0)), S.sweep);
  if (!tip && S.mate2 > 0.8 && S.mate2 < 1) tip = strokes(padWorld(V3()), padWorld(V3(PAD.w / 2, 0, 0)), (S.mate2 - 0.8) / 0.2);
  if (!tip) { Br.group.position.copy(rest); Br.group.quaternion.copy(BRUSH_REST_Q); return; }
  Br.group.quaternion.copy(BRUSH_WORK_Q);
  Br.group.position.copy(tip);
}

/* ---------- the swarm: flies outside the vials ---------- */
const FLY_Q_SIDE = Q(Math.PI / 2, 0, 0);
function poseSwarm() {
  const W = B.swarm;
  const morgueSink = up(B.morgueTop, -1.2);
  R.all.forEach((f) => {
    const pos = flyNow(f, morgueSink);
    if (!pos) { W.set(f.id, null); return; }
    _q.setFromAxisAngle(V3(0, 1, 0), f.id * 2.399);
    W.set(f.id, pos, _q, f);
  });
  W.commit();
}

/** A fly's world position now: on the pad, in flight between places, or null (in a vial, gone). */
function flyNow(f, morgueSink) {
  const place = padPlace(f);
  // leaving a vial's mouth onto the pad
  const src = f.src;
  const pouring = (a, dest, stagger) => {
    if (a < KO.pour[0] || a > KO.pour[1] + 0.06) return null;
    const V = B.vials[src], mouth = worldOf(V.group, V.anchors.mouth);
    const k = ph(a, KO.pour[0] + stagger * 0.1, KO.pour[1] - 0.1 + stagger * 0.1, Ease.in);
    return _a.lerpVectors(mouth, dest, k).clone().add(V3(0, Math.sin(Math.PI * k) * 0.8, 0));
  };
  const st = (f.id % 17) / 17;
  if (f.src === 'W' || f.src === 'w') {
    const p = pouring(S.knock[f.src], padWorld(scatter(f.id, f.src === 'W' ? -0.5 : 0.05, f.src === 'W' ? -0.05 : 0.5)), st);
    if (p) return p;
    // brushed into a parental vial
    const into = PARENT_PILES.find((q) => pileOf('parents', f.id) === q.key);
    if (into) {
      const v = into.key[0], w = S.setup[v];
      if (w > 0.24 && w < 0.72) {
        const k = ph(w, 0.3 + st * 0.2, 0.55 + st * 0.15);
        if (k > 0 && k < 1) return _a.lerpVectors(padWorld(padPlace({ ...f }) || V3()), worldOf(B.vials[v].group, B.vials[v].anchors.mouth), k).clone();
      }
    }
    if (!place && S.sweep > 0 && S.sweep < 1 && !into) {
      const k = ph(S.sweep, st * 0.4, 0.6 + st * 0.4);
      return _a.lerpVectors(padWorld(scatter(f.id, f.src === 'W' ? -0.5 : 0.05, f.src === 'W' ? -0.05 : 0.5)), morgueSink, k).clone();
    }
    return place ? padWorld(place) : null;
  }
  const v = f.src;
  const p = pouring(S.count[v], padWorld(place || scatter(f.id, -0.5, 0.5)), st);
  if (p) return p;
  return place ? padWorld(place) : null;
}

// =========================================================================
// The stereo microscope
// =========================================================================
const scopeView = createStereoView({ title: T.objects.scope.name, words: SC });
function openScope(set) {
  const flies = SETS[set]().map((f) => ({ id: f.id, sex: f.sex, eye: f.eye }));
  scopeView.open({
    flies,
    piles: pilesOf(set),
    sorted: SORT[set] || {},
    autoAfter: set === 'parents' ? Infinity : 8,
    onChange: (sorted) => { SORT[set] = sorted; panelKey = ''; },
    onDone: (sorted) => {
      SORT[set] = sorted;
      panelKey = '';
      setTimeout(() => {
        scopeView.close();
        const id = stepId();
        if ((id === 'sort' && set === 'parents') || (id === 'count1' && sortDone('A') && sortDone('B')) || (id === 'count2' && set === 'C')) lesson.jumpTo(lesson.step + 1);
      }, 900);
    },
    onClose: () => { panelKey = ''; },
  });
}

// =========================================================================
// The panel: counts, predictions, the test, the Punnett square
// =========================================================================
function buildPanel() {
  const eye = (c) => `<i class="eye ${c}"></i>`;
  $('#flyPanel').innerHTML = `
    <div class="panel-head"><span class="panel-title"><i class="ph ph-bug"></i>${P.title}</span><span class="clock" id="flyClock"></span></div>
    <table class="fly-table">
      <thead><tr><th>${P.vial}</th><th>${eye('r')}${P.fRed}</th><th>${eye('w')}${P.fWhite}</th><th>${eye('r')}${P.mRed}</th><th>${eye('w')}${P.mWhite}</th></tr></thead>
      <tbody>
        ${['A', 'B', 'C'].map((v) => `<tr data-r="${v}"><td>${P.rows[v]}</td><td data-k="fRed"></td><td data-k="fWhite"></td><td data-k="mRed"></td><td data-k="mWhite"></td></tr>`).join('')}
        <tr data-r="morgan"><td>${P.rows.morgan}</td>${['fRed', 'fWhite', 'mRed', 'mWhite'].map((k) => `<td>${MORGAN[k].toLocaleString()}</td>`).join('')}</tr>
      </tbody>
    </table>
    <p class="fly-note" id="morganNote">${P.morganNote}</p>
    <p class="fly-said" id="said1"></p>
    <p class="fly-said" id="said2"></p>`;
}
const asking = (q) => lesson && lesson.mode !== 'watch' && stepId() === q;
const verdictHTML = (right, html) => `<i class="ph-fill ${right ? 'ph-check-circle' : 'ph-x-circle'}"></i><span>${html}</span>`;
const moveOn = (q, ms) => setTimeout(() => { if (stepId() === q) lesson.jumpTo(lesson.step + 1); }, ms);

/** A prediction card: any answer moves on. */
const predictCard = (q) => (el) => {
  const A = P[q];
  el.innerHTML = `<div class="card-ask"><p class="ask-q">${A.ask}</p>
    <div class="ask-answers">${Object.entries(A.answers).map(([k, t]) => `<button type="button" data-a="${k}">${t}</button>`).join('')}</div></div>`;
  const sync = () => el.querySelectorAll('button[data-a]').forEach((b) => { b.className = b.dataset.a === ANS[q] ? 'on' : ''; b.disabled = !asking(q); });
  el.onclick = (ev) => {
    const b = ev.target.closest('button[data-a]');
    if (!b || !asking(q)) return;
    ANS[q] = b.dataset.a; panelKey = ''; sync(); moveOn(q, 700);
  };
  sync();
};

/* The test: expected counts under each hypothesis for the student's own F₂, and χ². */
const HYP = {
  auto: { fRed: 3 / 8, fWhite: 1 / 8, mRed: 3 / 8, mWhite: 1 / 8 },
  xlink: { fRed: 1 / 2, fWhite: 0, mRed: 1 / 4, mWhite: 1 / 4 },
};
function chiSquare(obs, hyp) {
  const n = Object.values(obs).reduce((a, b) => a + b, 0);
  let chi = 0, cats = 0;
  for (const k in hyp) { const e = hyp[k] * n; if (e > 0) { chi += (obs[k] - e) ** 2 / e; cats++; } }
  return { chi, df: cats - 1, n };
}
const f2Tally = () => (sortOf('C') ? tally('C') : tally2(autoSort('C')));
const tally2 = (s) => Object.fromEntries(COUNT_PILES.map((p) => [p.key, (s[p.key] || []).length]));
const testRight = (a) => {
  const x = chiSquare(f2Tally(), HYP.xlink);
  return a === 'auto' || (a === 'both' && x.chi > CHI_CRIT[x.df]);
};

function testCard(el) {
  const A = P.test, obs = f2Tally(), au = chiSquare(obs, HYP.auto), xl = chiSquare(obs, HYP.xlink), n = au.n;
  const keys = ['fRed', 'fWhite', 'mRed', 'mWhite'];
  const row = (name, h, c, cls = '') => `<tr class="${cls}"><td>${name}</td>${keys.map((k) => `<td>${h ? (h[k] * n).toFixed(1) : obs[k]}</td>`).join('')}<td class="${c && c.chi > CHI_CRIT[c.df] ? 'hot' : ''}">${c ? c.chi.toFixed(1) : ''}</td></tr>`;
  el.innerHTML = `<p class="chi-title">${fmt(A.title, { n })}</p>
    <table class="chi-table"><thead><tr><th></th>${keys.map((k) => `<th>${P[k]}</th>`).join('')}<th>χ²</th></tr></thead>
    <tbody>${row(A.observed, null, null, 'obs')}${row(A.auto, HYP.auto, au)}${row(A.xlink, HYP.xlink, xl)}</tbody></table>
    <div class="card-ask"><p class="ask-q">${A.ask}</p>
    <div class="ask-answers">${Object.entries(A.answers).map(([k, t]) => `<button type="button" data-a="${k}">${t}</button>`).join('')}</div>
    <p class="ask-verdict" hidden></p></div>`;
  const v = el.querySelector('.ask-verdict');
  const sync = () => {
    const pick = ANS.test, right = !!pick && testRight(pick);
    el.querySelectorAll('button[data-a]').forEach((b) => { b.className = b.dataset.a !== pick ? '' : right ? 'right' : 'wrong'; b.disabled = !asking('test') || right; });
    v.hidden = !pick;
    if (!pick) return;
    v.className = 'ask-verdict ' + (right ? 'ok' : 'no');
    v.innerHTML = verdictHTML(right, right ? fmt(A.right, { e: (HYP.auto.fWhite * n).toFixed(1), o: obs.fWhite, chi: au.chi.toFixed(1), crit: CHI_CRIT[au.df] }) : A.wrong);
  };
  el.onclick = (ev) => {
    const b = ev.target.closest('button[data-a]');
    if (!b || !asking('test')) return;
    ANS.test = b.dataset.a; panelKey = ''; sync();
    if (testRight(ANS.test)) moveOn('test', 3200);
  };
  sync();
}

/* Punnett: eggs (rows) X^W, X^w; sperm (columns) X^W, Y. */
const PUN = { rows: ['W', 'w'], cols: ['W', 'Y'] };
const PUN_CYCLE = [null, 'WW', 'Ww', 'ww', 'WY', 'wY'];
const xg = (g) => g.split('').map((a) => (a === 'Y' ? 'Y' : `X<sup>${a}</sup>`)).join('');
const punRight = (i) => child(PUN.rows[Math.floor(i / 2)], PUN.cols[i % 2]).geno;
const punDone = () => ANS.cells.every((c, i) => c === punRight(i));
function mountPunnett(el) {
  const U = P.punnett, head = (a) => `<span class="pun-head a-${a}"><span>${a === 'Y' ? 'Y' : `X<sup>${a}</sup>`}</span></span>`;
  el.innerHTML = `<div class="fly-punnett">
    <p class="pun-title">${U.title} <span>${U.parents}</span></p>
    <div class="pun-grid">
      <span class="pun-corner"><small>${U.egg} ↓</small><small>${U.sperm} →</small></span>
      ${PUN.cols.map(head).join('')}
      ${PUN.rows.map((r, ri) => head(r) + PUN.cols.map((c, ci) => `<button type="button" class="pun-cell" data-i="${ri * 2 + ci}"></button>`).join('')).join('')}
    </div></div><p class="ask-verdict" hidden></p>`;
  const v = el.querySelector('.ask-verdict');
  const sync = () => {
    const done = punDone(), full = ANS.cells.every(Boolean);
    el.querySelectorAll('.pun-cell').forEach((b) => {
      const i = +b.dataset.i, g = ANS.cells[i];
      b.innerHTML = g ? `<i class="eye ${eyeOf(g.replace('Y', '')) === 'red' ? 'r' : 'w'}"></i>${xg(g)}<small>${g.includes('Y') ? '♂' : '♀'}</small>` : '';
      b.disabled = !asking('punnett') || done;
      b.classList.toggle('wrong', !!g && !done && full && g !== punRight(i));
      b.classList.toggle('right', done);
    });
    v.hidden = !done && !full;
    v.className = 'ask-verdict ' + (done ? 'ok' : 'no');
    v.innerHTML = verdictHTML(done, done ? U.done : U.wrong);
  };
  el.onclick = (ev) => {
    const c = ev.target.closest('.pun-cell');
    if (!c || !asking('punnett') || punDone()) return;
    const i = +c.dataset.i;
    ANS.cells[i] = PUN_CYCLE[(PUN_CYCLE.indexOf(ANS.cells[i]) + 1) % PUN_CYCLE.length];
    sync();
    if (punDone()) moveOn('punnett', 2600);
  };
  sync();
}

let panelKey = '';
function renderPanel() {
  if (!S) return;
  const id = stepId(), i = lesson.step;
  const clock = id === 'wait1' || id === 'hatch1' ? fmt(T.steps.wait1.clock, { d: Math.floor(S.dayAB) })
    : id === 'wait2' || id === 'hatch2' ? fmt(T.steps.wait2.clock, { d: Math.floor(S.dayC) }) : '';
  const key = JSON.stringify([SORT, S.auto, i, lesson.mode, ANS, clock]);
  if (key === panelKey) return;
  panelKey = key;
  $('#flyClock').textContent = clock;
  $('#flyPanel').classList.toggle('yield', ['predict1', 'predict2', 'test', 'punnett'].includes(id));   // on a phone the card needs the room
  ['A', 'B', 'C'].forEach((v) => {
    const row = $(`#flyPanel tr[data-r="${v}"]`), vals = sortOf(v) ? tally(v) : null;
    row.querySelectorAll('[data-k]').forEach((td) => { td.textContent = vals ? vals[td.dataset.k] : '–'; });
    row.classList.toggle('live', (id === 'count1' && v !== 'C') || (id === 'count2' && v === 'C'));
  });
  const showMorgan = i >= stepAt('test');
  $('#flyPanel tr[data-r="morgan"]').hidden = !showMorgan;
  $('#morganNote').hidden = !showMorgan;
  const said = (q) => (ANS[q] ? fmt(P.yourGuess, { a: P[q].answers[ANS[q]] }) : '');
  $('#said1').innerHTML = i <= stepAt('mate2') ? said('predict1') : '';
  $('#said2').innerHTML = i >= stepAt('predict2') ? said('predict2') : '';
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
const go = (obj, key, dur) => anim(dur, (e, k) => { obj[key] = k; }, Ease.linear);
const panelStep = (id, extra = {}) => ({
  id, respond: true, ...card(id), targets: [], view: 'overview', caption: T.steps[id].caption, card: predictCard(id),
  isDone: () => lesson.mode === 'watch' || ANS[id] != null, progress: () => (ANS[id] ? 1 : 0), ...extra,
});
const multiHint = (id, list, total) => () => (list().length === 0 ? T.steps[id].hint : fmt(T.steps[id].hintMore, { n: list().length, total }));
const dayCaption = (day, c) => (day < 1 ? c.eggs : day < 4.5 ? c.larvae : c.wander);
const hatchCaption = (day, c) => (day < 8 ? c.pupae : day < 9.5 ? c.eyes : c.emerge);
/** A knock-out that ends at the microscope: its run opens the view unless replaying, and fills
 *  SORT itself when replaying a set nobody sorted, so a skipped step completes. */
async function knockAndSort(obj, key, set) {
  await go(obj, key, 5.2);
  if (isInstant() || lesson.mode === 'watch') { S.auto[set] = true; return; }
  openScope(set);
}

const STEPS = [
  { id: 'knock', ...card('knock'), view: 'stocks', targets: ['stockW', 'stockw'],
    activeTargets: () => ['stockW', 'stockw'].filter((k) => S.knock[k.slice(5)] <= 0),
    hint: multiHint('knock', () => S.order.knock, 2),
    run: (k) => { const v = k.slice(5); S.order.knock.push(v); return go(S.knock, v, 5.2); },
    isDone: () => S.knock.W >= 1 && S.knock.w >= 1, progress: () => (S.knock.W + S.knock.w) / 2,
    caption: T.steps.knock.caption },
  { id: 'sort', ...card('sort', { n: PAIRS }), view: 'pad', targets: ['scope'], respond: true,
    run: async () => {
      if (isInstant() || lesson.mode === 'watch') { S.auto.parents = true; return; }
      openScope('parents');
    },
    isDone: () => sortDone('parents') && (!scopeView.isOpen || lesson.mode === 'watch'),
    progress: () => (SORT.parents ? Object.values(SORT.parents).flat().length / (PAIRS * 4) : 0),
    caption: T.steps.sort.caption },
  { id: 'setup', ...card('setup'), view: 'vials', targets: ['vialA', 'vialB'],
    activeTargets: () => ['vialA', 'vialB'].filter((k) => S.setup[k.slice(4)] <= 0),
    hint: multiHint('setup', () => S.order.setup, 2),
    run: async (k) => {
      const v = k.slice(4); S.order.setup.push(v);
      await go(S.setup, v, 6);
      if (S.order.setup.length === 2) await go(S, 'sweep', 2.4);
    },
    isDone: () => S.setup.A >= 1 && S.setup.B >= 1 && S.sweep >= 1, progress: () => (S.setup.A + S.setup.B) / 2,
    caption: T.steps.setup.caption },
  panelStep('predict1', { view: 'vials' }),
  { id: 'wait1', ...card('wait1', { days: CLEAR_DAY }), targets: [], view: 'culture',
    clock: () => fmt(T.steps.wait1.clock, { d: Math.floor(S.dayAB) }),
    caption: () => dayCaption(S.dayAB, C.wait1),
    watch: { duration: CLEAR_DAY, get: () => S.dayAB, set: (d) => { S.dayAB = d; }, rate: () => CLEAR_DAY / 9 } },
  { id: 'clear1', ...card('clear1'), view: 'vials', targets: ['vialA', 'vialB'],
    activeTargets: () => ['vialA', 'vialB'].filter((k) => S.clear1[k.slice(4)] <= 0),
    hint: multiHint('clear1', () => S.order.clear1, 2),
    run: (k) => { const v = k.slice(4); S.order.clear1.push(v); return go(S.clear1, v, 5); },
    isDone: () => S.clear1.A >= 1 && S.clear1.B >= 1, progress: () => (S.clear1.A + S.clear1.B) / 2,
    caption: T.steps.clear1.caption },
  { id: 'hatch1', ...card('hatch1', { days: COUNT_DAY }), targets: [], view: 'culture',
    clock: () => fmt(T.steps.hatch1.clock, { d: Math.floor(S.dayAB) }),
    caption: () => hatchCaption(S.dayAB, C.hatch1),
    watch: { duration: COUNT_DAY - CLEAR_DAY, get: () => S.dayAB - CLEAR_DAY, set: (d) => { S.dayAB = CLEAR_DAY + d; }, rate: () => (COUNT_DAY - CLEAR_DAY) / 9 } },
  { id: 'count1', ...card('count1'), view: 'pad', targets: ['vialA', 'vialB'], respond: true,
    activeTargets: () => (S.count.A <= 0 ? ['vialA'] : S.count.B <= 0 && sortDone('A') ? ['vialB'] : []),
    hint: () => (S.count.A <= 0 ? T.steps.count1.hint : fmt(T.steps.count1.hintMore, { n: 1, total: 2 })),
    run: (k) => { const v = k.slice(4); S.order.count1.push(v); return knockAndSort(S.count, v, v); },
    isDone: () => S.count.A >= 1 && S.count.B >= 1 && sortDone('A') && sortDone('B') && !scopeView.isOpen,
    progress: () => (sortDone('A') ? 0.5 : 0) + (sortDone('B') ? 0.5 : 0),
    caption: T.steps.count1.caption },
  { id: 'mate2', ...card('mate2', { n: F1_PAIRS }), view: 'vials', targets: ['vialC'],
    run: () => go(S, 'mate2', 7.5), caption: T.steps.mate2.caption },
  panelStep('predict2', { view: 'vials' }),
  { id: 'wait2', ...card('wait2', { days: CLEAR_DAY }), targets: [], view: 'culture',
    clock: () => fmt(T.steps.wait2.clock, { d: Math.floor(S.dayC) }),
    caption: () => dayCaption(S.dayC, C.wait2),
    watch: { duration: CLEAR_DAY, get: () => S.dayC, set: (d) => { S.dayC = d; }, rate: () => CLEAR_DAY / 8 } },
  { id: 'clear2', ...card('clear2'), view: 'vials', targets: ['vialC'],
    run: () => go(S, 'clear2', 5), caption: T.steps.clear2.caption },
  { id: 'hatch2', ...card('hatch2', { days: COUNT_DAY }), targets: [], view: 'culture',
    clock: () => fmt(T.steps.hatch2.clock, { d: Math.floor(S.dayC) }),
    caption: () => hatchCaption(S.dayC, C.hatch2),
    watch: { duration: COUNT_DAY - CLEAR_DAY, get: () => S.dayC - CLEAR_DAY, set: (d) => { S.dayC = CLEAR_DAY + d; }, rate: () => (COUNT_DAY - CLEAR_DAY) / 8 } },
  { id: 'count2', ...card('count2'), view: 'pad', targets: ['vialC'], respond: true,
    run: () => knockAndSort(S.count, 'C', 'C'),
    isDone: () => S.count.C >= 1 && sortDone('C') && !scopeView.isOpen,
    progress: () => (SORT.C ? Object.values(SORT.C).flat().length / R.C.length : 0),
    caption: T.steps.count2.caption },
  panelStep('test', { view: 'pad', card: testCard, isDone: () => lesson.mode === 'watch' || (!!ANS.test && testRight(ANS.test)) }),
  panelStep('punnett', { view: 'pad', card: mountPunnett, isDone: () => lesson.mode === 'watch' || punDone(), progress: () => ANS.cells.filter((c, i) => c === punRight(i)).length / 4 }),
];
STEPS.find((s) => s.id === 'test').detail = () => fmt(T.steps.test.detail, { n: R ? R.C.length : 0 });
const PHASES = [
  { ...T.phases.parents, icon: 'ph-bug', steps: ['knock', 'sort', 'setup'] },
  { ...T.phases.f1, icon: 'ph-test-tube', steps: ['predict1', 'wait1', 'clear1', 'hatch1', 'count1'] },
  { ...T.phases.f2, icon: 'ph-test-tube', steps: ['mate2', 'predict2', 'wait2', 'clear2', 'hatch2', 'count2'] },
  { ...T.phases.explain, icon: 'ph-grid-four', steps: ['test', 'punnett'] },
];

// =========================================================================
// Wire it together
// =========================================================================
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
    if (scopeView.isOpen) scopeView.close();
    if (!step) { stage.focus('done', 1.6); toast(T.complete.toast, { icon: 'ph-bug' }); return; }
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
  rig: { t: VIEWS.overview.t.clone(), p: VIEWS.overview.p.clone() },
  special: ['pad', 'culture', 'done'],
});

function restart() {
  newSession();
  Object.assign(SORT, { parents: null, A: null, B: null, C: null });
  Object.assign(ANS, { predict1: null, predict2: null, test: null, cells: [null, null, null, null] });
  firstEnter = false;
  lesson.restart();
}

buildPanel();
stage.onFrame((dt, now) => {
  lesson.update(dt);
  follow.update(dt);
  zoom.update(dt);
  if (S) {
    pose();
    renderPanel();
    const t = (now || performance.now()) / 1000;
    VIAL_KEYS.forEach((k) => B.vials[k].update(t));
  }
  ix.update();
});

const intro = createIntro(stage);
bindChrome({ stage, restart, expose: { get S() { return S; }, get B() { return B; }, get R() { return R; }, SORT, ANS, zoomState, lesson, ix, stage, follow, zoom, STEPS, intro, scopeView, autoSort, openScope } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
