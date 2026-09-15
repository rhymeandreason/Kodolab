#!/usr/bin/env node
/* =====================================================================
 *  check-hb.js — assert what the hemoglobin page claims.
 *
 *  Everything here is a claim the lesson makes — in prose, or by what it
 *  draws and the order it draws it in — turned into something that fails
 *  the build when it stops being true. A stale bake
 *  is the reason this file exists: the trajectory is committed, the solver
 *  is not frozen, and NOTHING about a mismatch between them is visible
 *  from watching the animation — it just plays a fold the current code
 *  would no longer produce.
 *
 *  Run:  node hemoglobin/tools/check-hb.js            (offline, ~57 s)
 *        node hemoglobin/tools/check-hb.js --quick    (~1 s)
 *
 *  WHAT --quick DROPS, AND WHY IT IS SAFE TO DROP IT SOMETIMES. Two of the
 *  assertions here re-run the unfold — the staleness compare and the
 *  quantisation bound — and that bake is 56 of this file's 57 seconds.
 *  Everything else reads the COMMITTED file and takes about a second.
 *
 *  A stale trajectory can only be produced by a change to the code that
 *  produces it: bake-unfold.js, or folding.js's solver, or ribbon.js's
 *  DSSP. Editing the page, the captions, the quaternary baker or this file
 *  cannot make 2HHB-B.fold.bin disagree with its source, so re-deriving it
 *  to prove it still matches is a minute spent to learn nothing. `tools/check.js proteins` runs
 *  --quick unless given --full; a bare run is always the full one.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const FoldLib = require('../../folding/folding.js');
const RibbonLib = require('../../kit/ribbon.js');
const { extract } = require('./chain.js');
const { encode, decode, backboneOf, CHAIN } = require('./bake-hb.js');
const { bakeUnfold } = require('./bake-unfold.js');
/* Memoised: the unfold takes ~55 s and this file wanted it twice — once to
   compare against the committed bytes and once for its geometry. */
let _baked = null;
const bake = () => (_baked || (_baked = bakeUnfold()));

const HERE = path.join(__dirname, '..');
const SRC = path.join(HERE, 'data', '2HHB.pdb');
const BIN = path.join(HERE, 'data', '2HHB-B.fold.bin');

/* --quick: skip the two assertions that need a fresh bake. See the header. */
const QUICK = process.argv.includes('--quick');

