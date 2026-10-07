#!/usr/bin/env node
/* =============================================================================
 *  proteins/cas9/tools/prep.js — SpCas9 in three states, one frame
 * =============================================================================
 *    node proteins/cas9/tools/prep.js
 *
 *  writes proteins/cas9/data/cas9-<id>.json, one per CANDIDATES row.
 *
 *  THE THREE ARE STATES OF ONE PROTEIN, so each is fitted onto the R-loop
 *  complex and centred on its centroid. Flipping between them then shows the
 *  REC lobe swinging, not three crystals' origins.
 *
 *  THE FIT IS ON THE NUCLEASE LOBE MINUS HNH: RuvC (1-59, 718-769, 909-1098)
 *  and the PAM-interacting domain (1099-1368), the boundaries of Nishimasu
 *  2014. REC is what moves on guide loading and HNH is what moves on target
 *  binding, so fitting on either would smear the motion over the whole
 *  protein. Even that core shifts between states, so the fit is trimmed to
 *  the residues that land within CUT of the reference. Per-domain shifts are printed and baked, so the claim that this
 *  core holds still is measured on every run.
 *
 *  WHICH DNA STRAND IS THE TARGET is counted, not assumed: the strand with the
 *  most Watson-Crick pairs to the guide RNA.
 *
 *  Dropped HETATMs: 5F9R's GTP is the guide's in-vitro-transcribed 5' end, the
 *  sulfates and 4CMP's Mg are crystallisation buffer. None is the subject.
 * ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const Bake = require(path.join(__dirname, '..', '..', 'bake-lib.js'));

const HERE = path.join(__dirname, '..', 'data');
const SRC = id => path.join(HERE, 'src', id + '.pdb');

/* Which entries exist, what each is FOR and which is the default are
   proteins/nucleic-acids.js's. What stays here is how to READ each one:
   `cas9` is the protein chain, `rna` the guide, one copy each where the
   asymmetric unit holds two. The reference is baked first, whatever order the
   registry lists them in. */
const REG = require(path.join(__dirname, '..', '..', 'nucleic-acids.js'));
const ENTRY = REG.byKey('cas9');
if (!ENTRY) throw new Error('no `cas9` in proteins/nucleic-acids.js');
const HOW = {
  '5F9R': { cas9: 'B', rna: 'A', dna: ['C', 'D'], ref: true },
  '4ZT0': { cas9: 'A', rna: 'B', dna: [] },
  '4CMP': { cas9: 'A', rna: null, dna: [] },
};
const CANDIDATES = ENTRY.variants.map(v => {
  if (!HOW[v.id]) throw new Error('no read instructions for ' + v.id);
  return Object.assign({ id: v.id, purpose: v.purpose }, HOW[v.id]);
}).sort((a, b) => (b.ref ? 1 : 0) - (a.ref ? 1 : 0));

const DOMAINS = {
  RuvC: [[1, 59], [718, 769], [909, 1098]],
  BH:   [[60, 93]],
  REC:  [[94, 717]],
  HNH:  [[775, 908]],
  PI:   [[1099, 1368]],
};
const inDom = (n, d) => DOMAINS[d].some(([a, b]) => n >= a && n <= b);
const CUT = 3;
const CORE = n => inDom(n, 'RuvC') || inDom(n, 'PI');

/* Rewrite every coordinate in the text by R·p + t, so everything traced from
   it afterwards (CA, phosphates, ring normals) is already in the reference
   frame. */
function moveText(text, F) {
  return text.split('\n').map(l => {
    if (!l.startsWith('ATOM') && !l.startsWith('HETATM')) return l;
    const q = Bake.mul(F.R, Bake.xyz(l)).map((v, k) => v + F.t[k]);
    return l.slice(0, 30) + q.map(v => v.toFixed(3).padStart(8)).join('') + l.slice(54);
  }).join('\n');
}

const caMap = (text, chain) => new Map(Bake.caTrace(text, new Set([chain]), Bake.modResidues(text))
  .get(chain).map(r => [r.num, [r.x, r.y, r.z]]));

const texts = {};
for (const c of CANDIDATES) texts[c.id] = Bake.modelOne(fs.readFileSync(SRC(c.id), 'utf8'));
const REF = CANDIDATES.find(c => c.ref);
const refCA = caMap(texts[REF.id], REF.cas9);

