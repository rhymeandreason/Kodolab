/* =============================================================================
 *  proteins/nucleic-acids.js — every deposited structure here that carries DNA
 *  or RNA, and what we have of it
 * =============================================================================
 *  `proteins.js` is to a protein trace what this is to a nucleic one. Same
 *  discipline, same two authors per variant, same invariant: every `read`
 *  field is one the BAKE can produce, so nothing here is a number a human
 *  typed and a re-bake could falsify. `check-nucleic-acids.js` re-derives all
 *  of them and fails on a disagreement.
 *
 *  WHY A SECOND FILE RATHER THAN A `polymer` FIELD ON THE FIRST. `proteins.js`
 *  opens by saying it is every protein in `proteins/`, and widening it would
 *  have meant an implicit `polymer:'protein'` on seventeen existing entries,
 *  an `ec` that is absent-and-odd rather than optional, and a checker
 *  branching on every assertion. The cost of two files is that they can drift;
 *  the cost of one was touching every entry in it to add something none of
 *  them needed.
 *
 *  THE LINE BETWEEN THE TWO FILES IS THE BAKE, NOT THE BIOLOGY: a structure
 *  is indexed here when its bake carries nucleic chains. Zif268 is a protein
 *  and it is in this file, because 1ZAA's bake is the mixed shape — `pairs`,
 *  `kind` per chain, a `zinc` array — and `check-proteins.js` cannot read one.
 *  Drawing the line at "is it a protein" instead would put one entry in the
 *  protein index whose bake the protein checker has to special-case, which is
 *  the thing having two files was supposed to avoid.
 *
 *  WHAT A `kind` MEANS HERE, and it is about the FILE rather than the molecule:
 *
 *    dna       a duplex and nothing else
 *    rna       one chain, folded, no protein
 *    complex   protein and nucleic acid in one deposition, one frame
 *
 *  Read by the benches under `proteins/<name>/` and by
 *  `check-nucleic-acids.js`. The bakers do not read it — each one owns its own
 *  entry choices, the same split `proteins.js` makes.
 * ============================================================================= */
