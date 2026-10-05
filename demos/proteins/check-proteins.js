#!/usr/bin/env node
/* =====================================================================
 *  check-proteins.js — the claims proteins/proteins.js makes, against
 *  the files it describes.
 *
 *    node proteins/check-proteins.js      (offline, no dependencies)
 *
 *  The registry is written by two authors — a human types the purposes,
 *  the species and the reasons, a baker writes the `read` blocks — and the
 *  failures
 *  worth catching are the ones where those two drift apart, or where the
 *  file describes something that is no longer on disk. Every assertion
 *  below is a bug that ships looking fine.
 *
 *  It does NOT check the science. Whether 1ABS really has its CO
 *  photolysed is the depositors' claim and the bench's subject; what this
 *  can check is that the variant the registry calls 1ABS is the file the
 *  bench draws, that it was baked from the entry the registry names, and
 *  that nobody typed a number the deposition disagrees with.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const IO = require('./tools/registry-io.js');
const Bake = require('./bake-lib.js');
const { chainsDeclared } = Bake;

/* SEQRES for chain A — the only reader here that bake-lib does not already
   export, because a trace bake keeps the number and a reduced PDB keeps the
   records. */
const declaredOf = text => {
  const l = text.split('\n').find(x => x.startsWith('SEQRES') && x[11] === 'A');
  return l ? parseInt(l.slice(13, 17), 10) : null;
};

const HERE = __dirname;
const bad = [];

/* ---- what git ignores --------------------------------------------------
 *
 *  A GITIGNORED FILE IS ALLOWED TO BE THERE OR NOT, and check 8 below needs
 *  to know which files those are. The raw depositions a baker reads are many
 *  times the size of what they bake down to, so they are gitignored: a fresh
 *  clone has none of them and a working checkout has whichever ones somebody
 *  curled back. Both are correct states, and a check that insists on one of
 *  them fails somewhere no matter which it picks — which is exactly what
 *  happened to prion, where `keeps` listing its two raw files failed every
 *  clone, and `keeps` not listing them failed every checkout that had them.
 *
 *  GIT IS ASKED RATHER THAN .gitignore RE-IMPLEMENTED. The pattern language
 *  has negations, directory rules and precedence, and a second half-copy of
 *  it here would disagree with the real one on the day it mattered.
 *  `check-ignore` also answers for paths that do not exist, which the missing
 *  half of this question needs.
 *
 *  NO GIT, NO EXEMPTION. If the call fails for any reason other than "none of
 *  these matched", every path is treated as tracked and the checks stay as
 *  strict as they were — a checker that quietly stopped checking because a
 *  subprocess failed would be worse than one that is occasionally noisy.
 */
