/* =====================================================================
 *  mapcontent.js — the door map's content, and nothing that draws it.
 *  Loaded as a classic script BEFORE tests/question-composer.html's own
 *  script;
 *  exposes window.MapContent = { DOORS, CONCEPTS, QUESTIONS, CONTENT,
 *  PLACEMENTS }.
 *
 *  This is CONTENT, not code: no behaviour, no DOM, nothing to call.
 *  It is split out of the page so it can be edited somewhere better
 *  than an HTML file — map-cms.html reads and writes it through the dev
 *  server's /api/mapcontent, the same path questions-cms.html uses.
 *
 *  CONCEPT, NOT MODULE. A node here used to be called a module, which
 *  collided head-on with the code modules in lib/ and with Modules.md: two
 *  unrelated things, one word, in a repo that names both constantly. A node
 *  on this map is a CONCEPT — one claim, worth one card.
 *
 *  NOT lib/questions.js. That bank cuts the same ground into 27 COARSE
 *  buckets ('water', 'bonds', 'shape'); this cuts it into the concepts a
 *  lesson actually teaches ('polarity', 'hbond', 'ice', 'heat'), which is the
 *  decomposition the map needs and the reason the two are separate files
 *  rather than one. 54 of the question texts started life there.
 *
 *  ---------------------------------------------------------------------
 *  DOORS — a door is a question big enough to hold a region. `tint` is the
 *  door's colour on the map, and every concept wears its own door's — which
 *  is how a crossing is visible on a card that looks like all the rest. `open` says
 *  whether it has been written; the others are named because concepts
 *  point at them, and they are what a second door costs: content, not a
 *  code change.
 *
 *  CONCEPTS — one claim each, and `host` is the page that teaches it.
 *  `alt` is the OTHER WORDS a reader might type for this card, ` · `
 *  separated, and it exists because a name is not the only way in: nobody
 *  types "Simple diffusion", they type "diffusion", and "buffer" is what a
 *  student asks for when the card is called Acids & pH. It replaced matching
 *  the reader's words against the ID, which only worked where somebody had
 *  happened to pick a short one — `ice` and `geometry` landed, `cooperat` and
 *  `hydrophob` were truncations nobody would ever type, and `condense`
 *  answered for Dehydration & hydrolysis by accident. An alternate is
 *  authored, so it says what it is.
 *
 *  `alt` is for KNOWING, not for ranking. It is matched exactly (after the
 *  composer's `norm`) and is deliberately NOT baked into the claim's vector:
 *  a sentence that measured well is not improved by having synonyms stapled
 *  to it, and a two-word row embedded against a corpus of sentences ranks
 *  badly. Two alternates must not normalise to the same text — first match
 *  wins and which card it is would be an accident of table order — and the
 *  checker fails on it.
 *  `rank` is its place in ITS door's fan, so a door opens on its rank 1
 *  concepts and not on all nine. `state` is CLAUDE.md's vocabulary
 *  (built / engine / planned) and `away` marks a concept belonging to
 *  another door, which the map dots in a different colour so a crossing
 *  is visible.
 *
 *  QUESTIONS — one row each, and QUESTION-MAJOR on purpose:
 *
 *      ['Why is water bent and CO₂ straight?', { polarity:1, geometry:1 }]
 *        the question                            the concepts, and the rank
 *                                                the question has ON EACH
 *
 *  The map crosses from one concept to another THROUGH a shared question,
 *  so a question is one node however many concepts name it. Written
 *  concept-major, the same question appeared once per concept and a
 *  re-wording in one of them silently split that node in two — breaking
 *  the exact thing the map exists to do. One row cannot drift from
 *  itself.
 *
 *  RANK belongs to the EDGE, not to the question: 27 of these carry a
 *  different rank on different concepts, because rank answers "is this a
 *  good FIRST thing to ask on this card?" and the answer changes with
 *  the card. 1 introduces from cold, 2 follows up, 3 is depth.
 *
 *  A question naming ONE concept is a caption, not a crossing — it costs a
 *  node and leads nowhere. 28 of these are still that, which is where the
 *  editorial work is.
 *
 *  CONTENT and PLACEMENTS — the units a concept can show, and where each
 *  one sits. Content-major and split in two for the same reason QUESTIONS is
 *  question-major: the thing is one object however many concepts point at it.
 *  Their own headers, below, carry the rest.
 * ===================================================================== */
