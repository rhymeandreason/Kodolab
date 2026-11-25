/* Every word Glowing E. coli shows, in English. Edit freely: the code only names these keys.
 * A translation is text.<lang>.js beside this file, LabText.add('<lang>', { … }) with only
 * the keys it translates (lab/page.js loads it for ?lang=<lang>).
 * Markup allowed: <b>, <i>, <em>, <sup>. {name} is filled in by the code. Timings, colours,
 * amounts the animation acts out and which label a caption points at live in the code. */
LabText.add('en', {
  title: 'Glowing E. coli',
  icon: 'ph-dna',

  /* the title card (its plasmid drawing's labels are introArt) */
  intro: {
    kicker: 'Interactive 3D lab',
    title: 'Make bacteria <em>glow</em>',
    body: 'In this classic biology lab you add a small loop of DNA, called a <b>plasmid</b>, to <i>E. coli</i>. The plasmid carries a gene from a jellyfish. If the bacteria take it up, they glow green under UV light.',
    keys: [
      { color: '#22c55e', text: '<b>GFP</b> makes green fluorescent protein' },
      { color: '#f59e0b', text: '<b>bla</b> lets cells survive the antibiotic ampicillin' },
      { color: '#8b5cf6', text: '<b>araC</b> turns GFP on only when the sugar arabinose is present' },
    ],
  },
  introArt: {
    name: 'GFP plasmid',
    size: '~5,400 base pairs',
    gfp: 'GFP',
    bla: 'bla (amp<sup>R</sup>)',
    ara: 'araC',
    ori: 'ori',
  },

  /* the (i) button's modal */
  info: {
    kicker: 'About the experiment',
    title: 'How do you make bacteria glow?',
    body: ['Give them a gene from a jellyfish. The gene sits on a <b>plasmid</b>, a small ring of DNA that bacteria can take up and copy.'],
    steps: [
      { head: 'Make the cells competent.', text: 'Ice-cold calcium chloride cancels the negative charges on the DNA and the cell membrane, so the plasmid can touch the cell.' },
      { head: 'Heat shock.', text: 'A sudden jump from 0 °C to 42 °C opens temporary pores in the membrane, and some plasmids slip in.' },
      { head: 'Select.', text: 'Only cells with the plasmid carry <b>bla</b>, so only they grow on ampicillin plates.' },
      { head: 'Switch it on.', text: '<b>araC</b> turns the GFP gene on only when the sugar arabinose is present, so only those colonies glow under UV light.' },
    ],
    tips: [
      { icon: 'ph-magnifying-glass-plus', text: 'Click the circle on the right to zoom into one cell. Both views show the same moment.' },
      { icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan · keys 1 2 switch levels' },
    ],
  },

  /* the procedure list's groups */
  phases: {
    prepare: { title: 'Prepare the tubes', desc: 'CaCl₂, cells and the plasmid' },
    shock: { title: 'Heat shock', desc: 'Ice, 42 °C, ice' },
    recover: { title: 'Recover', desc: 'Fresh broth, 10 minutes' },
    grow: { title: 'Plate and grow', desc: 'Spread and incubate overnight' },
    uv: { title: 'Look under UV', desc: 'Which colonies glow?' },
  },

  /* each step: the card (title, hint, detail, why), the click label (action: "Click to …"), and
     Watch mode's captions. caption is the step's line; captions are the lines its animation
     shows in turn */
  steps: {
    cacl2: {
      title: 'Add transformation solution', short: 'CaCl₂',
      action: 'add CaCl₂ to both tubes',
      hint: 'Click the <b>CaCl₂</b> bottle',
      detail: 'Pipette 250 µL of ice-cold calcium chloride (CaCl₂) into both tubes.',
      why: 'Calcium ions cancel out negative charges on the DNA and the cell membrane, so the two can touch.',
      caption: { text: 'Pipette ice-cold calcium chloride into both tubes', note: '250 µL each' },
    },
    cells: {
      title: 'Add E. coli', short: 'Cells',
      action: 'add cells to both tubes',
      hint: 'Click the <b>starter plate</b>',
      detail: 'Use a sterile loop to pick up a colony from the starter plate and swirl it into a tube until the liquid looks cloudy. Use a fresh loop for each tube, and throw each used loop in the waste.',
      why: 'Each colony is millions of identical cells, grown from one.',
      caption: 'Add E. coli to both tubes',
      captions: {
        first: 'Pick up a colony with a sterile loop and swirl it into a tube until the liquid looks cloudy',
        next: 'Repeat for the other tube, with a fresh loop',
      },
    },
    plasmid: {
      title: 'Add the GFP plasmid', short: 'Plasmid',
      action: 'add the plasmid',
      hint: 'Click the <b>GFP plasmid</b> vial',
      detail: 'Dip a fresh sterile loop into the plasmid solution and swirl it into the <b>+ plasmid</b> tube only.',
      why: 'The − tube is your control: the same cells, treated the same way, without the plasmid.',
      caption: { text: 'With a fresh loop, swirl the GFP plasmid into the + tube only', note: 'The − tube is the control' },
    },
    ice: {
      title: 'Incubate on ice', short: 'Ice',
      action: 'put the tubes on ice',
      hint: 'Click the <b>ice bath</b>',
      detail: 'Leave both tubes on ice for 10 minutes.',
      why: 'The cold stiffens the membrane and lets plasmids settle onto the cells.',
      caption: 'Leave both tubes on ice for 10 minutes',
    },
    heat: {
      title: 'Heat shock', short: 'Heat shock',
      action: 'heat-shock the tubes',
      hint: 'Click the <b>water bath</b>',
      detail: 'Move the tubes into the 42 °C water bath for exactly 50 seconds, then straight back onto ice.',
      why: 'The sudden change in temperature opens temporary pores in the membrane, and plasmids slip in.',
      caption: 'Heat shock',
      captions: {
        shock: 'Move the tubes into the 42 °C water bath for exactly 50 seconds',
        back: 'Then straight back onto ice',
      },
    },
    recover: {
      title: 'Recover in LB broth', short: 'Recover',
      action: 'add LB broth',
      hint: 'Click the <b>LB broth</b>',
      detail: 'Using a fresh pipette for each tube, add 250 µL of LB nutrient broth and let the cells rest for 10 minutes.',
      why: 'The cells repair their membranes and start using the ampicillin-resistance gene.',
      caption: { text: 'Add LB nutrient broth to both tubes', note: 'A fresh pipette for each tube' },
      captions: {
        rest: 'Let the cells recover for 10 minutes',
      },
    },
    plate: {
      title: 'Spread on plates', short: 'Plates',
      action: 'spread the cells',
      hint: 'Click the <b>agar plates</b>',
      detail: 'Pipette 100 µL onto each agar plate (one fresh pipette per tube) and spread it with a fresh sterile loop for each plate. The − tube goes on LB/amp and LB; the + tube on LB/amp and LB/amp/ara.',
      why: 'Each plate tests one thing: whether the cells can grow on ampicillin, and whether arabinose switches GFP on.',
      caption: 'Spread the cells on agar plates',
      captions: {
        pipette: 'Pipette 100 µL onto each plate: the − tube on {pa} and {pb}, the + tube on {pc} and {pd}',
        spread: 'Spread each plate with a fresh sterile loop',
      },
    },
    incubate: {
      title: 'Incubate overnight', short: 'Incubate',
      action: 'incubate them',
      hint: 'Click the <b>agar plates</b> to incubate them',
      detail: 'Keep the plates at 37 °C for 24 hours.',
      why: 'A colony only grows where the cells can survive the conditions on that plate.',
      caption: 'Keep the plates at 37 °C for 24 hours',
    },
    uv: {
      title: 'Shine UV light', short: 'UV',
      action: 'shine it on the plates',
      hint: 'Click the <b>UV lamp</b>',
      detail: 'Turn off the room lights and hold the UV lamp over the plates. Which colonies glow?',
      caption: 'Turn off the lights and shine the UV lamp on the plates. Which colonies glow?',
    },
  },

  /* the card's timer while a timed step runs */
  clock: {
    line: '{label} · {time}',
    ice: '0 °C', heat: '42 °C', backOnIce: 'Back on ice · 0 °C', recover: 'Room temp', incubate: '37 °C',
    hours: '{h} h {mm} m', seconds: '{s} s', minutes: '{m}:{ss}',
  },

  /* the four plates, left to right on the bench: the printed card and the media */
  plates: [
    { title: 'LB / amp', sub: '− plasmid', desc: 'Ampicillin agar, cells without the plasmid.', out: 'No growth', result: 'Without the plasmid, ampicillin kills the cells.' },
    { title: 'LB', sub: '− plasmid', desc: 'Plain nutrient agar, cells without the plasmid.', out: 'A lawn', result: 'No antibiotic, so every cell grows: they were alive.' },
    { title: 'LB / amp', sub: '+ plasmid', desc: 'Ampicillin agar, transformed cells.', out: 'Colonies', result: '<b>bla</b> protects them. No arabinose, so no glow.' },
    { title: 'LB / amp / ara', sub: '+ plasmid', desc: 'Ampicillin + arabinose agar, transformed cells.', out: 'Glowing colonies', result: 'Arabinose switches GFP on through <b>araC</b>.' },
  ],

  complete: {
    head: 'Only the arabinose plate glows.',
    lightsOn: 'Lights on',
    uvLight: 'UV light',
    efficiency: '<b>Transformation efficiency:</b> {n} glowing colonies ÷ {dna} µg of plasmid ≈ <b>{eff} transformants per µg</b>.',
    caption: { text: 'Only the arabinose plate glows', note: 'Its cells took up the plasmid, and arabinose switched GFP on' },
    toast: 'Only the arabinose plate glows',
  },
  /* the cell view's switch after the UV step */
  araSeg: { on: '+ arabinose', off: 'no arabinose' },

  /* bench objects: hover name, short name, and what they are for */
  objects: {
    cacl2: { name: 'CaCl₂ transformation solution', short: 'CaCl₂', desc: 'Ice-cold calcium chloride helps DNA stick to the cell surface.' },
    lb: { name: 'LB nutrient broth', short: 'LB broth', desc: 'Food for the cells while they recover.' },
    starter: { name: 'E. coli starter plate', short: 'Starter plate', desc: 'Colonies of ordinary, non-glowing E. coli.' },
    plasmid: { name: 'GFP plasmid', short: 'Plasmid', desc: 'A ring of DNA carrying the GFP, bla and araC genes.' },
    ice: { name: 'Ice bath', short: 'Ice bath', desc: 'Keeps the tubes at 0 °C.' },
    bath: { name: 'Water bath · 42 °C', short: 'Water bath', desc: 'Used for the 50-second heat shock.' },
    plates: { name: 'Agar plates', short: 'Agar plates' },
    uv: { name: 'UV lamp', short: 'UV lamp', desc: 'Ultraviolet light makes GFP fluoresce.' },
    tubes: { name: 'Microcentrifuge tubes', desc: '+ plasmid (indigo cap) gets the GFP plasmid. − plasmid (grey cap) is the control: same cells, no plasmid.' },
    pipette: { name: 'Sterile transfer pipette', desc: 'Disposable: a fresh one whenever it could carry cells somewhere they shouldn’t go.' },
    loop: { name: 'Sterile inoculation loop', desc: 'Disposable: a fresh loop for every transfer, so nothing gets cross-contaminated.' },
    waste: { name: 'Biohazard waste', desc: 'Used loops and pipettes go here and are autoclaved later.' },
    rack: { name: 'Tube rack', desc: 'Holds the two tubes upright.' },
  },
  /* text printed on the bench props */
  props: {
    cacl2: { title: 'CaCl₂', line: 'TRANSFORMATION', note: '0.05 M · ice-cold' },
    lb: { title: 'LB', line: 'NUTRIENT BROTH', note: 'sterile' },
  },

  /* the zoom level */
  levels: {
    cell: {
      name: 'Cell', meta: '≈ 5 µm',
      labels: {
        chromosome: { text: 'Chromosome' },
        flagellum: { text: 'Flagellum' },
        membrane: { text: 'Cell membrane' },
        calcium: { text: 'Ca²⁺ ions' },
        plasmid: { text: 'Plasmid' },
        pore: { text: 'Pore' },
        copies: { text: 'Plasmid copies' },
        enzyme: { text: 'β-lactamase' },
        amp: { text: 'Ampicillin' },
        arabinose: { text: 'Arabinose' },
        gfp: { text: 'GFP' },
      },
      info: {
        membrane: { title: 'Cell membrane', text: 'Two layers of fatty molecules that keep the cell’s contents in. Its surface is negatively charged, like DNA.' },
        chromosome: { title: 'Chromosome', text: 'One long loop of DNA with about 4,300 genes. Unlike a plant cell’s, it isn’t inside a nucleus.' },
        ribosomes: { title: 'Ribosomes', text: 'They read genes and build proteins, including GFP once the gene is switched on.' },
        plasmid: { title: 'GFP plasmid', text: 'A small ring of DNA carrying three genes: GFP (green), bla for ampicillin resistance (amber) and the araC switch (violet).' },
        enzyme: { title: 'β-lactamase', text: 'The enzyme made from the bla gene. It breaks ampicillin down before it can damage the cell wall.' },
        amp: { title: 'Ampicillin', text: 'An antibiotic in the agar. It kills E. coli that have no β-lactamase.' },
        arabinose: { title: 'Arabinose', text: 'A sugar. It binds the araC protein, which then switches on the GFP gene.' },
        gfp: { title: 'Green fluorescent protein', text: 'From a jellyfish. It absorbs UV light and gives off green light.' },
      },
      /* the card's "why" while zoomed in, one per stage of the cell */
      stages: [
        '<b>A single <i>E. coli</i> cell.</b> Its chromosome (blue) floats in the cytoplasm among ribosomes. Flagella trail behind.',
        '<b>Calcium ions</b> (blue dots) gather at the membrane and cancel out its negative charge, so DNA is no longer pushed away.',
        '<b>Competent cells.</b> Suspended in cold CaCl₂, the cells are now ready to take up DNA.',
        '<b>Plasmids arrive.</b> Each ring carries <b style="color:#16a34a">GFP</b>, <b style="color:#d97706">bla</b> (ampicillin resistance) and the <b style="color:#7c3aed">araC</b> switch.',
        '<b>On ice</b> the membrane stiffens and plasmids settle against the cell surface.',
        '<b>Heat shock!</b> The sudden heat makes the membrane flex and open temporary pores. A plasmid slips inside.',
        '<b>Recovery.</b> In fresh broth the cell repairs itself, copies the plasmid and starts making β-lactamase (amber).',
        '<b>On the amp plate</b>, β-lactamase breaks down ampicillin (red), so only transformed cells survive and divide.',
      ],
      stageAra: '<b>Arabinose</b> (yellow) enters and switches on araC. The cell makes <b style="color:#16a34a">GFP</b>, which glows green under UV light.',
      stageNoAra: '<b>No arabinose:</b> araC keeps the GFP gene switched off. The cell survives ampicillin but does not glow.',
      /* Watch mode's captions at this level, in the order they play */
      cues: {
        cell: '<i>E. coli</i> is a one-celled bacterium from the gut. Its <b>chromosome</b> floats free, with no nucleus',
        calcium: 'Calcium chloride is added. Its <b>calcium ions</b> coat the membrane and cancel its negative charge',
        competent: 'DNA, also negative, is no longer pushed away. The cell is <b>competent</b>',
        plasmids: '<b>Plasmids</b> arrive: small DNA rings carrying GFP, bla and araC',
        ice: 'On ice the membrane stiffens, and plasmids settle against it',
        heat: '<b>Heat shock!</b> The sudden heat makes the membrane flex',
        pores: 'Brief <b>pores</b> open, and a plasmid slips inside',
        recover: 'In fresh broth the cell repairs itself and copies the plasmid',
        enzyme: 'The <b>bla</b> gene makes <b>β-lactamase</b>',
        amp: 'On the amp plate, β-lactamase breaks down <b>ampicillin</b> before it can kill the cell',
        noAra: 'No arabinose: araC keeps the GFP gene off. The cell lives but does not glow',
        arabinose: '<b>Arabinose</b> binds araC, which switches on the GFP gene',
        glow: 'The cell makes <b>GFP</b>, which glows green under UV light',
      },
    },
  },
});