let fails = 0;
function ok(cond, label, detail) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? '   ' + detail : ''}`);
  if (!cond) fails++;
}

/* ---------------- the structure, as deposited ---------------- */

const raw = fs.readFileSync(SRC, 'utf8');
ok(/^HEADER.*2HHB/m.test(raw) || raw.includes('DEOXYHAEMOGLOBIN'),
   'source is 2HHB, human deoxyhaemoglobin');

const ex = extract(raw, CHAIN);
ok(ex.residues.length === 146, 'chain B is 146 residues', `got ${ex.residues.length}`);
ok(ex.residues.every((r, i) => i === 0 || r.num === ex.residues[i - 1].num + 1),
   'chain B is numbered 1..146 with no gaps');
ok(ex.helices.length === 8, 'eight deposited helices, BA..BH', `got ${ex.helices.length}`);

/* The lesson names His F8 as the residue the iron hangs off. In the beta
   chain that is residue 92, and it must be a histidine inside helix F —
   helix F being the sixth of the eight, 85..93. */
const his92 = ex.residues.find(r => r.num === 92);
ok(his92 && his92.name === 'HIS', 'residue 92 (His F8) is a histidine',
   his92 ? his92.name : 'absent');
ok(ex.helices.some(([a, b]) => a <= 92 && 92 <= b), 'His F8 sits inside a deposited helix');
/* And the distal His E7, residue 63, which gates the oxygen pocket. */
const his63 = ex.residues.find(r => r.num === 63);
ok(his63 && his63.name === 'HIS', 'residue 63 (His E7) is a histidine',
   his63 ? his63.name : 'absent');

/* ---------------- amide H: constructed, and constructed right ---------------- */

/* 2HHB models no hydrogens at all, which is why chain.js builds them. If a
   future re-download DID carry them the injection would be duplicating
   real atoms, so assert the premise rather than assuming it. */
ok(!/^ATOM.{72}\s*H\s*$/m.test(raw), '2HHB deposits no hydrogens (so chain.js must add them)');

const parsed = FoldLib.parse(ex.text, {});
const nH = parsed.nodes.filter(n => n.name === 'H').length;
ok(nH === 145, 'an amide H on every residue but the first', `got ${nH}`);
/* Placed 1 A from its own N, by construction. */
const hErr = parsed.residues.reduce((m, r) => {
  if (r.atoms.H == null || r.atoms.N == null) return m;
  const H = parsed.nodes[r.atoms.H].native, N = parsed.nodes[r.atoms.N].native;
  return Math.max(m, Math.abs(Math.hypot(H[0]-N[0], H[1]-N[1], H[2]-N[2]) - 1));
}, 0);
ok(hErr < 1e-3, 'every amide H is 1.000 A from its N', `max err ${hErr.toExponential(1)}`);

/* ---------------- the hydrogen bonds are helical ---------------- */

const hb = FoldLib.hbonds(parsed);
const sep4 = hb.filter(b => b.sep === 4).length;
const sep3 = hb.filter(b => b.sep === 3).length;
ok(hb.length > 90, 'the chain has ~100 backbone H-bonds', `got ${hb.length}`);
ok(sep4 / hb.length > 0.7, 'most are i->i+4 — the alpha-helix bond',
   `${sep4}/${hb.length} = ${(100 * sep4 / hb.length).toFixed(0)}%`);
ok((sep3 + sep4) / hb.length > 0.9, 'almost all are i+3 or i+4 — this fold is all-alpha',
   `${sep3 + sep4}/${hb.length}`);

/* ---------------- secondary structure: two sources, one answer ---------------- */

const bb = RibbonLib.parseBackbone(ex.text);
const dssp = RibbonLib.dssp(bb);
const helix = RibbonLib.assign(bb.nums.length, bb.nums[0], ex.helices);
const agree = dssp.filter((d, i) => (d === 'H') === (helix[i] === 'H')).length;

ok(dssp.filter(x => x === 'E').length === 0,
   'DSSP finds no beta strand — a globin is all-alpha',
   `${dssp.filter(x => x === 'E').length} E residues`);
/* The page draws from the HELIX records, so this is a cross-check, not the
   source. 2HHB is a 1984 entry and some of its records are homology-
   propagated (its own remarks say RETAIN HOMOL), so exact agreement is not
   expected and would be suspicious; the boundaries drift and DSSP calls the
   EF corner helical where the depositors did not. What must not happen is
   the two drifting apart wholesale. */
ok(agree / dssp.length > 0.78, 'DSSP and the deposited HELIX records agree on >78% of residues',
   `${agree}/${dssp.length} = ${(100 * agree / dssp.length).toFixed(1)}%`);

/* ---------------- the committed trajectory is the current one ---------------- */

ok(fs.existsSync(BIN), 'the baked trajectory is committed');
const onDisk = fs.readFileSync(BIN);
if (QUICK) {
  console.log('  --    skipping the staleness re-bake (--quick)');
} else {
  const fresh = encode(bake()).buf;
  ok(onDisk.length === fresh.length && onDisk.equals(fresh),
     'the committed bake matches a fresh one (re-run bake-unfold.js if this fails)',
     `${onDisk.length} vs ${fresh.length} bytes`);
}

/* ---------------- what the page will actually read back ---------------- */

const d = decode(onDisk);
/* THE Ca TRACE IS NO LONGER THE FIRST R POINTS OF A KEYFRAME. v3 stores the
   whole backbone and points at the alpha carbons through `caPos`, so every
   assertion about the trace has to go through this accessor. Getting it
   wrong does not throw — it silently measures N-to-N distances and reports
   a chain with 1 A bonds, which is what happened on the way here. */
const caK = (f, i, k) => d.key[f][d.caPos[i] * 3 + k];
const caP = (f, i) => [caK(f, i, 0), caK(f, i, 1), caK(f, i, 2)];

ok(d.R === 146 && d.first === 1, 'decodes to 146 residues starting at 1',
   `R=${d.R} first=${d.first}`);
ok(d.K === d.ts.length && d.ts[0] === 0 && Math.abs(d.ts[d.K - 1] - 1) < 1e-6,
   't runs 0..1 across the keyframes');
ok(d.ss.length === 146 && d.ss.filter(x => x === 'H').length > 100,
   'the ribbon gets a helix assignment for most of the chain',
   `${d.ss.filter(x => x === 'H').length}/146 helix`);

/* Quantisation: the whole point of int16 is that it costs nothing visible.
   Needs the un-quantised trajectory, so it is the other assertion --quick
   drops — and it is measuring the ENCODER, which only bake-unfold.js and
   bake-hb.js can change. */
/* The un-quantised trajectory, or null under --quick. Memoised in bake(),
   so the assertions below share this one minute. */
const b = QUICK ? null : bake();

if (QUICK) {
  console.log('  --    skipping the quantisation bound (--quick)');
} else {
  /* v3: the keyframe block IS the backbone, in backboneOf's order — not
     caIdx+oIdx+hIdx concatenated, which is what v2 wrote. Derived from the
     same function the encoder uses, so the two cannot fall out of step. */
  const idx = backboneOf(b.parsed).atoms.map(nd => nd.i);
  let qErr = 0;
  for (let f = 0; f < d.K; f++)
    for (let i = 0; i < idx.length; i++)
      for (let k = 0; k < 3; k++)
        qErr = Math.max(qErr, Math.abs(d.key[f][i * 3 + k] - b.traj.key[f][idx[i] * 3 + k]));
  ok(qErr < 0.02, 'int16 quantisation costs under 0.02 A anywhere in the trajectory',
     `max ${qErr.toFixed(4)} A`);
}

/* THE PAGE'S DECODER MUST AGREE WITH THE BAKER'S. hbfold.js and bake-hb.js
   are two implementations of one format — the browser cannot use the
   baker's (it requires folding.js and solves nothing) and the baker cannot
   use the browser's (it needs the un-quantised trajectory) — so the only
   thing standing between them is this. It has already earned its place: the
   first hbfold.js mapped t to a keyframe index by t*(K-1), which assumes
   evenly spaced keyframes. They are not evenly spaced, and the page was
   drawing the chain up to 1.13 A away from the trajectory it had baked. */
const HbFold = require('../hbfold.js');
const page = HbFold.decode(onDisk);
/* v3: every atom of every keyframe, not just the Ca and the bond ends —
   the intro draws all of them, so all of them have to survive the round
   trip. The Ca/O/H checks below then ride on the index lists, which is
   also what catches an index list that has drifted out of step. */
let dErr = 0;
for (let f = 0; f < d.K; f++) {
  const s = page.at(d.ts[f]);
  for (let i = 0; i < d.A; i++)
    for (let k = 0; k < 3; k++)
      dErr = Math.max(dErr, Math.abs(s.P[i][k] - d.key[f][i * 3 + k]));
  for (let i = 0; i < d.R; i++)
    for (let k = 0; k < 3; k++)
      dErr = Math.max(dErr, Math.abs(s.CA[i][k] - d.key[f][d.caPos[i] * 3 + k]));
  for (let i = 0; i < d.B; i++)
    for (let k = 0; k < 3; k++) {
      dErr = Math.max(dErr, Math.abs(s.O[i][k] - d.key[f][d.oPos[i] * 3 + k]));
      dErr = Math.max(dErr, Math.abs(s.H[i][k] - d.key[f][d.hPos[i] * 3 + k]));
    }
}
ok(dErr < 1e-3, 'the page decoder and the baker agree at every keyframe',
   `max ${dErr.toExponential(2)} A`);
ok(page.ss.join('') === d.ss.join('') && page.first === d.first && page.B === d.B,
   'both decoders read the same secondary structure and numbering');

/* ---------------- the intro and the close-up (format v3) ----------------
   The page opens on a ball-and-stick model of the WHOLE chain, which the
   student pans along, and the close-up is a lit region of it. Everything
   that says is checkable, and none of it is visible from watching: a
   close-up on the wrong residues, or a backbone that has quietly stopped
   matching the ribbon drawn through it, plays exactly as smoothly as a
   correct one. */
ok(d.version === 3 && page.version === 3, 'the file is format v3 (it carries the whole backbone)',
   `baker ${d.version}, page ${page.version}`);
ok(JSON.stringify(page.focus) === JSON.stringify(d.focus) &&
   JSON.stringify(page.atoms) === JSON.stringify(d.atoms) &&
   JSON.stringify(page.abonds) === JSON.stringify(d.abonds),
   'both decoders read the same backbone and focus range');
ok(d.resNames.length === 146 && d.resNames.slice(0, 6).join('') === 'VALHISLEUTHRPROGLU',
   'the sequence is human beta-globin, from residue 1',
   d.resNames.slice(0, 6).join(' '));

/* THE INTRO DRAWS EVERY RESIDUE, so every residue must have a backbone to
   draw. This is the assertion the intro rests on: a gap anywhere in the
   chain is a hole the student can pan to and find. */
{
  const seen = new Map();
  d.atoms.forEach(a => {
    if (!seen.has(a.res)) seen.set(a.res, new Set());
    seen.get(a.res).add(a.name);
  });
  ok(seen.size === d.R, 'every one of the 146 residues has atoms in the file',
     `${seen.size}/${d.R}`);
  const gaps = [...seen.entries()]
    .filter(([, s]) => !['N', 'CA', 'C', 'O'].every(n => s.has(n))).map(([r]) => r);
  ok(gaps.length === 0, 'every residue in the chain has N, CA, C and O',
     gaps.length ? `missing at ${gaps.join(' ')}` : '');
  /* Proline is the exception and it must BE the exception: it has no amide
     H, and the intro is what draws them. chain.js builds an H on every
     proline anyway (see backboneOf in bake-hb.js for why that is left
     alone), so this asserts the DRAWN set is right — stated as an equality
     over the whole chain, so it is independent of where FOCUS sits. */
  const noH = [...seen.entries()].filter(([, s]) => !s.has('H')).map(([r]) => r);
  const pros = [...seen.keys()].filter(r => d.resNames[r - d.first] === 'PRO');
  ok(noH.join(' ') === [d.first, ...pros].join(' '),
     'the only residues without an amide H are residue 1 and the prolines',
     `no H: [${noH.join(' ')}]  expected: [${[d.first, ...pros].join(' ')}]`);
}

const foc = d.focus;
/* The close-up's atoms are now simply those in the focus RANGE. */
const focAtoms = d.atoms.map((a, i) => ({ ...a, i }))
                        .filter(a => a.res >= foc.lo && a.res <= foc.hi);
/* THE SEGMENT MUST BE ONE THE STUDENT WATCHES BECOME A HELIX. The caption
   says "watch this stretch wind into an alpha-helix", so the range has to
   be inside a deposited HELIX record — not merely near one. */
ok(ex.helices.some(([a, b]) => a <= foc.lo && foc.hi <= b),
   'the close-up sits wholly inside a deposited helix record',
   `${foc.lo}-${foc.hi} vs ${ex.helices.map(h => h.join('-')).join(' ')}`);

ok(focAtoms.length > 0 && new Set(focAtoms.map(a => a.res)).size === foc.hi - foc.lo + 1,
   `all ${foc.hi - foc.lo + 1} close-up residues have atoms`,
   `${focAtoms.length} atoms`);

/* THE CLOSE-UP'S ATOMS ARE THE RIBBON'S ATOMS — now true by construction
   rather than by luck, and this asserts the construction. v2 stored the
   close-up's alpha carbons a second time and this check existed to stop
   the two copies drifting; v3 stores the backbone once and points the Ca
   trace at it, so what is checked now is that the INDEX LIST is right.
   A caPos that pointed at the wrong atom would put the ribbon through
   something that is not the alpha carbon, which is the same failure with a
   different cause. */
{
  let bad = 0;
  for (let i = 0; i < d.R; i++) {
    const a = d.atoms[d.caPos[i]];
    if (!a || a.name !== 'CA' || a.res !== d.first + i) bad++;
  }
  ok(bad === 0, 'the ribbon\'s Ca index list points at the actual alpha carbons',
     `${bad} wrong of ${d.R}`);
  let bo = 0;
  for (let i = 0; i < d.B; i++) {
    if (d.atoms[d.oPos[i]].name !== 'O' || d.atoms[d.hPos[i]].name !== 'H') bo++;
  }
  ok(bo === 0, 'every hydrogen bond runs from a carbonyl O to an amide H',
     `${bo} wrong of ${d.B}`);
}

/* A BACKBONE THAT STAYS A BACKBONE. Ball-and-stick shows bond lengths that
   a ribbon hides completely — the villin page learned this the hard way,
   where a cartoon exposed a squashed chain that spheres had concealed.
   Here the atoms are the drawing, so a stretched peptide bond is a visible
   gap between two atoms. Checked over the WHOLE trajectory, not just the
   deposited end. */
{
  const at = (f, i, k) => d.key[f][i * 3 + k];
  const dist = (f, i, j) => Math.hypot(at(f,i,0)-at(f,j,0), at(f,i,1)-at(f,j,1),
                                       at(f,i,2)-at(f,j,2));
  const byKey = new Map();
  d.atoms.forEach((a, i) => byKey.set(a.res + ':' + a.name, i));
  const find = (res, nm) => byKey.get(res + ':' + nm);

  /* THE PEPTIDE BOND, OVER THE WHOLE CHAIN, WHILE IT IS ON SCREEN.
     New in v3, and it is the intro that earns it: every one of the 145
     links is now drawn as a stick the student can pan to, so a stretched
     one is a visible gap between two atoms rather than a number nothing
     renders.

     BOUNDED OVER THE DRAWN RANGE, NOT THE WHOLE TRAJECTORY, and the
     difference is the point. The atoms fade out at FOCUS_OUT[1]; up to
     there the worst link in the chain is 1.383 A. Afterwards the solver
     stretches one loop (residues 77-81) to 1.474 at t=0.58 — 23 of 26,825
     measurements, none of them rendered, because by then the page is
     showing a ribbon. Asserting the tight bound over the whole run would
     fail on geometry nobody can see; asserting the loose one everywhere
     would stop catching a stretched stick in the intro, which is the thing
     this is for. So it is bounded where it is drawn, and the tail is
     bounded separately and loosely below. */
  const DRAWN_UNTIL = 0.40;                   // the page's FOCUS_OUT[1]
  let pepMin = Infinity, pepMax = 0, pepTail = 0;
  for (let f = 0; f < d.K; f++)
    for (let r = d.first; r < d.first + d.R - 1; r++) {
      const c1 = find(r, 'C'), n2 = find(r + 1, 'N');
      if (c1 == null || n2 == null) continue;
      const dp = dist(f, c1, n2);
      if (d.ts[f] <= DRAWN_UNTIL) {
        if (dp < pepMin) pepMin = dp;
        if (dp > pepMax) pepMax = dp;
      } else if (dp > pepTail) pepTail = dp;
    }
  ok(pepMin > 1.25 && pepMax < 1.40,
     `every peptide bond stays 1.25-1.40 A while the atoms are drawn (t<=${DRAWN_UNTIL})`,
     `${pepMin.toFixed(3)}-${pepMax.toFixed(3)} A`);
  ok(pepTail < 1.55, 'and never runs away after they are gone',
     `worst ${pepTail.toFixed(3)} A`);

  /* And the close-up's own alpha carbons, held to the tighter band the
     segment actually keeps — the whole chain runs looser (the global Ca
     assertion above allows to 4.2), but this stretch is the one shown at
     26 A where a stretched backbone is unmissable. */
  let caMin = Infinity, caMax = 0;
  for (let f = 0; f < d.K; f++)
    for (let r = foc.lo; r < foc.hi; r++) {
      const dc = dist(f, find(r, 'CA'), find(r + 1, 'CA'));
      if (dc < caMin) caMin = dc;
      if (dc > caMax) caMax = dc;
    }
  ok(caMin > 3.6 && caMax < 4.0,
     'the close-up\'s consecutive alpha carbons stay 3.6-4.0 A apart',
     `${caMin.toFixed(2)}-${caMax.toFixed(2)} A`);
}

/* THE CAMERA MAY NOT PULL OUT BEFORE THE HELIX IS MADE. hemoglobin-lab.html
   holds the close-up to t=FOCUS_OUT[0] and its caption says the student
   watches this stretch coil; if the segment's own hydrogen bonds are not
   shut by then, the page pulls away from an event it promised to show.
   The 0.34 is the page's number, repeated here on purpose — the two moving
   apart is the failure this catches. */
{
  const FOCUS_OUT_0 = 0.26;
  const ks = d.bonds.map((b, k) => [b, k])
    .filter(([b]) => Math.min(b.from, b.to) >= foc.lo && Math.max(b.from, b.to) <= foc.hi)
    .map(([, k]) => k);
  ok(ks.length >= 10, 'the focus segment has a helix\'s worth of hydrogen bonds',
     `${ks.length} bonds`);
  let f = 0;
  while (f < d.K - 1 && d.ts[f] < FOCUS_OUT_0) f++;
  const shut = ks.filter(k => d.formed[f][k] > 0.5).length;
  ok(shut / ks.length > 0.85,
     `the segment's helix is made before the camera leaves it (t=${FOCUS_OUT_0})`,
     `${shut}/${ks.length} bonds formed`);

  /* THE PULL-OUT'S CAPTION SAYS "the ends of the chain have coiled; the
     middle has not started", which is a claim about the picture at the
     moment it posts. The helices do not form together — that is the point —
     so this asserts the shape of the stagger rather than any one time:
     at the end of the camera move the two terminal helices are made and
     the four middle ones are not. If the trajectory ever changes so they
     coil evenly, the caption becomes false while still reading fine. */
  /* THE RIBBON IS HELD OFF THE SCREEN UNTIL THE SECONDARY ACT, and the
     point of holding it is that a cartoon is a summary of secondary
     structure — so it must not arrive over a chain that has none. The page
     fades it in over RIBBON_IN, starting at the level-2 caption; assert
     that bonds have actually begun forming by then. Paired with the t=0
     assertion above (no bonds at all, primary structure is sequence), this
     brackets the claim from both sides. */
  const RIBBON_IN_0 = 0.10;
  let r0 = 0;
  while (r0 < d.K - 1 && d.ts[r0] < RIBBON_IN_0) r0++;
  const begun = [...d.formed[r0]].filter(x => x > 0.5).length;
  ok(begun > 0, `the backbone has begun bonding when the ribbon fades in (t=${RIBBON_IN_0})`,
     `${begun}/${d.B} bonds formed`);

  const FOCUS_OUT_1 = 0.40;
  let g = 0;
  while (g < d.K - 1 && d.ts[g] < FOCUS_OUT_1) g++;
  const frac = ([a, b]) => {
    const kk = d.bonds.map((x, k) => [x, k])
      .filter(([x]) => Math.min(x.from, x.to) >= a && Math.max(x.from, x.to) <= b)
      .map(([, k]) => k);
    return kk.filter(k => d.formed[g][k] > 0.5).length / kk.length;
  };
  const ends = [[4, 18], [19, 34], [123, 143]].map(frac);
  const middle = [[50, 56], [57, 76], [85, 93], [99, 117]].map(frac);
  ok(Math.min(...ends) > 0.8 && Math.max(...middle) < 0.6,
     `at the pull-out the ends have coiled and the middle has not (t=${FOCUS_OUT_1})`,
     `ends ${ends.map(x => (x * 100) | 0).join('/')}%, middle ${middle.map(x => (x * 100) | 0).join('/')}%`);
}

