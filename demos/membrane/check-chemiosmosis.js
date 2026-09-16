#!/usr/bin/env node
/* =====================================================================
 *  check-chemiosmosis.js — the proton circuit cannot cheat.
 *
 *  Four claims, all of which ship looking fine when broken: a synthase
 *  making more ATP than its protons paid for, a gradient that climbs with
 *  the fuel off, a turbine running uphill, and a thylakoid that is not the
 *  same sim as a mitochondrion. chemiosmosis.js is free of THREE so all
 *  four are checkable here rather than by watching a screen.
 *
 *  Run:  node membrane/check-chemiosmosis.js
 * ===================================================================== */
'use strict';

const C = require('./chemiosmosis.js');

let bad = 0;
const fail = m => { console.error('  FAIL  ' + m); bad++; };
const ok   = (m, ...extra) => { if (extra.length) throw new Error(
  'ok() takes a message, not a condition — use is(cond, msg)'); console.log('  ok    ' + m); };
const is   = (cond, m) => cond ? ok(m) : fail(m);

/* ---- 1. ATP is never made for free ---- */
console.log('== 1. stoichiometry, counted rather than declared');
{
  const r = C.rotor();
  let worst = 0;
  for (let i = 1; i <= 5000; i++) {
    r.pass(1);
    worst = Math.max(worst, r.atp * C.PROTONS_PER_ATP - r.protons);
  }
  is(worst <= 0, `over 5000 protons, atp x ${C.PROTONS_PER_ATP} never exceeded the protons through (worst ${worst})`);
  is(r.atp === Math.floor(5000 * C.ATP_PER_TURN / C.PROTONS_PER_TURN),
     `${r.atp} ATP for 5000 protons, the declared ${C.ATP_PER_TURN} per ${C.PROTONS_PER_TURN}`);
  const one = C.rotor(); one.pass(C.PROTONS_PER_TURN);
  is(Math.abs(one.angle - Math.PI * 2) < 1e-9, 'a full turn is a full turn: PROTONS_PER_TURN protons, 2 pi');
}

/* ---- 2. the complex turns, and comes back empty ---- */
console.log('\n== 2. the complex is a machine, not a hole');
{
  const r = C.Complex.selfTest(4000);
  if (r.ok) ok(`${r.steps} samples: gates never both open, no proton past a shut gate, no jumps`);
  else { r.failures.slice(0, 8).forEach(fail); if (r.failures.length > 8) console.error(`  ... and ${r.failures.length - 8} more`); bad++; }

  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(C.Complex.at(i / 2000).phase);
  const missing = C.Complex.PHASES.filter(p => !seen.has(p.id));
  is(missing.length === 0, `${C.Complex.PHASES.length} phases, all reachable`);

  /* THE RETURN IS EMPTY, and that is the whole difference between this and a
     hole. A shortcut that snapped straight back would still look like a
     pump for the half of the cycle a screenshot catches. */
  let carriedBack = 0, outward = 0, inward = 0, last = null;
  for (let i = 0; i < 4000; i++) {
    const s = C.Complex.at(i / 4000);
    const c = s.cargo.find(c => c.alpha > .5);
    if ((s.phase === 'shut-out' || s.phase === 'open-in') && c) carriedBack++;
    if (c && last != null) { if (c.u > last + 1e-9) outward++; if (c.u < last - 1e-9) inward++; }
    last = c ? c.u : null;
  }
  is(carriedBack === 0, 'nothing is in the site on the way back: it returns empty, or it is a leak');
  is(outward > 0 && inward === 0, `the proton only ever moves inside → outside (${outward} samples out, ${inward} back)`);
  /* The count comes out of the CARGO LIST, not out of protonsPerCycle: a
     table that advertises two and seats one is exactly the kind of thing a
     caption then repeats. */
  let seats = 0;
  for (let i = 0; i < 4000; i++) seats = Math.max(seats, C.Complex.at(i / 4000).cargo.filter(c => c.alpha > .5).length);
  is(seats === C.Complex.PROTONS_PER_CYCLE && seats === C.Complex.at(0).protonsPerCycle,
     `${seats} protons a cycle, counted off the seats rather than declared`);
}

