#!/usr/bin/env node
/* =====================================================================
 *  check-handedness.js — an AUDIT, not a guard.
 *
 *  Compares each spec's committed `smiles` against a named reference record
 *  from PubChem. This is the only check here that can catch a GLOBAL MIRROR,
 *  and it is the only one that reaches outside for an absolute answer.
 *
 *    npm i && node tools/check-handedness.js
 *
 *  Why nothing else can do it. `stereo:{axial}` and `stereo:{faces}` assert
 *  RELATIVE patterns — the ring normal's sign falls out of traversal order, so
 *  flipping every substituent at once leaves the pattern unchanged. cod-check.js
 *  compares ring-plane tilt and torsions, also relative. haworth.js re-anchors
 *  the normal to the D convention, so it draws a correct D-sugar even from
 *  mirrored coordinates. Bond lengths, angles and the render are all identical
 *  between enantiomers. A mirror is invisible from the inside, by construction.
 *
 *  It found one: every Skel-built sugar in this library was the L-enantiomer.
 *  L-glucose, L-galactose, L-ribose, L-deoxyribose and both disaccharides,
 *  shipped and rendering beautifully. See molecule-pipeline.md item 5.
 *
 *  DELIBERATELY NOT WIRED INTO check-molecules.js. It needs the network and a
 *  dev-only dependency, and a network call inside a guard is a liability — the
 *  same reasoning as cod-check.js. Run it when you touch a builder, add a
 *  stereocentre, or doubt a spec. The answer cannot go stale on its own.
 *
 *  THE CONTROL MATTERS. The specs that came from PubChem must match, or the
 *  spec -> molblock -> RDKit path is what is broken, not the geometry. That is
 *  what separates "our sugar is mirrored" from "our exporter is mirrored", and
 *  it is why dAlanine is in the list: it must come back D.
 *
 *  Reference names are anomer- and stereo-specific ON PURPOSE. A bare "glucose"
 *  is CID 5793, which leaves the anomeric centre undefined and would prove
 *  nothing.
 * ===================================================================== */
'use strict';

const path = require('path');
const cp = require('child_process');
const { MOLECULES } = require(path.join(__dirname, '..', 'lib', 'lib-node.js'));

