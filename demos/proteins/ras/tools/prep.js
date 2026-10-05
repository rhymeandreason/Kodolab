#!/usr/bin/env node
/* =====================================================================
 *  prep.js — Ras on and off, superposed, with the nucleotide in the site.
 *
 *  Run:  node proteins/ras/tools/prep.js    (offline, no dependencies)
 *
 *  WHICH STRUCTURES, AND WHY, IS proteins/proteins.js's `ras` entry. This
 *  writes each variant's bake and its `read` block back there.
 *
 *  SOURCES, for a re-run from scratch (*.pdb is gitignored):
 *
 *    for id in 4Q21 5P21 1AGP 6OIM; do
 *      curl -o proteins/ras/data/src/$id.pdb \
 *        https://files.rcsb.org/download/$id.pdb
 *    done
 *
 *  CHAIN A OF THE ASYMMETRIC UNIT, NOT 5P21's ASSEMBLY. triage.js flags
 *  REMARK 350's dimer; it is a crystal contact, and Ras signals as a
 *  monomer. 4Q21 declares 189 and models 1-168; 169-189 are the
 *  hypervariable tail and the CAAX box, absent from both files and from
 *  the switch.
 *
 *  SUPERPOSED ON THE CORE, NEVER ON EVERYTHING. A fit over all paired Ca
 *  spreads the switch loops' movement across the whole fold, so the core
 *  appears to drift and the loops appear to move less than they do. The
 *  switch ranges are the field's definitions (Milburn 1990, Vetter &
 *  Wittinghofer 2001), widened by two residues each side so a hinge
 *  residue does not pull the fit. The core rmsd is printed: if it is not
 *  small, the definition is wrong for these files and the bench says so.
 *
 *  THE POCKET IS THE NUCLEOTIDE, THE Mg, AND THE TWO SIDE CHAINS THAT
 *  HOLD THE Mg. Which atoms bond to the Mg is read off LINK records, never
 *  a distance: 5P21 links Thr35 OG1 to the Mg and 4Q21 does not, and that
 *  one record is the switch's mechanism. Nucleotide bonds come off CONECT;
 *  the side chains are ATOM lines with no CONECT, so their internal bonds
 *  are by distance inside one residue, where nothing else is close enough
 *  to be wrong about. Waters on the Mg are counted, not drawn.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const Bake = require('../../bake-lib.js');
const { kabsch, mul, r2, xyz } = Bake;

const HERE = path.join(__dirname, '..');
const SRC = path.join(HERE, 'data', 'src');
const DATA = path.join(HERE, 'data');

/* THE VIEW TABLE IS proteins/proteins.js. `fit.on` is the frame the others
   are fitted into: off, because on is the change a signal makes FROM it. */
const REG = require('../../proteins.js');
const IO = require('../../tools/registry-io.js');
const ME = REG.byKey('ras');
const VIEWS = ME.variants;
const REF = ME.fit.on;

const SWITCH = { I: [30, 38], II: [59, 76] };
const WIDEN = 2;
const COMPARE = [1, 166];                // what both files model
const NUCLEOTIDE = new Set(['GNP', 'GDP', 'GTP']);
const SIDES = [12, 17, 35];              // residue 12 (the oncogenic hotspot); Ser17, Thr35 (hold the Mg)
const DRUG = new Set(['MOV']);           // sotorasib, bound form (6OIM HETNAM)

const inSwitch = (n, w = 0) => Object.values(SWITCH).some(([a, b]) => n >= a - w && n <= b + w);
const elOf = l => (l.slice(76, 78).trim() || l.slice(12, 14).trim()).toUpperCase();
const key = (res, chain, num, name) => `${res}|${chain}|${num}|${name}`;

/* ---- the pocket ------------------------------------------------------ */

