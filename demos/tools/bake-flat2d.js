#!/usr/bin/env node
/* =====================================================================
 *  bake-flat2d.js — a textbook 2D LAYOUT for every spec marked `flat:true`.
 *
 *  Run:  npm i @rdkit/rdkit && node tools/bake-flat2d.js           # print the rows
 *        npm i @rdkit/rdkit && node tools/bake-flat2d.js --write   # write them in
 *        (offline; prints rows to paste into the spec, like spec2smiles.js)
 *
 *  WHAT THIS IS FOR. molecule-viewer.html's 2D view is not a camera angle. It
 *  is the SAME atoms, moved: every sphere slides from where it really is to
 *  where a structural diagram would put it, and the bonds stretch to follow.
 *  That transition is the lesson — it says "this diagram and this model are one
 *  molecule" in a way no cut between two pictures can. molecule-builder.html
 *  does exactly this for its five small molecules, from hand-authored Lewis
 *  layouts. ATP has 31 heavy atoms and NADH 44, so theirs are computed.
 *
 *  WHY RDKit AND NOT SmilesDrawer. The page already draws a SmilesDrawer
 *  diagram (the "Diagram" view), so the obvious move is to reuse its vertex
 *  positions. It cannot be done honestly: SmilesDrawer lays out a SMILES
 *  string, whose atom order is RDKit's canonical ranking, and recovering which
 *  vertex is which spec atom means solving a graph isomorphism against the
 *  molecule the layout was derived from. A near-miss there does not look like a
 *  bug — it looks like a slightly odd diagram, with two oxygens swapped.
 *
 *  RDKit's own coordinate generator sidesteps the problem completely: it is
 *  handed a molblock built from the spec's heavy atoms and returns a molblock
 *  IN THAT SAME ORDER, so atom k of the layout is atom k of the spec by
 *  construction and there is nothing to match up. It is also the engine behind
 *  most published depictions, so the result is the layout a textbook would use.
 *
 *  HEAVY ATOMS ONLY, and the page hides hydrogens in the 2D view to match. A
 *  structural diagram folds them into -OH and -NH2 labels; laying out 12 of
 *  ATP's would be inventing positions for atoms the diagram does not draw.
 *
 *  UNITS ARE ÅNGSTRÖMS, like every other coordinate on disk
 *  (MolecularGeometry.md §1.5). RDKit works in its own layout units where a
 *  bond is 1.5, so the output is scaled to the molecule's OWN mean heavy-atom
 *  bond length — the flat drawing then has the same bond lengths as the model
 *  it grew out of, which is what stops the transition from looking like a zoom.
 *  `register()` does not touch this field, so the page applies SCALE itself;
 *  check-molecules.js asserts the mean bond length matches, which is the check
 *  that catches a layout pasted in at display scale (the silent 1.9×).
 * ===================================================================== */
'use strict';

const path = require('path');
const { MOLECULES } = require(path.join(__dirname, '..', 'lib', 'lib-node.js'));
const SCALE = require(path.join(__dirname, '..', 'lib', 'lib-node.js')).SCALE || 1.9;

const specfile = require('./specfile.js');
// --write edits each spec's own mol-*.js in place instead of printing rows to
// paste. See tools/specfile.js for why that hand-off was the weak link.
const WRITE = process.argv.includes('--write');

const pad = (v, w) => String(v).padStart(w);

// Heavy atoms into a V2000 molblock. No chiral flag and no atom-atom map: this
// is asking for a PICTURE, and wedge/hash decisions belong to the drawing, not
// to the positions. (spec2smiles.js sets the flag, because a SMILES string does
// carry configuration.)
function molblock(key, m) {
  const keep = m.atoms.map((a, i) => i).filter(i => m.atoms[i].el !== 'H');
  const idx = new Map(keep.map((i, n) => [i, n]));
  const bonds = (m.bonds || []).filter(b => idx.has(b[0]) && idx.has(b[1]))
    .map(b => [idx.get(b[0]), idx.get(b[1]), b[2] || 1]);
  let s = `${key}\n  Kodolab\n\n`
    + `${pad(keep.length, 3)}${pad(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000\n`;
  keep.forEach(i => {
    const a = m.atoms[i];
    s += `${pad(a.pos[0].toFixed(4), 10)}${pad(a.pos[1].toFixed(4), 10)}`
       + `${pad(a.pos[2].toFixed(4), 10)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0\n`;
  });
  for (const b of bonds) s += `${pad(b[0] + 1, 3)}${pad(b[1] + 1, 3)}${pad(b[2], 3)}  0\n`;
  return { mb: s + 'M  END\n', keep, idx, bonds };
}

