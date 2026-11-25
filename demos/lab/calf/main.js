/* Juniper's Seizures: a vet's bench for a calf with water intoxication (hyponatremia).
 *   1 Blood work: a drop into the analyzer, the results panel (results.js)
 *   2 Red cells: a drop of blood into four solutions, the tubes clear or stay cloudy, the
 *     slides under the microscope (slides.js), then what they show (conclude.js)
 *   3 The brain: replay last night at a brain capillary and the astrocyte wrapping it
 *     (capillary.js), and one level in, at a patch of its endfoot membrane (bubble.js)
 *   4 Explain it to Dana: the cause-and-effect chain from cards (chain.js)
 *   5 Treat her: an IV bag and a volume (rx.js), six hours on the drip, then why the rest goes
 *     slowly, at the brain level. Juniper's pose shows during the drip (patient.js)
 * Every number is model.js's. The bench is rebuilt on every timeline jump (rebuild()); all
 * bench state lives in S. */
import * as THREE from 'three';
import {
  V3, lerp, clamp, worldOf, newSession, anim, isInstant, moveTo,
  takeTip, pipetteDraw, pipetteDispense, ejectTip, disposeTree, fmt, T,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, createZoom, createIntro,
  chromeInsets, bindChrome, PHONE,
  makeBench, makeMicroscope, makeTubeRack, makeTestTube, makeBenchCard, makeAnalyzer,
  makeMicropipette, makeTipBox, makePipetteStand, makeWasteBin, makeSlide, makeCoverslip, makeIVBag, stripTags,
} from '../lab.js';
import {
  JUNIPER, HEALTHY_NA, TUBES, CLEAR_MIN, FLUIDS, RATE, RX_HOURS, SEIZURE_STOP, SAFE_24H,
  CELL_OSM, ADAPTED_NA, ADAPTED_OSM, DAY3_NA, plasmaOsm, rxNa,
} from './model.js';
import { createChain } from './chain.js';
import { createConclude } from './conclude.js';
import { createRx, fluidName, volText } from './rx.js';
import { createPatient } from './patient.js';
import { createResults, ROWS, flagOf } from './results.js';
import { createSlides } from './slides.js';
import { createCapillaryLevel } from './capillary.js';
import { createBubbleLevel, loadMembrane } from './bubble.js';

const $ = (s) => document.querySelector(s);
const hex = (c) => new THREE.Color(c).getHex();

// =========================================================================
// Layout (cm, bench top at y = 0)
// =========================================================================
const POS = {
  blood: V3(-36, 0, 4), analyzer: V3(-24, 0, -8),
  rack: V3(-2, 0, -4), tips: V3(18, 0, 12), stand: V3(18, 0, -8), waste: V3(30, 0, 12),
  scope: V3(40, 0, -6),
  slides: V3(-2, 0, 10),      // the four slides, one in front of each tube
  bags: V3(-27, 0, 22),       // the three IV bags, front left, ports toward the student
};
const BAG_GAP = 9, BAG_SCALE = 0.7;
/* intact cells scatter light: an opaque, milky red. Burst cells leave hemoglobin dissolved: clear red */
const COL = { saline: '#e4f0fb', cells: '#9b3a33', milky: '#a3463e', lysed: '#c8102e' };
const WAIT_REAL = 8;      // seconds the wait plays in
const BRAIN_REAL = 12;    // seconds last night plays in
const DRIP_REAL = 10;     // seconds the six hours on the drip play in
const SLOW_REAL = 16;     // seconds the next day plays in
/* the next day on SLOW_REAL's clock: adapt (0 → ADAPT_END), hold, the fast fix (FAST), then the limit */
const ADAPT_END = 0.42, FAST = [0.5, 0.72], SLOW_H = [RX_HOURS, RX_HOURS + 24, RX_HOURS + 28];
const VIEWS = {
  overview: { t: V3(2, 4, 0), p: V3(2, 64, 78) },
  analyze: { t: V3(-28, 5, -2), p: V3(-28, 40, 44) },
  tubes: { t: V3(4, 6, -2), p: V3(4, 38, 44) },
  scope: { t: V3(34, 12, -4), p: V3(34, 46, 52) },
  treat: { t: V3(-24, 2, 18), p: V3(-24, 40, 58) },
};

