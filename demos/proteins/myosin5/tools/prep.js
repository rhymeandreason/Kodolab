#!/usr/bin/env node
/* =====================================================================
 *  prep.js — myosin V's power stroke on actin, as a morph through three
 *  deposited states.
 *
 *  Run:  node proteins/myosin5/tools/prep.js   (offline, a few seconds)
 *
 *  UNDER REVIEW. Not in proteins/proteins.js.
 *
 *  THE THREE STATES, in the order the cycle runs:
 *    4ZG4  pre-power-stroke, ADP·VO4 (a Pi mimic). HUMAN MYOSIN Vc, x-ray,
 *          crystallised OFF actin, and the chain stops at the converter.
 *    7PM6  strong-ADP, on actin. Chicken myosin Va, cryo-EM 3.0 A.
 *    7PLU  rigor, nucleotide-free, on actin. Same construct, 3.2 A.
 *  Pi release drives the big swing (leg 1); ADP release a small one (leg 2,
 *  measured: ~7 degrees). Leg 2 is two files of one construct. Leg 1 is
 *  NOT, and three things about it are modelled rather than measured:
 *
 *  1. A DIFFERENT ISOFORM. Vc against Va, aligned by sequence. The leg-1
 *     angle is the stroke plus whatever Vc and Va differ by, which no
 *     deposited pair separates. Hexokinase's closure has the same caveat.
 *  2. PLACED ON ACTIN BY FIT. 4ZG4 has no actin, so it is superposed onto
 *     7PM6 by the residues 7PM6 holds against actin, iterated to the rigid
 *     core of that surface. The pre-stroke head binds actin weakly and this
 *     is where its actin face would sit; it is not a measured complex.
 *  3. THE LEVER IS CARRIED. 4ZG4 ends at the converter. Past it (the rest
 *     of the lever helix and the light chain on it) the coordinates are
 *     7PM6's, moved rigidly with the converter: the lever-arm model, a
 *     claim that the lever does not bend, which is how every textbook
 *     figure of this stroke is drawn.
 *  The page says all three.
 *
 *  THE MORPH turns the lever as a rigid body about its pivot; see below for
 *  why not bake-closure.js's distance-space solve.
 *
 *  THE ACTIN IS STATIC and 7PLU's: it moves 0.3 A between the two EM
 *  files. Everything is in 7PLU's frame, 7PM6 fitted onto it by actin.
 *
 *  SOURCES (not committed; the root .gitignore covers them):
 *    https://files.rcsb.org/download/7PLU.pdb
 *    https://files.rcsb.org/download/7PM6.pdb
 *    https://files.rcsb.org/download/4ZG4.pdb
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const Bake = require('../../bake-lib.js');
const { readCA, readSS, align, superpose, dist } = require('../../../hexokinase/tools/pdbio.js');

const DATA = path.join(__dirname, '..', 'data');
const RIGOR = '7PLU', STRONG = '7PM6', PRE = '4ZG4';
const HEAVY = 'A', ELC = 'B', ACTIN = ['C', 'F', 'G'];
const PRE_CHAIN = 'E';             // 711 of 764 modelled, against B's 705

const LEG = [31, 21];              // frames per leg; leg 1 is the big swing
const IFACE = 12;                  // A from an actin Ca: the actin face
const CONV = 20;                   // last aligned residues: the lever helix's start

function read(f) {
  const at = path.join(DATA, f + '.pdb');
  if (!fs.existsSync(at))
    throw new Error(`${f}.pdb is not in data/ — curl -o ${at} https://files.rcsb.org/download/${f}.pdb`);
  return fs.readFileSync(at, 'utf8');
}
/* pdbio.readCA takes the file's first chain; hand it one. */
const oneChain = (text, ch) => readCA(Bake.modelOne(text).split('\n')
  .filter(l => !/^(ATOM|HETATM)/.test(l) || l[21] === ch).join('\n'));
const P3 = p => ({ x: p[0], y: p[1], z: p[2] });

const rawP = read(RIGOR), rawS = read(STRONG), rawZ = read(PRE);

