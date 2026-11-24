/* Every word Whose DNA? shows, in English. Edit freely: the code only names these keys.
 * A translation is text.<lang>.js beside this file, LabText.add('<lang>', { … }) with only
 * the keys it translates (lab/page.js loads it for ?lang=<lang>).
 * Markup allowed: <b>, <i>, <em>, <sup>. {name} is filled in by the code: sizes, volumes,
 * voltages and times come from the sim, so a sentence cannot contradict the bench. */
LabText.add('en', {
  title: 'Gel Electrophoresis',
  icon: 'ph-dna',

  intro: {
    kicker: 'Interactive 3D lab',
    title: 'Whose <em>DNA</em> is it?',
    body: 'Blood was found at a crime scene, and there are three suspects. Each DNA sample has been cut with the same enzyme. Run the pieces through a gel and see whose pattern matches.',
    keys: [
      { color: '#2563eb', text: '<b>DNA is negative</b>, so an electric field pulls it toward +' },
      { color: '#0d9488', text: '<b>The gel is a mesh</b>: short pieces get through faster than long ones' },
      { color: '#d97706', text: '<b>A ladder</b> of known sizes is the ruler you read the bands against' },
    ],
  },

  info: {
    kicker: 'About the experiment',
    title: 'How does a gel sort DNA?',
    body: ['Cut DNA with a restriction enzyme and it falls into pieces. Two people’s DNA has the enzyme’s cut sites in slightly different places, so it falls into different-sized pieces. A gel lines those pieces up by size.'],
    steps: [
      { head: 'Load.', text: 'Each sample goes into its own well at the black (−) end of the gel. Loading dye makes it dense enough to sink in.' },
      { head: 'Run.', text: 'Every nucleotide carries a negative phosphate, so the field pulls the DNA toward the red (+) electrode.' },
      { head: 'Sort.', text: 'Charge and drag both grow with length, so in plain water every piece would move at the same speed. The agarose mesh is what holds the long ones back.' },
      { head: 'See.', text: 'A stain in the gel binds DNA and glows under blue light. Each band is millions of pieces of one length.' },
      { head: 'Read.', text: 'Plot the ladder’s known sizes against how far each band ran. The other bands’ sizes can be read off that line.' },
    ],
    notes: ['Forensic labs today compare short repeated sequences (STRs), sized in a thin capillary instead of a slab of gel. Cutting DNA and comparing band patterns, called RFLP, was the original DNA fingerprint in the 1980s.'],
    tips: [
      { icon: 'ph-magnifying-glass-plus', text: 'Click the circle on the right to zoom into the gel itself. Both views show the same moment.' },
      { icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan · keys 1 2 switch levels' },
    ],
  },

  phases: {
    setup: { title: 'Set up the gel', desc: 'Buffer in, comb out' },
    load: { title: 'Load the samples', desc: 'A ladder, the crime scene, the suspects' },
    run: { title: 'Run the gel', desc: 'Black to black, red to red' },
    see: { title: 'See the DNA', desc: 'Blue light, amber filter' },
    read: { title: 'Read the gel', desc: 'Measure, plot, compare' },
  },

  steps: {
    buffer: {
      title: 'Cover the gel with buffer', short: 'Buffer',
      action: 'pour in the buffer',
      hint: 'Click the <b>TAE buffer</b>',
      detail: 'Pour TAE buffer into the box until it covers the gel by about {mm} mm.',
      why: 'The buffer’s ions carry the current, and hold the pH steady while the electrodes split water.',
      caption: 'Pour in buffer until it covers the gel',
    },
    comb: {
      title: 'Remove the comb', short: 'Comb',
      action: 'pull out the comb',
      hint: 'Click the <b>comb</b>',
      detail: 'Lift it straight up, slowly, so the wells keep their shape.',
      why: 'Each tooth left a pocket in the gel: a <b>well</b>, one for each sample.',
      caption: 'Lift the comb straight out. Each tooth leaves a well',
    },
    ladder: {
      title: 'Load the DNA ladder', short: 'Ladder',
      action: 'load the ladder',
      hint: 'Click the <b>ladder</b> tube',
      detail: 'With a fresh tip, draw up {ul} µL and let it sink into the first well. Press to the first stop to draw; the second stop pushes out the last drop.',
      why: 'A ladder is a mix of DNA pieces of known sizes. It is the ruler you will read the other lanes against.',
      caption: { text: 'Load {ul} µL of DNA ladder into the first well', note: 'Blue loading dye makes it sink in' },
      captions: { tip: 'A fresh tip', draw: 'Draw up {ul} µL', load: 'Into the well, just below the surface', eject: 'Eject the tip' },
    },
    samples: {
      title: 'Load the samples', short: 'Samples',
      action: 'load it',
      hint: 'Click the <b>{name}</b> tube',
      detail: 'A fresh tip for every tube, {ul} µL into each well in order. Hold the tip just inside the well, above its floor.',
      why: 'Every sample was cut with the same enzyme. Different DNA has its cut sites in different places, so it falls into different-sized pieces.',
      caption: 'Load the {name} sample into well {lane}',
      done: 'All loaded',
    },
    connect: {
      title: 'Connect the power', short: 'Connect',
      action: 'put the lid on',
      hint: 'Click the <b>lid</b>',
      detail: 'Lid on, black lead to the black jack and red to red. The wells must be at the black end.',
      why: 'DNA’s phosphate backbone is negative, so it moves toward the positive, red electrode. <b>Run to red.</b>',
      caption: { text: 'Lid on: black to black, red to red', note: 'Run to red' },
    },
    power: {
      title: 'Switch on the power', short: 'Power',
      action: 'switch it on',
      hint: 'Click the <b>power supply</b>',
      detail: 'Set {v} V and switch on. Look for bubbles at both electrodes.',
      why: 'Bubbles mean current is flowing. Water splits into hydrogen at the black electrode and oxygen at the red, twice as much hydrogen as oxygen.',
      caption: { text: 'Switch on at {v} V', note: 'Bubbles: hydrogen at −, oxygen at +' },
    },
    run: {
      title: 'Run the gel', short: 'Run',
      hint: 'Watch the dyes move',
      detail: 'Run for {min} minutes, until the dark blue dye is about three quarters of the way down.',
      why: 'The gel is a mesh of sugar fibers. Short pieces slip through it fast; long ones snake through slowly. So the DNA spreads out by size.',
      captions: {
        leave: 'The loading dye leaves the wells, heading for red',
        split: 'Two dyes split apart. The DNA moves with them, still invisible',
        stop: 'Stop when the leading dye is three quarters of the way down',
      },
    },
    image: {
      title: 'Look under blue light', short: 'Image',
      action: 'take the gel out',
      hint: 'Click the <b>gel box</b> to take the gel out',
      detail: 'Switch off the power, take the gel out and lay it on the blue-light box. Lower the amber filter.',
      why: 'A stain in the gel binds DNA and glows under blue light. Each band is millions of pieces, all the same length.',
      caption: { text: 'Lay the gel on the blue light', note: 'The amber filter blocks the blue, so only the glow shows' },
    },
    measure: {
      title: 'Read the gel', short: 'Read',
      action: 'open the gel image',
      hint: 'Click the <b>blue-light box</b> to open the gel image',
      detail: 'Measure the ladder, then the crime scene’s bands. Then decide which suspect matches.',
      why: 'Distance run is roughly a straight line against the log of size, so the ladder turns millimetres into base pairs.',
      caption: 'Measure the bands and compare the lanes',
    },
  },

  clock: { line: '{v} V · {time}', time: '{m}:{ss}' },

  /* the samples, in lane order: the tube label, the name in sentences, and what is in it */
  samples: {
    ladder: { label: 'M', name: 'DNA ladder', short: 'Ladder', desc: 'DNA pieces of known sizes, the ruler for every other lane.' },
    cs: { label: 'CS', name: 'crime scene', short: 'Crime scene', desc: 'DNA from the blood at the scene, cut with EcoRI.' },
    s1: { label: 'S1', name: 'suspect 1', short: 'Suspect 1', desc: 'Suspect 1’s DNA, cut with EcoRI.' },
    s2: { label: 'S2', name: 'suspect 2', short: 'Suspect 2', desc: 'Suspect 2’s DNA, cut with EcoRI.' },
    s3: { label: 'S3', name: 'suspect 3', short: 'Suspect 3', desc: 'Suspect 3’s DNA, cut with EcoRI.' },
  },

  objects: {
    tae: { name: 'TAE running buffer', short: 'TAE buffer', desc: 'Tris, acetate and EDTA: carries the current and holds the pH.' },
    comb: { name: 'Gel comb', short: 'Comb', desc: 'Its teeth were set in the gel while it hardened.' },
    lid: { name: 'Gel box lid', short: 'Lid', desc: 'Carries the leads to the electrodes, and keeps fingers out of the buffer.' },
    power: { name: 'Power supply', short: 'Power', desc: 'Sets the voltage across the gel.' },
    light: { name: 'Blue-light transilluminator', short: 'Blue light', desc: 'Shines blue light up through the gel; the amber filter blocks it from your eyes.' },
    gel: { name: 'Agarose gel', short: 'Gel', desc: '1% agarose: a mesh of seaweed sugar, with a DNA stain mixed in.' },
    box: { name: 'Gel box', desc: 'Electrodes at each end: black (−) behind the wells, red (+) in front.' },
    pipette: { name: 'Micropipette (2–20 µL)', desc: 'Measures microlitres. A fresh tip for every sample, so nothing carries over.' },
    tips: { name: 'Pipette tips', desc: 'Disposable, one per sample.' },
    rack: { name: 'Sample rack', desc: 'Each tube is DNA already cut with a restriction enzyme and mixed with blue loading dye.' },
    waste: { name: 'Tip waste', desc: 'Used tips go here.' },
  },
  props: {
    tae: { title: 'TAE', line: 'RUNNING BUFFER', note: '1× · pH 8.3' },
    waste: 'TIPS',
    zones: { buffer: 'BUFFER', power: 'POWER SUPPLY', box: 'GEL BOX', lid: 'LID', samples: 'SAMPLES', pipette: 'PIPETTE', tips: 'TIPS', waste: 'TIP WASTE', light: 'BLUE LIGHT' },
  },

  /* the gel image panel */
  measure: {
    title: 'Gel image',
    close: 'Close',
    open: 'Open the gel image',
    ruler: 'mm',
    lanes: 'Lanes',
    stepLadder: '<b>1.</b> Click each <b>ladder</b> band to measure how far it ran.',
    stepCs: '<b>2.</b> Now click each <b>crime scene</b> band. The line turns its distance into a size.',
    stepPick: '<b>3.</b> Which suspect’s bands match the crime scene?',
    ladderHead: 'Ladder',
    csHead: 'Crime scene',
    sizeCol: 'Size',
    distCol: 'Ran',
    estCol: '≈ Size',
    bp: '{n} bp',
    mm: '{n} mm',
    notYet: 'click its band',
    plotX: 'Distance run (mm)',
    plotY: 'Size (bp, log scale)',
    curveNote: 'The line fits best in the middle; the biggest pieces run a little farther than it predicts.',
    wrong: 'Not {name}: it has a band at {mm} mm, where the crime scene has none.',
    right: '<b>{name} matches.</b> Every band lines up with the crime scene’s, and no band is extra.',
    pick: '{short}',
  },

  complete: {
    head: '{name} matches the crime scene.',
    why: 'Same pieces, same sizes: the enzyme cut both DNA samples in the same places. A different person’s cut sites fall elsewhere, so their bands do too.',
    caption: { text: '{name}’s bands match the crime scene', note: 'Same cut sites, same piece sizes' },
    toast: 'Gel complete',
    reopen: 'Gel image',
  },

  levels: {
    gel: {
      name: 'Gel', meta: '≈ 2 µm',
      labels: {
        fibers: { text: 'Agarose fibers' },
        short: { text: 'Short DNA', sub: '{bp} bp' },
        long: { text: 'Long DNA', sub: '{bp} bp' },
        plus: { text: 'Toward +' },
      },
      info: {
        fibers: { title: 'Agarose fibers', text: 'Agarose is a sugar from seaweed. Its chains bundle into fibers that cross into a mesh, with pores a few hundred nanometres across.' },
        dna: { title: 'DNA', text: 'A cut piece of the double helix. Every nucleotide carries one negative phosphate, so a longer piece has more charge, and more drag.' },
      },
      stages: [
        '<b>An empty gel.</b> Agarose fibers bundle into a mesh full of pores.',
        '<b>Loaded.</b> DNA pieces sit at the well end, drifting at random. Nothing pulls them yet.',
        '<b>Field on.</b> The negative DNA is pulled toward +. Short pieces slip through the pores; long ones snake through end-first.',
        '<b>Stained.</b> Dye molecules bound along the DNA glow under blue light.',
      ],
      cues: {
        mesh: 'Agarose is a sugar from seaweed. Its fibers bundle into a <b>mesh</b> full of pores',
        loaded: 'Cut DNA sits at the well end, drifting at random',
        pull: 'Every phosphate is negative, so the field pulls each piece <b>toward +</b>',
        sieve: '<b>Short pieces</b> slip through the pores quickly',
        snake: '<b>Long pieces</b> have to snake through end-first, so they fall behind',
        glow: 'Stain bound along the DNA <b>glows</b> under blue light',
      },
    },
  },
});
