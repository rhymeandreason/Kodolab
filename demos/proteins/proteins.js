/* =============================================================================
 *  proteins/proteins.js — every protein in proteins/, and what we have of it
 * =============================================================================
 *  What `molecules.js` is to a spec, this is to a deposition: the one place
 *  that says which structures we hold, which variant is the default, and what
 *  each one is FOR. It is read by three kinds of reader — the bakers under
 *  `proteins/<name>/tools/`, the benches, and `proteins/check-proteins.js` —
 *  and it is written by two authors, which is the thing to understand before
 *  editing it.
 *
 *  TWO HALVES PER VARIANT, WITH DIFFERENT OWNERS.
 *
 *    said   everything outside `read` — purpose, species, which chains,
 *           which residues make the pocket. A HUMAN's, and a re-bake never
 *           touches it.
 *    read   inside `read: {}` — method, chains in the file, residues
 *           modelled, residues declared, and the file that was written. THE
 *           BAKER's, rewritten from the deposition on every run.
 *
 *  That split is why a card can print "x-ray diffraction, 151 of 151
 *  residues" without a human ever typing a number that a re-bake could
 *  falsify.
 *
 *  EVERY `read` FIELD IS ALSO IN THE BAKE — that is the invariant the whole
 *  file rests on. These five are convenience lines printed into an INDEX, so
 *  the collection can be listed, sorted and compared without opening
 *  seventeen files; they are never a fact the bake cannot produce. The moment
 *  one is, the index stops being a copy and becomes a second source, and the
 *  second source is the one that goes stale. `check-proteins.js` re-derives
 *  all five from the baked file and fails on a disagreement — including the
 *  case where the bake cannot answer at all, which is the way this could
 *  otherwise be broken quietly.
 *
 *  It is why the prion baker carries EXPDTA, REMARK 2 and the COMPND chain
 *  list into every reduced PDB it writes: a cut-down file that cannot say
 *  which experiment made it, how sharp it is and how many chains its entry
 *  has is a file this index would have to REMEMBER things for.
 *
 *  Everything else a reader wants about one structure — resolution, ligands,
 *  the fit residual, the extents — stays in that structure's own bake, beside
 *  the coordinates it describes, and a bench reads it from there.
 *
 *  NO PAGE COPY HERE EITHER. What a structure IS belongs in this file; what a
 *  bench SAYS about it under one particular stage is page copy and lives on
 *  the page, in its `SAYS` table.
 *
 *  `proteins/tools/registry-io.js` is the one place that knows how to splice a
 *  `read` block back in. It runs this file rather than parsing it, the same way
 *  `tools/mapcontent-io.js` handles the door map, so the prose and the comments
 *  around the data cannot be lost to a save — and in this file the comments are
 *  the reasons a structure was chosen, and which one it was chosen instead of.
 *
 *  METHOD IS A CONTROLLED VOCABULARY, and the reason is not tidiness:
 *
 *    'x-ray diffraction' · 'solution nmr' · 'electron microscopy' ·
 *    'neutron diffraction'          — MEASURED
 *    'predicted'                    — MODELLED, by AlphaFold or its like
 *
 *  A predicted structure is a different kind of claim from a measured one, and
 *  a collection that lets the two read alike will eventually show a student a
 *  guess as a fact. This is the field that keeps them apart, which is why it
 *  is spelled one way — `check-proteins.js` fails a method outside the list,
 *  so 'X-RAY DIFFRACTION' and 'x-ray' cannot both end up here and split the
 *  collection in two on a sort.
 *
 *  What QUALIFIES a method — a resolution for a measured structure, a pLDDT
 *  for a predicted one — is a fact about that one structure and lives in its
 *  bake, not here. The index says which KIND of claim a variant is; the bake
 *  says how good it is.
 *
 *  URLS ARE DERIVED FROM `source`, never stored — `rcsb.org/structure/<id>`
 *  and `files.rcsb.org/download/<id>.pdb` for a `kind:'rcsb'`, and a different
 *  pair for AlphaFold. A stored URL is one more thing to mistype, and every
 *  bench already builds both from the id for exactly that reason.
 *
 *  WHAT IS NOT HERE. The sickle fibre, whose baker feeds hemoglobin-lab's
 *  folding trajectory and which this file's re-bake does not reach. It joins
 *  the day someone gives it a `pipeline` that does. Hemoglobin itself is in,
 *  on `pipeline:'own'` for that same reason — its entry says why.
 * ============================================================================= */
