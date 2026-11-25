/* Egg osmosis: dissolve three eggs' shells in vinegar, weigh them, soak them a day in distilled
 * water, 0.9% salt water and corn syrup, and weigh them again.
 *
 * Bench state is S, recreated by rebuild(): per-egg click progress E[i] (0..1 each, animated by
 * anim()), the vinegar pour S.vin (0..3, one beaker per unit), and the two soaks in hours,
 * S.hours (vinegar, 0..48) and S.osmo (liquids, 0..24). pose() places everything from S alone,
 * so replays and scrubbing agree. Each egg's masses are drawn once per session (M); the
 * balance and the table read them through massAt(), never a typed number. */
import * as THREE from 'three';
import {
  V3, Q, clamp, lerp, smooth, Ease, anim, newSession, reseed, gauss, seeded, disposeTree, toast, isInstant, debugSpeed,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, createIntro, chromeInsets, bindChrome, PHONE,
  makeBench, makePaperTowel, makeBeaker, makeReagentBottle, makeStream, makeEgg, makeBalance, pourPose, cues, toLinear, T, fmt,
} from '../lab.js';

const $ = (s) => document.querySelector(s);
const tx = (s, vars) => (typeof s === 'string' ? fmt(s, vars) : s && { ...s, text: fmt(s.text, vars), note: s.note && fmt(s.note, vars) });
const LETTER = ['A', 'B', 'C'];
const ph = (t, a, b, ease = Ease.inOut) => ease(clamp((t - a) / (b - a)));
const win = (t, a, b, c, d) => ph(t, a, b) * (1 - ph(t, c, d));

// =========================================================================
// The science: masses and rates
// =========================================================================
/* One row per liquid, egg A, B, C. `final` is the naked egg's mass after 24 h as a fraction of
 * its mass going in; classroom runs give roughly +10-15% in distilled water, a few percent
 * either way in near-isotonic saline, and -35-45% in corn syrup. Light corn syrup (1.37 g/mL)
 * is denser than an egg (about 1.08 g/mL), so that egg floats; the others sink. */
const LIQ = [
  { final: [1.12, 0.025], float: false, color: 0xcfe6fa, opacity: 0.2, tape: '#2563eb' },
  { final: [0.985, 0.006], float: false, color: 0xcdeee2, opacity: 0.22, tape: '#0d9488' },
  { final: [0.6, 0.03], float: true, color: 0xf0bf45, opacity: 0.55, tape: '#d97706' },
];
const VINEGAR = { color: 0xe6cf7e, opacity: 0.22 };
const SHELL_FRAC = 0.105;          // the shell is about a tenth of an egg's mass
const SOAK_H = 48, OSMO_H = 24;
const FILL_ML = 250;
const EGG_DENSITY = 1.08;          // g/mL, for the liquid an egg displaces

/** The masses one session's eggs follow. reseed() keeps them the same across rebuilds. */
function drawEggs() {
  reseed('eggs');
  return LIQ.map((L) => {
    const m0 = clamp(57.5 + 3.2 * gauss(), 51, 65);
    const shell = SHELL_FRAC * m0, body0 = m0 - shell;
    const g = () => clamp(gauss(), -1.8, 1.8);                // keeps every egg on its liquid's side of the ±5% call
    const naked = body0 * (1.3 + 0.035 * g());               // water taken up in the vinegar
    const final = naked * (L.final[0] + L.final[1] * g());
    return { m0, shell, body0, naked, final, pace: 1 + 0.05 * gauss() };
  });
}

// the acid eats the shell fastest at first, while there is most of it to attack
const dissolved = (i, h) => 1 - Math.pow(1 - clamp((h * M[i].pace) / 40), 1.6);
// water creeps in once the shell is thin enough, and is done by the end of the soak
const gained = (h) => (1 - Math.exp(-Math.max(0, h - 3) / 12)) / (1 - Math.exp(-(SOAK_H - 3) / 12));
// osmosis slows as the inside and outside get closer: an exponential approach
const OSMO_TAU = 7;
const osmoQ = (o) => (1 - Math.exp(-o / OSMO_TAU)) / (1 - Math.exp(-OSMO_H / OSMO_TAU));

/** Egg i right now: mass (g), the shell-less body's mass, shell dissolved 0..1, osmosis 0..1. */
function massAt(i) {
  const m = M[i], d = dissolved(i, S.hours), q = osmoQ(S.osmo);
  const body = m.body0 + (m.naked - m.body0) * gained(S.hours) + (m.final - m.naked) * q;
  return { mass: body + m.shell * (1 - d), body, d, q };
}

