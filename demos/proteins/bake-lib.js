#!/usr/bin/env node
/* =============================================================================
 *  proteins/bake-lib.js — reading a deposition, for every protein's baker
 * =============================================================================
 *  Node only, offline, no dependencies but `folding/folding.js`. Three bakers
 *  and `tools/bake-trace.js` had grown their own copy of this; two of them were
 *  byte-identical, which is where a rule starts to drift. The rules here are
 *  the ones a drifted copy breaks invisibly:
 *
 *  · A NUCLEIC CHAIN IS DROPPED BY caTrace AND IT SAYS SO. DNA and RNA have
 *    no CA, so a chain of either is skipped atom by atom and never appears in
 *    the result — 1AOI bakes as eight histones and no DNA, and the render
 *    looks fine. `caTrace` now reports what it dropped, unconditionally.
 *  · ONE COPY PER RESIDUE. An altLoc other than blank or 'A' is a second
 *    position for an atom already counted. Two copies of a residue put two
 *    points in the trace and the ribbon splines through both.
 *  · SECONDARY STRUCTURE IS READ, NEVER DETECTED. HELIX and SHEET are the
 *    depositors' assignment; a geometric guess is a claim about the structure
 *    nothing in the repo checks, and on a page about folding it invents the
 *    lesson. A file with no records bakes as all coil and SAYS so in `ssFrom`,
 *    so it draws as a visible worm rather than a silent wrong.
 *  · SS IS INDEXED BY RESIDUE NUMBER, never by position in the array. A chain
 *    with an unmodelled loop slides every letter after the gap onto the wrong
 *    residue otherwise.
 *  · `nums` RIDES ALONG WITH `first`. They are what let a consumer break the
 *    ribbon where the chain breaks; without them an unmodelled loop is drawn
 *    as a smooth band across coordinates nobody measured, which at ribbon
 *    width is indistinguishable from data.
 *  · COORDINATES COME OUT CENTRED, at 0.01 A. A card frames what it is given
 *    and a crystal's origin is nowhere near the molecule.
 *
 *  WHAT IS NOT HERE, and must not move here: which entries a bench shows, what
 *  they claim, and whatever that protein is about — prion's residue overlap,
 *  rnase's ligand and disulfide meta, myoglobin's pocket and its superposition.
 *  This file answers "what does the file say"; a baker answers "what is this
 *  protein for", and the second question is the one with a human in it.
 *
 *  Each baker composes its OWN output object, in its own key order, from
 *  `assemble` and `frameOf`. That is deliberate: the bakes are committed
 *  artefacts and a shared writer would reorder every one of them the day it
 *  changed its mind about a key.
 *
 *  Used by: every `proteins/<name>/tools/prep.js` on the shared pipeline, and
 *  tools/bake-trace.js. `sickle/tools/bake-sickle.js` and
 *  `hemoglobin/tools/bake-hbs.js` take only the superposition below — it was
 *  written in the first of those and moved here once six bakers under
 *  proteins/ were reaching across the repo for it.
 *
 *  ONE BAKER DELIBERATELY DOES NOT USE IT: `hemoglobin/tools/` feeds
 *  hemoglobin-lab's folding trajectory and is a pipeline of its own. That is
 *  the LESSON's haemoglobin and not the collection's — `proteins/hemoglobin/
 *  tools/prep.js` bakes the same two depositions through this file for the
 *  gallery, which is why the registry entry is an ordinary one.
 *
 *  `proteins/prion/tools/` writes traces like the rest now, but through `PrionLib` rather than through
 *  this file — its sources are already cut and aligned to each other by that
 *  library, and re-reading them here would be a second parse of files a
 *  library in the repo already owns. The RULES above still hold there; it is
 *  the code that differs.
 * ============================================================================= */
'use strict';

const path = require('path');
const FoldLib = require(path.join(__dirname, '..', 'folding', 'folding.js'));
/* Only `viewFor` reads it, and only to ask whether a human has chosen a
   rotation — the one question about a bake that is answered outside the file
   being baked. */
const REG = require(path.join(__dirname, 'proteins.js'));

/* 0.01 A, finer than any deposited coordinate is meaningful to. */
const r2 = v => Math.round(v * 100) / 100;

const xyz = line => [+line.slice(30, 38), +line.slice(38, 46), +line.slice(46, 54)];

/* Everything up to the first ENDMDL, or the whole file when there are no
   MODEL records. An X-ray file passes through untouched, and an NMR
   deposition yields model 1 — a baker that skips this bakes twenty
   interleaved copies of one chain and finds out from the render. */
function modelOne(text) {
  const i = text.indexOf('\nENDMDL');
  return i < 0 ? text : text.slice(0, i);
}

/* THE MODIFIED RESIDUES A FILE DECLARES, off its own MODRES records, as a Set
   of residue names. Not a list this repo keeps: which names are modified
   residues is a fact each entry states about itself, and a hardcoded list is
   the thing that silently misses the next one.

   IT MATTERS BECAUSE A MODIFIED RESIDUE IS A HETATM. Hydroxyproline is the
   case that forced this: collagen is one residue in three, and every one of
   them is deposited as HETATM, so an ATOM-only trace drops a third of the
   chain and splines the ribbon across the holes. Nothing about the render says
   so — it looks like a protein with a lot of disorder. */