(function (global) {
  'use strict';

  /* PrP's three, one of which is not a deposition: `stack` is 6LNI's ten
     chains kept together, a cut of a file already in the list, which is why
     it carries `of:` instead of a source of its own.

     HUMAN ONLY. The bench carried the Syrian hamster pair (1B10 native, 7LNA
     scrapie fibril) through the review and they were not selected: the pair
     says the same thing the human pair says, and two species on one bench is
     a comparison a lesson has not asked for. What went with them is the one
     thing they alone showed — 7LNA is disease MATERIAL from an infected
     brain, where 6LNI is the disease FOLD grown in vitro. If a lesson ever
     needs that distinction, it wants a brain-derived HUMAN fibril, not the
     hamster back. */
  const PRION_VARIANTS = [
    { id: '1QLZ', default: true,
      purpose: 'the healthy fold, human',
      species: 'human',
      section: 'human', label: 'native fold', chip: 'healthy',
      source: { kind: 'rcsb', id: '1QLZ' },
      state: 'healthy', form: 'PrP\u1D9C',
      read: {
        method: "solution nmr",
        chainsInFile: 1,
        ec: null,
        residues: 104,
        declared: 210,
        baked: "prp-1QLZ.json" } },
    { id: '6LNI',
      purpose: 'one rung of the disease fibril',
      species: 'human',
      section: 'human', label: 'fibril rung', chip: 'disease',
      source: { kind: 'rcsb', id: '6LNI' },
      state: 'disease', form: 'PrP\u02E2\u1D9C',
      read: {
        method: "electron microscopy",
        chainsInFile: 10,
        ec: null,
        residues: 60,
        declared: 210,
        baked: "prp-6LNI.json" } },
    { id: 'stack', of: '6LNI',
      purpose: 'ten rungs, which is why it spreads',
      species: 'human',
      section: 'human', label: '6LNI stacked', chip: 'disease',
      source: { kind: 'rcsb', id: '6LNI' },
      state: 'disease', form: 'PrP\u02E2\u1D9C',
      read: {
        method: "electron microscopy",
        chainsInFile: 10,
        ec: null,
        residues: 600,
        declared: 2100,
        baked: "prp-stack.json" } },
  ];

  const MYOGLOBIN_VARIANTS = [
    { id: '1MBN', default: true,
      purpose: 'the first protein structure ever solved',
      species: 'sperm whale',
      section: 'where it came from', label: 'Kendrew, 1960', chip: 'first',
      source: { kind: 'rcsb', id: '1MBN' },
      chains: 'A',
      pocket: { prox: 93, dist: 64 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 153,
        declared: 153,
        ec: null,
        baked: "mb-1MBN.json" } },
    { id: '1BZP',
      purpose: 'the site with nothing in it',
      species: 'sperm whale',
      section: 'the site, four states', label: 'empty · deoxy', chip: '1.15 Å',
      source: { kind: 'rcsb', id: '1BZP' },
      chains: 'A',
      pocket: { prox: 93, dist: 64 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 153,
        declared: 153,
        ec: null,
        baked: "mb-1BZP.json" } },
    { id: '1A6M',
      purpose: 'oxygen bound',
      species: 'sperm whale',
      section: 'the site, four states', label: 'oxygen bound', chip: 'O₂',
      source: { kind: 'rcsb', id: '1A6M' },
      chains: 'A',
      pocket: { prox: 93, dist: 64 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 151,
        declared: 151,
        ec: null,
        baked: "mb-1A6M.json" } },
    { id: '1MBC',
      purpose: 'carbon monoxide in the same place',
      species: 'sperm whale',
      section: 'the site, four states', label: 'carbon monoxide', chip: 'CO',
      source: { kind: 'rcsb', id: '1MBC' },
      chains: 'A',
      pocket: { prox: 93, dist: 64 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 153,
        declared: 153,
        ec: null,
        baked: "mb-1MBC.json" } },
    { id: '1ABS',
      purpose: 'the CO cut loose by light, frozen mid-escape',
      species: 'sperm whale',
      section: 'the site, four states', label: 'CO cut loose by light', chip: '20 K',
      source: { kind: 'rcsb', id: '1ABS' },
      chains: 'A',
      pocket: { prox: 93, dist: 64 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 154,
        declared: 154,
        ec: null,
        baked: "mb-1ABS.json" } },
    { id: '1YMB',
      purpose: 'another animal, the same answer',
      species: 'horse',
      section: 'relatives', label: 'horse heart', chip: '1 chain',
      source: { kind: 'rcsb', id: '1YMB' },
      chains: 'A',
      pocket: { prox: 93, dist: 64 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 153,
        declared: 153,
        ec: null,
        baked: "mb-1YMB.json" } },
    { id: '2HHB-B',
      purpose: 'the same fold, doing a job a monomer cannot',
      species: 'human',
      section: 'relatives', label: 'haemoglobin β', chip: '1 of 4',
      source: { kind: 'repo', id: '2HHB', path: 'hemoglobin/data/2HHB.pdb' },
      chains: 'B',
      pocket: { prox: 92, dist: 63 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 4,
        residues: 146,
        declared: 146,
        ec: null,
        baked: "mb-2HHB-B.json" } },
  ];

  const RNASE_VARIANTS = [
    { id: '1FS3', default: true,
      purpose: 'the fold by itself',
      species: 'bovine',
      section: 'the fold', label: 'crystal', chip: '1 chain',
      source: { kind: 'rcsb', id: '1FS3' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 124,
        declared: 124,
        ec: "3.1.27.5",
        baked: "rnase-1FS3.json" } },
    { id: '2AAS',
      purpose: 'the same fold in solution',
      species: 'bovine',
      section: 'the fold', label: 'solution, NMR', chip: '1 chain',
      source: { kind: 'rcsb', id: '2AAS' },
      model: 1,
      read: {
        method: "solution nmr",
        chainsInFile: 1,
        residues: 124,
        declared: 124,
        ec: "3.1.27.5",
        baked: "rnase-2AAS.json" } },
    { id: '1RUV',
      purpose: 'the transition state, held still',
      species: 'bovine',
      section: 'working', label: 'transition state', chip: '1 chain',
      source: { kind: 'rcsb', id: '1RUV' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 124,
        declared: 124,
        ec: "3.1.27.5",
        baked: "rnase-1RUV.json" } },
    { id: '1RNU',
      kind: 'cut',
      purpose: 'cut in two and still working',
      species: 'bovine',
      section: 'taken apart', label: 'cut in two · RNase S', chip: '1 chain',
      source: { kind: 'rcsb', id: '1RNU' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 116,
        declared: 124,
        ec: "3.1.27.5",
        baked: "rnase-1RNU.json" } },
    { id: '1A2W',
      kind: 'swap',
      purpose: 'the C-terminal half traded',
      species: 'bovine', state: 'swap',
      section: 'taken apart', label: 'C-terminal swap', chip: '2 chains',
      source: { kind: 'rcsb', id: '1A2W' },
      chains: 'A,B',
      read: {
        method: "x-ray diffraction",
        chainsInFile: 2,
        residues: 248,
        declared: 248,
        ec: "3.1.27.5",
        baked: "rnase-1A2W.json" } },
    { id: '1F0V',
      kind: 'swap',
      purpose: 'the N-terminal half traded',
      species: 'bovine', state: 'swap',
      section: 'taken apart', label: 'N-terminal swap', chip: '2 chains',
      source: { kind: 'rcsb', id: '1F0V' },
      chains: 'A,B',
      read: {
        method: "x-ray diffraction",
        chainsInFile: 8,
        residues: 248,
        declared: 248,
        ec: "3.1.27.5",
        baked: "rnase-1F0V.json" } },
    { id: '1DFJ',
      kind: 'bound',
      purpose: 'caught by the protein that keeps it off our RNA',
      species: 'bovine enzyme, porcine inhibitor',
      section: 'working', label: 'held by its inhibitor', chip: '2 chains',
      source: { kind: 'rcsb', id: '1DFJ' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 2,
        residues: 580,
        declared: 581,
        ec: "3.1.27.5",
        baked: "rnase-1DFJ.json" } },
  ];


  /* COLLAGEN'S SIX, AND MOST OF THEM ARE NOT PIECES OF EACH OTHER. Three are
     designed peptides that occur in no gene, one is a construct built around a
     real site, one is a complex with a chaperone, and one is a whole molecule.
     `proteins/collagen/collagen-test.html`'s lower-left readout is where that
     is said to a reader; here it is why the list looks heterogeneous.

     HUMAN ONLY. The bench carried 1BKV — the T3-785 peptide, a real type III
     sequence with a proline-free guest — through review and it was not
     selected. It was the only NATURAL short sequence here, which sounds like a
     reason to keep it, and the measurement is what sank it: the wide extents
     that were supposed to show its imino-poor middle splaying turned out to be
     one frayed chain terminus, and with the ends trimmed it says nothing 1CAG
     does not say better. It is also type III, so the type I ruler cannot even
     place it. If a lesson ever wants "collagen is not a uniform rope", it
     wants that claim measured first, not this entry back. */
  const COLLAGEN_VARIANTS = [
    { id: 'ppg10', default: true,
      /* THE DEFAULT IS A SECTION, NOT THE MOLECULE, and every reader of this
         file should know it before they trust the card. A collagen molecule is
         3016 Å of three chains; this is 86 Å of designed repeat, about a
         thirty-fifth of one, and it is the default because it is the clearest
         picture of what the repeat DOES — not because it is representative of
         the size. `molecule` is the whole thing and looks like a hair.

         It is also the unhydroxylated half of the one controlled pair here,
         and the state prolyl 4-hydroxylase actually acts on. */
      purpose: 'the triple helix by itself, at 1.3 Å — a section, not the molecule',
      species: 'synthetic',
      source: { kind: 'rcsb', id: '1K6F' },
      chains: 'A,B,C',
      helix: 'A,B,C',
      pocket: { hydroxyl: true },
      strands: { A: 'chain 1', B: 'chain 2', C: 'chain 3' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 6,
        residues: 87,
        declared: 90,
        ec: null,
        baked: "col-ppg10.json" } },

    { id: 'pog9',
      purpose: 'the same helix with the hydroxyls on — the matched control',
      species: 'synthetic',
      source: { kind: 'rcsb', id: '3B0S' },
      /* Chains A-C, not D-F: the file holds two triple helices and chain E
         models seventeen hydroxyls where every other chain models nine. */
      chains: 'A,B,C',
      helix: 'A,B,C',
      pocket: { hydroxyl: true },
      strands: { A: 'chain 1', B: 'chain 2', C: 'chain 3' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 6,
        residues: 81,
        declared: 81,
        ec: null,
        baked: "col-pog9.json" } },

    { id: 'oi',
      purpose: 'one glycine replaced by alanine — the brittle-bone substitution',
      species: 'synthetic', state: 'mutant',
      /* No `healthy` counterpart is marked here, and that is not an omission:
         1CAG's own control is the (POG) host it was built in, which this list
         does not hold separately. ppg10 and pog9 are a comparison about
         hydroxyls, and labelling either one healthy would answer a question
         nobody asked of them. */
      source: { kind: 'rcsb', id: '1CAG' },
      chains: 'A,B,C',
      helix: 'A,B,C',
      pocket: { hydroxyl: true },
      strands: { A: 'chain 1', B: 'chain 2', C: 'chain 3' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 3,
        residues: 88,
        declared: 90,
        ec: null,
        baked: "col-oi.json" } },

    { id: 'grip',
      purpose: 'the GFOGER site with the integrin holding it',
      species: 'human peptide, human integrin',
      source: { kind: 'rcsb', id: '1DZI' },
      chains: 'A,B,C,D',
      /* The frame is solved on the COLLAGEN, not on everything drawn: the
         I-domain's own longest axis is longer, and a frame over all four
         chains stands the helix at an angle to the screen. */
      helix: 'B,C,D',
      pocket: { metal: 'CO' },
      strands: { A: 'integrin α2 I', B: 'chain 1', C: 'chain 2', D: 'chain 3' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 4,
        residues: 248,
        declared: 251,
        ec: null,
        baked: "col-grip.json" } },

    { id: 'chaperone',
      purpose: 'Hsp47 holding a finished helix — collagen before it leaves the cell',
      species: 'human',
      source: { kind: 'rcsb', id: '4AU3' },
      /* Two Hsp47 on one triple helix; the file holds a second copy of the
         same assembly on C, D and H-J. Which two touch this helix was counted
         off the Cα distances, not guessed. */
      chains: 'A,B,E,F,G',
      helix: 'E,F,G',
      strands: { A: 'Hsp47', B: 'Hsp47', E: 'chain 1', F: 'chain 2', G: 'chain 3' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 10,
        residues: 777,
        declared: 844,
        ec: null,
        baked: "col-chaperone.json" } },

    { id: 'molecule',
      purpose: 'one whole type I molecule, 3016 Å, as it sits in a fibril',
      species: 'rat tail tendon',
      source: { kind: 'rcsb', id: '3HR2' },
      /* A and C are α1(I), B is α2(I) — two of one gene product and one of
         another, which is what the colour says. It is also THE RULER: every
         other variant's position on the molecule is a sequence match against
         this entry, and its own numbering starts at the telopeptide, sixteen
         residues before helix residue 1. */
      chains: 'A,B,C',
      helix: 'A,B,C',
      strands: { A: 'α1(I)', B: 'α2(I)', C: 'α1(I)' },
      read: {
        method: "fiber diffraction",
        chainsInFile: 3,
        residues: 3134,
        declared: 3140,
        ec: null,
        baked: "col-molecule.json" } },
  ];

/* ---------------------------------------------------------------- ATP synthase
   *
   *  THREE VIEWS AND TWO STRUCTURES THAT ARE NOT HERE. `state2` and `state3`
   *  are read by the baker to measure the rotation and then dropped without a
   *  file, so they are not variants: this file lists what the repo HOLDS, and
   *  it holds neither. What survives them is the `spin` block on the human bake
   *  and the figures its console prints.
   *
   *  ROLES ARE PART OF WHAT A STRUCTURE IS, which is why the chain table lives
   *  here rather than on the bench. Which subunit chain N is, and whether it
   *  turns, is a fact about the deposition; what colour a role is drawn is the
   *  protein's, in `draw`; what the bench SAYS about a role is page copy. The
   *  second half of each pair is the subunit NAME, and it is what says which
   *  chains are copies of one another — eight c-subunits can stand in for each
   *  other and gamma cannot, which is the difference that makes the rotary
   *  comparison possible at all.
   */
  const ATP_VARIANTS = [
    /* THE EMPTY SITE, and the reference the other one is fitted onto — the
       state beta-DP is a change from. Bovine, because the crisp catalytic
       states are Walker's crystal and no cryo-EM map of the human enzyme has
       an empty site beside a full one in the same particle. */
    { id: 'open',
      purpose: 'the catalytic site with nothing in it',
      species: 'bovine', chains: 'E',
      source: { kind: 'rcsb', id: '1BMF' },
      roles: { 'E': ['head', 'β'] },
      site: { grip: [156, 163], side: [188, 189, 345] },
      group: 'sites', reference: true,
      read: {
        method: "x-ray diffraction",
        chainsInFile: 7,
        residues: 466,
        declared: 482,
        ec: "3.6.1.34",
        baked: "atp-open.json" } },
    { id: 'dp',
      purpose: 'the same site holding the product it has not released',
      species: 'bovine', chains: 'D',
      source: { kind: 'rcsb', id: '1BMF' },
      roles: { 'D': ['head', 'β'] },
      site: { grip: [156, 163], side: [188, 189, 345] },
      group: 'sites',
      read: {
        method: "x-ray diffraction",
        chainsInFile: 7,
        residues: 467,
        declared: 482,
        ec: "3.6.1.34",
        baked: "atp-dp.json" } },
    /* THE WHOLE MACHINE, and the only view that can carry the rotation.
       Published as mmCIF and not as PDB — 28 chains and 39,000 atoms is past
       what the legacy format holds — which is what proteins/cif-lib.js exists
       for, and why `source` has to say the format so a link does not 404. */
    /* THE DEFAULT, and it is a decision rather than a position: the whole
       machine is the subject, and the two site views only mean anything once
       a reader knows where they were cut from. */
    { id: 'human', default: true,
      purpose: 'the whole enzyme, and the rotor that turns in it',
      species: 'human', chains: '1,2,3,4,5,6,7,8,G,H,I,A,B,C,D,E,F,K,L,M,O,N,Q,P,R,S,T,J',
      source: { kind: 'rcsb', id: '8H9S', format: 'cif' },
      roles: {
              '1': ['rotor', 'c'], '2': ['rotor', 'c'], '3': ['rotor', 'c'],
              '4': ['rotor', 'c'], '5': ['rotor', 'c'], '6': ['rotor', 'c'],
              '7': ['rotor', 'c'], '8': ['rotor', 'c'], 'G': ['rotor', 'γ'],
              'H': ['rotor', 'δ'], 'I': ['rotor', 'ε'], 'A': ['head', 'α'],
              'B': ['head', 'α'], 'C': ['head', 'α'], 'D': ['head', 'β'],
              'E': ['head', 'β'], 'F': ['head', 'β'], 'K': ['stalk', 'b'],
              'L': ['stalk', 'F6'], 'M': ['stalk', 'd'],
              'O': ['stalk', 'OSCP'], 'N': ['membrane', 'a'],
              'Q': ['membrane', 'ATP8'], 'P': ['membrane', 'ATP5MJ'],
              'R': ['membrane', 'f'], 'S': ['membrane', 'g'],
              'T': ['membrane', 'e'], 'J': ['brake', 'IF1'] },
      /* The rotation axis is solved between these two groups of chains: the
         c-ring to the head IS the axis, and the membrane normal with it, so it
         needs no convention laid on top of it. */
      axis: { from: '1,2,3,4,5,6,7,8', to: 'A,B,C,D,E,F' },
      /* The nucleotides the file holds, and only those: ADP in two β, ATP in
         the three α, β-E empty. The cardiolipin and 3PH are lipid, not site. */
      site: { take: ['ADP', 'ATP', 'MG'] },
      group: 'states', reference: true,
      read: {
        method: "electron microscopy",
        chainsInFile: 28,
        residues: 5064,
        declared: 5415,
        ec: null,
        baked: "atp-human.json" } },
  ];


  /* INSULIN'S FIVE. The set is one hormone told three ways — what it is, what
     it was cut out of, and how it is put away — plus the pig entry, which is
     history rather than structure and is kept for that.

     WHAT WAS LOOKED AT AND NOT SELECTED: 1TRZ, the T3R3 hexamer. It carries
     the largest motion of anything considered here — with the second monomer's
     core superposed to 1.05 A, its B-chain N-terminus swings 25.6 A at B1 and
     is back to 1.7 A by B7 — but the R conformation needs a phenol bound, and
     phenol is a preservative in a vial rather than anything a pancreas
     supplies. Ninety-six of its 102 residues are unchanged from 1MSO, so on a
     ribbon it read as a second copy of the dimer. It is the entry to come back
     for if a lesson ever wants the DRUG rather than the hormone.

     THE HEXAMER IS NOT A SECOND DEPOSITION. It is 1MSO's assembly 1, which
     that file publishes as three MODELs of its asymmetric unit; the baker
     merges them chain-aware and renames the copies A-L. `assembly` is what
     says so, and `header` is where the provenance is read from, because the
     assembly file has no EXPDTA, no REMARK 2 and an entry id of XXXX. */
  const INSULIN_VARIANTS = [
    { id: '3I40', default: true,
      purpose: 'the hormone itself, as the single A + B unit',
      species: 'human',
      section: 'the hormone', label: 'monomer', chip: 'human',
      source: { kind: 'rcsb', id: '3I40' },
      chains: 'A,B',
      read: {
        method: "x-ray diffraction",
        chainsInFile: 2,
        residues: 51,
        declared: 51,
        ec: null,
        baked: "insulin-3I40.json" } },
    { id: '1MSO',
      purpose: 'two of them, and the only \u03b2 sheet insulin has',
      species: 'human',
      section: 'the hormone', label: 'two of them', chip: '1.0 \u00c5',
      source: { kind: 'rcsb', id: '1MSO' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 4,
        residues: 102,
        declared: 102,
        ec: null,
        baked: "insulin-1MSO.json" } },
    { id: '2KQP',
      purpose: 'before the cut: one chain, C-peptide still in it',
      species: 'human',
      section: 'before the cut', label: 'proinsulin', chip: 'NMR',
      source: { kind: 'rcsb', id: '2KQP' },
      /* 20 models, and model 1 is baked like every other NMR entry here. */
      model: true,
      /* The correspondence the fit runs on, and the cut it describes: B1-30
         are residues 1-30 of the precursor and A1-21 are 66-86, so everything
         between is C-peptide. Here rather than in the baker because it is a
         fact about what this entry IS, and the baker measures the rest. */
      proinsulin: { B: 0, A: 65 },
      read: {
        method: "solution nmr",
        chainsInFile: 1,
        residues: 86,
        declared: 86,
        ec: null,
        baked: "insulin-2KQP.json" } },
    { id: 'hexamer', of: '1MSO',
      purpose: 'how the body stores it: six copies around two zincs',
      species: 'human',
      section: 'stored', label: 'hexamer', chip: '2 Zn',
      source: { kind: 'rcsb', id: '1MSO' },
      /* assembly 1, not the asymmetric unit; provenance off the deposition. */
      file: '1MSO.pdb1', header: '1MSO.pdb', assembly: true,
      /* The zinc site the box draws inside the ribbon: two ions on the
         three-fold axis, each held by three His B10. Which residue makes the
         site is this file's to say, the same way myoglobin's pocket is. */
      zinc: { residue: 10, chainRole: 'B' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 12,
        residues: 306,
        declared: 306,
        ec: null,
        baked: "insulin-hexamer.json" } },
    { id: '4INS',
      purpose: 'pig \u2014 what diabetics were injected with for sixty years',
      species: 'pig',
      section: 'another species', label: 'pig', chip: '2 Zn',
      source: { kind: 'rcsb', id: '4INS' },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 4,
        residues: 102,
        declared: 102,
        ec: null,
        baked: "insulin-4INS.json" } },
  ];

  /* THREE VIEWS OF ONE ENTRY, AT TWO SCALES. 1FHA's asymmetric unit is a
     single 183-residue chain; the cage is assembly 1, the same chain 24 times,
     deposited as 24 MODELS. Which FILE a variant reads is therefore part of
     what it is, so it is recorded here — `assembly: true` is what stops
     `Bake.modelOne` baking a twenty-fourth of an iron ball that renders as a
     perfectly good four-helix bundle.

     `subunit` AND `site` ARE THE SAME COORDINATES. What separates them is
     whether the iron is drawn, which is a decision about what the view is
     ABOUT rather than about which structure it is: the bundle alone is the
     repeating part, and the bundle with its metal is what that part DOES.
     Review kept both.

     NOT SUPERPOSED, and there is nothing to superpose: a subunit and the ball
     it is one twenty-fourth of are two scales of one object, not two states.
     The cage sits in the deposited frame — its three extents are 119 A each,
     so a solved basis would flip between re-bakes — and the two subunit views
     wear the basis their own shape solved. */
  /* GFP's two, chosen off proteins/gfp/gfp-test.html. THREE CAME OFF THAT
     BENCH and the reasons are worth one line each, because each is an entry
     somebody will propose again. 1EMA is the S65T mutant every fusion tag
     descends from, and it went because the bench is about the fold and the
     dye rather than about the engineering; dropping it dropped the S65T
     comparison, so the phenol-to-Thr203 distance here is wild type's 4.7 A
     with nothing reading 2.7 against it. 2WUR is 0.90 A, the sharpest GFP
     there is, and it is a folding variant (F64L, I167T, K238N) whose
     CHROMOPHORE happens to be wild type — it was filed on the bench as "wild
     type" on that strength, which is why the baker reads SEQADV. And 1GFL's
     second chain went because REMARK 350 calls the biological unit MONOMERIC:
     two copies in an asymmetric unit are not a dimer, whatever the contact
     between them sits on.

     NEITHER IS STRICTLY WILD TYPE. Both carry Q80R, which rode in on the
     original cDNA and is in every GFP entry in the PDB. */
  const GFP_VARIANTS = [
    { id: '1GFL', default: true,
      purpose: 'the jellyfish protein: a barrel with a dye built into the helix '
             + 'down its axis',
      species: 'Aequorea victoria',
      section: 'green', label: 'one subunit', chip: '1.90 \u00c5',
      source: { kind: 'rcsb', id: '1GFL' },
      chains: 'A',
      /* The chromophore plus the five side chains that hold and tune it. Arg96
         and Glu222 drive the cyclisation and sit under the imidazolinone;
         His148, Thr203 and Ser205 are the phenol end. Numbering is the same in
         both entries, which is what lets one list serve both. */
      pocket: { res: [96, 148, 203, 205, 222] },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 2,
        residues: 230,
        declared: 238,
        ec: null,
        baked: "gfp-1GFL.json" } },
    { id: '1BFP',
      purpose: 'blue: one chromophore residue swapped, Y66H',
      species: 'Aequorea victoria',
      section: 'other colours', label: 'Y66H, blue', chip: 'BFP',
      source: { kind: 'rcsb', id: '1BFP' },
      chains: 'A',
      pocket: { res: [96, 148, 203, 205, 222] },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 229,
        declared: 238,
        ec: null,
        baked: "gfp-1BFP.json" } },
  ];

  const FERRITIN_VARIANTS = [
    { id: 'cage', default: true,
      purpose: 'the ball: 24 subunits closed into a hollow shell',
      species: 'human',
      section: '1FHA', label: 'the cage', chip: '24 chains',
      source: { kind: 'rcsb', id: '1FHA' },
      assembly: true,
      pocket: 'irons',
      read: {
        method: "x-ray diffraction",
        chainsInFile: 24,
        residues: 4128,
        declared: 4392,
        ec: null,
        baked: "ferritin-cage.json" } },
    { id: 'subunit',
      purpose: 'the part, alone: one four-helix bundle',
      species: 'human',
      section: '1FHA', label: 'subunit', chip: '1 chain',
      source: { kind: 'rcsb', id: '1FHA' },
      chains: 'A',
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 172,
        declared: 183,
        ec: null,
        baked: "ferritin-subunit.json" } },
    /* THE SITE TAKES TWO IRONS AND 1FHA MODELS ONE. Glu61 and Tyr34 are kept
       in the pocket holding nothing, because a picture with only the liganded
       half of a di-iron centre in it would read as the whole site. The metal's
       three bonds come off the file's own CONECT records. */
    { id: 'site',
      purpose: 'where iron is oxidised on its way in',
      species: 'human',
      section: '1FHA', label: 'ferroxidase site', chip: 'Fe',
      source: { kind: 'rcsb', id: '1FHA' },
      chains: 'A',
      pocket: { metal: 'FE', res: [27, 34, 61, 62, 65] },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 172,
        declared: 183,
        ec: null,
        baked: "ferritin-site.json" } },
  ];

  /* RUBISCO'S THREE, chosen off proteins/rubisco/rubisco-test.html. The two
     site views are the same spinach enzyme before and after it is switched on,
     and the switch is one residue: CO2 adds onto Lys201 as a carbamate and
     Mg2+ clamps onto that carbamate. 8RUC deposits it as KCX and declares it
     in MODRES; 1RCX has a plain lysine there and no magnesium in the file, so
     the difference between the two entries is a residue name a checker can
     read.

     KCX IS A HETATM, which is why the baker passes `Bake.modResidues` to the
     trace. Without it the activated chain bakes with a hole exactly where the
     subject is, and the ribbon splines smoothly over it.

     THE CO2 THAT ACTIVATES IS NOT THE CO2 THAT GETS FIXED. They arrive at the
     same site and they are different molecules, which no single structure can
     show — a lesson has to say it, and neither of these files can.

     1RCX's ASYMMETRIC UNIT IS ALREADY THE BIOLOGICAL ASSEMBLY: sixteen chains,
     identity BIOMT, no symmetry expansion. 8RUC deposits half of one and needs
     a two-fold to complete it, which is why the whole particle is 1RCX's. */
  /* TWO ENTRIES AND A THIRD THAT IS NOT ONE. The pair is apo against holo,
     and it is a CONTROLLED pair rather than merely a matched one: 1LZ1 and
     1LZS are the same species at the same numbering, and their HELIX and
     SHEET records agree residue for residue, so the ribbon is identical
     between them and the sugar is the only thing that changes.

     1REX is deliberately absent. It is a second crystal of the same empty
     protein by another group, and the baker fits it to measure what two
     crystals of one molecule differ by — 0.12 A, no residue past 1 A — which
     is the scale the 0.49 A between apo and holo is read on. That is a
     MEASUREMENT INPUT and not a selection: it has no bake of its own because
     nothing loads one, so it stays in the baker under `BASELINE` rather than
     here, where every entry is something a reader can open.

     Two amyloid variants were baked through review and dropped, and the
     reason is in the bench's header: I56T is invisible at 0.23 A and D67H
     throws two loops 9.7 A out, yet both cause the same illness the same way,
     so the pair drawn together would say the visible one is the worse one. */
  const LYSOZYME_VARIANTS = [
    { id: '1LZ1', default: true,
      purpose: 'the cleft, empty',
      species: 'human',
      section: 'the enzyme', label: 'empty cleft', chip: 'apo',
      source: { kind: 'rcsb', id: '1LZ1' },
      chains: 'A',
      /* The catalytic pair by number, which is the SPECIES' and not a
         constant — hen puts the aspartate at 52. The baker asserts that what
         it finds at these numbers is a glutamate and an aspartate, because a
         number off by one draws the neighbouring threonine and looks fine. */
      pocket: { acid: 35, base: 53 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 1,
        residues: 130,
        declared: 130,
        ec: "3.2.1.17",
        baked: "lz-1LZ1.json" } },
    { id: '1LZS',
      purpose: 'the same cleft with its substrate lying in it',
      species: 'human',
      section: 'the enzyme', label: 'sugar in the cleft', chip: 'holo',
      source: { kind: 'rcsb', id: '1LZS' },
      chains: 'A',
      /* Chain C of five: the deposition holds two protein chains and three
         separate saccharides, and this is the one in chain A's groove. */
      sugar: 'C',
      pocket: { acid: 35, base: 53 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 2,
        residues: 130,
        declared: 130,
        ec: "3.2.1.17",
        baked: "lz-1LZS.json" } },
  ];

  const RUBISCO_VARIANTS = [
    { id: '1RCX-L8S8', default: true,
      purpose: 'the whole enzyme: eight large subunits, eight small, one particle',
      species: 'spinach',
      section: 'the whole enzyme', label: 'L\u2088S\u2088 hexadecamer', chip: '16 chains',
      source: { kind: 'rcsb', id: '1RCX' },
      chains: 'L,S,B,C,E,F,H,I,K,M,O,P,R,T,V,W',
      subject: 'L,B,E,H,K,O,R,V',
      frame: 'particle',
      /* LARGE AGAINST SMALL, and it is the only thing this protein colours by:
         sixteen chains under the ss palette is one rope with no way to see
         which half carries the sites. The second name in each pair is the gene
         product, so the legend can say what a chain IS rather than which
         letter it wears. */
      roles: {
        'L': ['large', 'rbcL'], 'B': ['large', 'rbcL'], 'E': ['large', 'rbcL'],
        'H': ['large', 'rbcL'], 'K': ['large', 'rbcL'], 'O': ['large', 'rbcL'],
        'R': ['large', 'rbcL'], 'V': ['large', 'rbcL'],
        'S': ['small', 'rbcS'], 'C': ['small', 'rbcS'], 'F': ['small', 'rbcS'],
        'I': ['small', 'rbcS'], 'M': ['small', 'rbcS'], 'P': ['small', 'rbcS'],
        'T': ['small', 'rbcS'], 'W': ['small', 'rbcS'],
      },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 16,
        residues: 4720,
        declared: 4784,
        ec: "4.1.1.39",
        baked: "rubisco-1RCX-L8S8.json" } },
    { id: '1RCX-site',
      purpose: 'switched off, with the substrate already in the site',
      species: 'spinach',
      section: 'the switch', label: 'switched off', chip: '2.40 \u00c5',
      source: { kind: 'rcsb', id: '1RCX' },
      chains: 'L,S',
      subject: 'L',
      frame: 'site',
      /* WHICH RESIDUES MAKE THE SITE, per variant because the numbering is the
         protein's and the atoms are not: 201 is the switch, 203 and 204 are the
         two carboxylates that hold the metal with it. Lys175 and Lys334 are
         catalytic and deliberately out — on this view they are not the point,
         and a second subject is a second view. */
      site: { switch: 201, grip: [203, 204] },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 16,
        residues: 590,
        declared: 598,
        ec: "4.1.1.39",
        baked: "rubisco-1RCX-site.json" } },
    { id: '8RUC-site',
      purpose: 'switched on: CO\u2082 on the lysine, magnesium on that',
      species: 'spinach',
      section: 'the switch', label: 'switched on', chip: 'Mg\u00b2\u207a',
      source: { kind: 'rcsb', id: '8RUC' },
      chains: 'A,I',
      subject: 'A',
      frame: 'site',
      site: { switch: 201, grip: [203, 204] },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 8,
        residues: 590,
        declared: 598,
        ec: "4.1.1.39",
        baked: "rubisco-8RUC-site.json" } },
  ];

  /* Antibody's three, chosen off proteins/antibody/antibody-test.html.
     ONE MORE VIEW IS DRAWN AND IS NOT HERE: the mouse and human Fc regions
     superposed, which is a measurement over two entries already in this list
     rather than a structure anyone deposited. It has no id to link to, so it
     lives in the baker as PAIRED and its bake is named in `keeps`.

     1REI WENT AT REVIEW, and the reason is a measurement. It is a Bence-Jones
     dimer at 2.0 A, the sharpest file looked at, and it was on the bench as
     the immunoglobulin fold with nothing else attached. Fitted against 3HFM's
     real pair, its chain A is a light variable domain (55% identical, 0.57 A)
     and its chain B is a light variable domain standing in for a HEAVY one:
     33% identical, 3.45 A. 3HFM already carries a genuine pair with the
     antigen in it, so the one thing 1REI added is the one thing it does
     wrong. */
  const ANTIBODY_VARIANTS = [
    { id: '1IGT', default: true,
      /* THE DEFAULT IS THE PICTURE, and it is the mouse entry over the human
         one on a measurement rather than on completeness. Both model
         essentially everything; what separates them is that 1IGT's two arms
         sit 80 and 72 A from the Fc centre and 1HZH's sit 87 and 59, so one
         of b12's arms is tucked 28 A closer than the other. The first thing a
         reader should meet is an antibody shaped like the one they have been
         told about. */
      purpose: 'the whole Y, every residue of every chain modelled',
      species: 'mouse',
      source: { kind: 'rcsb', id: '1IGT' },
      chains: 'A,B,C,D',
      subject: 'A,B,C,D',
      glycan: 'E,F',
      /* Asserted by the baker against what SSBOND says, per role. If a chain
         this calls heavy stops counting four domains, the fold count the page
         prints is wrong and nothing about the render would say so. */
      expect: { heavy: 4, light: 2 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 4,
        residues: 1316,
        declared: 1316,
        ec: null,
        baked: "ab-1IGT.json" } },

    { id: '1HZH',
      purpose: 'a human antibody, b12, and an asymmetric one',
      species: 'human',
      source: { kind: 'rcsb', id: '1HZH' },
      chains: 'H,K,L,M',
      subject: 'H,K,L,M',
      glycan: 'A,B',
      expect: { heavy: 4, light: 2 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 4,
        residues: 1331,
        declared: 1344,
        ec: null,
        baked: "ab-1HZH.json" } },

    /* A Fab is a WHOLE light chain and the first half of a heavy one, so the
       heavy expects 2 domains rather than 4 — the arm is cut off the antibody
       at the hinge. `other` is the lysozyme, and it expects ZERO Ig domains,
       which is the assertion that the 55-80 residue span filter is doing its
       job: hen lysozyme carries four intrachain disulfides of its own, and
       without the filter it would be reported as a four-domain
       immunoglobulin.

       ITS EC IS THE ANTIGEN'S. 3HFM's COMPND says EC 3.2.1.17, which is
       lysozyme's, and read.ec here is null because the baker reads the EC per
       MOL_ID and keeps only the subject's. Left alone it would put a
       hydrolase's number under a protein whose `does` is `recognition`, which
       registry-io fails — correctly, and for the wrong reason. */
    { id: '3HFM',
      purpose: 'one arm holding its antigen \u2014 the recognition event itself',
      species: 'mouse',
      source: { kind: 'rcsb', id: '3HFM' },
      chains: 'L,H,Y',
      subject: 'L,H',
      partner: 'Y',
      expect: { heavy: 2, light: 2, other: 0 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 3,
        residues: 558,
        declared: 558,
        ec: null,
        baked: "ab-3HFM.json" } },
  ];

  /* Not 3CYT, the old default: tuna, and its two redox chains differ by
     under an angstrom. 3ZCF leaves Cys17's thioether out of CONECT; the
     baker draws it by name and the bench flags it. 5TY3 and 3NWV record it
     but are K72A and G41S mutants, and Lys72 is a docking lysine. */
  const CYTC_VARIANTS = [
    { id: '3ZCF', default: true,
      purpose: 'the carrier and its heme, human',
      species: 'human',
      source: { kind: 'rcsb', id: '3ZCF' },
      chains: 'A',
      pocket: { cys: [14, 17], his: 18, met: 80 },
      read: {
        method: "x-ray diffraction",
        chainsInFile: 4,
        residues: 104,
        declared: 104,
        ec: null,
        baked: "cytc-3ZCF.json" } },
  ];

  const PROTEINS = [
    {
      key: 'atp-synthase', name: 'ATP synthase', dir: 'proteins/atp-synthase',
      story: 'proteins/atp-synthase/atp-synthase-story.html',
      blurb: 'The enzyme that makes ATP, built into the inner membrane of the '
           + 'mitochondrion. Protons falling across the membrane spin its rotor '
           + 'about a hundred times a second, and each turn assembles ATP from '
           + 'ADP and phosphate.',
      does: 'enzyme',
      pipeline: 'trace',
      /* NO PROTEIN-WIDE FIT, because this collection is two kinds of thing.
         The two beta subunits ARE states of one site and are superposed on
         each other — the residual is in their bakes, and the bench prints it —
         but the human assembly is a different organism and a different
         experiment, and there is nothing for it to be a state OF. A single
         `fit.on` would have to claim the assembly was fitted onto a bovine
         subunit, which is why this is null and not a reference. */
      fit: null,
      fitWhy: 'the two beta subunits are superposed on each other, on the '
            + 'P-loop, and each bake carries that residual; the human enzyme '
            + 'is a different organism and is a state of nothing here',
      view: { by: 'measured', shared: false,
              why: 'the assembly is drawn on its rotation axis, which is the '
                 + 'c-ring to the head and is the membrane normal with it; a '
                 + 'single beta subunit is round enough that a solved basis '
                 + 'would flip between rebakes, so those two open in the '
                 + 'reference\'s deposited frame until a human picks one' },
      surface: { bake: false,
                 why: 'a mechanism claim, not a surface one: what this protein '
                    + 'is about is which part turns against which, and a skin '
                    + 'over the whole assembly hides the rotor inside it' },
      /* WHAT A ROLE IS DRAWN, read by the bench and by the gallery card, so
         the two cannot become two opinions about one molecule. Not the ss
         palette: a reader looking at ATP synthase has to tell the rotor from
         the stator, which is not a question about what anything is folded
         into. The house rust is deliberately absent — protein-test.css spends
         it on the panel's own controls and says it belongs on no molecule. */
      draw: { byRole: {
        head:     0x1f5f4f,   // deep green, the house accent
        rotor:    0x2b8cd8,   // azure: everything that turns
        stalk:    0xbfa478,   // light tan: the girder holding the head still
        membrane: 0x8d6e4a,   // deeper tan: what sits in the bilayer
        brake:    0x8e5fa8,   // violet: IF1, the one chain that is not the enzyme
      },
        /* What everything that is not the subject fades to on a detail view.
           Warm rather than neutral, because the stage is cream and a true grey
           reads as a hole in it. */
        fade: 0xcbc7be },
      variants: ATP_VARIANTS,
    },
    {
      key: 'napump', name: 'Na⁺/K⁺-ATPase', dir: 'proteins/napump',
      blurb: 'The sodium-potassium pump, in the membrane of every animal cell. '
           + 'It spends one ATP to push three sodium ions out and pull two '
           + 'potassium ions in, which is what keeps a cell electrically charged '
           + 'and costs about a fifth of the energy you use at rest.',
      does: 'enzyme',
      pipeline: 'trace',
      /* NOT SUPERPOSED, AND IT MUST NOT BE. Both are baked from their OPM
         copies, which are already in one frame — the bilayer normal upright,
         the membrane centred on zero — so a fit would move them out of the
         membrane and into each other, which is the one comparison this pair
         is not about. Flipping between them works because they share the
         MEMBRANE's frame rather than a fitted one. */
      fit: null,
      fitWhy: 'both are already in the membrane frame OPM solved; fitting one '
            + 'onto the other would trade that for an arbitrary one',
      view: { by: 'measured', shared: false,
              why: 'the field draws a membrane protein on its bilayer normal, '
                 + 'and OPM republishes the coordinates already in it — the '
                 + 'frame is the file, not a basis this repo solved' },
      surface: { bake: false,
                 why: 'a claim about a CYCLE, not a surface: what changes '
                    + 'between the two is which side the site opens to, and a '
                    + 'skin hides the site along with the change' },
      variants: [
        { id: 'E1', default: true,
          purpose: 'three sodiums bound, the door open to the inside',
          species: 'pig',
          source: { kind: 'rcsb', id: '7E1Z' },
          read: {
            method: "electron microscopy",
            chainsInFile: 3,
            residues: 1302,
            declared: 1392,
            ec: "7.2.2.13",
            baked: "pump-E1.json" } },
        { id: 'E2',
          purpose: 'two potassiums bound, the door open to the outside',
          species: 'pig',
          source: { kind: 'rcsb', id: '7E20' },
          read: {
            method: "electron microscopy",
            chainsInFile: 3,
            residues: 1321,
            declared: 1392,
            ec: "7.2.2.13",
            baked: "pump-E2.json" } },
      ],
    },
    {
      key: 'prion', name: 'Prion protein', dir: 'proteins/prion',
      story: 'proteins/prion/prion-story.html',
      blurb: 'The prion protein, carried on the surface of nerve cells, whose '
           + 'normal job is still unknown. One sequence folds two ways, and the '
           + 'misfolded form stacks into fibres that template their own shape '
           + 'onto healthy copies.',
      /* NOT A HEDGE. PrP-C's normal job is genuinely unsettled — copper
         binding, signalling, myelin maintenance are all proposed and none
         settled — and a collection that guessed would be teaching one of
         them. What it does when it misfolds is the whole lesson, and that is
         not a function. */
      does: 'unknown',
      pipeline: 'trace',
      /* What else lives in data/ and is not a variant. Prion COMMITS its
         sources (they are small once cut to model 1) and its baker writes
         two intermediates the views are sliced out of. Listing them is what
         lets check-proteins.js flag a file that is in data/ for no reason —
         a stale bake from a renamed view, which a bench goes on loading. */
      /* The sources and what the baker cuts out of them. They stay as PDB
         because prion.js's morph and CCD need whole residues and
         check-prion.js reads two of them for its geometry assertions — only
         the three VIEWS became traces, when the unfold animation they were
         shaped for was dropped. */
      /* 1QLZ.pdb, the 2.7 MB twenty-model deposition, is not committed — the
         baker's header carries its URL and 1QLZ-model1.pdb is what the bench
         reads. The ensemble view was measured off it and never shown; prep.js
         says why. Re-download before re-running either. */
      keeps: ['1QLZ-model1.pdb', '6LNI.pdb',
              'prp-native.pdb', 'prp-fibril.pdb', 'prp-stack.pdb',
              'prp-view-1QLZ.pdb', 'prp-view-6LNI.pdb', 'prp-view-stack.pdb'],
      /* Not superposed, and it must not be: the ensemble view IS the spread of
         twenty models, and the stack is ten chains whose relative positions
         are the subject. Fitting either would delete what it shows. */
      fit: null,
      fitWhy: 'the ensemble and the stack are about relative position; a fit '
            + 'would delete what they show',
      view: { by: 'measured', shared: false,
              why: 'a fibril has a convention — its axis vertical — and the '
                 + 'baker solves that axis off consecutive rungs' },
      surface: { bake: false,
                 why: 'a fold claim: a surface buries the secondary structure '
                    + 'that is the whole point' },
      variants: PRION_VARIANTS,
    },
    {
      key: 'amylase', name: 'α-Amylase', dir: 'amylase',
      blurb: 'The enzyme in saliva and pancreatic juice that breaks starch down '
           + 'into sugars. It starts on the long chains before you have '
           + 'swallowed, cutting them along a trough that grips four sugars at a '
           + 'time.',
      /* EC 3.2.1.1, in the file's own COMPND record. */
      does: 'enzyme',
      /* Its own pipeline: `amylase/tools/` bakes the site measurements, the
         surface and the docking control that `amylase-test.html` reads, and
         `check-amylase.js` / `check-fit.js` audit them. Nothing here reaches
         into that; the `read` block comes off 1OSE itself. */
      pipeline: 'own',
      page: 'amylase/amylase-test.html',
      /* One entry, so nothing to superpose onto anything. */
      fit: null,
      fitWhy: 'a single deposition — there is no second structure to fit',
      view: { by: 'deposited', shared: false,
              why: 'a globular domain with a trough across it; a solved basis '
                 + 'would flip between rebakes and no human has picked one' },
      surface: { bake: true,
                 why: 'baked, and it earns it: the lesson is a POCKET — a '
                    + '19.8 Å trough over four subsites — and a ribbon draws '
                    + 'the walls of it as a tangle of loops' },
      variants: [
        { id: '1OSE', default: true,
          purpose: 'the site, with acarbose sitting in it',
          species: 'pig',
          chains: 'A',
          source: { kind: 'repo', id: '1OSE', path: 'amylase/data/1OSE.pdb' },
          /* The ribbon is a trace baked with `tools/bake-trace.js`, the
             one-file conversion that tool exists for. The rest is this
             protein's own: the SES the bench toggles, the site measurements
             its panel prints, and the docking control `check-fit.js` audits. */
          bake: { trace: '1OSE.trace.json',
                  surface: '1OSE.surf.bin',
                  card: '1OSE.card.surf.bin',
                  site: 'amylase.json',
                  fit: 'fit.json' },
          read: {
            method: "x-ray diffraction",
            chainsInFile: 1,
            residues: 495,
            declared: 496,
            ec: "3.2.1.1",
            baked: "1OSE.trace.json" } },
      ],
    },
    {
      key: 'hexokinase', name: 'Hexokinase', dir: 'proteins/hexokinase',
      blurb: 'The enzyme that begins glycolysis, in every cell that burns '
           + 'glucose. It attaches a phosphate to the sugar, closing its two '
           + 'lobes around it so the ATP is not spent on a molecule of water '
           + 'instead.',
      /* EC 2.7.1.1, on the COMPND record of all four depositions. */
      does: 'enzyme',
      /* TWO BENCHES, AND THE DERIVED ONE IS THIS REGISTRY'S. `hexokinase-test`
         draws the two entries as themselves and is where the question of
         whether the closure is visible gets answered; `hexokinase/closure-test`
         plays a 41-frame trajectory in its own binary format and is downstream
         of that answer. So no `page:` — the derived path is right — and the
         animation is linked from the bench rather than from the card.

         The PDBs stay in `hexokinase/` with the trajectory baker that pulled
         them. `proteins/hexokinase/tools/prep.js` reads them across and writes
         only the two static ribbons; two copies of a deposition is two things
         to keep in step, and the stale one is whichever nothing is run on. */
      /* STATES OF ONE THING, so they are superposed — and on LOBE 1 alone,
         the large one, because that is what makes the picture the small lobe
         swinging rather than the whole protein writhing. Which residues are
         lobe 1 is a consensus the closure baker solves; prep.js reads it back
         out of the trajectory instead of solving it again. */
      fit: { on: '1IG8', by: 'lobe 1' },
      /* A HUMAN'S BASIS, AND prep.js READS IT FROM HERE. The solver had an
         answer — the two lobes make the long axis easy — but it was the wrong
         way round for the only thing this pair is for: the cleft has to face
         the reader, or the closure happens edge-on and reads as a shrug. So
         the choice is made on the bench with `copy this view` and lives here,
         and the baker writes it into both bakes rather than solving over it.
         Shared is legal because the two are superposed; it is also required,
         since a basis per entry would turn the molecule on every switch and
         hide the motion inside the rotation. */
      view: { by: 'human', shared: true,
              why: 'the cleft has to face the reader — a solved basis put the '
                 + 'hinge edge-on, where 18.58° looks like nothing',
              basis: [[-0.8805, 0.4613, -0.111],
                      [0.4269, 0.8721, 0.2393],
                      [0.2071, 0.1632, -0.9649]] },
      surface: { bake: false,
                 why: 'the claim is a hinge, and the hinge is backbone — an '
                    + 'SES would seal the cleft that is the whole subject' },
      variants: [
        { id: '1IG8', default: true,
          purpose: 'open and empty — the mouth before glucose',
          species: 'yeast',
          chains: 'A',
          source: { kind: 'repo', id: '1IG8', path: 'hexokinase/data/1IG8.pdb' },
          read: {
            method: "x-ray diffraction",
            chainsInFile: 1,
            residues: 469,
            declared: 486,
            ec: "2.7.1.1",
            baked: "hexokinase-1IG8.json" } },
        /* NOT THE SAME ISOZYME, and the animation's own header is where the
           consequence is worked out: 1IG8 is hexokinase PII and 3B8A is PI,
           77% identical, so the 18.6° between them is closure PLUS whatever
           the two isozymes differ by, and these files cannot separate them.
           The obvious pair — 2YHX and 1HKG, the one the textbooks use — is
           worse: 83 and 78 UNK residues, unsequenced in 1978, so there is no
           residue correspondence to morph along, and measured it closes the
           wrong way. Both are on disk in `hexokinase/data/` and neither is
           registered. */
        { id: '3B8A',
          purpose: 'shut on glucose — the same mouth, closed',
          species: 'yeast',
          chains: 'X',
          source: { kind: 'repo', id: '3B8A', path: 'hexokinase/data/3B8A.pdb' },
          read: {
            method: "x-ray diffraction",
            chainsInFile: 1,
            residues: 470,
            declared: 485,
            ec: "2.7.1.1",
            baked: "hexokinase-3B8A.json" } },
      ],
    },
    {
      key: 'chymotrypsin', name: 'Chymotrypsin', dir: 'proteins/chymotrypsin',
      blurb: 'A digestive enzyme that cuts other proteins, which is why it is '
           + 'made switched off. The pancreas ships it as one inert chain and '
           + 'the intestine turns it on by cutting it, so the cell that built '
           + 'it is never digested by it.',
      /* EC 3.4.21.1, on 4CHA's COMPND. 2CGA carries none and should not: it
         is the zymogen, and an entry for a molecule that catalyses nothing
         yet has no reaction to name. */
      does: 'enzyme',
      /* TWO STATES OF ONE MOLECULE, so they are superposed — and on the WHOLE
         chain, which is legitimate here for a reason almost no other pair in
         this collection can claim: both entries use chymotrypsinogen
         numbering, so residue 57 is His57 in both files and the fit is a
         match on residue number rather than a sequence alignment. Nothing
         hinges, either. The fold is one fold; what the pair is about is a
         chain severed inside it. */
      fit: { on: 'uncut', by: 'the alpha-carbons they share, by residue number' },
      fitWhy: 'the cut is four missing residues in an unchanged fold, and it is '
            + 'only legible if the two open in the same frame',
      /* Two barrels, and their extents come out 44 x 39 x 37 — close enough
         that a solved basis flips between re-bakes. Turned on the bench and
         pasted. */
      view: { by: 'human', shared: true,
              why: 'the cut ends and the triad have to be visible at once, '
                 + 'which is a framing no solved basis knows to look for',
              basis: [[-0.3043, -0.8608, -0.408],
                      [-0.9507, 0.3014, 0.0732],
                      [0.06, 0.4101, -0.91]] },
      /* A CHAIN-COUNT CLAIM, which is backbone. An SES would render the two
         states as one indistinguishable blob: the three chains are packed
         against each other exactly where the one chain used to run, so the
         outside of the enzyme is very nearly the outside of the zymogen. The
         difference is only visible as ribbon. */
      surface: { bake: false,
                 why: 'the claim is a chain count, and a surface hides where '
                    + 'one chain ends and the next begins' },
      /* The bench's index of what it may draw. It survived review — the two
         structures and the two sites are what the page reads to build its
         buttons — so it is a committed artefact rather than scaffolding. */
      keeps: ['candidates.json'],
      variants: [
        { id: 'uncut', default: true,
          purpose: 'the zymogen: one chain of 245, folded and inert',
          species: 'cow',
          chains: 'A',
          source: { kind: 'rcsb', id: '2CGA' },
          read: {
            method: "x-ray diffraction",
            chainsInFile: 2,
            residues: 245,
            declared: 245,
            ec: null,
            baked: "chymotrypsin-uncut.json" } },
        /* THREE CHAINS AND STILL ONE MOLECULE, which is the entry. Trypsin
           cuts 15-16 and makes the enzyme; chymotrypsin then excises the
           dipeptides 14-15 and 147-148 from its own kind, leaving 13 / 131 /
           97. Nothing falls off because two of the five disulfides that were
           already there now cross a chain boundary.

           THE FILE HOLDS THE MOLECULE TWICE, A/B/C and E/F/G. Only the first
           is drawn: a lookup by residue number alone would collect both and
           draw the triad twice, 30 A apart. */
        { id: 'cut',
          purpose: 'the enzyme: the same molecule as three chains, working',
          species: 'cow',
          chains: 'A,B,C',
          source: { kind: 'rcsb', id: '4CHA' },
          read: {
            method: "x-ray diffraction",
            chainsInFile: 6,
            residues: 239,
            declared: 241,
            ec: "3.4.21.1",
            baked: "chymotrypsin-cut.json" } },
      ],
    },
    {
      key: 'hemoglobin', name: 'Haemoglobin', dir: 'proteins/hemoglobin',
      blurb: 'The oxygen carrier in red blood cells: four chains, each holding '
           + 'one iron. Binding one oxygen changes the shape of the whole '
           + 'tetramer, so the next three bind more easily and all four are '
           + 'released together in tissue. Three of them here: the adult '
           + 'molecule, the sickle mutation, and the one a fetus makes.',
      does: 'oxygen carrier',
      /* THIS IS THE GALLERY'S HALF OF HAEMOGLOBIN, AND NOT THE LESSON'S.
         `proteins/hemoglobin/tools/prep.js` bakes what every other protein
         here bakes — a trace, the hemes, the two histidines that hold each
         iron — so a card and a bench read this protein through the same path
         as the other sixteen and there is no branch on pipeline anywhere.

         The folding trajectory, the quaternary placement and the two SES
         surfaces are hemoglobin-lab's, they are made by `hemoglobin/tools/`
         in formats built for that lesson, and they are NOT named here. That
         is the point of the split: a lesson's private artefacts are not facts
         about the collection, and the day this entry claimed them it had to
         opt out of its own checker to do it. */
      pipeline: 'trace',
      /* The only protein here that already has a LESSON. A card links it
         second, because the gallery is about what we hold and the lesson is
         what one of them became. */
      lesson: 'hemoglobin-lab.html',
      /* Two crystals of the same protein, one mutation apart, so the fit is
         the whole point rather than a convenience: two crystals are two
         arbitrary orientations, and flipping between them unfitted turns the
         entire molecule — a large, dramatic, meaningless difference with the
         one substituted residue invisible underneath it.

         `hemoglobin/tools/bake-hbs.js` solved this first, for surface-test,
         and reached 0.585 A over the matched alpha-carbons. This pipeline
         re-derives it independently and the two agree, which is worth more
         than either number alone. Where they differ is only in HOW the motion
         is carried: bake-hbs stores it as an additive `align` field because
         2HHB's files sit in FoldLib.orient()'s frame and must not be
         disturbed, while here the fit is baked into the coordinates and
         DECLARED below, which is what makes it visible downstream —
         check-proteins.js re-derives it from the bakes and fails a
         disagreement. */
      fit: { on: '2HHB', by: 'the alpha-carbons they share, by residue number' },
      fitWhy: 'one fold in two crystals; the shared frame is what makes a '
            + 'single substituted residue legible as the difference rather '
            + 'than lost under a rotation',
      /* ONE BASIS COVERS ALL THREE, BECAUSE THEY SHARE A FRAME. A tetramer is
         round enough that a solved basis would flip between re-bakes, so this
         is a human's, turned on the bench and pasted. It is read at draw time
         rather than baked — re-aiming haemoglobin is an edit here and a
         reload, and `viewFor` writes no view into a bake that has one. */
      view: { by: 'human', shared: true,
              why: 'a tetramer is round enough that a solved basis would flip '
                 + 'between rebakes, and the three views are fitted into one '
                 + 'frame, so one chosen rotation aims all of them',
              basis: [[0.8493, 0.0616, 0.5243],
                      [-0.5176, 0.2922, 0.8042],
                      [-0.1036, -0.9544, 0.2801]] },
      /* The lesson's two surfaces still exist and still earn their cost; they
         are just not this registry's, and nothing on a card or a bench asks
         for one. `SurfaceCost.md` is the argument. */
      surface: { bake: false,
                 why: 'the claim on this bench is the fold and the one changed '
                    + 'residue, and an SES buries both' },
      variants: [
        { id: '2HHB', default: true,
          purpose: 'the tetramer, deoxy — four chains, four irons',
          species: 'human', state: 'healthy',
          /* WHICH CHAIN IS WHICH SUBUNIT, BY NAME, because the letters are the
             crystallographer's and the names are the biology's: 2HHB numbers its
             alphas A and C, 1FDH numbers them A and B, and a baker matching one
             onto the other by letter would fit an alpha onto a beta. The names
             are also what the panel prints, which is why gamma can be a gamma
             here rather than a beta that happens to be spelled differently. */
          chains: 'A,B,C,D', subunits: { alpha: 'A,C', beta: 'B,D' },
          source: { kind: 'repo', id: '2HHB', path: 'hemoglobin/data/2HHB.pdb' },
          read: {
            method: "x-ray diffraction",
            chainsInFile: 4,
            residues: 574,
            declared: 574,
            ec: null,
            baked: "hb-2HHB.json" } },
        { id: '2HBS',
          purpose: 'sickle haemoglobin: the same fold, and the contact the one '
                 + 'changed residue makes',
          species: 'human', state: 'mutant',
          /* TETRAMER 1 ONLY, the same four chains bake-hbs.js takes. The
             asymmetric unit holds two, because what 2HBS is deposited for is
             the lateral contact between them — but a contact is a claim about
             two molecules and this bench draws one. Baking both put 116 A of
             structure on a stage that shows 2HHB's 60, so clicking between
             them halved the molecule: a framing artefact that reads as a
             difference in the protein. The contact belongs to
             sickle/fibre-test.html, which draws it as surfaces because that
             is what a contact is a claim about. */
          chains: 'A,B,C,D', subunits: { alpha: 'A,C', beta: 'B,D' },
          source: { kind: 'repo', id: '2HBS', path: 'hemoglobin/data/2HBS.pdb' },
          read: {
            method: "x-ray diffraction",
            chainsInFile: 8,
            residues: 574,
            declared: 574,
            ec: null,
            baked: "hb-2HBS.json" } },
        { id: '1FDH',
          purpose: 'the haemoglobin a fetus makes, and why it wins the oxygen',
          species: 'human', state: 'healthy',
          /* ALPHA AND GAMMA, NOT ALPHA AND BETA. Fetal haemoglobin swaps the
             two beta chains for gamma, a different gene rather than a mutated
             one — which is why this is a VARIANT of haemoglobin and not an
             entry of its own: same `does`, same job, same tetramer, and the
             whole content is the comparison with the adult molecule. Note the
             chain letters: alpha is A and B here, where 2HHB calls them A and
             C. Nothing may match these two files by letter. */
          chains: 'A,B,G,H', subunits: { alpha: 'A,B', gamma: 'G,H' },
          source: { kind: 'rcsb', id: '1FDH' },
          read: {
            method: "x-ray diffraction",
            chainsInFile: 4,
            residues: 574,
            declared: 574,
            ec: null,
            baked: "hb-1FDH.json" } },
      ],
    },
    {
      key: 'collagen', name: 'Collagen', dir: 'proteins/collagen',
      blurb: 'The structural protein of skin, bone and tendon, and about a third '
           + 'of the protein in your body. Three chains wind into a rope with a '
           + 'glycine at every third position, because nothing larger fits where '
           + 'the chains meet.',
      /* IT HOLDS. The first entry here that catalyses nothing and carries
         nothing: collagen is material, and what it does is not chemistry. */
      does: 'structural',
      pipeline: 'trace',
      /* Not superposed, and not a near miss: these are six different
         molecules, not six states of one. Three designed peptides, a
         construct built around a real site, a chaperone complex and a whole
         molecule — there is no correspondence for a fit to use. */
      fit: null,
      fitWhy: 'six different molecules rather than six states of one; three of '
            + 'them occur in no gene, so there is nothing to fit onto what',
      view: { by: 'measured', shared: false,
              why: 'a collagen figure is drawn along the helix, the way a '
                 + 'fibril is drawn on its axis — the baker solves that axis '
                 + 'off the SUBJECT\'s chains rather than off everything '
                 + 'drawn, or a complex is framed on its partner instead' },
      surface: { bake: false,
                 why: 'a fold claim, and the most extreme one here: the whole '
                    + 'subject is three strands winding around each other, '
                    + 'and a skin over them is a smooth rod' },
      /* NO COLLAGEN FILE RECORDS ITS OWN HELIX, and the escape is claimed here
         rather than left to look like a broken read. A PDB says helix or
         sheet; polyproline II is neither, so these bake as pure coil and
         `check-proteins.js` would otherwise fail every one of them for drawing
         a worm. `some: true` because three of the six DO carry records — for
         their partner proteins, and for 1CAG's depositors annotating the
         triple helix as a class-10 coiled coil, which is the collection
         holding both answers about one shape. */
      /* HOW ITS CHAINS ARE TOLD APART, and it is here rather than on the bench
         because the bench is not the only thing that draws this protein — the
         gallery card does too, and a colour decision kept on one page means
         the card and the bench show the same molecule two ways.

         KEYED BY STRAND NAME, not by chain id, so it says something about the
         MOLECULE: a homotrimer's three interchangeable chains get three
         colours because the subject is the braid, and 3HR2's two α1 chains get
         the same one because they are two copies of one gene product. A chain
         id would only have said "the third one".

         NOT palette.js's business. That file owns what an ATOM is coloured,
         which is a fact about chemistry every page must agree on; this is a
         page distinguishing three identical polymers, which is a fact about
         nothing but legibility. It is the house green and rust from
         protein-test.css with a blue to complete the set, and grey for a chain
         that is not collagen at all. */
      draw: { byStrand: {
        'chain 1': 0x1f5f4f,          // deep green, the house accent
        'chain 2': 0xe2643a,          // rust
        'chain 3': 0x2f6f9f,          // blue
        'α1(I)':   0x1f5f4f,
        'α2(I)':   0xe2643a,
        'Hsp47':   0x9aa0a6,          // grey: present, and not the subject
        'integrin α2 I': 0x9aa0a6,
      } },
      ss: { deposited: false, some: true,
            why: 'polyproline II is neither of the two things a HELIX or SHEET '
               + 'record describes, so all-coil is the correct read and the '
               + 'bench tells the strands apart by colour instead' },
      variants: COLLAGEN_VARIANTS,
    },
    {
      key: 'rnase', name: 'Ribonuclease A', dir: 'proteins/rnase',
      blurb: 'Ribonuclease A, an enzyme from cow pancreas that cuts RNA. '
           + 'Anfinsen unfolded it and watched it fold back on its own, which is '
           + 'how we know a sequence carries the instructions for its own shape.',
      /* EC 3.1.27.5, in the file's own COMPND record. */
      does: 'enzyme',
      pipeline: 'trace',
      /* Not superposed, and this is the interesting case: these are not states
         of one thing. 1DFJ's subject is the assembly and the dimers' is the
         pairing, so fitting by the enzyme chain would pin the 124-residue
         monomer and let the 456-residue horseshoe land wherever it fell. */
      fit: null,
      fitWhy: 'different objects, not states of one: the complex and the '
            + 'dimers are about what the enzyme is attached to',
      view: { by: 'deposited', shared: false,
              why: 'no shared frame, so a hand-picked basis would be right '
                 + 'for one variant and wrong for the other six' },
      surface: { bake: false,
                 why: 'fold claims, except 1DFJ — the one genuine surface '
                    + 'claim here, worth a bake only if a lesson is about '
                    + 'the inhibitor' },
      variants: RNASE_VARIANTS,
    },
    {
      key: 'insulin', name: 'Insulin', dir: 'proteins/insulin',
      blurb: 'The hormone that tells cells to take up glucose, made in the '
           + 'pancreas and cut out of a longer chain. Two short chains stapled '
           + 'by three disulfides, stored six at a time around a pair of zinc '
           + 'ions.',
      /* No EC anywhere, and that is the point of the word: insulin is read,
         not run. `hormone` was added to DOES for it. */
      does: 'hormone',
      pipeline: 'trace',
      /* ONE AB UNIT, and the reference is the entry deposited AS one. Fitting
         onto a dimer would mean picking which of its two copies is the
         reference, and that choice would be invisible in every number
         downstream. It is also the correspondence the precursor has: 2KQP's
         residues 1-30 and 66-86 are the same two chains, still joined, so the
         same fit that aligns the dimers puts proinsulin's hormone under the
         hormone and leaves the C-peptide as the only loop with nothing
         beneath it. */
      fit: { on: '3I40', by: 'the A and B chains, matched by residue number' },
      fitWhy: 'states of one hormone at four sizes; the shared frame is what '
            + 'makes the C-peptide and the hexamer legible as additions',
      /* Deposited until a human picks one. They share a frame, so the basis
         when it comes is one basis for all five — `shared: true` is a claim
         about the fit above, not about whether anyone has chosen yet. */
      view: { by: 'human', shared: true,
              why: 'four extents too close to solve a stable basis from, so a '
                 + 'solved one would flip between re-bakes; turned on the '
                 + 'bench and pasted here instead',
              basis: [[0.6376, 0.1454, -0.7565],
                      [-0.7236, -0.224, -0.6529],
                      [-0.2644, 0.9637, -0.0376]] },
      /* Fold and assembly claims, both served better by a ribbon: the dimer
         sheet and the zinc site are the two things to see, and a surface
         buries both. The one claim that would earn a bake is the receptor
         interface, and no receptor structure is held. */
      surface: { bake: false,
                 why: 'fold and assembly claims; the surface claim would be '
                    + 'the receptor interface, which is not held' },
      variants: INSULIN_VARIANTS,
    },
    {
      key: 'myoglobin', name: 'Myoglobin', dir: 'proteins/myoglobin',
      story: 'proteins/myoglobin/myoglobin-story.html',
      blurb: 'The oxygen store of muscle: one chain wrapped around one iron. It '
           + 'was the first protein structure anyone ever solved, and it is '
           + 'still the clearest look at how a molecule is held in a binding '
           + 'site.',
      does: 'oxygen carrier',
      pipeline: 'trace',
      /* THE DEFAULT AND THE REFERENCE ARE DIFFERENT VARIANTS HERE, and that is
         not an oversight: they answer different questions. The default is what
         the collection opens on and what a card shows — 1MBN, because the
         first protein structure anyone ever saw is what myoglobin is FOR in
         this repo. The reference is what everything is superposed onto, and
         that has to be deoxy: the empty site is the state every other view is
         a change FROM, and fitting onto an occupied one would put that file's
         ligand at the origin of the comparison it is one side of. */
      fit: { on: '1BZP', by: 'heme' },
      fitWhy: 'states of one site; the heme matches by atom name across files '
            + 'whose residue numbering does not correspond',
      /* One basis covers all seven BECAUSE they share a frame. A human turned
         the molecule on the bench and pasted this; a solved basis for a bundle
         this round would flip between re-bakes. */
      view: { by: 'human', shared: true,
              basis: [[-0.5342, 0.633, -0.5604],
                      [0.8271, 0.5283, -0.1917],
                      [0.1747, -0.5659, -0.8058]] },
      surface: { bake: false,
                 why: 'the claim is the site, and an SES seals the pocket shut' },
      variants: MYOGLOBIN_VARIANTS,
    },
    {
      key: 'gfp', name: 'GFP', dir: 'proteins/gfp',
      blurb: 'The green fluorescent protein, isolated from jellyfish. GFP is '
           + 'useful for tracking protein movements, gene expression, and '
           + 'cellular processes.',
      /* IT REPORTS. `reporter` is a seventh word, reserved for this row in
         proteins-wishlist.md before GFP was pulled, and it is a word about
         what the protein is USED for rather than what it does in the animal —
         which is the honest description of why this protein is in a library
         for Bio 101. No EC anywhere in either file, so `enzyme` would be a
         claim the collection cannot check. */
      does: 'reporter',
      pipeline: 'trace',
      /* The blue variant onto the green one, on Ca. Both are the same protein
         under the same numbering and the barrel is rigid, so the fit is a
         measurement rather than a convenience — and without it the two
         crystals are two arbitrary orientations, so flipping between them
         turns the whole molecule and hides the one residue that changed. */
      fit: { on: '1GFL', by: 'the alpha-carbons they share, by residue number' },
      fitWhy: 'one fold in two colours; the shared frame is what makes a single '
            + 'substituted residue legible as the difference',
      /* A barrel's three extents are close enough that a solved basis flips
         between re-bakes, and the one that matters here is the one that shows
         the dye through the wall. Turned on the bench and pasted. */
      view: { by: 'human', shared: true,
              why: 'the chromophore has to be visible inside the can, which is '
                 + 'a framing no solved basis knows to look for',
              basis: [[0.1781, -0.9797, 0.0839],
                      [0.9835, 0.1761, -0.0153],
                      [0.0001, 0.0853, 0.9949]] },
      /* A fold claim, and an SES would seal the barrel and bury the dye
         inside it \u2014 which is the one thing the reader is here to see. */
      surface: { bake: false,
                 why: 'the claim is the fold and what is inside it; a surface '
                    + 'closes the can' },
      variants: GFP_VARIANTS,
    },
    {
      key: 'ferritin', name: 'Ferritin', dir: 'proteins/ferritin',
      blurb: 'The iron store of the cell, a hollow shell built from 24 identical '
           + 'subunits. Loose iron is toxic and iron is essential, so ferritin '
           + 'oxidises it on the way in and keeps the mineral walled inside.',
      /* IT KEEPS. `storage` is the sixth word, and the wishlist reserved it
         for this row before ferritin was pulled: the job is holding a
         reactive thing somewhere it cannot do harm, and none of the other
         five say that. It is not `enzyme` even though the ferroxidase site
         is real chemistry — 1FHA carries no EC number anywhere, so calling it
         one would be a claim this collection cannot check. */
      does: 'storage',
      pipeline: 'trace',
      /* Two scales of one object rather than two states of it, so there is
         no correspondence for a fit to use: a subunit is not a version of
         the ball, it is part of it. */
      fit: null,
      fitWhy: 'a part and the whole it builds, not two states of one thing',
      /* Deposited, and reviewed as deposited. The cage is a sphere — 119 A on
         every axis — so `frameOf` writes no basis for it, and the frame it
         opens in points a 4-fold axis at the reader. That was looked at on
         the bench and kept. */
      view: { by: 'deposited', shared: false,
              why: 'the cage measures the same on all three axes, so a solved '
                 + 'basis would flip between re-bakes; the deposited frame '
                 + 'was reviewed and kept' },
      /* An assembly claim and a site claim, and a ribbon is better at both:
         the shell reads as 24 parts BECAUSE you can see through it, and an
         SES would close the pores that are the reason iron gets in at all.
         The surface claim worth baking is the interior wall where the mineral
         grows, which nothing here holds coordinates for. */
      surface: { bake: false,
                 why: 'the shell reads as 24 parts because the ribbon is '
                    + 'see-through; an SES closes the pores' },
      variants: FERRITIN_VARIANTS,
    },
    {
      key: 'rubisco', name: 'Rubisco', dir: 'proteins/rubisco',
      blurb: 'The enzyme that puts carbon into the biosphere: it sticks CO\u2082 from '
           + 'the air onto a five-carbon sugar. It is slow and it grabs O\u2082 by '
           + 'mistake, so plants make enormous amounts of it \u2014 there is more '
           + 'rubisco on Earth than any other protein.',
      /* EC 4.1.1.39, on the COMPND record of both entries. A lyase: it adds
         CO2 across a double bond, which is the one kind of chemistry the class
         is named for. */
      does: 'enzyme',
      pipeline: 'trace',
      /* THE FIT IS BETWEEN THE TWO SITE VIEWS AND NOWHERE ELSE. They are one
         enzyme before and after activation, so they have to wear one frame or
         flipping between them turns the molecule and hides the carbamate
         inside the rotation. The whole particle is a different SCALE of the
         same file rather than a third state, and fitting it onto one of its
         own sixteen chains would centre a 123 A ball on a corner of itself:
         `among` is what says so, and the checker holds the rest of the
         collection to carrying no fit at all. */
      fit: { on: '1RCX-site', by: 'the large subunit\u2019s alpha-carbons, by residue number',
             among: ['1RCX-site', '8RUC-site'] },
      fitWhy: 'two states of one site, superposed; the assembly is a scale of '
            + 'the same file and has nothing to be a state of',
      /* Solved, per view. The L+S pair is elongated enough that its own shape
         answers, and the two site views share that answer because they are
         superposed. The particle is 123 A on every axis, so `frameOf` writes it
         no basis at all and it opens in the deposited frame — which is the one
         a human should replace with `copy this view`, since the picture that
         says what this enzyme IS is the one down the four-fold. */
      /* TWO FRAMES, AND THIS IS THE PROTEIN THE MAP WAS BUILT FOR. The site
         pair is one frame because the two are superposed onto each other; the
         particle is a second, at four times the radius, with no correspondence
         to the pair for a rotation to carry across. One basis over all three
         would aim one of them and leave the other opening in a rotation nobody
         chose.

         Both were turned on the bench and pasted. `particle` is 123 A on every
         axis, so `frameOf` writes it no basis at all and it would otherwise
         open in the crystal's frame — for the default view of the most
         abundant protein on Earth. `site` had a solved basis and is aimed over
         it: the pair's long axis is the two chains end to end, which puts the
         site edge-on, and the site is what those two views are for. */
      view: { by: 'human', shared: true,
              why: 'the particle is a sphere and no solved basis survives a '
                 + 're-bake of it, so the view that says what this enzyme IS '
                 + 'has to be chosen',
              basis: { particle: [[0.9547, 0.2975, -0.0091],
                                  [-0.2931, 0.9345, -0.2018],
                                  [-0.0515, 0.1954, 0.9794]],
                       site:     [[0.6518, -0.4207, 0.6255],
                                  [-0.3725, 0.5412, 0.7479],
                                  [-0.6525, -0.7277, 0.1976]] } },
      /* HOW THE TWO SUBUNITS ARE TOLD APART, here rather than on the bench
         because the gallery card draws this protein too. The large subunit is
         the house green; the small one is an olive that reads beside it
         without shouting. Which chain is which is the variant\u2019s, so this
         table says what a KIND is coloured and nothing about chain letters. */
      draw: { byRole: {
        large: 0x1f5f4f,          // deep green, the house accent
        small: 0x8f9f3e,          // olive: present, and not where the sites are
      } },
      /* The claim on the site views is one residue inside a pocket, and an SES
         would seal it; the claim on the particle is that it is built out of
         sixteen parts, which the ribbon says and a skin would hide. */
      surface: { bake: false,
                 why: 'a site claim and an assembly claim, and a surface closes '
                    + 'the first and merges the second' },
      variants: RUBISCO_VARIANTS,
    },
    {
      key: 'lysozyme', name: 'Lysozyme', dir: 'proteins/lysozyme',
      blurb: 'The enzyme in tears and saliva that cuts open bacterial cell '
           + 'walls. It was the first enzyme whose mechanism anyone worked out '
           + 'from a structure, and the groove down its face is where that '
           + 'happens \u2014 six sugar subsites in a row, with two acidic '
           + 'residues at the bottom.',
      /* EC 3.2.1.17, on the COMPND record of both entries. A hydrolase: it
         puts water across the glycosidic bond it is holding. */
      does: 'enzyme',
      pipeline: 'trace',
      /* FITTED ONTO THE APO ENTRY, which is also the default, which is also
         the state the other one is a change FROM. Those three coincide here
         and they do not always \u2014 myoglobin opens on Kendrew's 1MBN and
         superposes onto deoxy 1BZP \u2014 so it is worth saying that this is
         an agreement and not a rule.

         The alignment is by sequence rather than by residue number even
         though these two share a numbering, because the baker was written
         against a hen entry that does not, and an alignment that returns the
         identity mapping for a co-numbered pair is a check on itself: the
         bench prints 100% identity over 130 pairs, and anything less would
         mean the two files are not the protein they claim to be. */
      fit: { on: '1LZ1', by: 'a Needleman-Wunsch alignment of the alpha-carbons' },
      fitWhy: 'apo against holo, one state a change from the other, so they '
            + 'have to wear one frame or the sugar arrives inside a rotation',
      /* Turned on the bench and pasted. Lysozyme is a kidney bean whose three
         extents are within a factor of two, so its solved axes are
         near-degenerate and their SIGNS are decided by noise \u2014 a dropped
         variant came out with two of three flipped against the rest, which
         would have spun the molecule 180 degrees on the one view whose
         subject was a loop that moved. The baker now hands every fitted view
         the reference's basis rather than letting each solve its own, and this
         is what the reference wears. Shared across both because they are
         superposed. */
      view: { by: 'human', shared: true,
              why: 'a globular bean: no solved basis survives a re-bake with '
                 + 'its signs intact, and the cleft has to face the reader or '
                 + 'neither view says anything',
              basis: [[0.4757, 0.0748, -0.8745],
                      [0.8678, -0.1943, 0.453],
                      [-0.1385, -0.9757, -0.1567]] },
      /* THE ONE ENTRY IN THIS FILE WHERE THE CRITERION SAYS YES AND THE ANSWER
         IS STILL NOT YET. A groove with something lying in it is a surface
         claim by SCIENCE.md's test, and an SES is what would show that the
         sugar is held in a channel rather than resting against a face. What
         stops it is that nothing asks yet: the bench's claim is the pair of
         measurements beside the ribbon, and the groove reads at ribbon width.
         The day a lesson wants the cleft as a shape, this is the strongest
         surface candidate in the collection. */
      surface: { bake: false,
                 why: 'a genuine surface claim with no lesson asking for it '
                    + 'yet \u2014 the first to bake when one does' },
      variants: LYSOZYME_VARIANTS,
    },
    {
      key: 'antibody', name: 'Antibody', dir: 'proteins/antibody',
      blurb: 'Two heavy chains and two light chains, disulfide-bonded into a '
           + 'Y. The two tips are different in every antibody you make and the '
           + 'stem is the same in all of them, which is how one molecule can '
           + 'recognise almost anything and still be handled one way. The '
           + 'whole 1300-residue object is one fold repeated twelve times.',
      /* NO EC ANYWHERE, and that is the point of the word: an antibody binds
         and does not catalyse. The only EC in any of these files is hen
         lysozyme's, on the chain 3HFM is holding. */
      does: 'recognition',
      pipeline: 'trace',
      /* NOT SUPERPOSED, AND THERE IS NOTHING TO SUPERPOSE ACROSS THE THREE: an
         intact mouse IgG, an intact human one, and one arm of a third antibody
         gripping a protein. They are different molecules at different scales,
         so a fit between them would be aligning a whole Y onto a fragment of a
         different Y and calling the residual meaningful.

         The one superposition on this bench is the Fc comparison, and it is
         deliberately not a variant: it fits 1HZH's stem onto 1IGT's, over both
         heavy chains at once, and reports 65% identity with CH2 and CH3
         measured separately. That is a fit BETWEEN two variants rather than a
         frame shared by them, which is why it is a drawn view and not an
         entry. */
      fitWhy: 'three different molecules at three scales \u2014 an intact IgG, '
            + 'another intact IgG, and one arm of a third holding an antigen. '
            + 'The Fc superposition is a view over two of them, not a frame '
            + 'they share',
      /* NOBODY HAS AIMED THIS ONE YET, so every bake wears the basis its own
         shape solved and the panel says `computed`. A Y is a shape with axes
         worth solving \u2014 unlike a globular bean \u2014 so the solved frame
         is stable between re-bakes and stands until someone turns it on the
         bench and pastes a basis in here. */
      /* THE Fc COMPARISON'S BAKE, which is drawn by the bench and is not a
         variant: it is a measurement over 1IGT and 1HZH, both already above,
         and it has no deposition id for `source` to name or for a link to
         point at. `keeps` is what says the file is deliberate rather than a
         stale bake from a renamed view. */
      keeps: ['ab-FC.json'],
      /* The claims here are the fold and what grips what. A ribbon carries the
         first \u2014 a surface would bury the twelve beta sandwiches that ARE
         the subject \u2014 and the second is already measured and printed: 17
         epitope residues, 9 light-chain and 11 heavy-chain contacts. The day a
         lesson wants the antigen shown as a shape fitting a shape rather than
         as a contact count, this becomes a real surface candidate. */
      surface: { bake: false,
                 why: 'a fold claim, which a skin would bury, and a contact '
                    + 'claim that is answered by measurement instead' },
      variants: ANTIBODY_VARIANTS,
    },
    {
      key: 'cytc', name: 'Cytochrome c', dir: 'proteins/cytc',
      blurb: 'A small protein that carries one electron at a time from complex '
           + 'III to complex IV. The electron rides on the iron of a heme bolted '
           + 'into the protein, with one edge left exposed to hand it across.',
      does: 'electron carrier',
      pipeline: 'trace',
      fitWhy: 'one structure, nothing to superpose it onto',
      view: { by: 'human',
              why: 'globular, so no solved basis is stable; turned on the bench',
              basis: [[-0.0278, -0.3598, -0.9326],
                      [-0.8007, -0.5505, 0.2362],
                      [-0.5984, 0.7533, -0.2728]] },
      surface: { bake: false,
                 why: 'the docking patch is a surface claim, but the lysines '
                    + 'read as side chains and no lesson asks for the shape yet' },
      variants: CYTC_VARIANTS,
    },
  ];

  const byKey = key => PROTEINS.find(p => p.key === key) || null;
  /* THE VARIANT A PROTEIN OPENS ON, and the one a card shows. Required, not
     inferred: falling back to the first entry would mean the choice is
     wherever the list happens to start, and re-ordering the list would
     silently re-aim every bench and every card. `check-proteins.js` fails a
     protein with none, and the fix is to mark one — the first entry, if
     nothing else earns it. */
  const defaultOf = p => p.variants.find(v => v.default) || null;

  /* THE PROTEIN'S EC NUMBER, agreed across its variants. Read per variant off
     each deposition, because that is where it is written, and asked for per
     PROTEIN because that is what it describes — every entry of ribonuclease A
     says 3.1.27.5, and one that said something else would mean a variant is
     filed under the wrong protein. `check-proteins.js` fails that disagreement
     rather than letting this pick a winner.

     Null is an answer: haemoglobin carries oxygen and catalyses nothing. */
  function ecOf(p) {
    const seen = [...new Set(p.variants.map(v => v.read && v.read.ec).filter(Boolean))];
    return seen.length === 1 ? seen[0] : null;
  }

  /* THE ROTATION A HUMAN CHOSE, or null where nobody has. Read at draw time
     and never baked, which is the whole of the arrangement:

       a SOLVED basis is a measurement of the shape, computed from the
       coordinates, and it lives in the bake beside the extents it was solved
       with — `Bake.frameOf`.

       a CHOSEN basis is taste. It lives here, and changing it is an edit to
       this file and a reload. Baking it would make a presentation decision
       into a committed artefact, so every re-aim would cost a re-bake, rewrite
       files whose coordinates did not change, and put the same basis in two
       places with a checker to keep them level.

     A FUNCTION RATHER THAN A FIELD READ DIRECTLY, for `colorsOf`'s reason: it
     is every consumer calling the same thing that stops a bench and a gallery
     card becoming two opinions about which way one molecule faces. */
  /* ONE BASIS, OR ONE PER FRAME. A protein with a single frame writes a bare
     3x3 and every variant wears it — twelve of the thirteen. A protein whose
     variants are at more than one SCALE writes a map instead, keyed by frame
     name, and each variant says which frame it is in:

       view: { by:'human', shared:true,
               basis: { site:[[…]], particle:[[…]] } }
       …and on the variant:  frame: 'site'

     BECAUSE A CHOSEN BASIS BELONGS TO A FRAME AND NOT TO A PROTEIN. Rubisco is
     the case and it is a common shape: two views of one active site, superposed
     so they can be flipped, and the whole sixteen-chain particle beside them.
     One basis over all three either aims the particle or aims the pair, and
     whichever it is, the other opens in a rotation nobody chose.

     A FRAME IS EXACTLY A SUPERPOSITION GROUP, which is what keeps this from
     being a per-variant basis by another name: `registry-io.js` fails a frame
     holding two variants that are not fitted onto each other, so views that
     share a rotation are views that share coordinates. A per-variant basis
     would let a superposed pair drift apart, which is the whole thing `shared`
     exists to prevent.

     A FRAME WITH NO ENTRY IN THE MAP IS NULL, not an error: nobody has picked
     one for it yet, its bake's solved basis stands, and `check-proteins.js`
     allows exactly that bake to carry a view. That is how a protein takes its
     rotations one frame at a time.

     `v` is optional. Without it — a gallery card asking about the protein
     rather than about one structure — the answer is the default variant's
     frame, which is what that card is about to draw. */
  function viewOf(p, v) {
    if (!p || !p.view || p.view.by !== 'human' || !p.view.basis) return null;
    const b = p.view.basis;
    if (Array.isArray(b)) return b;
    const at = v || (p.variants || []).find(x => x.default);
    return (at && b[at.frame]) || null;
  }

  /* What the first digit of an EC number means, for a page that wants to say
     it in words. The same table bake-lib.js keeps for Node. */
  const EC_CLASS = [null,
    ['oxidoreductase', 'moving electrons'],
    ['transferase', 'moving a group from one molecule to another'],
    ['hydrolase', 'cutting a bond with water'],
    ['lyase', 'cutting without water, or adding across a double bond'],
    ['isomerase', 'rearranging one molecule'],
    ['ligase', 'joining two, paying with ATP'],
    ['translocase', 'moving something across a membrane']];
  const variantOf = (p, id) => p.variants.find(v => v.id === id) || null;

  /* THE `colors` A BOX NEEDS FOR ONE VARIANT, built from the protein's strand
     table and that variant's chain names — or null, which is every protein
     that has no reason to colour its chains apart and should therefore be
     drawn the repo's one way.

     A FUNCTION RATHER THAN A FIELD PER VARIANT, because the mapping is
     mechanical and the two halves have different owners: which strand a chain
     IS belongs to the variant, what a strand is coloured belongs to the
     protein. Every consumer calling this is what stops a bench and a gallery
     card becoming two opinions about the same molecule. */
  function colorsOf(p, v) {
    if (!v) return null;
    const byChain = {};

    /* TWO WAYS A PROTEIN CAN TELL ITS CHAINS APART, and which one it uses is a
       fact about what the reader has to distinguish. `byStrand` is collagen's:
       three interchangeable chains of one rope, told apart so the braid is
       visible. `byRole` is ATP synthase's: twenty-eight chains doing four
       jobs, and what matters is which of them turns. Both map a chain to a
       colour through something the VARIANT says that chain is, so the protein
       owns the palette and the variant owns the assignment. */
    const strands = p.draw && p.draw.byStrand;
    if (strands && v.strands)
      for (const [ch, strand] of Object.entries(v.strands))
        if (strands[strand] != null) byChain[ch] = strands[strand];

    const roles = p.draw && p.draw.byRole;
    if (roles && v.roles)
      for (const [ch, pair] of Object.entries(v.roles))
        if (roles[pair[0]] != null) byChain[ch] = roles[pair[0]];

    return Object.keys(byChain).length ? { byChain } : null;
  }

  /* Both URLs a bench shows, derived from `source` so an id and its links
     cannot disagree. A `repo` source has no remote entry of its own — it is a
     chain lifted out of a file another page already holds — so it points at
     the entry it came from and says where the local copy lives. */
  function urls(v) {
    const s = v.source || { kind: 'rcsb', id: v.id };
    if (s.kind === 'alphafold') return {
      entry: 'https://alphafold.ebi.ac.uk/entry/' + s.id,
      file: 'https://alphafold.ebi.ac.uk/files/AF-' + s.id + '-F1-model_v4.pdb',
    };
    /* `.pdb` UNLESS THE ENTRY SAYS OTHERWISE. An entry too large for the
       legacy format is not published in it — RCSB 404s the .pdb for anything
       past 62 chains or 99,999 atoms — so a link built on the assumption is a
       dead link on exactly the biggest and most interesting structures. ATP
       synthase's human enzyme is the first here to say `format:'cif'`. */
    const ext = s.format === 'cif' ? '.cif' : '.pdb';
    return {
      entry: 'https://www.rcsb.org/structure/' + s.id,
      file: 'https://files.rcsb.org/download/' + s.id + ext,
      local: s.kind === 'repo' ? s.path : null,
    };
  }

  /* `fiber diffraction` is spelled the way EXPDTA spells it, like every other
     entry here: the baker lower-cases what the file says, and a registry that
     Anglicised it would fail its own checker against the deposition. It is a
     MEASURED method and a coarse one — 3HR2 is a 5.2 Å molecular envelope,
     which its own bake records; this list only says which KIND of claim it
     is. */
  const MEASURED = ['x-ray diffraction', 'solution nmr', 'electron microscopy',
                    'neutron diffraction', 'fiber diffraction'];
  const METHODS = MEASURED.concat(['predicted']);

  /* WHAT THE PROTEIN DOES, in one word the collection can be sorted on. A
     vocabulary rather than free text for the same reason `method` is one:
     'enzyme' and 'an enzyme' would split the group in two on a filter and
     nobody would see it happen.

     `unknown` is a real answer and not a gap to fill in later. PrP is the
     case — what its healthy form is FOR has been argued for forty years —
     and a collection that guessed would be teaching one side of that.

     `structural` is the answer for a protein whose job is to HOLD, and it is
     not a synonym for 'no function': collagen does one thing, mechanically,
     and does it as material rather than as chemistry. It is the first entry
     here that catalyses nothing and carries nothing. */
  /* `hormone` is the answer for a protein whose whole job is to be RECOGNISED
     somewhere else. Insulin catalyses nothing, carries nothing and holds
     nothing up; what it does is arrive at a receptor and be read. That is a
     different kind of answer from the other four, and it is the word the
     wishlist reserved for insulin before insulin was pulled. */
  /* `storage` is the answer for a protein whose job is to HOLD SOMETHING that
     would be dangerous loose. Ferritin catalyses a step on the way in and
     still is not an enzyme in this collection's sense: what it is for is the
     iron sitting inside it afterwards. */
  /* `recognition` is the answer for a protein whose job is to BIND ONE THING
     and be found holding it. An antibody catalyses nothing, carries nothing
     and holds nothing up; what it does is grip a shape it was selected for
     and present the fact of that grip to the rest of the immune system. It is
     the mirror of `hormone` — insulin's job is to BE recognised, an
     antibody's is to DO the recognising — and the word the wishlist reserved
     for it before it was pulled. */
  /* `electron carrier` is cytochrome c's: it catalyses nothing and moves one
     electron between two complexes on its heme's iron. The wishlist reserved
     the word for it. */
  const DOES = ['enzyme', 'oxygen carrier', 'unknown', 'structural', 'hormone',
                'storage', 'reporter', 'recognition', 'electron carrier'];

  /* HOW A VARIANT DIFFERS FROM THE HEALTHY PROTEIN, where it differs at all.
     Optional: most variants are the same protein under different conditions —
     a ligand bound, a second species, a solution instead of a crystal — and
     they carry no `state` because there is nothing to say. The field is for
     the collection's other axis, the one the prion pair opened and the sickle
     tetramer, the OI peptide and RNase's two swaps were each recording in
     prose of their own.

     It answers HOW the difference arises, which is the part a reader cannot
     see in a ribbon:

       healthy  the unaffected form, in an entry that also holds an affected
                one. Not a default: it is a claim that something else here is
                the disease, and 1QLZ and 2HHB are the two that make it.
       disease  the pathological form, reached with NO change of sequence —
                the same chain folded another way. PrP is the case, and the
                only one: 6LNI is 1QLZ's sequence, refolded.
       mutant   the pathological or altered form, reached BY a substitution.
                2HBS is one glutamate for one valine; 1CAG is one glycine for
                one alanine. Both are diseases, and both are diseases of the
                SEQUENCE, which is what separates them from PrP.
       swap     the same sequence and the same fold, with a domain traded
                between two chains. RNase's two, and neither is a disease —
                it is how a fold comes apart, which is the reason they are
                held beside the prion.

     A sort on this field puts the two routes to a disease structure side by
     side, and that contrast is the entire reason the prion entry and the
     haemoglobin entry are in one collection. */
  const STATES = ['healthy', 'disease', 'mutant', 'swap'];

  global.ProteinLib = { PROTEINS, METHODS, MEASURED, DOES, STATES, EC_CLASS,
                        byKey, defaultOf, ecOf, viewOf,
                        variantOf, colorsOf, urls };
  if (typeof module === 'object' && module.exports)
    module.exports = global.ProteinLib;
})(typeof window !== 'undefined' ? window : globalThis);