// =========================================================================
// Panels, stage, zoom
// =========================================================================
let lesson, ix, root = null, B = null, S = null;
const results = createResults({
  onChange: () => {
    lesson.render(); requestAnimationFrame(() => stage.resize());
    if (lesson.step === READ && results.solved()) lesson.jumpTo(READ + 1);
  },
});
const slides = createSlides({
  onChange: () => {
    lesson.render();
    if (lesson.step === SCOPE && slides.seen() >= TUBES.length && !slides.isOpen) lesson.jumpTo(CONCLUDE);
    if (lesson.step === CONCLUDE && lesson.mode === 'do' && !slides.isOpen) conclude.open();   // back at the bench, the questions return
  },
});
const conclude = createConclude({
  onChange: () => { lesson.render(); requestAnimationFrame(() => stage.resize()); },
  onNext: () => lesson.jumpTo(BRAIN),
});
const chain = createChain({
  onChange: () => {
    lesson.render(); requestAnimationFrame(() => stage.resize());
    if (lesson.step === DANA && chain.solved()) lesson.jumpTo(DANA + 1);
  },
});
const rx = createRx({
  onChange: () => { lesson.render(); requestAnimationFrame(() => stage.resize()); },
  onGive: () => { rx.close(); lesson.jumpTo(DRIP); },
});
const patient = createPatient();
patient.el.hidden = true;
const sidePanel = () => [results, conclude, chain, rx].find((p) => p.isOpen);
const stage = createStage({
  canvas: $('#scene'), views: VIEWS,
  controls: { minDistance: 8, maxDistance: 170 },
  insets: (w, h) => {
    const r = chromeInsets(w, h);
    const p = sidePanel();
    if (p && w > PHONE) r.right = Math.max(r.right, w - p.el.getBoundingClientRect().left + 10);
    return r;
  },
});
const mat = createMaterials(stage);

const brain = createCapillaryLevel(stage.env);
await loadMembrane();
const bubble = createBubbleLevel(stage.env);
const brainState = { na: JUNIPER.na, cellOsm: CELL_OSM, mode: 'night', phase: '', h: 0 };
const ease = (x) => x * x * (3 - 2 * x);
/** Blood Na⁺, what an astrocyte holds, and the hour, for the step on screen: the zoom, the
 *  patient panel and the clocks all read this one pose. */
function pose() {
  const st = brainState, id = lesson && STEPS[lesson.step] ? STEPS[lesson.step].id : 'done';
  st.cellOsm = CELL_OSM; st.mode = 'night'; st.phase = ''; st.h = 0;
  if (!S) { st.na = JUNIPER.na; return st; }
  if (id === 'drip') {
    st.mode = 'drip'; st.h = RX_HOURS * clamp(S.dripT / DRIP_REAL);
    st.na = rxNa(rx.choice(), st.h);
  } else if (id === 'slow') {
    const r = clamp(S.slowT / SLOW_REAL), a = ease(clamp(r / ADAPT_END)), f = ease(clamp((r - FAST[0]) / (FAST[1] - FAST[0])));
    st.mode = 'slow';
    st.phase = r < FAST[0] ? 'adapt' : r <= FAST[1] + 0.04 ? 'fast' : 'limit';
    st.cellOsm = lerp(CELL_OSM, ADAPTED_OSM, a);
    st.na = lerp(ADAPTED_NA, HEALTHY_NA, f);
    st.h = r < FAST[0] ? lerp(SLOW_H[0], SLOW_H[1], a) : lerp(SLOW_H[1], SLOW_H[2], f);
  } else if (id === 'done') {
    st.mode = 'done'; st.na = DAY3_NA; st.cellOsm = plasmaOsm(DAY3_NA);
  } else st.na = S.brainOn ? lerp(HEALTHY_NA, JUNIPER.na, S.brainT / BRAIN_REAL) : JUNIPER.na;
  return st;
}
const zoom = createZoom(stage, {
  levels: [
    { key: 'brain', world: brain, name: T.levels.brain.name, meta: T.levels.brain.meta, bg: '#f1eef4' },
    { key: 'bubble', world: bubble, name: T.levels.bubble.name, meta: T.levels.bubble.meta, bg: '#eef2f6' },
  ],
  getT: pose,
  getStep: () => brain.view(brainState),   // side-on or the cross-section; the membrane level has one view
});

