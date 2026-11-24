/* Every word Juniper's Seizures shows, in English. Edit freely: the code only names these keys.
 * A translation is text.<lang>.js beside this file, LabText.add('<lang>', { … }) with only
 * the keys it translates (lab/page.js loads it for ?lang=<lang>).
 * Markup allowed: <b>, <i>, <em>, <sup>, <a>. {name} is filled in by the code: every number
 * comes from model.js, so a sentence cannot contradict the bench. */
LabText.add('en', {
  title: 'Juniper’s Seizures',
  icon: 'ph-drop',

  /* the title card. The case is from Osmosis Case Study, used with its author's permission */
  intro: {
    kicker: 'Interactive 3D case',
    title: 'Why is Juniper <em>seizing</em>?',
    body: 'Juniper, a 3-week-old calf, got diarrhea. Her owner, Dana, stopped her milk and gave her all the fresh water she wanted. Yesterday Juniper bumped her head on the gate, and last night Dana wrapped her in a heated blanket. Now she can’t stand, and every few minutes she has a seizure. Find out why, then treat her.',
    keys: [
      { color: '#38bdf8', text: '<b>Water</b> crosses a membrane toward the side with more dissolved particles' },
      { color: '#94a3b8', text: '<b>Sodium</b> can’t follow it quickly, so cells swell or shrink' },
      { color: '#ef4444', text: '<b>Treatment</b> moves water back out, but not too fast' },
    ],
  },

  introArt: {
    alt: 'Juniper, a black-and-white calf, lying on her side and trembling.',
    credit: 'Juniper and her case: <a href="https://naddicott-dtech.github.io/OsmosisCaseStudy/" target="_blank" rel="noopener">Osmosis Case Study</a> by naddicott-dtech',
  },

  info: {
    kicker: 'About the case',
    title: 'Too much plain water',
    body: ['Diarrhea loses water and salt. Plain water replaces only the water, so the blood gets more dilute. Water then moves into cells by osmosis, and in the brain there is no room for them to swell.'],
    steps: [
      { head: 'Blood work.', text: 'Run her blood on the analyzer and find the value that stands out.' },
      { head: 'Red cells.', text: 'Put her red cells into four solutions, make a slide from each, and look at them under the microscope.' },
      { head: 'The brain.', text: 'Zoom to the membrane between her blood and a brain cell, and watch the water move overnight.' },
      { head: 'Explain it to Dana.', text: 'Put the cause and effect in order, from the evidence you collected.' },
      { head: 'Treat her.', text: 'Choose an IV fluid and a volume, predict what it will do, and watch six hours of it.' },
    ],
    tips: [
      { icon: 'ph-magnifying-glass-plus', text: 'The circle on the right zooms to the brain. It always shows Juniper’s blood as it is on the bench.' },
      { icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan' },
    ],
  },

  phases: {
    blood: { title: 'Blood work', desc: 'What is wrong with her blood?' },
    cells: { title: 'Red cells', desc: 'Cells in four solutions, on four slides' },
    brain: { title: 'The brain', desc: 'Water at the blood–brain boundary' },
    explain: { title: 'Explain it to Dana', desc: 'What happened, in order' },
    treat: { title: 'Treat her', desc: 'An IV fluid, and how fast' },
  },

  steps: {
    analyze: {
      title: 'Run her blood', short: 'Analyze',
      action: 'load a drop into the analyzer',
      hint: 'Click <b>Juniper’s blood</b> to load a drop into the analyzer',
      detail: 'Pipette a drop of Juniper’s blood into the analyzer’s sample port.',
      captions: { tip: 'Put on a fresh tip', draw: 'Draw up a drop of Juniper’s blood', load: 'Load it into the analyzer', run: 'The analyzer measures what is dissolved in her plasma' },
    },
    read: {
      title: 'Read the results', short: 'Results',
      action: 'open the results',
      hint: 'Answer in the <b>results</b> panel',
      detail: 'Compare each value with the calf reference range.',
      caption: 'Her sodium is far below normal',
    },
    cells: {
      title: 'Add her red cells', short: 'Red cells',
      action: 'add a drop of blood',
      hint: 'Click the <b>{name}</b> tube to add a drop of blood',
      done: 'All four tubes have blood',
      detail: 'Add a drop of Juniper’s blood to each of the four tubes. Every tube starts with the same red cells.',
      caption: 'A drop of blood into <b>{name}</b>',
    },
    wait: {
      title: 'Wait and watch the tubes', short: 'Wait',
      action: '',
      hint: 'Watch the tubes',
      detail: 'Leave the tubes for {min} minutes. Intact red cells make a tube cloudy. Burst ones let their hemoglobin out, and the tube turns clear red.',
      clock: '{m} min',
      captions: { mix: 'Every tube starts cloudy with intact cells', clear: 'In pure water the cells burst, and the tube turns <b>clear red</b>', settle: 'The other three stay cloudy: their cells are still whole' },
    },
    slides: {
      title: 'Make a slide from each tube', short: 'Slides',
      action: 'put a drop on its slide',
      hint: 'Click the <b>{name}</b> tube to put a drop on its slide',
      done: 'All four slides are ready',
      detail: 'Put a drop from each tube on its own slide and lay a coverslip over it.',
      caption: 'A drop of <b>{name}</b> under a coverslip',
    },
    scope: {
      title: 'Look under the microscope', short: 'Microscope',
      action: 'look at the slides',
      hint: 'Click the <b>microscope</b> to look at your slides',
      hintMore: 'Look at every slide at 40× or more · <b>{n}/4</b>',
      detail: 'Look at each slide. At 4× the cells are specks: switch to 40× or 100×.',
      caption: 'Your four slides under the microscope',
    },
    brain: {
      title: 'Last night, in her brain', short: 'Brain',
      action: '',
      hint: 'Watch the <b>Brain</b> view',
      detail: 'Replay last night: as Juniper drinks, her blood sodium falls from {from} to {to} mEq/L. Watch which way the water goes.',
      clock: 'Na⁺ {na} mEq/L',
      caption: 'As she drinks plain water, her blood sodium falls',
    },
    dana: {
      title: 'Explain it to Dana', short: 'Explain',
      action: '',
      hint: 'Put the cards in order in the <b>panel</b>',
      detail: 'Dana wants to know what went wrong. Build the chain from cause to effect, using what you found.',
      caption: 'From cause to effect, with the evidence for each link',
    },
    rx: {
      title: 'Prescribe', short: 'Prescribe',
      action: 'prescribe it',
      hint: 'Click an <b>IV bag</b>, or choose in the panel',
      detail: 'Pick a fluid and a volume, and predict what it will do to her sodium before you run it.',
      caption: 'Three IV fluids: which one raises her sodium?',
    },
    drip: {
      title: 'Six hours on the drip', short: 'Drip',
      action: '',
      hint: 'Watch <b>Juniper</b>, and her brain in the circle',
      detail: '{vol} of {fluid}, at {rate} mL/h.',
      clock: '{h} h · Na⁺ {na}',
      caption: '{vol} of {fluid} into her vein',
    },
    slow: {
      title: 'Why slowly', short: 'Slowly',
      action: '',
      hint: 'Watch the <b>Brain</b> view',
      detail: 'Her seizures have stopped, but her sodium is only {na}. Watch an astrocyte over the next day, then see what a fast fix would do.',
      clock: '{h} h · Na⁺ {na}',
      caption: 'The next day, in her brain',
      why: 'A shrinking brain cell can strip the myelin off nerve fibres nearby (osmotic demyelination). The damage shows days later and does not heal.',
    },
  },

  complete: {
    hint: '<b>Juniper is up.</b> Raised about {limit} mEq/L a day, her sodium reached {na} by day 3.',
    why: 'Slow enough for her brain cells to take their solutes back in as the sodium rose.',
    prompt: 'Fresh water hurt her because…',
    placeholder: 'In your own words',
    send: 'Send',
    sent: 'Sent to your teacher.',
    saved: 'Saved.',
    edit: 'Edit',
  },

  /* Dana's chain: five true links in order, two red herrings. {slots} come from model.js */
  chain: {
    title: 'Explain it to Dana',
    lead: 'Click the cards into order, cause first. Two don’t belong.',
    cards: {
      loss: { text: 'Diarrhea lost water and salt', ev: 'Na⁺ {na} mEq/L · analyzer' },
      water: { text: 'Plain water replaced only the water', ev: 'plasma {osm} vs ~{healthy} mOsm/kg' },
      swell: { text: 'Cells in dilute fluid swell', ev: 'her red cells +{rbc}% · slide' },
      skull: { text: 'Brain cells can’t swell inside the skull', ev: 'astrocyte +{astro}% · brain zoom' },
      seize: { text: 'That pressure causes seizures', ev: 'a seizure every few minutes · Dana' },
      blanket: { text: 'The blanket overheated her' },
      gate: { text: 'She hurt her head on the gate' },
    },
    /* what a wrong card in a slot points back to: the evidence that belongs there */
    hints: {
      blanket: 'Nothing you measured points to heat. Every finding traces back to her blood. Take the blanket out.',
      gate: 'A knock on the head would not change her blood, and every finding you made starts there. Take the gate out.',
      loss: 'What started it? The analyzer showed what she lost.',
      water: 'Why so dilute? Her plasma held {osm} mOsm/kg against a healthy ~{healthy}. What did Dana give her?',
      swell: 'Before the brain: what did plasma that dilute do to her red cells on the slide?',
      skull: 'Red cells can swell freely. Which cells have no room? The brain zoom.',
      seize: 'Last: what does that pressure do to her?',
    },
    slot: 'Card {n}',
    full: 'Fill all five places first.',
    check: 'Check',
    clear: 'Start over',
    solved: '<b>That’s the chain.</b> Dana sees it now: the water was the problem, and her heart was in the right place.',
  },

  /* the prescription. Every number comes from model.js (Adrogué–Madias) */
  rx: {
    title: 'Prescribe',
    lead: 'Choose a fluid and a volume, predict, then run six hours.',
    fluids: {
      d5w: { name: 'D5W', full: '5% dextrose', desc: 'Sugar water. Her cells burn the sugar, leaving plain water.', band: '#f59e0b', bag: '1000 mL' },
      iso: { name: '0.9% NaCl', full: 'Normal saline', desc: 'Na⁺ {na} mEq/L, about as strong as healthy plasma', band: '#2563eb', bag: '1000 mL' },
      hyper: { name: '3% NaCl', full: 'Hypertonic saline', desc: 'Na⁺ {na} mEq/L, more than three times stronger', band: '#dc2626', bag: '1000 mL' },
    },
    fluid: 'Fluid',
    volume: 'Volume',
    vol: '{ml} mL',
    predictQ: 'Predict: what will it do to her sodium?',
    predict: { worse: 'Lower it', barely: 'Barely move it', safe: 'Raise it safely', over: 'Raise it too fast' },
    give: 'Start the drip',
    need: 'Make a prediction first.',
    tried: 'Your runs',
    row: '{fluid} · {vol}',
    move: 'Na⁺ {from} → {to}',
    predicted: 'You predicted: {p}',
    outcomes: {
      worse: '<b>Worse.</b> Once the sugar is burned, D5W is plain water: her blood got more dilute and the seizures came faster.',
      barely: '<b>Barely moved.</b> 0.9% saline is only a little stronger than her blood, so it nudged her to {to}. Still seizing.',
      safe: '<b>Up {d} mEq/L, and the seizures stopped.</b> A small drop in brain swelling eased the pressure, well under the day’s limit of {limit}.',
      over: '<b>Seizures stopped, but too fast.</b> Up {d} mEq/L in {h} hours, past the {limit} a day her brain can take.',
    },
    retry: 'Try another prescription.',
  },

  /* what /teach shows for the chain and the prescription */
  report: { chain: 'Explained it to Dana', checks: '{n} checks to get the order', rx: 'Prescriptions run' },

  /* the patient panel */
  patient: {
    name: 'Juniper',
    na: 'Na⁺ <b>{na}</b> mEq/L',
    poses: { seizing: 'Seizing', worse: 'Seizing more often', sternal: 'Resting on her chest', standing: 'Standing' },
    alt: { seizing: 'Juniper lying on her side, seizing.', sternal: 'Juniper resting upright on her chest.', standing: 'Juniper standing.' },
  },

  /* the analyzer and the results panel */
  analyzer: { ready: 'READY', running: 'ANALYZING', done: 'JUNIPER  ·  RESULTS' },
  analytes: {
    na: { name: 'Na⁺', unit: 'mEq/L', full: 'Sodium' },
    k: { name: 'K⁺', unit: 'mEq/L', full: 'Potassium' },
    cl: { name: 'Cl⁻', unit: 'mEq/L', full: 'Chloride' },
    glucose: { name: 'Glucose', unit: 'mg/dL', full: 'Glucose' },
    bun: { name: 'BUN', unit: 'mg/dL', full: 'Urea nitrogen' },
    pcv: { name: 'PCV', unit: '%', full: 'Packed cell volume' },
  },
  results: {
    kicker: 'Analyzer',
    title: 'Juniper’s blood',
    cols: ['', 'Juniper', 'Calf range'],
    low: 'low', high: 'high',
    osm: 'Her plasma: <b>{osm}</b> mOsm/kg of dissolved particles. Healthy: about {healthy}.',
    question: 'Which value best explains her seizures?',
    options: [
      { key: 'na', text: 'Sodium', feedback: 'Yes. Sodium and its chloride are most of what is dissolved in plasma. With so little, her blood is far more dilute than the inside of her cells.' },
      { key: 'k', text: 'Potassium', feedback: 'Her potassium is in range. Look for the value that is far outside it.' },
      { key: 'glucose', text: 'Glucose', feedback: 'Low blood sugar can cause seizures, but hers is in range.' },
      { key: 'pcv', text: 'Packed cell volume', feedback: 'Her red cell count is in range, so she is not anemic.' },
    ],
    close: 'Close',
  },

  /* the four tubes */
  tubes: {
    iso: { label: '0.9% saline', card: '0.9%', desc: 'As strong as healthy plasma, {osm} mOsm/kg' },
    plasma: { label: 'Her plasma’s strength', card: 'Hers', desc: 'Saline mixed to {osm} mOsm/kg, as dilute as her plasma today' },
    hyper: { label: '3% saline', card: '3%', desc: 'Much stronger than plasma, {osm} mOsm/kg' },
    water: { label: 'Pure water', card: 'Water', desc: 'Nothing dissolved' },
  },

  /* the microscope view */
  eyepiece: {
    title: 'Light microscope',
    slides: 'Your slides',
    seen: '{n} of 4 slides seen at 40\u00d7 or more',
    hints: {
      start: 'Drag to move the slide \u00b7 scroll to focus',
      mag: 'At 4\u00d7 a red cell is a speck. Switch to <b>40\u00d7</b> or <b>100\u00d7</b>.',
      look: 'Bring the cells into focus.',
    },
    shape: {
      iso: '<b>Normal.</b> Flat discs, pale in the middle. Water goes in and out equally.',
      plasma: '<b>Swollen.</b> They hold about {pct}% more water, so they round up and the pale centre fades. Still whole. Her brain cells are swelling the same way.',
      hyper: '<b>Shrunken and spiky.</b> Water left them; they are about {pct}% smaller.',
      water: '<b>Burst.</b> Only pale empty membranes are left. The hemoglobin is in the water.',
    },
  },

  /* the zoom level */
  levels: {
    brain: {
      name: 'Brain', meta: '≈ 15 nm',
      labels: {
        blood: { text: 'Blood side', sub: 'Na⁺ held here' },
        cell: { text: 'Astrocyte', sub: 'a brain cell' },
        aqp: { text: 'Aquaporin-4', sub: 'water channel' },
        bilayer: { text: 'Membrane' },
      },
      legend: { water: 'water', na: 'Na⁺', cl: 'Cl⁻', k: 'K⁺ and other solutes' },
      info: {
        aqp: { title: 'Aquaporin-4', text: 'A protein pore that lets water through in single file and nothing else. Astrocytes wrap the brain’s blood vessels, and their membrane facing the vessel is packed with it.' },
        bilayer: { title: 'Lipid bilayer', text: 'Water can squeeze straight through the oily middle, but slowly. Charged Na⁺ and Cl⁻ can’t.' },
        water: { title: 'Water', text: 'Each bead is one water molecule, moving at random. More cross toward the side with more dissolved particles, because fewer of the water molecules there are free.' },
      },
      cues: {
        even: 'Blood and cell hold the same amount of dissolved particles. Water crosses <b>both ways equally</b>',
        falling: 'Her blood is more dilute than the cell. <b>More water enters</b> than leaves',
        swollen: 'The astrocyte has swollen about <b>{pct}%</b>. In the skull there is no room for that',
        tight: 'Tight junctions in the vessel wall keep <b>Na⁺</b> in the blood, so only water moves',
        dripStill: 'Her blood is still dilute. The astrocyte stays swollen, <b>+{pct}%</b>',
        dripWorse: 'More free water in her blood: the astrocyte swells further, <b>+{pct}%</b>',
        dripShrink: 'Na⁺ rises, and water leaves the astrocyte. Swelling down to <b>+{pct}%</b>',
        adapt: 'Over a day the astrocyte pushes out <b>K⁺</b> and other solutes, and shrinks back to its own size',
        fast: 'Now put Na⁺ back to {na} in a few hours: water rushes out and the cell <b>shrinks {pct}%</b>',
        limit: 'Solutes take days to come back in, so Na⁺ may rise only about <b>{limit} mEq/L a day</b>',
        done: 'Raised slowly, the astrocyte takes its solutes back in as Na⁺ climbs, and stays its own size',
      },
      tally: '{in} in · {out} out',
    },
  },

  objects: {
    blood: { name: 'Juniper’s blood', short: 'Blood', desc: 'Drawn this morning' },
    analyzer: { name: 'Blood analyzer', short: 'Analyzer', desc: 'Measures what is dissolved in plasma' },
    scope: { name: 'Microscope', short: 'Microscope', desc: 'Compound light microscope' },
    pipette: { name: 'Micropipette', short: 'Pipette', desc: 'Measures small volumes' },
    tips: { name: 'Tip box', short: 'Tips', desc: 'Disposable pipette tips' },
    rack: { name: 'Tube rack', short: 'Rack', desc: 'Four tubes of solution, 5 mL each' },
    waste: { name: 'Waste', short: 'Waste', desc: 'Used tips' },
  },
  props: { blood: 'JUNIPER', bloodSub: 'whole blood', waste: 'TIPS', mount: 'red cells' },
});
