/* =============================================================================
 *  kit/app.js — one tag loads a generated app's library
 * =============================================================================
 *  A generated page used to name every file it needed, in order, and get it
 *  wrong: both molecule families at once (molecules.js throws on the second),
 *  a component without the module its scene is built from (throws at mount, on
 *  a line the author never sees), geo.js after card-stage.js, lesson-shell.js
 *  anywhere. Four rules stated in prose and enforced by nothing. Here they are
 *  a table, and a page that says WHAT IT MOUNTS cannot express any of them:
 *
 *      <script src="../kit/app.js" data-shell="steps" data-use="Membrane,Graph"></script>
 *
 *  `data-shell` picks the template the same way: the step-through is the base
 *  every other one is built on, so it is in CORE and a template adds only its
 *  own file, after it.
 *
 *  THIS TABLE IS THE ONE COPY. api/_builder.js reads this file for what each
 *  component needs, so the reference handed to the model no longer carries a
 *  script list per section and cannot drift from what actually loads. Adding a
 *  component means adding a line to USES, and nothing else.
 *
 *  document.write, deliberately. The library is globals with a load order and
 *  no build; a tag written during parse runs in the order it was written and
 *  before the page's own inline script, which is the property every generated
 *  page depends on. Injecting the tags instead would make every one of those
 *  scripts async and every page a callback. The cost is that this file must be
 *  a plain synchronous script in the body, which is where the reference puts
 *  it. Hand-built lessons do not use this: they name their files, and someone
 *  reads them.
 * ========================================================================== */