// =========================================================================
// The bench
// =========================================================================
function place(prop, pos, rotY = 0) {
  prop.group.position.copy(pos);
  if (rotY) prop.group.rotation.y = rotY;
  root.add(prop.group);
  return prop;
}
const tubeText = (key) => T.tubes[key];

function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group(); stage.scene.add(root);
  place(makeBench(mat), V3());

  const bloodRack = place(makeTubeRack(mat, { holes: 1, color: hex('#cbd5e1') }), POS.blood);
  const blood = makeTestTube(mat, { r: 1.0, h: 10 });
  place(blood, POS.blood.clone().add(bloodRack.holes[0]));
  blood.liquid = blood.addLayer(hex(COL.cells), 0.95);
  blood.liquid.setRange(0, 0.55);
  place(makeBenchCard(mat, { title: T.props.blood, sub: T.props.bloodSub, w: 5.2, d: 1.5 }), POS.blood.clone().add(V3(0, 0, 4.6)));
  const analyzer = place(makeAnalyzer(mat), POS.analyzer, 0.25);
  analyzer.setScreen({ title: T.analyzer.ready });

  const rack = place(makeTubeRack(mat, { holes: TUBES.length, spacing: 4.2 }), POS.rack);
  const tubes = TUBES.map((t, i) => {
    const tube = place(makeTestTube(mat), POS.rack.clone().add(rack.holes[i]));
    tube.liquid = tube.addLayer(hex(COL.saline), 0.5, { cloudColor: hex(COL.milky) });
    tube.liquid.setRange(0, 0.72);
    place(makeBenchCard(mat, { title: tubeText(t.key).card, w: 3.6, d: 1.3 }), POS.rack.clone().add(V3(rack.holes[i].x, 0, 5)));
    return tube;
  });
  // a slide in front of each tube, long axis toward the student, with its coverslip waiting above
  const mounts = TUBES.map((t, i) => {
    const at = POS.slides.clone().add(V3(rack.holes[i].x, 0, 0));
    const slide = place(makeSlide(mat, { label: [tubeText(t.key).card, T.props.mount] }), at, -Math.PI / 2);
    const cover = place(makeCoverslip(mat), at.clone().add(V3(0, 4, 0)));
    cover.group.visible = false;
    return { slide, cover };
  });
  const tipBox = place(makeTipBox(mat, { lid: false }), POS.tips);
  const stand = place(makePipetteStand(mat), POS.stand);
  const pip = makeMicropipette(mat, { volume: 10 });
  place(pip, pipRest(stand, pip));
  pip.setTip(false);
  const waste = makeWasteBin(mat, { label: T.props.waste, symbol: null });
  waste.group.scale.setScalar(0.7);
  place(waste, POS.waste);
  const scope = place(makeMicroscope(mat), POS.scope, -0.3);
  const bags = FLUIDS.map((f, i) => {
    const F = T.rx.fluids[f.key];
    const bag = place(makeIVBag(mat, { name: F.name, sub: F.bag, band: F.band }), POS.bags.clone().add(V3((i - 1) * BAG_GAP, 0, 0)));
    bag.group.scale.setScalar(BAG_SCALE);
    return bag;
  });

  B = { blood, analyzer, rack, tubes, mounts, tipBox, stand, pip, waste, scope, bags };
  S = {
    tipsUsed: 0, run: -1,           // analyzer: -1 idle, 0..1 running, 1 results
    mix: TUBES.map(() => 0), next: 0,
    drop: TUBES.map(() => 0), cover: TUBES.map(() => 0), nextSlide: 0,
    waitT: 0, brainT: 0, brainOn: false,
    lift: FLUIDS.map(() => 0), dripT: 0, slowT: 0,
    cap: null, painted: '',
  };

  ix.register('blood', blood.group, { ...T.objects.blood, anchor: V3(0, 11.5, 0) });
  ix.register('analyzer', analyzer.group, { ...T.objects.analyzer, anchor: V3(0, 9, 0) });
  TUBES.forEach((t, i) => ix.register(t.key, tubes[i].group, { name: tubeText(t.key).label, short: tubeText(t.key).card, desc: fmt(tubeText(t.key).desc, { osm: Math.round(t.osm) }), anchor: V3(0, 14.5, 0) }));
  ix.register('scope', scope.group, { ...T.objects.scope, anchor: V3(0, 36, 0) });
  ix.register('pipette', pip.group, { ...T.objects.pipette, ringPlane: 'vertical' });
  ix.register('tips', tipBox.group, { ...T.objects.tips });
  ix.register('rack', rack.group, { ...T.objects.rack });
  ix.register('waste', waste.group, { ...T.objects.waste });
  FLUIDS.forEach((f, i) => {
    const F = T.rx.fluids[f.key];
    ix.register(bagKey(f.key), bags[i].group, { name: `${F.name} · ${F.full}`, short: F.name, desc: fmt(F.desc, { na: f.na }), anchor: V3(0, 4, 0) });
  });
  paint();
}

