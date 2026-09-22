/* spec2smiles.js — generate the `smiles` string for a non-sugar contrast spec.
 *
 * contrast-lab.html draws the flat structure of a sugar with haworth.js and
 * everything else with SmilesDrawer, which takes SMILES. That string is NOT
 * hand-written: hand-writing it would put a second, unchecked description of
 * the molecule next to `atoms`/`bonds`, free to drift from them — the exact
 * problem the `names` work removed for `diff`. It is generated from the spec.
 *
 * Pipeline: spec -> heavy-atom molblock -> RDKit -> canonical SMILES.
 *   · HEAVY ATOMS ONLY, because a skeletal drawing gives H no glyph of its own.
 *   · CANONICAL, never rooted. RDKit's rootedAtAtom output does not round-trip
 *     for ring stereocentres — it silently returns the wrong anomer (verified
 *     on glucose/galactose, with `canonical` either true or false). Canonical
 *     round-trips for all 16 contrast specs, which this tool re-checks.
 *   · The HIGHLIGHT travels in the V2000 atom-atom map field, set from
 *     `contrast.diff`, so RDKit emits `[N:1]` and SmilesDrawer's
 *     highlight_atoms can key on class 1. Nothing is pasted into the string.
 *
 * THE CHARGE IS THE SPEC'S, not this tool's guess. Each atom carries its own
 * formal charge in `q` — stamped by the builder that placed it, since the group
 * that deprotonates an oxygen is the only thing that knows which one — and it
 * is written into the molblock as `M  CHG`. Without that the open valence takes
 * an implicit H and a carboxylate draws as the acid. check-molecules.js holds
 * the sum of `q` to the spec's `charge`.
 *
 * RDKit is a DEV dependency and never ships: this runs at a terminal, the
 * output is committed, and the page loads only SmilesDrawer.
 *
 *   npm i @rdkit/rdkit && node tools/spec2smiles.js            # print the rows
 *   npm i @rdkit/rdkit && node tools/spec2smiles.js --write    # write them in
 *   npm i @rdkit/rdkit && node tools/spec2smiles.js --all      # every spec, not
 *                                                    just the ones drawn flat
 */
const { MOLECULES } = require('../lib/lib-node.js');
const specfile = require('./specfile.js');
// --write edits each spec's own mol-*.js in place instead of printing rows to
// paste. See tools/specfile.js for why that hand-off was the weak link.
const WRITE = process.argv.includes('--write');
const ALL = process.argv.includes('--all');

const pad = (s, w) => String(s).padStart(w);

/* A hydrogen in `diff` has no glyph in a skeletal drawing — it is part of its
 * parent's -NH2 / -OH label — so it must light up the heavy atom it hangs on. */
function heavyDiff(m, map) {
  const adj = m.atoms.map(() => []);
  m.bonds.forEach(([i, j]) => { adj[i].push(j); adj[j].push(i); });
  const out = new Set();
  // A contrast pair marks its difference; anything else marking atoms for a
  // flat drawing (`flatMark`, which molecule-viewer.html's highlight reads)
  // goes through the same fold, for the same reason.
  const refs = (m.contrast && m.contrast.diff) || m.flatMark || [];
  for (const ref of refs) {
    const i = typeof ref === 'number' ? ref : m.names.indexOf(ref);
    out.add(m.atoms[i].el === 'H' ? adj[i].find(j => m.atoms[j].el !== 'H') : i);
  }
  return new Set([...out].map(i => map.get(i)).filter(x => x !== undefined));
}

/* Drop stereo descriptors on PHOSPHORUS.
 *
 * RDKit reads configuration off the 3D coordinates, and at a phosphate it finds
 * four substituents in a definite arrangement and writes `[P@@]`. That is a
 * claim, and it is false: a phosphate ester carries =O and two -OH, two of which
 * are the same group, so the phosphorus is not a stereocentre at all. The
 * arrangement it is reporting is just which way that particular conformer
 * happened to have the oxygens.
 *
 * Left in, it costs twice. The flat drawing puts a wedge on a bond that has no
 * stereochemistry to show, and tools/check-handedness.js reports every
 * phosphorylated spec as differing from its PubChem reference — a real check
 * failing on a fake difference, which is how a check stops being read.
 *
 * This is the one edit made to a generated string, it is made HERE rather than
 * by hand in a spec, and it is proved by the thing it unblocks: with it, atp and
 * nadh match PubChem's own records exactly, carbon stereocentres and all.
 */
const noPhosphorusStereo = s => s.replace(/\[P@@?(H\d?)?\]/g,
  (m, h) => (h ? `[P${h}]` : 'P'));

/* V2000 with the atom-atom map field (columns 61-63) set on the diff atoms.
 * Column placement is asserted by the caller: RDKit emitting `:1` on exactly
 * the expected atoms is the proof it landed in the right field. */
