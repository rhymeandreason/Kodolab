/* =============================================================================
 *  lib/lessons.js — every lesson, in teaching order
 * =============================================================================
 *  Content, not code: `window.Lessons`, one row per lesson. Read by the shelf
 *  (lessons.html: its cards and embed sheet, which document the fields) and
 *  by the teacher dashboard (build/teacher.html: the lesson a class link
 *  opens, and a lesson's name in the sessions table). A row with `soon` has
 *  no page yet; one without `file` is not a lesson a class can be sent to.
 * ========================================================================== */
window.Lessons = [
  { key: 'water',        unit: 'chem',   url: '/water',              file: '/demos/water-lab.html',        title: 'Structure of Water',            blurb: 'Hydrogen bonds, why ice floats, and why salt falls apart in it.', still: '/demos/media/components/watersim.webp', status: 'featured', bare: true },
  { key: 'bonds',        unit: 'chem',   url: '/molecular-bonds',    file: '/demos/molecule-builder.html', title: 'Covalent & Ionic Bonds',        blurb: 'Drag atoms together and see how different bonds work.', still: '/demos/media/molecules/methane.webp', mol: true, status: 'featured' },
  { key: 'protein',      unit: 'macro',  url: '/protein',            file: '/demos/hemoglobin-lab.html',   title: 'Levels of Protein Structure',   blurb: 'Hemoglobin, from a chain of amino acids to four folded chains. Fully animated.', still: '/demos/proteins/stills/hemoglobin.webp', status: 'featured', bare: true },
  { key: 'sickle',       unit: 'macro',  title: 'Sickle Cell',                   blurb: 'One letter changes, a protein sticks to itself, and a red cell jams.', soon: true },
  { key: 'gallery',      unit: 'macro',  url: '/proteins',           title: 'The Protein Gallery',           blurb: 'Real structures from PDB data. See how many unique shapes and functions proteins have.', still: '/demos/proteins/stills/atp-synthase.webp', status: 'gallery', noEmbed: true },
  { key: 'membrane',     unit: 'cell',   url: '/membrane',           file: '/demos/membrane-lab.html',     title: 'The Membrane',                  blurb: 'Osmosis, diffusion, and what a pump costs.', still: '/demos/media/kodo-membrane.webp', status: 'featured', bare: true },
  { key: 'celltour',     unit: 'cell',   title: 'Inside the Cell',              blurb: 'An animal cell and a plant cell cut open, organelle by organelle, and what each one is for.', soon: true },
  { key: 'respiration',  unit: 'energy', url: '/respiration',        file: '/demos/respiration-lab.html',  title: 'Cellular Respiration',          blurb: 'How a cell turns sugar into usable energy: the whole route on one chart, from the cell to the mitochondrion to the chain, with a door into each stage.', still: '/demos/media/components/mitochondrion.webp', status: 'featured', hub: true },
  { key: 'glycolysis',   unit: 'energy', url: '/glycolysis',         file: '/demos/glycolysis-lab.html',   title: 'Glycolysis',                    blurb: 'Ten steps, every one drawn as the real molecule.', still: '/demos/media/molecules/glucose.webp', mol: true, status: 'featured', bare: true, simple: 'view=inset', path: 1 },
  { key: 'krebs',        unit: 'energy', url: '/krebs',              file: '/demos/krebs-lab.html',        title: 'The Krebs Cycle',               blurb: 'Pyruvate oxidation, then eight steps round the ring. Where the carbon goes.', still: '/demos/media/molecules/citrate.webp', mol: true, status: 'new', bare: true, simple: 'view=inset', path: 2 },
  { key: 'etc',          unit: 'energy', url: '/electron-transport', file: '/demos/etc-lab.html',          title: 'Electron Transport Chain',      blurb: 'Where the electrons go, and why the ledger counts protons, not ATP.', still: '/demos/media/components/electrontransport.webp', status: 'new', bare: true, simple: 'view=inset', path: 3 },
  { key: 'fermentation', unit: 'energy', url: '/fermentation',       file: '/demos/fermentation-lab.html', title: 'Fermentation',                  blurb: 'Where pyruvate goes with no O₂, and why the point is NAD⁺.', still: '/demos/media/molecules/lactate.webp', mol: true, status: 'new', bare: true, simple: 'view=inset', branch: true },
  { key: 'tree',         unit: 'plant',  url: '/tree',               file: '/demos/tree/tree-lab.html',    title: 'The Mass of a Tree',            blurb: 'Van Helmont’s willow, photosynthesis as traffic, and the tree taken apart by where each part came from.', still: '/demos/media/components/tree.webp', status: 'preview', build: true },
  { key: 'photosynth',   unit: 'plant',  title: 'Photosynthesis',               blurb: 'Into the leaf, into the chloroplast: where the light lands, where the water is split, and where the sugar is made.', soon: true },
  { key: 'dna',          unit: 'gene',   url: '/dna',                file: '/demos/dna-structure.html',    title: 'Structure of DNA',              blurb: 'A helix from real coordinates, part by part.', still: '/demos/proteins/stills/dna.webp', status: 'featured' },
  { key: 'replication',  unit: 'gene',   title: 'DNA Replication',              blurb: 'The fork opens and you copy the template a letter at a time: each nucleotide pairs and joins the backbone in one beat.', soon: true },
];
