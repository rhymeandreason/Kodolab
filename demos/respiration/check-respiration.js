#!/usr/bin/env node
/* =============================================================================
 *  respiration/check-respiration.js — the claims the step table makes
 * =============================================================================
 *  respiration/steps.js names molecules, verbs and atoms by string, and a
 *  string nothing checks is a step that runs as a plain swap, a lane that
 *  draws nothing, or a click target that never appears. Each of those ships
 *  looking like a beat missing rather than an error. So:
 *
 *    1. every `fx` is a verb reaction/reaction.js registers
 *    2. every molecule key resolves — in MolLib, or as one of the component's
 *       carrier aliases — and every alias's base spec has the atoms it hides
 *    3. every `spot.at` names an atom or bond on the lane it sits on, and
 *       every `anchor`/`dest` is on the spec that verb reads it from
 *    4. each step's `from` is the previous step's `to`, within a branch
 *    5. `perGlucose` never falls along a pathway, and ids are unique
 *
 *  `node respiration/check-respiration.js`, offline, no dependencies. Loads the
 *  browser scripts in a vm with a stub document, the way the library is loaded
 *  on a page and in the same order.
 * ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const HERE = __dirname, ROOT = path.join(HERE, '..');

let fails = 0;
const fail = m => { fails++; console.log(`  FAIL  ${m}`); };
const ok = m => console.log(`  ok    ${m}`);
const is = (cond, m) => cond ? ok(m) : fail(m);

/* ---- the library, in a sandbox ------------------------------------- */
const doc = { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, getContext: () => null }),
  documentElement: { style: { setProperty() {} } }, querySelector: () => null, addEventListener() {} };
const ctx = { console, document: doc, requestAnimationFrame() {}, setTimeout, clearTimeout, performance };
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
['lib/palette.js', 'lib/tokens-from-palette.js', 'lib/molecules.js', 'lib/skel.js',
 'lib/mol-small.js', 'lib/mol-sugars.js', 'lib/mol-pathways.js', 'lib/mol-krebs.js',
 'lib/mol-carriers.js', 'kit/molgraph.js', 'respiration/steps.js'].forEach(load);
const M = ctx.MolLib.MOLECULES, MolGraph = ctx.MolGraph, STEPS = ctx.RespirationSteps;
// The aliases the component builds, run rather than re-typed: respiration.js
// exports `aliases` for exactly this.
const RSRC = fs.readFileSync(path.join(HERE, 'respiration.js'), 'utf8');
load('respiration/respiration.js');
const ALIAS = ctx.RespirationReaction.aliases(ctx.MolLib, MolGraph);
const specOf = k => ALIAS[k] || M[k];
const meta = s => (s && (s.krebs || s.gly)) || {};

