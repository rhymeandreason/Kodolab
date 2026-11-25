/* Every word Onion Root Tip shows, in English. Edit freely: the code only names these keys.
 * A translation is text.<lang>.js beside this file, LabText.add('<lang>', { … }) with only
 * the keys it translates (lab/page.js loads it for ?lang=<lang>).
 * Markup allowed: <b>, <i>, <em>, <sup>. {name} is filled in by the code. */
LabText.add('en', {
  title: 'Onion Root Tip',
  icon: 'ph-microscope',

  intro: {
    kicker: 'Interactive 3D lab',
    title: 'Catch cells <em>dividing</em>',
    body: 'A root grows from its tip, where cells divide all the time. Prepare a squash of an onion root tip, stain its chromosomes, and find each stage of mitosis under the microscope.',
    keys: [
      { color: '#a82d5c', text: '<b>Stain</b> binds DNA, so chromosomes show up dark' },
      { color: '#10b981', text: '<b>Stages</b> of mitosis look different in a squash' },
      { color: '#4f46e5', text: '<b>Mitotic index</b>: the share of cells caught dividing' },
    ],
  },

  info: {
    kicker: 'About the experiment',
    title: 'How do you see mitosis?',
    body: ['Root tips grow fast, so many of their cells are dividing at any moment. Treat a tip so its cells come apart, stain the DNA, and press it flat into a single layer of cells.'],
    steps: [
      { head: 'Cut the tip.', text: 'Cells divide in the <b>meristem</b>, a few millimetres behind the very tip.' },
      { head: 'Soften in acid.', text: 'Warm hydrochloric acid breaks down the pectin that glues plant cells together. It also kills the cells, freezing each one at the stage it had reached.' },
      { head: 'Stain.', text: 'Orcein and toluidine blue both bind DNA, so chromosomes turn dark against pale cytoplasm.' },
      { head: 'Squash.', text: 'Pressing on the coverslip spreads the cells into one layer, so you see each cell on its own.' },
      { head: 'Count.', text: 'Name the stage of each cell. The share that are dividing is the <b>mitotic index</b>.' },
    ],
    tips: [
      { icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan' },
      { icon: 'ph-microscope', text: 'In the microscope: drag to move the slide · scroll to focus · keys 1 to 4 change objective · I P M A T name a cell' },
    ],
  },

  phases: {
    cut: { title: 'Cut the root tip', desc: 'The last 5 mm of a root' },
    acid: { title: 'Soften in acid', desc: '1 M HCl · 60 °C · 5 min' },
    stain: { title: 'Stain', desc: 'Orcein or toluidine blue' },
    squash: { title: 'Mount and squash', desc: 'Coverslip, then firm pressure' },
    observe: { title: 'Observe', desc: 'Find and count dividing cells' },
  },

  steps: {
    cut: {
      title: 'Cut the root tip', short: 'Cut',
      action: 'cut a root tip',
      hint: 'Click the <b>onion</b>',
      detail: 'The onion has grown fresh roots over water for a few days. Lift it out and cut off the last 5 mm of one root.',
      why: 'Cells divide in the meristem, just behind the very tip. Further up, cells only grow longer.',
      caption: 'Lift the onion out of the water, cut off the last 5 mm of a root, and drop it into the watch glass',
    },
    acid: {
      title: 'Add hydrochloric acid', short: 'Acid',
      action: 'add a few drops',
      hint: 'Click the <b>HCl</b> bottle',
      detail: 'Cover the tip in the watch glass with a few drops of 1 M hydrochloric acid.',
      why: 'The acid breaks down pectin, the glue between plant cells, so they can be spread apart. It also kills the cells, fixing each one at the stage it had reached.',
      caption: 'Cover the tip with 1 M hydrochloric acid, which loosens the glue between its cells',
    },
    heat: {
      title: 'Warm the acid', short: 'Heat',
      action: 'switch on the hot plate',
      hint: 'Click the <b>hot plate</b>',
      detail: 'Warm the watch glass to 60 °C for 5 minutes. Then pour off the acid and rinse the tip in water.',
      why: 'Warmth speeds the acid up. Rinsing washes it out, so it stops softening the tissue and does not get in the way of the stain.',
      caption: 'Warm the acid to 60 °C for 5 minutes, then pour it off and rinse the tip in water',
    },
    stain: {
      title: 'Stain the chromosomes', short: 'Stain',
      action: 'stain the tip with this',
      hint: 'Click a <b>stain</b>',
      detail: 'Lay the tip on a slide and cover it with a few drops of stain. Pick one: <b>acetic orcein</b> or <b>toluidine blue</b>.',
      why: 'Both stains bind DNA. Chromosomes pack DNA tightly, so they stain darkest, and the dense meristem at the tip darkens most.',
      caption: 'Lay the tip on a slide and cover it with stain for 2 minutes, until the chromosomes darken',
    },
    cover: {
      title: 'Add a coverslip', short: 'Coverslip',
      action: 'lower the coverslip',
      hint: 'Click the <b>coverslip</b>',
      detail: 'Lower a coverslip onto the stain at an angle, then lay filter paper over it.',
      why: 'Lowering it at an angle pushes air out, so no bubbles get trapped. The paper soaks up extra stain.',
      caption: 'Lower the coverslip at an angle so no air is trapped, then lay filter paper over it',
    },
    squash: {
      title: 'Squash the tissue', short: 'Squash',
      action: 'press down',
      hint: 'Click the <b>pencil</b>',
      detail: 'Press straight down on the coverslip with the eraser end of a pencil, without twisting. Press {n} of {total}.',
      why: 'Firm, even pressure spreads the cells into a single layer, so each one can be seen on its own. Too hard, and they burst.',
      caption: 'Press straight down with the eraser, without twisting, to spread the cells into a single layer',
    },
    observe: {
      title: 'Observe under the microscope', short: 'Observe',
      action: 'put the slide on the stage',
      hint: 'Click the <b>microscope</b>',
      detail: 'Clip the slide onto the stage and switch on the lamp. Start on low power to find the dark meristem, then switch up to name single cells.',
      why: 'Low power shows the whole tip, so you can find where cells divide. High power shows chromosomes in each cell.',
      caption: 'Clip the slide onto the microscope stage and switch on the lamp',
    },
    count: {
      title: 'Count dividing cells', short: 'Count',
      action: 'look through the eyepiece',
      hint: 'Click the <b>microscope</b>',
      detail: 'Find the meristem, switch to high power, and name the stage of at least {n} cells. Named so far: <b>{done}</b>.',
      why: 'The more cells you count, the closer your mitotic index gets to the true share of dividing cells.',
      caption: 'Look through the eyepiece and count the dividing cells',
    },
  },

  complete: {
    hint: '<b>Your mitotic index: {mi}%.</b> Dividing: {dividing} of the {n} cells you named.',
    skipped: '<b>Your slide is on the microscope.</b> Look through the eyepiece to count its cells.',
    why: 'Most cells are in interphase, because it is the longest part of the cell cycle. The share caught in each stage tells you how long that stage lasts.',
    open: 'Back to the eyepiece',
    caption: 'Look through the eyepiece and count the dividing cells',
    toast: 'Slide ready',
  },
  jump: 'Microscope',

  objects: {
    onion: { name: 'Onion', short: 'Onion', desc: 'Grown over water for a few days, so it has fresh roots' },
    scalpel: { name: 'Scalpel', desc: 'For cutting the root tip' },
    acid: { name: '1 M hydrochloric acid', short: 'HCl', desc: 'In a dropper bottle' },
    hot: { name: 'Hot plate', short: 'Hot plate', desc: 'Set to 60 °C' },
    glass: { name: 'Watch glass', desc: 'A shallow glass dish to soak the root tip in' },
    orcein: { name: 'Acetic orcein', short: 'Orcein', desc: 'A red-purple stain that binds DNA' },
    toluidine: { name: 'Toluidine blue', short: 'Toluidine', desc: 'A blue stain that binds DNA' },
    slide: { name: 'Microscope slide', desc: 'Glass, 76 × 26 mm' },
    coverslip: { name: 'Coverslip', short: 'Coverslip', desc: 'A thin square of glass to cover the tissue' },
    paper: { name: 'Filter paper', desc: 'Soaks up extra stain' },
    pencil: { name: 'Pencil', short: 'Pencil', desc: 'The eraser end presses evenly' },
    scope: { name: 'Light microscope', short: 'Microscope', desc: 'Objectives of 4×, 10×, 40× and 100×' },
  },

  props: {
    beaker: { label: 'Water', sub: 'onion roots' },
    acid: { title: '1 M HCl', line: 'HYDROCHLORIC ACID', note: 'corrosive' },
    orcein: { title: 'ACETIC', line: 'ORCEIN 2%', note: 'stains DNA' },
    toluidine: { title: 'TOLUIDINE', line: 'BLUE 0.05%', note: 'stains DNA' },
    slide: ['Allium cepa', 'root tip squash'],
  },

  stains: {
    orcein: { name: 'acetic orcein' },
    toluidine: { name: 'toluidine blue' },
  },

  /* The five stages a student names. key: the keyboard shortcut and the model's chip.
     desc: what is happening, under the 3D model. hint: what to look for, after naming a cell. */
  stages: [
    { name: 'Interphase', key: 'I',
      desc: 'The cell is not dividing. Its DNA is loose chromatin, so the nucleus looks evenly grainy, with a darker nucleolus. The DNA is copied now, ready for division. Most cells are here.',
      hint: 'a round, evenly grainy nucleus with a clear outline, and no separate threads.' },
    { name: 'Prophase', key: 'P',
      desc: 'Chromatin coils into visible threads, each a pair of sister chromatids joined at a centromere. The nucleolus fades, the nuclear envelope breaks up, and the spindle catches the chromosomes.',
      hint: 'a nucleus full of tangled, thread-like chromosomes.' },
    { name: 'Metaphase', key: 'M',
      desc: 'Chromosomes line up across the middle of the cell. Spindle fibres from each pole attach to every centromere.',
      hint: 'chromosomes in a dense band across the middle of the cell.' },
    { name: 'Anaphase', key: 'A',
      desc: 'Sister chromatids separate and are pulled to opposite poles. Their arms trail behind, so they look like Vs.',
      hint: 'two groups of V-shaped chromatids moving apart toward the ends.' },
    { name: 'Telophase', key: 'T',
      desc: 'The chromatids reach the poles and uncoil, and a nuclear envelope forms around each set. A plant cell cannot pinch in two, so a cell plate grows across the middle and becomes the new wall.',
      hint: 'two dense clumps at opposite ends, often with a new wall forming between them.' },
  ],

  scope: {
    title: 'Light microscope',
    sub: 'Onion root tip squash · {stain}',
    model: 'Mitosis in 3D',
    drag: 'drag to rotate',
    play: 'Play or pause',
    timeline: 'Mitosis timeline',
    countTitle: 'Identify and count',
    empty: 'Find the meristem near the root tip, switch to <b>40×</b> or <b>100×</b>, then click a cell.',
    cellId: 'Cell {n}',
    question: 'Which stage is this cell in?',
    correct: '<b>Correct: {stage}.</b> Look for {hint}',
    wrong: '<b>This one is in {stage}.</b> Look for {hint}',
    mi: 'Mitotic index',
    miFormula: 'Mitotic index = dividing cells (P + M + A + T) ÷ all cells counted',
    countMore: '{n} of {need} cells for a fair estimate',
    counted: '{n} cells counted',
    accuracy: 'You named {right} of {n} correctly ({pct}%)',
    trueMi: 'True mitotic index in this view: <b>{mi}%</b> ({n} cells)',
    answers: 'Show answers',
    reset: 'Reset count',
    zones: ['Root cap', 'Meristem', 'Elongation zone'],
    chips: { empty: 'Empty slide: move toward the tissue', cap: 'Root cap', meristem: 'Meristem: where cells divide', elongation: 'Elongation zone' },
    hints: {
      start: 'Drag to move the slide · scroll to focus',
      pickMag: 'Switch to 40× or 100× to name single cells',
    },
  },
});
