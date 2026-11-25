#!/usr/bin/env node
/* =====================================================================
 *  prep.js — catalase: human 1DGF's tetramer and one subunit's active
 *  site, and yeast 1A4E's subunit with an inhibitor on the iron.
 *
 *  Run:  node proteins/catalase/tools/prep.js     (offline, no dependencies)
 *
 *  The view table is proteins/proteins.js: which entry, which chains, which
 *  residues make each pocket. This writes the `read` half back.
 *
 *  SOURCES (data/src is gitignored):
 *    for id in 1DGF 1A4E; do
 *      curl -o proteins/catalase/data/src/$id.pdb https://files.rcsb.org/download/$id.pdb
 *    done
 *
 *  1DGF's asymmetric unit IS the tetramer (REMARK 350: identity operator on
 *  A-D), so no assembly merge. Every chain is 497 of 497, no gaps.
 *
 *  THE ACTIVE SITE. 2 H2O2 -> 2 H2O + O2 happens on the heme iron. A His and
 *  an Asn sit above the ring (distal, where peroxide arrives), a Tyr below it
 *  with its phenolate on the iron. The registry names them per variant; the
 *  residue names at those numbers are asserted here, and the Tyr-Fe bond
 *  comes off the file's LINK records, which CONECT does not carry.
 *
 *  THE NEIGHBOUR. A catalase subunit's heme pocket is not all its own: the
 *  file's SITE record lists chain C residues around chain A's heme. That is
 *  measured here rather than copied: every residue of another chain with an
 *  atom within CONTACT of the heme. Printed and baked into meta, not drawn:
 *  a view of it was reviewed and cut as off the lab's point.
 *
 *  NADPH (NDP) is modelled in chains A and C only. Counted, not assumed.
 *
 *  YEAST, 1A4E, is catalase A from S. cerevisiae. Azide (AZI) is LINKed to
 *  every iron on the distal side, so it is an INHIBITED enzyme. Its site
 *  residues match human's by distance to the iron (His NE2 4.68 against
 *  4.70 A, Asn ND2 6.15 against 6.24) and by the file's SITE record for the
 *  azide. The registry's `fit` puts it on 1DGF-site's heme by atom name,
 *  myoglobin's method; it takes that bake's centre and solved view, so
 *  flipping between the two keeps the iron still.
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
const ME = REG.byKey('catalase');
const VIEWS = ME.variants;
/* A heavy-atom contact. Van der Waals contact is ~3.5-4.0; 4.0 is the usual
   cutoff for "lines the pocket" and admits no second shell. */
const CONTACT = 4.0;
const SUBJECT = 'A';


const r2 = Bake.r2, xyz = Bake.xyz;
const elOf = l => (l.slice(76, 78).trim() || l.slice(12, 14).trim()).toUpperCase();
const resOf = l => l.slice(17, 20).trim();
const numOf = l => parseInt(l.slice(22, 26), 10);
const BACKBONE = new Set(['N', 'C', 'O']);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function atomLines(text) {
  return text.split('\n').filter(l => (l.startsWith('ATOM') || l.startsWith('HETATM')) &&
    (l[16] === ' ' || l[16] === 'A') && elOf(l) !== 'H' && elOf(l) !== 'D');
}

/* Every residue of another chain with any atom within CONTACT of `chain`'s
   heme. Waters and acetate (crystallisation) are not residues of a chain. */
function neighbours(lines, chain) {
  const heme = lines.filter(l => l[21] === chain && resOf(l) === 'HEM').map(xyz);
  const own = new Set(), other = new Map();
  for (const l of lines) {
    if (!l.startsWith('ATOM')) continue;
    const p = xyz(l);
    if (!heme.some(h => dist(h, p) < CONTACT)) continue;
    const key = `${l[21]}:${numOf(l)}`;
    if (l[21] === chain) own.add(key);
    else other.set(key, { chain: l[21], num: numOf(l), res: resOf(l) });
  }
  return { own: own.size, other: [...other.values()].sort((a, b) => a.chain.localeCompare(b.chain) || a.num - b.num) };
}

