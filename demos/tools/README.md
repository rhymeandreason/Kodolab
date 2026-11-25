# Resolving the molecule catalog: `resolve-catalog.js`

`tools/catalog/molecule-catalog.csv` identifies every PubChem
molecule by NAME. **A bare name pins neither a stereocentre nor a charge state**
(`sdf/README.md` has the case where that went wrong), and 28 of the 65 Core
PubChem rows carry stereocentres — so resolve names to CIDs once, commit them,
and fetch by CID from then on.

```bash
node tools/resolve-catalog.js --dry-run     # see what it would do
node tools/resolve-catalog.js               # write CID + Has 3D into the CSV
```

```bash
node tools/resolve-catalog.js --verify      # offline: our committed src.cid
                                            # values vs the catalog's CIDs
```

Needs the network except for `--verify`. Idempotent — rows that already have a
CID and a stereo verdict are skipped, so a re-run is free; `--recheck` forces
them.

**A CID is not automatically a pinned stereoisomer.** `glucose` resolves cleanly
to CID 5793 — one CID, no ambiguity — and that record has one *undefined*
stereocentre: the anomeric carbon. It is the CID `check-handedness.js` says
proves nothing. So every row also records PubChem's `UndefinedAtomStereoCount`,
and 14 rows came back needing a more specific name.

**Nor a pinned charge state.** `--verify` caught two on its first run: the
catalog's "ATP" and "AMP" resolve to the neutral free acids (CID 5957, 6083)
while the specs here ship the physiological anions (5461108 charge −4, 15938965
charge −2). Both are real records; only the CID tells them apart. It never chooses between candidates: a
name that resolves to several CIDs is marked `Ambiguous` and every candidate
goes in `tools/catalog/resolution-report.txt` for a human to settle by
stereochemistry. Rows whose CID has no 3D conformer are marked too — those must
be hand-written or Skel-built, per the `record_type=3d` caveat below.

---

# Regenerating a derived field: use `--write`

`spec2smiles.js` and `bake-flat2d.js` both take `--write`, which edits each
spec's own `mol-*.js` in place instead of printing a row to paste:

```bash
npm i @rdkit/rdkit
node tools/spec2smiles.js --write && node tools/bake-flat2d.js --write
node check-molecules.js
```

Both are idempotent — on an up-to-date tree they leave no diff, so running them
is also how you check whether anything is stale. They replace a field that is
already present and refuse to invent a position for one that is not, so a new
spec needs an empty `smiles:''` / `flat2d:[]` line first; `tools/specfile.js`
has the reasoning. Every write is verified by re-loading the library.

---

# tools/sdf2spec.js

Converts a PubChem 3D record into a `MolLib` amino-acid spec, so the geometry in
`molecules.js` is derived rather than hand-guessed.

**The inputs are committed** — see `sdf/README.md`. You do not need to fetch
anything to re-run a conversion, and for `glutamine`/`glutamate` you must not:
their source conformers are no longer published, so a fresh fetch silently swaps
the geometry.

```bash
cd tools/sdf
node ../sdf2spec.js glycine alanine serine cysteine   # -> generated-specs.json
```

Fetching a NEW molecule, for reference — note the CID form, not the name form:
a bare name pins neither a stereocentre nor a charge state (`sdf/README.md` has
the case where that went wrong):

```bash
curl -o lysine.sdf "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/5962/SDF?record_type=3d"
```

What it does, and why each step exists:

- **parse** — atoms, bonds, and BOND ORDERS from the SDF. The order column is
  what tags the carboxyl `C=O` as `[i,j,2]`; nobody has to spot it by hand.
- **reindex** — forces the library's fixed backbone order
  (`0 N · 1 H · 2 H · 3 Ca · 4 H · 5 C · 6 O(=O) · 7 O(–OH) · 8 H · 9.. R`),
  because `pep:{cC,oOH,hOH,nN,hN}` indexes into it.
  A converter that reshuffled indices would silently break the peptide reaction.
