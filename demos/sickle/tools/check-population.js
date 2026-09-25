#!/usr/bin/env node
/* =====================================================================
 *  check-population.js — the claims behind sickle/population.js
 *
 *  Beat 7 of sickle-lab prints "settles near X%" and shows one village
 *  climbing toward it. Both halves are claims: X is s / (s + t), which is
 *  only right if the sim's selection is the model the formula comes from,
 *  and the village is one seed, which drift could send anywhere. So this
 *  runs the module's own `village()` — the code the page draws — and not
 *  a second implementation.
 *
 *  Run:  node sickle/tools/check-population.js
 * ===================================================================== */
'use strict';
const path = require('path');
const Pop = require(path.join(__dirname, '..', 'population.js'));
global.SickleSteps = undefined;
require(path.join(__dirname, '..', 'sickle-steps.js'));
const { POP } = global.SickleSteps;

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('  FAIL  ' + msg); } };
const note = m => console.log('        · ' + m);

const run = (params, gens) => {
  const V = Pop.village(Object.assign({}, Pop.DEFAULTS, params));
  for (let g = 1; g < gens; g++) V.next();
  return V;
};
const s = Pop.S_MALARIA, t = Pop.S_SICKLE, eq = s / (s + t);

/* 1. The printed equilibrium is the fixed point of the deterministic
   recursion with these fitnesses, reached from either side. */
const recur = q => {
  const p = 1 - q, wAA = 1 - s, wSS = 1 - t;
  const w = p * p * wAA + 2 * p * q + q * q * wSS;
  return (p * q + q * q * wSS) / w;
};
for (const q0 of [0.02, 0.5]) {
  let q = q0;
  for (let i = 0; i < 2000; i++) q = recur(q);
  ok(Math.abs(q - eq) < 1e-6, `recursion from ${q0} lands on s/(s+t)=${eq.toFixed(4)} (got ${q.toFixed(4)})`);
}
ok(Math.abs(run({ malaria: 1 }, 1).state().equilibrium - eq) < 1e-12, 'state().equilibrium is s/(s+t)');
note(`equilibrium ${(eq * 100).toFixed(1)}%, carriers there ${(2 * eq * (1 - eq) * 100).toFixed(1)}%`);

/* 2. Carriers never die of either cause: their fitness is the reference. */
{
  const V = run({ malaria: 1, n: 400, start: 0.3, seed: 11 }, 1);
  let bad = 0;
  for (let g = 0; g < 30; g++) {
    for (let i = 0; i < V.n; i++) if (V.a1[i] !== V.a2[i] && V.doom[i]) bad++;
    V.next();
  }
  ok(bad === 0, `no carrier is ever marked to die (${bad} were)`);
}

/* 3. Averaged over seeds and late generations, a malaria village sits on
   the equilibrium; a village without malaria loses the allele. */
{
  let sum = 0, k = 0, drained = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const V = Pop.village(Object.assign({}, Pop.DEFAULTS, { malaria: 1, n: 400, start: eq, seed }));
    for (let g = 1; g < 200; g++) { V.next(); if (g >= 50) { sum += V.state().q; k++; } }
    const W = run({ malaria: 0, n: 400, start: 0.05, seed }, 80);
    if (W.state().q < 0.05) drained++;
  }
  const mean = sum / k;
  ok(Math.abs(mean - eq) < 0.015, `malaria villages average ${(mean * 100).toFixed(1)}%, want ${(eq * 100).toFixed(1)}% ± 1.5`);
  ok(drained >= 20, `without malaria the allele falls in ${drained}/24 villages, want 20+`);
}

/* 4. The run the lesson shows: its seed, its size, its length. The malaria
   side must end near the equilibrium it prints, and the other side lower
   than it started, or the caption is describing a different village. */
{
  const S = run(Object.assign({}, POP, { malaria: 1 }), POP.gens).state();
  const A = run(Object.assign({}, POP, { malaria: 0 }), POP.gens).state();
  note(`lesson run, gen ${POP.gens}: malaria ${(S.q * 100).toFixed(1)}%, none ${(A.q * 100).toFixed(1)}% (start ${POP.start * 100}%)`);
  ok(Math.abs(S.q - eq) < 0.04, `lesson's malaria village ends within 4 points of ${(eq * 100).toFixed(1)}%`);
  ok(A.q < POP.start, 'lesson\'s malaria-free village ends below where it started');
  ok(S.q > A.q + 0.05, 'the two villages end visibly apart');
}

console.log(`\ncheck-population: ${checks - fails}/${checks} passed`);
process.exit(fails ? 1 : 0);
