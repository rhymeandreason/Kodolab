/* Yeast catalase: paper disks soaked in yeast float up in hydrogen peroxide as catalase splits it
 * into water and O₂. Time the rise at five concentrations, then with boiled yeast.
 *
 * Bench state is S, recreated by rebuild(): the yeast mix S.yeast (0..1), the boil S.boil (0..1),
 * and one clock per cup, S.run[c], in simulated seconds since its first disk was picked up.
 * pose() places everything from S alone, so replays and scrubbing agree. Each disk's float time
 * is drawn once per session (R) and the table and graph read it, never a typed number. */
import * as THREE from 'three';
import {
  V3, Q, clamp, lerp, smooth, Ease, anim, newSession, reseed, gauss, disposeTree, toast, isInstant,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, createIntro, createZoom, chromeInsets, bindChrome, PHONE,
  makeBench, makePaperTowel, makeBeaker, makeCup, makeDish, makeJar, makeScoop, makeRod, makeHotPlate, makeTimer, makeReagentBottle,
  makeForceps, makePaperDisk, makeStream, makeBubbles, makeSteam, powderFall, powderMaterial, ingredient, pourPose, cues, T, fmt,
} from '../lab.js';
import { createDisk } from './disk.js';
import { createMolecule } from './molecule.js';

const $ = (s) => document.querySelector(s);
const ph = (t, a, b, ease = Ease.inOut) => ease(clamp((t - a) / (b - a)));
const win = (t, a, b, c, d) => ph(t, a, b) * (1 - ph(t, c, d));

// =========================================================================
// The science: rate against peroxide, and the float times it gives
// =========================================================================
/* Michaelis-Menten with an apparent Km of 1.5% H₂O₂ (about 0.44 M), inside the range published
 * for catalase (roughly 0.1 to 1 M): catalase saturates only at high peroxide, so classroom data
 * bend between 1.5% and 3% rather than flattening. Float time is taken as inversely proportional
 * to rate, the assay's own assumption: a disk floats once it holds a fixed volume of O₂. */
const KM = 1.5;                 // % H₂O₂
const T3 = 8.5;                 // s to float in 3%, fresh yeast: classroom runs give 6 to 12
const NOISE = 0.11;             // disk to disk spread (log-normal sigma)
const MAX_S = 60;               // the timer stops here; a disk still down counts as rate 0
const CONC = [3, 1.5, 0.75, 0.375, 0];
const BOILED = CONC.length;     // the sixth cup: 3% with boiled-yeast disks
const CUPS = [...CONC.map((c) => ({ conc: c, boiled: false })), { conc: 3, boiled: true }];
const PER = 3;                  // disks per cup
const YEAST_G = 7, WATER_ML = 150, BOIL_ML = 30, BOIL_MIN = 5, CUP_ML = 150;
const pct = (c) => `${c}%`;

const mm = (c) => c / (KM + c);
/** Rate now, relative to 3% with fresh yeast. */
const relRate = (cup) => (CUPS[cup].boiled ? 0 : mm(CUPS[cup].conc) / mm(3));

/** Every disk's float time for one session, in s from when it hits the liquid, or null. */
function drawTimes() {
  reseed('disks');
  return CUPS.map((C, c) => Array.from({ length: PER }, () => {
    const r = relRate(c);
    if (r <= 0) return null;
    const t = (T3 / r) * Math.exp(NOISE * clamp(gauss(), -2, 2));
    return t <= MAX_S ? t : null;
  }));
}

// =========================================================================
// One cup's run, in simulated seconds
// =========================================================================
/* Disk i is handled in [HAND·i, HAND·(i+1)]: picked from the dish, dipped, blotted, dropped. It
 * hits the liquid at DROP(i), sinks, collects bubbles, and reaches the surface at DROP(i) + t. */
const HAND = 3;
const DROP = (i) => HAND * (i + 1) + 0.25;
const SINK = 1.7, RISE = 1.4;
const PREP_S = HAND * PER;           // sim seconds of handling
const PREP_REAL = 7.2;               // real seconds they take
const END = (c) => {
  const ts = R[c].map((t, i) => (t == null ? DROP(i) + MAX_S : DROP(i) + t));
  return Math.min(Math.max(...ts), DROP(0) + MAX_S) + 2;
};
const fast = (c) => Math.max(2, (END(c) - PREP_S) / 6.5);   // time-lapse after the handling
const realDur = (c) => PREP_REAL + (END(c) - PREP_S) / fast(c);
const simAt = (c, real) => (real < PREP_REAL ? (real / PREP_REAL) * PREP_S : PREP_S + (real - PREP_REAL) * fast(c));
const clockS = (c) => Math.max(0, S.run[c] - DROP(0));
const done = (c) => S.run[c] >= END(c);
/** The trial's result once it is in: seconds, Infinity (never floated), or null (not yet). */
function result(c, i) {
  const s = S.run[c], t = R[c][i];
  if (t != null && s >= DROP(i) + t) return t;
  return done(c) ? Infinity : null;
}

