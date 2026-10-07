/* =============================================================================
 *  macromolecule/peptide.js — where the next residue has to sit
 * =============================================================================
 *  A peptide bond is a condensation: the carboxyl keeps its C and loses –OH,
 *  the amino keeps its N and loses one H, and the two halves leave as one
 *  water. This file answers the only question a page cannot answer for itself
 *  — given a residue on stage, WHERE does the next one go — and it answers in
 *  a rigid transform, placing nothing.
 *
 *  SIX NUMBERS, AND EVERY ONE OF THEM IS SET. The backbone is built from
 *  internal coordinates (`nerf` below), not by aiming one group at another:
 *
 *    · bond, angle, ψ — the amide N, placed off the host's own N, Cα and C.
 *    · angle, ω — where the guest's Cα has to point from there.
 *    · φ — the spin about N–Cα, measured off where the guest landed and
 *      corrected, since nothing above constrains it.
 *
 *  THE THREE TORSIONS ARE ASSERTED, and this is the correction the file exists
 *  in its current form because of. An earlier version placed the N where the
 *  departing hydroxyl O had been and then turned the guest until its leaving
 *  N–H pointed back down the bond. That looks like it derives everything from
 *  the molecules' own atoms, and it does — but the atoms it derives from are a
 *  free amino acid's CONFORMER, so φ and ψ came out at whatever PubChem had
 *  fetched. In a four-residue chain that gave φ of −179°, +60° and −64°: the
 *  left-handed region and the α-helical one, chosen by nobody. The chain bent,
 *  and two atoms landed 1.88 Å apart.
 *
 *  A torsion nobody sets is a torsion the record chose. So ω is trans, and φ/ψ
 *  are an extended β-strand — a real secondary structure rather than an
 *  invented straightening, and what a chain does when nothing folds it.
 *
 *  WHAT IS STILL THE CONFORMER'S: the side chain, and everything internal to a
 *  rigid residue. That is the right answer for a side chain and the wrong one
 *  for the surviving amide N–H, which is why `pose` also returns `amideH` —
 *  see the note at the end of it.
 *
 *  WHICH ATOMS ARE INVOLVED IS READ FROM `condense:`, never counted off the
 *  formula. A spec that renumbers cannot quietly start bonding the wrong atoms:
 *  check-molecules.js already asserts that each role names a real group and
 *  that the two roles together shed exactly one water.
 *
 *  THE α-CARBON IS FOUND, NOT INDEXED. It is the one heavy atom bonded to both
 *  the amino N and the carboxyl C. The library's fixed backbone order does put
 *  it at 3, but all three torsions are measured against it and a spec built
 *  some other way would read three silently wrong angles.
 *
 *  ÅNGSTRÖMS IN, ÅNGSTRÖMS OUT. No THREE, no scene, no page state, so
 *  check-macromolecule.js runs the whole file in Node.
 * ========================================================================== */
