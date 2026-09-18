#!/usr/bin/env node
/* =====================================================================
 *  check-electron-transport.js — what the respiratory chain may claim.
 *
 *  The claims that ship looking fine when broken: a fuel worth more than
 *  its path pumps, an ATP that costs nothing to export, a chain that keeps
 *  pumping with the oxygen gone, and a carrier that vanishes instead of
 *  leaving spent. The arithmetic is free of THREE, so all of it runs here.
 *
 *  Run:  node chemiosmosis/check-electron-transport.js
 * ===================================================================== */
'use strict';

const C = require('../membrane/chemiosmosis.js');
const ET = require('./electron-transport.js');

let bad = 0;
const fail = m => { console.error('  FAIL  ' + m); bad++; };
const ok   = m => console.log('  ok    ' + m);
const is   = (cond, m) => cond ? ok(m) : fail(m);

/* ---- 1. the ring ---- */
console.log('== 1. the rotor, on the mitochondrion\'s ring');
{
  const R = ET.RING;
  is(R.c === 8, `a mammal's c ring has ${R.c} subunits`);
  is(R.protonsPerTurn % R.atpPerTurn === 0, `${R.protonsPerTurn} H⁺ a turn divide into ${R.atpPerTurn} ATP: a third-turn is a whole number of protons, the declared exaggeration`);
  const r = C.rotor(R);
  let worst = 0;
  for (let i = 1; i <= 5000; i++) { r.pass(1); worst = Math.max(worst, r.atp * R.protonsPerTurn / R.atpPerTurn - r.protons); }
  is(worst <= 0, `over 5000 protons the ATP never outran what was paid (worst ${worst})`);
  is(r.atp === Math.floor(5000 * R.atpPerTurn / R.protonsPerTurn), `${r.atp} ATP for 5000 protons, the declared ${R.atpPerTurn} per ${R.protonsPerTurn}`);
  is(C.PROTONS_PER_TURN === R.protonsPerTurn && C.ATP_PER_TURN === R.atpPerTurn,
     'the core\'s default ring is this one, so an organelle box reading the core agrees with the membrane');
}

/* ---- 2. the fuels ---- */
console.log('\n== 2. the fuels: what each is, and what it becomes');
{
  for (const f of Object.keys(ET.FUELS)) {
    const F = ET.FUELS[f];
    if (!F.spent) fail(`fuel ${f} has no spent form: the carrier that arrives would never change its name`);
    if (!(F.weight > 0)) fail(`fuel ${f} drives nothing`);
    if (!ET.chainPath(f).length) fail(`fuel ${f} has no path to ${ET.ACCEPTOR}`);
  }
  is(ET.FUELS.NADH.spent === 'NAD⁺' && ET.FUELS.FADH2.spent === 'FAD', 'a carrier is not consumed: NADH hands over and leaves as NAD⁺, FADH₂ as FAD');
  is(C.rate(ET.FUELS.NADH.weight, 0) === 0, 'fuelRate 0 is the same as no fuel');
  is(C.rate(ET.FUELS.NADH.weight, 1, 0) > C.rate(ET.FUELS.NADH.weight, 1, C.PMF_STALL / 2), 'a rising pmf slows the complex: respiratory control');
  is(C.rate(ET.FUELS.NADH.weight, 1, C.PMF_STALL) === 0, `the complex stalls at ${C.PMF_STALL} mV`);
  is(C.rate(ET.FUELS.NADH.weight, 1, C.PMF_STALL * 2) === 0, 'and never goes negative, which would be the complex running backwards');
  is(ET.FUELS.FADH2.weight < ET.FUELS.NADH.weight, 'FADH₂ drives the chain slower than NADH: it enters lower');
}

/* ---- 3. the split chain adds up ---- */
console.log('\n== 3. the chain, split: what each fuel is worth');
{
  is(ET.chainPath('NADH').join() === 'I,III,IV', 'NADH enters at complex I and goes I → III → IV');
  is(ET.chainPath('FADH2').join() === 'II,III,IV', 'FADH₂ enters at complex II, past complex I');
  is(ET.CHAIN.II.pumps === 0, 'complex II pumps nothing');
  is(ET.protonsPer('NADH') === 10, `${ET.protonsPer('NADH')} protons per NADH, summed off the table`);
  is(ET.protonsPer('FADH2') === 6, `${ET.protonsPer('FADH2')} protons per FADH₂: the difference is complex I's ${ET.CHAIN.I.pumps}`);
  is(ET.PROTONS_PER_EXPORT === 1, 'getting an ATP out costs one proton at the translocase');
  is(Math.abs(ET.atpPer('NADH') - 2.5) < 0.01 && Math.abs(ET.atpPer('FADH2') - 1.5) < 0.01,
     `${ET.atpPer('NADH')} ATP per NADH, ${ET.atpPer('FADH2')} per FADH₂, with export's ${ET.PROTONS_PER_EXPORT} H⁺ charged per ATP`);
  /* THE SHUTTLES BALANCE: every complex turns once per pair, so whatever a
     complex gives, the next must take in whole trips. */
  for (const k of Object.keys(ET.CHAIN)) {
    const g = ET.CHAIN[k].gives;
    if (g !== ET.ACCEPTOR && 2 % ET.CARRIES[g] !== 0) fail(`${g} carries ${ET.CARRIES[g]} electrons, which does not divide a pair`);
  }
  is(2 / ET.CARRIES.cytc === 2, 'one ubiquinol loads two cytochrome c: it carries a pair, they carry one each');
  /* Every pumping complex is still a pump at its own seat count. */
  for (const k of Object.keys(ET.CHAIN)) {
    const n = ET.CHAIN[k].pumps;
    if (!n) continue;
    const r = C.Complex.selfTest(2000, n);
    if (!r.ok) { r.failures.slice(0, 3).forEach(fail); continue; }
    let seats = 0;
    for (let i = 0; i < 2000; i++) seats = Math.max(seats, C.Complex.at(i / 2000, n).cargo.filter(c => c.alpha > .5).length);
    is(seats === n, `complex ${k}: ${seats} seats, never open both ends`);
  }
  is(C.E_PER_O2 === 4, 'one O₂ takes four electrons: two turns of complex IV');
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