function pocket(text, chain) {
  const lines = text.split('\n');
  const atoms = [], bySerial = new Map(), byKey = new Map();
  const keep = (line, group) => {
    const alt = line[16];
    if (alt !== ' ' && alt !== 'A') return;
    /* Heavy atoms only: 1AGP deposits hydrogens and the rest do not, and a
       pocket that changes how it is drawn between views reads as a change. */
    if (elOf(line) === 'H') return;
    const name = line.slice(12, 16).trim(), res = line.slice(17, 20).trim();
    const num = parseInt(line.slice(22, 26), 10);
    bySerial.set(+line.slice(6, 11), atoms.length);
    byKey.set(key(res, chain, num, name), atoms.length);
    atoms.push({ name, el: elOf(line), res, num, group, p: xyz(line) });
  };

  for (const line of lines) {
    if (line[21] !== chain) continue;
    if (line.startsWith('HETATM')) {
      const res = line.slice(17, 20).trim();
      if (NUCLEOTIDE.has(res)) keep(line, 'nucleotide');
      else if (res === 'MG') keep(line, 'metal');
      else if (DRUG.has(res)) keep(line, 'drug');
    } else if (line.startsWith('ATOM')) {
      const num = parseInt(line.slice(22, 26), 10);
      if (!SIDES.includes(num)) continue;
      const name = line.slice(12, 16).trim();
      if (name === 'N' || name === 'C' || name === 'O') continue;
      keep(line, 'side');
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
      if (b !== undefined && atoms[a].group !== 'metal' && atoms[b].group !== 'metal') add(a, b);
    }
  }
  const near = (A, B) => Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1], A.p[2] - B.p[2]);
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++)
      if (atoms[i].group === 'side' && atoms[j].group === 'side' &&
          atoms[i].num === atoms[j].num && near(atoms[i], atoms[j]) < 1.9) add(i, j);

  /* LINK: what the Mg is coordinated by, as the depositors declared it. */
  const holds = [], covalent = [];
  let waters = 0;
  for (const line of lines) {
    if (!line.startsWith('LINK')) continue;
    const end = o => ({ name: line.slice(o, o + 4).trim(), res: line.slice(o + 5, o + 8).trim(),
                        chain: line[o + 9], num: parseInt(line.slice(o + 10, o + 14), 10) });
    const A = end(12), B = end(42);
    const [mg, other] = A.res === 'MG' ? [A, B] : B.res === 'MG' ? [B, A] : [null, null];
    /* Any other LINK between two kept atoms is a covalent bond the deposition
       declares: sotorasib's C25 onto Cys12 SG. */
    if (!mg) {
      const i = byKey.get(key(A.res, A.chain, A.num, A.name));
      const j = byKey.get(key(B.res, B.chain, B.num, B.name));
      if (i !== undefined && j !== undefined) {
        add(i, j); covalent.push(`${A.res}${A.num} ${A.name}–${B.res} ${B.name}`);
      }
      continue;
    }
    if (mg.chain !== chain) continue;
    if (other.res === 'HOH') { waters++; continue; }
    holds.push(`${other.res}${other.num} ${other.name}`);
    const i = byKey.get(key('MG', chain, mg.num, mg.name));
    const j = byKey.get(key(other.res, other.chain, other.num, other.name));
    if (i !== undefined && j !== undefined) add(i, j);
  }

  const nuc = atoms.find(a => a.group === 'nucleotide');
  const drug = atoms.find(a => a.group === 'drug');
  const res12 = lines.find(l => l.startsWith('ATOM') && l[21] === chain &&
                                parseInt(l.slice(22, 26), 10) === 12);
  /* Point substitutions only; tags and the initiating Met are construct, not variant. */
  const mutations = lines.filter(l => l.startsWith('SEQADV') && l[16] === chain &&
                                      /MUTATION|VARIANT/.test(l.slice(49)))
    .map(l => `${l.slice(39, 42).trim()}${parseInt(l.slice(43, 48), 10)}${l.slice(12, 15).trim()}`);
  return {
    atoms, bonds,
    meta: {
      nucleotide: nuc ? nuc.res : null,
      phosphates: atoms.filter(a => a.group === 'nucleotide' && /^P[ABG]$/.test(a.name)).length,
      mgHeldBy: holds, mgWaters: waters,
      residue12: res12 ? res12.slice(17, 20).trim() : null,
      mutations, drug: drug ? drug.res : null, covalent,
    },
  };
}