/* ---- 7PM6 onto 7PLU, by actin -------------------------------------- */
const mod = Bake.modResidues(rawP);
const actP = Bake.caTrace(Bake.modelOne(rawP), new Set(ACTIN), mod);
const actS = Bake.caTrace(Bake.modelOne(rawS), new Set(ACTIN), Bake.modResidues(rawS));
const aP = [], aS = [];
for (const ch of ACTIN) {
  const s = new Map(actS.get(ch).map(r => [r.num, r]));
  for (const r of actP.get(ch)) if (s.has(r.num)) { aP.push(r); aS.push(s.get(r.num)); }
}
const onActin = superpose(aS, aP);
console.log(`${STRONG} onto ${RIGOR} by actin: ${aP.length} Ca, rmsd ${onActin.rmsd.toFixed(2)} A`);

const hP = oneChain(rawP, HEAVY), hS = oneChain(rawS, HEAVY), hZ = oneChain(rawZ, PRE_CHAIN);
const eP = oneChain(rawP, ELC), eS = oneChain(rawS, ELC);
const S = new Map(onActin.apply(hS.ca).map(c => [c.n, c]));
const SE = new Map(onActin.apply(eS.ca).map(c => [c.n, c]));
const P = new Map(hP.ca.map(c => [c.n, c]));
const PE = new Map(eP.ca.map(c => [c.n, c]));

/* ---- Va to Vc ------------------------------------------------------- */
const al = align(hP.seq, hZ.seq);
/* A GLOBAL ALIGNMENT PADS THE ENDS: it pairs Vc's last five residues across
   26 of Va's, which would put the converter on the lever. Keep a pair only
   inside a run of at least RUN pairs at one numbering offset. */
const RUN = 4;
const raw = al.pairs.map(([i, j]) => ({ n: hP.ca[i].n, z: hZ.ca[j], off: hP.ca[i].n - hZ.ca[j].n }));
const keep = raw.filter((r, i) => {
  let lo = i, hi = i;
  while (lo > 0 && raw[lo - 1].off === r.off) lo--;
  while (hi < raw.length - 1 && raw[hi + 1].off === r.off) hi++;
  return hi - lo + 1 >= RUN;
});
const zOf = new Map(keep.map(r => [r.n, r.z]));
const offOf = new Map(keep.map(r => [r.n, r.off]));
const motor = hP.ca.map(c => c.n).filter(n => S.has(n) && zOf.has(n));
const lastN = motor[motor.length - 1];
const lever = hP.ca.map(c => c.n).filter(n => n > lastN && S.has(n));
const elc = eP.ca.map(c => c.n).filter(n => SE.has(n));
console.log(`Va/Vc: ${keep.length} of ${al.aligned} aligned pairs kept, ${(al.identity * 100).toFixed(1)}% identical; ` +
  `motor ${motor.length} (to ${lastN}), lever carried ${lever.length}, ELC ${elc.length}`);

/* Iterate a fit to the subset that agrees within `tol`: the rigid core. */
function core(keys, mob, ref, tol, min) {
  let set = keys, last = -1, fit = null;
  for (let it = 0; it < 20 && set.length !== last; it++) {
    last = set.length;
    fit = superpose(set.map(mob), set.map(ref));
    const moved = fit.apply(keys.map(mob));
    const next = keys.filter((k, i) => dist(moved[i], ref(k)) < tol);
    if (next.length < min) break;
    set = next;
  }
  return { fit, set };
}

/* ---- 4ZG4 onto 7PM6's actin face ------------------------------------ */
const actinPts = aP;
const face = motor.filter(n => actinPts.some(a => dist(S.get(n), a) < IFACE));
/* THE HEAD CHANGES SHAPE BETWEEN THESE STATES (the cleft closes on actin),
   so no fit over the whole face holds. Find the largest block that is rigid
   between 4ZG4 and 7PM6, seeded at each face residue as hinge.js does, and
   place on that: the domain that carries the actin face. */
