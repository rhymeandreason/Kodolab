#!/usr/bin/env node
/* =====================================================================
 *  prep.js — the three membrane machines of the light reactions, in the
 *  bilayer's own frame, plus one bake with all three side by side.
 *
 *  Run:  node proteins/photosystems/tools/prep.js   (offline, no dependencies)
 *
 *  WHAT EACH STRUCTURE IS lives in proteins/proteins.js, under three keys
 *  (psii, b6f, psi) sharing this folder. What is left in BAKER below is
 *  how this script reads each file: the COMPND pattern for the core and
 *  the tag that keeps chain ids apart in the lineup.
 *
 *  BAKED FROM THE OPM COPY, as napump is: OPM solves which way a membrane
 *  protein sits and republishes the coordinates with the normal on z and
 *  the bilayer's middle at z = 0. That shared frame is what lets the
 *  lineup stand three unrelated depositions in one membrane without a fit.
 *  The deposition beside it is read for what OPM strips: COMPND, SEQRES,
 *  and the HETATM cofactors.
 *
 *  WHICH CHAIN IS WHICH IS READ, never typed by chain id. A chain's ROLE is
 *  one of four, and only the first two come from its name:
 *
 *    antenna    a light-harvesting protein: COMPND names it LHC or
 *               chlorophyll a/b-binding
 *    core       the candidate's `core` pattern against COMPND: the reaction
 *               centre for a photosystem, the b6 and subunit IV pair for b6f
 *    extrinsic  MEASURED: most of its Cα outside the bilayer OPM solved.
 *               Which face it sits on is the sign, and the baker asserts
 *               the faces agree across all three files (below)
 *    small      everything else: the single-helix subunits
 *
 *  SOURCES. The OPM copies are committed for napump's reason (a second
 *  source a plain RCSB curl does not reproduce); the depositions are
 *  gitignored, so curl them before a re-run:
 *
 *    https://files.rcsb.org/download/<ID>.pdb
 *    https://opm-assets.storage.googleapis.com/pdb/<id>.pdb  -> <ID>-opm.pdb
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const Bake = require('../../bake-lib.js');
const FoldLib = require('../../../folding/folding.js');

const HERE = path.join(__dirname, '..');
const SRC = path.join(HERE, 'data', 'src');
const DATA = path.join(HERE, 'data');

const REG = require('../../proteins.js');
const IO = require('../../tools/registry-io.js');

/* In electron-flow order, which is also the lineup's left-to-right. */
const BAKER = {
  psii: { tag: 'II',  core: /PROTEIN D1|D2 PROTEIN|CP47|CP43/ },
  b6f:  { tag: 'b6f', core: /^CYTOCHROME B6$|SUBUNIT 4$/ },
  psi:  { tag: 'I',   core: /P700/ },
};
const CANDIDATES = Object.entries(BAKER).map(([key, b]) => {
  const p = REG.byKey(key), v = REG.defaultOf(p);
  return Object.assign({ key, id: v.source.id, name: p.name, species: v.species,
                         purpose: v.purpose }, b);
});

const EXTRINSIC = 0.6;   // share of a chain's Cα outside the bilayer
const GAP = 30;          // Å between neighbours in the lineup

/* CHAIN -> MOLECULE NAME off COMPND's MOL_ID blocks; nucleosome's reader. */
function molecules(t) {
  const out = {};
  let name = null;
  for (const line of t.split('\n')) {
    if (!line.startsWith('COMPND')) continue;
    const body = line.slice(10).trim().replace(/;$/, '');
    const m = body.match(/^MOLECULE:\s*(.+)$/);
    if (m) { name = m[1].trim(); continue; }
    const c = body.match(/^CHAIN:\s*(.+)$/);
    if (c && name) for (const id of c[1].split(',').map(x => x.trim())) out[id] = name;
    if (/^MOL_ID:/.test(body)) name = null;
  }
  return out;
}

function halfThickness(text) {
  const line = text.split('\n').find(l =>
    l.startsWith('REMARK') && l.includes('1/2 of bilayer thickness'));
  const m = line && line.match(/([\d.]+)\s*$/);
  return m ? +m[1] : null;
}

/* THE COFACTORS: the pigments, the redox centres, the quinones. Lipids,
   detergents and water are left out; they are the membrane and the
   preparation, not the machine. */