function pocket(text, lines, want) {
  const hemes = new Set(want.hemes.split(','));
  const siteRes = new Map();
  for (const g of ['distal', 'proximal'])
    for (const n of Object.keys(want[g] || {})) siteRes.set(`${SUBJECT}:${n}`, g);

  const atoms = [], bySerial = new Map();
  for (const l of lines) {
    const ch = l[21], res = resOf(l), name = l.slice(12, 16).trim();
    let group = null;
    if (l.startsWith('HETATM')) {
      if (res === 'HEM' && hemes.has(ch)) group = 'heme';
      else if (res === 'NDP' && want.ndp && hemes.has(ch)) group = 'ndp';
      else if (res === want.inhibitor && hemes.has(ch)) group = 'inhibitor';
    } else if (!BACKBONE.has(name)) {
      group = siteRes.get(`${ch}:${numOf(l)}`) || null;
    }
    if (!group) continue;
    bySerial.set(+l.slice(6, 11), atoms.length);
    atoms.push({ name, el: elOf(l), res, num: numOf(l), chain: ch, group, p: xyz(l) });
  }

  const bonds = [], seen = new Set();
  const add = (i, j) => {
    const lo = Math.min(i, j), hi = Math.max(i, j);
    if (lo === hi || seen.has(lo + ':' + hi)) return;
    seen.add(lo + ':' + hi); bonds.push([lo, hi]);
  };
  for (const l of text.split('\n')) {
    if (!l.startsWith('CONECT')) continue;
    const a = bySerial.get(+l.slice(6, 11));
    if (a === undefined) continue;
    for (let c = 11; c + 5 <= l.length; c += 5) {
      const b = bySerial.get(+l.slice(c, c + 5).trim());
      if (b !== undefined) add(a, b);
    }
  }
  /* Side chains carry no CONECT: bond inside one residue only, at 1.9 A,
     which takes C-C, C-N, C-O and P-O and nothing non-bonded. Fe is left to
     CONECT and LINK so the coordination is the file's, not a cutoff's. */
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++) {
      const A = atoms[i], B = atoms[j];
      if (A.chain !== B.chain || A.num !== B.num || A.res !== B.res) continue;
      if (A.el === 'FE' || B.el === 'FE') continue;
      if (dist(A.p, B.p) < 1.9) add(i, j);
    }

  /* LINK: the proximal Tyr OH to Fe, and in 1A4E the azide's N1. Drawn only where both ends are drawn. */
  const links = [];
  for (const l of text.split('\n')) {
    if (!l.startsWith('LINK')) continue;
    const e1 = { name: l.slice(12, 16).trim(), res: l.slice(17, 20).trim(), chain: l[21], num: parseInt(l.slice(22, 26), 10) };
    const e2 = { name: l.slice(42, 46).trim(), res: l.slice(47, 50).trim(), chain: l[51], num: parseInt(l.slice(52, 56), 10) };
    const d = parseFloat(l.slice(73, 78));
    links.push({ a: `${e1.res}${e1.num}${e1.chain}.${e1.name}`, b: `${e2.res}${e2.chain}.${e2.name}`, d });
    const find = e => atoms.findIndex(x => x.chain === e.chain && x.num === e.num && x.name === e.name && x.res === e.res);
    const i = find(e1), j = find(e2);
    if (i >= 0 && j >= 0) add(i, j);
  }
  return { atoms, bonds, links };
}

/* Rewrite every coordinate by R·p + t, so everything traced afterwards is
   already in the reference frame. cas9's prep.js has the same. */
function moveText(text, F) {
  return text.split('\n').map(l => {
    if (!l.startsWith('ATOM') && !l.startsWith('HETATM')) return l;
    const q = Bake.mul(F.R, xyz(l)).map((v, k) => v + F.t[k]);
    return l.slice(0, 30) + q.map(v => v.toFixed(3).padStart(8)).join('') + l.slice(54);
  }).join('\n');
}

const hemeByName = (lines, chain) => new Map(lines
  .filter(l => l[21] === chain && resOf(l) === 'HEM').map(l => [l.slice(12, 16).trim(), xyz(l)]));

