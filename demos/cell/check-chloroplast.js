/* =============================================================================
 *  cell/check-chloroplast.js — what the detailed chloroplast may claim
 * =============================================================================
 *  Node-loadable and dependency-free, like cell/check-mitochondrion.js. It
 *  builds no geometry: the organelle's shape is the human's to judge in a
 *  browser. What it checks is the arithmetic the component prints and the
 *  claims that are one line of source each, which ship looking fine and are
 *  wrong in a caption.
 *
 *      node cell/check-chloroplast.js
 *
 *  1. THE ROTOR'S RATIO IS NOT THE COMPONENT'S. Read from
 *     chemiosmosis/light-reactions.js, so a Chloroplast and a LightReactions with
 *     context:'thylakoid' on one page cannot disagree about what an ATP costs.
 *  2. WATER SPLITTING AT ITS REAL RATIO. 2 H₂O → O₂ + 4 H⁺ + 4 e⁻, two
 *     electrons per NADPH: one O₂ per four protons from water, two NADPH per
 *     O₂. A ledger off by a factor of two here is off exactly where a
 *     student counts.
 *  3. SYNTHASE AND PSI ARE NEVER BETWEEN STACKED DISCS. Both hang a bulk into
 *     the stroma; an appressed face has no room for it. `APPRESSED` in
 *     cell/organelles.js is the list of what such a face may hold, and this
 *     is the check that the list has not grown.
 *  4. THE MACHINES ARE ONE SET OF COLOURS ACROSS THREE RUNGS. The pump is
 *     Membrane's complex and the synthase is the mitochondrion's gold;
 *     neither cell/organelles.js nor cell/chloroplast.js may type one.
 *  5. THE SIZES A PAGE MAY PRINT come from the scene unit, and the
 *     exaggerations from drawn over measured.
 *  6. NO CALVIN CYCLE. The component refuses it in its header; a part named
 *     for it would be the picture contradicting the doc.
 *  7. EVERY PART CARRIES ITS OWN WORDS.
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
const ctx = load('lib/palette.js', 'membrane/chemiosmosis.js', 'chemiosmosis/light-reactions.js', 'cell/chloroplast.js');
const CH = ctx.Chloroplast, RING = ctx.LightReactions.RING;
const LADDER = load('kit/scale.js').ScaleLadder;

/* 1. the ratio */
{
  const t = src('cell/chloroplast.js');
  ok(/RING\.protonsPerTurn/.test(t) && /RING\.atpPerTurn/.test(t),
    'cell/chloroplast.js does not read the rotor stoichiometry from LightReactions.');
  const atp = n => CH.LEDGER.atp(n, RING.protonsPerTurn, RING.atpPerTurn);
  ok(atp(RING.protonsPerTurn) === RING.atpPerTurn,
    `one full turn should be ${RING.atpPerTurn} ATP, the ledger says ${atp(RING.protonsPerTurn)}.`);
  ok(atp(RING.protonsPerTurn - 1) < RING.atpPerTurn,
    'a turn short of complete already pays its last ATP.');
}

/* 2. water */
{
  ok(CH.H_PER_O2 === 4, `H_PER_O2 is ${CH.H_PER_O2}; splitting two waters gives four protons and one O₂.`);
  ok(CH.H_PER_NADPH === 2, `H_PER_NADPH is ${CH.H_PER_NADPH}; two electrons make one NADPH.`);
  ok(CH.LEDGER.o2(4) === 1 && CH.LEDGER.o2(3) === 0, 'the O₂ ledger does not wait for four protons.');
  ok(CH.LEDGER.nadph(4) === 2 * CH.LEDGER.o2(4), 'two NADPH per O₂ is not what the ledger prints.');
  ok(CH.LEDGER.water(4) === 2 * CH.LEDGER.o2(4), 'two waters per O₂ is not what the ledger prints.');
}

/* 3. what an appressed face may hold */
{
  const org = src('cell/organelles.js');
  const m = org.match(/const APPRESSED\s*=\s*\[([^\]]*)\]/);
  ok(m, 'cell/organelles.js no longer declares APPRESSED: which machines may sit between stacked discs has become a guess.');
  if (m) {
    const list = m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    ok(list.includes('psii'), 'APPRESSED does not include psii: photosystem II is the machine that IS in the stacks.');
    for (const bad of ['synthase', 'psi'])
      ok(!list.includes(bad), `APPRESSED lists ${bad}, which hangs a bulk into the stroma and has no room between two discs.`);
  }
  ok(/APPRESSED\[/.test(org), 'the gap sites are not drawn from APPRESSED, so the list guards nothing.');
}

