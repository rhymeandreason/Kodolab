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
  /* ATP PER NADPH, linear flow. The Calvin cycle spends 3 ATP for 2 NADPH,
     and a linear chain cannot pay that: the shortfall is why cyclic flow
     exists. Recorded here as the number the page prints, not as balanced. */
  const perATP = LR.RING.protonsPerTurn / LR.RING.atpPerTurn;
  is(Math.abs(LR.atpPerNADPH() - LR.protonsPerPair() / perATP) < 1e-9, `${LR.atpPerNADPH().toFixed(2)} ATP per NADPH on linear flow, at ${perATP.toFixed(2)} H⁺ per ATP`);
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
