#!/usr/bin/env node
/* =====================================================================
 *  check-app.js — kit/app.js's MOLS table against the library
 *
 *  MOLS says which domain file registers each molecule key, so a page's
 *  data-mol loads only those files. A key missing from it is a page whose
 *  data-mol throws; a key filed under the wrong domain is a page that loads
 *  the wrong file and draws nothing. The library is the truth: every spec
 *  records the file that registered it as `domain`.
 *
 *  Run:  node kit/check-app.js           (exits non-zero on a mismatch)
 *        node kit/check-app.js --write   rewrites the block in kit/app.js
 * ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const MolLib = require(path.join(__dirname, '..', 'lib', 'lib-node.js'));

const APP = path.join(__dirname, 'app.js');
const by = {};
for (const [k, s] of Object.entries(MolLib.MOLECULES)) (by['lib/' + s.domain] = by['lib/' + s.domain] || []).push(k);
const files = MolLib.DOMAINS.map(d => 'lib/' + d).filter(f => by[f]);
const pad = Math.max(...files.map(f => f.length)) + 3;
const block = '  const MOLS = {\n'
  + files.map(f => `    ${("'" + f + "':").padEnd(pad)} '${by[f].join(' ')}',`).join('\n')
  + '\n  };';

const src = fs.readFileSync(APP, 'utf8');
const re = /(\/\/ mols:begin\n)[\s\S]*?(\n  \/\/ mols:end)/;
if (!re.test(src)) { console.error('FAIL  kit/app.js has no mols:begin / mols:end block'); process.exit(1); }
const next = src.replace(re, `$1${block}$2`);

if (process.argv.includes('--write')) {
  if (next !== src) fs.writeFileSync(APP, next);
  console.log(next === src ? 'kit/app.js: MOLS already current' : 'kit/app.js: MOLS rewritten');
  process.exit(0);
}

let bad = 0;
const fail = m => { console.error('  FAIL  ' + m); bad++; };
if (next !== src) fail('MOLS in kit/app.js disagrees with the library. Run: node kit/check-app.js --write');

const App = require(APP);
for (const f of Object.keys(App.MOLS))
  if (App.ORDER.indexOf(f) < 0) fail(`${f} is in MOLS but not ORDER, so data-mol cannot place it`);

// data-mol swaps Molecule's every-domain list for the named key's file, and nothing else.
const all = App.plan(['Molecule'], 'steps').scripts;
const one = App.plan(['Molecule'], 'steps', ['atp']).scripts;
const doms = s => s.filter(f => App.MOLS[f]);
if (doms(one).join() !== 'lib/mol-carriers.js') fail(`data-mol="atp" loads ${doms(one).join(', ')}, not lib/mol-carriers.js`);
if (all.filter(f => !App.MOLS[f]).join() !== one.filter(f => !App.MOLS[f]).join())
  fail('data-mol changed a file other than the domain files');
// Another component's own domain file survives: Membrane needs mol-small.js whatever data-mol says.
if (App.plan(['Membrane', 'Molecule'], 'steps', ['atp']).scripts.indexOf('lib/mol-small.js') < 0)
  fail("data-mol dropped mol-small.js, which Membrane lists for itself");
try { App.plan(['Molecule'], 'steps', ['notAMolecule']); fail('data-mol accepted an unknown key'); } catch (e) {}
if (App.molsNamed(`Molecule.mount(el, { molecule: 'pyruvate' }); const w = "water";`).join() !== 'pyruvate,water')
  fail('molsNamed missed a quoted key');

if (bad) { console.error(`\n${bad} failure(s)`); process.exit(1); }
console.log(`PASS: MOLS files ${Object.keys(MolLib.MOLECULES).length} keys across ${files.length} domain files, and data-mol loads only what it names`);
