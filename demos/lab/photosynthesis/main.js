/* Floating Leaf Disks — photosynthesis lab, rebuilt on the shared Lab library.
 * The original lives in /Photosynthesis and is untouched. */
import * as THREE from 'three';
import {
  V3, Q, Q_LYING, clamp, lerp, smooth, Ease, worldOf,
  rand, gauss, newSession, anim, wait, moveTo, debugSpeed,
  FONT, mesh, disposeTree, toast,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam,
  makeBeaker, makeCup, makeSyringe, SYRINGE_ML as ML, SYRINGE_BOT as SY_BOT,
  makePipette, makeDish, makeRod, makeTray, makeLamp, makeTimer, makePunch,
  makeJar, makeJarLid, makeScoop, makeSqueezeBottle, makeBench, makeWorkMat, makePaperTowel,
  makeStream, ripple, powderFall, drop, makeLeaf, makeLeafDisk,
  createIntro,
} from '../lab.js';

const $ = (s) => document.querySelector(s);
const say = (html, icon = 'ph-check-circle', warn = false) => toast(html, { icon, warn });

// =========================================================================
// Layout (units: cm, bench top at y = 0)
// =========================================================================
const POS = {
  jar: V3(-52, 0, -15), lid: V3(-44.5, 0, -21), scoop: V3(-47, 0.38, -7),
  beakerA: V3(-36, 0, -4), beakerB: V3(-24, 0, -4),
  soapBottle: V3(-60, 0, -3), soapBeaker: V3(-51, 0, 4),
  pipette: V3(-61, 0.64, 11), rodA: V3(-31, 0.24, 3.5), rodB: V3(-19, 0.24, 3.5),
  mat: V3(2, 0, 10), towel: V3(-4, 0, 12), leaf: V3(-6.5, 0.16, 12), leaf2: V3(1.5, 0.15, 13.5),
  dish: V3(9, 0, 4), punch: V3(12, 0.95, 18),
  syr1: V3(-12, 1.06, -16), syr2: V3(-12, 1.06, -11.5),
  cupA: V3(27, 0, -2), cupB: V3(43, 0, -2),
  tray: V3(-6, 0, -13.75),
  lamp: V3(35, 0, -26), timer: V3(35, 0, 5.5),
};
const SY_WORK = V3(1.5, 6, -1);
const LEAF_HOLD = V3(9, 8, 3.5);
const Q_ROD = Q(0, -Math.PI / 2, 0).multiply(Q_LYING);
const Q_PIPETTE = Q(0, -0.3, 0).multiply(Q_LYING);

const VIEWS = {
  overview: { t: V3(4, 0, -4), p: V3(4, 92, 92) },
  prep: { t: V3(-45, 4, 1), p: V3(-40, 42, 58) },
  fill: { t: V3(2, 4, -4), p: V3(2, 52, 76) },
  leaf: { t: V3(4, 4, 8), p: V3(8, 30, 40) },
  syrRest: { t: V3(-4, 2, -11), p: V3(-1, 26, 20) },
  syringe: { t: V3(1.5, 11, -1), p: V3(5, 17, 24) },   // close on the syringe for the vacuum (Watch: a close-up)
  syrWork: { t: V3(1.5, 11, -1), p: V3(5, 17, 24) },   // the same view while loading and drawing (Watch: a pan)
  draw: { t: V3(-16, 5, -3), p: V3(-14, 34, 46) },
  cups: { t: V3(35, 5, -2), p: V3(35, 26, 40) },
  lamp: { t: V3(35, 12, -8), p: V3(30, 34, 54) },
  observe: { t: V3(35, 4.5, -2), p: V3(35, 19, 38) },
};

// =========================================================================
// Stage & materials
// =========================================================================
const observing = () => document.body.classList.contains('observing');
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  insets: (w, h) => {
    // bottom: the instruction card (or the timeline, whichever is higher); hidden ones don't count
    // (on phones the data panel sits at the bottom too)
    // (on phones the data panel sits at the bottom too, and Watch mode's captions move to the top)
    const capsTop = w <= 820 && observing();
    const tops = ['.lab-card', '.lab-timeline', ...(capsTop ? [] : ['.lab-captions']), ...(w > 820 ? [] : ['.data-panel'])]
      .map((q) => document.querySelector(q))
      .map((el) => el && el.getBoundingClientRect()).filter((r) => r && r.height).map((r) => r.top);
    const bottom = tops.length ? h - Math.min(...tops) : 0;
    const panel = $('#stepsPanel').getBoundingClientRect(); // hidden in Watch mode
    const left = panel.width ? panel.right + (observing() ? 0 : 20) : 0;
    if (w > 820) return observing() ? { left, right: Math.min(380, w * 0.26), bottom } : { left, bottom };
    const caps = capsTop && document.querySelector('.lab-captions').getBoundingClientRect();
    return caps && caps.height ? { top: caps.bottom, bottom } : { bottom };
  },
});
const { scene } = stage;
const mat = createMaterials(stage);
const GEO = {
  bubble: new THREE.SphereGeometry(1, 10, 8),
};
Object.values(GEO).forEach((g) => { g.userData.shared = true; });


