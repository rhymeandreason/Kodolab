/* Strawberry DNA — DNA extraction lab, rebuilt on the shared Lab library.
 * The original lives in /Strawberry and is untouched.
 *
 * The whole experiment runs on one clock, S.t (0..6, one unit per original
 * step). Each click animates S.t from one resting point to the next with
 * anim(); the bench (bench.js), the cell (cell.js) and the molecules
 * (molecule.js) are all posed from S.t, so replaying, jumping and the zoom
 * circles always agree. */
import * as THREE from 'three';
import {
  V3, lerp, Ease, anim, newSession, disposeTree, toast, isInstant,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, cues, createZoom,
  createIntro, chromeInsets, bindChrome, T, fmt,
} from '../lab.js';
import { buildBench } from './bench.js';
import { createCell } from './cell.js';
import { createMolecule } from './molecule.js';

const $ = (s) => document.querySelector(s);

// =========================================================================
// Camera views (bench), one per step
// =========================================================================
const VIEWS = {
  overview: { t: V3(-2, 3, 0), p: V3(0, 44, 66) },
  berry: { t: V3(-6, 2, 4), p: V3(4, 22, 38) },
  mash: { t: V3(-11, 1.5, 2), p: V3(-5, 20, 24) },
  pour: { t: V3(-18, 4, 3), p: V3(-12, 26, 36) },
  mix: { t: V3(-12, 2, 1), p: V3(-6, 22, 27) },
  filter: { t: V3(6, 14, 0), p: V3(18, 30, 56) },
  funnel: { t: V3(4, 8, -5), p: V3(10, 28, 44) },
  alcohol: { t: V3(13, 9, -0.5), p: V3(4, 16, 32) },
  dna: { t: V3(11, 6.4, 1), p: V3(7.5, 11, 18.5) },        // close on the tube while the DNA forms
  spool: { t: V3(17, 6.5, 6), p: V3(11, 24, 42) },       // the tube and the skewer on the bench
  spoolIn: { t: V3(11, 9.2, 1), p: V3(14.5, 14.5, 17.5) }, // close on the tube while the skewer twirls at the boundary
  spooled: { t: V3(10.3, 18.3, 2.3), p: V3(14.5, 23.5, 12) }, // the DNA wound on the lifted skewer (lab complete), a little from above so the bench is behind it
};

// =========================================================================
// Stage, materials, zoom levels
// =========================================================================
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  controls: { minDistance: 8, maxDistance: 140 },
  insets: (w, h) => chromeInsets(w, h),
});
const mat = createMaterials(stage);

let S = { t: 0, mash: 0 };   // bench state: recreated by rebuild()
let root = null, B = null;
let lesson, ix;

// which original step (0..5) a lesson step belongs to: picks the cell/molecule views and text
const origStep = () => { const s = STEPS[lesson ? lesson.step : 0]; return s ? s.orig : 5; };
const zoom = createZoom(stage, {
  levels: [
    { key: 'cell', world: createCell(stage.env), name: T.levels.cell.name, meta: T.levels.cell.meta, bg: '#e9f2ee' },
    { key: 'mol', world: createMolecule(stage.env), name: T.levels.mol.name, meta: T.levels.mol.meta, bg: '#eceaf6' },
  ],
  getT: () => S.t,
  getStep: origStep,
});

/** The card's "why" at the bench; createLesson swaps in levelWhy's when zoomed in. */
const why = (i) => T.why[i].lab;

