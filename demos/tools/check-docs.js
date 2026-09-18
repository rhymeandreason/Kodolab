#!/usr/bin/env node
/* =====================================================================
 *  check-docs.js — audit for the claims CLAUDE.md and SCIENCE.md make
 *
 *  Run:  node tools/check-docs.js         (exits non-zero on failure)
 *
 *  Why this exists: the same reason check-molecules.js does. This project's
 *  rule is that a claim ships with its assertion rather than relying on
 *  someone noticing (MolecularGeometry.md §1.4, rule 2) — and the docs make claims
 *  too. Every doc error found in the audit of 2026-07-29 was an ENUMERATION
 *  that grew a member and wasn't updated: `stereo:` grew {axial}/{faces}
 *  while two files still said it understood only all-equatorial, §13 was
 *  written and the index stopped at §12. Prose can't be checked, but an
 *  enumeration can.
 *
 *  One of those is mechanically verifiable, so it is checked here: every
 *  §n / §n.m reference resolves to a real heading, and every top-level
 *  SCIENCE.md section appears in CLAUDE.md's index.
 *
 *  What it deliberately does NOT check: whether the prose is TRUE. Nothing
 *  here would have caught the stale `stereo:` vocabulary — that one needs a
 *  human. The point is to spend the check on the errors that recur.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CLAUDE = rd('CLAUDE.md');
const SCIENCE = rd('docs/SCIENCE.md');

let fails = 0;
const fail = (what, msg) => { fails++; console.log(`  FAIL  ${what}: ${msg}`); };
const ok = msg => console.log(`  ok    ${msg}`);

/* ---- SECTIONS --------------------------------------------------- */
// Section rules used to live only in SCIENCE.md. Now MolecularGeometry.md
// (§1.x) and WaterSim.md (§1–4) carry their own numbered headings too, so a
// bare §N could mean any of three files. Heuristic: whichever *.md is named
// most recently on the SAME LINE governs every §-ref on that line; a line
// with no filename mention defaults to SCIENCE.md, since that's still the
// rulebook everything else was split out of.
console.log('\n== section references resolve');

function headings(src) {
  const tops = new Set(), subs = new Set();
  for (const m of src.matchAll(/^## (\d+)\./gm)) tops.add(m[1]);
  for (const m of src.matchAll(/^### (\d+\.\d+)/gm)) subs.add(m[1]);
  return { tops, subs };
}

const SECTIONED = {
  'SCIENCE.md': headings(SCIENCE),
  'MolecularGeometry.md': headings(rd('docs/MolecularGeometry.md')),
  'WaterSim.md': headings(rd('docs/WaterSim.md')),
};
const { tops, subs } = SECTIONED['SCIENCE.md']; // only SCIENCE.md's index is audited below

for (const [doc, src] of [['CLAUDE.md', CLAUDE], ['SCIENCE.md', SCIENCE]]) {
  for (const line of src.split('\n')) {
    const namedFile = [...line.matchAll(/([A-Za-z][\w-]*\.md)/g)].pop();
    const file = namedFile && SECTIONED[namedFile[1]] ? namedFile[1] : 'SCIENCE.md';
    const { tops: fTops, subs: fSubs } = SECTIONED[file];
    for (const m of line.matchAll(/§+\s?(\d+(?:\.\d+)?)/g)) {
      const ref = m[1];
      const known = ref.includes('.') ? fSubs.has(ref) : fTops.has(ref);
      if (!known) fail('sections', `${doc} references §${ref}, which is not a heading in ${file}`);
    }
  }
}

// The index bug: §13 existed and CLAUDE.md's index stopped at §12. The index
// covers sections both singly (§9) and by range (§§2–8), so expand ranges
// before asking whether a section is accounted for.
const idx = CLAUDE.slice(CLAUDE.indexOf('## Scientific accuracy'),
                         CLAUDE.indexOf('## Run / test locally'));
const covered = new Set();
for (const m of idx.matchAll(/§+\s?(\d+)\s*[-–—]\s*(\d+)/g)) {
  for (let i = +m[1]; i <= +m[2]; i++) covered.add(String(i));
}
for (const m of idx.matchAll(/§+\s?(\d+)(?!\s*[-–—]\s*\d)(?!\.\d)/g)) covered.add(m[1]);

for (const t of [...tops].sort((a, b) => a - b)) {
  if (!covered.has(t)) {
    fail('sections', `SCIENCE.md has §${t} but CLAUDE.md's index never mentions it`);
  }
}
if (tops.size) ok(`${tops.size} sections, ${subs.size} subsections, all references resolve`);

/* ---- summary ------------------------------------------------------- */
console.log('');
if (fails) {
  console.log(`FAIL: ${fails} doc claim(s) no longer true`);
  process.exit(1);
}
console.log('PASS: section references and index all match reality');