/* ---- 1. verbs ------------------------------------------------------- */
console.log('== 1. every fx is a registered verb');
const RX = fs.readFileSync(path.join(ROOT, 'reaction/reaction.js'), 'utf8');
const VERBS = [...RX.matchAll(/\bverb\(\s*'([a-z]+)'\s*,\s*\{/g)].map(m => m[1]);
const WHOLE = [...RX.matchAll(/verb\('([a-z]+)',\s*\{[\s\S]*?\bwhole\(c\)/g)].map(m => m[1]);
if (!VERBS.length) fail('no verbs found in reaction/reaction.js');
const all = [];
for (const p of Object.keys(STEPS.PATHWAYS)) for (const s of STEPS.PATHWAYS[p].steps) all.push({ p, s, id: `${p}/${s.key}` });
let bad = 0;
for (const { id, s } of all) if (!VERBS.includes(s.fx)) { bad++; fail(`${id} names fx:'${s.fx}', not a verb`); }
if (!bad) ok(`${all.length} steps, every fx one of ${VERBS.length} verbs`);

/* ---- 2. molecules --------------------------------------------------- */
console.log('== 2. every molecule key resolves');
bad = 0;
const keysOf = s => [].concat(s.from, s.to, s.linger || [],
  s.partner ? [s.partner.key, s.partner.becomes].filter(Boolean) : [],
  s.offstage ? [s.offstage.key, s.offstage.becomes].filter(Boolean) : []);
for (const { id, s } of all) for (const k of keysOf(s)) if (!specOf(k)) { bad++; fail(`${id}: no molecule '${k}'`); }
if (!bad) ok('every from/to/linger/partner/offstage key is a spec or an alias');
for (const [k, a] of Object.entries(ALIAS)) {
  const rr = a.rr, n = a.atoms.length;
  const idx = [].concat(rr.hide || [], rr.keep || [], rr.seat || [], rr.bond || []);
  is(idx.every(i => Number.isInteger(i) && i >= 0 && i < n), `alias ${k}: hide/keep/seat/bond all index its ${n} atoms`);
  is(a.name && a.formula, `alias ${k}: has a name (${a.name}) and a formula (${a.formula})`);
}

/* ---- 3. spots and anchors ------------------------------------------- */
console.log('== 3. every click lands on a bond, every anchor on its spec');
bad = 0;
for (const { id, s } of all) {
  if (s.spot) {
    const onPartner = s.spot.on === 'partner';
    const lanes = onPartner ? [s.partner && s.partner.key] : s.from;
    const hit = lanes.filter(Boolean).filter(k => { const v = meta(specOf(k))[s.spot.at];
      return Array.isArray(v) || (typeof v === 'number' && MolGraph.leavingBond(specOf(k), v)); });
    if (!hit.length) { bad++; fail(`${id}: spot.at '${s.spot.at}' is on none of ${lanes.join(', ')}`); }
  }
  // `anchor` is the substrate's for out/lose/move, the product's for in (the
  // site the group lands on), and a fallback a dehydrogenase never reads when
  // its spec names the hydride; `dest` is always the product's.
  if (s.anchor) {
    const src = s.from.concat(s.to);
    if (!src.some(k => meta(specOf(k))[s.anchor] != null)) { bad++; fail(`${id}: anchor '${s.anchor}' on none of ${src.join(', ')}`); }
  }
  if (s.dest && !s.to.some(k => meta(specOf(k))[s.dest] != null)) { bad++; fail(`${id}: dest '${s.dest}' not on ${s.to.join(', ')}`); }
  if (s.acts === 'partner' && !(s.partner && s.partner.key)) { bad++; fail(`${id}: acts on a partner it does not have`); }
  if (WHOLE.includes(s.fx) && s.acts === 'partner') { bad++; fail(`${id}: a whole-stage verb cannot act on one lane`); }
}
if (!bad) ok('every spot, anchor and dest resolves');

/* ---- 4. continuity -------------------------------------------------- */
console.log('== 4. each step starts where the last one ended');
bad = 0;
for (const p of Object.keys(STEPS.PATHWAYS)) {
  const pw = STEPS.PATHWAYS[p];
  const first = pw.steps.filter(s => !STEPS.prev(`${p}/${s.key}`));
  for (const s of first) if (String(s.from) !== String(pw.start)) { bad++; fail(`${p}/${s.key}: from ${s.from} but the pathway starts on ${pw.start}`); }
  for (const s of pw.steps) {
    const id = `${p}/${s.key}`, pv = STEPS.prev(id);
    if (!pv) continue;
    const before = STEPS.get(pv);
    if (String(before.to) !== String(s.from)) { bad++; fail(`${id}: from ${s.from} but ${pv} makes ${before.to}`); }
    if ((before.perGlucose > 1 || before.x2After) && s.perGlucose < 2) { bad++; fail(`${id}: perGlucose drops after ${pv}`); }
  }
}
if (!bad) ok('every pathway is a chain, and ×2 never turns back into ×1');
const ids = all.map(a => a.id);
is(new Set(ids).size === ids.length, `${ids.length} ids, all unique`);
is(STEPS.PATHWAYS['pyruvate-oxidation'] && !STEPS.PATHWAYS.krebs.steps.some(s => /bridge/i.test(s.name)),
   'pyruvate oxidation is its own pathway, not the first step of krebs');
// The lanes rule the component is built on.
bad = 0;
for (const { id, s } of all) {
  const before = s.from.length + (s.partner ? 1 : 0);
  const after = s.to.length + (s.linger || []).length + (s.partner && s.partner.becomes ? 1 : 0);
  if (before > 2 || after > 2) { bad++; fail(`${id}: ${before} → ${after} lanes; the stage holds two`); }
}
if (!bad) ok('no step puts more than two molecules on stage');
// The component's own list of where its hosts are answered from.
is(/carrierPoint:/.test(RSRC) && /popCarrier:/.test(RSRC) && /carrierBond:/.test(RSRC),
   'respiration.js answers carrierPoint, carrierBond and popCarrier from the partner lane');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