const bagKey = (f) => `bag-${f}`;

function pipRest(stand, pip) {
  return POS.stand.clone().add(stand.rest(pip));
}

/** The analyzer screen and the four tubes, from S alone. */
const tmpC = new THREE.Color();
function paint() {
  const lysedT = clamp(S.waitT / WAIT_REAL);
  const key = `${S.run.toFixed(3)}|${S.mix.map((m) => m.toFixed(3)).join()}|${lysedT.toFixed(3)}|${S.drop.join()}|${S.cover.join()}|${S.lift.join()}`;
  if (key === S.painted) return;
  S.painted = key;
  if (S.run < 0) B.analyzer.setScreen({ title: T.analyzer.ready });
  else if (S.run < 1) B.analyzer.setScreen({ title: T.analyzer.running, progress: S.run });
  else B.analyzer.setScreen({ title: T.analyzer.done, rows: ROWS.map((k) => ({ name: T.analytes[k].name, value: JUNIPER[k], unit: T.analytes[k].unit, flag: flagOf(k) })) });
  TUBES.forEach((t, i) => {
    const m = S.mix[i], burst = t.lysed * lysedT;
    tmpC.set(COL.saline).lerp(new THREE.Color(COL.lysed), m);
    B.tubes[i].liquid.setColor(tmpC).setCloud(m * (1 - burst));
    B.mounts[i].slide.setDrop(S.drop[i], hex(burst > 0.5 ? COL.lysed : COL.milky), S.cover[i]);
    const c = B.mounts[i].cover.group, top = B.mounts[i].slide.anchors.top.y + 0.06;
    c.visible = S.cover[i] > 0;
    c.position.y = top + (1 - S.cover[i]) * 3;
  });
  B.bags.forEach((b, i) => { b.group.position.y = S.lift[i] * 1.6; b.group.rotation.x = -S.lift[i] * 0.12; });
}

// =========================================================================
// Actions
// =========================================================================
const say = (c) => { S.cap = c; };

/** Fresh tip, a drop from `tube` (Juniper's blood unless given), dispense at `into`, eject, hang
 *  the pipette back up. */