// =========================================================================
// Layout and views
// =========================================================================
const BX = [-4, 8, 20], BZ = 4, BOTTLE_Z = -15;
const BK = { r: 4.3, h: 12, t: 0.14 };   // 500 mL Griffin, about 8.6 × 12 cm
const BK_LABEL = 0.8;              // the tape label's angle round the wall; each beaker turns it to face front
const POS = {
  towel: V3(-36, 0, 5), balance: V3(-20, 0, 2), vinegar: V3(-12, 0, -15), waste: V3(33, 0, 1),
};
const TOWEL_X = [-42.5, -36, -29.5];
const YAW = [0.38, -0.22, 0.16];
const CLEAR = 17;                  // carry height over a beaker rim

const VIEWS = {
  overview: { t: V3(-6, 4, -2), p: V3(-6, 56, 74) },
  weigh: { t: V3(-22, 4, 2), p: V3(-19, 34, 46) },
  vinegar: { t: V3(4, 6, -4), p: V3(4, 40, 52) },
  soak: { t: V3(8, 4, 3), p: V3(8, 30, 36) },
  drain: { t: V3(12, 6, 0), p: V3(12, 42, 62) },
  predict: { t: V3(8, 4, 2), p: V3(8, 34, 44) },
  fill: { t: V3(8, 6, -4), p: V3(8, 40, 50) },
  osmosis: { t: V3(8, 4, 3), p: V3(8, 28, 33) },
  results: { t: V3(-24, 4, 3), p: V3(-22, 34, 48) },
  towel: { t: V3(-36, 2.5, 5), p: V3(-36, 18, 24) },
};

// =========================================================================
// Stage
// =========================================================================
const PANEL_W = 360;
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  controls: { minDistance: 8, maxDistance: 160 },
  insets: (w, h) => {
    const r = chromeInsets(w, h, { bottom: w > PHONE ? [] : ['.egg-panel'] });
    if (w > PHONE) r.right = Math.min(PANEL_W + 24, w * 0.3);
    return r;
  },
});
const mat = createMaterials(stage);

let S = null, B = null, M = null, root = null;
let lesson, ix;
const PRED = [null, null, null];   // the student's predictions live in the panel: a rebuild keeps them

function place(prop, pos, yaw = 0) {
  prop.group.position.copy(pos);
  prop.group.rotation.y = yaw;
  root.add(prop.group);
  return prop;
}

