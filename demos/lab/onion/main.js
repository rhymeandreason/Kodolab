/* Onion Root Tip: a root-tip squash, from cutting the tip to counting dividing cells.
 *
 * The bench is rebuilt from scratch whenever the student jumps on the timeline (rebuild()),
 * and each step's click is one async action (anim / moveTo / wait). The last step clips the
 * slide onto the microscope; looking through it opens the microscope view (scope.js), which
 * is not bench state and survives a rebuild. */
import * as THREE from 'three';
import {
  V3, Q, lerp, Ease,
  anim, moveTo, isInstant, newSession,
  disposeTree, toLinear,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, createIntro, chromeInsets, bindChrome,
  makeBench, makeBeaker, makeTestTube, makeTubeRack, makeWaterBath, makeReagentBottle, makePipette, makeToolHolder,
  makeBenchCard, makeOnion, makeScalpel, makePencil, makeSlide, makeCoverslip, makeFilterPaper, makeMicroscope,
  T, fmt,
} from '../lab.js';
import { STAINS, STAIN_KEYS } from './stains.js';
import { createScope, ENOUGH } from './scope.js';

const $ = (s) => document.querySelector(s);

// =========================================================================
// Layout (cm, bench top at y = 0)
// =========================================================================
const POS = {
  beaker: V3(-40, 0, -2), scalpel: V3(-32, 0, 9),
  rack: V3(-25, 0, -8), bath: V3(-10, 0, -8),
  orcein: V3(1, 0, -11), toluidine: V3(7, 0, -11), pipHolder: V3(12.5, 0, -5),
  slide: V3(3, 0, 7), coverslip: V3(9.5, 0, 9.5), paper: V3(13, 0, 5.5), pencil: V3(18, 0.34, 11),
  scope: V3(32, 0, -6),
};
const SLIDE_ROT = -0.08, SCOPE_ROT = -0.45, PENCIL_YAW = 0.35;
const ONION_Y = 6.65;      // the bulb rests on the beaker's rim
const LIFT = 7;            // high enough to clear the rim with the roots
const PIP_SCALE = 0.6;
const PRESSES = 3;         // presses to spread the cells into one layer
const ACID = { color: 0xdcecff, cleared: '#f7f1df' };
const hex = (c) => new THREE.Color(c).getHex();
const pencilRest = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, PENCIL_YAW, 0, 'YXZ'));

const VIEWS = {
  overview: { t: V3(-4, 6, -1), p: V3(-4, 52, 78) },
  onion: { t: V3(-33, 7, -3), p: V3(-29, 25, 36) },
  acid: { t: V3(-17, 5, -7), p: V3(-17, 25, 30) },
  stain: { t: V3(5, 4, -1), p: V3(5, 26, 34) },
  slide: { t: V3(8, 1, 7), p: V3(8, 17, 24) },
  scope: { t: V3(27, 15, -5), p: V3(13, 38, 58) },
};

// =========================================================================
// Stage
// =========================================================================
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  controls: { minDistance: 6, maxDistance: 160 },
  insets: (w, h) => chromeInsets(w, h),
});
const { scene } = stage;
const mat = createMaterials(stage);

let root = null, B = null, S = null;
let lesson, ix;

const scope = createScope({
  onClose: () => {
    stage.setRender(null);
    stage.glide(VIEWS.scope, 0);
    if (lesson.step === COUNT && scope.tally().total >= ENOUGH) lesson.jumpTo(COUNT + 1);
    else lesson.render();
  },
});

// =========================================================================
// The bench, rebuilt from scratch whenever the student jumps on the timeline
// =========================================================================
function place(prop, pos, rotY = 0) {
  prop.group.position.copy(pos);
  if (rotY) prop.group.rotation.y = rotY;
  root.add(prop.group);
  return prop;
}