// =========================================================================
// Layout and views
// =========================================================================
const CUP_X = [8, 16.5, 25, 33.5, 42, 52.5], CUP_Z = 0;
const POS = {
  hot: V3(-40, 0, -6), jar: V3(-27, 0, -13), scoop: V3(-25, 0.38, 3), yeast: V3(-14, 0, -3), rod: V3(-9, 0.24, 5),
  cool: V3(-3, 0, -9), dish: V3(-12, 0, 12), towel: V3(-1.5, 0, 11), forceps: V3(4.5, 0, 15),
  timer: V3(27, 0, 11), bottle: V3(30, 0, -15),
};
const BK = { r: 3.6, h: 9.6 }, SM = { r: 2.2, h: 4.8 };
const CLEAR = 15;
const Q_HOLD = Q(1.2, 0, 0);       // forceps tips down, legs up and away from the reader
const Q_REST = Q(0, 0.35, 0);

const VIEWS = {
  overview: { t: V3(4, 4, -1), p: V3(4, 66, 92) },
  prep: { t: V3(-20, 5, -3), p: V3(-18, 36, 46) },
  boil: { t: V3(-28, 5, -5), p: V3(-24, 38, 50) },
  cups: { t: V3(14, 4, 3), p: V3(14, 46, 66) },
  boiled: { t: V3(22, 4, 1), p: V3(22, 46, 68) },
  graph: { t: V3(28, 4, 1), p: V3(28, 36, 52) },
  done: { t: V3(30, 3, 1), p: V3(30, 30, 42) },
};

// =========================================================================
// Stage and zoom levels
// =========================================================================
const PANEL_W = 340;
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  controls: { minDistance: 8, maxDistance: 170 },
  insets: (w, h) => {
    const r = chromeInsets(w, h, { bottom: w > PHONE ? [] : ['.cat-panel'] });
    if (w > PHONE) r.right = Math.min(PANEL_W + 24, w * 0.3);
    return r;
  },
});
const mat = createMaterials(stage);
const yeastPowder = powderMaterial(mat, ingredient('yeast').powder);

let S = null, B = null, R = null, root = null;
let lesson, ix;
const ANSWER = { pick: null };      // the read step's answer lives in the panel: a rebuild keeps it