/* THE TRAJECTORY IS AN UNFOLD PLAYED BACKWARDS, so "does the fold arrive
   near the measured structure" is not the question any more — it starts
   there, and the landing assertion above proves it. What has to be checked
   instead is the OTHER end: that reversing the unfold still opens on the
   same extended chain the page has always opened on, rather than on
   whatever conformation the unfold happened to reach. */
{
  /* Only the first of the three assertions here needs the bake — the target
     it compares against is what the unfold ran toward. The other two are
     properties of the committed first frame and survive --quick, which is
     the point of splitting them: the SHAPE of the opening chain is still
     checked in the fast mode. */
  let e = 0;
  if (!QUICK) {
    const ext = b.target;        // the rotated target the unfold ran against
    for (let i = 0; i < d.R; i++)
      for (let k = 0; k < 3; k++)
        e = Math.max(e, Math.abs(caK(0, i, k) - ext[b.caIdx[i]][k]));
  }
  /* NOT an equality. The unfold is driven toward the extended conformation
     by a clamped drift under constraints, so it approaches asymptotically
     and stops a little short — 1.9 A per atom on a rod 503 A long, which is
     0.4% and invisible. Snapping the frame onto the target exactly would
     buy nothing and would put a discontinuity at the one frame the student
     looks at longest. What matters is that it is still recognisably THE
     extended chain rather than some other open conformation, so the shape
     is checked as well as the distance. */
  const P0 = [];
  for (let i = 0; i < d.R; i++) P0.push(caP(0, i));
  const c0 = [0,1,2].map(k => P0.reduce((s, p) => s + p[k], 0) / P0.length);
  const span0 = 2 * Math.max(...P0.map(p => Math.hypot(p[0]-c0[0], p[1]-c0[1], p[2]-c0[2])));
  if (QUICK) console.log('  --    skipping the FoldLib.extended compare (--quick)');
  else ok(e < 3.0, 'the animation still opens on FoldLib.extended — the primary chain',
     `max ${e.toFixed(2)} A per atom over a ${span0.toFixed(0)} A rod`);
  ok(span0 > 480, 'and it really is extended, not merely open', `${span0.toFixed(0)} A across`);
  ok([...d.formed[0]].every(x => x <= 0.5),
     'with no hydrogen bonds at all — primary structure is sequence and nothing else',
     `${[...d.formed[0]].filter(x => x > 0.5).length} formed`);
}