function rebuild() {
  if (root) { stage.scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group();
  stage.scene.add(root);
  M = drawEggs();
  S = { vin: 0, hours: 0, osmo: 0, E: LIQ.map(() => ({ w0: 0, w1: 0, fill: 0, w2: 0 })), key: {} };

  place(makeBench(mat), V3());
  const towel = place(makePaperTowel(mat, { w: 21, d: 12 }), POS.towel);
  const balance = place(makeBalance(mat), POS.balance);
  const beakers = LIQ.map((L, i) => place(makeBeaker(mat, {
    r: BK.r, h: BK.h, level: 0, cap: 500, label: fmt(T.props.beaker, { egg: LETTER[i] }), sub: T.liquids[i].name, color: L.tape, liquidColor: VINEGAR.color, labelAt: BK_LABEL, labelTop: true,
  }), V3(BX[i], 0, BZ), -BK_LABEL));
  const waste = place(makeBeaker(mat, { r: 5.3, h: 14.5, level: 0, cap: 1000, label: T.props.waste, color: '#64748b', liquidColor: VINEGAR.color, labelAt: 0 }), POS.waste);
  const vinegar = place(makeReagentBottle(mat, { ...T.props.vinegar, color: '#b38b1d', liquidColor: VINEGAR.color, scale: 1.6 }), POS.vinegar);
  const bottles = LIQ.map((L, i) => place(makeReagentBottle(mat, { ...T.props.bottles[i], color: L.tape, liquidColor: L.color, scale: 1.25 }), V3(BX[i], 0, BOTTLE_Z)));
  bottles[2].liquid.mesh.material.opacity = LIQ[2].opacity;
  const eggs = LIQ.map(() => { const e = makeEgg(mat); root.add(e.group); return e; });
  const streams = { vinegar: makeStream(mat, root, { color: VINEGAR.color }), waste: makeStream(mat, root, { color: VINEGAR.color }),
    bottles: LIQ.map((L) => makeStream(mat, root, { color: L.color })) };
  B = { towel, balance, beakers, waste, vinegar, bottles, eggs, streams, fx: eggs.map((e, i) => makeEggFx(i)), where: [] };

  eggs.forEach((e, i) => ix.register('egg' + i, e.group, { ...objText('egg', i), anchor: V3(0, 2.4, 0) }));
  beakers.forEach((b, i) => ix.register('beaker' + i, b.group, { ...objText('beaker', i), anchor: V3(0, BK.h + 0.4, 0) }));
  bottles.forEach((b, i) => ix.register('bottle' + i, b.group, { ...T.objects['bottle' + i], anchor: V3(0, 13, 0) }));
  ix.register('vinegar', vinegar.group, { ...T.objects.vinegar, anchor: V3(0, 16.5, 0) });
  ix.register('balance', balance.group, { ...T.objects.balance });
  ix.register('waste', waste.group, { ...T.objects.waste });
  ix.register('towel', towel.group, { ...T.objects.towel });
  pose(true);
}
const objText = (k, i) => {
  const o = T.objects[k], v = { egg: LETTER[i], liquid: T.liquids[i].name };
  return { name: fmt(o.name, v), short: fmt(o.short, v), desc: fmt(o.desc, v) };
};

// =========================================================================
// Effects that move every frame: CO2 off the shell, water across the membrane
// =========================================================================
const FX_GEO = new THREE.SphereGeometry(1, 10, 8); FX_GEO.userData.shared = true;
const N_BUB = 70, N_H2O = 60;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const K = 4.9;   // makeEgg's shape unit to cm

function makeEggFx(i) {
  const R = seeded(31 + i);
  const bubbles = new THREE.InstancedMesh(FX_GEO, mat.make.physical({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 1, depthWrite: false }), N_BUB);
  const water = new THREE.InstancedMesh(FX_GEO, mat.make.standard({ color: toLinear('#3b82f6'), roughness: 0.3, emissive: toLinear('#1d4ed8'), emissiveIntensity: 0.35 }), N_H2O);
  [bubbles, water].forEach((m) => { m.frustumCulled = false; m.renderOrder = 2; m.userData.noSketch = true; m.visible = false; root.add(m); });
  const dir = () => { const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [u, s * Math.cos(a), s * Math.sin(a)]; };
  const bseed = Array.from({ length: N_BUB }, () => {
    let [dx, dy, dz] = dir();
    if (dx < -0.25) dx = -dx;                         // favour the top and sides of the egg
    return { dx, dy, dz, r: R(), period: 1.4 + R() * 1.6, phase: R(), size: 0.06 + Math.pow(R(), 2) * 0.12 };
  });
  const wseed = Array.from({ length: N_H2O }, () => { const [dx, dy, dz] = dir(); return { dx, dy, dz, r: R(), side: R(), phase: R(), speed: 0.75 + R() * 0.5 }; });
  return { bubbles, water, bseed, wseed };
}

/** A point on egg i's surface for shape direction (dx up, dy along the long axis, dz), pushed
 *  `out` cm outward, in world space. */
function surfacePoint(egg, s, dx, dy, dz, out, target) {
  const a = 0.43 * K * s, b = 0.58 * K * s;
  target.set(-dy * b, dx * a, dz * a);
  if (out) target.addScaledVector(_w.set(-dy, dx, dz).normalize(), out);
  return egg.group.localToWorld(target);
}

function tickFx(time) {
  if (!S) return;
  LIQ.forEach((L, i) => {
    const fx = B.fx[i], egg = B.eggs[i], st = massAt(i), beaker = B.beakers[i];
    const inBeaker = B.where[i] === 'beaker';
    const surf = beaker.liquid.level > 0.01 ? beaker.liquid.surfaceY() : -1;
    const rIn = BK.r - BK.t - 0.15, cx = beaker.group.position.x, cz = beaker.group.position.z;
    const s = Math.cbrt(st.body / M[i].body0);
    egg.group.updateMatrixWorld(true);

    // CO2: strongest while there is most shell to attack, only while vinegar covers it
    const inVinegar = inBeaker && S.E[i].fill === 0 && S.E[i].w1 === 0 && surf > 0;
    const x = clamp((S.hours * M[i].pace) / 40);
    const inten = inVinegar ? lerp(0.35, 1, ph(S.hours, 0, 1.5)) * Math.pow(1 - x, 0.6) : 0;
    fx.bubbles.visible = inten > 0.01;
    if (fx.bubbles.visible) {
      const sc = Math.max(1, s) * 1.03;
      fx.bseed.forEach((b, k) => {
        let size = 0;
        if (b.r < inten) {
          const f = (time / b.period + b.phase) % 1;
          surfacePoint(egg, sc, b.dx, b.dy, b.dz, 0, _v);
          if (_v.y < surf - 0.1) {
            if (f < 0.32) size = b.size * Math.sqrt(f / 0.32);
            else {
              const g = (f - 0.32) / 0.68, y0 = _v.y;
              _v.y = y0 + (surf - 0.08 - y0) * Math.pow(g, 1.6);
              _v.x += Math.sin(g * 9 + b.phase * 20) * 0.12 * g;
              _v.z += Math.cos(g * 7 + b.phase * 13) * 0.1 * g;
              size = b.size * (1 + 0.35 * g) * (g > 0.96 ? (1 - g) / 0.04 : 1);
            }
            const dx = _v.x - cx, dz = _v.z - cz, rr = Math.hypot(dx, dz);
            if (rr > rIn) { _v.x = cx + dx * rIn / rr; _v.z = cz + dz * rIn / rr; }
          }
        }
        fx.bubbles.setMatrixAt(k, _m4.compose(_v, _q, _s.setScalar(Math.max(size, 1e-5))));
      });
      fx.bubbles.instanceMatrix.needsUpdate = true;
    }

    // water crossing both ways; the bias is the net flow, and it fades as the egg nears balance
    const osmo = inBeaker && S.E[i].fill >= 1 && S.osmo > 0 && S.osmo < OSMO_H && surf > 0;
    fx.water.visible = osmo;
    if (osmo) {
      const a = Math.exp(-S.osmo / OSMO_TAU);
      const net = Math.sign(M[i].final - M[i].naked) * clamp(Math.abs(M[i].final / M[i].naked - 1) / 0.1);
      const pIn = 0.5 + 0.45 * net * a;
      const shown = 0.3 + 0.7 * a;
      fx.wseed.forEach((p, k) => {
        let size = 0;
        if (p.r < shown) {
          const f = (time * 0.42 * p.speed + p.phase) % 1;
          const inward = p.side < pIn;
          surfacePoint(egg, s, p.dx, p.dy, p.dz, (inward ? 1 - f : f) * 2.4, _v);
          const inside = _v.y < surf - 0.15 && _v.y > BK.t + 0.15 && Math.hypot(_v.x - cx, _v.z - cz) < rIn;
          if (inside) size = 0.14 * Math.pow(Math.sin(Math.PI * f), 0.6);
        }
        fx.water.setMatrixAt(k, _m4.compose(_v, _q, _s.setScalar(Math.max(size, 1e-5))));
      });
      fx.water.instanceMatrix.needsUpdate = true;
    }
  });
}

// =========================================================================
// pose(): the bench from S
// =========================================================================
const X = V3(1, 0, 0), Z = V3(0, 0, 1), qI = new THREE.Quaternion();
const qBK = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), -BK_LABEL), zBK = Z.clone().applyQuaternion(qBK);
const _p = V3();