(function(global){
  'use strict';

  /* ---- the backbone, as internal coordinates -------------------------------
   * Bond lengths and angles are Engh & Huber's, the values every structure
   * refinement program restrains a protein to. The amide C–N is shorter than a
   * single C–N (1.47 Å) because the bond has partial double character, which is
   * also why the unit is planar and why ω is a constant rather than a rotor. */
  const CN  = 1.329, NCA = 1.458, CAC = 1.525, NH = 1.01, CO = 1.231;
  const ANG_CA_C_N = 116.2 * Math.PI/180,
        ANG_C_N_CA = 121.7 * Math.PI/180;

  /* THE THREE TORSIONS, AND WHY ALL THREE ARE ASSERTED. Nothing about placing a
   * rigid residue determines φ and ψ: they are turns about the N–Cα and Cα–C
   * bonds, and a construction that does not pick them inherits whatever the
   * conformer this spec was fetched as happened to have. That is what this file
   * used to do, and it produced a chain with φ at +60° on one residue and −64°
   * on the next — the left-handed region and the α-helical one, chosen by
   * nobody — which bent the chain and drove two atoms to 1.88 Å.
   *
   * So the backbone is built from internal coordinates and all three are set.
   * The values are an extended β-strand, which is a real secondary structure
   * rather than an invented straightening: it is what a chain does when nothing
   * folds it, it is very nearly straight, and it is the shape the reader should
   * carry away from "a protein is a chain". */
  const OMEGA = Math.PI;                        // trans
  const PHI   = -139 * Math.PI/180;             // β-strand
  const PSI   =  135 * Math.PI/180;

  /* THE TWO FOLDS A CHAIN IS ASKED FOR, as the φ/ψ pair that defines each. The
   * strand is the default above. The α-helix is the mean over deposited
   * helices (Barlow & Thornton 1988, −62°, −41°), not Pauling's −57°/−47°: on
   * these bond lengths the textbook pair puts O···N at 2.72 Å, short of the
   * 2.9 Å real helices hold. Nothing places that hydrogen bond, C=O of i to
   * N–H of i+4; it falls out of the two torsions, and check-macromolecule.js
   * measures that it does. */
  const FOLD = {
    strand:{ phi:PHI, psi:PSI },
    helix: { phi:-62 * Math.PI/180, psi:-41 * Math.PI/180 },
  };

  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const mul = (a,s) => [a[0]*s, a[1]*s, a[2]*s];
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const L = len(a); return L ? mul(a, 1/L) : [0,0,0]; };

  // q as [x,y,z,w], the same order THREE uses, so a page can hand one straight
  // to a Quaternion without reordering.
  function qrot(q, v){
    const [x,y,z,w] = q;
    const tx = 2*(y*v[2] - z*v[1]), ty = 2*(z*v[0] - x*v[2]), tz = 2*(x*v[1] - y*v[0]);
    return [v[0] + w*tx + y*tz - z*ty,
            v[1] + w*ty + z*tx - x*tz,
            v[2] + w*tz + x*ty - y*tx];
  }
  const qmul = (a,b) => [
    a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
    a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
    a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
    a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2]];
  const qconj = q => [-q[0], -q[1], -q[2], q[3]];
  const qAxis = (axis, ang) => {
    const u = unit(axis), s = Math.sin(ang/2);
    return [u[0]*s, u[1]*s, u[2]*s, Math.cos(ang/2)];
  };
  /* The shortest rotation taking unit vector `a` onto unit vector `b`. The
   * antiparallel case has no shortest rotation — every half-turn about an axis
   * perpendicular to `a` works — so one perpendicular is picked deliberately
   * rather than left to a cross product that has gone to zero. */
  function qFromTo(a, b){
    const d = dot(a, b);
    if(d > 0.999999) return [0,0,0,1];
    if(d < -0.999999){
      const perp = Math.abs(a[0]) < 0.9 ? [1,0,0] : [0,1,0];
      return qAxis(unit(cross(a, perp)), Math.PI);
    }
    const c = cross(a, b);
    return [c[0], c[1], c[2], 1 + d];        // normalised below
  }
  const qnorm = q => { const L = Math.hypot(q[0],q[1],q[2],q[3]);
                       return [q[0]/L, q[1]/L, q[2]/L, q[3]/L]; };

  /* Dihedral a-b-c-d, signed, in radians, IUPAC sign: turning d about the b→c
   * axis by +θ (right hand along b→c) raises the result by θ. The bare atan2
   * of the two normals comes out with the opposite sign, so it is negated here
   * rather than at the call site — ω is a published quantity, and a torsion
   * that reads backwards is a number that compares wrong against every table. */
  function torsion(a, b, c, d){
    const b1 = sub(b,a), b2 = sub(c,b), b3 = sub(d,c);
    const n1 = cross(b1,b2), n2 = cross(b2,b3), m = cross(n1, unit(b2));
    return -Math.atan2(dot(m,n2), dot(n1,n2));
  }

  /* ---- the roles, out of the spec's own `condense:` block ------------------
   * The reading and the spec surgery are macromolecule/spec.js's: one
   * condensation is one reaction whichever class it happens to, and a second
   * copy of "which atoms left and what do the indices become" is the drift this
   * whole folder exists to avoid. */
  const Spec = (typeof require === 'function' && typeof module === 'object')
    ? require('./spec.js') : global.MacroSpec;
  const { role, free, bondedTo, strip } = Spec;

  // Every amino acid declares both halves of the reaction, so one predicate
  // covers "can this be a residue at all".
  const isResidue = spec => !!(role(spec,'carboxyl') && role(spec,'amino'));

  /* The α-carbon: the heavy atom bonded to both backbone termini. Found rather
   * than indexed — see the header. */
  function alphaOf(spec){
    const n = role(spec,'amino').keep, c = role(spec,'carboxyl').keep;
    const near = new Set(bondedTo(spec, c));
    const hit = bondedTo(spec, n).filter(i => near.has(i) && spec.atoms[i].el !== 'H');
    return hit.length === 1 ? hit[0] : -1;
  }

  /* ---- the pose ------------------------------------------------------------
   * Where `guest` must sit for its amino N to bond to `host`'s carboxyl C,
   * with the host at the origin unrotated. A page composes the answer with the
   * host's live transform: a peptide bond is a relationship between two
   * molecules, not a place on stage.
   *
   * Returns { pos, quat, bondAt, waterAt } — the last two so the page can put
   * the flare on the bond and the water where the leaving atoms met, rather
   * than at a transform origin that is in the middle of nothing.
   */
  /* Place a fourth atom from three, by bond length, bond angle and torsion —
   * the standard chain-building step (NeRF). Exact by construction: the atom
   * comes out at that length, that angle and that torsion, so nothing here can
   * be off by a little in a way that only shows up four residues later. */
  function nerf(a, b, c, bond, ang, tor){
    const bc = unit(sub(c, b));
    const n  = unit(cross(sub(b, a), bc));
    const m  = cross(n, bc);
    // In the bc/m/n frame: along the bond, opened to `ang`, twisted to `tor`.
    const d2 = [-bond*Math.cos(ang),
                 bond*Math.sin(ang)*Math.cos(tor),
                 bond*Math.sin(ang)*Math.sin(tor)];
    return add(c, add(mul(bc, d2[0]), add(mul(m, d2[1]), mul(n, d2[2]))));
  }

  /* Where `guest` must sit for its amino N to bond to `host`'s carboxyl C, with
   * the host at the origin unrotated. A page composes the answer with the
   * host's live transform: a peptide bond is a relationship between two
   * molecules, not a place on stage.
   *
   * ALL SIX NUMBERS COME FROM SOMEWHERE. Three place the N — a bond length, a
   * bond angle and ψ, built off the host's own N, Cα and C. Two aim the guest's
   * N→Cα, from the C–N–Cα angle and ω. The last is φ, the spin about N–Cα,
   * which is measured off where the guest landed and corrected. None is
   * inherited from the conformer, which is the bug this replaced.
   *
   * WHAT IS STILL THE CONFORMER'S is everything that is not backbone: the side
   * chain's own torsions, and where the remaining N–H sits. Those are internal
   * to a rigid residue and cannot be set by placing it.
   *
   * `fold` names a FOLD entry, strand when omitted. It sets the host's ψ and
   * the guest's φ, so a chain is one fold only if every join is asked for it.
   *
   * Returns { pos, quat, clash, bondAt, waterAt, omega, phi, psi } — the two
   * `At` points so a page can put the flare on the bond and the water where the
   * leaving atoms met, rather than at a transform origin that is in the middle
   * of nothing.
   */
  function pose(host, guest, donor, fold){
    const F = FOLD[fold || 'strand'];
    if(!F) throw new Error(`peptide.js: no fold '${fold}'`);
    const hc = free(host, donor || 'carboxyl'), ga = free(guest,'amino');
    if(!hc || !ga) return null;
    const P = (s,i) => s.atoms[i].pos;

    const gCA = alphaOf(guest);
    if(gCA < 0) return null;
    /* THE TWO ATOMS BEHIND THE DONOR CARBON, found rather than assumed. For
     * the backbone carboxyl they are Cα and N and the torsion below is ψ. For
     * a SIDE-CHAIN carboxyl — glutamate's γ, which is the bond glutathione is
     * made of — they are Cγ and Cβ, and reading the backbone's N and Cα
     * instead builds the bond off atoms three bonds away from where it forms.
     * That renders: it just renders a molecule with the acyl group pointing
     * somewhere nothing put it. */
    const stem = spec => {
      const c = bondedTo(spec, hc.keep)
        .find(i => spec.atoms[i].el === 'C');           // Cα, or Cγ
      if(c === undefined) return null;
      const back = bondedTo(spec, c).filter(i => i !== hc.keep && spec.atoms[i].el !== 'H');
      // Prefer the nitrogen, so the backbone role gets its canonical ψ; a side
      // chain has only its own carbon to offer.
      const b = back.find(i => spec.atoms[i].el === 'N') ?? back[0];
      return b === undefined ? null : { a:c, b };
    };
    const st = stem(host);
    if(!st) return null;
    const hN = P(host, st.b),
          hA = P(host, st.a),
          hC = P(host, hc.keep);

    // 1-3. The amide N: off the host's donating C, opened to the Cα–C–N angle,
    //      twisted to ψ. This is the host's OWN ψ, which is why the leaving
    //      hydroxyl's position no longer decides anything. A side-chain donor
    //      has no ψ — that torsion is a χ, and nothing fixes it — so it takes
    //      the extended value, which is what an unconstrained chain does.
    const psi = (hc.key === 'carboxyl' ? F.psi : Math.PI);
    const Nat = nerf(hN, hA, hC, CN, ANG_CA_C_N, psi);
    // 4-5. Where the guest's Cα has to point: the C–N–Cα angle, twisted to ω.
    const CAt = nerf(hA, hC, Nat, NCA, ANG_C_N_CA, OMEGA);

    const gN = P(guest, ga.keep), gA = P(guest, gCA),
          gC = P(guest, role(guest,'carboxyl').keep);
    let q = qnorm(qFromTo(unit(sub(gA, gN)), unit(sub(CAt, Nat))));

    // 6. φ, the spin about N–Cα. Measured off where that landed and corrected,
    //    the same way ω used to be: qFromTo takes the shortest rotation and
    //    which φ that happens to give depends on the conformer.
    const put = (qq, p) => add(qrot(qq, sub(p, gN)), Nat);
    // φ is the GUEST's, where the guest has an opinion. Proline's ring closes
    // onto its own backbone nitrogen and pins the N–Cα torsion near −65°; the
    // extended chain's −139° is a shape it cannot take, and forcing it renders
    // a proline nobody could build. Every other residue takes the default.
    const phi = (guest.pepPhi != null ? guest.pepPhi * Math.PI/180 : F.phi);
    const cur = torsion(hC, Nat, put(q, gA), put(q, gC));
    q = qnorm(qmul(qAxis(sub(CAt, Nat), phi - cur), q));

    const pos = sub(Nat, qrot(q, gN));          // where the guest's ORIGIN goes
    const at = i => add(qrot(q, sub(P(guest, i), gN)), Nat);

    /* THE AMIDE NITROGEN IS FLAT, and that is a fact about the bond rather
     * than about the drawing. A free amino acid's N is sp3: pyramidal, two
     * hydrogens, and their positions are whatever conformer the record was
     * fetched as. Making the bond costs one of those hydrogens AND rehybridises
     * the nitrogen to sp2 — the same partial double character that keeps ω at
     * 180 pulls all three of its neighbours into one plane.
     *
     * So the surviving H is not left where the free amino acid had it. It is
     * placed opposite the two heavy neighbours, in their plane, which is the
     * only place an sp2 N with two substituents can put it. Leaving it alone
     * was the largest clash in a built chain — 0.83 A into the previous
     * residue's carbonyl carbon — and it was also simply the wrong molecule. */
    const amideH = (() => {
      if(!ga.leaves.length) return null;
      const keptH = (spec => {
        const hs = bondedTo(spec, ga.keep).filter(i => spec.atoms[i].el === 'H');
        return hs.find(i => !ga.leaves.includes(i));
      })(guest);
      if(keptH === undefined) return null;
      const w = add(mul(unit(add(unit(sub(hC, Nat)), unit(sub(at(gCA), Nat)))), -NH), Nat);
      // back into the guest's own frame, so it survives the rigid transform
      return { index:keptH, pos: add(qrot(qconj(q), sub(w, Nat)), gN) };
    })();

    /* THE CARBONYL O IS IN THE SAME PLANE, for the same reason, on the host's
     * side. A free amino acid's =O sits wherever its carboxylate conformer put
     * it (alanine's N–Cα–C–O is 0°), and the bond is built at ψ, so leaving it
     * there tilts it out of the amide plane by however far ψ is from 180°: 45°
     * in a strand, and in a helix straight into the next residue's N, 0.86 Å.
     * It goes opposite the C's two heavy neighbours, at a C=O's own length,
     * which is also what aims it down the helix at the N–H four residues on. */
    const carbonylO = (() => {
      const o = bondedTo(host, hc.keep)
        .find(i => host.atoms[i].el === 'O' && !hc.leaves.includes(i));
      if(o === undefined) return null;
      return { index:o, pos: add(mul(unit(add(unit(sub(hA, hC)), unit(sub(Nat, hC)))), -CO), hC) };
    })();

    return {
      pos, quat:q, amideH, carbonylO,
      // The atom that bonds, in the GUEST's own frame — plane.js measures the
      // latch there rather than at the origin. An amino acid's origin is its
      // Cα, about 1.5 Å off, so the origin test nearly works and the gap only
      // shows up as a latch that is fussier than it looks.
      at: P(guest, ga.keep),
      // Measured with the amide hydrogen already where the bond puts it.
      // Against the free amino acid's sp3 position it reports a clash on most
      // pairs — correctly, but about a molecule that does not exist once the
      // bond has formed.
      clash: clashOf(host, guest, q, pos, amideH, hc.key, carbonylO),
      bondAt: mul(add(hC, Nat), 0.5),
      // The water assembles between the two groups that gave it up: the host's
      // –OH and the guest's H, which is where a student is looking.
      waterAt: mul(add(P(host, hc.leaves[0]), at(ga.leaves[0])), 0.5),
      omega: torsion(hA, hC, Nat, at(gCA)),
      phi:   torsion(hC, Nat, at(gCA), at(role(guest,'carboxyl').keep)),
      psi:   torsion(hN, hA, hC, Nat),
      donor: hc.key,
    };
  }

  /* The closest non-bonded approach between the two residues in the solved
   * pose, or null if nothing is closer than CLASH. Atoms that leave are exempt
   * — they are gone by the time the pose exists — and so is the new C–N pair.
   *
   * A CLASH IS NOT "THESE TWO CANNOT BOND". Every pair of amino acids forms a
   * peptide bond; what clashes here is two RIGID conformers, and a real chain
   * relieves it by turning φ and ψ, which nothing in this file moves. Proline
   * is the residue it happens to: its ring holds the α-carbon's neighbours in
   * place, so it is reported for most partners. A page that shows the number
   * is showing the cost of drawing residues rigidly, and must not narrate it
   * as chemistry refusing.
   *
   * 1.6 Å is under any real H···H contact (2.2 Å van der Waals) and above the
   * ~1.5 Å the correct poses come out at, so it separates a drawing problem
   * from a snug fit rather than flagging every join. */
  const CLASH = 1.6;
  function clashOf(host, guest, q, pos, moved, donor, movedHost){
    // The DONOR role, not always the backbone's: a γ linkage sheds the side
    // chain's oxygen and hydrogen, and excluding the backbone's instead
    // reports a clash against two atoms that are no longer there.
    const hc = role(host, donor || 'carboxyl'), ga = role(guest,'amino');
    const gone = { h:new Set(hc.leaves), g:new Set(ga.leaves) };
    let min = Infinity, at = null;
    for(let i = 0; i < host.atoms.length; i++){
      if(gone.h.has(i)) continue;
      const hp = (movedHost && movedHost.index === i) ? movedHost.pos : host.atoms[i].pos;
      for(let j = 0; j < guest.atoms.length; j++){
        if(gone.g.has(j) || (i === hc.keep && j === ga.keep)) continue;
        const local = (moved && moved.index === j) ? moved.pos : guest.atoms[j].pos;
        const g2 = add(qrot(q, local), pos);
        const d = len(sub(hp, g2));
        if(d < min){ min = d; at = [i, j]; }
      }
    }
    return min < CLASH ? { dist:min, atoms:at } : null;
  }

  /* What the two residues become, in the peptide bond's own roles. The C-N
   * bond is BETWEEN them and belongs to whatever draws the chain.
   *
   * Pass the pose and the guest's surviving N-H and the host's C=O are moved
   * to where an amide puts them. Optional only so that a caller asking "what does this reaction
   * remove" does not have to solve a geometry first; a page drawing the result
   * always has one. */
  function react(host, guest, p){
    const out = Spec.react(host, guest, 'carboxyl', 'amino');
    if(p && p.amideH){
      const i = p.amideH.index;
      // strip() renumbered, so find the atom by what it was next to.
      const n = out.guest.names && guest.names
        ? out.guest.names.indexOf(guest.names[i]) : -1;
      if(n >= 0) out.guest.atoms[n] = { el:'H', pos:p.amideH.pos.slice() };
    }
    if(p && p.carbonylO){
      const n = out.host.names && host.names
        ? out.host.names.indexOf(host.names[p.carbonylO.index]) : -1;
      if(n >= 0) out.host.atoms[n] = { el:'O', pos:p.carbonylO.pos.slice() };
    }
    return out;
  }

  const API = { pose, isResidue, free, role, alphaOf, torsion, clashOf, nerf,
                strip, react, CN, NCA, CAC, NH, OMEGA, PHI, PSI, FOLD, CLASH };
  if(typeof module === 'object' && module.exports) module.exports = API;
  global.Peptide = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
