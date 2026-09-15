#!/usr/bin/env node
/* =====================================================================
 *  prep.js — human cytochrome c: the ribbon, the heme it carries, and
 *  the residues that hold that heme.
 *
 *  Run:  node proteins/cytc/tools/prep.js     (offline, no dependencies)
 *
 *  The view table is proteins/proteins.js; this writes the `read` half back.
 *
 *  SOURCE, for a re-run from scratch (data/src is gitignored):
 *
 *    curl -o proteins/cytc/data/src/3ZCF.pdb https://files.rcsb.org/download/3ZCF.pdb
 *
 *  3ZCF holds four copies of the monomer; REMARK 350 calls the biological
 *  unit monomeric, so chain A is the subject and B-D are not drawn.
 *
 *  THE POCKET is myoglobin's shape (proteins/myoglobin/tools/prep.js): the
 *  heme, then the side chains that make this site. Heme c differs from
 *  myoglobin's heme b in being bolted on: thioethers from Cys14 and Cys17
 *  to the ring's two vinyl carbons, His18 below the iron and Met80 above.
 *  Bonds come off CONECT, with one exception: 3ZCF records Cys14's
 *  thioether and not Cys17's, though it models that S 2.3 A from CAC. The
 *  thioether is drawn by name within THIO_MAX and the bench flags it.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const Bake = require('../../bake-lib.js');

const HERE = path.join(__dirname, '..');
const SRC = path.join(HERE, 'data', 'src');
const DATA = path.join(HERE, 'data');

const REG = require('../../proteins.js');
const IO = require('../../tools/registry-io.js');
const ME = REG.byKey('cytc');
const VIEWS = ME.variants;

const r2 = Bake.r2, xyz = Bake.xyz;
const elOf = l => (l.slice(76, 78).trim() || l.slice(12, 14).trim()).toUpperCase();
const BACKBONE = new Set(['N', 'C', 'O']);
/* A C-S bond is 1.8 A; 2.5 admits a loosely refined one and nothing
   non-bonded, since van der Waals contact for C···S is about 3.5. */
const THIO_MAX = 2.5;

/* `lys` is a separate group so the page can show the lysines on their own:
   the positive patch around the heme edge is how cyt c docks on complexes
   III and IV, and the bench is where a human decides whether it reads. */
function pocket(text, chain, site) {
  const lines = text.split('\n');
  const want = new Map([[site.his, 'his'], [site.met, 'met'],
                        ...site.cys.map(n => [n, 'cys'])]);
  const atoms = [], bySerial = new Map();
  const keep = (line, group) => {
    const alt = line[16];
    if (alt !== ' ' && alt !== 'A') return;
    bySerial.set(+line.slice(6, 11), atoms.length);
    atoms.push({ name: line.slice(12, 16).trim(), el: elOf(line),
                 res: line.slice(17, 20).trim(), num: parseInt(line.slice(22, 26), 10),
                 group, p: xyz(line) });
  };
  for (const line of lines) {
    if (line[21] !== chain) continue;
    if (line.startsWith('HETATM') && line.slice(17, 20) === 'HEC') keep(line, 'heme');
    else if (line.startsWith('ATOM')) {
      const name = line.slice(12, 16).trim();
      if (BACKBONE.has(name)) continue;
      const num = parseInt(line.slice(22, 26), 10);
      if (want.has(num)) keep(line, want.get(num));
      else if (line.slice(17, 20) === 'LYS' && name !== 'CA') keep(line, 'lys');
    }
  }

  const bonds = [], seen = new Set();
  const add = (i, j) => {
    const lo = Math.min(i, j), hi = Math.max(i, j);
    if (lo === hi || seen.has(lo + ':' + hi)) return;
    seen.add(lo + ':' + hi); bonds.push([lo, hi]);
  };
  for (const line of lines) {
    if (!line.startsWith('CONECT')) continue;
    const a = bySerial.get(+line.slice(6, 11));
    if (a === undefined) continue;
    for (let c = 11; c + 5 <= line.length; c += 5) {
      const b = bySerial.get(+line.slice(c, c + 5).trim());
      if (b !== undefined) add(a, b);
    }
  }
  /* Side chains carry no CONECT: bond by distance inside one residue only,
     where 1.9 A catches C-S (1.8) and nothing else is near enough. */
  const d = (A, B) => Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1], A.p[2] - B.p[2]);
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++) {
      const A = atoms[i], B = atoms[j];
      if (A.group === 'heme' || A.num !== B.num || A.group !== B.group) continue;
      if (d(A, B) < 1.9) add(i, j);
    }

  /* Each thioether joins a Cys SG to a vinyl's alpha carbon: CAB for the
     first Cys, CAC for the second (CBB/CBC are the beta carbons). Heme c
     always carries both, so a pair the file leaves out of CONECT is still
     drawn, flagged, within THIO_MAX. Past that it is not a bond in this model. */
  const find = (group, num, name) => atoms.findIndex(a => a.group === group &&
                                                    (num == null || a.num === num) && a.name === name);
  const thio = site.cys.map((num, k) => {
    const to = k ? 'CAC' : 'CAB';
    const s = find('cys', num, 'SG'), c = find('heme', null, to);
    const deposited = seen.has(Math.min(s, c) + ':' + Math.max(s, c));
    const dist = +d(atoms[s], atoms[c]).toFixed(2);
    const drawn = deposited || dist <= THIO_MAX;
    if (drawn) add(s, c);
    return { cys: num, to, deposited, dist, drawn };
  });
  const fe = find('heme', null, 'FE');
  const lig = (group, num, name) => {
    const i = find(group, num, name);
    return { res: `${atoms[i].res}${num}`, deposited: seen.has(Math.min(i, fe) + ':' + Math.max(i, fe)),
             dist: +d(atoms[i], atoms[fe]).toFixed(2) };
  };
  return { atoms, bonds, thio,
           iron: [lig('his', site.his, 'NE2'), lig('met', site.met, 'SD')] };
}