function gitIgnores(paths) {
  if (!paths.length) return new Set();
  try {
    const out = execFileSync('git', ['check-ignore', '--stdin'],
      { cwd: HERE, input: paths.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return new Set(out.split('\n').filter(Boolean));
  } catch (e) {
    /* Exit 1 is `check-ignore` saying none of them matched, which is an
       answer. Anything else — no git, not a repo — is not. */
    return new Set();
  }
}
const say = m => bad.push(m);

const { lib } = IO.read();

/* 1. The rules the file's own header states — same pass a save makes, run
      again here because a registry can also be edited by hand. */
for (const m of IO.validate(lib)) say(m);

/* ENTRIES THAT SHARE A FOLDER POOL WHAT THEY CLAIM. The photosystems are the
   case: three proteins one baker writes, plus a lineup that is all three's.
   Check 8 asks each folder once, of every claim and `keeps` made in it, or
   each entry would call the others' bakes stale. */
const pooled = new Map();
for (const p of lib.PROTEINS) {
  if (!pooled.has(p.dir)) pooled.set(p.dir, { claimed: new Set(), keeps: new Set(), last: null });
  pooled.get(p.dir).last = p.key;
  for (const f of p.keeps || []) pooled.get(p.dir).keeps.add(f);
}

for (const p of lib.PROTEINS) {
  const dir = path.join(HERE, '..', p.dir);
  if (!fs.existsSync(dir)) { say(`${p.key}: dir ${p.dir} does not exist`); continue; }

  const data = path.join(dir, 'data');
  const onDisk = fs.existsSync(data) ? fs.readdirSync(data) : [];
  const claimed = new Set();

  for (const v of p.variants) {
    const at = `${p.key}/${v.id}`;
    const r = v.read || {};

    /* 2. EVERY VARIANT HAS A BAKE, AND EVERY BAKE HAS A VARIANT. A variant
          with no file is a button that draws nothing; a file no variant
          claims is either a stale bake from a renamed view — which a bench
          will happily keep loading — or a view someone forgot to describe. */
    if (!r.baked) { say(`${at}: no baked file recorded — has the baker been run?`); continue; }
    claimed.add(r.baked);
    const file = path.join(data, r.baked);
    if (!fs.existsSync(file)) { say(`${at}: ${r.baked} is not in ${p.dir}/data`); continue; }

    /* 4. EVERY `read` FIELD IS RE-DERIVABLE FROM THE BAKE, and agrees with it.
          That is the invariant the registry rests on: `read` is a few
          convenience lines printed into an index, never a fact the bake cannot
          produce. If it ever holds something the file does not, the file stops
          being the source and the index becomes a second one — and the second
          source is the one that goes stale.

          A `pipeline:'pdb'` bake answers in its own records, which is why the
          prion baker carries EXPDTA, REMARK 2 and the COMPND chain list into
          every reduced file it writes. */
    /* A protein whose files another pipeline writes is verified against the
       DEPOSITION it names, not against a bake this registry did not shape.
       Amylase is the case: `amylase/tools/` writes its site measurements and
       its trace together, in a format with no `meta` block to cross-check and
       no reason to grow one. The invariant survives — every read field is
       still answerable by a committed file — it is just a different file. */
    if (p.pipeline === 'own') {
      /* Every bake the entry names, by role, has to be on disk. This is the
         only place that notices when another pipeline renames or drops one —
         the registry would otherwise keep pointing at a surface nothing
         writes any more, and the page that asks for it fails at the click. */
      for (const [role, file] of Object.entries(v.bake || {}))
        if (!fs.existsSync(path.join(data, file)))
          say(`${at}: ${role} bake ${file} is not in ${p.dir}/data`);
      if (v.bake && r.baked && !Object.values(v.bake).includes(r.baked))
        say(`${at}: read.baked ${r.baked} is not one of its bakes — re-run read-own.js`);

      const src = v.source && v.source.path;
      if (!src) { say(`${at}: pipeline 'own' needs source.path`); continue; }
      const full = path.join(HERE, '..', src);
      if (!fs.existsSync(full)) { say(`${at}: ${src} is not there`); continue; }
      const text = fs.readFileSync(full, 'utf8');
      const only = v.chains ? new Set(v.chains.split(',')) : null;
      const chains = Bake.caTrace(text, only);
      const decl = Bake.declared(text);
      let residues = 0;
      for (const res of chains.values()) residues += res.length;
      const declared = [...chains.keys()].every(c => decl[c] != null)
        ? [...chains.keys()].reduce((k, c) => k + decl[c], 0) : null;
      const from = { method: Bake.method(text), chainsInFile: Bake.chainCount(text),
                     residues, declared, ec: Bake.ecNumbers(text)[0] || null };
      for (const k of Object.keys(from))
        if (from[k] !== (r[k] === undefined ? null : r[k]))
          say(`${at}: registry says ${k} ${JSON.stringify(r[k] ?? null)}, ` +
              `${src} says ${JSON.stringify(from[k])} — re-run read-own.js`);
      continue;
    }

    if (p.pipeline === 'pdb') {
      const text = fs.readFileSync(file, 'utf8');
      const from = {
        method: (text.split('\n').find(l => l.startsWith('EXPDTA')) || '')
          .slice(10).trim().toLowerCase() || null,
        chainsInFile: chainsDeclared(text),
        ec: Bake.ecNumbers(text)[0] || null,
        residues: text.split('\n')
          .filter(l => l.startsWith('ATOM') && l.slice(12, 16).trim() === 'CA').length,
        declared: declaredOf(text),
      };
      for (const k of Object.keys(from))
        if (r[k] != null && from[k] !== r[k])
          say(`${at}: registry says ${k} ${JSON.stringify(r[k])}, ` +
              `${r.baked} says ${JSON.stringify(from[k])}`);
    }

    if (p.pipeline !== 'pdb') {
      let t;
      try { t = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (e) { say(`${at}: ${r.baked} is not JSON — ${e.message}`); continue; }

      /* The same invariant for a trace bake, whose meta is where those four
         were counted. */
      const meta = t.meta || {};
      /* Missing is a failure, not a skip: a registry field the bake cannot
         produce is the invariant breaking quietly, which is the one way this
         check could be passed by a file that no longer supports it. */
      for (const k of ['method', 'chainsInFile', 'counts'])
        if (meta[k] == null) say(`${at}: ${r.baked} has no meta.${k} to check the registry against`);
      if (r.method != null && meta.method && meta.method !== r.method)
        say(`${at}: registry says method ${r.method}, bake says ${meta.method}`);
      if (r.chainsInFile != null && meta.chainsInFile != null &&
          meta.chainsInFile !== r.chainsInFile)
        say(`${at}: registry says ${r.chainsInFile} chains in file, bake says ${meta.chainsInFile}`);
      /* The EC is answerable by the bake only where the baker carried it, so
         it is checked against the registry's own agreement instead: every
         variant that has one has the same one, which registry-io asserts. What
         this catches is a bake whose meta says a different reaction. */
      if (meta.ec !== undefined && r.ec != null && meta.ec !== r.ec)
        say(`${at}: registry says EC ${r.ec}, bake says ${meta.ec}`);

      if (r.declared != null && Array.isArray(meta.counts)) {
        const declared = meta.counts.every(c => c.declared !== null)
          ? meta.counts.reduce((k, c) => k + c.declared, 0) : null;
        if (declared !== null && declared !== r.declared)
          say(`${at}: registry says ${r.declared} declared, bake says ${declared}`);
      }

      const entry = (v.source && v.source.id) || v.id;
      if (t.meta && t.meta.entry && t.meta.entry !== entry)
        say(`${at}: baked from ${t.meta.entry}, registry says ${entry}`);

      const drawn = (t.order || []).length;
      if (v.chains && drawn !== v.chains.split(',').length)
        say(`${at}: registry asks for chains ${v.chains}, bake holds ${drawn}`);

      const residues = (t.order || []).reduce((k, id) => k + t.chains[id].nums.length, 0);
      if (r.residues != null && residues !== r.residues)
        say(`${at}: bake holds ${residues} residues, registry says ${r.residues}`);

      /* 5. SECONDARY STRUCTURE READ, NOT DETECTED — and a file that had no
            records to read bakes as all coil. That is honest and it is also
            a worm on screen, so it must never pass silently.

            UNLESS THE PROTEIN SAYS SO FIRST. Collagen is the case the escape
            exists for: the polyproline II helix is neither of the two things a
            HELIX or SHEET record describes, so no collagen file carries one
            and all-coil is the correct read rather than a failed one. A
            protein claims that once, in `ss.deposited:false`, with a reason —
            which turns a silent worm into a stated fact and still fails any
            variant of a protein that did NOT claim it. */
      const noSS = p.ss && p.ss.deposited === false;
      if (t.ssFrom !== 'deposited' && !noSS)
        say(`${at}: ss is '${t.ssFrom}' — the bench draws a coil worm, not a fold`);
      if (t.ssFrom === 'deposited' && noSS && !p.ss.some)
        say(`${at}: ss is deposited, but ${p.key} claims its files carry none`);

      /* 6. A CHOSEN BASIS IS NOT IN THE BAKE, and that is the invariant now
            rather than the old one about the two agreeing. The registry holds
            it and kit/proteinbox.js reads it at draw time; a bake carrying a
            copy would be a second source that a re-bake or an edit could put
            out of step, with nothing on screen saying which one won.

            A SHARED basis is still only legal across variants that are
            superposed — registry-io.js's validate holds that, since it is a
            fact about the registry and needs no file to check. */
      /* ASKED PER VARIANT, because a protein at two scales keys its chosen
         bases by frame and may have aimed one frame and not the other. A view
         the registry has chosen must not also be baked; a frame nobody has
         chosen for keeps its solved basis, and that bake carrying one is the
         arrangement working rather than a fault. */
      if (lib.viewOf(p, v) && t.view)
        say(`${at}: ${p.key} chooses this frame's rotation in the registry, but ` +
            `the bake carries one too — re-run the baker`);

      /* 7. Every fitted variant names the reference, and the reference itself
            is fitted onto nothing. Read off the BAKE's meta, which is where a
            residual belongs — the registry indexes the collection and does not
            carry a number about one structure's relation to another. */
      /* `among` SCOPES A FIT TO THE VARIANTS THAT ARE STATES OF ONE THING.
         Rubisco is the case: two views of one site are superposed, and the
         sixteen-chain particle beside them is a SCALE of the same file with
         nothing to be a state of — fitting it onto one of its own chains would
         centre a 123 A ball on a corner of itself. A variant outside the scope
         is then held to carrying NO fit, which is the half that keeps this
         from being an escape hatch: it says the fit does not reach that view,
         never that the view may quietly wear a different one. */
      if (p.fit && t.meta) {
        const inFit = !p.fit.among || p.fit.among.includes(v.id);
        const isRef = v.id === p.fit.on;
        if (!inFit && t.meta.fitOn)
          say(`${at}: outside fit.among, but baked as fitted onto ${t.meta.fitOn}`);
        if (inFit && isRef && t.meta.fitOn)
          say(`${at}: the reference, but baked as fitted onto ${t.meta.fitOn}`);
        if (inFit && !isRef && t.meta.fitOn !== p.fit.on)
          say(`${at}: baked fitted onto ${t.meta.fitOn || 'nothing'}, registry says ${p.fit.on}`);
      }
    }
  }

  /* 8. Bakes nothing claims — skipped for a folder this registry does not
        write. `keeps` would have to list another pipeline's every artefact,
        and the day it added one the failure would land here rather than
        where it belongs. `keeps` is the protein's own list of files that
        are deliberately in data/ without being variants — committed sources,
        intermediates a baker slices views out of, a bake measured once and
        not shown. Anything outside both lists is a stale file, and a stale
        bake from a renamed view is one a bench goes on loading. */
  const pool = pooled.get(p.dir);
  for (const f of claimed) pool.claimed.add(f);
  if (pool.last !== p.key) continue;
  const keeps = pool.keeps;

  /* Every file this check is about to have an opinion on, asked of git in one
     call: the ones on disk that nothing claims, and the ones `keeps` names
     that are not there. */
  const unclaimed = p.pipeline === 'own' ? [] : onDisk.filter(f =>
    f !== 'src' && !fs.statSync(path.join(data, f)).isDirectory() &&
    !pool.claimed.has(f) && !keeps.has(f));
  const missing = [...keeps].filter(f => !onDisk.includes(f));
  const rel = f => path.relative(HERE, path.join(data, f));
  const ignored = gitIgnores([...unclaimed, ...missing].map(rel));

  for (const f of unclaimed)
    if (!ignored.has(rel(f)))
      say(`${p.key}: ${f} is in data/ and neither a variant nor in keeps`);
  for (const f of missing)
    if (!ignored.has(rel(f)))
      say(`${p.key}: keeps lists ${f}, which is not there`);

  /* 9. THE BAKER CAN BE RE-RUN. Raw depositions are gitignored — they are
        many times the size of what they bake down to — so the curl that
        fetches them back has to be in the baker's header, or a checkout
        holds bakes nobody can reproduce. */
  /* A protein on its own pipeline has no prep.js of ours to check; its
     sources are committed beside its bakes, which is what `source.path`
     already asserted above. */
  if (p.pipeline === 'own') continue;

  const prep = path.join(dir, 'tools', 'prep.js');
  if (!fs.existsSync(prep)) say(`${p.key}: no tools/prep.js`);
  else {
    const src = fs.readFileSync(prep, 'utf8');
    /* The word does not matter; the ADDRESS does. A checkout has to be able
       to fetch back whatever the repo does not commit. */
    const remote = p.variants.some(v => (v.source || {}).kind === 'rcsb');
    if (remote && !/files\.rcsb\.org|alphafold\.ebi\.ac\.uk/.test(src))
      say(`${p.key}: prep.js never names where its sources come from`);
  }
}

const n = lib.PROTEINS.reduce((k, p) => k + p.variants.length, 0);
if (bad.length) {
  console.error('proteins:\n  ' + bad.join('\n  '));
  process.exit(1);
}
/* NAMED, not glossed over. "deposited everywhere" was true until a protein
   whose files record no secondary structure at all joined the collection, and
   a pass line that kept saying it would be the checker lying about the one
   thing it just made an exception for. */
const noSSKeys = lib.PROTEINS.filter(p => p.ss && p.ss.deposited === false)
                             .map(p => p.key);
console.log(`PASS: ${lib.PROTEINS.length} proteins, ${n} variants — every variant has ` +
  'its bake, every bake a variant; entries, chains and residue counts agree with ' +
  'what was baked; secondary structure is deposited everywhere' +
  (noSSKeys.length ? ` except ${noSSKeys.join(', ')}, which says so` : '') +
  '; every declared fit is the one the bakes carry, and no chosen rotation is baked');
