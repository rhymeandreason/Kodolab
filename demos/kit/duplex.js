/* =============================================================================
 *  kit/duplex.js — Duplex: an ideal B-DNA along any path, as a NucleicLib trace
 * =============================================================================
 *  kit/nucleic.js draws a ladder from a BAKE: deposited coordinates. A scene
 *  that wants DNA as a prop (a strand floating in a buffer, chromatin wrapped
 *  on histones, a bundle of precipitated helices) has no deposition to read,
 *  and drawing its own helix is how a page ends up with tubes, balls and two
 *  sticks per pair instead of the house ladder. This writes the trace a baker
 *  would have, from B-DNA's own geometry, so the drawing is NucleicLib's and
 *  the colours are palette.js's.
 *
 *    const tr = Duplex.trace({ n: 40, seed: 3 });            // straight, along +x
 *    const tr = Duplex.trace({ axis: pts, fit: true });      // along a path, in A
 *    const g  = Duplex.group(THREE, tr, { scale: 0.1 });     // a THREE.Group, house colours
 *
 *  ANGSTROMS, like every bake. `group`'s `scale` is the one place a scene in
 *  nanometres says so.
 *
 *  THE AXIS FRAME IS PARALLEL-TRANSPORTED, not Frenet. Twist is measured
 *  against a frame that does not itself rotate around the path; a Frenet
 *  frame turns with the path's curvature, so on a superhelix it would add the
 *  wrap's own rotation to the helix's and miscount the turns.
 *
 *  THE GROOVES ARE THERE. The two strands' C1' atoms are not opposite each
 *  other: a Watson-Crick pair spans C1' to C1' in 10.5 A, which at a 5.9 A
 *  radius is a 126 degree chord, so one groove is narrow and one wide. Put
 *  the strands 180 degrees apart (kit/check-nucleic.js does, on purpose, to
 *  keep its own geometry trivial) and the helix has no major groove, which is
 *  where every protein that reads DNA binds.
 *
 *  An ideal helix is a prop, not a structure: no sequence-dependent roll,
 *  propeller or groove width. A page whose claim is about any of those reads
 *  a deposition through kit/proteinbox.js instead.
 *
 *  Needs kit/nucleic.js for `group`; `trace` needs nothing. Palette from
 *  lib/palette.js (MolPalette) when it is loaded, else NucleicLib's caller
 *  passes `colours`. kit/check-duplex.js asserts the geometry, and NUCLEOSOME
 *  against 1AOI's own coordinates.
 * ============================================================================= */