// =========================================================================
// The bench (rebuilt on every jump)
// =========================================================================
function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group();
  stage.scene.add(root);
  S = { t: 0, mash: 0 };
  B = buildBench(mat, root);
  const P = B.props;
  // targets
  // the strawberry and its leaves are one target: one click pulls the leaves off and bags it
  ix.register('berry', B.berryGroup, { ...T.objects.berry, anchor: V3(0, 1.9, 0) });
  ix.addGroup('berry', P.calyx.group);
  ix.register('bag', P.bag.group, { ...T.objects.bag, anchor: V3(0, 2.2, 0) });
  ix.register('beaker', P.beaker.group, { ...T.objects.beaker, anchor: V3(0, 9.4, 0) });
  ix.register('funnel', P.funnel.group, { ...T.objects.funnel, anchor: V3(0, 7.4, 0) });
  ix.register('bottle', P.bottle.group, { ...T.objects.bottle, anchor: V3(0, 10.6, 0), ringAround: P.ice.group });
  ix.register('skewer', P.skewer.group, { ...T.objects.skewer, anchor: V3(0, 7.5, 0) });
  // things to hover for their name and what they do
  ix.register('soap', P.soap.group, { ...T.objects.soap });
  ix.register('salt', P.salt.group, { ...T.objects.salt });
  ix.register('tube', P.tube.group, { ...T.objects.tube });
  ix.register('cup', P.cup.group, { ...T.objects.cup });
  ix.register('ice', P.ice.group, { ...T.objects.ice });
  ix.register('bowl', P.bowl.group, { ...T.objects.bowl });
}

/** Run the experiment clock from where it is to t1 over dur seconds. */
function clockTo(t1, dur) {
  const t0 = S.t;
  return anim(dur, (e, k) => { S.t = lerp(t0, t1, k); }, Ease.linear);
}
const MASH = [[1.5, 2.2], [1.7, 1.6], [2.0, 2.2]]; // [t at rest after the click, seconds]

// =========================================================================
// Steps
// =========================================================================
const C = Object.fromEntries(Object.entries(T.steps).map(([k, v]) => [k, v.captions]));
/** A step's card text from text.js: title, short, action, hint, detail. */
const card = (id) => { const { title, short, action, hint, detail } = T.steps[id]; return { title, short, action, hint, detail }; };
const STEPS = [
  {
    id: 'berry', orig: 0, ...card('berry'), targets: ['berry'], view: 'berry',
    caption: cues(() => S.t, [[0, C.berry.leaves], [0.42, C.berry.bag], [0.9, C.berry.seal]]),
    why: why(0),
    run: () => clockTo(1.28, 3.8),  // leaves off (0-0.6, eased out), into the bag (0.42-0.95), bag sealed (0.9-1.28)
  },
  {
    id: 'mash', orig: 1, ...card('mash'), targets: ['bag'], view: 'mash',
    caption: cues(() => S.t, [[1.28, C.mash.squish], [1.6, C.mash.lumps]]),
    hint: () => (S.mash === 0 ? T.steps.mash.hint : fmt(T.steps.mash.hintMore, { n: S.mash, total: 3 })),
    why: why(1),
    run: async () => { const [t1, dur] = MASH[S.mash]; S.mash++; await clockTo(t1, dur); },
    isDone: () => S.mash >= 3,
    progress: () => S.mash / 3,
  },
  {
    id: 'pour', orig: 2, ...card('pour'), targets: ['beaker'], view: 'pour',
    caption: cues(() => S.t, [[2.0, C.pour.pour], [2.4, C.pour.soap]]),
    why: why(2),
    run: () => clockTo(2.7, 5.5),
  },
  {
    id: 'mix', orig: 2, ...card('mix'), targets: ['bag'], view: 'mix',
    caption: C.mix.mix,
    why: why(2),
    run: () => clockTo(3.0, 2.8),
  },
  {
    id: 'filter', orig: 3, ...card('filter'), targets: ['bag'], view: 'filter',
    caption: cues(() => S.t, [[3.0, C.filter.pour], [3.36, C.filter.drip]]),
    why: why(3),
    run: () => clockTo(4.0, 9),
  },
  {
    id: 'funnel', orig: 4, ...card('funnel'), targets: ['funnel'], view: 'funnel',
    caption: cues(() => S.t, [[4.0, C.funnel.lift], [4.1, C.funnel.stays]]),
    why: why(3),
    run: () => clockTo(4.15, 1.8),
  },
  {
    id: 'alcohol', orig: 4, ...card('alcohol'), targets: ['bottle'], view: 'alcohol',
    caption: cues(() => S.t, [[4.15, C.alcohol.pour], [4.78, C.alcohol.floats], [4.92, C.alcohol.wait], [4.975, C.alcohol.appear]]),
    why: why(4),
    run: async () => {
      await clockTo(4.92, 5.5);              // the pour
      if (!isInstant()) {                     // then a close look at the tube while the DNA forms
        follow.hold();                        // Watch mode: keep this view, don't reframe the bottle
        stage.focus('dna', 1.6);
      }
      await clockTo(4.94, 1.6);               // outside the if, so the lesson's dry run counts it
      await clockTo(5.0, 6);                  // real life: a few minutes; strands gather at the boundary
    },
    // time-lapse clock on the card: 0:00 → 5:00 of real time over the wait (t 4.92 → 5.0)
    clock: () => {
      if (S.t < 4.92) return null;
      const sec = Math.round(Math.min(1, (S.t - 4.92) / 0.08) * 300);
      return fmt(T.steps.alcohol.clock, { m: Math.floor(sec / 60), ss: String(sec % 60).padStart(2, '0') });
    },
  },
  {
    id: 'spool', orig: 5, ...card('spool'), targets: ['skewer'], view: 'spool',
    caption: cues(() => S.t, [[5.0, C.spool.lower], [5.3, C.spool.twirl], [5.72, C.spool.lift]]),
    // no why here: what you are holding is explained on the complete card (completeWhy)
    run: async () => {
      await clockTo(5.17, 1.6);              // skewer over to the tube
      const close = (v) => { if (!isInstant()) { follow.hold(); stage.focus(v, 1.4); } };
      close('spoolIn');                      // in close while it goes in and twirls
      await clockTo(5.72, 5);
      close('spooled');                      // follow it up as it lifts the DNA out
      await clockTo(6.0, 2.6);
    },
  },
];
const PHASES = [
  { ...T.phases.berry, steps: ['berry'] },
  { ...T.phases.mash, steps: ['mash'] },
  { ...T.phases.buffer, steps: ['pour', 'mix'] },
  { ...T.phases.filter, steps: ['filter'] },
  { ...T.phases.alcohol, steps: ['funnel', 'alcohol'] },
  { ...T.phases.spool, steps: ['spool'] },
];

