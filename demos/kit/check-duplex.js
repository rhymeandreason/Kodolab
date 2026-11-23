/* =============================================================================
 *  kit/check-duplex.js — kit/duplex.js's helix is B-DNA, and its nucleosome
 *  is 1AOI's
 * =============================================================================
 *  · RIGHT-HANDED. A left-handed ideal helix renders just as well.
 *  · RISE AND TWIST are what was asked for, straight and along a curve.
 *  · THE GROOVES: C1' to C1' across every pair is 10.5 A, so the strands are
 *    not opposite each other.
 *  · ANTIPARALLEL: strand B's arrays run the other way, and pair i of A meets
 *    B's 2n-i, the numbering a bake has.
 *  · NucleicLib builds it with no NaN, one rung half per base.
 *  · NUCLEOSOME re-fitted from proteins/nucleosome/data/nucleosome-1AOI.json:
 *    radius, pitch, rise, bp per turn, handedness, chain length.
 * ============================================================================= */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');

const THREE = {
  BufferGeometry: function () {
    this.attributes = {};
    this.setAttribute = (k, v) => { this.attributes[k] = v; };
    this.setIndex = i => { this.index = i; };
    this.computeBoundingSphere = () => {};
  },
  Float32BufferAttribute: function (a, n) { this.array = a; this.itemSize = n; },
};
global.NucleicLib = require(path.join(__dirname, 'nucleic.js'));
const Duplex = require(path.join(__dirname, 'duplex.js'));

const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map(v => v * s), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), unit = a => mul(a, 1 / (len(a) || 1));