/* `ref` is a bake already made: a fitted view takes its centre and view. */
function bake(c, text, lines, contacts, ref) {
  const ENTRY = c.source.id;
  const only = new Set(c.chains.split(','));
  const R = Bake.ssRanges(text);
  const traced = Bake.caTrace(text, only);
  if (traced.size !== only.size) throw new Error(`${c.id}: traced ${traced.size} of ${only.size} chains`);

  const centreOn = [...traced.values()].flat();
  const ctr = ref ? ref.centre
    : [0, 1, 2].map(k => centreOn.reduce((s, r) => s + [r.x, r.y, r.z][k], 0) / centreOn.length);
  const T = Bake.assemble(traced, R, ctr);
  const site = pocket(text, lines, c.pocket);
  const shift = p => p.map((x, k) => r2(x - ctr[k]));

  const out = { source: ENTRY + '.pdb', ssFrom: Bake.ssFrom(R), centre: T.centre,
                order: T.order, chains: T.chains, radius: T.radius };
  out.pocket = { atoms: site.atoms.map(a => ({ name: a.name, el: a.el, res: a.res, num: a.num,
                                               chain: a.chain, group: a.group, p: shift(a.p) })),
                 bonds: site.bonds };
  const pts = out.order.flatMap(id => out.chains[id].CA);
  const F = Bake.frameOf(pts);
  out.extents = F.extents;
  /* A fitted view's fallback is its reference's solved basis, not its own:
     the two share a frame, and a basis of their own would turn the pair. */
  const FV = Bake.viewFor(ME, ref ? { view: ref.view, frame: ref.frame } : F, c);
  if (FV.view) out.view = FV.view;
  out.frame = FV.frame;

  const decl = Bake.declared(text);
  const groups = {};
  for (const a of site.atoms) groups[a.group] = (groups[a.group] || 0) + 1;
  out.meta = {
    entry: ENTRY, subject: SUBJECT,
    fitOn: ref ? c.fitOn : null,
    fit: ref ? { on: c.fitOn, by: 'heme atoms by name', atoms: c.fitAtoms, rmsd: r2(c.fitRmsd) } : null,
    method: Bake.method(text), resolution: Bake.resolution(text),
    title: Bake.line1(text, 'TITLE'), chainsInFile: Bake.chainCount(text),
    counts: out.order.map(id => ({ chain: id, modelled: out.chains[id].nums.length,
                                   declared: decl[id] === undefined ? null : decl[id],
                                   helices: out.chains[id].helices, strands: out.chains[id].strands })),
    ligands: Bake.ligands(text, null),
    ec: Bake.ecNumbers(text)[0] || null,
    pocketAtoms: groups,
    tyrFe: site.links.filter(k => k.a.startsWith('TYR') && k.b.includes('.FE')),
    onIron: site.links.filter(k => k.a.includes('.FE') && !k.b.startsWith('TYR'))
      .map(k => ({ what: k.b.split('.')[0].replace(/[A-Z]$/, ''), chain: k.a.split('.')[0].slice(-1), d: k.d })),
    contacts: { own: contacts.own, other: contacts.other },
    ndpChains: [...new Set(lines.filter(l => resOf(l) === 'NDP').map(l => l[21]))],
  };
  out.read = {
    method: out.meta.method, chainsInFile: out.meta.chainsInFile,
    residues: out.meta.counts.reduce((k, x) => k + x.modelled, 0),
    declared: out.meta.counts.every(x => x.declared !== null)
      ? out.meta.counts.reduce((k, x) => k + x.declared, 0) : null,
    ec: out.meta.ec, baked: `catalase-${c.id}.json`,
  };
  return out;
}

function main() {
  const files = {};
  for (const v of VIEWS) {
    const id = v.source.id;
    if (!files[id]) {
      const text = fs.readFileSync(path.join(SRC, id + '.pdb'), 'utf8');
      const lines = atomLines(text);
      files[id] = { text, lines, contacts: neighbours(lines, SUBJECT) };
    }
    /* The site is asserted, not trusted: a renumbered entry would put "His75"
       on whatever residue lands there. */
    const { lines } = files[id];
    for (const g of ['distal', 'proximal']) for (const [n, name] of Object.entries(v.pocket[g] || {})) {
      const got = lines.find(l => l.startsWith('ATOM') && l[21] === SUBJECT && numOf(l) === +n);
      if (!got || resOf(got) !== name) throw new Error(`${v.id} ${SUBJECT}${n} is ${got && resOf(got)}, expected ${name}`);
    }
  }
  /* The reference first, so a fitted view can take its centre and basis. */
  const fit = ME.fit;
  const order = [...VIEWS].sort((a, b) => (b.id === fit.on) - (a.id === fit.on));
  const blocks = {}, done = {};
  for (const v of order) {
    let { text, lines, contacts } = files[v.source.id], ref = null, c = v;
    if (fit.among.includes(v.id) && v.id !== fit.on) {
      ref = done[fit.on];
      const mine = hemeByName(lines, SUBJECT), theirs = hemeByName(files[ref.meta.entry].lines, SUBJECT);
      const names = [...mine.keys()].filter(n => theirs.has(n));
      const F = Bake.kabsch(names.map(n => mine.get(n)), names.map(n => theirs.get(n)));
      text = moveText(text, F);
      lines = atomLines(text);
      c = { ...v, fitOn: fit.on, fitRmsd: F.rmsd, fitAtoms: names.length };
    }
    const { read, ...out } = bake(c, text, lines, contacts, ref);
    done[v.id] = out;
    fs.writeFileSync(path.join(DATA, read.baked), JSON.stringify(out));
    blocks[v.id] = read;
    const kb = (fs.statSync(path.join(DATA, read.baked)).size / 1024).toFixed(0);
    console.log(`${v.id}  chains ${out.order.join('')}, pocket ${JSON.stringify(out.meta.pocketAtoms)}, ` +
      `${out.extents.join(' × ')} A, view ${out.frame}` +
      (out.meta.fit ? `, fit ${out.meta.fit.rmsd} A over ${out.meta.fit.atoms} heme atoms` : '') + `, ${kb} KB`);
  }
  for (const [id, f] of Object.entries(files))
    console.log(`${id} heme ${SUBJECT}: ${f.contacts.own} own residues within ${CONTACT} A; others: ` +
      (f.contacts.other.map(x => `${x.res}${x.num}${x.chain}`).join(' ') || 'none'));
  console.log(`registry proteins.js  ${IO.write('catalase', blocks).length} variants updated`);
}

if (require.main === module) main();
module.exports = { VIEWS };