/** Lift straight up to `top`, carry level, lower: a pure function of k for replays. */
function liftPath(a, b, k, top, out) {
  const h = smooth(clamp((k - 0.25) / 0.5));
  out.set(lerp(a.x, b.x, h), 0, lerp(a.z, b.z, h));
  out.y = k < 0.5 ? lerp(a.y, top, smooth(clamp(k / 0.3))) : lerp(top, b.y, smooth(clamp((k - 0.7) / 0.3)));
  return out;
}
const vinFill = (i) => ph(S.vin, i + 0.3, i + 0.7, Ease.linear);

// The vinegar bottle stays in hand for all three pours. Upright between them, its spout rides
// VIN_LIFT above and behind the pour point, so the body clears every rim.
const VIN_GO = 0.15, VIN_HOP = 0.18, VIN_LIFT = V3(0, 8, -6);
const vinTarget = (j) => V3(BX[j] - 0.6, BK.h + 3.2, BZ - 2.4);
const vinCarry = (j) => vinTarget(j).add(VIN_LIFT);
function vinHop(j, k) {
  const spout = vinCarry(j).lerp(vinCarry(j + 1), smooth(k));
  pourPose(B.vinegar.group, POS.vinegar, qI, B.vinegar.anchors.spout, spout, X, 0, 1, 0);
}
const drained = (i) => ph(S.E[i].w1, 0.38, 0.56, Ease.linear);
const solFill = (i) => ph(S.E[i].fill, 0.3, 0.7, Ease.linear);

/** Where egg i is: 'towel', 'path' (in a hand), 'pan' (on the balance) or 'beaker'. */
function eggStage(i) {
  const e = S.E[i];
  const seg = (k, a, b) => (k < a ? 'path' : k < b ? 'pan' : k < 1 ? 'path' : null);
  if (e.w2 > 0) return seg(e.w2, 0.3, 0.6) || 'towel';
  if (e.w1 > 0 && e.w1 < 1) return seg(e.w1, 0.3, 0.7);
  if (e.w0 > 0 && e.w0 < 1) return seg(e.w0, 0.35, 0.6);
  return e.w0 >= 1 ? 'beaker' : 'towel';
}

