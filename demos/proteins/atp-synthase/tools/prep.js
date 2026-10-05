#!/usr/bin/env node
/* =====================================================================
 *  prep.js — ATP synthase: the three catalytic sites, and the machine
 *  they sit in.
 *
 *  Run:  node proteins/atp-synthase/tools/prep.js   (offline, no deps)
 *
 *  UNDER REVIEW. Nothing is in proteins/proteins.js yet, because everything
 *  in that file is a decision and none has been made. The CANDIDATES table
 *  below is what step 4 gets handed; what survives moves into the registry
 *  and this table is deleted in the same commit. `data/candidates.json` is
 *  written from it so the bench has something to read in the meantime, and
 *  it goes away with the table.
 *
 *  THE SUBJECT IS THE ROTATION. Review cut the catalytic-site group from
 *  four views to two: what a reader wants from this enzyme is the motor,
 *  and the two sites that survive are the ones the motor's turn explains —
 *  empty, and still holding the product it has not released. Everything
 *  about the three-state binding change mechanism that the sites used to
 *  carry is now carried by the three rotary states instead, where it is a
 *  measurement rather than an arrangement of buttons.
 *
 *  THREE VIEWS ON THE BENCH, AND TWO MORE STRUCTURES READ TO CALIBRATE THEM:
 *
 *    open, dp    one beta subunit each, superposed on the P-loop so the site
 *                coincides and the domain swing does not. The two states
 *                either side of letting the product go.
 *    human       the whole enzyme, and the thing that turns.
 *    state2/3    `measureOnly`. Not on the bench: they are where the spin's
 *                axis and angles come from, and they are dropped after the
 *                measuring. Keeping them as sources rather than deleting
 *                them is what makes the rotation re-derivable instead of
 *                three numbers somebody once typed.
 *
 *  Review also cut the bovine F1 assembly and the c11 rotor ring. Both were
 *  good views of something the bench is no longer about: F1 showed where the
 *  sites sit inside the head, and the ring showed one ion per subunit in an
 *  organism this bench does not otherwise mention. `human` holds a c8 ring
 *  and the whole head, so neither claim lost its only home.
 *
 *  FIT ON WHAT THE VIEW IS ABOUT, twice, and both are the interesting
 *  decision rather than a default:
 *
 *    · THE FOUR SITES FIT ON THE P-LOOP, residues 156-163, backbone atoms
 *      only. Not on the beta subunit's Ca trace, and the difference is the
 *      whole picture: beta-E is open because its C-terminal domain has
 *      swung away from the nucleotide, so a whole-chain fit splits the
 *      difference and misaligns the site in every view to make the domains
 *      agree. Fitting the eight residues that grip the phosphates puts the
 *      chemistry in one place and lets the swing be visible.
 *    · THE THREE STATES FIT ON THE HEAD, chains A-F, by chain and residue
 *      number. The alpha3beta3 hexamer is the part that does not turn, so
 *      aligning it is what makes the rotor's third-of-a-turn legible as
 *      rotation instead of as three unrelated boxes. The residual is
 *      printed: if these three already shared a frame it would come back
 *      near zero, and the panel should say so rather than implying a fit
 *      did work it did not do.
 *
 *  NOTHING HERE IS AN ANIMATION AND THE BAKER CANNOT MAKE ONE. Every file
 *  is a still. The turn between the states is inference from kinetics, and
 *  the bench says so in words rather than tweening between them.
 *
 *  THE HUMAN STRUCTURES ARE mmCIF AND THERE IS NO .pdb, which is what
 *  `proteins/cif-lib.js` was written for: 28 chains and 39,000 atoms is
 *  past what the legacy format holds, so RCSB publishes one and 404s the
 *  other. The conversion is records-only and `proteins/bake-lib.js` reads
 *  the result, so the altloc rule and the read-never-detected rule are the
 *  same ones every other protein in the repo gets.
 *
 *  SOURCES, for a re-run from scratch. ~30 MB raw against the ~700 KB
 *  baked here, and data/src/ is gitignored:
 *
 *    cd proteins/atp-synthase/data/src
 *    for id in 1BMF 1H8E 2WGM 6FKF; do
 *      curl -O https://files.rcsb.org/download/$id.pdb; done
 *    for id in 8H9S 8H9T 8H9U; do
 *      curl -O https://files.rcsb.org/download/$id.cif.gz; done
 *    gunzip *.cif.gz
 * ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const Bake = require('../../bake-lib.js');
const Cif = require('../../cif-lib.js');
const FoldLib = require('../../../folding/folding.js');
const { kabsch, mul } = Bake;

const HERE = path.join(__dirname, '..');
const SRC = path.join(HERE, 'data', 'src');
const DATA = path.join(HERE, 'data');

/* ---- what is baked ------------------------------------------------------
 *
 *  THE TABLE IS proteins/proteins.js NOW, with every other protein's. Review
 *  ended, three of nine survived, and everything about what they ARE — which
 *  chains, which subunit each is, which site residues, the axis, the fitting
 *  group — moved into the registry's `variants` in the same commit that
 *  deleted it from here. What this file still owns is what an ATP synthase
 *  bake IS: the site, the superposition, the rotation, and the numbers only
 *  those can give.
 */
