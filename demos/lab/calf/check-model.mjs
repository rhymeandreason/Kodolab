/* The claims the calf lab makes, checked against model.js. Run: node lab/calf/check-model.mjs */
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./model.js', import.meta.url), 'utf8');
const M = await import('data:text/javascript,' + encodeURIComponent(src));
let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.error('FAIL', msg); } };
const T = Object.fromEntries(M.TUBES.map((t) => [t.key, t]));

ok(Math.abs(M.CELL_OSM - 289) < 5, `healthy plasma ~289 mOsm, got ${M.CELL_OSM.toFixed(1)}`);
ok(Math.abs(T.iso.osm - M.CELL_OSM) < 8, '0.9% saline is isotonic to healthy plasma');
ok(Math.abs(T.iso.volume - 1) < 0.03, '0.9%: cells keep their volume');
ok(T.plasma.volume > 1.05 && T.plasma.lysed < 0.05, `Juniper's plasma: cells swell but stay intact (V ${T.plasma.volume.toFixed(2)}, lysed ${T.plasma.lysed.toFixed(3)})`);
ok(T.hyper.volume < 0.8 && T.hyper.lysed < 0.01, '3%: cells shrink, none burst');
ok(T.water.lysed === 1, 'water: every cell bursts');
// lysis begins near 0.45% NaCl for human red cells
const at = (p) => M.lysed(M.cellVolume(M.salineOsm(p)));
ok(at(0.55) < 0.1 && at(0.4) > 0.5, `lysis threshold near 0.45% (0.55%→${at(0.55).toFixed(2)}, 0.4%→${at(0.4).toFixed(2)})`);
ok(M.astroVolume(M.HEALTHY_NA) === 1, 'astrocyte at healthy Na⁺ is its own size');
ok(M.astroVolume(M.JUNIPER.na) > 1.1, 'astrocyte at Juniper Na⁺ swells more than 10%');
ok(M.JUNIPER.na < M.REF.na[0] && M.JUNIPER.cl < M.REF.cl[0], 'Na⁺ and Cl⁻ low');
for (const k of ['k', 'glucose', 'bun', 'pcv']) ok(M.JUNIPER[k] >= M.REF[k][0] && M.JUNIPER[k] <= M.REF[k][1], `${k} in range`);
console.log(bad ? `${bad} failed` : 'calf model: all claims hold');
for (const t of M.TUBES) console.log(t.key.padEnd(7), t.osm.toFixed(0).padStart(4), 'mOsm  V', t.volume.toFixed(2), ' lysed', t.lysed.toFixed(3));
console.log('astro at 110:', M.astroVolume(110).toFixed(3));
process.exit(bad ? 1 : 0);