// Mean length of the bonds between heavy atoms, in REAL ångströms. The spec's
// own coordinates arrive from lib-node.js already multiplied by SCALE, so that
// comes back out here — this is the figure an instrument would agree with, and
// it is what the layout is scaled to match.
function meanBond(m, pos, bonds, k) {
  let sum = 0;
  for (const [i, j] of bonds) {
    const a = pos(i), b = pos(j);
    sum += Math.hypot(...a.map((v, c) => v - b[c]));
  }
  return sum / bonds.length / k;
}

require('@rdkit/rdkit')().then(RDKit => {
  const rows = [];
  let bad = 0;
  for (const [key, m] of Object.entries(MOLECULES)) {
    if (!m.flat) continue;
    const { mb, keep, bonds } = molblock(key, m);

    const mol = RDKit.get_mol(mb);
    mol.set_new_coords();                       // 2D depiction coordinates
    const out = mol.get_molblock().split('\n');
    const n = parseInt(out[3].slice(0, 3), 10);
    mol.delete();

    if (n !== keep.length) {
      console.log(`FAIL ${key}: ${keep.length} atoms in, ${n} out — order is not safe`);
      bad++; continue;
    }
    const flat = [];
    for (let i = 0; i < n; i++) {
      const l = out[4 + i];
      flat.push([+l.slice(0, 10), +l.slice(10, 20)]);
      // The element column must still line up, atom for atom. This is the whole
      // assumption the file rests on — that RDKit hands the molblock back in the
      // order it was given — so it is verified rather than trusted.
      const el = l.slice(31, 34).trim();
      if (el !== m.atoms[keep[i]].el) {
        console.log(`FAIL ${key}: atom ${i} is ${el} out, ${m.atoms[keep[i]].el} in`);
        bad++; break;
      }
    }
    if (flat.length !== n) continue;

    // Scale so the layout's mean bond matches the molecule's own, in ångströms.
    const real = meanBond(m, i => m.atoms[keep[i]].pos, bonds, SCALE);
    const drawn = meanBond(m, i => [...flat[i], 0], bonds, 1);
    const k = real / drawn;
    // Centred on the layout's own bounding box, so the page can drop it straight
    // in against a model that buildMolecule({center:true}) has also centred.
    const xs = flat.map(p => p[0] * k), ys = flat.map(p => p[1] * k);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const put = flat.map((p, i) => [+(xs[i] - cx).toFixed(3), +(ys[i] - cy).toFixed(3)]);

    // No two atoms may land on top of each other: a layout that overlaps is not
    // a layout, and at 44 atoms nobody would spot one pair by eye.
    let worst = Infinity, pair = null;
    for (let i = 0; i < put.length; i++)
      for (let j = i + 1; j < put.length; j++) {
        const d = Math.hypot(put[i][0] - put[j][0], put[i][1] - put[j][1]);
        if (d < worst) { worst = d; pair = [i, j]; }
      }
    const ok = worst > real * 0.5;
    if (!ok) bad++;

    console.log(`${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(6)} ${n} heavy atoms, `
      + `mean bond ${real.toFixed(3)} Å, closest pair `
      + `${m.atoms[keep[pair[0]]].el}/${m.atoms[keep[pair[1]]].el} ${worst.toFixed(2)} Å`);

    const text = `[${put.map(p => `[${p[0]},${p[1]}]`).join(',')}]`;
    if (WRITE && ok) {
      // register() does not scale flat2d, so what the library reads back is
      // exactly what is written — verify against `put` directly.
      const w = specfile.write(key, m, 'flat2d', text, put);
      if (!w.ok) { bad++; console.log(`     WRITE FAILED: ${w.note}`); }
      else if (w.note !== 'unchanged') console.log(`     -> ${m.domain}`);
    } else {
      rows.push(`      // ${n} heavy atoms, in spec order — tools/bake-flat2d.js\n`
        + `      flat2d:${text},`);
    }
  }
  console.log(`\n${rows.length} baked, ${bad} failing\n`);
  rows.forEach(r => console.log(r + '\n'));
}).catch(e => console.log('ERR', e.message));
