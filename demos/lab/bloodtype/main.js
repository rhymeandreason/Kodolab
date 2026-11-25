/* Blood Typing: whose baby? Type four people's blood with anti-A, anti-B and anti-Rh, read the
 * clumping, then use inheritance to rule a man out.
 *
 * Steps 1-3 are bench actions (rebuild() + replay). Steps 4-5 happen in the notebook panel,
 * whose state is the student's reading, so a rebuild leaves it alone. The magnifier follows
 * the well being worked on, the well under the pointer, or the table cell under the pointer.
 * The case (whose blood is which type) lives outside S: it changes only on New case, which
 * restarts the lab. */
import * as THREE from 'three';
import {
  V3, Q, lerp, Ease, worldOf, anim, moveTo, isInstant, newSession, dropIn, drop,
  disposeTree, toast, createStage, createMaterials, createInteraction, createLesson, createFollowCam,
  createIntro, chromeInsets, bindChrome, PHONE, T, fmt,
} from '../lab.js';
import { buildBench, PATIENTS, SERA, BLOOD, POS } from './bench.js';
import { WELLS, makeCase, DEFAULT_CASE, hasAntigen, typeLabel } from './model.js';
import { createMagnifier } from './magnifier.js';
import { createNotebook } from './notebook.js';

const $ = (s) => document.querySelector(s);
const hex = (c) => new THREE.Color(c).getHex();

const VIEWS = {
  overview: { t: V3(0, 0, -6), p: V3(0, 62, 56) },
  samples: { t: V3(0, 0, -2), p: V3(0, 50, 46) },
  trays: { t: V3(0, 0, 4), p: V3(0, 66, 46) },
};
const CLUMP_S = { A: 3.4, B: 3.4, Rh: 5 };   // anti-D agglutination is slower and finer than anti-A/B
const STIR_S = 1.6;
const TILT = Math.PI - 0.42;                  // a dropper bottle held nozzle-down, leaning

let CASE = DEFAULT_CASE;

// =========================================================================
// Stage, magnifier, notebook
// =========================================================================
const right = () => {
  const els = [notebook && notebook.el].filter((e) => e && !e.hidden);
  return els.length ? Math.min(...els.map((e) => e.getBoundingClientRect().left)) : null;
};
const stage = createStage({
  canvas: $('#scene'), views: VIEWS,
  controls: { minDistance: 10, maxDistance: 160 },
  insets: (w, h) => {
    const r = chromeInsets(w, h), L = right();
    if (L != null && w > PHONE) r.right = Math.max(r.right, w - L + 10);
    return r;
  },
});
const mat = createMaterials(stage);
const mag = createMagnifier(stage, { el: $('.mag') });
stage.setRender(() => { stage.sketch.render(); mag.render(); });

let root = null, B = null, S = null, lesson, ix;

const wellPos = (i, j) => worldOf(B.trays[i].group, B.trays[i].wells[j].anchor);
const wellName = (i, j) => fmt(T.magnifier.label, { name: T.props.people[PATIENTS[i].id], serum: T.props.sera[WELLS[j]] });
const focusWell = (i, j) => { if (B) mag.focus(wellPos(i, j), wellName(i, j)); };

const notebook = createNotebook({
  getCase: () => CASE,
  ready: (pid, k) => !!S && S.wells[PATIENTS.findIndex((p) => p.id === pid)][WELLS.indexOf(k)].stirred,
  onFocus: (pid, k) => focusWell(PATIENTS.findIndex((p) => p.id === pid), k ? WELLS.indexOf(k) : 1),
  onChange: () => {
    lesson.render();
    requestAnimationFrame(() => stage.resize());
    if (lesson.step === RECORD && notebook.marked()) lesson.jumpTo(TYPE);
    else if (lesson.step === TYPE && notebook.checked()) lesson.jumpTo(SOLVE);
    else if (lesson.step === SOLVE && notebook.solved()) lesson.jumpTo(SOLVE + 1);
  },
});

