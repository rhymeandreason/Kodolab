#!/usr/bin/env node
/* =====================================================================
 *  prep.js — human rhinovirus 14, at three scales: one protomer (VP1-4),
 *  the pentamer around a five-fold, and the whole 60-protomer capsid.
 *
 *  Run:  node proteins/rhinovirus/tools/prep.js   (offline, no deps)
 *
 *  UNDER REVIEW. The view table is CANDIDATES below, not the registry.
 *
 *  THE ASYMMETRIC UNIT IS 1/60 OF THE PARTICLE. 4RHV.pdb holds four chains,
 *  one copy each of VP1-VP4; the capsid is assembly 1, deposited in
 *  4RHV.pdb1 as 60 MODELS of those four. That is 240 chains, past the 62
 *  single-character ids a PDB line has room for, so the merge does not
 *  rewrite column 22: each model is traced on its own and its chains are
 *  keyed `<model>.<chain>`, the photosystem lineup's scheme.
 *
 *  THE HELIX/SHEET RECORDS ARE THE ASYMMETRIC UNIT'S, replicated onto every
 *  copy. Read, not detected: all 60 are the same deposited chains under a
 *  symmetry operator.
 *
 *  WHICH CHAIN IS WHICH VP IS READ off COMPND, never typed by chain id.
 *
 *  SOURCES (not committed; data/.gitignore names them):
 *    https://files.rcsb.org/download/4RHV.pdb       asymmetric unit
 *    https://files.rcsb.org/download/4RHV.pdb1.gz   assembly 1, 60 models
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const Bake = require('../../bake-lib.js');

const DATA = path.join(__dirname, '..', 'data');
const SRC = {
  '4RHV.pdb':  'https://files.rcsb.org/download/4RHV.pdb',
  '4RHV.pdb1': 'https://files.rcsb.org/download/4RHV.pdb1.gz  (then gunzip)',
};
function read(f) {
  const at = path.join(DATA, f);
  if (!fs.existsSync(at))
    throw new Error(`${f} is not in data/ — curl -o proteins/rhinovirus/data/${f} ${SRC[f]}`);
  return fs.readFileSync(at, 'utf8');
}

const CANDIDATES = [
  { id: 'capsid',   source: '4RHV', scale: 'all',
    purpose: 'the whole shell: 60 copies of one four-protein unit' },
  { id: 'pentamer', source: '4RHV', scale: 'five',
    purpose: 'five protomers around a five-fold axis, the canyon ringing it' },
  { id: 'protomer', source: '4RHV', scale: 'one',
    purpose: 'the repeating unit: VP1, VP2, VP3 outside, VP4 tucked under' },
];

/* VP number per chain id, off COMPND's MOLECULE/CHAIN pairs. */
function vpOf(raw) {
  const text = raw.split('\n').filter(l => l.startsWith('COMPND'))
    .map(l => l.slice(10).trim()).join(' ');
  const out = {};
  for (const m of text.matchAll(/MOLECULE:\s*([^;]+);\s*CHAIN:\s*([^;]+);/g)) {
    const vp = /VP\s*(\d)/i.exec(m[1]);
    for (const c of m[2].split(',')) out[c.trim()] = vp ? 'VP' + vp[1] : m[1].trim();
  }
  if (Object.keys(out).length < 4) throw new Error('COMPND names fewer than four chains');
  return out;
}

/* Split the assembly file at MODEL records. */
function models(text) {
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('MODEL')) { cur = []; out.push(cur); continue; }
    if (line.startsWith('ENDMDL')) { cur = null; continue; }
    if (cur && (line.startsWith('ATOM') || line.startsWith('HETATM'))) cur.push(line);
  }
  if (out.length < 2) throw new Error('assembly file holds no MODEL records — wrong file?');
  return out.map(ls => ls.join('\n'));
}

const centroid = pts => {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p.x; c[1] += p.y; c[2] += p.z; }
  return c.map(v => v / pts.length);
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* THE FIVE AROUND MODEL 1's FIVE-FOLD, found by geometry rather than by
   model number, which is the depositor's ordering and promises nothing.
   VP1 lines the five-fold, so model 1's VP1 and its four nearest VP1s are
   one pentamer. ASSERTED: five points around a five-fold are equidistant
   from their mean, and a wrong pick (a three-fold neighbour) is not. */