// spec key -> the PubChem name that pins the exact stereoisomer we claim to be.
const REF = {
  // control: these ARE PubChem conversions, so a mismatch indicts the pipeline
  glycine: 'glycine',
  alanine: 'L-alanine',
  dAlanine: 'D-alanine',
  proline: 'L-proline',
  glutamine: 'L-glutamine',
  glutamate: 'L-glutamic acid',
  // the four dNTPs. Three stereocentres each, all of them the deoxyribose's,
  // and the sugar arrives from dATP's record while the base is superposed on a
  // frame — two chances for a reflection, neither visible from inside the spec.
  // Reference names are PubChem's own, and dGTP is here even though PubChem
  // publishes no 3D conformer for it: the 2D record pins the stereochemistry,
  // which is the only thing this tool is asking about.
  dATP: "2'-deoxyadenosine 5'-triphosphate",
  dTTP: "dTTP",
  dGTP: "dGTP",
  dCTP: "dCTP",
  // the Skel-built sugars — what this tool exists for
  glucose: 'beta-D-glucopyranose',
  galactose: 'beta-D-galactopyranose',
  ribose: 'beta-D-ribofuranose',
  deoxyribose: '2-deoxy-beta-D-erythro-pentofuranose',
  maltose: 'beta-maltose',
  cellobiose: 'beta-cellobiose',
  // the glycolysis pathway. Nothing here is drawn from a `smiles` — these have
  // none, so the string is DERIVED FROM THE GEOMETRY below, which is the point:
  // what gets checked is the coordinates the page renders. Names pin the open
  // (keto) form where the spec is drawn open, because PubChem's default record
  // for a hexose phosphate is the furanose ring and that would report "differs"
  // for a molecule whose handedness is fine.
  // the two carriers molecule-viewer.html teaches ABOUT. Both are PubChem
  // conversions, so like the amino acids above they indict the pipeline rather
  // than a hand-built ring — but both carry a `smiles` now (the flat drawing
  // needs one), and a committed depiction string with four stereocentres in it
  // is exactly the thing that must not be allowed to be the mirror image.
  atp: 'ATP',
  nadh: 'NADH',
  g6p: 'beta-D-glucose 6-phosphate',
  f6p: 'keto-D-fructose 6-phosphate',
  f16bp: 'keto-D-fructose 1,6-bisphosphate',
  g3p: 'D-glyceraldehyde 3-phosphate',
  bpg13: '1,3-bisphospho-D-glyceric acid',
  pga3: '3-phospho-D-glyceric acid',
  pga2: '2-phospho-D-glyceric acid',
  /* THE CITRIC-ACID CYCLE (mol-krebs.js). Same standing as the glycolysis rows
   * above: none of these carries a `smiles`, so the string checked is DERIVED
   * FROM THE COORDINATES the page would render.
   *
   * THE STEREO ROWS ARE WHY THIS BLOCK EXISTS. `chiral:` asserts a signed
   * volume over a priority order the SPEC states, so it catches a reflected
   * build — but only relative to a ranking that is itself hand-written, and it
   * cannot catch a whole-molecule mirror any more than `{faces}` can (§1.3).
   * malate and isocitrate are the two rows that need an outside answer.
   *
   * NAMES PIN THE STEREOISOMER, as the sugars' do. Bare "malic acid" is the
   * racemate and would prove nothing; bare "isocitric acid" leaves both centres
   * undefined. Fumarate is named for the geometry too — its cis isomer has a
   * different name entirely (maleic acid), which is the cleanest possible
   * anchor for the `cis:{value:false}` claim. */
  oaa: 'oxaloacetic acid',
  citrate: 'citric acid',
  isocitrate: 'D-threo-isocitric acid',
  akg: '2-oxoglutaric acid',
  succinate: 'succinic acid',
  fumarate: 'fumaric acid',
  malate: 'L-malic acid',
  coa: 'coenzyme A',
  acetylcoa: 'acetyl-CoA',
  succinylcoa: 'succinyl-CoA',
  // The vitamin. Two stereocentres, C4 and C5, and check-molecules.js is blind
  // to both — its signed-volume test only runs on an amino acid's `pep`. So
  // this row is the ONLY thing standing between L-ascorbate and its mirror,
  // which renders identically and is not a vitamin.
  ascorbate: 'L-ascorbic acid',
  /* THE REDUCED FORM IS THE ONE ANCHORED, and `fad` is deliberately absent.
   * mol-krebs.js builds FADH₂ and derives FAD from it by dropping two
   * hydrogens WITHOUT redrawing the ring's bond orders — a stated
   * simplification in that file, since both forms render as the same flat
   * tricycle and what the lesson needs is that two hydrogens moved. So this
   * spec's `fad` genuinely is not PubChem's FAD (theirs is the oxidised,
   * aromatic isoalloxazine) and pointing a row at it would report a mismatch
   * for something already decided and written down.
   *
   * Anchoring `fadh2` loses nothing that matters here. Every stereocentre in
   * the molecule — ribitol's three, the ribose's four — is in the shared
   * skeleton, so checking either form checks both, and the drop that makes FAD
   * touches two hydrogens and no configuration.
   *
   * THIS ROW EARNED ITS PLACE: the first build of the ribitol was the
   * L-enantiomer. `hydroxyl(c, 0)` took whichever tetrahedral slot came first,
   * check-molecules.js passed it, and nothing inside the repo could see it —
   * exactly the sugars' failure of molecule-pipeline.md item 5, repeated. */
  fadh2: 'FADH2',
  /* FMN's ribityl is FAD's front half from the same calls, so the row is the
   * same claim on the shorter molecule; it is here because a builder edit
   * that broke one and not the other would otherwise go unseen. */
  fmnh2: 'FMNH2',
};