// =========================================================================
// The bench
// =========================================================================
function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group(); stage.scene.add(root);
  B = buildBench(mat, root).props;
  B.dropMat = {
    blood: mat.make.physical({ color: hex(BLOOD), roughness: 0.12, clearcoat: 1 }),
    ...Object.fromEntries(SERA.map((s) => [s.id, mat.make.physical({ color: hex(s.liquid), roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.85 })])),
  };
  S = {
    wells: PATIENTS.map(() => WELLS.map(() => ({ blood: false, serum: false, stirred: false }))),
    blooded: PATIENTS.map(() => false),
    sera: SERA.map(() => false),
    stirred: PATIENTS.map(() => false),
    sticks: 0,
  };
  const O = T.objects;
  PATIENTS.forEach((p, i) => ix.register(`blood${i}`, B.bloods[i].group, { name: fmt(O.blood.name, { name: T.props.people[p.id] }), short: T.props.people[p.id], desc: O.blood.desc, anchor: V3(0, 10, 0) }));
  SERA.forEach((s, j) => ix.register(`serum${s.id}`, B.sera[j].group, { name: T.props.sera[s.id], short: T.props.sera[s.id], desc: O.serum[s.id], anchor: V3(0, 10, 0) }));
  PATIENTS.forEach((p, i) => ix.register(`tray${i}`, B.trays[i].group, { name: fmt(O.tray.name, { name: T.props.people[p.id] }), short: T.props.people[p.id], desc: O.tray.desc, anchor: V3(0, 1.5, -0.5) }));
  ix.register('cup', B.cup.group, { ...O.cup, anchor: V3(0, 10, 0) });
  ix.register('bin', B.bin.group, { ...O.bin, anchor: V3(0, 7, 0) });
}

// =========================================================================
// Actions
// =========================================================================
/** Place a bottle so its nozzle point sits at `tip`, tilted `theta` about z. */
function poseByTip(b, tip, theta) {
  b.group.quaternion.copy(Q(0, 0, theta));
  b.group.position.copy(tip).sub(b.anchors.tip.clone().applyQuaternion(b.group.quaternion));
}
/** One drop from a bottle into each listed well, [i, j], then back home. */
async function dropInto(b, wells, kind) {
  const g = b.group, home = g.position.clone();
  let tip = worldOf(g, b.anchors.tip), theta = 0;
  const go = (to, th, dur, arc = 2) => {
    const a = tip.clone(), t0 = theta;
    return anim(dur, (e) => {
      const p = a.clone().lerp(to, e); p.y += Math.sin(Math.PI * e) * arc;
      poseByTip(b, p, lerp(t0, th, e));
    }).then(() => { tip = to.clone(); theta = th; });
  };
  for (const [i, j] of wells) {
    const w = wellPos(i, j), over = w.clone().add(V3(0, 2.4, 0));
    focusWell(i, j);
    await go(over, TILT, tip.distanceTo(over) > 12 ? 0.8 : 0.45, tip.distanceTo(over) > 12 ? 3 : 1);
    await anim(0.15, (e) => g.scale.set(1 - 0.08 * e, 1, 1 - 0.08 * e));
    const fall = drop(root, kind === 'blood' ? B.dropMat.blood : B.dropMat[WELLS[j]], over.clone().add(V3(0, -0.2, 0)), w.y + 0.05);
    anim(0.2, (e) => g.scale.set(0.92 + 0.08 * e, 1, 0.92 + 0.08 * e));
    await fall;
    const s = S.wells[i][j], tw = B.trays[i].wells[j];
    if (kind === 'blood') s.blood = true; else s.serum = true;
    const a0 = kind === 'blood' ? 0 : 0.6, a1 = kind === 'blood' ? 0.6 : 0.8;
    await anim(0.3, (e) => tw.set({ blood: s.blood, serum: s.serum, amount: lerp(a0, a1, e) }), Ease.out);
  }
  const homeTip = home.clone().add(b.anchors.tip);
  await go(homeTip, 0, 0.8, 3);
  g.position.copy(home); g.quaternion.identity();
}

async function actBlood(key) {
  const i = Number(key.slice(5));
  if (S.blooded[i]) return;
  S.blooded[i] = true;
  await dropInto(B.bloods[i], WELLS.map((_, j) => [i, j]), 'blood');
}
async function actSerum(key) {
  const j = SERA.findIndex((s) => `serum${s.id}` === key);
  if (S.sera[j]) return;
  S.sera[j] = true;
  await dropInto(B.sera[j], PATIENTS.map((_, i) => [i, j]), 'serum');
}