// =========================================================================
// The bench — rebuilt from scratch whenever the student jumps on the timeline
// =========================================================================
let root = null;   // everything on the bench
let B = null;      // props
let S = null;      // experiment state
let speed = 1;     // observation playback speed (a UI preference, survives rebuilds)
const BASE_RATE = 0.5;   // simulated minutes per real second at 1×
const SIM_END = 20;

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

  place(makeBench(mat), V3());
  place(makeWorkMat(mat), POS.mat);
  place(makePaperTowel(mat), POS.towel, 0.05);
  const jar = place(makeJar(mat, { ingredient: 'bakingSoda' }), POS.jar);
  const lid = place(makeJarLid(mat, { ingredient: 'bakingSoda' }), POS.lid);
  const scoop = place(makeScoop(mat), POS.scoop); scoop.group.quaternion.copy(Q(0, 0.5, 0));
  const beakerA = place(makeBeaker(mat, { label: '0.2% NaHCO₃', sub: 'bicarbonate', color: '#16a34a' }), POS.beakerA);
  const beakerB = place(makeBeaker(mat, { label: 'Water', sub: 'control', color: '#94a3b8' }), POS.beakerB);
  const soapBeaker = place(makeBeaker(mat, { r: 2.2, h: 4.8, level: 1.9, cap: 50, label: 'Soap 1%', color: '#ca8a04', liquidColor: 0xe0d64a }), POS.soapBeaker);
  const soapBottle = place(makeSqueezeBottle(mat), POS.soapBottle, 0.3);
  const pipette = place(makePipette(mat), POS.pipette); pipette.group.quaternion.copy(Q_PIPETTE);
  const rodA = place(makeRod(mat), POS.rodA); rodA.group.quaternion.copy(Q_ROD);
  const rodB = place(makeRod(mat), POS.rodB); rodB.group.quaternion.copy(Q_ROD);
  const leaf = place(makeLeaf(mat, { seed: 1 }), POS.leaf, 0.35);
  const leaf2 = place(makeLeaf(mat, { seed: 2 }), POS.leaf2, 2.75);
  const dish = place(makeDish(mat), POS.dish);
  const punch = place(makePunch(mat), POS.punch); punch.group.quaternion.copy(Q(0, -0.55, 0));
  const syr = {};
  [1, 2].forEach((n) => {
    const s = place(makeSyringe(mat), n === 1 ? POS.syr1 : POS.syr2);
    s.group.quaternion.copy(Q_LYING);
    Object.assign(s, { num: n, disks: [], sunkCount: 0, pulls: 0 });
    syr[n] = s;
  });
  place(makeTray(mat), POS.tray);
  const cupA = place(makeCup(mat, { label: 'Cup A', sub: 'NaHCO₃ + light', color: '#16a34a' }), POS.cupA);
  const cupB = place(makeCup(mat, { label: 'Cup B', sub: 'control · water', color: '#94a3b8' }), POS.cupB);
  cupA.disks = []; cupB.disks = []; // the leaf disks dropped into each cup
  const lamp = place(makeLamp(mat), POS.lamp);
  const timer = place(makeTimer(mat), POS.timer);
  const stream = makeStream(mat, root);

  B = { jar, lid, scoop, beakerA, beakerB, soapBeaker, soapBottle, pipette, rodA, rodB, leaf, leaf2, dish, punch, syr, cupA, cupB, lamp, timer, stream };
  S = {
    filled: { A: false, B: false }, stirred: { A: false, B: false }, dishDisks: [],
    lampOn: false, observing: false, simT: 0, sampled: -1,
  };

  ix.register('jar', jar.group, { name: 'Sodium bicarbonate', short: 'Baking soda', desc: 'NaHCO₃ powder. Dissolved in water it releases CO₂ for photosynthesis.', anchor: V3(0, 8.5, 0) });
  ix.addGroup('jar', scoop.group);
  ix.register('beakerA', beakerA.group, { name: 'Beaker · bicarbonate', short: 'Bicarbonate beaker', desc: '250 mL beaker of water that becomes the 0.2% NaHCO₃ solution.', anchor: V3(0, 11, 0) });
  ix.register('beakerB', beakerB.group, { name: 'Beaker · water (control)', short: 'Water beaker', desc: 'Plain water with a drop of soap. No CO₂ source.', anchor: V3(0, 11, 0) });
  ix.register('soap', soapBeaker.group, { name: 'Dilute soap', short: 'Soap', desc: '1% dish soap — a surfactant.', anchor: V3(0, 6, 0) });
  ix.addGroup('soap', soapBottle.group);
  ix.register('pipette', pipette.group, { name: 'Transfer pipette', short: 'Pipette', desc: 'For adding single drops of soap.', anchor: V3(0, 7, 1) });
  ix.register('rodA', rodA.group, { name: 'Stirring rod · bicarbonate', short: 'Rod A', desc: 'Glass rod for the bicarbonate beaker.', anchor: V3(0, 9, 1) });
  ix.register('rodB', rodB.group, { name: 'Stirring rod · control', short: 'Rod B', desc: 'Glass rod for the water (control) beaker.', anchor: V3(0, 9, 1) });
  ix.register('leaf', leaf.group, { name: 'Spinach leaf', short: 'Spinach leaf', desc: 'Fresh spinach. Its spongy mesophyll is full of air spaces.', anchor: V3(0, 1, 0) });
  ix.addGroup('leaf', leaf2.group);
  ix.register('punch', punch.group, { name: 'Hole punch', short: 'Hole punch', desc: 'Cuts uniform 6 mm leaf disks.', anchor: V3(5, 1.6, 0) });
  ix.register('dish', dish.group, { name: 'Petri dish', short: 'Petri dish', desc: 'Holds the cut leaf disks.', anchor: V3(0, 2, 0) });
  [1, 2].forEach((n) => ix.register('syringe' + n, syr[n].group, {
    name: `10 mL syringe ${n}`, short: `Syringe ${n}`, desc: 'Plastic syringe with no needle. Used to pull a vacuum on the leaf disks.', anchor: V3(0, 6, 0),
  }));
  ix.register('cupA', cupA.group, { name: 'Cup A · bicarbonate', short: 'Cup A', desc: 'Leaf disks + NaHCO₃ solution, under the lamp.', anchor: V3(0, 10.5, 0) });
  ix.register('cupB', cupB.group, { name: 'Cup B · control', short: 'Cup B', desc: 'Leaf disks + water only (no bicarbonate).', anchor: V3(0, 10.5, 0) });
  ix.register('lamp', lamp.group, { name: 'Desk lamp', short: 'Lamp', desc: 'Bright LED lamp — the light energy for photosynthesis.', anchor: V3(0, 33.5, 24) });
  ix.register('timer', timer.group, { name: 'Lab timer', short: 'Timer', desc: 'Time how long the disks take to float.', anchor: V3(0, 4.5, 0) });

  // observation UI back to its starting state
  $('#dataPanel').hidden = true;
  $('#result').hidden = true;
  document.body.classList.remove('observing');
  stage.resize();
}

// =========================================================================
// Actions (one per click)
// =========================================================================
async function actSoda() {
  const { scoop, jar, beakerA } = B;
  const sp = scoop.group;
  const rp = sp.position.clone(), rq = sp.quaternion.clone();
  const jx = POS.jar.x, jz = POS.jar.z;
  await moveTo(sp, { pos: V3(jx, 12, jz), quat: Q(0, 0, 0.85), dur: 0.8, arc: 2 });
  await moveTo(sp, { pos: V3(jx, 4.95, jz), dur: 0.45 });
  scoop.heap.visible = true;
  await Promise.all([
    anim(0.3, (e) => scoop.heap.scale.set(1.3 * (0.05 + e), 0.55 * (0.05 + e), 0.8 * (0.05 + e))),
    anim(0.3, (e) => { jar.dome.position.y = 4.6 - 0.12 * e; }),
  ]);
  await moveTo(sp, { pos: V3(jx, 12, jz), dur: 0.45 });
  const bp = beakerA.group.position;
  await moveTo(sp, { pos: V3(bp.x - 0.4, 12.5, bp.z), quat: Q(0, 0, 0.35), dur: 0.9, arc: 2 });
  const fall = powderFall(mat, root, worldOf(sp, scoop.anchors.bowl), beakerA.liquid.surfaceY());
  anim(0.45, (e) => scoop.heap.scale.set(1.3 * (1 - e) + 0.001, 0.55 * (1 - e) + 0.001, 0.8 * (1 - e) + 0.001));
  await moveTo(sp, { quat: Q(0, 0, 1.2), dur: 0.35 });
  await fall;
  scoop.heap.visible = false;
  await Promise.all([anim(0.6, (e) => beakerA.liquid.setCloud(e)), moveTo(sp, { pos: rp, quat: rq, dur: 1.1, arc: 3 })]);
  say('Baking soda added — stir it in later', 'ph-flask');
}

function squeeze(p, a, dur) {
  const a0 = p.squeeze;
  return anim(dur, (e) => p.setSqueeze(lerp(a0, a, e)));
}