async function transfer(above, into, onDispense, C = null, tube = B.blood) {
  const pip = B.pip;
  if (C) say(C.tip);
  await takeTip(pip, POS.tips.clone().add(B.tipBox.tips[S.tipsUsed]), { onSeat: () => B.tipBox.setTaken(++S.tipsUsed) });
  const tp = tube.group.position;
  if (C) say(C.draw);
  await pipetteDraw(pip, {
    above: V3(tp.x, tp.y + tube.h + 1.4, tp.z), into: V3(tp.x, tube.liquid.surfaceY() - 0.4, tp.z), color: hex(COL.cells),
  });
  if (C) say(C.load);
  await pipetteDispense(pip, { above, into, onDispense });
  await ejectTip(pip, root, POS.waste.clone().add(V3(0, 9.5, 0)), POS.waste.clone().setY(0.9), { within: 1.7 });  // bin floor r = 3.0 × 0.7, less the tip's width
  await moveTo(pip.group, { pos: pipRest(B.stand, pip), dur: 0.7, arc: 2 });
}

async function actAnalyze() {
  const C = T.steps.analyze.captions;
  const port = worldOf(B.analyzer.group, B.analyzer.anchors.port);
  await transfer(port.clone().add(V3(0, 2.5, 0)), port.clone().add(V3(0, 0.2, 0)), null, C);
  say(C.run);
  await anim(2.4, (e) => { S.run = e; });
  S.run = 1;
  S.cap = null;
  if (!isInstant()) results.open();
}

async function actCell(key) {
  const i = TUBES.findIndex((t) => t.key === key);
  if (i !== S.next) return;
  S.next++;
  const tube = B.tubes[i], top = worldOf(tube.group, tube.anchors.top);
  await transfer(top.clone().add(V3(0, 1.6, 0)), V3(top.x, tube.liquid.surfaceY() - 0.6, top.z), (e) => { S.mix[i] = e; });
}

async function actSlide(key) {
  const i = TUBES.findIndex((t) => t.key === key);
  if (i !== S.nextSlide) return;
  S.nextSlide++;
  const { slide } = B.mounts[i], spot = worldOf(slide.group, slide.anchors.top);
  await transfer(spot.clone().add(V3(0, 2.2, 0)), spot.clone().add(V3(0, 0.3, 0)), (e) => { S.drop[i] = e; }, null, B.tubes[i]);
  await anim(0.8, (e) => { S.cover[i] = e; });
}

/** A bag clicked: it lifts, the others settle, and the prescription opens on that fluid. */
async function actBag(key) {
  const f = key.slice(4), i = FLUIDS.findIndex((x) => x.key === f);
  if (!isInstant()) rx.open(f);
  const from = S.lift.slice();
  await anim(0.45, (e) => { S.lift = from.map((v, j) => lerp(v, j === i ? 1 : 0, e)); });
}

function setWait(t) { S.waitT = t; }
function setBrain(t) { S.brainT = t; S.brainOn = true; }