function pose(force = false) {
  const changed = (k, v) => { if (!force && S.key[k] === v) return false; S.key[k] = v; return true; };

  // bottles and beakers move only for their own pours, so the hover lift is left alone otherwise
  if (changed('vin', S.vin)) {
    const v = S.vin, home = v <= 0 || v >= 3;
    let tilt = 0;
    if (home) pourPose(B.vinegar.group, POS.vinegar, qI, B.vinegar.anchors.spout, POS.vinegar, X, 0, 0, 0);
    else if (v < VIN_GO || v > 3 - VIN_GO) {
      // off the shelf to the first beaker, back from the last, passing behind the beakers
      const k = smooth(v < VIN_GO ? v / VIN_GO : (3 - v) / VIN_GO);
      pourPose(B.vinegar.group, POS.vinegar, qI, B.vinegar.anchors.spout, vinCarry(v < 1 ? 0 : 2), X, 0, k, 0, 3);
    } else {
      const j = Math.min(2, Math.floor(v)), u = v - j;
      if (u < VIN_HOP && j > 0) vinHop(j - 1, (u + VIN_HOP) / (2 * VIN_HOP));
      else if (u > 1 - VIN_HOP && j < 2) vinHop(j, (u - 1 + VIN_HOP) / (2 * VIN_HOP));
      else {
        // tilt in place: the spout comes down from behind the rim as the bottle tips
        tilt = win(u, VIN_GO, 0.3, 0.7, 1 - VIN_HOP);
        const spout = vinCarry(j).lerp(vinTarget(j), tilt);
        pourPose(B.vinegar.group, POS.vinegar, qI, B.vinegar.anchors.spout, spout, X, 1.95, 1, tilt);
      }
    }
    B.vinegar.cap.visible = home;
    B.vinegar.liquid.setFraction(0.85 - 0.2 * (vinFill(0) + vinFill(1) + vinFill(2))).setPour(tilt);
  }
  LIQ.forEach((L, i) => {
    const e = S.E[i];
    if (changed('bk' + i, e.w1)) {
      const kMove = win(e.w1, 0.2, 0.36, 0.6, 0.72), kTilt = win(e.w1, 0.36, 0.42, 0.54, 0.6);
      const target = V3(POS.waste.x - 3.6, B.waste.h + 9, POS.waste.z);   // high enough that the upright beaker clears the rim
      pourPose(B.beakers[i].group, V3(BX[i], 0, BZ), qBK, B.beakers[i].anchors.spout, target, zBK, -1.9, kMove, kTilt, 13);
      B.beakers[i].liquid.setPour(kTilt);
    }
    if (changed('bt' + i, e.fill)) {
      const u = e.fill, kMove = win(u, 0, 0.22, 0.78, 1), kTilt = win(u, 0.22, 0.36, 0.64, 0.78);
      const target = V3(BX[i] + 0.4, BK.h + 3.4, BZ - 2.4);
      pourPose(B.bottles[i].group, V3(BX[i], 0, BOTTLE_Z), qI, B.bottles[i].anchors.spout, target, X, 1.95, kMove, kTilt, 4);
      B.bottles[i].cap.visible = kMove < 0.02;
      B.bottles[i].liquid.setFraction(0.85 - 0.45 * solFill(i)).setPour(kTilt);
    }
  });

  // eggs and liquids follow the whole state
  const sig = [S.vin, S.hours, S.osmo, ...S.E.flatMap((e) => [e.w0, e.w1, e.fill, e.w2])].join();
  if (!changed('all', sig)) return;
  let reading = null;
  LIQ.forEach((L, i) => {
    const egg = B.eggs[i], e = S.E[i], st = massAt(i), beaker = B.beakers[i], liq = beaker.liquid;
    const s = Math.cbrt(st.body / M[i].body0);
    egg.setShell(st.d).setSize(s);
    const swell = 0.25 * gained(S.hours) + (i === 0 ? 0.75 * st.q : 0);
    const shrivel = i === 2 ? st.q : i === 1 ? 0.1 * st.q : 0;
    egg.setShape({ swell, wrinkle: 0.6 * shrivel, sag: shrivel });

    // the liquid: vinegar until it is poured off, then this egg's own liquid
    const sol = solFill(i), vin = vinFill(i) * (1 - drained(i));
    const isSol = sol > 0, V = isSol ? sol * FILL_ML : vin * FILL_ML;
    const look = isSol ? L : VINEGAR;
    liq.setColor(look.color);
    [liq.mesh.material, liq.cap && liq.cap.material].forEach((m) => { if (m) m.opacity = look.opacity; });

    // where the egg is, and the liquid it pushes aside while it sits in the beaker
    const where = eggStage(i), bottom = egg.bottom(), D = 2 * bottom;
    const home = V3(TOWEL_X[i], 0.07 + bottom, POS.towel.z);
    const pan = V3(POS.balance.x, B.balance.anchors.pan.y + bottom, POS.balance.z + B.balance.anchors.pan.z);
    const bk = beaker.group.position;
    const restIn = V3(bk.x, bk.y + BK.t + bottom, bk.z);
    let inY = restIn.y, displaced = 0;
    if (where === 'beaker') {
      const vol = st.mass / EGG_DENSITY;
      const level0 = liq.levelAt(V);
      const floatsHere = L.float && isSol;
      const sub = floatsHere ? Math.min(1, EGG_DENSITY / 1.37 + 0.0) : 1;
      displaced = vol * clamp(level0 / D) * sub;
      liq.setVolume(V + displaced);
      if (floatsHere) inY = Math.max(restIn.y, liq.yAt(liq.level) - (sub - 0.5) * D);
    } else liq.setVolume(V);
    const inBk = V3(restIn.x, inY, restIn.z);

    const P = _p;
    let yaw = YAW[i];
    if (where === 'towel' && e.w2 === 0) { P.copy(home); yaw = Math.PI / 2; }
    else if (where === 'beaker') P.copy(inBk);
    else if (e.w2 > 0) {
      const k = e.w2;
      if (k < 0.3) liftPath(inBk, pan, k / 0.3, CLEAR, P);
      else if (k < 0.6) P.copy(pan);
      else liftPath(pan, home, (k - 0.6) / 0.4, CLEAR - 4, P);
      yaw = k < 0.6 ? lerp(YAW[i], 0, ph(k, 0, 0.3)) : lerp(0, Math.PI / 2, ph(k, 0.6, 1));
    } else if (e.w1 > 0) {
      const k = e.w1;
      if (k < 0.3) liftPath(restIn, pan, k / 0.3, CLEAR, P);
      else if (k < 0.7) P.copy(pan);
      else liftPath(pan, restIn, (k - 0.7) / 0.3, CLEAR, P);
      yaw = lerp(YAW[i], 0, win(k, 0, 0.3, 0.7, 1));
    } else {
      const k = e.w0;
      if (k < 0.35) liftPath(home, pan, k / 0.35, pan.y + 5, P);
      else if (k < 0.6) P.copy(pan);
      else liftPath(pan, restIn, (k - 0.6) / 0.4, CLEAR, P);
      yaw = k < 0.6 ? lerp(Math.PI / 2, 0, ph(k, 0, 0.35)) : lerp(0, YAW[i], ph(k, 0.6, 1));
    }
    egg.group.position.copy(P);
    egg.group.rotation.set(0, yaw, 0);
    if (where === 'pan') reading = st.mass;

    // what rests in a beaker lifts and clicks with it
    const host = where === 'beaker' ? 'beaker' + i : 'egg' + i;
    if (B.where[i] !== where) {
      if ((where === 'beaker') !== (B.where[i] === 'beaker')) ix.addGroup(host, egg.group);
      B.where[i] = where;
    }
  });
  B.balance.show(reading);

  // the waste beaker collects what was poured off
  const wasteV = LIQ.reduce((a, L, i) => a + vinFill(i) * drained(i) * FILL_ML, 0);
  B.waste.liquid.setVolume(wasteV);
  root.updateMatrixWorld(true);
  tickStreams();
}