function rebuild() {
  if (root) { scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group();
  scene.add(root);
  const P = T.props;

  place(makeBench(mat), V3());
  const beaker = place(makeBeaker(mat, { r: 3, h: 8, cap: 200, label: P.beaker.label, sub: P.beaker.sub, color: '#0891b2', liquidColor: 0x9fd0ee }), POS.beaker);
  beaker.liquid.setLevel(5.5);
  const onion = place(makeOnion(mat), POS.beaker.clone().setY(ONION_Y));
  const scalpel = place(makeScalpel(mat), POS.scalpel, 0.5);

  const rack = place(makeTubeRack(mat, { holes: 2, spacing: 3.2, holeR: 1.05, color: toLinear('#c3cdf4') }), POS.rack);
  const tube = place(makeTestTube(mat, { r: 0.9, h: 10 }), POS.rack.clone().add(rack.holes[0]));
  tube.addLayer(ACID.color, 0.42).setRange(0, 0.35);
  place(makeBenchCard(mat, { title: P.acid.title, sub: P.acid.sub, subColor: '#4f46e5' }), POS.rack.clone().add(V3(0, 0, 4.6)));
  const bath = place(makeWaterBath(mat, { setpoint: '60.0', label: P.bath.label }), POS.bath);

  const stains = {};
  STAIN_KEYS.forEach((k) => {
    const b = place(makeReagentBottle(mat, { ...P[k], color: STAINS[k].liquid, liquidColor: hex(STAINS[k].liquid) }), POS[k], k === 'orcein' ? 0.15 : -0.15);
    b.liquid.setFraction(0.6);
    stains[k] = b;
  });
  place(makeToolHolder(mat), POS.pipHolder);
  const pip = makePipette(mat, { fluid: mat.make.liquid(hex(STAINS.orcein.liquid), 0.85) });
  pip.group.scale.setScalar(PIP_SCALE);
  place(pip, POS.pipHolder.clone().add(V3(0, 0.3, 0)));

  const slide = place(makeSlide(mat, { label: P.slide }), POS.slide, SLIDE_ROT);
  const coverslip = place(makeCoverslip(mat), POS.coverslip, 0.25);
  const paper = place(makeFilterPaper(mat), POS.paper, 0.4);
  const pencil = place(makePencil(mat), POS.pencil);
  pencil.group.quaternion.copy(pencilRest());
  const micro = place(makeMicroscope(mat), POS.scope, SCOPE_ROT);

  B = { beaker, onion, scalpel, rack, tube, bath, stains, pip, slide, coverslip, paper, pencil, micro };
  S = {
    stain: null,       // the stain the student picked
    presses: 0,        // squash presses so far
    squash: 0,         // how far the tissue has spread, 0..1 (the microscope reads it)
    clock: null,       // the card's timer text while a timed step runs
    cap: null,         // Watch mode's caption while an action runs
    openAfter: false,  // look down the microscope once the last step's click has played
  };

  const O = T.objects;
  ix.register('onion', onion.group, { ...O.onion, anchor: V3(0, 9.4, 0) });
  ix.register('bath', bath.group, { ...O.bath, anchor: V3(0, 7.5, 0) });
  STAIN_KEYS.forEach((k) => ix.register(k, stains[k].group, { ...O[k], anchor: V3(0, 11.6, 0) }));
  ix.register('coverslip', coverslip.group, { ...O.coverslip, anchor: V3(0, 1, 0) });
  ix.register('pencil', pencil.group, { ...O.pencil, anchor: V3(0, 8.5, 0) });
  ix.register('scope', micro.group, { ...O.scope, anchor: V3(0, 38.5, 0) });
  ix.register('scalpel', scalpel.group, { ...O.scalpel });
  ix.register('acid', tube.group, { ...O.acid });
  ix.register('pipette', pip.group, { ...O.pipette });
  ix.register('slide', slide.group, { ...O.slide });
  ix.register('paper', paper.group, { ...O.paper });
}

// =========================================================================
// Helpers
// =========================================================================
const world = (prop, local) => prop.group.localToWorld(local.clone());
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/** Count `secs` of real time down on the card's clock over `dur` seconds of animation. */
async function countdown(secs, dur, onTick = () => {}) {
  await anim(dur, (e, k) => { S.clock = mmss(Math.ceil(secs * (1 - k))); onTick(k); }, Ease.linear);
  S.clock = null;
}
/** Where the tip lies on the slide, in world space, and its orientation along the slide. */
const slideSpot = () => world(B.slide, V3(0, B.slide.thickness + 0.1, 0));
const lyingOnSlide = () => Q(0, SLIDE_ROT, Math.PI / 2);

function squeeze(k, dur = 0.3) { return anim(dur, (e, t) => B.pip.setSqueeze(Math.sin(Math.PI * t) * k), Ease.linear); }
const PIP_FLUID = 3.2;

// =========================================================================
// Steps
// =========================================================================
async function cut() {
  const { onion, scalpel, tube } = B;
  S.cap = T.steps.cut.captions.lift;
  await anim(1.2, (e) => { onion.group.position.y = ONION_Y + LIFT * e; });
  S.cap = T.steps.cut.captions.cut;
  const at = world(onion, onion.anchors.cut);
  const rest = { p: scalpel.group.position.clone(), q: scalpel.group.quaternion.clone() };
  const p1 = at.clone().add(V3(0.3, -0.05, 2.6));
  await moveTo(scalpel.group, { pos: p1, quat: Q(0, -Math.PI / 2, 0), dur: 1, arc: 6 });
  await moveTo(scalpel.group, { pos: p1.clone().add(V3(0, 0, -5)), dur: 0.35 });
  S.cap = T.steps.cut.captions.drop;
  root.attach(onion.tip);
  moveTo(scalpel.group, { pos: rest.p, quat: rest.q, dur: 1.1, arc: 5 });
  anim(1.3, (e) => { onion.group.position.y = ONION_Y + LIFT * (1 - e); });
  const top = world(tube, tube.anchors.top);
  await moveTo(onion.tip, { pos: top.clone().add(V3(0, 2, 0)), quat: new THREE.Quaternion(), dur: 1.2, arc: 4 });
  await moveTo(onion.tip, { pos: world(tube, tube.anchors.floor).add(V3(0, 0.6, 0)), dur: 0.7, ease: Ease.in });
  tube.group.attach(onion.tip);
  S.cap = null;
}

async function acid() {
  const { tube, bath, onion } = B;
  const home = tube.group.position.clone(), slot = world(bath, bath.slots[0]);
  await moveTo(tube.group, { pos: home.clone().add(V3(0, 11, 0)), dur: 0.6 });
  await moveTo(tube.group, { pos: slot.clone().add(V3(0, 11, 0)), dur: 0.9 });
  await moveTo(tube.group, { pos: slot, dur: 0.6, ease: Ease.out });
  bath.setActive(true);
  await countdown(300, 3.6, (k) => onion.setTip(ACID.cleared, k, 0.82));
  bath.setActive(false);
  onion.holdTip();
  await moveTo(tube.group, { pos: slot.clone().add(V3(0, 11, 0)), dur: 0.6 });
  await moveTo(tube.group, { pos: home.clone().add(V3(0, 11, 0)), dur: 0.9 });
  await moveTo(tube.group, { pos: home, dur: 0.6, ease: Ease.out });
}

async function stain(key) {
  S.stain = key;
  const C = STAINS[key], bottle = B.stains[key], { onion, slide, pip, tube } = B;
  // the tip onto the slide
  root.attach(onion.tip);
  const top = world(tube, tube.anchors.top);
  await moveTo(onion.tip, { pos: top.clone().add(V3(0, 2, 0)), dur: 0.7 });
  await moveTo(onion.tip, { pos: slideSpot(), quat: lyingOnSlide(), dur: 1.2, arc: 4 });
  slide.group.attach(onion.tip);
  // a drop of stain on it
  const g = pip.group, rest = g.position.clone();
  pip.fluid.material.color.set(hex(C.liquid));
  const neck = world(bottle, bottle.anchors.spout), surf = bottle.liquid.surfaceY();
  const cap0 = bottle.cap.position.clone();
  await moveTo(bottle.cap, { pos: cap0.clone().add(V3(0, 2.5, 0)), dur: 0.4 });
  await moveTo(g, { pos: V3(neck.x, neck.y + 2, neck.z), dur: 0.7, arc: 3 });
  await moveTo(g, { pos: V3(neck.x, surf - 0.5, neck.z), dur: 0.4 });
  await Promise.all([squeeze(1, 0.4), anim(0.4, (e) => pip.setFluid(PIP_FLUID * e))]);
  await moveTo(g, { pos: V3(neck.x, neck.y + 2, neck.z), dur: 0.4 });
  moveTo(bottle.cap, { pos: cap0, dur: 0.4 });
  const spot = slideSpot();
  await moveTo(g, { pos: spot.clone().add(V3(0, 2.4, 0)), dur: 0.8, arc: 3 });
  squeeze(1, 0.3);
  anim(0.3, (e) => pip.setFluid(PIP_FLUID * (1 - e)));
  await anim(0.45, (e) => slide.setDrop(e, hex(C.liquid)), Ease.out);
  await moveTo(g, { pos: rest, dur: 0.9, arc: 3 });
  // two minutes: the meristem darkens most
  await countdown(120, 3, (k) => onion.setTip(hex(C.tip), k));
  onion.holdTip();
}

async function cover() {
  const { slide, coverslip, paper, pencil } = B;
  const C = STAINS[S.stain || 'orcein'];
  const y0 = slide.thickness + 0.06;
  await moveTo(coverslip.group, { pos: world(slide, V3(0.4, y0 + 1.6, 0)), quat: Q(0, SLIDE_ROT, 0.5), dur: 0.9, arc: 2 });
  const q0 = coverslip.group.quaternion.clone(), p0 = coverslip.group.position.clone();
  const p1 = world(slide, V3(0, y0, 0)), q1 = Q(0, SLIDE_ROT, 0);
  await anim(0.9, (e) => {
    coverslip.group.position.lerpVectors(p0, p1, e);
    coverslip.group.quaternion.copy(q0).slerp(q1, e);
    slide.setDrop(1, hex(C.liquid), e);
  });
  slide.group.attach(coverslip.group);
  await moveTo(paper.group, { pos: world(slide, V3(0, y0 + 0.03, 0)), quat: Q(0, SLIDE_ROT + 0.05, 0), dur: 0.9, arc: 2 });
  paper.setSpot(0.15, hex(C.liquid));
  await moveTo(pencil.group, { pos: world(slide, V3(0, y0 + 2, 0)), quat: new THREE.Quaternion(), dur: 1, arc: 4 });
}

async function press() {
  const { slide, paper, pencil, onion } = B;
  const C = STAINS[S.stain || 'orcein'];
  const touch = world(slide, V3(0, slide.thickness + 0.11, 0)).y;
  const p = pencil.group.position;
  await anim(0.35, (e) => { p.y = lerp(touch + 2, touch, e); }, Ease.in);
  const s0 = S.squash, s1 = (S.presses + 1) / PRESSES * 0.6;
  await anim(0.5, (e) => {
    const s = lerp(s0, s1, e);
    p.y = touch - 0.04 * Math.sin(Math.PI * e);
    slide.setSmear(s / 0.6, hex(C.tissue));
    paper.setSpot(0.15 + s, hex(C.liquid));
    onion.tip.scale.set(1 - 0.85 * s, 1 + 0.9 * s, 1 + 0.9 * s);
    onion.tip.visible = s < 0.45;
  });
  S.squash = s1;
  S.presses++;
  await anim(0.3, (e) => { p.y = lerp(touch, touch + 2, e); }, Ease.out);
  if (S.presses < PRESSES) return;
  await moveTo(pencil.group, { pos: POS.pencil, quat: pencilRest(), dur: 1, arc: 4 });
  root.attach(paper.group);
  await moveTo(paper.group, { pos: POS.paper.clone().add(V3(0, 0, 1)), quat: Q(0, 0.4, 0), dur: 0.8, arc: 2 });
}

async function observe() {
  const { slide, micro } = B;
  const to = world(micro, micro.anchors.stage);
  await moveTo(slide.group, { pos: to, quat: micro.group.quaternion.clone(), dur: 1.6, arc: 10 });
  micro.group.attach(slide.group);
  await anim(0.7, (e) => micro.setLamp(e));
  await anim(0.8, (e) => { micro.nose.rotation.y = Math.PI * 2 * e; });
  S.openAfter = !isInstant() && lesson.mode === 'do';
}

const clock = () => (S ? S.clock : null);
const STEPS = [
  { id: 'cut', ...T.steps.cut, targets: ['onion'], view: 'onion', caption: () => (S && S.cap) || T.steps.cut.title, run: cut },
  { id: 'acid', ...T.steps.acid, targets: ['bath'], view: 'acid', clock, run: acid },
  { id: 'stain', ...T.steps.stain, targets: STAIN_KEYS, view: 'stain', clock, run: stain },
  { id: 'cover', ...T.steps.cover, targets: ['coverslip'], view: 'slide', run: cover },
  { id: 'squash', ...T.steps.squash, targets: ['pencil'], view: 'slide',
    detail: () => fmt(T.steps.squash.detail, { n: Math.min((S ? S.presses : 0) + 1, PRESSES), total: PRESSES }),
    isDone: () => S.presses >= PRESSES, progress: () => S.presses / PRESSES, run: press },
  { id: 'observe', ...T.steps.observe, targets: ['scope'], view: 'scope', run: observe },
  /* Counting happens in the microscope view, outside the bench: the step reads the view's tally,
     so a rebuild leaves it alone. Watch mode stops at the bench; counting is the student's. */
  { id: 'count', ...T.steps.count, targets: ['scope'], view: 'scope',
    detail: () => fmt(T.steps.count.detail, { n: ENOUGH, done: scope.tally().total }),
    isDone: () => lesson.mode === 'watch' || scope.tally().total >= ENOUGH,
    progress: () => Math.min(1, scope.tally().total / ENOUGH),
    run: async () => { if (!isInstant()) lookIn(); } },
];
const COUNT = STEPS.length - 1;
const PHASES = [
  { ...T.phases.cut, steps: ['cut'] },
  { ...T.phases.acid, steps: ['acid'] },
  { ...T.phases.stain, steps: ['stain'] },
  { ...T.phases.squash, steps: ['cover', 'squash'] },
  { ...T.phases.observe, steps: ['observe', 'count'] },
];

// =========================================================================
// Looking down the microscope
// =========================================================================
const fade = document.createElement('div');
fade.className = 'scope-fade';
$('#app').appendChild(fade);
let looking = false;
async function lookIn() {
  if (looking || scope.isOpen || !B) return;
  looking = true;
  const { micro } = B;
  const eye = world(micro, micro.anchors.eye);
  const axis = micro.anchors.eyeAxis.clone().applyQuaternion(micro.group.quaternion);
  await stage.glide({ t: eye, p: eye.clone().addScaledVector(axis, 20) }, 1.2);
  fade.classList.add('on');
  await stage.glide({ t: eye.clone().addScaledVector(axis, -6), p: eye.clone().addScaledVector(axis, 2) }, 0.5);
  stage.setRender(() => {});   // the bench is hidden: stop drawing it
  scope.open({ stain: S.stain || 'orcein', squash: S.squash || 0.6 });
  requestAnimationFrame(() => fade.classList.remove('on'));
  looking = false;
}
/** The topbar's Microscope button: finish the bench if needed, then look in. */
async function jumpToScope() {
  if (lesson.step < COUNT) await lesson.jumpTo(COUNT);
  lookIn();
}

const completeHint = () => {
  const t = scope.tally();
  const head = t.total ? fmt(T.complete.hint, { mi: t.mi.toFixed(1), n: t.total, dividing: t.dividing }) : T.complete.skipped;
  return `${head}<span class="scope-open-row"><button class="btn" data-act="scope"><i class="ph-bold ph-microscope"></i>${T.complete.open}</button></span>`;
};

// =========================================================================
// Wire it together
// =========================================================================
let firstEnter = true;
lesson = createLesson({
  steps: STEPS,
  phases: PHASES,
  rebuild,
  panel: $('#stepsPanel'),
  completeHint,
  completeWhy: T.complete.why,
  completeCaption: T.complete.caption,
  onEnter: (step) => {
    requestAnimationFrame(() => stage.resize());
    if (S && S.openAfter) { S.openAfter = false; lookIn(); return; }
    if (!step) { stage.focus(VIEWS.scope, 1.4); return; }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; }
    stage.focus(step.view);
  },
});
ix = createInteraction(stage, {
  targets: () => (scope.isOpen ? [] : lesson.targets()),
  busy: lesson.isBusy,
  onClick: (k) => {
    if (scope.isOpen) return undefined;
    if (k === 'scope' && lesson.step > COUNT) return lookIn();
    return lesson.click(k);
  },
  status: lesson.status,
  markerStyle: 'circle',
  enabled: () => !scope.isOpen,
});
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting,
  watching: () => lesson.mode === 'watch',
  rig: { t: V3(-6, 4, -1), p: V3(-6, 40, 60) },
  special: ['slide'],
});

function restart() {
  if (scope.isOpen) scope.close();
  newSession();
  firstEnter = false;
  lesson.restart();
}

stage.onFrame((dt, now) => {
  lesson.update(dt);
  follow.update(dt);
  if (B) B.bath.update(now / 1000);
  ix.update();
});

document.addEventListener('click', (e) => { if (e.target.closest('[data-act="scope"]')) jumpToScope(); });
const jump = document.createElement('button');
jump.className = 'btn scope-jump';
jump.innerHTML = `<i class="ph-bold ph-microscope"></i><span>${T.jump}</span>`;
jump.addEventListener('click', jumpToScope);
$('.top-actions').prepend(jump);

const intro = createIntro(stage);
bindChrome({ stage, restart, expose: { get S() { return S; }, get B() { return B; }, lesson, ix, stage, follow, scope, STEPS, lookIn } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