// =========================================================================
// Steps
// =========================================================================
const card = (id, slots = {}) => {
  const s = T.steps[id], f = (v) => (typeof v === 'string' ? fmt(v, slots) : v);
  return { title: s.title, short: s.short, action: s.action, hint: f(s.hint), detail: f(s.detail), why: s.why };
};
const nextTube = () => (S && S.next < TUBES.length ? TUBES[S.next] : null);
const nextSlide = () => (S && S.nextSlide < TUBES.length ? TUBES[S.nextSlide] : null);
const WC = T.steps.wait.captions;
const STEPS = [
  { id: 'analyze', ...card('analyze'), targets: ['blood'], view: 'analyze',
    caption: () => (S && S.cap) || T.steps.analyze.title, run: actAnalyze },
  { id: 'read', ...card('read'), targets: ['analyzer'], view: 'analyze', caption: T.steps.read.caption,
    isDone: () => lesson.mode === 'watch' || results.solved(),
    run: async () => { if (!isInstant()) results.open(); } },
  { id: 'cells', ...card('cells'), targets: TUBES.map((t) => t.key), view: 'tubes',
    activeTargets: () => { const n = nextTube(); return n ? [n.key] : []; },
    hint: () => { const n = nextTube(); return n ? fmt(T.steps.cells.hint, { name: tubeText(n.key).label }) : T.steps.cells.done; },
    caption: () => fmt(T.steps.cells.caption, { name: tubeText(TUBES[Math.max(0, Math.min(TUBES.length - 1, S ? S.next - 1 : 0))].key).label }),
    isDone: () => S.next >= TUBES.length,
    progress: () => S.next / TUBES.length,
    run: actCell },
  { id: 'wait', ...card('wait', { min: CLEAR_MIN }), targets: [], view: 'tubes',
    clock: () => (S ? fmt(T.steps.wait.clock, { m: Math.round(CLEAR_MIN * S.waitT / WAIT_REAL) }) : null),
    caption: () => { const r = S ? S.waitT / WAIT_REAL : 0; return r < 0.2 ? WC.mix : r < 0.7 ? WC.clear : WC.settle; },
    watch: { duration: WAIT_REAL, get: () => S.waitT, set: setWait } },
  { id: 'slides', ...card('slides'), targets: TUBES.map((t) => t.key), view: 'tubes',
    activeTargets: () => { const n = nextSlide(); return n ? [n.key] : []; },
    hint: () => { const n = nextSlide(); return n ? fmt(T.steps.slides.hint, { name: tubeText(n.key).label }) : T.steps.slides.done; },
    caption: () => fmt(T.steps.slides.caption, { name: tubeText(TUBES[Math.max(0, Math.min(TUBES.length - 1, S ? S.nextSlide - 1 : 0))].key).label }),
    isDone: () => S.nextSlide >= TUBES.length,
    progress: () => S.nextSlide / TUBES.length,
    run: actSlide },
  { id: 'scope', ...card('scope'), targets: ['scope'], view: 'scope', caption: T.steps.scope.caption,
    hint: () => (slides.seen() ? fmt(T.steps.scope.hintMore, { n: slides.seen() }) : T.steps.scope.hint),
    isDone: () => lesson.mode === 'watch' || (slides.seen() >= TUBES.length && !slides.isOpen),
    progress: () => slides.seen() / TUBES.length,
    run: async () => { if (!isInstant()) slides.open(); } },
  /* the microscope stays open for a second look; only the panel's button moves on */
  { id: 'conclude', ...card('conclude'), targets: ['scope'], view: 'tubes', caption: T.steps.conclude.caption,
    isDone: () => lesson.mode === 'watch' || lesson.isReplaying(),
    run: async () => { if (!isInstant()) { conclude.close(); slides.open(); } } },
  { id: 'brain', ...card('brain', { from: HEALTHY_NA, to: JUNIPER.na }), targets: [], view: 'overview', caption: T.steps.brain.caption,
    clock: () => fmt(T.steps.brain.clock, { na: Math.round(brainState.na) }),
    watch: { duration: BRAIN_REAL, get: () => S.brainT, set: setBrain } },
  { id: 'dana', ...card('dana'), targets: [], view: 'overview', caption: T.steps.dana.caption,
    isDone: () => lesson.mode === 'watch' || chain.solved(),
    run: async () => {} },
  { id: 'rx', ...card('rx'), targets: FLUIDS.map((f) => bagKey(f.key)), view: 'treat', caption: T.steps.rx.caption,
    isDone: () => lesson.mode === 'watch' || lesson.isReplaying() || !!rx.pending,
    run: actBag },
  { id: 'drip', ...card('drip'), targets: [], view: 'treat',
    detail: () => fmt(T.steps.drip.detail, dripSlots()),
    caption: () => fmt(T.steps.drip.caption, dripSlots()),
    clock: () => fmt(T.steps.drip.clock, { h: Math.floor(brainState.h), na: Math.round(brainState.na) }),
    watch: { duration: DRIP_REAL, get: () => S.dripT, set: (t) => { S.dripT = t; } } },
  { id: 'slow', ...card('slow', { na: Math.round(ADAPTED_NA) }), targets: [], view: 'overview', caption: T.steps.slow.caption,
    clock: () => fmt(T.steps.slow.clock, { h: Math.floor(brainState.h), na: Math.round(brainState.na) }),
    watch: { duration: SLOW_REAL, get: () => S.slowT, set: (t) => { S.slowT = t; } } },
];
const READ = 1, SCOPE = 5, CONCLUDE = 6, BRAIN = 7, DANA = 8, RX = 9, DRIP = 10, SLOW = 11;
const AT_BRAIN = [BRAIN, SLOW];            // timed steps that zoom in on their own
const PHASES = [
  { ...T.phases.blood, steps: ['analyze', 'read'] },
  { ...T.phases.cells, steps: ['cells', 'wait', 'slides', 'scope', 'conclude'] },
  { ...T.phases.brain, steps: ['brain'] },
  { ...T.phases.explain, steps: ['dana'] },
  { ...T.phases.treat, steps: ['rx', 'drip', 'slow'] },
];
function dripSlots() {
  const c = rx.choice();
  return { vol: volText(c.vol), fluid: fluidName(c.fluid), rate: RATE };
}