function modResidues(text) {
  const out = new Set();
  for (const line of text.split('\n'))
    if (line.startsWith('MODRES')) out.add(line.slice(12, 15).trim());
  return out;
}

/* CA per chain, in file order. `only` is a Set of chain ids, or null for
   every chain in the file. A chain with no id is keyed '_'.

   `mod` is a Set from modResidues: pass it and a HETATM CA of a declared
   modified residue counts as part of the chain. OPT-IN, because it changes
   what a trace CONTAINS and every bake in the repo is a committed artefact —
   a baker asks for it, and says why. */
function caTrace(text, only, mod) {
  const chains = new Map();
  for (const line of text.split('\n')) {
    const het = mod && line.startsWith('HETATM') && mod.has(line.slice(17, 20).trim());
    if (!line.startsWith('ATOM') && !het) continue;
    if (line.slice(12, 16).trim() !== 'CA') continue;
    const alt = line[16];
    if (alt !== ' ' && alt !== 'A') continue;
    const id = line[21] === ' ' ? '_' : line[21];
    if (only && !only.has(id)) continue;
    if (!chains.has(id)) chains.set(id, []);
    const p = xyz(line);
    chains.get(id).push({ num: parseInt(line.slice(22, 26), 10),
                          x: p[0], y: p[1], z: p[2] });
  }
  warnDropped(text, only, chains);
  return chains;
}

/* THE NUCLEIC CHAINS THIS JUST THREW AWAY, said out loud.
 *
 *  A DNA or RNA chain has no CA, so the loop above skips every one of its
 *  atoms and the chain simply is not in the returned Map. Nothing throws and
 *  nothing prints: 1AOI comes back as eight histones, the ribbon draws them
 *  beautifully, and half the nucleosome is gone. That is the single most
 *  expensive silent failure in this file, and `chainKinds` made it POSSIBLE to
 *  see without making anyone look — seventeen callers would each have had to
 *  remember to ask.
 *
 *  So it is not optional and there is no flag to turn it off. A baker that
 *  genuinely wants protein only reads the line, shrugs, and moves on; a baker
 *  that did not know finds out at the moment it happens rather than from a
 *  render that looks fine. stderr, so a baker's own stdout stays parseable.
 *
 *  It says nothing when a nucleic chain was excluded ON PURPOSE by `only` —
 *  that is a decision someone already made, and warning about it would teach
 *  people to ignore the warning.
 */
function warnDropped(text, only, chains) {
  const dropped = [];
  for (const [id, kind] of chainKinds(text))
    if (kind === 'na' && !chains.has(id) && (!only || only.has(id))) dropped.push(id);
  if (!dropped.length) return;
  console.error('  caTrace: ' + dropped.length + ' nucleic chain(s) dropped ('
    + dropped.join(', ') + ') — DNA and RNA have no CA atom. Read them with '
    + 'naTrace(); chainKinds() says what every chain in the file is.');
}

/* The depositors' own assignment, as {chain, from, to} ranges. */
function ssRanges(text) {
  const H = [], E = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('HELIX ')) {
      H.push({ chain: line[19], from: parseInt(line.slice(21, 25), 10),
               to: parseInt(line.slice(33, 37), 10) });
    } else if (line.startsWith('SHEET ')) {
      E.push({ chain: line[21], from: parseInt(line.slice(22, 26), 10),
               to: parseInt(line.slice(33, 37), 10) });
    }
  }
  return { H, E };
}

const ssFrom = R => (R.H.length || R.E.length) ? 'deposited' : 'none';

/* The length the entry SAYS each chain is, off its own SEQRES. Never a
   constant typed by a baker: it is construct-relative, it differs between
   entries of the same protein, and that difference is a fact about what was
   expressed. Completeness is measured against this and nothing else. */
function declared(text) {
  const out = {};
  for (const line of text.split('\n')) {
    if (!line.startsWith('SEQRES')) continue;
    const c = line[11] === ' ' ? '_' : line[11];
    if (!(c in out)) out[c] = parseInt(line.slice(13, 17), 10);
  }
  return out;
}

/* SSBOND pairs as "26-84", restricted to chains being drawn. */
function disulfides(text, only) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('SSBOND')) continue;
    if (only && !(only.has(line[15]) && only.has(line[29]))) continue;
    out.push(line.slice(17, 21).trim() + '-' + line.slice(31, 35).trim());
  }
  return out;
}

/* HETATM residue names other than water, counted by how many COPIES are
   present — keyed by chain and residue number, because the same name
   appearing forty times is one ligand modelled forty times or forty
   ligands, and only the key can tell them apart. Chain-filtered with the
   trace: an unfiltered count describes a structure that is not on screen. */