/* THE PLATEAU IS THE LESSON, so it is asserted rather than left to the
   captions. Between these times the hydrogen-bond count must sit still
   while the molecule keeps collapsing — that is the whole claim that level
   2 finishes and level 3 then does its own work, and it is the one thing
   a change of method could quietly destroy while every other check here
   still passed. */
{
  const at = t => {
    let f = 0;
    while (f < d.K - 1 && d.ts[f] < t) f++;
    return f;
  };
  const span = (f) => {
    const P = [];
    for (let i = 0; i < d.R; i++) P.push(caP(f, i));
    const c = [0,1,2].map(k => P.reduce((s, p) => s + p[k], 0) / P.length);
    return 2 * Math.max(...P.map(p => Math.hypot(p[0]-c[0], p[1]-c[1], p[2]-c[2])));
  };
  const f0 = at(0.55), f1 = at(0.88);
  let lo = Infinity, hi = 0;
  for (let f = f0; f <= f1; f++) {
    const n = [...d.formed[f]].filter(x => x > 0.5).length;
    lo = Math.min(lo, n); hi = Math.max(hi, n);
  }
  /* WIDENED FROM 2 TO 6, DELIBERATELY, and the history matters because 6 is
     not the original intent. An earlier trajectory drove every linker atom
     toward its own extended position and held this at exactly 83 — dead
     flat. It also made all six loops extend at once and independently,
     which read on screen as the chain being pulled at several points, so
     the pull was moved to each linker's two junctions instead. That lets a
     few inter-helix bonds seat during the tertiary act rather than all at
     the finish, and the plateau loosened from 0 to about 4.

     What must NOT loosen is the contrast. Pulling only the chain's two
     termini looks better still and was rejected here: it takes the count
     straight through 50, 59, 87, 94, 98 across the same window, which is
     bonds and compaction happening together — the exact conflation this
     page exists to break. If this assertion ever needs widening again,
     that is the thing to check it against, not the number. */
  ok(hi - lo <= 6, 'the H-bond count nearly holds still across the tertiary act (level 2 is done)',
     `${lo}..${hi} bonds between t=0.55 and t=0.88`);

  /* The contrast itself, asserted rather than left implied: the count has
     to climb far more during the secondary act than during the tertiary
     one, over comparable collapses. This is the claim the captions make. */
  const nAt = f => [...d.formed[f]].filter(x => x > 0.5).length;
  const secGain = nAt(f0) - nAt(at(0.10));
  const terGain = hi - lo;
  ok(secGain > 8 * Math.max(1, terGain),
     'and it climbed far more during the secondary act — the two levels are distinct',
     `+${secGain} bonds secondary vs +${terGain} tertiary`);
  ok(span(f0) / span(f1) > 1.8, '...while the molecule keeps collapsing (level 3 is not)',
     `${span(f0).toFixed(0)} A -> ${span(f1).toFixed(0)} A`);
}

/* ---------------- the landing ----------------
   bake-hb.js blends the last 14% of the trajectory onto the deposited
   coordinates, because a 1.24 A relaxation draws as a kinked cartoon. That
   is defensible ONLY while two things stay true, so both are asserted: the
   final frame really is the measured structure, and the SOLVER — measured
   before any blending — still gets there on its own. Without the second,
   the landing would be free to paper over a fold that had stopped working,
   which is exactly the failure it would be easiest to stop noticing. */

let landErr = 0;
for (let i = 0; i < d.R; i++)
  for (let k = 0; k < 3; k++)
    landErr = Math.max(landErr, Math.abs(caK(d.K - 1, i, k) - d.native[i][k]));
ok(landErr < 0.02, 'the last frame IS the deposited chain, not an approximation of it',
   `max ${landErr.toFixed(4)} A`);

ok([...d.formed[d.K - 1]].every(x => x > 0.5),
   'every one of the 103 hydrogen bonds is formed in the last frame',
   `${[...d.formed[d.K - 1]].filter(x => x > 0.5).length}/${d.B}`);

/* Geometry must survive the blend. Interpolating between two conformations
   bends angles as readily as it shortens bonds, and the Ca-Ca spacing is
   the tell — it is held only by the N-CA-C and CA-C-N angles, so a landing
   that repaired bond lengths alone crushed it to 1.83 A against 3.80. */