function block(seedN) {
  const near = [...motor].sort((x, y) => dist(S.get(seedN), S.get(x)) - dist(S.get(seedN), S.get(y))).slice(0, 30);
  return core(near, n => zOf.get(n), n => S.get(n), 1.5, 12);
}
function grow(seed) {
  let set = seed.set, fit = seed.fit;
  for (let it = 0; it < 20; it++) {
    const moved = fit.apply(motor.map(n => zOf.get(n)));
    const next = motor.filter((n, i) => dist(moved[i], S.get(n)) < 1.5);
    if (next.length <= set.length) break;
    set = next; fit = superpose(set.map(n => zOf.get(n)), set.map(n => S.get(n)));
  }
  return { set, fit };
}
let placed = null;
for (const n of face) {
  const g = grow(block(n));
  const onFace = g.set.filter(k => face.includes(k)).length;
  if (g.set.length >= 12 && (!placed || onFace > placed.onFace ||
      (onFace === placed.onFace && g.set.length > placed.set.length))) placed = { ...g, onFace };
}
console.log(`${PRE} placed on ${STRONG} by its rigid actin-facing block: ${placed.set.length} residues ` +
  `(${placed.set[0]}-${placed.set[placed.set.length - 1]}), ${placed.onFace} of ${face.length} face residues, ` +
  `rmsd ${placed.fit.rmsd.toFixed(2)} A`);
const Z = new Map(motor.map((n, i) => [n, placed.fit.apply([zOf.get(n)])[0]]));

/* ---- the lever, carried on the converter ----------------------------- */
const convKeys = motor.slice(-CONV);
const conv = core(convKeys, n => S.get(n), n => Z.get(n), 1.0, 10);
console.log(`converter ${STRONG} onto ${PRE}: ${conv.set.length} of ${convKeys.length}, ` +
  `rmsd ${conv.fit.rmsd.toFixed(2)} A`);
const ZL = new Map(lever.map(n => [n, conv.fit.apply([S.get(n)])[0]]));
const ZE = new Map(elc.map(n => [n, conv.fit.apply([SE.get(n)])[0]]));

/* ---- the body, in one order for every state -------------------------- */
const body = [...motor, ...lever].map(n => ({ chain: HEAVY, n }))
  .concat(elc.map(n => ({ chain: ELC, n })));
const N = body.length;
/* A BREAK before body[i]: a gap in Va numbering, a change of chain, or an
   indel between Va and Vc (the offset changes), where 4ZG4's two Ca are not
   neighbours. The ribbon splits there and the step check skips it. */
const brk = body.map((b, i) => i > 0 && (b.chain !== body[i - 1].chain || b.n !== body[i - 1].n + 1 ||
  (offOf.has(b.n) && offOf.has(body[i - 1].n) && offOf.get(b.n) !== offOf.get(body[i - 1].n))));
const stateOf = (H, E) => body.map(b => (b.chain === HEAVY ? H.get(b.n) : E.get(b.n)));
const PRE_PTS = body.map(b => b.chain === ELC ? ZE.get(b.n) : (Z.get(b.n) || ZL.get(b.n)));
const STATES = [PRE_PTS, stateOf(S, SE), stateOf(P, PE)];

/* ---- the morph: a lever turned about its pivot ------------------------
 *
 *  NOT bake-closure.js's distance-space solve. That suits a hinge of a few
 *  ångströms; over a 70-degree swing it falls into a wrong minimum and the
 *  ends land 18 A from their structures. The stroke is a rigid lever on a
 *  motor, so it is interpolated as one: the lever (lever helix + light
 *  chain) turns about its first residue by a slerped rotation, and that
 *  pivot slides from its start to its end position. What the rigid turn
 *  does not explain, and every motor residue's own change, is added
 *  linearly. Both ends land exactly, and the step check below still
 *  catches a stretch.
 */
/* WHERE THE LEVER STARTS IS MEASURED, on the big leg. Seeded with the
   lever helix and light chain, then walked back from the C-terminus: a
   residue joins while the lever's rigid motion moves it closer to its
   end position than staying put does. That walks back through the
   converter, which turns with the lever, and stops at the relay. */
