#!/usr/bin/env node
/* =============================================================================
 *  condense/check-condense.js
 * =============================================================================
 *  The component's one claim, asserted rather than grepped for: EVERY PAIR IT
 *  ACCEPTS LOSES EXACTLY ONE WATER, and which molecule gives up the oxygen is
 *  read from that molecule's own `condense` roles.
 *
 *  It RUNS the code. `condense.js` needs THREE only inside `create`, and
 *  `linkageOf`, `macromolecule/` and every `mol-*` file are Node-loadable, so
 *  this resolves real pairs against real specs instead of reading source the
 *  way reaction/check-reaction.js has to.
 *
 *  THE THREE THINGS THAT BREAK SILENTLY:
 *
 *   1. A PAIR THAT LOSES SOMETHING OTHER THAN WATER. The component draws a
 *      water unconditionally once the leaving atoms are off, so a pair whose
 *      roles shed an extra hydrogen renders a perfectly good water and a
 *      molecule quietly two atoms light.
 *   2. THE OXYGEN COMING FROM THE WRONG SIDE. A sugar takes it from the
 *      ACCEPTOR and an ester and a peptide from the DONOR — the mirror, and a
 *      branch on the linkage name is right for two classes and backwards for
 *      the third with everything still rendering. This asserts the direction
 *      per class, so a `condense` block edited in the library fails here.
 *   3. A PAIR THE REFERENCE PROMISES AND THE CODE REFUSES. Every pair named in
 *      docs/Components.md's section has to resolve, or a generated page mounts
 *      the component and gets an exception.
 *
 *  `node condense/check-condense.js`, offline, no dependencies.
 * ========================================================================== */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fails = 0;
const fail = m => { fails++; console.log(`  FAIL  ${m}`); };
const is = (cond, m) => { if (cond) console.log(`  ok    ${m}`); else fail(m); };

/* THE WHOLE LIBRARY, through lib-node.js — which walks MolLib.DOMAINS rather
   than listing files, so a domain file added later is seen here without this
   checker being edited. The browser files hang themselves off `this`, which
   under CommonJS is `module.exports`, so each is taken from its own return
   value and put on a global for the next one to find. */
global.window = global;
const MolLib = require(path.join(ROOT, 'lib/lib-node.js'));
global.MolLib = MolLib.MolLib || MolLib;
global.SkelLib = require(path.join(ROOT, 'lib/skel.js')).SkelLib || global.SkelLib;
const take = (f, name) => { const m = require(path.join(ROOT, f));
  global[name] = m[name] || m; return global[name]; };
take('chain/frame.js', 'CondenseFrame');
take('macromolecule/spec.js', 'MacroSpec');
take('macromolecule/glycosidic.js', 'Glycosidic');
take('macromolecule/ester.js', 'Ester');
take('macromolecule/peptide.js', 'Peptide');
const Condense = take('condense/condense.js', 'Condense');
const M = global.MolLib.MOLECULES, S = global.MacroSpec;

/* Every pair docs/Components.md promises, plus one of each amino-acid ordering
   so a peptide is not only checked in the direction the example happens to use. */
const PAIRS = [
  ['glucose', 'glucose'], ['alphaGlucose', 'alphaGlucose'],
  ['galactose', 'galactose'], ['galactose', 'glucose'],
  ['glycerol', 'palmitate'], ['glycerol', 'palmitoleate'],
  ['glycine', 'alanine'], ['alanine', 'glycine'], ['serine', 'cysteine'],
  /* A role that is NOT the default, and the one most likely to rot: glutamate's
     side-chain carboxyl is a third role on a molecule whose other two are the
     backbone's, so a renumbering of that spec moves the gamma-linkage without
     moving anything the other pairs would notice. */
  ['glutamicAcid', 'glycine'], ['glutamicAcid', 'glycine', 'gamma'],
];
/* Which end the water's oxygen comes from, per class. Written here rather than
   counted, for reaction/check-reaction.js's reason: a list that derives itself
   from the code it is checking asserts nothing. A fourth class appearing here
   is the argument to have. */
const OXYGEN_SIDE = { glycosidic: 'acceptor', ester: 'guest', peptide: 'host' };

console.log('\n== 1. every documented pair resolves');
const solved = [];
for (const [hk, gk, want] of PAIRS) {
  let L = null, err = null;
  try { L = Condense.linkageOf(hk, gk, M); } catch (e) { err = e.message; }
  if (!L) { fail(`${hk} + ${gk} — ${err || 'no linkage'}`); continue; }
  const role = want || (L.slots ? L.slots(un(M[hk], hk))[0] : L.donor);
  if (want && !S.role(un(M[hk], hk), want)) {
    fail(`${hk} has no role '${want}' — the bench offers it`); continue;
  }
  solved.push({ hk, gk, L, role });
  console.log(`  ok    ${hk} + ${gk} → ${L.name} (host role ${role})`);
}

console.log('\n== 2. every pair loses exactly one water');
for (const { hk, gk, L, role } of solved) {
  const H = un(M[hk], hk), G = un(M[gk], gk);
  const hr = S.role(H, role), gr = S.role(G, L.acceptor);
  if (!hr || !gr) { fail(`${hk} + ${gk} — a role named by the linkage is not on the spec`); continue; }
  const c = {};
  hr.leaves.forEach(i => c[H.atoms[i].el] = (c[H.atoms[i].el] || 0) + 1);
  gr.leaves.forEach(i => c[G.atoms[i].el] = (c[G.atoms[i].el] || 0) + 1);
  const got = Object.keys(c).sort().map(e => e + (c[e] > 1 ? c[e] : '')).join('');
  is(got === 'H2O', `${hk} + ${gk} sheds ${got}`);
}