(function (global) {
  'use strict';

  const STRUCTURES = [
    {
      key: 'dna', name: 'B-DNA', dir: 'proteins/dna', kind: 'dna',
      does: 'genetic material',
      blurb: 'The Drew-Dickerson dodecamer: the first B-DNA any crystal '
           + 'structure showed, and still the molecule every textbook picture '
           + 'of the double helix is drawn from.',
      /* THE SMALLEST HONEST DUPLEX, which is why it is the one kit/nucleic.js
         was tuned on: every rule the renderer has to obey is in it once, and
         nothing else is. It is also the entry that CANNOT test the exceptions
         — see trna, which is here for exactly the opposite reason. */
      pipeline: 'trace',
      variants: [
        { id: '1BNA',
          purpose: 'the double helix, as it was first seen',
          default: true,
          species: 'synthetic',
          label: 'CGCGAATTCGCG', chip: '2 chains',
          source: { kind: 'rcsb', id: '1BNA' },
          read: {
            method: 'x-ray diffraction',
            chains: 2,
            nucleotides: 24,
            residues: 0,
            pairs: 12,
            wobble: 0,
            modified: 0,
            baked: 'dna-1BNA.json' } },
      ],
    },
    {
      key: 'trna', name: 'tRNA-Phe', dir: 'proteins/trna', kind: 'rna',
      does: 'adaptor',
      blurb: 'One strand that folds back on itself: four stems where the '
           + 'chain is paired to its own distant parts, three loops where it '
           + 'is not, and an L when you stop drawing it flat.',
      /* EVERYTHING 1BNA IS NOT, and each difference exercises a path a
         perfect duplex cannot reach — unpaired nucleotides, modified bases
         deposited as HETATM, and a fold with no axis to stand it on. The
         modified bases are the trap: an ATOM-only read returns 62 of 76. */
      pipeline: 'trace',
      variants: [
        { id: '1EHZ',
          purpose: 'the adaptor, and where the ladder stops',
          default: true,
          species: 'yeast',
          label: 'yeast tRNA-Phe', chip: '1 chain',
          source: { kind: 'rcsb', id: '1EHZ' },
          read: {
            method: 'x-ray diffraction',
            chains: 1,
            nucleotides: 76,
            residues: 0,
            pairs: 21,
            wobble: 1,
            modified: 14,
            baked: 'trna-1EHZ.json' } },
      ],
    },
    {
      key: 'zif268', name: 'Zif268', dir: 'proteins/zif268', kind: 'complex',
      /* `does` is printed by proteins/index.html beside the name, the same
         word `proteins.js` prints. It is not on `ProteinLib.DOES` and does not
         need to be: that list is validated for protein entries by
         check-proteins.js, and this file's checker does not police vocabulary
         it has one member of. It becomes a list here the day there are three. */
      does: 'DNA-binding',
      blurb: 'Three zinc fingers reading eleven base pairs: the smallest '
           + 'package in biology for recognising one DNA sequence and not '
           + 'another. A zinc finger is not a fold that binds zinc — it is a '
           + 'fold that does not exist without it.',
      /* THE SMALLEST MIXED FILE, and the rehearsal for the nucleosome: the
         first bake where both polymers come out of one deposition and have to
         share one centre. Centre them separately and each is individually
         correct while the protein lands inside the DNA. */
      pipeline: 'trace',
      variants: [
        { id: '1ZAA',
          purpose: 'a protein reading a sequence',
          default: true,
          species: 'mouse',
          label: 'Zif268 on DNA', chip: '3 chains',
          source: { kind: 'rcsb', id: '1ZAA' },
          read: {
            method: 'x-ray diffraction',
            chains: 3,
            nucleotides: 22,
            residues: 85,
            pairs: 10,
            wobble: 0,
            modified: 0,
            baked: 'zif268-1ZAA.json' } },
      ],
    },
    {
      key: 'nucleosome', name: 'Nucleosome', dir: 'proteins/nucleosome',
      kind: 'complex', does: 'structural',
      blurb: 'Two metres of DNA go into a nucleus ten microns across, and '
           + 'this is the first fold of it: 146 base pairs wound 1.65 turns '
           + 'around eight histones, two copies each of four proteins.',
      /* THE HIGHEST-VALUE ENTRY ON THE WISHLIST, and the last one that was
         gated on engineering rather than on choice — until kit/nucleic.js
         existed its DNA baked as nothing at all. It is proteins/zif268/ at
         twenty times the size and not a new mechanism, which is the whole
         reason the small one was built first. */
      pipeline: 'trace',
      variants: [
        { id: '1AOI',
          purpose: 'DNA packaged, and the tails that are not there',
          default: true,
          species: 'Xenopus histones, human DNA',
          label: 'core particle', chip: '10 chains',
          source: { kind: 'rcsb', id: '1AOI' },
          read: {
            method: 'x-ray diffraction',
            chains: 10,
            nucleotides: 292,
            residues: 805,
            pairs: 132,
            wobble: 0,
            modified: 0,
            baked: 'nucleosome-1AOI.json' } },
      ],
    },
    {
      key: 'polymerase', name: 'DNA polymerase', dir: 'proteins/polymerase',
      kind: 'complex', does: 'enzyme',
      blurb: 'The enzyme that copies DNA, caught with a primer and template '
           + 'in its grip: a hand whose fingers close over each incoming '
           + 'nucleotide only when it pairs with the base being read.',
      /* THREE ENTRIES, TWO ENZYMES, AND THAT IS THE POINT RATHER THAN AN
         UNTIDINESS. The Klentaq pair is one construct open and closed, which
         is the motion; T7 is a different A-family polymerase in the same
         posture, which is what says the hand is the family's and not Taq's.
         RB69 would have been a fourth and is deliberately not here: it is
         B-family, 360 more residues packed around the same hand, and it reads
         as a blob rather than as the shape a textbook draws. It earns its own
         entry when the proofreading beat does.

         EVERY VARIANT IS FITTED ONTO 4KTQ, which is what lets one basis below
         cover all three — a frame is exactly a superposition group. The two
         Klentaq entries match residue by residue; T7 shares no numbering and
         no sequence with them and is fitted by ROLE, on the primer's last ten
         phosphates counted back from the growing end. Its residual, 0.99 A,
         is the evidence that role match is real, and the bench prints it. */
      pipeline: 'trace',
      /* THE ROTATION A HUMAN PICKED. One bare 3x3 rather than a map, because
         these three are one frame; see viewOf below for when it becomes a map.
         `Bake.viewFor` writes no view into a bake once this exists, so the
         bakes say `chosen in the registry` and a page that forgets to pass the
         basis opens in the deposited frame — visibly wrong rather than
         subtly. */
      view: { by: 'human',
              basis: [[0.1387, 0.9772, 0.1719],
                      [0.6805, 0.0353, -0.7339],
                      [-0.7236, 0.2198, -0.6585]] },
      variants: [
        { id: '1T7P',
          purpose: 'the hand a textbook draws, on a replicative polymerase',
          default: true,
          species: 'bacteriophage T7',
          label: 'T7 polymerase + thioredoxin', chip: '4 chains',
          /* WHAT EACH PROTEIN CHAIN IS, AND WHICH ONE IS NOT THE SUBJECT.
             T7 encodes no sliding clamp: it bolts an E. coli thioredoxin to
             its thumb to hold onto the DNA. So chain B is a different protein
             from a different organism, and `partner` says a picture of this
             structure is about the polymerase without it.

             IT IS HERE RATHER THAN IN THE BAKE because it is a decision about
             how the structure should be SHOWN, and three consumers have to
             make the same one — the gallery card, the still baked from it and
             the bench. A still that drew a chain the card hides would break
             the one contract stills.html has, which is that the live box
             replaces the picture with the same picture. */
          chains: { A: { is: 'T7 polymerase (gp5)' },
                    B: { is: 'thioredoxin, borrowed from E. coli',
                         partner: true } },
          source: { kind: 'rcsb', id: '1T7P' },
          read: {
            method: 'x-ray diffraction',
            chains: 4,
            nucleotides: 24,
            residues: 767,
            pairs: 10,
            wobble: 0,
            modified: 1,
            baked: 'polymerase-1T7P.json' } },
        { id: '4KTQ',
          purpose: 'the site empty, fingers open',
          species: 'Thermus aquaticus',
          label: 'Klentaq, binary complex', chip: '3 chains',
          source: { kind: 'rcsb', id: '4KTQ' },
          read: {
            method: 'x-ray diffraction',
            chains: 3,
            nucleotides: 25,
            residues: 539,
            pairs: 12,
            wobble: 0,
            modified: 1,
            baked: 'polymerase-4KTQ.json' } },
        { id: '3KTQ',
          purpose: 'the same enzyme with a nucleotide caught in the site, '
                 + 'fingers closed on it',
          species: 'Thermus aquaticus',
          label: 'Klentaq, ternary complex', chip: '3 chains',
          source: { kind: 'rcsb', id: '3KTQ' },
          read: {
            method: 'x-ray diffraction',
            chains: 3,
            nucleotides: 26,
            residues: 539,
            pairs: 12,
            wobble: 0,
            modified: 1,
            baked: 'polymerase-3KTQ.json' } },
      ],
    },
    {
      key: 'cas9', name: 'Cas9', dir: 'proteins/cas9', kind: 'complex',
      does: 'enzyme',
      blurb: 'The CRISPR nuclease: a protein that carries a strand of RNA and '
           + 'cuts whatever DNA that RNA pairs with. Change the guide and you '
           + 'change the target.',
      /* THREE STATES OF ONE PROTEIN, all fitted onto 5F9R by the baker on the
         part that holds still (RuvC + PI), so a switch shows the REC lobe and
         HNH moving rather than three crystals' origins. One frame, so one
         basis when a human picks it. */
      pipeline: 'trace',
      /* WHICH STRAND IS WHICH is what a reader has to tell apart, so the
         nucleic chains are coloured by role, each a key of MolPalette.strands.
         Guide and target take the two backbone hues so the heteroduplex reads
         as two strands; the displaced strand takes the neutral. The protein
         keeps the ss palette. */
      draw: { byRole: { guide: 'b', target: 'a', nontarget: 'one' } },
      view: { by: 'human',
              basis: [[-0.1713, -0.1876, -0.9672],
                      [-0.3631, 0.9246, -0.115],
                      [0.9159, 0.3315, -0.2265]] },
      variants: [
        { id: '5F9R',
          purpose: 'guide paired to target DNA, ready to cut',
          default: true,
          species: 'Streptococcus pyogenes',
          label: 'bound to target DNA', chip: '4 chains',
          chains: { B: { is: 'Cas9' }, A: { is: 'guide RNA', role: 'guide' },
                    C: { is: 'target DNA strand', role: 'target' },
                    D: { is: 'non-target DNA strand', role: 'nontarget' } },
          source: { kind: 'rcsb', id: '5F9R' },
          read: {
            method: 'x-ray diffraction',
            chains: 4,
            nucleotides: 164,
            residues: 1362,
            pairs: 57,
            wobble: 0,
            modified: 0,
            baked: 'cas9-5F9R.json' } },
        { id: '4ZT0',
          purpose: 'guide loaded, no DNA yet',
          species: 'Streptococcus pyogenes',
          label: 'guide RNA loaded', chip: '2 chains',
          chains: { A: { is: 'Cas9' }, B: { is: 'guide RNA', role: 'guide' } },
          source: { kind: 'rcsb', id: '4ZT0' },
          read: {
            method: 'x-ray diffraction',
            chains: 2,
            nucleotides: 72,
            residues: 1364,
            pairs: 16,
            wobble: 1,
            modified: 0,
            baked: 'cas9-4ZT0.json' } },
        /* `apo`: the empty half of the comparison, so its bake holds no
           nucleic chain on purpose. It stays here beside the states it is
           fitted with rather than in proteins.js, which would split one frame
           across two indexes. */
        { id: '4CMP',
          purpose: 'empty: no guide, REC lobe swung open',
          apo: true,
          species: 'Streptococcus pyogenes',
          label: 'apo, no guide', chip: '1 chain',
          chains: { A: { is: 'Cas9' } },
          source: { kind: 'rcsb', id: '4CMP' },
          read: {
            method: 'x-ray diffraction',
            chains: 1,
            nucleotides: 0,
            residues: 1144,
            pairs: 0,
            wobble: 0,
            modified: 0,
            baked: 'cas9-4CMP.json' } },
      ],
    },
  ];

  const KINDS = ['dna', 'rna', 'complex'];

  /* THE ONES proteins/index.html SHOWS: a structure with a protein in it. That
     page is a gallery of proteins, and a duplex on it would be a category
     error — but Zif268 is a protein that happens to arrive with DNA, and
     leaving it off would make the gallery incomplete for no reason a reader
     could see. Self-maintaining: TBP, p53 and the nucleosome all bake as
     `complex` and appear the day they are indexed. */
  const withProtein = () => STRUCTURES.filter(s => s.kind === 'complex');

  const byKey = k => STRUCTURES.find(s => s.key === k);
  const variantOf = (s, id) => {
    const e = typeof s === 'string' ? byKey(s) : s;
    return e && e.variants.find(v => v.id === id);
  };
  /* THE MARK, NEVER THE FIRST ENTRY. Falling back to `variants[0]` makes the
     order of the list a decision nobody wrote down: adding a second variant
     above the first silently re-aims every bench and card that opens on this
     structure. `proteins.js` learned this already; the rule is the same one
     and `check-nucleic-acids.js` fails a structure with no mark. */
  const defaultOf = s => {
    const e = typeof s === 'string' ? byKey(s) : s;
    return (e && e.variants.find(v => v.default)) || null;
  };

  /* THE CHOSEN ROTATION, and every consumer asks THIS rather than reading the
     field — it is everyone calling one function that stops a bench and a
     gallery card becoming two opinions about which way a molecule faces.
     `proteins.js`'s `viewOf` is the same function on the other index, and the
     two must not drift: a bare 3x3 is one frame that every variant wears, and
     a map keyed by frame name is a structure whose variants sit at more than
     one scale, each variant naming its `frame`.

     A FRAME IS EXACTLY A SUPERPOSITION GROUP. Views that share a rotation are
     views that share coordinates, so a structure whose variants are fitted
     onto one reference takes one basis; one that is not, must not.

     Null is the honest answer for a structure nobody has aimed: its bake's
     own solved basis stands, and the checker allows exactly that bake to carry
     a view. */
  function viewOf(s, v) {
    const e = typeof s === 'string' ? byKey(s) : s;
    if (!e || !e.view || e.view.by !== 'human' || !e.view.basis) return null;
    const b = e.view.basis;
    if (Array.isArray(b)) return b;
    const at = v || defaultOf(e);
    return (at && b[at.frame]) || null;
  }

  /* THE CHAINS A PICTURE OF THIS VARIANT IS ABOUT, and the ones it is not.
     A partner is in the file and not in the subject — a clamp, a Fab, a lid.
     `partnersOf` is the declaration; `drawnOf` turns it into the chain list
     `kit/proteinbox.js` takes, against a trace, and returns null where there
     is nothing to leave out so the box keeps its own default.

     A PAGE THAT WANTS THE PARTNER ASKS FOR IT. The bench has a checkbox; the
     gallery card and its still do not, and they are the reason this lives in
     the index rather than in each page. */
  const partnersOf = (s, v) => {
    const e = typeof s === 'string' ? byKey(s) : s;
    const at = v || defaultOf(e);
    const c = at && at.chains;
    return c ? Object.keys(c).filter(id => c[id].partner) : [];
  };

  const drawnOf = (s, v, t) => {
    const skip = partnersOf(s, v);
    if (!skip.length || !t || !t.order) return null;
    return t.order.filter(id => !skip.includes(id)).join(',');
  };

  /* THE COLOURS A PICTURE OF THIS VARIANT WEARS, for kit/proteinbox.js's
     `colors`: each chain with a `role` the entry's `draw.byRole` names, in
     MolPalette.strands. Null where nothing is named, so the box keeps its
     defaults. The bench, the card and the still all ask this, so they cannot
     disagree about which strand is magenta. */
  const colorsOf = (s, v) => {
    const e = typeof s === 'string' ? byKey(s) : s;
    const at = v || defaultOf(e);
    const by = e && e.draw && e.draw.byRole;
    const pal = typeof MolPalette !== 'undefined' && MolPalette.strands;
    if (!by || !pal || !at || !at.chains) return null;
    const byChain = {};
    for (const [id, c] of Object.entries(at.chains))
      if (c.role && pal[by[c.role]] !== undefined) byChain[id] = pal[by[c.role]];
    return Object.keys(byChain).length ? { byChain } : null;
  };

  /* The bake's path, from the entry and the variant — so a bench names a
     structure and not a file, and a renamed bake is one edit here. */
  const bakedPath = (s, id) => {
    const e = typeof s === 'string' ? byKey(s) : s;
    const v = variantOf(e, id) || defaultOf(e);
    return v && (e.dir + '/data/' + v.read.baked);
  };

  /* RCSB's own pages, built from the id rather than stored. A URL in a
     registry is one more thing to mistype, and every id here can produce it. */
  const urls = id => ({
    rcsb: 'https://www.rcsb.org/structure/' + id,
    pdb: 'https://files.rcsb.org/download/' + id + '.pdb',
  });

  global.NucleicAcids = { STRUCTURES, KINDS, byKey, variantOf, defaultOf,
                          bakedPath, urls, withProtein, viewOf,
                          partnersOf, drawnOf, colorsOf };
  if (typeof module === 'object' && module.exports)
    module.exports = global.NucleicAcids;
})(typeof window !== 'undefined' ? window : globalThis);