function bake(v) {
  v = { ...v, chain: v.chains, site: v.pocket };
  const text = fs.readFileSync(path.join(SRC, v.id + '.pdb'), 'utf8');
  const R = Bake.ssRanges(text);
  const traced = Bake.caTrace(text, new Set([v.chain]));
  if (!traced.size) throw new Error(v.id + ': no CA on chain ' + v.chain);
  const res = traced.get(v.chain);
  const c = [0, 1, 2].map(k => res.reduce((s, r) => s + [r.x, r.y, r.z][k], 0) / res.length);
  const T = Bake.assemble(traced, R, c);
  const site = pocket(text, v.chain, v.site);
  const shift = p => p.map((x, k) => r2(x - c[k]));

  const out = { source: v.id + '.pdb', ssFrom: Bake.ssFrom(R), centre: T.centre,
                order: T.order, chains: T.chains, radius: T.radius };
  out.pocket = { atoms: site.atoms.map(a => ({ name: a.name, el: a.el, res: a.res, num: a.num,
                                               group: a.group, p: shift(a.p) })),
                 bonds: site.bonds };
  const F = Bake.frameOf(out.chains[v.chain].CA);
  const FV = Bake.viewFor(ME, F);
  if (FV.view) out.view = FV.view;
  out.extents = F.extents;
  out.frame = FV.frame;

  const decl = Bake.declared(text);
  const ch = out.chains[v.chain];
  out.meta = {
    entry: v.id, chain: v.chain, purpose: v.purpose,
    method: Bake.method(text), resolution: Bake.resolution(text),
    title: Bake.line1(text, 'TITLE'), chainsInFile: Bake.chainCount(text),
    helices: ch.helices, strands: ch.strands,
    counts: [{ chain: v.chain, modelled: ch.nums.length,
               declared: decl[v.chain] === undefined ? null : decl[v.chain] }],
    hemeAtoms: site.atoms.filter(a => a.group === 'heme').length,
    lysines: new Set(site.atoms.filter(a => a.group === 'lys').map(a => a.num)).size,
    thio: site.thio, iron: site.iron,
    ec: Bake.ecNumbers(text)[0] || null,
  };
  out.read = {
    method: Bake.method(text), chainsInFile: Bake.chainCount(text),
    residues: ch.nums.length, declared: out.meta.counts[0].declared,
    ec: out.meta.ec, baked: `cytc-${v.id}.json`,
  };
  return out;
}

function main() {
  const blocks = {};
  for (const v of VIEWS) {
    const { read, ...out } = bake(v);
    fs.writeFileSync(path.join(DATA, read.baked), JSON.stringify(out));
    blocks[v.id] = read;
    const m = out.meta;
    console.log(`${v.id} chain ${v.chains}  ${m.counts[0].modelled}/${m.counts[0].declared} residues, ` +
      `${m.helices} helices, heme ${m.hemeAtoms} atoms, ${m.lysines} Lys, ` +
      `thio ${m.thio.map(t => `C${t.cys}-${t.to} ${t.dist}A${t.deposited ? '' : ' (not deposited)'}`).join(', ')}, ` +
      `Fe ${m.iron.map(l => `${l.res} ${l.dist}A`).join(', ')}, view ${out.frame}`);
  }
  console.log(`registry proteins.js  ${IO.write('cytc', blocks).length} variants updated`);
}

if (require.main === module) main();
module.exports = { bake, VIEWS };