const COFACTOR = {
  chlorophyll: ['CLA', 'CHL', 'CL0'],          // Chl a, Chl b, Chl a' (P700's)
  pheophytin:  ['PHO'],
  carotenoid:  ['BCR', 'LUT', 'XAT', 'NEX', 'ZEX'],
  quinone:     ['PL9', 'PQN'],
  heme:        ['HEM', 'HEC'],
  metal:       ['OEX', 'FE2', 'SF4', 'FES', 'BCT'],
};
const CLASS_OF = {};
for (const [k, names] of Object.entries(COFACTOR)) for (const n of names) CLASS_OF[n] = k;

/* Off the DEPOSITION, because OPM's copies of 5XNL and 7QRM carry no CONECT
   and bonds come off CONECT, never a distance cutoff. The deposition is then
   moved into OPM's frame by a Kabsch fit on every Cα the two share, and the
   residual is printed: OPM only rotates and translates, so anything above a
   hundredth of an ångström means the two files are not the same model. */
function cofactors(dep, opm, centre) {
  const key = l => l[21] + l.slice(22, 27);
  const ca = t => {
    const m = new Map();
    for (const l of t.split('\n'))
      if (l.startsWith('ATOM') && l.slice(12, 16) === ' CA ' && (l[16] === ' ' || l[16] === 'A'))
        m.set(key(l), Bake.xyz(l));
    return m;
  };
  const A = ca(dep), B = ca(opm), P = [], Q = [];
  for (const [k, p] of A) if (B.has(k)) { P.push(p); Q.push(B.get(k)); }
  const F = Bake.kabsch(P, Q);
  const move = p => Bake.mul(F.R, p).map((x, k) => x + F.t[k] - centre[k]);

  const el = [], xyz = [], cls = [], idx = new Map(), lines = dep.split('\n');
  const classes = Object.keys(COFACTOR);
  const counted = {};
  for (const l of lines) {
    if (!l.startsWith('HETATM')) continue;
    const res = l.slice(17, 20).trim();
    if (!CLASS_OF[res] || (l[16] !== ' ' && l[16] !== 'A')) continue;
    idx.set(+l.slice(6, 11), el.length);
    const e = l.slice(76, 78).trim();
    el.push(e[0] + (e[1] || '').toLowerCase());
    for (const x of move(Bake.xyz(l))) xyz.push(Math.round(x * 100) / 100);
    cls.push(classes.indexOf(CLASS_OF[res]));
    counted[key(l) + res] = res;
  }
  const bonds = [], seen = new Set();
  for (const l of lines) {
    if (!l.startsWith('CONECT')) continue;
    const a = idx.get(+l.slice(6, 11));
    if (a === undefined) continue;
    for (let c = 11; c + 5 <= l.length; c += 5) {
      const b = idx.get(+l.slice(c, c + 5));
      if (b === undefined || a === b) continue;
      const k = Math.min(a, b) + ':' + Math.max(a, b);
      if (!seen.has(k)) { seen.add(k); bonds.push(Math.min(a, b), Math.max(a, b)); }
    }
  }
  const molecules = {};
  for (const res of Object.values(counted)) molecules[res] = (molecules[res] || 0) + 1;
  return { fit: { pairs: P.length, rmsd: Math.round(F.rmsd * 1e4) / 1e4 },
           classes, el, xyz, cls, bonds, molecules };
}