function ligands(text, only, mod) {
  const seen = new Map();
  for (const line of text.split('\n')) {
    if (!line.startsWith('HETATM')) continue;
    const name = line.slice(17, 20).trim();
    if (name === 'HOH') continue;
    /* A declared modified residue is part of the CHAIN, not something bound to
       it. Hydroxyproline listed as a ligand ×30 would describe collagen as
       carrying thirty passengers. Same Set caTrace was given, or nothing. */
    if (mod && mod.has(name)) continue;
    if (only && !only.has(line[21])) continue;
    seen.set(name + '|' + line[21] + line.slice(22, 27), name);
  }
  const n = new Map();
  for (const name of seen.values()) n.set(name, (n.get(name) || 0) + 1);
  return [...n].map(([name, k]) => k > 1 ? `${name} ×${k}` : name);
}

/* The first line of a record type, minus its tag. */
const line1 = (text, tag) =>
  (text.split('\n').find(l => l.startsWith(tag)) || '').slice(10).trim();

const method = text => (line1(text, 'EXPDTA') || 'unknown').toLowerCase();

const models = text => (text.match(/^MODEL /gm) || []).length;

/* Resolution in ångströms, or null. REMARK 2 is where it lives, and an NMR
   entry writes NOT APPLICABLE there — which is a fact about the method and
   must come back as null rather than as a number nobody measured. */
function resolution(text) {
  const line = text.split('\n').find(l => l.startsWith('REMARK   2 RESOLUTION'));
  if (!line) return null;
  const m = line.match(/(\d+\.?\d*)\s*ANGSTROM/);
  return m ? +m[1] : null;
}

/* THE YEAR THE ENTRY WAS DEPOSITED, off the HEADER's date, or null. Two
   digits is all a legacy file gives — `05-APR-73` — and the PDB opened in
   1971, so anything under 71 is this century.

   IT IS NOT THE YEAR THE STRUCTURE WAS SOLVED, and the gap can be decades:
   Kendrew's myoglobin was solved in 1958 and 1MBN carries 1973, because that
   is when there was a database to put it in. A page that wants the year of
   the work has to say so in prose; this is the year of the FILE. */
function deposited(text) {
  const line = text.split('\n').find(l => l.startsWith('HEADER'));
  const m = line && line.match(/(\d{2})-([A-Z]{3})-(\d{2})/);
  if (!m) return null;
  const yy = +m[3];
  return yy >= 71 ? 1900 + yy : 2000 + yy;
}

/* Every chain id that has coordinates, whatever the trace kept. */
const chainCount = text =>
  new Set(text.split('\n').filter(l => l.startsWith('ATOM')).map(l => l[21])).size;

/* The chains the ENTRY declares, off its COMPND `CHAIN:` lines — which is a
   different question from how many are in the file in front of you, and the
   one a bench answers with "1 of 10 chains, a subunit of the fibril". It is
   readable from a reduced file only if the COMPND lines were carried into it,
   which is why the prion baker carries them. Returns 0 when there are none,
   and a caller should fall back to counting coordinates. */
function chainsDeclared(text) {
  const ids = new Set();
  for (const line of text.split('\n')) {
    if (!line.startsWith('COMPND')) continue;
    const m = line.match(/CHAIN:\s*(.+?);?\s*$/);
    if (!m) continue;
    for (const id of m[1].split(',')) if (id.trim()) ids.add(id.trim());
  }
  return ids.size;
}

/* EC NUMBERS off the entry's own COMPND records, in file order and without
   duplicates — the classification of the REACTION, which is the fact that says
   an entry is an enzyme at all.

   A LIST, because a COMPND block describes every molecule in the entry and
   more than one of them can be an enzyme: 1DFJ is ribonuclease A held by an
   inhibitor, and only one half of it has a number. A single field would have
   to pick, and picking is a decision this reader has no business making.

   IT CLASSIFIES THE REACTION, NOT THE PROTEIN. Two enzymes with no shared
   ancestry and no shared fold carry the same number if they do the same
   chemistry, so it answers "what reaction is this" and is never evidence
   about a structure.

   RETIRED NUMBERS ARE FOLLOWED TO THE CURRENT ONE. IUBMB moves entries
   (all the transporting ATPases went to class 7 in 2018), and a deposition
   keeps the number of its year: bovine 1BMF says 3.6.1.34, spinach 6FKF
   3.6.3.14, for the one reaction now filed as 7.1.2.2. Left raw, two
   variants of one protein disagree and the registry refuses them. Every row
   is ExplorEnz's own "Transferred entry: … Now EC …", followed to the end
   of the chain; add one the same way, never from memory. */
const EC_MOVED = {
  '3.6.1.34': '7.1.2.2',     // H+-transporting ATP synthase, via 3.6.3.14
  '3.6.3.14': '7.1.2.2',     // H+-transporting two-sector ATPase
  '3.6.3.9':  '7.2.2.13',    // Na+/K+-exchanging ATPase
  '3.1.27.5': '4.6.1.18',    // pancreatic ribonuclease: a lyase now, for the cyclic phosphate
};

