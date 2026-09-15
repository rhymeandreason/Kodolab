#!/usr/bin/env node
/* =====================================================================
 *  check.js — run the offline checkers by hand, by area.
 *
 *    node tools/check.js              every area but the slow two
 *    node tools/check.js membrane     one area (several may be named)
 *    node tools/check.js deploy       before a deploy
 *    node tools/check.js --list       the areas and what each runs
 *    node tools/check.js --full ...   check-hb.js re-bakes the unfold (~60 s)
 *
 *  Run an area when a feature in it is done, not on every commit. Prints
 *  one line per checker, and the tail of any that failed.
 *
 *  Not here: tools/check-handedness.js (needs the network and RDKit) and
 *  tools/check-docs.js. Both are run by hand; docs/dev.md says when.
 * ===================================================================== */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const full = process.argv.includes('--full');

const AREAS = {
  deploy: ['tools/check-pages.js', 'tools/seo.js --check', 'ask/check-ask.js'],
  molecules: ['check-molecules.js', 'lobes/check-lobes.js', 'kit/check-kit.js', 'macromolecule/check-macromolecule.js'],
  builder: ['molecule-builder/check-molecule-builder.js'],
  membrane: ['membrane/check-pump.js', 'membrane/check-chemiosmosis.js', 'cell/check-mitochondrion.js'],
  pathways: ['massaction/check-massaction.js', 'energy/check-energy.js', 'reaction/check-reaction.js', 'coupling/check-coupling.js'],
  water: ['tools/check-water.js'],
  dna: ['dna/check-dna.js', 'dna/check-codon.js', 'proteins/check-nucleic-acids.js', 'kit/check-nucleic.js'],
  proteins: ['proteins/check-proteins.js'],
  ribbon: ['kit/check-ribbon.js', 'tools/check-residues.js'],
  hemoglobin: [`hemoglobin/tools/check-hb.js${full ? '' : ' --quick'}`],
  sickle: ['sickle/tools/check-fibre.js'],
  nodegraph: ['tools/bake-graph-vectors.js --gate'],
  /* Slow, and only named: a bare run skips them. docs/dev.md says when. */
  diffusion: ['diffusion/check-diffusion.js'],
  folding: ['folding/tools/check-folding.js'],
};
const SLOW = ['diffusion', 'folding'];

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (process.argv.includes('--list')) {
  for (const [k, v] of Object.entries(AREAS)) console.log(`${k.padEnd(10)} ${v.join(', ')}`);
  process.exit(0);
}
const unknown = args.filter(a => !AREAS[a]);
if (unknown.length) {
  console.error(`unknown area: ${unknown.join(', ')}. Areas: ${Object.keys(AREAS).join(', ')}`);
  process.exit(2);
}

const cmds = [...new Set((args.length ? args : Object.keys(AREAS).filter(a => !SLOW.includes(a))).flatMap(a => AREAS[a]))];
let failed = 0;
for (const cmd of cmds) {
  const [file, ...rest] = cmd.split(' ');
  const t = Date.now();
  const r = spawnSync(process.execPath, [file, ...rest], { cwd: ROOT, encoding: 'utf8' });
  const s = ((Date.now() - t) / 1000).toFixed(1);
  if (r.status === 0) { console.log(`  ok    ${cmd}  (${s}s)`); continue; }
  failed++;
  console.log(`  FAIL  ${cmd}  (${s}s)`);
  const out = ((r.stdout || '') + (r.stderr || '')).trimEnd().split('\n').slice(-25);
  console.log(out.map(l => '        ' + l).join('\n'));
}
console.log(failed ? `\n${failed} of ${cmds.length} failed` : `\nall ${cmds.length} passed`);
process.exit(failed ? 1 : 0);