const seedL = body.map(b => b.chain === ELC || b.n > lastN - CONV);
const isLever = (() => {
  const A = STATES[0], B = STATES[1];
  const L = body.map((_, i) => i).filter(i => seedL[i]);
  const fit = superpose(L.map(i => A[i]), L.map(i => B[i]));
  const moved = fit.apply(A);
  const out = seedL.slice();
  const heavy = body.map((b, i) => i).filter(i => body[i].chain === HEAVY);
  let miss = 0;
  for (let k = heavy.length - 1; k >= 0 && miss < 5; k--) {
    const i = heavy[k];
    if (out[i]) continue;
    if (dist(moved[i], B[i]) < dist(A[i], B[i])) { out[i] = true; miss = 0; }
    else miss++;
  }
  /* Contiguous from the first lever residue on, so no motor island sits
     inside the lever. */
  const first = heavy.find(i => out[i]);
  for (const i of heavy) out[i] = i >= first;
  return out;
})();
const pivot = isLever.indexOf(true);
console.log(`lever measured from residue ${body[pivot].n} (seeded at ${lastN - CONV + 1})`);
function slerp(q, t) {
  const [w, x, y, z] = q[0] < 0 ? q.map(v => -v) : q;
  const th = Math.acos(Math.min(1, w)), s = Math.sin(th);
  if (s < 1e-9) return [1, 0, 0, 0];
  const a = Math.sin((1 - t) * th) / s, b = Math.sin(t * th) / s;
  return [a + b * w, b * x, b * y, b * z];
}
function rot(q, v) {
  const [w, x, y, z] = q;
  const R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
             [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
             [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
  return { x: R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
           y: R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
           z: R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z };
}
function morph(A, B, frames) {
  const L = body.map((_, i) => i).filter(i => isLever[i]);
  const q = superpose(L.map(i => A[i]), L.map(i => B[i])).q;
  const pA = A[pivot], pB = B[pivot];
  const turned = i => { const r = rot(q, { x: A[i].x - pA.x, y: A[i].y - pA.y, z: A[i].z - pA.z });
                        return { x: r.x + pB.x, y: r.y + pB.y, z: r.z + pB.z }; };
  const res = body.map((_, i) => { if (!isLever[i]) return null; const T1 = turned(i);
    return { x: B[i].x - T1.x, y: B[i].y - T1.y, z: B[i].z - T1.z }; });
  /* A MOTOR RESIDUE TURNS WITH ITS NEIGHBOURS. Subdomains rotate between
     these states too (the N-terminal one most), and a straight slide
     stretches the chain wherever one does. Each residue takes the rigid
     motion of its own window of WIN either side, unbroken, slerped about
     the window's centre; its leftover is added linearly. */
  const WIN = 4;
  const loc = body.map((_, i) => {
    if (isLever[i]) return null;
    let lo = i, hi = i;
    while (lo > 0 && i - lo < WIN && !brk[lo] && !isLever[lo - 1]) lo--;
    while (hi < N - 1 && hi - i < WIN && !brk[hi + 1] && !isLever[hi + 1]) hi++;
    const W = []; for (let k = lo; k <= hi; k++) W.push(k);
    if (W.length < 3) return null;
    const ft = superpose(W.map(k => A[k]), W.map(k => B[k]));
    const cA = mean3(W.map(k => A[k])), cB = mean3(W.map(k => B[k]));
    const r1 = rot(ft.q, sub3(A[i], cA));
    return { q: ft.q, cA, cB, res: sub3(B[i], add3(r1, cB)) };
  });
  const out = [];
  for (let f = 1; f <= frames; f++) {
    /* Even spacing: the page eases the clock, so easing here too would
       stall each leg's ends. */
    const t = f / frames, qt = slerp(q, t);
    const pv = { x: pA.x + (pB.x - pA.x) * t, y: pA.y + (pB.y - pA.y) * t, z: pA.z + (pB.z - pA.z) * t };
    out.push(shake(body.map((_, i) => {
      if (!isLever[i]) {
        const m = loc[i];
        if (!m) return { x: A[i].x + (B[i].x - A[i].x) * t,
          y: A[i].y + (B[i].y - A[i].y) * t, z: A[i].z + (B[i].z - A[i].z) * t };
        const r = rot(slerp(m.q, t), sub3(A[i], m.cA));
        return { x: m.cA.x + (m.cB.x - m.cA.x) * t + r.x + m.res.x * t,
                 y: m.cA.y + (m.cB.y - m.cA.y) * t + r.y + m.res.y * t,
                 z: m.cA.z + (m.cB.z - m.cA.z) * t + r.z + m.res.z * t };
      }
      const r = rot(qt, { x: A[i].x - pA.x, y: A[i].y - pA.y, z: A[i].z - pA.z });
      return { x: pv.x + r.x + res[i].x * t, y: pv.y + r.y + res[i].y * t, z: pv.z + r.z + res[i].z * t };
    }), A, B, t));
  }
  return out;
}
/* STEP LENGTHS RESTORED, SHAKE-style: each unbroken motor step is pulled
   toward its own length, eased between the two ends' values, splitting the
   correction between its residues. The lever is rigid already and is not
   touched, nor is the residue it pivots on. A loop whose neighbours turn
   differently (residue 54, beside an unmodelled stretch) otherwise
   squeezes to 1.3 A mid-swing. At either end the steps are already right,
   so the deposited structures are unchanged. */
function shake(X, A, B, t) {
  const fixed = i => isLever[i];
  for (let it = 0; it < 60; it++) for (let i = 1; i < N; i++) {
    if (brk[i] || (fixed(i) && fixed(i - 1))) continue;
    const want = dist(A[i - 1], A[i]) + (dist(B[i - 1], B[i]) - dist(A[i - 1], A[i])) * t;
    const a = X[i - 1], b = X[i], d = dist(a, b) || 1e-9, k = (d - want) / d;
    const wa = fixed(i - 1) ? 0 : fixed(i) ? 1 : 0.5, wb = 1 - wa;
    a.x += (b.x - a.x) * k * wa; a.y += (b.y - a.y) * k * wa; a.z += (b.z - a.z) * k * wa;
    b.x -= (b.x - a.x) * k * wb / (1 - k * wa || 1); b.y -= (b.y - a.y) * k * wb / (1 - k * wa || 1);
    b.z -= (b.z - a.z) * k * wb / (1 - k * wa || 1);
  }
  return X;
}
const mean3 = ps => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
  y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length });