function ecNumbers(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('COMPND')) continue;
    const m = line.match(/\bEC:\s*([\d.\-,\s]+?);?\s*$/);
    if (!m) continue;
    for (const ec of m[1].split(',')) {
      const v = EC_MOVED[ec.trim()] || ec.trim();
      if (v && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

/* The seven top-level classes, for a page that wants to say what a number
   means. Here rather than in a page because it is a fact about the EC scheme
   and every reader of it would otherwise keep a copy. */
const EC_CLASS = [null,
  ['oxidoreductase', 'moving electrons'],
  ['transferase', 'moving a group from one molecule to another'],
  ['hydrolase', 'cutting a bond with water'],
  ['lyase', 'cutting without water, or adding across a double bond'],
  ['isomerase', 'rearranging one molecule'],
  ['ligase', 'joining two, paying with ATP'],
  ['translocase', 'moving something across a membrane']];

/* The provenance lines a reduced file has to carry to stay self-describing:
   what experiment produced it, how sharp it is, and which chains the entry
   has. Without them a cut-down PDB cannot answer the questions the registry
   indexes it on, and the answers have to be remembered somewhere else. */
const provenance = text => text.split('\n')
  .filter(l => l.startsWith('EXPDTA') || l.startsWith('REMARK   2 RESOLUTION') ||
               (l.startsWith('COMPND') && /CHAIN:/.test(l)));

/* ---------------------------------------------------------------- assemble
 *
 *  The trace shape every consumer reads — kit/proteinbox.js among them —
 *  built from what caTrace and ssRanges returned.
 *
 *    chains   the Map caTrace gave back
 *    R        the ssRanges result
 *    centre   [x,y,z] to subtract; omit and it is solved over every kept CA
 *
 *  Returns {order, chains, radius, centre}. `centre` comes back because a
 *  caller with a second object in the same frame — a heme, a ligand, a
 *  surface — has to move it by exactly this vector or it lands at the origin
 *  with the protein somewhere else.
 *
 *  THE COUNTS COME FROM THE RECORDS, never from the letters: adjacent helices
 *  touch, so eight HELIX records read as six runs of H once they are stamped
 *  onto residues. A page saying "eight helices" has to say it from `helices`.
 */
function assemble(chains, R, centre) {
  let c = centre;
  if (!c) {
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const res of chains.values())
      for (const r of res) { cx += r.x; cy += r.y; cz += r.z; n++; }
    c = [cx / n, cy / n, cz / n];
  }

  const out = { order: [], chains: {}, radius: 0, centre: c.map(r2) };
  for (const [id, res] of chains) {
    const ss = res.map(r => {
      for (const h of R.H) if (h.chain === id && r.num >= h.from && r.num <= h.to) return 'H';
      for (const e of R.E) if (e.chain === id && r.num >= e.from && r.num <= e.to) return 'E';
      return 'C';
    }).join('');
    out.order.push(id);
    out.chains[id] = {
      /* WHAT KIND OF POLYMER THIS IS, so a mixed file's consumer can tell the
         two apart without guessing from which fields are present. Every bake
         written before 2026-08-31 lacks it, and ABSENT MEANS 'aa' — a Ca trace
         is the only thing `assemble` has ever produced. kit/nucleic.js tests
         for 'na' explicitly, so an old protein bake is skipped by it either
         way; this is for the reverse question. */
      kind: 'aa',
      first: res[0].num,
      nums: res.map(r => r.num),
      helices: R.H.filter(h => h.chain === id).length,
      strands: R.E.filter(e => e.chain === id).length,
      CA: res.map(r => {
        const p = [r2(r.x - c[0]), r2(r.y - c[1]), r2(r.z - c[2])];
        out.radius = Math.max(out.radius, Math.hypot(p[0], p[1], p[2]));
        return p;
      }),
      ss,
    };
  }
  out.radius = r2(out.radius);
  return out;
}

/* ------------------------------------------------------------------ frameOf
 *
 *  The presentation frame, solved and only when the shape earns it.
 *
 *  A deposited frame is a crystal's or an EM box's, so there is nothing in it
 *  worth preserving; what a reader needs is the structure's own axes, longest
 *  across the frame and shortest into the screen. `worth:false` means the
 *  three extents are too close to tell apart — a globular domain, whose
 *  solved basis would flip between rebakes — and then no view is written, the
 *  bake opens in the deposited frame, and a human picks one.
 *
 *  Returns {view?, extents, frame}. FoldLib.viewBasis carries the handedness
 *  guard: a basis assembled by hand mirrors the protein half the time, and
 *  nothing downstream can see it.
 */
function frameOf(points) {
  const V = FoldLib.viewBasis(points);
  const out = { extents: V.ext.map(r2), frame: V.worth ? 'computed' : 'deposited' };
  if (V.worth) out.view = V.R.map(ax => ax.map(r2));
  return out;
}

/* ------------------------------------------------------------------ viewFor
 *
 *  WHAT A BAKE SHOULD SAY ABOUT ITS OWN ORIENTATION, given that a human may
 *  have chosen one somewhere this file never reads.
 *
 *  A CHOSEN BASIS IS NOT BAKED. It is taste rather than measurement, it lives
 *  in `proteins/proteins.js`, and kit/proteinbox.js reads it at draw time —
 *  so re-aiming a protein is an edit and a reload instead of a re-bake that
 *  rewrites files whose coordinates did not change. Baking it too would put
 *  one decision in two places and need a checker to hold them level.
 *
 *  So where the registry holds one, this writes NO view and says the rotation
 *  came from the registry. The `frame` string is what a panel prints, and it
 *  is fixed here rather than per baker: `chosen in the registry`, `computed`,
 *  `deposited`, one word each. A page that then forgets to pass the basis
 *  opens in the deposited frame, which is visibly wrong rather than subtly —
 *  and the row it prints says where to look.
 *
 *  Everything else falls through to what the baker worked out: `frameOf` for
 *  most, `FoldLib.basisFrom` where a field has a convention about which axis
 *  stands up. Pass that as `fallback` and it comes back untouched.
 *
 *  `reg` IS WHICH INDEX HOLDS THE ANSWER, and it defaults to `proteins.js`.
 *  A bake carrying nucleic chains is indexed in `nucleic-acids.js` instead —
 *  the line between the two files is the bake, not the biology — and that
 *  index has a `viewOf` with the same contract. Without this argument a mixed
 *  structure could never say `chosen in the registry`, so its bakes would keep
 *  a solved basis under a rotation a human had picked and the two would fight.
 */
function viewFor(p, fallback, v, reg) {
  /* WHETHER A HUMAN HAS PICKED ONE FOR **THIS** VIEW'S FRAME, resolved by
     ProteinLib rather than re-read here: a protein at two scales keys its
     basis by frame, and a frame nobody has aimed yet still falls through to
     the solved one below. One resolver, because a second copy of the rule is
     how a bake and a bench come to disagree about which way a molecule
     faces. */
  if ((reg || REG).viewOf(p, v))
    return { view: null, frame: 'chosen in the registry' };
  const f = fallback || {};
  return { view: f.view || null, frame: f.view ? (f.frame || 'computed') : 'deposited' };
}

/* =========================================================== nucleic acid
 *
 *  A NUCLEIC CHAIN HAS NO CA, so caTrace returns nothing for it and the chain
 *  drops out of a bake with nothing printed. 1AOI bakes as eight histones and
 *  no DNA, and the render looks like a perfectly good histone octamer. That is
 *  what `chainKinds` exists to make visible: it says what every chain in the
 *  file IS, so a baker can refuse rather than quietly halve its subject.
 *
 *  A nucleic residue is anchored by three atoms and they answer different
 *  questions. P is the backbone — where the ribbon goes. C1' is the glycosidic
 *  attachment — where the base hangs off. The base ring atoms give a centroid
 *  and a plane normal, which is what lets a renderer draw a slab that is
 *  actually in the plane of the base rather than a stub pointing at it.
 *
 *  THE FIRST RESIDUE OF A CHAIN HAS NO PHOSPHATE. A 5' terminus is deposited
 *  with O5' and no P, so a P-only backbone silently starts one residue late
 *  and the ribbon is short at one end — small enough to read as the chain
 *  simply ending there. O5' then C5' are the fallbacks, in that order.
 *
 *  PURINE OR PYRIMIDINE IS ASKED OF THE ATOMS, NOT OF A NAME LIST. N9 present
 *  means purine. tRNA carries a dozen modified bases and a hardcoded list is
 *  the thing that misses the next one; the base LETTER still falls back to 'X'
 *  when the name is not one of the five, which is honest rather than a guess.
 */

const PU_RING = ['N9', 'C8', 'N7', 'C5', 'C6', 'N1', 'C2', 'N3', 'C4'];
const PY_RING = ['N1', 'C2', 'O2', 'N3', 'C4', 'C5', 'C6'];

/* The one-letter base, or 'X'. DC -> C, DG -> G, C -> C, PSU -> X. */
function baseLetter(name) {
  const c = name.trim().replace(/^D/, '').slice(-1);
  return 'ACGTU'.includes(c) && name.trim().length <= 3 ? c : 'X';
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1],
                          a[2] * b[0] - a[0] * b[2],
                          a[0] * b[1] - a[1] * b[0]];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function unit3(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

/* Least-squares plane normal over the ring atoms, by Newell's method — it
   needs no eigen solve and is stable on a ring that is not quite flat, which
   every deposited base is. */
function ringNormal(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return unit3([x, y, z]);
}

/* WHAT EVERY CHAIN IN THE FILE IS: 'aa', 'na', or 'other', off the atoms it
   carries rather than off SEQRES — SEQRES describes the construct and a chain
   can be declared and unmodelled. Returns a Map of chain id to kind. */
function chainKinds(text) {
  const seen = new Map();
  for (const line of text.split('\n')) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue;
    const name = line.slice(17, 20).trim();
    if (name === 'HOH') continue;
    const id = line[21] === ' ' ? '_' : line[21];
    const atom = line.slice(12, 16).trim();
    if (!seen.has(id)) seen.set(id, { aa: 0, na: 0 });
    if (atom === 'CA') seen.get(id).aa++;
    else if (atom === "C1'" || atom === 'C1*') seen.get(id).na++;
  }
  const out = new Map();
  for (const [id, n] of seen)
    out.set(id, n.aa > n.na ? 'aa' : n.na ? 'na' : 'other');
  return out;
}

