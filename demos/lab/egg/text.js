/* Every word the Egg Osmosis lab shows, in English. Edit freely: the code only names these keys.
 * A translation is text.<lang>.js beside this file, LabText.add('<lang>', { … }) with only
 * the keys it translates (lab/page.js loads it for ?lang=<lang>).
 * Markup allowed: <b>, <i>, <em>, <sub>, <sup>. {name} is filled in by the code. Masses,
 * timings and colours live in the code, not here. */
LabText.add('en', {
  title: 'Egg Osmosis',
  icon: 'ph-egg',

  intro: {
    kicker: 'Interactive 3D lab',
    title: 'Make an egg <em>swell</em> and shrink',
    body: 'Dissolve an egg’s shell in vinegar and a soft, bouncy egg is left, held together only by its membranes. Soak it in different liquids and weigh it: water moves in or out, and the scale tells you which way.',
    keys: [
      { color: '#c9a646', text: '<b>Vinegar</b> dissolves the calcium carbonate shell' },
      { color: '#3b82f6', text: '<b>Water</b> crosses the membranes far faster than sugar does' },
      { color: '#d97706', text: '<b>Osmosis</b>: net water moves toward more dissolved particles' },
    ],
  },

  info: {
    kicker: 'About the experiment',
    title: 'Which way does water move?',
    body: ['Water molecules cross a membrane in both directions all the time. When one side has more dissolved particles, more water crosses toward that side than away from it. That net flow is <b>osmosis</b>.'],
    steps: [
      { head: 'Dissolve the shell.', text: 'Acetic acid in vinegar reacts with the calcium carbonate shell. The bubbles are carbon dioxide.' },
      { head: 'Weigh the naked eggs.', text: 'Only the shell membranes hold each egg together now. They let water through but hold back large molecules like sugar.' },
      { head: 'Change the liquid.', text: 'Distilled water, 0.9% salt water and corn syrup each have a different amount of dissolved particles.' },
      { head: 'Weigh again.', text: 'A day later, the change in mass is the water that moved.' },
    ],
    equation: 'CaCO<sub>3</sub> + 2 CH<sub>3</sub>COOH <i class="ph ph-arrow-right"></i> Ca(CH<sub>3</sub>COO)<sub>2</sub> + H<sub>2</sub>O + CO<sub>2</sub>',
    notes: ['An egg is not one cell like a red blood cell: only the yolk is. Its shell membranes are a mesh of protein fibres, but they let water through so much faster than sugar that they behave like a selectively permeable membrane.'],
    tips: [
      { icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan · use the timeline to go back or skip ahead' },
    ],
  },

  phases: {
    shell: { title: 'Dissolve the shell', desc: 'Weigh, then two days in vinegar' },
    naked: { title: 'Weigh the naked eggs', desc: 'Out of the vinegar' },
    osmosis: { title: 'Three liquids', desc: 'Predict, pour, wait a day' },
    results: { title: 'Weigh again', desc: 'Compare the change in mass' },
  },

  steps: {
    weigh0: {
      title: 'Weigh each egg', short: 'Weigh',
      action: 'weigh it and put it in its beaker',
      hint: 'Click an <b>egg</b> to weigh it',
      hintMore: 'Click the next <b>egg</b> · <b>{n}/3</b>',
      detail: 'Weigh each raw egg on the balance and record its mass. Then set it gently in its beaker.',
      captions: { weigh: 'Weigh the raw egg', place: 'Set it in its beaker' },
    },
    vinegar: {
      title: 'Cover with vinegar', short: 'Vinegar',
      action: 'pour vinegar over the eggs',
      hint: 'Click the <b>vinegar</b> to cover the eggs',
      detail: 'Pour about 250 mL of white vinegar into each beaker, enough to cover the egg.',
      why: 'Vinegar is about 5% acetic acid. Bubbles start at once: the acid is reacting with the shell.',
      caption: { text: 'Pour vinegar over each egg', note: '5% acetic acid' },
    },
    soak: {
      title: 'Leave for two days', short: '48 h',
      hint: 'Watch the shells. Drag the timeline to scrub through the {h} hours',
      detail: 'Leave the eggs in the vinegar for 48 hours. Watch the shell.',
      clock: 'Day {d} · {h} h',
      captions: {
        bubbles: 'CO₂ bubbles off the shell as the acid dissolves it',
        thin: 'The shell thins and flakes away in patches',
        gone: 'The shell is gone. Soft membranes hold the egg together',
        swell: 'The eggs got bigger. Vinegar is mostly water, and some moved in',
      },
    },
    weigh1: {
      title: 'Weigh the naked eggs', short: 'Weigh',
      action: 'weigh its egg and pour off the vinegar',
      hint: 'Click a <b>beaker</b> to weigh its egg',
      hintMore: 'Click the next <b>beaker</b> · <b>{n}/3</b>',
      detail: 'Lift each egg out and weigh it. Pour the vinegar into the waste beaker, then put the egg back.',
      why: 'No shell, yet heavier than when it started: water moved into the egg through its membranes.',
      captions: { lift: 'Lift the egg out and weigh it', drain: 'Pour the vinegar into the waste', back: 'Put the naked egg back' },
    },
    predict: {
      title: 'Predict', short: 'Predict',
      hint: 'Predict each egg on the card: <b>swell</b>, <b>same</b> or <b>shrink</b>',
      detail: 'Each egg will spend a day in a different liquid. Which will gain water, and which will lose it?',
      caption: 'Predict what each egg will do',
    },
    fill: {
      title: 'Pour in the new liquids', short: 'Pour',
      action: 'fill its beaker',
      hint: 'Click a <b>bottle</b> to fill its beaker',
      hintMore: 'Click the next <b>bottle</b> · <b>{n}/3</b>',
      detail: 'Cover egg A with distilled water, egg B with 0.9% salt water and egg C with corn syrup.',
      why: 'The egg in corn syrup floats: syrup is denser than the egg.',
      captions: { pour: 'Cover egg {egg} with {liquid}', float: 'Egg C floats: corn syrup is denser than the egg' },
    },
    osmosis: {
      title: 'Leave for a day', short: '24 h',
      hint: 'Watch the eggs. Drag the timeline to scrub through the {h} hours',
      detail: 'Leave the eggs for 24 hours.',
      clock: '{h} h',
      captions: {
        both: { text: 'Water crosses every membrane in both directions', note: 'Blue dots: water, not to scale' },
        net: 'Egg A takes in more water than it loses. Egg C loses more than it takes in',
        iso: 'In 0.9% salt water, about as much water leaves egg B as enters',
        slow: 'The flow slows as the inside and outside get closer',
      },
    },
    weigh2: {
      title: 'Weigh the eggs again', short: 'Weigh',
      action: 'weigh its egg',
      hint: 'Click a <b>beaker</b> to weigh its egg',
      hintMore: 'Click the next <b>beaker</b> · <b>{n}/3</b>',
      detail: 'Weigh each egg and set it back in front of its beaker.',
      captions: { lift: 'Weigh egg {egg}', set: 'Set it in front of its beaker' },
    },
  },

  complete: {
    hint: '<b>Compare the three eggs</b> on the bench and in the table.',
    why: 'Water moved toward the side with more dissolved particles. Distilled water has none, so water flowed in. Corn syrup is about three quarters sugar, so water flowed out. 0.9% salt water is close to the egg’s own concentration, so little net water moved.',
    caption: 'Water moved toward the side with more dissolved particles',
    toast: 'Lab complete',
  },

  /* the three liquids, egg A, B, C in order */
  liquids: [
    { name: 'distilled water', label: 'Distilled water', tonic: 'Hypotonic' },
    { name: '0.9% salt water', label: '0.9% salt water', tonic: 'Near isotonic' },
    { name: 'corn syrup', label: 'Corn syrup', tonic: 'Hypertonic' },
  ],

  panel: {
    title: 'Egg mass (g)',
    egg: 'Egg', raw: 'Raw', naked: 'No shell', final: '+24 h', change: 'Change',
    note: 'Change is from no shell to +24 h. Same means within {pct}%.',
    ask: 'Predict',
    pred: { swell: 'Swell', same: 'Same', shrink: 'Shrink' },
    you: 'You said {p}',
  },

  objects: {
    egg: { name: 'Raw egg {egg}', short: 'Egg {egg}', desc: 'A large hen’s egg, in its shell.' },
    beaker: { name: 'Beaker {egg}', short: 'Beaker {egg}', desc: 'Egg {egg}. It will end up in {liquid}.' },
    vinegar: { name: 'White vinegar', short: 'Vinegar', desc: 'About 5% acetic acid in water.' },
    bottle0: { name: 'Distilled water', short: 'Water', desc: 'Pure water: no dissolved particles.' },
    bottle1: { name: '0.9% salt water', short: 'Salt water', desc: '9 g of salt per litre, about as concentrated as body fluids.' },
    bottle2: { name: 'Corn syrup', short: 'Corn syrup', desc: 'About three quarters sugar, one quarter water. Denser than an egg.' },
    balance: { name: 'Balance', desc: 'Reads to 0.1 g.' },
    waste: { name: 'Waste beaker', desc: 'For the used vinegar.' },
  },

  props: {
    beaker: 'Egg {egg}',
    waste: 'Waste',
    vinegar: { title: 'VINEGAR', line: '5% ACETIC ACID', note: 'white, distilled' },
    bottles: [
      { title: 'DISTILLED', line: 'WATER', note: 'deionized' },
      { title: 'SALINE', line: '0.9% NaCl', note: '9 g per litre' },
      { title: 'CORN SYRUP', line: 'LIGHT', note: '≈ 75% sugar' },
    ],
  },
});
