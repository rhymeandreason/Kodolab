/* =====================================================================
 *  graphdata.js — the node graph's content, and nothing that draws it.
 *  Loaded before nodegraph.html's own script; exposes
 *  window.GraphData = { UNITS, LADDER, NODES, EDGES }.
 *
 *  Two units built end to end (water, proteins) plus the macromolecule
 *  bridges between them, per docs/Biology-Node-Graph.md. The schema is
 *  that doc's, cut to v1:
 *
 *  NODES — typed. `type` is one of:
 *      concept    a reusable idea (Polarity, Specificity)
 *      structure  a thing that physically exists (Water molecule, Tertiary)
 *      process    something that happens (Folding, Transpiration)
 *      question   an anchoring question; `text`, no claim
 *      theme      a deliberate high-degree hub (Structure–Function)
 *  Structure and process are split from concept on purpose: half of
 *  biology's difficulty is conflating an object with what it does.
 *
 *  `level` is the scale ladder integer (LADDER below), on the node as an
 *  ATTRIBUTE, not as edges — the ladder is the axis nodes sit on, not a
 *  parallel skeleton. A process carries `occursAt` instead (it has no
 *  size, it has a location), an emergent property `emergesAt`, and a
 *  concept carries nothing: null level is correct, not missing.
 *
 *  `unit` picks the tint (UNITS). `subject:'chemistry'` marks a
 *  cross-subject prerequisite — the edges students stall on, flagged so
 *  the map can offer a bridge instead of a dead end.
 *
 *  EDGES — [from, type, to, rank]. Directed; the type reads left to
 *  right ("polarity prerequisite-of hbond"). Rank is intrinsic strength:
 *      1  the spine; what expanding a card deals first
 *      2  enrichment, one step in
 *      3  true, surfaced on request
 *  Soft budget: about five rank-1 edges per node, enforced while
 *  authoring. The one deliberate exception is hbond, the water unit's
 *  mechanism hub — every property routes through it.
 *
 *  ROUTING RULE (the water lesson): a consequence attaches to the
 *  property that causes it, never to water-mol directly. Attach to the
 *  most specific node that fits.
 * ===================================================================== */