/* 4. colours */
{
  const PAL = ctx.MolPalette;
  ok(PAL.photosynthesis && PAL.photosynthesis.b6f === PAL.respiration.complex,
    'photosynthesis.b6f is not respiration.complex: the pump would be a different colour here than in Membrane\'s thylakoid.');
  ok(PAL.photosynthesis.synthase === PAL.respiration.synthase,
    'photosynthesis.synthase is not respiration.synthase: the gold thing making ATP would change colour between organelles.');
  ok(PAL.photosynthesis.psii !== PAL.photosynthesis.psi && PAL.photosynthesis.psii !== PAL.photosynthesis.b6f,
    'the two photosystems and the pump share a colour, so a label is the only way to tell them apart.');
  for (const file of ['cell/organelles.js', 'cell/chloroplast.js']) {
    const t = src(file);
    for (const key of ['psii', 'psi', 'b6f', 'synthase']) {
      const hexOf = PAL.photosynthesis[key].toString(16);
      ok(!new RegExp('0x' + hexOf, 'i').test(t), `${file} types 0x${hexOf} for ${key} instead of reading palette.js.`);
    }
  }
}

/* 5. sizes */
{
  const S = CH.SCALE;
  ok(LADDER.RUNGS.includes(S.rung), `SCALE.rung ${S.rung} is not on the ladder.`);
  ok(LADDER.FORMS.includes(S.form), `SCALE.form ${S.form} is not a form.`);
  ok(S.unit > 0, 'SCALE.unit is null, but state() prints lengths in nanometres.');
  const nm = u => u * S.unit * 1e9;
  const lengthNm = nm(2 * CH.A), widthNm = nm(2 * CH.C), thickNm = nm(2 * CH.B);
  ok(lengthNm >= 3000 && lengthNm <= 10000, `drawn ${Math.round(lengthNm)} nm long; a chloroplast is 3 to 10 µm.`);
  ok(widthNm >= 1000 && widthNm <= 5000, `drawn ${Math.round(widthNm)} nm across; a chloroplast is 1 to 5 µm.`);
  ok(thickNm >= 1000 && thickNm <= 3000, `drawn ${Math.round(thickNm)} nm thick; a chloroplast lens is 1 to 3 µm.`);
  for (const k of ['membrane', 'lumen', 'gap', 'ims', 'psii', 'psi', 'b6f', 'synthase', 'starch'])
    ok(S.exag[k] >= 1, `SCALE.exag.${k} is ${S.exag[k]}: drawn smaller than life, which nothing here does.`);
  ok(S.exag.gap > S.exag.lumen, 'the stromal gap in a stack is the thinner thing and should be stretched harder than the lumen.');
  ok(S.down && S.down.thylakoid === 'LightReactions', 'SCALE.down does not hand the thylakoid to LightReactions.');
}

/* 6. no Calvin cycle */
{
  for (const n of CH.ORDER)
    ok(!/calvin|rubisco|g3p|co2/i.test(n), `part "${n}" is the Calvin cycle, which the component refuses to own.`);
  ok(/REFUSES TO BE/.test(src('cell/chloroplast.js')), 'the header no longer says what the component refuses to own.');
}

/* 7. the words */
{
  for (const n of CH.ORDER) {
    const e = CH.LIBRARY[n];
    ok(e && e.text, `part "${n}" has no label.`);
    if (!e || !e.card) { failures.push(`part "${n}" has no card.`); continue; }
    const sentences = e.card.split(/[.!?](\s|$)/).filter(x => x.trim().length > 3).length;
    ok(sentences >= 2 && sentences <= 3, `"${n}" card is ${sentences} sentences; the contract is two.`);
    ok(!/—/.test(e.card), `"${n}" card uses an em dash.`);
  }
  for (const n of Object.keys(CH.VIEWS))
    ok(CH.ORDER.includes(n), `VIEWS names "${n}", which is not a part.`);
  for (const n of CH.PLACES)
    ok(CH.ORDER.includes(n), `PLACES names "${n}", which is not a part.`);
}

if (failures.length) {
  console.error('check-chloroplast: ' + failures.length + ' failure(s)');
  for (const f of failures) console.error('  · ' + f);
  process.exit(1);
}
console.log('check-chloroplast: ok');