const stepId = () => (lesson && STEPS[lesson.step] ? STEPS[lesson.step].id : null);
/** What the zoom levels show: the focal disk (the first of the cup run last). */
function zoomState() {
  const Z = { step: stepId(), wet: 0, inLiquid: false, conc: 0, rate: 0, o2: 0, rise: 0, heat: S ? ph(S.boil, 0.3, 0.72, Ease.linear) : 0, boiled: false, clockS: 0 };
  if (!S || S.focus < 0) return Z;
  const c = S.focus, s = S.run[c], t = R[c][0], d = DROP(0);
  Z.wet = soakOf(c, 0);
  Z.inLiquid = s >= d;
  Z.boiled = CUPS[c].boiled;
  Z.clockS = Math.max(0, s - d);
  if (Z.inLiquid) {
    Z.conc = CUPS[c].conc;
    Z.rate = relRate(c);
    Z.o2 = t == null ? 0 : clamp((s - d) / t);
    Z.rise = t == null ? 0 : ph(s, d + t - RISE, d + t, Ease.linear);
  }
  return Z;
}
const zoomStep = () => (lesson ? Math.min(lesson.step, STEPS.length) : 0);
const zoom = createZoom(stage, {
  levels: [
    { key: 'disk', world: createDisk(stage.env), name: T.levels.disk.name, meta: T.levels.disk.meta, bg: '#e6eff6' },
    { key: 'mol', world: createMolecule(stage.env), name: T.levels.mol.name, meta: T.levels.mol.meta, bg: '#eceaf6' },
  ],
  getT: zoomState,
  getStep: zoomStep,
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
  return { name: fmt(o.name, vars), short: o.short && fmt(o.short, vars), desc: fmt(o.desc, vars) };
};
const WATER = { color: 0xd8ecfa, opacity: 0.2 }, YEAST = { color: 0xd2b27a, opacity: 0.82 }, PEROX = { color: 0xe4f1fb, opacity: 0.2 };
const DISH_SPOTS = Array.from({ length: CUPS.length * PER }, (_, k) => {
  const a = k * 2.399, r = 0.9 + 3.1 * Math.sqrt((k + 0.5) / (CUPS.length * PER));   // a sunflower spiral, no overlaps
  return V3(Math.cos(a) * r, 0, Math.sin(a) * r);
});
const IN_CUP = [0, 2.1, 4.2].map((a) => [Math.cos(a), Math.sin(a)]);

function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group();
  stage.scene.add(root);
  R = drawTimes();
  S = { yeast: 0, boil: 0, run: CUPS.map(() => 0), focus: -1, key: {} };

  place(makeBench(mat), V3());
  const towel = place(makePaperTowel(mat, { w: 9, d: 7 }), POS.towel, 0.1);
  const hot = place(makeHotPlate(mat), POS.hot);
  const jar = place(makeJar(mat, { ingredient: 'yeast' }), POS.jar);
  const scoop = place(makeScoop(mat, { powder: yeastPowder }), POS.scoop, Math.PI + 0.25);
  const water = place(makeBeaker(mat, { r: BK.r, h: BK.h, level: 0, label: T.props.water, color: '#b7791f', liquidColor: WATER.color }), POS.yeast);
  water.liquid.setVolume(WATER_ML);
  const rod = place(makeRod(mat), POS.rod);
  const small = place(makeBeaker(mat, { r: SM.r, h: SM.h, level: 0, cap: 50, label: T.props.boiled, color: '#b91c1c', liquidColor: YEAST.color }), V3());
  const dish = place(makeDish(mat), POS.dish);
  const forceps = place(makeForceps(mat), POS.forceps);
  const timer = place(makeTimer(mat), POS.timer, -0.15);
  const bottle = place(makeReagentBottle(mat, { ...T.props.bottle, color: '#7c2d12', glass: '#8a4a10', glassOpacity: 0.72, liquidColor: PEROX.color, scale: 1.35 }), POS.bottle, -0.3);
  const cups = CUPS.map((C, c) => {
    const cup = place(makeCup(mat, {
      label: C.boiled ? T.props.boiledCup : fmt(T.props.cup, { conc: pct(C.conc) }),
      sub: C.boiled ? pct(C.conc) : 'H₂O₂', color: C.boiled ? '#b91c1c' : '#0284c7', liquidColor: PEROX.color,
    }), V3(CUP_X[c], 0, CUP_Z));
    cup.liquid.setVolume(CUP_ML);
    [cup.liquid.mesh.material, cup.liquid.cap && cup.liquid.cap.material].forEach((m) => { if (m) m.opacity = PEROX.opacity; });
    return cup;
  });
  const disks = DISH_SPOTS.map((p, k) => { const d = makePaperDisk(mat, { seed: k + 1 }); root.add(d.group); return d; });
  const fizz = cups.map((cup, c) => makeBubbles(mat, root, { count: 22, seed: 11 + c, radius: 2.1, size: [0.04, 0.09] }));
  const boilFizz = makeBubbles(mat, root, { count: 18, seed: 5, radius: 1.5, size: [0.05, 0.12], speed: [0.8, 1.2] });
  const steam = makeSteam(mat, root, { radius: 1.6, rise: 6 });
  const pourStream = makeStream(mat, root, { color: YEAST.color });
  B = { towel, hot, jar, scoop, water, rod, small, dish, forceps, timer, bottle, cups, disks, fizz, boilFizz, steam, pourStream, where: [] };

  ix.register('jar', jar.group, { ...objText('jar'), anchor: V3(0, 7.4, 0) });
  ix.register('water', water.group, { ...objText('water'), anchor: V3(0, BK.h + 0.4, 0) });
  ix.register('hotplate', hot.group, { ...objText('hotplate'), anchor: V3(0, 9, -1) });
  ix.register('small', small.group, { ...objText('small') });
  ix.register('dish', dish.group, { ...objText('dish') });
  ix.register('forceps', forceps.group, { ...objText('forceps') });
  ix.register('towel', towel.group, { ...objText('towel') });
  ix.register('timer', timer.group, { ...objText('timer') });
  ix.register('bottle', bottle.group, { ...objText('bottle') });
  cups.forEach((cup, c) => {
    const C = CUPS[c], v = { conc: pct(C.conc), mL: CUP_ML };
    ix.register('cup' + c, cup.group, { ...objText(C.boiled ? 'cupBoiled' : 'cup', v), anchor: V3(0, cup.h + 0.4, 0) });
  });
  pose(true);
}

// =========================================================================
// pose(): the bench from S
// =========================================================================
const X = V3(1, 0, 0), Z = V3(0, 0, 1), qI = new THREE.Quaternion();
const _a = V3(), _b = V3(), _t = V3(), _q = new THREE.Quaternion();

