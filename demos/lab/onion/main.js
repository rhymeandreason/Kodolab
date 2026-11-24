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
  makeBench, makeBeaker, makeHotPlate, makeWatchGlass, makeDropperBottle, makeSteam, drop,
  makeOnion, makeScalpel, makePencil, makeSlide, makeCoverslip, makeFilterPaper, makeMicroscope,
  T, fmt,
} from '../lab.js';
import { STAINS, STAIN_KEYS } from './stains.js';
import { createScope, ENOUGH } from './scope.js';

const $ = (s) => document.querySelector(s);

// =========================================================================
// Layout (cm, bench top at y = 0)
// =========================================================================
const POS = {
  beaker: V3(-40, 0, -2), scalpel: V3(-28, 0, 16),
  acid: V3(-25, 0, -9), hot: V3(-11, 0, -5),
  orcein: V3(2, 0, -10), toluidine: V3(7.5, 0, -10),
  slide: V3(3, 0, 7), coverslip: V3(9.5, 0, 9.5), paper: V3(13, 0, 5.5), pencil: V3(27, 0.34, 17),
  scope: V3(32, 0, -6),
};
const SLIDE_ROT = -0.08, SCOPE_ROT = -0.45, PENCIL_YAW = 1.45;
const ONION_Y = 6.65;      // the bulb rests on the beaker's rim
const LIFT = 7;            // high enough to clear the rim with the roots
const PRESSES = 3;         // presses to spread the cells into one layer
const ACID = { color: 0xdcecff, cleared: '#f7f1df', level: 0.45 };
const RINSE = 0xe6f4ff;
const hex = (c) => new THREE.Color(c).getHex();
const pencilRest = () => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, PENCIL_YAW, 0, 'YXZ'));