/* ---- a HELIX record the file left out -------------------------------
 *
 *  Ca(i)..Ca(i+3) is 5.0-5.5 A in an α-helix and 9-10 A in a strand or an
 *  extended coil. Every pair inside the range must sit under 6 A, or the
 *  bake stops: an added record has to be a measurement of THIS file.
 */
function helixCheck(ca, h, id) {
  const d = [];
  for (let n = h.from; n + 3 <= h.to; n++) {
    const a = ca.get(n), b = ca.get(n + 3);
    if (!a || !b) throw new Error(`${id} ${h.name}: residue ${!a ? n : n + 3} unmodelled`);
    d.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  const max = Math.max(...d);
  if (max > 6) throw new Error(`${id} ${h.name}: Ca i..i+3 reaches ${max.toFixed(2)} A, not a helix`);
  return { name: h.name, from: h.from, to: h.to,
           i3: [r2(Math.min(...d)), r2(max)] };
}

/* ---- the fit --------------------------------------------------------- */

const caOf = (text, chain) => new Map(Bake.caTrace(text, new Set([chain])).get(chain)
  .map(r => [r.num, [r.x, r.y, r.z]]));

function fitOnto(ref, mov) {
  const nums = [...mov.keys()].filter(n => ref.has(n) && n >= COMPARE[0] && n <= COMPARE[1]);
  const core = nums.filter(n => !inSwitch(n, WIDEN));
  const k = kabsch(core.map(n => mov.get(n)), core.map(n => ref.get(n)));
  const put = p => mul(k.R, p).map((x, i) => x + k.t[i]);

  const d = n => { const a = put(mov.get(n)), b = ref.get(n);
                   return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  const rms = ns => r2(Math.sqrt(ns.reduce((s, n) => s + d(n) ** 2, 0) / ns.length));
  const region = ([a, b]) => nums.filter(n => n >= a && n <= b);
  let far = nums[0];
  for (const n of nums) if (d(n) > d(far)) far = n;

  return {
    put,
    motion: {
      compared: nums.length, core: core.length, coreRms: r2(k.rmsd),
      switchI: { range: SWITCH.I, rms: rms(region(SWITCH.I)) },
      switchII: { range: SWITCH.II, rms: rms(region(SWITCH.II)) },
      furthest: { residue: far, moved: r2(d(far)) },
      /* Per-residue displacement, so the page can colour by it without
         re-deriving the fit. */
      shift: Object.fromEntries(nums.map(n => [n, r2(d(n))])),
    },
  };
}

/* ---- one view -------------------------------------------------------- */

function bake(v, ctx) {
  const text = fs.readFileSync(path.join(SRC, v.id + '.pdb'), 'utf8');
  const chain = v.chains;
  const R = Bake.ssRanges(text);
  const added = (v.helixAdd || []).map(h => helixCheck(caOf(text, chain), h, v.id));
  for (const h of added) R.H.push({ chain, from: h.from, to: h.to });
  const traced = Bake.caTrace(text, new Set([chain]));
  if (!traced.size) throw new Error(v.id + ': no CA on chain ' + chain);
  const site = pocket(text, chain);

  /* Fit before centring, in crystal coordinates; trace and pocket together. */
  let fit = null;
  if (v.id !== REF) {
    fit = fitOnto(ctx.refCA, caOf(text, chain));
    for (const r of traced.get(chain)) [r.x, r.y, r.z] = fit.put([r.x, r.y, r.z]);
    for (const a of site.atoms) a.p = fit.put(a.p);
  }

  /* The reference's centre for both, or the fit slides back apart. */
  const T = Bake.assemble(traced, R, ctx.centre);
  if (!ctx.centre) ctx.centre = T.centre;
  const c = ctx.centre;

  const out = { source: v.id + '.pdb', ssFrom: Bake.ssFrom(R), centre: T.centre,
                order: T.order, chains: T.chains, radius: T.radius };
  out.pocket = {
    atoms: site.atoms.map(a => ({ name: a.name, el: a.el, res: a.res, group: a.group,
                                  p: a.p.map((x, k) => r2(x - c[k])) })),
    bonds: site.bonds,
  };

  /* One basis for all four, solved off the reference; Bake.viewFor defers to
     a basis a human pasted into the registry. */
  if (!ctx.F) { ctx.F = Bake.frameOf(T.chains[chain].CA); ctx.V = Bake.viewFor(ME, ctx.F); }
  if (ctx.V.view) out.view = ctx.V.view;
  out.extents = ctx.F.extents;
  out.frame = ctx.V.frame;

  const decl = Bake.declared(text);
  out.meta = {
    entry: v.id, chain,
    method: Bake.method(text), resolution: Bake.resolution(text),
    title: Bake.line1(text, 'TITLE'), chainsInFile: Bake.chainCount(text),
    models: Bake.models(text),
    helices: T.chains[chain].helices, strands: T.chains[chain].strands,
    counts: [{ chain, modelled: T.chains[chain].nums.length,
               declared: decl[chain] === undefined ? null : decl[chain] }],
    ligands: Bake.ligands(text, new Set([chain])),
    helixAdded: added.length ? added : null,
    ...site.meta,
    fitOn: fit ? ctx.refId : null,
    fitOnWhat: fit ? `core Ca, switches ±${WIDEN} excluded, ${fit.motion.core} of ` +
                     `${fit.motion.compared} paired` : null,
    fitRmsd: fit ? fit.motion.coreRms : null,
    motion: fit ? fit.motion : null,
  };
  out.read = {
    method: Bake.method(text),
    chainsInFile: Bake.chainCount(text),
    residues: out.meta.counts[0].modelled,
    declared: out.meta.counts[0].declared,
    ec: Bake.ecNumbers(text)[0] || null,
    baked: `ras-${v.id}.json`,
  };
  return out;
}

function main() {
  const ref = VIEWS.find(v => v.id === REF);
  const refText = fs.readFileSync(path.join(SRC, ref.id + '.pdb'), 'utf8');
  const ctx = { refId: REF, refCA: caOf(refText, ref.chains), centre: null, F: null, V: null };
  const blocks = {};
  for (const v of [ref, ...VIEWS.filter(x => x !== ref)]) {
    const { read, ...out } = bake(v, ctx);
    fs.writeFileSync(path.join(DATA, read.baked), JSON.stringify(out));
    blocks[v.id] = read;
    const m = out.meta, kb = (fs.statSync(path.join(DATA, read.baked)).size / 1024).toFixed(0);
    console.log(`${v.id} ${v.label.padEnd(16)} ${m.counts[0].modelled}/${m.counts[0].declared} res, ` +
      `${m.helices} helices ${m.strands} strands, ${m.nucleotide} ${m.phosphates}P, ` +
      `res12 ${m.residue12} [${m.mutations.join(' ')}]${m.drug ? ' drug ' + m.drug + ' via ' + m.covalent.join(',') : ''}, ` +
      `Mg held by [${m.mgHeldBy.join(', ')}] + ${m.mgWaters} waters, ` +
      `pocket ${out.pocket.atoms.length} atoms ${out.pocket.bonds.length} bonds, ` +
      (m.motion ? `fit ${m.fitRmsd} A on ${m.motion.core} core Ca; switch I ${m.motion.switchI.rms} A, ` +
        `switch II ${m.motion.switchII.rms} A, furthest ${m.motion.furthest.residue} ` +
        `${m.motion.furthest.moved} A` : 'reference') + `, view ${out.frame}, ${kb} KB`);
  }
  const touched = IO.write('ras', blocks);
  console.log(`registry  proteins.js  ${touched.length} variants updated`);
}

if (require.main === module) main();
module.exports = { bake, SWITCH };
