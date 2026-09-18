#!/usr/bin/env node
/* =====================================================================
 *  check-light-reactions.js — what the light reactions may claim.
 *
 *  The light ledger: photons per O₂, protons into the lumen per pair and
 *  per O₂, what each ATP costs on the chloroplast's ring, and the ATP each
 *  NADPH comes with. All of it ships looking fine when wrong, and all of
 *  it is arithmetic free of THREE, so it runs here.
 *
 *  Run:  node chemiosmosis/check-light-reactions.js
 * ===================================================================== */
'use strict';

const C = require('../membrane/chemiosmosis.js');
const LR = require('./light-reactions.js');

let bad = 0;
const fail = m => { console.error('  FAIL  ' + m); bad++; };
const ok   = m => console.log('  ok    ' + m);
const is   = (cond, m) => cond ? ok(m) : fail(m);

/* ---- 1. the ring ---- */
console.log('== 1. the rotor, on the chloroplast\'s ring');
{
  const R = LR.RING;
  is(R.c === 14, `a chloroplast's c ring has ${R.c} subunits, not a mammal's 8`);
  is(R.protonsPerTurn === R.c, 'a full turn is one proton per c subunit: the ring is drawn true, not rounded up');
  is(Math.abs(R.protonsPerTurn / R.atpPerTurn - 14 / 3) < 1e-9, `${(R.protonsPerTurn / R.atpPerTurn).toFixed(2)} H⁺ per ATP, more than a mitochondrion's 3`);
  const r = C.rotor(R);
  let worst = 0;
  for (let i = 1; i <= 5000; i++) { r.pass(1); worst = Math.max(worst, r.atp * R.protonsPerTurn / R.atpPerTurn - r.protons); }
  is(worst <= 0, `over 5000 protons the ATP never outran what was paid (worst ${worst})`);
  is(r.atp === Math.floor(5000 * R.atpPerTurn / R.protonsPerTurn), `${r.atp} ATP for 5000 protons, the declared ${R.atpPerTurn} per ${R.protonsPerTurn}`);
  const one = C.rotor(R); one.pass(R.protonsPerTurn);
  is(Math.abs(one.angle - Math.PI * 2) < 1e-9, 'a full turn is a full turn: protonsPerTurn protons, 2 pi');
}

/* ---- 2. light ---- */
console.log('\n== 2. light is the fuel');
{
  is(Object.keys(LR.FUELS).join() === 'light', 'light, and nothing else, drives a thylakoid');
  is(LR.FUELS.light.spent == null, 'light has no spent form, so nothing is drawn arriving or leaving');
  is(C.rate(LR.FUELS.light.weight, 1, 0) > 0 && C.rate(LR.FUELS.light.weight, 0) === 0, 'the dimmer is a rate knob and darkness stops it');
}

/* ---- 3. the chain adds up ---- */
console.log('\n== 3. the light reactions, split: the ledger');
{
  is(LR.chainPath().join() === 'PSII,b6f,PSI', 'water at PSII, then b6f, then PSI to NADP⁺');
  is(LR.CHAIN.PSII.pumps === 0 && LR.CHAIN.PSI.pumps === 0, 'neither photosystem pumps: b6f is the only pump');
  is(LR.protonsPerPair() === 6, `${LR.protonsPerPair()} H⁺ into the lumen per pair: b6f's ${LR.CHAIN.b6f.pumps} plus ${LR.CHAIN.PSII.fromWater} from water`);
  is(LR.protonsPerO2() === 12, `${LR.protonsPerO2()} H⁺ per O₂`);
  is(LR.photonsPerPair() === 4, `${LR.photonsPerPair()} photons per pair: one per electron at each photosystem`);
  is(LR.photonsPerPair() * C.E_PER_O2 / LR.CARRIES.H2O === 8, '8 photons per O₂');
  is(LR.CARRIES.PC === 1 && LR.CARRIES.PQ === 2, 'plastoquinone carries a pair, plastocyanin one electron');
  for (const k of Object.keys(LR.CHAIN)) {
    const g = LR.CHAIN[k].gives;
    if (g !== 'NADP+' && 2 % LR.CARRIES[g] !== 0) fail(`${g} carries ${LR.CARRIES[g]} electrons, which does not divide a pair`);
  }
  const n = LR.CHAIN.b6f.pumps;
  const r = C.Complex.selfTest(2000, n);
  if (!r.ok) r.failures.slice(0, 3).forEach(fail);
  else ok(`b6f: a pump at ${n} seats, never open both ends`);
}

/* ---- 4. cyclic flow balances the ledger ---- */
console.log('\n== 4. ATP per NADPH: linear flow falls short, cyclic flow makes it up');
{
  const perATP = LR.RING.protonsPerTurn / LR.RING.atpPerTurn, calvin = LR.CALVIN.atp / LR.CALVIN.nadph;
  is(calvin === 1.5, `the Calvin cycle spends ${LR.CALVIN.atp} ATP per ${LR.CALVIN.nadph} NADPH`);
  is(LR.protonsPerNADPH(0) === LR.protonsPerPair(), 'linear flow: one NADPH per pair, and the pair\'s protons');
  is(Math.abs(LR.atpPerNADPH(0) - LR.protonsPerPair() / perATP) < 1e-9 && LR.atpPerNADPH(0) < calvin,
     `${LR.atpPerNADPH(0).toFixed(2)} ATP per NADPH on linear flow alone, short of the Calvin cycle's ${calvin}`);
  const f = LR.cyclicToBalance();
  is(f > 0 && f < 1, `${(f * 100).toFixed(0)}% of PSI's turns cyclic balances it`);
  is(Math.abs(LR.atpPerNADPH(f) - calvin) < 1e-9, `${LR.atpPerNADPH(f).toFixed(2)} ATP per NADPH at that share: the Calvin cycle's`);
  is(LR.protonsPerNADPH(f) > LR.protonsPerNADPH(0), `${LR.protonsPerNADPH(f).toFixed(1)} H⁺ per NADPH with cyclic flow against ${LR.protonsPerNADPH(0)} without`);
  is(LR.photonsPerNADPH(f) > LR.photonsPerNADPH(0), `and it costs light: ${LR.photonsPerNADPH(f).toFixed(1)} photons per NADPH against ${LR.photonsPerNADPH(0)}`);
  is(LR.atpPerNADPH(0.5) > LR.atpPerNADPH(f), 'more cyclic flow, more ATP per NADPH: the dial is monotone');
  /* THE DRAWN TURN MATCHES THE TABLE: a cyclic turn is b6f's pumps and PSI's photons, nothing from water. */
  is(LR.CHAIN.b6f.pumps === 4 && LR.CHAIN.PSI.photons === 2, 'a cyclic turn is worth b6f\'s 4 H⁺ for PSI\'s 2 photons, and splits no water');
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