let minCA = Infinity, maxCA = 0;
for (let f = 0; f < d.K; f++)
  for (let i = 0; i + 1 < d.R; i++) {
    const p = caP(f, i), q = caP(f, i + 1);
    const L = Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2]);
    if (L < minCA) minCA = L;
    if (L > maxCA) maxCA = L;
  }
ok(minCA > 3.0 && maxCA < 4.6,
   'Ca-Ca spacing holds near 3.80 A through the whole trajectory, landing included',
   `${minCA.toFixed(2)} .. ${maxCA.toFixed(2)} A`);

/* ---------------- the chain must not pass through itself ----------------
   The reason act 3 looked wrong: two helices drawn as solid bands sliding
   across each other about halfway through the tertiary collapse. The solver
   allows it — its steric push only switches on once atoms are already within
   2.7 A, and a strand moving fast crosses that shell between substeps — so
   settle() separates them afterwards. 3.6 A is comfortably clear of the
   ribbon, which is 2.6 A wide, and below the deposited structure's own
   closest non-local contact so it never fights the landing. */
let minNL = Infinity, nlAt = 0;
for (let f = 0; f < d.K; f++)
  for (let i = 0; i < d.R; i++)
    for (let j = i + 3; j < d.R; j++) {
      const L = Math.hypot(caK(f,i,0) - caK(f,j,0),
                           caK(f,i,1) - caK(f,j,1),
                           caK(f,i,2) - caK(f,j,2));
      if (L < minNL) { minNL = L; nlAt = d.ts[f]; }
    }
ok(minNL > 2.8, 'no two non-neighbouring Ca ever come closer than the ribbon is wide',
   `closest ${minNL.toFixed(2)} A at t=${nlAt.toFixed(2)} (band is 2.6 A)`);

/* ---------------- the peptide bond stays trans ----------------
   Consecutive Ca are 3.80 A apart across a trans peptide and about 2.9
   across cis, which this protein does not have. Nothing in a 1-2 plus 1-3
   constraint set says so — omega is a 1-4 torsion — and settle() duly
   rotated through it, closing consecutive Ca to 2.56 A: past cis, into
   geometry no peptide can adopt. folding.js hit the same bug and fixed it
   the same way; this asserts the post-process did not reintroduce it. Note
   this is a DIFFERENT measurement from the Ca-Ca spacing check above, which
   is why that one passing did not catch it. */
let minOmega = Infinity;
for (let f = 0; f < d.K; f++)
  for (let i = 0; i + 1 < d.R; i++) {
    const L = Math.hypot(caK(f,i,0) - caK(f,i+1,0),
                         caK(f,i,1) - caK(f,i+1,1),
                         caK(f,i,2) - caK(f,i+1,2));
    if (L < minOmega) minOmega = L;
  }
ok(minOmega > 3.4, 'every peptide bond stays trans (cis would close Ca-Ca to ~2.9 A)',
   `closest consecutive Ca ${minOmega.toFixed(2)} A, trans is 3.80`);

/* And the landing must not be a jump. A blend projected frame-by-frame
   independently put a 2.7 A jolt into a stretch where the solver's own
   steps are 0.7; walking the frames in order fixed it. The threshold is
   the solver's own largest step through the same window. */
let maxStep = 0;
const allSteps = [];
for (let f = 1; f < d.K; f++) {
  let worst = 0;
  for (let i = 0; i < d.R; i++) {
    const s = Math.hypot(caK(f,i,0) - caK(f-1,i,0),
                         caK(f,i,1) - caK(f-1,i,1),
                         caK(f,i,2) - caK(f-1,i,2));
    if (s > worst) worst = s;
  }
  allSteps.push(worst);
  if (worst > maxStep) maxStep = worst;
}
/* Loosened from 2.2 when de-clashing arrived, and the number deserves
   stating rather than just raising. The median step is 1.80 A and 176 of
   184 frames are under 2.2; the eight that are not sit between t=0.86 and
   0.93, inside the landing, where the blend and the steric term are pulling
   the same residues in different directions. It is 33 residues, mostly
   helical rather than a flapping terminus, each moving quickly for a frame
   or two. This is the loosest assertion in the file and the one to tighten
   if the collapse ever reads as jumpy. */
/* Tightened right back down now that the trajectory is resampled by arc
   length: every keyframe is the same distance of travel from the last, so
   the largest step and the median sit within a few percent of each other
   instead of a factor of two and a half. The RATIO is the real check —
   an absolute bound would pass a trajectory that crawled and then lunged,
   which is exactly what the forward bake did. */
{
  const sorted = allSteps.slice().sort((x, y) => x - y);
  const median = sorted[sorted.length >> 1];
  ok(maxStep / median < 1.35, 'the chain moves at an even rate — no crawl-then-lunge',
     `largest ${maxStep.toFixed(2)} A vs median ${median.toFixed(2)} A`);
}

/* ---------------- handedness: the one mirror an internal check CAN catch ---------------- */

/* MolecularGeometry.md 1.3 is right that a global mirror is invisible to
   internal checks IN GENERAL — but not here. An alpha helix is RIGHT-handed,
   and that is a fact about the molecule rather than about our coordinates,
   so the sign of the Ca(i)->Ca(i+3) screw is a real test. Mirror the fold
   and every one of these flips. FoldLib.orient() guards its basis to
   det=+1 for exactly this reason; this asserts the guard worked, on the
   final frame the student actually sees.

   THE WINDOW IS GEOMETRIC, NOT FROM THE RECORDS, and that distinction is
   what makes the test sharp. Screening on ss==='H' alone counts frayed
   helix ends, where the sign is meaningless, and buries the signal: the
   deposited chain scores 95/4 that way and the folded one 74/25, which is
   too noisy to assert anything on. Requiring Ca(i)->Ca(i+3) to be 4.9-5.6 A
   as well — an actual alpha turn — takes the deposited chain to 84/0. */
const A_MIN = 4.9, A_MAX = 5.6;                // Ca i->i+3 across one alpha turn

function twist(P, i) {
  const s = (a, c) => [P[c][0]-P[a][0], P[c][1]-P[a][1], P[c][2]-P[a][2]];
  const u = s(i, i + 1), v = s(i + 1, i + 2), w = s(i + 2, i + 3);
  const c = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  return c[0]*w[0] + c[1]*w[1] + c[2]*w[2];
}
function handedness(P) {
  let right = 0, left = 0;
  for (let i = 0; i + 3 < d.R; i++) {
    if (!(d.ss[i] === 'H' && d.ss[i+1] === 'H' && d.ss[i+2] === 'H' && d.ss[i+3] === 'H')) continue;
    const d3 = Math.hypot(P[i+3][0]-P[i][0], P[i+3][1]-P[i][1], P[i+3][2]-P[i][2]);
    if (d3 < A_MIN || d3 > A_MAX) continue;
    if (twist(P, i) > 0) right++; else left++;
  }
  return { right, left };
}

/* TESTED MID-TRAJECTORY, not at t=1. The last frame is the deposited
   structure by construction, so a handedness test there would only
   re-measure the crystal and would pass however badly mirrored the
   computed part had become — a check that cannot fail is worse than no
   check, because it reads as coverage. t=0.70 is inside the plateau: the
   helices are fully formed and are being moved by the calculation, which
   is exactly where a mirrored basis would show. */
const midF = (() => { let f = 0; while (f < d.K - 1 && d.ts[f] < 0.70) f++; return f; })();
const CA = [];
for (let i = 0; i < d.R; i++)
  CA.push(caP(midF, i));

/* The deposited chain is the calibration: it is a measured alpha helix, so
   there is no tolerance to give it. */
