#!/usr/bin/env node
/* =====================================================================
 *  check.js — run the offline checkers by hand.
 *
 *    node tools/check.js membrane/pump.js   the checkers that read that file
 *    node tools/check.js molecules          everything that loads the specs
 *    node tools/check.js deploy             before a deploy
 *    node tools/check.js                    all but the slow ones
 *    node tools/check.js --list             every checker
 *    node tools/check.js --which <file>     what a file would run, without running it
 *    node tools/check.js --full ...         check-hb.js re-bakes the unfold (~60 s)
 *
 *  A file matches a checker whose source names the file's basename. A file
 *  reached only through another module (lib/lib-node.js loading a
 *  lib/mol-*.js) is not named anywhere, so anything under lib/ also runs
 *  `molecules`. Name the checker's own path when in doubt.
 *
 *  Not here: tools/check-handedness.js (needs the network and RDKit) and
 *  tools/check-docs.js. docs/dev.md says when.
 * ===================================================================== */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const full = process.argv.includes('--full');

const CHECKERS = [
  'tools/check-pages.js', 'tools/seo.js --check', 'ask/check-ask.js',
  'check-molecules.js', 'kit/check-kit.js', 'lobes/check-lobes.js', 'macromolecule/check-macromolecule.js',
  'molecule-builder/check-molecule-builder.js', 'dna/check-dna.js', 'massaction/check-massaction.js',
  'membrane/check-pump.js', 'membrane/check-chemiosmosis.js', 'cell/check-mitochondrion.js',
  'reaction/check-reaction.js', 'energy/check-energy.js', 'coupling/check-coupling.js',
  'tools/check-water.js', 'dna/check-codon.js', 'proteins/check-nucleic-acids.js', 'kit/check-nucleic.js',
  'proteins/check-proteins.js', 'kit/check-ribbon.js', 'tools/check-residues.js', 'sickle/tools/check-fibre.js',
  `hemoglobin/tools/check-hb.js${full ? '' : ' --quick'}`, 'tools/bake-graph-vectors.js --gate',
  'diffusion/check-diffusion.js', 'folding/tools/check-folding.js',
];
/* ~65 s and ~45 s. A bare run skips them; a file or their own path still runs them. */
const SLOW = ['diffusion/check-diffusion.js', 'folding/tools/check-folding.js'];

/* Files a checker names but is not worth running for. check-folding reads only
   ribbon.js's parseBackbone and dssp; check-nucleic names ribbon.js in prose. */
const IGNORE = {
  'folding/tools/check-folding.js': ['ribbon.js'],
  'kit/check-nucleic.js': ['ribbon.js'],
};

const file = c => c.split(' ')[0];
const src = c => fs.readFileSync(path.join(ROOT, file(c)), 'utf8');

const GROUPS = {
  deploy: ['tools/check-pages.js', 'tools/seo.js --check', 'ask/check-ask.js'],
};
/* Each loads every molecule spec through lib/lib-node.js; deploy's and the slow ones are left to be asked for. */
GROUPS.molecules = CHECKERS.filter(c => src(c).includes('lib-node.js') && !SLOW.includes(c) && !GROUPS.deploy.includes(c));

if (process.argv.includes('--list')) {
  for (const [k, v] of Object.entries(GROUPS)) console.log(`${k}: ${v.join(', ')}\n`);
  console.log(CHECKERS.map(c => SLOW.includes(c) ? `${c}  (slow)` : c).join('\n'));
  process.exit(0);
}

function resolve(arg) {
  if (GROUPS[arg]) return GROUPS[arg];
  const rel = path.relative(ROOT, path.resolve(arg)).replace(/\\/g, '/');
  const own = CHECKERS.filter(c => file(c) === rel);
  if (own.length) return own;
  const base = path.basename(rel);
  const hits = CHECKERS.filter(c => src(c).includes(base) && !(IGNORE[file(c)] || []).includes(base));
  if (rel.startsWith('lib/')) hits.push(...GROUPS.molecules);
  return hits;
}

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
let cmds = [];
for (const a of args) {
  const r = resolve(a);
  if (!r.length) { console.error(`no checker reads ${a}. --list names them all.`); process.exit(2); }
  cmds.push(...r);
}
if (!args.length) cmds = CHECKERS.filter(c => !SLOW.includes(c));
cmds = [...new Set(cmds)];

if (process.argv.includes('--which')) { console.log(cmds.join('\n')); process.exit(0); }

let failed = 0;
for (const cmd of cmds) {
  const [f, ...rest] = cmd.split(' ');
  const t = Date.now();
  const r = spawnSync(process.execPath, [f, ...rest], { cwd: ROOT, encoding: 'utf8' });
  const s = ((Date.now() - t) / 1000).toFixed(1);
  if (r.status === 0) { console.log(`  ok    ${cmd}  (${s}s)`); continue; }
  failed++;
  console.log(`  FAIL  ${cmd}  (${s}s)`);
  const out = ((r.stdout || '') + (r.stderr || '')).trimEnd().split('\n').slice(-25);
  console.log(out.map(l => '        ' + l).join('\n'));
}
console.log(failed ? `\n${failed} of ${cmds.length} failed` : `\nall ${cmds.length} passed`);
process.exit(failed ? 1 : 0);
