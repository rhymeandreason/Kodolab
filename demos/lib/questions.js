/* =====================================================================
 *  questions.js — the question bank, and the topics they connect.
 *  Loaded as a classic script BEFORE a page's own script; exposes
 *  window.QuestionBank = { CONCEPTS, QUESTIONS }.
 *
 *  This is CONTENT, not a module: no behaviour, no DOM, nothing to call.
 *  It is split out because more than one page will read it —
 *  `tests/concept-map.html` draws it as a graph today.
 *
 *  CONCEPTS — the topics a question can name. `id` is what a question
 *  refers to; `built` says whether an engine for it is on disk, which is
 *  the only thing that has to be kept true as lessons ship.
 *
 *  QUESTIONS — one row each:
 *
 *      ['Why are snowflakes six-sided?', ['crystal','water'], 1]
 *        the question                      the concepts        rank
 *
 *  The CONCEPTS a question names are the editorial claim: two ids means
 *  the question sits between those two lessons, three means no single
 *  lesson answers it. A question whose ids are all one lesson is a
 *  caption, not a connection.
 *
 *  RANK is how well the question opens a card — 1 introduces the idea
 *  from cold, 2 follows up, 3 is depth. It is written per question and
 *  read per card, so the test is: if a student landed on any card this
 *  question names, is this a good first thing to ask there?
 *
 *  Every row is a question, ending in a question mark. A statement is a
 *  caption and belongs in the lesson, not here.
 *
 *  An id no CONCEPT defines is dropped silently by the consumer rather
 *  than throwing, so a typo costs the question an edge and says nothing.
 * ===================================================================== */
