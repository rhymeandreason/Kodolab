/* Whose DNA? Gel electrophoresis of a crime-scene digest against three suspects.
 *
 * The bench is rebuilt whenever the student jumps on the timeline (rebuild()); each click is
 * one async action. The gel paints itself from S.loaded, S.run and S.stain through model.js,
 * which the gel level and the gel image read too, so all three show the same run. */
import * as THREE from 'three';
import {
  V3, Q, lerp, clamp, Ease, worldOf,
  newSession, anim, wait, moveTo, isInstant,
  takeTip, pipetteDraw, pipetteDispense, ejectTip,
  disposeTree, toast, mesh, makeCanvas, canvasTex, FONT,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, createZoom, createIntro, chromeInsets, bindChrome, PHONE,
  makeBench, makeMicroTube, makeTubeRack, makeReagentBottle, makeWasteBin, makeStream,
  makeGelBox, makeAgaroseGel, makeGelComb, makePowerSupply, makeLead, makeTransilluminator,
  makeMicropipette, makeTipBox, makePipetteStand,
  T, fmt,
} from '../lab.js';
import { SAMPLES, MATCH, VOLTS, RUN_MIN, LOAD_UL, laneState } from './model.js';
import { createGelLevel, captionFor } from './molecule.js';
import { createMeasure } from './measure.js';

const $ = (s) => document.querySelector(s);
const hex = (c) => new THREE.Color(c).getHex();

// =========================================================================
// Layout (cm, bench top at y = 0)
// =========================================================================
const POS = {
  tae: V3(-34, 0, -16), lidRest: V3(-34, 0.8, 8), combRest: V3(-18, 0.18, 17),
  box: V3(0, 0, 0),
  rack: V3(24, 0, -8), tips: V3(24, 0, 12), stand: V3(38, 0, -8), waste: V3(38, 0, 12),
  power: V3(4, 0, -26), light: V3(58, 0, 2),
};
const MAT = { w: 150, d: 76, x0: -75, z0: -38 };

/** Zone names printed on the bench, as in blood-lab. */
function printedMat() {
  const S = 16, c = makeCanvas(MAT.w * S, MAT.d * S), x = c.getContext('2d');
  x.font = `700 21px ${FONT}`; x.fillStyle = 'rgba(30,45,75,0.55)'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const Zn = T.props.zones;
  [[Zn.buffer, POS.tae.x, POS.tae.z + 7], [Zn.power, POS.power.x, POS.power.z - 10.5], [Zn.box, POS.box.x, 16],
    [Zn.lid, POS.lidRest.x, POS.lidRest.z + 8], [Zn.samples, POS.rack.x, POS.rack.z + 6], [Zn.pipette, POS.stand.x, POS.stand.z + 6],
    [Zn.tips, POS.tips.x, POS.tips.z + 7], [Zn.waste, POS.waste.x, POS.waste.z + 7], [Zn.light, POS.light.x, POS.light.z + 13]]
    .forEach(([t, wx, wz]) => x.fillText(t.split('').join(' '), (wx - MAT.x0) * S, (wz - MAT.z0) * S));
  return canvasTex(c);
}
const BUFFER_TOP = 0.4;              // cm of buffer over the gel
const MA = 64;                       // a mini gel in 1× TAE draws ~50–80 mA at 100 V
const RUN_REAL = 14;                 // seconds the run takes to play
const COL = { tae: '#d8ebfa', dye: '#3b5bdb' };
const Z = V3(0, 0, 1);

const VIEWS = {
  overview: { t: V3(10, 0, -2), p: V3(10, 76, 80) },
  box: { t: V3(-14, 6, -4), p: V3(-14, 46, 54) },
  load: { t: V3(14, 4, 0), p: V3(14, 44, 46) },
  connect: { t: V3(2, 4, -8), p: V3(2, 44, 44) },
  run: { t: V3(0, 2.5, 0.5), p: V3(0, 32, 26) },
  image: { t: V3(58, 3, 1.5), p: V3(58, 30, 24) },
};