(function (global) {
  'use strict';

  const DOORS = [
    { id:'water', name:'Water', tint:'#2f7fb5', open:1,
      question:'Why is water the foundation of life?', label:'the water door' },
    { id:'information', name:'Information', tint:'#8a5cc0', open:0,
      question:'How does life copy its instructions without losing them?', label:'the information door' },
    { id:'proteins', name:'Proteins', tint:'#c2553a', open:0,
      question:'How does a chain of amino acids become a machine?', label:'the protein door' },
    { id:'boundaries', name:'Boundaries', tint:'#1f7a5e', open:0,
      /* NOT "...into a cell?". A door's question is now also a QUERY, and `cell`
         collides with "Why does one wrong amino acid sickle a whole cell?" hard
         enough to open the protein door instead — measured 0.863, and two
         phrasings using the word did it. Written to retrieve as well as to
         read, which a door that was only a node never had to be. */
      question:'What gets through a membrane, and what has to be pushed?', label:'the boundary door' },
    { id:'carbon', name:'Carbon', tint:'#5f6672', open:0,
      question:'Why is everything alive built out of carbon?', label:'the carbon door' },
    { id:'energy', name:'Energy', tint:'#c08a1e', open:0,
      question:'Where does the energy in food actually go?', label:'the energy door' },
  ];

  const CONCEPTS = [
    { id:'polarity', name:'Polarity', door:'water', rank:1, state:'built', host:'water-lab · molecule-builder',
      alt:'polar · dipole · partial charge',
      claim:'An uneven share of electrons gives a molecule two charged ends.' },
    { id:'hbond', name:'Hydrogen bonding', door:'water', rank:2, state:'built', host:'water-lab',
      alt:'hbond · h bond · hydrogen bonds',
      claim:'The + H of one water molecule attracts the − O of another.' },
    { id:'solvation', name:'Solvation', door:'water', rank:2, state:'built', host:'water-lab · solvation-lab',
      alt:'dissolving · solvent · hydration shell',
      claim:'Water is polar, so it dissolves anything polar or charged.' },
    { id:'ice', name:'Ice & density', door:'water', rank:3, state:'built', host:'water-lab',
      alt:'ice · density · freezing',
      claim:'Unlike almost every substance, water is less dense as a solid.' },
    { id:'heat', name:'Heat & temperature', door:'water', rank:3, state:'built', host:'water-lab',
      alt:'heat · temperature · specific heat',
      claim:'Water takes a lot of heating, because the energy goes into breaking H-bonds first.' },
    { id:'cohesion', name:'Cohesion & adhesion', door:'water', rank:3, state:'engine', host:'droplet-test · adhesion-test',
      alt:'surface tension · capillary action · adhesion',
      claim:'Water sticks to itself and to other things.' },
    { id:'hydrophob', name:'The hydrophobic effect', door:'water', rank:2, state:'planned',
      alt:'nonpolar · water fearing · oil and water',
      claim:'Oil and water separate because the water gains freedom by it.' },
    { id:'condense', name:'Dehydration & hydrolysis', door:'water', rank:2, state:'planned',
      alt:'hydrolysis · dehydration · condensation',
      claim:'Monomers join by losing a water, and water splits them apart again.' },
    { id:'entropy', name:'Entropy', door:'water', rank:3, state:'planned',
      alt:'disorder · second law',
      claim:'Order can rise in one place as long as more disorder is made somewhere else.' },
    { id:'acids', name:'Acids & pH', door:'water', rank:3, state:'built', host:'molecule-lab',
      alt:'ph · acid · buffer',
      claim:'A buffer trades protons back and forth, so pH barely moves.' },
    { id:'basepair', name:'Base pairing', door:'information', rank:1, state:'built', away:1, host:'dna-lab',
      alt:'base pair · complementary',
      claim:'A pairs only with T and G only with C, because that is where the hydrogen bonds line up.' },
    { id:'replication', name:'Replication & fidelity', door:'information', rank:2, state:'planned', away:1,
      alt:'dna replication · proofreading',
      claim:'Copying is proofread as it goes, and the error rate is low but never zero.' },
    { id:'binding', name:'Binding & recognition', door:'proteins', rank:1, state:'planned', away:1,
      alt:'binding site · ligand · recognition',
      claim:'Two molecules stick because their shapes and charges match, and neither is changed by it.' },
    { id:'enzyme', name:'Enzyme catalysis', door:'proteins', rank:2, state:'engine', away:1, host:'hexokinase/',
      alt:'catalysis · active site',
      claim:'An enzyme lowers the barrier and comes out the other side unchanged.' },
    { id:'levels', name:'Levels of structure', door:'proteins', rank:1, state:'built', away:1, host:'hemoglobin-lab',
      alt:'protein structure · primary structure · secondary structure · tertiary structure · quaternary structure',
      claim:'A protein has four levels of structure, and the sequence decides all four.' },
    { id:'cooperat', name:'Cooperativity', door:'proteins', rank:2, state:'planned', away:1,
      alt:'allostery · allosteric',
      claim:'One oxygen binding changes the shape, and makes the next one easier.' },
    { id:'pumps', name:'Channels & pumps', door:'boundaries', rank:1, state:'built', away:1, host:'membrane-lab',
      alt:'pump · channel · active transport · sodium potassium pump',
      claim:'A channel lets things through; a pump spends ATP to push them the wrong way.' },
    { id:'polymers', name:'Monomers & polymers', door:'carbon', rank:1, state:'planned', away:1,
      alt:'polymer · monomer · macromolecule',
      claim:'Four classes of macromolecule, each one a chain of repeating units.' },
    { id:'glycolysis', name:'Glycolysis', door:'energy', rank:1, state:'built', host:'glycolysis-lab',
      claim:'Ten steps split one sugar in two, spending two ATP to make four.' },
    /* BOTH NAMES IN `alt`, and neither is optional: a textbook picks one and a
       student arrives holding whichever it was. The card is called Krebs
       because krebs-lab is. */
    { id:'krebs', name:'The Krebs cycle', door:'energy', rank:1, state:'built', host:'krebs-lab',
      alt:'krebs · krebs cycle · citric acid cycle · tca cycle · tricarboxylic acid cycle',
      claim:'Eight steps take two carbons off as CO₂ and hand the electrons to NADH, rebuilding the molecule they started from.' },
    /* The concept the two pathway lessons both stop short of, and the one that
       actually makes the ATP. `alt` carries the electron transport chain
       because a reader asking for it is asking for this card until the ETC
       lesson exists. */
    { id:'chemios', name:'Chemiosmosis', door:'energy', rank:2, state:'engine', host:'atp-synthase/',
      alt:'chemiosmosis · atp synthase · electron transport chain · oxidative phosphorylation · proton gradient',
      claim:'Food pays to pump protons out of the mitochondrion; they fall back in through a rotary motor, and that fall is what makes the ATP.' },
    /* The currency card, and the one the other eight hang their cost off.
       `chemios` already claims `atp synthase` in its own alt; a reader typing
       the bare word wants the molecule, not the motor. */
    { id:'atp', name:'ATP', door:'energy', rank:1, state:'built', host:'molecule-viewer · glycolysis-lab',
      alt:'atp · adp · energy currency · phosphate',
      claim:'A phosphate is held on under strain; letting it go is what pays for work elsewhere.' },
    /* What the pathways actually move. Fermentation's whole ledger is this one
       quantity, and the cycle hands its electrons here rather than to ATP. */
    { id:'redox', name:'Electron carriers', door:'energy', rank:2, state:'built', host:'glycolysis-lab · krebs-lab · fermentation-lab',
      alt:'nad · nadh · fad · fadh2 · redox · oxidation · reduction',
      claim:'NAD⁺ and FAD carry electrons from food to the chain that spends them.' },
    /* glycolysis-lab's coupling box IS this card: the figure, the two curves and
       the reversibility verdict. `enzyme` is the protein door's and stays there
       — this is the thermodynamics, not the catalyst. */
    { id:'coupling', name:'Energy coupling', door:'energy', rank:2, state:'built', host:'glycolysis-lab',
      alt:'coupled reaction · endergonic · exergonic · free energy',
      claim:'An uphill reaction runs by being tied to a steeper downhill one.' },
    { id:'ferment', name:'Fermentation', door:'energy', rank:2, state:'built', host:'fermentation-lab',
      alt:'fermentation · anaerobic · lactate · lactic acid · ethanol · alcoholic',
      claim:'With no O₂, pyruvate is spent to empty the carriers, so glycolysis can keep running.' },
    /* krebs-lab calls it the Bridge and numbers it before step 1. Its own card
       because it is where the carbon count drops from three to two, which is
       what the cycle's CO₂ claim rests on. */
    { id:'bridge', name:'Pyruvate oxidation', door:'energy', rank:3, state:'built', host:'krebs-lab',
      alt:'pyruvate oxidation · bridge reaction · acetyl coa · pyruvate dehydrogenase',
      claim:'Pyruvate loses a carbon as CO₂ and the rest is handed to CoA.' },
    /* The modal sim inside glycolysis-lab, which no card pointed at. */
    { id:'massaction', name:'Mass action', door:'energy', rank:3, state:'built', host:'glycolysis-lab',
      alt:'equilibrium · mass action · le chatelier · concentration',
      claim:'A reversible step runs whichever way the amounts on each side push it.' },
    { id:'geometry', name:'Molecular geometry', door:'carbon', rank:2, state:'built', away:1, host:'molecule-builder',
      alt:'geometry · vsepr · bond angle',
      claim:'Electron pairs push each other apart, and that is what sets the shape.' },
    { id:'covalent', name:'Covalent bonding', door:'carbon', rank:1, state:'built', away:1, host:'molecule-builder',
      alt:'covalent bond · sharing electrons',
      claim:'Two atoms share a pair of electrons, and both count them as their own.' },
    { id:'ionic', name:'Ionic bonding', door:'carbon', rank:2, state:'built', away:1, host:'molecule-builder',
      alt:'ionic bond · ion',
      claim:'One atom takes the electron outright, and the two ions hold on by charge.' },
    { id:'osmosis', name:'Osmosis', door:'boundaries', rank:2, state:'planned', away:1,
      alt:'osmotic pressure · tonicity',
      claim:'Water crosses toward the saltier side with nothing pushing it.' },
    { id:'bilayer', name:'The bilayer', door:'boundaries', rank:1, state:'built', away:1, host:'membrane-lab',
      alt:'phospholipid · lipid bilayer',
      claim:'Phospholipids assemble into a sheet on their own, because their tails avoid water.' },
    { id:'denature', name:'Denaturing', door:'proteins', rank:2, state:'planned', away:1,
      alt:'denature · denaturation · unfolding',
      claim:'Heat and acid unfold a protein without breaking a single covalent bond.' },
    { id:'folding', name:'Folding', door:'proteins', rank:1, state:'built', away:1, host:'folding-lab',
      alt:'fold · protein folding',
      claim:'The chain folds to one shape out of astronomically many, and the sequence picks it.' },
    { id:'diffusion', name:'Simple diffusion', door:'boundaries', rank:1, state:'built', away:1, host:'membrane-lab · diffusion/',
      alt:'diffusion · brownian motion',
      claim:'Random motion spreads molecules out; going twice as far takes four times as long.' },
  ];

  const QUESTIONS = [
    ['How do structures self-assemble?',                        { hbond:1, folding:1 }],
    ['Why does water stabilize temperature?',                   { heat:1, hbond:1 }],
    ['Why does ice float?',                                     { ice:1, hbond:1 }],
    ['Why is water the universal solvent?',                     { polarity:1, solvation:1, hbond:1 }],
    ['How does pushing molecules together build a structure?',  { hydrophob:1, folding:1 }],
    ['Why do oil and water not mix?',                           { hydrophob:1, bilayer:2, hbond:1 }],
    ['Why do water molecules stick to each other?',             { polarity:1, hbond:1 }],
    ['How does water build and break down macromolecules?',     { polarity:3, condense:1, acids:3 }],
    ['How high can a tree grow?',                               { cohesion:1, osmosis:2 }],
    ['Why does a water drop bead up on wax paper but soak into a towel?', { hbond:2, cohesion:1 }],
    ['What holds the two DNA strands together?',                { hbond:2, basepair:1 }],
    ['Why does heat separate the DNA strands?',                 { hbond:3, basepair:2, denature:3 }],
    ['Why is an IV 0.9% saline?',                               { solvation:2, osmosis:1 }],
    ['Why are snowflakes six-sided?',                           { ice:1 }],
    ['What makes ice cream creamy?',                            { ice:1 }],
    ['How do deep-sea fish keep their blood from freezing?',    { ice:3, binding:2, folding:2 }],
    ['How do wood frogs survive freezing solid?',               { ice:3, osmosis:2 }],
    ['Why is a fever above 40°C dangerous?',                    { enzyme:2, denature:1 }],
    ['Why does soap work?',                                     { hydrophob:1, bilayer:1 }],
    ['Why does a hole in a membrane heal itself?',              { entropy:1, bilayer:1 }],
    ['Why does breathing fast make you dizzy?',                 { acids:1, diffusion:2 }],
    ['Why does blood pH barely move when you drink Coke?',      { acids:1 }],
    ['Why does milk curdle in lemon juice?',                    { acids:2, denature:2 }],
    ['Why is DNA double-stranded?',                             { basepair:1 }],
    ['Why does the DNA helix twist?',                           { basepair:1 }],
    ['Why do the two DNA strands run in opposite directions?',  { basepair:2, replication:1 }],
    ['Why isn’t the mutation rate zero?',                       { replication:1 }],
    ['How does a protein read DNA without opening it?',         { replication:2, binding:1 }],
    ['Why can’t you use up an enzyme?',                         { binding:1, enzyme:1 }],
    ['Why do lemons and oranges smell different?',              { binding:1 }],
    ['Why is cyanide deadly?',                                  { binding:3, enzyme:1 }],
    ['Why are some people lactose intolerant?',                 { enzyme:1 }],
    ['Why does fructose behave differently from glucose?',      { enzyme:2, glycolysis:3 }],
    ['What makes hair different from silk?',                    { levels:1, folding:2 }],
    ['How does one wrong amino acid cause a disease?',          { levels:1 }],
    ['How do vent bacteria run enzymes above 100°C?',           { levels:2, denature:1 }],
    ['Why does carbon monoxide kill at 0.1% of the air?',       { levels:2, cooperat:1 }],
    ['Why does hemoglobin have four parts and not one?',       { cooperat:1 }],
    ['How does a fetus take oxygen from its mother’s blood?',   { cooperat:2 }],
    ['How does a cell move molecules against their gradient?',  { pumps:1, glycolysis:2, bilayer:2 }],
    ['How does cholera dehydrate you without entering a cell?', { pumps:1, osmosis:1 }],
    ['Why do insects need no lungs?',                           { pumps:2, diffusion:1 }],
    ['Why can you digest starch but not cellulose?',            { polymers:1 }],
    ['What makes a fat saturated?',                             { polymers:2, bilayer:1 }],
    ['How is a polymer built?',                                 { polymers:2, condense:1 }],
    ['Why can’t you sprint a marathon?',                        { glycolysis:1, chemios:2 }],
    /* GLYCOLYSIS MAKES NO CO₂. This row pointed only at glycolysis, which was
       simply wrong: every carbon you breathe out leaves in the bridge step or
       in the cycle. Rank 1 on krebs is where the answer is. */
    ['Where does the CO₂ you exhale come from?',                { krebs:1, glycolysis:2 }],
    ['Why do red blood cells have no mitochondria?',            { glycolysis:2, krebs:2, chemios:2 }],
    ['If glycolysis makes so little ATP, where does the rest come from?',
                                                                { glycolysis:1, krebs:1, chemios:1 }],
    ['What do NADH and FADH₂ actually carry?',                  { krebs:1, chemios:1 }],
    ['Why do you need oxygen if it never touches your food?',   { chemios:1, krebs:2 }],
    ['How does a proton gradient make ATP?',                    { chemios:1, pumps:2 }],
    ['How do salmon cross from salt water to fresh?',           { osmosis:1 }],
    ['How do hibernating animals burn fat as heat?',            { bilayer:3 }],
    ['Why do egg whites turn opaque and solid?',                { denature:1 }],
    ['Why are cells small?',                                    { diffusion:1 }],
  ];

  /* ---------------------------------------------------------------------
   *  CONTENT — the units a concept can SHOW. A concept is a claim; content is
   *  a thing that makes the claim visible, and one concept can have many. That
   *  is why this is content-major with a placement table beside it rather than
   *  a map keyed by concept: `VIEWS` was concept-keyed and could hold exactly
   *  one entry per card, so glycolysis could have a molecule or a video and
   *  never both.
   *
   *  `id` is namespaced by kind so nothing collides with a concept id, and so
   *  a placement row says what it is placing:
   *
   *      w: water sim   b: builder   m: molbox
   *      r: protein drawn ON a concept card   p: a protein SPECIMEN
   *      l: lesson      v: video
   *
   *  HOW A KIND IS PLACED IS THE KIND'S OWN BUSINESS, and the three ways are
   *  not interchangeable:
   *
   *    INLINE  (water, build, molbox, r-protein) mounts a live 3D box in the
   *            concept card's thumb. It costs a WebGL context, browsers cap
   *            those near 8-16, so the page rations them — a card takes the
   *            rank 1 inline item and no more.
   *    BUTTON  (lesson) is an opener under the thumb. A lesson has no still of
   *            its own worth showing; the card it hangs off is the picture.
   *    CARD    (video, p-protein) is its OWN node on the map, hanging off the
   *            concepts that placed it, the way a specimen already did. A video
   *            has a poster, a running time and someone else's name on it —
   *            that is a card's worth of content, not a chip in a corner.
   *
   *  A concept with no inline content grows no picture box at all: a stand-in
   *  that is not that concept's own subject is worse than no picture.
   *
   *  The water scenarios' `frame` blocks are TUNING rather than curriculum —
   *  they are what water/watersim.js's step() takes.
   *
   *  A VIDEO is somebody else's work. `credit` is not decoration and is
   *  printed on the card: `src` is a YouTube id, and the page builds a
   *  youtube-nocookie embed from it so an unopened card makes no third-party
   *  request. `poster` is a LOCAL still for the same reason: a remote
   *  thumbnail would put the map's resting state on someone else's server and
   *  break the card the day the video moves.
   *
   *  `captions` names a local file of `{ tracks: [{ id, label, source,
   *  cues: [{ t, text, step }] }] }`. It is authored rather than fetched:
   *  YouTube publishes no caption text a page can read (the Data API's
   *  captions.download is owner-only, and timedtext serves nothing to a plain
   *  request), and the only track on the glycolysis video is auto-generated
   *  ASR, which renders enzyme names as noise.
   *
   *  A video that is not ours leads with ITS OWN words, credited. A second
   *  track carrying the same beats for a Bio 101 reader is a summary and is
   *  labelled as one. Which is showing is a fact the column prints, because a
   *  column of somebody else's writing with no name on it reads as ours.
   * ------------------------------------------------------------------- */
  const CONTENT = [

  /* ---- inline: water ---- */
  { id:'w:hbond', kind:'water', waters:16,
    frame:{ showHbonds:true, tempEnabled:true, temperature:22 } },
  { id:'w:solvation', kind:'water', waters:14, salt:1,
    frame:{ showHbonds:true, tempEnabled:true, temperature:22 } },
  { id:'w:ice', kind:'water', waters:16,
    frame:{ showHbonds:true, tempEnabled:true, temperature:-8, freezeEnabled:true } },
  { id:'w:heat', kind:'water', waters:16,
    frame:{ showHbonds:true, tempEnabled:true, temperature:85 } },

  /* ---- inline: the bonding builder ----
     A picture of a water would not do for `polarity`: that card's claim is
     about the uneven SHARE, and the builder's flat view is the one that draws
     every valence electron. Every builder item here is passed `fill:true` by
     the page, so it opens finished and STAYS flat — the turn is the concept's
     reward for a molecule the student assembled, and a card the page built has
     not earned it. Turning it is the reader's, through the control. */
  { id:'b:water', kind:'build', recipe:'water' },
  { id:'b:methane', kind:'build', recipe:'methane' },
  { id:'b:nacl', kind:'build', recipe:'nacl' },
  /* The proton actually moving, which is what a pH is. The recipe hands HCl's
     hydrogen to a water and leaves chloride holding the pair — the mechanism
     the buffer claim is made of, though not a buffer itself. Named rather than
     left blank because a proton changing hands is the thing, and no still of a
     species says it. */
  { id:'b:hcl', kind:'build', recipe:'hcl' },

  /* ---- inline: one molecule, turning ---- */
  /* One phospholipid, which is the whole of "their tails avoid water": the head
     and the two tails are visible as different things in one picture. The same
     spec membrane-lab puts in its inset, for the same reason. */
  { id:'m:popc', kind:'molbox', spec:'popc' },
  /* The sugar the ten steps split. A card cannot show ten steps, but it can
     show the thing they happen to, and glucose is unambiguous. */
  { id:'m:glucose', kind:'molbox', spec:'glucose' },

  /* ---- inline: a protein drawn on a CONCEPT card ----
     Not a specimen. These name files directly because what they draw — a
     chain-B fold, a lesson-tier surface — has no role in proteins/proteins.js,
     which is a registry of structures rather than of illustrations. */
  /* The tetramer, as a ribbon. `levels` claims four levels of structure on one
     molecule, and a Ca ribbon is the only picture that shows three of them at
     once: the chain, the helices it folds into, and four of those packed. The
     trace is baked (tools/bake-trace.js) and its secondary structure is the
     deposited HELIX records, not a guess. */
  { id:'r:levels', kind:'protein',
    trace:'hemoglobin/data/2HHB.trace.json',
    surface:'hemoglobin/data/2HHB.card.surf.bin' },
  /* ONE chain of the same tetramer, because this card's claim is about one
     chain finding one shape — four of them would be the level above, which is
     the card next door. Same trace file, so nothing is baked twice.
     No `surface` on purpose: the card-tier bake is the whole tetramer, and a
     card drawing chain B would show a skin around three chains it is not
     claiming. A one-chain bake is a bake, not a flag. */
  { id:'r:folding', kind:'protein',
    trace:'hemoglobin/data/2HHB.trace.json', chains:'B',
    fold:'hemoglobin/data/2HHB-B.fold.bin' },

  /* ---- button: a lesson, opened over the map ----
     `chrome=bare` is the LESSON's parameter, not the map's: the map asks for a
     mode and hemoglobin-lab decides what it means. Its own content item now,
     rather than a field smuggled inside a protein view — a lesson is not a
     property of a picture that happens to sit on the same card. */
  { id:'l:hemoglobin', kind:'lesson', name:'Levels of structure',
    href:'hemoglobin-lab.html?chrome=bare' },

  /* ---- card: a video ---- */
  { id:'v:glycolysis', kind:'video', src:'1VrRl0UTlA8',
    name:'Glycolysis',
    /* WEHI is a medical research institute, and wehi.tv is one team inside it.
       The card names the institute and links to the collection this video
       belongs to, so a reader who wants more has somewhere to go that is not
       a YouTube channel. */
    credit:'WEHI', year:2021,
    creditUrl:'https://www.wehi.edu.au/topic/biology-101/',
    poster:'media/glycolysis-wehi.jpg',
    /* TWO TRACKS in one file, and the default is `narration`: the video's own
       words, because putting our sentences where its author's were is its own
       kind of misrepresentation on work that is not ours. `notes` is the same
       beats rewritten for a Bio 101 reader, reachable from the switch. The
       column names the source of whichever is showing. `step` is the lesson's
       own numbering, so a cue and glycolysis-lab's ten steps cannot drift. */
    captions:'media/glycolysis-wehi.captions.json',
    /* `tags` says what KIND OF THING a piece of content is, which is not what
       it is about — that is the concepts it is placed on. Nothing reads it
       yet. */
    tags:['mesoscale animation'] },

  { id:'v:atp', kind:'video', src:'OT5AXGS1aL8',
    name:'Synthesis of ATP',
    /* Two names on it, and both are printed: the animator and the composer.
       The score is not decoration on this one — the film has no dialogue for
       most of its run and the music is carrying the mechanism's rhythm. */
    credit:'Drew Berry & Franc Tétaz, WEHI', year:2018,
    creditUrl:'https://www.wehi.edu.au/topic/biology-101/',
    poster:'media/atp-wehi.jpg',
    captions:'media/atp-wehi.captions.json',
    tags:['mesoscale animation'] },

  { id:'v:krebs', kind:'video', src:'aV-kI_ep1Rk',
    /* BOTH NAMES, because the film and the lesson disagree: it is titled the
       citric acid cycle and krebs-lab is called the Krebs cycle. A reader who
       knows only one of them still has to see that this is that. */
    name:'The Krebs cycle (citric acid cycle)',
    credit:'Drew Berry, WEHI', year:2020,
    creditUrl:'https://www.wehi.edu.au/topic/biology-101/',
    poster:'media/krebs-wehi.jpg',
    /* `step` here is krebs-lab's own numbering — 'Bridge' then 1-8, which is
       what its STEPS table calls them, so a cue and the lesson cannot drift. */
    captions:'media/krebs-wehi.captions.json',
    tags:['mesoscale animation'] },

  { id:'v:etc', kind:'video', src:'nmoLoiFakxY',
    name:'The electron transport chain',
    credit:'Drew Berry, WEHI', year:2019,
    creditUrl:'https://www.wehi.edu.au/topic/biology-101/',
    poster:'media/etc-wehi.jpg',
    /* The `step` values here are KREBS-LAB's, not this film's: its last three
       beats are the cycle's step six, because Complex II belongs to both
       pathways. A cue carries the step of the lesson it points INTO. */
    captions:'media/etc-wehi.captions.json',
    tags:['mesoscale animation'] },
];

  /* ---------------------------------------------------------------------
   *  PLACEMENTS — WHERE a unit of content sits, and nothing else. One row per
   *  content item, carrying the rank it has on each concept that shows it:
   *
   *      ['v:glycolysis', { glycolysis:1 }]
   *        the content       the concepts, and the rank it has ON EACH
   *
   *  RANK MEANS WHAT IT MEANS EVERYWHERE ELSE ON THIS MAP: 1 is what the card
   *  opens with, 2 is one step in. Reusing it rather than inventing a rule is
   *  what lets content be authored like everything else here. For inline
   *  content it also breaks the tie — a card mounts its rank 1 item, since it
   *  can only afford one live box.
   *
   *  PROTEINS ARE THE EXCEPTION THAT PROVES THE TABLE. A `p:` row places a
   *  protein whose entry lives in proteins/proteins.js, and nothing here
   *  restates what that protein IS. Every entry in that registry is drawn
   *  whether or not it has a row here; without one it hangs off the Proteins
   *  door at the back rank, which is the honest place for a structure nobody
   *  has filed yet. So adding a protein stays a one-file edit, and this table
   *  is an override rather than a second registry to keep in step.
   *
   *  A third element picks a protein VARIANT by its id in that protein's
   *  entry; omitted, the registry's own default is drawn. Which deposition a
   *  card shows is the MAP's decision — 2HHB or sickle 2HBS is a different
   *  claim — and the paths behind it are the registry's, which
   *  kit/proteinbox.js reads for itself.
   *
   *  A specimen and a video are both LEAVES: they hang off concepts and off
   *  questions and never off each other, which is what keeps the map layered.
   *
   *  PLACEHOLDER CONTENT. Which specimen belongs under which concept, and at
   *  what rank, is the same editorial judgement as every other rank here.
   *  The six protein rows are a starting guess, not a decision.
   * ------------------------------------------------------------------- */
  const PLACEMENTS = [
    ['w:hbond',      { hbond: 1 }],
    ['w:solvation',  { solvation: 1 }],
    ['w:ice',        { ice: 1 }],
    ['w:heat',       { heat: 1 }],

    /* Same recipe on two concepts, on purpose and not by accident: the two
       make different claims about the same molecule. Which is a thing the old
       concept-keyed table could only express by repeating the object. */
    ['b:water',      { polarity: 1, covalent: 1 }],
    ['b:methane',    { geometry: 1 }],
    ['b:nacl',       { ionic: 1 }],
    ['b:hcl',        { acids: 1 }],

    ['m:popc',       { bilayer: 1 }],
    ['m:glucose',    { glycolysis: 1 }],

    ['r:levels',     { levels: 1 }],
    ['r:folding',    { folding: 1 }],

    ['l:hemoglobin', { levels: 1 }],

    ['v:glycolysis', { glycolysis: 1 }],
    /* Rank 2 on pumps because it IS the Na/K pump's physics run backwards: a
       gradient driving a machine in a membrane rather than a machine spending
       ATP to build one. */
    ['v:atp',        { chemios: 1, atp: 1, pumps: 2 }],
    ['v:krebs',      { krebs: 1, glycolysis: 2 }],
    /* Rank 2 on krebs and not 3: Complex II IS step six, so this film finishes
       the cycle's own story rather than only following it. */
    ['v:etc',        { chemios: 1, redox: 2, krebs: 2 }],

    ['p:hemoglobin', { cooperat: 1, levels: 1, folding: 2 }],
    ['p:myoglobin',  { binding: 1,  folding: 1 }],
    ['p:napump',     { pumps: 1,    osmosis: 2 }],
    ['p:amylase',    { enzyme: 1,   polymers: 1 }],
    ['p:rnase',      { denature: 1, folding: 1 }],   // Anfinsen: it refolds itself
    ['p:prion',      { folding: 1,  denature: 2, levels: 2 }],
  ];

  global.MapContent = { DOORS, CONCEPTS, QUESTIONS, CONTENT, PLACEMENTS };
})(this);