const dep = handedness(d.native);
ok(dep.left === 0 && dep.right > 50, 'every alpha turn in the deposited chain is right-handed',
   `${dep.right} right / ${dep.left} left`);

/* The folded chain gets a threshold rather than zero, because it is a
   relaxation that lands 1.24 A out and a few turns really are imperfect.
   A MIRROR IS STILL UNMISSABLE HERE — it does not degrade this ratio, it
   inverts it, so anything above half already rules one out and 85% leaves
   room for the fold to be locally scruffy without hiding a flip. */
const fold = handedness(CA);
ok(fold.right / (fold.right + fold.left) > 0.85,
   'the computed part of the trajectory is right-handed too (a mirror would invert this)',
   `${fold.right} right / ${fold.left} left`);

/* ---------------- level 4: the other three chains ----------------
   The quaternary act is DEPOSITED coordinates placed in the trajectory's
   frame, so the two things that can be wrong are invisible from the page:
   a stale file, and a frame that does not match. Both are checked here. */
{
  const QBIN = path.join(HERE, 'data', '2HHB-quaternary.json');
  const { bakeQuaternary } = require('./bake-quaternary.js');
  const committed = JSON.parse(fs.readFileSync(QBIN, 'utf8'));
  const fresh = bakeQuaternary();
  ok(JSON.stringify(committed) === JSON.stringify(fresh),
     'hemoglobin/data/2HHB-quaternary.json is not stale',
     're-run: node hemoglobin/tools/bake-quaternary.js');

  ok(committed.order.join('') === 'ACD' && committed.folded === CHAIN,
     'the three placed chains are A, C, D and the folded one is B');
  ok(committed.chains.A.kind === 'alpha' && committed.chains.C.kind === 'alpha' &&
     committed.chains.D.kind === 'beta',
     'two alpha and one more beta — the page colours them by kind');
  ok(committed.chains.A.CA.length === 141 && committed.chains.C.CA.length === 141,
     'each alpha chain is 141 residues',
     `${committed.chains.A.CA.length}/${committed.chains.C.CA.length}`);
  ok(committed.chains.D.CA.length === 146, 'the second beta chain is 146, same as ours');
  ok(Object.keys(committed.iron).length === 4 &&
     ['A','B','C','D'].every(id => committed.iron[id]),
     'four heme irons, one per chain');

  /* THE HEME, which level 4 now draws ball-and-stick — the only atoms this
     page shows at the tetramer scale, so what they claim has to be checked.
     Protoporphyrin IX with its iron is C34 H32 FE N4 O4; heavy atoms only,
     that is 34 C + 4 N + 4 O + 1 Fe = 43. The connectivity comes from
     2HHB's CONECT records, so what is worth asserting is not the bond count
     but the SHAPE it makes: the iron four-coordinate to the four pyrrole
     nitrogens (it is what the ring is holding, and a distance-cutoff bond
     list gets this wrong by also joining the nitrogens to each other), no
     atom left unbonded, and every bond a real bond length. */
  for (const id of ['A','B','C','D']) {
    const h = committed.heme[id];
    const count = el => h.atoms.filter(a => a.el === el).length;
    ok(h.atoms.length === 43 && count('C') === 34 && count('N') === 4 &&
       count('O') === 4 && count('FE') === 1,
       `heme ${id} is protoporphyrin IX + Fe — 34 C, 4 N, 4 O, 1 Fe`,
       `${h.atoms.length} atoms: ${count('C')}/${count('N')}/${count('O')}/${count('FE')}`);

    const fe = h.atoms.findIndex(a => a.el === 'FE');
    const held = h.bonds.filter(b => b.includes(fe))
                        .map(b => h.atoms[b[0] === fe ? b[1] : b[0]].name).sort();
    ok(held.join(' ') === 'NA NB NC ND',
       `heme ${id}'s iron is held by its four pyrrole nitrogens`, held.join(' ') || 'nothing');

    const deg = new Array(h.atoms.length).fill(0);
    h.bonds.forEach(([i, j]) => { deg[i]++; deg[j]++; });
    const loose = deg.reduce((n, d2) => n + (d2 === 0 ? 1 : 0), 0);
    ok(loose === 0, `heme ${id} has no unbonded atom`, `${loose} floating`);

    /* 1.2 A is a C=O, 2.1 A is the Fe-N coordination bond; anything outside
       that is not a bond and would draw as a stick through empty space. */
    let lo = Infinity, hi = 0;
    for (const [i, j] of h.bonds) {
      const a = h.atoms[i].p, b = h.atoms[j].p;
      const L = Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
      lo = Math.min(lo, L); hi = Math.max(hi, L);
    }
    ok(lo > 1.15 && hi < 2.2, `heme ${id}'s bonds are all real bond lengths`,
       `${lo.toFixed(2)}-${hi.toFixed(2)} A`);
  }

  /* ---- the two axial sites, which is what the callouts name ----
     "O2 binds here" is a claim about a LOCATION, so the location is
     checked. The iron has one axial site each side of the ring: the
     proximal one holds His F8, the distal one is where oxygen goes. Get
     the sign backwards and the label sits inside the protein, pointing at
     the histidine it is supposed to be pointing away from — which looks
     entirely plausible from any one camera angle. */
  const PROX_RES = { A: 87, C: 87, B: 92, D: 92 };   // alpha and beta number F8 differently
  const dist3 = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
  for (const id of ['A','B','C','D']) {
    const h = committed.heme[id];
    const fe = h.atoms.find(a => a.el === 'FE').p;
    const D = dist3;

    ok(h.proxRes === PROX_RES[id], `chain ${id}'s heme hangs off His F8 (${PROX_RES[id]})`,
       `His${h.proxRes}`);
    const dProx = D(h.prox, fe);
    ok(dProx > 1.9 && dProx < 2.3, `chain ${id}: Fe-NE2 is a real bond`, `${dProx.toFixed(2)} A`);
    ok(Math.abs(D(h.o2, fe) - 1.8) < 0.01, `chain ${id}: the O2 site is 1.8 A off the iron`);

    /* The two sites are TRANS — 180 degrees apart through the iron. This is
       the geometric statement that they are opposite faces of the ring, and
       it is what a sign error breaks first. */
    let cos = 0;
    for (let k = 0; k < 3; k++) cos += (h.prox[k]-fe[k]) * (h.o2[k]-fe[k]);
    cos /= dProx * 1.8;
    /* Clamped, and it has to be: a site that is EXACTLY trans puts cos a
       float's width past -1, and acos of that is NaN — which fails the
       assertion for being too correct. */
    const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    ok(ang > 170, `chain ${id}: the O2 site is trans to the histidine, across the ring`,
       `${ang.toFixed(1)} deg`);
  }

  /* THE INDEPENDENT CHECK ON THE SIGN. Everything above is derived from the
     same ring normal, so it would all agree with itself if the normal were
     flipped. His E7 is not: it is the DISTAL histidine, the one that gates
     the oxygen pocket from the other side, and the page already names it.
     If the site is really where oxygen binds it must be nearer E7 than F8. */
  const DISTAL_RES = { A: 58, C: 58, B: 63, D: 63 };
  const rawPdb = fs.readFileSync(SRC, 'utf8');
  /* One parse, not four: the rotation is a property of the bake, the same
     matrix for every chain. */
  const Rq = (function () {
    const p = FoldLib.parse(extract(rawPdb, CHAIN).text, {});
    FoldLib.orient(p); return p.orientation;
  })();
  for (const id of ['A','B','C','D']) {
    const h = committed.heme[id];
    const e7 = extract(rawPdb, id).residues.find(r => r.num === DISTAL_RES[id]);
    ok(e7 && e7.name === 'HIS',
       `chain ${id} residue ${DISTAL_RES[id]} is His E7, the distal gate`);
    /* Rotated into the frame the heme is in, the way everything else that
       meets these coordinates has to be. */
    const ne2 = Rq.map(ax => ax[0]*e7.atoms.NE2[0] + ax[1]*e7.atoms.NE2[1] + ax[2]*e7.atoms.NE2[2]);
    ok(dist3(ne2, h.o2) < dist3(ne2, h.prox),
       `chain ${id}: the O2 site is on His E7's side of the ring, not His F8's`,
       `E7 is ${dist3(ne2, h.o2).toFixed(1)} A from the site, ` +
       `${dist3(ne2, h.prox).toFixed(1)} from F8`);
  }

  /* The ring is FLAT — that is the whole visual point of drawing it, and it
     is the one property a wrong frame or a bad rotation would destroy while
     leaving every distance above intact. Plane fitted to the 24 macrocycle
     atoms by the smallest principal axis. */
  for (const id of ['A','B','C','D']) {
    const h = committed.heme[id];
    const ring = h.atoms.filter(a => /^(C[1-4][A-D]|CH[A-D]|N[A-D])$/.test(a.name)).map(a => a.p);
    const c = [0,1,2].map(k => ring.reduce((s, p) => s + p[k], 0) / ring.length);
    /* Covariance, then the smallest eigenvalue by inverse iteration is
       overkill for 24 points — sweep directions instead and keep the best. */
    let best = Infinity;
    for (let t = 0; t < 400; t++) {
      const th = Math.acos(1 - 2 * (t + 0.5) / 400), ph = t * 2.399963;
      const n = [Math.sin(th)*Math.cos(ph), Math.sin(th)*Math.sin(ph), Math.cos(th)];
      let rms = 0;
      for (const p of ring) {
        const d2 = n[0]*(p[0]-c[0]) + n[1]*(p[1]-c[1]) + n[2]*(p[2]-c[2]);
        rms += d2 * d2;
      }
      best = Math.min(best, Math.sqrt(rms / ring.length));
    }
    ok(ring.length === 24 && best < 0.35,
       `heme ${id}'s macrocycle is planar`,
       `${ring.length} ring atoms, rms ${best.toFixed(2)} A off the best plane`);
  }

  /* THE FRAME. bake-quaternary re-derives orient()'s rotation; if it ever
     stops matching, the tetramer assembles around a chain lying in a
     different basis and the picture is quietly, plausibly wrong. */
  let maxDev = 0;
  for (let i = 0; i < d.R; i++)
    maxDev = Math.max(maxDev, Math.hypot(
      d.native[i][0] - committed.foldedTrace[i][0],
      d.native[i][1] - committed.foldedTrace[i][1],
      d.native[i][2] - committed.foldedTrace[i][2]));
  ok(maxDev < 0.02, 'the placed chains are in the trajectory\'s own frame',
     `chain B agrees to ${maxDev.toFixed(3)} A (2-dp rounding)`);

  /* THE ARRIVAL ORDER IS A MEASURED FACT, and the captions now quote the
     numbers, so they are asserted. alpha1-beta1 is the large tight
     interface that assembles first; alpha1-beta2 is the smaller one that
     slides during the T->R switch; the two beta chains do not touch each
     other at all. Counted the way bake-quaternary counts contact. */
  const CT = committed.contactRadius;
  const pairs = (X, Y) => {
    let n = 0;
    for (const a of X) for (const b of Y)
      if (Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]) <= CT) n++;
    return n;
  };
  const AB = pairs(committed.chains.A.CA, committed.foldedTrace);
  const CB = pairs(committed.chains.C.CA, committed.foldedTrace);
  const DB = pairs(committed.chains.D.CA, committed.foldedTrace);
  ok(AB === 72 && CB === 43,
     'alpha1-beta1 is the bigger interface — the measurement ARRIVE is staged on',
     `A-B ${AB}, C-B ${CB} contacts within ${CT} A`);
  ok(AB > CB * 1.5, 'the page arrives A first because A-B is the tighter join');
  ok(DB === 0, 'the two beta chains never touch, so D docks on the alphas only',
     `${DB} contacts`);

  /* Every arriving chain lands on a real interface and makes real bonds on
     the way in. A chain with no bonds docks in silence; a chain with dozens
     buries the molecule in dashes, since the page draws one per entry here.
     So this is also a cap on how much ink the cue can spend. */
  for (const id of committed.order) {
    const c = committed.chains[id];
    ok(c.contact.self > 15 && c.contact.other > 15,
       `chain ${id} lands on a real interface`,
       `${c.contact.self} of its own residues against ${c.contact.other}`);
    ok(c.bonds.length >= 6 && c.bonds.length <= 20,
       `chain ${id} makes a drawable number of interface hydrogen bonds`,
       `${c.bonds.length} dashes`);
    ok(c.bonds.every(b => b.d <= committed.polarRadius),
       `chain ${id}'s interface bonds are all within the polar cutoff`);
  }

  /* Nothing else is on screen when A arrives, so its bond list IS the
     alpha1-beta1 interface, and the page draws one dash for each. */
  ok(committed.chains.A.bonds.length === 8,
     'alpha1 docks with eight hydrogen bonds, and eight dashes are drawn',
     `${committed.chains.A.bonds.length}`);

  /* The packing is the majority, which is why it must stay undrawn: a dash
     per contact would say the interface is held by bonds. */
  ok(committed.chains.A.contact.self > committed.chains.A.bonds.length * 2,
     'far more residues touch than bond, so the dashes cannot be the whole join',
     `${committed.chains.A.contact.self} contact vs ${committed.chains.A.bonds.length} bonds`);

  /* His F8 of every chain holds its own iron: 2.0-2.5 A Fe-NE2 in the
     deposited structure. Checked on the irons AS PLACED, so it also
     catches a rotation applied to one and not the other. */
  const rawAll = fs.readFileSync(SRC, 'utf8');
  const F8 = { A: 87, B: 92, C: 87, D: 92 };
  let worst = 0;
  for (const id of ['A', 'B', 'C', 'D']) {
    const CAtrace = id === CHAIN ? committed.foldedTrace : committed.chains[id].CA;
    const first = id === CHAIN ? 1 : committed.chains[id].first;
    const ca = CAtrace[F8[id] - first];
    const fe = committed.iron[id];
    worst = Math.max(worst, Math.hypot(ca[0]-fe[0], ca[1]-fe[1], ca[2]-fe[2]));
  }
  ok(worst < 12, 'each iron sits in its own chain\'s pocket, by His F8',
     `furthest Ca(F8)-Fe is ${worst.toFixed(1)} A`);
}