/** A point along keyframes [[w, Vector3], ...], eased per segment. */
function track(w, keys, out) {
  if (w <= keys[0][0]) return out.copy(keys[0][1]);
  for (let k = 1; k < keys.length; k++) {
    if (w <= keys[k][0]) {
      const [w0, p0] = keys[k - 1], [w1, p1] = keys[k];
      return out.lerpVectors(p0, p1, smooth((w - w0) / (w1 - w0)));
    }
  }
  return out.copy(keys[keys.length - 1][1]);
}
const up = (p, y) => V3(p.x, y, p.z);
const smallPos = () => {
  const plate = V3(POS.hot.x, B.hot.anchors.plate.y, POS.hot.z + B.hot.anchors.plate.z);
  const k = ph(S.boil, 0.76, 0.98, Ease.linear);
  if (k <= 0) return plate;
  const top = CLEAR - 4;
  const h = smooth(clamp((k - 0.25) / 0.5));
  const p = V3(lerp(plate.x, POS.cool.x, h), 0, lerp(plate.z, POS.cool.z, h));
  p.y = k < 0.5 ? lerp(plate.y, top, smooth(clamp(k / 0.3))) : lerp(top, POS.cool.y, smooth(clamp((k - 0.7) / 0.3)));
  return p;
};

/** How soaked disk i of cup c is: 0 dry, 1 dipped. */
const soakOf = (c, i) => ph((S.run[c] - HAND * i) / HAND, 0.36, 0.44, Ease.linear);

/** Where the forceps tip is during cup c's run, and how open. Null when resting. */
function forcepsAt(c, out) {
  const s = S.run[c];
  if (s <= 0 || s >= PREP_S + 1.2) return null;
  const cup = B.cups[c], cupTop = V3(CUP_X[c], cup.h + 1.4, CUP_Z);
  const restTip = B.forceps.anchors.tip.clone().applyQuaternion(Q_REST).add(POS.forceps);
  if (s >= PREP_S) {   // back to rest
    const k = (s - PREP_S) / 1.2;
    track(k, [[0, cupTop], [0.5, up(restTip, 6)], [1, restTip]], out);
    return { open: 0, hold: 1 - ph(k, 0.5, 1) };
  }
  const i = Math.floor(s / HAND), w = (s - HAND * i) / HAND;
  const spot = DISH_SPOTS[c * PER + i].clone().add(POS.dish); spot.y = B.dish.anchors.floor.y + 0.04;
  const dipIn = CUPS[c].boiled ? POS.cool : POS.yeast;
  const dipBk = CUPS[c].boiled ? B.small : B.water;
  const dip = V3(dipIn.x, dipBk.liquid.level > 0.01 ? dipBk.liquid.surfaceY() - 0.9 : 1, dipIn.z);
  const blot = V3(POS.towel.x + (i - 1) * 2, 0.12, POS.towel.z);
  const from = i === 0 ? restTip : cupTop;
  track(w, [
    [0, from], [0.07, up(spot, 4)], [0.12, spot], [0.17, up(spot, CLEAR)], [0.29, up(dip, CLEAR)], [0.38, dip],
    [0.46, up(dip, CLEAR)], [0.55, up(blot, 3)], [0.6, blot], [0.66, blot], [0.72, up(blot, CLEAR)], [0.84, cupTop], [1, cupTop],
  ], out);
  const open = Math.max(win(w, 0.06, 0.1, 0.11, 0.13), win(w, 0.92, 0.95, 0.99, 1));
  return { open, hold: i === 0 ? ph(w, 0, 0.07) : 1 };
}

/** Disk i of cup c: its position and whether it is in the dish, the forceps or the cup. */
function diskAt(c, i, out) {
  const s = S.run[c], w = (s - HAND * i) / HAND, home = DISH_SPOTS[c * PER + i];
  const cup = B.cups[c], floor = cup.base + 0.05, surf = cup.liquid.surfaceY() + 0.02;
  if (w < 0.12) { out.copy(home).add(POS.dish); out.y = B.dish.anchors.floor.y + 0.04; return 'dish'; }
  if (w < 0.95) return 'hand';
  const [ox, oz] = IN_CUP[i], cx = CUP_X[c], cz = CUP_Z;
  const d = DROP(i), t = R[c][i];
  if (s < d) {   // falling from the forceps to the surface
    const k = ph(s, d - 0.15, d, Ease.in);
    out.set(cx, lerp(cup.h + 1.4, surf, k), cz);
    return 'cup';
  }
  const rest = (r) => out.set(cx + ox * r, 0, cz + oz * r);
  const floatAt = t == null ? Infinity : d + t;
  if (s < floatAt - RISE) {   // sinking, then on the floor
    const k = ph(s, d, d + SINK, Ease.out);
    rest(lerp(0, 1.4, k)); out.y = lerp(surf, floor, k);
  } else {                    // rising, then floating
    const k = ph(s, floatAt - RISE, floatAt, Ease.inOut);
    rest(lerp(1.4, 2.1, k)); out.y = lerp(floor, surf, k);
  }
  return 'cup';
}

