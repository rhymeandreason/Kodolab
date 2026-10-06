#!/usr/bin/env node
/* =====================================================================
 *  prep.js — the two enzymes that eat PET, down to what the bench draws.
 *
 *  Run:  node proteins/petase/tools/prep.js     (offline, no dependencies)
 *
 *  WHAT THE PROTEINS ARE. Ideonella sakaiensis, found in 2016 outside a
 *  bottle-recycling plant, lives on PET in two cuts. PETase hydrolyses the
 *  polymer's ester bonds and releases MHET; MHETase splits MHET into
 *  terephthalic acid and ethylene glycol, the two monomers PET was made from.
 *  Both are serine hydrolases: a Ser-His-Asp triad, the same chemistry as
 *  lipase on a triglyceride.
 *
 *  THE PETASE VIEWS ARE ONE ENZYME, SUPERPOSED. All three are fitted onto
 *  6EQE by Ca, matched by UniProt number, so flipping between them moves
 *  only what changed: a substrate in the groove, five side chains. 5XH3
 *  numbers its construct from 1 and runs behind UniProt; the offset comes off
 *  each file's DBREF, never typed, and the panel prints both.
 *
 *  THE POCKET is what each view is about, named per variant in `pocket.draw`:
 *  the triad, the bound ligand, or the five positions FAST-PETase changed,
 *  read off 7SH6's own SEQADV records.
 *
 *  SOURCES, for a re-run from scratch:
 *
 *    for id in 6EQE 5XH3 7SH6 6QGA; do
 *      curl -o proteins/petase/data/src/$id.pdb \
 *        https://files.rcsb.org/download/$id.pdb
 *    done
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const Bake = require('../../bake-lib.js');
const { kabsch, mul, r2, xyz } = Bake;

const HERE = path.join(__dirname, '..');
const SRC = path.join(HERE, 'data', 'src');
const DATA = path.join(HERE, 'data');

/* THE VIEW TABLE IS proteins/proteins.js: two proteins, one folder. Each
   variant's `pocket` says what it draws in ball-and-stick and which numbers
   (UniProt's) make the triad; the baker asserts the residue names. */
const REG = require('../../proteins.js');
const IO = require('../../tools/registry-io.js');
const KEYS = ['petase', 'mhetase'];
const ALL = KEYS.flatMap(k => REG.byKey(k).variants.map(v => ({ ...v, protein: k })));
/* FAST-PETase's five, read off whichever variant draws them. */
const MARKS_FROM = ALL.find(v => v.pocket.draw.includes('mark')).source.id;

const read = id => fs.readFileSync(path.join(SRC, id + '.pdb'), 'utf8');
const elOf = l => (l.slice(76, 78).trim() || l.slice(12, 14).trim()).toUpperCase();

/* UniProt number = file number + offset, off DBREF / DBREF1+2. */
function offsetOf(text, chain) {
  for (const l of text.split('\n')) {
    if (l.startsWith('DBREF ') && l[12] === chain)
      return parseInt(l.slice(55, 60), 10) - parseInt(l.slice(14, 18), 10);
    if (l.startsWith('DBREF1') && l[12] === chain) {
      const d2 = text.split('\n').find(m => m.startsWith('DBREF2') && m[12] === chain);
      return parseInt(d2.slice(45, 55), 10) - parseInt(l.slice(14, 18), 10);
    }
  }
  throw new Error('no DBREF for chain ' + chain);
}

/* Engineered substitutions, UniProt-numbered: [{num, from, to}]. */
function mutations(text, chain) {
  return text.split('\n')
    .filter(l => l.startsWith('SEQADV') && l[16] === chain && /ENGINEERED MUTATION/.test(l))
    .map(l => ({ num: parseInt(l.slice(43, 48), 10), from: l.slice(39, 42).trim(),
                 to: l.slice(12, 15).trim() }));
}

/* Side chains at `want` (file numbers -> group name), plus the named
   ligands. Backbone N, C, O dropped: the ribbon draws them. CA stays as the
   stub that says where the side chain attaches. */