/** Pour streams from each spout to the surface below it. */
function tickStreams() {
  const flow = (stream, spoutObj, spoutLocal, on, toY, r = 1) => {
    if (!on) { stream.hide(); return; }
    stream.set(spoutObj.localToWorld(spoutLocal.clone()), toY, r);
  };
  const j = Math.min(2, Math.floor(S.vin)), u = S.vin - j;
  const vb = B.beakers[j];
  flow(B.streams.vinegar, B.vinegar.group, B.vinegar.anchors.spout, S.vin < 3 && u > 0.3 && u < 0.7, vb.liquid.level > 0.01 ? vb.liquid.surfaceY() : BK.t, 1.1);
  const draining = LIQ.findIndex((L, i) => { const d = drained(i); return d > 0 && d < 1; });
  flow(B.streams.waste, draining >= 0 ? B.beakers[draining].group : root, draining >= 0 ? B.beakers[draining].anchors.spout : V3(),
    draining >= 0, B.waste.liquid.level > 0.01 ? B.waste.liquid.surfaceY() : 0.2, 1.2);
  LIQ.forEach((L, i) => {
    const f = solFill(i), b = B.beakers[i];
    flow(B.streams.bottles[i], B.bottles[i].group, B.bottles[i].anchors.spout, f > 0 && f < 1, b.liquid.level > 0.01 ? b.liquid.surfaceY() : BK.t, i === 2 ? 1.5 : 1);
  });
}

// =========================================================================
// The data panel: masses as they are measured, and the predictions
// =========================================================================
const PRED_KEYS = ['swell', 'same', 'shrink'];
const PRED_ICON = { swell: 'ph-arrow-up', same: 'ph-equals', shrink: 'ph-arrow-down' };
const SAME = 0.05;   // within ±5% counts as no change
const outcome = (i) => { const c = M[i].final / M[i].naked - 1; return c > SAME ? 'swell' : c < -SAME ? 'shrink' : 'same'; };