/* ---------------- level 1's flat chain ----------------
   The page opens on a chain that is in no data file: the ideal all-trans
   extended conformation, generated in hemoglobin-lab.html from bond
   lengths, bond angles and three fixed torsions. That is a chemical claim
   with no measurement behind it to keep it honest, so it is asserted here
   — and the assertions run THE PAGE'S OWN SOURCE, lifted out of the HTML,
   rather than a copy of the generator that could drift from it.

   THE SIGN OF A TORSION IS THE POINT OF THE LAST ASSERTION. An inverted
   placeAtom() cannot be caught by looking at the flat chain: every torsion
   in an ideal extended chain is 180 or 0, and both are their own
   negatives. A mirrored builder is exactly the class of bug
   MolecularGeometry.md 1.3 says no internal check can catch from the
   output, so it is caught here at the input instead. */
{
  /* The three Vector3 operations the generator uses, so the page's code
     can run outside a browser. Anything more and this would be a second
     implementation to keep in step, which is the thing it exists to avoid. */
  class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    normalize() { const n = Math.hypot(this.x, this.y, this.z);
                  this.x /= n; this.y /= n; this.z /= n; return this; }
    crossVectors(a, b) { this.x = a.y*b.z - a.z*b.y; this.y = a.z*b.x - a.x*b.z;
                         this.z = a.x*b.y - a.y*b.x; return this; }
  }
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'hemoglobin-lab.html'), 'utf8');
  const from = html.indexOf('const IDEAL = {');
  const to = html.indexOf('/* ---------- the settle, residue by rigid residue');
  ok(from > 0 && to > from, 'the page still has a flat-chain generator to check');

  const HbFold = require('../hbfold.js');
  const fold = HbFold.decode(fs.readFileSync(BIN).buffer);
  const src = html.slice(from, to);
  const api = new Function('fold', 'THREE', 'smoothstep',
    src + '\n return { IDEAL, placeAtom, buildFlatChain, get flatP() { return flatP; } };'
  )(fold, { Vector3: V3 }, x => x);

  /* buildFlatChain also wires up the settle, which needs more of THREE than
     is stubbed here; the generator runs first, so catch the later throw. */
  let flatP = null;
  try { api.buildFlatChain(); } catch (e) { /* expected: the blend needs Quaternion */ }
  flatP = api.flatP;
  ok(flatP && flatP.length === fold.A,
     'the flat chain covers every backbone atom', `${flatP ? flatP.length : 0} of ${fold.A}`);

  if (flatP) {
    const at = {};
    fold.atoms.forEach((a, i) => { (at[a.name] = at[a.name] || {})[a.res] = i; });
    const D = (i, j) => Math.hypot(flatP[i][0]-flatP[j][0], flatP[i][1]-flatP[j][1],
                                   flatP[i][2]-flatP[j][2]);
    const ANG = (i, j, k) => {
      const u = [flatP[i][0]-flatP[j][0], flatP[i][1]-flatP[j][1], flatP[i][2]-flatP[j][2]];
      const v = [flatP[k][0]-flatP[j][0], flatP[k][1]-flatP[j][1], flatP[k][2]-flatP[j][2]];
      return Math.acos((u[0]*v[0]+u[1]*v[1]+u[2]*v[2]) /
                       (Math.hypot(...u)*Math.hypot(...v))) * 180 / Math.PI;
    };
    const span = a => [Math.min(...a), Math.max(...a)];
    const R = fold.R, r0 = fold.first;
    const caca = [], tau = [], nca = [], cac = [], cn = [], co = [];
    for (let r = r0; r < r0 + R; r++) {
      nca.push(D(at.N[r], at.CA[r])); cac.push(D(at.CA[r], at.C[r]));
      co.push(D(at.C[r], at.O[r])); tau.push(ANG(at.N[r], at.CA[r], at.C[r]));
      if (r + 1 < r0 + R) { cn.push(D(at.C[r], at.N[r+1])); caca.push(D(at.CA[r], at.CA[r+1])); }
    }
    const near = (a, want, tol) => span(a).every(v => Math.abs(v - want) < tol);
    ok(near(nca, api.IDEAL.N_CA, 1e-6) && near(cac, api.IDEAL.CA_C, 1e-6) &&
       near(cn, api.IDEAL.C_N, 1e-6) && near(co, api.IDEAL.C_O, 1e-6),
       'every flat-chain bond is its textbook length',
       `N-CA ${nca[0].toFixed(3)}, CA-C ${cac[0].toFixed(3)}, C-N ${cn[0].toFixed(3)}`);
    ok(near(tau, api.IDEAL.ang_N_CA_C, 1e-6),
       'every N-CA-C angle is the textbook 111 degrees', `${tau[0].toFixed(2)}`);

    /* 3.8 Å is the trans peptide's own spacing — a cis one would be 2.9,
       which is the single number that says the chain is built right. */
    const [cLo, cHi] = span(caca);
    ok(cLo > 3.79 && cHi < 3.81 && cHi - cLo < 1e-6,
       'consecutive alpha carbons sit 3.80 A apart, every link (trans)',
       `${cLo.toFixed(3)}-${cHi.toFixed(3)} A`);

    /* Flat means FLAT: one plane, to floating-point noise. It is what the
       opening top-down camera is for, and the reason a student can read
       the sequence along the chain at all. */
    const ys = flatP.map(p => p[1]);
    const thick = Math.max(...ys) - Math.min(...ys);
    ok(thick < 1e-9, 'the flat chain lies in one plane', `${thick.toExponential(1)} A thick`);

    /* Extended, not coiled: 3.6 A of rise per residue. An alpha helix is
       1.5, so this cannot silently become one. */
    const rise = Math.hypot(flatP[at.CA[r0+R-1]][0] - flatP[at.CA[r0]][0],
                            flatP[at.CA[r0+R-1]][1] - flatP[at.CA[r0]][1],
                            flatP[at.CA[r0+R-1]][2] - flatP[at.CA[r0]][2]) / (R - 1);
    ok(rise > 3.5 && rise < 3.7, 'the chain is extended, ~3.6 A per residue',
       `${rise.toFixed(2)} A`);
  }

  /* The torsion convention, at the input: ask for +60 and measure +60. */
  const dihedral = (a, b, c, d) => {
    const s = (u, v) => [u[0]-v[0], u[1]-v[1], u[2]-v[2]];
    const cr = (u, v) => [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const dt = (u, v) => u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
    const b1 = s(b, a), b2 = s(c, b), b3 = s(d, c);
    const n1 = cr(b1, b2), n2 = cr(b2, b3);
    const nb2 = Math.hypot(...b2), m = cr(n1, b2.map(v => v / nb2));
    return Math.atan2(dt(m, n2), dt(n1, n2)) * 180 / Math.PI;
  };
  let worstTor = 0;
  for (const want of [30, 60, -60, 120, -120, 175]) {
    const a = [0,0,0], b = [1.5,0,0], c = [2.0,1.4,0];
    const got = dihedral(a, b, c, api.placeAtom(a, b, c, 1.5, 110, want));
    worstTor = Math.max(worstTor, Math.abs(got - want));
  }
  ok(worstTor < 1e-6, 'placeAtom builds the torsion it is asked for, SIGN INCLUDED',
     `worst ${worstTor.toExponential(1)} deg — a flipped sign here mirrors the molecule`);
}