let bad = 0;
const ok = (pass, msg, detail) => {
  console.log('  ' + (pass ? 'ok   ' : 'FAIL ') + msg + (detail ? '   ' + detail : ''));
  if (!pass) bad++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* Helix parameters off a trace's own coordinates: an `win`-bp moving average
   of the pair midpoints is the axis, and the C1'-C1' vector's rotation about
   it is the twist. Same measurement for an ideal trace and for a bake. */
function helix(tr, win) {
  const A = tr.chains[tr.order[0]], Bc = tr.chains[tr.order[1]];
  const find = (ch, n) => { const i = ch.nums.indexOf(n); return i < 0 ? null : { C1: ch.C1[i], P: ch.P[i] }; };
  const pr = tr.pairs.filter(p => p.a[0] === tr.order[0])
    .map(p => ({ a: find(A, p.a[1]), b: find(Bc, p.b[1]), n: p.a[1] }))
    .filter(p => p.a && p.b).sort((x, y) => x.n - y.n);
  const mids = pr.map(p => mul(add(p.a.C1, p.b.C1), 0.5));
  const W = win, ax = [];
  for (let i = W; i < mids.length - W; i++) {
    let s = [0, 0, 0];
    for (let k = -W; k <= W; k++) s = add(s, mids[i + k]);
    ax.push(mul(s, 1 / (2 * W + 1)));
  }
  let L = 0, tw = 0, steps = 0, hand = 0, c1c1 = 0;
  for (let j = 1; j < ax.length; j++) {
    const i = j + W, T = unit(sub(ax[j], ax[j - 1]));
    L += len(sub(ax[j], ax[j - 1]));
    const v0 = unit(sub(pr[i - 1].a.C1, pr[i - 1].b.C1)), v1 = unit(sub(pr[i].a.C1, pr[i].b.C1));
    const r0 = unit(sub(v0, mul(T, dot(v0, T)))), r1 = unit(sub(v1, mul(T, dot(v1, T))));
    const a = Math.atan2(dot(cross(r0, r1), T), dot(r0, r1));
    tw += a; hand += Math.sign(a); steps += pr[i].n - pr[i - 1].n;
  }
  pr.forEach(p => { c1c1 += len(sub(p.a.C1, p.b.C1)); });
  const span = pr[pr.length - 1 - W].n - pr[W].n;
  return { pr, ax, rise: L / span, bpPerTurn: 2 * Math.PI / (tw / steps), right: hand > 0, c1c1: c1c1 / pr.length };
}

/* Superhelix fitted to an axis polyline: plane of least variance, circle fit
   in it, height against unwrapped angle. */
function solve(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
    [m[i], m[p]] = [m[p], m[i]];
    for (let r = 0; r < 3; r++) if (r !== i) { const f = m[r][i] / m[i][i]; for (let k = i; k < 4; k++) m[r][k] -= f * m[i][k]; }
  }
  return m.map((r, i) => r[3] / r[i]);
}
function superFit(ax) {
  const c = mul(ax.reduce(add, [0, 0, 0]), 1 / ax.length);
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  ax.forEach(p => { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += d[i] * d[j]; });
  let z = [1, 1, 1];
  for (let it = 0; it < 60; it++) z = unit(solve(M, z));
  const ex = unit(cross(z, Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), ey = cross(z, ex);
  const P = ax.map(p => { const d = sub(p, c); return [dot(d, ex), dot(d, ey), dot(d, z)]; });
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
  P.forEach(([x, y]) => { const v = [x, y, 1], q = -(x * x + y * y); for (let i = 0; i < 3; i++) { r[i] += v[i] * q; for (let j = 0; j < 3; j++) S[i][j] += v[i] * v[j]; } });
  const [D, E, F] = solve(S, r), cx = -D / 2, cy = -E / 2, R = Math.sqrt(cx * cx + cy * cy - F);
  let prev = null, acc = 0;
  const ah = P.map(([x, y, h]) => {
    const a = Math.atan2(y - cy, x - cx);
    if (prev !== null) { let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; acc += d; }
    prev = a; return [acc, h];
  });
  const n = ah.length, ma = ah.reduce((s, a) => s + a[0], 0) / n, mh = ah.reduce((s, a) => s + a[1], 0) / n;
  let sxy = 0, sxx = 0;
  ah.forEach(([a, h]) => { sxy += (a - ma) * (h - mh); sxx += (a - ma) ** 2; });
  const slope = sxy / sxx;
  return { R, pitch: Math.abs(slope * 2 * Math.PI), left: slope * acc < 0 };
}

if (require.main !== module) { module.exports = { helix, superFit }; return; }

console.log('duplex: straight');
{
  const tr = Duplex.trace({ n: 40, seed: 7 });
  const h = helix(tr, 5);
  ok(h.right, 'right-handed');
  ok(near(h.rise, Duplex.B.rise, 0.02), 'rise', h.rise.toFixed(3) + ' A');
  ok(near(h.bpPerTurn, Duplex.B.bpPerTurn, 0.05), 'bp per turn', h.bpPerTurn.toFixed(2));
  ok(near(h.c1c1, Duplex.B.c1c1, 0.01), "C1'-C1' across a pair", h.c1c1.toFixed(2) + ' A');
  const A = tr.chains.A, Bc = tr.chains.B;
  const dA = sub(A.P[A.P.length - 1], A.P[0]), dB = sub(Bc.P[Bc.P.length - 1], Bc.P[0]);
  ok(dot(dA, dB) < 0, 'strand B runs antiparallel');
  ok(tr.pairs.every((p, i) => p.b[1] === 2 * 40 - i && 'AT TA GC CG'.includes(p.bases)), 'pairs: A(i) with B(2n-i), Watson-Crick');
  const parts = NucleicLib.build(THREE, tr, { sub: 4 });
  const arrays = [...parts.strands.map(s => s.geo), ...Object.values(parts.rungs)].map(g => g.attributes.position.array);
  ok(arrays.every(a => a.every(Number.isFinite)), 'NucleicLib builds it with no NaN');
  const halves = Object.values(parts.rungs).reduce((s, g) => s + g.attributes.position.array.length / 3 / 24, 0);
  ok(Math.round(halves) === 80 && !Object.keys(parts.stubs).length, 'one rung half per base, no stubs', Math.round(halves) + ' halves');
}

console.log('duplex: NUCLEOSOME against 1AOI');
{
  const bake = require(path.join(ROOT, 'proteins/nucleosome/data/nucleosome-1AOI.json'));
  const na = bake.order.filter(k => bake.chains[k].kind === 'na');
  const N = Duplex.NUCLEOSOME;
  ok(na.every(k => bake.chains[k].nums.length === N.bp), 'bp is the chain length', String(bake.chains[na[0]].nums.length));
  const real = helix({ order: na, chains: bake.chains, pairs: bake.pairs }, 5), rf = superFit(real.ax);
  const tr = Duplex.trace({ axis: Duplex.superhelix({}), n: N.bp, fit: true, bpPerTurn: N.bpPerTurn });
  const ideal = helix(tr, 5), idf = superFit(ideal.ax);
  ok(real.right && ideal.right, 'DNA right-handed, crystal and ideal');
  ok(rf.left && idf.left, 'superhelix left-handed, crystal and ideal');
  ok(near(tr.rise, N.rise, 0.01), 'the ideal wrap is bp x rise long', tr.rise.toFixed(3) + ' A');
  const cmp = (name, a, b, tol) => ok(near(a, b, tol), name + ', ideal vs crystal', a.toFixed(2) + ' / ' + b.toFixed(2));
  cmp('radius', idf.R, rf.R, 0.15);
  cmp('pitch', idf.pitch, rf.pitch, 0.3);
  cmp('rise', ideal.rise, real.rise, 0.02);
  cmp('bp per turn (twist survives the curvature)', ideal.bpPerTurn, real.bpPerTurn, 0.1);
}

if (bad) { console.log('\n' + bad + ' failed'); process.exit(1); }
console.log('\nall ok');