function bake(v) {
  const opm = fs.readFileSync(path.join(SRC, `${v.id}-opm.pdb`), 'utf8');
  const dep = fs.readFileSync(path.join(SRC, `${v.id}.pdb`), 'utf8');
  const half = halfThickness(opm);
  if (half === null) throw new Error(v.id + ': OPM copy states no bilayer');

  const chains = Bake.caTrace(opm, null);
  const R = Bake.ssRanges(opm);
  const T = Bake.assemble(chains, R);
  const mid = -T.centre[2];
  const named = molecules(dep);
  const decl = Bake.declared(dep);

  /* Roles, and each extrinsic chain's face as the sign of its mean z
     against the bilayer middle. */
  const roles = {}, face = {};
  for (const id of T.order) {
    const name = named[id] || '';
    const CA = T.chains[id].CA;
    const out = CA.filter(p => Math.abs(p[2] - mid) > half).length / CA.length;
    const z = CA.reduce((s, p) => s + p[2] - mid, 0) / CA.length;
    roles[id] = /CHLOROPHYLL A-B BINDING|^LHC|LIGHT HARVESTING/.test(name) ? 'antenna'
      : v.core.test(name) ? 'core'
      : out >= EXTRINSIC ? 'extrinsic' : 'small';
    if (roles[id] === 'extrinsic') face[id] = z > 0 ? '+z' : '-z';
  }

  const all = [];
  for (const id of T.order) for (const p of T.chains[id].CA) all.push(p);
  const F = Bake.frameOf(all);

  const inMem = all.filter(p => Math.abs(p[2] - mid) <= half).length;
  const cof = cofactors(dep, opm, T.centre);
  if (cof.fit.rmsd > 0.01) throw new Error(`${v.id}: deposition is ${cof.fit.rmsd} A off OPM`);
  return { cof,
    source: `${v.id}-opm.pdb`, ssFrom: Bake.ssFrom(R), centre: T.centre,
    order: T.order, chains: T.chains, radius: T.radius, extents: F.extents,
    view: FoldLib.basisFrom([0, 0, 1], (F.view || [[1, 0, 0]])[0])
      .map(ax => ax.map(x => Math.round(x * 1e4) / 1e4)),
    frame: 'membrane convention, on OPM\'s normal',
    meta: {
      entry: v.id, name: v.name, species: v.species, purpose: v.purpose,
      method: Bake.method(dep), resolution: Bake.resolution(dep),
      title: Bake.line1(dep, 'TITLE'),
      chainsInFile: Bake.chainCount(dep),
      membrane: { half, axis: 'z', mid },
      inMembrane: inMem, residues: all.length,
      chains: T.order.map(id => ({ chain: id, name: named[id] || null, role: roles[id],
        face: face[id] || null, modelled: T.chains[id].nums.length,
        declared: decl[id] === undefined ? null : decl[id] })),
      counts: T.order.map(id => ({ chain: id, modelled: T.chains[id].nums.length,
        declared: decl[id] === undefined ? null : decl[id] })),
      ec: Bake.ecNumbers(dep)[0] || null,
      ligands: Bake.ligands(dep, null),
    },
    read: {
      method: Bake.method(dep),
      chainsInFile: Bake.chainCount(dep),
      residues: all.length,
      declared: T.order.every(id => decl[id] !== undefined)
        ? T.order.reduce((k, id) => k + decl[id], 0) : null,
      ec: Bake.ecNumbers(dep)[0] || null,
      baked: `photosystems-${v.id}.json`,
    },
  };
}

/* THE LINEUP: the three bakes in one frame, at one scale. Each keeps OPM's z
   (its bilayer middle moved to 0) and is slid along x by its own extent, so
   nothing is rotated and nothing is fitted: OPM's frame is shared already.
   Chain ids are prefixed with the candidate's tag so 5XNL's A and 7QRM's A
   stay two chains. */