const VIEWS = {
  overview: { t: V3(-4, 6, -1), p: V3(-4, 52, 78) },
  onion: { t: V3(-33, 7, -3), p: V3(-29, 25, 36) },
  acid: { t: V3(-17, 4, -6), p: V3(-17, 24, 28) },
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
  const scalpel = place(makeScalpel(mat), POS.scalpel, 1.3);

  const acid = place(makeDropperBottle(mat, { ...P.acid, color: '#e8a23a', liquidColor: ACID.color, liquidOpacity: 0.35, bulb: '#e9e4da' }), POS.acid, 0.2);
  const hot = place(makeHotPlate(mat), POS.hot);
  const glass = makeWatchGlass(mat, { liquidColor: ACID.color });
  glass.group.position.copy(hot.anchors.plate);
  hot.group.add(glass.group);   // rides the plate's hover lift, and so does the tip lying in it
  const steam = makeSteam(mat, root);

  const stains = {};
  STAIN_KEYS.forEach((k) => {
    stains[k] = place(makeDropperBottle(mat, { ...P[k], color: STAINS[k].liquid, liquidColor: hex(STAINS[k].liquid), liquidOpacity: 0.85, tint: STAINS[k].glass }), POS[k], k === 'orcein' ? 0.15 : -0.15);
  });

  const slide = place(makeSlide(mat, { label: P.slide }), POS.slide, SLIDE_ROT);
  const coverslip = place(makeCoverslip(mat), POS.coverslip, 0.25);
  const paper = place(makeFilterPaper(mat), POS.paper, 0.4);
  const pencil = place(makePencil(mat), POS.pencil);
  pencil.group.quaternion.copy(pencilRest());
  const micro = place(makeMicroscope(mat), POS.scope, SCOPE_ROT);

  B = { beaker, onion, scalpel, acid, hot, glass, steam, stains, slide, coverslip, paper, pencil, micro };
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
  ix.register('acid', acid.group, { ...O.acid, anchor: V3(0, 9.6, 0) });
  ix.register('hot', hot.group, { ...O.hot, anchor: V3(0, 7, 0) });
  STAIN_KEYS.forEach((k) => ix.register(k, stains[k].group, { ...O[k], anchor: V3(0, 9.6, 0) }));
  ix.register('coverslip', coverslip.group, { ...O.coverslip, anchor: V3(0, 1, 0) });
  ix.register('pencil', pencil.group, { ...O.pencil, anchor: V3(0, 8.5, 0) });
  ix.register('scope', micro.group, { ...O.scope, anchor: V3(0, 38.5, 0) });
  ix.register('scalpel', scalpel.group, { ...O.scalpel });
  ix.register('glass', glass.group, { ...O.glass });
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

/** Where the tip lies in the watch glass, and how. */
const glassSpot = () => world(B.glass, B.glass.anchors.floor).add(V3(0.3, 0.12, 0.2));
const lyingInGlass = () => Q(0, 0.6, Math.PI / 2);

/** Lift a bottle's dropper out, squeeze `n` drops onto world point `at` (its surface at world y
 *  `surfY()`), calling onDrop(i) as each lands, and stand the dropper back in its bottle. */
async function drops(bottle, n, at, surfY, color, onDrop = () => {}) {
  const d = bottle.dropper, tip = bottle.anchors.tip;
  root.attach(d);
  const home = d.position.clone(), up = home.clone().add(V3(0, 6, 0));
  const over = at.clone().add(V3(0, 2.2 - tip.y, 0));
  const dropMat = mat.make.liquid(hex(color), 0.85);
  await moveTo(d, { pos: up, dur: 0.5 });
  bottle.setFill(0.8);
  await moveTo(d, { pos: over, dur: 0.9, arc: 3 });
  for (let i = 0; i < n; i++) {
    await anim(0.14, (e, t) => bottle.setSqueeze(Math.sin(Math.PI * t)), Ease.linear);
    bottle.setFill(0.8 * (1 - (i + 1) / n));
    drop(root, dropMat, d.localToWorld(tip.clone()), surfY()).then(() => onDrop(i));
    await anim(0.2, () => {}, Ease.linear);
  }
  await anim(0.4, () => {}, Ease.linear);
  await moveTo(d, { pos: up, dur: 0.9, arc: 3 });
  await moveTo(d, { pos: home, dur: 0.5 });
  bottle.group.attach(d);
}

// =========================================================================
// Steps
// =========================================================================
async function cut() {
  const { onion, scalpel } = B;
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
  const spot = glassSpot();
  await moveTo(onion.tip, { pos: spot.clone().add(V3(0, 3, 0)), quat: lyingInGlass(), dur: 1.4, arc: 6 });
  await moveTo(onion.tip, { pos: spot, dur: 0.5, ease: Ease.in });
  B.glass.group.attach(onion.tip);
  S.cap = null;
}

async function acid() {
  const { glass } = B, L = glass.liquid;
  L.setColor(ACID.color);
  await drops(B.acid, 6, world(glass, glass.anchors.floor), () => L.surfaceY(), ACID.color,
    (i) => anim(0.3, (e) => L.setLevel(ACID.level * (i + e) / 6)));
  L.setLevel(ACID.level);
}

async function heat() {
  const { hot, glass, onion } = B, L = glass.liquid;
  await anim(0.6, (e) => hot.setHeat(e));
  await countdown(300, 3.6, (k) => onion.setTip(ACID.cleared, k, 0.82));
  onion.holdTip();
  await anim(0.6, (e) => hot.setHeat(1 - e));
  // pour off the acid, rinse in water, pour that off too
  S.cap = T.steps.heat.captions.rinse;
  await anim(0.6, (e) => L.setLevel(ACID.level * (1 - e)));
  L.setColor(RINSE);
  await anim(0.45, (e) => L.setLevel(0.35 * e));
  await anim(0.3, () => {}, Ease.linear);
  await anim(0.5, (e) => L.setLevel(0.35 * (1 - e)));
  S.cap = null;
}

async function stain(key) {
  S.stain = key;
  const C = STAINS[key], bottle = B.stains[key], { onion, slide } = B;
  // the tip onto the slide
  root.attach(onion.tip);
  await moveTo(onion.tip, { pos: onion.tip.position.clone().add(V3(0, 2.5, 0)), dur: 0.6 });
  await moveTo(onion.tip, { pos: slideSpot(), quat: lyingOnSlide(), dur: 1.3, arc: 4 });
  slide.group.attach(onion.tip);
  // a few drops of stain on it
  const top = () => world(slide, V3(0, slide.thickness, 0)).y;
  await drops(bottle, 3, slideSpot(), top, C.liquid, (i) => anim(0.35, (e) => slide.setDrop((i + e) / 3, hex(C.liquid)), Ease.out));
  slide.setDrop(1, hex(C.liquid));
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
  { id: 'acid', ...T.steps.acid, targets: ['acid'], view: 'acid', run: acid },
  { id: 'heat', ...T.steps.heat, targets: ['hot'], view: 'acid', clock, caption: () => (S && S.cap) || T.steps.heat.caption, run: heat },
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
  { ...T.phases.acid, steps: ['acid', 'heat'] },
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
  if (B) {
    const { hot, glass, steam } = B, L = glass.liquid;
    const c = world(glass, glass.anchors.floor);
    steam.set(hot.heat * Math.min(1, L.level / 0.2), now / 1000, c.x, L.surfaceY(), c.z);
  }
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
