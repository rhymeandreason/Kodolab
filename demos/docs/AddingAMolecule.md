<!-- KIND: recipe — load when adding a NEW molecule spec to the library. Ends at a spec on the viewer's shelf with every checker green, not at a lesson. `MolecularGeometry.md` §1 is the rulebook this recipe applies; `AddingAProtein.md` is the sibling for anything that arrives as deposited coordinates. -->

# Adding a molecule

Eight steps, in the order that avoids rework.

**Steps 5 and 7 catch invisible failures.**

## 1. Decide the tier

`MolecularGeometry.md` §1.4 — prop, contrast, or subject. It sets how much accuracy the spec owes for the claim it makes, and every step below is cheaper when this is settled first.

## 2. Pick the file by builder, never by topic

`molecules.js`'s manifest note is the argument, and it is load-bearing: the partition is which builder a spec needs, which is why `DOMAINS` is dependency-ordered. A topic-shaped file ("respiration") names no builder, so it splits nothing that a page pays for.

A NEW domain file needs a cost argument — nothing already in the library wants these specs, and a page drawing one would otherwise parse a pathway to get it. That is what `mol-krebs.js` and `mol-carriers.js` each argue in their headers — and `mol-vitamins.js` argued it too, until glucose moved into `mol-sugars.js` and reaching its one occupant stopped being expensive. A cost argument expires when the cost does; re-read the header before trusting it. Add it to `DOMAINS` and to `Modules.md`'s table.

## 3. Build in real ångströms

Two paths into this step — pick by `MolecularGeometry.md` §1.2, not by habit.

**From PubChem.** (Default path) Ask for the record **by CID**, never by name — a name pins neither charge state nor stereocentre (`tools/sdf/README.md`'s AMP and glucose traps are both this mistake). Fetch the 3D SDF, commit it under `tools/sdf/<name>.sdf`, then convert from inside that directory:

```bash
cd demos/tools/sdf
node ../sdf2spec.js <name>            # amino acids — forces the pep: backbone order
node ../sdf2spec-generic.js <name>    # everything else — keeps the SDF's own atom order
```

Both do parse → reindex/reframe → one global scale so sticks clear the display radii, right-handed basis (`e3 = e1 × e2`) — negating a single output component is a silent mirror, not a rotation (§1.3). The spec's `src:` records `{path:'pubchem', cid, sdf, regen}`; `regen` says how completely the file rebuilds the spec — `'exact'`, `'manual'` (converter can't take it, e.g. proline's secondary amine), or `'lost'` (source conformer no longer published; the committed spec is now its own source, and must not be "refreshed"). `check-molecules.js` fails a spec missing any of this. If `sdf2spec.js` throws on an amino acid, don't force it through the generic converter — reindex by hand and say so in `regen`, proline's precedent.

**Hand-built with Skel.** `units:'angstrom'`, and `register()` applies the display scale once. Grow C–H **last** so every index the spec refers to stays stable — glucose's discipline, and every spec since has kept it.

A fact about one molecule goes in that molecule's spec, beside the comment explaining it; a capability every molecule needs goes in `skel.js`. An in-plane hydroxyl for an sp2 carbon is the first kind. `ringFuranose` is the second.

## 4. `names` in atom order, and name what a card will point at

One label per atom. Anything a page will highlight goes in a named block — `acid:{site}`, `krebs:{}`, `contrast:{diff}` — so the page reads the atom from the spec instead of counting to it. A typed index is a claim nothing checks and a rebuild silently falsifies.

## 5. Never type a `smiles` or a `flat2d`

Add `flat:true` and EMPTY `smiles:''` and `flat2d:[]`, then generate:

```bash
node tools/spec2smiles.js --write && node tools/bake-flat2d.js --write
```

The empty field is the authoring decision — where it goes in the spec, under which comment. The value is the tool's, read off the geometry by RDKit. A hand-written string is a second description of the molecule sitting next to `atoms`/`bonds` and free to drift from them, which is the whole reason the generator exists.

## 6. `node check-molecules.js`

Provenance, formula against atoms and `charge`, sphere clearance on every bonded pair, and every declared `stereo` / `topology` / `chirality` claim. Run it after any geometry change.

A new key also goes in `kit/app.js`'s `MOLS`, or a page naming it in `data-mol` throws: `node kit/check-app.js --write`.

## 7. Any stereocentre: add a `REF` row and run `check-handedness.js`

```bash
npm i && node tools/check-handedness.js
```

**This is the only check in the repo that can see a global mirror**, it needs the network and RDKit, and it is not in `tools/check.js`. `check-molecules.js` will not cover you: its signed-volume test is wired to an amino acid's `pep`, so every other stereocentre in the library is held by this tool and nothing else.

Add the molecule to `REF` with its PubChem name. If it fails, the message distinguishes the two cases, and they need different fixes:

* **EXACT MIRROR** — every centre inverted.
* **differs from** — one centre wrong. Set `DBG=1` to print both strings and see which.

Which slot a substituent takes is a real choice only where the slots are inequivalent. On a ring carbon with two bonds the two open slots straddle the ring plane and picking one IS the stereocentre; on a chain carbon with one bond the three slots are a rotation about that bond, so the centre is set by the ORDER of the grows that follow, not by a slot number. Ascorbate needed one of each, and both first guesses were wrong.

## 8. Shelf it, and ask for a `view:`

Add it to `molecule-viewer.html`'s `SHELF` with a blurb and a focus that reads its atoms from the spec. Then ask the human to pick the opening rotation and paste it back as `view:`. Do not try to choose one by rotating — nothing you can see says whether it landed well.