function pose(force = false) {
  const changed = (k, v) => { if (!force && S.key[k] === v) return false; S.key[k] = v; return true; };

  // the yeast: scoop from the jar into the warm water, then stir
  if (changed('yeast', S.yeast)) {
    const k = S.yeast, sc = B.scoop.group;
    const bowlRest = POS.scoop, jarTop = V3(POS.jar.x, 9, POS.jar.z), over = V3(POS.yeast.x - 0.6, BK.h + 3.5, POS.yeast.z);
    const p = track(k, [[0, bowlRest], [0.1, jarTop], [0.14, V3(POS.jar.x, 5.1, POS.jar.z)], [0.2, jarTop], [0.32, over], [0.42, over], [0.52, up(bowlRest, 4)], [0.6, bowlRest]], _a);
    sc.position.copy(p);
    sc.rotation.set(0, Math.PI + 0.25, -win(k, 0.33, 0.36, 0.4, 0.43) * 1.6);
    B.scoop.heap.visible = k > 0.14 && k < 0.36;
    // the rod stirs from 0.55 to 0.95
    const stir = win(k, 0.55, 0.62, 0.9, 0.97), ang = k * 40;
    if (stir > 0) {
      B.rod.group.position.set(POS.yeast.x + Math.cos(ang) * 1.4 * stir, lerp(6, BK.t || 0.6, stir), POS.yeast.z + Math.sin(ang) * 1.4 * stir);
      B.rod.group.rotation.set(0.2 * stir, 0, 0.2 * stir);
    } else {
      B.rod.group.position.copy(POS.rod);
      B.rod.group.rotation.set(0, 0, Math.PI / 2);
    }
  }

  // the water beaker's colour follows the yeast; its level follows the boil's pour
  const mix = ph(S.yeast, 0.4, 0.9, Ease.linear);
  const pourK = ph(S.boil, 0.06, 0.22, Ease.linear);
  if (changed('liq', [mix, pourK].join())) {
    const L = B.water.liquid;
    L.setColor(new THREE.Color(WATER.color).lerp(new THREE.Color(YEAST.color), mix).getHex());
    const op = lerp(WATER.opacity, YEAST.opacity, mix);
    [L.mesh.material, L.cap && L.cap.material].forEach((m) => { if (m) m.opacity = op; });
    L.setVolume(WATER_ML - BOIL_ML * pourK);
  }

  // the boil: pour some into the small beaker on the hot plate, heat, set it aside to cool
  if (changed('boil', S.boil)) {
    const k = S.boil;
    const kMove = win(k, 0, 0.06, 0.22, 0.28), kTilt = win(k, 0.06, 0.1, 0.18, 0.22);
    const target = V3(POS.hot.x + 1.2, B.hot.anchors.plate.y + SM.h + 3.8, POS.hot.z + B.hot.anchors.plate.z);
    pourPose(B.water.group, POS.yeast, qI, B.water.anchors.spout, target, Z, -1.85, kMove, kTilt, 6);
    B.water.liquid.setPour(kTilt);
    B.small.group.position.copy(smallPos());
    B.small.liquid.setVolume(BOIL_ML * pourK);
    B.hot.setHeat(win(k, 0.26, 0.32, 0.7, 0.76));
  }

  // the cups: forceps, disks, fizz
  const sig = S.run.join();
  if (changed('run', sig) || force) {
    let held = null;
    CUPS.forEach((C, c) => {
      for (let i = 0; i < PER; i++) {
        const d = B.disks[c * PER + i], where = diskAt(c, i, _b);
        d.setSoak(soakOf(c, i));
        const t = R[c][i], s = S.run[c];
        d.setBubbles(where === 'cup' && t != null ? Math.pow(clamp((s - DROP(i)) / t), 0.8) : 0);
        if (where === 'hand') held = d;
        else { d.group.position.copy(_b); d.group.rotation.set(0, (c * PER + i) * 1.3, 0); }
        const host = where === 'dish' ? 'dish' : where === 'hand' ? 'forceps' : 'cup' + c;
        if (B.where[c * PER + i] !== host) { ix.addGroup(host, d.group); B.where[c * PER + i] = host; }
      }
    });
    // the forceps follow the cup being run
    const c = S.focus, F = B.forceps;
    const at = c >= 0 ? forcepsAt(c, _t) : null;
    if (at) {
      _q.copy(Q_REST).slerp(Q_HOLD, at.hold);
      F.group.quaternion.copy(_q);
      F.group.position.copy(_t).sub(F.anchors.tip.clone().applyQuaternion(_q));
      F.setOpen(at.open * 0.7);
      if (held) { held.group.position.copy(_t); held.group.rotation.set(0.15, 0, 0); }
    } else {
      F.group.quaternion.copy(Q_REST);
      F.group.position.copy(POS.forceps);
      F.setOpen(0);
    }
    const run = c >= 0 ? S.run[c] : 0;
    B.timer.draw(c >= 0 ? clockS(c) : 0, c >= 0 && run > DROP(0) && !done(c));
  }
  root.updateMatrixWorld(true);
}