/* ---- 3. with no fuel the gradient only falls ---- */
console.log('\n== 3. fuel off: the gradient runs down and never back up');
{
  is(C.complexRate(null, 1) === 0, 'no fuel, no pumping');
  is(C.complexRate('NADH', 0) === 0, 'fuelRate 0 is the same as no fuel');
  /* RESPIRATORY CONTROL: the pumping stops when the force it is pumping
     against gets big enough, which is why a resting cell stops burning. */
  is(C.complexRate('NADH', 1, 0) > C.complexRate('NADH', 1, C.PMF_STALL / 2), 'a rising pmf slows the complex');
  is(C.complexRate('NADH', 1, C.PMF_STALL) === 0, `the complex stalls at ${C.PMF_STALL} mV`);
  is(C.complexRate('NADH', 1, C.PMF_STALL * 2) === 0, 'and never goes negative, which would be the complex running backwards');
  /* NO OXYGEN STOPS THE CHAIN AT THE FAR END, whatever the fuel supply. A
     chain that kept pumping with O₂ gone would make ATP in a suffocating cell. */
  is(C.complexRate('NADH', 1, 0, false) === 0 && C.complexRate('FADH2', 1, 0, false) === 0,
     'no O₂: NADH and FADH₂ both stall, because the electrons have nowhere to go');
  is(C.complexRate('NADH', 1, 0, true) === C.complexRate('NADH', 1, 0), 'O₂ present is the default');
  is(C.complexRate('light', 1, 0, false) > 0, 'a thylakoid ignores oxygen: its electrons end on NADP⁺');
  for (const f of Object.keys(C.FUELS)) if (!(f in C.ACCEPTOR)) fail(`fuel ${f} has no final electron acceptor`);
  let counts = { inside: 10, outside: 50 }, mV = -60, last = Infinity, rose = 0;
  for (let i = 0; i < 200; i++) {
    const dir = C.synthaseDirection(counts, mV);
    if (dir === -1 && counts.outside > 0) { counts.outside--; counts.inside++; mV = Math.min(0, mV + 2.5); }
    const p = C.protonState(counts, mV).pmf;
    if (p > last + 1e-9) rose++;
    last = p;
  }
  is(rose === 0, `pmf non-increasing over 200 returns (rose ${rose} times), ending at ${last.toFixed(1)} mV`);
}

/* ---- 4. the synthase never runs uphill ---- */
console.log('\n== 4. a turbine, not a pump');
{
  is(C.synthaseDirection({ inside: 50, outside: 10 }, 0) === 0, 'gradient inverted: no flow');
  is(C.synthaseDirection({ inside: 30, outside: 30 }, 0) === 0, 'no gradient, no flow, so the rotor stops on its own');
  is(C.synthaseDirection({ inside: 10, outside: 50 }, -60) === -1, 'gradient and voltage both inward: flow');
  /* The electrical term alone is enough — that is what makes it a MOTIVE
     FORCE and not just a pH difference. */
  is(C.synthaseDirection({ inside: 30, outside: 30 }, -80) === -1, 'equal counts but the voltage is inward: the pmf alone drives it, which is why it is a MOTIVE FORCE');
  is(C.synthaseDirection({ inside: 30, outside: 31 }, 0) === 0, 'a one-particle wobble is not a gradient');
  let uphill = 0;
  const r = C.rotor();
  let counts = { inside: 44, outside: 16 };            // backwards from the start
  for (let i = 0; i < 500; i++) {
    if (C.synthaseDirection(counts, 0) === -1) { counts.outside--; counts.inside++; r.pass(1); }
    if (counts.inside > 44) uphill++;
  }
  is(uphill === 0 && r.atp === 0, 'starting inverted, no proton moved and no ATP was made');
}

/* ---- 5. a thylakoid is the mitochondrion mirrored ---- */
console.log('\n== 5. context: the names, and which way the pumping runs');
{
  is(C.pumpDir('mitochondrion') === 1 && C.pumpDir('plasma') === 1, 'a mitochondrion and a cell membrane pump UP the screen');
  is(C.pumpDir('thylakoid') === -1, 'a thylakoid pumps DOWN, because every textbook draws the lumen at the bottom');
  is(C.sideName('mitochondrion', 'inside') === 'the matrix' && C.sideName('thylakoid', 'inside') === 'the lumen',
     'the enclosed compartment is the bottom one in both: the matrix, and the lumen');
  is(C.sideName('thylakoid', 'outside') === 'the stroma', 'the stroma is on top, where the figure puts it');
  is(C.sideName('nonsense', 'inside') === C.sideName('plasma', 'inside'), 'an unknown context falls back to the plasma membrane');

  /* THE MIRROR, checked rather than asserted in prose. Reflecting the scene —
     swapping the two headcounts and negating the voltage — has to give the
     same proton-motive force and the opposite flow, or the two organelles are
     two physics that merely resemble each other. */
  const up = { counts: { inside: 8, outside: 36 }, mV: -70, dir: 1 };
  const down = { counts: { inside: 36, outside: 8 }, mV: 70, dir: -1 };
  const pmfOf = c => C.protonState(c.counts, c.mV, 22, c.dir).pmf;
  const flowOf = c => C.synthaseDirection(c.counts, c.mV, { ref: 22, dir: c.dir });
  is(Math.abs(pmfOf(up) - pmfOf(down)) < 1e-9, `mirrored, the pmf is identical (${pmfOf(up).toFixed(1)} mV both ways)`);
  is(flowOf(up) === -1 && flowOf(down) === 1, 'and the return flow is opposite: down the screen in a mitochondrion, up in a thylakoid');
  is(flowOf({ counts: down.counts, mV: down.mV, dir: 1 }) === 0,
     'a thylakoid read with the wrong direction reports no gradient at all, so a half-flipped context cannot pass unnoticed');

  /* Every context names both halves and says which it fills. */
  for (const k of Object.keys(C.CONTEXTS)) {
    const c = C.CONTEXTS[k];
    if (!c.top || !c.bottom || !c.organelle || (c.pumpTo !== 'top' && c.pumpTo !== 'bottom'))
      fail(`context ${k} is missing a top, a bottom, an organelle or a pumpTo`);
  }
  const names = Object.values(C.CONTEXTS).flatMap(c => [c.top, c.bottom]);
  is(new Set(names).size === names.length, `${Object.keys(C.CONTEXTS).length} contexts, every half named, no name reused`);

  /* EVERY FUEL SAYS WHAT IT BECOMES, because a page draws the spent form as a
     label on the carrier that arrived. A fuel added to FUELS and forgotten
     here renders a token that never changes its name — the token would still
     arrive and leave, and the one thing it exists to show, that the carrier
     comes back reusable, would silently be missing. */
  for (const f of Object.keys(C.FUELS))
    if (!(f in C.SPENT)) fail(`fuel ${f} has no spent form in SPENT`);
  is(C.SPENT.NADH === 'NAD⁺' && C.SPENT.FADH2 === 'FAD',
     'a carrier is not consumed: NADH hands over and leaves as NAD⁺, FADH₂ as FAD');
  is(C.SPENT.light === null, 'light has no spent form, so a thylakoid draws no carrier arriving');
}

