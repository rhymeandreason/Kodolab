#!/usr/bin/env node
/* =====================================================================
 *  prep.js — chicken ovalbumin, the egg-white storage protein: the ribbon,
 *  the serpin loop it never uses, and what the hen bolted on.
 *
 *  Run:  node proteins/ovalbumin/tools/prep.js     (offline, no dependencies)
 *
 *  SOURCE, for a re-run from scratch (data/src is gitignored):
 *
 *    curl -o proteins/ovalbumin/data/src/1OVA.pdb https://files.rcsb.org/download/1OVA.pdb
 *
 *  The view table is proteins/proteins.js; this writes the `read` half back.
 *
 *  1OVA holds four copies; REMARK 350 pairs them A+B and C+D, but ovalbumin
 *  is a monomer in egg white, so chain A alone is drawn.
 *
 *  THE NUMBERING IS α1-ANTITRYPSIN'S, NOT OVALBUMIN'S. Serpins are numbered
 *  onto antitrypsin so the loop lines up across the family, which leaves
 *  insertion codes (83A, 87B..87I) and skipped numbers (no 362). caTrace
 *  drops the insertion code, so 83 and 83A collide, and Proteinbox splits a
 *  ribbon at every jump in `nums`: baked raw, chain A draws as ~20 splinters.
 *  So residues are renumbered 1..n in file order here, and `nums` jumps only
 *  where the CA–CA distance says the backbone really breaks. `labels` keeps
 *  the file's own numbers for anything a page prints.
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
const ME = REG.byKey('ovalbumin');

/* In the file's (antitrypsin) numbering. The reactive-centre loop is P17–P3',
   342–361; P1–P1' is Ala358–Ser359, ovalbumin's own Ala352–Ser353. */
const SITE = { loop: ['342', '361'], scissile: ['358', '359'],
               glycan: '298' };

/* Consecutive CAs sit 3.8 A apart (cis-Pro 2.9); past 4.2 the chain is cut. */
const CA_GAP = 4.2;
const BACKBONE = new Set(['N', 'C', 'O']);
const elOf = l => (l.slice(76, 78).trim() || l.slice(12, 14).trim()).toUpperCase();
const key = l => l.slice(22, 27).trim();

function trace(text, chain, mod) {
  const res = [];
  for (const line of text.split('\n')) {
    const het = line.startsWith('HETATM') && mod.has(line.slice(17, 20).trim());
    if (!line.startsWith('ATOM') && !het) continue;
    if (line[21] !== chain || line.slice(12, 16).trim() !== 'CA') continue;
    if (line[16] !== ' ' && line[16] !== 'A') continue;
    const p = Bake.xyz(line);
    res.push({ label: key(line), x: p[0], y: p[1], z: p[2] });
  }
  let n = 0, cuts = 0;
  res.forEach((r, i) => {
    const q = res[i - 1];
    const gap = q && Math.hypot(r.x - q.x, r.y - q.y, r.z - q.z) > CA_GAP;
    if (gap) cuts++;
    r.num = n += gap ? 2 : 1;
  });
  return { res, cuts, byLabel: new Map(res.map(r => [r.label, r.num])) };
}

/* HELIX/SHEET read with their insertion codes and mapped onto the new numbers. */
function ssRenumbered(text, chain, byLabel) {
  const H = [], E = [];
  for (const line of text.split('\n')) {
    let a, b;
    if (line.startsWith('HELIX ') && line[19] === chain) {
      a = line.slice(21, 26).trim(); b = line.slice(33, 38).trim();
      H.push([a, b]);
    } else if (line.startsWith('SHEET ') && line[21] === chain) {
      a = line.slice(22, 27).trim(); b = line.slice(33, 38).trim();
      E.push([a, b]);
    }
  }
  const map = ([a, b]) => {
    if (!byLabel.has(a) || !byLabel.has(b)) throw new Error(`ss range ${a}-${b} not in the trace`);
    return { chain, from: byLabel.get(a), to: byLabel.get(b) };
  };
  return { H: H.map(map), E: E.map(map) };
}

/* Sticks for the page's toggles: the loop (side chains on CA), the scissile
   pair, the two phosphoserines, and the sugar with the Asn it hangs from. */