const REG = require('../../proteins.js');
const IO = require('../../tools/registry-io.js');
const ME = REG.byKey('atp-synthase');
const CANDIDATES = ME.variants;

/* THE TWO STRUCTURES THAT ARE NOT VARIANTS, and cannot be: the registry lists
   what the repo holds, and it holds no file for either of these. They are read
   to MEASURE the rotation — the axis, the angles, and the check that spinning
   state 1 lands where they say it should — and then dropped. Keeping them as
   sources rather than deleting them is the difference between a rotation that
   can be re-derived and three constants somebody once typed.

   They borrow the human variant's role table, because they are the same
   enzyme in the same chain naming; 8H9T is missing J, which simply never
   appears rather than needing a table of its own. */
const MEASURED = [
  { id: 'state2', entry: '8H9T', file: '8H9T.cif', group: 'states' },
  { id: 'state3', entry: '8H9U', file: '8H9U.cif', group: 'states' },
];


/* ---- reading ----------------------------------------------------------- */

const r2 = Bake.r2, xyz = Bake.xyz;

/* WHERE A VARIANT'S SOURCE FILE IS, from the registry's `source` rather than
   from a filename beside it. `format:'cif'` is how an entry says it was never
   published as a PDB — which for 8H9S is a fact about the deposition and not
   a choice this baker made. A measure-only structure carries its own two
   fields instead, because it has no registry entry to carry them. */
const entryOf = v => v.entry || v.source.id;
const fileOf = v => v.file ||
  v.source.id + (v.source.format === 'cif' ? '.cif' : '.pdb');
const elOf = l => (l.slice(76, 78).trim() || l.slice(12, 14).trim()).toUpperCase();

function source(v) {
  const name = fileOf(v);
  const p = path.join(SRC, name);
  if (!fs.existsSync(p))
    throw new Error(`${name} is missing from data/src — see the curl block ` +
      'in this file\'s header');
  const raw = fs.readFileSync(p, 'utf8');
  return name.endsWith('.cif') ? Cif.fromCif(raw) : Bake.modelOne(raw);
}

/* Every atom on the chains being drawn, with the altloc rule applied — the
   same rule `caTrace` uses, because the fit and the pocket move with the
   trace and a residue counted twice in one of them is two objects drifting
   apart. */
function atomsOf(text, only) {
  const out = [];
  for (const line of text.split('\n')) {
    const het = line.startsWith('HETATM');
    if (!het && !line.startsWith('ATOM')) continue;
    const alt = line[16];
    if (alt !== ' ' && alt !== 'A') continue;
    const chain = line[21];
    if (only && !only.has(chain)) continue;
    out.push({ serial: +line.slice(6, 11), name: line.slice(12, 16).trim(),
               res: line.slice(17, 20).trim(), chain,
               num: parseInt(line.slice(22, 26), 10),
               el: elOf(line), het, p: xyz(line) });
  }
  return out;
}

/* ---- the site ----------------------------------------------------------
 *
 *  What a catalytic site IS, drawn: whatever is bound, the magnesium, the
 *  P-loop that grips the phosphates, and the three side chains that do the
 *  chemistry. Returns null only where a candidate asked for no site at all
 *  — an EMPTY one still comes back, with its residues and nothing in them,
 *  because that is the measurement `open` exists to make. A baker that was
 *  never told to look would produce an identical-looking null.
 *
 *  THE P-LOOP KEEPS ITS BACKBONE, and this is the one place this baker
 *  departs from myoglobin's side-chains-only rule. Those eight amide NH
 *  groups ARE the phosphate grip — the Walker A motif is a backbone
 *  feature — so drawing side chains there would draw everything except the
 *  thing that holds the substrate. Glu188, Arg189 and Tyr345 are ordinary
 *  side chains and keep only CB as the stub saying where they attach.
 */
function siteOf(text, v, only) {
  if (!v.site) return null;
  const spec = v.site;
  const atoms = [], bySerial = new Map();

  const keep = (a, group) => { bySerial.set(a.serial, atoms.length);
                               atoms.push(Object.assign({ group }, a)); };

  for (const a of atomsOf(text, only)) {
    if (a.het) {
      if (a.res === 'HOH') continue;
      /* Named, or everything. Naming is for a file whose bulk HETATM is the
         detergent it was solved in; leaving it unset is what lets an empty
         site come back empty rather than come back filtered. */
      if (spec.take && !spec.take.includes(a.res)) continue;
      keep(a, a.el === 'NA' || a.el === 'MG' ? 'metal' : 'bound');
      continue;
    }
    if (spec.grip && a.num >= spec.grip[0] && a.num <= spec.grip[1]) {
      keep(a, 'grip');
      continue;
    }
    if (spec.side && spec.side.includes(a.num)) {
      if (a.name === 'N' || a.name === 'C' || a.name === 'O') continue;
      keep(a, 'side');
    }
  }
  if (!atoms.length) return null;

  /* CONNECTIVITY IS DEPOSITED for anything off a HETATM. A cutoff wide
     enough for a 2.1 A Mg-O coordination also draws the ribose ring shut
     across its own middle. */
  const bonds = [], seen = new Set();
  const add = (i, j) => {
    const lo = Math.min(i, j), hi = Math.max(i, j);
    if (lo === hi || seen.has(lo + ':' + hi)) return;
    seen.add(lo + ':' + hi); bonds.push([lo, hi]);
  };
  for (const line of text.split('\n')) {
    if (!line.startsWith('CONECT')) continue;
    const a = bySerial.get(+line.slice(6, 11));
    if (a === undefined) continue;
    for (let c = 11; c + 5 <= line.length; c += 5) {
      const f = line.slice(c, c + 5).trim();
      if (!f) continue;
      const b = bySerial.get(+f);
      if (b !== undefined) add(a, b);
    }
  }

  /* The protein's own bonds come from distance, because ATOM records carry
     no CONECT. 1.9 A is longer than any C-C, C-N or C-O in a residue and
     longer than the 1.33 A peptide bond that has to be drawn between
     consecutive P-loop residues, and shorter than any coordination to the
     metal — which is excluded here outright, so no ionic contact is drawn
     as if it were a covalent bond. */
  const near = (a, b) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]);
  const prot = atoms.map((a, i) => [a, i])
    .filter(([a]) => a.group === 'grip' || a.group === 'side');
  for (let x = 0; x < prot.length; x++)
    for (let y = x + 1; y < prot.length; y++)
      if (near(prot[x][0], prot[y][0]) < 1.9) add(prot[x][1], prot[y][1]);

  return { atoms, bonds };
}