/* Nucleic residues per chain, in file order. Same altLoc and `only` rules as
   caTrace; `mod` plays the same opt-in role, because a modified base is a
   HETATM for exactly the reason hydroxyproline is. */
function naTrace(text, only, mod) {
  const chains = new Map();
  const cur = new Map();          /* chain id -> the residue being filled */

  const flush = (id, r) => {
    if (!r) return;
    const back = r.atoms.P || r.atoms["O5'"] || r.atoms["C5'"];
    const c1 = r.atoms["C1'"];
    if (!back || !c1) return;     /* not a nucleotide, or too broken to place */
    const ring = (r.atoms.N9 ? PU_RING : PY_RING)
      .map(a => r.atoms[a]).filter(Boolean);
    if (ring.length < 5) return;
    const bc = ring.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0])
      .map(v => v / ring.length);
    if (!chains.has(id)) chains.set(id, []);
    chains.get(id).push({
      num: r.num, name: r.name, base: baseLetter(r.name),
      mod: !!(mod && mod.has(r.name)),
      ring: r.atoms.N9 ? 'pu' : 'py',
      P: back, C1: c1, Bc: bc, Bn: ringNormal(ring),
      /* The Watson-Crick edge nitrogen: purine N1 faces pyrimidine N3. */
      edge: r.atoms.N9 ? r.atoms.N1 : r.atoms.N3,
      /* THE OTHER EDGE ATOM, which is what a wobble uses instead. A G-U
         wobble bonds G's N1-H to U's O2 and G's O6 to U's N3-H — the same two
         bases, shifted about 2 A out of Watson-Crick register. Adenine has an
         amine at position 6 and no O6, so an A-U pair simply fails the test
         without anyone naming which bases may wobble. */
      off: r.atoms.N9 ? r.atoms.O6 : r.atoms.O2,
    });
  };

  for (const line of text.split('\n')) {
    const name = line.slice(17, 20).trim();
    const het = mod && line.startsWith('HETATM') && mod.has(name);
    if (!line.startsWith('ATOM') && !het) continue;
    const alt = line[16];
    if (alt !== ' ' && alt !== 'A') continue;
    const id = line[21] === ' ' ? '_' : line[21];
    if (only && !only.has(id)) continue;
    const num = parseInt(line.slice(22, 26), 10);
    let r = cur.get(id);
    if (!r || r.num !== num) { flush(id, r); r = { num, name, atoms: {} }; cur.set(id, r); }
    r.atoms[line.slice(12, 16).trim().replace(/\*/g, "'")] = xyz(line);
  }
  for (const [id, r] of cur) flush(id, r);
  return chains;
}

