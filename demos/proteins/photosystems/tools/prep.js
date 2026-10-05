#!/usr/bin/env node
/* =====================================================================
 *  prep.js — the three membrane machines of the light reactions, in the
 *  bilayer's own frame, plus one bake with all three side by side.
 *
 *  Run:  node proteins/photosystems/tools/prep.js   (offline, no dependencies)
 *
 *  UNDER REVIEW: the candidates live in CANDIDATES below, not in
 *  proteins/proteins.js. Nothing here is registered until the human has
 *  looked at the bench.
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

/* In electron-flow order, which is also the lineup's left-to-right. */
const CANDIDATES = [
  { id: '5XNL', key: 'psii', tag: 'II', name: 'Photosystem II', species: 'pea',
    core: /PROTEIN D1|D2 PROTEIN|CP47|CP43/,
    purpose: 'the whole C2S2M2 dimer: two cores ringed by LHCII, OEC on the lumen face' },
  { id: '7QRM', key: 'b6f', tag: 'b6f', name: 'Cytochrome b6f', species: 'spinach',
    core: /^CYTOCHROME B6$|SUBUNIT 4$/,
    purpose: 'the dimer; no antenna, two cytochrome f heads in the lumen' },
  { id: '5L8R', key: 'psi', tag: 'I', name: 'Photosystem I', species: 'pea',
    core: /P700/,
    purpose: 'one core with four LHCI on one flank, Fe-S ridge on the stroma face' },
];

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
  return {
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
      ligands: Bake.ligands(dep, null),
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
  const parts = bakes.map(b => {
    let lo = Infinity, hi = -Infinity;
    for (const id of b.order) for (const p of b.chains[id].CA) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }
    return { b, lo, hi };
  });
  for (const { b, lo, hi } of parts) {
    const dx = x - lo, dz = -b.meta.membrane.mid;
    const tag = CANDIDATES.find(c => c.id === b.meta.entry).tag;
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
}

if (require.main === module) main();
module.exports = { bake, CANDIDATES };