function buildPanel() {
  const P = T.panel;
  $('#eggPanel').innerHTML = `
    <div class="panel-head"><span class="panel-title"><i class="ph ph-scales"></i>${P.title}</span><span class="clock" id="eggClock"></span></div>
    <table class="egg-table">
      <thead><tr><th>${P.egg}</th><th>${P.raw}</th><th>${P.naked}</th><th>${P.final}</th><th>${P.change}</th></tr></thead>
      <tbody>${LIQ.map((L, i) => `
        <tr data-i="${i}">
          <td><span class="swatch" style="background:${L.tape}"></span><b>${LETTER[i]}</b><small>${T.liquids[i].label}</small></td>
          <td data-c="raw"></td><td data-c="naked"></td><td data-c="final"></td>
          <td data-c="change"><div class="pred">${PRED_KEYS.map((k) => `<button type="button" data-p="${k}" title="${P.pred[k]}"><i class="ph-bold ${PRED_ICON[k]}"></i></button>`).join('')}</div><div class="result"></div></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="egg-note">${fmt(P.note, { pct: SAME * 100 })}</p>`;
  $('#eggPanel').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-p]');
    if (!btn || !canPredict()) return;
    PRED[Number(btn.closest('tr').dataset.i)] = btn.dataset.p;
    panelKey = '';
    if (PRED.every(Boolean) && lesson.step === PREDICT) lesson.jumpTo(PREDICT + 1);
  });
}
const canPredict = () => lesson && lesson.mode !== 'watch' && lesson.step === PREDICT;

let panelKey = '';
function renderPanel() {
  if (!S) return;
  const rec = LIQ.map((L, i) => {
    const e = S.E[i];
    return { raw: e.w0 >= 0.45 ? M[i].m0 : null, naked: e.w1 >= 0.45 ? M[i].naked : null, final: e.w2 >= 0.45 ? M[i].final : null };
  });
  const key = JSON.stringify([rec, PRED, canPredict(), lesson.step]);
  if (key === panelKey) return;
  panelKey = key;
  const g = (v) => (v == null ? '<span class="dash">–</span>' : v.toFixed(1));
  $('#eggPanel').classList.toggle('asking', canPredict());
  rec.forEach((r, i) => {
    const row = $(`#eggPanel tr[data-i="${i}"]`);
    ['raw', 'naked', 'final'].forEach((c) => { row.querySelector(`[data-c="${c}"]`).innerHTML = g(r[c]); });
    row.querySelectorAll('.pred button').forEach((b) => {
      b.classList.toggle('on', PRED[i] === b.dataset.p);
      b.disabled = !canPredict();
    });
    const res = row.querySelector('.result'), pred = row.querySelector('.pred');
    pred.hidden = r.final != null;
    res.hidden = r.final == null;
    if (r.final != null) {
      const c = (r.final / r.naked - 1) * 100, out = outcome(i);
      const mark = PRED[i] ? `<i class="ph-bold ${PRED[i] === out ? 'ph-check ok' : 'ph-x no'}" title="${fmt(T.panel.you, { p: T.panel.pred[PRED[i]] })}"></i>` : '';
      res.innerHTML = `<b class="${c > 0 ? 'up' : 'down'}">${c > 0 ? '+' : '−'}${Math.abs(c).toFixed(0)}%</b>${mark}`;
    }
  });
}

// =========================================================================
// Steps
// =========================================================================
const C = Object.fromEntries(Object.entries(T.steps).map(([k, v]) => [k, v.captions]));
const card = (id) => { const { title, short, action, hint, detail, why } = T.steps[id]; return Object.fromEntries(Object.entries({ title, short, action, hint, detail, why }).filter(([, v]) => v !== undefined)); };
const run = (i, field, dur) => anim(dur, (e, k) => { S.E[i][field] = k; }, Ease.linear);
const done = (field) => S.E.filter((e) => e[field] >= 1).length;
const last = { i: 0 };   // the egg the current click is moving, for its captions
const idx = (key) => Number(key.slice(-1));
const hintN = (id, field) => () => (done(field) === 0 ? T.steps[id].hint : fmt(T.steps[id].hintMore, { n: done(field) }));
const todo = (prefix, field) => () => LIQ.map((L, i) => S.E[i][field] < 1 && prefix + i).filter(Boolean);

function multi(id, prefix, field, dur, view) {
  return {
    id, ...card(id), view, hint: hintN(id, field),
    targets: LIQ.map((L, i) => prefix + i),
    activeTargets: todo(prefix, field),
    run: (key) => { last.i = idx(key); return S.E[last.i][field] < 1 ? run(last.i, field, dur) : null; },
    isDone: () => done(field) === 3,
    progress: () => done(field) / 3,
  };
}
const clockText = (h, fmtKey) => fmt(fmtKey, { d: Math.floor(h / 24) + 1, h: Math.round(h) });