/* ---- superposition ------------------------------------------------------ */

/* The atoms a fit is made ON, per group, as a keyed map — the key is what
   makes this a match rather than a guess. */
function fitAtoms(text, v, only) {
  const idx = new Map();
  if (v.group === 'sites') {
    /* Backbone of the P-loop, one chain. Eight residues, four atoms each. */
    for (const a of atomsOf(text, only)) {
      if (a.het) continue;
      if (a.num < v.site.grip[0] || a.num > v.site.grip[1]) continue;
      if (!['N', 'CA', 'C', 'O'].includes(a.name)) continue;
      idx.set(`${a.num}:${a.name}`, a.p);
    }
  } else if (v.group === 'states') {
    /* Ca of the STATOR, and not of the head, which is the trap this whole
       group nearly shipped inside. The alpha3beta3 hexamer is three-fold
       pseudo-symmetric, so chain A of one state can sit where chain B of
       another does; fitting it by chain label then rotates the entire enzyme
       by a third of a turn to make the labels agree, and REPORTS A GOOD
       RESIDUAL for doing it — 0.6 A on the head, with the peripheral stalk
       thrown 85 A across the box. A fit that scores well while being wrong is
       the only kind that ships.

       The stator has no symmetry to fall into: one copy each of subunits a,
       b, d, e, f, g, F6, OSCP, ATP8 and ATP5MJ, so there is exactly one way
       to match them. It is also the physically right reference — the stalk is
       what holds the head still while the shaft turns inside it, which makes
       "still" a measured claim here rather than an assumption. */
    /* Both tan roles together: the stalk AND the membrane block. What matters
       for the fit is that none of these ten turn, not which of the two jobs
       each does — and that they are one copy each, so there is no symmetry to
       mismatch them into. */
    const stator = new Set(['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T']);
    for (const a of atomsOf(text, only)) {
      if (a.het || a.name !== 'CA' || !stator.has(a.chain)) continue;
      idx.set(`${a.chain}:${a.num}`, a.p);
    }
  }
  return idx;
}

function match(mine, ref) {
  const P = [], Q = [];
  for (const [k, p] of mine) { const q = ref.get(k); if (q) { P.push(p); Q.push(q); } }
  return { P, Q };
}

/* HOW A RESIDUE IN ONE VIEW IS RECOGNISED IN ANOTHER, per group, and it is a
   question about NUMBERING rather than about chain letters. The four sites are
   four copies of the same bovine beta subunit under four different letters —
   E, D, F and E again — so keying on the letter reports the whole-chain
   difference for the one pair whose letters happen to match and `null` for the
   two that matter most. The three states are whole enzymes whose chains do
   correspond one to one, and there the letter IS the identity. */
const caKey = group => group === 'sites' ? (ch, num) => String(num)
                                         : (ch, num) => ch + ':' + num;

/* ---- the presentation frame -------------------------------------------- */

const nrm = v => { const L = Math.hypot(v[0], v[1], v[2]) || 1;
                   return [v[0] / L, v[1] / L, v[2] / L]; };

const centroid = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);

/* THE AXIS IS MEASURED, never assumed, and it is the same decision the
   napump baker makes about a membrane normal: the field draws this enzyme
   standing up with the membrane at the bottom, so the basis is solved from
   an AXIS rather than from the molecule's own extents. PCA would lay the
   human enzyme on its side — the head is wider than the machine is tall —
   and a rotary motor on its side has its rotation axis pointing at the
   reader, which is the one orientation that hides what it does.

   Two ways of measuring it, both off the coordinates:

     from/to   the vector between two groups of chains. The c-ring to the
               head IS the rotation axis, and it is the membrane normal
               too, which is why it needs no convention on top of it.
     mean      the average of each chain's own long axis, for the rotor
               ring alone: a barrel 45 A tall and 50 A across has three
               extents too close for PCA to order, but every one of its
               eleven subunits is a hairpin lying along the axis, so
               eleven weak answers average into a strong one.
*/
function axisOf(spec, ca) {
  if (!spec) return null;
  if (spec.mean) {
    let acc = null;
    for (const id of spec.mean.split(',')) {
      const pts = ca.get(id);
      if (!pts || pts.length < 3) continue;
      let ax = FoldLib.viewBasis(pts).R[0];
      /* Each hairpin's long axis is solved without a sign, so half of them
         come back pointing the other way; aligned to the first before the
         average, or eleven axes cancel into noise. */
      if (acc && ax[0] * acc[0] + ax[1] * acc[1] + ax[2] * acc[2] < 0)
        ax = ax.map(v => -v);
      acc = acc ? acc.map((v, i) => v + ax[i]) : ax.slice();
    }
    return acc && nrm(acc);
  }
  const grp = ids => centroid(ids.split(',').flatMap(id => ca.get(id) || []));
  const a = grp(spec.from), b = grp(spec.to);
  return nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
}

