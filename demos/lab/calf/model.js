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
export const astroVolume = (na, cellOsm = CELL_OSM) => cellVolume(plasmaOsm(na), cellOsm, ASTRO_B);

/* ---------- treatment ----------
 * Adrogué–Madias: one litre of a fluid moves serum Na⁺ by
 *   ΔNa⁺ = (infusate Na⁺ + K⁺ − serum Na⁺) / (total body water + 1)
 * It assumes she keeps every drop and loses no salt or water meanwhile (no fresh water,
 * no more diarrhea), so it is a best case for the 6 h it is used over. */
export const CALF = { kg: 50, waterFrac: 0.7 };   // a 3-week-old Holstein; neonates run ~70% water
export const TBW = CALF.kg * CALF.waterFrac;      // L
/** The three bags on the bench: Na⁺ per litre of each. */
export const FLUIDS = [
  { key: 'd5w', na: 0 },                                  // 5% dextrose: the sugar is burned, leaving free water
  { key: 'iso', na: 154 },                                // 0.9% NaCl
  { key: 'hyper', na: 513 },                              // 3% NaCl
];
export const VOLUMES = [0.5, 1];                          // L
export const adrogueMadias = (fluidNa, na = JUNIPER.na) => (fluidNa - na) / (TBW + 1);
/** A rise this big eases the swelling enough to stop the seizures. */
export const SEIZURE_STOP = 4;
/** The most serum Na⁺ may rise in 24 h once the brain has adapted (8 for a high-risk patient). */
export const SAFE_24H = 10;
/** mL/h through the catheter: 1 L takes 2 h, then the 6 h replay shows Na⁺ settled. */
export const RATE = 500;
export const RX_HOURS = 6;
/** Serum Na⁺ for a prescription, h hours after the drip starts. */
export function rxNa({ fluid, vol }, h) {
  const f = FLUIDS.find((x) => x.key === fluid);
  const run = Math.min(1, h / (vol * 1000 / RATE));
  return JUNIPER.na + adrogueMadias(f.na) * vol * run;
}
/** 'worse' · 'barely' (seizures go on) · 'safe' · 'over' (past the day's safe rise). */
export function outcome(rx) {
  const d = rxNa(rx, RX_HOURS) - JUNIPER.na;
  return d < 0 ? 'worse' : d < SEIZURE_STOP ? 'barely' : d <= SAFE_24H ? 'safe' : 'over';
}
export const SAFE_RX = { fluid: 'hyper', vol: 0.5 };

/* ---------- adaptation ----------
 * Over the next day an astrocyte in dilute plasma exports K⁺ and Cl⁻, then organic osmolytes
 * (taurine, myo-inositol, glutamine), until its contents match the plasma and it is its own size
 * again. Taking them back in takes days, so a fast rise in Na⁺ then shrinks it. */
export const ADAPTED_NA = rxNa(SAFE_RX, RX_HOURS);        // where the safe dose leaves her
export const ADAPTED_OSM = plasmaOsm(ADAPTED_NA);
/** Where a rise of SAFE_24H a day leaves her on day 3, when she stands. */
export const DAY3_NA = Math.min(HEALTHY_NA, ADAPTED_NA + 2 * SAFE_24H);
