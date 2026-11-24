/* Juniper's Seizures: a vet's bench for a calf with water intoxication (hyponatremia).
 *   1 Blood work: a drop into the analyzer, the results panel (results.js)
 *   2 Red cells: a drop of blood into four solutions, the tubes clear or stay cloudy, the
 *     slides under the microscope (eyepiece.js)
 *   3 The brain: replay last night at the membrane between blood and an astrocyte (brain.js)
 * Every number is model.js's. The bench is rebuilt on every timeline jump (rebuild()); all
 * bench state lives in S. */
import * as THREE from 'three';
import {
  V3, lerp, clamp, worldOf, newSession, anim, isInstant, moveTo,
  takeTip, pipetteDraw, pipetteDispense, ejectTip, disposeTree, fmt, T,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, createZoom, createIntro,
  chromeInsets, bindChrome, PHONE,
  makeBench, makeMicroscope, makeTubeRack, makeTestTube, makeBenchCard, makeAnalyzer,
  makeMicropipette, makeTipBox, makePipetteStand, makeWasteBin, makeSlide, makeCoverslip,
} from '../lab.js';
import { JUNIPER, HEALTHY_NA, TUBES, CLEAR_MIN } from './model.js';
import { createResults, ROWS, flagOf } from './results.js';
import { createSlides } from './slides.js';
import { createBrainLevel } from './brain.js';

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
};
/* intact cells scatter light: an opaque, milky red. Burst cells leave hemoglobin dissolved: clear red */
const COL = { saline: '#e4f0fb', cells: '#9b3a33', milky: '#a3463e', lysed: '#c8102e' };
const WAIT_REAL = 8;      // seconds the wait plays in
const BRAIN_REAL = 12;    // seconds last night plays in
const VIEWS = {
  overview: { t: V3(2, 4, 0), p: V3(2, 64, 78) },
  analyze: { t: V3(-28, 5, -2), p: V3(-28, 40, 44) },
  tubes: { t: V3(4, 6, -2), p: V3(4, 38, 44) },
  scope: { t: V3(34, 12, -4), p: V3(34, 46, 52) },
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
    if (lesson.step === SCOPE && slides.seen() >= TUBES.length && !slides.isOpen) lesson.jumpTo(SCOPE + 1);
  },
});
const stage = createStage({
  canvas: $('#scene'), views: VIEWS,
  controls: { minDistance: 8, maxDistance: 170 },
  insets: (w, h) => {
    const r = chromeInsets(w, h);
    if (results.isOpen && w > PHONE) r.right = Math.max(r.right, w - results.el.getBoundingClientRect().left + 10);
    return r;
  },
});
const mat = createMaterials(stage);