/* ---- the turn ----------------------------------------------------------
 *
 *  THE ROTATION THE BENCH SPINS, measured rather than chosen. The rotor is a
 *  rigid body — fitting one state's c-ring onto another leaves a residual of
 *  0.8 A over 600 Ca — so the motion between two states is one rotation about
 *  one axis, and a page can show it by turning the rotor of a SINGLE file
 *  rather than by blending three. Every frame of that spin is then an exact
 *  rigid rotation of deposited coordinates; only the angle in between is
 *  interpolated, which for a rigid body on a fixed axis is the least a
 *  picture can invent.
 *
 *  THE ANGLE IS READ OFF GAMMA, NOT OFF THE c-RING. The ring is eight
 *  near-identical subunits, so the rotation carrying one state's ring onto
 *  another's is only defined to the nearest 45 degrees — measured there it
 *  gives whole numbers of subunits (2, 5) and rounds the real angle away.
 *  Gamma is a single copy and breaks that symmetry: it fits at 0.58 A over
 *  271 Ca, and the angles come back 121.4 and -107.2 degrees. Those are about
 *  120 apart, which is the catalytic three-step, and 120 degrees is 2.67
 *  c-subunits — so the ring cannot stop where the head wants it to, and the
 *  shaft absorbs the difference. The rounded ring figures hid exactly that.
 *
 *  A RIGID MOTION IS A SCREW, AND THE AXIS HAS A POSITION AS WELL AS A
 *  DIRECTION. This is the trap that cost a rebuild: the direction came out of
 *  the c-ring-to-head vector and agreed with the measured one to cos 1.000,
 *  which made it look settled — but the LINE was then assumed to pass through
 *  the c-ring centroid, and it does not. It passes about 85 A away, and
 *  spinning about the wrong line swung the rotor around the outside of the
 *  molecule instead of turning it: a rotor 24 A from where the next state
 *  actually has it, having started 20 A away. So the line is solved from the
 *  transform, by asking which points the rotation leaves on themselves.
 *
 *  Returns the motion taking `from` ONTO `to` — the direction the page needs,
 *  since it spins state 1 towards the others. Fitting the other way round and
 *  reusing the angle is the same trap wearing a different hat: it turns the
 *  rotor backwards, and a rotary motor running the wrong way is a claim about
 *  the enzyme rather than a rendering detail.
 */
function screwOf(from, to) {
  const P = [], Q = [];
  const a = from.chains.G, b = to.chains.G;
  if (!a || !b) return null;
  const map = new Map(b.nums.map((n, i) => [n, b.CA[i]]));
  a.nums.forEach((n, i) => { const q = map.get(n); if (q) { P.push(a.CA[i]); Q.push(q); } });
  if (P.length < 3) return null;

  const k = kabsch(P, Q), R = k.R, t = k.t;
  const tr = R[0][0] + R[1][1] + R[2][2];
  const ang = Math.acos(Math.min(1, Math.max(-1, (tr - 1) / 2)));
  const v = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  const u = v.map(x => x / n);

  /* Split the translation into the part ALONG the axis, which is a slide and
     stays, and the part across it, which is what a rotation about an offset
     line looks like from the origin. Solving (I - R + u uT) p = tPerp gives a
     point on that line; the u uT term is there because (I - R) is singular
     along u — every point on the axis is a solution, and this picks the one
     across from the origin rather than failing. */
  const slide = u[0] * t[0] + u[1] * t[1] + u[2] * t[2];
  const perp = [0, 1, 2].map(i => t[i] - slide * u[i]);
  const A = [0, 1, 2].map(i => [0, 1, 2].map(j =>
    (i === j ? 1 : 0) - R[i][j] + u[i] * u[j]));
  const point = solve3(A, perp);

  return { deg: +(ang * 180 / Math.PI).toFixed(1), axis: u, point,
           slide: +slide.toFixed(2), rmsd: +k.rmsd.toFixed(2), n: P.length };
}

/* Gaussian elimination with partial pivoting, for the one 3x3 above. */
function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [0, 1, 2].map(i => M[i][3] / M[i][i]);
}

/* ---- one candidate ------------------------------------------------------ */