/** Effects posed from S plus the wall clock: fizz in the cups, the boil, the pour stream. */
function tickFx(time) {
  if (!S) return;
  B.cups.forEach((cup, c) => {
    const s = S.run[c];
    let n = 0;
    for (let i = 0; i < PER; i++) if (s >= DROP(i) + 0.3) n++;
    const amount = relRate(c) * n / PER;
    const p = cup.group.position;
    B.fizz[c].set(amount, time, p.x, p.z, cup.base + 0.3, cup.liquid.level > 0.01 ? cup.liquid.surfaceY() - 0.1 : 1);
  });
  const heat = win(S.boil, 0.3, 0.38, 0.64, 0.72), sp = B.small.group.position;
  const sy = B.small.liquid.level > 0.01 ? B.small.liquid.surfaceY() : sp.y + 0.5;
  B.boilFizz.set(heat, time, sp.x, sp.z, sp.y + 0.3, sy - 0.05);
  B.steam.set(heat, time, sp.x, sy, sp.z);
  const kTilt = win(S.boil, 0.06, 0.1, 0.18, 0.22);
  if (kTilt > 0.5) B.pourStream.set(B.water.group.localToWorld(B.water.anchors.spout.clone()), sy, 0.9);
  else B.pourStream.hide();
}

// =========================================================================
// The data panel: times, rates, the graph and the question
// =========================================================================
const meanOf = (c) => {
  const r = [0, 1, 2].map((i) => result(c, i));
  if (r.some((v) => v == null)) return null;
  if (r.every((v) => v === Infinity)) return Infinity;
  const fin = r.filter((v) => v !== Infinity);
  return fin.length === PER ? fin.reduce((a, b) => a + b, 0) / PER : Infinity;
};
const rateOf = (c) => { const m = meanOf(c); return m == null ? null : m === Infinity ? 0 : 1 / m; };
const LO = 1, HI = 0;       // CONC indices of the question's pair: 1.5% and 3%
const rateFmt = (r) => r.toFixed(3);

function buildPanel() {
  const P = T.panel;
  $('#catPanel').innerHTML = `
    <div class="panel-head"><span class="panel-title"><i class="ph ph-timer"></i>${P.title}</span><span class="clock" id="catClock"></span></div>
    <table class="cat-table">
      <thead><tr><th>${P.conc}</th>${[1, 2, 3].map((n) => `<th>${fmt(P.t, { n })}</th>`).join('')}<th>${P.mean}</th><th>${P.rate}</th></tr></thead>
      <tbody>${CUPS.map((C, c) => `
        <tr data-c="${c}"><td><b>${pct(C.conc)}</b>${C.boiled ? `<small>${P.boiled}</small>` : ''}</td>
        ${[0, 1, 2].map((i) => `<td data-i="${i}"></td>`).join('')}<td data-k="mean"></td><td data-k="rate"></td></tr>`).join('')}
      </tbody>
    </table>
    <svg class="cat-graph" id="catGraph" viewBox="0 0 300 168" aria-hidden="true"></svg>
    <div class="cat-ask" id="catAsk" hidden>
      <p>${fmt(P.ask, { lo: pct(CONC[LO]), hi: pct(CONC[HI]) })}</p>
      <div class="cat-answers">${Object.entries(P.answers).map(([k, a]) => `<button type="button" data-a="${k}">${a.text}</button>`).join('')}</div>
      <p class="cat-verdict" id="catVerdict"></p>
    </div>
    <p class="cat-note">${fmt(P.note, { max: MAX_S })}</p>`;
  $('#catPanel').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-a]');
    if (!b || !canAnswer()) return;
    ANSWER.pick = b.dataset.a;
    panelKey = '';
    if (T.panel.answers[ANSWER.pick].right && lesson.step === READ) lesson.jumpTo(READ + 1);
  });
}
const canAnswer = () => lesson && lesson.mode !== 'watch' && lesson.step === READ;