function lineup(bakes) {
  const out = { source: 'lineup', ssFrom: 'records', order: [], chains: {},
                frame: 'membrane convention, OPM normal shared by all three',
                meta: { entry: 'lineup', parts: [], chains: [], ligands: [] } };
  let x = 0;
  const shift = [];
  const parts = bakes.map(b => {
    let lo = Infinity, hi = -Infinity;
    for (const id of b.order) for (const p of b.chains[id].CA) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }
    return { b, lo, hi };
  });
  for (const { b, lo, hi } of parts) {
    const dx = x - lo, dz = -b.meta.membrane.mid;
    const tag = CANDIDATES.find(c => c.id === b.meta.entry).tag;
    shift.push({ entry: b.meta.entry, d: [dx, 0, dz] });
    for (const id of b.order) {
      const k = `${tag}.${id}`;
      out.order.push(k);
      out.chains[k] = Object.assign({}, b.chains[id],
        { CA: b.chains[id].CA.map(p => [p[0] + dx, p[1], p[2] + dz]) });
    }
    for (const c of b.meta.chains) out.meta.chains.push(Object.assign({}, c, { chain: `${tag}.${c.chain}` }));
    out.meta.parts.push({ entry: b.meta.entry, name: b.meta.name, width: Bake.r2(hi - lo),
                          half: b.meta.membrane.half, residues: b.meta.residues });
    x += hi - lo + GAP;
  }
  /* Centre the row; y stays each file's own, so the three sit in a line. */
  const all = [];
  for (const k of out.order) for (const p of out.chains[k].CA) all.push(p);
  const c = [0, 1].map(i => all.reduce((s, p) => s + p[i], 0) / all.length);
  out.radius = 0;
  for (const k of out.order) out.chains[k].CA = out.chains[k].CA.map(p => {
    const q = [Bake.r2(p[0] - c[0]), Bake.r2(p[1] - c[1]), p[2]];
    out.radius = Math.max(out.radius, Math.hypot(...q));
    return q;
  });
  out.radius = Bake.r2(out.radius);
  /* Where each part's cofactor file lands in the lineup: the same slide and
     the same re-centring its chains got. */
  for (const p of out.meta.parts) {
    const s = shift.find(q => q.entry === p.entry).d;
    p.shift = [Bake.r2(s[0] - c[0]), Bake.r2(s[1] - c[1]), Bake.r2(s[2])];
  }
  out.extents = Bake.frameOf(all).extents;
  out.view = FoldLib.basisFrom([0, 0, 1], [1, 0, 0]);
  out.meta.membrane = { half: Math.max(...parts.map(p => p.b.meta.membrane.half)), axis: 'z', mid: 0 };
  return out;
}

function main() {
  const bakes = CANDIDATES.map(bake);

  /* THE FACES AGREE, or the lineup is a lie: PSII's OEC cap and b6f's
     cytochrome f must share a face (the lumen), and PSI's PsaC ridge must
     sit on the other one (the stroma). Asserted off the names COMPND gives
     those three, and the face is measured. */
  const faceOf = (b, re) => { const c = b.meta.chains.find(c => re.test(c.name || '')); return c && c.face; };
  const lumen = faceOf(bakes[0], /OXYGEN-EVOLVING ENHANCER PROTEIN 1/);
  const cytf = faceOf(bakes[1], /^CYTOCHROME F$/);
  const ridge = faceOf(bakes[2], /IRON-SULFUR CENTER/);
  if (!lumen || lumen !== cytf || !ridge || ridge === lumen)
    throw new Error(`faces disagree: OEC ${lumen}, cyt f ${cytf}, PsaC ${ridge}`);
  for (const b of bakes) b.meta.lumen = lumen;

  const blocks = {};
  for (const [k, b] of bakes.entries()) {
    blocks[CANDIDATES[k].key] = { [b.meta.entry]: b.read };
    delete b.read;
  }
  for (const b of bakes) {
    const cof = b.cof;
    delete b.cof;
    b.meta.cofactors = cof.molecules;
    const file = `photosystems-${b.meta.entry}-cofactors.json`;
    fs.writeFileSync(path.join(DATA, file), JSON.stringify(cof));
    console.log(`${b.meta.entry} cofactors  ${cof.el.length} atoms, ${cof.bonds.length / 2} bonds, ` +
      `fit ${cof.fit.pairs} CA at ${cof.fit.rmsd} A, ` +
      `${(fs.statSync(path.join(DATA, file)).size / 1024).toFixed(0)} KB`);
  }
  for (const b of [...bakes, lineup(bakes)]) {
    if (b.meta.entry === 'lineup') b.meta.lumen = lumen;
    const file = `photosystems-${b.meta.entry}.json`;
    fs.writeFileSync(path.join(DATA, file), JSON.stringify(b));
    const kb = (fs.statSync(path.join(DATA, file)).size / 1024).toFixed(0);
    const roles = {};
    for (const c of b.meta.chains) roles[c.role] = (roles[c.role] || 0) + 1;
    console.log(`${b.meta.entry}  ${b.order.length} chains, ` +
      `roles ${JSON.stringify(roles)}, ${b.extents.join(' × ')} A, ` +
      (b.meta.membrane ? `bilayer ±${b.meta.membrane.half} A, ` : '') + `${kb} KB`);
  }
  console.log(`lumen is ${lumen}`);
  const touched = IO.writeMany(blocks);
  console.log(`registry  proteins.js  ${touched.length} variants updated`);
}

if (require.main === module) main();
module.exports = { bake, CANDIDATES };