/* THE HAND-BUILT CONTROLS REFERENCE THEMSELVES.
 *
 * A paired spec in mol-carriers.js is one molecule derived twice: `atpSkel` is `atp`
 * built from ideal geometry, and it says so — `compare:{against:'atp'}`. What
 * makes that comparison mean anything is that BOTH canonicalise to the same
 * external record, because a hand-built ribose has four stereocentres and no
 * internal check can catch a global mirror (MolecularGeometry.md §1.3). Without
 * it, "the two look different" confounds "different method" with "I got the
 * sugar wrong", which is the one confusion the comparison exists to remove.
 *
 * So the entry is DERIVED from `compare.against` rather than typed. Typed, it
 * was two lines saying what the spec already said, and the failure mode was
 * silent in the worst way: add a skel twin, forget the line, and the tool
 * reports every spec passing while never having looked at the new one. Nothing
 * about a molecule that is quietly unchecked is visible from its render.
 *
 * A control whose partner has no reference is an ERROR, not a skip: it means
 * the comparison has no anchor at either end.
 */
let anchorless = 0;
for (const [key, m] of Object.entries(MOLECULES)) {
  if (!m.compare || !m.compare.against) continue;
  const target = m.compare.against;
  if (!REF[target]) {
    // Counted, not just printed. This ran as a bare `process.exitCode = 1` at
    // first, which the summary below overwrote with its own process.exit — so
    // it printed FAIL and exited PASS, the one outcome worse than no check.
    console.log(`  FAIL  ${key}: compares against \`${target}\`, which has no REF entry `
      + `— the comparison would rest on nothing`);
    anchorless++;
    continue;
  }
  REF[key] = REF[target];
}

// A spec with no committed `smiles` is described by its own coordinates: heavy
// atoms into a V2000 molblock with the chiral flag set, and RDKit reads the
// configuration off the 3D positions. Same path tools/spec2smiles.js uses.
const pad = (v, w) => String(v).padStart(w);
function molblock(key, m) {
  const keep = m.atoms.map((a, i) => i).filter(i => m.atoms[i].el !== 'H');
  const map = new Map(keep.map((i, n) => [i, n]));
  const bonds = (m.bonds || []).filter(b => map.has(b[0]) && map.has(b[1]))
    .map(b => [map.get(b[0]), map.get(b[1]), b[2] || 1]);
  let s = `${key}\n  Kodolab\n\n`
    + `${pad(keep.length, 3)}${pad(bonds.length, 3)}  0  0  1  0  0  0  0  0999 V2000\n`;
  keep.forEach(i => { const a = m.atoms[i];
    s += `${pad(a.pos[0].toFixed(4), 10)}${pad(a.pos[1].toFixed(4), 10)}`
       + `${pad(a.pos[2].toFixed(4), 10)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0\n`; });
  for (const b of bonds) s += `${pad(b[0] + 1, 3)}${pad(b[1] + 1, 3)}${pad(b[2], 3)}  0\n`;
  return s + 'M  END\n';
}

// TWO DIFFERENCES THAT ARE NOT STEREOCHEMISTRY, normalised on both sides so a
// real mirror is what stands out:
//  · PubChem answers some of these as the anion and some as the free acid.
//    Charge is not handedness.
//  · and the phosphorus STEREOCENTRE the house geometry invents. A bridging
//    phosphate has one P=O and two non-bridging oxygens that are equivalent by
//    delocalisation, which makes P's four substituents formally distinct — so
//    RDKit reads a configuration off the 3D coordinates and tags `[P@@]`.
//    PubChem's records carry no such tag, and neither does the chemistry. Left
//    in, it reports every geometry-derived diphosphate as a mismatch (coenzyme
//    A and its two thioesters) and buries a real difference under fake ones.
//    Phosphate stereochemistry is not a claim this library makes anywhere.
const normalise = s => s
  .replace(/\[O-\]/g, 'O')
  .replace(/\[P@@?H?\]/g, 'P');

