/* =============================================================================
 *  proteins/myoglobin/heme-metrics.js — the two numbers only the pocket gives
 * =============================================================================
 *  Iron to whatever is bound, and how far the iron sits out of the porphyrin
 *  plane. Both are MEASURED off the baked pocket rather than quoted, because
 *  every printed number on a myoglobin page has to be one a re-bake could
 *  change.
 *
 *  IT IS SHARED BECAUSE TWO PAGES PRINT THE SAME NUMBER. The bench
 *  (myoglobin-test.html) and the student page (myoglobin-story.html) both say how
 *  far the CO in 1ABS has moved off the iron, and two implementations of that
 *  is two answers waiting to disagree in front of a reader.
 *
 *  Needs nothing. Takes a parsed trace bake with a `pocket`.
 * ============================================================================= */
const HemeMetrics = (function () {
  'use strict';

  const dist = (a, b) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
  const iron = t => t.pocket && t.pocket.atoms.find(a => a.el === 'FE');

  /* Null when nothing is bound, which is deoxy's whole point and not a missing
     number. 1ABS is why this is a measurement and not a lookup: its CO is
     photolysed and sitting in a docking site, so the distance is the evidence
     that the bond is broken. */
  function ironToLigand(t) {
    const fe = iron(t);
    if (!fe) return null;
    const bound = t.pocket.atoms.filter(a => a.group === 'bound');
    if (!bound.length) return null;
    return Math.min(...bound.map(a => dist(fe, a)));
  }

  /* The plane is the four pyrrole nitrogens, and the number is the classic
     one: near zero when something is bound, a few tenths of an angstrom when
     the site is empty and the iron is pulled down towards the proximal
     histidine. Size only, never signed. */
  function ironOutOfPlane(t) {
    const fe = iron(t);
    if (!fe) return null;
    const N = t.pocket.atoms.filter(a => a.group === 'heme' && a.el === 'N');
    if (N.length < 3) return null;
    const c = [0, 1, 2].map(k => N.reduce((s, a) => s + a.p[k], 0) / N.length);
    /* The normal from the two widest in-plane directions: opposite nitrogens,
       which for a porphyrin are N1-N3 and N2-N4 in file order. */
    const v = (a, b) => [0, 1, 2].map(k => a.p[k] - b.p[k]);
    const u = v(N[0], N[2]), w = v(N[1], N[3] || N[2]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2],
               u[0] * w[1] - u[1] * w[0]];
    const L = Math.hypot(...n) || 1;
    return Math.abs([0, 1, 2].reduce((s, k) => s + (fe.p[k] - c[k]) * n[k] / L, 0));
  }

  /* A bond is about 1.8-2.1 A. Past 3 the molecule is sitting NEAR the iron
     rather than on it, which for 1ABS is the entire result. */
  const BROKEN = 3;

  return { iron, dist, ironToLigand, ironOutOfPlane, BROKEN };
})();