function pentamerOf(perModel, vp1) {
  const c = perModel.map(m => centroid(m.get(vp1)));
  const near = c.map((p, i) => ({ i, d: dist(p, c[0]) }))
    .sort((a, b) => a.d - b.d).slice(0, 5).map(x => x.i);
  const pts = near.map(i => c[i]);
  const mid = [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / 5);
  const r = pts.map(p => dist(p, mid));
  const spread = (Math.max(...r) - Math.min(...r)) / Math.max(...r);
  if (spread > 0.05)
    throw new Error(`pentamer pick is not five-fold: radii ${r.map(x => x.toFixed(1))}`);
  return { models: near, radius: r[0] };
}

function bake(v, raw, asm, vp) {
  const R0 = Bake.ssRanges(raw);
  const VP1 = Object.keys(vp).find(k => vp[k] === 'VP1');

  let chains, pick = null, nModels = 1;
  if (v.scale === 'one') {
    chains = Bake.caTrace(Bake.modelOne(raw));
  } else {
    const perModel = asm.map(t => Bake.caTrace(t));
    nModels = perModel.length;
    let use = perModel.map((_, i) => i);
    if (v.scale === 'five') { pick = pentamerOf(perModel, VP1); use = pick.models; }
    chains = new Map();
    for (const i of use)
      for (const [id, res] of perModel[i])
        chains.set(`${String(i + 1).padStart(2, '0')}.${id}`, res);
  }

  const base = k => k.includes('.') ? k.split('.')[1] : k;
  const R = { H: [], E: [] };
  for (const k of chains.keys()) {
    for (const h of R0.H) if (h.chain === base(k)) R.H.push({ ...h, chain: k });
    for (const e of R0.E) if (e.chain === base(k)) R.E.push({ ...e, chain: k });
  }

  const T = Bake.assemble(chains, R);
  const all = [];
  for (const id of T.order) for (const p of T.chains[id].CA) all.push(p);
  const F = Bake.frameOf(all);

  const decl = Bake.declared(raw);
  const out = {
    source: v.scale === 'one' ? '4RHV.pdb' : '4RHV.pdb1',
    ssFrom: Bake.ssFrom(R0), centre: T.centre,
    order: T.order, chains: T.chains, radius: T.radius,
    extents: F.extents, frame: F.frame,
  };
  if (F.view) out.view = F.view;
  out.meta = {
    entry: '4RHV', view: v.id, purpose: v.purpose,
    method: Bake.method(raw), resolution: Bake.resolution(raw),
    title: Bake.line1(raw, 'TITLE'),
    assemblyModels: nModels, modelsDrawn: v.scale === 'one' ? 1 : (pick ? 5 : nModels),
    chainsDrawn: T.order.length,
    /* Per VP, not per chain: in the capsid every VP is 60 copies of one chain. */
    vp: Object.keys(vp).sort().map(id => ({
      chain: id, name: vp[id], declared: decl[id] === undefined ? null : decl[id],
      modelled: T.chains[T.order.find(k => base(k) === id)].nums.length })),
    vpOf: Object.fromEntries(T.order.map(k => [k, vp[base(k)]])),
    pentamerRadius: pick ? Bake.r2(pick.radius) : null,
    ligands: Bake.ligands(raw),
  };
  return out;
}

function main() {
  const raw = read('4RHV.pdb');
  const asm = models(read('4RHV.pdb1'));
  const vp = vpOf(raw);
  for (const v of CANDIDATES) {
    const out = bake(v, raw, asm, vp);
    const file = `rhv-${v.id}.json`;
    fs.writeFileSync(path.join(DATA, file), JSON.stringify(out));
    const kb = (fs.statSync(path.join(DATA, file)).size / 1024).toFixed(0);
    const res = out.order.reduce((k, id) => k + out.chains[id].nums.length, 0);
    console.log(`${v.id.padEnd(9)} ${out.meta.modelsDrawn} protomer(s), ${out.order.length} chains, ` +
      `${res} residues, ${out.extents.join(' × ')} A, view ${out.frame}, ${kb} KB` +
      (out.meta.pentamerRadius ? `, VP1 ring r ${out.meta.pentamerRadius} A` : ''));
  }
  console.log('vp:', JSON.stringify(vp));
}

if (require.main === module) main();
module.exports = { CANDIDATES, bake, vpOf, models };