const STEPS = [
  { ...multi('weigh0', 'egg', 'w0', 4.2, 'weigh'),
    caption: () => (S.E[last.i].w0 < 0.6 ? C.weigh0.weigh : C.weigh0.place) },
  { id: 'vinegar', ...card('vinegar'), targets: ['vinegar'], view: 'vinegar', caption: T.steps.vinegar.caption,
    run: () => anim(8.4, (e, k) => { S.vin = 3 * k; }, Ease.linear) },
  { id: 'soak', ...card('soak'), hint: fmt(T.steps.soak.hint, { h: SOAK_H }), targets: [], view: 'soak',
    clock: () => clockText(S.hours, T.steps.soak.clock),
    caption: cues(() => S.hours, [[0, C.soak.bubbles], [14, C.soak.thin], [32, C.soak.gone], [41, C.soak.swell]]),
    watch: { duration: SOAK_H, get: () => S.hours, set: (t) => { S.hours = t; }, rate: () => (SOAK_H / 16) * debugSpeed } },
  { ...multi('weigh1', 'beaker', 'w1', 6.5, 'drain'),
    caption: () => { const k = S.E[last.i].w1; return k < 0.36 ? C.weigh1.lift : k < 0.7 ? C.weigh1.drain : C.weigh1.back; } },
  /* Predicting happens in the data panel, off the bench: the step reads PRED, so a rebuild leaves
     it alone. Watch mode stops at the bench; predicting is the student's. */
  { id: 'predict', ...card('predict'), targets: [], view: 'predict', caption: T.steps.predict.caption,
    isDone: () => lesson.mode === 'watch' || PRED.every(Boolean),
    progress: () => PRED.filter(Boolean).length / 3 },
  { ...multi('fill', 'bottle', 'fill', 4.6, 'fill'),
    why: () => (S.E[2].fill >= 1 ? T.steps.fill.why : undefined),
    caption: () => (last.i === 2 && S.E[2].fill > 0.62 ? C.fill.float : fmt(C.fill.pour, { egg: LETTER[last.i], liquid: T.liquids[last.i].name })) },
  { id: 'osmosis', ...card('osmosis'), hint: fmt(T.steps.osmosis.hint, { h: OSMO_H }), targets: [], view: 'osmosis',
    clock: () => clockText(S.osmo, T.steps.osmosis.clock),
    caption: cues(() => S.osmo, [[0, C.osmosis.both], [4, C.osmosis.net], [10, C.osmosis.iso], [17, C.osmosis.slow]]),
    watch: { duration: OSMO_H, get: () => S.osmo, set: (t) => { S.osmo = t; }, rate: () => (OSMO_H / 14) * debugSpeed } },
  { ...multi('weigh2', 'beaker', 'w2', 4.8, 'results'),
    caption: () => (S.E[last.i].w2 < 0.6 ? fmt(C.weigh2.lift, { egg: LETTER[last.i] }) : C.weigh2.set) },
];
const PREDICT = STEPS.findIndex((s) => s.id === 'predict');
const PHASES = [
  { ...T.phases.shell, icon: 'ph-egg', steps: ['weigh0', 'vinegar', 'soak'] },
  { ...T.phases.naked, icon: 'ph-scales', steps: ['weigh1'] },
  { ...T.phases.osmosis, icon: 'ph-drop', steps: ['predict', 'fill', 'osmosis'] },
  { ...T.phases.results, icon: 'ph-chart-bar', steps: ['weigh2'] },
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
  completeHint: T.complete.hint,
  completeWhy: T.complete.why,
  completeCaption: T.complete.caption,
  onEnter: (step) => {
    requestAnimationFrame(() => stage.resize());
    panelKey = '';
    if (!step) { stage.focus('towel', 1.6); toast(T.complete.toast, { icon: 'ph-egg' }); return; }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; }
    stage.focus(step.view);
  },
});
ix = createInteraction(stage, {
  targets: lesson.targets,
  busy: lesson.isBusy,
  onClick: lesson.click,
  status: lesson.status,
  markerStyle: new URLSearchParams(location.search).get('marker') || 'circle',
});
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting,
  watching: () => lesson.mode === 'watch',
  rig: { t: V3(0, 5, 1), p: V3(2, 30, 52) },
  special: ['soak', 'osmosis', 'towel'],
});

function restart() {
  newSession();
  PRED.fill(null);
  firstEnter = false;
  lesson.restart();
}

buildPanel();
stage.onFrame((dt, now) => {
  lesson.update(dt);
  follow.update(dt);
  if (S) { pose(); tickFx(now / 1000); renderPanel(); }
  ix.update();
});

const intro = createIntro(stage);
bindChrome({ stage, restart, expose: { get S() { return S; }, get B() { return B; }, get M() { return M; }, PRED, massAt, lesson, ix, stage, follow, STEPS, intro } });

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
