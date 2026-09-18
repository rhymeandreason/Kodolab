/* =============================================================================
 *  membrane/chemiosmosis.js — the proton circuit, as arithmetic.
 * =============================================================================
 *  NO THREE, NO DOM. Same split as pump.js: this file decides what the proton
 *  gradient IS and what the synthase is allowed to do with it, membrane.js
 *  draws the result, and check-chemiosmosis.js runs this in node.
 *
 *  Respiration and photosynthesis are one picture, mirrored. Something with
 *  energy to spend pumps protons across a membrane; ATP synthase lets them
 *  back down and makes ATP on the way. The sim's own words are `inside` (−y,
 *  the BOTTOM of the screen) and `outside` (+y, the top), and a CONTEXT says
 *  what those two halves are called AND which way the pumping runs:
 *
 *      plasma          top = outside the cell,     bottom = the cytosol
 *      mitochondrion   top = intermembrane space,  bottom = the matrix
 *      thylakoid       top = the stroma,           bottom = the lumen
 *
 *  A MITOCHONDRION PUMPS UP AND A THYLAKOID PUMPS DOWN, because every textbook
 *  cross-section puts the enclosed compartment at the bottom: the matrix
 *  there, and the lumen there too. So the pumped-into half is the top one in a
 *  mitochondrion and the bottom one in a thylakoid, and `pumpTo` is a real
 *  parameter rather than a label. Everything downstream — which side the
 *  synthase admits from, which way the pmf points, which mouth the complex
 *  loads at — is read off it, so the two organelles are one physics reflected
 *  rather than one physics renamed.
 *
 *  STOICHIOMETRY IS THE COMPONENT'S. A c-ring turn is one full rotation of
 *  the rotor and makes `atpPerTurn` ATP for `protonsPerTurn` protons, and a
 *  mitochondrion's ring is not a chloroplast's, so rotor() takes the ring
 *  from whoever builds it: chemiosmosis/electron-transport.js declares the
 *  c8, chemiosmosis/light-reactions.js the c14. The chain tables, the fuels
 *  and what the electrons end on live in those two files too; what is here
 *  is only what both run on.
 *
 *  pH IS EXAGGERATED and in one number. A drawn proton stands for a great
 *  many, so PROTONS_PER_PH says how many drawn ones make a pH unit. Without
 *  it a dozen particles would read as six pH units.
 * ========================================================================== */