const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

const frames = [STATES[0]];
const keys = [0];
for (let l = 0; l < 2; l++) {
  frames.push(...morph(STATES[l], STATES[l + 1], LEG[l]));
  keys.push(frames.length - 1);
}

/* ---- checks, on every frame ------------------------------------------- */
const step = [];
for (let i = 1; i < N; i++) if (!brk[i]) step.push([i - 1, i]);
let worstStep = 0, worstAt = null, clashes = 0;
for (const fr of frames) {
  for (const [a, b] of step) { const d = Math.abs(dist(fr[a], fr[b]) - 3.8);
    if (d > worstStep) { worstStep = d; worstAt = body[b].n; } }
}
/* NOTHING PASSES THROUGH: the lever against actin and against the motor,
   on every frame. Two Ca under 3.4 A that are not neighbours is a clash. */
const lv = body.map((_, i) => i).filter(i => isLever[i]);
const mo = body.map((_, i) => i).filter(i => !isLever[i]);
let actinMin = Infinity;
for (const fr of frames) {
  for (const i of lv) {
    for (const a of aP) actinMin = Math.min(actinMin, dist(fr[i], a));
    for (const j of mo) if (Math.abs(i - j) > 2 && dist(fr[i], fr[j]) < 3.4) clashes++;
  }
}
console.log(`lever to actin, closest on any frame ${actinMin.toFixed(1)} A; lever-motor clashes summed over frames ${clashes}`);
if (actinMin < 3.4) throw new Error('the lever passes through actin');
const endRms = (fr, ref) => Math.sqrt(fr.reduce((s, p, i) => s + dist(p, ref[i]) ** 2, 0) / N);
const ends = keys.map((k, i) => endRms(frames[k], STATES[i]));
console.log(`morph: ${frames.length} frames, worst Ca step off 3.8 A by ${worstStep.toFixed(2)} (at ${worstAt}), ` +
  `keyframes land within ${ends.map(e => e.toFixed(2)).join(' / ')} A`);
if (worstStep > 0.6) throw new Error('morph stretched the chain');
if (ends.some(e => e > 1.2)) throw new Error('a keyframe does not land on its structure');