/* WATSON-CRICK PAIRS, SOLVED — and this is the one thing in this file that is
   computed rather than read, because the format has no record for it. There is
   no BASEPAIR line in a PDB, so a renderer that wants to draw a rung has to
   earn the pair from the coordinates, and the bake says `pairsFrom:'geometry'`
   the way `ssFrom` says where the letters came from.
 *
 *  THE TEST IS THE HYDROGEN BOND ITSELF: purine N1 to pyrimidine N3, which is
 *  the one contact every Watson-Crick pair has and no other arrangement of two
 *  bases reproduces. Distance and coplanarity alone admit stacked neighbours,
 *  which are 3.4 A apart and beautifully parallel.
 *
 *  IT FINDS ONLY WATSON-CRICK, ON PURPOSE. A wobble, a Hoogsteen or tRNA's
 *  tertiary contacts come back unpaired, and unpaired renders as a stub rather
 *  than a rung — so the picture under-claims instead of inventing a ladder.
 */
/* THE H-BOND TOLERANCE A STRUCTURE'S RESOLUTION EARNS.
 *
 *  The Watson-Crick N1...N3 distance is ~2.85 A and essentially invariant —
 *  it is a hydrogen bond, not a variable. What varies is how well the model
 *  knows where the atoms are. 1BNA at 1.9 A has a median of 2.87; 1AOI at
 *  2.8 A has 3.04, with a long tail. A single tight cutoff therefore does not
 *  mean one thing across a collection: it finds every pair in a sharp
 *  structure and drops a fifth of them in a blunt one, and the ladder comes
 *  out looking damaged where the DATA is blunt rather than the DNA.
 *
 *  So the tolerance is derived from the number the file states about itself,
 *  and the bake records what was used. 0.25 A per A beyond 2.0 is a
 *  coordinate-error allowance, not a claim about chemistry.
 *
 *  IT IS ONLY SAFE BECAUSE OF THE C1'-C1' WINDOW BELOW. Loosening a lone
 *  distance test admits stacked neighbours, which sit 3.4 A apart and
 *  beautifully coplanar; a pair's sugars are ~10.5 A apart and a stack's are
 *  ~5, so the two criteria fail on completely different things. */
const hbFor = res => Math.round((3.3 + 0.25 * Math.max(0, (res || 2) - 2)) * 100) / 100;