function bake(v, ref) {
  const text = source(v);
  /* A VARIANT NAMES ITS CHAINS; A MEASURE-ONLY STRUCTURE TAKES WHAT IS THERE.
     The registry lists chains because the checker holds a bake to them, and
     because which chains are drawn is a decision. For the two rotary states
     there is nothing to hold and no decision — 8H9T simply has no IF1 — so
     null means every chain in the file, and the role check below still catches
     any chain the table cannot name. */
  const only = v.chains ? new Set(v.chains.split(',')) : null;
  const R = Bake.ssRanges(text);

  const traced = Bake.caTrace(text, only);
  if (!traced.size) throw new Error(`${v.id}: no CA on chains ${v.chains}`);

  /* A CHAIN IN THE FILE AND NOT IN THE ROLE TABLE is a subunit about to be
     drawn as scenery. Thrown rather than defaulted: grey is a claim. */
  const roles = v.roles || ME.variants.find(x => x.id === 'human').roles;
  for (const id of traced.keys())
    if (!roles[id]) throw new Error(`${v.id}: chain ${id} has no role`);

  const site = siteOf(text, v, only);
  const mine = fitAtoms(text, v, only);

  /* SUPERPOSE BEFORE CENTRING, in the file's own coordinates, because the
     fit is a rotation about the reference's origin — centring first would
     fit the two centroids to each other instead of the two structures. */
  let fit = null;
  if (ref) {
    const { P, Q } = match(mine, ref.atoms);
    if (P.length < 3)
      throw new Error(`${v.id}: only ${P.length} atoms matched ${ref.id}`);
    /* The residual BEFORE the fit, so the panel can say whether these files
       already shared a frame. Three maps refined from one dataset often do,
       and a bench that printed a fit residual without this would imply work
       the superposition did not have to do. */
    let sd0 = 0;
    P.forEach((p, i) => { const q = Q[i];
      sd0 += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; });
    const k = kabsch(P, Q);
    fit = { rmsd: +k.rmsd.toFixed(3), n: P.length, on: ref.id,
            before: +Math.sqrt(sd0 / P.length).toFixed(2) };
    const put = p => mul(k.R, p).map((x, i) => x + k.t[i]);
    for (const res of traced.values())
      for (const r of res) { const q = put([r.x, r.y, r.z]); r.x = q[0]; r.y = q[1]; r.z = q[2]; }
    if (site) for (const a of site.atoms) a.p = put(a.p);
  }

  /* Positions per chain, after any fit — what the axis is solved from. */
  const ca = new Map([...traced].map(([id, res]) => [id, res.map(r => [r.x, r.y, r.z])]));

  /* ONE CENTRE FOR EVERYTHING IN A GROUP. Centring each member on its own
     centroid would slide the structures back apart by exactly the amount
     their centroids differ by, undoing most of the fit just made — and for
     the three rotary states that difference is the rotor, which is the
     subject. */
  const all = [...ca.values()].flat();
  const c = ref ? ref.centre : centroid(all);
  const shift = p => p.map((v2, k) => r2(v2 - c[k]));

  const T = Bake.assemble(traced, R, c);

  const out = {
    source: fileOf(v),
    ssFrom: Bake.ssFrom(R),
    centre: T.centre, order: T.order, chains: T.chains, radius: T.radius,
  };

  /* The axis is the REFERENCE's for a fitted group: three states solved
     independently would each pick their own up, and the rotor would appear
     to wobble because the camera moved rather than because anything did. */
  const axis = ref ? ref.axis : axisOf(v.axis, ca);
  const F = Bake.frameOf(all.map(p => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]));
  out.extents = F.extents;
  if (axis) {
    out.view = FoldLib.basisFrom(axis).map(row => row.map(r2));
    out.frame = ref ? `axis solved on ${ref.id}, shared by the group`
                    : (v.axis.mean ? 'ring axis, averaged from the subunits\' own'
                                   : 'rotation axis, c-ring to head');
  } else {
    /* A single beta subunit is close enough to globular that a solved basis
       would flip between rebakes. The four sites therefore open in the
       reference's deposited frame — one frame, because they are fitted into
       it — and a human picks the roll on the bench. */
    out.frame = ref ? `${ref.id}'s deposited frame, shared by the four`
                    : 'deposited';
  }

  if (site) out.site = {
    atoms: site.atoms.map(a => ({ name: a.name, el: a.el, res: a.res,
                                  group: a.group, num: a.num, chain: a.chain,
                                  p: shift(a.p) })),
    bonds: site.bonds,
  };

  /* Carried for the next member of the group, in the frame it must fit to. */
  out.$ref = { atoms: mine, centre: c, axis };

  const decl = Bake.declared(text);
  const bound = site
    ? [...new Set(site.atoms.filter(a => a.group === 'bound' || a.group === 'metal')
                            .map(a => a.res))] : [];
  const counts = T.order.map(id => ({ chain: id, modelled: T.chains[id].nums.length,
                                      declared: decl[id] === undefined ? null : decl[id] }));

  out.meta = {
    entry: entryOf(v), view: v.id, chains: T.order.join(','),
    method: Bake.method(text), resolution: Bake.resolution(text),
    title: Bake.line1(text, 'TITLE'),
    chainsInFile: Bake.chainCount(text),
    helices: T.order.reduce((k, id) => k + T.chains[id].helices, 0),
    strands: T.order.reduce((k, id) => k + T.chains[id].strands, 0),
    counts,
    ligands: Bake.ligands(text, only),
    /* What is drawn close up, counted rather than typed — and zero is the
       answer `open` exists to give. */
    siteAtoms: site ? site.atoms.length : 0,
    siteBonds: site ? site.bonds.length : 0,
    bound: bound.length ? bound : null,
    grip: v.site && v.site.grip ? v.site.grip : null,
    side: v.site && v.site.side ? v.site.side : null,
    fitOn: fit ? fit.on : null,
    fitAtoms: fit ? fit.n : null,
    fitRmsd: fit ? fit.rmsd : null,
    fitBefore: fit ? fit.before : null,
    /* The whole-chain difference, once both are in one frame. It is the
       number that says how much of the structure the fit did NOT align,
       which for the sites is the domain swing and is the point. */
    caRmsd: null,
    palette: v.palette || 'role',
    roles: Object.fromEntries(T.order.map(id =>
      [id, { role: roles[id][0], subunit: roles[id][1] }])),
  };

  /* CHAIN LABELS DO NOT MEAN THE SAME THING IN TWO ROTARY STATES, and this
     is the second trap in this group. The depositors label the three beta
     subunits by which conformation each is in, so as gamma turns the labels
     follow it around the ring: state 1's chain D is state 3's chain E, and
     the eight c-subunits are shifted by two. A per-residue comparison keyed
     on the letter therefore measures the RELABELLING — 60 A of it, for a head
     that did not move at all.

     So for the states, every chain is matched to the best-fitting reference
     chain IN ITS OWN ROLE, and the pairing is reported rather than assumed.
     The pairing is the finding: that the ring superposes on itself two
     subunits around is the rotation, said as the thing that was measured. */
  if (ref && ref.ca && v.group === 'states') {
    const bySubunit = {};
    for (const id of ref.order) (bySubunit[ref.roles[id].subunit] ||= []).push(id);

    const pairing = {}, per = {};
    for (const id of T.order) {
      const { role, subunit } = out.meta.roles[id];
      const mine = new Map(T.chains[id].nums.map((n, i) => [n, T.chains[id].CA[i]]));
      let best = null;
      for (const cand of bySubunit[subunit] || []) {
        let sd = 0, n = 0;
        for (const [num, p] of mine) {
          const w = ref.ca.get(cand + ':' + num);
          if (!w) continue;
          sd += (p[0] - w[0]) ** 2 + (p[1] - w[1]) ** 2 + (p[2] - w[2]) ** 2;
          n++;
        }
        if (!n) continue;
        if (!best || sd / n < best.sd / best.n) best = { to: cand, sd, n };
      }
      if (!best) continue;
      pairing[id] = { to: best.to, subunit,
                      rmsd: +Math.sqrt(best.sd / best.n).toFixed(2), n: best.n };
      (per[role] ||= { sd: 0, n: 0 });
      per[role].sd += best.sd; per[role].n += best.n;
    }
    out.meta.pairing = pairing;
    out.meta.relabelled = Object.entries(pairing).filter(([id, x]) => x.to !== id).length;
    out.meta.caByRole = Object.fromEntries(Object.entries(per)
      .map(([k, x]) => [k, { rmsd: +Math.sqrt(x.sd / x.n).toFixed(2), n: x.n }]));

    /* HOW FAR THE RING WENT ROUND, as a whole number of subunits — which is
       what a c-ring's rotation actually is, and a more honest headline than
       any angstrom figure. Taken as the commonest shift rather than one
       chain's, so a single badly-modelled subunit cannot set it. */
    const ring = Object.entries(pairing)
      .filter(([id, x]) => x.subunit === 'c')
      .map(([id, x]) => (+id - +x.to + 8) % 8);
    if (ring.length) {
      const tally = {};
      for (const k of ring) tally[k] = (tally[k] || 0) + 1;
      const [step, votes] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      out.meta.ringStep = { subunits: +step, of: ring.length, agreeing: votes };
    }
    /* Left null on purpose: an overall figure here would average a head whose
       labels rotated with a stator whose did not, and mean nothing. */
    out.meta.caRmsd = null;
  } else if (ref && ref.ca) {
    const key = caKey(v.group);
    const roles = out.meta.roles;
    let sd = 0, n = 0;
    const per = {};
    for (const id of T.order) {
      T.chains[id].nums.forEach((num, i) => {
        const w = ref.ca.get(key(id, num));
        if (!w) return;
        const p = T.chains[id].CA[i];
        const d = (p[0] - w[0]) ** 2 + (p[1] - w[1]) ** 2 + (p[2] - w[2]) ** 2;
        sd += d; n++;
        const role = roles && roles[id] ? roles[id].role : null;
        if (!role) return;
        if (!per[role]) per[role] = { sd: 0, n: 0 };
        per[role].sd += d; per[role].n++;
      });
    }
    if (n) { out.meta.caRmsd = +Math.sqrt(sd / n).toFixed(2); out.meta.caPairs = n; }
    if (Object.keys(per).length)
      out.meta.caByRole = Object.fromEntries(Object.entries(per)
        .map(([k, x]) => [k, { rmsd: +Math.sqrt(x.sd / x.n).toFixed(2), n: x.n }]));
  }

  /* The five fields the registry will index this on, when there is a
     registry entry to put them in. Written here already so that step 5 is a
     move rather than a re-derivation, and so that every one of them is
     visibly answerable by the bake. */
  out.read = {
    method: Bake.method(text),
    chainsInFile: Bake.chainCount(text),
    residues: counts.reduce((k, x) => k + x.modelled, 0),
    declared: counts.every(x => x.declared !== null)
      ? counts.reduce((k, x) => k + x.declared, 0) : null,
    ec: Bake.ecNumbers(text)[0] || null,
    baked: `atp-${v.id}.json`,
  };
  return out;
}