function molblock(name, m, mapped) {
  const keep = m.atoms.map((a, i) => i).filter(i => m.atoms[i].el !== 'H');
  const map = new Map(keep.map((i, n) => [i, n]));
  const bonds = m.bonds.filter(b => map.has(b[0]) && map.has(b[1]))
                       .map(b => [map.get(b[0]), map.get(b[1]), b[2] || 1]);
  let s = `${name}\n  Kodolab\n\n`
        + `${pad(keep.length, 3)}${pad(bonds.length, 3)}  0  0  1  0  0  0  0  0999 V2000\n`;
  keep.forEach((i, n) => {
    const a = m.atoms[i];
    s += `${pad(a.pos[0].toFixed(4), 10)}${pad(a.pos[1].toFixed(4), 10)}`
       + `${pad(a.pos[2].toFixed(4), 10)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0`
       + `${pad(mapped && mapped.has(n) ? 1 : 0, 3)}  0  0\n`;
  });
  for (const b of bonds) s += `${pad(b[0] + 1, 3)}${pad(b[1] + 1, 3)}${pad(b[2], 3)}  0\n`;
  /* FORMAL CHARGE, from the `q` the builders stamp on the atom. Without it
     RDKit fills the open valence with an implicit H and every carboxylate comes
     back as the acid — a diagram saying pyruvic acid under a formula saying
     pyruvate. V2000 allows 8 per line and the charges here are all -1, so one
     line holds every molecule in the library twice over. */
  const charged = keep.map((i, n) => [n, m.atoms[i].q || 0]).filter(c => c[1]);
  for (let k = 0; k < charged.length; k += 8) {
    const run = charged.slice(k, k + 8);
    s += `M  CHG${pad(run.length, 3)}`
       + run.map(([n, q]) => `${pad(n + 1, 4)}${pad(q, 4)}`).join('') + '\n';
  }
  return { mb: s + 'M  END\n', map, heavy: keep.length };
}

require('@rdkit/rdkit')().then(RDKit => {
  const rows = [];
  let bad = 0;
  for (const [key, m] of Object.entries(MOLECULES)) {
    // Sugars are NOT drawn from this string — haworth.js draws them from the
    // geometry. They are generated anyway, as a committed ASSERTION:
    // `stereo:{faces}` can only check a RELATIVE pattern, because the ring
    // normal's sign is arbitrary, so it cannot catch a global mirror — flip
    // every substituent at once and L-ribose passes as D-. RDKit's canonical
    // SMILES distinguishes [C@H] from [C@@H], which is exactly the
    // discrimination `faces` lacks. See molecule-pipeline.md item 5.
    // `contrast` specs need the string for contrast-lab.html. `flat:true` says
    // some other page draws this molecule flat and needs one too — that is how
    // ATP and NADH get theirs for molecule-viewer.html. Neither is a contrast
    // pair, so there is no `diff` to mark and no `names` to resolve it through.
    // --all widens that to every spec, which is what molecules.html's Diagram
    // view wants: a molecule with no `smiles` simply has no diagram to show.
    if (!ALL && !m.contrast && !m.flat) continue;
    if (m.contrast && !m.names) { console.log(`${key}: no \`names\` yet — skipped`); bad++; continue; }

    const probe = molblock(key, m, null);
    const d = heavyDiff(m, probe.map);
    const { mb, heavy } = molblock(key, m, d);

    const mapped = RDKit.get_mol(mb);
    const plain = RDKit.get_mol(probe.mb);
    /* RDKit hands back null for a molblock it refuses — popc's charged
       phosphocholine is one. Letting the null through kills the sweep at that
       molecule, and every spec after it goes unconverted without saying so. A
       spec RDKit will not take is a FAIL like any other. */
    if (!mapped || !plain) {
      bad++;
      console.log(`FAIL ${key.padEnd(13)} RDKit will not parse this molblock`);
      if (mapped) mapped.delete();
      if (plain) plain.delete();
      continue;
    }
    const smiles = noPhosphorusStereo(mapped.get_smiles());

    // 1. the map must have landed on exactly the intended atoms
    const marks = (smiles.match(/:1[\]]/g) || []).length;
    // 2. stripping the map must give back the plain molecule — proves the map
    //    field changed metadata only, not the structure
    const bare = noPhosphorusStereo(plain.get_smiles());
    const stripped = noPhosphorusStereo(
      RDKit.get_mol(smiles.replace(/:1(?=])/g, '')).get_smiles());
    const same = stripped === bare;
    // 3. and the plain form must survive its own round trip
    const trip = noPhosphorusStereo(RDKit.get_mol(bare).get_smiles()) === bare;

    const ok = marks === d.size && same && trip;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(13)} ${heavy} heavy, `
      + `${d.size} marked${marks !== d.size ? ` but ${marks} in string` : ''}`
      + `${same ? '' : ', STRIP CHANGES MOLECULE'}${trip ? '' : ', NO ROUND TRIP'}`);
    console.log(`     ${smiles}`);
    // cis/trans bonds are written with / and \ — the backslash has to survive
    // being pasted into a JS string literal (palmitoleate's Δ9 has one)
    const text = `'${smiles.replace(/\\/g, '\\\\')}'`;
    if (WRITE && ok) {
      const w = specfile.write(key, m, 'smiles', text, smiles);
      if (!w.ok) { bad++; console.log(`     WRITE FAILED: ${w.note}`); }
      else if (w.note !== 'unchanged') console.log(`     -> ${m.domain}`);
    } else {
      rows.push(`      smiles:${text},`);
    }
    mapped.delete(); plain.delete();
  }
  console.log(`\n${rows.length + (WRITE ? 0 : 0)} generated, ${bad} failing\n`);
  rows.forEach(r => console.log(r));
}).catch(e => console.log('ERR', e.message));