/* ---- the lever angle, motor held still ------------------------------- */
const motorIdx = body.map((b, i) => [b, i]).filter(([b]) => b.chain === HEAVY && b.n <= lastN - CONV).map(([, i]) => i);
const leverIdx = body.map((b, i) => [b, i]).filter(([b]) => b.chain === ELC || b.n > lastN - CONV).map(([, i]) => i);
function swing(A, B) {
  const m = superpose(motorIdx.map(i => B[i]), motorIdx.map(i => A[i]));
  const Bm = m.apply(B);
  const lv = superpose(leverIdx.map(i => A[i]), leverIdx.map(i => Bm[i]));
  const tip = elc.length ? Math.max(...body.map((b, i) => b.chain === ELC ? dist(A[i], Bm[i]) : 0)) : null;
  return { deg: +lv.angle.toFixed(1), tip: +tip.toFixed(1) };
}
const legs = [swing(STATES[0], STATES[1]), swing(STATES[1], STATES[2]), swing(STATES[0], STATES[2])];
console.log(`lever swing, motor held: Pi release ${legs[0].deg} deg, ADP release ${legs[1].deg} deg, ` +
  `whole stroke ${legs[2].deg} deg; light chain moves up to ${legs[2].tip} A`);

/* ---- the nucleotide ---------------------------------------------------
 *
 *  NOT ATP. The pre-stroke crystal holds ADP and vanadate, a stand-in for
 *  the phosphate cut off ATP (drawn as phosphate; the page says so); 7PM6
 *  holds ADP; the rigor head is empty. 7PLU's ADPs are actin's, not drawn.
 *
 *  Two rigid pieces, ADP·Mg and Pi. Each frame carries a matrix taking the
 *  piece from its frame-0 pose to where it sits on that frame: it rides the
 *  pocket (the residues around it, fitted frame to frame), and over leg 1
 *  the ADP eases onto 7PM6's own ADP, matched atom by atom. The page owns
 *  when each leaves; the baker says which way, the most open path out.
 */
function hetPiece(raw, ch, names, fit) {
  const atoms = [], serial = new Map();
  for (const l of Bake.modelOne(raw).split('\n')) {
    if (!l.startsWith('HETATM') || l[21] !== ch || !names.includes(l.slice(17, 20).trim())) continue;
    const el = (l.slice(76, 78).trim() || l.slice(12, 14).trim()).toUpperCase();
    if (el === 'H' || (l[16] !== ' ' && l[16] !== 'A')) continue;
    serial.set(+l.slice(6, 11), atoms.length);
    const [p] = fit.apply([P3(Bake.xyz(l))]);
    atoms.push({ name: l.slice(12, 16).trim(), res: l.slice(17, 20).trim(),
                 el: el === 'V' ? 'P' : el, p });
  }
  /* Bonds off CONECT; the metal's coordination is not drawn as a bond. */
  const bonds = [], seen = new Set();
  for (const l of raw.split('\n')) {
    if (!l.startsWith('CONECT')) continue;
    const a = serial.get(+l.slice(6, 11)); if (a === undefined) continue;
    for (let c = 11; c + 5 <= l.length; c += 5) {
      const b = serial.get(+l.slice(c, c + 5).trim());
      if (b === undefined || atoms[a].el === 'MG' || atoms[b].el === 'MG') continue;
      const k = Math.min(a, b) + ':' + Math.max(a, b);
      if (!seen.has(k) && a !== b) { seen.add(k); bonds.push([a, b]); }
    }
  }
  return { atoms, bonds };
}
const ident = { apply: x => x };
const zADP = hetPiece(rawZ, PRE_CHAIN, ['ADP', 'MG'], placed.fit);
const zPI = hetPiece(rawZ, PRE_CHAIN, ['VO4'], placed.fit);
const sADP = hetPiece(rawS, HEAVY, ['ADP', 'MG'], onActin);
if (!zADP.atoms.length || !zPI.atoms.length || !sADP.atoms.length) throw new Error('a nucleotide is missing');

const cen = ps => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
  y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length });
const ligC = cen(zADP.atoms.concat(zPI.atoms).map(a => a.p));
const pocketIdx = body.map((_, i) => i).filter(i => !isLever[i] && dist(STATES[0][i], ligC) < 12);
const sByName = new Map(sADP.atoms.map(a => [a.res + a.name, a.p]));
const shared = zADP.atoms.map((a, i) => [i, sByName.get(a.res + a.name)]).filter(([, q]) => q);

