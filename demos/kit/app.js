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
    'membrane/chemiosmosis.js',
    'membrane/sheet.js',
    'chemiosmosis/circuit.js',  // the kit both circuit components build on
    'chemiosmosis/electron-transport.js',
    'chemiosmosis/light-reactions.js',
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
    Membrane:   ['lib/mol-small.js', 'lib/atomkit.js', 'membrane/parts.js',
                 'membrane/chemiosmosis.js', 'membrane/sheet.js', 'membrane/membrane.js'],
    /* The two proton circuits share circuit.js and nothing of each other.
       parts.js's Pump and membrane.js are for ElectronTransport's span:'cell', where
       the ATP is spent by a Na⁺/K⁺ pump in a plasma membrane stacked above
       the mitochondrion. */
    ElectronTransport: ['lib/mol-small.js', 'lib/atomkit.js', 'membrane/parts.js',
                 'membrane/chemiosmosis.js', 'membrane/sheet.js', 'chemiosmosis/circuit.js',
                 'chemiosmosis/electron-transport.js', 'membrane/membrane.js'],
    LightReactions: ['lib/mol-small.js', 'lib/atomkit.js', 'membrane/parts.js',
                 'membrane/chemiosmosis.js', 'membrane/sheet.js', 'chemiosmosis/circuit.js',
                 'chemiosmosis/light-reactions.js'],
    Proteinbox: ['folding/folding.js', 'kit/ribbon.js', 'kit/nucleic.js', 'kit/surface.js',
                 'kit/proteinbox.js', 'proteins/proteins.js'],
    Leaf:       ['lib/geo.js', 'leaf/leaf.js'],
    Tree:       ['lib/geo.js', 'tree/tree.js'],
    BloodCell:  ['lib/mol-small.js', 'bloodcell/bloodcell.js'],
    BloodFlow:  ['lib/mol-small.js', 'bloodcell/bloodcell.js', 'bloodcell/bloodflow.js'],
    HbCrowd:    ['kit/ribbon.js', 'kit/tube.js', 'kit/surface.js',
                 'sickle/sickle-fibre.js', 'sickle/hbcrowd.js'],
    AnimalCell: ['lib/mol-small.js', 'lib/skel.js', 'lib/mol-sugars.js', 'cell/organelles.js', 'cell/animalcell.js'],
    /* An organelle loads its circuit component for one thing: the ring, so
       this box and the membrane beside it cannot disagree about what an ATP
       costs. The component's arithmetic sits at the top of its file and
       needs no THREE; nothing is mounted. */
    Mitochondrion: ['membrane/chemiosmosis.js', 'chemiosmosis/electron-transport.js', 'cell/organelles.js', 'cell/mitochondrion.js'],
    Chloroplast: ['membrane/chemiosmosis.js', 'chemiosmosis/light-reactions.js', 'cell/organelles.js', 'cell/chloroplast.js'],
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
       `pyruvate` and says why to nobody. A page that names its molecules in
       data-mol gets only their files instead: see MOLS below. */
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

  /* Which domain file registers each molecule key, so a page's data-mol can
     load only those files. check-app.js fails when this and the library
     disagree; `node kit/check-app.js --write` rewrites the block. */
  // mols:begin
  const MOLS = {
    'lib/mol-small.js':      'water ammonia methane o2 co2 carbonic ethanol',
    'lib/mol-aminoacids.js': 'glycine alanine serine cysteine dAlanine proline glutamine glutamate',
    'lib/mol-pathways.js':   'g6p f6p f16bp dhap g3p bpg13 pga3 pga2 pep pyruvate lactate acetaldehyde ethanolSkel',
    'lib/mol-krebs.js':      'oaa citrate isocitrate akg succinate fumarate malate',
    'lib/mol-carriers.js':   'amp pi atp nadh coa acetylcoa succinylcoa fadh2 fad fmnh2 fmn ubiquinol ubiquinone atpSkel nadhSkel',
    'lib/mol-heme.js':       'heme hemeOx hemeC hemeCOx',
    'lib/mol-sugars.js':     'galactose alphaGlucose ribose deoxyribose glucose ascorbate',
    'lib/mol-glycans.js':    'maltose cellobiose galactobiose lactose',
    'lib/mol-lipids.js':     'palmitate glycerol popc palmitoleate',
    'lib/mol-nucleic.js':    'adenine thymine guanine cytosine phosphate dATP dTTP dGTP dCTP pyrimidine purine',
  };
  // mols:end
  const MOL_FILE = {};
  for (const f in MOLS) for (const k of MOLS[f].split(' ')) MOL_FILE[k] = f;
  // The components that take a molecule by name and so load every domain file.
  const BY_NAME = ['Molecule', 'Diagram'];

  /* The molecule keys a page's source names as quoted strings. A generated
     page is read before it runs, so its data-mol can be written for it; a key
     built at runtime is missed, and Molecule and Diagram report the miss. */
  function molsNamed(src) {
    const out = [];
    for (const m of String(src).matchAll(/['"`]([A-Za-z][A-Za-z0-9]*)['"`]/g))
      if (MOL_FILE[m[1]] && out.indexOf(m[1]) < 0) out.push(m[1]);
    return out;
  }

  const CSS = { Proteinbox: ['kit/proteinbox.css'], Graph: ['graph/graph.css'],
                RespirationReaction: ['respiration/respiration.css'],
                Diagram: ['diagram/diagram.css'] };

  /* The list a page's data-use resolves to, or an Error naming what is wrong
     with it. Exported so the builder can answer the same question offline. */
  function plan(names, shell, mols) {
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

    const keys = (mols || []).map(k => String(k).trim()).filter(Boolean);
    const unknown = keys.filter(k => !MOL_FILE[k]);
    if (unknown.length) throw new Error(`kit/app.js: no molecule named ${unknown.join(', ')}. data-mol takes MolLib keys.`);
    const narrow = keys.length > 0 && want.some(n => BY_NAME.indexOf(n) >= 0);

    const files = new Set(CORE);
    for (const f of SHELLS[tpl].files) files.add(f);
    for (const n of want) for (const f of USES[n])
      if (!(narrow && MOLS[f] && BY_NAME.indexOf(n) >= 0)) files.add(f);
    if (narrow) for (const k of keys) files.add(MOL_FILE[k]);

    const css = CORE_CSS.slice();
    for (const n of want) for (const f of (CSS[n] || [])) if (css.indexOf(f) < 0) css.push(f);

    const scripts = ORDER.filter(f => files.has(f));
    const missing = [...files].filter(f => ORDER.indexOf(f) < 0);
    if (missing.length) throw new Error(`kit/app.js: ${missing.join(', ')} is not in ORDER, so it has no load position.`);
    return { want, shell: tpl, scripts, css, mols: narrow ? keys : null };
  }

  if (typeof module === 'object' && module.exports) { module.exports = { plan, molsNamed, USES, CSS, CORE, CORE_CSS, ORDER, SHELLS, MOLS }; return; }

  /* The page's own tag says where the library is: this file is at <base>kit/,
     so every path below hangs off the same prefix, and a page one folder down
     or ten resolves identically. */
  const tag = document.currentScript;
  const base = tag.src.replace(/kit\/app\.js(?:\?.*)?$/, '');
  const url = f => (/^https?:/.test(f) ? f : base + f);

  let out;
  try { out = plan((tag.getAttribute('data-use') || '').split(','), tag.getAttribute('data-shell'),
                   (tag.getAttribute('data-mol') || '').split(',')); }
  catch (e) {
    document.write(`<p style="font:14px/1.5 system-ui;padding:2rem;color:#b00">${e.message}</p>`);
    throw e;
  }
  /* What Molecule and Diagram say when a key's file was left out by data-mol. */
  if (out.mols) {
    const told = new Set();       // once per key: a rebuild would repeat it into the builder's error list
    window.AppMols = {
      missing(key) {
        const f = MOL_FILE[key];
        if (!f || out.mols.indexOf(key) >= 0 || told.has(key)) return null;
        told.add(key);
        return `"${key}" is in ${f}, which this page does not load. Add ${key} to data-mol on the kit/app.js tag.`;
      },
    };
  }
  for (const f of out.css) document.write(`<link rel="stylesheet" href="${url(f)}">`);
  for (const f of out.scripts) document.write(`<scr` + `ipt src="${url(f)}"></scr` + `ipt>`);
})();