/** The graph: mean rate against % H₂O₂, the boiled-yeast point hollow. Axes scale to the data. */
function drawGraph() {
  const W = 300, H = 168, L = 44, Rr = 12, Tp = 10, Bt = 34;
  const pts = CONC.map((x, c) => ({ x, r: rateOf(c) })).filter((p) => p.r != null).sort((a, b) => a.x - b.x);
  const rb = rateOf(BOILED);
  const yMax = Math.max(0.05, ...R.flat().filter((t) => t != null).map((t) => 1 / t)) * 1.1;
  const sx = (x) => L + (x / 3) * (W - L - Rr), sy = (r) => H - Bt - (r / yMax) * (H - Bt - Tp);
  const ticksY = [0, yMax / 2, yMax].map((v) => `<line x1="${L}" x2="${W - Rr}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/><text x="${L - 6}" y="${sy(v) + 4}" class="tick" text-anchor="end">${v.toFixed(2)}</text>`).join('');
  const ticksX = [0, 0.75, 1.5, 3].map((v) => `<text x="${sx(v)}" y="${H - Bt + 15}" class="tick" text-anchor="middle">${v}</text>`).join('');
  const line = pts.length > 1 ? `<polyline class="line" points="${pts.map((p) => `${sx(p.x)},${sy(p.r)}`).join(' ')}"/>` : '';
  const dots = pts.map((p) => `<circle class="dot" cx="${sx(p.x)}" cy="${sy(p.r)}" r="4.5"/>`).join('');
  const boiled = rb != null ? `<circle class="dot boiled" cx="${sx(3)}" cy="${sy(rb)}" r="4.5"/>` : '';
  $('#catGraph').innerHTML = `${ticksY}${ticksX}
    <line x1="${L}" x2="${L}" y1="${Tp}" y2="${H - Bt}" class="axis"/><line x1="${L}" x2="${W - Rr}" y1="${H - Bt}" y2="${H - Bt}" class="axis"/>
    <text x="${(L + W - Rr) / 2}" y="${H - 4}" class="label" text-anchor="middle">${T.panel.graph.x}</text>
    <text x="12" y="${(Tp + H - Bt) / 2}" class="label" text-anchor="middle" transform="rotate(-90 12 ${(Tp + H - Bt) / 2})">${T.panel.graph.y}</text>
    ${line}${dots}${boiled}`;
}

