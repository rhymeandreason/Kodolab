/* =====================================================================
 *  palette.js — atom + bond colours, and display radii.
 *
 *  Loaded BEFORE molecules.js on every page (and by lib-node.js for the
 *  checkers). molecules.js re-exports it as MolLib.PALETTE, so every reader
 *  still says MolLib.PALETTE.atoms.O — this file is only where the numbers
 *  live.
 *
 * ---------------------------------------------------------------------
 *  THESE ARE HOUSE COLOURS
 * ---------------------------------------------------------------------
 *  They're CPK-adjacent — red oxygen, blue nitrogen, green chlorine, orange
 *  phosphorus — so a student still transfers to a textbook figure or a
 *  PubChem page. But each one is muted and warmed for the cream paper this
 *  sandbox is drawn on. 
 *  Two choices that are load-bearing rather than cosmetic:
 *    - H is a pale steel (0xb9c2d0), not white. White hydrogens have no edge
 *      against cream; the steel keeps them readable as objects.
 *    - Na (violet) and K (blue) are pushed well apart. molecule-builder.html
 *      shows NaCl and KCl on adjacent tabs, and the standard palettes put
 *      those two nearly on top of each other.
 * ===================================================================== */
(function(global){
  'use strict';

  const PALETTE = {
    // ---- atoms (hex ints) ---------------------------------------------
    // These double as the swatches in water-lab's Debug ▸ Colours tab;
    // editing PALETTE.atoms live keeps every molecule on the page consistent.
    atoms: {
      O:  0xd6362e,   // oxygen   — red
      H:  0xb9c2d0,   // hydrogen — pale steel
      Na: 0x9a3fe0,   // sodium   — violet
      Cl: 0x1fa968,   // chloride — green
      K:  0x0054C0,   // potassium — blue (distinct from Na)
      Mg: 0xcf3b74,   // magnesium — rose. Third metal on the builder's ionic
                      // tabs, so it has to clear violet AND blue as well as
                      // chlorine's green: pushed warm and pink, the one
                      // direction Na and K are not.
      C:  0x3a3a3a,   // carbon   — charcoal
      N:  0x3f6ae0,   // nitrogen — blue
      S:  0xe0b93a,   // sulfur   — goldenrod (cysteine / methionine)
      Fe: 0xa8321a,   // iron     — rust. The one atom here that arrives only
                      // from a DEPOSITION: it is a heme's metal, never part of
                      // a spec, so it has a colour and deliberately no display
                      // radius — kit/proteinbox.js sizes it as a multiple of
                      // carbon so it stays the biggest atom in the group at
                      // whatever scale the ring is drawn.
      Zn: 0x9c8fbe,   // zinc — muted violet. Third of the deposition-only
                      // metals, so like Fe and Co it has a colour and no
                      // display radius. STRUCTURAL rather than catalytic where
                      // it turns up here: a zinc finger is not a fold that
                      // binds zinc, it is a fold that does not exist without
                      // it, so the metal has to read as part of the protein
                      // rather than as something bound to it. Violet keeps it
                      // clear of iron's rust and cobalt's teal, and clear of
                      // the base family it sits beside on a DNA complex.
      Co: 0x2f7f8f,   // cobalt — deep teal. Like Fe it arrives only from a
                      // DEPOSITION and has no display radius; proteinbox sizes
                      // both off carbon. NOT cobalt blue, which is the one
                      // colour the palette cannot spare: nitrogen's indigo and
                      // potassium's blue are both there already, and a metal
                      // that reads as either is worse than a metal that reads
                      // as no colour in particular. Teal is unclaimed and
                      // clears chlorine's green.
      Ca: 0xcbbfa6,   // calcium — pale mineral. A fourth deposition-only metal,
                      // so like Fe, Zn and Co it has a colour and deliberately
                      // no display radius. It is the ONE metal here that is
                      // usually standing in for another: a crystallographer
                      // swaps Ca for Mg to stop a reaction mid-turnover, so it
                      // must not read as a shade of magnesium's rose or the
                      // substitution becomes invisible. Kept unsaturated and
                      // lighter than sulfur's goldenrod, which is the only
                      // warm neutral it could otherwise be taken for.
      P:  0xe07b1f,   // phosphorus — orange (CPK). Deliberately the warmest atom
                      // in the palette: in glycolysis the phosphate IS the energy
                      // currency, so every P a student sees is "something ATP paid
                      // for or will be paid back". No other lesson uses P, so it
                      // can't be confused with sulfur's goldenrod.
    },
    // ---- bonds: a bond's colour is a lesson, not an element ------------
    bonds: {
      covalent:  0xb3a892,   // covalent stick — muted stone on cream
      hbond:     0x0042aa,   // hydrogen bond  — deep blue
      iondipole: 0xd9791e,   // ion–dipole bond — deep amber
      condense:  0x6a5acd,   // A BOND MADE BY DEHYDRATION SYNTHESIS — slate
                             // violet, so a newly-formed link reads distinct
                             // from the ordinary covalent sticks around it.
                             // One colour for one reaction: the peptide bond,
                             // the glycosidic bond and the phosphoester are the
                             // same event on different groups, and a page that
                             // gave each its own colour would be saying they
                             // are different chemistry. Was `peptide`, which
                             // named the protein case as though it were the
                             // whole rule. fx.js's condense() flares in it.
      lonepair:  0x2fb0ff,   // a LONE PAIR (lobes/lobes.js) — the place an
                             // H-bond can land, so it is deliberately in
                             // `hbond`'s family and deliberately not the same
                             // number. A lobe is a translucent VOLUME, and
                             // `hbond`'s navy at 46% over cream comes out
                             // periwinkle — the same hex would have stopped
                             // reading as the same colour. Lifted and pushed
                             // toward cyan instead: bright enough to survive
                             // the alpha, and clear of nitrogen's indigo
                             // (0x3f6ae0), which it has to sit on top of all
                             // over the nucleobases. Separate keys so
                             // retuning one cannot silently restyle the other.
    },
    // ---- bases: a nucleotide's identity, carried by half a rung ---------
    // kit/nucleic.js splits every base pair at its own hydrogen bonds and
    // colours each half by which base it came from, the same split-stick
    // convention kit/proteinbox.js uses inside a pocket. So these four are
    // read at 2 A wide against the paper AND against each other, in pairs
    // that are always adjacent: G with C, A with T or U.
    //
    // THE PAIRING PARTNERS ARE COMPLEMENTARY IN HUE, not merely different.
    // A reader learns G-C and A-T as two colour combinations before learning
    // them as letters, so the pair has to read as one object with two halves
    // rather than as two unrelated bars. Purines are the darker half of each
    // pair (G, A), which also puts the larger ring on the heavier colour.
    //
    // T and U are the SAME colour deliberately: they are the same base to
    // everything except the 5-methyl, and a lesson comparing DNA to RNA wants
    // the reader looking at the backbone, not at a colour change nobody
    // explained.
    bases: {
      G: 0x3f6ae0,   // guanine  — indigo, cytosine's partner
      C: 0x63c1d8,   // cytosine — pale cyan
      A: 0xc4452f,   // adenine  — deep red, thymine/uracil's partner
      T: 0xe0a03c,   // thymine  — warm amber
      U: 0xe0a03c,   // uracil   — the same amber, on purpose
      X: 0x8a8578,   // a base the file names and this repo cannot letter:
                     // stone, so it reads as "not one of the four" rather
                     // than as a fifth base
    },
    // ---- the four histones ------------------------------------------------
    // A nucleosome is eight chains of ONE fold, so the ss palette answers the
    // wrong question there: what a reader has to tell apart is which histone,
    // and the octamer's whole shape is (H3-H4)2 with two H2A-H2B dimers. The
    // two copies of a histone share a colour, because they are the same
    // protein and the picture should say the octamer is four PAIRS.
    //
    // They have to clear two families at once, which is what fixes them here
    // rather than leaving them to a page: `bases` sits on the rungs threading
    // right through the octamer, and `strands` is the DNA's own backbone
    // wrapped around it. Green and magenta are spoken for by the second, and
    // indigo, cyan, red and amber by the first — so these four are muted and
    // sit in the gaps between: teal, ochre, violet, terracotta.
    histones: {
      H3:  0x3f7f8c,
      H4:  0xa8823f,
      H2A: 0x6d5f9e,
      H2B: 0x9c5f52,
    },
    // ---- secondary structure: how kit/ribbon.js's cartoon is coloured -----
    // The house ss palette, and it lived inside kit/proteinbox.js as `RIB`
    // until a second consumer needed it. Coil is a warm grey so the parts that
    // are not making a claim recede; helix takes the same deep blue as an
    // H-bond, and strand the amber the ion-dipole bond uses.
    ss: {
      C: 0x7d8c7a,   // coil
      H: 0x0042aa,   // helix
      E: 0xc2571b,   // strand
    },
    // ---- strands: the sugar-phosphate backbone kit/nucleic.js draws --------
    // The quiet channel, and deliberately so. `bases` above are all saturated
    // and light, because the rungs are what a reader is meant to land on; a
    // backbone that goes anywhere near them starts reading as a fifth and
    // sixth base, which is what a blue-and-orange pair did before these.
    //
    // GREEN AND MAGENTA ARE THE TWO HUES `bases` LEAVES FREE — nothing in it
    // is either — and they are far enough apart in the blue channel to stay
    // separable for a reader who cannot use the red-green one. Two strands
    // have to be told apart or antiparallel is invisible, and that is the only
    // thing a backbone's colour has to say.
    //
    // THESE ARE LIGHTER IN THE FILE THAN THEY LOOK ON SCREEN. lib/scene.js
    // renders with LinearEncoding and no tone mapping, so every colour here
    // reaches the screen darker than its hex — house-wide, and not something
    // one page gets to change. A hex picked by eye off a swatch always comes
    // out disappointing. Judge them in the render.
    strands: {
      a:   0x4ad18c,   // first strand  — green
      b:   0xef73ad,   // second strand — magenta
      one: 0xd8d2c4,   // a chain with nothing to be told apart from: tRNA is
                       // ONE strand paired to itself, so a second colour there
                       // would claim a second molecule
    },
    /* ---- organelles ---------------------------------------------------
       ONE ORGANELLE, ONE COLOUR, wherever it is drawn. cell/animalcell.js chose
       these by eye against the cream paper and typed them inline; they are
       the house colours now, because the animal cell is where a student meets an
       organelle first and every later view of one has to agree with it. A
       lesson that zooms from the cut cell into a mitochondrion's inner
       membrane must not arrive somewhere a different colour.

       `outer` / `inner` / `rim` are the cut cell's shell: the outside face,
       the cut face (darker — a cut edge reads as depth), and the rim between.

       `head` / `tail` TINT A BILAYER drawn inside that organelle
       (membrane/membrane.js's `context`). Both are derived from the
       organelle's own colour, and they keep the relationship the plasma
       membrane has always had: a saturated head over a paler, warmer tail.
       So the sheet still reads as the same bilayer everywhere — the tint
       says which organelle you are standing in, not what the membrane is
       made of. */
    organelles: {
      /* A CUT SHELL is three colours: `outer` the outside face, `inner` the
         cut face (darker, so a cut edge reads as depth), `rim` the band
         between. An organelle drawn as ribbons instead carries `side` and
         `top` — the ER and the mitochondrion's cristae. */
      plasma:        { outer:0xee8e84, inner:0xa8132a, rim:0xf4b0a6, head:0xe0705c, tail:0xf0c98a },
      /* `cristaSide` and `cristaTop` ARE THE INNER MEMBRANE, at both levels
         of detail: the face of the sheet and the lighter band at its cut
         edge. The cut organelle paints the two on a swept line; the detailed
         one paints them as the head and tail bands of a bilayer in section.
         They are PALE against the outer membrane on purpose — the inner
         membrane is most of what a reader sees looking down into the
         opening, and the outer one is the ring around it, so the dark
         orange belongs on the outside. `cristaTop` is lighter than
         `cristaSide` but not white: white there leaves a bar in a thin
         orange ring instead of an organelle. */
      mitochondrion: { outer:0xe0552f, inner:0xe2775b, rim:0xf4b8a4, head:0xd9612f, tail:0xeeba7e,
                       cristaSide:0xf2a3ae, cristaTop:0xfbcdc7,
                       /* `matrix` is the fluid the cristae fold into, paler
                          than the membranes around it as it is in every
                          micrograph. `dna` is the organelle's own circular
                          genome — the plainest evidence it was once a free
                          bacterium, so it is drawn, not just asserted. */
                       matrix:0xf7c9ad, dna:0x8f2f3c,
                       /* `lumen` is ONE colour for ONE compartment: the
                          intermembrane space and the inside of every crista
                          are the same space, joined through the crista
                          junctions, and the protons a complex pumps land in
                          all of it. Drawn as two colours it would say two
                          compartments, which is the misconception the
                          detailed organelle exists to kill. */
                       lumen:0xfae3d2 },
      /* ---- plant only: PLASTIDS ----
         A chloroplast and an amyloplast are one organelle in two states —
         a tuber's amyloplast greens on a windowsill — but they are drawn
         with DIFFERENT envelopes, because in a cell you tell them apart at a
         glance and the colour is what does it. What says they are kin is
         that they are built by the same shell code as each other and as the
         mitochondrion (cell/organelles.js): two membranes, a lumen, a folded
         or packed interior. The kinship is in the construction, the identity
         is in the colour.
         `head`/`tail` tint a bilayer set inside one (membrane/sheet.js's
         `context`, which LightReactions sets to the thylakoid). */
      /* `thylakoid` is a granum's stacked discs, `lamella` the sheets that
         run between grana — the same membrane, unstacked, so it is the same
         green a shade lighter and not a colour of its own. `stroma` is the
         FLUID they sit in, which is why it is the pale one. */
      chloroplast:   { outer:0x4fc22e, inner:0x2f8f22, rim:0x8fe25a, head:0x4fc22e, tail:0xc4e79a,
                       thylakoid:0x178a2a, lamella:0x2f9c3e, stroma:0xa9d383,
                       envelopeInner:0x3ba828,
                       ribosome:0x46923c,   // 70S, the bacterial kind: its own dark green, not the ER's maroon
                       /* `lumen` is the space INSIDE a thylakoid, one colour
                          for grana and lamellae alike: it is one space, the
                          way a mitochondrion's crista lumen and intermembrane
                          space are one. `dna` is set below to the
                          mitochondrion's: both are a bacterium's genome and
                          a reader who has met one should recognise the other. */
                       lumen:0xe4f3c6, dna:null,
                       /* `granum` is the lit face of a stacked disc in the detailed
                          organelle, a lime against which the dark gaps between coins
                          read; the cut cell keeps its darker `thylakoid`. */
                       granum:0x6cc93f },
      /* Deeper than it looks it should be: the envelope is drawn TRANSLUCENT
         (organelles.js's amyloplast), so a near-white here washes out to
         nothing over the pale grains and the organelle loses its edge. */
      amyloplast:    { outer:0xd3d6b4, inner:0xb6b995, rim:0xe4e6cf,
                       starch:0xe3d7b4, hilum:0xc2b184 },
      nucleus:       { outer:0x3f6cb5, inner:0x4a78c0, rim:0x9cb9e6, head:0x4a78c0, tail:0xb9c9e8,
                       nucleolus:0xf6b64a, chromatin:0x3d64a8, pore:0x274a8f },
      er:            { side:0xd9426d, top:0xf6c0ce, ribosome:0x7c1030, head:0xd9426d, tail:0xf6c0ce },
      golgi:         { outer:0x7c85cf, inner:0x7c85cf, rim:0xb4bae6, head:0x7c85cf, tail:0xc2c7ea,
                       vesicle:0x8b93da },
      lysosome:      { outer:0xec6f95, inner:0xd94f6a, rim:0xf3bdcb, head:0xec6f95, tail:0xf3bdcb },
      /* No membrane, so no head/tail: a bilayer cannot be set inside a
         centrosome, and an entry that offered one would invite a page to
         try. */
      centrosome:    { outer:0x6fbe62, microtubule:0x8bd07c },
      /* ---- plant only ----
         The central vacuole's membrane is the TONOPLAST, a bilayer like any
         other, so it carries head/tail. `sap` is the solution inside, which
         is what the shell is filled with and what a page draws when it wants
         to show the vacuole holding something. NOT tied to the lysosome:
         the two do overlapping lytic work in different cells, but that is
         convergence, not homology, and one colour would teach otherwise. */
      /* `outer` is the water surface, and it is DEEPER THAN IT LOOKS ON A
         SWATCH on purpose: the vacuole is three translucent layers stacked
         over a pale cytoplasm, and each one lightens what is behind it, so a
         colour picked to look right alone comes out white in place. */
      vacuole:       { outer:0x4f9fb2, inner:0x3d8895, rim:0xbfe6d8, head:0x63b0c0, tail:0xd8cfa6,
                       sap:0xd8cfa6 },
      /* The wall's faces are PER TISSUE (see `plantTissue` below) because a
         cactus wall and a leaf wall are not the same thickness or the same
         colour. What lives here is the middle lamella, the pectin line
         shared with the neighbouring cell, which does not vary: it is
         darker than either face because it is the seam between two cells.
         No head/tail — a wall is not a bilayer, and an entry offering one
         would invite a page to set one inside. */
      wall:          { lamella:0x86c24a },
      /* A plasmodesma is lined by plasma membrane continuous into the next
         cell, and a Hechtian strand is that same membrane left stretched
         across the gap when the protoplast pulls away — which is why the
         strand's colour lives on this entry and not on its own. */
      plasmodesma:   { outer:0x35907a, hechtian:0x6cc9a8 },
    },
    /* ---- plant tissues -------------------------------------------------
       The wall and the cytosol are the two things in a plant cell that are
       NOT shared with the animal cell — one is extracellular, the other is
       not an organelle — so they are the two that may carry a plant's own
       greens without breaking one-organelle-one-colour. They vary by tissue
       because a leaf, a root, a tuber and a cactus really do differ here.
       `wall` is the outer face, `wallRim` the cut rim (the inner face is the
       same, a shade down).

       `membrane` IS A DELIBERATE EXCEPTION to one-organelle-one-colour: the
       plasma membrane is the same organelle in both cells, and the animal
       cell paints it salmon. A plant cell is a green cell in a green wall,
       and a salmon band wrapped round the protoplast reads as a wound rather
       than as a boundary. So the plant keeps its own greens here, and the
       link back to the animal cell's membrane is carried by the plasmodesmata
       instead. Do not copy this exception to another organelle.

       `head` / `tail` PAINT THE CUT LIP AS A BILAYER, the same two bands the
       animal cell's lip carries and the same relationship — a saturated head
       over a paler, warmer tail — in this tissue's green. `head` is a shade
       under `membrane` so the leaflet reads as a line against the flank it
       is continuous with.

       Everything else in the cell takes the house colour from `organelles`. */
    plantTissue: {
      leaf:   { wall:0xa3e64e, wallRim:0xd9f7a8, cytosol:0x8fdcb8, membrane:0x3fa080, head:0x2f7d63, tail:0xa8dcb4 },
      root:   { wall:0xb8e07a, wallRim:0xe2f3bb, cytosol:0xa3dfc6, membrane:0x4ea88c, head:0x3c866f, tail:0xb2e0bd },
      potato: { wall:0xc7e58b, wallRim:0xe9f5c9, cytosol:0xabe0cc, membrane:0x55ab92, head:0x428874, tail:0xb8e3c3 },
      cactus: { wall:0xbfe08a, wallRim:0xeaf6cf, cytosol:0x93dbbd, membrane:0x46a385, head:0x357f68, tail:0xacdcb8 },
    },
    // ---- default display radii (scene units, stylised — enlarged for
    // legibility). NOT van der Waals radii, and check-molecules.js checks
    // every bond clears the sum of its two. See molecules.js's header.
    // Mg is SMALLER than Na (0.60 vs 0.70) and that is not a styling choice:
    // Mg²⁺ pulls two charges' worth on the same shell count, so the ion is
    // tighter than Na⁺ despite magnesium sitting one place to the right. The
    // builder's MgCl₂ tab is where a student can see it next to NaCl.
    /* ---- the respiratory machinery ----
       The complexes and the synthase are drawn twice: once in the inner
       membrane of cell/organelles.js's detailed mitochondrion, and once as
       a machine in membrane/membrane.js's bilayer. A student zooms from one
       to the other, so the gold thing making ATP has to be the same gold
       both times. membrane.js typed these inline first; they are here now
       and both read them.

       THE FOUR COMPLEXES ARE ONE FAMILY OF BLUES, because they are one
       chain and telling them apart is the label's job, not the colour's.
       Complex II is the paler one on purpose: it is the member that does
       NOT pump, and the eye should be able to find it. */
    respiration: {
      /* ONE BLUE FOR THE CHAIN. chemiosmosis/electron-transport.js and
         cell/organelles.js both draw complexes I, III and IV, at two rungs;
         they are the same machines, so they are one colour and the label
         does the telling apart. Complex II
         is the exception, and the only one: it is the member that does NOT
         pump, which is why FADH2 is worth less ATP than NADH, and a reader
         should be able to find it without reading. */
      complex:0x4d5fa6, complexII:0x8b93c0,
      electron:0x2fd8e0,      // an electron in transit: electric cyan, apart from the photon's yellow and the synthase's gold
      synthase:0xd9a13b, stalk:0xb8862c,
      leak:0x8e939b,          // an uncoupler's hole: grey, because it is a hole
      /* THE TWO DOORS THE ATP LEAVES BY, and neither is part of the chain, so
         neither is in the family of blues. The translocase is a carrier in the
         INNER membrane, the porin a hole in the OUTER one, and a reader has to
         tell "a machine that swaps one thing for another" from "an opening
         that lets anything small through". Plum for the machine, and the
         porin takes the leak's own grey: it is the same statement, a hole
         that does not choose. */
      translocase:0x9a5f8c,
      /* THE FUEL CARRIER, and one colour for both of its states: NADH and
         NAD⁺ are the same molecule holding different cargo, and giving the
         spent one its own colour would draw two substances where there is
         one. Cool and dark, clear of the chain's blues, the synthase's gold
         and the aquaporin's teal. */
      carrier:0x2f7d8c,
      /* THE TWO SHUTTLES OF THE SPLIT CHAIN, and neither is a complex, so
         neither is a blue. One purple for both, told apart by shape: ubiquinone
         round, cytochrome c oblong. Not their real colours
         (quinones are yellow, cytochrome c red with its heme): olive sat on
         the lipid's gold tails, and red beside oxygen's red read as an O₂. */
      quinone:0x8f4fa6, cytc:0x8f4fa6,
      porin:0x8e939b,
      /* THE FUEL AND ITS DOOR, for cell/animalcell.js's traffic. Glucose's
         halo is a bright yellow that stands off a red cytoplasm; the GLUT is
         organelles.plasma.outer a step darker, so the door reads as part of
         the membrane it sits in. */
      glucose:0xffd84a, glut:0xbc5a50,
      /* A PROTON IS A HYDROGEN, so it is atoms.H and not a colour of its own.
         Set below the literal, because an object cannot read itself while it
         is being built. It was a red once, which made the one thing crossing
         the membrane look like an element the lesson had not introduced; a
         student who sees the same pale steel on a water's hydrogens in
         glycolysis reads the gradient as the same atom, moved. */
      proton:null,
    },

    radii: { O:0.95, H:0.55, C:0.85, N:0.90, S:1.05, Na:0.70, Cl:1.24, K:0.85, P:1.00,
             Mg:0.60 },
  };

  PALETTE.respiration.proton = PALETTE.atoms.H;
  PALETTE.organelles.chloroplast.dna = PALETTE.organelles.mitochondrion.dna;

  /* THE LIGHT REACTIONS, at cell/chloroplast.js's rung and
     chemiosmosis/light-reactions.js's. Three machines where respiration
     draws one family: the two photosystems are the parts a photosynthesis
     lesson names, so each gets a hue of its own. THE PUMP IS THE CHAIN'S
     INDIGO: cytochrome b6f does complex III's job, so it is read from
     `respiration.complex` rather than typed, and the synthase is the same
     gold in every box. Set after the literal for the same reason the proton
     is. */
  PALETTE.photosynthesis = {
    psii: 0x2b7f9c,      // splits water: teal, on the blue side of the chain
    psi:  0x7a5aa6,      // lifts the electron again for NADPH: violet
    b6f: PALETTE.respiration.complex,
    synthase: PALETTE.respiration.synthase,
    stalk: PALETTE.respiration.stalk,
    proton: PALETTE.atoms.H,
    oxygen: PALETTE.atoms.O,
    photon: 0xffd452,    // absorbed light: warm, and no pigment's colour
    /* THE TWO SHUTTLES, and neither is a machine. Plastoquinone is a quinone,
       so it is ubiquinone's olive. Plastocyanin is blue for its copper, the
       colour it really is, and lighter than the chain so it is not read as one. */
    plastoquinone: PALETTE.respiration.quinone,
    plastocyanin: 0x4aa3d8,
    carrier: PALETTE.respiration.carrier,   // NADP⁺/NADPH, NAD⁺'s colour: the same statement
    /* THE ANTENNA is chlorophyll, so it is the one green in the chain: each
       photosystem keeps its own hue and the light-harvesting lobes flanking it
       is the pigment's, so a photon visibly lands on green and the excitation
       moves onto the machine. Lighter than the thylakoid's lipid heads. */
    antenna: 0x5fb35a,
    photosystemCap: 0x3f8a3c,   // the OEC and PSI's stromal ridge: the photosystem's own green, a shade down
    chlorophyll: 0x2f7d32,   // the pigment discs on the antenna: darker than the lobe they stud
    /* ON THE STROMA SIDE, where NADPH is made. Ferredoxin is a small
       iron-sulfur protein, an iron rust that is neither oxygen's red nor the
       carrier's teal; FNR is the enzyme with the flavin, an ochre kept clear
       of the synthase's gold so the two stroma-side machines read apart. */
    ferredoxin: 0xb4652f,
    fnr: 0x9c8a3c,
  };

  global.MolPalette = PALETTE;
  if(typeof module==='object' && module.exports) module.exports = { PALETTE };
})(typeof window!=='undefined' ? window : globalThis);
