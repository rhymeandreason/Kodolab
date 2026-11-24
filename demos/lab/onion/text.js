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
      captions: { lift: 'Lift the onion out of the water', cut: 'Cut off the last 5 mm of a root', drop: 'Into a tube of 1 M hydrochloric acid' },
    },
    acid: {
      title: 'Soften in warm acid', short: 'Acid',
      action: 'warm the tube',
      hint: 'Click the <b>water bath</b>',
      detail: 'Stand the tube of 1 M hydrochloric acid in the 60 °C water bath for 5 minutes.',
      why: 'The acid breaks down pectin, the glue between plant cells, so they can be spread apart. It also kills the cells, fixing each one at the stage it had reached.',
      caption: { text: 'Warm the tip in 1 M HCl at 60 °C', note: '5 minutes' },
    },
    stain: {
      title: 'Stain the chromosomes', short: 'Stain',
      action: 'stain the tip with this',
      hint: 'Click a <b>stain</b>',
      detail: 'Lay the tip on a slide and cover it with a drop of stain. Pick one: <b>acetic orcein</b> or <b>toluidine blue</b>.',
      why: 'Both stains bind DNA. Chromosomes pack DNA tightly, so they stain darkest, and the dense meristem at the tip darkens most.',
      caption: { text: 'Cover the tip with a drop of stain', note: '2 minutes' },
    },
    cover: {
      title: 'Add a coverslip', short: 'Coverslip',
      action: 'lower the coverslip',
      hint: 'Click the <b>coverslip</b>',
      detail: 'Lower a coverslip onto the stain at an angle, then lay filter paper over it.',
      why: 'Lowering it at an angle pushes air out, so no bubbles get trapped. The paper soaks up extra stain.',
      caption: 'Lower the coverslip at an angle',
    },
    squash: {
      title: 'Squash the tissue', short: 'Squash',
      action: 'press down',
      hint: 'Click the <b>pencil</b>',
      detail: 'Press straight down on the coverslip with the eraser end of a pencil, without twisting. Press {n} of {total}.',
      why: 'Firm, even pressure spreads the cells into a single layer, so each one can be seen on its own. Too hard, and they burst.',
      caption: 'Press straight down with the eraser',
    },
    observe: {
      title: 'Observe under the microscope', short: 'Observe',
      action: 'put the slide on the stage',
      hint: 'Click the <b>microscope</b>',
      detail: 'Clip the slide onto the stage and switch on the lamp. Start on low power to find the dark meristem, then switch up to name single cells.',
      why: 'Low power shows the whole tip, so you can find where cells divide. High power shows chromosomes in each cell.',
      caption: 'Clip the slide onto the microscope stage',
    },
  },

  complete: {
    hint: '<b>Your slide is on the microscope.</b> Find the meristem, name {n} or more cells, and work out the mitotic index.',
    why: 'Most cells are in interphase, because it is the longest part of the cell cycle. The share caught in each stage tells you how long that stage lasts.',
    open: 'Look through the eyepiece',
    caption: 'Look through the eyepiece and count the dividing cells',
    toast: 'Slide ready',
  },
  jump: 'Microscope',

  objects: {
    onion: { name: 'Onion', short: 'Onion', desc: 'Grown over water for a few days, so it has fresh roots' },
    scalpel: { name: 'Scalpel', desc: 'For cutting the root tip' },
    acid: { name: '1 M hydrochloric acid', desc: 'In a test tube, ready for the root tip' },
    bath: { name: 'Water bath', short: 'Water bath', desc: 'Held at 60 °C' },
    orcein: { name: 'Acetic orcein', short: 'Orcein', desc: 'A red-purple stain that binds DNA' },
    toluidine: { name: 'Toluidine blue', short: 'Toluidine', desc: 'A blue stain that binds DNA' },
    pipette: { name: 'Dropper', desc: 'For a drop of stain' },
    slide: { name: 'Microscope slide', desc: 'Glass, 76 × 26 mm' },
    coverslip: { name: 'Coverslip', short: 'Coverslip', desc: 'A thin square of glass to cover the tissue' },
    paper: { name: 'Filter paper', desc: 'Soaks up extra stain' },
    pencil: { name: 'Pencil', short: 'Pencil', desc: 'The eraser end presses evenly' },
    scope: { name: 'Light microscope', short: 'Microscope', desc: 'Objectives of 4×, 10×, 40× and 100×' },
  },

  props: {
    beaker: { label: 'Water', sub: 'onion roots' },
    acid: { title: '1 M HCl', sub: 'root tip' },
    bath: { label: 'HYDROLYSIS' },
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
    back: 'Bench',
    title: 'Light microscope',
    sub: 'Onion root tip squash · {stain}',
    model: 'Mitosis in 3D',
    drag: 'drag to rotate',
    play: 'Play or pause',
    timeline: 'Mitosis timeline',
    focus: 'Focus',
    light: 'Light',
    scroll: 'scroll',
    total: '{n}× total',
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
      blurry: 'Blurry: scroll or use the focus slider',
      dark: 'Too dark: turn up the light',
      bright: 'Washed out: turn the light down',
    },
  },
});