/* ---------------- level 1's side chains ----------------
   The page grafts an R group onto all 146 residues from residues.js. A
   type missing from that table would draw nothing at all for that
   residue — a bare backbone in a row of side chains, which reads as a
   glycine rather than as a fault. So the coverage is asserted here, where
   the chain's own sequence is known. */
{
  const ResidueLib = require('../../lib/residues.js');
  const d2 = decode(fs.readFileSync(BIN));
  const missing = [...new Set(d2.resNames)].filter(t => !ResidueLib.SIDE[t]);
  ok(missing.length === 0,
     'residues.js covers every residue type in this chain',
     missing.length ? 'MISSING: ' + missing.join(' ')
                    : `${new Set(d2.resNames).size} distinct types over 146 residues`);

  /* Glycine is the only one that legitimately draws nothing, and the
     count is a property of this chain worth pinning: a table that started
     returning empty side chains would otherwise look like more glycine. */
  const gly = d2.resNames.filter(t => t === 'GLY').length;
  const empty = d2.resNames.filter(t => ResidueLib.SIDE[t] &&
                                        !ResidueLib.SIDE[t].atoms.length).length;
  ok(gly === empty && gly === 13,
     'the 13 residues with no side chain drawn are exactly the glycines',
     `${gly} glycine, ${empty} empty`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