/** A clean stick from the cup stirs one well, then goes in the biohazard bin. */
async function stir(i, j) {
  const stick = B.cup.sticks[S.sticks++], g = stick.group;
  root.attach(g);
  g.scale.set(1, 1, 1);
  const w = wellPos(i, j), s = S.wells[i][j], tw = B.trays[i].wells[j];
  const positive = hasAntigen(CASE.types[PATIENTS[i].id], WELLS[j]);
  focusWell(i, j);
  await moveTo(g, { pos: g.position.clone().add(V3(0, 9, 0)), dur: 0.35 });
  const rad = 1.8 * 0.42, start = w.clone().add(V3(rad, 0.1, 0));
  await moveTo(g, { pos: start.clone().add(V3(0, 2.5, 0)), quat: Q(0, 0, -0.18), dur: 0.8, arc: 4 });
  await moveTo(g, { pos: start, dur: 0.2 });
  let clumping = false;
  await anim(STIR_S, (e, k) => {
    const a = k * 3.2 * Math.PI * 2, r = rad * (1 - 0.18 * Math.sin(k * Math.PI));
    g.position.set(w.x + Math.cos(a) * r, w.y + 0.1, w.z + Math.sin(a) * r);
    g.rotation.set(Math.sin(a) * 0.12, 0, -0.18 - Math.cos(a) * 0.12);
    tw.set({ mixed: Math.min(1, k * 1.5), swirl: a * 0.22, amount: lerp(0.8, 0.97, Math.min(1, k * 2)) });
    if (k > 0.25) stick.setTip(BLOOD);
    if (positive && !clumping && k > 0.35) { clumping = true; anim(CLUMP_S[WELLS[j]], (c) => tw.set({ clump: c, amount: 0.97 }), Ease.out); }
  }, Ease.inOut);
  s.stirred = true;
  notebook.render();
  await moveTo(g, { pos: w.clone().add(V3(0, 4, 0)), dur: 0.25 });
  await moveTo(g, { pos: POS.bin.clone().add(V3(0, 11, 0)), dur: 0.8, arc: 5 });
  await dropInBin(g);
}

/** Tip-down on the bin floor, leaning on the wall. A stick (9.1 cm) is longer than the bin is wide,
 *  so it cannot lie flat inside: it stands tip-low, top over the rim. */
function dropInBin(g) {
  root.attach(g);
  const a = g.position.clone(), ry = Math.random() * Math.PI * 2, lean = 0.3 + Math.random() * 0.12;
  const out = V3(-Math.cos(ry), 0, Math.sin(ry)), r = 1.4;
  const end = POS.bin.clone().setY(0.8).addScaledVector(out, -r);
  const q0 = g.quaternion.clone(), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, lean));
  return anim(0.45, (e) => {
    g.position.set(lerp(a.x, end.x, e), lerp(a.y, end.y, e), lerp(a.z, end.z, e));
    g.quaternion.slerpQuaternions(q0, q1, e);
  }, Ease.in);
}

async function actStir(key) {
  const i = Number(key.slice(4));
  if (S.stirred[i]) return;
  S.stirred[i] = true;
  for (let j = 0; j < WELLS.length; j++) await stir(i, j);
}

// =========================================================================
// Steps
// =========================================================================
const card = (id) => { const s = T.steps[id]; return { title: s.title, short: s.short, action: s.action, hint: s.hint, detail: s.detail, why: s.why, caption: s.caption }; };
/** Watch's caption for a step done item by item: captions[n - 1] while the nth item runs, the last held. */
const beat = (id, flags) => () => { const c = T.steps[id].captions; return c[Math.min(c.length - 1, Math.max(0, count(S ? flags() : []) - 1))]; };
const keys = (pre, list) => list.map((x) => `${pre}${x}`);
const BLOOD_KEYS = keys('blood', PATIENTS.map((_, i) => i));
const SERUM_KEYS = keys('serum', SERA.map((s) => s.id));
const TRAY_KEYS = keys('tray', PATIENTS.map((_, i) => i));
const left = (flags, ks) => ks.filter((_, i) => S && !flags[i]);
const count = (flags) => flags.filter(Boolean).length;

