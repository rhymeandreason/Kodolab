/* Every word the Yeast Catalase lab shows, in English. Edit freely: the code only names these keys.
 * A translation is text.<lang>.js beside this file, LabText.add('<lang>', { … }) with only
 * the keys it translates (lab/page.js loads it for ?lang=<lang>).
 * Markup allowed: <b>, <i>, <em>, <sub>, <sup>. {name} is filled in by the code. Amounts,
 * times and colours live in the code, not here. */
LabText.add('en', {
  title: 'Yeast Catalase',
  icon: 'ph-bubble',

  intro: {
    kicker: 'Interactive 3D lab',
    title: 'Make a paper disk <em>float</em> on enzyme power',
    body: 'Soak a paper disk in yeast and drop it in hydrogen peroxide. It sinks, then rises as the yeast’s catalase splits peroxide and oxygen bubbles lift it. Time the rise at five concentrations and see how fast an enzyme can go.',
    keys: [
      { color: '#c08a3e', text: '<b>Yeast</b> cells are full of the enzyme catalase' },
      { color: '#0ea5e9', text: '<b>Catalase</b> splits H<sub>2</sub>O<sub>2</sub> into water and O<sub>2</sub>' },
      { color: '#6366f1', text: '<b>Rate</b> rises with substrate, then levels off' },
    ],
  },

  info: {
    kicker: 'About the experiment',
    title: 'How fast can an enzyme go?',
    body: ['Hydrogen peroxide is a toxic by-product of metabolism. Almost every cell that uses oxygen makes catalase to get rid of it. The oxygen it releases is what lifts the disk, so a faster rise means a faster reaction.'],
    steps: [
      { head: 'Make the enzyme.', text: 'Dry yeast stirred into warm water. Each cell carries thousands of catalase molecules.' },
      { head: 'Boil some.', text: 'Heat unfolds a protein. A boiled enzyme keeps its atoms but loses its shape.' },
      { head: 'Time the disks.', text: 'A yeast-soaked disk sinks in peroxide, then floats once enough O<sub>2</sub> is caught in its fibres.' },
      { head: 'Graph the rate.', text: 'Rate is 1 ÷ the time to float. Plot it against the peroxide concentration.' },
    ],
    equation: '2 H<sub>2</sub>O<sub>2</sub> <i class="ph ph-arrow-right"></i> 2 H<sub>2</sub>O + O<sub>2</sub>',
    notes: ['Catalase is one of the fastest enzymes known. In this lab the disk, not the enzyme, sets the pace: what you time is how long the paper takes to collect enough gas to float.'],
    tips: [
      { icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan · keys 1 2 3 switch levels' },
    ],
  },

  phases: {
    enzyme: { title: 'Make the enzyme', desc: 'Yeast in warm water; boil a little' },
    trials: { title: 'Time the disks', desc: 'Five peroxide concentrations' },
    control: { title: 'Boiled yeast', desc: 'The control' },
    results: { title: 'Read the graph', desc: 'Rate against concentration' },
  },

  steps: {
    yeast: {
      title: 'Mix the yeast', short: 'Yeast',
      action: 'stir yeast into the warm water',
      hint: 'Click the <b>yeast</b> jar',
      detail: 'Stir {g} g of dry yeast into {mL} mL of warm water.',
      why: 'The cloudy suspension is millions of living yeast cells, each packed with catalase.',
      captions: { scoop: 'Scoop dry yeast into warm water', stir: 'Stir until it is evenly cloudy' },
    },
    boil: {
      title: 'Boil some yeast', short: 'Boil',
      action: 'boil a little of the yeast',
      hint: 'Click the <b>hot plate</b>',
      detail: 'Pour {mL} mL of the suspension into the small beaker and boil it for {min} minutes, then let it cool.',
      why: 'Same cells, same catalase molecules. Only their shape has changed.',
      clock: '{min} min',
      captions: { pour: 'Pour some yeast into the small beaker', boil: 'Boil it', cool: 'Let it cool' },
    },
    disks: {
      title: 'Time the disks', short: 'Disks',
      action: 'drop three yeast disks in and time them',
      hint: 'Click a <b>cup</b> of peroxide',
      hintMore: 'Click the next <b>cup</b> · <b>{n}/{total}</b>',
      detail: 'With forceps, dip a paper disk in the yeast, blot it, and drop it in. Time how long it takes to float. Three disks per cup.',
      why: 'The disk sinks, then rises as O<sub>2</sub> collects in its fibres. More peroxide, faster rise.',
      clock: '{s} s',
      captions: { dip: 'Dip a disk in yeast and blot it', drop: 'Drop it in {conc} peroxide', wait: 'Catalase splits the peroxide. O₂ bubbles collect on the disk', float: 'Enough O₂ to float' , none: 'No peroxide, no O₂: the disks stay down' },
    },
    boiled: {
      title: 'Try the boiled yeast', short: 'Boiled',
      action: 'drop three boiled-yeast disks in',
      hint: 'Click the <b>boiled</b> cup',
      detail: 'Repeat with disks soaked in the boiled yeast, in {conc} peroxide. Stop the timer at {max} s.',
      why: 'Peroxide is there, yeast is there, and nothing happens. Heat unfolded the catalase.',
      clock: '{s} s',
      captions: { dip: 'Dip a disk in the boiled yeast', drop: 'Drop it in {conc} peroxide', wait: 'No bubbles: the boiled enzyme does nothing' },
    },
    read: {
      title: 'Read the graph', short: 'Graph',
      hint: 'Answer the question below',
      detail: 'Rate is 1 ÷ the time to float. Compare the rate at {lo} and at {hi}.',
      caption: 'Rate rises with peroxide, then levels off',
    },
  },

  complete: {
    hint: '<b>Rate levels off</b> as peroxide goes up.',
    why: 'At low peroxide, catalase molecules sit idle between collisions, so more substrate means more reactions. At high peroxide almost every active site is busy all the time, and adding more barely helps. Boiled yeast does nothing at any concentration: its catalase lost its shape.',
    caption: 'More substrate helps until the enzymes are busy',
    toast: 'Lab complete',
  },

  panel: {
    title: 'Time to float (s)',
    conc: 'H₂O₂', t: 'Trial {n}', mean: 'Mean', rate: 'Rate',
    rateUnit: 's⁻¹', never: '> {max}', boiled: 'boiled',
    note: 'Rate = 1 ÷ mean time. A disk still down at {max} s counts as rate 0.',
    graph: { x: 'H₂O₂ (%)', y: 'Rate (s⁻¹)' },
    ask: 'From {lo} to {hi}, the rate…',
    answers: {
      double: { text: 'doubled', right: false },
      more: { text: 'rose, but by less than double', right: true },
      same: { text: 'did not change', right: false },
    },
    right: 'Right. Doubling the peroxide raised the rate by {pct}%. The enzymes are nearly saturated.',
    wrong: 'Try again. The rate went from {a} to {b} s⁻¹.',
  },

  objects: {
    jar: { name: 'Dry yeast', short: 'Yeast', desc: 'Active dry baker’s yeast, <i>Saccharomyces cerevisiae</i>.' },
    water: { name: 'Warm water', short: 'Water', desc: 'About 37 °C, so the yeast wakes up.' },
    hotplate: { name: 'Hot plate', short: 'Hot plate', desc: 'To boil a sample of the yeast.' },
    small: { name: 'Small beaker', short: 'Boiled', desc: 'For the boiled yeast.' },
    dish: { name: 'Paper disks', short: 'Disks', desc: 'Filter paper, cut with a hole punch.' },
    forceps: { name: 'Forceps', desc: 'To handle the disks.' },
    towel: { name: 'Paper towel', desc: 'Blot each disk so it carries the same amount of yeast.' },
    cup: { name: '{conc} H₂O₂', short: '{conc}', desc: '{mL} mL of {conc} hydrogen peroxide.' },
    cupBoiled: { name: '{conc} H₂O₂, boiled yeast', short: 'Boiled', desc: '{mL} mL of {conc} hydrogen peroxide, for the boiled-yeast disks.' },
    bottle: { name: 'Hydrogen peroxide', short: 'H₂O₂', desc: '3% from the pharmacy, diluted with water for the weaker cups. Kept in a brown bottle because light breaks it down.' },
    timer: { name: 'Timer', desc: 'Reads seconds.' },
  },

  props: {
    water: 'Warm water',
    yeast: 'Yeast',
    boiled: 'Boiled yeast',
    cup: '{conc}',
    boiledCup: 'Boiled',
    bottle: { title: 'HYDROGEN', line: 'PEROXIDE 3%', note: 'H₂O₂ · topical' },
    /* printed on the mat */
    zones: { prep: 'YEAST PREP', stock: 'STOCK', cups: 'HYDROGEN PEROXIDE', control: 'CONTROL', tray: 'DISK TRAY' },
  },

  /* the zoom levels. disk.js and molecule.js read their own block; nothing else does */
  levels: {
    disk: {
      name: 'Disk', meta: '≈ 100 µm',
      labels: {
        fibre: { text: 'Cellulose fibre', sub: '{w} µm wide' },
        air: { text: 'Air', sub: 'between the fibres' },
        yeast: { text: 'Yeast cell', sub: '{d} µm long' },
        bubble: { text: 'O₂ bubble', sub: '{d} µm across' },
        solution: { text: 'Peroxide solution', sub: '{conc}% H₂O₂', none: '{conc}%: just water' },
      },
      info: {
        fibre: { title: 'Cellulose fibre', text: 'A flattened plant fibre, bundles of cellulose chains. Filter paper is a felt of them, with gaps between.' },
        yeast: { title: 'Yeast cell', text: 'A living <i>Saccharomyces cerevisiae</i> cell. Peroxide diffuses in, and the catalase inside splits it.' },
        yeastBoiled: { title: 'Boiled yeast cell', text: 'The same cell with the same catalase inside. Boiling unfolded it, so it splits nothing.' },
        bubble: { title: 'O₂ bubble', text: 'Oxygen made faster than it can dissolve comes out as gas. Gas caught in the fibres makes the disk less dense than the liquid.' },
      },
      /* Watch mode's captions at this level */
      cues: {
        dry: 'Filter paper is a felt of <b>cellulose fibres</b>, with air between them',
        boil: 'The boiling happens in the beaker. This paper is still dry',
        soak: '<b>Yeast cells</b> lodge between the fibres',
        soakBoiled: 'Boiled <b>yeast cells</b> lodge between the fibres just the same',
        water: 'No peroxide here, so nothing to split and no bubbles',
        boiled: 'Peroxide all around, and no bubbles: the boiled catalase does nothing',
        split: 'Peroxide soaks in. Catalase inside each <b>yeast cell</b> splits it',
        bubbles: 'O₂ comes out of solution as <b>bubbles</b> on the cells and fibres',
        merge: 'Bubbles grow and merge. The trapped gas makes the disk buoyant',
        rise: 'Enough O₂ is caught in the fibres: the disk floats up',
        read: 'The faster catalase makes O₂, the sooner the fibres fill and the disk floats',
      },
    },
    mol: {
      name: 'Molecule', meta: '≈ 10 nm',
      labels: {
        subunit: { text: 'Catalase subunit', sub: 'one of {n}' },
        channel: { text: 'Channel', sub: 'the way in' },
        iron: { text: 'Heme iron', sub: 'where H₂O₂ splits', oxo: 'holding one O' },
        h2o2: { text: 'H₂O₂', sub: 'hydrogen peroxide' },
        o2: { text: 'O₂', sub: 'oxygen' },
        water: { text: 'H₂O', sub: 'water' },
        unfolded: { text: 'Unfolded chain', sub: 'no pocket, no channel' },
      },
      info: {
        subunit: { title: 'Catalase subunit', text: 'One of {n} identical chains in each catalase. It folds around a heme, and a long, narrow channel leads in to the iron.' },
        heme: { title: 'Heme', text: 'A flat ring holding one iron atom. H₂O₂ binds to the iron.' },
        reaction: { title: 'Two steps at the iron', text: 'The first H₂O₂ leaves one O atom on the iron and goes as water. The second gives that O its two H, making water, and leaves as O₂.' },
        h2o2: { title: 'Hydrogen peroxide', text: 'H₂O₂, a toxic by-product of metabolism. It reaches the iron down the channel.' },
        o2: { title: 'Oxygen', text: 'Both of its atoms come from one H₂O₂. Enough O₂ caught in the paper floats the disk.' },
        water: { title: 'Water', text: 'The enzyme works in water, and each cycle makes two more.' },
        unfolded: { title: 'Unfolded catalase', text: 'Same chain, same atoms, no shape. Without its pocket the iron cannot hold H₂O₂. The tangle drawn is one of countless shapes it could take.' },
      },
      /* Watch mode's captions at this level */
      cues: {
        yeast: 'One <b>catalase</b> subunit from yeast, with a <b>heme iron</b> buried inside',
        heat: 'Heat shakes the folded chain harder and harder',
        unfold: 'The chain <b>unfolds</b> and the heme falls out of its pocket',
        waiting: 'No peroxide yet: the enzyme waits in water',
        noPeroxide: 'Plain water: nothing here for catalase to split',
        react: 'At the iron, two <b>H₂O₂</b> become two <b>H₂O</b> and one <b>O₂</b>',
        slow: 'Slowed about {slow} million times. One catalase can split up to {kcat} million H₂O₂ a second.',
        boiled: '<b>H₂O₂</b> drifts past, but with no pocket nothing happens',
        unfolded: 'Boiled catalase: the same chain, unfolded',
        read: 'More H₂O₂ keeps the iron busier, until it is never idle',
        complete: 'However fast, each iron splits one H₂O₂ at a time',
      },
    },
  },
});
