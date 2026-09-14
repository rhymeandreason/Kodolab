/* =====================================================================
 *  mol-carriers.js — what every pathway spends and reduces
 * =====================================================================
 *  ATP, ADP's stand-in Pᵢ, AMP, NADH, FAD/FADH₂, and coenzyme A with the two
 *  thioesters the cycle makes of it. Plus `atpSkel` and `nadhSkel`, the same
 *  ATP and NADH built a second way — see THE PAIRS below.
 *
 *  WHY THIS FILE EXISTS. No page draws a pathway without drawing its carriers,
 *  and before this file they were scattered across four:
 *
 *    mol-pathways.js   atp, nadh, pi     — so krebs-lab loaded glycolysis
 *    mol-krebs.js      FAD, CoA and the  — the two largest Skel builds in the
 *                      thioesters          repo, in a file glycolysis-lab does
 *                                          not load and cannot use
 *    mol-compare.js    atpSkel, nadhSkel — and THREE lesson pages drew their
 *                                          carriers from it
 *    mol-monomers.js   amp
 *
 *  The partition is by derivation, not by topic (molecules.js
 *  DOMAINS), and a carrier passes that test on its own: every spec here is
 *  all but AMP are Skel builds. What made the old arrangement
 *  wrong was not the taxonomy but the cost — a page paying for a pathway it
 *  never draws in order to reach the carrier it does.
 *
 *  mol-krebs.js is now the eight acids and nothing else. mol-compare.js and
 *  mol-monomers.js are gone.
 *
 *  ---- THE PAIRS: the same molecule, derived two ways --------------------
 *
 *  `atpSkel` and `nadhSkel` are ATP and NADH from ideal VSEPR angles and
 *  measured bond lengths; `atp` and `nadh` are real PubChem conformers. Same
 *  molecules, two derivations each, and molecule-viewer.html
 *  switches between them under one camera.
 *
 *  THE SCHEMATICS ARE WHAT THE LESSONS DRAW, not the conformers —
 *  `ATP = M.atpSkel`, `NADH = M.nadhSkel` in glycolysis-lab, krebs-lab and
 *  fermentation-lab — because a real conformer folds its tail over the exact
 *  part each step is about: the γ phosphate at glycolysis steps 1/3/7/10, the
 *  nicotinamide C4 and its two hydrogens at step 6. The idealized build is
 *  extended, so those stay legible while the sugars beside them stay measured.
 *
 *  So a "control" here is load-bearing for three lesson pages. Changing one —
 *  its geometry, its `gly` block, its `view` — is a lesson change, and
 *  check-pages.js will not tell you: it checks that a page loads what it
 *  references, not that an edit was meant for both readers.
 *
 *  WHY BOTH ARE KEPT. MolecularGeometry.md §1.6 says derive when shape carries
 *  the lesson and schematize when topology does, and that the failure is doing
 *  one while claiming the other. The pairs make that trade something you can
 *  look at:
 *
 *    ATP    built 1.02 Å out of its own plane, 14.4 Å across
 *           conformer 1.33 Å, 9.6 Å
 *    NADH   built 1.01 Å, 21.4 Å  ·  conformer 1.91 Å, 12.0 Å
 *
 *  A schematic is flat and EXTENDED whatever you feed it, because every torsion
 *  opens outward; a real conformer folds back, and the bigger the molecule the
 *  further it folds. The cost of schematizing is not a constant — it grows, and
 *  NADH is on the shelf to show it growing.
 *
 *  WHAT MAKES THE COMPARISON HONEST. A hand-built ribose has four stereocentres
 *  and no internal check can catch a global mirror (MolecularGeometry.md §1.3);
 *  nadhSkel has TWO of them. Without an external reference, "the two look
 *  different" would confound "different method" with "I got the sugar wrong",
 *  which is the confusion the comparison exists to remove. Hence `smiles` and a
 *  tools/check-handedness.js REF entry pointing at the SAME PubChem record the
 *  conformer matches. NADH goes one better: its generated `smiles` is
 *  byte-identical to `nadh`'s.
 * ===================================================================== */
