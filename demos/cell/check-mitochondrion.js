/* =============================================================================
 *  cell/check-mitochondrion.js — what the detailed mitochondrion may claim
 * =============================================================================
 *  Node-loadable and dependency-free, like membrane/check-chemiosmosis.js.
 *  It builds no geometry: three.js is not here and the organelle's shape is
 *  the human's to judge in a browser. What it checks is the arithmetic the
 *  component prints and the claims that are one line of source each, both of
 *  which ship looking fine and are wrong in a caption.
 *
 *      node cell/check-mitochondrion.js
 *
 *  1. THE ROTOR'S RATIO IS NOT THE COMPONENT'S. It is read from
 *     chemiosmosis/electron-transport.js, so a Mitochondrion and an ElectronTransport on one page
 *     cannot disagree about what an ATP costs. The check is that
 *     mitochondrion.js reads it rather than typing one.
 *  2. COMPLEX II IS NOT A DOOR. It is on the crista and in the legend, and no
 *     proton may use it: that is the whole reason FADH₂ yields less than
 *     NADH, and it has to be true of the picture, not just of a card.
 *  3. THE SIZES A PAGE MAY PRINT come from the scene unit, and the
 *     exaggerations from the drawn size over the measured one. A typed factor
 *     is a claim nothing checks.
 *  4. EVERY PART CARRIES ITS OWN WORDS. A generated page has no teaching text
 *     of its own, so an anchor with no card is a callout that says nothing.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const here = __dirname;
const load = (...files) => {
  const ctx = { console, module: undefined, window: undefined };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(here, '..', f), 'utf8'), ctx, { filename: f });
  return ctx;
};

const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };

const src = f => fs.readFileSync(path.join(here, '..', f), 'utf8');
const ctx = load('lib/palette.js', 'membrane/chemiosmosis.js', 'chemiosmosis/electron-transport.js', 'cell/mitochondrion.js');
const M = ctx.Mitochondrion, RING = ctx.ElectronTransport.RING;
const LADDER = load('kit/scale.js').ScaleLadder;

/* 1. the ratio */
{
  const mito = src('cell/mitochondrion.js');
  ok(/RING\.protonsPerTurn/.test(mito) && /RING\.atpPerTurn/.test(mito),
    'cell/mitochondrion.js does not read the rotor stoichiometry from ElectronTransport.');
  ok(RING.protonsPerTurn > 0 && RING.atpPerTurn > 0,
    'chemiosmosis/electron-transport.js has no ring to read.');
  // The ledger the component prints, at the numbers it will print it with.
  const atp = t => Math.floor((t / RING.protonsPerTurn) * RING.atpPerTurn);
  ok(atp(RING.protonsPerTurn) === RING.atpPerTurn,
    `one full turn should be ${RING.atpPerTurn} ATP, the ledger says ${atp(RING.protonsPerTurn)}.`);
  ok(atp(RING.protonsPerTurn - 1) < RING.atpPerTurn,
    'a turn short of complete already pays its last ATP: the rotor is being credited for work it has not done.');
}

/* 2. complex II is on the crista and is not a door */
{
  const org = src('cell/organelles.js'), mito = src('cell/mitochondrion.js');
  ok(/KINDS\s*=\s*\[[^\]]*'II'/.test(org),
    "cell/organelles.js no longer places a complex II: the member that does NOT pump is the reason FADH2 is worth less, and it has to be on the crista to be pointed at.");
  ok(/filter\(s\s*=>\s*s\.kind\s*!==\s*'II'\)/.test(mito),
    "cell/mitochondrion.js no longer excludes complex II from the pumping sites. A proton leaving the matrix through complex II is the picture contradicting the card.");
  const PAL = ctx.MolPalette.respiration;
  ok(PAL.complexII !== PAL.complex,
    'complex II is the same colour as the rest of the chain, so the one member that does not pump cannot be found without reading a label.');
  /* THE MACHINES ARE ONE SET OF COLOURS ACROSS TWO RUNGS. A student zooms
     from the organelle into the membrane; the gold thing making ATP has to
     be the same gold. Neither file may type one. */
  for (const [file, what] of [['cell/organelles.js', 'the organelle'], ['membrane/membrane.js', 'the bilayer']]) {
    const t = src(file);
    for (const key of ['complex', 'synthase', 'porin']) {
      const hexOf = PAL[key].toString(16);
      ok(!new RegExp('0x' + hexOf, 'i').test(t),
        `${file} types 0x${hexOf} for the ${key} instead of reading palette.js's respiration.${key}. ${what} and the other rung would drift.`);
    }
  }
}

/* 3. the sizes */
{
  const S = M.SCALE;
  ok(LADDER.RUNGS.includes(S.rung), `SCALE.rung ${S.rung} is not on the ladder in kit/scale.js.`);
  ok(LADDER.FORMS.includes(S.form), `SCALE.form ${S.form} is not a form.`);
  ok(S.unit > 0, 'SCALE.unit is null, but state() prints lengths in nanometres. One of the two is lying.');
  const nm = u => u * S.unit * 1e9;
  const lengthNm = nm(2 * (1.7 * M.R + M.R)), widthNm = nm(2 * M.R);
  ok(lengthNm > 1000 && lengthNm < 4000,
    `the organelle is drawn ${Math.round(lengthNm)} nm long; a mitochondrion is 1 to 4 µm.`);
  ok(widthNm > 400 && widthNm < 1200,
    `the organelle is drawn ${Math.round(widthNm)} nm across; a mitochondrion is 0.5 to 1 µm.`);
  for (const k of ['membrane', 'ims', 'lumen', 'junction', 'complex', 'synthase', 'porin'])
    ok(S.exag[k] >= 1, `SCALE.exag.${k} is ${S.exag[k]}: an exaggeration below 1 is a part drawn SMALLER than life, which nothing here does.`);
  ok(S.exag.membrane > S.exag.ims,
    'the bilayer should be stretched harder than the space between the two membranes: it is the thinner of the two by a factor of five.');
  ok(S.down && S.down.inner === 'ElectronTransport',
    'SCALE.down does not hand the inner membrane to ElectronTransport. The gradient arithmetic lives there and nowhere in this component.');
}

/* 4. the words */
{
  for (const n of M.ORDER) {
    const e = M.LIBRARY[n];
    ok(e && e.text, `part "${n}" has no label; a chip for it would say its own variable name.`);
    if (!e || !e.card) { failures.push(`part "${n}" has no card: a generated page has no teaching text of its own.`); continue; }
    const sentences = e.card.split(/[.!?](\s|$)/).filter(x => x.trim().length > 3).length;
    ok(sentences >= 2 && sentences <= 3, `"${n}" card is ${sentences} sentences; the contract is two.`);
  }
  for (const n of Object.keys(M.VIEWS))
    ok(M.ORDER.includes(n), `VIEWS names "${n}", which is not a part. lookAt() would fly to something no chip offers.`);
}

if (failures.length) {
  console.error('check-mitochondrion: ' + failures.length + ' failure(s)');
  for (const f of failures) console.error('  · ' + f);
  process.exit(1);
}
console.log('check-mitochondrion: ok');