function follow(piece, toS) {
  const P0 = piece.atoms.map(a => a.p), out = [];
  const pk0 = pocketIdx.map(i => frames[0][i]);
  for (let f = 0; f < frames.length; f++) {
    const T = superpose(pk0, pocketIdx.map(i => frames[f][i]));
    let Y = T.apply(P0);
    if (toS) {
      const t = Math.min(1, f / keys[1]);
      const Tk = superpose(pk0, pocketIdx.map(i => frames[keys[1]][i])).apply(P0);
      Y = Y.map((y, i) => { const q = shared.find(([k]) => k === i); if (!q) return y;
        const d = sub3(q[1], Tk[i]); return { x: y.x + d.x * t, y: y.y + d.y * t, z: y.z + d.z * t }; });
    }
    const M = superpose(P0, Y);
    const c0 = cen(P0), [w, x, y, z] = M.q;
    const R = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
               [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
               [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
    const cY = cen(Y), Rc = rot(M.q, c0);
    out.push({ R, t: [cY.x - Rc.x, cY.y - Rc.y, cY.z - Rc.z], rmsd: M.rmsd });
  }
  return out;
}
const adpFollow = follow(zADP, true), piFollow = follow(zPI, false);
const landS = Math.sqrt(shared.reduce((s2, [i, q]) => {
  const m = adpFollow[keys[1]], p0 = zADP.atoms[i].p;
  const y = { x: m.R[0][0] * p0.x + m.R[0][1] * p0.y + m.R[0][2] * p0.z + m.t[0],
              y: m.R[1][0] * p0.x + m.R[1][1] * p0.y + m.R[1][2] * p0.z + m.t[1],
              z: m.R[2][0] * p0.x + m.R[2][1] * p0.y + m.R[2][2] * p0.z + m.t[2] };
  return s2 + dist(y, q) ** 2; }, 0) / shared.length);
console.log(`nucleotide: ADP·Mg ${zADP.atoms.length} atoms, Pi ${zPI.atoms.length}; pocket ${pocketIdx.length} residues; ` +
  `ADP lands on 7PM6's within ${landS.toFixed(2)} A over ${shared.length} matched atoms`);

/* The most open way out, on the frame a piece leaves from: of 400
   directions, the one whose first 40 A keeps farthest from any Ca. */
function exitDir(from, f) {
  const all = frames[f].concat(aP);
  let best = null;
  for (let k = 0; k < 400; k++) {
    const zz = 1 - 2 * (k + 0.5) / 400, r = Math.sqrt(1 - zz * zz), ph = k * 2.399963;
    const d = { x: r * Math.cos(ph), y: r * Math.sin(ph), z: zz };
    let worst = Infinity;
    for (let st = 4; st <= 40; st += 2) {
      const q = { x: from.x + d.x * st, y: from.y + d.y * st, z: from.z + d.z * st };
      for (const a of all) worst = Math.min(worst, dist(q, a));
    }
    if (!best || worst > best.clear) best = { d, clear: worst };
  }
  return best;
}
const where = (m, p) => ({ x: m.R[0][0] * p.x + m.R[0][1] * p.y + m.R[0][2] * p.z + m.t[0],
  y: m.R[1][0] * p.x + m.R[1][1] * p.y + m.R[1][2] * p.z + m.t[1],
  z: m.R[2][0] * p.x + m.R[2][1] * p.y + m.R[2][2] * p.z + m.t[2] });
const piExit = exitDir(cen(zPI.atoms.map(a => a.p)), 0);
const adpExit = exitDir(where(adpFollow[keys[1]], cen(zADP.atoms.map(a => a.p))), keys[1]);
console.log(`exit paths clear any Ca by: Pi ${piExit.clear.toFixed(1)} A, ADP ${adpExit.clear.toFixed(1)} A`);

/* ---- write ------------------------------------------------------------ */
const all = [];
for (const fr of frames) for (const p of fr) all.push([p.x, p.y, p.z]);
for (const r of aP) all.push([r.x, r.y, r.z]);
const centre = Bake.mean(all).map(Bake.r2);

const T = Bake.assemble(actP, Bake.ssRanges(rawP), centre);
const F = Bake.frameOf(T.order.flatMap(id => T.chains[id].CA));
fs.writeFileSync(path.join(DATA, 'mv-actin.json'), JSON.stringify({
  source: RIGOR + '.pdb', ssFrom: 'deposited', centre, order: T.order, chains: T.chains,
  radius: T.radius, extents: F.extents, frame: 'deposited' }));

const ssH = readSS(rawP, HEAVY), ssE = readSS(rawP, ELC);
const buf = Buffer.alloc(frames.length * N * 12);
let o = 0;
for (const fr of frames) for (const p of fr) {
  buf.writeFloatLE(p.x - centre[0], o); buf.writeFloatLE(p.y - centre[1], o + 4);
  buf.writeFloatLE(p.z - centre[2], o + 8); o += 12;
}
fs.writeFileSync(path.join(DATA, 'mv-stroke.bin'), buf);
const shiftC = p => [Bake.r2(p.x - centre[0]), Bake.r2(p.y - centre[1]), Bake.r2(p.z - centre[2])];
/* Matrices act on centred coordinates: R·(p+c) + t - c = R·p + (R·c + t - c). */
const shiftM = m => { const c = { x: centre[0], y: centre[1], z: centre[2] }, Rc = where({ R: m.R, t: [0, 0, 0] }, c);
  return [...m.R[0], ...m.R[1], ...m.R[2], Rc.x + m.t[0] - c.x, Rc.y + m.t[1] - c.y, Rc.z + m.t[2] - c.z].map(v => +v.toFixed(4)); };
const piece = (pc, fol, ex, name) => ({ name,
  atoms: pc.atoms.map(a => ({ el: a.el, name: a.name, p: shiftC(a.p) })), bonds: pc.bonds,
  follow: fol.map(shiftM), exit: [ex.d.x, ex.d.y, ex.d.z].map(v => +v.toFixed(4)), clear: +ex.clear.toFixed(1) });
fs.writeFileSync(path.join(DATA, 'mv-nucleotide.json'), JSON.stringify({
  note: 'vanadate drawn as phosphate; 7PLU myosin is empty; exit paths are the most open, not resolved',
  adp: piece(zADP, adpFollow, adpExit, 'ADP·Mg'),
  pi: piece(zPI, piFollow, piExit, 'Pi'),
  adpLandsOn7PM6: +landS.toFixed(2),
}));
const title = t => Bake.line1(t, 'TITLE');
fs.writeFileSync(path.join(DATA, 'mv-stroke.json'), JSON.stringify({
  frames: frames.length, n: N, keys,
  states: [
    { id: PRE, name: 'pre-power-stroke', bound: 'ADP·Pi (as ADP·VO₄)', method: Bake.method(rawZ),
      resolution: Bake.resolution(rawZ), title: title(rawZ), isoform: 'myosin Vc, human', onActin: false },
    { id: STRONG, name: 'strong-ADP', bound: 'ADP', method: Bake.method(rawS),
      resolution: Bake.resolution(rawS), title: title(rawS), isoform: 'myosin Va, chicken', onActin: true },
    { id: RIGOR, name: 'rigor', bound: 'nothing', method: Bake.method(rawP),
      resolution: Bake.resolution(rawP), title: title(rawP), isoform: 'myosin Va, chicken', onActin: true },
  ],
  chain: body.map(b => b.chain).join(''),
  nums: body.map(b => b.n),
  brk: brk.map((b, i) => b ? i : -1).filter(i => i > 0),
  ss: body.map(b => (b.chain === HEAVY ? ssH : ssE).get(b.n) || 'C').join(''),
  /* motor, lever (converter onward), or the light chain on the lever. */
  part: body.map((b, i) => b.chain === ELC ? 'L' : isLever[i] ? 'V' : 'M').join(''),
  leverFrom: body[pivot].n,
  carried: lever.length + elc.length,
  modelled: { isoformIdentity: +(al.identity * 100).toFixed(1),
              faceFit: { residues: placed.set.length, rmsd: +placed.fit.rmsd.toFixed(2) },
              converterFit: { residues: conv.set.length, rmsd: +conv.fit.rmsd.toFixed(2) } },
  actinFit: +onActin.rmsd.toFixed(2),
  swing: { pi: legs[0], adp: legs[1], whole: legs[2] },
  check: { worstStep: +worstStep.toFixed(2), ends: ends.map(e => +e.toFixed(2)),
           leverToActin: +actinMin.toFixed(1), leverMotorClashes: clashes },
}));
console.log(`wrote mv-actin.json, mv-stroke.json, mv-stroke.bin (${(buf.length / 1024).toFixed(0)} KB)`);