/* ---- run ---------------------------------------------------------------- */

function main() {
  fs.mkdirSync(DATA, { recursive: true });
  const done = {}, blocks = {};

  /* Groups are baked reference first, then the rest onto it. A member of no
     group is its own reference and is baked in place. */
  const order = [
    ...CANDIDATES.filter(v => !v.group || v.reference),
    ...CANDIDATES.filter(v => v.group && !v.reference),
    ...MEASURED,
  ];

  const refs = {};
  for (const v of order) {
    const ref = v.group && !v.reference ? refs[v.group] : null;
    const out = bake(v, ref);

    if (v.reference) {
      refs[v.group] = {
        id: v.id, atoms: out.$ref.atoms, centre: out.$ref.centre,
        axis: out.$ref.axis,
        /* Carried so a later member can look for its own chains among the
           reference's chains OF THE SAME ROLE, rather than under its own
           letter — see the relabelling note in bake(). */
        order: out.order, roles: out.meta.roles || {},
        ca: (() => {
          const key = caKey(v.group), m = new Map();
          for (const id of out.order)
            out.chains[id].nums.forEach((n, i) => m.set(key(id, n), out.chains[id].CA[i]));
          return m;
        })(),
      };
    }

    done[v.id] = out;

    /* A MEASURE-ONLY CANDIDATE IS BAKED AND NOT KEPT. The two other rotary
       states are not on the bench any more — review cut them — but they are
       where the spin's axis and angles are MEASURED, and a rotation whose
       calibration cannot be re-derived is three typed constants wearing a
       measurement's clothes. So they are still read, still fitted, still
       compared, and then dropped: nothing is written to data/, nothing goes
       in the index, and no button can reach them. What survives them is the
       `spin` block on atp-human.json and the figures the console prints. */
    if (!v.read) { console.log(`         (${v.id} measured, not kept)`); continue; }

    const { $ref, read, ...bakeOut } = out;
    fs.writeFileSync(path.join(DATA, read.baked), JSON.stringify(bakeOut));

    blocks[v.id] = read;

    const m = out.meta, kb = (fs.statSync(path.join(DATA, read.baked)).size / 1024).toFixed(0);
    console.log(
      `${v.id.padEnd(7)} ${String(read.residues).padStart(5)} residues in ` +
      `${String(out.order.length).padStart(2)} chains · ` +
      `${m.method}${m.resolution ? ' ' + m.resolution.toFixed(2) + ' A' : ''} · ` +
      (m.siteAtoms ? `site ${m.siteAtoms} atoms ${m.siteBonds} bonds, ` +
                     `holding ${m.bound ? m.bound.join('+') : 'NOTHING'} · ` : '') +
      (m.fitOn ? `fit on ${m.fitOn} ${m.fitRmsd} A over ${m.fitAtoms} ` +
                 `(was ${m.fitBefore})` +
                 (m.caRmsd === null ? '' : `, Ca ${m.caRmsd}`) +
                 (m.caByRole ? ' [' + Object.entries(m.caByRole)
                   .map(([k, x]) => `${k} ${x.rmsd}`).join(' ') + ']' : '') + ' · '
               : '') +
      `${kb} KB`);
  }

  /* THE SPIN, WRITTEN BACK ONTO THE FILE THAT WILL BE DRAWN. Only `human` gets
     one: it is the state the bench turns, and the other two are here to say by
     how much and about what.

     THE AXIS IS THE MEASUREMENT, not the geometry. Both other states are
     solved independently and the two answers are compared — same direction,
     and a line in the same place — because "the rotor turns about one fixed
     axis" is the claim this whole view rests on, and two states agreeing is
     the evidence for it. If they ever stop agreeing, the console says so
     rather than averaging the disagreement away. */
  {
    const H = done.human;
    const cen = ids => {
      let s2 = [0, 0, 0], n = 0;
      for (const id of ids) for (const p of H.chains[id].CA) {
        s2[0] += p[0]; s2[1] += p[1]; s2[2] += p[2]; n++;
      }
      return s2.map(v => v / n);
    };
    const rotor = H.order.filter(id => H.meta.roles[id].role === 'rotor');
    const ring = H.order.filter(id => H.meta.roles[id].subunit === 'c');
    const headIds = H.order.filter(id => H.meta.roles[id].role === 'head');

    /* Sign reference only. Which way the axis vector POINTS is arbitrary, and
       the two states solve it opposite ways because they turn opposite ways;
       both are flipped onto the c-ring-to-head direction so their angles are
       signed in one frame and can be compared. */
    const a = cen(ring), b = cen(headIds);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const dl = Math.hypot(d[0], d[1], d[2]);
    const up = d.map(v => v / dl);

    const measured = [];
    for (const id of ['state2', 'state3']) {
      const w = screwOf(H, done[id]);
      if (!w) continue;
      const flip = (w.axis[0] * up[0] + w.axis[1] * up[1] + w.axis[2] * up[2]) < 0;
      measured.push({ id, deg: flip ? -w.deg : w.deg,
                      axis: flip ? w.axis.map(x => -x) : w.axis,
                      point: w.point, slide: flip ? -w.slide : w.slide,
                      rmsd: w.rmsd, n: w.n });
    }

    const r4 = v => Math.round(v * 1e4) / 1e4;
    const mean = k => [0, 1, 2].map(i =>
      measured.reduce((s2, m) => s2 + m[k][i], 0) / measured.length);
    const axis = (v => { const L = Math.hypot(v[0], v[1], v[2]);
                         return v.map(x => r4(x / L)); })(mean('axis'));
    const point = mean('point').map(r4);

    /* How far apart the two independent answers are. The direction as an
       angle, and the line as a distance across it — both printed, because a
       fixed axis is the claim and this is what backs it. */
    let spread = null;
    if (measured.length === 2) {
      const [m1, m2] = measured;
      const dot = Math.min(1, Math.abs(m1.axis[0] * m2.axis[0] +
        m1.axis[1] * m2.axis[1] + m1.axis[2] * m2.axis[2]));
      const dp = [0, 1, 2].map(i => m1.point[i] - m2.point[i]);
      const al = dp[0] * axis[0] + dp[1] * axis[1] + dp[2] * axis[2];
      const across = Math.hypot(...[0, 1, 2].map(i => dp[i] - al * axis[i]));
      spread = { degrees: +(Math.acos(dot) * 180 / Math.PI).toFixed(2),
                 lines: +across.toFixed(2) };
    }

    /* DOES THE SHARED AXIS ACTUALLY REPRODUCE THE OTHER STATES? Each state was
       solved on gamma alone and then averaged into one axis, so this asks the
       question the averaging raises: spin state 1's WHOLE rotor by the shared
       angle and measure how far it lands from where that experiment put it.
       It is the only number here that validates the picture rather than
       describing it, and it is what the page prints — 26 A of separation
       becoming 2 is the claim, and it is checkable.

       It also catches the trap that cost a rebuild. The first version of this
       spun about an assumed line and this figure came back WORSE than the
       unspun distance, which is a thing no amount of looking at the render
       would have told anybody. */
    const turn = (p, deg) => {
      const th = deg * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
      const v = [0, 1, 2].map(i => p[i] - point[i]);
      const dot = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
      const cr = [axis[1] * v[2] - axis[2] * v[1],
                  axis[2] * v[0] - axis[0] * v[2],
                  axis[0] * v[1] - axis[1] * v[0]];
      return [0, 1, 2].map(i => v[i] * c + cr[i] * sn + axis[i] * dot * (1 - c) + point[i]);
    };
    for (const m of measured) {
      const other = done[m.id];
      let sd = 0, sd0 = 0, n = 0;
      for (const ch of rotor) {
        if (!other.chains[ch] || !H.chains[ch]) continue;
        const map = new Map(other.chains[ch].nums.map((k, i) => [k, other.chains[ch].CA[i]]));
        H.chains[ch].nums.forEach((k, i) => {
          const q = map.get(k);
          if (!q) return;
          const p0 = H.chains[ch].CA[i], p1 = turn(p0, m.deg);
          sd += (p1[0] - q[0]) ** 2 + (p1[1] - q[1]) ** 2 + (p1[2] - q[2]) ** 2;
          sd0 += (p0[0] - q[0]) ** 2 + (p0[1] - q[1]) ** 2 + (p0[2] - q[2]) ** 2;
          n++;
        });
      }
      if (n) {
        m.lands = +Math.sqrt(sd / n).toFixed(2);
        m.apart = +Math.sqrt(sd0 / n).toFixed(1);
        m.over = n;
      }
    }

    const file = path.join(DATA, 'atp-human.json');
    const bakeOut = JSON.parse(fs.readFileSync(file, 'utf8'));
    bakeOut.spin = { axis, point, chains: rotor, spread,
                     states: measured.map(m => ({ id: m.id, deg: m.deg,
                       slide: m.slide, rmsd: m.rmsd, n: m.n,
                       lands: m.lands, apart: m.apart, over: m.over })) };
    fs.writeFileSync(file, JSON.stringify(bakeOut));
    console.log(`spin     ${rotor.length} chains turn about ` +
      `[${axis.join(', ')}] through [${point.join(', ')}]`);
    for (const m of measured)
      console.log(`         ${m.id.padEnd(7)} ${String(m.deg).padStart(6)}° · ` +
        `γ ${m.rmsd} Å over ${m.n} · slides ${m.slide} Å · ` +
        `spinning the rotor there lands ${m.lands} Å off ` +
        `(${m.apart} Å apart unspun, over ${m.over})`);
    if (spread)
      console.log(`         the two agree to ${spread.degrees}° and their ` +
        `axes pass ${spread.lines} Å apart`);
  }

  /* THE REGISTRY'S HALF, spliced back in. `registry-io.js` writes only the
     `read: { … }` object inside each variant, so the prose and the reasons
     around them survive a re-bake — and in that file the comments are why a
     structure was chosen and which one it was chosen instead of. */
  const touched = IO.write('atp-synthase', blocks);
  console.log(`registry proteins.js  ${touched.length} variants updated`);
}

if (require.main === module) main();
module.exports = { bake, siteOf, screwOf };
