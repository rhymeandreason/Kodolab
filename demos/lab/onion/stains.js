/* The two stains and the five stages, as colours. Their words are text.js's stains and stages.
 * Both stains bind DNA, so chromosomes take the darkest shade and cytoplasm the palest. */
export const STAINS = {
  orcein: { liquid: '#8e1d47', glass: '#ffe0d0', tissue: '#a82d5c', tip: '#6e1238', chrom: '#5a0f33', nuc: '#c4568a', cyto: '#f5e6ec', wall: '#d6aec0' },
  toluidine: { liquid: '#373aa0', glass: '#dde0ff', tissue: '#4b40b0', tip: '#261a72', chrom: '#22155c', nuc: '#6e61c9', cyto: '#e7e6f5', wall: '#b5b1db' },
};
export const STAIN_KEYS = ['orcein', 'toluidine'];

/** The stages a student names in a squash: interphase, then prophase, metaphase, anaphase,
 *  telophase. Index 0 is not dividing; the mitotic index counts the other four. */
export const STAGE_COLORS = ['#94a3b8', '#f59e0b', '#10b981', '#3b82f6', '#ec4899'];

/** cell-division/'s plant track names seven phases; a squash shows five. Prometaphase reads as
 *  late prophase down a light microscope, and the cell plate is telophase's. */
export const STAGE_OF_PHASE = { Interphase: 0, Prophase: 1, Prometaphase: 1, Metaphase: 2, Anaphase: 3, Telophase: 4, Cytokinesis: 4 };