// =========================================================================
// Wire it together
// =========================================================================
let firstEnter = true;
lesson = createLesson({
  zoom,
  // spool has no why: what you are holding is explained on the complete card
  levelWhy: (k, s) => (s && s.id === 'spool' ? null : T.why[s ? s.orig : 5][k]),
  steps: STEPS,
  phases: PHASES,
  rebuild,
  panel: $('#stepsPanel'),
  completeHint: T.complete.hint,
  completeWhy: why(5),
  completeCaption: T.complete.caption,
  onEnter: (step) => {
    requestAnimationFrame(() => stage.resize()); // the card's new height changes the free area
    zoom.onStep();
    if (!step) { stage.focus('spooled', 1.6); toast(T.complete.toast, { icon: 'ph-dna' }); return; }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; } // the opening move, after Start
    stage.focus(step.view);
  },
});
ix = createInteraction(stage, {
  zoom,
  targets: lesson.targets,
  busy: lesson.isBusy,
  onClick: lesson.click,
  status: lesson.status,
  markerStyle: new URLSearchParams(location.search).get('marker') || 'circle',
});
// Watch mode's camera: one default zoom that pans along the bench; only the close-ups
// on the DNA zoom in (rules in follow.js)
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting,
  watching: () => lesson.mode === 'watch',
  rig: { t: V3(0, 4.5, 1), p: V3(5, 26.5, 43) },
  special: ['dna', 'spoolIn', 'spooled'],
  keepClose: ['spool'],   // stay close from the DNA forming to the skewer going in
});

function restart() {
  newSession();
  firstEnter = false;
  lesson.restart();
}

stage.onFrame((dt, now) => {
  lesson.update(dt);
  follow.update(dt);
  if (B) B.tick(S.t, now / 1000);
  zoom.update(dt);
  ix.update();
});


// the intro card (its strawberry is started early by intro-art.js)
const intro = createIntro(stage);

bindChrome({ stage, zoom, restart, expose: { get S() { return S; }, get B() { return B; }, lesson, ix, stage, follow, zoom, STEPS, intro } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