function pocket(text, chain, want, ligNames) {
  const atoms = [], bySerial = new Map(), resName = {};
  for (const l of text.split('\n')) {
    const het = l.startsWith('HETATM'), atom = l.startsWith('ATOM');
    if ((!het && !atom) || l[21] !== chain) continue;
    const alt = l[16];
    if (alt !== ' ' && alt !== 'A') continue;
    const res = l.slice(17, 20).trim(), num = parseInt(l.slice(22, 26), 10);
    const name = l.slice(12, 16).trim();
    /* 6EQE at 0.92 A deposits riding hydrogens and the others do not; drawn,
       they would make one view's side chains look heavier than the rest. */
    if (elOf(l) === 'H' || elOf(l) === 'D') continue;
    let group;
    if (het && ligNames.includes(res)) group = 'ligand';
    else if (atom && want.has(num) && !['N', 'C', 'O'].includes(name)) group = want.get(num);
    else continue;
    if (atom) resName[num] = res;
    bySerial.set(+l.slice(6, 11), atoms.length);
    atoms.push({ name, el: elOf(l), res, num, group, p: xyz(l) });
  }

  /* Ligand bonds off CONECT; side-chain bonds by distance inside one residue,
     where nothing else is close enough to be wrong about. No metals here. */
  const bonds = [], seen = new Set();
  const add = (i, j) => {
    const k = Math.min(i, j) + ':' + Math.max(i, j);
    if (i === j || seen.has(k)) return;
    seen.add(k); bonds.push([Math.min(i, j), Math.max(i, j)]);
  };
  let conect = 0;
  for (const l of text.split('\n')) {
    if (!l.startsWith('CONECT')) continue;
    const a = bySerial.get(+l.slice(6, 11));
    if (a === undefined) continue;
    for (let c = 11; c + 5 <= l.length; c += 5) {
      const b = bySerial.get(+l.slice(c, c + 5).trim());
      if (b !== undefined) { add(a, b); conect++; }
    }
  }
  const d = (a, b) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++) {
      const A = atoms[i], B = atoms[j];
      if (A.num !== B.num || A.group === 'ligand' || B.group === 'ligand') continue;
      if (d(A, B) < 1.9) add(i, j);
    }
  if (atoms.some(a => a.group === 'ligand') && !conect)
    throw new Error('ligand has no CONECT records; refusing to guess its bonds');
  return { atoms, bonds, resName };
}

function bake(v, ref, marks) {
  const text = read(v.source.id);
  const chain = v.chains;
  const off = offsetOf(text, chain);
  const R = Bake.ssRanges(text);
  const res = Bake.caTrace(text, new Set([chain])).get(chain)
    .map(r => ({ num: r.num, p: [r.x, r.y, r.z] }));

  const want = new Map();
  for (const [k, n] of Object.entries(v.pocket.triad)) want.set(n - off, 'triad');
  if (v.protein === 'petase') for (const m of marks) want.set(m.num - off, 'mark');
  const site = pocket(text, chain, want, v.pocket.ligands || []);

  /* The triad must be what the registry says it is; a mutant's serine reads
     ALA, and that is reported rather than refused. */
  const triad = Object.entries(v.pocket.triad).map(([k, n]) => {
    const got = site.resName[n - off];
    const expect = { S: 'SER', D: 'ASP', H: 'HIS' }[k];
    if (!got) throw new Error(`${v.id}: no residue at ${n} (file ${n - off})`);
    return { role: k, num: n, res: got, changed: got !== expect };
  });
  if (!ref && triad.some(t => t.changed)) throw new Error(v.id + ': reference triad is not S-D-H');

  /* SUPERPOSE BEFORE CENTRING, on Ca matched by UniProt number. */
  let fit = null;
  if (ref) {
    const P = [], Q = [];
    for (const r of res) {
      const q = ref.ca.get(r.num + off);
      if (q) { P.push(r.p); Q.push(q); }
    }
    const k = kabsch(P, Q);
    fit = { on: ref.id, n: P.length, rmsd: +k.rmsd.toFixed(2) };
    const put = p => mul(k.R, p).map((x, i) => x + k.t[i]);
    for (const r of res) r.p = put(r.p);
    for (const a of site.atoms) a.p = put(a.p);
  }

  const c = ref ? ref.centreRaw
    : [0, 1, 2].map(k => res.reduce((s, r) => s + r.p[k], 0) / res.length);
  const T = Bake.assemble(new Map([[chain, res.map(r => ({ num: r.num, x: r.p[0], y: r.p[1], z: r.p[2] }))]]), R, c);

  const out = { source: v.source.id + '.pdb', ssFrom: Bake.ssFrom(R), centre: T.centre,
                order: T.order, chains: T.chains, radius: T.radius };
  const keep = new Set(v.pocket.draw), idx = new Map(), atoms = [];
  site.atoms.forEach((a, i) => { if (keep.has(a.group)) { idx.set(i, atoms.length); atoms.push(a); } });
  out.pocket = {
    atoms: atoms.map(a => ({ name: a.name, el: a.el, res: a.res, num: a.group === 'ligand' ? a.num : a.num + off,
                                  group: a.group, p: a.p.map((x, k) => r2(x - c[k])) })),
    bonds: site.bonds.filter(([i, j]) => idx.has(i) && idx.has(j)).map(([i, j]) => [idx.get(i), idx.get(j)]),
  };

  /* One rotation for all three PETase views, solved on the reference, or the
     superposition is undone by each view turning itself. */
  const own = Bake.frameOf(out.chains[chain].CA);
  const V = Bake.viewFor(REG.byKey(v.protein), ref ? ref.frame : own, v);
  if (V.view) out.view = V.view;
  out.extents = own.extents;
  out.frame = V.frame;

  const decl = Bake.declared(text);
  const seen = new Map();
  for (const a of site.atoms) if (a.group === 'mark') seen.set(a.num + off, a.res);
  out.meta = {
    entry: v.source.id, protein: v.protein, chain,
    method: Bake.method(text), resolution: Bake.resolution(text),
    title: Bake.line1(text, 'TITLE'), models: Bake.models(text),
    chainsInFile: Bake.chainCount(text),
    counts: [{ chain, modelled: res.length, declared: decl[chain] === undefined ? null : decl[chain] }],
    offset: off,
    helices: out.chains[chain].helices, strands: out.chains[chain].strands,
    /* UniProt-numbered, so 5XH3's pairs read as the same two as 6EQE's. */
    ss: Bake.disulfides(text, new Set([chain]))
      .map(s => s.split('-').map(n => +n + off).join('-')),
    ligands: Bake.ligands(text, new Set([chain])),
    bound: [...new Set(site.atoms.filter(a => a.group === 'ligand').map(a => a.res))],
    triad,
    mutations: mutations(text, chain),
    marks: v.protein === 'petase' ? marks.map(m => ({ num: m.num, res: seen.get(m.num) || null })) : [],
    fitOn: fit ? fit.on : null, fitAtoms: fit ? fit.n : null, fitRmsd: fit ? fit.rmsd : null,
    ec: Bake.ecNumbers(text)[0] || null,
  };
  out.read = {
    method: out.meta.method,
    chainsInFile: out.meta.chainsInFile,
    residues: res.length,
    declared: out.meta.counts[0].declared,
    ec: out.meta.ec,
    baked: `${v.protein}-${v.id}.json`,
  };
  return out;
}