// =========================================================================
// Stage, materials, zoom level, gel image panel
// =========================================================================
const measure = createMeasure({
  onChange: () => {
    lesson.render();
    requestAnimationFrame(() => stage.resize());
    // hold on the correct verdict a beat before the complete card replaces it
    if (lesson.step === MEASURE && measure.solved()) setTimeout(() => { if (lesson.step === MEASURE && measure.solved()) lesson.jumpTo(MEASURE + 1); }, 1600);
  },
});
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  controls: { minDistance: 8, maxDistance: 170 },
  insets: (w, h) => {
    const r = chromeInsets(w, h);
    if (measure.isOpen && w > PHONE) r.right = Math.max(r.right, w - measure.el.getBoundingClientRect().left + 10);
    return r;
  },
});
const { scene } = stage;
const mat = createMaterials(stage);

let root = null, B = null, S = null;
let lesson, ix;

const gelState = { stage: 0, run: 0, stain: 0, field: 0 };
const zoom = createZoom(stage, {
  levels: [{ key: 'gel', world: createGelLevel(stage.env), name: T.levels.gel.name, meta: T.levels.gel.meta, bg: '#eef3f6' }],
  getT: () => {
    if (S) {
      const loaded = S.loaded.some((l) => l > 0.5);
      gelState.run = S.run; gelState.stain = S.stain; gelState.field = S.current;
      gelState.stage = S.stain > 0.5 ? 3 : (S.current > 0.5 || S.run > 0) ? 2 : loaded ? 1 : 0;
    }
    return gelState;
  },
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
const label = (k) => T.samples[k];

function rebuild() {
  if (root) { scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group();
  scene.add(root);

  place(makeBench(mat), V3());
  const box = place(makeGelBox(mat), POS.box);
  const gel = place(makeAgaroseGel(mat, { lanes: SAMPLES.length }), POS.box.clone().add(box.anchors.bed));
  const comb = place(makeGelComb(mat, { xs: gel.laneX, toothW: gel.wellW }), POS.box.clone().add(box.anchors.bed).add(V3(0, gel.thick - 0.45, gel.wellZ)));
  const lid = box.lid;
  root.attach(lid);
  lid.position.copy(POS.lidRest);
  const tae = place(makeReagentBottle(mat, { ...T.props.tae, color: '#0284c7', liquidColor: hex(COL.tae), scale: 2 }), POS.tae, 0.3);
  const rack = place(makeTubeRack(mat, { block: true, holes: SAMPLES.length, spacing: 2.7, holeR: 1.05, color: hex('#cbd5e1') }), POS.rack);
  const tubes = SAMPLES.map((s, i) => {
    const t = place(makeMicroTube(mat, { color: hex(s.cap), label: label(s.key).label, liquidColor: hex(COL.dye) }), POS.rack.clone().add(rack.holes[i]));
    t.liquid.setLevel(0.9);
    return t;
  });
  const tipBox = place(makeTipBox(mat, { lid: false }), POS.tips);
  const stand = place(makePipetteStand(mat), POS.stand);
  const pip = makeMicropipette(mat, { volume: LOAD_UL });
  place(pip, pipRest(stand, pip));
  pip.setTip(false);
  const waste = makeWasteBin(mat, { label: T.props.waste, symbol: null });
  waste.group.scale.setScalar(0.7);
  place(waste, POS.waste);
  const power = place(makePowerSupply(mat), POS.power, -0.15);
  const light = place(makeTransilluminator(mat), POS.light);
  const leads = { black: makeLead(mat, { color: hex('#23272e') }), red: makeLead(mat, { color: hex('#d92b2b') }) };
  root.add(leads.black.group, leads.red.group);
  const stream = makeStream(mat, root, { color: hex(COL.tae) });
  const printed = mesh(new THREE.PlaneGeometry(MAT.w, MAT.d), mat.make.standard({ map: printedMat(), roughness: 0.95, transparent: true, depthWrite: false }), { cast: false });
  printed.rotation.x = -Math.PI / 2;
  printed.position.set(MAT.x0 + MAT.w / 2, 0.02, MAT.z0 + MAT.d / 2);
  printed.userData.noSketch = true;
  root.add(printed);

  B = { box, gel, comb, lid, tae, rack, tubes, tipBox, stand, pip, waste, power, light, leads, stream };
  S = {
    loaded: SAMPLES.map(() => 0),
    next: 1,                 // the next sample lane to load
    tipsUsed: 0,
    plug: { black: 0, red: 0 },   // 0 lying by the supply … 1 in the lid
    current: 0, run: 0, runT: 0, stain: 0, dark: 0,
    cap: null, painted: '',
  };
  poseLeads();

  ix.register('tae', tae.group, { ...T.objects.tae, anchor: V3(0, 21, 0) });
  ix.register('comb', comb.group, { ...T.objects.comb, anchor: V3(0, 2.2, 0) });
  ix.register('lid', lid, { ...T.objects.lid, anchor: V3(0, 1.5, 0) });
  SAMPLES.forEach((s, i) => ix.register(s.key, tubes[i].group, { name: label(s.key).short, short: label(s.key).label, desc: label(s.key).desc, anchor: V3(0, 6.2, 0) }));
  ix.register('power', power.group, { ...T.objects.power, anchor: V3(0, power.size.H + 1, 0) });
  ix.register('light', light.group, { ...T.objects.light, anchor: V3(0, 5, 0) });
  ix.register('gel', gel.group, { ...T.objects.gel, anchor: V3(0, 1.4, 0) });
  ix.register('box', box.group, { ...T.objects.box });
  ix.addGroup('box', gel.group);   // the gel lies in the box until step 4 lifts it out
  ix.register('pipette', pip.group, { ...T.objects.pipette, ringPlane: 'vertical' });
  ix.register('tips', tipBox.group, { ...T.objects.tips });
  ix.register('rack', rack.group, { ...T.objects.rack });
  ix.register('waste', waste.group, { ...T.objects.waste });
  paintGel();
  applyLights();
}

function pipRest(stand, pip) {
  return POS.stand.clone().add(stand.rest(pip));
}

/** Lay both leads from the supply's jacks to wherever their plugs are (S.plug). */
function poseLeads() {
  const ps = B.power.group, over = leadObstacle();
  ['black', 'red'].forEach((k, i) => {
    const a = worldOf(ps, B.power.anchors[k]);
    const aDir = Z.clone().applyQuaternion(ps.quaternion);
    const rest = POS.power.clone().add(V3(-6.4 + i * 3.6, 0.25, B.power.size.D / 2 + 3.5 + i * 0.8));
    const inLid = worldOf(B.lid, B.box.lidAnchors[k]);
    const e = S.plug[k];
    const b = rest.clone().lerp(inLid, Ease.inOut(e));
    b.y += Math.sin(Math.PI * e) * 4;
    const bDir = V3(0, 0, -1).lerp(V3(0, 1, 0), clamp(e * 1.4)).normalize();
    // the red plug is at the far end: its lead runs along the lid, inboard of the black plug
    let via = [];
    if (k === 'red' && e > 0.8) {
      const x = lerp(lerp(a.x, b.x, 0.5), POS.box.x + 1.2, Ease.inOut(clamp((e - 0.8) / 0.2)));
      via = [V3(x, over.max.y + 0.6, over.min.z - 0.4), V3(x, over.max.y + 0.15, POS.box.z)];
    }
    B.leads[k].set(a, aDir, b, bDir, 3, { via, over: [over] });
  });
}

/** The box's footprint, up to the lid when it's on: what the leads drape over. */
function leadObstacle() {
  const { W, L, H } = B.box.size, c = POS.box, lid = B.lid.position;
  const lidOn = Math.hypot(lid.x - c.x, lid.z - c.z) < 1;
  const top = lidOn ? lid.y + B.box.anchors.lidTop.y - B.box.anchors.top.y : c.y + H;
  return new THREE.Box3(V3(c.x - W / 2 - 0.4, c.y, c.z - L / 2 - 0.3), V3(c.x + W / 2 + 0.4, top, c.z + L / 2 + 0.3));
}

/** Repaint the gel when anything it shows has changed. */
function paintGel() {
  const key = `${S.loaded.map((l) => l.toFixed(3)).join()}|${S.run.toFixed(4)}|${S.stain.toFixed(3)}`;
  if (key === S.painted) return;
  S.painted = key;
  B.gel.setLanes(SAMPLES.map((s, i) => laneState(s, S.loaded[i], S.run, S.stain)));
  B.gel.setStain(S.stain);
}

// The room dims for the blue light, so the bands read
const LIGHT0 = { hemi: stage.lights.hemi.intensity, sun: stage.lights.sun.intensity, fill: stage.lights.fill.intensity };
function applyLights() {
  const d = S ? S.dark : 0;
  stage.lights.hemi.intensity = LIGHT0.hemi * (1 - 0.7 * d);
  stage.lights.sun.intensity = LIGHT0.sun * (1 - 0.75 * d);
  stage.lights.fill.intensity = LIGHT0.fill * (1 - 0.5 * d);
}

// =========================================================================
// Actions
// =========================================================================
async function actBuffer() {
  const b = B.tae, g = b.group, home = g.position.clone(), q0 = g.quaternion.clone();
  const target = POS.box.clone().add(B.box.anchors.fill).add(V3(0, 2, 0));
  const full = B.box.anchors.bed.y + B.gel.thick + BUFFER_TOP;
  // Upright with the spout over the fill point, the bottle would stand inside the box. So it
  // waits beside the box, its base above the wall, and tips from there.
  const r = 1.8 * 2 + 0.6, wallX = POS.box.x - B.box.size.W / 2;
  const beside = V3(wallX - r, POS.box.y + B.box.size.H + 0.8, target.z);
  // Tipping moves the spout in a straight line onto the fill point, so the neck stays high.
  const sp0 = beside.clone().add(b.anchors.spout.clone().applyQuaternion(q0));
  const pose = (k) => {   // 0 beside the box, upright … 1 pouring
    g.quaternion.setFromAxisAngle(Z, -1.9 * k).multiply(q0);
    g.position.lerpVectors(sp0, target, k).sub(b.anchors.spout.clone().applyQuaternion(g.quaternion));
  };
  b.cap.visible = false;
  await moveTo(g, { pos: beside, dur: 1.1, arc: 4 });
  await anim(0.8, (e) => pose(e));
  const f0 = b.liquid.fraction;
  await anim(2.4, (e) => {
    B.box.setBuffer(lerp(0, full, e));
    b.liquid.setFraction(f0 - 0.35 * e).setPour(1);
    B.stream.set(worldOf(g, b.anchors.spout), POS.box.y + Math.max(B.box.level, 0.4), e > 0.94 ? (1 - e) / 0.06 : 1);
  }, Ease.linear);
  B.stream.hide();
  await anim(0.8, (e) => { pose(1 - e); b.liquid.setPour(1 - e); });
  await moveTo(g, { pos: home, dur: 1.1, arc: 4 });
  b.cap.visible = true;
}

async function actComb() {
  const g = B.comb.group, p = g.position.clone();
  await moveTo(g, { pos: p.clone().add(V3(0, 3.2, 0)), dur: 1.3, ease: Ease.inOut });
  await moveTo(g, { pos: POS.combRest, quat: Q(-Math.PI / 2, 0, 0), dur: 1.0, arc: 3 });
}

const tubeTop = (t) => t.group.position.y + t.h;
const capTube = (tube, open, dur = 0.3) => { const a = tube.capOpen; return anim(dur, (e) => tube.setCap(lerp(a, open ? 1 : 0, e))); };

/** Pipette 10 µL from sample i into well i: fresh tip, draw, load, eject, hang it back up. */
async function load(i) {
  const pip = B.pip, tube = B.tubes[i], C = T.steps.ladder.captions;
  const say = (c) => { if (i === 0) S.cap = c; };
  say(C.tip);
  await takeTip(pip, POS.tips.clone().add(B.tipBox.tips[S.tipsUsed]), { onSeat: () => B.tipBox.setTaken(++S.tipsUsed) });

  say(fmt(C.draw, { ul: LOAD_UL }));
  const tpos = tube.group.position, lv = tube.liquid.level;
  capTube(tube, true);
  await pipetteDraw(pip, {
    above: V3(tpos.x, tubeTop(tube) + 1.4, tpos.z), into: V3(tpos.x, tube.liquid.surfaceY() - 0.3, tpos.z),
    color: hex(COL.dye), onDraw: (e) => tube.liquid.setLevel(lv - 0.2 * e),
  });
  capTube(tube, false);

  say(C.load);
  const well = worldOf(B.gel.group, B.gel.anchors.wells[i]);
  await pipetteDispense(pip, {
    above: well.clone().add(V3(0, 2.5, 0)), into: well.clone().add(V3(0, -0.15, 0)),   // inside the well, above its floor
    onDispense: (e) => { S.loaded[i] = e; },
  });

  say(C.eject);
  await ejectTip(pip, root, POS.waste.clone().add(V3(0, 9.5, 0)), POS.waste.clone().setY(0.9), { within: 1.7 });
  await moveTo(pip.group, { pos: pipRest(B.stand, pip), dur: 0.7, arc: 2 });
  S.cap = null;
}

async function actLadder() { await load(0); }
async function actSample(key) {
  const i = SAMPLES.findIndex((s) => s.key === key);
  if (i !== S.next) return;
  S.next++;
  await load(i);
}

async function actConnect() {
  const lid = B.lid;
  await moveTo(lid, { pos: POS.box.clone().add(B.box.anchors.top), quat: new THREE.Quaternion(), dur: 1.3, arc: 6 });
  for (const k of ['black', 'red']) {
    await anim(0.8, (e) => { S.plug[k] = e; poseLeads(); });
  }
  ix.addGroup('box', lid);   // closed on the box, the lid is part of it: a click on it is a click on the box
}

async function actPower() {
  B.power.setDisplay({ on: true, volts: VOLTS, mA: MA, time: clockText(0) });
  await anim(1.2, (e) => { S.current = e; });
  await wait(1.2);
}

const pad = (n) => String(Math.floor(n)).padStart(2, '0');
function clockText(run) {
  const sec = run * RUN_MIN * 60;
  return fmt(T.clock.time, { m: Math.floor(sec / 60), ss: pad(sec % 60) });
}
function setRun(t) {
  S.runT = t;
  S.run = clamp(t / RUN_REAL);
  B.power.setDisplay({ on: S.current > 0.5, volts: VOLTS, mA: MA, time: clockText(S.run) });
}

async function actImage() {
  B.power.setDisplay({ on: false, volts: VOLTS });
  await anim(0.6, (e) => { S.current = 1 - e; });
  for (const k of ['red', 'black']) await anim(0.6, (e) => { S.plug[k] = 1 - e; poseLeads(); });
  ix.addGroup('lid', B.lid);
  await moveTo(B.lid, { pos: POS.lidRest, dur: 1.2, arc: 6 });
  const g = B.gel.group, p = g.position.clone();
  await moveTo(g, { pos: p.clone().add(V3(0, 5, 0)), dur: 0.8 });
  if (!isInstant()) { follow.hold(); stage.focus('image', 2.6); }   // the camera travels with the gel
  await moveTo(g, { pos: POS.light.clone().add(B.light.anchors.bed), dur: 2.6, arc: 6 });
  ix.addGroup('light', g);   // the gel now lies on the light: hovering one lifts both
  await anim(0.9, (e) => B.light.setCover(e));
  await anim(1.4, (e) => { B.light.setOn(e); S.dark = e; S.stain = e; });
}

// =========================================================================
// Steps
// =========================================================================
const card = (id, slots = {}) => {
  const s = T.steps[id], f = (v) => (typeof v === 'string' ? fmt(v, slots) : v);
  return { title: s.title, short: s.short, action: s.action, hint: f(s.hint), detail: f(s.detail), why: s.why };
};
const nextSample = () => (S && S.next < SAMPLES.length ? SAMPLES[S.next] : null);
const SAMPLE_KEYS = SAMPLES.slice(1).map((s) => s.key);
const STEPS = [
  { id: 'buffer', ...card('buffer', { mm: Math.round(BUFFER_TOP * 10) }), targets: ['tae'], view: 'box',
    caption: T.steps.buffer.caption, run: actBuffer },
  { id: 'comb', ...card('comb'), targets: ['comb'], view: 'box', caption: T.steps.comb.caption, run: actComb },
  { id: 'ladder', ...card('ladder', { ul: LOAD_UL }), targets: ['ladder'], view: 'load',
    caption: () => (S && S.cap) || { text: fmt(T.steps.ladder.caption.text, { ul: LOAD_UL }), note: T.steps.ladder.caption.note },
    run: actLadder },
  { id: 'samples', ...card('samples', { ul: LOAD_UL }), targets: SAMPLE_KEYS, view: 'load',
    activeTargets: () => { const n = nextSample(); return n ? [n.key] : []; },
    hint: () => { const n = nextSample(); return n ? fmt(T.steps.samples.hint, { name: label(n.key).short }) : T.steps.samples.done; },
    caption: () => { const i = Math.max(1, Math.min(SAMPLES.length - 1, S ? S.next - 1 : 1)); return fmt(T.steps.samples.caption, { name: label(SAMPLES[i].key).name, lane: i + 1 }); },
    isDone: () => S.next >= SAMPLES.length,
    progress: () => (S.next - 1) / (SAMPLES.length - 1),
    run: actSample },
  { id: 'connect', ...card('connect'), targets: ['lid'], view: 'connect', caption: T.steps.connect.caption, run: actConnect },
  { id: 'power', ...card('power', { v: VOLTS }), targets: ['power'], view: 'connect',
    caption: { text: fmt(T.steps.power.caption.text, { v: VOLTS }), note: T.steps.power.caption.note }, run: actPower },
  { id: 'run', ...card('run', { min: RUN_MIN }), targets: [], view: 'run',
    clock: () => (S && S.current > 0.5 ? fmt(T.clock.line, { v: VOLTS, time: clockText(S.run) }) : null),
    caption: () => { const r = S ? S.run : 0, C = T.steps.run.captions; return r < 0.12 ? C.leave : r < 0.85 ? C.split : C.stop; },
    watch: { duration: RUN_REAL, get: () => S.runT, set: setRun } },
  { id: 'image', ...card('image'), targets: ['box'], view: 'run', caption: T.steps.image.caption, run: actImage },
  /* Measuring happens in the gel image panel, outside the bench: the step reads the panel, so a
     rebuild leaves it alone. Watch mode stops at the bench; measuring is the student's. */
  { id: 'measure', respond: true, ...card('measure'), detail: () => measure.prompt(), targets: ['light'], view: 'image', caption: T.steps.measure.caption,
    isDone: () => lesson.mode === 'watch' || measure.solved(),
    progress: () => measure.progress(),
    run: async () => { if (!isInstant()) measure.open(); } },
];
const MEASURE = STEPS.length - 1;
const PHASES = [
  { ...T.phases.setup, steps: ['buffer', 'comb'] },
  { ...T.phases.load, steps: ['ladder', 'samples'] },
  { ...T.phases.run, steps: ['connect', 'power', 'run'] },
  { ...T.phases.see, steps: ['image'] },
  { ...T.phases.read, steps: ['measure'] },
];

const matchName = () => T.samples[MATCH].short;
const completeHint = () => `<span class="res-head"><b>${fmt(T.complete.head, { name: matchName() })}</b>`
  + `<button class="reopen" data-act="gel"><i class="ph ph-chart-line"></i>${T.complete.reopen}</button></span>`;

// =========================================================================
// Wire it together
// =========================================================================
let firstEnter = true;
lesson = createLesson({
  zoom,
  levelWhy: () => captionFor(gelState),
  steps: STEPS,
  phases: PHASES,
  rebuild,
  panel: $('#stepsPanel'),
  completeHint,
  completeWhy: T.complete.why,
  completeCaption: { text: fmt(T.complete.caption.text, { name: matchName() }), note: T.complete.caption.note },
  onEnter: (step) => {
    requestAnimationFrame(() => stage.resize());
    zoom.onStep();
    if (!step) { stage.focus(VIEWS.image, 1.4); toast(T.complete.toast, { icon: 'ph-sparkle' }); return; }
    if (step.id !== 'measure') measure.close();
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; }
    stage.focus(step.view);
  },
});
ix = createInteraction(stage, {
  zoom,
  targets: lesson.targets,
  busy: lesson.isBusy,
  onClick: lesson.click,
  status: lesson.status,
  markerStyle: 'circle',
});
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting,
  watching: () => lesson.mode === 'watch',
  rig: { t: V3(6, 3, 0), p: V3(6, 38, 48) },
  special: ['load', 'run', 'image'],
});

function restart() {
  newSession();
  firstEnter = false;
  measure.reset();
  lesson.restart();
}

stage.onFrame((dt, now) => {
  lesson.update(dt);
  follow.update(dt);
  if (B) {
    paintGel(); B.box.setCurrent(S.current); B.box.update(now / 1000);
    if (B.lid.position.y !== B.lidY) { B.lidY = B.lid.position.y; poseLeads(); }   // the plugs follow the lid, hover lift included
  }
  applyLights();
  zoom.update(dt);
  ix.update();
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-act="gel"]')) measure.open(); });

const intro = createIntro(stage);
bindChrome({ stage, zoom, restart, expose: { get S() { return S; }, get B() { return B; }, lesson, ix, stage, follow, zoom, measure, STEPS, closeIntro: intro.close } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
