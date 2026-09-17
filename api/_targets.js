/* =============================================================================
 *  _targets.js — what the tutor is allowed to point at, across the lessons
 * =============================================================================
 *  The same trick as the chapter catalog, one level in. A target id goes into
 *  the response schema as an enum, so the tutor can pick one or pick none and
 *  cannot invent a third thing. The page owns what an id then does; nothing
 *  here knows about Focus, Hotspot or the camera.
 *
 *  IDS ARE QUALIFIED, `lesson/target`, because the tutor can aim off the page
 *  the student is on. Two renderings, and they are different affordances:
 *
 *    · a target in the current lesson  → act in place, no navigation
 *    · a target in another lesson      → a link that leaves this page
 *
 *  ONLY `step` TARGETS TRAVEL. A control you cannot reach is not a destination,
 *  and a molecular focus depends on what that scene has currently built. So a
 *  lesson offers its whole list at home and only its steps to everyone else,
 *  which is also what keeps the prompt from growing by a lesson at a time.
 *
 *  `what` is written for the model, not for a student. It is what a question's
 *  wording has to match against, so it says what the thing IS and what it does,
 *  in the words a beginner would use.
 *
 *  Every claim in here is checked by `demos/ask/check-ask.js`: a `ui` target
 *  names a DOM id that must exist in the lesson, a `step` target names a title
 *  that must appear in it, and `deepLink` must be true only where the page
 *  really does read its parameter from the URL. That last one matters: without
 *  it a link silently lands on the right page at the wrong place.
 * ========================================================================== */
'use strict';