(function(global){
  'use strict';
  const SELFNAME = 'mol-carriers.js';
  const Lib = global.MolLib
    || (typeof require === 'function' ? require('./molecules.js').MolLib : null);
  if (!Lib) throw new Error(SELFNAME + ': molecules.js must be loaded first');
  const { MOLECULES, VIEW, register } = Lib;
  const SkelLib = global.SkelLib
    || (typeof require === 'function' ? require('./skel.js').SkelLib : null);
  if (!SkelLib) throw new Error(SELFNAME + ': skel.js must be loaded first');
  const { GL, AR, TET, SP2, V, vadd, vsub, vmul, vlen, vnorm, vcross, rad,
          perpTo, Skel, chainC, flatRing, fuseRing, flatH, absorb, fitOnto,
          adenine, ribosyl, carboxylate, carboxylBranch } = SkelLib;

  const CARRIERS = {};

  {
    // — inorganic phosphate (Pi), the free phosphate already dissolved in the
    //   cytosol. Students routinely assume the second phosphate on 1,3-BPG cost
    //   an ATP; it did not, it came from here, so Pi is drawn as its own species.
    const s=new Skel(); s.put('P',V(0,0,0));
    [[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]].forEach(d=>{
      s.link(0, s.put('O', vmul(vnorm(V(d[0],d[1],d[2])), GL.PO))); });
    s.grow(1,'H',GL.OH,'sp3',0);
    // HPO₄²⁻ written out: O1 keeps the proton, O2 is the P=O, and the last two
    // carry the charge. Four single bonds on a neutral P would be a phosphorane
    // — the same trap Skel.phosphate() records.
    s.order(0,2,2); s.charge(3,-1); s.charge(4,-1);
    CARRIERS.pi=s.spec({ name:'Inorganic phosphate', short:'Pᵢ', formula:'HPO₄²⁻', charge:-2, class:'ion',
      smiles:'O=P([O-])([O-])O',
      gly:{ carbons:0, phosphates:1, free:true } });
    // — ATP, the carrier the priming steps spend and the payoff steps recharge.
    //   NOT built by Skel: adenine + ribose + a triphosphate chain is 31 heavy
    //   atoms and three fused/ring systems, so it comes from the PubChem 3D
    //   record for the TETRAANION (the cytosolic form) through
    //   tools/sdf2spec-generic.js, the same path AMP took in mol-monomers.js.
    //   Identified by CID, never by name: 'ATP' returns the neutral acid, which
    //   is a different charge state and a different atom count.
    //
    //   THE CLAIM THIS MOLECULE MAKES is the phosphate chain: three of them in
    //   a row, α through γ, with γ on the end. That is the whole reason ATP is
    //   the currency and the whole reason the page can take one off. `gamma`
    //   is the phosphoryl group that TRANSFERS — P plus its three terminal O.
    //   The bridging O between β and γ stays behind and becomes a terminal
    //   oxygen of ADP, which is what a kinase actually does: it moves PO₃⁻,
    //   not the whole phosphate. Removing exactly these four atoms from a built
    //   ATP therefore gives a correct ADP, which is how the page draws it.
    //
    //   HANDEDNESS IS INHERITED, NOT CHECKED HERE. The ribose has four
    //   stereocentres and no internal check can catch a global mirror
    //   (MolecularGeometry.md §1.3) — this spec's guarantee is its provenance:
    //   a CID whose name fixes the configuration (2R,3S,4R,5R), through a
    //   converter that keeps its basis right-handed. That is exactly the cover
    //   `amp` has in mol-monomers.js — except that this one now DOES carry a
    //   `smiles` and a `tools/check-handedness.js` REF entry, because
    //   molecule-viewer.html teaches ABOUT it rather than spending it. That is
    //   the upgrade this comment used to ask for; `amp` still has neither.
    CARRIERS.atp={ name:'Adenosine triphosphate', short:'ATP',
      formula:'C₁₀H₁₂N₅O₁₃P₃⁴⁻', charge:-4, class:'nucleotide',
      units:'angstrom',
      src:{path:'pubchem', cid:5461108, record:'3d',
           conformer:'0053547400000001', sdf:'atp.sdf',
           tool:'sdf2spec-generic', charge:-4, regen:'exact', fetched:'2026-08-12'},
      // FLAT DRAWING. `flat:true` says a page draws this molecule as a
      // structural diagram as well as a model, which is what makes
      // tools/spec2smiles.js generate the string below off these coordinates.
      // Never typed — a hand-written SMILES is a second, unchecked description
      // of the molecule sitting next to `atoms`/`bonds`, free to drift.
      // It is a DEPICTION string: the molblock it comes from carries no formal
      // charges, so this reads as the neutral acid while `formula` above says
      // what the spec actually is. The flat drawing shows connectivity, and the
      // page says the charge in words rather than letting the picture claim it.
      smiles:'Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)([O-])OP(=O)([O-])O[P:1](=[O:1])([O-:1])[O-:1])[C@@H](O)[C@H]1O',
      flat:true,
      // THE 2D LAYOUT the page slides these atoms onto. Heavy atoms only,
      // in spec order, real angstroms — baked by tools/bake-flat2d.js, which
      // has the reasoning. `register()` leaves it alone, so the page applies
      // SCALE itself.
      flat2d:[[3.146,1.441],[5.636,0.911],[6.423,-1.51],[-1.145,-0.042],[-2.744,-3.493],[0.454,-3.493],[1.748,0.987],[4.544,1.895],[2.692,2.839],[3.6,0.043],[6.729,-0.072],[4.653,-0.181],[6.62,2.004],[4.985,-1.204],[6.117,-2.948],[7.861,-1.815],[-3.732,-0.451],[-6.11,-0.451],[-3.451,2.22],[-5.656,3.493],[-7.861,2.22],[-1.88,-2.303],[-0.41,-2.303],[-2.334,-0.905],[0.044,-0.905],[1.442,-0.451],[-4.186,0.947],[-4.921,-1.315],[-5.656,0.947],[-6.391,2.22],[-4.186,3.493]],
      // adenine is the fused bicycle, ribose the third ring
      topology:{rings:[5,5,6], fused:true},
      gly:{ carbons:10, phosphates:3, carrier:true,
            pa:0, pb:1, pg:2,
            // the transferring phosphoryl: Pγ and its three terminal oxygens
            gamma:[2,13,14,15],
            // what is left once those four go, for the label beside it
            spent:{ name:'Adenosine diphosphate', short:'ADP',
                    formula:'C₁₀H₁₂N₅O₁₀P₂³⁻', phosphates:2 } },
      atoms:[ {el:'P',pos:[-3,-1.42,-1.163]},
              {el:'P',pos:[-0.234,-2.465,-1.045]},
              {el:'P',pos:[2.258,-2.882,0.526]},
              {el:'O',pos:[-1.352,0.358,1.474]},
              {el:'O',pos:[-1.361,3.12,3.107]},
              {el:'O',pos:[-3.831,2.91,1.972]},
              {el:'O',pos:[-3.406,-0.055,-0.358]},
              {el:'O',pos:[-1.563,-1.728,-0.448]},
              {el:'O',pos:[-2.757,-1.091,-2.621],q:-1},
              {el:'O',pos:[-3.971,-2.51,-0.768]},
              {el:'O',pos:[0.713,-2.361,0.283]},
              {el:'O',pos:[0.355,-1.595,-2.132],q:-1},
              {el:'O',pos:[-0.561,-3.921,-1.296]},
              {el:'O',pos:[2.565,-2.485,1.966],q:-1},
              {el:'O',pos:[2.176,-4.387,0.296],q:-1},
              {el:'O',pos:[3.076,-2.132,-0.52]},
              {el:'N',pos:[0.297,1.59,0.292]},
              {el:'N',pos:[0.774,1.777,-1.88]},
              {el:'N',pos:[2.541,1.336,1.188]},
              {el:'N',pos:[4.217,1.396,-0.584]},
              {el:'N',pos:[3.64,1.675,-2.89]},
              {el:'C',pos:[-1.399,2.744,1.731]},
              {el:'C',pos:[-2.771,2.225,1.341]},
              {el:'C',pos:[-0.501,1.524,1.517]},
              {el:'C',pos:[-2.697,0.768,1.766]},
              {el:'C',pos:[-3.679,-0.126,1.03]},
              {el:'C',pos:[1.657,1.502,0.192]},
              {el:'C',pos:[-0.187,1.754,-0.98]},
              {el:'C',pos:[1.932,1.62,-1.161]},
              {el:'C',pos:[3.27,1.562,-1.538]},
              {el:'C',pos:[3.8,1.295,0.701]},
              {el:'H',pos:[-1.11,3.627,1.153]},
              {el:'H',pos:[-2.897,2.324,0.259]},
              {el:'H',pos:[0.195,1.384,2.352]},
              {el:'H',pos:[-2.863,0.667,2.846]},
              {el:'H',pos:[-4.713,0.189,1.199]},
              {el:'H',pos:[-3.572,-1.156,1.386]},
              {el:'H',pos:[-0.453,3.406,3.304]},
              {el:'H',pos:[-4.662,2.487,1.698]},
              {el:'H',pos:[-1.241,1.843,-1.201]},
              {el:'H',pos:[4.585,1.161,1.438]},
              {el:'H',pos:[4.619,1.63,-3.139]},
              {el:'H',pos:[2.935,1.799,-3.604]} ],
      bonds:[[0,6,null],[0,7,null],[0,8,null],[0,9,2],[1,7,null],[1,10,null],[1,11,null],[1,12,2],[2,10,null],[2,13,null],[2,14,null],[2,15,2],[3,23,null],[3,24,null],[4,21,null],[4,37,null],[5,22,null],[5,38,null],[6,25,null],[16,23,null],[16,26,null],[16,27,null],[17,27,2],[17,28,null],[18,26,2],[18,30,null],[19,29,null],[19,30,2],[20,29,null],[20,41,null],[20,42,null],[21,22,null],[21,23,null],[21,31,null],[22,24,null],[22,32,null],[23,33,null],[24,25,null],[24,34,null],[25,35,null],[25,36,null],[26,28,null],[27,39,null],[28,29,2],[30,40,null]],
      optH:[31,32,33,34,35,36,39,40],
    };
    // The flat drawing highlights the SAME atoms the model does. Not a copy of
    // the list — the list itself, so the two views cannot drift apart and the
    // assertion that already checks `gamma` covers this too.
    CARRIERS.atp.flatMark = CARRIERS.atp.gly.gamma;

    // — NADH, the other carrier: the one glycolysis LOADS rather than spends.
    //   Same provenance and the same caveats as `atp` above — PubChem 3D by CID
    //   through tools/sdf2spec-generic.js, handedness inherited from the CID and
    //   checked by nothing here (MolecularGeometry.md 1.3) beyond the
    //   `smiles`/REF pair it shares with ATP.
    //
    //   CHARGE STATE: the NEUTRAL molecule (CID 439153), not the physiological
    //   dianion ATP is stored as. Deliberate, because the two carriers make
    //   different claims. ATP's claim is a chain of ionised phosphates that a
    //   kinase moves the end of, so its charge IS the lesson. NADH's claim is
    //   the nicotinamide ring: C4 (index 39) carries TWO hydrogens, one of them
    //   the hydride G3P dehydrogenase just put there, and the ring's aromaticity
    //   is broken to make room. That is visible in the geometry regardless of
    //   what the diphosphate bridge is doing, and the neutral record is the one
    //   a textbook draws.
    //
    //   THE MOLECULE IS A DIMER of two nucleotides joined tail to tail:
    //   adenine-ribose-P-O-P-ribose-nicotinamide. Only the nicotinamide half
    //   does chemistry; the adenine half is a handle the enzyme grips. `nic`
    //   names the working end so a page can point at it instead of guessing.
    CARRIERS.nadh={ name:'Nicotinamide adenine dinucleotide (reduced)', short:'NADH',
      formula:'C₂₁H₂₉N₇O₁₄P₂', charge:0, class:'nucleotide',
      units:'angstrom',
      src:{path:'pubchem', cid:439153, record:'3d',
           conformer:'0006B37100000001', sdf:'nadh.sdf',
           tool:'sdf2spec-generic', charge:0, regen:'exact', fetched:'2026-08-13'},
      // As ATP's above: generated, and a DEPICTION string only. `:1` marks are
      // the highlight set, folded onto the heavy atoms a flat drawing draws.
      smiles:'Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)(O)OP(=O)(O)OC[C@H]2O[C@@H]([N:1]3[CH:1]=[CH:1][CH2:1][C:1]([C:1]([NH2:1])=[O:1])=[CH:1]3)[C@H](O)[C@@H]2O)[C@@H](O)[C@H]1O',
      flat:true,
      // THE 2D LAYOUT the page slides these atoms onto. Heavy atoms only,
      // in spec order, real angstroms — baked by tools/bake-flat2d.js, which
      // has the reasoning. `register()` leaves it alone, so the page applies
      // SCALE itself.
      flat2d:[[-2.72,-3.465],[-0.425,-4.487],[-5.287,0.209],[3.777,-1.601],[-2.008,2.037],[-4.561,3.892],[3.721,-5.355],[6.604,-4.071],[-3.573,-2.291],[1.018,-4.335],[-1.868,-4.638],[-3.894,-4.317],[-0.576,-3.044],[-1.547,-2.612],[-0.273,-5.93],[11.191,0.113],[-7.115,2.037],[6.274,-0.932],[-9.463,2.037],[-6.838,4.673],[-9.014,5.93],[-11.191,4.673],[10.414,-2.277],[-3.388,1.588],[-4.561,2.441],[-3.836,0.209],[-5.735,1.588],[4.022,-3.936],[5.348,-3.346],[3.051,-2.858],[5.196,-1.903],[-2.983,-0.965],[1.608,-3.01],[-7.563,3.417],[7.654,-1.381],[-8.289,1.184],[5.973,0.487],[-9.014,3.417],[8.733,-0.41],[8.431,1.009],[7.051,1.458],[-9.74,4.673],[10.112,-0.858],[-7.563,5.93]],
      // two riboses (5), adenine's fused pair (5+6), nicotinamide (6)
      topology:{rings:[5,5,5,6,6], fused:true},
      gly:{ carbons:21, phosphates:2, carrier:true,
            // the reduced end: ring, the carbon that took the hydride, and the
            // two H's on it — one was there before, one arrived from G3P
            nic:{ ring:[17,34,38,39,40,36], n:17, c4:39, h:[63,64],
                  amide:{c:42, o:15, n:22} },
            // what is left once C4 gives the hydride back, for the label beside it
            spent:{ name:'Nicotinamide adenine dinucleotide (oxidised)',
                    short:'NAD⁺', formula:'C₂₁H₂₇N₇O₁₄P₂⁺' } },
      atoms:[ {el:'P',pos:[4.397,0.862,0.474]},
              {el:'P',pos:[3.266,0.526,3.169]},
              {el:'O',pos:[1.427,-1.871,-2.535]},
              {el:'O',pos:[-0.999,1.171,3.218]},
              {el:'O',pos:[1.383,0.689,-4.191]},
              {el:'O',pos:[-1.042,0.705,-2.966]},
              {el:'O',pos:[-2.705,-1.255,3.633]},
              {el:'O',pos:[-3.304,-0.542,1.071]},
              {el:'O',pos:[3.648,0.531,-0.922]},
              {el:'O',pos:[1.702,0.506,3.58]},
              {el:'O',pos:[3.222,0.834,1.583]},
              {el:'O',pos:[5.248,-0.474,0.802]},
              {el:'O',pos:[3.703,-1.03,3.225]},
              {el:'O',pos:[5.208,2.126,0.468]},
              {el:'O',pos:[4.136,1.457,3.962]},
              {el:'O',pos:[1.891,3.751,-1.243]},
              {el:'N',pos:[-0.832,-2.302,-1.948]},
              {el:'N',pos:[-1.715,2.198,1.204]},
              {el:'N',pos:[-1.549,-3.601,-0.285]},
              {el:'N',pos:[-2.797,-2.328,-3.375]},
              {el:'N',pos:[-4.578,-3.687,-2.406]},
              {el:'N',pos:[-4.337,-4.815,-0.31]},
              {el:'N',pos:[1.97,4.315,0.995]},
              {el:'C',pos:[1.385,0.497,-2.777]},
              {el:'C',pos:[0.017,0.021,-2.329]},
              {el:'C',pos:[2.271,-0.7,-2.444]},
              {el:'C',pos:[0.063,-1.447,-2.725]},
              {el:'C',pos:[-1.612,-1.064,2.736]},
              {el:'C',pos:[-2.031,-0.188,1.575]},
              {el:'C',pos:[-0.578,-0.193,3.435]},
              {el:'C',pos:[-2.015,1.198,2.198]},
              {el:'C',pos:[2.852,-0.636,-1.039]},
              {el:'C',pos:[0.827,-0.352,2.87]},
              {el:'C',pos:[-2.105,-2.67,-2.278]},
              {el:'C',pos:[-0.396,2.591,0.936]},
              {el:'C',pos:[-0.543,-2.886,-0.743]},
              {el:'C',pos:[-2.731,2.873,0.517]},
              {el:'C',pos:[-2.532,-3.475,-1.234]},
              {el:'C',pos:[-0.068,3.546,0.049]},
              {el:'C',pos:[-1.12,4.287,-0.738]},
              {el:'C',pos:[-2.522,3.841,-0.391]},
              {el:'C',pos:[-3.821,-3.991,-1.324]},
              {el:'C',pos:[1.343,3.872,-0.147]},
              {el:'C',pos:[-4.027,-2.887,-3.351]},
              {el:'H',pos:[1.683,1.44,-2.318]},
              {el:'H',pos:[-0.088,0.134,-1.244]},
              {el:'H',pos:[3.081,-0.808,-3.174]},
              {el:'H',pos:[-0.191,-1.598,-3.782]},
              {el:'H',pos:[-1.25,-2.05,2.431]},
              {el:'H',pos:[-1.302,-0.268,0.761]},
              {el:'H',pos:[-0.562,-0.348,4.52]},
              {el:'H',pos:[-2.966,1.422,2.698]},
              {el:'H',pos:[2.06,-0.623,-0.284]},
              {el:'H',pos:[3.464,-1.524,-0.848]},
              {el:'H',pos:[1.15,-1.389,2.998]},
              {el:'H',pos:[0.863,-0.104,1.806]},
              {el:'H',pos:[2.282,0.955,-4.449]},
              {el:'H',pos:[-0.948,1.649,-2.751]},
              {el:'H',pos:[-2.38,-1.789,4.378]},
              {el:'H',pos:[-3.265,-1.478,0.811]},
              {el:'H',pos:[0.364,2.061,1.491]},
              {el:'H',pos:[0.406,-2.754,-0.241]},
              {el:'H',pos:[-3.733,2.546,0.772]},
              {el:'H',pos:[-0.956,4.127,-1.81]},
              {el:'H',pos:[-1.033,5.361,-0.54]},
              {el:'H',pos:[-3.36,4.318,-0.889]},
              {el:'H',pos:[-4.661,-2.664,-4.202]},
              {el:'H',pos:[5.886,-0.46,1.547]},
              {el:'H',pos:[3.262,-1.68,2.638]},
              {el:'H',pos:[-5.277,-5.177,-0.398]},
              {el:'H',pos:[-3.775,-5.042,0.5]},
              {el:'H',pos:[2.953,4.568,0.982]},
              {el:'H',pos:[1.491,4.415,1.884]} ],
      bonds:[[0,8,null],[0,10,null],[0,11,null],[0,13,2],[1,9,null],[1,10,null],[1,12,null],[1,14,2],[2,25,null],[2,26,null],[3,29,null],[3,30,null],[4,23,null],[4,56,null],[5,24,null],[5,57,null],[6,27,null],[6,58,null],[7,28,null],[7,59,null],[8,31,null],[9,32,null],[11,67,null],[12,68,null],[15,42,2],[16,26,null],[16,33,null],[16,35,null],[17,30,null],[17,34,null],[17,36,null],[18,35,2],[18,37,null],[19,33,2],[19,43,null],[20,41,null],[20,43,2],[21,41,null],[21,69,null],[21,70,null],[22,42,null],[22,71,null],[22,72,null],[23,24,null],[23,25,null],[23,44,null],[24,26,null],[24,45,null],[25,31,null],[25,46,null],[26,47,null],[27,28,null],[27,29,null],[27,48,null],[28,30,null],[28,49,null],[29,32,null],[29,50,null],[30,51,null],[31,52,null],[31,53,null],[32,54,null],[32,55,null],[33,37,null],[34,38,2],[34,60,null],[35,61,null],[36,40,2],[36,62,null],[37,41,2],[38,39,null],[38,42,null],[39,40,null],[39,63,null],[39,64,null],[40,65,null],[43,66,null]],
      optH:[44,45,46,47,48,49,50,51,52,53,54,55,60,61,62,63,64,65,66],
    };
    // Same rule as ATP's above: assembled from the checked `nic` block, never
    // retyped. The two H's fold onto C4 in the flat drawing (a hydrogen has no
    // glyph of its own there), which tools/spec2smiles.js does for every mark.
    {
      const n = CARRIERS.nadh.gly.nic;
      CARRIERS.nadh.flatMark =
        [...n.ring, n.c4, ...n.h, n.amide.c, n.amide.o, n.amide.n];
    }
  }

  /* =====================================================================
   *  COENZYME A, AND THE TWO THIOESTERS THE CYCLE MAKES OF IT
   * =====================================================================
   *  DRAWN IN FULL, all seventy-odd atoms, and that is a deliberate answer to
   *  a real question. Only the thiol end reacts: everything from the amide
   *  nitrogens back through the pantothenate arm to adenine and its three
   *  phosphates is a HANDLE, untouched by every step that uses it. Truncating
   *  to the business end would be defensible and this file does not do it, for
   *  two reasons the lesson depends on:
   *
   *    · THE SIZE IS THE POINT. Acetyl-CoA delivers TWO carbons to a
   *      four-carbon acceptor, and it is the biggest molecule on the stage by
   *      a wide margin. A student who sees the acetyl group next to the
   *      apparatus that carries it has the right picture of what a coenzyme
   *      IS: mostly recognition surface, with a tiny reactive tip. Drawn
   *      truncated, acetyl-CoA looks like a small molecule and "carrier"
   *      becomes a word rather than a shape.
   *    · IT IS HALF AN ADENINE NUCLEOTIDE, like ATP and NAD⁺ before it. Three
   *      carriers on three pages, all built on the same ADP core, is a fact
   *      worth being able to SEE — and it is the standard argument for the RNA
   *      world, which is a Bio 101 idea this repo can actually draw.
   *
   *  So the cost is paid here rather than in the drawing, which is exactly why
   *  this file is separate from mol-pathways.js (see the header).
   *
   *  ONE SKELETON, THREE SPECS. `buildCoA()` returns the whole thing plus the
   *  index of its sulfur; CoA-SH caps that with a hydrogen and the two
   *  thioesters put an acyl group there instead. Building them separately is
   *  how the acetyl and succinyl forms end up disagreeing about a molecule
   *  they share ninety percent of.
   */

  /* Remove one atom and close the gap, remapping every bond. Skel has no such
   * operation and should not grow one for this: `centroid()` reduces over the
   * whole array, so a hole left in place makes the very next `grow` throw, and
   * a builder that can leave holes is a builder every caller has to know about.
   * Doing it here, once, immediately, keeps that contained — the returned map
   * is applied to the handful of indices still live at the call site. */
  /* THE FORMULAS ARE THE LITERATURE'S, for the anion each spec declares —
   * hydrogen included, even though these builds draw almost none of it.
   * check-molecules.js excludes H from its comparison for exactly this reason
   * (a spec's H count is a drawing decision, a formula's is a chemical one)
   * and checks every heavy element against the atoms actually built, so these
   * strings are pinned to the skeleton on every count that can be. */
  const FORMULA = {
    coa:         'C₂₁H₃₂N₇O₁₆P₃S⁴⁻',
    acetylcoa:   'C₂₃H₃₄N₇O₁₇P₃S⁴⁻',
    succinylcoa: 'C₂₅H₃₅N₇O₁₉P₃S⁵⁻',
  };


  /* AN EXTENDED CHAIN OF MIXED ELEMENTS, in the plane, at the real ~111°.
   *
   * `chainC` does this for carbon at one bond length; CoA's arm is twelve
   * atoms of C, N and S at five different lengths, and it has to come out
   * EXTENDED. Grown atom-by-atom with `grow` it does not: slot 0 is seeded
   * away from the centroid of everything placed so far (`outwardAt`), which is
   * exactly right for splaying a substituent into open space and wrong for a
   * long chain hanging off a heavy head — the centroid barely moves, every
   * step turns the same way, and the arm curls into an arc until its two
   * amides collide. check-molecules.js reported that as three overlapping
   * pairs, which is how it was found.
   *
   * So the backbone is LAID DOWN, not grown: alternating steps 34.5° either
   * side of −Y, which is the same construction `chainC` uses (90° − 111°/2)
   * and puts every bond angle at 111° by arithmetic rather than by hope.
   * Substituents are still grown afterwards — by then each backbone atom has
   * two neighbours, so `freeTet`/`freeSp2` return the out-of-plane pair and
   * the well-behaved case is the only one left.
   *
   * THE ARM'S CONFORMATION IS A DECLARED SCHEMATIC (MolecularGeometry.md
   * §1.6). A real pantetheine arm is a floppy rotor and adopts no particular
   * shape; fully extended is the legible one, it is what every textbook draws,
   * and nothing in the lesson rests on its torsions. What the lesson does rest
   * on — that the arm is LONG, and holds the reactive sulfur far from the
   * nucleotide — is exactly what extending it shows.
   */
  function extendedChain(els, lens){
    const s = new Skel(), a = rad(90 - 111 / 2);
    const idx = [];
    let p = V(0, 0, 0);
    els.forEach((el, k) => {
      if (k) p = vadd(p, vmul(V((k % 2 ? 1 : -1) * Math.sin(a), -Math.cos(a), 0), lens[k]));
      idx.push(s.put(el, p));
      if (k) s.link(idx[k - 1], idx[k]);
    });
    return { s, idx };
  }

  function dropAtom(s, victim){
    const map = [];
    const kept = [];
    s.atoms.forEach((a, i) => { if (i !== victim) { map[i] = kept.length; kept.push(a); } });
    s.atoms = kept;
    s.bonds = s.bonds
      .filter(b => b[0] !== victim && b[1] !== victim)
      .map(b => b.length > 2 ? [map[b[0]], map[b[1]], b[2]] : [map[b[0]], map[b[1]]]);
    return map;
  }

  function buildCoA(){
    // — the adenosine half, exactly as ATP and NADH build it: a flat adenine
    //   fitted onto β-D-ribofuranose's reserved β slot at C1′. The face
    //   choices ARE the stereochemistry (see ribosyl's note in skel.js); none
    //   of them is made here, which is the point of using the helper.
    const r = SkelLib.ribosyl();
    const s = r.s;
    /* THE SAME JOIN ATP MAKES, with the same numbers — deliberately, not by
     * coincidence. `outN9` is the base's own outward direction (the negated sum
     * of N9's existing bonds), it is carried onto the NEGATED β-slot direction,
     * and `CHI` is the glycosidic torsion χ. 106° puts χ at −120.5°, ANTI,
     * where purine nucleotides actually sit; mol-compare.js swept it and its
     * note carries the argument. Reproducing that here rather than picking a
     * fresh spin is the whole point of three carriers sharing one core — a
     * different χ would make CoA's adenosine a visibly different shape from
     * ATP's for no reason, and the first spin tried here (0, with the
     * un-negated direction) folded the base onto the ribose hard enough that
     * check-molecules.js reported four overlapping pairs. */
    const CHI = 106 * Math.PI / 180;
    const ade = SkelLib.adenine();
    const outN9 = vnorm(vmul(ade.s.nbrs(ade.n9).reduce(vadd, V(0,0,0)), -1));
    SkelLib.fitOnto(ade.s, ade.n9, outN9, vmul(r.baseDir, -1), r.basePos, CHI);
    const off = SkelLib.absorb(s, ade.s);
    s.link(r.c1, ade.n9 + off);
    // C1′'s own hydrogen goes on only NOW — the β slot is occupied by a BOND
    // rather than an atom until the link above exists, and freeTet reports
    // what is free, not what is spoken for. (skel.js's ribosyl note.)
    s.grow(r.c1, 'H', GL.CH, 'sp3', 0);

    /* — THE 3′-PHOSPHATE, which is what makes this coenzyme A rather than a
     *   plain nucleotide arm. It does no chemistry whatsoever; it is a
     *   recognition tag, and it is how an enzyme tells CoA from ADP, whose
     *   entire 5′ end it otherwise shares. Worth drawing for that alone —
     *   "the difference between two carriers is one phosphate at a place
     *   nothing reacts" is a good fact, and it is the same fact NAD⁺ vs NADP⁺
     *   turns on.
     *
     *   It REPLACES the 3′ hydroxyl's hydrogen, so that H is dropped first and
     *   every index still in use is remapped before anything else is grown.
     */
    let c1 = r.c1, c5 = r.c5, o3 = r.o3, n9 = ade.n9 + off;
    {
      const bond = s.bonds.find(b => (b[0] === o3 || b[1] === o3) &&
        s.atoms[b[0] === o3 ? b[1] : b[0]].el === 'H');
      if (bond) {
        const m = dropAtom(s, bond[0] === o3 ? bond[1] : bond[0]);
        c1 = m[c1]; c5 = m[c5]; o3 = m[o3]; n9 = m[n9];
      }
    }
    const p3 = s.phosphoUnit(o3, { terminal:true }).p;

    // — the 5′ diphosphate: two phosphorus in a row bridged by oxygen, the
    //   same α–β chain ATP opens with. `phosphoUnit` grows the bridge BEFORE
    //   the terminal oxygens so the chain extends outward instead of folding
    //   back over the ribose (its note).
    const o5 = s.grow(c5, 'O', GL.CO, 'sp3', 0);
    const a1 = s.phosphoUnit(o5, {});            // Pα + the α–β bridge
    const a2 = s.phosphoUnit(a1.bridge, {});     // Pβ + the bridge to pantothenate

    /* — PANTOTHENATE (vitamin B5) and β-mercaptoethylamine, the arm. This is
     *   the half a student has a reason to care about: it is a VITAMIN, it is
     *   why B5 is one, and it ends in the sulfur everything attaches to. Built
     *   as a plain chain of grows because it is a chain — no ring, and no
     *   stereochemistry to get wrong except the one noted below.
     *
     *   Pβ–O–CH₂–C(CH₃)₂–CH(OH)–C(=O)–NH–CH₂–CH₂–C(=O)–NH–CH₂–CH₂–SH
     */
    const arm = extendedChain(
      // cP1 cQ  cR  cA1 nA1 cB1 cB2 cA2 nA2 cC1 cC2  S
      ['C','C','C','C','N','C','C','C','N','C','C','S'],
      // the bond INTO each atom; [0] is unused (nothing precedes cP1).
      // The two amide C–N are AR.CN (1.34, shortened by the amide's
      // partial double-bond character); the two N–C leaving them are
      // ordinary GL.CN single bonds.
      [ GL.CO, GL.CC, GL.CC, GL.CC, AR.CN, GL.CN, GL.CC,
        GL.CC, AR.CN, GL.CN, GL.CC, GL.CS ]);
    const A = SkelLib.absorb(s, SkelLib.fitOnto(arm.s, 0,
      vsub(arm.s.at(1), arm.s.at(0)),                    // the chain's own axis…
      s.freeTet(a2.bridge)[0],                           // …onto the bridge's free slot
      vadd(s.at(a2.bridge), vmul(s.freeTet(a2.bridge)[0], GL.CO)), 0));
    const at = i => arm.idx[i] + A;
    s.link(a2.bridge, at(0));
    const cP1 = at(0), cQ = at(1), cR = at(2),
          cA1 = at(3), nA1 = at(4), cB1 = at(5), cB2 = at(6),
          cA2 = at(7), nA2 = at(8), cC1 = at(9), cC2 = at(10), S = at(11);
    s.grow(cQ, 'C', GL.CC, 'sp3', 0);                           // two methyls, united
    s.grow(cQ, 'C', GL.CC, 'sp3', 0);                           //   atoms like pyruvate's
    /* THE ONE STEREOCENTRE IN THE ARM, AND IT IS DELIBERATELY NOT ASSERTED.
     * Pantothenate is (R) at this carbon and only the R form is the vitamin.
     * It is left undeclared because nothing in this pathway acts on it and
     * nothing is drawn against its mirror — and per MolecularGeometry.md §1.4
     * a claim ships with its assertion or it does not ship. Declaring (R) here
     * would state a fact the lesson never uses, the render never shows, and
     * the build was never steered toward: `grow` took whichever slot was free.
     * If a vitamin lesson ever draws it, THAT is the moment to add `chiral`
     * and to place this carbon deliberately. The hydrogen it would need is
     * already here.
     */
    s.hydroxyl(cR, 0);
    s.grow(cR, 'H', GL.CH, 'sp3', 0);
    // the two amide carbonyls and their N–H, hung off the chain that already
    // exists — both carbons are sp2, so their O takes a 120° slot
    s.grow(cA1, 'O', GL.CdO, 'sp2', 0, 2);
    s.grow(nA1, 'H', AR.NH, 'sp2', 0);
    s.grow(cA2, 'O', GL.CdO, 'sp2', 0, 2);
    s.grow(nA2, 'H', AR.NH, 'sp2', 0);

    return { s, S, p3, pa:a1.p, pb:a2.p, n9, c1 };
  }

  /* ONE VIEW FOR THE HANDLE AND WHAT IT CARRIES, shared by reference so the
   * free thiol and the thioester cannot drift apart: the bridge shows them side
   * by side, and the acetyl group is the only difference the student should see.
   * Picked in molecule-viewer.html. */
  const COA_VIEW = [-0.4264, 1.4350, -1.1988];
  {
    // — coenzyme A itself, the free thiol. Registered as its own species
    //   because the cycle RELEASES it twice — citrate synthase and the α-KG
    //   dehydrogenase complex both hand it back — so it stands on the stage
    //   rather than being a suffix on someone else's name.
    const { s, S, p3, pa, pb } = buildCoA();
    s.grow(S, 'H', GL.SH, 'sp3', 0);
    CARRIERS.coa = s.spec({
      name:'Coenzyme A', short:'CoA-SH', formula:FORMULA.coa, charge:-4,
      smiles:'CC(C)(COP(=O)([O-])OP(=O)([O-])OC[C@H]1O[C@@H](n2cnc3c(N)ncnc32)[C@H](O)[C@@H]1OP(=O)([O-])[O-])[C@@H](O)C(=O)NCCC(=O)NCCS',
      class:'carrier',
      view:COA_VIEW,
      krebs:{ carrier:true, thiol:S, phosphates:3, p3, pa, pb } });
  }

  /* ---- the two thioesters ---------------------------------------------
   * ACYL–S–CoA. The acyl carbon is sp2 (it is a carbonyl), so it is grown at
   * 120° off the sulfur rather than at the thiol's tetrahedral angle — the
   * same distinction PEP's enol ester makes in mol-pathways.js, and for the
   * same reason: the helpers assume a tetrahedral parent unless told.
   *
   * `hot` names the thioester carbon on both, the way glycolysis's specs name
   * the phosphate a step transfers. It is the bond that breaks in each case:
   * citrate synthase cleaves acetyl-CoA's, and succinyl-CoA synthetase cleaves
   * succinyl-CoA's to drive the cycle's one substrate-level phosphorylation.
   */
  const thioester = (n) => {
    const b = buildCoA();
    // THE ACYL GROUP IS LAID DOWN EXTENDED, for the arm's reason and found the
    // same way: grown atom-by-atom, succinyl's four carbons curled back until
    // its far carboxylate sat 1.84 A off the thioester's own carbonyl oxygen,
    // which check-molecules.js reported as an overlap. `n` is the acyl's
    // carbon count -- 2 for acetyl, 4 for succinyl -- and the first of them is
    // the thioester carbon itself.
    const acyl = extendedChain(Array(n).fill('C'),
                               [GL.CS, ...Array(n - 1).fill(GL.CC)]);
    const slot = b.s.freeTet(b.S)[0];
    const A = SkelLib.absorb(b.s, SkelLib.fitOnto(acyl.s, 0,
      n > 1 ? vsub(acyl.s.at(1), acyl.s.at(0)) : V(0, -1, 0),
      slot, vadd(b.s.at(b.S), vmul(slot, GL.CS)), 0));
    const c = acyl.idx.map(i => i + A);
    b.s.link(b.S, c[0]);
    b.s.grow(c[0], 'O', GL.CdO, 'sp2', 0, 2);        // the thioester's carbonyl
    return Object.assign(b, { c });
  };
  {
    // — acetyl-CoA: two carbons on the end of all that apparatus, and the
    //   molecule every catabolic pathway funnels into. Fat, sugar and most
    //   amino acids all arrive here — and nothing in human metabolism turns it
    //   back into glucose, which is why "fat cannot become sugar" is true and
    //   why this molecule is the right place to say so.
    const { s, S, c, p3, pa, pb } = thioester(2);    // C(=O) + the methyl
    CARRIERS.acetylcoa = s.spec({
      name:'Acetyl-CoA', short:'Acetyl-CoA', formula:FORMULA.acetylcoa, charge:-4,
      smiles:'CC(=O)SCCNC(=O)CCNC(=O)[C@H](O)C(C)(C)COP(=O)([O-])OP(=O)([O-])OC[C@H]1O[C@@H](n2cnc3c(N)ncnc32)[C@H](O)[C@@H]1OP(=O)([O-])[O-]',
      class:'carrier',
      view:COA_VIEW,
      krebs:{ carrier:true, thiol:S, hot:c[0], acyl:c, thio:[S, c[0]], carbons:2,
              phosphates:3, p3, pa, pb } });
  }
  {
    // — succinyl-CoA: the same handle carrying four carbons instead of two,
    //   and the cycle's one high-energy intermediate. Breaking its thioester
    //   phosphorylates GDP (or ADP) directly — substrate-level, the same trick
    //   glycolysis's steps 7 and 10 use, and the only instance of it here.
    const { s, S, c, p3, pa, pb } = thioester(4);    // C(=O)–CH₂–CH₂–COO⁻
    carboxylate(s, c[3], 0);
    CARRIERS.succinylcoa = s.spec({
      name:'Succinyl-CoA', short:'Succinyl-CoA', formula:FORMULA.succinylcoa, charge:-5,
      smiles:'CC(C)(COP(=O)([O-])OP(=O)([O-])OC[C@H]1O[C@@H](n2cnc3c(N)ncnc32)[C@H](O)[C@@H]1OP(=O)([O-])[O-])[C@@H](O)C(=O)NCCC(=O)NCCSC(=O)CCC(=O)[O-]',
      class:'carrier',
      view:COA_VIEW,
      krebs:{ carrier:true, thiol:S, hot:c[0], acyl:c, thio:[S, c[0]], carbons:4,
              phosphates:3, p3, pa, pb } });
  }


  /* =====================================================================
   *  FAD / FADH₂ — the carrier this cycle has that glycolysis does not
   * =====================================================================
   *  Succinate → fumarate is the one oxidation in the cycle that does NOT
   *  reduce NAD⁺, and the reason is worth a molecule: taking two hydrogens off
   *  a plain C–C to make a C=C releases less energy than oxidising an alcohol
   *  to a ketone, not enough to reduce NAD⁺, and FAD's flavin sits at the
   *  lower potential that can take it. That is why the cycle's ledger reads
   *  3 NADH + 1 FADH₂ rather than 4 NADH, and why FADH₂ is worth fewer ATP
   *  downstream — it enters the chain at complex II, past the first pump.
   *
   *  THE SAME TWO-STATE SHAPE AS ATP/ADP AND NAD⁺/NADH — one molecule, two
   *  states, differing by the atoms a step moves (kit/carriers.js's contract).
   *  Here the difference is TWO HYDROGENS, on N1 and N5 of the flavin, and
   *  `redox` names them so a page can hide exactly those to show the oxidised
   *  form. FADH₂ is built as the full molecule and FAD is FADH₂ minus that
   *  pair, so the two cannot disagree about where the hydrogens go.
   *
   *  ISOALLOXAZINE, drawn flat and drawn in full. Three fused six-rings in a
   *  row — dimethylbenzene, then the pyrazine that carries N5 and N10, then
   *  the pyrimidinedione with its two carbonyls — and every one of them is
   *  aromatic or conjugated, so `flatRing`/`fuseRing` keep the whole system in
   *  one plane. A tetrahedral builder would pucker it, and a puckered flavin
   *  is not a flavin: the ring system is planar precisely so it can stack, and
   *  stacking is how it sits in its enzyme.
   *
   *  AND IT IS A NUCLEOTIDE TOO — flavin adenine DInucleotide. Ribitol (an
   *  open-chain sugar alcohol, NOT a ring — the "flavin mononucleotide" half
   *  is famously not a real nucleotide for exactly that reason), a
   *  pyrophosphate bridge, then ribose and adenine: the same ADP core ATP,
   *  NADH and CoA are all built on. Four carriers, one core.
   */
  function buildFlavin(){
    /* — the tricycle. Ring A is the dimethylbenzene, ring B the pyrazine
     *   fused across A's C5a–C9a edge, ring C the pyrimidinedione fused across
     *   B's C4a–C10a edge. Each fuse opens AWAY from the previous ring's
     *   centre, which is what makes the three LINEAR rather than angular —
     *   an angular isoalloxazine is a different chromophore.
     */
    const s = flatRing(6, ['C','C','C','C','C','C']);      // ring A
    const cA = s.centroid();
    // ring B across A's edge 3–4, carrying N5 and N10
    const B = fuseRing(s, 6, 3, 4, cA, ['N','C','C','N']);
    const n5 = B[0], c4a = B[1], c10a = B[2], n10 = B[3];
    const cB = vmul(vadd(vadd(s.at(3), s.at(4)), vadd(s.at(c4a), s.at(c10a))), 0.25);
    // ring C across B's c4a–c10a edge: N1, C2(=O), N3(H), C4(=O)
    const C = fuseRing(s, 6, c4a, c10a, cB, ['N','C','N','C']);
    const n1 = C[0], c2 = C[1], n3 = C[2], c4 = C[3];

    /* ONE KEKULÉ STRUCTURE, and it is the REDUCED one — FADH₂. The benzene
     * alternates; ring B is drawn with N5 and N10 as amines (both carry an H
     * in FADH₂, N10's replaced by the ribitol chain); the two carbonyls are
     * real double bonds in both states. Oxidised FAD is this minus two
     * hydrogens, and its extra ring double bonds are NOT re-drawn — see the
     * note where FAD is registered.
     */
    s.order(0, 1, 2).order(2, 3, 2).order(4, 5, 2);        // ring A aromatic
    /* …AND THE C4a=C10a DOUBLE BOND, which the reduced ring really has: the
     * 1,5-dihydro flavin is N1(H)–C10a=C4a–N5(H), and that one double bond is
     * what makes ring C conjugated rather than a saturated urea. Left out, the
     * molecule is 1,5-dihydro-FADH₂ — two hydrogens further reduced than
     * anything in biology — and tools/check-handedness.js said so by writing
     * our ring `C1NC(=O)NC(=O)C1` against PubChem's aromatic `c1[nH]…c1`. */
    s.order(c4a, c10a, 2);
    const o2 = s.grow(c2, 'O', GL.CdO, 'sp2', 0, 2);
    const o4 = s.grow(c4, 'O', GL.CdO, 'sp2', 0, 2);
    /* THE TWO METHYLS GO ON THE MIDDLE PAIR — it is 7,8-dimethylisoalloxazine,
     * and 7 and 8 are the benzene carbons FURTHEST from the ring fusion. Ring
     * A is 0–5 and the fuse took edge 3–4, so 2 and 5 are the carbons ortho to
     * the fusion (C6 and C9) and 0 and 1 are the middle pair. Put on 1 and 2 —
     * one middle, one outer — this builds 6,7-dimethylisoalloxazine, a real
     * compound and the wrong one; every bond length and angle is identical and
     * check-molecules.js cannot see it, because ring topology and ring count
     * are unchanged. check-handedness caught it against PubChem. */
    const me7 = flatH(s, 0, GL.CC); s.atoms[me7].el = 'C';
    const me8 = flatH(s, 1, GL.CC); s.atoms[me8].el = 'C';
    // ring hydrogens on the two carbons that keep one: C6 and C9
    flatH(s, 2, AR.CH);
    flatH(s, 5, AR.CH);
    const h3 = flatH(s, n3, AR.NH);
    // …and the two the redox state turns on. N10's slot is taken by the
    // ribitol chain below, so only N5 and N1 get one here.
    const h5 = flatH(s, n5, AR.NH);
    const h1 = flatH(s, n1, AR.NH);
    return { s, n5, n10, n1, n3, c4a, c10a, o2, o4, h1, h5,
             ring:[0,1,2,3,4,5,n5,c4a,c10a,n10,n1,c2,n3,c4] };
  }

  function buildFAD(){
    const f = buildFlavin();
    const s = f.s;
    /* — RIBITOL, and it is the reason this molecule's name is a small lie.
     *   An open-chain sugar ALCOHOL, five carbons with hydroxyls on three of
     *   them, joined to N10 by a plain C–N bond. There is no anomeric carbon
     *   and no ring, so "flavin mononucleotide" is not a nucleotide at all —
     *   a nucleotide needs a glycosidic bond to a sugar RING. Worth drawing
     *   correctly rather than substituting a ribose, because a student who
     *   has just met ATP and NAD⁺ will assume it is one.
     *
     *   Laid down extended, for the same reason CoA's arm is (see
     *   `extendedChain`): a five-carbon chain grown off a heavy flat ring
     *   curls back over it.
     */
    const rib = extendedChain(['C','C','C','C','C'],
                              [GL.CN, GL.CC, GL.CC, GL.CC, GL.CC]);
    const slot = vnorm(vmul(s.nbrs(f.n10).reduce(vadd, V(0,0,0)), -1));
    const R = SkelLib.absorb(s, SkelLib.fitOnto(rib.s, 0,
      vsub(rib.s.at(1), rib.s.at(0)), slot,
      vadd(s.at(f.n10), vmul(slot, GL.CN)), 0));
    const rc = rib.idx.map(i => i + R);
    s.link(f.n10, rc[0]);
    /* — the three hydroxyls, on ribitol's 2′, 3′ and 4′. The 1′ carbon carries
     *   the flavin and the 5′ carries the phosphate.
     *
     *   SLOT 1, NOT SLOT 0, AND THAT IS THE WHOLE STEREOCHEMISTRY OF THIS
     *   MOLECULE. `freeTet` hands back the two open slots on a chain carbon in
     *   an order that falls out of a cross-product sign, not out of chemistry
     *   — the same trap `equatorial()` exists to avoid on a ring. Taking slot 0
     *   because it is first makes no choice at all, and the one it happens to
     *   give is the WRONG ONE: it builds L-ribitol, the enantiomer, with every
     *   bond length, every angle and every rendered pixel identical to the real
     *   thing. Real FAD is D-ribitol, (2S,3S,4R).
     *
     *   Nothing inside this repo can see that. `chiral:` measures a signed
     *   volume against a priority order this file would also have written, and
     *   check-molecules.js passed the mirrored build without complaint. It was
     *   caught by `tools/check-handedness.js`, which is the only check that
     *   reaches outside for an absolute answer — the same tool that once found
     *   every Skel-built sugar in this library was the L-enantiomer
     *   (MolecularGeometry.md §1.3). The `fadh2` row there is what holds this
     *   line honest; change this slot and that row fails.
     */
    [1, 2, 3].forEach(k => s.hydroxyl(rc[k], 1));

    // — the pyrophosphate bridge and the adenosine half, exactly as CoA and
    //   ATP build it: Pα, the α–β bridge, Pβ, then a ribose 5′ oxygen.
    const o5 = s.grow(rc[4], 'O', GL.CO, 'sp3', 0);
    const a1 = s.phosphoUnit(o5, {});
    const a2 = s.phosphoUnit(a1.bridge, {});

    const r = SkelLib.ribosyl();
    const ade = SkelLib.adenine();
    const CHI = 106 * Math.PI / 180;               // ANTI, the same χ as ATP's
    const outN9 = vnorm(vmul(ade.s.nbrs(ade.n9).reduce(vadd, V(0,0,0)), -1));
    SkelLib.fitOnto(ade.s, ade.n9, outN9, vmul(r.baseDir, -1), r.basePos, CHI);
    const aoff = SkelLib.absorb(r.s, ade.s);
    r.s.link(r.c1, ade.n9 + aoff);
    r.s.grow(r.c1, 'H', GL.CH, 'sp3', 0);          // after the link — see buildCoA

    /* — and join the two halves at the bridge's far oxygen, exactly the way
     *   NADH does it (mol-compare.js): the direction is the bridging oxygen's
     *   own FREE SLOT, negated, and C5′ arrives along its own free slot. Using
     *   the P→O vector instead — which is what this did first — aims the
     *   ribose down the bond it is joining rather than into the open slot, and
     *   swings the ring into Pβ's terminal oxygen: check-molecules.js reported
     *   it as a 0.18 overlap on both FAD and FADH₂.
     *
     *   BRIDGE_CHI is that join's torsion, swept the way NADH's was and
     *   decided the same way — but NOT to the same value, which is worth
     *   recording because the first version of this line simply copied NADH's
     *   200° along with its justification. Swept here at 10° steps, clearance
     *   is FLAT: the closest non-bonded pair is 3.32 Å at every angle on the
     *   circle, so it decides nothing (the same finding NADH reports). Extent
     *   does decide, and it does not favour 200°:
     *
     *       80°   51.10 Å across, 2.06 out of plane   ← this
     *      200°   48.78 Å across, 2.05 out of plane
     *      260°   47.93 Å across                       (the least extended)
     *
     *   So 80°, for the reason NADH gives: the most EXTENDED arrangement, so
     *   the flavin and the adenine read as two halves joined tail to tail
     *   rather than as one blob. Flatness is within noise across 60–90° and
     *   breaks the near-tie for nothing, so extent alone picks it. Declared
     *   schematic per §1.6, unchecked, same standing as χ. */
    const BRIDGE_CHI = 80 * Math.PI / 180;
    const dirO5b = s.freeTet(a2.bridge)[0];
    const outC5 = r.s.freeTet(r.c5)[0];
    const N = SkelLib.absorb(s, SkelLib.fitOnto(r.s, r.c5, outC5,
      vmul(dirO5b, -1), vadd(s.at(a2.bridge), vmul(dirO5b, GL.CO)), BRIDGE_CHI));
    s.link(a2.bridge, r.c5 + N);
    return Object.assign(f, { s, pa:a1.p, pb:a2.p, n9:ade.n9 + aoff + N });
  }

  {
    // — FADH₂, the reduced form: the molecule as built, both redox hydrogens
    //   present. Registered first because it is the one the geometry is, and
    //   FAD is derived from it below.
    const f = buildFAD();
    CARRIERS.fadh2 = f.s.spec({
      // FACE-ON. The isoalloxazine is built flat in the xz-plane like every
      // other fused aromatic here, so without this it is drawn edge-on — a
      // three-ring system rendered as a line, on the one carrier whose whole
      // point is the two hydrogens sitting on its face.
      view:VIEW.flatRing,
      name:'FADH₂', short:'FADH₂', formula:'C₂₇H₃₅N₉O₁₅P₂²⁻', charge:-2,
      smiles:'Cc1cc2c(cc1C)N(C[C@H](O)[C@H](O)[C@H](O)COP(=O)([O-])OP(=O)([O-])OC[C@H]1O[C@@H](n3cnc4c(N)ncnc43)[C@H](O)[C@@H]1O)c1[nH]c(=O)[nH]c(=O)c1N2',
      class:'carrier',
      // Six rings: the flavin's three, adenine's fused pair, and the ribose.
      // `linear` is scoped to the flavin's own atoms — see below.
      topology:{ rings:[5,5,6,6,6,6], fused:true, linear:f.ring },
      krebs:{ carrier:true, flavin:f.ring, redox:[f.h1, f.h5], phosphates:2,
              // the pair succinate dehydrogenase put on, named the way succinate
              // names its own so the same verb can take them off again at complex II
              dehydroC:[f.n1, f.n5], dehydroH:[f.h1, f.h5],
              pa:f.pa, pb:f.pb, reduced:true } });
  }
  {
    /* — FAD, the oxidised form: the same molecule without the two hydrogens on
     *   N1 and N5.
     *
     *   BUILT BY DROPPING THEM, not by a second skeleton, so the pair the
     *   `redox` field names on FADH₂ is exactly the pair missing here. The two
     *   drops go highest-index-first so the first does not renumber the second.
     *
     *   THE RING'S BOND ORDERS ARE NOT REDRAWN, and that is a stated
     *   simplification rather than an oversight. Oxidised flavin gains two
     *   ring double bonds (N5=C4a and N1=C10a, the quinoid form) that the
     *   reduced one does not have; drawing that difference would mean a second
     *   Kekulé structure and a second skeleton, and the two would be free to
     *   drift apart on every other atom. What the lesson needs from this pair
     *   is that TWO HYDROGENS moved — the same claim NAD⁺/NADH makes with one
     *   hydride — and that is what the two specs differ by. The bond-order
     *   half is invisible at this scale in any case: both forms render as the
     *   same flat tricycle. Flagged here because it is exactly the sort of
     *   thing MolecularGeometry.md §1.6 says must stay explicit in a comment.
     */
    const f = buildFAD();
    const s = f.s;
    /* THE TWO DROPS GO HIGHEST-INDEX-FIRST so the first cannot renumber the
     * second, and the maps COMPOSE — every index this spec still names is
     * carried through both. Writing the drops without that, which is the
     * obvious version, leaves `flavin` pointing two atoms off. */
    let m = f.s.atoms.map((_, i) => i);
    [f.h1, f.h5].sort((a, b) => b - a).forEach(h => {
      const step = dropAtom(s, h);
      m = m.map(i => (i === h ? null : step[i]));
    });
    CARRIERS.fad = s.spec({
      // Face-on, for FADH₂'s reason and so the pair are the same drawing seen
      // the same way — a page showing one of them turned would be claiming the
      // oxidation moved the molecule rather than two hydrogens.
      view:VIEW.flatRing,
      name:'FAD', short:'FAD', formula:'C₂₇H₃₃N₉O₁₅P₂²⁻', charge:-2,
      smiles:'Cc1cc2c(cc1C)N(C[C@H](O)[C@H](O)[C@H](O)COP(=O)([O-])OP(=O)([O-])OC[C@H]1O[C@@H](n3cnc4c(N)ncnc43)[C@H](O)[C@@H]1O)c1[nH]c(=O)[nH]c(=O)c1N2',
      class:'carrier',
      topology:{ rings:[5,5,6,6,6,6], fused:true, linear:f.ring.map(i => m[i]) },
      // remapped through the drop, so these still name the flavin's own atoms
      krebs:{ carrier:true, flavin:f.ring.map(i => m[i]), phosphates:2,
              pa:m[f.pa], pb:m[f.pb], reduced:false } });
  }




  /* ================================================================
   *  THE ELECTRON TRANSPORT CHAIN'S CARRIERS — FMN and ubiquinone
   * ================================================================
   *  Two more one-molecule-two-states pairs, for the chain a lesson runs
   *  after the cycle. Both are built the way FAD is: the REDUCED form is the
   *  geometry, the oxidised form is that skeleton minus the hydrogens the step
   *  moves, so `redox` on the reduced spec is exactly the pair missing on the
   *  other and nothing can disagree about where they go. The bond orders are
   *  not redrawn on oxidation, the simplification FAD states and for the
   *  same reason.
   */
  function buildFMN(){
    /* — riboflavin-5′-phosphate: FAD's front half, ending at one TERMINAL
     *   phosphate instead of the pyrophosphate bridge to AMP. The flavin, the
     *   ribityl chain and its three hydroxyls are the same calls buildFAD
     *   makes, in the same order, so the flavin's indices and stereocentres
     *   are the ones tools/check-handedness.js holds for FADH₂. */
    const f = buildFlavin();
    const s = f.s;
    const rib = extendedChain(['C','C','C','C','C'],
                              [GL.CN, GL.CC, GL.CC, GL.CC, GL.CC]);
    const slot = vnorm(vmul(s.nbrs(f.n10).reduce(vadd, V(0,0,0)), -1));
    const R = SkelLib.absorb(s, SkelLib.fitOnto(rib.s, 0,
      vsub(rib.s.at(1), rib.s.at(0)), slot,
      vadd(s.at(f.n10), vmul(slot, GL.CN)), 0));
    const rc = rib.idx.map(i => i + R);
    s.link(f.n10, rc[0]);
    [1, 2, 3].forEach(k => s.hydroxyl(rc[k], 1));
    const o5 = s.grow(rc[4], 'O', GL.CO, 'sp3', 0);
    const a1 = s.phosphoUnit(o5, { terminal:true });
    return Object.assign(f, { s, p:a1.p });
  }
  {
    const f = buildFMN();
    CARRIERS.fmnh2 = f.s.spec({
      view:VIEW.flatRing,
      name:'FMNH₂', short:'FMNH₂', formula:'C₁₇H₂₁N₄O₉P²⁻', charge:-2,
      smiles:'', class:'carrier',
      topology:{ rings:[6,6,6], fused:true, linear:f.ring },
      // Complex I's prosthetic group, the head that takes NADH's hydride.
      // `accept` is N5, where the hydride lands; `redox` is the pair that
      // distinguishes the two states, as on FADH₂.
      etc:{ carrier:true, flavin:f.ring, redox:[f.h1, f.h5], accept:f.n5,
            dehydroC:[f.n1, f.n5], dehydroH:[f.h1, f.h5], phosphates:1, p:f.p, reduced:true } });
  }
  {
    const f = buildFMN();
    const s = f.s;
    let m = f.s.atoms.map((_, i) => i);
    [f.h1, f.h5].sort((a, b) => b - a).forEach(h => {
      const step = dropAtom(s, h);
      m = m.map(i => (i === h ? null : step[i]));
    });
    CARRIERS.fmn = s.spec({
      view:VIEW.flatRing,
      name:'FMN', short:'FMN', formula:'C₁₇H₁₉N₄O₉P²⁻', charge:-2,
      smiles:'', class:'carrier',
      topology:{ rings:[6,6,6], fused:true, linear:f.ring.map(i => m[i]) },
      etc:{ carrier:true, flavin:f.ring.map(i => m[i]), accept:m[f.n5],
            phosphates:1, p:m[f.p], reduced:false } });
  }

  function buildUbiquinol(){
    /* — ubiquinol-1: the benzoquinol ring with its two methoxy groups, the
     *   ring methyl, and ONE isoprene unit where the mitochondrial molecule
     *   carries ten. Q1 is a real compound and a declared stand-in
     *   (MolecularGeometry.md §1.6): the fifty-carbon tail is what anchors
     *   Q10 in the bilayer, and nothing this lesson shows happens on it.
     *   Ring numbering follows the quinone: C1 and C4 carry the redox
     *   hydroxyls, C2 and C3 the methoxys, C5 the methyl, C6 the tail. */
    const s = flatRing(6, ['C','C','C','C','C','C']);
    s.order(0, 1, 2).order(2, 3, 2).order(4, 5, 2);
    const ringAtom = (i, dist, el) => { const a = flatH(s, i, dist); s.atoms[a].el = el; return a; };
    // aryl C–O 1.36 Å (phenol, anisole); the ring C–C(methyl) 1.51 Å
    const o1 = ringAtom(0, 1.36, 'O'), o4 = ringAtom(3, 1.36, 'O');
    const o2 = ringAtom(1, 1.36, 'O'), o3 = ringAtom(2, 1.36, 'O');
    const me5 = ringAtom(4, 1.51, 'C');
    const t1 = ringAtom(5, 1.51, 'C');                         // tail CH₂
    const me2 = s.grow(o2, 'C', GL.CO, 'sp3', 0);
    const me3 = s.grow(o3, 'C', GL.CO, 'sp3', 0);
    const t2 = s.grow(t1, 'C', GL.CC, 'sp3', 0);               // =CH–
    const t3 = s.grow(t2, 'C', GL.CdC, 'sp2', 0, 2);           // =C(CH₃)₂
    const t4 = s.grow(t3, 'C', GL.CC, 'sp2', 0);
    const t5 = s.grow(t3, 'C', GL.CC, 'sp2', 0);
    // hydrogens LAST, so every index above survives: the two redox O–H first,
    // named, then the rest
    const h1 = s.grow(o1, 'H', GL.OH, 'sp3', 0);
    const h4 = s.grow(o4, 'H', GL.OH, 'sp3', 0);
    [me2, me3, me5, t4, t5].forEach(c => { for (let k = 0; k < 3; k++) s.grow(c, 'H', GL.CH, 'sp3', 0); });
    for (let k = 0; k < 2; k++) s.grow(t1, 'H', GL.CH, 'sp3', 0);
    flatH(s, t2, GL.CH);
    return { s, o1, o4, h1, h4, ring:[0,1,2,3,4,5], tail:[t1,t2,t3,t4,t5] };
  }
  {
    const q = buildUbiquinol();
    CARRIERS.ubiquinol = q.s.spec({
      view:VIEW.flatRing,
      name:'Ubiquinol', short:'QH₂', formula:'C₁₄H₂₀O₄', charge:0,
      smiles:'', class:'carrier',
      topology:{ rings:[6], fused:false },
      // `redox` is the two hydroxyl hydrogens complex III takes off, and
      // `eFrom` the ring carbon the electron is drawn leaving from.
      etc:{ carrier:true, ring:q.ring, redox:[q.h1, q.h4], redoxH:q.h1, oh:[q.o1, q.o4], eFrom:0,
            tail:q.tail, reduced:true } });
  }
  {
    const q = buildUbiquinol();
    const s = q.s;
    let m = s.atoms.map((_, i) => i);
    [q.h1, q.h4].sort((a, b) => b - a).forEach(h => {
      const step = dropAtom(s, h);
      m = m.map(i => (i === h ? null : step[i]));
    });
    CARRIERS.ubiquinone = s.spec({
      view:VIEW.flatRing,
      name:'Ubiquinone', short:'Q', formula:'C₁₄H₁₈O₄', charge:0,
      smiles:'', class:'carrier',
      topology:{ rings:[6], fused:false },
      etc:{ carrier:true, ring:q.ring.map(i => m[i]), oh:[m[q.o1], m[q.o4]], eFrom:0,
            tail:q.tail.map(i => m[i]), reduced:false } });
  }

  {
    /* — atpSkel: ATP from ideal geometry.
     *
     *  THREE PIECES, in the order a chemist would name them: adenine, ribose,
     *  triphosphate. Each is built by the shared builder, none of it is typed
     *  as coordinates, and the joins go through skel.js's fitOnto/absorb — the
     *  same pair maltose and cellobiose are assembled with.
     *
     *  STEREOCHEMISTRY IS THE WHOLE RISK, and it now lives in skel.js's
     *  ribosyl() — the ring, its 2′/3′ faces and the reserved β slot at C1′.
     *  Read its note before touching a sugar face; getting one backwards builds
     *  L-ribose, which renders identically.
     */
    // --- ribose, and everything hung off it ----------------------------
    const rib = ribosyl(), s = rib.s;
    const c1 = rib.c1, c2 = rib.c2, c3 = rib.c3, c4 = rib.c4, c5 = rib.c5;
    const n9dir = rib.baseDir, n9pos = rib.basePos;

    // --- the triphosphate ----------------------------------------------
    // Not Skel.phosphate(), which builds a TERMINAL phosphate (P plus three O).
    // Here the α and β phosphorus each spend a slot on a bridging oxygen
    // instead, and that chain — three P in a row, γ on the end — is the only
    // claim ATP's picture makes. phosphoUnit() is one link of it; its note
    // carries the slot-0 and bridge-first traps.
    //
    // Anionic, not acid: ATP is stored as the physiological tetra-anion, and
    // the charge on those phosphates IS the lesson.
    const o5  = s.grow(c5, 'O', GL.CO, 'sp3', 0);
    const a1  = s.phosphoUnit(o5, {});                 // Pα + α–β bridge
    const a2  = s.phosphoUnit(a1.bridge, {});          // Pβ + β–γ bridge
    const a3  = s.phosphoUnit(a2.bridge, {terminal:true});   // Pγ and its three O
    const pa = a1.p, pb = a2.p, pg = a3.p;
    const [g1, g2, g3] = a3.oxy;                       // together, the γ group

    // --- join the base on -----------------------------------------------
    // N9 lands on the position C1′'s β face points at, with the base's own
    // outward direction carried back onto C1′ — so the ring system extends away
    // from the sugar rather than folding over it.
    //
    // `spin` sets the GLYCOSIDIC TORSION χ (O4′–C1′–N9–C4), the one angle here
    // that nothing else pins. It is a declared schematic per
    // MolecularGeometry.md §1.6 — χ is floppy in solution — but not an arbitrary
    // one: it was swept, and clearance turned out NOT to decide it (the closest
    // non-bonded pair stays between 1.83 and 2.22 at every angle, an order of
    // magnitude above the checker's floor). So it is set by chemistry instead.
    // 106° puts χ at −120.5°, which is ANTI, where purine nucleotides actually
    // sit; the first value tried left the base syn, the minor conformer, and
    // nothing about the render would have said so. Not asserted — same standing
    // as the disaccharide's φ/ψ, which are also declared and also unchecked.
    //
    // BEFORE THE C–H HYDROGENS, and that ordering is load-bearing. `n9dir` only
    // RESERVED C1′'s β slot; nothing occupies it until this link exists, so a
    // hydrogen grown at C1′ first would be handed the very direction the base is
    // about to take and the two would land on top of each other. freeTet()
    // reports what is free, not what is spoken for.
    const CHI = 106 * Math.PI / 180;
    const ade = adenine();
    const outN9 = vnorm(vmul(ade.s.nbrs(ade.n9).reduce(vadd, V(0,0,0)), -1));
    fitOnto(ade.s, ade.n9, outN9, vmul(n9dir, -1), n9pos, CHI);
    const off = absorb(s, ade.s);
    s.link(c1, ade.n9 + off);

    // C–H last, so every index above stays stable if a hydrogen is ever added or
    // dropped (the same discipline glucose and ribose are built with).
    const CH = [ s.grow(c1,'H',GL.CH,'sp3',0), s.grow(c2,'H',GL.CH,'sp3',0),
                 s.grow(c3,'H',GL.CH,'sp3',0), s.grow(c4,'H',GL.CH,'sp3',0),
                 s.grow(c5,'H',GL.CH,'sp3',0), s.grow(c5,'H',GL.CH,'sp3',0) ];

    CARRIERS.atpSkel = s.spec({
      name:'Adenosine triphosphate', short:'ATP (idealized)',
      formula:'C₁₀H₁₂N₅O₁₃P₃⁴⁻', charge:-4, class:'nucleotide',
      // Generated by tools/spec2smiles.js from these coordinates, and the reason
      // this spec can be trusted at all: check-handedness.js matches it against
      // the same PubChem record `atp` matches.
      smiles:'Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)([O-])OP(=O)([O-])O[P:1](=[O:1])([O-:1])[O-:1])[C@@H](O)[C@H]1O',
      flat:true,
      // 31 heavy atoms, spec order, real ångströms — tools/bake-flat2d.js.
      // Worth switching derivation while in 2D. The layouts are NOT identical
      // (RDKit still folds the phosphate tail its own way for each), but they
      // are far more alike than the two 3D models are, because a depiction is
      // computed from CONNECTIVITY and connectivity is the thing the two
      // derivations agree about completely.
      flat2d:[[0.418,1.538],[0.264,3.008],[-1.182,3.315],[-1.92,2.035],[-0.932,0.938],[-1.783,4.665],[-3.39,1.881],[-1.239,-0.508],[-0.141,-1.496],[-0.448,-2.941],[-0.755,-4.387],[-1.893,-2.634],[0.997,-3.249],[-2.16,-4.843],[-3.566,-5.3],[-1.704,-6.248],[-2.617,-3.438],[-4.664,-4.311],[-5.652,-5.409],[-3.675,-3.213],[-5.762,-3.322],[5.762,3.689],[5.023,2.41],[3.545,2.41],[2.807,3.689],[3.545,4.969],[5.023,4.969],[2.557,6.067],[1.207,5.466],[1.362,3.996],[5.762,6.248]],
      topology:{ rings:[5,5,6], fused:true },
      // Tuned in molecule-viewer.html (drag, then its copy button) rather than
      // inherited: VIEW.pyranose is the sugar-chair angle every hexose shares,
      // and on a nucleotide it frames the ribose and lets the phosphate tail
      // run off wherever it likes. This one is about the CHAIN, which is what
      // ATP's picture claims. Inline rather than a VIEW entry because it is one
      // molecule's angle — VIEW is for an angle two specs SHARE, and a table
      // entry with a single user is a name nobody can reuse.
      view:[-1.3882, -0.1018, -0.7511],
      optH:CH,
      gly:{ carbons:10, phosphates:3, carrier:true,
            pa:pa, pb:pb, pg:pg,
            gamma:[pg, g1, g2, g3],
            spent:{ name:'Adenosine diphosphate', short:'ADP',
                    formula:'C₁₀H₁₂N₅O₁₀P₂³⁻', phosphates:2 } },
      // the same working end `atp` declares, so the page's Highlight points at
      // the same four atoms whichever derivation is on screen
      compare:{ against:'atp', method:'skel',
                // Short on purpose: it renders in the page's bottom-left debug
                // block, which shares that corner with the notes rail.
                note:'Ideal VSEPR angles, measured bond lengths, no conformer.' },
    });
    CARRIERS.atpSkel.flatMark = CARRIERS.atpSkel.gly.gamma;
  }


  {
    /* — nadhSkel: NADH from ideal geometry.
     *
     *  The same exercise as atpSkel, one molecule further out: NADH is a
     *  DINUCLEOTIDE, so where ATP ends after one sugar this one runs
     *  adenine–ribose–P–O–P–ribose–nicotinamide, with a second furanose and its
     *  four stereocentres on the far end of the bridge. That is the point of
     *  building it — the schematic's cost is supposed to grow with the molecule,
     *  and a viewer that only ever showed the cheap case would not say so.
     *
     *  FIVE RINGS, THREE BUILDERS, and each is the one the ring's own physics
     *  asks for: adenine and the dihydronicotinamide are laid out flat
     *  (`flatRing`/`fuseRing`) because sp2 ring systems ARE flat and a
     *  tetrahedral builder would pucker them; both riboses come out of
     *  `ringFuranose` and take their identity from `face()`.
     *
     *  CHARGE STATE follows `nadh` in mol-pathways.js: the NEUTRAL molecule,
     *  so each phosphate carries its –OH rather than the bare O⁻ atpSkel shows.
     *  A derivation control that differed in protonation as well as in method
     *  would confound the two, which is the one thing it exists not to do.
     *
     *  WHAT IS SCHEMATIC HERE, declared per MolecularGeometry.md §1.6:
     *   · The dihydronicotinamide ring is drawn as a regular planar hexagon at
     *     the aromatic C–C length. The real 1,4-dihydropyridine is a shallow
     *     boat, and its two bonds INTO the sp3 C4 are ~1.50 Å, not 1.39. What
     *     the picture claims is the thing the lesson claims — C4 is sp3 and
     *     carries two hydrogens, one of them the hydride, so the ring is no
     *     longer aromatic — and that IS built: the two H's come from freeTet(),
     *     which straddles the ring plane at the tetrahedral angle. It is also
     *     the claim check-molecules.js's `gly.nic` block asserts.
     *   · Both glycosidic torsions and the two ester torsions along the
     *     pyrophosphate are set by a spin constant, the same standing the
     *     disaccharides' φ/ψ have: floppy in solution, declared, unchecked.
     */

    // --- the adenosine half ---------------------------------------------
    const ribA = ribosyl(), s = ribA.s;
    const c1 = ribA.c1, c2 = ribA.c2, c3 = ribA.c3, c4 = ribA.c4, c5 = ribA.c5;
    const n9dir = ribA.baseDir, n9pos = ribA.basePos;

    // --- the pyrophosphate bridge ----------------------------------------
    // `acid:true` — the NEUTRAL molecule, so each phosphorus keeps its –OH
    // rather than the bare O⁻ atpSkel shows. phosphoUnit()'s note carries the
    // slot-0 and bridge-first traps; the second unit's "bridge" is the ester
    // that the nicotinamide ribose is fitted onto below.
    const o5  = s.grow(c5, 'O', GL.CO, 'sp3', 0);
    const u1  = s.phosphoUnit(o5, {acid:true});
    const u2  = s.phosphoUnit(u1.bridge, {acid:true});
    const pa = u1.p, pb = u2.p, o5b = u2.bridge;

    // --- join adenine on, then the sugar's C–H ---------------------------
    // BEFORE the C–H, for atpSkel's reason: n9dir only RESERVED C1′'s β slot,
    // and freeTet() reports what is free, not what is spoken for.
    const CHI_A = 106 * Math.PI / 180;         // anti, as in atpSkel
    const ade = adenine();
    const outN9 = vnorm(vmul(ade.s.nbrs(ade.n9).reduce(vadd, V(0,0,0)), -1));
    fitOnto(ade.s, ade.n9, outN9, vmul(n9dir, -1), n9pos, CHI_A);
    const offA = absorb(s, ade.s);
    s.link(c1, ade.n9 + offA);
    const CH_A = [ s.grow(c1,'H',GL.CH,'sp3',0), s.grow(c2,'H',GL.CH,'sp3',0),
                   s.grow(c3,'H',GL.CH,'sp3',0), s.grow(c4,'H',GL.CH,'sp3',0),
                   s.grow(c5,'H',GL.CH,'sp3',0), s.grow(c5,'H',GL.CH,'sp3',0) ];

    // --- the dihydronicotinamide ring ------------------------------------
    // N1 C2 C3 C4 C5 C6 at 0…5. One Kekulé pair — C2=C3 and C5=C6 — with N1–C2,
    // C3–C4, C4–C5 and C6–N1 single: that pattern IS 1,4-dihydro, and it is why
    // C4 is left with two open tetrahedral slots below.
    function nicotinamide(){
      const r = flatRing(6, ['N','C','C','C','C','C']);
      const n1 = 0, k2 = 1, k3 = 2, k4 = 3, k5 = 4, k6 = 5;
      r.order(k2,k3,2).order(k5,k6,2);
      // the carboxamide at C3, in the ring plane — it is conjugated with C2=C3
      // and with its own carbonyl, so it is not free to rotate out of it. Grown
      // the way adenine's 6-amino is: bisecting C3's two neighbours from
      // outside, which cannot tip the ring.
      const inPlane = (from, dir, el, dist) => {
        const j = r.put(el, vadd(r.at(from), vmul(dir, dist)));
        r.link(from, j); return j;
      };
      const outC3 = vnorm(vmul(r.nbrs(k3).reduce(vadd, V(0,0,0)), -1));
      const cam = inPlane(k3, outC3, 'C', GL.CC);
      // O and N off the amide carbon at ±120° in the same plane — a planar sp2
      // amide, which is what the resonance makes it.
      {
        const back = vnorm(vsub(r.at(k3), r.at(cam)));
        const side = vnorm(V(-back.z, 0, back.x));         // in-plane ⊥
        const c = Math.cos(Math.PI/3), sn = Math.sin(Math.PI/3);
        const arm = k => vnorm(vadd(vmul(back,-c), vmul(side, k*sn)));
        var amO = inPlane(cam, arm( 1), 'O', GL.CdO); r.order(cam, amO, 2);
        var amN = inPlane(cam, arm(-1), 'N', AR.CN);
        // the amide N's two H, in the plane for the same reason
        const nb = vnorm(vsub(r.at(cam), r.at(amN)));
        const sd = vnorm(V(-nb.z, 0, nb.x));
        [1,-1].forEach(k => inPlane(amN,
          vnorm(vadd(vmul(nb,-c), vmul(sd, k*sn))), 'H', AR.NH));
      }
      // ring C–H: three flat ones, and THE TWO ON C4. Those two are the
      // molecule — freeTet() at a carbon with two ring neighbours returns the
      // pair of slots straddling the ring plane, so they come out above and
      // below it at the tetrahedral angle, which is what an sp3 centre in a
      // ring of sp2 ones looks like.
      const hRing = [ flatH(r, k2, AR.CH), flatH(r, k5, AR.CH), flatH(r, k6, AR.CH) ];
      const h4 = [ r.grow(k4,'H',GL.CH,'sp3',0), r.grow(k4,'H',GL.CH,'sp3',0) ];
      return { s:r, n1, ring:[n1,k2,k3,k4,k5,k6], c4:k4, h4, hRing,
               amide:{c:cam, o:amO, n:amN} };
    }

    // --- the nicotinamide riboside half ----------------------------------
    // The same sugar again, which is the point of ribosyl(): a dinucleotide's
    // two halves differ in what they carry, not in the ribose that carries it.
    const ribB = ribosyl(), r = ribB.s;
    const b1 = ribB.c1, b2 = ribB.c2, b3 = ribB.c3, b4 = ribB.c4, b5 = ribB.c5;
    const n1dir = ribB.baseDir, n1pos = ribB.basePos;
    // RESERVE C5″'s bond to the bridge before anything else can take it — same
    // trap as n9dir, and the reason C5″'s own hydrogens are grown last of all,
    // after the ester link exists.
    const outB5 = r.freeTet(b5)[0];

    // N1 lands on C1″'s β face, exactly as N9 does on the other sugar. χ is
    // declared schematic; 106° is atpSkel's value, and a pyridinium nucleoside
    // sits anti like a purine one.
    const nic = nicotinamide();
    const outN1 = vnorm(vmul(nic.s.nbrs(nic.n1).reduce(vadd, V(0,0,0)), -1));
    fitOnto(nic.s, nic.n1, outN1, vmul(n1dir, -1), n1pos, CHI_A);
    const offN = absorb(r, nic.s);
    r.link(b1, nic.n1 + offN);
    const CH_B = [ r.grow(b1,'H',GL.CH,'sp3',0), r.grow(b2,'H',GL.CH,'sp3',0),
                   r.grow(b3,'H',GL.CH,'sp3',0), r.grow(b4,'H',GL.CH,'sp3',0) ];

    // --- and join the two halves at the bridge's far oxygen ---------------
    const dirO5b = s.freeTet(o5b)[0];
    // The bridge's own torsion, swept like the disaccharides' φ/ψ. Clearance
    // does NOT decide it — over most of the circle the closest non-bonded pair
    // is the ribose's own 2′/3′ hydroxyls at 2.53 Å, an order of magnitude above
    // the checker's floor — so the two things a viewer can see decide instead,
    // and they agree: 200° is both the most EXTENDED arrangement (21.4 Å across,
    // so the two nucleotides read as two halves joined tail to tail rather than
    // as one blob) and the FLATTEST (1.01 Å out of its own plane, against 1.16
    // and worse either side). Declared schematic, unchecked, same standing as χ.
    fitOnto(r, b5, outB5, vmul(dirO5b, -1),
            vadd(s.at(o5b), vmul(dirO5b, GL.CO)), 200 * Math.PI / 180);
    const offB = absorb(s, r);
    s.link(o5b, b5 + offB);
    // NOW C5″'s hydrogens: it has two real neighbours at last, so freeTet
    // returns the two slots that are genuinely free.
    const CH_B5 = [ s.grow(b5+offB,'H',GL.CH,'sp3',0),
                    s.grow(b5+offB,'H',GL.CH,'sp3',0) ];

    // Every index below is COMPUTED from the build, never counted off a
    // rendering — the same discipline `nadh`'s own `nic` block is written with.
    const N = i => i + offN + offB;
    const nicIdx = { ring:nic.ring.map(N), n:N(nic.n1), c4:N(nic.c4),
                     h:nic.h4.map(N),
                     amide:{ c:N(nic.amide.c), o:N(nic.amide.o), n:N(nic.amide.n) } };
    const optH = [ ...CH_A, ...CH_B.map(i=>i+offB), ...CH_B5,
                   ...nic.hRing.map(N), ...nicIdx.h ];

    CARRIERS.nadhSkel = s.spec({
      name:'Nicotinamide adenine dinucleotide (reduced)', short:'NADH (idealized)',
      formula:'C₂₁H₂₉N₇O₁₄P₂', charge:0, class:'nucleotide',
      // Generated by tools/spec2smiles.js from these coordinates, and the reason
      // this spec can be trusted at all: check-handedness.js matches it against
      // the same PubChem record `nadh` matches, so every visible difference
      // between the two is method and not a mirrored sugar.
      // — and it comes back BYTE-IDENTICAL to `nadh`'s, which is the strongest
      // statement this file can make: two independent derivations of a molecule
      // with eight stereocentres canonicalise to the same string.
      smiles:'Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)(O)OP(=O)(O)OC[C@H]2O[C@@H]([N:1]3[CH:1]=[CH:1][CH2:1][C:1]([C:1]([NH2:1])=[O:1])=[CH:1]3)[C@H](O)[C@@H]2O)[C@@H](O)[C@H]1O',
      flat:true,
      // 44 heavy atoms, spec order, real ångströms — tools/bake-flat2d.js.
      // Worth switching derivation while in 2D: the two layouts differ only in
      // how RDKit folded each one, because a depiction is computed from
      // CONNECTIVITY and connectivity is what the two derivations agree about.
      flat2d:[[4.135,2.075],[3.982,3.528],[2.553,3.831],[1.823,2.566],[2.8,1.481],[1.959,5.166],[0.37,2.414],[2.497,0.052],[3.582,-0.926],[3.278,-2.355],[2.975,-3.784],[1.849,-2.051],[4.707,-2.658],[1.585,-4.235],[0.196,-4.687],[2.037,-5.625],[1.134,-2.846],[9.418,4.201],[8.688,2.936],[7.227,2.936],[6.497,4.201],[7.227,5.467],[8.688,5.467],[6.25,6.552],[4.915,5.958],[5.068,4.505],[9.418,6.732],[-3.461,-3.302],[-4.643,-4.161],[-4.191,-5.55],[-2.73,-5.55],[-2.279,-4.161],[-5.05,-6.732],[-1.872,-6.732],[-0.89,-3.709],[-6.032,-3.709],[-6.336,-2.28],[-7.725,-1.829],[-8.811,-2.806],[-8.507,-4.235],[-7.118,-4.687],[-8.029,-0.4],[-9.418,0.052],[-6.943,0.578]],
      topology:{ rings:[5,5,5,6,6], fused:true },
      // TURNED SO C4's pro-R HYDROGEN FACES THE CAMERA. That H is the entire
      // difference between NAD⁺ and NADH on glycolysis-lab's carrier tile, and
      // at the old angle it pointed away from the viewer and sat under the
      // ring — the step's whole point changed where nobody could see it, while
      // the pro-S H, which never changes, faced front. It has to be the pro-R
      // one: GAPDH is an A-side dehydrogenase, so that is the face the hydride
      // is delivered to. So the molecule turns rather than the chemistry.
      // Tuned in molecule-viewer.html (drag, then its copy button).
      view:[2.1879, 0.7309, -3.0804],
      optH,
      gly:{ carbons:21, phosphates:2, carrier:true, nic:nicIdx,
            /* THE HYDRIDE A DEHYDROGENASE TAKES BACK, under the name every
             * other spec in this library uses for it (`ox` reads it, and
             * fermentation-lab.html points its hotspot at it). The SECOND of
             * C4's two hydrogens: the one GAPDH put there, so the atom a lesson
             * takes off is the atom it watched arrive. */
            hydride:nicIdx.h[1],
            spent:{ name:'Nicotinamide adenine dinucleotide (oxidised)',
                    short:'NAD⁺', formula:'C₂₁H₂₇N₇O₁₄P₂⁺' } },
      compare:{ against:'nadh', method:'skel',
                note:'Ideal VSEPR angles, measured bond lengths, no conformer.' },
    });
    CARRIERS.nadhSkel.flatMark =
      [...nicIdx.ring, nicIdx.c4, ...nicIdx.h,
       nicIdx.amide.c, nicIdx.amide.o, nicIdx.amide.n];
  }

  /* ---- AMP ---------------------------------------------------------------
   * The last occupant of mol-monomers.js, which held "one representative
   * monomer per class" — a grouping by what a gallery wanted to show. AMP is
   * ATP with two phosphates gone; it belongs with them.
   */
  register({
    amp: {
      name:'Adenosine monophosphate', formula:'C₁₀H₁₂N₅O₇P²⁻', charge:-2, class:'nucleotide', mono:'nucleic acid',
      smiles:'Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)([O-])[O-])[C@@H](O)[C@H]1O',
      // SETTLED 2026-07-30, and the comment above was right: the record supplies
      // the dianion. CID 15938965 is adenosine 5'-monophosphate(2-), and it
      // regenerates this spec EXACTLY (0.0000 delta, bonds identical). There was
      // no deprotonation step, so there is no `strip`.
      //
      // The trap that produced the wrong story: querying the NAME 'AMP' returns
      // CID 6083, the neutral acid — 37 atoms, two extra H sitting on the
      // phosphate oxygens, and a different conformer besides. The item 0 sweep
      // fetched that, read 14 H against 12, and inferred a stripping step that
      // never happened. Never identify this spec by name; the CID IS the charge
      // state, which is exactly the hazard molecule-pipeline.md item 1 warns
      // about for anomers.
      units:'angstrom',
      src:{path:'pubchem', cid:15938965, record:'3d',
           conformer:'00F3359500000005', sdf:'amp.sdf',
           tool:'sdf2spec-generic', charge:-2, regen:'exact', fetched:'2026-07-30'},
      atoms:[ {el:'P',pos:[-3.378,-2.614,-2.18]},
              {el:'O',pos:[-1.085,-0.715,0.99]},
              {el:'O',pos:[-0.702,2.833,1.42]},
              {el:'O',pos:[-2.613,1.339,2.646]},
              {el:'O',pos:[-2.892,-2.005,-0.722]},
              {el:'O',pos:[-3.154,-4.116,-2.036],q:-1},
              {el:'O',pos:[-2.463,-1.946,-3.202],q:-1},
              {el:'O',pos:[-4.847,-2.214,-2.296]},
              {el:'N',pos:[0.967,0.322,0.403]},
              {el:'N',pos:[2.33,-0.269,-1.262]},
              {el:'N',pos:[2.542,1.499,1.829]},
              {el:'N',pos:[4.782,1.509,0.861]},
              {el:'N',pos:[5.279,0.469,-1.237]},
              {el:'C',pos:[-1.123,1.644,0.784]},
              {el:'C',pos:[-2.497,1.186,1.231]},
              {el:'C',pos:[-0.263,0.453,1.18]},
              {el:'C',pos:[-2.468,-0.303,0.899]},
              {el:'C',pos:[-2.968,-0.607,-0.506]},
              {el:'C',pos:[2.202,0.807,0.732]},
              {el:'C',pos:[1.097,-0.317,-0.804]},
              {el:'C',pos:[3.031,0.43,-0.312]},
              {el:'C',pos:[4.367,0.808,-0.222]},
              {el:'C',pos:[3.857,1.807,1.805]},
              {el:'H',pos:[-1.108,1.802,-0.301]},
              {el:'H',pos:[-3.314,1.744,0.766]},
              {el:'H',pos:[0.031,0.485,2.236]},
              {el:'H',pos:[-3.023,-0.903,1.629]},
              {el:'H',pos:[-2.349,-0.109,-1.26]},
              {el:'H',pos:[-4.006,-0.278,-0.623]},
              {el:'H',pos:[-0.768,2.699,2.381]},
              {el:'H',pos:[-3.484,0.994,2.905]},
              {el:'H',pos:[0.264,-0.793,-1.304]},
              {el:'H',pos:[4.223,2.369,2.657]},
              {el:'H',pos:[4.973,-0.054,-2.045]},
              {el:'H',pos:[6.245,0.755,-1.148]} ],
      bonds:[ [0,4],[0,5],[0,6],[0,7,2],[1,15],[1,16],[2,13],[2,29],[3,14],[3,30],
              [4,17],[8,15],[8,18],[8,19],[9,19,2],[9,20],[10,18,2],[10,22],[11,21],
              [11,22,2],[12,21],[12,33],[12,34],[13,14],[13,15],[13,23],[14,16],
              [14,24],[15,25],[16,17],[16,26],[17,27],[17,28],[18,20],[19,31],
              [20,21,2],[22,32] ],
      optH:[23,24,25,26,27,28,31,32],   // nonpolar C–H; the O–H / N–H are never optional
      groups:[
        { key:'phosphate', label:'Phosphate', formula:'–PO₄', atoms:[0,4,5,6,7],
          note:'Negatively charged, and the piece that links one nucleotide to the next — the sugar–phosphate backbone.' },
        { key:'sugar', label:'Five-carbon sugar', formula:'ribose', atoms:[1,13,14,15,16,17],
          note:'A furanose: five-membered, unlike glucose’s six. Every nucleotide is phosphate + this sugar + a base.' },
        { key:'twooh', label:'The 2′–OH', formula:'–OH', atoms:[2,29],
          note:'This single hydroxyl is the whole difference between RNA and DNA. Remove it (deoxyribose) and the strand becomes far harder to break — which is why DNA is the archive.' },
        { key:'base', label:'Nitrogenous base', formula:'adenine', atoms:[8,9,10,11,12,18,19,20,21,22],
          note:'Two fused rings — a purine. The base is the letter; the phosphate and sugar are just the tape it is written on.' },
      ],
    },
  }, SELFNAME);

  register(CARRIERS, SELFNAME);
})(this);