const Duplex = (function () {
  'use strict';

  /* B-DNA fibre geometry (Arnott). Radii are to the helix axis. */
  const B = {
    rise: 3.38,        /* A per base pair along the axis */
    bpPerTurn: 10.5,
    rP: 8.9,           /* phosphorus */
    rC1: 5.9,          /* C1' */
    c1c1: 10.5,        /* C1' to C1' across a Watson-Crick pair */
  };

  /* A nucleosome core's superhelix, calibrated against 1AOI's DNA: these are
     the inputs whose ideal wrap, measured the way 1AOI is measured, gives
     1AOI's numbers. The measurement (an 11-bp moving average of pair
     midpoints as the axis, a circle fit in its plane of least variance,
     height against wound angle) reads both about 1 A narrow and 5 A flat,
     because a pair's midpoint sits 2.7 A off the axis on the minor-groove
     side; fitting raw numbers instead would build a wrap the same method
     then measures as tighter than the crystal. kit/check-duplex.js
     re-measures both and fails on a disagreement. LEFT-handed superhelix
     around the octamer, right-handed B-DNA along it. */
  const NUCLEOSOME = {
    bp: 146,           /* 1AOI's chains */
    radius: 41.3,
    pitch: 27.3,
    rise: 3.35,
    bpPerTurn: 10.34,
  };

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const n = len(a); return n > 1e-9 ? mul(a, 1 / n) : [1, 0, 0]; };
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const PARTNER = { A: 'T', T: 'A', G: 'C', C: 'G' };

  /* Arc-length table of a polyline, and a point + tangent at distance s.
     Past either end the path continues straight along its end tangent. */
  function arc(pts) {
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + len(sub(pts[i], pts[i - 1])));
    const total = L[L.length - 1];
    function at(s) {
      let i = 1;
      if (s <= 0) i = 1; else if (s >= total) i = pts.length - 1;
      else { let lo = 1, hi = pts.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (L[m] < s) lo = m + 1; else hi = m; } i = lo; }
      const seg = L[i] - L[i - 1] || 1e-9;
      const t = unit(sub(pts[i], pts[i - 1]));
      return { p: lerp3(pts[i - 1], pts[i], (s - L[i - 1]) / seg), t };
    }
    return { total, at };
  }

  /* ---- trace ----
   *  opts: n (pairs) | seq (strand A, 5'→3'; its complement is strand B)
   *        axis: [[x,y,z], …] in A, default a straight line on +x centred on 0
   *        fit:  spread the n pairs over the whole axis (rise = L/(n-1));
   *              otherwise they sit at `rise`, centred on the path
   *        rise, bpPerTurn, phase (radians), seed (for a random sequence)
   *  Returns a bake-shaped trace: {order, chains:{A,B}, pairs}, B antiparallel. */
  function trace(opts) {
    const o = Object.assign({ phase: 0, seed: 1 }, opts || {});
    const r = rng(o.seed);
    let seq = o.seq ? o.seq.toUpperCase() : null;
    const rise0 = o.rise || B.rise;
    let n = seq ? seq.length : o.n;
    const axis = o.axis || (() => {
      const m = n || 12, h = (m - 1) * rise0 / 2;
      return [[-h, 0, 0], [h, 0, 0]];
    })();
    const A = arc(axis);
    if (!n) n = Math.max(2, Math.floor(A.total / rise0) + 1);
    if (!seq) seq = Array.from({ length: n }, () => 'ATGC'[Math.floor(r() * 4)]).join('');
    const rise = o.fit ? A.total / (n - 1) : rise0;
    const s0 = o.fit ? 0 : (A.total - (n - 1) * rise) / 2;
    const tw = 2 * Math.PI / (o.bpPerTurn || B.bpPerTurn);
    const off = 2 * Math.asin(B.c1c1 / (2 * B.rC1));   /* the minor-groove chord */

    /* Parallel transport: carry N along, removing each step's tangent part. */
    const first = A.at(s0);
    let N = unit(sub([0, 1, 0], mul(first.t, dot([0, 1, 0], first.t))));
    if (len(cross(first.t, [0, 1, 0])) < 1e-3) N = unit(cross(first.t, [0, 0, 1]));
    const ra = { P: [], C1: [], Bc: [], Bn: [] }, rb = { P: [], C1: [], Bc: [], Bn: [] };
    const mids = [];
    for (let i = 0; i < n; i++) {
      const { p, t } = A.at(s0 + i * rise);
      N = unit(sub(N, mul(t, dot(N, t))));
      const Bv = cross(t, N);                          /* N x B = t: right-handed */
      const a = o.phase + i * tw, b = a + off;
      const dirA = add(mul(N, Math.cos(a)), mul(Bv, Math.sin(a)));
      const dirB = add(mul(N, Math.cos(b)), mul(Bv, Math.sin(b)));
      const c1a = add(p, mul(dirA, B.rC1)), c1b = add(p, mul(dirB, B.rC1));
      const mid = mul(add(c1a, c1b), 0.5);
      ra.P.push(add(p, mul(dirA, B.rP))); ra.C1.push(c1a); ra.Bc.push(lerp3(c1a, mid, 0.5)); ra.Bn.push(t);
      rb.P.push(add(p, mul(dirB, B.rP))); rb.C1.push(c1b); rb.Bc.push(lerp3(c1b, mid, 0.5)); rb.Bn.push(t);
      mids.push(mid);
    }
    /* Strand B runs 3'←5' along the axis, so its arrays are reversed: index j
       of B is the partner of A's n-1-j, and numbering continues from A's. */
    const rev = k => rb[k].slice().reverse();
    const seqB = seq.split('').map(c => PARTNER[c] || 'X').reverse().join('');
    const ring = s => s.split('').map(c => (c === 'A' || c === 'G') ? 'R' : 'Y').join('');
    const chA = { kind: 'na', first: 1, nums: seq.split('').map((_, i) => i + 1), seq, ring: ring(seq),
                  P: ra.P, C1: ra.C1, Bc: ra.Bc, Bn: ra.Bn };
    const chB = { kind: 'na', first: n + 1, nums: seqB.split('').map((_, j) => n + 1 + j), seq: seqB, ring: ring(seqB),
                  P: rev('P'), C1: rev('C1'), Bc: rev('Bc'), Bn: rev('Bn') };
    const pairs = [];
    for (let i = 0; i < n; i++) {
      pairs.push({ a: ['A', i + 1], b: ['B', 2 * n - i], bases: seq[i] + PARTNER[seq[i]], kind: 'wc', mid: mids[i] });
    }
    return { order: ['A', 'B'], chains: { A: chA, B: chB }, pairs, rise, length: A.total };
  }

  /* ---- superhelix ----
   *  The axis of DNA wound `turns` times around a cylinder, as a polyline in A.
   *  Centred on `centre`; `axis` is the cylinder's, `dyad` the direction from
   *  the centre to the middle of the wrap. Left-handed by default. Defaults
   *  are a nucleosome core's, and the length is NUCLEOSOME.bp at its rise. */
  function superhelix(opts) {
    const o = Object.assign({ centre: [0, 0, 0], axis: [0, 0, 1], dyad: [0, -1, 0], hand: 'left', samples: 160 },
                            NUCLEOSOME, opts || {});
    const D = unit(o.axis), u = unit(sub(o.dyad, mul(D, dot(o.dyad, D)))), v = cross(D, u);
    const per = Math.hypot(2 * Math.PI * o.radius, o.pitch);
    const turns = o.turns || ((o.bp - 1) * o.rise) / per;
    const tMax = Math.PI * turns, sgn = o.hand === 'left' ? -1 : 1;
    const pts = [];
    for (let k = 0; k <= o.samples; k++) {
      const th = -tMax + 2 * tMax * k / o.samples;
      const h = sgn * o.pitch * th / (2 * Math.PI);
      pts.push(add(o.centre, add(add(mul(u, o.radius * Math.cos(th)), mul(v, o.radius * Math.sin(th))), mul(D, h))));
    }
    return pts;
  }

  /* A cubic Hermite from point a heading ta to point b heading tb: linker DNA
     between two wraps, or a tail. Tangents are unit; `k` scales them by the
     gap, 1 being a natural bend. */
  function hermite(a, ta, b, tb, samples, k) {
    const d = len(sub(b, a)) * (k || 1), m0 = mul(unit(ta), d), m1 = mul(unit(tb), d), out = [];
    for (let i = 0; i <= samples; i++) {
      const s = i / samples, s2 = s * s, s3 = s2 * s;
      out.push(add(add(mul(a, 2 * s3 - 3 * s2 + 1), mul(m0, s3 - 2 * s2 + s)),
                   add(mul(b, -2 * s3 + 3 * s2), mul(m1, s3 - s2))));
    }
    return out;
  }

  /* Join polylines end to end, dropping each joint's duplicate point. */
  function join(...parts) {
    const out = [];
    parts.forEach(p => p.forEach((q, i) => { if (i || !out.length || len(sub(q, out[out.length - 1])) > 1e-6) out.push(q); }));
    return out;
  }

  /* ---- group ----
   *  NucleicLib's ladder as a THREE.Group: one mesh per strand and per base,
   *  in palette.js's `strands` and `bases`. opts: scale (scene units per A),
   *  sub (spline samples per nucleotide; 8 is tuned at a card's 40 A framing,
   *  4 is plenty at 40 nm), material(hex) to make a material, colours to
   *  override the palette. `rebuild(trace)` swaps the geometry in place, for
   *  a path that moves. */
  function group(THREE, tr, opts) {
    const o = Object.assign({ scale: 1, sub: 8 }, opts || {});
    const pal = o.colours || (typeof MolPalette !== 'undefined' ? MolPalette : null);
    if (!pal) throw new Error('Duplex.group: load lib/palette.js or pass colours');
    const make = o.material || (hex => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45, metalness: 0 }));
    const mats = { a: make(pal.strands.a), b: make(pal.strands.b) };
    const baseMat = b => (mats[b] = mats[b] || make(pal.bases[b] != null ? pal.bases[b] : pal.bases.X));
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.setScalar(o.scale);
    g.add(inner);
    const meshes = [];
    function rebuild(t) {
      meshes.forEach(m => { inner.remove(m); m.geometry.dispose(); });
      meshes.length = 0;
      const parts = NucleicLib.build(THREE, t, { sub: o.sub });
      parts.strands.forEach(s => meshes.push(new THREE.Mesh(s.geo, s.id === t.order[0] ? mats.a : mats.b)));
      for (const bag of [parts.rungs, parts.stubs]) {
        for (const b of Object.keys(bag)) meshes.push(new THREE.Mesh(bag[b], baseMat(b)));
      }
      meshes.forEach(m => inner.add(m));
    }
    rebuild(tr);
    g.userData.rebuild = rebuild;
    g.userData.materials = mats;
    return g;
  }

  return { trace, superhelix, hermite, join, arc, group, B, NUCLEOSOME };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Duplex;