const fetchSmiles = name => {
  const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/'
    + encodeURIComponent(name) + '/property/IsomericSMILES/TXT';
  try {
    const out = cp.execSync(`curl -s --max-time 30 "${url}"`, { encoding: 'utf8' }).trim();
    const first = out.split('\n')[0];
    return (!first || /Status:|PUGREST/.test(out)) ? null : first;
  } catch (e) { return null; }
};

const SENT = String.fromCharCode(1);
// Swap every @ <-> @@ : the enantiomer, written out. Used only to distinguish
// "mirrored" from "some other stereoisomer", which are very different bugs.
const mirrorOf = s => s.split('@@').join(SENT).split('@').join('@@').split(SENT).join('@');

require('@rdkit/rdkit')().then(RDKit => {
  const canon = s => {
    const m = RDKit.get_mol(s);
    if (!m) return null;
    const out = m.get_smiles(); m.delete(); return out;
  };

  let bad = 0, skipped = 0;
  for (const [key, name] of Object.entries(REF)) {
    const spec = MOLECULES[key];
    if (!spec) { console.log(`  skip  ${key.padEnd(12)} no such spec`); skipped++; continue; }
    // The :1 atom map is highlight metadata for SmilesDrawer, not structure.
    let mine = spec.smiles && spec.smiles.replace(/:1(?=])/g, '');
    if (!mine) {                          // no committed string: read the geometry
      const m = RDKit.get_mol(molblock(key, spec));
      if (!m) { console.log(`  FAIL  ${key.padEnd(12)} geometry does not parse`); bad++; continue; }
      mine = m.get_smiles(); m.delete();
    }
    const ours = canon(normalise(mine));
    if (!ours) { console.log(`  FAIL  ${key.padEnd(12)} committed smiles does not parse`); bad++; continue; }

    const raw = fetchSmiles(name);
    if (!raw) { console.log(`  skip  ${key.padEnd(12)} no PubChem record for "${name}"`); skipped++; continue; }
    const ref = canon(normalise(raw));
    if (!ref) { console.log(`  skip  ${key.padEnd(12)} reference did not parse`); skipped++; continue; }

    // DBG=1 prints both strings. A "differs from" is one stereocentre and the
    // only way to find WHICH is to read the two canonical SMILES side by side.
    if (process.env.DBG) console.log(`   dbg ${key}\n     ours ${ours}\n     ref  ${ref}`);
    if (ours === ref) { console.log(`  ok    ${key.padEnd(12)} matches ${name}`); continue; }

    bad++;
    const mirrored = ours === canon(mirrorOf(normalise(raw)));
    console.log(`  FAIL  ${key.padEnd(12)} ${mirrored ? 'is the EXACT MIRROR of' : 'differs from'} ${name}`);
    console.log(`          ours: ${ours}`);
    console.log(`          ref : ${ref}`);
    if (mirrored) {
      console.log('          A mirror preserves every bond length, every angle and the render.');
      console.log('          For a pyranose the handedness is the pucker phase in');
      console.log('          skel.js ringPyranose(); for a furanose it is the UP/DOWN face');
      console.log('          tags in mol-glycans.js, because face() is normal-sign-dependent.');
    }
  }

  console.log('');
  if (anchorless) {
    console.log(`FAIL: ${anchorless} control(s) compare against a spec with no reference`);
    process.exit(1);
  }
  if (bad) { console.log(`FAIL: ${bad} spec(s) disagree with their reference`); process.exit(1); }
  console.log(`PASS: every checked spec matches its reference`
    + (skipped ? ` (${skipped} skipped)` : ''));
}).catch(e => {
  console.log('ERR', e.message);
  console.log('RDKit is a dev dependency — run `npm i` in demos/ first.');
  process.exit(1);
});