async function actSoap() {
  const { pipette: p, soapBeaker, beakerA, beakerB } = B;
  const sp = soapBeaker.group.position;
  const up = p.group.position.clone(); up.y += 6;
  await moveTo(p.group, { pos: up, dur: 0.5, ease: Ease.out });
  await moveTo(p.group, { pos: V3(sp.x, 7.2, sp.z), quat: new THREE.Quaternion(), dur: 0.8, arc: 2 });
  await squeeze(p, 1, 0.25);
  await moveTo(p.group, { pos: V3(sp.x, 0.6, sp.z), dur: 0.5 });
  const L0 = soapBeaker.liquid.level;
  await Promise.all([squeeze(p, 0, 0.4), anim(0.6, (e) => p.setFluid(3.4 * e)), anim(0.6, (e) => soapBeaker.liquid.setLevel(L0 - 0.14 * e))]);
  await moveTo(p.group, { pos: V3(sp.x, 11.5, sp.z), dur: 0.45 });
  for (const b of [beakerA, beakerB]) {
    const bp = b.group.position;
    await moveTo(p.group, { pos: V3(bp.x + 0.8, 11.4, bp.z + 0.6), dur: 0.8, arc: 1.5 });
    const tip = worldOf(p.group, p.anchors.tip);
    await squeeze(p, 0.5, 0.18);
    const f0 = p.fluid.scale.y;
    anim(0.2, (e) => p.setFluid(f0 - 0.8 * e));
    await drop(root, mat.soap, tip.clone().add(V3(0, -0.2, 0)), b.liquid.surfaceY());
    await squeeze(p, 0, 0.2);
  }
  await moveTo(p.group, { pos: POS.pipette, quat: Q_PIPETTE, dur: 1.0, arc: 4 });
  say('One drop of soap in each beaker', 'ph-drop');
}

async function actStir(key) {
  const which = key === 'rodA' ? 'A' : 'B';
  if (S.stirred[which]) { say(`Beaker ${which} is already stirred`, 'ph-info', true); return; }
  const r = (which === 'A' ? B.rodA : B.rodB).group, b = which === 'A' ? B.beakerA : B.beakerB;
  const rp = r.position.clone(), rq = r.quaternion.clone();
  const bp = b.group.position;
  await moveTo(r, { pos: V3(bp.x + 1.3, 12, bp.z), quat: Q(0, 0, 0.16), dur: 0.9, arc: 2 });
  await moveTo(r, { pos: V3(bp.x + 1.3, 0.75, bp.z), dur: 0.5 });
  const c0 = b.liquid.cloud;
  let lastRip = 0;
  await anim(which === 'A' ? 2.2 : 1.4, (e, k) => {
    const a = k * Math.PI * 2 * (which === 'A' ? 3 : 2);
    r.position.set(bp.x + 1.3 * Math.cos(a), 0.75, bp.z + 1.3 * Math.sin(a));
    b.liquid.setCloud(c0 * (1 - e));
    if (k - lastRip > 0.18) { lastRip = k; ripple(root, V3(bp.x, b.liquid.surfaceY() + 0.01, bp.z), 3); }
  }, Ease.linear);
  await moveTo(r, { pos: V3(bp.x + 1.3, 12, bp.z), dur: 0.45 });
  await moveTo(r, { pos: rp, quat: rq, dur: 1.0, arc: 3 });
  S.stirred[which] = true;
  say(which === 'A' ? 'Bicarbonate dissolved' : 'Control stirred', 'ph-check-circle');
}

async function actFill(key) {
  const which = key.endsWith('A') ? 'A' : 'B';
  if (S.filled[which]) { say(`Cup ${which} is already filled`, 'ph-info', true); return; }
  await pour(which === 'A' ? B.beakerA : B.beakerB, which === 'A' ? B.cupA : B.cupB, 150);
  S.filled[which] = true;
  say(`Cup ${which} filled with ${which === 'A' ? 'bicarbonate solution' : 'water (control)'}`, 'ph-drop');
}

async function pour(b, cup, mL) {
  const g = b.group; const rp = g.position.clone(), rq = g.quaternion.clone();
  const cp = cup.group.position;
  const rimL = b.anchors.spout;
  const target = V3(cp.x - 1.2, cup.h + 2.6, cp.z);
  const poseFor = (th) => { const q = Q(0, 0, th); return { pos: target.clone().sub(rimL.clone().applyQuaternion(q)), quat: q }; };
  const thFor = (L) => Math.atan((b.t + L - b.h) / b.r) - 0.06;
  const L0 = b.liquid.level, L1 = b.liquid.levelAt(b.liquid.volume - mL);
  const pre = poseFor(-0.25); pre.pos.y += 2;
  await moveTo(g, { pos: pre.pos, quat: pre.quat, dur: 1.3, arc: 6 });
  const th1 = thFor(L0);
  await anim(0.6, (e) => {
    const p = poseFor(lerp(-0.25, th1, e));
    g.position.copy(p.pos); g.position.y += 2 * (1 - e); g.quaternion.copy(p.quat);
  });
  const v0 = cup.liquid.volume;
  await anim(1.9, (e) => {
    b.liquid.setLevel(lerp(L0, L1, e));
    const p = poseFor(thFor(b.liquid.level)); g.position.copy(p.pos); g.quaternion.copy(p.quat);
    cup.liquid.setVolume(v0 + mL * e);
    B.stream.set(worldOf(g, rimL).add(V3(0.15, -0.05, 0)), cup.liquid.surfaceY(), e > 0.92 ? (1 - e) / 0.08 : 1);
  }, Ease.linear);
  B.stream.hide();
  ripple(root, V3(target.x, cup.liquid.surfaceY() + 0.01, cp.z), 2.4);
  const thE = thFor(L1), pE = g.position.clone();
  await anim(0.6, (e) => {
    g.quaternion.copy(Q(0, 0, lerp(thE, 0, e)));
    g.position.copy(pE); g.position.y += 3 * e;
  });
  await moveTo(g, { pos: rp, quat: rq, dur: 1.2, arc: 6 });
}

async function actPunch() {
  const { leaf, punch, dish } = B;
  stage.focus({ t: V3(9, 6.5, 4), p: V3(13, 21, 27) });
  const lg = leaf.group; const lrp = lg.position.clone(), lrq = lg.quaternion.clone();
  const pg = punch.group; const prp = pg.position.clone(), prq = pg.quaternion.clone();
  await moveTo(lg, { pos: LEAF_HOLD, quat: Q(0, 0, 0), dur: 1.0, arc: 4 });
  const dc = dish.group.position;
  for (let i = 0; i < leaf.spots.length; i++) {
    const sp = leaf.spots[i];
    const w = worldOf(leaf.mesh, sp.local);
    await moveTo(pg, { pos: w, quat: Q(0, 0.15, 0), dur: i === 0 ? 0.9 : 0.2, arc: i === 0 ? 3 : 0 });
    await anim(0.09, (e) => punch.setPress(e));
    leaf.punchHole(sp);
    const dp = makeLeafDisk(mat, { shade: i % 3 });
    const disk = dp.group;
    disk.userData.disk = true;
    disk.position.copy(w).add(V3(0, -0.1, 0));
    root.add(disk);
    const dx = w.x - dc.x, dz = w.z - dc.z; const dl = Math.hypot(dx, dz); const k = dl > 3.7 ? 3.7 / dl : 1;
    const land = V3(dc.x + dx * k + rand(-0.4, 0.4), 0.15 + rand(0, 0.05), dc.z + dz * k + rand(-0.4, 0.4));
    const p0 = disk.position.clone(); const r1 = V3(rand(-0.15, 0.15), rand(0, 6), rand(-0.15, 0.15));
    const spin = rand(2, 5);
    anim(0.45, (e) => {
      disk.position.lerpVectors(p0, land, e);
      disk.rotation.set(Math.sin(e * spin) * (1 - e) * 0.8 + r1.x * e, r1.y * e, r1.z * e);
    }, Ease.in);
    S.dishDisks.push({ mesh: disk, prop: dp, inf: 0, sunk: false });
    await anim(0.09, (e) => punch.setPress(1 - e));
  }
  await wait(0.3);
  await Promise.all([moveTo(pg, { pos: prp, quat: prq, dur: 0.9, arc: 3 }), moveTo(lg, { pos: lrp, quat: lrq, dur: 1.0, arc: 3 })]);
  say('20 leaf disks cut — notice they float on water', 'ph-leaf');
}