function basePairs(chains, opts) {
  const o = opts || {};
  const HB = o.hb || 3.3;            /* N1...N3, ~2.85 A in a good structure */
  const COPLANAR = o.coplanar || 0.6;  /* |n1 . n2|, a pair is near-antiparallel */
  /* THE SPAN ACROSS THE PAIR, sugar to sugar. A second criterion that fails on
     a different thing from the first: every Watson-Crick pair puts its two C1'
     about 10.5 A apart whatever the bases are, and nothing else in a nucleic
     structure does. It is what lets HB be loosened for a blunt structure
     without the test starting to find base STACKS. */
  const C1LO = o.c1lo || 8.4, C1HI = o.c1hi || 12.6;
  const flat = [];
  for (const [id, res] of chains) for (const r of res) flat.push({ id, r });

  const mid2 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

  /* Watson-Crick, or a wobble, or nothing. The two are told apart by WHICH
     atoms are in contact, never by which bases are involved:

       wc      purine N1 ... pyrimidine N3
       wobble  purine N1 ... pyrimidine O2  AND  purine O6 ... pyrimidine N3

     A wobble is a real pair — two hydrogen bonds, and it sits in a helix
     without distorting it, which is why RNA is full of them. It is not
     Watson-Crick, and the difference is the point: G3-U70 is the whole of how
     alanyl-tRNA synthetase recognises its tRNA. */
  function testPair(a, b) {
    const pu = a.r.ring === 'pu' ? a : b, py = pu === a ? b : a;
    if (Math.abs(dot3(a.r.Bn, b.r.Bn)) < COPLANAR) return null;
    const span = dist3(a.r.C1, b.r.C1);
    if (span < C1LO || span > C1HI) return null;
    if (pu.r.edge && py.r.edge && dist3(pu.r.edge, py.r.edge) <= HB)
      return { kind: 'wc', mid: mid2(pu.r.edge, py.r.edge) };
    if (pu.r.edge && py.r.off && pu.r.off && py.r.edge
        && dist3(pu.r.edge, py.r.off) <= HB && dist3(pu.r.off, py.r.edge) <= HB)
      /* The split lands between the two bonds, which in a wobble is OFF the
         C1'-C1' midpoint — the shift itself, showing in the drawing. */
      return { kind: 'wobble',
               mid: mid2(mid2(pu.r.edge, py.r.off), mid2(pu.r.off, py.r.edge)) };
    return null;
  }

  const out = [];
  const taken = new Set();
  const key = x => x.id + ':' + x.r.num;
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i], b = flat[j];
      if (a.r.ring === b.r.ring) continue;         /* purine needs a pyrimidine */
      if (a.id === b.id && Math.abs(a.r.num - b.r.num) < 3) continue;
      if (taken.has(key(a)) || taken.has(key(b))) continue;
      const hit = testPair(a, b);
      if (!hit) continue;
      taken.add(key(a)); taken.add(key(b));
      out.push({ a: [a.id, a.r.num], b: [b.id, b.r.num],
                 bases: a.r.base + b.r.base, kind: hit.kind, mid: hit.mid });
    }
  }
  return out;
}

/* The pairs moved into the frame `assembleNA` centred the coordinates on. A
   split point left in the deposited frame is the one number in the bake that
   would sit an entire crystal origin away from the molecule it belongs to. */
function centrePairs(pairs, centre) {
  return pairs.map(p => Object.assign({}, p, {
    mid: p.mid.map((v, k) => r2(v - centre[k])),
  }));
}

/* The nucleic counterpart of `assemble`. Same contract — centred coordinates,
   `nums` riding with `first`, a radius — and a `kind` so a consumer can never
   mistake one for a Ca trace. `seq` replaces `ss`: it is the per-residue
   letter, and it is what it is rather than an assignment anyone could dispute.

   THE CENTRE IS SHARED WITH THE PROTEIN HALF OR THE TWO LAND APART. A mixed
   file bakes one centre over both, so the caller solves it and passes it in;
   omit it and it is solved over this chain set alone. */
function assembleNA(chains, centre) {
  let c = centre;
  if (!c) {
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const res of chains.values())
      for (const r of res) { cx += r.P[0]; cy += r.P[1]; cz += r.P[2]; n++; }
    c = [cx / n, cy / n, cz / n];
  }
  const out = { order: [], chains: {}, radius: 0, centre: c.map(r2) };
  const move = p => {
    const q = [r2(p[0] - c[0]), r2(p[1] - c[1]), r2(p[2] - c[2])];
    out.radius = Math.max(out.radius, Math.hypot(q[0], q[1], q[2]));
    return q;
  };
  for (const [id, res] of chains) {
    out.order.push(id);
    out.chains[id] = {
      kind: 'na',
      first: res[0].num,
      nums: res.map(r => r.num),
      seq: res.map(r => r.base).join(''),
      ring: res.map(r => r.ring === 'pu' ? 'R' : 'Y').join(''),
      /* THE MODIFIED RESIDUES, kept as {num, name} rather than folded into
         `seq`. A modified base is still its parent letter for pairing and for
         reading, but WHICH ones are modified is a fact about the molecule that
         a tRNA lesson is largely about — and it is the fact that decides
         whether the chain was read at all, since every one of them is a
         HETATM. `seq` alone cannot say it: 5MC and C are both 'C'. */
      mods: res.filter(r => r.mod).map(r => ({ num: r.num, name: r.name })),
      P: res.map(r => move(r.P)),
      C1: res.map(r => move(r.C1)),
      Bc: res.map(r => move(r.Bc)),
      /* A normal is a direction: it is rotated by a view basis but never
         translated, so it is written raw and must not go through `move`. */
      Bn: res.map(r => r.Bn.map(r2)),
    };
  }
  out.radius = r2(out.radius);
  return out;
}

