#!/usr/bin/env node
/* =====================================================================
 *  bake-heme.js — heme b and heme c as molecule specs, from deposited pockets
 *
 *  Run:  node tools/bake-heme.js          (writes lib/mol-heme.js)
 *
 *  PubChem publishes no 3D conformer for anything with iron in it, so the
 *  heavy atoms come from protein bakes already in this repo, in real
 *  ångströms: heme b from myoglobin (proteins/myoglobin/data, 1A6M's HEM),
 *  heme c from cytochrome c (proteins/cytc/data, 3ZCF's HEC). The crystals
 *  have no hydrogens; they are GROWN here, and which atom gets how many is
 *  read off the PDB atom NAME, because a heme's names are a standard: the
 *  meso carbons CHA-CHD carry one, the methyls CMx three, the propionate
 *  CAx/CBx two, the carboxylate carbons and every ring atom none. skel.js
 *  grows them at the real lengths in the free slots the geometry leaves.
 *
 *  THE TWO HEMES DIFFER ONLY AT THE VINYLS. Heme b keeps CAB=CBB and
 *  CAC=CBC. In heme c a cysteine thiol has added across each: CAB and CAC
 *  are sp3 and bonded to a sulfur, CBB and CBC are methyls. The hydrogen on
 *  CAB/CAC goes in the one slot the crystal leaves, so each new stereocentre
 *  is the deposited one, not a choice made here.
 *
 *  THE CYSTEINES ARE STUBS: SG and CB from the bake, CB capped with three
 *  hydrogens where the real chain carries on to CA. A pedagogical cut, and
 *  the reason the formula printed for heme c includes two S-CH3 groups.
 *  3ZCF's Cys17 SG sits 2.31 A from CAC (a C-S bond is 1.8), so that one
 *  thioether draws long; it is the crystal's, see proteins/cytc/tools/prep.js.
 *
 *  Both propionates are carboxylates (cell pH), so the porphyrin's charge is
 *  −4 and heme with Fe²⁺ is a 2− ion, with Fe³⁺ 1−. Each redox pair is one
 *  set of coordinates registered twice, charge on the iron, so a page showing
 *  the electron leave is not showing the molecule change shape.
 * ===================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const ctx = { console }; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'lib/skel.js'), 'utf8'), ctx, { filename: 'lib/skel.js' });
const { Skel, GL, AR, V, flatH } = ctx.SkelLib;

const readBake = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/* `stubs` picks the extra pocket atoms kept beside the heme (heme c's two
   cysteines); each gets a `cys<num>` tag so the spec can name its sulfurs. */
function build(bake, { thioether }) {
  const P = bake.pocket.atoms;
  const keepAt = P.map((a, i) => i).filter(i => P[i].group === 'heme' ||
    (thioether && P[i].group === 'cys' && (P[i].name === 'SG' || P[i].name === 'CB')));
  const at = new Map(keepAt.map((pi, k) => [pi, k]));
  const key = a => a.group === 'heme' ? a.name : `${a.name}${a.num}`;
  const idx = new Map(keepAt.map((pi, k) => [key(P[pi]), k]));
  const need = n => { if (!idx.has(n)) throw new Error(`${bake.source}: no atom ${n}`); return idx.get(n); };

  const s = new Skel();
  keepAt.forEach(pi => { const a = P[pi]; s.put(a.el === 'FE' ? 'Fe' : a.el, V(a.p[0], a.p[1], a.p[2])); });
  bake.pocket.bonds.forEach(([i, j]) => { if (at.has(i) && at.has(j)) s.link(at.get(i), at.get(j)); });

  const cys = thioether ? [...new Set(keepAt.filter(pi => P[pi].group === 'cys').map(pi => P[pi].num))].sort((a, b) => a - b) : [];
  if (thioether) {
    if (cys.length !== 2) throw new Error(`${bake.source}: expected two cysteines, found ${cys.length}`);
    /* CAB to the first Cys, CAC to the second; the bake must hold both. */
    [['CAB', cys[0]], ['CAC', cys[1]]].forEach(([c, n]) => {
      const sg = need(`SG${n}`), cc = need(c);
      if (!s.bonds.some(b => (b[0] === sg && b[1] === cc) || (b[0] === cc && b[1] === sg)))
        throw new Error(`${bake.source}: no SG${n}-${c} bond in the bake`);
    });
  } else {
    [['CAB', 'CBB'], ['CAC', 'CBC']].forEach(([a, b]) => s.order(need(a), need(b), 2));
  }
  // one C=O of each carboxylate, so a Kekulé-free ring still shows it
  [['CGA', 'O1A'], ['CGD', 'O1D']].forEach(([a, b]) => s.order(need(a), need(b), 2));
  s.charge(need('O2A'), -1); s.charge(need('O2D'), -1);
  // the porphyrin dianion: the two N–H the free base had are gone to the iron.
  // All four nitrogens are equivalent in the complex; the bookkeeping puts the
  // charge on the two that carried a proton in the free base, NA and NC
  s.charge(need('NA'), -1); s.charge(need('NC'), -1);

  // hydrogens, by name, LAST so the heavy indices are the file's
  const H = { CHA: 1, CHB: 1, CHC: 1, CHD: 1, CMA: 3, CMB: 3, CMC: 3, CMD: 3,
              CAA: 2, CBA: 2, CAD: 2, CBD: 2,
              ...(thioether ? { CAB: 1, CBB: 3, CAC: 1, CBC: 3 }
                            : { CAB: 1, CBB: 2, CAC: 1, CBC: 2 }) };
  cys.forEach(n => { H[`CB${n}`] = 3; });
  const sp2 = new Set(['CHA', 'CHB', 'CHC', 'CHD', ...(thioether ? [] : ['CAB', 'CBB', 'CAC', 'CBC'])]);
  for (const [name, i] of idx) {
    const n = H[name] || 0;
    if (!n) continue;
    if (sp2.has(name) && n === 1) { flatH(s, i, AR.CH); continue; }
    for (let k = 0; k < n; k++) s.grow(i, 'H', GL.CH, sp2.has(name) ? 'sp2' : 'sp3', 0);
  }

  const fe = need('FE');
  const N = ['NA', 'NB', 'NC', 'ND'].map(need);
  const meso = ['CHA', 'CHB', 'CHC', 'CHD'].map(need);
  const ring = [...idx].filter(([n]) => /^(C[1-4][ABCD]|CH[ABCD]|N[ABCD])$/.test(n)).map(([, i]) => i).sort((a, b) => a - b);
  const etc = { carrier: true, fe, n: N, meso, ring, feN: [fe, N[0]] };
  if (thioether) {
    etc.thio = cys.map((n, k) => [need(`SG${n}`), need(k ? 'CAC' : 'CAB')]);
    etc.cys = cys.map(n => [need(`CB${n}`), need(`SG${n}`)]);
  }
  return { s, fe, N, etc };
}