/* Fit each onto the reference; record how far each domain moved after. */
const fits = {};
for (const c of CANDIDATES) {
  if (c.ref) continue;
  const mine = caMap(texts[c.id], c.cas9);
  const shared = [...mine.keys()].filter(n => refCA.has(n));
  const core = shared.filter(CORE);
  /* Trim to what actually holds still: refit on the residues within CUT A,
     until the set stops changing. */
  let on = core, F;
  for (let i = 0; i < 20; i++) {
    F = Bake.kabsch(on.map(n => mine.get(n)), on.map(n => refCA.get(n)));
    const keep = core.filter(n => {
      const p = Bake.mul(F.R, mine.get(n)).map((v, k) => v + F.t[k]), q = refCA.get(n);
      return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < CUT;
    });
    if (keep.length === on.length) break;
    on = keep;
  }
  const shift = {};
  for (const d of Object.keys(DOMAINS)) {
    const ns = shared.filter(n => inDom(n, d));
    const sd = ns.reduce((s, n) => {
      const p = Bake.mul(F.R, mine.get(n)).map((v, k) => v + F.t[k]);
      const q = refCA.get(n);
      return s + (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    }, 0);
    shift[d] = { residues: ns.length, rms: Bake.r2(Math.sqrt(sd / ns.length)) };
  }
  fits[c.id] = { F, on: on.length, of: core.length, rmsd: Bake.r2(F.rmsd), shift };
  texts[c.id] = moveText(texts[c.id], F);
}

/* One centre for every view: the reference's protein CA centroid. */
const centre = Bake.mean([...refCA.values()]);

let basis = null;
for (const c of [REF, ...CANDIDATES.filter(c => !c.ref)]) {
  const text = texts[c.id];
  const mod = Bake.modResidues(text);
  const prot = Bake.caTrace(text, new Set([c.cas9]), mod);
  const P = Bake.assemble(prot, Bake.ssRanges(text), centre);
  const naIds = [c.rna, ...c.dna].filter(Boolean);
  const na = naIds.length ? Bake.naTrace(text, new Set(naIds)) : new Map();
  const D = naIds.length ? Bake.assembleNA(na, centre) : { chains: {}, radius: 0 };
  const hb = Bake.hbFor(Bake.resolution(text));
  const raw = naIds.length ? Bake.basePairs(na, { hb }) : [];
  const pairs = Bake.centrePairs(raw, centre);

  const between = (x, y) => raw.filter(p =>
    (p.a[0] === x && p.b[0] === y) || (p.a[0] === y && p.b[0] === x)).length;
  const roles = { [c.cas9]: 'cas9' };
  if (c.rna) roles[c.rna] = 'guide';
  if (c.dna.length) {
    const [t, n] = [...c.dna].sort((x, y) => between(c.rna, y) - between(c.rna, x));
    roles[t] = 'target';
    roles[n] = 'nontarget';
  }

  /* The reference's solved frame is everyone's, since all share its coords. */
  if (!basis) {
    const fr = Bake.frameOf(P.chains[c.cas9].CA);
    basis = Object.assign({ extents: fr.extents }, Bake.viewFor(ENTRY, fr, null, REG));
  }
  const declared = Bake.declared(text);
  const order = [c.cas9, ...naIds];
  const chains = Object.assign({}, P.chains, D.chains);
  const counts = order.map(id => ({ chain: id, modelled: chains[id].nums.length,
                                    declared: declared[id] }));

  const out = {
    source: c.id + '.pdb',
    entry: c.id,
    what: c.purpose,
    method: Bake.method(text),
    resolution: Bake.resolution(text),
    ssFrom: Bake.ssFrom(Bake.ssRanges(text)),
    pairsFrom: naIds.length ? 'geometry, N...N within ' + hb + ' A' : null,
    centre: centre.map(Bake.r2),
    order, chains, pairs, roles,
    guideTarget: c.dna.length ? between(c.rna, Object.keys(roles).find(k => roles[k] === 'target')) : null,
    radius: Math.max(P.radius, D.radius),
    extents: basis.extents,
    frame: basis.frame,
    meta: {
      chainsInFile: Bake.chainCount(text),
      counts,
      ligandsDropped: Bake.ligands(text, null, mod),
      ec: Bake.ecNumbers(text),
      fitOn: c.ref ? null : REF.id,
      fitOnWhat: c.ref ? null : 'RuvC + PI, ' + fits[c.id].on + ' of ' + fits[c.id].of + ' CA within ' + CUT + ' A',
      fitRmsd: c.ref ? null : fits[c.id].rmsd,
      domainShift: c.ref ? null : fits[c.id].shift,
    },
  };
  if (basis.view) out.view = basis.view;

  const dst = path.join(HERE, 'cas9-' + c.id + '.json');
  fs.writeFileSync(dst, JSON.stringify(out));
  console.log(c.id + '  ' + (fs.statSync(dst).size / 1024).toFixed(0) + ' KB  '
    + counts.map(k => roles[k.chain] + ' ' + k.chain + ' ' + k.modelled + '/' + k.declared).join(', ')
    + '  pairs ' + pairs.length + (out.guideTarget != null ? ' (guide:target ' + out.guideTarget + ')' : ''));
  if (!c.ref) console.log('      fit ' + fits[c.id].rmsd + ' A on ' + fits[c.id].on + '/' + fits[c.id].of + ' CA; per-domain rms '
    + Object.entries(fits[c.id].shift).map(([d, s]) => d + ' ' + s.rms).join(', '));
}
console.log('frame ' + basis.frame + ', extents ' + basis.extents.join(' x '));