async function actLoad(n) {
  const sy = B.syr[n];
  stage.focus('syrWork');
  await moveTo(sy.group, { pos: SY_WORK, quat: new THREE.Quaternion(), dur: 1.0, arc: 5 });
  await anim(0.45, (e) => sy.setPlunger(lerp(SY_BOT, 12.8, e)));
  await anim(0.35, (e) => { sy.plunger.position.x = 3.2 * e; sy.plunger.rotation.z = -0.25 * e; });
  const disks = S.dishDisks.splice(0, 10);
  sy.disks = disks;
  // pick every random value up front so the order never depends on timing
  disks.forEach((d, i) => {
    d.rest = V3(rand(-0.25, 0.25), 1.46 + i * 0.075, rand(-0.25, 0.25));
    d.spin = V3(rand(-0.45, 0.45), rand(0, 6), rand(-0.45, 0.45));
  });
  await Promise.all(disks.map((d, i) => (async () => {
    await wait(i * 0.13);
    sy.group.attach(d.mesh);
    const p0 = d.mesh.position.clone();
    const top = V3(0, 11.4, 0);
    await anim(0.42, (e) => { d.mesh.position.lerpVectors(p0, top, e); d.mesh.position.y += Math.sin(Math.PI * e) * 3; });
    d.mesh.rotation.set(d.spin.x, d.spin.y, d.spin.z);
    await anim(0.35, (e) => d.mesh.position.lerpVectors(top, d.rest, e), Ease.in);
  })()));
  await anim(0.35, (e) => { sy.plunger.position.x = 3.2 * (1 - e); sy.plunger.rotation.z = -0.25 * (1 - e); });
  const stopY = 1.46 + 10 * 0.075 + 0.3;
  await anim(0.6, (e) => sy.setPlunger(lerp(12.8, stopY, e)));
  say(`10 disks loaded into syringe ${n}`, 'ph-syringe');
}

async function actDraw(n) {
  const sy = B.syr[n], b = n === 1 ? B.beakerA : B.beakerB; const bp = b.group.position;
  stage.focus({ t: V3(bp.x, 7, bp.z), p: V3(bp.x + 5, 20, bp.z + 27) });
  await moveTo(sy.group, { pos: V3(bp.x, 12.5, bp.z), dur: 1.3, arc: 6 });
  await moveTo(sy.group, { pos: V3(bp.x, b.t + 0.4, bp.z), dur: 0.7 });
  const p0 = sy.py, V0 = b.liquid.volume;
  await anim(1.5, (e) => {
    const v = 5 * e; sy.setVol(v);
    const top = SY_BOT + v * ML;
    sy.setPlunger(Math.max(p0, top + 0.45));
    b.liquid.setVolume(V0 - v);
    sy.disks.forEach((d, i) => { d.mesh.position.y = Math.max(d.rest.y, top - 0.07 - (i % 4) * 0.07); });
  });
  sy.disks.forEach((d) => { d.float = d.mesh.position.y; });
  await moveTo(sy.group, { pos: V3(bp.x, 13.5, bp.z), dur: 0.6 });
  stage.focus('syrWork');
  await moveTo(sy.group, { pos: SY_WORK, dur: 1.2, arc: 4 });
  say(`5 mL of ${n === 1 ? 'bicarbonate solution' : 'water'} drawn — the disks float`, 'ph-drop');
}

function bubbleBurst(sy, disks, topY) {
  const ps = [];
  disks.forEach((d) => {
    for (let j = 0; j < 5; j++) {
      const b = new THREE.Mesh(GEO.bubble, mat.bubble);
      const s = rand(0.03, 0.065), delay = rand(0, 0.6), dur = rand(0.5, 0.9);
      b.scale.setScalar(0.001);
      const start = d.mesh.position.clone().add(V3(rand(-0.2, 0.2), rand(-0.02, 0.04), rand(-0.2, 0.2)));
      b.position.copy(start);
      sy.group.add(b);
      ps.push(wait(delay).then(() => anim(dur, (e) => {
        b.scale.setScalar(s * Math.min(1, e * 4));
        b.position.set(start.x + Math.sin(e * 9) * 0.04, lerp(start.y, topY - 0.03, e), start.z);
      }, Ease.in)).then(() => sy.group.remove(b)));
    }
  });
  return Promise.all(ps);
}

const sunkCount = (n) => B.syr[n].disks.filter((d) => d.sunk).length;

async function actVac(n) {
  const sy = B.syr[n];
  if (!sy.capped) {
    sy.cap.visible = true;
    await anim(0.45, (e) => { sy.cap.position.y = lerp(-2.5, 0.32, e); }, Ease.out);
    sy.capped = true;
    say('Tip capped — now the plunger can pull a vacuum', 'ph-push-pin');
  }
  const base = sy.py;
  const top = SY_BOT + sy.vol * ML;
  await anim(0.7, (e) => sy.setPlunger(base + 2.6 * e));
  const active = sy.disks.filter((d) => !d.sunk);
  sy.pulls++;
  active.forEach((d) => { d.inf += sy.pulls >= 3 ? 1 : rand(0.42, 0.85); });
  await Promise.all([
    bubbleBurst(sy, active, top),
    anim(1.2, (e, k) => {
      active.forEach((d, i) => { d.mesh.position.y = d.float + 0.05 * Math.sin(k * 22 + i) * (1 - k) + 0.04 * e; });
    }, Ease.linear),
  ]);
  await anim(0.35, (e) => sy.setPlunger(base + 2.6 * (1 - e)), Ease.out);
  const sinkers = active.filter((d) => d.inf >= 1);
  sinkers.forEach((d) => {
    d.sunk = true;
    d.prop.setInfiltrated(true);
    d.target = V3(rand(-0.25, 0.25), 1.46 + (sy.sunkCount++) * 0.08, rand(-0.25, 0.25));
  });
  active.filter((d) => !d.sunk).forEach((d) => { d.mesh.position.y = d.float; });
  await Promise.all(sinkers.map((d, i) => {
    const p0 = d.mesh.position.clone();
    const r0 = d.mesh.rotation.clone();
    return wait(i * 0.07).then(() => anim(1.0, (e) => {
      d.mesh.position.lerpVectors(p0, d.target, e);
      d.mesh.position.x += Math.sin(e * Math.PI * 2) * 0.1;
      d.mesh.rotation.x = r0.x + Math.sin(e * Math.PI) * 0.5;
    }, Ease.inOut));
  }));
  const sunk = sunkCount(n);
  if (sunk === 10) say('All 10 disks sank — the air spaces are full of solution', 'ph-check-circle');
  else say(`${sinkers.length} disk${sinkers.length === 1 ? '' : 's'} sank · ${sunk}/10 — pull again`, 'ph-arrow-down', sinkers.length === 0);
}

