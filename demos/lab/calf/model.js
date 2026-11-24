/* Juniper's blood, and what dissolved particles do to a cell's volume. The bench, the results
 * panel, the eyepiece and the brain level all read it, so every view shows the same numbers.
 * No imports: check-model.mjs runs it in node.
 *
 * Osmolality, not Na⁺ alone, moves water. Plasma's is estimated the clinical way,
 *   2·Na⁺ + glucose/18 + BUN/2.8   (mmol/L, from mEq/L and mg/dL),
 * the 2 counting the anion that travels with each Na⁺. */

/** Calf reference intervals, approximate (bovine intervals in the Merck Veterinary Manual).
 *  Display only: the sim never reads them. */
export const REF = {
  na: [132, 152], k: [3.9, 5.8], cl: [97, 111], glucose: [45, 75], bun: [10, 25], pcv: [24, 46],
};

/** Juniper on the morning of the visit. Diarrhea lost water and salt; a day and a half of
 *  plain water replaced only the water, so Na⁺ and Cl⁻ fell together. The rest sit in range
 *  on purpose, so the panel has one story to find. */
export const JUNIPER = { na: 110, k: 5.1, cl: 82, glucose: 62, bun: 21, pcv: 31 };
export const HEALTHY_NA = 140;   // her Na⁺ before the plain water, mid-range

export const osmolality = ({ na, glucose, bun }) => 2 * na + glucose / 18 + bun / 2.8;
/** Plasma osmolality at a given Na⁺, everything else as Juniper's. */
export const plasmaOsm = (na) => osmolality({ ...JUNIPER, na });
/** What a cell was built for: plasma at her healthy Na⁺. Her brain cells still hold this. */
export const CELL_OSM = plasmaOsm(HEALTHY_NA);

/** NaCl solutions, osmolality from % w/v: 10000·%/58.44 mmol/L, two ions each, osmotic
 *  coefficient 0.93 (close to constant over 0.5–3 %). */
export const salineOsm = (pct) => (pct * 10000 / 58.44) * 2 * 0.93;

/** Boyle–van 't Hoff: a cell is an osmometer whose water follows the outside osmolality,
 *  V/V₀ = b + (1 − b)·(π₀/π). b is the part that isn't water (haemoglobin, membrane).
 *  b = 0.4 and lysis near 1.6·V₀ are human red-cell values; a calf's are close but cattle red
 *  cells are more fragile than ours (calves with water intoxication pass red urine), so the
 *  plasma tube's "swollen, intact" is the conservative call. */
export const RBC = { b: 0.4, lyse: 1.6, lyseSpread: 0.06 };
export function cellVolume(outsideOsm, insideOsm = CELL_OSM, b = RBC.b) {
  if (outsideOsm <= 0) return Infinity;
  return b + (1 - b) * insideOsm / outsideOsm;
}
/** Fraction of red cells burst at a volume: each cell's limit varies around RBC.lyse. */
export function lysed(v) {
  if (!isFinite(v)) return 1;
  const z = (v - RBC.lyse) / RBC.lyseSpread;
  return 1 / (1 + Math.exp(-1.7 * z));   // logistic stand-in for the normal CDF
}

/** The four tubes on the bench, each 5 mL with a drop of Juniper's blood. */
export const TUBES = [
  { key: 'iso', osm: salineOsm(0.9) },
  { key: 'plasma', osm: plasmaOsm(JUNIPER.na) },
  { key: 'hyper', osm: salineOsm(3) },
  { key: 'water', osm: 0 },
].map((t) => {
  const v = cellVolume(t.osm);
  return { ...t, volume: v, lysed: lysed(v) };
});

/** Minutes for burst cells to clear a tube (hypotonic lysis is done in well under a minute;
 *  the tube visibly clears over a few as the haemoglobin spreads). */
export const CLEAR_MIN = 3;

/** An astrocyte against the blood: same osmometer, its own non-water fraction. Acute only:
 *  over hours brain cells export K⁺, Cl⁻ and then organic osmolytes, and shrink back. */
export const ASTRO_B = 0.3;
export const astroVolume = (na) => cellVolume(plasmaOsm(na), CELL_OSM, ASTRO_B);