function main() {
  const marks = mutations(read(MARKS_FROM), 'A');
  const blocks = Object.fromEntries(KEYS.map(k => [k, {}]));
  for (const key of KEYS) {
    const P = REG.byKey(key), vs = ALL.filter(v => v.protein === key);
    let ref = null;
    if (P.fit) {
      /* The reference first, in its own frame; the rest fit onto its Ca by
         UniProt number and share its centre and its rotation. */
      const rv = vs.find(v => v.id === P.fit.on), text = read(rv.source.id);
      const rres = Bake.caTrace(text, new Set([rv.chains])).get(rv.chains), off = offsetOf(text, rv.chains);
      const refOut = bake(rv, null, marks);
      ref = { id: rv.id, out: refOut,
              centreRaw: [0, 1, 2].map(k => rres.reduce((s, r) => s + [r.x, r.y, r.z][k], 0) / rres.length),
              ca: new Map(rres.map(r => [r.num + off, [r.x, r.y, r.z]])),
              frame: Bake.frameOf(refOut.chains[rv.chains].CA) };
    }
    for (const v of vs) {
      const out = ref && v.id === ref.id ? ref.out : bake(v, ref, marks);
      const { read: r, ...body } = out;
      fs.writeFileSync(path.join(DATA, r.baked), JSON.stringify(body));
      blocks[key][v.id] = r;
      const m = out.meta, kb = (fs.statSync(path.join(DATA, r.baked)).size / 1024).toFixed(0);
      console.log(`${v.id}  ${m.counts[0].modelled}/${m.counts[0].declared} res, offset ${m.offset}, ` +
        `SS [${m.ss.join(' ')}], bound [${m.bound.join(' ')}], ` +
        `triad ${m.triad.map(t => t.res + t.num).join(' ')}, ` +
        `pocket ${out.pocket.atoms.length} atoms, ` +
        (m.fitOn ? `fit ${m.fitRmsd} A over ${m.fitAtoms} Ca` : 'own frame') + `, ${out.frame}, ${kb} KB`);
    }
  }
  IO.writeMany(blocks);
  console.log('registry  proteins.js  petase, mhetase updated');
}

if (require.main === module) main();
module.exports = { bake };