function bottomSpots(cup, n) {
  const out = []; let tries = 0;
  while (out.length < n && tries < 4000) {
    tries++;
    const r = Math.sqrt(rand()) * 2.25, a = rand(0, Math.PI * 2);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 0.66)) continue;
    out.push(V3(x, 0, z));
  }
  while (out.length < n) out.push(V3(rand(-1.5, 1.5), 0.06, rand(-1.5, 1.5)));
  return out.map((p) => p.add(V3(cup.group.position.x, cup.base + 0.04 + rand(0, 0.03), cup.group.position.z)));
}

function releaseDisk(d, cup, spot) {
  root.attach(d.mesh);
  const p0 = d.mesh.position.clone();
  const surf = cup.liquid.surfaceY();
  const entry = V3(lerp(p0.x, spot.x, 0.4), surf - 0.2, lerp(p0.z, spot.z, 0.4));
  const r0 = d.mesh.rotation.clone();
  const { ry, phase, dur } = d.drift;
  d.bottom = spot.clone();
  return anim(0.25, (e) => d.mesh.position.lerpVectors(p0, entry, e), Ease.in).then(() => anim(dur, (e) => {
    d.mesh.position.lerpVectors(entry, spot, e);
    d.mesh.position.x += Math.sin(e * 7 + phase) * 0.25 * (1 - e);
    d.mesh.rotation.set(lerp(r0.x, d.rot.x, e) + Math.sin(e * 8 + phase) * 0.35 * (1 - e), lerp(r0.y, ry, e), lerp(r0.z, d.rot.z, e));
  }, Ease.out));
}

async function actEmpty(n) {
  const sy = B.syr[n], cup = n === 1 ? B.cupA : B.cupB; const cp = cup.group.position;
  stage.focus({ t: V3(cp.x + 2, 8, cp.z), p: V3(cp.x + 4, 20, cp.z + 30) });
  await moveTo(sy.group, { pos: V3(cp.x + 1, cup.h + 4, cp.z), dur: 1.3, arc: 5 });
  await anim(0.5, (e) => sy.setPlunger(lerp(sy.py, 12.8, e)));
  root.attach(sy.plunger);
  const plRest = V3(cp.x + 5, 1.0, cp.z + 7);
  await moveTo(sy.plunger, { pos: plRest, quat: Q_LYING, dur: 0.8, arc: 2 });
  const g = sy.group;
  const openL = sy.anchors.top;
  const startOpen = worldOf(g, openL);
  const endOpen = V3(cp.x, cup.h + 1.6, cp.z);
  const len = sy.vol * ML;
  const disks = sy.disks.slice().sort((a, b) => a.mesh.position.y - b.mesh.position.y);
  const spots = bottomSpots(cup, disks.length);
  disks.forEach((d) => {
    d.drift = { ry: rand(0, 6), phase: rand(0, 6), dur: rand(1.1, 1.6) };
    d.rot = V3(rand(-0.08, 0.08), d.drift.ry, rand(-0.08, 0.08));
  });
  const vol0 = cup.liquid.volume;
  const released = [];
  await anim(1.8, (e, k) => {
    const th = 2.45 * Ease.inOut(Math.min(1, k * 1.4));
    const q = Q(0, 0, th);
    const open = startOpen.clone().lerp(endOpen, Ease.inOut(Math.min(1, k * 1.4)));
    g.quaternion.copy(q);
    g.position.copy(open.clone().sub(openL.clone().applyQuaternion(q)));
    const s = smooth(clamp(th / 1.6, 0, 1));
    const drain = clamp((th - 1.5) / 0.95, 0, 1) * 0.6 + clamp((k - 0.7) / 0.3, 0, 1) * 0.4;
    const curLen = len * (1 - drain);
    const a = lerp(SY_BOT, 10.2 - curLen, s);
    sy.setLiquidRange(a, a + curLen);
    disks.forEach((d) => {
      if (d.out) return;
      d.mesh.position.y = lerp(d.target.y, 10.0 - (d.target.y - 1.46), s);
    });
    if (th > 1.6) {
      B.stream.set(worldOf(g, openL), cup.liquid.surfaceY(), 2.2 * (1 - drain) + 0.4);
      cup.liquid.setVolume(vol0 + 5 * drain);
      disks.forEach((d, i) => {
        if (!d.out && k > 0.5 + i * 0.035) { d.out = true; released.push(releaseDisk(d, cup, spots[i])); }
      });
    }
  }, Ease.linear);
  disks.forEach((d, i) => { if (!d.out) { d.out = true; released.push(releaseDisk(d, cup, spots[i])); } });
  B.stream.hide();
  sy.setLiquidRange(0, 0);
  ripple(root, V3(cp.x, cup.liquid.surfaceY() + 0.01, cp.z), 2.6);
  await Promise.all([...released, moveTo(g, { pos: V3(cp.x - 2, cup.h + 8, cp.z + 5), quat: Q(0, 0, -0.25), dur: 1.0 })]);
  cup.disks.push(...disks);
  sy.setVol(0); sy.disks = [];
  if (sy.capped) { sy.cap.visible = false; sy.capped = false; }
  const home = POS['syr' + n];
  await Promise.all([
    moveTo(g, { pos: home, quat: Q_LYING, dur: 1.5, arc: 8 }),
    moveTo(sy.plunger, { pos: V3(home.x + 1.3, 1.15, home.z + (n === 1 ? -2.1 : 2.1)), quat: Q_LYING, dur: 1.6, arc: 8 }),
  ]);
  say(`Disks in cup ${n === 1 ? 'A' : 'B'} — they rest on the bottom`, 'ph-arrow-down');
}

async function actLamp() {
  await anim(0.2, (e) => B.lamp.setLever(e));
  await anim(0.9, (e) => B.lamp.setOn(e), Ease.out);
  S.lampOn = true;
  say('Lamp on — light energy for the chloroplasts', 'ph-lightbulb');
}

async function actTimer() {
  const btn = B.timer.btn;
  await anim(0.12, (e) => { btn.position.y = lerp(3.9, 3.75, e); });
  await anim(0.15, (e) => { btn.position.y = lerp(3.75, 3.9, e); });
  startObservation();
}