// =========================================================================
// Wire it together
// =========================================================================
let firstEnter = true;
let faced = 0;
lesson = createLesson({
  zoom,
  levelWhy: (key) => { const w = zoom.worlds[key], c = w && w.cue && w.cue(brainState); return c && c.text; },
  steps: STEPS, phases: PHASES, rebuild,
  panel: $('#stepsPanel'),
  completeHint: fmt(T.complete.hint, { limit: SAFE_24H, na: Math.round(DAY3_NA) }),
  completeWhy: T.complete.why,
  onEnter: (step, i) => {
    requestAnimationFrame(() => stage.resize());
    zoom.onStep();
    if (window.Track) Track.step(i, STEPS.length, step ? stripTags(step.title) : T.complete.prompt);
    const id = step ? step.id : 'done', live = !isInstant() && lesson.mode === 'do';
    if (id !== 'read') results.close();
    if (id === 'conclude' && live) conclude.open(); else conclude.close();
    if (id === 'dana' && live) chain.open(); else chain.close();
    if (id === 'rx' && live) rx.open(); else rx.close();
    /* the bench has its own clock until the brain replay: no brain circles before it */
    const bench = !!step && i < BRAIN;
    document.body.classList.toggle('calf-bench', bench);
    if (bench && zoom.scale !== 'lab') zoom.go('lab');
    patient.el.hidden = id !== 'drip';   // her pose is the drip's result; elsewhere the clock carries her Na⁺
    /* the drip just ended: file the run, and send an unsafe one back to the prescription */
    if (id === 'slow' && rx.pending) {
      if (!rx.played() && lesson.mode === 'do') { Promise.resolve().then(() => lesson.jumpTo(RX)); return; }
      report();
    }
    if (!step) {
      if (window.Track && !completed) { completed = true; Track.event('complete'); }
      stage.focus(VIEWS.overview);
      return;
    }
    if (AT_BRAIN.includes(i)) { if (zoom.scale !== 'brain') zoom.go('brain'); else playBrain(); }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; }
    stage.focus(step.view);
  },
});
ix = createInteraction(stage, {
  zoom, targets: lesson.targets, busy: lesson.isBusy, onClick: lesson.click, status: lesson.status, markerStyle: 'circle',
});
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting, watching: () => lesson.mode === 'watch',
  rig: { t: V3(2, 4, 0), p: V3(2, 50, 62) }, special: ['analyze', 'tubes', 'scope', 'treat'],
});

/* Zoomed in, the lab holds Watch mode, where a timed step waits for Play: start it as soon as
   the brain is on screen. */
function playBrain() {
  const s = STEPS[lesson.step];
  if (s && s.watch && [BRAIN, DRIP, SLOW].includes(lesson.step) && s.watch.get() < s.watch.duration && !lesson.autoplaying && !isInstant()) lesson.play();
}

