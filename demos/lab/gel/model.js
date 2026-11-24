/* What runs where: the samples' fragment sizes, how far a piece of a given size travels, and the
 * lane each sample paints on the gel. The bench, the gel image and the gel level all read it.
 *
 * The digests are a teaching set, not real loci: the crime scene and suspect 2 share every
 * band, and each other suspect shares some, so matching takes a careful look. */
import { clamp, smooth } from '../lab.js';

export const VOLTS = 100;
export const RUN_MIN = 35;
export const LOAD_UL = 10;

/** cm a piece of `bp` base pairs travels from the well over a full run (1% agarose, 1× TAE,
 *  ~100 V on a 10 cm mini gel, stopped when bromophenol blue has run 7 cm). An empirical fit,
 *  quadratic in log size, to a typical 1 kb ladder: close to linear in log(size) from 0.5 to
 *  5 kb, flatter above, where long molecules reptate end-first and size matters less. */
export function travel(bp) {
  const u = Math.log10(bp) - 3;
  return 4.6 - 4.34 * u + 1.04 * u * u;
}

/** The two tracking dyes in the loading dye, by the DNA size each runs with on 1% agarose. */
export const DYES = [
  { key: 'bpb', bp: 300, color: '#3730a3' },   // bromophenol blue: dark blue, the leading front
  { key: 'xc', bp: 4000, color: '#0e7490' },   // xylene cyanol: blue-green
];

export const LADDER = [8000, 5000, 3000, 2000, 1500, 1000, 500];
export const SAMPLES = [
  { key: 'ladder', bands: LADDER, cap: '#475569' },
  { key: 'cs', bands: [4400, 2600, 1200, 700], cap: '#dc2626' },
  { key: 's1', bands: [4400, 3200, 1700, 700], cap: '#2563eb' },
  { key: 's2', bands: [4400, 2600, 1200, 700], cap: '#7c3aed' },
  { key: 's3', bands: [6000, 2600, 1200, 900], cap: '#0d9488' },
];
export const MATCH = 's2';
export const SUSPECTS = SAMPLES.filter((s) => s.key[0] === 's');

/** A band's brightness: an equimolar digest has the same number of each piece, so a longer
 *  piece carries more DNA, and more stain. */
export const brightness = (bp) => clamp(0.32 + 0.68 * Math.pow(bp / 6000, 0.6));

/** The lane `sample` paints with `loaded` (0..1 in the well) after `run` (0..1) of the run,
 *  under `stain` (0..1 of the blue light). */
export function laneState(sample, loaded, run, stain) {
  if (!sample || loaded <= 0) return null;
  const go = smooth(clamp(run * 14));               // the dye leaves the well in the first minutes
  const dimmed = 1 - 0.7 * stain;
  return {
    loaded: loaded * (1 - go),
    dyes: DYES.map((d) => ({ d: travel(d.bp) * run, color: d.color, a: 0.8 * go * loaded * dimmed, h: 0.22 + 0.12 * run })),
    bands: sample.bands.map((bp) => {
      const d = travel(bp) * run;
      return { d, a: brightness(bp) * loaded, w: 0.09 + 0.02 * d };
    }),
  };
}