// =========================================================================
// Observation — a timed step: disk positions are a pure function of
// simulated time, so the timeline can scrub it back and forth.
// =========================================================================
function surfaceSpots(cup, n) {
  const out = []; let tries = 0;
  const R = cup.liquid.radiusAt(cup.liquid.level) - 0.45;
  while (out.length < n && tries < 4000) {
    tries++;
    const r = Math.sqrt(rand()) * R, a = rand(0, Math.PI * 2);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 0.68)) continue;
    out.push(V3(x, 0, z));
  }
  while (out.length < n) out.push(V3(rand(-2, 2), 0, rand(-2, 2)));
  const y = cup.liquid.surfaceY() - 0.008;
  return out.map((p) => p.add(V3(cup.group.position.x, y, cup.group.position.z)));
}

const cups = () => [['A', B.cupA], ['B', B.cupB]];

function startObservation() {
  cups().forEach(([k, cup]) => {
    const spots = surfaceSpots(cup, cup.disks.length);
    cup.disks.forEach((d, i) => {
      d.surface = spots[i];
      d.phase = rand(0, 6);
      d.sway = rand(-1, 1);
      d.ft = (k === 'A' && S.lampOn) ? clamp(8 + gauss() * 2.4, 3.5, 17.5) : Infinity;
      d.bubbles = [];
      if (k === 'A') {
        for (let j = 0; j < 7; j++) {
          const b = new THREE.Mesh(GEO.bubble, mat.bubble);
          const a = rand(0, Math.PI * 2), r = j < 5 ? rand(0, 0.24) : 0.29;
          const top = j % 3 !== 2;
          b.position.set(Math.cos(a) * r, top ? 0.03 : -0.03, Math.sin(a) * r);
          b.userData.size = rand(0.035, 0.07);
          b.userData.delay = rand(0, 0.5);
          b.scale.setScalar(0.0001);
          b.userData.disk = true;
          d.mesh.add(b);
          d.bubbles.push(b);
        }
      }
    });
  });
  S.observing = true;
  S.simT = 0;
  S.sampled = -1;
  $('#dataPanel').hidden = false;
  document.body.classList.add('observing');
  stage.resize();
  sizeChart();
  setSimTime(0);
  say('Timer started — watch for oxygen bubbles', 'ph-timer');
}

const floatedBy = (cup, t) => cup.disks.filter((d) => d.ft !== Infinity && t >= d.ft + 0.7).length;
function seriesUpTo(cup, t) {
  const out = [[0, 0]];
  for (let s = 0.25; s <= t + 1e-9 && s <= SIM_END; s += 0.25) out.push([s, floatedBy(cup, s)]);
  return out;
}

/** Pose every disk for simulated time t; `time` (real seconds) adds a gentle bob. */
function poseDisks(t, time) {
  cups().forEach(([, cup]) => cup.disks.forEach((d) => {
    const ft = d.ft;
    const grow = ft === Infinity ? 0 : clamp((t - (ft - 4.5)) / 4.5, 0, 1);
    d.bubbles.forEach((b) => b.scale.setScalar(Math.max(0.0001, b.userData.size * clamp((grow - b.userData.delay * 0.5) / (1 - b.userData.delay * 0.5), 0, 1))));
    const p = ft === Infinity ? 0 : clamp((t - ft) / 0.7, 0, 1);
    const e = Ease.inOut(p);
    d.mesh.position.lerpVectors(d.bottom, d.surface, e);
    d.mesh.position.x += Math.sin(p * Math.PI) * 0.35 * d.sway;
    const lift = grow * 0.28;
    d.mesh.rotation.set(d.rot.x * (1 - e) + Math.sin(p * Math.PI) * 1.1 + lift * (1 - e), d.rot.y + p * 0.6, d.rot.z * (1 - e));
    if (p >= 1) {
      d.mesh.position.y += Math.sin(time * 1.6 + d.phase) * 0.025;
      d.mesh.rotation.x += Math.sin(time * 1.1 + d.phase) * 0.04;
    } else if (grow > 0 && p === 0) {
      d.mesh.position.y += grow * 0.04 * (0.5 + 0.5 * Math.sin(time * 3 + d.phase));
    }
  }));
}

function setSimTime(t) {
  if (!S.observing) return;
  S.simT = clamp(t, 0, SIM_END);
  const counts = { A: floatedBy(B.cupA, S.simT), B: floatedBy(B.cupB, S.simT) };
  S.counts = counts;
  poseDisks(S.simT, performance.now() / 1000);
  $('#cntA').textContent = counts.A;
  $('#cntB').textContent = counts.B;
  const sec = S.simT * 60;
  $('#clock').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  B.timer.draw(sec, S.simT < SIM_END);
  const sample = Math.floor(S.simT / 0.25 + 1e-9);
  if (sample !== S.sampled) { S.sampled = sample; drawChart(); }
  if (S.simT >= SIM_END) showResult(); else $('#result').hidden = true;
}

function et50(series) {
  for (let i = 1; i < series.length; i++) {
    const [t0, c0] = series[i - 1], [t1, c1] = series[i];
    if (c1 >= 5 && c0 < 5) return t0 + (t1 - t0) * ((5 - c0) / Math.max(1e-6, c1 - c0));
    if (c0 >= 5 && i === 1) return t0;
  }
  return null;
}

function showResult() {
  const res = $('#result');
  if (!res.hidden) return;
  const eA = et50(seriesUpTo(B.cupA, SIM_END));
  res.hidden = false;
  res.innerHTML = `
    <div class="res-row"><span class="swatch sw-a"></span><span>Cup A (NaHCO₃): ET<sub>50</sub> ≈ <b>${eA ? eA.toFixed(1) + ' min' : 'not reached'}</b> · ${S.counts.A}/10 floated</span></div>
    <div class="res-row"><span class="swatch sw-b"></span><span>Cup B (control): <b>${S.counts.B}/10</b> floated</span></div>
    <p>In the light, the disks with bicarbonate photosynthesized. O<sub>2</sub> filled their air spaces and they rose. The control disks had no CO<sub>2</sub> source, so they made no O<sub>2</sub> and stayed down.</p>
    <button class="btn" id="btnAgain"><i class="ph ph-arrow-counter-clockwise"></i>Run the lab again</button>`;
  $('#btnAgain').addEventListener('click', restart);
}