(function (global) {
  'use strict';

  const CONCEPTS = [
    { id: 'water',     name: 'Water',                 built: 1, featured: 1 },
    { id: 'bonds',     name: 'Bonds',                 built: 1, featured: 1 },
    { id: 'solvation', name: 'Solvation',             built: 1 },
    { id: 'hydrophob', name: 'Hydrophobic effect',    built: 0 },
    { id: 'entropy',   name: 'Entropy',               built: 0 },
    { id: 'folding',   name: 'Protein folding',       built: 1 },
    { id: 'protein',   name: 'Protein structure',     built: 1, featured: 1 },
    { id: 'binding',   name: 'Binding & recognition', built: 0 },
    { id: 'enzyme',    name: 'Enzymes',               built: 0 },
    { id: 'cooperat',  name: 'Cooperativity',         built: 0 },
    { id: 'shape',     name: 'Shape is function',     built: 1 },
    { id: 'membrane',  name: 'The membrane',          built: 1, featured: 1 },
    { id: 'diffusion', name: 'Diffusion',             built: 1 },
    { id: 'osmosis',   name: 'Osmosis',               built: 0 },
    { id: 'massact',   name: 'Mass action',           built: 1 },
    { id: 'coupling',  name: 'Energy coupling',       built: 1 },
    { id: 'glycolys',  name: 'Glycolysis',            built: 1, featured: 1 },
    { id: 'krebs',     name: 'Krebs cycle',           built: 1 },
    { id: 'ferment',   name: 'Fermentation',          built: 0 },
    { id: 'betaox',    name: 'Beta-oxidation',        built: 0 },
    { id: 'etc',       name: 'Electron transport',    built: 0 },
    { id: 'ledger',    name: 'Atom conservation',     built: 0 },
    { id: 'macromol',  name: 'Macromolecules',        built: 1 },
    { id: 'dna',       name: 'DNA',                   built: 1 },
    { id: 'crystal',   name: 'Crystal growth',        built: 0 },
    { id: 'denature',  name: 'Denaturing',            built: 0 },
    { id: 'scale',     name: 'One vs a million',      built: 0 },
  ];

  /* Each row is [question, the concepts it needs, rank, per-lesson ranks?].
     Rank is how well the question opens a card: 1 introduces the idea from cold,
     2 follows up, 3 is depth. It orders a fan when a card is expanded — rank 1
     nearest the card, the rest reading outward — so the first thing a student
     sees off any card is its best way in, not row order.

     The same question rarely opens two cards equally well, so a row may carry
     a fourth element overriding the rank for named lessons:

       ['Why does the helix twist?', ['dna','water'], 3, { dna: 1 }]

     — depth from Water, the way in from DNA. Anything not named there falls
     back to the plain rank, which is why most rows have no fourth element. */
  const QUESTIONS = [
    ['Why do oil and water separate?',                         ['water','hydrophob','entropy'], 1],
    ['Why does soap work?',                                    ['hydrophob','membrane','solvation'], 1],
    ['Why do proteins bury their greasy parts?',               ['hydrophob','folding','entropy'], 3],
    ['What are the alternatives to road salt?',                ['water','solvation'], 2],
    ['Why do recipes change at altitude?',                     ['water','entropy'], 1],
    ['How are fizzy drinks made?',                             ['water','solvation','diffusion'], 3],
    ['Why are snowflakes six-sided?',                          ['crystal','water'], 1],
    ['What makes ice cream creamy?',                           ['crystal','water'], 1],
    ['How do deep-sea fish keep their blood from crystallising?', ['crystal','binding','protein'], 3],
    ['How do wood frogs survive freezing solid?',              ['crystal','osmosis'], 3],
    ['How does a protein find its shape so fast?',             ['folding','entropy'], 3],
    ['Why do egg whites turn opaque and solid?',               ['denature','folding','hydrophob'], 1],
    ['Why is a fever above 40°C dangerous?',                   ['denature','protein','enzyme'], 2],
    ['How do vent bacteria run enzymes above 100°C?',          ['denature','protein'], 3],
    ['Why can’t you use up an enzyme?',                        ['enzyme','binding','scale'], 1],
    ['Why is cyanide deadly?',                                 ['binding','enzyme','etc'], 2],
    ['Why are some people lactose intolerant?',                ['binding','enzyme','shape'], 1],
    ['Why do mirror-image molecules smell different?',         ['shape','binding'], 1],
    ['Why did thalidomide’s two mirror forms behave differently?', ['shape','binding'], 2],
    ['Why does CO kill at 0.1% of the air?',                   ['cooperat','binding','protein'], 2],
    ['How does a fetus take oxygen from its mother’s blood?',  ['cooperat','protein','scale'], 3],
    ['Why does exercise release oxygen where it’s needed?',    ['cooperat','protein','ledger'], 3],
    ['Why are cells small?',                                   ['diffusion','scale'], 1],
    ['Why do insects need no lungs?',                          ['diffusion','scale','membrane'], 2],
    ['Why can’t a neuron let its signal diffuse?',             ['diffusion','scale'], 3],
    ['Why does breathing fast make you dizzy?',                ['massact','scale','solvation'], 2],
    ['Why does blood pH barely move when you drink Coke?',     ['massact','solvation','scale'], 2],
    ['How do salmon cross from salt water to fresh?',          ['osmosis','membrane','water'], 1],
    ['Why is an IV 0.9% saline?',                              ['osmosis','membrane','solvation'], 1],
    ['How does cholera dehydrate you without entering a cell?', ['osmosis','membrane','binding'], 3],
    ['How high can a tree grow?',                              ['osmosis','water'], 1],
    ['Why does a hole in a membrane heal itself?',             ['membrane','hydrophob','entropy'], 2],
    ['What does a membrane pump spend?',                       ['membrane','coupling','glycolys'], 2],
    ['Why can’t you sprint a marathon?',                       ['ferment','glycolys','protein'], 1],
    ['What actually burns in a sprinter’s legs?',              ['ferment','glycolys','massact'], 2],
    ['How does one yeast make both bread and beer?',           ['ferment','glycolys'], 1],
    ['How do crucian carp survive sealed under ice?',          ['ferment','glycolys'], 3],
    ['Why do red blood cells have no mitochondria?',           ['ferment','glycolys','krebs'], 2],
    ['Why are apples stored in low oxygen?',                   ['ferment','krebs'], 3],
    ['Why does fructose behave differently from glucose?',     ['glycolys','enzyme'], 3],
    ['Where does the CO₂ you exhale come from?',               ['ledger','krebs','glycolys'], 1],
    ['Why does the oxygen you breathe end up in water, not CO₂?', ['ledger','etc','krebs'], 2],
    ['Why does fat carry more energy than sugar?',             ['ledger','betaox'], 1],
    ['How do camels get water from fat?',                      ['ledger','betaox','osmosis'], 2],
    ['How do bears hibernate?',                                ['betaox','etc'], 3],
    ['How do hibernating animals burn fat as heat?',           ['etc','membrane','betaox'], 3],
    ['How do bacteria live on sulfur or iron?',                ['etc','coupling'], 3],
    ['Why is ATP worth spending?',                             ['coupling','krebs','massact'], 1],
    ['Why is one reaction enough to build all four polymers?', ['macromol','bonds','water'], 3],
    ['Why isn’t the mutation rate zero?',                      ['dna','binding','enzyme'], 2],
    ['What holds the two DNA strands together?',               ['dna','bonds','water'], 2],
    ['Why does a bond form at all?',                           ['bonds','entropy'], 1],
    ['How does one adrenaline molecule release a million glucose?', ['scale','binding','glycolys'], 2],
    ['Why is a polymer built by removing water?',              ['macromol','water','bonds'], 2],
    ['Why can you digest starch but not cellulose?',           ['macromol','shape','enzyme'], 1],
    ['Why are there four classes of macromolecule and not forty?', ['macromol','dna','protein'], 2],
    ['What makes a fat saturated?',                            ['macromol','membrane'], 2],
    ['Why does one wrong amino acid sickle a whole cell?',     ['macromol','protein','folding'], 2],
    ['Why is DNA double-stranded?',                            ['dna','bonds','shape'], 1],
    ['Why does the DNA helix twist?',                          ['dna','bonds'], 1],
    ['Why do the two DNA strands run in opposite directions?', ['dna','shape','enzyme'], 2],
    ['How does a protein read DNA without opening it?',        ['dna','binding','protein'], 3],
    ['Why does heat separate the DNA strands?',                ['dna','denature','bonds'], 2],
    ['Why does a protein have a shape at all?',                ['protein','folding','bonds'], 1, { bonds: 2 }],
    ['What makes hair different from silk?',                   ['protein','folding','macromol'], 1, { macromol: 2 }],
    ['Why does a protein fold the same way every time?',       ['folding','protein','shape'], 1, { protein: 2 }],
    ['How does blood know where to drop its oxygen?',          ['cooperat','protein','binding'], 1, { binding: 2, protein: 2 }],
    ['Why does hemoglobin have four parts and not one?',      ['cooperat','protein'], 1, { protein: 2 }],
    ['Why do you need to breathe oxygen at all?',              ['etc','krebs','ferment'], 1, { ferment: 2, krebs: 2 }],
    ['Where does the energy in food end up?',                  ['etc','ledger','krebs'], 1, { krebs: 2, ledger: 2 }],
    ['Why does everything in a cell run on the same molecule?', ['coupling','glycolys','membrane'], 1, { glycolys: 2, membrane: 3 }],
    ['Why does a reaction stop before it runs out?',           ['massact','coupling'], 1, { coupling: 2 }],
    ['Why does a smell take so long to cross a room?',         ['diffusion','scale'], 1],
    ['Why does frost grow on a window?',                       ['crystal','water'], 2],
    ['Why does milk curdle in lemon juice?',                   ['denature','protein','solvation'], 2],
    ['Why can’t you turn fat back into sugar?',                ['betaox','ledger','krebs'], 2],
    ['Why is sugar sweet and starch isn’t?',                   ['macromol','shape','binding'], 1, { binding: 2, shape: 2 }],
    ['Why is table salt safe when sodium explodes in water?',  ['bonds','solvation'], 1, { solvation: 2 }],
    ['Why is water bent and CO₂ straight?',                    ['bonds','water','shape'], 1, { shape: 2, water: 2 }],
    ['Why does carbon make four bonds?',                       ['bonds','macromol'], 1, { macromol: 2 }],
    ['Why does salt dissolve but sand doesn’t?',               ['bonds','solvation','water'], 1, { solvation: 2, water: 2 }],
    ['Is a hydrogen bond a real bond?',                        ['bonds','water','solvation'], 1, { solvation: 3, water: 2 }],
    ['Why is graphite soft and diamond hard?',                 ['bonds','shape'], 2],
    ['Why does it cost so much energy to use nitrogen from the air?', ['bonds','coupling','enzyme'], 3],
  ];

  // What a card actually sorts by. Defined here rather than in each consumer,
  // so the page, the editor and the checker cannot disagree about a rank.
  function rankFor(row, conceptId) {
    const per = row[3];
    return (per && per[conceptId]) || row[2];
  }

  global.QuestionBank = { CONCEPTS, QUESTIONS, rankFor };
})(this);
