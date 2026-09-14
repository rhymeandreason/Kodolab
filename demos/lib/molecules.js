/* =====================================================================
 *  molecules.js — shared molecule library + colour palette
 *  Loaded as a classic script (Three r128 global style) BEFORE the page's
 *  main script. Exposes window.MolLib for both water-lab.html and the
 *  upcoming molecule-builder.html, so colours and geometry stay identical
 *  across pages.
 *
 *  PALETTE is the single source of truth for atom + bond colours.
 *  MOLECULES will hold the declarative specs (geometry + charge sites +
 *  solute class) that drive buildMolecule() and the solvation physics.
 *
 * ---------------------------------------------------------------------
 *  BOND LENGTHS — one hard rule, and check-molecules.js enforces it: a bond
 *  must be longer than the sum of its two atoms' display radii, or the spheres
 *  swallow the stick and the molecule renders as a blob. Display radii here are
 *  stylised and LARGE, so no spec may carry true ångströms at render time.
 *
 *  Every spec in lib/ STORES real ångströms (`units:'angstrom'`) and register()
 *  multiplies by SCALE once on the way in, so relative lengths are truthful and
 *  every molecule in the library is comparable to every other. One scale
 *  family: there is no longer a second set to keep off the same screen.
 *
 *  A small molecule beside a big one is mol-small.js — water, ammonia, methane,
 *  O₂, CO₂, ethanol, carbonic acid, from measured lengths.
 *
 *  The salts carry no coordinates, only dissociation records, so nacl/kcl are
 *  scale-free. watersim.js keeps the one it dissolves in its own SALTS table.
 * ===================================================================== */