// ---------- chart ----------
const chart = $('#chart');
function sizeChart() {
  const r = chart.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio, 2);
  chart.width = Math.max(10, r.width * dpr);
  chart.height = Math.max(10, r.height * dpr);
}
function drawChart() {
  if (!S || !S.observing) return;
  const c = chart.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio, 2);
  const W = chart.width / dpr, H = chart.height / dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  const L = 30, R = 8, T = 10, Bm = 24;
  const x = (t) => L + (t / SIM_END) * (W - L - R);
  const y = (n) => T + (1 - n / 10) * (H - T - Bm);
  c.font = `500 10.5px ${FONT}`;
  c.fillStyle = '#7b8a9b'; c.strokeStyle = 'rgba(15,29,43,0.07)'; c.lineWidth = 1;
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let n = 0; n <= 10; n += 5) {
    c.beginPath(); c.moveTo(L, y(n)); c.lineTo(W - R, y(n)); c.stroke();
    c.fillText(String(n), L - 7, y(n));
  }
  c.textBaseline = 'top';
  for (let t = 0; t <= SIM_END; t += 5) { c.textAlign = t === SIM_END ? 'right' : 'center'; c.fillText(t === SIM_END ? `${t} min` : `${t}`, t === SIM_END ? W - R : x(t), H - Bm + 7); }
  c.setLineDash([3, 4]); c.strokeStyle = 'rgba(15,29,43,0.22)';
  c.beginPath(); c.moveTo(L, y(5)); c.lineTo(W - R, y(5)); c.stroke();
  c.setLineDash([]);
  const line = (series, color, w) => {
    c.strokeStyle = color; c.lineWidth = w; c.lineJoin = 'round';
    c.beginPath();
    series.forEach(([t, n], i) => {
      const X = x(t), Y = y(n);
      if (i === 0) c.moveTo(X, Y); else { c.lineTo(X, y(series[i - 1][1])); c.lineTo(X, Y); }
    });
    c.stroke();
  };
  const sA = seriesUpTo(B.cupA, S.simT), sB = seriesUpTo(B.cupB, S.simT);
  line(sB, '#94a3b8', 2);
  line(sA, '#16a34a', 2.4);
  const eA = et50(sA);
  if (eA) {
    c.fillStyle = '#16a34a';
    c.beginPath(); c.arc(x(eA), y(5), 4, 0, 7); c.fill();
    c.strokeStyle = 'rgba(22,163,74,0.35)'; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(x(eA), y(5)); c.lineTo(x(eA), H - Bm); c.stroke(); c.setLineDash([]);
    c.font = `600 11px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillText(`ET₅₀ ${eA.toFixed(1)} min`, Math.min(x(eA) + 6, W - R - 78), y(5) - 5);
  }
}
document.querySelectorAll('#speed button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#speed button').forEach((o) => o.classList.toggle('on', o === b));
  speed = Number(b.dataset.s);
}));

// =========================================================================
// Procedure
// =========================================================================
function syringeSteps(n) {
  const A = n === 1;
  return [
    {
      id: 'load' + n, title: A ? 'Load syringe 1' : 'Load syringe 2 (control)', short: `Load ${n}`, targets: ['syringe' + n], view: 'syrRest',
      action: 'load 10 disks',
      hint: `Click <b>syringe ${n}</b> to load 10 disks`,
      detail: 'Pull out the plunger, drop in 10 leaf disks, and put the plunger back.',
      why: A ? 'Each cup gets its own set of fresh disks, so the trials are independent.' : 'A separate syringe for the control stops bicarbonate from syringe 1 getting into it.',
      caption: A ? 'Load 10 leaf disks into syringe 1' : { text: 'Load 10 fresh disks into syringe 2', note: 'A clean syringe for the control' },
      run: () => actLoad(n),
    },
    {
      id: 'draw' + n, title: A ? 'Draw up bicarbonate solution' : 'Draw up water', short: `Draw ${n}`, targets: [A ? 'beakerA' : 'beakerB'], view: 'draw',
      action: 'draw up 5 mL',
      hint: `Click the <b>${A ? 'bicarbonate' : 'water'} beaker</b> to draw up 5 mL`,
      detail: `Put the tip in the ${A ? 'bicarbonate solution' : 'water'} and pull the plunger back to draw up about 5 mL. The disks float at the top.`,
      why: 'The disks still float because their spongy mesophyll is full of air.',
      caption: { text: `Draw up 5 mL of ${A ? 'bicarbonate solution' : 'plain soapy water'}`, note: 'The disks float: the leaf is full of air' },
      run: () => actDraw(n),
    },
    {
      id: 'vac' + n, title: 'Pull a vacuum', short: `Vacuum ${n}`, targets: ['syringe' + n], view: 'syringe',
      action: 'pull the plunger',
      hint: () => `Click <b>syringe ${n}</b> to pull the plunger · <b>${sunkCount(n)}/10</b> sunk`,
      detail: 'Cap the tip, then pull the plunger back and let it go. Repeat until every disk sinks.',
      why: 'The vacuum pulls air out of the leaf. When you let go, solution flows into the air spaces, so the disks become denser and sink.',
      caption: () => {
        const pulls = B.syr[n].pulls, sunk = sunkCount(n), note = `${sunk}/10 sunk`;
        if (sunk === 10) return { text: 'Every disk has sunk', note: 'Solution now fills the air spaces' };
        if (pulls === 0) return 'Cap the tip and pull back the plunger to make a vacuum';
        if (pulls === 1) return { text: 'Air bubbles out of the leaf disks', note };
        return { text: 'Pull again until every disk sinks', note };
      },
      run: () => actVac(n), isDone: () => sunkCount(n) === 10, progress: () => sunkCount(n) / 10,
    },
    {
      id: 'empty' + n, title: `Pour into cup ${A ? 'A' : 'B'}`, short: `Pour ${n}`, targets: [A ? 'cupA' : 'cupB'], view: 'cups',
      action: 'pour in the disks',
      hint: `Click <b>cup ${A ? 'A' : 'B'}</b> to pour in the disks`,
      detail: `Take out the plunger and pour the disks into cup ${A ? 'A' : 'B'}. They should rest on the bottom.`,
      why: 'Every disk starts at the bottom, so each one that floats later is a measurable result.',
      caption: { text: `Pour the disks into cup ${A ? 'A' : 'B'}`, note: 'They rest on the bottom' },
      run: () => actEmpty(n),
    },
  ];
}

const STEPS = [
  {
    id: 'soda', title: 'Add baking soda', short: 'Baking soda', targets: ['jar'], view: 'prep', action: 'add a scoop to the left beaker',
    hint: 'Click the <b>sodium bicarbonate</b> jar',
    detail: 'Add one scoop of baking soda (NaHCO<sub>3</sub>) to the left beaker of water to make a ~0.2% bicarbonate solution.',
    why: 'Dissolved bicarbonate releases CO<sub>2</sub>, the carbon source the leaf needs for photosynthesis.',
    caption: { text: 'Add a scoop of baking soda to the left beaker', note: 'It gives the leaves CO₂' },
    run: actSoda,
  },
  {
    id: 'soap', title: 'Add a drop of soap', short: 'Soap', targets: ['pipette'], view: 'prep', action: 'add a drop to each beaker',
    hint: 'Click the <b>pipette</b> to add soap',
    detail: 'Use the pipette to add one drop of dilute soap to each beaker.',
    why: 'Soap is a surfactant. It wets the waxy, water-repelling leaf surface so solution can get into the leaf.',
    caption: 'Add one drop of soap to each beaker',
    run: actSoap,
  },
  {
    id: 'stir', title: 'Stir the solutions', short: 'Stir', targets: ['rodA', 'rodB'], view: 'prep', action: 'stir its beaker',
    activeTargets: () => [!S.stirred.A && 'rodA', !S.stirred.B && 'rodB'].filter(Boolean),
    hint: () => (!S.stirred.A && !S.stirred.B ? 'Click each <b>stirring rod</b> to stir its beaker' : 'Now click the other <b>stirring rod</b>'),
    detail: 'Stir each beaker with its own rod until the bicarbonate dissolves and the solution is clear.',
    why: 'A separate rod for each beaker keeps bicarbonate out of the control. Fully dissolved powder gives a known CO<sub>2</sub> concentration.',
    caption: () => (!S.stirred.A ? 'Stir the left beaker until the baking soda dissolves' : 'Stir the right beaker with its own rod'),
    run: actStir, isDone: () => S.stirred.A && S.stirred.B, progress: () => (S.stirred.A + S.stirred.B) / 2,
  },
  {
    id: 'fill', title: 'Fill both cups', short: 'Fill cups', targets: ['cupA', 'cupB'], view: 'fill', action: 'pour 150 mL into it',
    activeTargets: () => [!S.filled.A && 'cupA', !S.filled.B && 'cupB'].filter(Boolean),
    hint: () => (!S.filled.A && !S.filled.B ? 'Click <b>cup A</b> and <b>cup B</b> to fill them' : `Now click <b>cup ${S.filled.A ? 'B' : 'A'}</b>`),
    detail: 'Pour 150 mL of bicarbonate solution into cup A, and 150 mL of plain soapy water into cup B, the control.',
    why: 'The control has no CO<sub>2</sub> source, so any difference between the cups comes from the bicarbonate.',
    caption: () => (!S.filled.A ? 'Pour 150 mL of bicarbonate solution into cup A'
      : { text: 'Pour 150 mL of plain soapy water into cup B', note: 'Cup B is the control: no CO₂' }),
    run: actFill, isDone: () => S.filled.A && S.filled.B, progress: () => (S.filled.A + S.filled.B) / 2,
  },
  {
    id: 'punch', title: 'Punch 20 leaf disks', short: 'Punch disks', targets: ['punch', 'leaf'], view: 'leaf', action: 'punch 20 disks',
    hint: 'Click the <b>hole punch</b> to cut leaf disks',
    detail: 'Punch 20 disks from the spinach leaf into the petri dish. Avoid the big midrib vein.',
    why: 'Same-sized disks make the groups comparable. Veins have no air-filled mesophyll.',
    caption: { text: 'Punch 20 disks from the spinach leaf', note: 'Avoid the big vein' },
    run: actPunch,
  },
  ...syringeSteps(1),
  ...syringeSteps(2),
  {
    id: 'lamp', title: 'Turn on the light', short: 'Lamp', targets: ['lamp'], view: 'lamp', action: 'switch it on',
    hint: 'Click the <b>lamp</b> to switch it on',
    detail: 'Place both cups under the lamp and switch it on.',
    why: 'Light drives the light-dependent reactions that split water and release O<sub>2</sub>.',
    caption: 'Place both cups under the lamp and switch it on',
    run: actLamp,
  },
  {
    id: 'timer', title: 'Start the timer', short: 'Timer', targets: ['timer'], view: 'cups', action: 'start timing',
    hint: 'Click the <b>timer</b> to start counting',
    detail: 'Start timing as soon as the light is on.',
    caption: 'Start the timer',
    run: actTimer,
  },
  {
    id: 'observe', title: 'Count floating disks', short: 'Observe', targets: [], view: 'observe',
    hint: 'Watch the cups — drag the timeline to scrub through the 20 minutes',
    detail: 'Count the floating disks in each cup every minute. Look for tiny O<sub>2</sub> bubbles on the disks.',
    why: 'The faster a group reaches 50% floating (ET<sub>50</sub>), the faster it is photosynthesizing.',
    // the caption follows what the cups are doing over the 20 simulated minutes
    caption: () => {
      const a = (S.counts && S.counts.A) || 0;
      if (a === 0) return { text: 'Watch for tiny oxygen bubbles on the disks', note: 'Count the floating disks every minute' };
      if (a < 5) return { text: 'Oxygen bubbles lift the disks in cup A', note: `${a}/10 floating` };
      if (S.simT < SIM_END - 4) return { text: 'Cup A passed half floating: that time is its ET₅₀', note: `${a}/10 floating` };
      return { text: 'Cup B stays on the bottom', note: 'Without CO₂, its leaves can’t photosynthesize' };
    },
    watch: { duration: SIM_END, get: () => S.simT, set: setSimTime, rate: () => BASE_RATE * speed * debugSpeed },
  },
];
const PHASES = [
  { title: 'Prepare solutions', desc: 'Bicarbonate & soapy water', icon: 'ph-flask', steps: ['soda', 'soap', 'stir', 'fill'] },
  { title: 'Cut leaf disks', desc: '20 disks from a spinach leaf', icon: 'ph-leaf', steps: ['punch'] },
  { title: 'Sink the disks', desc: 'Vacuum the air out in a syringe', icon: 'ph-syringe', steps: ['load1', 'draw1', 'vac1', 'empty1', 'load2', 'draw2', 'vac2', 'empty2'] },
  { title: 'Light & observe', desc: 'Count floating disks over time', icon: 'ph-lightbulb', steps: ['lamp', 'timer', 'observe'] },
];

// =========================================================================
// Wire it together
// =========================================================================
let firstEnter = true;
const lesson = createLesson({
  steps: STEPS,
  phases: PHASES,
  rebuild,
  panel: $('#stepsPanel'),
  completeHint: '<b>Lab complete</b> — compare the two cups',
  completeCaption: { text: 'Experiment complete: compare the two cups', note: 'Only cup A had CO₂ for photosynthesis' },
  onEnter: (step) => {
    requestAnimationFrame(() => stage.resize()); // the card's new height changes the free area
    if (!step) { say('Experiment complete — check your ET₅₀', 'ph-chart-line-up'); return; }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; } // the opening move, after Start
    stage.focus(step.view);
  },
});
const ix = createInteraction(stage, {
  targets: lesson.targets,
  busy: lesson.isBusy,
  onClick: lesson.click,
  status: lesson.status,
  markerStyle: new URLSearchParams(location.search).get('marker') || 'circle', // 'circle' or 'dot'
});

// Watch mode's camera: one default zoom that pans along the bench; only the vacuum in the
// syringe and the floating disks zoom in (rules in follow.js)
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting,
  watching: () => lesson.mode === 'watch',
  rig: { t: V3(0, 4, -2), p: V3(3, 33, 52) },
  special: ['syringe', 'observe'],
});

function restart() {
  newSession();
  firstEnter = false;
  lesson.restart();
}

stage.onFrame((dt, now) => {
  lesson.update(dt);
  follow.update(dt);
  if (S && S.observing) poseDisks(S.simT, now / 1000);
  ix.update();
});
stage.onResize(() => { if (S && S.observing) { sizeChart(); drawChart(); } });

$('#btnView').addEventListener('click', () => stage.focus(stage.lastView));
$('#btnRestart').addEventListener('click', restart);
$('#btnInfo').addEventListener('click', () => { $('#infoModal').hidden = false; });
$('#btnCloseInfo').addEventListener('click', () => { $('#infoModal').hidden = true; });
$('#infoModal').addEventListener('click', (e) => { if (e.target.id === 'infoModal') $('#infoModal').hidden = true; });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#infoModal').hidden = true; });

// debug / testing hook
// the intro card (its leaf is started early by intro-art.js)
const intro = createIntro(stage);

window.LAB = { get S() { return S; }, get B() { return B; }, lesson, ix, stage, follow, STEPS, intro };

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
