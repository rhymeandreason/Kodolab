#!/usr/bin/env node
/* =============================================================================
 *  proteins/check-nucleic-acids.js — the nucleic index against the bakes
 * =============================================================================
 *    node proteins/check-nucleic-acids.js
 *
 *  `check-proteins.js` for `nucleic-acids.js`, and it exists for the same
 *  reason: the index is a CONVENIENCE COPY, and the moment one of its numbers
 *  is a thing the bake cannot produce it has become a second source — and the
 *  second source is the one that goes stale. So every `read` field is
 *  re-derived here from the baked file and compared.
 *
 *  IT ALSO CATCHES THE ORPHAN, WHICH IS WHY IT WAS WRITTEN. `check-proteins.js`
 *  walks `PROTEINS` and only ever looks inside a registered folder, so before
 *  this file existed `proteins/dna/`, `proteins/trna/` and `proteins/zif268/`
 *  each held a bake that no index named and no checker read. Nothing was
 *  failing; nothing was looking.
 *
 *  Two files can drift where one cannot, which is the cost of the split — so
 *  this asserts the same four things its sibling does:
 *
 *    · every variant has a bake, and every bake has a variant
 *    · the method, chain count and residue/nucleotide counts agree
 *    · the pair, wobble and modified counts agree
 *    · a `kind` is one of the three, and matches what the bake contains
 *
 *  Offline, no dependencies. Run by `tools/check.js dna`.
 * ============================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const lib = require(path.join(HERE, 'nucleic-acids.js'));
/* THE SHAPE RULES ARE proteins/tools/registry-io.js's, and shared on purpose:
   the two registries hold different facts but agree about what an entry and a
   variant have to carry, and a second copy of that list is how the two drift. */
const IO = require(path.join(HERE, 'tools', 'registry-io.js'));

let bad = 0;
const say = m => { console.log('  FAIL ' + m); bad++; };
const ok = m => console.log('  ok    ' + m);

/* The rules the two registries share, run here because a registry is also
   edited by hand. */
for (const m of IO.common(lib.STRUCTURES, 'structure')) say(m);

for (const s of lib.STRUCTURES) {
  const dir = path.join(HERE, '..', s.dir);
  if (!fs.existsSync(dir)) { say(`${s.key}: dir ${s.dir} does not exist`); continue; }

  if (!lib.KINDS.includes(s.kind)) say(`${s.key}: kind '${s.kind}' is not one of ${lib.KINDS.join('/')}`);

  const data = path.join(dir, 'data');
  const onDisk = fs.existsSync(data)
    ? fs.readdirSync(data).filter(f => f.endsWith('.json')) : [];
  const claimed = new Set();

  for (const v of s.variants) {
    const at = `${s.key}/${v.id}`;
    const r = v.read || {};
    if (!r.baked) { say(`${at}: no baked file recorded — has the baker been run?`); continue; }
    claimed.add(r.baked);

    const file = path.join(data, r.baked);
    if (!fs.existsSync(file)) { say(`${at}: ${r.baked} is not on disk`); continue; }

    let t;
    try { t = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { say(`${at}: ${r.baked} is not readable JSON — ${e.message}`); continue; }

    /* THE BAKE'S OWN ANSWERS, re-derived rather than trusted. `kind` on a
       chain is what separates the two polymers; absent means 'aa', which is
       what every bake written before 2026-08-31 carries. */
    const na = t.order.filter(id => t.chains[id].kind === 'na');
    const aa = t.order.filter(id => (t.chains[id].kind || 'aa') === 'aa');
    const got = {
      method: t.method,
      chains: t.order.length,
      nucleotides: na.reduce((k, id) => k + t.chains[id].nums.length, 0),
      residues: aa.reduce((k, id) => k + t.chains[id].nums.length, 0),
      pairs: (t.pairs || []).length,
      wobble: (t.pairs || []).filter(p => p.kind === 'wobble').length,
      modified: na.reduce((k, id) => k + (t.chains[id].mods || []).length, 0),
    };

    for (const f of Object.keys(got)) {
      if (r[f] === undefined) { say(`${at}: index has no \`${f}\``); continue; }
      if (r[f] !== got[f])
        say(`${at}: \`${f}\` says ${JSON.stringify(r[f])}, the bake says ${JSON.stringify(got[f])}`);
    }

    /* THE `kind` HAS TO MATCH WHAT IS ACTUALLY IN THE FILE. A 'complex' with
       no protein chain, or a 'dna' that turns out to carry one, is an index
       describing a structure the bake does not hold. */
    const want = aa.length ? 'complex' : null;
    if (want && s.kind !== want)
      say(`${at}: kind '${s.kind}' but the bake has ${aa.length} protein chain(s)`);
    if (!aa.length && s.kind === 'complex')
      say(`${at}: kind 'complex' but the bake has no protein chain`);
    if (!na.length)
      say(`${at}: no nucleic chain in the bake — does this belong in proteins.js?`);

    /* A CHOSEN ROTATION IS NEVER BAKED, which is the rule that keeps re-aiming
       a structure an edit and a reload instead of a re-bake, and keeps one
       decision in one place. Where this index holds a human's basis the bake
       must carry none: two answers with nothing holding them level is how a
       bench and a gallery card come to face one molecule two ways. A frame
       nobody has aimed has no entry here, and then its bake's own solved basis
       is exactly what should stand. */
    const chosen = lib.viewOf(s, v);
    if (chosen && t.view)
      say(`${at}: the index holds a chosen basis and the bake carries a view `
        + `too — re-run the baker, which writes none while a chosen one exists`);
    if (!chosen && !t.view && t.frame !== 'deposited')
      say(`${at}: no basis anywhere and \`frame\` says '${t.frame}'`);

    if (!bad) ok(`${at}: ${got.chains} chains, ${got.nucleotides} nt`
      + (got.residues ? ` + ${got.residues} residues` : '')
      + `, ${got.pairs} pairs`
      + (got.wobble ? ` (${got.wobble} wobble)` : '')
      + (got.modified ? `, ${got.modified} modified` : ''));
  }

  /* A BAKE NO VARIANT CLAIMS is either a stale file from a renamed view — one
     a bench will happily keep loading — or a view someone forgot to describe. */
  for (const f of onDisk)
    if (!claimed.has(f)) say(`${s.key}: ${f} is on disk but no variant claims it`);
}

console.log('\n' + (bad
  ? `FAIL: ${bad} problem(s)`
  : `PASS: ${lib.STRUCTURES.length} structures, `
    + `${lib.STRUCTURES.reduce((k, s) => k + s.variants.length, 0)} variants — `
    + 'every entry has a key, a default and a purpose, species and source per '
    + 'variant; every variant has its bake and every bake a variant; methods, '
    + 'chain, nucleotide, residue, pair, wobble and modified counts all agree '
    + 'with what was baked') + '\n');
process.exit(bad ? 1 : 0);
