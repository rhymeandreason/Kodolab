/* =====================================================================
 *  mol-aminoacids.js — the amino acids (real ångströms)
 * =====================================================================
 *  Eighteen of the twenty. The first eight came for their pairs: L- against
 *  D-alanine is handedness, glycine against proline is a free amino nitrogen
 *  against a ring-closed one, glutamine against glutamate is an amide against
 *  an acid. Each says so in its own `contrast:` block, which is where a
 *  contrast has always lived — it was never a property a FILE had to carry.
 *  The other ten are the residues protein-lab.html's sequences need.
 *
 *  NO BUILDER. Every spec here is a PubChem 3D conformer fetched by CID and
 *  converted by tools/sdf2spec.js, plus one mirror (D-alanine) taken from the
 *  L- form beside it. So this file needs skel.js for nothing, and a page that
 *  wants residues no longer pays to parse a ring builder to get them.
 *
 *  ORDER MATTERS INSIDE THIS FILE. D-alanine is built by reflecting `alanine`,
 *  which register() has already scaled, so alanine has to be registered first.
 *  That dependency used to cross a file boundary — the old mol-contrast.js reaching
 *  into mol-monomers.js — and the DOMAINS list carried a note about it. Both
 *  halves live here now, so the ordering is local and visible.
 *
 *  THE FIXED BACKBONE ORDER is documented at the top of the register block
 *  below and is load-bearing: `pep:{cC,oOH,hOH,nN,hN}` indexes into it,
 *  molecules.js derives each spec's `condense:` roles from that, and
 *  check-molecules.js gates its L-handedness assertion on the same block.
 *  Regenerating a spec must not renumber it.
 * ===================================================================== */