/** The case's question on the step card: the answer buttons, and a red line if the pick is wrong. */
function solveCard() {
  const N = T.notebook, baby = typeLabel(CASE.types.baby), g = notebook.guess;
  const btn = (m) => {
    const p = PATIENTS.find((x) => x.id === m);
    return `<button data-ans="${m}" class="${g === m ? (m === CASE.father ? 'right' : 'wrong') : ''}"><span class="nb-dot" style="background:${p.color}"></span>${T.props.people[m]}</button>`;
  };
  const wrong = g && g !== CASE.father;
  return `${T.steps.solve.detail}<span class="ans-q">${fmt(N.question, { baby })}</span>`
    + `<span class="ans-btns">${btn('man1')}${btn('man2')}</span>`
    + (wrong ? `<span class="ans-no"><i class="ph-fill ph-x-circle"></i><span>${fmt(N.notQuite, { man: T.props.people[g] })}</span></span>` : '');
}

const STEPS = [
  { id: 'blood', ...card('blood'), caption: beat('blood', () => S.blooded), targets: BLOOD_KEYS, view: 'samples',
    activeTargets: () => left(S.blooded, BLOOD_KEYS),
    isDone: () => S.blooded.every(Boolean), progress: () => count(S.blooded) / PATIENTS.length, run: actBlood },
  { id: 'sera', ...card('sera'), caption: beat('sera', () => S.sera), targets: SERUM_KEYS, view: 'overview',
    activeTargets: () => left(S.sera, SERUM_KEYS),
    isDone: () => S.sera.every(Boolean), progress: () => count(S.sera) / SERA.length, run: actSerum },
  { id: 'stir', ...card('stir'), caption: beat('stir', () => S.stirred), targets: TRAY_KEYS, view: 'overview',
    activeTargets: () => left(S.stirred, TRAY_KEYS),
    isDone: () => S.stirred.every(Boolean), progress: () => count(S.stirred) / PATIENTS.length, run: actStir },
  /* Reading and the genetics happen in the notebook, off the bench. Watch stops at the bench. */
  { id: 'record', ...card('record'), targets: [], view: 'trays',
    isDone: () => lesson.mode === 'watch' || notebook.marked(),
    progress: () => notebook.progress(),
    run: async () => { if (!isInstant()) notebook.open('data'); } },
  { id: 'type', ...card('type'), targets: [], view: 'trays',
    isDone: () => lesson.mode === 'watch' || notebook.checked(),
    progress: () => notebook.progress(),
    run: async () => { if (!isInstant()) notebook.open('data'); } },
  { id: 'solve', ...card('solve'), targets: [], view: 'trays', detail: solveCard,
    isDone: () => lesson.mode === 'watch' || notebook.solved(),
    run: async () => { if (!isInstant()) notebook.open('genetics'); } },
];
const at = (id) => STEPS.findIndex((s) => s.id === id);
const RECORD = at('record'), TYPE = at('type'), SOLVE = at('solve');
const PHASES = [
  { ...T.phases.prep, steps: ['blood', 'sera', 'stir'] },
  { ...T.phases.read, steps: ['record', 'type'] },
  { ...T.phases.solve, steps: ['solve'] },
];

const fatherName = () => T.props.people[CASE.father];
const completeHint = () => `<span class="res-ok"><i class="ph-fill ph-check-circle"></i>${T.complete.correct}</span><div class="res-explain">${notebook.explain()}</div>`;

// =========================================================================
// Wire it together
// =========================================================================
let firstEnter = true;
lesson = createLesson({
  steps: STEPS, phases: PHASES, rebuild,
  panel: $('#stepsPanel'),
  completeHint, completeWhy: () => fmt(T.complete.why, { father: fatherName() }),
  onEnter: (step, i) => {
    requestAnimationFrame(() => stage.resize());
    const k = step ? i : STEPS.length;
    mag.show(k >= STEPS.findIndex((s) => s.id === 'stir'));
    if (k < RECORD) notebook.close();
    else if (lesson.mode !== 'watch' && !isInstant()) notebook.open(k >= SOLVE && notebook.checked() ? 'genetics' : 'data');
    if (!step) { stage.focus(VIEWS.trays, 1.4); toast(T.complete.toast, { icon: 'ph-sparkle' }); return; }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; }
    stage.focus(step.view);
  },
});
ix = createInteraction(stage, { targets: lesson.targets, busy: lesson.isBusy, onClick: lesson.click, status: lesson.status, markerStyle: 'circle' });
const follow = createFollowCam(stage, ix, { acting: lesson.acting, watching: () => lesson.mode === 'watch', rig: VIEWS.overview, special: ['trays'] });