(function (global) {
  'use strict';

  const PROTONS_PER_PH = 24;      // drawn protons per pH unit (exaggeration)
  const PH_REF = 7.0;             // both sides start here, before any pumping
  const MV_PER_PH = 61;           // Nernst at 37 C, the same 61 membrane.js uses
  /* RESPIRATORY CONTROL. The complexes are pushing protons against the force
     they have already built, so they slow as it rises and stall near the top.
     This is why a cell that is not spending ATP stops burning fuel, and in
     the sim it is also what keeps protons on both sides: without it the
     complexes empty the matrix and the picture dies. ~200 mV is the measured
     resting pmf of a mitochondrion. */
  const PMF_STALL = 220;
  /* The membrane voltage an organelle context runs to, rather than the
     plasma membrane's −90: the inner membrane sits near −180 mV. */
  const DPSI_FLOOR = -180;

  /* `organelle` NAMES a palette entry rather than carrying a colour. This
     file runs in node for the checker and holds no rendering facts; the tint
     is looked up in palette.js by whoever is drawing, which is also what
     stops the membrane and the cut cell from drifting apart. */
  const CONTEXTS = {
    /* THE CYTOSOL, not "inside the cell". Every other context here names its
       compartment — the matrix, the lumen, the stroma — and the plasma
       membrane's was the one that described a direction instead. A lesson
       putting a mitochondrion beside a cell surface has to say that the space
       under one is the space around the other, and it cannot say that with a
       word that only means "not out there". */
    plasma:        { top: 'outside the cell',    bottom: 'the cytosol',     pumpTo: 'top',    organelle: 'plasma' },
    mitochondrion: { top: 'intermembrane space', bottom: 'the matrix',      pumpTo: 'top',    organelle: 'mitochondrion' },
    thylakoid:     { top: 'the stroma',          bottom: 'the lumen',       pumpTo: 'bottom', organelle: 'chloroplast' },
  };
  const ctxOf = context => CONTEXTS[context] || CONTEXTS.plasma;
  /* +1 = the complex fills the TOP half (+y), −1 = the bottom. Every other
     direction in the module is derived from this one, so a context cannot
     half-flip. */
  const pumpDir = context => ctxOf(context).pumpTo === 'top' ? 1 : -1;
  /* `outside` is the top half and `inside` the bottom, always — the sim's
     words for +y and −y, not a claim about the biology. */
  const sideName = (context, side) =>
    side === 'outside' || side === 'top' ? ctxOf(context).top : ctxOf(context).bottom;

  /* pH from a headcount, and the proton-motive force from both terms.
     `mV` is the inside relative to the outside, membrane.js's own sign, so
     pumping protons OUT makes it negative and the electrical term is −mV:
     positive pmf means protons want to come back in. */
  function protonState(counts, mV, ref, dir) {
    const d = dir == null ? 1 : dir;
    const n = ref == null ? (counts.inside + counts.outside) / 2 : ref;
    const pH = {
      inside:  PH_REF - (counts.inside  - n) / PROTONS_PER_PH,
      outside: PH_REF - (counts.outside - n) / PROTONS_PER_PH,
    };
    const dpH = pH.inside - pH.outside;
    /* BOTH TERMS TURN WITH THE PUMPING. Filling the top half drives the inside
       negative and makes −mV the electrical push; filling the bottom half does
       the opposite. One `d` in front of the pair, rather than two sign
       conventions to keep straight, and pmf keeps its meaning: positive means
       the protons want to come back. */
    return { pH, dpH, dPsi: mV, pmf: d * (MV_PER_PH * dpH - mV) };
  }

  /* THE SYNTHASE NEVER RUNS UPHILL. It is a turbine, not a pump: with the
     gradient gone the rotor stops on its own, which is the whole lesson in
     one picture. `slack` is the headcount difference below which the two
     sides count as equal, so a one-particle wobble is not a direction. */
  function synthaseDirection(counts, mV, opts = {}) {
    /* `slack` is in DRAWN PROTONS, not millivolts: a one-particle wobble is
       not a gradient, and the page counts particles. Converted here so the
       threshold moves with the pH exaggeration instead of being a second
       number that can drift from it. */
    const slack = opts.slack == null ? 1 : opts.slack;
    const dir = opts.dir == null ? 1 : opts.dir;
    const floor = MV_PER_PH * (2 * slack / PROTONS_PER_PH);
    const s = protonState(counts, mV, opts.ref, dir);
    /* Home is whichever half the complex is NOT filling: −1 is downward on
       screen, +1 up. A thylakoid's protons come back UP, into the stroma. */
    return s.pmf > floor ? -dir : 0;
  }

  /* The rotor: protons in, angle and ATP out. One place, so the animation and
     the count cannot disagree. `ring` is { protonsPerTurn, atpPerTurn }, the
     component's, and there is no default: a rotor with no ring is a bug. */
  function rotor(ring) {
    if (!ring || !(ring.protonsPerTurn > 0) || !(ring.atpPerTurn > 0)) throw new Error('chemiosmosis: rotor() needs a ring { protonsPerTurn, atpPerTurn }');
    const PPT = ring.protonsPerTurn, APT = ring.atpPerTurn;
    let protons = 0, atp = 0, angle = 0;
    return {
      pass(n = 1) {
        protons += n;
        angle = (protons / PPT) * Math.PI * 2;
        const made = Math.floor(protons * APT / PPT) - atp;
        atp += made;
        return made;
      },
      reset() { protons = atp = angle = 0; },
      get protons() { return protons; },
      get atp() { return atp; },
      get angle() { return angle; },
    };
  }

  /* The complex pumps only while it is fed. `weight` is what the component
     says its fuel is worth as a rate (NADH 1, FADH₂ 0.6, light 1), `fuelRate`
     0..1 is the page's slider, a supply dial or a light dimmer, and it scales
     the turn rate, never the stoichiometry. `pmf` is respiratory control:
     the back-pressure of the gradient already built. */
  function rate(weight, fuelRate, pmf) {
    if (!weight) return 0;
    const back = pmf == null ? 1 : Math.max(0, 1 - pmf / PMF_STALL);
    return weight * Math.max(0, Math.min(1, fuelRate == null ? 1 : fuelRate)) * back;
  }

  /* =====================================================================
     THE COMPLEX'S CYCLE, on pump.js's shape and for pump.js's reason.
     ---------------------------------------------------------------------
     A pump that snaps between an inward-open and an outward-open state has
     drawn a hole with a preference. The pump got a phase table so the
     student sees it TURN and sees both doors shut in between; the complex
     was written with a two-line gate test and read exactly as badly, so it
     gets the same table. Six phases, in a loop:

       1 load-H     inward-open. Two H⁺ step in from the inside.
       2 occlude    the fuel is spent. Both doors shut, the proton locked in.
       3 turn-out   the outer door opens: the machine has turned over.
       4 release-H  the proton leaves, to the outside.
       5 shut-out   the outer door closes on an EMPTY site.
       6 open-in    facing inside again, carrying nothing.

     Phases 5 and 6 are the ones that matter and the ones a shortcut drops.
     Coming back empty is what makes this a pump: a machine that could carry
     a proton home would be the leak it is supposed to prevent, and every
     frame of the return has to show an empty site to say so.

     TWO PROTONS A CYCLE, not one. The three complexes of the chain are drawn
     as a single machine, and a real one moves four H⁺ per pair of electrons,
     so one proton a turn would be the picture undercounting itself as well
     as too slow to build a gradient a student can watch. Two is what the
     site can hold and still read as two objects. Declared here, counted by
     the checker out of the cargo list rather than from this sentence.

     Same coordinates as pump.js: `u` is −1 at the inner mouth, 0 at the
     site, +1 at the outer, and nothing here knows an ångström.
     ===================================================================== */
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  const CPX_PHASES = [
    { id:'load-H',    w:1.2, label:'H⁺ binds',
      caption:'The complex is open to the inside. Two protons step in.' },
    { id:'occlude',   w:0.9, label:'the fuel is spent',
      caption:'Electrons from the fuel pass through, and that is what pays for the next part. Both doors shut, so the proton cannot slip back.' },
    { id:'turn-out',  w:0.9, label:'turns outward',
      caption:'The complex changes shape and opens to the other side instead.' },
    { id:'release-H', w:1.0, label:'H⁺ leaves',
      caption:'The protons are let go on the far side, where protons are already crowded. That is the uphill part, and the fuel just paid for it.' },
    { id:'shut-out',  w:0.7, label:'shuts, empty',
      caption:'The outer door closes on an empty site.' },
    { id:'open-in',   w:0.9, label:'turns back, carrying nothing',
      caption:'It faces inside again with nothing in it. A machine that could carry a proton home would be the leak it exists to prevent.' },
  ];
  const CPX_TOTAL = CPX_PHASES.reduce((s, p) => s + p.w, 0);
  const CPX_BOUNDS = (() => {
    const b = []; let acc = 0;
    for (const p of CPX_PHASES) { b.push([acc / CPX_TOTAL, (acc + p.w) / CPX_TOTAL, p]); acc += p.w; }
    return b;
  })();
  const cpxStartOf = id => (CPX_BOUNDS.find(b => b[2].id === id) || [0])[0];

  function cpxLocate(t) {
    const p = ((t % 1) + 1) % 1;
    for (const [lo, hi, ph] of CPX_BOUNDS) if (p >= lo && p < hi) return { phase: ph, k: (p - lo) / (hi - lo), p };
    const last = CPX_BOUNDS[CPX_BOUNDS.length - 1];
    return { phase: last[2], k: 1, p };
  }
  /* Explicit endpoints rather than derived, for pump.js's reason: no row
     here has both gates open, and no row interpolates between two open
     states. That is easier to read than to infer. */
  function cpxGatesOf(id, k) {
    switch (id) {
      case 'load-H':    return { top:0, bottom:1 };
      case 'occlude':   return { top:0, bottom:1 - smooth(k) };
      case 'turn-out':  return { top:smooth(k), bottom:0 };
      case 'release-H': return { top:1, bottom:0 };
      case 'shut-out':  return { top:1 - smooth(k), bottom:0 };
      case 'open-in':   return { top:0, bottom:smooth(k) };
    }
    throw new Error('chemiosmosis: unknown complex phase ' + id);
  }
  const CPX_PROTONS = 2;
  /* Spread in `u`, so two protons are two objects rather than one lump and
     the spread stays proportional if the protein resizes. pump.js's trick.
     `n` is how many the site holds: the lumped complex's CPX_PROTONS, or one
     complex of the split chain's CHAIN[k].pumps. */
  const cpxH = (u, a, n) => { const out = [], s = n > 2 ? 0.07 : 0.10;
    for (let i = 0; i < n; i++) out.push({ species:'H', u: u + (i - (n - 1) / 2) * s, alpha: a });
    return out; };
  function cpxCargoOf(id, k, n) {
    switch (id) {
      case 'load-H':    return cpxH(mix(-1, 0, smooth(k)), clamp01(k * 3), n);
      case 'occlude':
      case 'turn-out':  return cpxH(0, 1, n);
      case 'release-H': return cpxH(mix(0, 1, smooth(k)), clamp01((1 - k) * 2.2), n);
      default:          return [];        // shut-out and open-in carry nothing, and that is the point
    }
  }
  /* at(t) — t counts CYCLES, not seconds, so a scrubber and an autoplay
     share one path. */
  function complexAt(t, n) {
    const m = n == null ? CPX_PROTONS : n;
    const { phase, k, p } = cpxLocate(t);
    return { t:p, phase:phase.id, label:phase.label, caption:phase.caption,
             gates: cpxGatesOf(phase.id, k), cargo: cpxCargoOf(phase.id, k, m),
             protonsPerCycle: m, direction: 'inside → outside' };
  }
  function complexSelfTest(steps, n) {
    const N = steps || 4000, failures = [];
    const OPEN = 0.15;
    for (let i = 0; i < N; i++) {
      const t = i / N, s = complexAt(t, n);
      const { top, bottom } = s.gates;
      if (top > OPEN && bottom > OPEN)
        failures.push(`t=${t.toFixed(4)} (${s.phase}): BOTH gates open — top ${top.toFixed(2)}, bottom ${bottom.toFixed(2)}. That is a leak, not a pump.`);
      for (const c of s.cargo) {
        if (c.alpha < .02) continue;
        if (c.u > 0.25 && top <= OPEN) failures.push(`t=${t.toFixed(4)} (${s.phase}): H⁺ at u=${c.u.toFixed(2)} with the outer gate shut.`);
        if (c.u < -0.25 && bottom <= OPEN) failures.push(`t=${t.toFixed(4)} (${s.phase}): H⁺ at u=${c.u.toFixed(2)} with the inner gate shut.`);
      }
    }
    for (let i = 0; i <= CPX_PHASES.length; i++) {
      const t = (CPX_BOUNDS[i % CPX_PHASES.length] || CPX_BOUNDS[0])[0];
      const a = complexAt(t - 1e-6).gates, b = complexAt(t + 1e-6).gates;
      if (Math.abs(a.top - b.top) > .02 || Math.abs(a.bottom - b.bottom) > .02)
        failures.push(`phase boundary at t=${t.toFixed(4)}: gates jump (${a.top.toFixed(2)},${a.bottom.toFixed(2)}) -> (${b.top.toFixed(2)},${b.bottom.toFixed(2)}).`);
    }
    return { ok: failures.length === 0, failures, steps: N };
  }
  const Complex = { at: complexAt, selfTest: complexSelfTest, PHASES: CPX_PHASES, startOf: cpxStartOf, PROTONS_PER_CYCLE: CPX_PROTONS };

  /* THE CHAIN, WALKED. A component's table is { key: { takes, gives, ... } },
     one row per machine; the path a fuel takes is followed from the row that
     takes `start` until one gives `end`, so what a fuel is worth is summed
     off the table by whoever owns it rather than typed. Empty if the chain
     does not close. */
  function chainPath(T, start, end) {
    const path = [];
    let want = start;
    for (let guard = 0; want && guard < 8; guard++) {
      const k = Object.keys(T).find(c => T[c].takes === want);
      if (!k) break;
      path.push(k);
      if (T[k].gives === end) return path;
      want = T[k].gives;
    }
    return [];
  }

  /* O₂ + 4e⁻: the chemistry both chains meet, made at one end and consumed at the other. */
  const E_PER_O2 = 4;
  const API = { PROTONS_PER_PH, PH_REF, MV_PER_PH, PMF_STALL, DPSI_FLOOR,
                CONTEXTS, sideName, pumpDir, protonState, synthaseDirection, rotor, rate, Complex, chainPath, E_PER_O2 };
  global.Chemiosmosis = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