const LESSONS = {
  'water-lab': {
    title: 'Structure of Water',
    page: 'demos/water-lab.html',
    chapter: 'water',
    param: 'step',
    deepLink: false,          // water-lab does not read ?step= yet

    /* How this simulation BEHAVES, as opposed to what the science is. A student
     * stuck on the sim asks a science question, and the honest answer is often
     * about the sim: with three molecules on screen there is almost nothing to
     * bond to, and explaining hydrogen bonding again does not help.
     *
     * Written for the model, and paired with the live readings the page sends,
     * so a note can be conditional on a number the tutor can actually see. */
    notes: [
      'The scene starts with a single molecule on step 1 and tops up to three from step 2 onward, '
      + 'which is enough to see a hydrogen bond but not enough for the bonding to look like much. '
      + 'The page judges this for you and sends it as `crowding`. When crowding says nearly empty '
      + 'or sparse and the student is asking why little is happening, why there are so few bonds, '
      + 'or why heating does nothing, the answer is to add more water: say so and point at the '
      + 'add-water button rather than explaining hydrogen bonding again. When crowding says a '
      + 'comfortable crowd, do NOT suggest adding more, and do not accept "hardly any bonds" as '
      + 'true just because the student said it.',

      'The temperature slider only exists from step 3 onward, and the salt controls only on step 5. '
      + 'Point at them anyway from an earlier step: the page takes the student to the step that has '
      + 'the control and then rings it. Do NOT tell them a control is locked or will appear later, '
      + 'and do not decline to point because they have not reached it.',

      'The solvent step fills the scene to sixteen molecules on its own, because a hydration shell '
      + 'is about six waters per ion and needs a crowd. If salt is in and the shells look wrong, '
      + 'more water is usually the fix.',
    ],
    targets: [
      { id: 'step-polar',   kind: 'step', at: 0, title: 'A Polar Molecule',
        what: 'one water molecule, its V shape, the 104.5 degree angle, and why oxygen pulls the shared electrons toward itself' },
      { id: 'step-hbond',   kind: 'step', at: 1, title: 'Hydrogen Bonds',
        what: 'hydrogen bonds linking the positive hydrogens of one water molecule to the negative oxygen of another' },
      { id: 'step-heat',    kind: 'step', at: 2, title: 'Specific Heat',
        what: 'why water absorbs so much heat for a small temperature change, why sweating cools you, and why oceans steady the climate' },
      { id: 'step-ice',     kind: 'step', at: 3, title: 'Why Ice Floats',
        what: 'freezing locking molecules into an open hexagonal lattice, so ice is less dense than liquid water and floats' },
      { id: 'step-solvent', kind: 'step', at: 4, title: 'The Universal Solvent',
        what: 'salt dissolving, each ion gathering a shell of about six water molecules, and how dissolved salt shifts freezing and boiling' },

      { id: 'temp-slider',  kind: 'ui', el: 'trange', title: 'the temperature slider',
        what: 'the temperature slider, which heats the water toward boiling or cools it toward ice' },
      { id: 'add-salt',     kind: 'ui', el: 'addsalt', title: 'the salt button',
        what: 'the button that drops salt into the water so it dissolves into sodium and chloride ions' },
      { id: 'add-water',    kind: 'ui', el: 'addwater', title: 'add a water molecule',
        what: 'the button that adds another water molecule to the scene' },

      { id: 'a-hydrogen-bond', kind: 'atoms', title: 'a hydrogen bond',
        what: 'a single hydrogen bond between two water molecules, the weak attraction between a positive hydrogen and a negative oxygen' },
      { id: 'the-charges',     kind: 'atoms', title: 'the partial charges',
        what: 'the partial charges on one molecule, the slightly negative oxygen and the two slightly positive hydrogens' },
      { id: 'hydration-shell', kind: 'atoms', title: 'a hydration shell',
        what: 'the shell of water molecules surrounding a dissolved ion, turned so their opposite charge faces inward' },
    ],
  },

  'molecule-builder': {
    title: 'Ionic and Covalent Bonds',
    page: 'demos/molecule-builder.html',
    chapter: 'bonds',
    param: 'build',
    deepLink: false,
    targets: [
      { id: 'build-water',    kind: 'step', at: 'water',    title: 'Water',
        what: 'building H2O by hand, watching oxygen take two hydrogens and the bent shape fall out of it' },
      { id: 'build-methane',  kind: 'step', at: 'methane',  title: 'Methane',
        what: 'building CH4, where carbon takes four hydrogens and the result is a tetrahedron rather than a flat cross' },
      { id: 'build-ammonia',  kind: 'step', at: 'ammonia',  title: 'Ammonia',
        what: 'building NH3, where nitrogen takes three hydrogens and keeps a lone pair that pushes the shape into a pyramid' },
      { id: 'build-ammonium', kind: 'step', at: 'ammonium', title: 'Ammonium',
        what: 'ammonia grabbing a fourth hydrogen from water to become the positively charged ammonium ion' },
      { id: 'build-co2',      kind: 'step', at: 'co2',      title: 'Carbon dioxide',
        what: 'building CO2, a straight line with two double bonds, and why polar bonds can still leave a nonpolar molecule' },
      { id: 'build-n2',       kind: 'step', at: 'n2',       title: 'Nitrogen gas',
        what: 'building N2, two nitrogens sharing three pairs of electrons in a triple bond, and why that makes it so unreactive' },
      { id: 'build-hcl',      kind: 'step', at: 'hcl',      title: 'Hydrogen chloride',
        what: 'building HCl, a single covalent bond so lopsided that it sits at the edge of being ionic' },
      { id: 'build-nacl',     kind: 'step', at: 'nacl',     title: 'Salt',
        what: 'sodium handing its electron to chlorine instead of sharing it, making two ions that attract, and what happens when water gets at them' },
      { id: 'build-kcl',      kind: 'step', at: 'kcl',      title: 'Potassium chloride',
        what: 'potassium and chlorine forming an ionic pair the same way sodium chloride does' },
      { id: 'build-mgcl2',    kind: 'step', at: 'mgcl2',    title: 'Magnesium chloride',
        what: 'magnesium giving away two electrons, so it takes two chlorides rather than one, and the formula follows the count' },
    ],
  },

  'hemoglobin-lab': {
    title: 'Structure of Protein',
    page: 'demos/hemoglobin-lab.html',
    chapter: 'protein',
    param: 'level',
    deepLink: false,
    targets: [
      { id: 'level-primary',    kind: 'step', at: 'primary',    title: 'primary',
        what: 'the primary structure, the bare chain of amino acids in the order the gene spelled them' },
      { id: 'level-secondary',  kind: 'step', at: 'secondary',  title: 'secondary',
        what: 'the secondary structure, where hydrogen bonds along the backbone coil parts of the chain into alpha helices and sheets' },
      { id: 'level-tertiary',   kind: 'step', at: 'tertiary',   title: 'tertiary',
        what: 'the tertiary structure, the whole chain folding into one 3D shape with the water-hating side chains buried inside, and the heme settling into its pocket' },
      { id: 'level-quaternary', kind: 'step', at: 'quaternary', title: 'quaternary',
        what: 'the quaternary structure, four separate folded chains docking together to make one working hemoglobin' },
    ],
  },

  'glycolysis-lab': {
    title: 'Glycolysis',
    page: 'demos/glycolysis-lab.html',
    chapter: 'glycolysis',
    param: 'step',
    deepLink: true,           // reads ?step= at startup
    // Stages, not the ten individual steps: as a destination "the Payoff stage"
    // is what a student can act on, and ten entries would cost the prompt more
    // than the precision is worth. `at` is the stage's first step number.
    targets: [
      { id: 'stage-priming',   kind: 'step', at: 1, title: 'Priming',
        what: 'the priming stage, where the cell spends two ATP to trap glucose and make it unstable enough to split' },
      { id: 'stage-cleavage',  kind: 'step', at: 4, title: 'Cleavage',
        what: 'the cleavage stage, where the six carbon sugar is cut into two three carbon molecules' },
      { id: 'stage-oxidation', kind: 'step', at: 6, title: 'Oxidation',
        what: 'the oxidation stage, where electrons are stripped off and loaded onto NAD+ to make two NADH' },
      { id: 'stage-payoff',    kind: 'step', at: 7, title: 'Payoff',
        what: 'the payoff stage, where four ATP are made, giving a net gain of two, and pyruvate is the end product' },
    ],
  },

  'respiration-lab': {
    title: 'Cellular Respiration',
    page: 'demos/respiration-lab.html',
    chapter: 'respiration',
    param: 'step',
    deepLink: false,          // one shell step; the scroll is the state, and the page reads no ?step=
    // The page's phases in scroll order: `at` is the index the page sends as
    // `step`, and its `act` scrolls the chart to that phase's mark.
    targets: [
      { id: 'phase-glycolysis', kind: 'step', at: 0, title: 'Glycolysis',
        what: 'glycolysis in the cytoplasm, before anything reaches a mitochondrion: one glucose split to two pyruvate, two ATP net and two NADH' },
      { id: 'phase-mito',       kind: 'step', at: 2, title: 'Link step',
        what: 'pyruvate entering the mitochondrion, the link step and the Krebs cycle: every carbon of glucose leaves as CO2 and the electrons are loaded onto NADH and FADH2' },
      { id: 'phase-carriers',   kind: 'step', at: 3, title: '10 NADH',
        what: 'the carriers: where the ten NADH and two FADH2 came from, and that they carry the electrons the chain will use' },
      { id: 'phase-etc',        kind: 'step', at: 4, title: 'Electron transport',
        what: 'the electron transport chain and ATP synthase: electrons pass down the complexes to oxygen, protons are pumped out of the matrix, and their flow back through ATP synthase makes most of the ATP' },
    ],
  },

  'membrane-lab': {
    title: 'Membrane and Osmosis',
    page: 'demos/membrane-lab.html',
    chapter: 'membrane',
    param: 'step',
    deepLink: true,           // reads ?step= at startup
    // `at` IS THE URL NUMBER, not the index: 1-based, like glycolysis-lab
    // and krebs-lab. These were 0-based ordinals while deepLink was false
    // and nothing sent them anywhere.
    targets: [
      { id: 'step-bilayer', kind: 'step', at: 1, title: 'the bilayer',
        what: 'the phospholipid bilayer itself, heads facing the water on both sides and oily tails hiding in the middle' },
      { id: 'step-through', kind: 'step', at: 2, title: 'what gets through',
        what: 'which molecules cross a membrane unaided, why oily things pass and charged things do not, and why size is not the rule' },
      { id: 'step-osmosis', kind: 'step', at: 3, title: 'osmosis',
        what: 'osmosis, water moving toward the saltier side, and what hypertonic, hypotonic and isotonic do to a cell' },
      { id: 'step-channel', kind: 'step', at: 4, title: 'a channel',
        what: 'a channel protein letting one specific thing through without spending energy, and how it stays selective' },
      { id: 'step-pump',    kind: 'step', at: 5, title: 'the pump',
        what: 'a pump spending ATP to move ions against their gradient, uphill, which diffusion cannot do' },
      { id: 'step-rest',    kind: 'step', at: 6, title: 'a cell at rest',
        what: 'active and passive transport side by side, and the voltage a resting cell holds across its membrane' },
    ],
  },
};

/* The address space seen from one lesson: everything at home, steps only from
 * everywhere else. Ids are qualified so the two can share one enum. */
function visible(lesson) {
  const out = [];
  for (const [id, L] of Object.entries(LESSONS)) {
    const home = id === lesson;
    for (const t of L.targets) {
      if (!home && t.kind !== 'step') continue;
      out.push({ ...t, qid: `${id}/${t.id}`, lesson: id, home, chapter: L.chapter,
                 lessonTitle: L.title, page: L.page, param: L.param, deepLink: L.deepLink });
    }
  }
  return out;
}

const forLesson = id => LESSONS[id] || null;
const ids       = lesson => visible(lesson).map(t => t.qid);
const byId      = (lesson, qid) => visible(lesson).find(t => t.qid === qid) || null;

module.exports = { LESSONS, visible, forLesson, ids, byId };