- **reframe** — recentre on Ca, backbone N→C to +X, side chain to −Y. Output is
  **real ångströms**: since molecule-pipeline.md item 7 the specs store ångströms
  and `MolLib.register()` applies the display scale (1.9) once, as the spec is
  registered. This converter used to multiply it in here, which meant the real
  number and the display number were the same field and neither was stated.
  Paste the output straight into a `units:'angstrom'` spec.
- **optH** — flags nonpolar C–H for the lab's "show C–H hydrogens" toggle.
  H on N/O/S is never flagged: those are the H-bond donors.

`check-molecules.js` (one directory up) validates the result — it reports every
bond whose spheres merge, plus all bond angles.

Caveats: `record_type=3d` often has no conformer for charged species
(bicarbonate, pyruvate, HPO₄²⁻), so those stay hand-written. Output is genuinely
non-planar, unlike the flat z=0 layouts elsewhere in `molecules.js`.

---

# tools/sdf2spec-generic.js

The same converter for molecules that are **not** amino acids. `sdf2spec.js`
exists mostly to force the library's fixed backbone order, because
`pep:{cC,oOH,hOH,nN,hN}` indexes into it; a sugar or a
nucleotide has no such contract, so this one keeps the SDF's own atom order.

```bash
cd tools
curl -o beta-D-glucopyranose.sdf "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/beta-D-glucopyranose/SDF?record_type=3d"
node sdf2spec-generic.js beta-D-glucopyranose   # -> generated-specs-generic.json
```

Differences from `sdf2spec.js`:

- **no reindex** — atom order is the record's. Anything a page addresses by
  index (a `groups` map, a reaction site) must be read off the OUTPUT.
- **orientation** — if there is a 5-/6-ring, its mean plane becomes XY, so a
  pyranose lands face-on and the axial/equatorial pattern `check-molecules.js`
  audits is the thing you actually see. Otherwise the longest heavy-atom axis
  becomes +X.
- same real-ångström output, same `optH` policy, same right-handed basis rule —
  negating one output component is a reflection and silently mirrors the
  molecule (see the comment in `sdf2spec.js`).

Used for `amp` in `molecules.js`.

## `dev-server.js` — local development only

```bash
node tools/dev-server.js             # default 8817; if busy, walks up to a free port
node tools/dev-server.js 9000        # explicit port; if busy, says what holds it and stops
```

Static file server with live reload. A CSS-only change swaps the stylesheet in
place (the page keeps its state); anything else reloads. Everything is served
`no-store`, which matters more than it sounds — python's `http.server` sends no
cache headers, so a browser will reuse a stale `scene.js` for a whole session and
a correct fix looks broken.

It injects its reload client into HTML **responses**, never into the files. The
repo deploys to GitHub Pages from the working tree, so the published pages must
stay exactly what is committed. `python3 -m http.server` to see what ships.

# tools/vendor-three.js

Builds `lib/three.r<N>.min.js`, the global-script three.js every classic page loads. three.js ships no global build since r160, so this bundles the ES module with esbuild, adds `THREE.OrbitControls`, and turns colour management off.

```bash
node tools/vendor-three.js            # the version lab/page.js pins
node tools/vendor-three.js 0.187.0    # another one
```

Needs npm and the network; it installs into a temp folder and leaves the repo's `node_modules` alone. A new revision changes the file name, so rename it in `kit/app.js` (`THREE_JS`, `THREE_REV`) and in every page's tag, then load the pages: `docs/Build-Updated.md` section 6 lists what the last move broke.

# tools/check-docs.js

Audits the claims `CLAUDE.md` and `SCIENCE.md` make about the code, for the same
reason `check-molecules.js` audits the claims a spec makes about chemistry: this
project's rule is that a claim ships with its assertion rather than relying on
someone noticing.

```bash
node tools/check-docs.js        # exits non-zero on failure
```

Three checks, chosen because every doc error found so far was one of them — an
**enumeration** that grew a member and wasn't updated:

- **scripts** — CLAUDE.md's per-page script table vs the real `<script>` tags.
  The table's `+ fx` rows are cumulative, so row order is load-bearing.
- **paths** — every file named in a doc or a module comment exists. A file named
  on purpose that doesn't (`engine.js`, TESTING.md's proposals) goes in
  `KNOWN_ABSENT` with a reason, and is then asserted **absent** — build it and
  the check fails until the doc calling it hypothetical is updated.
- **sections** — every `§n` / `§n.m` reference resolves to a real SCIENCE.md
  heading, and every section appears in CLAUDE.md's index (ranges like `§§2–8`
  are expanded).

It does **not** check whether prose is true. Nothing mechanical would have caught
SCIENCE.md claiming `stereo:` understood only `all-equatorial` long after it
learned `{axial}` and `{faces}`. Keeping the docs true is still on the reader.

# tools/check-handedness.js — the only mirror check

```bash
npm i && node tools/check-handedness.js
```

Compares every spec's committed `smiles` against a **stereo-specific** PubChem
record. This is the only check in the repo that can catch a global mirror, and
it caught a real one: every Skel-built sugar was the L-enantiomer (SCIENCE.md
§1.3). Internal checks cannot do this — a mirror preserves exactly the internal
consistency they test.

Two things make it trustworthy:

- **The control group.** Specs that came *from* PubChem are checked too. If those
  fail, the spec → molblock → RDKit path is broken and the geometry is innocent.
  `dAlanine` is in the list deliberately: it must come back **D**.
- **Anomer-specific reference names.** A bare `glucose` (CID 5793) leaves the
  anomeric centre undefined and would prove nothing. Every name is pinned.

Not wired into `check-molecules.js` — network plus a dev dependency, the same
reasoning as `cod-check.js` below. Run it after touching a ring builder or
adding a stereocentre.

# tools/cod-check.js — an audit, not a guard

Compares a Skel-built sugar against a **measured** crystal structure from the
[Crystallography Open Database](https://www.crystallography.net/). Every sugar in
`molecules.js` is constructed from our own `GL` table and idealised VSEPR angles,
so `check-molecules.js` can only prove the geometry matches what the spec
*declares*. This is the one thing that checks the declaration against reality.

```bash
curl -o 2101292.cif https://www.crystallography.net/cod/cif/2/10/12/2101292.cif
node tools/cod-check.js glucose 2101292.cif
```

Run it **once per molecule**, then record the verdict in that spec's
`validated:{}` and move on — see
[molecule-pipeline.md](../../docs/molecule-pipeline.md) item 6 for why it is
deliberately not wired into any check. Short version: the answer cannot go stale,
a network call inside a guard is a liability, and choosing the reference needs
judgement the script cannot supply.

Results so far (2026-07-30): `glucose` matches COD 2101292 on all five
substituents, torsions within 9.6°. `galactose` matches COD 2101291 on C4 — the
axial –OH that is the entire glucose/galactose lesson — with torsions within 3.4°.

Three things to know before trusting a run:

- **The anomeric carbon is reported separately, and it often differs.** C1 is α or
  β depending on which anomer crystallised; our sugars are β and the best
  galactose reference is α. A raw mismatch count would flag a correct spec.
- **Comparison is scale-invariant** — tilt from the ring plane, which face, and
  ring torsions. Never coordinates: our specs are multiplied by `SCALE` (1.9), so
  an RMSD against ångström crystal data means nothing.
- **Pyranoses and furanoses only, single ring.** It finds the ring by sugar
  numbering (`C1..Cn` plus `O5`/`O4`), so `ribose` and `deoxyribose` work but the
  disaccharides do not — `maltose` and `cellobiose` label their two rings `C1A` /
  `C1B`, and adjudicating a glycosidic link is a different job.

The header comment carries the reference-selection traps (predicted structures
filed as measurements, name searches that miss the structure you want,
high-pressure series in ordinary results). Read it before picking a new COD id;
that judgement is the expensive part, not the arithmetic.