(function(global){
  'use strict';


  // ---- colours (hex ints) ---------------------------------------------
  // The numbers live in palette.js — the house atom colours plus the
  // bond colours and display radii. This file only re-exports them as
  // MolLib.PALETTE, which is what every page and module reads. Atom colours
  // also double as the swatches in water-lab's Debug ▸ Colours tab; editing
  // MolLib.PALETTE.atoms live keeps every molecule on the page consistent.
  //
  // Browser: <script src="palette.js"> goes BEFORE this file.
  // Node (lib-node.js and the checkers): required directly.
  const PALETTE =
    (typeof window!=='undefined' && window.MolPalette) ||
    (typeof globalThis!=='undefined' && globalThis.MolPalette) ||
    (typeof require==='function' ? require('./palette.js').PALETTE : null);
  if(!PALETTE) throw new Error('molecules.js: palette.js must load before molecules.js');

  // ---- molecule library ----------------------------------------------
  // Each entry:
  //   name, formula
  //   class    — 'solvent' | 'ionic' | 'polar' | 'nonpolar'
  //   atoms    — [{el, pos:[x,y,z]}]  local positions, real ångströms until
  //              register() scales them once — see the note at the top.
  //   bonds    — [[i,j], …]  indices into atoms
  //   sites    — { donors:[{atom}], acceptors:[{atom, lonePairs}] }
  //              donor = a δ+ H that can point into water; acceptor = a
  //              lone-pair-bearing atom water's H can point at. Drives the
  //              H-bond engine for molecular (polar) solutes.
  //   dissociates — ionic only: [{ion, charge, radius}] produced on dissolving
  //   hydrophobic — indices of nonpolar atoms (tail), for the exclusion lesson
  //   src      — WHERE THE COORDINATES CAME FROM, and what was done to them.
  //              See the provenance note below.
  //
  // Geometry notes: united-atom where a group is nonpolar filler (ethanol's
  // CH3/CH2 are single C spheres); explicit H's where they carry the lesson.
  //
  // ---------------------------------------------------------------------
  //  PROVENANCE — `src:` on every spec (docs/molecule-pipeline.md item 1)
  // ---------------------------------------------------------------------
  //  Four different paths produce geometry in this file and, until this field
  //  existed, nothing in a spec recorded which one it took. Two of them
  //  ('pubchem' and 'skel') even produce the same bond-length family, so they
  //  are indistinguishable by inspection while failing in completely different
  //  ways. `src.path` is the discriminator:
  //
  //    'hand'    — coordinates typed by a person, each bond length chosen to
  //                clear its two display radii. Family A. Its own source.
  //    'pubchem' — a real measured 3D record through one of the converters in
  //                tools/. Family B. The ONLY path that cannot be re-run from
  //                this repo alone (no .sdf is committed yet — item 2).
  //    'skel'    — constructed at load time from idealised VSEPR angles by the
  //                Skel builder below. Family B. Fully reproducible, because
  //                the code IS the source. Defaulted by Skel.prototype.spec,
  //                so a new Skel molecule is labelled without anyone deciding.
  //    'built'   — constructed, but from literals worked out once by hand
  //                rather than by Skel. Family B. Reproducible only in the
  //                sense that the comment above the spec explains the
  //                construction; nothing re-derives it.
  //    'mirror'  — reflected from another spec in this file at load time.
  //
  //  THE THREE-VALUE RULE, which is the point of the field:
  //
  //    a field PRESENT   — this decision was made, and here it is.
  //    a field NULL      — this decision was never pinned. Regenerating may
  //                        silently produce a different molecule.
  //    a field ABSENT    — not applicable to this path.
  //
  //  `conformer:null` is therefore a claim, not a gap: it says the sweep in
  //  molecule-pipeline.md item 0 applies to this spec — a CID alone does not
  //  identify a conformer, so anything with a rotatable side chain may come
  //  back different. Do not "tidy" a null into an absence.
  //
  //  Fields for path 'pubchem': `cid` or `query` (how the record was asked
  //  for — a bare NAME is weaker than a CID and is recorded as such, because
  //  a name pins neither a stereocentre nor a CHARGE STATE; see `amp` for what
  //  that one cost), `record` (the record_type), `conformer`
  //  (PUBCHEM_CONFORMER_ID), `tool` (which converter), `sdf` (the committed
  //  input in tools/sdf/), `regen` (below), `reindex` if the fixed backbone
  //  order was imposed by hand, `strip`/`charge` for post-processing,
  //  `fetched` when the date is known.
  //
  //  `regen` — HOW COMPLETELY the committed .sdf rebuilds this spec. A recorded
  //  verdict from a real run, not something re-derived at load:
  //    'exact'  — the .sdf regenerates these coordinates to 0.000.
  //    'manual' — the .sdf is the true source, but a hand step sits in the
  //               middle, so it does not rebuild on its own [proline].
  //    'lost'   — NO published record reproduces this spec any more. The
  //               committed .sdf is the closest available, NOT a reproduction,
  //               and THE SPEC IS NOW THE SOURCE. Refreshing one of these from
  //               PubChem silently swaps a conformer [glutamine, glutamate].
  //  tools/sdf/README.md has the per-file table and the two cautionary cases.
  // The derived-family scale factor. It lives HERE rather than in skel.js
  // because it is a property of the library, not of the builder: the PubChem
  // converters apply the same 1.9 (tools/sdf2spec.js), so monomer pages that
  // never load a builder still need it. skel.js reads it back off MolLib to
  // define GL and AR. Exported so Stage.measure() can divide it out and report
  // real ångströms — pages used to hard-code 1.9, which silently becomes wrong
  // the day this constant moves.
  const SCALE = 1.9;

  // Presentation views: which way a molecule should FACE, in radians [x,y,z],
  // applied by Stage.buildMolecule rather than baked into the coordinates. A
  // spec's atom positions stay canonical, so check-molecules.js measures the
  // molecule and not a camera angle, and two specs can share one view by name
  // instead of by copying three constants and a comment.
  // ENUM: a new shared angle goes here, not inline in a spec — CLAUDE.md
  // "Keeping the docs true" lists this table as one that goes stale silently.
  const VIEW = {
    // The 3/4 chair. Every pyranose on every page uses this, which is what makes
    // glucose look the same in glycolysis-lab and contrast-lab.
    // Tuned +28° x / -24.4° y off an earlier [1.05, 0.45, -0.2] pass.
    pyranose:[1.5387, 0.0241, -0.2],
    // Tuned -30.5° y off an earlier [-0.89, -2.723, -1.257] pass.
    furanose:[-0.89, -3.2553, -1.257],
    // Two pyranose rings across a glycosidic link (maltose/cellobiose).
    disaccharide:[-1.3828, -0.1882, -1.0656],
    // Flat aromatics are built in the xz-plane, so they need turning face-on.
    // Tuned -6.5° x / -20.8° y off an earlier [-Math.PI/2, 0.35, 0] pass.
    flatRing:[-1.6842, -0.013, 0],
  };

  // The registry. Domain files (mol-*.js) register into this; molecules.js on
  // its own deliberately holds NO specs. Which files a page loads is what
  // decides which molecules exist on it — see CLAUDE.md's script table.
  const MOLECULES = {};

  /* ---- units, and where the display scale is applied ------------------
   * A spec's coordinates ON DISK are REAL ÅNGSTRÖMS (`units:'angstrom'`).
   * They are multiplied by SCALE exactly once, here, as the spec is
   * registered. So the FILE is honest and instrument-comparable, while
   * everything downstream still sees the stylised scene units it always has.
   *
   * The display scale is applied at REGISTRATION rather than at render, and
   * that is deliberate: `Stage.buildMolecule` is not the only reader.
   * glycolysis-lab, contrast-lab and haworth.js all index
   * `spec.atoms[i].pos` directly and compare it against PALETTE.radii, which
   * are scene units. Scaling at render would leave every one of those
   * comparing ångströms to scene units — a class of bug that renders as
   * "everything is suddenly tiny" in some places and not others.
   *
   * `units:'scene'` means the numbers are already display-scale and must NOT
   * be touched. Only specs DERIVED from an already-registered spec carry it
   * (dAlanine mirrors alanine), since those are scaled already.
   *
   * Scaling is idempotent: a spec is stamped once and never re-scaled, so a
   * double registration cannot silently double a molecule's size.
   */
  // `from` is the registering file's own SELFNAME. Stamped onto every spec as
  // `domain`, because "which mol-*.js do I load to get this molecule?" is a
  // question every page and every checker has to answer and nothing recorded
  // the answer — it lived only in CLAUDE.md's script table, i.e. in prose. A
  // page reading `spec.domain` reads the file that actually registered it.
  function register(specs, from){
    for(const [key, spec] of Object.entries(specs)){
      if(from) spec.domain = from;
      if(!spec.units) throw new Error(
        `molecules.js: ${key} has no \`units\` — 'angstrom' (real, scaled here) `
        + `or 'scene' (already display-scale). See the units note in molecules.js.`);
      if(spec.units === 'angstrom' && !spec._scaled && spec.atoms){
        for(const a of spec.atoms) a.pos = [a.pos[0]*SCALE, a.pos[1]*SCALE, a.pos[2]*SCALE];
        spec._scaled = true;
      }
      // Two domain files claiming the same name is never intentional, and the
      // last one silently wins: every scene on the page then draws whichever
      // loaded last. No pair in lib/ collides today.
      if(MOLECULES[key] && MOLECULES[key] !== spec) throw new Error(
        `molecules.js: '${key}' is already registered — two domain files define `
        + `it. Check the page's <script> tags; the two files disagree about a key.`);
      if(spec.pep) derivePeptideCondense(key, spec);
      MOLECULES[key] = spec;
    }
    return MOLECULES;
  }

  /* An amino acid says which atoms the peptide bond acts on ONCE, in `pep`.
   * `condense:` is the vocabulary every other condensing molecule speaks — a
   * sugar's anomeric –OH, a phosphate's P–OH — and check-molecules.js checks
   * that one, not `pep`. Writing both by hand on eight specs is two statements
   * of the same fact that part company on the first renumbering, so the second
   * is derived here from the first and then checked like any other.
   *
   * The carboxyl keeps its C and loses –OH; the amino keeps its N and loses one
   * H. `product:null` because a dipeptide has no spec to check the formula
   * against, which check-molecules.js requires be written out rather than
   * omitted. A spec that declares its own `condense:` keeps it. */
  function derivePeptideCondense(key, spec){
    if(spec.condense) return;
    const p = spec.pep;
    spec.condense = {
      roles:[
        { key:'carboxyl', label:'\u2013COOH', keep:p.cC, leaves:[p.oOH, p.hOH] },
        // ONE amino hydrogen, not both: a condensation sheds O + H + H in
        // total and the carboxyl already brought two of the three. Proline
        // only has one anyway.
        { key:'amino',    label:'\u2013NH\u2082', keep:p.nN, leaves:[p.hN[0]] } ],
      makes:[ { product:null, donor:'carboxyl', acceptor:'amino', bond:'peptide' } ] };

    /* A SIDE CHAIN THAT CAN ALSO REACT. Glutamate has a second carboxyl on the
     * end of its side chain, and it makes exactly the same bond — which is the
     * whole of what glutathione is: γ-Glu-Cys-Gly, joined through that one
     * instead of the backbone's, which is why no ordinary peptidase can cut it.
     *
     * DECLARED BY ATOM NAME, not index. Everything else in this block comes
     * from `pep`, whose indices are pinned by the fixed backbone order; a side
     * chain has no such order, so a number typed here would be a number that
     * goes stale the next time the spec is regenerated. `names` is the stable
     * handle and check-molecules.js audits the result either way. */
    for(const r of spec.pepSide || []){
      const ix = n => (spec.names || []).indexOf(n);
      const keep = ix(r.keep), leaves = r.leaves.map(ix);
      if(keep < 0 || leaves.some(i => i < 0)) throw new Error(
        `molecules.js: ${key} declares a pepSide role naming an atom it does not have `
        + `(${[r.keep, ...r.leaves].join(', ')})`);
      spec.condense.roles.push({ key:r.key, label:r.label, keep, leaves });
    }
  }

  // THE MANIFEST: every domain file, in dependency order. A page loads the
  // subset it needs (that is the point of the split); anything wanting the
  // WHOLE library walks this list rather than hard-coding one — lib-node.js is
  // the only such consumer today, and it exists so that adding a domain file
  // does not mean remembering four checkers.
  //   ENUM: a new mol-*.js goes here AND in CLAUDE.md's script table.
  //   tools/check-docs.js asserts every name below is a real file.
  /* THE PARTITION IS BY DERIVATION, NOT BY TOPIC. Every comment below names a
   * BUILDER dependency, and the array is dependency-ORDERED because of it —
   * `skel.js` first, then the files that need it.
   * A topic-shaped file ("respiration", "photosynthesis") names no builder, so
   * file a new molecule by HOW IT IS BUILT and let the lesson load what it
   * draws. The
   * cost being managed is a page paying to parse specs it never renders; that
   * is what splits a file, not subject matter. */
  const DOMAINS = [
    'mol-small.js',        // hand-written from spectroscopic values — no builder
    'mol-aminoacids.js',   // PubChem conversions + one mirror — no builder.
                           //   D-alanine reflects alanine, so the two are in ONE
                           //   file and the ordering is local to it.
    'mol-pathways.js',   // needs skel.js — G6P to pyruvate, and nothing else:
                           //   the carriers those steps move went to
                           //   mol-carriers.js, and glucose to mol-sugars.js
    'mol-krebs.js',        // needs skel.js — the eight acids. FAD and CoA were
                           //   the reason this file was split off on cost; they
                           //   are in mol-carriers.js now, which every pathway
                           //   page loads and this one no longer has to.
    'mol-carriers.js',     // needs skel.js — ATP, NADH, Pi, AMP, FAD/FADH2, CoA
                           //   and the two thioesters, plus atpSkel/nadhSkel.
                           //   No page draws a pathway without its carriers, so
                           //   they are one file rather than four.
    'mol-heme.js',         // written by tools/bake-heme.js from a deposited
                           //   pocket, hydrogens grown by skel.js — heme b as a
                           //   molecule, for the chain lesson only
    'mol-sugars.js',       // needs skel.js — the monosaccharides, split OUT of
                           //   the old mol-contrast.js: four pages wanted one
                           //   sugar each and were parsing proline to get it.
    'mol-glycans.js',      // needs skel.js AND mol-sugars.js — lactose and
                           //   galactobiose are built against its galactose.
                           //   The disaccharides, split out for the same reason
                           //   the monosaccharides were: five pages wanted only
                           //   these and were parsing an amino acid and a fatty
                           //   acid to reach one.
    'mol-lipids.js',       // literals — plus palmitoleate, the one
                           //   spec here that is built and the only reason this
                           //   file touches skel.js
    'mol-nucleic.js',      // PubChem — plus purine and pyrimidine, the
                           //   two parent rings, which are built
  ];

  // Files that REPLACE one of the above rather than adding to it. They define
  // the same keys at a different scale, so register() throws if both load —
  // which is the point. Anything walking the library for checking has to load
  // an alternate SEPARATELY (see lib-node.js), never alongside what it swaps.
  //   EMPTY: the library is one scale family. The machinery stays because the
  // next either/or pair is a `units:` decision away.
  //   ENUM: a new either/or domain file goes here, not in DOMAINS.
  const DOMAIN_ALTERNATES = [];

  /* ---------- atom references by name ----------
   * Specs carry an optional `names` array: one PDB-style label per atom, in
   * the same order as `atoms`. Fields that point AT atoms may then use those
   * labels instead of raw integers — `diff:['NE2','HE21','HE22']` says what it
   * selects, where `diff:[17,18,19]` says only where it currently lands.
   *
   * The problem this solves is real and already documented all over this file:
   * seven fields (`pep`, `groups`, `diff`, `optH`, `stereo.axial`, `cis`,
   * `glycosidic`) index into `atoms`, and the comments keep warning that
   * regenerating a spec "must not renumber them" — with nothing enforcing it.
   * A different BFS order in sdf2spec.js silently repoints every one of them.
   * Named references survive that, and check-molecules.js fails loudly on a
   * name that does not resolve.
   *
   * `names` is generated once by tools/name-atoms.js and committed, not derived
   * at load. It is positional and travels with `atoms`: regenerate the two
   * together. The suffixes come from chemistry (bond order, then element), not
   * from array position, so a reordered spec yields the SAME names — which is
   * the whole point.
   *
   * Integers still work everywhere, so specs migrate one at a time.
   */
  function atomIndex(spec, ref){
    if(typeof ref === 'number') return ref;
    const i = spec.names ? spec.names.indexOf(ref) : -1;
    if(i < 0) throw new Error(`atom '${ref}' is not in ${spec.name||'this spec'}`
      + (spec.names ? '' : " (spec has no `names` array yet)"));
    return i;
  }
  const resolveAtoms = (spec, refs) => (refs||[]).map(r => atomIndex(spec, r));

  // SCALE is exported so Stage.measure() can divide it back out and report real
  // angstroms. Pages used to hard-code 1.9 to do that, which silently becomes
  // wrong the day this constant moves.
  global.MolLib = { PALETTE, MOLECULES, SCALE, VIEW, DOMAINS, DOMAIN_ALTERNATES, register, atomIndex, resolveAtoms };
})(this);