(function (global) {
  'use strict';

  const UNITS = {
    water:    { name: 'Water',          tint: '#2f7fb5' },
    macro:    { name: 'Macromolecules', tint: '#5f6672' },
    proteins: { name: 'Proteins',       tint: '#c2553a' },
    cell:     { name: 'Cell & membrane', tint: '#9c4f76' },
    genetics: { name: 'Molecular genetics', tint: '#33418f' },
    resp:     { name: 'Respiration',    tint: '#2e7d63' },
    photo:    { name: 'Photosynthesis',  tint: '#6e9a2e' },
    themes:   { name: 'Themes',         tint: '#c08a1e' },
  };

  /* Chemistry is not a unit: it is another SUBJECT, and its nodes wear
     this tint so the crossing out of biology is visible. */
  const CHEM_TINT = '#8a5cc0';

  const LADDER = [
    [1,  'molecule'], [2, 'macromolecule'], [3, 'organelle'], [4, 'cell'],
    [5,  'tissue'],   [6, 'organ'],         [7, 'organism'],  [8, 'population'],
    [9,  'community'],[10,'ecosystem'],
  ];

  const NODES = [

  /* ---- chemistry prerequisites (cross-subject) ------------------------ */
  { id:'electroneg', type:'concept', unit:'water', subject:'chemistry', name:'Electronegativity',
    claim:'Some atoms pull shared electrons harder than others.' },
  { id:'covalent', type:'concept', unit:'water', subject:'chemistry', name:'Covalent bond',
    claim:'Two atoms share a pair of electrons, and both count them as their own.' },
  { id:'polarity', type:'concept', unit:'water', subject:'chemistry', name:'Polarity',
    claim:'Unequal sharing gives a molecule a positive end and a negative end.' },
  /* THE LATTICE THE SOLVENT CARD ASSUMES. `solvent` says water pulls a
     charged particle off its neighbours and that the solid is then gone —
     and nothing on the map had said what held the solid together. */
  { id:'ionic-bond', type:'concept', unit:'water', subject:'chemistry', name:'Ionic bond',
    claim:'One atom takes the electron rather than sharing it. Opposite charges then hold the ions in a lattice.' },

  /* ---- water: cause → mechanism → properties → consequences ----------- */
  { id:'water-mol', type:'structure', unit:'water', level:1, name:'Water molecule',
    claim:'Two hydrogens on one oxygen, held at 104.5°. The bend is why the pull toward oxygen does not cancel out.' },
  { id:'hbond', type:'concept', unit:'water', name:'Hydrogen bonding',
    claim:'A hydrogen bonded to oxygen or nitrogen carries a partial +, and it is pulled toward the partial − on the next O or N.' },

  { id:'cohesion', type:'concept', unit:'water', name:'Cohesion & adhesion',
    claim:'Water sticks to itself, and to any surface it can hydrogen-bond to.' },
  { id:'spec-heat', type:'concept', unit:'water', name:'High specific heat',
    claim:'Heating water spends most of the energy breaking H-bonds, not raising the temperature.' },
  { id:'evap-cool', type:'concept', unit:'water', name:'Evaporative cooling',
    claim:'The fastest molecules escape first, and they take their energy with them.' },
  { id:'solvent', type:'concept', unit:'water', name:'Solvent properties',
    claim:'Water surrounds a charged particle and pulls it off its neighbours. Once every ion has a shell, the solid is gone.' },
  { id:'hydrophobic', type:'concept', unit:'water', name:'The hydrophobic effect',
    claim:'Water pushes nonpolar molecules together to protect its own H-bond network.' },
  { id:'ice-density', type:'concept', unit:'water', name:'Ice density anomaly',
    claim:'The frozen lattice holds molecules farther apart than the liquid does.' },
  { id:'ionization', type:'concept', unit:'water', name:'Ionization & pH',
    claim:'A few hundred million water molecules, and one has split into H⁺ and OH⁻. pH is the exponent on that count.' },

  { id:'transpiration', type:'process', unit:'water', occursAt:7, name:'Transpiration',
    claim:'Water evaporating at the leaf pulls the column up behind it. Nothing pushes from the roots.' },
  { id:'temp-buffer', type:'concept', unit:'water', name:'Temperature buffering',
    claim:'Cells and lakes change temperature slowly. Heat breaks H-bonds before it speeds molecules up.' },
  { id:'thermoreg', type:'process', unit:'water', occursAt:7, name:'Thermoregulation',
    claim:'Keeping body temperature steady while the outside moves. Sweat evaporates and takes the heat.',
    kinds:[
      ['Endotherm', 'Heats itself from its own metabolism. Steady, and it costs most of what you eat.'],
      ['Ectotherm', 'Takes its heat from outside. Cheap to run, and slow on a cold morning.'],
    ] },
  { id:'osmosis', type:'process', unit:'water', occursAt:4, name:'Osmosis',
    claim:'Water diffusing down its own gradient, from where there is more of it to where there is less.' },
  { id:'overwinter', type:'process', unit:'water', occursAt:10, name:'Aquatic overwintering',
    claim:'Ice floats, so a lake freezes from the top and life persists below.' },
  { id:'buffers', type:'concept', unit:'water', name:'Buffers',
    claim:'A buffer trades protons back and forth, so pH barely moves.' },

  { id:'amphipathic', type:'concept', unit:'water', name:'Amphipathic',
    claim:'One end dissolves in water, the other cannot. Every membrane and micelle follows from that split.' },
  { id:'dna-structure', type:'structure', unit:'macro', level:2, name:'DNA structure',
    claim:'Two antiparallel strands, paired base to base and twisted. Backbone outside, bases stacked in.' },

  /* ---- macromolecule bridges ------------------------------------------ */
  { id:'dehydration', type:'process', unit:'macro', occursAt:1, name:'Dehydration synthesis',
    claim:'Monomers join by losing a water molecule. Every polymer bond is built this way.' },
  { id:'hydrolysis', type:'process', unit:'macro', occursAt:1, name:'Hydrolysis',
    claim:'Water is added back to break the bond. Digestion is this, run enzymatically.' },
  { id:'phospholipid', type:'structure', unit:'macro', level:1, name:'Phospholipid',
    claim:'A charged head on two oily tails.' },
  { id:'bilayer', type:'structure', unit:'macro', level:2, name:'Phospholipid bilayer',
    claim:'Tails cannot face water, so they close into a double sheet with heads out. Water is what holds it together.' },

  /* ---- macromolecules: the shared pattern, and where it breaks --------
     This unit's job is not the four classes one at a time. It is that ONE
     reaction builds every polymer in biology and one reverse reaction takes
     them all apart, plus the one class that does not play: a lipid is an
     aggregate, not a polymer, and that exception is the content. */
  { id:'functional-group', type:'concept', unit:'macro', subject:'chemistry',
    name:'Functional group',
    claim:'A small cluster of atoms that behaves the same way whatever carbon skeleton it is bolted to.',
    kinds:[
      ['Hydroxyl', 'OH. Makes the molecule polar, which is why sugars and alcohols dissolve.'],
      ['Carbonyl', 'C=O. At the end of a chain it is an aldehyde, in the middle a ketone.'],
      ['Carboxyl', 'COOH. Gives up its proton, so it is an acid. Every amino acid carries one.'],
      ['Amino', 'NH₂. Takes a proton up, so it is a base. The other end of an amino acid.'],
      ['Phosphate', 'PO₄. Negative, and where ATP holds the energy it is about to spend.'],
      ['Methyl', 'CH₃. Nonpolar and unreactive, and a tag that switches genes quiet.'],
    ] },
  { id:'polymer', type:'concept', unit:'macro', name:'Polymer',
    claim:'Monomers joined into a chain by one bond, repeated. Three of the four classes are built this way.' },

  { id:'monosaccharide', type:'structure', unit:'macro', level:1, name:'Monosaccharide',
    claim:'One sugar unit. Same formula, different shape, and the shape is what an enzyme reads.' },
  { id:'polysaccharide', type:'structure', unit:'macro', level:2, name:'Polysaccharide',
    claim:'Sugars in a chain, for storage or for structure. Which one depends on how the link is turned.' },
  { id:'starch', type:'structure', unit:'macro', level:2, name:'Starch',
    claim:'Glucose linked α, which your enzymes can open. This is why bread is food.' },
  { id:'cellulose', type:'structure', unit:'macro', level:2, name:'Cellulose',
    claim:'The same glucose linked β. One flipped bond, and no enzyme you own will touch it.' },

  { id:'fatty-acid', type:'structure', unit:'macro', level:1, name:'Fatty acid',
    claim:'A long hydrocarbon tail with an acid group on the end. The tail is the energy.',
    kinds:[
      ['Saturated', 'No double bonds, so the tails are straight and pack tight. Solid at room temperature.'],
      ['Unsaturated', 'A double bond kinks the tail and stops it packing. Oils, and membrane fluidity.'],
      ['Trans', 'A double bond with the kink straightened out by processing, so it packs like a saturated one.'],
    ] },
  { id:'triglyceride', type:'structure', unit:'macro', level:2, name:'Triglyceride',
    claim:'Three fatty acids on a glycerol. Not a polymer: no repeating unit, no chain.' },

  { id:'nucleotide', type:'structure', unit:'macro', level:1, name:'Nucleotide',
    claim:'Phosphate, sugar, base. The phosphate is why the backbone is charged.',
    kinds:[
      ['Adenine', 'A purine, two rings. Pairs with thymine in DNA and with uracil in RNA.'],
      ['Thymine', 'A pyrimidine, one ring. DNA only, and two hydrogen bonds to adenine.'],
      ['Guanine', 'A purine. Three hydrogen bonds to cytosine, which makes it the stronger pair.'],
      ['Cytosine', 'A pyrimidine, and guanine\u2019s partner in both DNA and RNA.'],
      ['Uracil', 'Thymine without its methyl. RNA uses it; DNA does not, which helps repair spot damage.'],
    ] },
  { id:'protein-class', type:'structure', unit:'macro', level:2, name:'Protein',
    claim:'Amino acids in a chain. The only class whose monomers come in twenty kinds.' },

  /* ---- proteins: the spine is the levels of structure ----------------- */
  /* was `Gene sequence`, in the proteins unit, holding one end of the map's
     oldest dangling edge. Molecular genetics is what it was waiting for, so
     it becomes the Gene node rather than a second one being invented. */
  { id:'gene-seq', type:'structure', unit:'genetics', level:2, name:'Gene',
    claim:'A stretch of DNA that specifies one product. The order of its bases is the order of the amino acids.' },
  { id:'amino-acid', type:'structure', unit:'proteins', level:1, name:'Amino acid',
    claim:'Twenty kinds, and only the side chain differs between them.' },
  { id:'r-group', type:'structure', unit:'proteins', level:1, name:'R-group',
    claim:'The side chain: nonpolar, polar, acidic or basic. Those four categories decide how the chain folds.',
    kinds:[
      ['Nonpolar', 'Greasy. Buried in the core away from water, and what holds the fold together.'],
      ['Polar', 'Wet. Sits on the surface and hydrogen-bonds to water and to other side chains.'],
      ['Acidic', 'Negative at cell pH. Aspartate and glutamate.'],
      ['Basic', 'Positive at cell pH. Lysine, arginine, histidine.'],
    ] },
  { id:'peptide-bond', type:'structure', unit:'proteins', level:1, name:'Peptide bond',
    claim:'The covalent link between amino acids, and it survives cooking.' },
  { id:'primary', type:'structure', unit:'proteins', level:2, name:'Primary structure',
    claim:'The sequence of amino acids, written by the gene.' },
  { id:'secondary', type:'structure', unit:'proteins', level:2, name:'Secondary structure',
    claim:'Helices and sheets, held by backbone H-bonds. The side chains play no part.',
    kinds:[
      ['α-helix', 'The backbone coils, hydrogen-bonded four residues along. Keratin is almost all of it.'],
      ['β-sheet', 'Strands lie alongside each other and bond across. Silk, and the barrel in GFP.'],
      ['Turn', 'A short reversal so the chain can fold back on itself. Usually glycine or proline.'],
    ] },
  { id:'tertiary', type:'structure', unit:'proteins', level:2, name:'Tertiary structure',
    claim:'The overall 3D shape, driven entirely by the side chains.' },
  { id:'quaternary', type:'structure', unit:'proteins', level:2, name:'Quaternary structure',
    claim:'Several folded chains docked into one unit. Hemoglobin’s four pass each other information one alone could not use.' },
  { id:'rgroup-inter', type:'concept', unit:'proteins', name:'R-group interactions',
    claim:'The side chains are what fold the protein: five forces, very different strengths.' },
  { id:'disulfide', type:'structure', unit:'proteins', level:1, name:'Disulfide bridge',
    claim:'A covalent staple between two cysteines, roughly twenty times the other folding forces.' },
  { id:'vdw', type:'concept', unit:'proteins', name:'Van der Waals',
    claim:'Van der Waals forces are individually weak but act everywhere two surfaces touch, so they only add up where the fit is already close.' },
  { id:'folding', type:'process', unit:'proteins', occursAt:1, name:'Protein folding',
    claim:'A linear chain of amino acids transforms into an ordered, three-dimensional structure that allows the protein to become biologically active.' },
  { id:'anfinsen', type:'evidence', unit:'proteins', name:'Anfinsen’s experiment',
    claim:'Unfold ribonuclease completely, then take the denaturant away, and it folds back into working shape on its own. Nothing but the sequence directs it.' },
  { id:'denaturation', type:'process', unit:'proteins', occursAt:1, name:'Denaturation',
    claim:'Heat or acid unfolds the shape while the peptide bonds hold. The sequence survives, everything built on it does not.' },
  { id:'func', type:'concept', unit:'proteins', name:'Protein function',
    claim:'A protein works by having one shape that fits one thing. Function is the fit.',
    /* Enzyme is also a node, and appears here anyway: four of these five are
       nowhere on the map, so the fan is mostly new material and leaving the
       best-known one out would make it a strange, incomplete answer. The
       organelle case is the opposite way round, and gets no fan. */
    kinds:[
      ['Enzyme', 'Lowers a barrier and comes out unchanged.'],
      ['Structural', 'Holds things up. Collagen, keratin, the cytoskeleton.'],
      ['Transport', 'Carries or admits. Hemoglobin, channels, pumps.'],
      ['Receptor', 'Binds a signal and changes shape, so a message crosses a membrane.'],
      ['Motor', 'Turns ATP into movement. Myosin, kinesin, the flagellar motor.'],
    ] },

  { id:'enzyme', type:'structure', unit:'proteins', level:2, name:'Enzyme',
    claim:'A protein that lowers the barrier and comes out the other side unchanged.',
    kinds:[
      ['Oxidoreductase', 'Moves electrons. The dehydrogenases that load NAD⁺ are these.'],
      ['Transferase', 'Moves a group from one molecule to another. Hexokinase moves a phosphate.'],
      ['Hydrolase', 'Breaks a bond using water. Amylase, and most of digestion.'],
      ['Lyase', 'Breaks a bond without water, and often leaves a double bond behind.'],
      ['Isomerase', 'Rearranges a molecule into its isomer, adding and removing nothing.'],
      ['Ligase', 'Joins two molecules together, and spends ATP to do it.'],
    ] },
  { id:'active-site', type:'structure', unit:'proteins', level:2, name:'Active site',
    claim:'A pocket in the tertiary structure where the substrate fits.' },
  { id:'specificity', type:'concept', unit:'proteins', name:'Specificity',
    claim:'One enzyme, one substrate, because the pocket has one shape.' },
  { id:'induced-fit', type:'concept', unit:'proteins', name:'Induced fit',
    claim:'Binding tightens the fit. The pocket is not rigid.' },
  { id:'activation-e', type:'concept', unit:'proteins', subject:'chemistry', name:'Activation energy',
    claim:'The hump a reaction has to get over before it can happen, however favourable the outcome.' },
  { id:'optimal-cond', type:'concept', unit:'proteins', name:'Optimal conditions',
    claim:'Every enzyme has a pH and temperature where its shape holds, and a cliff past them.' },

  /* Haemoglobin and the sickle story are NOT nodes here: individual
     proteins are SPECIMENS, spawned from proteins/proteins.js and placed
     by graphcontent.js — the registry stays the single source of what we
     hold. The sickle chain's card content lives on point-mutation and on
     the haemoglobin specimen's own variants. */
  { id:'point-mutation', type:'concept', unit:'proteins', name:'Point mutation',
    claim:'One base changed, one amino acid swapped. Glu→Val on hemoglobin is enough to sickle a cell.',
    kinds:[
      ['Silent', 'The codon changed and the amino acid did not. Most third-base changes are this.'],
      ['Missense', 'One amino acid swapped for another. Sickle cell is a missense mutation.'],
      ['Nonsense', 'A stop codon appears early and the chain is cut off where it stands.'],
    ] },
  { id:'nat-select', type:'process', unit:'proteins', emergesAt:8, name:'Natural selection',
    claim:'Heritable variation plus unequal survival, repeated. Populations evolve; individuals never do.',
    kinds:[
      ['Directional', 'One extreme is favoured and the whole population shifts that way.'],
      ['Stabilising', 'The middle is favoured and both extremes are trimmed. Birth weight is the classic case.'],
      ['Disruptive', 'Both extremes beat the middle, which is how one population can split in two.'],
    ] },

  /* ---- cell & membrane ------------------------------------------------
     THE HINGE IS SELECTIVE PERMEABILITY. Hung straight off the bilayer,
     the membrane collects fifteen rank-1 edges; routed through the hinge the
     causal story is one sentence, the bilayer's greasy middle is what makes
     some things cross and others not, and every transport mechanism below is
     a workaround for that one fact.

     ORGANELLE IS A REAL INTERMEDIATE, not a label. Nine organelles hanging
     off `cell` is the same hairball in a different costume, and only the
     four with downstream traffic keep rank 1. */
  { id:'hydrophobic-core', type:'structure', unit:'cell', level:2, name:'Hydrophobic core',
    claim:'The tails meet in the middle, and that greasy layer is the whole barrier.' },
  { id:'selective-perm', type:'concept', unit:'cell', name:'Selective permeability',
    claim:'Small and nonpolar crosses the greasy middle. Charged or large does not. Every transport mechanism is a way around that.' },
  { id:'fluid-mosaic', type:'concept', unit:'cell', name:'Fluid mosaic',
    claim:'Not a wall. A two-dimensional fluid, with the proteins free to drift sideways through it.' },
  { id:'membrane-protein', type:'structure', unit:'cell', level:2, name:'Membrane protein',
    /* The inversion is the whole definition and it is easy to state
       backwards: a soluble protein buries its greasy residues INSIDE, a
       membrane protein turns them OUT to face the tails. Saying its middle
       is greasy describes the soluble one. */
    claim:'Sits in the bilayer, greasy where it meets the tails. Almost everything the membrane does, a protein is doing.' },

  { id:'simple-diffusion', type:'process', unit:'cell', occursAt:4, name:'Simple diffusion',
    claim:'Molecules spread because they move at random. At equilibrium the net flow stops, the motion does not.' },
  { id:'tonicity', type:'concept', unit:'cell', name:'Tonicity',
    claim:'Hypotonic, isotonic, hypertonic: a description of the solution outside, and a prediction about the cell.' },
  { id:'facilitated-diff', type:'process', unit:'cell', occursAt:4, name:'Facilitated diffusion',
    claim:'A substance moves down its own gradient through a protein, which opens a path without pushing it.' },
  { id:'channel-protein', type:'structure', unit:'cell', level:2, name:'Channel protein',
    claim:'A hole with a shape. Open it and the right ion falls through on its own.' },
  { id:'carrier-protein', type:'structure', unit:'cell', level:2, name:'Carrier protein',
    claim:'Binds its passenger, changes shape, lets go on the other side.' },
  { id:'active-transport', type:'process', unit:'cell', occursAt:4, name:'Active transport',
    claim:'A protein moves a substance against its gradient, spending ATP on every molecule it carries.' },
  { id:'electrochem-grad', type:'concept', unit:'cell', name:'Electrochemical gradient',
    claim:'Pump something across and hold it there. The imbalance is now stored energy.' },
  { id:'bulk-transport', type:'process', unit:'cell', occursAt:4, name:'Endo- and exocytosis',
    claim:'Too big for any protein, so the membrane wraps around it and pinches off.' },

  { id:'cell-theory', type:'concept', unit:'cell', name:'Cell theory',
    claim:'Every living thing is cells, and every cell comes from a cell.' },
  { id:'cell', type:'structure', unit:'cell', level:4, name:'Cell',
    claim:'The smallest thing that is alive. Nothing inside it is.' },
  { id:'sa-v', type:'concept', unit:'cell', name:'Surface area to volume',
    claim:'Double the width and volume grows eightfold while surface grows fourfold. The inside outruns its supply line.' },
  { id:'prokaryote', type:'structure', unit:'cell', level:4, name:'Prokaryote',
    claim:'A cell with no nucleus and no internal compartments, small enough that it does not need them.' },
  { id:'eukaryote', type:'structure', unit:'cell', level:4, name:'Eukaryote',
    claim:'A cell that keeps its DNA in a nucleus and divides its chemistry among membrane-bound compartments, which is what lets it be large.',
    kinds:[
      ['Animal', 'No wall and no chloroplast. Its shape comes from the cytoskeleton alone.'],
      ['Plant', 'Cellulose wall, chloroplasts, and one big vacuole holding the cell rigid.'],
      ['Fungal', 'A wall like a plant\u2019s but built from chitin, and no chloroplast.'],
      ['Protist', 'Everything else with a nucleus. A dustbin category, and mostly single cells.'],
    ] },
  { id:'cytoplasm', type:'structure', unit:'cell', level:4, name:'Cytoplasm',
    claim:'The crowded solution filling the cell, packed so densely with protein that a molecule can barely turn around.' },

  { id:'organelle', type:'structure', unit:'cell', level:3, name:'Organelle',
    claim:'A room with its own chemistry, and its own membrane to keep it that way.',
    /* NO `kinds` HERE, and the reason is the rule for the whole mechanism:
       nucleus, ribosome, mitochondrion, chloroplast and cell wall are already
       nodes hanging off this card. A fan would add only the leftovers and
       leave a reader asking why five members are cards and five are not.
       `kinds` is for a category whose members are NOT on the map. Where they
       are, the chips already lead there, and going deeper wants a lesson. */ },
  { id:'nucleus', type:'structure', unit:'cell', level:3, name:'Nucleus',
    claim:'The DNA, kept apart from the machinery that reads it.' },
  { id:'ribosome', type:'structure', unit:'cell', level:3, name:'Ribosome',
    claim:'Reads mRNA and links amino acids into a protein. Bacteria and you inherited the same one from a shared ancestor.' },
  { id:'chloroplast', type:'structure', unit:'cell', level:3, name:'Chloroplast',
    claim:'Two membranes and stacked discs, running the reaction that fills the atmosphere.' },
  { id:'cell-wall', type:'structure', unit:'cell', level:3, name:'Cell wall',
    claim:'Outside the membrane, and rigid. A plant cell in fresh water swells until the wall pushes back, and that pressure is what holds the plant up.' },
  { id:'endosymbiosis', type:'concept', unit:'cell', name:'Endosymbiotic theory',
    claim:'Mitochondria and chloroplasts were once free-living bacteria. They still carry their own DNA and their own ribosomes.' },

  /* ---- respiration ----------------------------------------------------
     THE STAGES ARE NOT THE SPINE. A four-node chain is what gets memorised
     and it is exactly the model that produces a student who can recite the
     stages and cannot say why oxygen is needed. The through-line is the
     ELECTRON CARRIERS: the first three stages strip electrons off glucose
     and load them, the last cashes them in. So `carriers` is the hub at
     rank 1 with every stage, and the stages carry `precedes` at rank 2 —
     the sequence is real, it is just not the explanation. */
  { id:'redox', type:'concept', unit:'resp', subject:'chemistry', name:'Redox',
    claim:'Oxidation is losing electrons, reduction is gaining them. Always both at once.' },

  { id:'glucose', type:'structure', unit:'macro', level:1, name:'Glucose',
    claim:'A six-carbon sugar, and the cell\u2019s default fuel. Its electrons are what respiration is after.' },
  { id:'pyruvate', type:'structure', unit:'resp', level:1, name:'Pyruvate',
    claim:'Three carbons, and the fork in the road: with oxygen it goes on, without it does not.' },
  { id:'acetyl-coa', type:'structure', unit:'resp', level:1, name:'Acetyl-CoA',
    claim:'Two carbons on a carrier, and the doorway into the cycle.' },
  { id:'atp', type:'structure', unit:'resp', level:1, name:'ATP',
    claim:'The cell spends this, not glucose. A rechargeable battery, recharged about your body weight a day.' },
  { id:'oxygen', type:'structure', unit:'resp', level:1, name:'Oxygen',
    claim:'Oxygen never touches the glucose; it waits at the end of the electron transport chain and accepts the spent electrons.' },

  { id:'carriers', type:'concept', unit:'resp', name:'Electron carriers',
    claim:'NAD⁺ and FAD collect the electrons stripped off glucose and hand them to the chain. The pool is small, so it has to be given back.' },
  { id:'proton-gradient', type:'concept', unit:'resp', name:'Proton gradient',
    claim:'The chain pumps H⁺ to one side. The imbalance itself is stored energy, and it is what the cell actually banks.' },
  { id:'chemiosmosis', type:'concept', unit:'resp', occursAt:3, name:'Chemiosmosis',
    claim:'Protons fall back through a turbine, and the turbine makes ATP. Mitochondria run this, chloroplasts run this, and so does every bacterium.' },
  { id:'mitchell', type:'evidence', unit:'resp', name:'Mitchell’s hypothesis',
    claim:'Mitchell proposed a proton gradient in place of the chemical intermediate everyone was hunting. Chloroplasts then made ATP in the dark when an acid bath supplied the gradient.' },
  { id:'substrate-phos', type:'concept', unit:'resp', name:'Substrate-level phosphorylation',
    claim:'An enzyme hands a phosphate straight to ADP. Direct, and a small fraction of the total.' },
  { id:'oxidative-phos', type:'concept', unit:'resp', name:'Oxidative phosphorylation',
    claim:'ATP made from the gradient instead of by hand. This is where almost all of it comes from.' },

  { id:'mitochondrion', type:'structure', unit:'resp', level:3, name:'Mitochondrion',
    claim:'Two membranes, and the inner one is folded because the chain lives in it. Area is the point.' },

  { id:'respiration', type:'process', unit:'resp', occursAt:4, name:'Cellular respiration',
    claim:'Glucose is taken apart one pair of electrons at a time, and the energy is banked as ATP.' },
  { id:'glycolysis', type:'process', unit:'resp', occursAt:4, name:'Glycolysis',
    claim:'Glucose splits into two pyruvate in the cytosol. Two ATP spent, four made, two carriers loaded.' },
  { id:'pyr-ox', type:'process', unit:'resp', occursAt:3, name:'Pyruvate oxidation',
    claim:'One carbon leaves as CO₂ and the rest becomes acetyl-CoA. The first carbon you breathe out.' },
  { id:'krebs', type:'process', unit:'resp', occursAt:3, name:'Krebs cycle',
    claim:'Two more carbons leave as CO₂, and every turn loads three NADH, one FADH₂, one ATP. The eight intermediates are the conveyor that does it.' },
  { id:'etc', type:'process', unit:'resp', occursAt:3, name:'Electron transport chain',
    claim:'Electrons fall from carrier to carrier, and every drop pumps protons across the membrane.' },
  { id:'fermentation', type:'process', unit:'resp', occursAt:4, name:'Fermentation',
    claim:'No oxygen, so the chain stops and the carriers stay full. Fermentation empties them so glycolysis can keep going.' },
  /* The two branches are NODES, not a kinds fan. Each is a molecule a reader
     already knows from outside biology, and holding them apart IS the lesson:
     one step or two, and whether a carbon leaves. A pill hid both. */
  { id:'lactate', type:'structure', unit:'resp', level:1, name:'Lactate',
    claim:'A dead end. Pyruvate takes its own electrons back, and your muscles feel it.' },
  { id:'ethanol', type:'structure', unit:'resp', level:1, name:'Ethanol',
    claim:'Two carbons; the third leaves as CO₂. Yeast’s exit, and it is bread and beer.' },

  /* ---- molecular genetics ---------------------------------------------
     COMPLEMENTARITY IS THE HINGE. A-T and G-C is why replication is
     possible, why transcription works, and why a tRNA finds its codon: one
     idea with four rank-1 paths out of it, rather than "the bases pair"
     restated inside every process node. It also reaches BACK, because those
     are hydrogen bonds, the same node the water unit built.

     NO ENZYME ROSTER. Helicase, primase, topoisomerase, ligase and
     single-strand binding protein are five tidy job descriptions with almost
     no downstream degree in Bio 101. What earns rank 1 here are the two
     things that are constraints rather than named objects, complementarity
     and reading frame, which is exactly what page counts under-rank. */
  { id:'base-pairing', type:'concept', unit:'genetics', name:'Base pairing',
    claim:'A with T, G with C, held by hydrogen bonds. Either strand is enough to rebuild the other.' },
  { id:'antiparallel', type:'concept', unit:'genetics', name:'Antiparallel',
    claim:'The two strands run in opposite directions, and every copying machine can only work one way along a strand.' },
  { id:'chromosome', type:'structure', unit:'genetics', level:2, name:'Chromosome',
    claim:'One very long DNA molecule wound onto protein spools, so two metres of it fits in a nucleus.' },

  { id:'replication', type:'process', unit:'genetics', occursAt:3, name:'DNA replication',
    claim:'The strands separate and each one templates a new partner. One molecule becomes two.',
    /* five tidy job descriptions with no downstream degree in Bio 101, which
       is exactly why they are content here and not nodes */
    kinds:[
      ['Helicase', 'Unwinds the double helix and holds the two strands apart.'],
      ['DNA polymerase', 'Adds bases to the new strand, and checks the last one it added.'],
      ['Primase', 'Lays a short RNA start, because polymerase cannot begin from nothing.'],
      ['Ligase', 'Seals the nicks between the lagging strand\u2019s backward pieces.'],
      ['Topoisomerase', 'Cuts and rejoins ahead of the fork so the helix does not knot.'],
    ] },
  { id:'semiconservative', type:'concept', unit:'genetics', name:'Semiconservative',
    claim:'Every new molecule keeps one old strand. The original is never discarded, only shared out.' },
  { id:'proofreading', type:'concept', unit:'genetics', name:'Proofreading',
    claim:'The copying enzyme checks its last base and backs up to fix it. Errors survive at about one in a billion.' },
  { id:'strand-asymmetry', type:'concept', unit:'genetics', name:'Leading and lagging',
    claim:'One new strand runs continuously, the other in backward pieces. The asymmetry is forced by the antiparallel strands.' },

  { id:'transcription', type:'process', unit:'genetics', occursAt:3, name:'Transcription',
    claim:'One gene is copied into RNA. The DNA itself never leaves the nucleus, which is the whole reason for a messenger.' },
  { id:'rna', type:'structure', unit:'genetics', level:2, name:'RNA',
    claim:'One strand, ribose, uracil for thymine. It carries messages, and it also builds things and catalyses.' },
  { id:'mrna', type:'structure', unit:'genetics', level:2, name:'mRNA',
    claim:'A working copy of one gene, sent out to the ribosome so the original stays put.' },
  { id:'rna-processing', type:'process', unit:'genetics', occursAt:3, name:'RNA processing',
    claim:'Introns cut out, exons joined. Splice the same transcript differently and one gene yields several proteins.' },

  { id:'translation', type:'process', unit:'genetics', occursAt:4, name:'Translation',
    claim:'The ribosome reads the message three bases at a time and builds the chain the message names.' },
  { id:'genetic-code', type:'concept', unit:'genetics', name:'The genetic code',
    claim:'The rule that assigns each codon to one amino acid. It is nearly identical in every organism alive, which is why the code is evidence of common ancestry.' },
  { id:'codon', type:'concept', unit:'genetics', name:'Codon',
    claim:'Three bases in mRNA that specify one amino acid. Sixty-four codons cover twenty amino acids, so most amino acids have more than one.',
    kinds:[
      ['Start', 'AUG. Marks where translation begins, and sets the frame for everything after it.'],
      ['Stop', 'UAA, UAG, UGA. No amino acid at all. The ribosome lets go.'],
      ['Sense', 'The other sixty. Each names one amino acid, and most amino acids answer to several.'],
    ] },
  { id:'trna', type:'structure', unit:'genetics', level:2, name:'tRNA',
    claim:'An adaptor: one end pairs with the codon, the other carries the matching amino acid.' },
  { id:'reading-frame', type:'concept', unit:'genetics', name:'Reading frame',
    claim:'Where the reading starts. Shift it by one base and every codon after that is different.' },

  { id:'mutation', type:'concept', unit:'genetics', name:'Mutation',
    claim:'Any change to the sequence. Most do nothing, some are harmful, and a few are the raw material of evolution.' },
  /* The map had exactly one cause of mutation, `replication causes mutation`,
     which quietly said every mutation is a copying error. This is the other
     half. UV, benzene and gamma rays are not each a node: they route nowhere
     and nobody arrives at one alone, so they are this card's `kinds`. */
  { id:'mutagen', type:'concept', unit:'genetics', name:'Mutagen',
    claim:'Something from outside that damages the sequence. The other way a mutation happens, besides miscopying.',
    kinds:[
      ['Ultraviolet', 'Fuses two neighbouring thymines into a kink the copying enzyme reads wrong.'],
      ['Chemical', 'Benzene, aflatoxin, tobacco tar. Some mimic a base, some jam themselves between them.'],
      ['Ionising radiation', 'X-rays and gamma rays cut the backbone outright, sometimes both strands at once.'],
    ] },
  { id:'frameshift', type:'concept', unit:'genetics', name:'Frameshift',
    claim:'Insert or delete one base and the frame shifts. Everything downstream is nonsense.' },

  { id:'gene-expression', type:'concept', unit:'genetics', name:'Gene expression',
    claim:'Which genes a cell is currently reading. Every cell holds the same genome and runs a different part of it.' },
  { id:'transcription-factor', type:'structure', unit:'genetics', level:2, name:'Transcription factor',
    claim:'A protein that binds near a gene and changes how often it is read. A dial, not a switch.',
    kinds:[
      ['Activator', 'Binds and makes the gene easier to read, so more of the protein gets made.'],
      ['Repressor', 'Binds and gets in the way, so the gene is read less. Rarely off, just quieter.'],
    ] },
  { id:'differentiation', type:'process', unit:'genetics', occursAt:4, name:'Differentiation',
    claim:'A neuron and a liver cell hold identical DNA. They differ in which of it is switched on.' },
  { id:'central-dogma', type:'concept', unit:'genetics', name:'The central dogma',
    claim:'DNA is copied to RNA and RNA is read into protein. Information travels one way along that chain.' },

  /* ---- evidence -------------------------------------------------------
     These show HOW WE KNOW. They are destinations rather than stations, like
     a specimen, so the walk rarely steps onto one and an evidence-for edge is
     normally rank 2. Genetics holds most of them, because its claims were the
     ones settled by named experiments; proteins, respiration and
     photosynthesis hold one each, beside the claim it settled. */
  { id:'meselson-stahl', type:'evidence', unit:'genetics', name:'Meselson–Stahl',
    claim:'Three hypotheses, one experiment with heavy nitrogen, and only semiconservative survived the first round.' },
  { id:'hershey-chase', type:'evidence', unit:'genetics', name:'Hershey–Chase',
    claim:'Label the phage protein and the phage DNA separately, and only the DNA goes into the cell.' },
  { id:'avery', type:'evidence', unit:'genetics', name:'Avery–MacLeod–McCarty',
    claim:'Destroy the protein in a cell extract and it still transforms bacteria. Destroy the DNA and it stops.' },
  { id:'franklin', type:'evidence', unit:'genetics', name:'Photograph 51',
    claim:'An X-ray pattern showing a helix of constant diameter with the phosphate backbone outside. It set the dimensions any model had to fit.' },

  /* ---- photosynthesis --------------------------------------------------
     MOSTLY A REUSE TEST. Seven of this unit's nine dependencies were built
     by earlier units: chemiosmosis, the transport chain, redox, the proton
     gradient, ATP synthase, enzyme catalysis and the chloroplast. What is
     genuinely new is a compartment and a carrier, and both are declared as
     versions of things already on the map rather than as fresh mechanisms.

     THE CARRIERS ARE THE SPINE AGAIN, not the stages: the light reactions
     load ATP and NADPH, the Calvin cycle spends them. Same shape as
     respiration, which is the transfer the reader is meant to notice.

     NO CALVIN INTERMEDIATES. RuBP and 3-PGA are the Krebs-intermediate trap
     in a new costume: named molecules with diagram real estate and nothing
     downstream. Photolysis gets two sentences in most textbooks and carries
     the whole oxygen story, so it is the one at rank 1. */
  { id:'light-energy', type:'concept', unit:'photo', name:'Light energy',
    claim:'Photons arrive in fixed sizes. A pigment either absorbs one whole or does not absorb it.' },
  /* CHLOROPHYLL KEEPS ITS CARD AND THE REST ARE THE FAN, which is the one
     place the map lets a class split that way: chlorophyll is `part-of
     photosystem` at rank 1 and answers a question of its own, and none of the
     others carries anything downstream. Accessory pigments were a card and are
     now the fan they always described. */
  { id:'pigment', type:'concept', unit:'photo', name:'Pigment',
    claim:'A molecule that absorbs some wavelengths and reflects the rest. You see the wavelengths it threw away.',
    kinds:[
      ['Carotenoid', 'Orange and yellow. Catches what chlorophyll misses, and is there all summer, masked.'],
      ['Anthocyanin', 'Red and purple, and mostly made fresh rather than unmasked. Also most red flowers and fruit.'],
      ['Phycobilin', 'Red algae and cyanobacteria. Catches the blue-green that is all that reaches any depth.'],
      ['Retinal', 'The one in your own eye. A pigment absorbing light is not a plant idea.'],
    ] },
  { id:'chlorophyll', type:'structure', unit:'photo', level:1, name:'Chlorophyll',
    claim:'Absorbs red and blue hard, green barely at all. Plants are green because green is the light they waste.' },
  { id:'photosystem', type:'structure', unit:'photo', level:2, name:'Photosystem',
    claim:'A few hundred pigments funnelling energy to one pair of chlorophylls that lets an electron go.',
    kinds:[
      ['Photosystem II', 'First in the chain despite the name. It splits water and starts the electrons moving.'],
      ['Photosystem I', 'Second. Another photon re-energises the electrons, and NADPH gets loaded.'],
    ] },
  { id:'photolysis', type:'process', unit:'photo', occursAt:3, name:'Photolysis',
    claim:'Water is split to replace the electron the photosystem lost. The oxygen is what is left over.' },

  { id:'thylakoid', type:'structure', unit:'photo', level:3, name:'Thylakoid',
    claim:'A flattened sac inside the chloroplast. It is a sealed compartment, which is the only reason a gradient can build.' },

  { id:'light-reactions', type:'process', unit:'photo', occursAt:3, name:'Light reactions',
    claim:'Light drives electrons down a chain, protons pile up in the sac, and the turbine makes ATP. The same chain as respiration, run the other way: light pushes the electrons uphill.' },
  { id:'nadph', type:'structure', unit:'photo', level:1, name:'NADPH',
    claim:'The reduced carrier the light reactions load. Same job as NADH, spent building sugar instead of making ATP.' },

  { id:'calvin', type:'process', unit:'photo', occursAt:3, name:'Calvin cycle',
    claim:'Spends the ATP and NADPH to build sugar from CO₂. It runs in daylight; it just does not need photons directly.' },
  { id:'van-helmont', type:'evidence', unit:'photo', name:'Van Helmont’s willow',
    claim:'A willow gained seventy-five kilograms in five years while its soil lost almost none. He concluded water; the missing source was the air.' },
  { id:'carbon-fixation', type:'concept', unit:'photo', name:'Carbon fixation',
    claim:'Rubisco attaches CO₂ from the air onto a sugar, and that carbon is now plant. A tree is mostly rebuilt atmosphere.',
    kinds:[
      ['C3', 'Rubisco fixes carbon straight into the Calvin cycle. Most plants, and it struggles in heat.'],
      ['C4', 'Carbon is caught in one cell and handed to another, so rubisco never meets much oxygen.'],
      ['CAM', 'Pores open at night and the carbon is held until morning. Cacti, in deserts.'],
    ] },
  { id:'stomata', type:'structure', unit:'photo', level:5, name:'Stomata',
    claim:'Pores in the leaf. Open for CO₂ and water escapes; shut to keep water and the carbon supply stops.' },
  { id:'photorespiration', type:'process', unit:'photo', occursAt:3, name:'Photorespiration',
    claim:'Rubisco binds O₂ instead of CO₂, and the plant spends ATP undoing the result. Worse when it is hot and the pores are shut.' },

  { id:'photosynthesis', type:'process', unit:'photo', occursAt:4, name:'Photosynthesis',
    claim:'Light energy into chemical bonds, using water and air. Respiration read backwards, and the source of both.' },

  /* ---- themes ---------------------------------------------------------- */
  { id:'structfunc', type:'theme', unit:'themes', name:'Structure ↔ Function',
    claim:'Show me everything where a shape is the explanation.' },
  { id:'energyflow', type:'theme', unit:'themes', name:'Energy Flow',
    claim:'Show me everything where the question is where the energy went.' },
  /* THE DISCRIMINATING TEST IS ON THE CARD, because it is what decides
     membership: a codon means an amino acid by convention, not by any
     chemical necessity, and that is what separates information from plain
     causation. Everything tagged below has to pass it. */
  { id:'infoflow', type:'theme', unit:'themes', name:'Information Flow',
    claim:'Show me everything where the meaning is in the encoding and not in the chemistry.' },

  /* ---- anchoring questions --------------------------------------------
     Every non-question node must sit on a path answering at least one. */
  /* THE CHEMISTRY FLOOR'S DOOR. electroneg, covalent, polarity and the ionic
     bond had no question pointing at them — the only stretch of the map like
     that — and molecule-builder is the lesson that IS that floor. */
  { id:'q-bond',     type:'question', qtype:'anchor', text:'What holds a molecule together?' },
  { id:'q-medium',   type:'question', qtype:'anchor', text:'Why is water the medium of life?' },
  { id:'q-tree',     type:'question', qtype:'anchor', text:'How can a tree be a hundred metres tall?' },
  { id:'q-lakes',    type:'question', qtype:'bridging', text:'Why do lakes freeze from the top down?' },
  { id:'q-membrane', type:'question', qtype:'bridging', text:'How does a membrane assemble itself?' },
  { id:'q-sweat',    type:'question', qtype:'bridging', text:'Why does sweating cool you down?' },
  { id:'q-sickle',   type:'question', qtype:'anchor', text:'Why does changing just one amino acid cause a disease?' },
  { id:'q-fever',    type:'question', qtype:'anchor', text:'Why do you get a fever, and why is a high one dangerous?' },
  { id:'q-egg',      type:'question', qtype:'anchor', text:'Why can’t you un-cook an egg?' },
  { id:'q-machine',  type:'question', qtype:'bridging', text:'How does a chain of molecules become a machine with a specific job?' },
  { id:'q-collagen', type:'question', qtype:'anchor', text:'Why does eating protein not directly become your protein?' },
  { id:'q-which',    type:'question', qtype:'bridging', text:'What decides the order of amino acids?' },
  { id:'q-food',     type:'question', qtype:'anchor', text:'Where does the energy in food actually go?' },
  { id:'q-breathe',  type:'question', qtype:'anchor', text:'Why do you breathe out the CO₂?' },
  { id:'q-oxygen',   type:'question', qtype:'bridging', text:'Why do you need oxygen, if it never touches the glucose?' },
  { id:'q-battery',  type:'question', qtype:'bridging', text:'If a mitochondrion is a battery, what is the voltage?' },
  { id:'q-burn',     type:'question', qtype:'anchor', text:'Why do your muscles burn when you sprint?' },
  { id:'q-four',     type:'question', qtype:'anchor', text:'What are the four kinds of macromolecules?' },
  { id:'q-starch',   type:'question', qtype:'bridging', text:'Why can humans digest starch but not cellulose?' },
  { id:'q-fat',      type:'question', qtype:'anchor', text:'Why does fat have more calories than sugar?' },
  { id:'q-oil',      type:'question', qtype:'anchor', text:'Why do oil and water not mix?' },
  { id:'q-boundary', type:'question', qtype:'bridging', text:'Why does a cell need a boundary at all?' },
  { id:'q-burst',    type:'question', qtype:'bridging', text:'Why does a cell in pure water burst, and one in seawater shrivel?' },
  { id:'q-cross',    type:'question', qtype:'bridging', text:'Why can oxygen cross a membrane freely but glucose needs help?' },
  { id:'q-small',    type:'question', qtype:'anchor', text:'Why are cells small?' },
  { id:'q-rooms',    type:'question', qtype:'bridging', text:'Why does a eukaryote bother with compartments?' },
  { id:'q-mitodna',  type:'question', qtype:'bridging', text:'Why does a mitochondrion have its own DNA?' },
  { id:'q-store',    type:'question', qtype:'bridging', text:'How does a molecule store instructions?' },
  { id:'q-neuron',   type:'question', qtype:'anchor', text:'If every cell has the same DNA, why is a neuron not a liver cell?' },
  { id:'q-copy',     type:'question', qtype:'bridging', text:'How does a copy get made without errors piling up?' },
  { id:'q-universal', type:'question', qtype:'anchor', text:'Why do you and a bacterium use the same genetic code?' },
  { id:'q-treemass', type:'question', qtype:'anchor', text:'Where does the mass of a tree come from?' },
  { id:'q-green',    type:'question', qtype:'anchor', text:'Why are plants green?' },

  { id:'q-plantmito', type:'question', qtype:'bridging', text:'If plants make sugar, why do they also need mitochondria?' },
  { id:'q-o2',       type:'question', qtype:'anchor', text:'Where does the oxygen you breathe come from?' },
  { id:'q-sunlight', type:'question', qtype:'anchor', text:'What happens to sunlight when it hits a leaf?' },
  /* EXTENSION: the answer is not on the card it points at, it is inside that
     card's kinds. `kind` names WHICH member answers it, matched on the kinds
     name — clicking deals the fan and draws the question straight to that one,
     so the door lands on the detail rather than on the fan. A tag with no kind
     to land on is the failure this field exists to make impossible. */
  { id:'q-sunburn',  type:'question', qtype:'extension', kind:'Ultraviolet',
    text:'How does a sunburn sometimes lead to skin cancer?' },
  { id:'q-uracil',   type:'question', qtype:'extension', kind:'Uracil',
    text:'Why does RNA use uracil where DNA uses thymine?' },
  { id:'q-hair',     type:'question', qtype:'extension', kind:'α-helix',
    text:'Why does hair stretch and spring back?' },
  { id:'q-digest',   type:'question', qtype:'extension', kind:'Hydrolase',
    text:'What kind of enzyme does digestion?' },
  { id:'q-babies',   type:'question', qtype:'extension', kind:'Stabilising',
    text:'Why are human babies rarely very large or very small?' },
  { id:'q-off',      type:'question', qtype:'extension', kind:'Repressor',
    text:'How does a cell hold a gene switched off?' },
  { id:'q-autumn',   type:'question', qtype:'extension', kind:'Carotenoid',
    text:'Why do leaves change colour in autumn?' },
  /* KINDLESS: these land on the card itself. Each is a thing a reader already
     has an opinion about, answered by one card and nowhere else. */
  { id:'q-cyanide',  type:'question', qtype:'extension',
    text:'Why is cyanide so deadly?' },
  { id:'q-soap',     type:'question', qtype:'extension',
    text:'Why does soap work?' },
  { id:'q-curly',    type:'question', qtype:'extension',
    text:'Why is hair curly?' },
  { id:'q-yeast',    type:'question', qtype:'extension',
    text:'Why does yeast make bread rise and beer strong with the same reaction?' },
  ];

  const EDGES = [
    /* chemistry chain into water. Polarity fans wide on purpose: the doc's
       argument for it being a NODE is that hydrophobic, solvent and
       amphipathic all need it and none can reach a fact buried in water's
       card. */
    ['electroneg',  'prerequisite-of', 'polarity',    1],
    ['covalent',    'prerequisite-of', 'polarity',    1],
    /* how far the pull goes decides which bond you get, so the contrast is
       lateral: two outcomes of one difference, neither read before the other */
    ['electroneg',  'determines',      'ionic-bond',  1],
    ['covalent',    'contrasts-with',  'ionic-bond',  1],
    ['ionic-bond',  'prerequisite-of', 'solvent',     1],
    ['q-bond',      'answers',         'covalent',    1],
    ['q-bond',      'answers',         'ionic-bond',  1],
    ['q-bond',      'answers',         'electroneg',  2],
    ['polarity',    'prerequisite-of', 'hbond',       1],
    ['polarity',    'prerequisite-of', 'hydrophobic', 1],
    ['polarity',    'prerequisite-of', 'solvent',     2],
    /* rank 1: amphipathic IS polarity applied to one molecule — a head that
       dissolves and a tail that cannot — and every membrane and micelle is
       downstream of it. Enrichment was the wrong claim, and it drew a line
       half the width of the ones running past it. */
    ['polarity',    'prerequisite-of', 'amphipathic', 1],
    /* water's polarity is card content on water-mol; the concept describes it */
    ['polarity',    'describes',       'water-mol',   2],

    /* water-mol: five rank-1 edges, and it stays legible */
    ['water-mol',   'causes',          'hbond',       1],
    ['water-mol',   'instance-of',     'structfunc',  1],
    ['q-medium',    'answers',         'water-mol',   1],
    ['q-medium',    'answers',         'solvent',     2],

    /* hbond, the mechanism hub: fans to the properties at rank 1 */
    ['hbond',       'causes',          'cohesion',    1],
    ['hbond',       'causes',          'spec-heat',   1],
    ['hbond',       'causes',          'evap-cool',   1],
    ['hbond',       'causes',          'solvent',     1],
    ['hbond',       'causes',          'hydrophobic', 1],
    ['hbond',       'causes',          'ice-density', 1],
    ['hbond',       'causes',          'ionization',  2],

    /* each property carries its consequence, never water-mol directly.
       A question answers TWO concepts where it can: one concept is a
       caption, two is a crossing. */
    ['cohesion',    'causes',          'transpiration', 1],
    ['q-tree',      'answers',         'transpiration', 1],
    ['q-tree',      'answers',         'cohesion',      2],
    ['spec-heat',   'causes',          'temp-buffer',   1],
    ['evap-cool',   'causes',          'thermoreg',     1],
    ['q-sweat',     'answers',         'thermoreg',     1],
    ['q-sweat',     'answers',         'evap-cool',     2],
    ['solvent',     'enables',         'osmosis',       1],
    ['ice-density', 'causes',          'overwinter',    1],
    ['q-lakes',     'answers',         'ice-density',   1],
    ['q-lakes',     'answers',         'overwinter',    2],
    ['ionization',  'causes',          'buffers',       1],
    /* pH reaching into the enzyme subtree: the doc's property table names
       enzyme pH optima as ionization's biology */
    ['ionization',  'prerequisite-of', 'optimal-cond',  2],

    /* the edge that justifies the project: one cause, three structures */
    ['hydrophobic', 'causes',          'bilayer',       1],
    ['hydrophobic', 'part-of',         'rgroup-inter',  1],
    ['hydrophobic', 'contributes-to',  'dna-structure', 2],
    ['q-membrane',  'answers',         'bilayer',       1],
    ['q-membrane',  'answers',         'hydrophobic',   2],

    /* amphipathic: the generalization, so it isn't rediscovered three times */
    ['phospholipid','instance-of',     'amphipathic',   1],
    ['phospholipid','part-of',         'bilayer',       1],
    ['amphipathic', 'describes',       'bilayer',       2],

    /* WATER IS THE REAGENT, WHICH IS A RESOURCE CLAIM AND NOT A READING ORDER.
       Typed `produces`/`consumes` these ordered the axis, and `produces` sits
       LEFT: it pinned the whole macromolecule lead-in to column 0, on top of
       the electronegativity that water's own story starts from. Nobody reads
       dehydration synthesis before they know what a water molecule is. */
    ['dehydration', 'supplies',        'water-mol',     1],
    ['hydrolysis',  'spends',          'water-mol',     1],
    /* the reading order the resource claim was standing in for, pointing the
       way it actually runs: both reactions are DEFINED by the water, so the
       molecule is read first. This is what puts the macromolecules to the
       right of the unit that explains their solvent. */
    ['water-mol',   'prerequisite-of', 'dehydration',   1],
    ['water-mol',   'prerequisite-of', 'hydrolysis',    1],
    ['dehydration', 'contrasts-with',  'hydrolysis',    1],
    ['dehydration', 'produces',        'peptide-bond',  1],
    ['hydrolysis',  'consumes',        'peptide-bond',  2],   /* digestion, literally */
    ['q-collagen',  'answers',         'hydrolysis',    1],
    ['q-collagen',  'answers',         'amino-acid',    2],

    /* protein spine: two levels, two separate causes */
    ['gene-seq',    'determines',      'primary',       1],
    ['q-which',     'answers',         'gene-seq',      1],
    ['q-which',     'answers',         'primary',       2],
    ['amino-acid',  'part-of',         'primary',       1],
    ['peptide-bond','part-of',         'primary',       2],
    ['r-group',     'part-of',         'amino-acid',    1],
    ['r-group',     'causes',          'rgroup-inter',  1],
    ['hbond',       'causes',          'secondary',     1],   /* backbone, not R-group */
    ['hbond',       'part-of',         'rgroup-inter',  2],   /* R-group H-bonds, the other kind */
    ['disulfide',   'part-of',         'rgroup-inter',  2],
    ['vdw',         'part-of',         'rgroup-inter',  3],
    /* THE LEVELS LADDER IS A RANK-1 CHAIN: primary determines secondary,
       secondary part-of tertiary, tertiary part-of quaternary. Two edge
       types on purpose — the first hop is information (the sequence says
       WHERE local structure forms), the next two are composition. The
       mechanisms feed in from the side (hbond causes secondary,
       rgroup-inter causes tertiary), so the sequence reads without the
       1°-then-2°-then-3° timeline misconception ever being asserted.

       Tertiary holds seven rank-1 edges, over the soft budget and under
       the ~8 hairball line: rgroup-inter in (the hinge), func out (the
       payoff), denaturation in (the destroys/preserves pair), q-machine
       in (the entry), secondary in and quaternary out (the ladder), and
       the secondary contrast below. Everything else is one step in —
       primary reaches tertiary through the hinge, the enzyme subtree
       opens through func, the theme is enrichment. */
    ['rgroup-inter','causes',          'tertiary',      1],
    ['primary',     'determines',      'secondary',     1],
    ['primary',     'determines',      'tertiary',      2],
    ['secondary',   'part-of',         'tertiary',      1],
    /* the unit's central misconception: one continuous folding process.
       Different causes — backbone H-bonds vs side chains — so the pair
       is held apart explicitly. Takes tertiary to seven rank-1 edges,
       still under the ~8 hairball line, and a contrast is the one edge
       type worth the overage. */
    ['secondary',   'contrasts-with',  'tertiary',      1],
    ['tertiary',    'part-of',         'quaternary',    1],
    ['tertiary',    'causes',          'func',          1],
    ['tertiary',    'instance-of',     'structfunc',    2],
    ['quaternary',  'causes',          'func',          2],

    /* folding is the process, tertiary is the result: one direction only */
    ['folding',     'produces',        'tertiary',      2],
    /* the unit's anchoring question, and one of the map's two entry points:
       it lands on the spine (fold, shape, payoff), not on one card */
    ['q-machine',   'answers',         'folding',       1],
    ['q-machine',   'answers',         'tertiary',      1],
    ['q-machine',   'answers',         'func',          2],
    ['folding',     'contrasts-with',  'denaturation',  2],

    /* denaturation: the destroys/preserves pair is what makes irreversibility comprehensible */
    ['denaturation','destroys',        'tertiary',      1],
    ['denaturation','destroys',        'quaternary',    2],
    ['denaturation','preserves',       'primary',       1],
    ['denaturation','contrasts-with',  'hydrolysis',    1],   /* cooking is not digestion */
    ['q-egg',       'answers',         'denaturation',  1],
    ['q-egg',       'answers',         'folding',       2],

    /* enzyme subtree, hanging off tertiary structure */
    ['enzyme',      'instance-of',     'func',          1],
    /* CONTAINS, not part-of: the two containment relations point opposite
       ways on the explanation axis. part-of builds (amino acids make a
       primary structure), contains zooms in (you meet the enzyme, then
       look inside for the pocket). Typed as part-of, the whole enzyme
       subtree sat six columns left of the enzyme and the walk dead-ended
       there — reading the pocket as a prerequisite for the protein. */
    ['tertiary',    'contains',        'active-site',   2],
    ['enzyme',      'contains',        'active-site',   1],
    ['enzyme',      'lowers',          'activation-e',  1],
    ['active-site', 'causes',          'specificity',   1],
    ['induced-fit', 'describes',       'active-site',   2],
    ['optimal-cond','explained-by',    'tertiary',      2],   /* heat unfolds, it doesn't poison */
    ['q-fever',     'answers',         'optimal-cond',  1],
    ['q-fever',     'answers',         'denaturation',  2],

    /* the showcase path: mutation to phenotype to evolution. The middle of
       the chain (fibres, the sickled cell) is the haemoglobin specimen's
       story; the graph carries the two ends. */
    ['q-sickle',    'answers',         'point-mutation',1],
    /* the hop that makes Glu→Val explicable: charged versus nonpolar */
    ['q-sickle',    'answers',         'r-group',       2],
    ['point-mutation','alters',        'primary',       1],
    ['point-mutation','evidence-for',  'nat-select',    1],

    /* ---- photosynthesis --------------------------------------------------
       THE REUSE EDGES FIRST, because they are the argument for the unit.
       Every one of these says "you have met this already", and each is what
       makes the second half of the unit nearly free. */
    ['light-reactions',  'instance-of',    'chemiosmosis',    1],
    ['nadph',            'analogous-to',   'carriers',        1],
    ['thylakoid',        'analogous-to',   'mitochondrion',   1],
    ['redox',            'prerequisite-of','photosynthesis',  1],
    ['chloroplast',      'contains',       'thylakoid',       1],

    /* light: pigments, and the green misconception the unit turns on */
    ['light-energy',     'prerequisite-of','photosystem',     1],
    ['chlorophyll',      'instance-of',    'pigment',         1],
    ['chlorophyll',      'part-of',        'photosystem',     1],
    ['pigment',          'enables',        'photosystem',     2],
    ['q-green',          'answers',        'pigment',         1],
    ['q-green',          'answers',        'chlorophyll',     2],
    /* the autumn question lands on Carotenoid: what changes is not the
       carotenoid, it is the chlorophyll going, and the fan is where that
       sits now */
    ['q-autumn',         'answers',        'pigment',         1],

    /* PHOTOLYSIS IS RANK 1, against every textbook's page count. It carries
       the electron-replacement problem AND the whole oxygen story: the O₂
       you breathe comes off split WATER, never off the CO₂. */
    ['photosystem',      'causes',         'photolysis',      1],
    ['photolysis',       'produces',       'oxygen',          1],
    ['q-o2',             'answers',        'photolysis',      1],
    ['q-o2',             'answers',        'oxygen',          2],
    ['q-sunlight',       'answers',        'light-energy',    1],
    ['q-sunlight',       'answers',        'photosystem',     1],
    ['q-sunlight',       'answers',        'pigment',         2],
    ['q-sunlight',       'answers',        'light-reactions', 2],

    ['photosystem',      'part-of',        'light-reactions', 1],
    ['thylakoid',        'enables',        'light-reactions', 1],
    ['light-reactions',  'produces',       'nadph',           1],
    /* `supplies`, which orders nothing — see the note in nodegraph.html's
       edge grammar. The ATP this makes is the ATP node respiration already
       built, twenty columns to the left. */
    ['light-reactions',  'supplies',       'atp',             2],
    ['light-reactions',  'precedes',       'calvin',          2],

    /* carbon, and the best question in the unit: almost everyone says soil */
    ['calvin',           'consumes',       'nadph',           1],
    ['carbon-fixation',  'part-of',        'calvin',          1],
    /* THE LOOP CLOSES, AND IT IS A LOOP. The sugar photosynthesis builds is
       the sugar respiration burns, so written as `produces` this edge ran
       calvin → glucose → glycolysis → carriers → etc → chemiosmosis →
       light-reactions → nadph → calvin and took the layering with it: every
       node on the map went circular. The claim is true and it is not an
       explanatory order, which is the same thing fermentation's NAD⁺ and
       active transport's ATP each turned out to be. */
    ['calvin',           'supplies',       'glucose',         1],
    ['q-treemass',       'answers',        'carbon-fixation', 1],
    ['q-treemass',       'answers',        'calvin',          2],

    /* the trade-off, and it reaches back into the water unit: the same pore
       that lets carbon in is the one transpiration pulls water out of */
    ['stomata',          'enables',        'carbon-fixation', 2],
    ['stomata',          'contrasts-with', 'transpiration',   2],
    ['photorespiration', 'contrasts-with', 'carbon-fixation', 2],

    /* THE RECIPROCAL PAIR. Not chapters eight and nine: one system seen
       twice, and the reader who crosses this edge has most of both units. */
    ['photosynthesis',   'contains',       'light-reactions', 1],
    ['photosynthesis',   'contains',       'calvin',          1],
    ['photosynthesis',   'contrasts-with', 'respiration',     1],
    ['photosynthesis',   'instance-of',    'energyflow',      1],
    ['q-plantmito',      'answers',        'photosynthesis',  1],
    ['q-plantmito',      'answers',        'respiration',     2],

    /* ---- molecular genetics ----------------------------------------------
       THE HINGE, and it reaches back: base pairing IS hydrogen bonding, the
       node the water unit built, so the same mechanism turns up a third time
       after the bilayer and the protein fold. */
    ['hbond',            'causes',          'base-pairing',   1],
    ['base-pairing',     'part-of',         'dna-structure',  1],
    ['base-pairing',     'enables',         'replication',    1],
    ['base-pairing',     'enables',         'transcription',  1],
    ['base-pairing',     'enables',         'translation',    2],
    ['base-pairing',     'causes',          'semiconservative', 1],
    ['q-store',          'answers',         'base-pairing',   1],
    ['q-store',          'answers',         'dna-structure',  2],

    ['antiparallel',     'describes',       'dna-structure',  1],
    ['antiparallel',     'causes',          'strand-asymmetry', 1],
    ['dna-structure',    'part-of',         'chromosome',     1],
    ['dna-structure',    'contains',        'gene-seq',       1],

    /* replication, with no enzyme roster: what survives is what the rest of
       the course routes through */
    ['dna-structure',    'prerequisite-of', 'replication',    1],
    ['semiconservative', 'describes',       'replication',    1],
    ['proofreading',     'part-of',         'replication',    1],
    ['strand-asymmetry', 'part-of',         'replication',    2],
    /* NO `enzyme enables replication`. The doc's bridge runs the other way,
       from a DNA-polymerase node to Enzyme, and §10 is why there is no such
       node. Written as enzyme → replication it closed a cycle
       (r-group → rgroup-inter → tertiary → func → enzyme → replication →
       mutation → point-mutation → r-group) and dragged the whole genetics
       unit right of the protein spine besides. */
    ['q-copy',           'answers',         'proofreading',   1],
    ['q-copy',           'answers',         'replication',    2],

    /* THE CENTRAL DOGMA, and the point of wiring it at all: it does not stop
       at "protein". Translation lands on primary structure, which the
       proteins unit already carries onward through folding to function, so
       the two units fuse into one causal run. */
    ['gene-seq',         'prerequisite-of', 'transcription',  1],
    ['nucleus',          'contains',        'transcription',  1],
    ['transcription',    'produces',        'mrna',           1],
    ['mrna',             'instance-of',     'rna',            1],
    ['trna',             'instance-of',     'rna',            1],
    ['rna-processing',   'alters',          'mrna',           1],
    ['mrna',             'prerequisite-of', 'translation',    1],
    ['ribosome',         'enables',         'translation',    1],
    ['trna',             'enables',         'translation',    1],
    ['genetic-code',     'determines',      'translation',    1],
    ['reading-frame',    'determines',      'translation',    1],
    ['codon',            'part-of',         'genetic-code',   1],
    ['translation',      'produces',        'primary',        1],
    ['q-universal',      'answers',         'genetic-code',   1],
    ['q-universal',      'answers',         'codon',          2],
    ['central-dogma',    'describes',       'transcription',  1],
    ['central-dogma',    'describes',       'translation',    1],

    /* variation, and the bridge into evolution */
    ['point-mutation',   'instance-of',     'mutation',       1],
    ['frameshift',       'instance-of',     'mutation',       1],
    ['frameshift',       'explained-by',    'reading-frame',  1],
    ['point-mutation',   'alters',          'r-group',        2],
    ['mutation',         'prerequisite-of', 'nat-select',     1],
    /* the two sources of mutation, as a pair rather than one an afterthought:
       your own copying, and the world */
    ['replication',      'causes',          'mutation',       1],
    ['mutagen',          'causes',          'mutation',       1],
    ['q-sunburn',        'answers',         'mutagen',        1],
    /* the extension doors. Each is off the map until it is asked, so these
       edges name where it lands rather than placing anything. */
    ['q-uracil',         'answers',         'nucleotide',     1],
    ['q-hair',           'answers',         'secondary',      1],
    ['q-digest',         'answers',         'enzyme',         1],
    ['q-babies',         'answers',         'nat-select',     1],
    ['q-off',            'answers',         'transcription-factor', 1],
    ['q-cyanide',        'answers',         'etc',            1],
    ['q-soap',           'answers',         'amphipathic',    1],
    ['q-curly',          'answers',         'disulfide',      1],
    ['q-yeast',          'answers',         'ethanol',        1],

    /* THE QUESTION STUDENTS MOST WANT ANSWERED, and the one most often cut
       for time. Rank 1 on purpose. */
    ['gene-expression',  'causes',          'differentiation', 1],
    ['transcription-factor', 'causes',      'gene-expression', 1],
    ['transcription-factor', 'instance-of', 'tertiary',        2],
    ['gene-expression',  'describes',       'transcription',   2],
    ['q-neuron',         'answers',         'differentiation', 1],
    ['q-neuron',         'answers',         'gene-expression', 1],

    /* how we know */
    ['meselson-stahl',   'evidence-for',    'semiconservative', 1],
    ['hershey-chase',    'evidence-for',    'dna-structure',    2],
    ['avery',            'evidence-for',    'dna-structure',    2],
    ['franklin',         'evidence-for',    'dna-structure',    2],
    ['anfinsen',         'evidence-for',    'folding',          2],
    ['van-helmont',      'evidence-for',    'carbon-fixation',  2],
    ['mitchell',         'evidence-for',    'chemiosmosis',     2],
    /* rank 1: the willow IS the answer to where a tree's mass comes from —
       he weighed the pot for five years to rule out the soil. The other
       evidence cards enrich a claim; this one settles a question. */
    ['q-treemass',       'answers',         'van-helmont',      1],

    /* ---- macromolecules --------------------------------------------------
       ONE REACTION, FOUR CLASSES. dehydration already reaches peptide-bond
       and water-mol from the protein unit; here it reaches the pattern
       itself, so the thing a reader learns is the repeat, not four
       chemistries that happen to rhyme. */
    ['functional-group', 'prerequisite-of', 'polymer',        1],
    ['functional-group', 'prerequisite-of', 'monosaccharide', 2],
    ['dehydration',      'produces',        'polymer',        1],
    ['hydrolysis',       'consumes',        'polymer',        1],
    ['q-four',           'answers',         'polymer',        1],
    ['q-four',           'answers',         'functional-group', 2],

    /* the three that are polymers, and the one that is not */
    ['polysaccharide',   'instance-of',     'polymer',        1],
    ['protein-class',    'instance-of',     'polymer',        1],
    ['dna-structure',    'instance-of',     'polymer',        1],
    /* THE PLACE THE PATTERN BREAKS, and the reason the unit is not just a
       list: three fatty acids on a glycerol is an aggregate, not a chain. */
    ['triglyceride',     'contrasts-with',  'polymer',        1],

    /* monomer into class, one per row */
    ['monosaccharide',   'part-of',         'polysaccharide', 1],
    ['glucose',          'instance-of',     'monosaccharide', 1],
    ['amino-acid',       'part-of',         'protein-class',  1],
    ['protein-class',    'prerequisite-of', 'folding',        1],
    ['protein-class',    'contains',        'primary',        1],
    ['enzyme',           'instance-of',     'protein-class',  1],
    ['nucleotide',       'part-of',         'dna-structure',  1],
    ['atp',              'instance-of',     'nucleotide',     2],
    ['gene-seq',         'part-of',         'chromosome',     1],
    ['fatty-acid',       'part-of',         'triglyceride',   1],

    /* starch vs cellulose: one flipped bond, and the whole of why you can
       eat bread and not grass. The highest-value edge in the unit. */
    ['polysaccharide',   'contains',        'starch',         1],
    ['polysaccharide',   'contains',        'cellulose',      1],
    ['starch',           'contrasts-with',  'cellulose',      1],
    ['hydrolysis',       'consumes',        'starch',         1],
    ['q-starch',         'answers',         'cellulose',      1],
    ['q-starch',         'answers',         'starch',         2],

    /* polarity sorts the classes, which is the water unit reaching forward */
    ['polarity',         'determines',      'triglyceride',   2],
    ['hydrophobic',      'causes',          'triglyceride',   2],
    ['q-oil',            'answers',         'triglyceride',   1],
    ['q-oil',            'answers',         'fatty-acid',     2],
    /* the bridge into respiration: a fatty acid tail is more reduced than a
       sugar, so there is more to strip off it */
    ['fatty-acid',       'prerequisite-of', 'carriers',       2],
    ['q-fat',            'answers',         'fatty-acid',     1],
    ['q-fat',            'answers',         'carriers',       2],

    /* ---- cell & membrane -------------------------------------------------
       The bilayer is already built by the water and macromolecule units, so
       this unit starts INSIDE it: the core, the hinge, and then four ways
       around the hinge. */
    ['bilayer',          'contains',        'hydrophobic-core', 1],
    ['hydrophobic-core', 'causes',          'selective-perm',   1],
    ['fluid-mosaic',     'describes',       'bilayer',          1],
    ['membrane-protein', 'part-of',         'fluid-mosaic',     1],
    ['selective-perm',   'necessitates',    'membrane-protein', 1],
    ['membrane-protein', 'instance-of',     'tertiary',         2],
    ['q-boundary',       'answers',         'selective-perm',   1],
    ['q-boundary',       'answers',         'bilayer',          2],

    /* four ways past the barrier, all of them hanging off the hinge */
    ['selective-perm',   'causes',          'simple-diffusion', 1],
    ['selective-perm',   'causes',          'facilitated-diff', 1],
    ['selective-perm',   'causes',          'active-transport', 1],
    ['selective-perm',   'causes',          'bulk-transport',   2],
    ['q-cross',          'answers',         'selective-perm',   1],
    ['q-cross',          'answers',         'facilitated-diff', 2],

    /* THE MOST-FAILED CONCEPT IN BIO 101, and nearly every failure is the
       same one: describing osmosis as solute pulling water. It is water
       diffusing down its OWN gradient, so it is typed as a case of simple
       diffusion and not as a mechanism of its own. */
    ['osmosis',          'explained-by',    'simple-diffusion', 1],
    ['osmosis',          'causes',          'tonicity',         1],
    ['cell-wall',        'contrasts-with',  'bilayer',          1],
    ['q-burst',          'answers',         'tonicity',         1],
    ['q-burst',          'answers',         'osmosis',          2],

    /* helped is not powered: the unit's other reliable misconception */
    ['facilitated-diff', 'contrasts-with',  'active-transport', 1],
    ['channel-protein',  'enables',         'facilitated-diff', 1],
    ['carrier-protein',  'enables',         'facilitated-diff', 1],
    ['channel-protein',  'contrasts-with',  'carrier-protein',  2],
    ['channel-protein',  'instance-of',     'structfunc',       2],
    ['membrane-protein', 'instance-of',     'structfunc',       2],

    /* `spends`, which orders NOTHING on purpose. Active transport costs ATP
       and ATP is made by chemiosmosis, which this unit's gradient explains,
       so typing the cost as an ordering would close the loop
       chemiosmosis → atp → active-transport → gradient → chemiosmosis.
       The same shape as fermentation recycling NAD⁺: a resource claim is
       not an explanatory order. */
    ['active-transport', 'spends',          'atp',              1],
    ['active-transport', 'produces',        'electrochem-grad', 1],
    ['active-transport', 'instance-of',     'energyflow',       2],
    /* THE PAYOFF, and the edge this unit exists to close. A proton gradient
       is active transport storing energy, introduced here two nodes before
       respiration spends it. */
    ['electrochem-grad', 'prerequisite-of', 'chemiosmosis',     1],

    /* the cell, with organelle as a real rung rather than a label */
    ['cell-theory',      'prerequisite-of', 'cell',             1],
    ['sa-v',             'determines',      'cell',             1],
    ['sa-v',             'causes',          'organelle',        2],
    ['q-small',          'answers',         'sa-v',             1],
    ['q-small',          'answers',         'cell',             2],
    ['bilayer',          'part-of',         'cell',             2],
    ['prokaryote',       'instance-of',     'cell',             1],
    ['eukaryote',        'instance-of',     'cell',             1],
    ['prokaryote',       'contrasts-with',  'eukaryote',        1],
    ['cell',             'contains',        'cytoplasm',        2],
    ['eukaryote',        'contains',        'organelle',        1],
    ['q-rooms',          'answers',         'organelle',        1],
    ['q-rooms',          'answers',         'eukaryote',        2],

    /* only the four organelles with downstream traffic keep rank 1 */
    ['organelle',        'contains',        'nucleus',          1],
    ['organelle',        'contains',        'ribosome',         1],
    ['organelle',        'contains',        'mitochondrion',    1],
    ['organelle',        'contains',        'chloroplast',      1],
    ['organelle',        'contains',        'cell-wall',        2],
    ['mitochondrion',    'evidence-for',    'endosymbiosis',    1],
    ['chloroplast',      'evidence-for',    'endosymbiosis',    2],
    ['ribosome',         'evidence-for',    'endosymbiosis',    2],
    ['q-mitodna',        'answers',         'endosymbiosis',    1],
    ['q-mitodna',        'answers',         'mitochondrion',    2],

    /* ---- respiration -----------------------------------------------------
       THE CARRIER SPINE. Every stage touches `carriers` at rank 1 and the
       stages touch each other at rank 2, so expanding a stage deals the
       mechanism before the running order. */
    ['redox',       'prerequisite-of', 'carriers',    1],
    ['redox',       'prerequisite-of', 'respiration', 1],
    ['glycolysis',  'produces',        'carriers',    1],
    ['pyr-ox',      'produces',        'carriers',    1],
    ['krebs',       'produces',        'carriers',    1],
    ['carriers',    'enables',         'etc',         1],

    /* the carbon, which is the other half of what a stage does */
    ['glycolysis',  'consumes',        'glucose',     1],
    ['glycolysis',  'produces',        'pyruvate',    1],
    ['pyr-ox',      'consumes',        'pyruvate',    1],
    ['pyr-ox',      'produces',        'acetyl-coa',  1],
    ['krebs',       'consumes',        'acetyl-coa',  1],

    /* the running order: real, and deliberately rank 2 */
    ['glycolysis',  'precedes',        'pyr-ox',      2],
    ['pyr-ox',      'precedes',        'krebs',       2],
    ['krebs',       'precedes',        'etc',         2],
    ['respiration', 'contains',        'glycolysis',  2],
    ['respiration', 'contains',        'pyr-ox',      3],
    ['respiration', 'contains',        'krebs',       2],
    ['respiration', 'contains',        'etc',         2],

    /* cashing the carriers in */
    ['etc',         'produces',        'proton-gradient', 1],
    ['etc',         'consumes',        'oxygen',          1],
    ['proton-gradient', 'enables',     'chemiosmosis',    1],
    ['chemiosmosis','produces',        'atp',             1],
    /* the misconception this unit exists to break: oxygen does not burn the
       sugar, it sits at the end of the chain mopping up spent electrons.
       A contrast, because the wrong model is what has to be held apart. */
    ['oxygen',      'contrasts-with',  'glucose',         1],
    ['substrate-phos','contrasts-with','oxidative-phos',  1],
    ['glycolysis',  'instance-of',     'substrate-phos',  2],
    ['chemiosmosis','instance-of',     'oxidative-phos',  1],

    /* CHEMIOSMOSIS IS NOT A RESPIRATION DETAIL. It needs a membrane a proton
       cannot cross, and that is the water unit doing work five chapters
       later. This was a direct bilayer edge spanning sixteen columns, which
       by the doc's own audit is the signature of missing intermediates: the
       membrane unit IS those intermediates, so the claim is now a path
       (bilayer → core → hinge → active transport → gradient → chemiosmosis)
       and what stays here is the hinge, as enrichment. */
    ['selective-perm', 'prerequisite-of', 'chemiosmosis',  2],
    ['mitochondrion','contains',       'etc',             1],
    ['mitochondrion','contains',       'krebs',           2],
    ['mitochondrion','enables',        'chemiosmosis',    2],

    /* the bridge OUT of the protein unit the doc names and the map lacked:
       the whole pathway is enzyme-catalysed, and it is what gives the walk
       somewhere to go from `enzyme` */
    ['enzyme',      'enables',         'respiration',     1],
    ['enzyme',      'enables',         'glycolysis',      2],
    /* digestion's rightward edge, which is what the hydrolysis nudge stood
       in for until this unit existed */
    ['hydrolysis',  'produces',        'glucose',         2],

    /* fermentation is the NEGATIVE CONTROL for the carrier story: it makes
       no ATP of its own, it empties the pool so glycolysis can keep running */
    ['fermentation','contrasts-with',  'respiration',     1],
    ['fermentation','consumes',        'pyruvate',        1],
    /* NOT `enables glycolysis`, which is what recycling NAD⁺ feels like and
       which closed a cycle on the explanation axis: glycolysis → pyruvate →
       fermentation → glycolysis. Stating the mechanism instead of the
       feedback puts fermentation on the carrier spine, which is its whole
       job here — the negative control for what happens when the pool cannot
       be emptied. */
    ['fermentation','produces',        'carriers',        1],
    /* the two branches: same job, different exit */
    ['fermentation','produces',        'lactate',         1],
    ['fermentation','produces',        'ethanol',         1],
    ['lactate',     'contrasts-with',  'ethanol',         1],

    ['q-food',      'answers',         'respiration',     1],
    ['q-food',      'answers',         'atp',             2],
    ['q-breathe',   'answers',         'krebs',           1],
    ['q-breathe',   'answers',         'pyr-ox',          2],
    ['q-oxygen',    'answers',         'oxygen',          1],
    ['q-oxygen',    'answers',         'etc',             2],
    ['q-battery',   'answers',         'proton-gradient', 1],
    ['q-battery',   'answers',         'chemiosmosis',    2],
    ['q-burn',      'answers',         'fermentation',    1],
    ['q-burn',      'answers',         'carriers',        2],

    /* THE THEME'S FAN — every card whose claim is shape-explains-function.
       Themes are the sanctioned exception to the rank-1 budget: the fan IS
       the view, and the page deals a theme's whole fan regardless of rank.
       So rank here is read from the INSTANCE's side only, and tertiary's
       (above) stays 2 to protect that card's own budget. */
    ['active-site',  'instance-of',    'structfunc',    1],
    ['bilayer',      'instance-of',    'structfunc',    2],
    ['ice-density',  'instance-of',    'structfunc',    2],
    ['dna-structure','instance-of',    'structfunc',    2],
    ['enzyme',       'instance-of',    'structfunc',    2],

    /* Energy Flow's fan, read from the instance's side like structfunc's */
    ['respiration',  'instance-of',    'energyflow',    1],
    ['chemiosmosis', 'instance-of',    'energyflow',    1],
    ['carriers',     'instance-of',    'energyflow',    1],
    ['atp',          'instance-of',    'energyflow',    1],
    ['fermentation', 'instance-of',    'energyflow',    2],
    ['redox',        'instance-of',    'energyflow',    2],

    /* INFORMATION FLOW'S FAN. Almost entirely a tagging pass over nodes that
       were already built: what was missing was the tag, not the material.
       Rank is read from the instance's side, as with the other themes, so
       rank 1 is reserved for the three cards whose whole point IS the
       encoding and everything else stays at 2 to protect its own budget. */
    /* tRNA is the canonical exemplar: one end reads a codon, the other holds
       an amino acid, and nothing chemically relates the two ends. The
       association is imposed, which is the theme in one molecule. */
    ['trna',          'instance-of',    'infoflow',      1],
    ['genetic-code',  'instance-of',    'infoflow',      1],
    /* where the information is, is itself a convention */
    ['reading-frame', 'instance-of',    'infoflow',      1],
    ['base-pairing',  'instance-of',    'infoflow',      2],
    ['dna-structure', 'instance-of',    'infoflow',      2],
    ['replication',   'instance-of',    'infoflow',      2],
    ['transcription', 'instance-of',    'infoflow',      2],
    ['codon',         'instance-of',    'infoflow',      2],
    ['mutation',      'instance-of',    'infoflow',      2],
    ['gene-expression','instance-of',   'infoflow',      2],
    ['transcription-factor','instance-of','infoflow',    2],
    ['primary',       'instance-of',    'infoflow',      2],
    ['func',          'instance-of',    'infoflow',      2],
    /* shape as recognition: an enzyme reading its substrate */
    ['specificity',   'instance-of',    'infoflow',      2],
    /* DUAL-THEMED on purpose. A gradient is stored energy and it is also a
       signal, and it is the one node in the course that is plainly both. */
    ['electrochem-grad','instance-of',  'infoflow',      2],
    ['electrochem-grad','instance-of',  'energyflow',    2],

    /* THE PAIRING, and the reason themes are nodes rather than tags: energy
       degrades and cannot be copied, information can be copied without loss.
       A cell spends the first to preserve the second, which is what
       proofreading and repair ARE. No other edge on the map says this, and
       none could if a theme were a tag. */
    ['infoflow',      'contrasts-with', 'energyflow',    1],
  ];

  global.GraphData = { UNITS, CHEM_TINT, LADDER, NODES, EDGES };
})(this);