const brain = createBrainLevel(stage.env);
const brainState = { na: JUNIPER.na };
const zoom = createZoom(stage, {
  levels: [{ key: 'brain', world: brain, name: T.levels.brain.name, meta: T.levels.brain.meta, bg: '#f1eef4' }],
  getT: () => { brainState.na = S && S.brainOn ? lerp(HEALTHY_NA, JUNIPER.na, S.brainT / BRAIN_REAL) : JUNIPER.na; return brainState; },
  getStep: () => 0,
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
  const pip = place(makeMicropipette(mat, { volume: 10 }), pipRest(stand));
  pip.setTip(false);
  const waste = makeWasteBin(mat, { label: T.props.waste, symbol: null });
  waste.group.scale.setScalar(0.7);
  place(waste, POS.waste);
  const scope = place(makeMicroscope(mat), POS.scope, -0.3);

  B = { blood, analyzer, rack, tubes, mounts, tipBox, stand, pip, waste, scope };
  S = {
    tipsUsed: 0, run: -1,           // analyzer: -1 idle, 0..1 running, 1 results
    mix: TUBES.map(() => 0), next: 0,
    drop: TUBES.map(() => 0), cover: TUBES.map(() => 0), nextSlide: 0,
    waitT: 0, brainT: 0, brainOn: false,
    cap: null, painted: '',
  };

  ix.register('blood', blood.group, { ...T.objects.blood, anchor: V3(0, 11.5, 0) });
  ix.register('analyzer', analyzer.group, { ...T.objects.analyzer, anchor: V3(0, 9, 0) });
  TUBES.forEach((t, i) => ix.register(t.key, tubes[i].group, { name: tubeText(t.key).label, short: tubeText(t.key).card, desc: fmt(tubeText(t.key).desc, { osm: Math.round(t.osm) }), anchor: V3(0, 14.5, 0) }));
  ix.register('scope', scope.group, { ...T.objects.scope, anchor: V3(0, 36, 0) });
  ix.register('pipette', pip.group, { ...T.objects.pipette });
  ix.register('tips', tipBox.group, { ...T.objects.tips });
  ix.register('rack', rack.group, { ...T.objects.rack });
  ix.register('waste', waste.group, { ...T.objects.waste });
  paint();
}

function pipRest(stand) {
  return POS.stand.clone().add(stand ? stand.anchors.hang : V3(0, 21.6, -0.1)).sub(V3(0, 18.6, -1.6));
}

/** The analyzer screen and the four tubes, from S alone. */
const tmpC = new THREE.Color();
function paint() {
  const lysedT = clamp(S.waitT / WAIT_REAL);
  const key = `${S.run.toFixed(3)}|${S.mix.map((m) => m.toFixed(3)).join()}|${lysedT.toFixed(3)}|${S.drop.join()}|${S.cover.join()}`;
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
  await ejectTip(pip, root, POS.waste.clone().add(V3(0, 9.5, 0)), POS.waste.clone().setY(0.9));
  await moveTo(pip.group, { pos: pipRest(B.stand), dur: 0.7, arc: 2 });
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
    isDone: () => lesson.mode === 'watch' || slides.seen() >= TUBES.length,
    progress: () => slides.seen() / TUBES.length,
    run: async () => { if (!isInstant()) slides.open(); } },
  { id: 'brain', ...card('brain', { from: HEALTHY_NA, to: JUNIPER.na }), targets: [], view: 'overview', caption: T.steps.brain.caption,
    clock: () => fmt(T.steps.brain.clock, { na: Math.round(brainState.na) }),
    watch: { duration: BRAIN_REAL, get: () => S.brainT, set: setBrain } },
];
const READ = 1, SCOPE = 5, BRAIN = 6;
const PHASES = [
  { ...T.phases.blood, steps: ['analyze', 'read'] },
  { ...T.phases.cells, steps: ['cells', 'wait', 'slides', 'scope'] },
  { ...T.phases.brain, steps: ['brain'] },
];

// =========================================================================
// Wire it together
// =========================================================================
let firstEnter = true;
lesson = createLesson({
  zoom,
  levelWhy: () => { const c = brain.cue(brainState); return c && c.text; },
  steps: STEPS, phases: PHASES, rebuild,
  panel: $('#stepsPanel'),
  completeHint: T.complete.hint,
  completeWhy: T.complete.why,
  onEnter: (step) => {
    requestAnimationFrame(() => stage.resize());
    zoom.onStep();
    if (!step || step.id !== 'read') results.close();
    if (!step) return;
    if (step.id === 'brain') { if (zoom.scale !== 'brain') zoom.go('brain'); else playBrain(); }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; }
    stage.focus(step.view);
  },
});
ix = createInteraction(stage, {
  zoom, targets: lesson.targets, busy: lesson.isBusy, onClick: lesson.click, status: lesson.status, markerStyle: 'circle',
});
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting, watching: () => lesson.mode === 'watch',
  rig: { t: V3(2, 4, 0), p: V3(2, 50, 62) }, special: ['analyze', 'tubes', 'scope'],
});

/* Zoomed in, the lab holds Watch mode, where a timed step waits for Play: start last night as
   soon as the brain is on screen. */
function playBrain() {
  if (lesson.step === BRAIN && S && S.brainT < BRAIN_REAL && !lesson.autoplaying && !isInstant()) lesson.play();
}
zoom.listen((scale) => { if (scale === 'brain') playBrain(); });

function restart() {
  newSession();
  firstEnter = false;
  results.reset(); slides.reset();
  lesson.restart();
}

stage.onFrame((dt) => {
  lesson.update(dt);
  follow.update(dt);
  if (B) paint();
  zoom.update(dt);
  ix.update();
});

const intro = createIntro(stage);
bindChrome({ stage, zoom, restart, expose: { get S() { return S; }, get B() { return B; }, lesson, ix, stage, follow, zoom, results, slides, brain, STEPS, closeIntro: intro.close } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