/* NO LONE PAIRS ON THE PYRROLE NITROGENS. Each one's pair is spoken for: two
   are in the ring's π system, two are the dative bonds to the iron. Counting
   from valence electrons puts a pair on each and draws it into the Fe–N bond
   (lobes/check-lobes.js catches exactly that), so the spec declares zero. */
const specOf = ({ s, fe, N, etc }, method) => (name, short, formula, charge, q) => ({
  ...s.spec({}), atoms: s.atoms.map((a, i) => i === fe ? { ...a, q } : N.includes(i) ? { ...a, lonePairs: 0 } : a),
  src: { path: 'built', method },
  name, short, formula, charge, class: 'cofactor', smiles: '',
  etc: { ...etc, reduced: q === 2 },
});

const B = build(readBake('proteins/myoglobin/data/mb-1A6M.json'), { thioether: false });
const C = build(readBake('proteins/cytc/data/cytc-3ZCF.json'), { thioether: true });
const b = specOf(B, 'heavy atoms from 1A6M HEM (proteins/myoglobin/data/mb-1A6M.json pocket); hydrogens grown by PDB atom name, tools/bake-heme.js');
const c = specOf(C, 'heavy atoms from 3ZCF HEC + Cys14/Cys17 SG,CB (proteins/cytc/data/cytc-3ZCF.json pocket); CB capped as CH3; hydrogens grown by PDB atom name, tools/bake-heme.js');

const out = `/* =====================================================================
 *  mol-heme.js — heme b and heme c, from deposited pockets. WRITTEN BY tools/bake-heme.js
 * =====================================================================
 *  Do not edit: rerun the baker. Its header says where every atom comes from.
 *  \`heme\` / \`hemeOx\` are heme b (myoglobin's) with Fe²⁺ / Fe³⁺.
 *  \`hemeC\` / \`hemeCOx\` are cytochrome c's heme c, both vinyls joined to
 *  cysteine stubs (SG + a CH3 standing in for CB onward).
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
    heme: ${JSON.stringify(b('Heme (Fe²⁺)', 'Heme · Fe²⁺', 'C₃₄H₃₀FeN₄O₄²⁻', -2, 2))},
    hemeOx: ${JSON.stringify(b('Heme (Fe³⁺)', 'Heme · Fe³⁺', 'C₃₄H₃₀FeN₄O₄⁻', -1, 3))},
    hemeC: ${JSON.stringify(c('Heme c (Fe²⁺)', 'Heme c · Fe²⁺', 'C₃₆H₃₈FeN₄O₄S₂²⁻', -2, 2))},
    hemeCOx: ${JSON.stringify(c('Heme c (Fe³⁺)', 'Heme c · Fe³⁺', 'C₃₆H₃₈FeN₄O₄S₂⁻', -1, 3))},
  }, SELFNAME);
})(this);
`;
fs.writeFileSync(path.join(ROOT, 'lib/mol-heme.js'), out);
console.log(`wrote lib/mol-heme.js: heme b ${B.s.atoms.length} atoms, ${B.s.bonds.length} bonds; ` +
            `heme c ${C.s.atoms.length} atoms, ${C.s.bonds.length} bonds`);
