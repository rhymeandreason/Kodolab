/* =============================================================================
 *  lib/lessons.js — every lesson, in teaching order
 * =============================================================================
 *  Content, not code: `window.Lessons`, one row per lesson. Read by the shelf
 *  (lessons.html: its cards and embed sheet, which document the fields) and
 *  by the teacher dashboard (build/teacher.html: the lesson a class link
 *  opens, and a lesson's name in the sessions table). A row with `soon` has
 *  no page yet; one without `file` is not a lesson a class can be sent to.
 *  `window.LessonUnits` is the course's units in order, which the shelf draws
 *  as its spine and lib/site.js's lesson menu names a lesson's unit by.
 * ========================================================================== */
window.Lessons = [
  { key: 'water',        unit: 'chem',   url: '/water',              file: '/demos/water-lab.html',        title: 'Structure of Water',            blurb: 'Hydrogen bonds, why ice floats, and why salt falls apart in it.', still: '/demos/media/components/watersim.webp', status: 'featured', bare: true },
  { key: 'bonds',        unit: 'chem',   url: '/molecular-bonds',    file: '/demos/molecule-builder.html', title: 'Covalent & Ionic Bonds',        blurb: 'Drag atoms together and see how different bonds work.', still: '/demos/media/molecules/methane.webp', mol: true, status: 'featured' },
  { key: 'protein',      unit: 'macro',  url: '/protein',            file: '/demos/hemoglobin-lab.html',   title: 'Levels of Protein Structure',   blurb: 'Hemoglobin, from a chain of amino acids to four folded chains. Fully animated.', still: '/demos/proteins/stills/hemoglobin.webp', status: 'featured', bare: true },
  { key: 'gallery',      unit: 'macro',  url: '/proteins',           title: 'The Protein Gallery',           blurb: 'Real structures from PDB data. See how many unique shapes and functions proteins have.', still: '/demos/proteins/stills/atp-synthase.webp', status: 'gallery', noEmbed: true },
  { key: 'sickle',       unit: 'macro',  url: '/sickle-cell',        file: '/demos/sickle-lab.html',       title: 'Sickle Cell',                   blurb: 'A mutation in the HBB gene for hemoglobin turns red blood cells into stiff, crescent-shaped sickle cells that can block blood flow.', still: '/demos/media/components/sickle-cell.webp', status: 'new', bare: true },
  { key: 'enzymes',      unit: 'macro',  url: '/enzymes',            file: '/demos/enzyme/enzyme-lab.html', title: 'Enzymes',                       blurb: 'How a folded pocket grabs one molecule and speeds up its reaction, and what heat, pH and an inhibitor do to it.', still: '/demos/media/components/enzyme.webp', status: 'new' },
  { key: 'membrane',     unit: 'cell',   url: '/membrane',           file: '/demos/membrane-lab.html',     title: 'The Membrane',                  blurb: 'Osmosis, diffusion, and what a pump costs.', still: '/demos/media/kodo-membrane.webp', status: 'featured', bare: true },
  { key: 'celltour',     unit: 'cell',   title: 'Inside the Cell',              blurb: 'An animal cell and a plant cell cut open, organelle by organelle, and what each one is for.', soon: true },
  { key: 'respiration',  unit: 'energy', url: '/respiration',        file: '/demos/respiration-lab.html',  title: 'Cellular Respiration',          blurb: 'How a cell turns sugar into usable energy: the whole route on one chart, from the cell to the mitochondrion to the chain, with a door into each stage.', still: '/demos/media/components/mitochondrion.webp', status: 'featured', hub: true },
  { key: 'glycolysis',   unit: 'energy', url: '/glycolysis',         file: '/demos/glycolysis-lab.html',   title: 'Glycolysis',                    blurb: 'Ten steps, every one drawn as the real molecule.', still: '/demos/media/molecules/glucose.webp', mol: true, status: 'featured', bare: true, simple: 'view=inset', path: 1 },
  { key: 'krebs',        unit: 'energy', url: '/krebs',              file: '/demos/krebs-lab.html',        title: 'The Krebs Cycle',               blurb: 'Pyruvate oxidation, then eight steps round the ring. Where the carbon goes.', still: '/demos/media/molecules/citrate.webp', mol: true, status: 'new', bare: true, simple: 'view=inset', path: 2 },
  { key: 'etc',          unit: 'energy', url: '/electron-transport', file: '/demos/etc-lab.html',          title: 'Electron Transport Chain',      blurb: 'Where the electrons go, and why the ledger counts protons, not ATP.', still: '/demos/media/molecules/nadhSkel.webp', mol: true, status: 'new', bare: true, simple: 'view=inset', path: 3 },
  { key: 'etcsim',       unit: 'energy', url: '/etc-sim',            file: '/demos/etc-sim.html',          title: 'Electron Transport, Live',      blurb: 'Send one glucose’s NADH and FADH₂ into the membrane, watch the protons pile up, and count the ATP.', still: '/demos/media/components/electrontransport.webp', status: 'new', sim: true },
  { key: 'fermentation', unit: 'energy', url: '/fermentation',       file: '/demos/fermentation-lab.html', title: 'Fermentation',                  blurb: 'Where pyruvate goes with no O₂, and why the point is NAD⁺.', still: '/demos/media/molecules/lactate.webp', mol: true, status: 'new', bare: true, simple: 'view=inset', branch: true },
  { key: 'tree',         unit: 'plant',  url: '/tree',               file: '/demos/tree/tree-lab.html',    title: 'The Mass of a Tree',            blurb: 'Van Helmont’s willow, photosynthesis as traffic, and the tree taken apart by where each part came from.', still: '/demos/media/components/tree.webp', status: 'preview', build: true },
  { key: 'photosynth',   unit: 'plant',  title: 'Photosynthesis',               blurb: 'Into the leaf, into the chloroplast: where the light lands, where the water is split, and where the sugar is made.', soon: true },
  { key: 'dna',          unit: 'gene',   url: '/dna',                file: '/demos/dna-structure.html',    title: 'Structure of DNA',              blurb: 'A helix from real coordinates, part by part.', still: '/demos/proteins/stills/dna.webp', status: 'featured' },
  { key: 'replication',  unit: 'gene',   title: 'DNA Replication',              blurb: 'The fork opens and you copy the template a letter at a time: each nucleotide pairs and joins the backbone in one beat.', soon: true },
  { key: 'division',     unit: 'gene',   title: 'Mitosis & Meiosis',             blurb: 'One cell becomes two identical copies, or four that each carry half. Follow the chromosomes through both.', soon: true },
];

window.LessonUnits = [
  { key: 'chem',  n: '01', hue: 'var(--blue)',   title: 'The chemistry of life', why: 'Why water behaves as it does, and how atoms decide what they bond to.' },
  { key: 'macro', n: '02', hue: 'var(--coral)',  title: 'Proteins',              why: 'A chain that folds, one letter that changes a body, and a gallery of real structures to turn over.' },
  { key: 'cell',  n: '03', hue: 'var(--amber)',  title: 'The cell',              why: 'What the membrane lets through, and what it costs to push the rest.' },
  { key: 'energy',n: '04', hue: 'var(--violet)', title: 'Energy',                why: 'One glucose, followed from the cytosol to the last electron. Start with the overview, then open any stage.' },
  { key: 'plant', n: '05', hue: 'var(--green)',  title: 'Plants',                why: 'Where the mass of a tree comes from, which is not the soil.' },
  { key: 'gene',  n: '06', hue: 'var(--blue)',   title: 'Genetics',              why: 'The helix, from real coordinates, taken apart.' },
];