let panelKey = '';
function renderPanel() {
  if (!S) return;
  const res = CUPS.map((C, c) => [0, 1, 2].map((i) => result(c, i)));
  const c = S.focus;
  const clock = c >= 0 && S.run[c] > DROP(0) ? `${Math.floor(clockS(c))} s` : '';
  const key = JSON.stringify([res, ANSWER.pick, canAnswer(), lesson.step, clock]);
  if (key === panelKey) return;
  panelKey = key;
  $('#catClock').textContent = clock;
  const cell = (v) => (v == null ? '<span class="dash">–</span>' : v === Infinity ? fmt(T.panel.never, { max: MAX_S }) : v.toFixed(1));
  CUPS.forEach((C, ci) => {
    const row = $(`#catPanel tr[data-c="${ci}"]`);
    res[ci].forEach((v, i) => { row.querySelector(`[data-i="${i}"]`).innerHTML = cell(v); });
    const m = meanOf(ci), r = rateOf(ci);
    row.querySelector('[data-k="mean"]').innerHTML = cell(m);
    row.querySelector('[data-k="rate"]').innerHTML = r == null ? '<span class="dash">–</span>' : rateFmt(r);
    row.classList.toggle('live', ci === c && !done(ci) && S.run[ci] > 0);
  });
  drawGraph();
  const ask = $('#catAsk');
  ask.hidden = lesson.step < READ;
  $('#catPanel').classList.toggle('asking', canAnswer());
  ask.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', ANSWER.pick === b.dataset.a); b.disabled = !canAnswer(); });
  const v = $('#catVerdict');
  const a = rateOf(LO), b = rateOf(HI);
  if (ANSWER.pick && a != null && b != null) {
    const right = T.panel.answers[ANSWER.pick].right;
    v.innerHTML = right ? fmt(T.panel.right, { pct: Math.round((b / a - 1) * 100) }) : fmt(T.panel.wrong, { a: rateFmt(a), b: rateFmt(b) });
    v.className = 'cat-verdict ' + (right ? 'ok' : 'no');
  } else v.innerHTML = '';
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
const nDone = (list) => list.filter((c) => done(c)).length;
const TRIALS = CONC.map((x, c) => c);

/** Run cup c: one anim over real time, mapped to simulated seconds. */
function runCup(key) {
  const c = Number(key.slice(3));
  if (S.run[c] > 0) return null;
  S.focus = c;
  const D = realDur(c);
  return anim(D, (e, k) => { S.run[c] = k >= 1 ? END(c) : simAt(c, k * D); }, Ease.linear);
}
/** Watch's caption for the cup being run. */
function runCaption(id) {
  const c = S.focus;
  if (c < 0) return T.steps[id].title;
  const s = S.run[c], cc = C[id], conc = pct(CUPS[c].conc);
  if (s < PREP_S) return (s % HAND) / HAND < 0.5 ? cc.dip : fmt(cc.drop, { conc });
  if (relRate(c) === 0) return cc.none || cc.wait;
  return R[c].some((t, i) => t != null && s >= DROP(i) + t) ? cc.float : cc.wait;
}

const STEPS = [
  { id: 'yeast', ...card('yeast', { g: YEAST_G, mL: WATER_ML }), targets: ['jar'], view: 'prep',
    caption: () => (S.yeast < 0.5 ? C.yeast.scoop : C.yeast.stir),
    run: async () => {
      const k = anim(5.2, (e, kk) => { S.yeast = kk; }, Ease.linear);
      if (!isInstant()) {
        await anim(5.2 * 0.38, () => {});
        powderFall(mat, root, V3(POS.yeast.x - 0.6, BK.h + 3, POS.yeast.z), B.water.liquid.surfaceY(), { material: yeastPowder });
      }
      return k;
    } },
  { id: 'boil', ...card('boil', { mL: BOIL_ML, min: BOIL_MIN }), targets: ['hotplate'], view: 'boil',
    clock: () => (S.boil > 0.26 && S.boil < 0.76 ? fmt(T.steps.boil.clock, { min: Math.min(BOIL_MIN, Math.floor(ph(S.boil, 0.3, 0.72, Ease.linear) * BOIL_MIN)) }) : null),
    caption: () => (S.boil < 0.26 ? C.boil.pour : S.boil < 0.74 ? C.boil.boil : C.boil.cool),
    run: () => anim(7.5, (e, k) => { S.boil = k; }, Ease.linear) },
  { id: 'disks', ...card('disks'), view: 'cups',
    hint: () => (nDone(TRIALS) === 0 ? T.steps.disks.hint : fmt(T.steps.disks.hintMore, { n: nDone(TRIALS), total: TRIALS.length })),
    targets: TRIALS.map((c) => 'cup' + c),
    activeTargets: () => TRIALS.filter((c) => S.run[c] <= 0).map((c) => 'cup' + c),
    run: runCup,
    isDone: () => nDone(TRIALS) === TRIALS.length,
    progress: () => nDone(TRIALS) / TRIALS.length,
    clock: () => (S.focus >= 0 && S.focus !== BOILED && S.run[S.focus] > DROP(0) ? fmt(T.steps.disks.clock, { s: Math.floor(clockS(S.focus)) }) : null),
    caption: () => runCaption('disks') },
  { id: 'boiled', ...card('boiled', { conc: pct(CUPS[BOILED].conc), max: MAX_S }), view: 'boiled', targets: ['cup' + BOILED],
    run: runCup,
    clock: () => (S.focus === BOILED && S.run[BOILED] > DROP(0) ? fmt(T.steps.boiled.clock, { s: Math.floor(clockS(BOILED)) }) : null),
    caption: () => runCaption('boiled') },
  /* Answering happens in the panel, off the bench: the step reads ANSWER, so a rebuild leaves it
     alone. Watch mode stops at the bench; the answer is the student's. */
  { id: 'read', ...card('read', { lo: pct(CONC[LO]), hi: pct(CONC[HI]) }), targets: [], view: 'graph', caption: T.steps.read.caption,
    isDone: () => lesson.mode === 'watch' || (ANSWER.pick && T.panel.answers[ANSWER.pick].right),
    progress: () => (ANSWER.pick ? 1 : 0) },
];
const READ = STEPS.findIndex((s) => s.id === 'read');
const PHASES = [
  { ...T.phases.enzyme, icon: 'ph-flask', steps: ['yeast', 'boil'] },
  { ...T.phases.trials, icon: 'ph-timer', steps: ['disks'] },
  { ...T.phases.control, icon: 'ph-fire', steps: ['boiled'] },
  { ...T.phases.results, icon: 'ph-chart-line-up', steps: ['read'] },
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
    if (!step) { stage.focus('done', 1.6); toast(T.complete.toast, { icon: 'ph-bubble' }); return; }
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
  rig: { t: V3(4, 5, 1), p: V3(4, 42, 66) },
  special: ['boil', 'done'],
});

function restart() {
  newSession();
  ANSWER.pick = null;
  firstEnter = false;
  lesson.restart();
}

buildPanel();
stage.onFrame((dt, now) => {
  lesson.update(dt);
  follow.update(dt);
  zoom.update(dt);
  if (S) { pose(); tickFx(now / 1000); renderPanel(); }
  ix.update();
});

const intro = createIntro(stage);
bindChrome({ stage, restart, expose: { get S() { return S; }, get B() { return B; }, get R() { return R; }, zoomState, ANSWER, lesson, ix, stage, follow, zoom, STEPS, intro } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