(function(global){
  'use strict';
  const SELFNAME = 'mol-aminoacids.js';
  // Registry from molecules.js. Domain files only ever ADD to it.
  const Lib = global.MolLib
    || (typeof require === 'function' ? require('./molecules.js').MolLib : null);
  if (!Lib) throw new Error(SELFNAME + ': molecules.js must be loaded first');
  const { MOLECULES, VIEW, register } = Lib;

  const AA = {};
  register({
    // ---- amino acids ----------------------------------------------------
    // Shared backbone, laid out left→right so a chain grows along +X:
    //   amino end (−X)  H₂N–Cα–COOH  carboxyl end (+X)
    //   0 N   1 H   2 H       (amino group; an H leaves in condensation)
    //   3 Cα  4 H              (α-carbon; 4 is the backbone H)
    //   5 C   6 O(=O)  7 O(–OH)  8 H   (carboxyl; the –OH, atoms 7+8, leaves)
    //   9…    side chain (R), bonded to Cα (atom 3), splayed −Y
    // `pep` names the atoms the peptide-bond reaction acts on:
    //   cC carboxyl carbon · oOH/hOH the leaving hydroxyl · nN amino N · hN amino H's.
    // check-molecules.js gates its L-handedness assertion on this block, so a
    // spec that drops it stops being checked without failing anything.
    // Only the ANGLES/topology carry the lesson; bond lengths are stylised as
    // elsewhere (must exceed the two display radii so the stick shows).
    // Zwitterion form is skipped on purpose — the neutral –NH₂/–COOH makes the
    // "lose a water" bookkeeping legible; note this is a display simplification.
    // Handedness: life builds proteins from L-amino acids only (the D- mirror
    // images exist but ribosomes don't use them), so every chiral residue
    // declares `chirality:'L'` and check-molecules.js verifies the signed
    // volume over CIP priorities. optH lists only nonpolar C–H — an H on
    // N/O/S is never in it, since those are the H-bond donors and the leaving
    // groups a peptide bond consumes, and hiding them would hide the lesson.
    // ---- generated from PubChem 3D records (see tools/sdf2spec.js) --------
    // Coordinates are REAL conformers: correct angles (Ca is tetrahedral, ~110°,
    // not the 180° the old hand-written specs drew) and genuinely non-planar,
    // unlike the flat z=0 layouts elsewhere in this file. One global 1.9x scale
    // is applied so every stick clears the enlarged display radii — relative
    // bond lengths stay truthful, which the old per-pair guesses did not.
    // Bond ORDERS come straight from the SDF bond block, so the carboxyl C=O
    // is tagged [i,j,2] without anyone having to notice it by hand.
    // Re-generate rather than hand-editing these numbers.
    glycine: {
      // Laid out flat for macromolecule-builder.html's build stage:
      // the chain is assembled in the diagram and revealed in 3D.
      flat:true,
      flat2d:[[-1.799,-0.346],[-0.6,-1.039],[0.6,-0.346],[0.6,1.039],[1.799,-1.039]],
      name:'Glycine', formula:'C₂H₅NO₂', class:'aminoacid', res:'Gly', side:'–H',
      // Re-verified 2026-07-30 against the committed sdf/glycine.sdf: 0.000
      // coordinate delta, bonds identical. `query` is kept because it records how
      // this was originally asked for; `cid` is what now identifies it.
      units:'angstrom',
      src:{path:'pubchem', cid:750, query:'glycine', record:'3d',
           conformer:'000002EE00000001', sdf:'glycine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-07-30'},
      atoms:[ {el:'N',pos:[-1.171,0.496,0.705]},
              {el:'H',pos:[-1.155,1.515,0.734]},
              {el:'H',pos:[-1.155,0.179,1.673]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.003,0.371,-1.029]},
              {el:'C',pos:[1.232,0.496,0.705]},
              {el:'O',pos:[1.207,1.203,1.705]},
              {el:'O',pos:[2.382,0.113,0.094]},
              {el:'H',pos:[3.175,0.46,0.556]},
              {el:'H',pos:[-0.001,-1.093,0]} ],
      names:['N','H','H2','CA','HA1','C','O','OXT','HXT','HA2'],
      smiles:'O=C(O)C[NH2:1]',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[3,9],[5,6,2],[5,7],[7,8] ],
      optH:[4,9],   // nonpolar C–H, hidden by the lab’s H toggle
      // glycine is ACHIRAL: its side chain is an H, so Ca has two identical
      // substituents and there is no L/D to assert.
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
      // contrast-lab.html: glycine is the free-N-H reference half of the
      // glycine-proline pair (see proline's own contrast block below for
      // why alanine couldn't take this slot — it's already D-alanine's
      // partner). Glycine has the plainest possible side chain, so the only
      // thing left to contrast is the backbone nitrogen itself.
      contrast:{ pair:'glycine-proline', partner:'proline',
        differs:'free vs ring-closed amino N',
        lesson:'why gluten resists digestion',
        diff:['N','H','H2'],
        note:'Glycine has no side chain to speak of — just an H — so its backbone '
           + 'nitrogen carries two ordinary N–H bonds and the chain stays free to '
           + 'straighten, which is the shape a digestive protease needs to grip. '
           + 'Proline’s side chain bonds back into that nitrogen and takes away '
           + 'both.' },
    },
    alanine: {
      // Laid out flat for macromolecule-builder.html's build stage:
      // the chain is assembled in the diagram and revealed in 3D.
      flat:true,
      flat2d:[[-0.613,1.77],[-0.613,0.354],[0.613,-0.354],[0.613,-1.77],[1.839,0.354],[-1.839,-0.354]],
      name:'Alanine', formula:'C₃H₇NO₂', class:'aminoacid', res:'Ala', side:'–CH₃',
      // The name 'alanine' resolves to CID 5950, which is L-alanine — the right
      // one, but by PubChem's choice rather than ours. Now pinned to the CID, and
      // chirality:'L' below is the assertion that would catch it if that ever moved.
      units:'angstrom',
      src:{path:'pubchem', cid:5950, query:'alanine', record:'3d',
           conformer:'0000173E00000001', sdf:'alanine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-07-30'},
      atoms:[ {el:'N',pos:[-1.172,0.515,-0.705]},
              {el:'H',pos:[-2.019,0.195,-0.236]},
              {el:'H',pos:[-1.211,0.123,-1.646]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.004,0.393,1.022]},
              {el:'C',pos:[1.237,0.515,-0.705]},
              {el:'O',pos:[1.262,1.206,-1.713]},
              {el:'O',pos:[2.357,0.112,-0.05]},
              {el:'H',pos:[3.173,0.438,-0.486]},
              {el:'C',pos:[-0.028,-1.522,0]},
              {el:'H',pos:[0.814,-1.93,0.57]},
              {el:'H',pos:[-0.949,-1.901,0.458]},
              {el:'H',pos:[0.04,-1.928,-1.016]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','HB1','HB2','HB3'],
      smiles:'O=[C:1](O)[C@H:1]([CH3:1])[NH2:1]',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[3,9],[5,6,2],[5,7],[7,8],[9,10],[9,11],[9,12] ],
      optH:[4,10,11,12],   // nonpolar C–H, hidden by the lab’s H toggle
      chirality:'L',   // asserted by check-molecules.js — life is homochiral
      // contrast-lab.html: alanine is the L (reference) half of the L-/D-alanine
      // pair. Every atom position differs from D-alanine (a true mirror image,
      // not a rotation), so there is no single distinguishing atom the way
      // galactose's C4 is one — `diff` instead marks the whole stereocentre:
      // Cα and its four substituents, the group whose spatial arrangement is
      // the entire lesson.
      contrast:{ pair:'alanine-D-alanine', partner:'dAlanine',
        differs:'handedness',
        lesson:'why life is homochiral',
        diff:['CA','N','HA','C','CB'],
        note:'Every ribosome on Earth builds proteins from L-amino acids only. '
           + 'The choice of L over D looks like an early accident — but once '
           + 'translation locked onto one hand, every enzyme that reads a '
           + 'protein chain came to expect it, and a D-residue jams the machinery.' },
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
      // No `condense:` here: molecules.js derives one from `pep` above for every
      // amino acid, so the atoms the peptide bond acts on are stated once. The
      // same two half-reactions glucose declares, on a different pair of groups
      // — same O + H + H, same one bond made. That the sugar and the amino acid
      // need one table and not two is the claim: dehydration synthesis is one
      // reaction.
      // alanine is the PROTEIN monomer of the four-class set, so it carries the
      // same `groups` index map the other three do. Indices are the fixed
      // backbone order (see above) — regenerating this spec must not renumber them.
      mono:'protein',
      groups:[
        { key:'amino', label:'Amino group', formula:'–NH₂', atoms:[0,1,2],
          note:'The nitrogen end. Every amino acid has one, and it is where the next residue attaches.' },
        { key:'carboxyl', label:'Carboxyl group', formula:'–COOH', atoms:[5,6,7,8],
          note:'The acid end. Its –OH is what leaves as water when a peptide bond forms.' },
        { key:'alpha', label:'α-carbon', formula:'Cα', atoms:[3,4],
          note:'One carbon carrying all four: amino, carboxyl, an H, and the side chain. Four different groups means it is chiral — and life uses only the L form.' },
        { key:'side', label:'Side chain', formula:'R = –CH₃', atoms:[9,10,11,12],
          note:'The only part that differs between the twenty amino acids. Everything a protein does traces back to which R groups sit where.' },
      ],
    },
    serine: {
      // Laid out flat for macromolecule-builder.html's build stage:
      // the chain is assembled in the diagram and revealed in 3D.
      flat:true,
      flat2d:[[0,1.773],[0,0.355],[1.228,-0.355],[1.228,-1.773],[2.457,0.355],[-1.228,-0.355],[-2.457,0.355]],
      name:'Serine', formula:'C₃H₇NO₃', class:'aminoacid', res:'Ser', side:'–CH₂OH',
      units:'angstrom',
      src:{path:'pubchem', cid:5951, query:'serine', record:'3d',
           conformer:'0000173F00000001', sdf:'serine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-07-30'},
      atoms:[ {el:'N',pos:[-1.166,0.514,-0.716]},
              {el:'H',pos:[-1.164,0.181,-1.679]},
              {el:'H',pos:[-1.128,1.532,-0.758]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.007,0.394,1.022]},
              {el:'C',pos:[1.234,0.514,-0.716]},
              {el:'O',pos:[1.339,0.727,-1.915]},
              {el:'O',pos:[2.249,0.71,0.167]},
              {el:'H',pos:[3.06,1.04,-0.276]},
              {el:'C',pos:[-0.025,-1.526,0]},
              {el:'O',pos:[1.112,-2.017,0.703]},
              {el:'H',pos:[-0.926,-1.914,0.486]},
              {el:'H',pos:[0.019,-1.931,-1.017]},
              {el:'H',pos:[1.062,-1.677,1.613]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','OG','HB1','HB2','HG'],
      smiles:'N[C@@H](CO)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[3,9],[5,6,2],[5,7],[7,8],[9,10],[9,11],[9,12],[10,13] ],
      optH:[4,11,12],   // nonpolar C–H, hidden by the lab’s H toggle
      chirality:'L',   // asserted by check-molecules.js — life is homochiral
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    cysteine: {
      // Laid out flat for macromolecule-builder.html's build stage:
      // the chain is assembled in the diagram and revealed in 3D.
      flat:true,
      flat2d:[[0,1.858],[0,0.372],[1.287,-0.372],[1.287,-1.858],[2.574,0.372],[-1.287,-0.372],[-2.574,0.372]],
      name:'Cysteine', formula:'C₃H₇NO₂S', class:'aminoacid', res:'Cys', side:'–CH₂SH',
      units:'angstrom',
      src:{path:'pubchem', cid:5862, query:'cysteine', record:'3d',
           conformer:'000016E600000001', sdf:'cysteine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-07-30'},
      atoms:[ {el:'N',pos:[-1.17,0.537,-0.698]},
              {el:'H',pos:[-1.187,1.552,-0.604]},
              {el:'H',pos:[-2.02,0.197,-0.251]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.016,0.37,1.033]},
              {el:'C',pos:[1.235,0.537,-0.698]},
              {el:'O',pos:[1.522,0.272,-1.86]},
              {el:'O',pos:[2.017,1.314,0.094]},
              {el:'H',pos:[2.815,1.632,-0.38]},
              {el:'C',pos:[-0.047,-1.529,0]},
              {el:'S',pos:[1.403,-2.255,0.831]},
              {el:'H',pos:[-0.944,-1.884,0.519]},
              {el:'H',pos:[-0.073,-1.924,-1.022]},
              {el:'H',pos:[2.316,-1.87,-0.073]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','SG','HB1','HB2','HG'],
      smiles:'N[C@@H](CS)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[3,9],[5,6,2],[5,7],[7,8],[9,10],[9,11],[9,12],[10,13] ],
      optH:[4,11,12],   // nonpolar C–H, hidden by the lab’s H toggle
      chirality:'L',   // asserted by check-molecules.js — life is homochiral
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    // ---- the rest of the sequences protein-lab.html builds: same pipeline, untouched conformers
    valine: {
      flat:true,
      flat2d:[[-1.889,0.727],[-0.63,0],[0.63,0.727],[1.889,0],[0.63,2.182],[-0.63,-1.454],[-1.889,-2.182],[0.63,-2.182]],
      name:'Valine', formula:'C₅H₁₁NO₂', class:'aminoacid', res:'Val', side:'–CH(CH₃)₂',
      units:'angstrom',
      src:{path:'pubchem', cid:6287, record:'3d',
           conformer:'0000188F00000002', sdf:'valine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.159,0.589,-0.67]},
              {el:'H',pos:[-1.157,1.599,-0.537]},
              {el:'H',pos:[-2.016,0.248,-0.235]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.013,0.355,1.038]},
              {el:'C',pos:[1.233,0.589,-0.67]},
              {el:'O',pos:[1.328,0.899,-1.849]},
              {el:'O',pos:[2.266,0.73,0.205]},
              {el:'H',pos:[3.063,1.103,-0.229]},
              {el:'C',pos:[-0.089,-1.546,0]},
              {el:'C',pos:[1.036,-2.258,0.758]},
              {el:'C',pos:[-0.206,-2.103,-1.422]},
              {el:'H',pos:[-1.021,-1.813,0.52]},
              {el:'H',pos:[1.112,-1.876,1.782]},
              {el:'H',pos:[2.003,-2.112,0.266]},
              {el:'H',pos:[0.846,-3.335,0.815]},
              {el:'H',pos:[0.687,-1.88,-2.015]},
              {el:'H',pos:[-0.319,-3.193,-1.397]},
              {el:'H',pos:[-1.077,-1.704,-1.951]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG1','CG2','HB','HG11','HG12','HG13','HG21','HG22','HG23'],
      smiles:'CC(C)[C@H](N)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[6,5,2],[7,5],[7,8],[9,3],[9,10],[9,11],[9,12],[10,13],[10,14],[10,15],[11,16],[11,17],[11,18] ],
      optH:[4,12,13,14,15,16,17,18],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    histidine: {
      flat:true,
      flat2d:[[0.376,-1.774],[1.074,-0.565],[2.47,-0.565],[3.168,0.644],[3.168,-1.774],[0.376,0.644],[-1.02,0.644],[-1.841,-0.485],[-1.841,1.774],[-3.168,-0.054],[-3.168,1.342]],
      name:'Histidine', formula:'C₆H₉N₃O₂', class:'aminoacid', res:'His', side:'–CH₂-imidazole',
      units:'angstrom',
      src:{path:'pubchem', cid:6274, record:'3d',
           conformer:'0000188200000001', sdf:'histidine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.159,0.532,-0.713]},
              {el:'H',pos:[-2.014,0.221,-0.253]},
              {el:'H',pos:[-1.196,0.143,-1.655]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.014,0.402,1.02]},
              {el:'C',pos:[1.231,0.532,-0.713]},
              {el:'O',pos:[1.298,0.766,-1.914]},
              {el:'O',pos:[2.264,0.76,0.139]},
              {el:'H',pos:[3.051,1.115,-0.327]},
              {el:'C',pos:[-0.05,-1.536,0]},
              {el:'C',pos:[1.119,-2.161,0.727]},
              {el:'H',pos:[-0.073,-1.91,-1.033]},
              {el:'H',pos:[-0.974,-1.88,0.482]},
              {el:'N',pos:[1.924,-3.05,0.12]},
              {el:'C',pos:[1.569,-1.998,1.987]},
              {el:'C',pos:[2.86,-3.407,1.051]},
              {el:'H',pos:[1.863,-3.393,-0.83]},
              {el:'N',pos:[2.672,-2.787,2.194]},
              {el:'H',pos:[1.178,-1.366,2.771]},
              {el:'H',pos:[3.644,-4.118,0.833]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG','HB1','HB2','ND1','CD2','CE1','HD1','NE2','HD2','HE1'],
      smiles:'N[C@@H](Cc1cnc[nH]1)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[6,5,2],[7,5],[7,8],[9,3],[9,10],[9,11],[9,12],[10,14,2],[13,10],[13,15],[13,16],[14,18],[15,19],[17,14],[17,15,2] ],
      optH:[4,11,12,18,19],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    leucine: {
      flat:true,
      flat2d:[[1.901,-0.366],[0.634,0.366],[0.634,1.829],[-0.634,2.561],[1.901,2.561],[-0.634,-0.366],[-0.634,-1.829],[-1.901,-2.561],[0.634,-2.561]],
      name:'Leucine', formula:'C₆H₁₃NO₂', class:'aminoacid', res:'Leu', side:'–CH₂CH(CH₃)₂',
      units:'angstrom',
      src:{path:'pubchem', cid:6106, record:'3d',
           conformer:'000017DA00000001', sdf:'leucine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.166,0.525,-0.709]},
              {el:'H',pos:[-2.016,0.197,-0.251]},
              {el:'H',pos:[-1.197,0.141,-1.654]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.028,0.387,1.023]},
              {el:'C',pos:[1.237,0.525,-0.709]},
              {el:'O',pos:[1.557,0.272,-1.864]},
              {el:'O',pos:[1.984,1.324,0.1]},
              {el:'H',pos:[2.785,1.658,-0.356]},
              {el:'C',pos:[0.02,-1.537,0]},
              {el:'C',pos:[1.192,-2.194,0.758]},
              {el:'H',pos:[0.018,-1.912,-1.033]},
              {el:'H',pos:[-0.915,-1.897,0.451]},
              {el:'C',pos:[1.258,-1.755,2.222]},
              {el:'C',pos:[2.512,-1.855,0.059]},
              {el:'H',pos:[1.046,-3.28,0.722]},
              {el:'H',pos:[1.505,-0.695,2.329]},
              {el:'H',pos:[0.301,-1.936,2.723]},
              {el:'H',pos:[2.026,-2.326,2.754]},
              {el:'H',pos:[2.443,-1.941,-1.029]},
              {el:'H',pos:[2.943,-0.898,0.353]},
              {el:'H',pos:[3.261,-2.598,0.367]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG','HB1','HB2','CD1','CD2','HG','HD11','HD12','HD13','HD21','HD22','HD23'],
      smiles:'CC(C)C[C@H](N)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[6,5,2],[7,5],[7,8],[9,3],[9,11],[9,12],[10,9],[10,13],[10,14],[10,15],[13,16],[13,17],[13,18],[14,19],[14,20],[14,21] ],
      optH:[4,11,12,15,16,17,18,19,20,21],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    threonine: {
      flat:true,
      flat2d:[[0,-1.796],[0,-0.359],[1.244,0.359],[1.244,1.796],[2.488,-0.359],[-1.244,0.359],[-1.244,1.796],[-2.488,-0.359]],
      name:'Threonine', formula:'C₄H₉NO₃', class:'aminoacid', res:'Thr', side:'–CH(OH)CH₃',
      units:'angstrom',
      src:{path:'pubchem', cid:6288, record:'3d',
           conformer:'0000189000000001', sdf:'threonine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.165,0.541,-0.706]},
              {el:'H',pos:[-1.176,1.557,-0.619]},
              {el:'H',pos:[-2.019,0.21,-0.258]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[0.014,0.386,1.026]},
              {el:'C',pos:[1.232,0.541,-0.706]},
              {el:'O',pos:[1.219,1.229,-1.72]},
              {el:'O',pos:[2.383,0.195,-0.072]},
              {el:'H',pos:[3.174,0.553,-0.528]},
              {el:'C',pos:[-0.052,-1.536,0]},
              {el:'O',pos:[1.066,-2.084,0.695]},
              {el:'C',pos:[-0.067,-2.134,-1.401]},
              {el:'H',pos:[-0.952,-1.871,0.53]},
              {el:'H',pos:[1.067,-1.705,1.591]},
              {el:'H',pos:[-0.934,-1.807,-1.984]},
              {el:'H',pos:[-0.097,-3.228,-1.34]},
              {el:'H',pos:[0.845,-1.886,-1.955]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','OG1','CG2','HB','HG1','HG21','HG22','HG23'],
      smiles:'C[C@@H](O)[C@H](N)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[6,5,2],[7,5],[7,8],[9,3],[9,11],[9,12],[10,9],[10,13],[11,14],[11,15],[11,16] ],
      optH:[4,12,14,15,16],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    tyrosine: {
      flat:true,
      flat2d:[[1.409,-1.831],[2.114,-0.61],[3.524,-0.61],[4.228,0.61],[4.228,-1.831],[1.409,0.61],[0,0.61],[-0.705,-0.61],[-0.705,1.831],[-2.114,-0.61],[-2.114,1.831],[-2.819,0.61],[-4.228,0.61]],
      name:'Tyrosine', formula:'C₉H₁₁NO₃', class:'aminoacid', res:'Tyr', side:'–CH₂-C₆H₄OH',
      units:'angstrom',
      src:{path:'pubchem', cid:6057, record:'3d',
           conformer:'000017A900000001', sdf:'tyrosine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.159,0.532,-0.713]},
              {el:'H',pos:[-2.014,0.239,-0.242]},
              {el:'H',pos:[-1.205,0.128,-1.649]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.022,0.409,1.017]},
              {el:'C',pos:[1.231,0.532,-0.713]},
              {el:'O',pos:[1.298,0.766,-1.913]},
              {el:'O',pos:[2.264,0.76,0.139]},
              {el:'H',pos:[3.051,1.115,-0.327]},
              {el:'C',pos:[-0.05,-1.536,0]},
              {el:'C',pos:[0.798,-2.151,1.089]},
              {el:'H',pos:[0.262,-1.936,-0.975]},
              {el:'H',pos:[-1.082,-1.885,0.141]},
              {el:'C',pos:[2.123,-2.457,0.825]},
              {el:'C',pos:[0.233,-2.396,2.33]},
              {el:'C',pos:[2.905,-3.025,1.831]},
              {el:'H',pos:[2.563,-2.266,-0.149]},
              {el:'C',pos:[1.016,-2.964,3.336]},
              {el:'H',pos:[-0.805,-2.152,2.535]},
              {el:'C',pos:[2.352,-3.278,3.086]},
              {el:'H',pos:[3.944,-3.266,1.623]},
              {el:'H',pos:[0.579,-3.158,4.312]},
              {el:'O',pos:[3.116,-3.833,4.067]},
              {el:'H',pos:[4.012,-3.984,3.72]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG','HB1','HB2','CD1','CD2','CE1','HD1','CE2','HD2','CZ','HE1','HE2','OH','HH'],
      smiles:'N[C@@H](Cc1ccc(O)cc1)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[6,5,2],[7,5],[7,8],[9,3],[9,10],[9,11],[9,12],[10,13,2],[10,14],[13,15],[13,16],[14,17,2],[14,18],[15,19,2],[15,20],[17,19],[17,21],[22,19],[22,23] ],
      optH:[4,11,12,16,18,20,21],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    isoleucine: {
      flat:true,
      flat2d:[[-1.904,0.733],[-0.635,0],[0.635,0.733],[1.904,0],[0.635,2.199],[-0.635,-1.466],[0.635,-2.199],[-1.904,-2.199],[1.904,-1.466]],
      name:'Isoleucine', formula:'C₆H₁₃NO₂', class:'aminoacid', res:'Ile', side:'–CH(CH₃)CH₂CH₃',
      units:'angstrom',
      src:{path:'pubchem', cid:6306, record:'3d',
           conformer:'000018A200000001', sdf:'isoleucine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.155,0.544,-0.721]},
              {el:'H',pos:[-1.113,0.293,-1.707]},
              {el:'H',pos:[-1.135,1.562,-0.683]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.004,0.393,1.023]},
              {el:'C',pos:[1.226,0.544,-0.721]},
              {el:'O',pos:[1.196,1.222,-1.74]},
              {el:'O',pos:[2.385,0.218,-0.091]},
              {el:'H',pos:[3.168,0.581,-0.556]},
              {el:'C',pos:[0.008,-1.549,0]},
              {el:'C',pos:[0.044,-2.178,-1.413]},
              {el:'C',pos:[-1.179,-2.112,0.797]},
              {el:'H',pos:[0.92,-1.874,0.521]},
              {el:'C',pos:[0.068,-3.701,-1.444]},
              {el:'H',pos:[0.934,-1.82,-1.944]},
              {el:'H',pos:[-0.823,-1.85,-1.999]},
              {el:'H',pos:[-1.263,-1.612,1.768]},
              {el:'H',pos:[-2.125,-1.974,0.262]},
              {el:'H',pos:[-1.053,-3.18,0.999]},
              {el:'H',pos:[0.88,-4.092,-0.823]},
              {el:'H',pos:[0.226,-4.052,-2.469]},
              {el:'H',pos:[-0.876,-4.127,-1.095]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG1','CG2','HB','CD1','HG11','HG12','HG21','HG22','HG23','HD11','HD12','HD13'],
      smiles:'CC[C@H](C)[C@H](N)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[6,5,2],[7,5],[7,8],[9,3],[9,10],[9,11],[9,12],[10,13],[10,14],[10,15],[11,16],[11,17],[11,18],[13,19],[13,20],[13,21] ],
      optH:[4,12,14,15,16,17,18,19,20,21],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    asparagine: {
      flat:true,
      flat2d:[[0.607,1.753],[0.607,0.351],[1.822,-0.351],[1.822,-1.753],[3.036,0.351],[-0.607,-0.351],[-1.822,0.351],[-1.822,1.753],[-3.036,-0.351]],
      name:'Asparagine', formula:'C₄H₈N₂O₃', class:'aminoacid', res:'Asn', side:'–CH₂CONH₂',
      units:'angstrom',
      src:{path:'pubchem', cid:6267, record:'3d',
           conformer:'0000187B00000002', sdf:'asparagine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.163,0.51,-0.731]},
              {el:'H',pos:[-1.155,0.166,-1.69]},
              {el:'H',pos:[-1.121,1.527,-0.784]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.022,0.422,1.009]},
              {el:'C',pos:[1.231,0.51,-0.731]},
              {el:'O',pos:[1.316,0.686,-1.94]},
              {el:'O',pos:[2.269,0.738,0.117]},
              {el:'H',pos:[3.066,1.056,-0.358]},
              {el:'C',pos:[-0.029,-1.53,0]},
              {el:'C',pos:[1.161,-2.097,0.747]},
              {el:'H',pos:[-0.943,-1.903,0.478]},
              {el:'H',pos:[-0.003,-1.926,-1.023]},
              {el:'O',pos:[1.981,-2.839,0.211]},
              {el:'N',pos:[1.215,-1.719,2.069]},
              {el:'H',pos:[0.505,-1.138,2.503]},
              {el:'H',pos:[1.967,-2.039,2.67]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG','HB1','HB2','OD1','ND2','HD21','HD22'],
      smiles:'NC(=O)C[C@H](N)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[3,9],[6,5,2],[7,5],[7,8],[9,10],[9,11],[9,12],[13,10,2],[14,10],[14,15],[14,16] ],
      optH:[4,11,12],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    phenylalanine: {
      flat:true,
      flat2d:[[0.707,-1.836],[1.413,-0.612],[2.827,-0.612],[3.533,0.612],[3.533,-1.836],[0.707,0.612],[-0.707,0.612],[-1.413,-0.612],[-1.413,1.836],[-2.827,-0.612],[-2.827,1.836],[-3.533,0.612]],
      name:'Phenylalanine', formula:'C₉H₁₁NO₂', class:'aminoacid', res:'Phe', side:'–CH₂-C₆H₅',
      units:'angstrom',
      src:{path:'pubchem', cid:6140, record:'3d',
           conformer:'000017FC00000001', sdf:'phenylalanine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.159,0.532,-0.713]},
              {el:'H',pos:[-2.014,0.239,-0.242]},
              {el:'H',pos:[-1.205,0.128,-1.649]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.022,0.409,1.017]},
              {el:'C',pos:[1.231,0.532,-0.713]},
              {el:'O',pos:[1.298,0.766,-1.913]},
              {el:'O',pos:[2.264,0.76,0.139]},
              {el:'H',pos:[3.051,1.115,-0.327]},
              {el:'C',pos:[-0.05,-1.536,0]},
              {el:'C',pos:[0.798,-2.151,1.09]},
              {el:'H',pos:[0.262,-1.936,-0.975]},
              {el:'H',pos:[-1.082,-1.885,0.141]},
              {el:'C',pos:[2.123,-2.457,0.826]},
              {el:'C',pos:[0.234,-2.396,2.33]},
              {el:'C',pos:[2.906,-3.024,1.831]},
              {el:'H',pos:[2.563,-2.266,-0.149]},
              {el:'C',pos:[1.017,-2.963,3.336]},
              {el:'H',pos:[-0.805,-2.153,2.535]},
              {el:'C',pos:[2.353,-3.277,3.086]},
              {el:'H',pos:[3.946,-3.269,1.637]},
              {el:'H',pos:[0.586,-3.16,4.314]},
              {el:'H',pos:[2.962,-3.719,3.869]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG','HB1','HB2','CD1','CD2','CE1','HD1','CE2','HD2','CZ','HE1','HE2','HZ'],
      smiles:'N[C@@H](Cc1ccccc1)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[6,5,2],[7,5],[7,8],[9,3],[9,10],[9,11],[9,12],[10,13,2],[10,14],[13,15],[13,16],[14,17,2],[14,18],[15,19,2],[15,20],[17,19],[17,21],[19,22] ],
      optH:[4,11,12,16,18,20,21,22],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    arginine: {
      flat:true,
      flat2d:[[-2.468,1.781],[-2.468,0.356],[-3.702,-0.356],[-3.702,-1.781],[-4.936,0.356],[-1.234,-0.356],[0,0.356],[1.234,-0.356],[2.468,0.356],[3.702,-0.356],[4.936,0.356],[3.702,-1.781]],
      name:'Arginine', formula:'C₆H₁₅N₄O₂⁺', charge:1, class:'aminoacid', res:'Arg', side:'–(CH₂)₃NHC(NH₂)₂⁺',
      /* THE SIDE CHAIN IS DRAWN CHARGED, the backbone neutral. The guanidinium
       * pKa is about 12.5, so at pH 7.4 it is protonated and +1, and that is
       * the property a sequence lesson reads off it. PubChem's record is the
       * neutral base, –N=C(NH₂)₂; HE is added on NE, in the CD-NE-CZ plane on
       * the bisector, and the + sits on NE in this one Lewis structure. The
       * real charge is shared over all three N; the C–N lengths stay unequal
       * because the source conformer is the base. */
      units:'angstrom',
      src:{path:'pubchem', cid:6322, record:'3d',
           conformer:'000018B200000004', sdf:'arginine.sdf',
           tool:'sdf2spec', regen:'manual', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.154,0.536,-0.718]},
              {el:'H',pos:[-1.169,1.552,-0.635]},
              {el:'H',pos:[-2.013,0.204,-0.281]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[0,0.386,1.025]},
              {el:'C',pos:[1.225,0.536,-0.718]},
              {el:'O',pos:[1.202,1.251,-1.711]},
              {el:'O',pos:[2.381,0.152,-0.114]},
              {el:'H',pos:[3.17,0.509,-0.575]},
              {el:'C',pos:[-0.052,-1.535,0]},
              {el:'C',pos:[-0.106,-2.113,-1.422]},
              {el:'H',pos:[0.828,-1.924,0.527]},
              {el:'H',pos:[-0.932,-1.871,0.563]},
              {el:'C',pos:[-0.178,-3.637,-1.428]},
              {el:'H',pos:[-0.982,-1.734,-1.959]},
              {el:'H',pos:[0.781,-1.801,-1.986]},
              {el:'N',pos:[1.018,-4.195,-0.795],q:1},
              {el:'H',pos:[-1.081,-3.958,-0.893]},
              {el:'H',pos:[-0.252,-3.974,-2.469]},
              {el:'C',pos:[1.115,-5.488,-0.769]},
              {el:'N',pos:[2.208,-6.091,-0.193]},
              {el:'N',pos:[0.224,-6.413,-1.267]},
              {el:'H',pos:[2.953,-5.539,0.219]},
              {el:'H',pos:[2.303,-7.1,-0.162]},
              {el:'H',pos:[0.405,-7.408,-1.19]},
              {el:'H',pos:[-0.64,-6.141,-1.723]},
              {el:'H',pos:[1.734,-3.601,-0.397]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG','HB1','HB2','CD','HG1','HG2','NE','HD1','HD2','CZ','NH1','NH2','HH11','HH12','HH21','HH22','HE'],
      smiles:'NC(N)=[NH+]CCC[C@H](N)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[6,5,2],[7,5],[7,8],[9,3],[9,10],[9,11],[9,12],[10,13],[10,14],[10,15],[13,17],[13,18],[16,13],[16,19,2],[20,19],[20,22],[20,23],[21,19],[21,24],[21,25],[16,26] ],
      optH:[4,11,12,14,15,17,18],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
    methionine: {
      flat:true,
      flat2d:[[1.327,-1.916],[1.327,-0.383],[2.654,0.383],[2.654,1.916],[3.981,-0.383],[0,0.383],[-1.327,-0.383],[-2.654,0.383],[-3.981,-0.383]],
      name:'Methionine', formula:'C₅H₁₁NO₂S', class:'aminoacid', res:'Met', side:'–CH₂CH₂SCH₃',
      units:'angstrom',
      src:{path:'pubchem', cid:6137, record:'3d',
           conformer:'000017F90000000E', sdf:'methionine.sdf',
           tool:'sdf2spec', regen:'exact', fetched:'2026-10-07'},
      atoms:[ {el:'N',pos:[-1.163,0.515,-0.729]},
              {el:'H',pos:[-1.182,1.532,-0.668]},
              {el:'H',pos:[-2.018,0.189,-0.28]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.027,0.413,1.013]},
              {el:'C',pos:[1.228,0.515,-0.729]},
              {el:'O',pos:[1.308,0.684,-1.94]},
              {el:'O',pos:[2.25,0.801,0.119]},
              {el:'H',pos:[3.036,1.143,-0.358]},
              {el:'C',pos:[-0.042,-1.535,0]},
              {el:'C',pos:[1.157,-2.228,0.654]},
              {el:'H',pos:[-0.977,-1.884,0.455]},
              {el:'H',pos:[-0.079,-1.888,-1.041]},
              {el:'S',pos:[1.39,-1.763,2.395]},
              {el:'H',pos:[2.079,-1.99,0.113]},
              {el:'H',pos:[1.034,-3.315,0.596]},
              {el:'C',pos:[-0.202,-2.334,3.032]},
              {el:'H',pos:[-1.007,-1.66,2.731]},
              {el:'H',pos:[-0.162,-2.338,4.125]},
              {el:'H',pos:[-0.417,-3.351,2.696]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG','HB1','HB2','SD','HG1','HG2','CE','HE1','HE2','HE3'],
      smiles:'CSCC[C@H](N)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[6,5,2],[7,5],[7,8],[9,3],[9,10],[9,11],[9,12],[10,14],[10,15],[13,10],[13,16],[16,17],[16,18],[16,19] ],
      optH:[4,11,12,14,15,17,18,19],
      chirality:'L',
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
    },
  }, SELFNAME);

  {
    // — D-alanine: the exact mirror image of `alanine` above, not a rotation.
    // Negating one coordinate component is a reflection (determinant -1), which
    // flips every CIP-priority signed volume without touching a single bond
    // length or angle — the same trick check-molecules.js's comment on the
    // chirality check describes ("negated one output component"). Z is chosen
    // arbitrarily; any single axis works.
    const mirror=p=>[p[0],p[1],-p[2]];
    AA.dAlanine={ name:'D-Alanine', formula:'C₃H₇NO₂', class:'aminoacid',
      // Reflection of `alanine` (determinant -1), computed at load time, so it
      // inherits alanine's provenance and cannot drift from it.
      // Mirrors MOLECULES.alanine, which register() has already scaled — so
      // these coordinates are scene units, not Angstroms. Scaling again would
      // double it.
      units:'scene',
      src:{path:'mirror', of:'alanine', axis:'z'},
      res:'D-Ala', side:'–CH₃',
      atoms:MOLECULES.alanine.atoms.map(a=>({ el:a.el, pos:mirror(a.pos) })),
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','HB1','HB2','HB3'],
      smiles:'O=[C:1](O)[C@@H:1]([CH3:1])[NH2:1]',
      bonds:MOLECULES.alanine.bonds.map(b=>b.slice()),
      optH:MOLECULES.alanine.optH.slice(),
      chirality:'D',   // asserted by check-molecules.js — the mirror life doesn't use
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
      contrast:{ pair:'alanine-D-alanine', partner:'alanine',
        differs:'handedness',
        lesson:'why life is homochiral',
        diff:['CA','N','HA','C','CB'],
        note:'Same four groups on Cα as L-alanine — amino, carboxyl, H, methyl — '
           + 'just mirrored. Bacteria use D-alanine to cross-link cell walls, and it '
           + 'turns up in a few peptide antibiotics, but no ribosome on Earth reads it.' } };
  }
  {
    // — proline: the one amino acid whose side chain bonds BACK to its own
    //   backbone nitrogen, closing a 5-membered ring (N-Ca-Cb-Cg-Cd-N). Every
    //   other residue's backbone follows the fixed order this file documents
    //   at the top of the amino-acid section (0 N, 1 H, 2 H, 3 Ca, …) because
    //   the amino N carries TWO hydrogens — a primary amine. Proline's N is
    //   secondary (one H, one ring bond), so slot 2 — normally the second
    //   amino H — holds Cδ instead, and Cδ's own two hydrogens land at the
    //   tail (15, 16). `pep.hN` is therefore a ONE-element array, not two:
    //   documentation of the difference, not a page hookup. Anything reading
    //   hN must read the whole array; proline is the spec that punishes hN[1].
    //
    //   Real PubChem 3D conformer (CID 145742, L-proline), reindexed by hand
    //   into the above order and run through sdf2spec.js's own reframe()
    //   (recentre on Ca, backbone N->C -> +X, side chain -> -Y, the same
    //   1.9x SCALE). check-molecules.js's
    //   chirality check (CA_IDX 3, R_IDX 9 — both land on the right atoms
    //   under this reindexing) confirms the geometry is L, as it must be:
    //   ribosomes only ever build with proline's one hand.
    //
    //   contrast-lab.html: paired with glycine, not alanine — alanine's
    //   `contrast` slot is already spoken for by D-alanine, and glycine (no
    //   side chain beyond H) makes the cleaner point anyway: even the
    //   plainest possible amino acid still has a free N-H. Proline does not.
    AA.proline={ name:'Proline', formula:'C₅H₉NO₂', class:'aminoacid', res:'Pro', side:'ring to N',
      // The one spec whose extra step was written down. reindex:'by-hand' is
      // load-bearing: sdf2spec.js THROWS on proline (its reindex assumes two H
      // on the amino N), so only reframe() was used. Anything that regenerates
      // this must reproduce the hand reindex or hit the same TypeError.
      // The .sdf is committed and the conformer pinned, but `regen:'manual'` is
      // the honest ceiling: sdf2spec.js still throws on this record (verified
      // again 2026-07-30), so the committed file documents the SOURCE without
      // making the spec re-derivable. Reproducing it means repeating the hand
      // reindex described above.
      units:'angstrom',
      src:{path:'pubchem', cid:145742, record:'3d',
           conformer:'0002394E00000001', sdf:'proline.sdf',
           tool:'sdf2spec:reframe-only', reindex:'by-hand',
           regen:'manual', fetched:'2026-07-30'},
      atoms:[ {el:'N',pos:[-1.1784,0.4747,-0.7253]},
              {el:'H',pos:[-1.0163,1.3679,-1.1863]},
              {el:'C',pos:[-1.5289,-0.5705,-1.6816]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[0.0111,0.4184,1.0116]},
              {el:'C',pos:[1.2216,0.4747,-0.7253]},
              {el:'O',pos:[1.2147,1.1511,-1.7432]},
              {el:'O',pos:[2.3458,0.0489,-0.0989]},
              {el:'H',pos:[3.1579,0.3484,-0.5605]},
              {el:'C',pos:[-0.1026,-1.5216,0]},
              {el:'H',pos:[-0.2768,-1.9095,1.01]},
              {el:'H',pos:[0.7958,-2.0095,-0.3947]},
              {el:'C',pos:[-1.2979,-1.8411,-0.89]},
              {el:'H',pos:[-1.1132,-2.7058,-1.5347]},
              {el:'H',pos:[-2.1726,-2.0658,-0.2668]},
              {el:'H',pos:[-0.8747,-0.5332,-2.56]},
              {el:'H',pos:[-2.5658,-0.4789,-2.0168]} ],
      names:['N','H','CD','CA','HA','C','O','OXT','HXT','CB','HB1','HB2','CG','HG1','HG2','HD1','HD2'],
      smiles:'O=C(O)[C@@H]1CC[CH2:1][NH:1]1',
      bonds:[ [0,1],[0,2],[0,3],[2,15],[2,16],[3,4],[3,5],[3,9],
              [5,6,2],[5,7],[7,8],[9,10],[9,11],[9,12],[12,2],[12,13],[12,14] ],
      optH:[4,10,11,13,14,15,16],   // nonpolar C–H, hidden by the lab's H toggle
      chirality:'L',   // asserted by check-molecules.js — life is homochiral
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1] },   // one amino H, not two — see note above
      /* PROLINE'S φ IS NOT FREE, and the builder must not pretend it is. The
       * side chain bonds back to the backbone nitrogen, so the N–Cα torsion is
       * inside a five-membered ring: φ can only be about −65°, and the −139° an
       * extended chain uses is a shape this residue cannot take. Every other
       * residue reads peptide.js's default; this one carries its own, because
       * the constraint is a fact about the molecule and not about the pose. */
      pepPhi: -65,
      contrast:{ pair:'glycine-proline', partner:'glycine',
        differs:'ring-closed vs free amino N',
        lesson:'why gluten resists digestion',
        diff:['N','H','CD'],
        note:'Every other amino acid’s backbone nitrogen carries a free N–H, and the '
           + 'chain around it can flex into the extended shape a protease has to '
           + 'grip. Proline’s side chain bonds back into that nitrogen: no free N–H, '
           + 'and a stiff kink the enzyme cannot accommodate. Gliadin is unusually '
           + 'proline-rich, so those bonds pass through your gut uncut.' } };
  }
  {
    // — glutamine / glutamic acid: the second half of the gluten story. The edit
    //   is at the tip of the side chain only — amide –NH2 becomes –OH, so an N
    //   is replaced by an O and one H drops (C5H10N2O3 -> C5H9NO4). The lab's
    //   `ask` calls this "one atom" because the swap is what you SEE; the lost H
    //   is one of the two amide H's and is not separately visible.
    //
    //   Tissue transglutaminase (tTG) deamidates a glutamine side chain: the
    //   terminal amide –NH2 becomes an –OH, neutral becomes negative at gut pH.
    //   That single swap is what turns an undigested gliadin fragment into
    //   something HLA-DQ2/DQ8 binds tightly enough to trigger a T-cell response
    //   — see the `contrast` notes below. The proline pair explains why the
    //   fragment survives the gut at all; this pair explains why the survivor
    //   becomes an antigen.
    //
    //   Both are real PubChem 3D conformers (CID 5961 L-glutamine, CID 33032
    //   L-glutamic acid) run through tools/sdf2spec.js — no hand reindexing,
    //   unlike proline, though glutamine did force the backbone-N fix in that
    //   tool's reindex(): it is the first residue here with TWO nitrogens, and
    //   the SDF lists the side-chain amide N first.
    //
    //   The two carry the same ELEMENT in the same slot all the way to index 16
    //   (backbone 0-8, then Cb 9, Cg 10, its H 11/12, Cd 13, its H 14/15), and
    //   diverge only at the tail: glutamine 16 O(=), 17 N, 18/19 amide H;
    //   glutamic acid 16 O(-H), 17 O(=), 18 hydroxyl H. That alignment is an
    //   indexing convenience, not the visual effect — it keeps `diff` and `pep`
    //   reading the same slots on both, nothing more. What the eye actually
    //   responds to is the pose, set further down. Same slots also does NOT mean
    //   same coordinates: these are two independent conformers whose positions
    //   differ from index 1 on. `diff` marks only the group that changes — the
    //   carbonyl O is common to both, and highlighting it would overstate the
    //   edit.
    //
    //   VIEW TUNING: both are then rotated about X — the backbone axis reframe()
    //   already fixed — by +18.00° (Gln) and +17.75° (Glu). Straight out of the
    //   converter the side chain curled toward the camera and Cb/Cg drew as one
    //   blob with the terminal group hidden behind them; each angle is the one
    //   that flattened that molecule's heavy atoms best. Rotation about a fixed
    //   axis is chirality-preserving, so check-molecules.js still reads both as
    //   L; only the pose changes, never a length or an angle. Constrained to the
    //   root that keeps the side chain pointing -Y: the other z-minimum is ~180°
    //   away and would flip one chain up and the other down.
    //
    //   Then the terminal group is turned about the Cg-Cd bond (atoms 10->13) by
    //   -84.75° (Gln) and -89.50° (Glu). That bond is a freely rotating single
    //   bond, so this picks a different SIDE-CHAIN ROTAMER — a conformation the
    //   real residue samples constantly — rather than editing any length or
    //   angle. It is the one change here that is not a pure view transform, and
    //   it earns its place: in the PubChem rotamer the amide sits edge-on to the
    //   camera and the N hides behind the carbonyl O, which is precisely the
    //   atom the whole pair exists to show. After the turn every non-bonded pair
    //   of heavy atoms clears by at least 0.50 in screen XY.
    //
    //   Both angles are additionally constrained to put the carbonyl O on the
    //   RIGHT and the group that actually differs (Gln's –NH2, Glu's –O⁻) on the
    //   LEFT, so the eye lands on the same spot in either panel and sees one
    //   substitution. This is what makes the pair read as one molecule edited;
    //   unconstrained, the two best-scoring rotamers splay opposite ways.
    //
    //   Glutamate's side chain is drawn CHARGED, as at pH 7.4, like arginine's;
    //   every backbone in this file stays neutral. The neutral acid is kept as
    //   `glutamicAcid` for the one reaction that spends its side-chain –OH.
    AA.glutamine={ name:'Glutamine', formula:'C₅H₁₀N₂O₃', class:'aminoacid', res:'Gln', side:'–CH₂CH₂CONH₂',
      // conformer:null is the ACTIVE claim here, and 2026-07-30 made it worse
      // rather than better. ALL TEN currently-published conformers of CID 5961
      // were fetched and converted; none reproduces this spec (best |Δ| 6.357,
      // default record 7.056). The deviation climbs outward from the backbone
      // (N 0.5 → NE2 5.3 → terminal H 7.1): the backbone reproduces, the
      // flexible tail does not, and the tail is where this spec's lesson lives.
      //
      // So the source geometry is LOST — PubChem regenerates conformer sets, and
      // whichever one this came from is no longer published. sdf/glutamine.sdf is
      // committed as the closest available record, NOT as a reproduction; that is
      // what regen:'lost' means. THIS SPEC IS NOW ITS OWN SOURCE. Do not
      // 'refresh' it from PubChem — you would silently swap the rotamer, and the
      // amide's edge-on presentation that the contrast lesson depends on is a
      // property of THIS conformer.
      units:'angstrom',
      src:{path:'pubchem', cid:5961, record:'3d', conformer:null,
           sdf:'glutamine.sdf', tool:'sdf2spec', regen:'lost',
           fetched:'2026-07-30'},
      atoms:[ {el:'N',pos:[-1.1737,0.3363,-0.8058]},
              {el:'H',pos:[-1.1547,-0.1737,-1.6879]},
              {el:'H',pos:[-1.1516,1.3258,-1.0495]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.0021,0.6584,0.8768]},
              {el:'C',pos:[1.2416,0.3363,-0.8058]},
              {el:'O',pos:[1.2516,0.7332,-1.9637]},
              {el:'O',pos:[2.38,0.1637,-0.0837]},
              {el:'H',pos:[3.1805,0.3879,-0.6042]},
              {el:'C',pos:[-0.0384,-1.4621,0.4753]},
              {el:'C',pos:[-0.1305,-2.53,-0.6211]},
              {el:'H',pos:[0.85,-1.6674,1.0868]},
              {el:'H',pos:[-0.8968,-1.5805,1.1505]},
              {el:'C',pos:[-0.2784,-3.9421,-0.0963]},
              {el:'H',pos:[-0.9963,-2.34,-1.2658]},
              {el:'H',pos:[0.7663,-2.4937,-1.2511]},
              {el:'O',pos:[0.69,-4.6295,0.2174]},
              {el:'N',pos:[-1.5826,-4.3758,-0.0279]},
              {el:'H',pos:[-2.3637,-3.7879,-0.3]},
              {el:'H',pos:[-1.8063,-5.3079,0.3032]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG','HB1','HB2','CD','HG1','HG2','OE1','NE2','HE21','HE22'],
      smiles:'N[C@@H](CCC(=O)[NH2:1])C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[3,9],[5,6,2],[5,7],[7,8],
              [9,10],[9,11],[9,12],[10,13],[10,14],[10,15],[13,16,2],[13,17],[17,18],[17,19] ],
      optH:[4,11,12,14,15],   // nonpolar C–H; the amide N–H at 18/19 are donors, never optional
      chirality:'L',   // asserted by check-molecules.js — life is homochiral
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
      contrast:{ pair:'glutamine-glutamate', partner:'glutamate',
        differs:'side-chain amide vs acid',
        lesson:'how gluten becomes an antigen',
        diff:['NE2','HE21','HE22'],
        note:'Gliadin is glutamine-rich as well as proline-rich. This side chain '
           + 'ends in an amide — neutral, and nothing your immune system objects to. '
           + 'An enzyme in your gut wall swaps that –NH₂ for an –OH.' } };
    AA.glutamicAcid={ name:'Glutamic acid', formula:'C₅H₉NO₄', class:'aminoacid', res:'Glu', side:'–CH₂CH₂COOH',
      // Same as glutamine, and checked the same way: all ten published
      // conformers of CID 33032 fetched and converted 2026-07-30, none
      // reproducing this spec (best |Δ| 5.827). Note these two are INDEPENDENT
      // conformers, not one spec edited into the other, which is why their
      // shared atoms do not share coordinates — and why losing the source hits
      // them separately. This spec is now its own source; see glutamine.
      units:'angstrom',
      src:{path:'pubchem', cid:33032, record:'3d', conformer:null,
           sdf:'glutamate.sdf', tool:'sdf2spec', regen:'lost',
           fetched:'2026-07-30'},
      atoms:[ {el:'N',pos:[-1.1711,0.3311,-0.8089]},
              {el:'H',pos:[-1.1858,1.3332,-0.9974]},
              {el:'H',pos:[-2.0195,0.1284,-0.2821]},
              {el:'C',pos:[0,0,0]},
              {el:'H',pos:[-0.0047,0.6579,0.8768]},
              {el:'C',pos:[1.2416,0.3311,-0.8089]},
              {el:'O',pos:[1.2495,0.7226,-1.9695]},
              {el:'O',pos:[2.3805,0.1411,-0.0926]},
              {el:'H',pos:[3.1821,0.3532,-0.6168]},
              {el:'C',pos:[-0.0132,-1.4647,0.4689]},
              {el:'C',pos:[0.1268,-2.5258,-0.6263]},
              {el:'H',pos:[-0.9363,-1.6532,1.0337]},
              {el:'H',pos:[0.8032,-1.6047,1.1905]},
              {el:'C',pos:[0.2042,-3.9379,-0.1021]},
              {el:'H',pos:[-0.73,-2.4705,-1.3058]},
              {el:'H',pos:[1.0421,-2.3463,-1.2011]},
              {el:'O',pos:[-1.0042,-4.5553,-0.0789]},
              {el:'O',pos:[1.24,-4.4716,0.2742]},
              {el:'H',pos:[-0.9411,-5.47,0.2695]} ],
      names:['N','H','H2','CA','HA','C','O','OXT','HXT','CB','CG','HB1','HB2','CD','HG1','HG2','OE2','OE1','HE2'],
      smiles:'N[C@@H](CCC(=O)O)C(=O)O',
      bonds:[ [0,1],[0,2],[0,3],[3,4],[3,5],[3,9],[5,6,2],[5,7],[7,8],
              [9,10],[9,11],[9,12],[10,13],[10,14],[10,15],[13,16],[13,17,2],[16,18] ],
      optH:[4,11,12,14,15],   // nonpolar C–H; the hydroxyl H at 18 is a donor, never optional
      chirality:'L',   // asserted by check-molecules.js — life is homochiral
      pep:{ cC:5, oOH:7, hOH:8, nN:0, hN:[1,2] },
      /* THE SECOND CARBOXYL, and it is a different molecule's worth of
       * difference. The side chain ends in –COOH too, and it makes the same
       * bond the backbone one does. Joined through it, Glu-Cys-Gly is
       * GLUTATHIONE — γ-linked, which is precisely why no ordinary peptidase
       * cuts it and why the cell can hold 5 mM of it as its main antioxidant.
       * Joined through the backbone carboxyl instead, the same three residues
       * give an ordinary tripeptide that any protease takes apart.
       *
       * So this role is not a convenience: it is the one choice on the stage
       * that decides which of two real molecules gets built. Named by atom,
       * because side-chain indices are not pinned the way the backbone's are. */
      pepSide:[ { key:'gamma', label:'\u03b3\u2013COOH', keep:'CD', leaves:['OE2','HE2'] } ],
    };
    /* GLUTAMATE, the side chain as it is at pH 7.4: HE2 gone, OE2 carrying
     * the 1−. Derived from the acid above so the two cannot drift; the acid
     * stays because glutathione's γ bond needs a –COOH to condense. Bond
     * orders keep the acid's one C=O, a Lewis structure of the carboxylate,
     * whose two C–O lengths stay the acid's unequal ones. */
    {
      const acid = AA.glutamicAcid, he = acid.names.indexOf('HE2'), oe = acid.names.indexOf('OE2');
      if(he !== acid.atoms.length - 1) throw new Error(SELFNAME + ': HE2 must be glutamic acid\'s last atom');
      const { pepSide, smiles, ...rest } = acid;
      AA.glutamate={ ...rest, name:'Glutamate', formula:'C₅H₈NO₄⁻', charge:-1, side:'–CH₂CH₂COO⁻',
        src:{path:'built', method:'glutamicAcid with HE2 removed, q:−1 on OE2'},
        atoms:acid.atoms.slice(0, he).map((a, i) => i === oe ? { ...a, q:-1 } : a),
        names:acid.names.slice(0, he),
        bonds:acid.bonds.filter(b => b[0] !== he && b[1] !== he),
        smiles:'N[C@@H](CCC(=O)[O-:1])C(=O)O',
        contrast:{ pair:'glutamine-glutamate', partner:'glutamine',
          differs:'side-chain carboxylate vs amide',
          lesson:'how gluten becomes an antigen',
          diff:['OE2'],
          note:'The same residue after that swap: an oxygen where the amide nitrogen '
             + 'was, without its H, leaving the side chain negative. The immune '
             + 'receptor nearly everyone with celiac disease carries grips exactly this '
             + 'charge — and ignores the neutral version.' } };
    }
  }
  register(AA, SELFNAME);
})(this);