/** What /teach sees: the red-cell conclusions, the chain and the prescriptions, once the drip has been solved. */
let reported = false, completed = false;
function report() {
  if (reported || !window.Track || !rx.solved()) return;
  reported = true;
  const runs = rx.runs(), R = T.report;
  Track.event('quiz', {
    score: (conclude.tries() === 2) + (chain.tries() === 1) + (runs[0].out === 'safe'), total: 3,
    answers: [
      { q: R.conclude, answer: fmt(R.picks, { n: conclude.tries() }), correct: conclude.tries() === 2 },
      { q: R.chain, answer: fmt(R.checks, { n: chain.tries() }), correct: chain.tries() === 1 },
      { q: R.rx, answer: runs.map((r) => `${fluidName(r.fluid)} ${volText(r.vol)} (${T.rx.predict[r.out]})`).join(' → '), correct: runs[0].out === 'safe' },
    ],
  });
}
zoom.listen((scale) => { if (scale === 'brain') playBrain(); });

/** Juniper's pose follows her Na⁺: the seizures stop once it has risen SEIZURE_STOP. */
function patientPose() {
  const st = pose(), id = STEPS[lesson.step] ? STEPS[lesson.step].id : 'done';
  if (id === 'done') return { pose: 'standing', na: st.na };
  if (id === 'slow') return { pose: 'sternal', na: st.na };
  const rise = st.na - JUNIPER.na;
  return { pose: id === 'drip' && rise >= SEIZURE_STOP ? 'sternal' : rise < -0.3 ? 'worse' : 'seizing', na: st.na };
}

/* The complete card's one free-text answer, in the student's own words, sent to /teach as a
   survey keyed by the prompt (the dashboard shows the key as the question). It lives beside the
   card's text, which lesson.js rewrites on every render, so typing survives a render. */
const answer = (() => {
  const A = T.complete, KEY = 'calf.answer';
  const box = document.createElement('div');
  box.className = 'calf-answer';
  box.innerHTML = `
    <div class="calf-art"><div class="crop"><img src="${new URL('art/calf-standing.webp', import.meta.url).href}" alt="${T.patient.alt.standing}"></div></div>
    <label class="ans-q" for="calfAnswer">${A.prompt}</label>
    <textarea id="calfAnswer" rows="3" maxlength="500" placeholder="${A.placeholder}"></textarea>
    <div class="ans-row"><span class="ans-sent" aria-live="polite"></span><button type="button" class="ans-send">${A.send}</button></div>`;
  document.querySelector('#lab-card .card-body > div').appendChild(box);
  const ta = box.querySelector('textarea'), send = box.querySelector('.ans-send'), sent = box.querySelector('.ans-sent');
  const store = { get() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }, set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* private window */ } } };
  ta.value = store.get();
  const paint = (done) => { send.disabled = !ta.value.trim(); sent.textContent = done ? (window.Track ? A.sent : A.saved) : ''; };
  ta.addEventListener('input', () => paint(false));
  send.addEventListener('click', () => {
    const v = ta.value.trim().slice(0, 500);
    if (!v) return;
    store.set(v);
    if (window.Track) Track.event('survey', { answers: { [stripTags(A.prompt)]: v } });
    paint(true);
  });
  paint(false);
  return { reset() { ta.value = ''; store.set(''); paint(false); } };
})();

function restart() {
  newSession();
  firstEnter = false;
  results.reset(); slides.reset(); conclude.reset(); chain.reset(); rx.reset(); answer.reset();
  reported = false; completed = false;
  lesson.restart();
}

stage.onFrame((dt) => {
  lesson.update(dt);
  patient.set(patientPose());
  const facing = brain.view(brainState);
  if (facing !== faced) { faced = facing; zoom.onStep(); }   // swing the brain's camera round
  follow.update(dt);
  if (B) paint();
  zoom.update(dt);
  ix.update();
});

const intro = createIntro(stage);
bindChrome({ stage, zoom, restart, expose: { get S() { return S; }, get B() { return B; }, lesson, ix, stage, follow, zoom, results, slides, conclude, chain, rx, brain, bubble, patient, STEPS, pose, closeIntro: intro.close } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