/* Chain breaks, counted off the numbers a bake carries — for a baker's own
   console line and for a panel that reports segments. */
const breaks = trace => trace.order.reduce((k, id) => k + trace.chains[id].nums
  .filter((v, i, a) => i && v !== a[i - 1] + 1).length, 0);

/* ============================================================ superposition
 *
 *  FITTING ONE STRUCTURE ONTO ANOTHER, and the reason it is in this file.
 *  Six bakers under proteins/ superpose their views onto a reference so a
 *  reader flipping between two crystals sees what actually moved rather than
 *  the crystallographer's choice of origin. They used to reach across the
 *  repo into sickle/tools/bake-sickle.js for it — a lesson's baker lending
 *  its linear algebra to the registry's pipeline, which is backwards.
 *  bake-sickle.js now takes these from here, so there is still one Kabsch.
 */

/* ------------------------------------------------------------------ Kabsch
 *
 *  Least-squares rigid superposition of P onto Q, matched pointwise. The
 *  rotation is the orthogonal factor of the covariance H = P^T Q, taken
 *  here as R = H (H^T H)^-1/2 through a Jacobi eigendecomposition of the
 *  3x3 symmetric H^T H — no SVD library, and no dependency this repo does
 *  not already have.
 *
 *  THE REFLECTION TRAP. That formula is happy to return a rotation with
 *  determinant -1, which superposes the points perfectly and MIRRORS the
 *  molecule doing it. On a protein that is invisible in a screenshot and
 *  fatal to the science — the same trap MolecularGeometry.md §1.3 sets up
 *  the handedness checker for. So the smallest-eigenvalue axis is flipped
 *  when the determinant comes out negative, and check-sickle.js asserts
 *  det = +1 on the shipped transform rather than trusting this comment.
 */
function jacobi(Ain) {
  const A = Ain.map(r => r.slice());
  let V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 64; sweep++) {
    let off = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) off += A[i][j] * A[i][j];
    if (off < 1e-20) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(A[p][q]) < 1e-18) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = A[p][k], aqk = A[q][k];
        A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return [0, 1, 2].map(i => ({ val: A[i][i], vec: [V[0][i], V[1][i], V[2][i]] }))
                 .sort((a, b) => b.val - a.val);
}

const mul = (R, p) => R.map(row => row[0] * p[0] + row[1] * p[1] + row[2] * p[2]);
const det = R => R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1])
               - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0])
               + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);

function kabsch(P, Q) {
  if (P.length !== Q.length) throw new Error('kabsch: unmatched point counts');
  const cp = mean(P), cq = mean(Q);
  const p = P.map(v => v.map((x, k) => x - cp[k]));
  const q = Q.map(v => v.map((x, k) => x - cq[k]));

  const H = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let n = 0; n < p.length; n++)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) H[i][j] += p[n][i] * q[n][j];

  const HtH = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    for (let k = 0; k < 3; k++) HtH[i][j] += H[k][i] * H[k][j];

  const e = jacobi(HtH);
  // (H^T H)^-1/2 in the eigenbasis, guarding the degenerate direction.
  const Minv = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const { val, vec } of e) {
    const inv = 1 / Math.sqrt(Math.max(val, 1e-12));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      Minv[i][j] += inv * vec[i] * vec[j];
  }
  let R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];         // R = (H Minv)^T, row-major on p
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    for (let k = 0; k < 3; k++) R[j][i] += H[i][k] * Minv[k][j];

  if (det(R) < 0) {                                   // see THE REFLECTION TRAP
    const bad = e[2].vec;
    const F = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      F[i][j] = (i === j ? 1 : 0) - 2 * bad[i] * bad[j];
    const R2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) R2[i][j] += R[i][k] * F[k][j];
    R = R2;
  }

  let sd = 0;
  for (let n = 0; n < p.length; n++) {
    const r = mul(R, p[n]);
    for (let k = 0; k < 3; k++) sd += (r[k] - q[n][k]) ** 2;
  }
  return { R, t: cq.map((v, k) => v - mul(R, cp)[k]), rmsd: Math.sqrt(sd / p.length) };
}

const mean = vs => [0, 1, 2].map(k => vs.reduce((s, v) => s + v[k], 0) / vs.length);

module.exports = {
  deposited,
  r2, xyz, modelOne, caTrace, ssRanges, ssFrom, declared, disulfides, ligands,
  line1, method, models, resolution, chainCount, chainsDeclared, provenance,
  modResidues,
  ecNumbers, EC_MOVED, EC_CLASS,
  assemble, frameOf, viewFor, breaks,
  chainKinds, naTrace, basePairs, centrePairs, assembleNA, baseLetter, hbFor,
  kabsch, mul, det, mean,
};