(function () {
  'use strict';

  /* Every library file a generated app may load, in the only order they may
     load in. Membership is decided below; position is decided here, so a
     component listing its files in any order still lands them correctly. */
  const ORDER = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',
    'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.16/dist/plot.umd.min.js',
    'https://unpkg.com/smiles-drawer@2.4.1/dist/smiles-drawer.min.js',
    'lib/palette.js',
    'lib/tokens-from-palette.js',
    'lib/molecules.js',
    'lib/mol-small.js',
    // Skel and the domain files a condensation's monomers come from. skel.js
    // builds them, so it precedes every mol-* that is Skel-derived.
    'lib/skel.js',
    'lib/mol-pathways.js',
    'lib/mol-krebs.js',
    'lib/mol-carriers.js',
    'lib/mol-heme.js',
    'lib/mol-sugars.js',
    'lib/mol-glycans.js',
    'lib/mol-aminoacids.js',
    'lib/mol-lipids.js',
    'lib/mol-nucleic.js',
    // haworth.js reads a sugar spec, so every mol-* precedes it; diagram-2d.js
    // drives it and SmilesDrawer, so it follows both.
    'lib/haworth.js',
    'lib/diagram-2d.js',
    'lib/scene.js',
    'lib/molview.js',        // after scene.js; the three views of one molecule
    // the pathway kit: side-by-side lanes, the click on a bond, departures.
    // All after scene.js; leaving.js after motion.js.
    'kit/motion.js',
    'kit/molgraph.js',
    'kit/fit.js',
    'kit/lanes.js',
    'kit/hotspot.js',
    'kit/leaving.js',
    'lib/fx.js',
    'lib/geo.js',            // before card-stage.js
    'lib/atomkit.js',
    'reaction/reaction.js',  // after leaving, motion, molgraph, fx and atomkit
    'lib/annotate.js',
    'kit/card-stage.js',
    'kit/ribbon.js',
    'kit/tube.js',
    'kit/nucleic.js',
    'kit/surface.js',
    'folding/folding.js',
    'kit/proteinbox.js',
    'proteins/proteins.js',
    'water/watersim.js',
    'water/watersim-mount.js',
    'membrane/parts.js',
    'membrane/pump.js',
    'membrane/chemiosmosis.js',
    'membrane/membrane.js',
    'leaf/leaf.js',
    'tree/tree.js',
    'bloodcell/bloodcell.js',
    'bloodcell/bloodflow.js',
    // macromolecule/ solves where a monomer sits and what the two become; its
    // spec.js is the arithmetic every linkage reads, so it is first, and
    // glycosidic.js needs chain/frame.js.
    'chain/frame.js',
    'macromolecule/spec.js',
    'macromolecule/glycosidic.js',
    'macromolecule/ester.js',
    'macromolecule/peptide.js',
    'macromolecule/nucleoside.js',   // after glycosidic.js: it borrows quatOf
    'condense/condense.js',
    'respiration/steps.js',
    'respiration/respiration.js',   // after card-stage.js, annotate.js, reaction.js
    'cell/organelles.js',
    'cell/animalcell.js',
    'cell/plantcell.js',
    'cell/mitochondrion.js',
    'cell/chloroplast.js',
    'sickle/sickle-fibre.js',
    'sickle/hbcrowd.js',
    'graph/graph.js',
    'diagram/diagram.js',
    'molecule/molecule.js',  // after lib/molview.js, card-stage.js and every mol-*
    'kit/lesson-shell.js',   // the base every template is built on
    'kit/sandbox-shell.js',  // last: a template reads what the shell defined
  ];

  /* three.js is NOT here: the page writes that tag itself. Chrome refuses a
     parser-blocking CROSS-SITE script written by document.write on a slow
     connection, and a three.js that silently does not arrive is every page
     dead with no error worth reading. Same-origin writes are exempt, which is
     everything below. Graph's d3 and Plot are the remaining exception, taken
     knowingly: they are cross-site, they load only on a page that charts, and
     a missing chart is a visible hole rather than a blank window. */
  /* A page picks one template with data-shell. The step-through is the base
     and every other template is built on it, so it is in CORE and a template
     adds only its own file. */
  const SHELLS = {
    steps:   { entry: 'LessonShell', files: [] },
    sandbox: { entry: 'Sandbox',     files: ['kit/sandbox-shell.js'] },
  };

  const CORE = [
    'lib/palette.js', 'lib/tokens-from-palette.js', 'lib/molecules.js',
    'lib/scene.js', 'lib/annotate.js', 'kit/card-stage.js', 'kit/lesson-shell.js',
  ];
  const CORE_CSS = ['css/kodo.css', 'css/lesson-shell.css'];

  /* What each component is built from, and the stylesheet it draws with.
     Every component that draws a small molecule is on mol-small.js, and
     WaterSim is on none: it carries its own salt record and builds its water
     from its own HL, so it needs no spec file. That is why there is no longer
     a family clash to guard here — the solvation set went to attic/solvation/
     with molecule-lab.html, its last page. */
  const USES = {
    WaterSim:   ['water/watersim.js', 'water/watersim-mount.js'],
    Membrane:   ['lib/mol-small.js', 'lib/atomkit.js', 'membrane/parts.js', 'membrane/pump.js',
                 'membrane/chemiosmosis.js', 'membrane/membrane.js'],
    Proteinbox: ['folding/folding.js', 'kit/ribbon.js', 'kit/nucleic.js', 'kit/surface.js',
                 'kit/proteinbox.js', 'proteins/proteins.js'],
    Leaf:       ['lib/geo.js', 'leaf/leaf.js'],
    Tree:       ['lib/geo.js', 'tree/tree.js'],
    BloodCell:  ['lib/mol-small.js', 'bloodcell/bloodcell.js'],
    BloodFlow:  ['lib/mol-small.js', 'bloodcell/bloodcell.js', 'bloodcell/bloodflow.js'],
    HbCrowd:    ['kit/ribbon.js', 'kit/tube.js', 'kit/surface.js',
                 'sickle/sickle-fibre.js', 'sickle/hbcrowd.js'],
    AnimalCell: ['lib/mol-small.js', 'cell/organelles.js', 'cell/animalcell.js'],
    /* chemiosmosis.js is arithmetic with no THREE and no DOM, and the
       organelle loads it for one thing: the rotor's stoichiometry, so this
       box and a Membrane beside it cannot disagree about what an ATP costs. */
    Mitochondrion: ['membrane/chemiosmosis.js', 'cell/organelles.js', 'cell/mitochondrion.js'],
    Chloroplast: ['membrane/chemiosmosis.js', 'cell/organelles.js', 'cell/chloroplast.js'],
    PlantCell:  ['lib/mol-small.js', 'cell/organelles.js', 'cell/plantcell.js'],
    /* fx.js is optional to the component and listed anyway: without it the
       reaction still runs and simply marks no bonds, which reads as a beat
       missing rather than as a script that was not loaded. */
    Condense:   ['lib/skel.js', 'lib/mol-sugars.js', 'lib/mol-glycans.js',
                 'lib/mol-aminoacids.js', 'lib/mol-lipids.js', 'lib/fx.js',
                 'chain/frame.js', 'macromolecule/spec.js',
                 'macromolecule/glycosidic.js', 'macromolecule/ester.js',
                 'macromolecule/peptide.js', 'macromolecule/nucleoside.js',
                 'lib/mol-nucleic.js', 'condense/condense.js'],
    /* One step of a pathway on two molecules: the verbs are reaction/'s, the
       stage is kit/'s, and every domain file a step can name. glucose is
       mol-sugars.js's; water and CO₂ come from mol-small.js. */
    RespirationReaction: ['lib/skel.js', 'lib/mol-small.js', 'lib/mol-sugars.js',
                 'lib/mol-pathways.js', 'lib/mol-krebs.js', 'lib/mol-carriers.js',
                 'lib/mol-heme.js',
                 'lib/fx.js', 'lib/atomkit.js', 'kit/motion.js', 'kit/molgraph.js',
                 'kit/fit.js', 'kit/lanes.js', 'kit/hotspot.js', 'kit/leaving.js',
                 'reaction/reaction.js', 'respiration/steps.js', 'respiration/respiration.js'],
    Graph:      ['https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',
                 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.16/dist/plot.umd.min.js',
                 'graph/graph.js'],
    /* Every domain file in MolLib.DOMAINS, because the component takes a
       molecule BY NAME and cannot know which one a page will ask for. Listing
       a subset is not a smaller download, it is a page that draws nothing for
       `pyruvate` and says why to nobody. */
    Diagram:    ['lib/skel.js', 'lib/mol-small.js', 'lib/mol-aminoacids.js',
                 'lib/mol-pathways.js', 'lib/mol-krebs.js', 'lib/mol-carriers.js',
                 'lib/mol-sugars.js', 'lib/mol-glycans.js', 'lib/mol-lipids.js',
                 'lib/mol-nucleic.js', 'lib/haworth.js',
                 'https://unpkg.com/smiles-drawer@2.4.1/dist/smiles-drawer.min.js',
                 'lib/diagram-2d.js', 'diagram/diagram.js'],
    /* Diagram's 3D twin, and the same rule: every domain file, because the
       molecule arrives by name. */
    Molecule:   ['lib/skel.js', 'lib/mol-small.js', 'lib/mol-aminoacids.js',
                 'lib/mol-pathways.js', 'lib/mol-krebs.js', 'lib/mol-carriers.js',
                 'lib/mol-sugars.js', 'lib/mol-glycans.js', 'lib/mol-lipids.js',
                 'lib/mol-nucleic.js', 'lib/molview.js', 'molecule/molecule.js'],
  };

  const CSS = { Proteinbox: ['kit/proteinbox.css'], Graph: ['graph/graph.css'],
                RespirationReaction: ['respiration/respiration.css'],
                Diagram: ['diagram/diagram.css'] };

  /* The list a page's data-use resolves to, or an Error naming what is wrong
     with it. Exported so the builder can answer the same question offline. */
  function plan(names, shell) {
    const want = [], bad = [];
    const tpl = String(shell || 'steps').trim() || 'steps';
    if (!SHELLS[tpl]) throw new Error(`kit/app.js: no template named ${tpl}. There is ${Object.keys(SHELLS).join(', ')}.`);
    for (const raw of names) {
      const n = String(raw).trim();
      if (!n) continue;
      if (!USES[n]) { bad.push(n); continue; }
      if (want.indexOf(n) < 0) want.push(n);
    }
    if (bad.length) throw new Error(`kit/app.js: no component named ${bad.join(', ')}. The reference lists what there is.`);

    const files = new Set(CORE);
    for (const f of SHELLS[tpl].files) files.add(f);
    for (const n of want) for (const f of USES[n]) files.add(f);

    const css = CORE_CSS.slice();
    for (const n of want) for (const f of (CSS[n] || [])) if (css.indexOf(f) < 0) css.push(f);

    const scripts = ORDER.filter(f => files.has(f));
    const missing = [...files].filter(f => ORDER.indexOf(f) < 0);
    if (missing.length) throw new Error(`kit/app.js: ${missing.join(', ')} is not in ORDER, so it has no load position.`);
    return { want, shell: tpl, scripts, css };
  }

  if (typeof module === 'object' && module.exports) { module.exports = { plan, USES, CSS, CORE, CORE_CSS, ORDER, SHELLS }; return; }

  /* The page's own tag says where the library is: this file is at <base>kit/,
     so every path below hangs off the same prefix, and a page one folder down
     or ten resolves identically. */
  const tag = document.currentScript;
  const base = tag.src.replace(/kit\/app\.js(?:\?.*)?$/, '');
  const url = f => (/^https?:/.test(f) ? f : base + f);

  let out;
  try { out = plan((tag.getAttribute('data-use') || '').split(','), tag.getAttribute('data-shell')); }
  catch (e) {
    document.write(`<p style="font:14px/1.5 system-ui;padding:2rem;color:#b00">${e.message}</p>`);
    throw e;
  }
  for (const f of out.css) document.write(`<link rel="stylesheet" href="${url(f)}">`);
  for (const f of out.scripts) document.write(`<scr` + `ipt src="${url(f)}"></scr` + `ipt>`);
})();