console.log('\n== 3. the oxygen comes from the side the class says');
for (const { hk, gk, L, role } of solved) {
  const H = un(M[hk], hk), G = un(M[gk], gk);
  const hasO = (sp, r) => r.leaves.some(i => sp.atoms[i].el === 'O');
  const hostGivesO = hasO(H, S.role(H, role)), guestGivesO = hasO(G, S.role(G, L.acceptor));
  if (hostGivesO === guestGivesO) {
    fail(`${hk} + ${gk} — both sides leave an oxygen, or neither does`);
    continue;
  }
  /* A sugar's donor role IS its host role, so 'acceptor' and 'guest' name the
     same molecule there; they are spelled differently because the reason is
     different, and a class whose donor stops being the host would show up as
     this line disagreeing with itself. */
  const want = OXYGEN_SIDE[L.name];
  const from = hostGivesO ? 'host' : 'guest';
  const ok = want === 'host' ? from === 'host' : from === 'guest';
  is(ok, `${L.name}: ${hk} + ${gk} takes the oxygen from the ${from} (${want})`);
}

console.log('\n== 4. the defaults are a pair that works');
is(Array.isArray(Condense.DEFAULTS.from) && Condense.DEFAULTS.from.length === 2,
   'DEFAULTS.from is a pair');
is(!!Condense.linkageOf(Condense.DEFAULTS.from[0], Condense.DEFAULTS.from[1], M),
   `DEFAULTS.from resolves (${Condense.DEFAULTS.from.join(' + ')})`);
const RUNGS = require(path.join(ROOT, 'kit/scale.js')).RUNGS;
is(RUNGS.indexOf(Condense.SCALE.rung) >= 0, `SCALE.rung '${Condense.SCALE.rung}' is on the ladder`);
/* The one number a page may print off this component, so it may not be null:
   these are real coordinates, not a diagram's. */
is(typeof Condense.SCALE.unit === 'number' && Condense.SCALE.unit > 0,
   'SCALE.unit is a real metres-per-scene-unit, so a length may be printed');

/* The claim the reference now tells a page to PRINT, so it needs an assertion:
   beta-1,4 arrives flipped a half turn and alpha-1,4 nowhere near one. Both are
   read off the deposited disaccharide, so a re-bake of cellobiose or maltose
   that lost its geometry would show up here rather than as a caption quietly
   stating the wrong number. */
/* A pair with no disaccharide measuring it must stay refused. Relaxing the
   same-sugar rule to let lactose through is exactly the change that could let
   an unmeasured pair through with it, and the result would be a bond placed off
   the atom it is made at — rendering perfectly. */
console.log('\n== 5. an unmeasured pair is still refused');
[['glucose', 'alphaGlucose'], ['glucose', 'galactose'], ['alphaGlucose', 'glucose']]
  .forEach(([a, b]) => is(!Condense.linkageOf(a, b, M),
    `${a} + ${b} is refused: nothing in the library measures it`));

console.log('\n== 6. the linkage turn is the alpha/beta difference');
const turnOf = (hk, gk) => {
  const L = Condense.linkageOf(hk, gk, M);
  const q = L.pose(un(M[hk], hk), un(M[gk], gk),
                   { role: L.donor, refs: refsFor(L) }).quat;
  const w = Math.min(1, Math.abs(q[3] / Math.hypot(q[0], q[1], q[2], q[3])));
  return 2 * Math.acos(w) * 180 / Math.PI;
};
const refsFor = L => { const r = {}; (L.refs || []).forEach(k => { r[k] = un(M[k], k); }); return r; };
const beta = turnOf('glucose', 'glucose'), alpha = turnOf('alphaGlucose', 'alphaGlucose');
is(Math.abs(beta - 180) < 1, `beta-1,4 arrives flipped a half turn (${beta.toFixed(1)}\u00b0)`);
is(alpha < 90, `alpha-1,4 turns far less (${alpha.toFixed(1)}\u00b0), and winds into a helix`);
/* …and the helix maltose declares independently agrees with it: a 6-fold screw
   is 60\u00b0 a residue, which is the turn measured above to within a few degrees.
   Two records, baked by different code, saying the same thing. */
const perTurn = M.maltose.helix && M.maltose.helix.perTurn;
is(perTurn && Math.abs(alpha - 360 / perTurn) < 8,
   `maltose's own helix (${perTurn} per turn = ${(360 / perTurn).toFixed(0)}\u00b0) matches that`);

console.log('\n== 7. the beats are in order and inside 0..1');
const B = Condense.BEAT, order = ['BREAK', 'CLEAR', 'CROSS', 'FORM', 'CLOSE'];
let prev = 0, ordered = true;
order.forEach(k => { if (!(B[k] > prev) || B[k] >= 1) ordered = false; prev = B[k]; });
is(ordered, `BEAT runs ${order.map(k => `${k} ${B[k]}`).join(' < ')} < 1`);

/* macromolecule/ works in angstroms and a registered spec has been multiplied
   by SCALE once. Everything above reads roles and elements, which the scale
   cannot change — but it divides anyway, so this file and the component ask
   the same question of the same numbers. */
function un(spec, key) {
  const S1 = global.MolLib.SCALE;
  return Object.assign({}, spec, { key, view: null,
    atoms: spec.atoms.map(a => ({ el: a.el, pos: a.pos.map(v => v / S1) })) });
}

if (fails) { console.log(`\nFAIL: ${fails} problem(s)\n`); process.exit(1); }
console.log('\nPASS: every documented pair resolves, sheds one water, and takes '
  + 'its oxygen from the side its class says.\n');