/* ---- 6. the split chain adds up ---- */
console.log('\n== 6. the chain, split: what each fuel is worth');
{
  is(C.chainPath('NADH').join() === 'I,III,IV', 'NADH enters at complex I and goes I → III → IV');
  is(C.chainPath('FADH2').join() === 'II,III,IV', 'FADH₂ enters at complex II, past complex I');
  is(C.CHAIN.II.pumps === 0, 'complex II pumps nothing');
  is(C.chainProtons('NADH') === 10, `${C.chainProtons('NADH')} protons per NADH, summed off the table`);
  is(C.chainProtons('FADH2') === 6, `${C.chainProtons('FADH2')} protons per FADH₂: the difference is complex I's ${C.CHAIN.I.pumps}`);
  {
    const per = C.PROTONS_PER_ATP + C.PROTONS_PER_EXPORT, n = C.chainProtons('NADH') / per, f = C.chainProtons('FADH2') / per;
    is(Math.abs(n - 2.5) < 0.01 && Math.abs(f - 1.5) < 0.01, `${n} ATP per NADH, ${f} per FADH₂, with export's ${C.PROTONS_PER_EXPORT} H⁺ charged per ATP`);
  }
  is(C.chainPath('light').join() === 'PSII,b6f,PSI', 'light: water at PSII, then b6f, then PSI to NADP⁺');
  is(C.PHOTO_CHAIN.PSII.pumps === 0 && C.PHOTO_CHAIN.PSI.pumps === 0, 'neither photosystem pumps: b6f is the only pump');
  is(C.chainProtons('light') === 6, `${C.chainProtons('light')} H⁺ into the lumen per pair: b6f's ${C.PHOTO_CHAIN.b6f.pumps} plus ${C.PHOTO_CHAIN.PSII.fromWater} from water`);
  is(C.chainProtons('light') * C.E_PER_O2 / 2 === 12, '12 H⁺ per O₂');
  is(C.chainPhotons('light') === 4, `${C.chainPhotons('light')} photons per pair: one per electron at each photosystem`);
  is(C.CARRIES.PC === 1 && C.CARRIES.PQ === 2, 'plastoquinone carries a pair, plastocyanin one electron');
  /* THE SHUTTLES BALANCE: every complex turns once per pair, so whatever a
     complex gives, the next must take in whole trips. */
  for (const k of Object.keys(C.CHAIN)) {
    const g = C.CHAIN[k].gives;
    if (g !== 'O2' && 2 % C.CARRIES[g] !== 0) fail(`${g} carries ${C.CARRIES[g]} electrons, which does not divide a pair`);
  }
  is(2 / C.CARRIES.cytc === 2, 'one ubiquinol loads two cytochrome c: it carries a pair, they carry one each');
  /* Every pumping complex is still a pump at its own seat count. */
  for (const k of Object.keys(C.CHAIN)) {
    const n = C.CHAIN[k].pumps;
    if (!n) continue;
    const r = C.Complex.selfTest(2000, n);
    if (!r.ok) { r.failures.slice(0, 3).forEach(fail); continue; }
    let seats = 0;
    for (let i = 0; i < 2000; i++) seats = Math.max(seats, C.Complex.at(i / 2000, n).cargo.filter(c => c.alpha > .5).length);
    is(seats === n, `complex ${k}: ${seats} seats, never open both ends`);
  }
}

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
