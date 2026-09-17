/* =============================================================================
 *  _catalog.js — the seven chapters, and which lesson page (if any) teaches one
 * =============================================================================
 *  The tutor may only cite ids from this list. They are baked into the response
 *  schema as an enum, so the model cannot invent a chapter or link a page that
 *  does not exist. `page: null` means the chapter is real but unbuilt: the box
 *  names it and offers no link.
 *
 *  `covers` is read by the model, not by a human. It is what a student's wording
 *  has to match against, so it holds the words a student would actually use.
 *
 *  Node-loadable and DOM-free, so `demos/ask/check-ask.js` and the API resolve
 *  the same pages from the same source.
 * ========================================================================== */
'use strict';

const CHAPTERS = [
  { id: 'water',
    chapter: 'Structure of Water',
    page: 'demos/water-lab.html',
    covers: 'polarity, hydrogen bonds, why water is the universal solvent, ice, '
          + 'surface tension, heat capacity, dissolving salt, hydrophobic and hydrophilic' },

  { id: 'bonds',
    chapter: 'Ionic and Covalent Bonds',
    page: 'demos/molecule-builder.html',
    covers: 'valence, electron sharing vs transfer, ions, electronegativity, '
          + 'molecular geometry, polar vs nonpolar bonds, charge, H2O CH4 NH3 CO2 NaCl' },

  { id: 'protein',
    chapter: 'Structure of Protein',
    page: 'demos/hemoglobin-lab.html',
    covers: 'amino acids, peptide bonds, primary secondary tertiary quaternary structure, '
          + 'alpha helix, beta sheet, folding, denaturation, hemoglobin, heme, R groups' },

  { id: 'glycolysis',
    chapter: 'Glycolysis',
    page: 'demos/glycolysis-lab.html',
    covers: 'glucose breakdown, ATP, NADH, pyruvate, investment and payoff phases, '
          + 'cellular respiration, phosphorylation, fermentation' },

  { id: 'respiration',
    chapter: 'Cellular Respiration',
    page: 'demos/respiration-lab.html',
    covers: 'the whole of aerobic respiration in one chart: glycolysis in the cytoplasm, '
          + 'pyruvate into the mitochondrion, the link step and Krebs cycle giving off CO2 and loading NADH and FADH2, '
          + 'the electron transport chain, the proton gradient, ATP synthase, oxygen as the final electron acceptor, '
          + 'where the ~30 ATP per glucose come from' },

  { id: 'membrane',
    chapter: 'Membrane and Osmosis',
    page: 'demos/membrane-lab.html',
    covers: 'phospholipid bilayer, diffusion, osmosis, tonicity, hypertonic hypotonic isotonic, '
          + 'channels, pumps, active vs passive transport, selective permeability' },

  { id: 'enzymes',
    chapter: 'Enzymes',
    page: null,
    covers: 'catalysts, activation energy, active site, substrate, induced fit, '
          + 'inhibition, optimal pH and temperature, reaction rate' },

  { id: 'dna',
    chapter: 'DNA',
    page: null,
    covers: 'nucleotides, base pairing, double helix, replication, transcription, '
          + 'translation, genes, RNA, the central dogma' },
];

const IDS  = CHAPTERS.map(c => c.id);
const byId = id => CHAPTERS.find(c => c.id === id) || null;

module.exports = { CHAPTERS, IDS, byId };
