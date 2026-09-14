#!/usr/bin/env node
/* =====================================================================
 *  bake-heme.js — heme b as a molecule spec, from a deposited pocket
 *
 *  Run:  node tools/bake-heme.js          (writes lib/mol-heme.js)
 *
 *  PubChem publishes no 3D conformer for anything with iron in it, so the
 *  heavy atoms come from the myoglobin bake (proteins/myoglobin/data,
 *  1A6M's HEM), which is real ångströms already in this repo. The crystal
 *  has no hydrogens; they are GROWN here, and which atom gets how many is
 *  read off the PDB atom NAME, because a heme's names are a standard: the
 *  meso carbons CHA-CHD carry one, the methyls CMx three, the vinyls CAB/CAC
 *  one and CBB/CBC two, the propionate CAx/CBx two, and the carboxylate
 *  carbons and every ring atom none. skel.js grows them at the real lengths
 *  in the free slots the geometry leaves.
 *
 *  Both propionates are carboxylates (cell pH), so the porphyrin's charge is
 *  −4 and heme with Fe²⁺ is a 2− ion, with Fe³⁺ 1−. The two are one set of
 *  coordinates registered twice, charge on the iron, so a page showing the
 *  electron leave is not showing the molecule change shape.
 * ===================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const bake = JSON.parse(fs.readFileSync(path.join(ROOT, 'proteins/myoglobin/data/mb-1A6M.json'), 'utf8'));
const ctx = { console }; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib/skel.js'), 'utf8'), ctx, { filename: 'lib/skel.js' });
const { Skel, GL, AR, V, flatH } = ctx.SkelLib;

const heme = bake.pocket.atoms.filter(a => a.group === 'heme');
const idx = new Map(heme.map((a, i) => [a.name, i]));
const s = new Skel();
heme.forEach(a => s.put(a.el === 'FE' ? 'Fe' : a.el, V(a.p[0], a.p[1], a.p[2])));
// the bake's bonds are indices into pocket.atoms; keep the heme's own
const byPocket = new Map(); bake.pocket.atoms.forEach((a, i) => { if (a.group === 'heme') byPocket.set(i, idx.get(a.name)); });
bake.pocket.bonds.forEach(([i, j]) => { if (byPocket.has(i) && byPocket.has(j)) s.link(byPocket.get(i), byPocket.get(j)); });
// the vinyl double bonds and one C=O of each carboxylate, so a Kekulé-free
// ring still shows the two groups that are not single bonds
[['CAB', 'CBB'], ['CAC', 'CBC'], ['CGA', 'O1A'], ['CGD', 'O1D']].forEach(([a, b]) => s.order(idx.get(a), idx.get(b), 2));
s.charge(idx.get('O2A'), -1); s.charge(idx.get('O2D'), -1);
// the porphyrin dianion: the two N–H the free base had are gone to the iron.
// All four nitrogens are equivalent in the complex; the bookkeeping puts the
// charge on the two that carried a proton in the free base, NA and NC
s.charge(idx.get('NA'), -1); s.charge(idx.get('NC'), -1);

// hydrogens, by name, LAST so the heavy indices are the file's
const H = { CHA: 1, CHB: 1, CHC: 1, CHD: 1, CMA: 3, CMB: 3, CMC: 3, CMD: 3,
            CAA: 2, CBA: 2, CAD: 2, CBD: 2, CAB: 1, CBB: 2, CAC: 1, CBC: 2 };
const sp2 = new Set(['CHA', 'CHB', 'CHC', 'CHD', 'CAB', 'CBB', 'CAC', 'CBC']);
heme.forEach(a => {
  const n = H[a.name] || 0, i = idx.get(a.name);
  if (!n) return;
  if (sp2.has(a.name) && n === 1) { flatH(s, i, AR.CH); return; }
  for (let k = 0; k < n; k++) s.grow(i, 'H', GL.CH, sp2.has(a.name) ? 'sp2' : 'sp3', 0);
});
const fe = idx.get('FE');
const N = ['NA', 'NB', 'NC', 'ND'].map(n => idx.get(n));
const meso = ['CHA', 'CHB', 'CHC', 'CHD'].map(n => idx.get(n));
const ring = heme.map((a, i) => i).filter(i => /^(C[1-4][ABCD]|CH[ABCD]|N[ABCD])$/.test(heme[i].name));
/* NO LONE PAIRS ON THE PYRROLE NITROGENS. Each one's pair is spoken for: two
   are in the ring's π system, two are the dative bonds to the iron. Counting
   from valence electrons puts a pair on each and draws it into the Fe–N bond
   (lobes/check-lobes.js catches exactly that), so the spec declares zero. */
const spec = (name, short, formula, charge, q) => ({
  ...s.spec({}), atoms: s.atoms.map((a, i) => i === fe ? { ...a, q } : N.includes(i) ? { ...a, lonePairs: 0 } : a),
  src: { path: 'built', method: 'heavy atoms from 1A6M HEM (proteins/myoglobin/data/mb-1A6M.json pocket); hydrogens grown by PDB atom name, tools/bake-heme.js' },
  name, short, formula, charge, class: 'cofactor', smiles: '',
  etc: { carrier: true, fe, n: N, meso, ring, feN: [fe, N[0]], reduced: q === 2 },
});
const out = `/* =====================================================================
 *  mol-heme.js — heme b, from a deposited pocket. WRITTEN BY tools/bake-heme.js
 * =====================================================================
 *  Do not edit: rerun the baker. Its header says where every atom comes from.
 *  Two keys over one set of coordinates: \`heme\` is the Fe²⁺ (reduced) ion and
 *  \`hemeOx\` the Fe³⁺, the electron carrier of cytochrome c drawn as heme b.
 *  Cytochrome c's own heme c is this molecule with its two vinyls joined to
 *  cysteines; the ring, the iron and the electron are the same.
 *
 *  A file of its own on cost: only a chain lesson wants a heme as a MOLECULE,
 *  and the protein pages that draw one draw it from their own bake.
 * ===================================================================== */
(function (global) {
  'use strict';
  const SELFNAME = 'mol-heme.js';
  const Lib = global.MolLib
    || (typeof require === 'function' ? require('./molecules.js').MolLib : null);
  if (!Lib) throw new Error(SELFNAME + ': molecules.js must be loaded first');
  Lib.register({
    heme: ${JSON.stringify(spec('Heme (Fe²⁺)', 'Heme · Fe²⁺', 'C₃₄H₃₀FeN₄O₄²⁻', -2, 2))},
    hemeOx: ${JSON.stringify(spec('Heme (Fe³⁺)', 'Heme · Fe³⁺', 'C₃₄H₃₀FeN₄O₄⁻', -1, 3))},
  }, SELFNAME);
})(this);
`;
fs.writeFileSync(path.join(ROOT, 'lib/mol-heme.js'), out);
console.log(`wrote lib/mol-heme.js: ${s.atoms.length} atoms (${heme.length} heavy), ${s.bonds.length} bonds`);