/* The pointer over a tray points the magnifier at the nearest well. */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let pointer = null;
$('#scene').addEventListener('pointermove', (e) => { pointer = e; });
function hoverWell() {
  if (!pointer || !B || !mag.shown || lesson.isBusy()) return;
  const r = stage.canvas.getBoundingClientRect();
  ndc.set(((pointer.clientX - r.left) / r.width) * 2 - 1, -((pointer.clientY - r.top) / r.height) * 2 + 1);
  pointer = null;
  ray.setFromCamera(ndc, stage.camera);
  const hit = ray.intersectObjects(B.trays.map((t) => t.group), true)[0];
  if (!hit) return;
  const i = B.trays.findIndex((t) => { let o = hit.object; while (o && o !== t.group) o = o.parent; return !!o; });
  if (i < 0) return;
  const local = B.trays[i].group.worldToLocal(hit.point.clone());
  let j = 0;
  B.trays[i].wells.forEach((w, k) => { if (Math.abs(w.anchor.x - local.x) < Math.abs(B.trays[i].wells[j].anchor.x - local.x)) j = k; });
  focusWell(i, j);
}

/* The case card, hung under the procedure panel: which case this is, and a new one. */
const caseCard = document.createElement('div');
caseCard.className = 'panel case-card';
($('#app') || document.body).appendChild(caseCard);
function renderCase() {
  caseCard.innerHTML = `<span class="case-no">${fmt(T.case.label, { no: CASE.no })}</span>`
    + `<button class="reopen" data-act="newcase"><i class="ph ph-shuffle"></i>${T.case.new}</button>`;
}
function placeCase() {
  const r = $('#stepsPanel').getBoundingClientRect();
  caseCard.hidden = !r.height;
  caseCard.style.top = `${r.bottom + 10}px`;
}
new ResizeObserver(placeCase).observe($('#stepsPanel'));
window.addEventListener('resize', placeCase);
/* Testing: Alt+Shift+F skips the bench steps, then each press fills the next notebook stage. */
window.addEventListener('keydown', async (e) => {
  if (!(e.altKey && e.shiftKey && e.code === 'KeyF')) return;
  e.preventDefault();
  if (lesson.step < RECORD) await lesson.jumpTo(RECORD);
  else notebook.cheat();
});
renderCase();

function restart() {
  newSession();
  firstEnter = false;
  notebook.reset();
  lesson.restart();
}
function newCase() {
  let no;
  do { no = 100 + Math.floor(Math.random() * 900); } while (no === CASE.no);
  CASE = makeCase(no);
  renderCase();
  restart();
  toast(fmt(T.complete.newToast, { no }), { icon: 'ph-shuffle' });
}

let time = 0;
stage.onFrame((dt) => {
  time += dt;
  lesson.update(dt);
  follow.update(dt);
  hoverWell();
  mag.update(dt);
  if (B) B.trays.forEach((t) => t.wells.forEach((w) => { w.uniforms.uTime.value = time; }));
  ix.update();
});
document.addEventListener('click', (e) => {
  const ans = e.target.closest('.lab-card [data-ans]');
  if (ans && lesson.step === SOLVE) { notebook.answer(ans.dataset.ans); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'newcase') newCase();
});

const intro = createIntro(stage, { art: $('.intro-art')?.introArt });
bindChrome({ stage, restart, expose: { get S() { return S; }, get B() { return B; }, get CASE() { return CASE; }, lesson, ix, stage, follow, mag, notebook, newCase, typeLabel, closeIntro: intro.close } });
stage.focus(VIEWS.overview, 0);
lesson.start().then(() => focusWell(0, 0));
stage.start();