function sticks(text, chain, byLabel, centre, VIEW) {
  const lo = byLabel.get(VIEW.loop[0]), hi = byLabel.get(VIEW.loop[1]);
  const cut = new Set(VIEW.scissile.map(l => byLabel.get(l)));
  const atoms = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue;
    if (line[21] !== chain || (line[16] !== ' ' && line[16] !== 'A')) continue;
    const res = line.slice(17, 20).trim(), name = line.slice(12, 16).trim(), lab = key(line);
    if (BACKBONE.has(name)) continue;
    let group = null, num = byLabel.get(lab);
    if (res === 'NAG') { group = 'glycan'; num = null; }
    else if (lab === VIEW.glycan) group = 'glycan';
    else if (res === 'SEP') group = 'phospho';
    else if (num >= lo && num <= hi) group = cut.has(num) ? 'scissile' : 'loop';
    if (!group || elOf(line) === 'H') continue;
    atoms.push({ name, el: elOf(line), res, num, label: lab, group,
                 p: Bake.xyz(line).map((x, k) => Bake.r2(x - centre[k])) });
  }
  /* No CONECT for any of it: bond by distance, inside one residue, plus the
     Asn ND2–NAG C1 link inside the glycan group. 1.9 A catches C–S and P–O
     and nothing non-bonded. */
  const bonds = [];
  const d = (A, B) => Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1], A.p[2] - B.p[2]);
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++) {
      const A = atoms[i], B = atoms[j];
      if (A.group !== B.group) continue;
      if (A.label !== B.label && A.group !== 'glycan') continue;
      if (d(A, B) < 1.9) bonds.push([i, j]);
    }
  return { atoms, bonds };
}
function bake(v) {
  const VIEW = { ...SITE, id: v.id, chain: v.chains };
  const text = fs.readFileSync(path.join(SRC, VIEW.id + '.pdb'), 'utf8');
  const mod = Bake.modResidues(text);
  const T0 = trace(text, VIEW.chain, mod);
  const R = ssRenumbered(text, VIEW.chain, T0.byLabel);
  const T = Bake.assemble(new Map([[VIEW.chain, T0.res]]), R);
  const out = { source: VIEW.id + '.pdb', ssFrom: Bake.ssFrom(R), centre: T.centre,
                order: T.order, chains: T.chains, radius: T.radius };
  out.chains[VIEW.chain].labels = T0.res.map(r => r.label);
  out.pocket = sticks(text, VIEW.chain, T0.byLabel, T.centre, VIEW);

  const F = Bake.frameOf(out.chains[VIEW.chain].CA);
  const FV = Bake.viewFor(ME, F);
  if (FV.view) out.view = FV.view;
  out.extents = F.extents;
  out.frame = FV.frame;

  const ch = out.chains[VIEW.chain];
  const decl = Bake.declared(text)[VIEW.chain];
  const only = new Set([VIEW.chain]);
  /* SEQRES counts the N-terminal acetyl cap as a residue; the chain is one fewer. */
  const capped = /^SEQRES   1 . +\d+ +ACE/m.test(text);
  out.meta = {
    entry: VIEW.id, chain: VIEW.chain,
    method: Bake.method(text), resolution: Bake.resolution(text),
    title: Bake.line1(text, 'TITLE'), chainsInFile: Bake.chainCount(text),
    helices: ch.helices, strands: ch.strands, breaks: T0.cuts,
    counts: [{ chain: VIEW.chain, modelled: ch.nums.length,
               declared: decl === undefined ? null : decl - (capped ? 1 : 0) }],
    /* Read here rather than Bake.disulfides, which drops the insertion code (87H). */
    disulfides: text.split('\n').filter(l => l.startsWith('SSBOND') && l[15] === VIEW.chain && l[29] === VIEW.chain)
      .map(l => l.slice(17, 22).trim() + '-' + l.slice(31, 36).trim()),
    cysteines: (text.match(new RegExp(`^ATOM.{9}CA  CYS ${VIEW.chain}`, 'gm')) || []).length,
    phospho: [...new Set(out.pocket.atoms.filter(a => a.group === 'phospho').map(a => a.label))],
    glycan: out.pocket.atoms.filter(a => a.res === 'NAG').length,
    loop: VIEW.loop, scissile: VIEW.scissile,
    ligands: Bake.ligands(text, only, mod),
    ec: Bake.ecNumbers(text)[0] || null,
  };
  out.read = {
    method: out.meta.method, chainsInFile: out.meta.chainsInFile,
    residues: ch.nums.length, declared: out.meta.counts[0].declared,
    ec: out.meta.ec, baked: `ovalbumin-${v.id}.json`,
  };
  return out;
}

function main() {
  const blocks = {};
  for (const v of ME.variants) {
    const { read, ...out } = bake(v), m = out.meta, c = m.counts[0];
    const file = read.baked;
    blocks[v.id] = read;
    fs.writeFileSync(path.join(DATA, file), JSON.stringify(out));
    console.log(`${m.entry} chain ${m.chain}  ${c.modelled}/${c.declared} residues, ` +
      `${Bake.breaks(out)} break(s) (${m.breaks} by CA gap), ${m.helices} helices, ${m.strands} strands, ` +
      `SS ${m.disulfides.join(' ')}, ${m.cysteines} Cys, P-Ser ${m.phospho.join(' ')}, ` +
      `NAG ${m.glycan} atoms, ligands [${m.ligands.join(' ')}], ${out.extents.join(' × ')} A, ` +
      `view ${out.frame}, ${(fs.statSync(path.join(DATA, file)).size / 1024).toFixed(0)} KB`);
  }
  console.log(`registry proteins.js  ${IO.write('ovalbumin', blocks).length} variants updated`);
}

if (require.main === module) main();
module.exports = { bake, SITE };
