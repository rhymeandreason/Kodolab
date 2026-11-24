/* Every word Strawberry DNA shows, in English. Edit freely: the code only names these keys.
 * A translation is text.<lang>.js beside this file, LabText.add('<lang>', { … }) with only
 * the keys it translates (lab/page.js loads it for ?lang=<lang>).
 * Markup allowed: <b>, <i>, <em>, <sup>. {name} is filled in by the code. Timings, colours
 * and which label a caption points at live in the code, not here. */
LabText.add('en', {
  title: 'Strawberry DNA',
  icon: 'ph-dna',

  /* the title card */
  intro: {
    kicker: 'Interactive 3D lab',
    title: 'Pull <em>DNA</em> out of a strawberry',
    body: 'Every living thing keeps its instructions in <b>DNA</b>. One molecule is far too thin to see, but a strawberry holds so much of it that you can free it from the cells and lift it out on a stick.',
    keys: [
      { color: '#38bdf8', text: '<b>Soap</b> breaks open the membranes around each cell and nucleus' },
      { color: '#94a3b8', text: '<b>Salt</b> pulls proteins off the DNA' },
      { color: '#6366f1', text: '<b>Cold alcohol</b> makes the DNA clump into white threads' },
    ],
  },

  /* the (i) button's modal */
  info: {
    kicker: 'About the experiment',
    title: 'How do you see DNA?',
    body: ['One DNA molecule is far too thin to see. But a strawberry has a lot of it: every cell carries <b>eight copies</b> of each chromosome. Free enough of it and clump it together, and you can hold it on a stick.'],
    steps: [
      { head: 'Break the cells open.', text: 'Mashing tears the cellulose cell walls. Soap dissolves the fatty membranes around each cell and its nucleus, so the DNA spills out.' },
      { head: 'Strip and shield it.', text: 'Na<sup>+</sup> from the salt pulls proteins off the DNA and cancels the negative charge on its backbone.' },
      { head: 'Filter.', text: 'The coffee filter keeps pulp, seeds and cell walls out. DNA stays dissolved in the pink liquid.' },
      { head: 'Precipitate.', text: 'DNA can\'t dissolve in cold alcohol, so the strands clump together into white threads where the layers meet.' },
    ],
    tips: [
      { icon: 'ph-magnifying-glass-plus', text: 'Click the circles on the right to zoom into a cell or the molecules. All three views show the same moment.' },
      { icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan · keys 1 2 3 switch levels' },
    ],
  },

  /* the procedure list's groups */
  phases: {
    berry: { title: 'Prepare the berry', desc: 'Leaves off, into the bag' },
    mash: { title: 'Mash', desc: 'Squish it in the bag' },
    buffer: { title: 'Extraction buffer', desc: 'Soap and salt break the cells open' },
    filter: { title: 'Filter', desc: 'Strain out the pulp' },
    alcohol: { title: 'Cold alcohol', desc: 'Float alcohol on the filtrate' },
    spool: { title: 'Spool the DNA', desc: 'Wind it onto a skewer' },
  },

  /* each step: the card (title, hint, detail), the click label (action: "Click to …"), and
     Watch mode's captions in the order they play */
  steps: {
    berry: {
      title: 'Prepare the strawberry', short: 'Strawberry',
      action: 'pull off the leaves and put it in the bag',
      hint: 'Click the <b>strawberry</b> to pull off the leaves and put it in the bag',
      detail: 'Choose one ripe strawberry, pull off the green leaves (the calyx), put it in a zip-top bag and seal it.',
      captions: {
        leaves: 'Pull the green leaves off the strawberry',
        bag: 'Put it in a zip-top bag',
        seal: 'Seal the bag',
      },
    },
    mash: {
      title: 'Mash the strawberry', short: 'Mash',
      action: 'squish the bag',
      hint: 'Click the <b>bag</b> to squish the strawberry',
      hintMore: 'Click the <b>bag</b> to keep squishing · <b>{n}/{total}</b>',
      detail: 'Squish the strawberry through the bag with your fingers for about 2 minutes, until there are no large lumps.',
      captions: {
        squish: 'Squish the strawberry through the bag',
        lumps: 'Keep mashing until there are no large lumps',
      },
    },
    pour: {
      title: 'Add extraction buffer', short: 'Buffer',
      action: 'pour in the buffer',
      hint: 'Click the <b>buffer beaker</b> to pour it into the bag',
      detail: 'Pour about 10 mL of extraction buffer (water, a squirt of dish soap and a pinch of salt) into the bag.',
      captions: {
        pour: { text: 'Pour in the extraction buffer', note: 'Water, dish soap and a pinch of salt' },
        soap: 'The soap breaks open the cells',
      },
    },
    mix: {
      title: 'Mix gently', short: 'Mix',
      action: 'mix it gently',
      hint: 'Click the <b>bag</b> to mix it gently',
      detail: 'Mash gently for 1 more minute without making lots of bubbles.',
      captions: {
        mix: { text: 'Mix it gently for another minute', note: 'Rough mixing breaks the DNA into pieces' },
      },
    },
    filter: {
      title: 'Filter the mixture', short: 'Filter',
      action: 'pour it through the filter',
      hint: 'Click the <b>bag</b> to pour it through the filter',
      detail: 'Pour the mixture through a coffee filter in a funnel and collect the liquid in a test tube.',
      captions: {
        pour: 'Pour the mixture through a coffee filter',
        drip: 'The pink liquid drips into the test tube',
      },
    },
    funnel: {
      title: 'Remove the funnel', short: 'Funnel',
      action: 'lift out the funnel',
      hint: 'Click the <b>funnel</b> to lift it out of the tube',
      detail: 'Lift the funnel and filter out of the test tube and set them in the waste bin. The pink filtrate stays in the tube.',
      captions: {
        lift: 'Lift out the funnel and filter',
        stays: 'The pink filtrate stays in the tube',
      },
    },
    alcohol: {
      title: 'Add ice-cold alcohol', short: 'Alcohol',
      action: 'pour the alcohol',
      hint: 'Click the <b>alcohol</b> to pour a layer on top',
      detail: 'Slowly pour ice-cold isopropyl alcohol down the side of the tube to form a layer on top. Do not mix! Then leave it for a few minutes and watch where the layers meet.',
      clock: '{m}:{ss} min',
      captions: {
        pour: { text: 'Slowly pour ice-cold alcohol down the side of the tube', note: 'Don’t mix!' },
        floats: 'The alcohol floats on top in its own layer',
        wait: 'Wait a few minutes and watch where the layers meet',
        appear: 'White strands of DNA appear!',
      },
    },
    spool: {
      title: 'Spool the DNA', short: 'Spool',
      action: 'twirl the skewer',
      hint: 'Click the <b>skewer</b> to wind up the DNA',
      detail: 'Lower a wooden skewer to the boundary between the layers and twirl it slowly. Lift out the DNA that winds around it.',
      captions: {
        lower: 'Lower a wooden skewer to where the layers meet',
        twirl: 'Twirl it slowly to wind up the DNA',
        lift: 'Lift out the DNA',
      },
    },
  },

  complete: {
    hint: '<b>You extracted strawberry DNA.</b> Click the circles to see the cell and the molecules.',
    caption: { text: 'You extracted strawberry DNA!', note: 'Click the circles to zoom into the cell and the molecules' },
    toast: 'DNA spooled. Zoom in to see what happened',
  },

  /* the card's blue "why" note, one per stage of the experiment, at each level */
  why: [
    {
      lab: 'Strawberries are perfect for DNA extraction. They are soft and easy to mash. They are also octoploid: every cell carries eight copies of each chromosome, so there is a lot of DNA to collect.',
      cell: 'The fruit is made of millions of plant cells. A rigid cellulose wall surrounds each cell membrane. The nucleus holds the DNA, and a large central vacuole stores the red pigments that colour the berry.',
      mol: 'Inside the nucleus, DNA is a double helix: two sugar–phosphate backbones joined by base pairs (A–T and G–C). It is wound around histone proteins and enclosed by membranes made of phospholipids.',
    },
    {
      lab: 'Mashing breaks the fruit into a pulp. This exposes far more cells to the extraction buffer you will add next.',
      cell: 'Squeezing ruptures the tough cellulose cell walls and pulls the tissue apart. Neighbouring cells separate, and the cell contents are now only held in by the soft membrane.',
      mol: 'Nothing has changed at this scale yet. The membranes are still intact, and the DNA is still packed with proteins inside the nucleus.',
    },
    {
      lab: 'The buffer mixes into the pulp and turns it pink and foamy. Mix gently: rough handling breaks the long DNA strands into short pieces.',
      cell: 'Soap dissolves every membrane. The cell membrane, the vacuole and the nuclear envelope fall apart, so the DNA spills out into the liquid along with the red pigment.',
      mol: 'Soap molecules have a water-loving head and a fat-loving tail. They pull phospholipids out of the membrane into tiny balls called micelles. Na⁺ ions from the salt cluster around DNA’s negative phosphates and help strip off the histone proteins.',
    },
    {
      lab: 'The filter holds back seeds, pulp and cell debris. The pink liquid that drips through is called the filtrate, and it contains the dissolved DNA.',
      cell: 'Pieces of cell wall, plastids and other large debris are caught by the filter. Long DNA strands, micelles and pigment pass straight through.',
      mol: 'DNA from thousands of cells now floats freely in salty water. The Na⁺ ions surround its backbone. DNA dissolves easily in water, so it is still invisible.',
    },
    {
      lab: 'Alcohol is less dense than the watery filtrate, so it floats on top. Within seconds, cloudy white strands appear where the two layers meet. That is DNA!',
      cell: 'DNA cannot stay dissolved in alcohol. Millions of strands come out of solution and tangle together into threads thick enough to see.',
      mol: 'Alcohol pulls water away from the DNA. With its charges already shielded by Na⁺, the helices stick to each other and precipitate (come out of solution). Proteins stay dissolved in the liquid below.',
    },
    {
      lab: 'You are holding DNA from thousands of strawberry cells! It looks like white, stringy goo because millions of strands are clumped together. A single DNA molecule is far too thin to see.',
      cell: 'As the skewer turns, the long fibres wind around each other, like spaghetti twirling onto a fork.',
      mol: 'Every visible fibre is a bundle of countless double helices. One helix is only 2 nanometres wide, about 40,000 times thinner than a human hair.',
    },
  ],

  /* bench objects: hover name, short name, and what they are for */
  objects: {
    berry: { name: 'Strawberry', short: 'Strawberry', desc: 'Soft, ripe and octoploid: eight copies of every chromosome in each cell.' },
    bag: { name: 'Zip-top bag', short: 'Bag', desc: 'Holds the strawberry while you mash it.' },
    beaker: { name: 'Extraction buffer', short: 'Buffer', desc: 'Water + a squirt of dish soap + a pinch of salt.' },
    funnel: { name: 'Funnel + coffee filter', short: 'Funnel', desc: 'Holds back seeds, pulp and cell debris. The liquid passes through.' },
    bottle: { name: 'Isopropyl alcohol', short: 'Alcohol', desc: 'Ice-cold. DNA does not dissolve in alcohol, so it comes out of solution.' },
    skewer: { name: 'Wooden skewer', short: 'Skewer', desc: 'Twirl it at the boundary between the layers to wind up the DNA.' },
    soap: { name: 'Dish soap', desc: 'Detergent: pulls apart the fatty (lipid) membranes around cells and nuclei.' },
    salt: { name: 'Salt (NaCl)', desc: 'Na⁺ ions shield the negative charge on DNA so strands can clump together.' },
    tube: { name: 'Test tube', desc: 'Collects the filtered liquid. DNA gathers where the alcohol meets it.' },
    cup: { name: 'Waste bin', desc: 'Somewhere to put the used funnel and filter.' },
    ice: { name: 'Ice bath', desc: 'Keeps the alcohol ice-cold. DNA is even less soluble when it is cold.' },
    bowl: { name: 'Strawberries', desc: 'Kiwi, banana and onion work too, but strawberries give the most DNA.' },
  },
  /* text printed on the bench props */
  props: {
    beaker: { label: 'Buffer', sub: 'water · soap · salt' },
    waste: 'WASTE',
  },

  /* the zoom levels */
  levels: {
    cell: {
      name: 'Cell', meta: '≈ 100 µm',
      labels: {
        wall: { text: 'Cell wall', sub: 'tough cellulose' },
        membrane: { text: 'Cell membrane' },
        nucleus: { text: 'Nucleus', sub: 'holds the DNA' },
        vacuole: { text: 'Vacuole', sub: 'red anthocyanin pigment' },
        plastid: { text: 'Plastid' },
        brokenWall: { text: 'Broken cell wall' },
        micelles: { text: 'Micelles', sub: 'membrane fragments' },
        released: { text: 'Released DNA' },
        debris: { text: 'Debris caught by the filter' },
        clump: { text: 'DNA strands clump together' },
        fibres: { text: 'Fibres wind around each other' },
      },
      info: {
        chromatin: { title: 'DNA (chromatin)', text: 'Long DNA molecules packed with proteins inside the nucleus.' },
        freed: { title: 'DNA (chromatin)', text: 'Freed DNA strands floating in the salty buffer.' },
        precipitated: { title: 'Precipitated DNA', text: 'Strands stuck together in the alcohol.' },
        nucleus: { title: 'Nucleus', text: 'Wrapped in a double membrane (the nuclear envelope).' },
        nucleolus: { title: 'Nucleolus', text: 'Where ribosomes are assembled.' },
        vacuole: { title: 'Central vacuole', text: 'Stores water, sugars and red anthocyanin pigments.' },
        membrane: { title: 'Cell membrane', text: 'A thin, fatty phospholipid bilayer. Soap dissolves it.' },
        wall: { title: 'Cell wall', text: 'Rigid cellulose fibres. Mashing breaks it open.' },
        micelles: { title: 'Micelles', text: 'Tiny balls of soap and membrane lipids.' },
        chromoplast: { title: 'Chromoplast', text: 'Plastids that store coloured pigments in ripe fruit.' },
        mitochondrion: { title: 'Mitochondrion', text: 'Releases energy from sugars for the cell.' },
      },
      legend: {
        wall: 'Cell wall', membrane: 'Membrane', nucleus: 'Nucleus', dna: 'DNA', vacuole: 'Vacuole / pigment', plastids: 'Plastids',
      },
      /* Watch mode's captions at this level, in the order they play */
      cues: {
        cell: 'One cell of the fruit, boxed in by a rigid <b>cellulose wall</b>',
        nucleus: 'Its DNA is packed inside the <b>nucleus</b>',
        vacuole: 'The big <b>vacuole</b> stores the red pigment',
        mash: 'Mashing tears the cell walls apart',
        separate: 'Cells separate. Only a thin <b>membrane</b> holds each one together',
        soap: 'Soap dissolves the <b>cell membrane</b>',
        burst: 'The vacuole and the nucleus break open too',
        micelles: 'Membrane fats end up in <b>micelles</b>, tiny balls of soap and lipid',
        spill: 'The <b>DNA</b> spills out into the salty buffer',
        filter: 'The filter catches wall pieces and other large debris',
        through: 'DNA, micelles and pigment pass straight through',
        invisible: 'The DNA is still dissolved, so you cannot see it yet',
        clump: 'In alcohol, DNA comes out of solution and <b>clumps</b>',
        threads: 'Millions of strands tangle into threads thick enough to see',
        twirl: 'Twirling winds the fibres around each other, like spaghetti on a fork',
      },
    },
    mol: {
      name: 'Molecule', meta: '≈ 10 nm',
      labels: {
        backbone: { text: 'Sugar–phosphate backbone' },
        bases: { text: 'Base pairs', sub: 'A–T · G–C' },
        histones: { text: 'Histone proteins', sub: 'DNA wraps around them' },
        membrane: { text: 'Membrane', sub: 'phospholipid bilayer' },
        soap: { text: 'Detergent (soap)' },
        micelle: { text: 'Micelle', sub: 'soap + lipids' },
        ions: { text: 'Na⁺ ions', sub: 'shield negative phosphates' },
        drift: { text: 'Proteins drift away' },
        passes: { text: 'Everything here passes the filter', sub: 'its pores are thousands of times wider' },
        unwinds: { text: 'DNA unwinds', sub: 'free of its proteins' },
        many: { text: 'DNA from many cells' },
        alcohol: { text: 'Alcohol' },
        stick: { text: 'Strands stick together', sub: 'and precipitate' },
        lifted: { text: 'Lifted out of the liquid', sub: 'proteins, soap and lipids stay behind' },
      },
      info: {
        chromatin: { title: 'Chromatin', text: 'DNA wound around histone proteins, about twice round each one. Two backbones, base pairs A–T and G–C between them.' },
        helix: { title: 'DNA double helix', text: 'About 2 nm wide. Two backbones twisted around base pairs A–T and G–C.' },
        lipids: { title: 'Phospholipids', text: 'Water-loving heads, fat-loving tails. Two layers make a membrane.' },
        soap: { title: 'Detergent molecule', text: 'Pries lipids out of the membrane and wraps them into micelles.' },
        ion: { title: 'Na⁺ ion', text: 'From the salt. Neutralizes the negative phosphate groups on DNA.' },
        alcohol: { title: 'Isopropyl alcohol', text: 'DNA can’t dissolve in it, so the strands come out of solution.' },
        histones: { title: 'Histone proteins', text: 'Eight proteins, two each of four kinds, that DNA winds around. Salt helps pull them off.' },
        other: { title: 'DNA molecule', text: 'Freed DNA from other cells, floating in the buffer.' },
      },
      legend: {
        A: 'Adenine', T: 'Thymine', G: 'Guanine', C: 'Cytosine', backbone: 'Backbone', partner: 'Backbone (partner strand)',
        ion: 'Na⁺ ion', histone: 'Histone', lipid: 'Lipid', soap: 'Detergent', alcohol: 'Alcohol',
      },
      cues: {
        octoploid: 'Strawberries are <b>octoploid</b>: eight copies of every chromosome, so lots of DNA',
        helix: 'DNA is a double helix: two backbones joined by <b>base pairs</b>',
        histones: 'It winds around <b>histone proteins</b>',
        membrane: 'A phospholipid <b>membrane</b> walls it in',
        mash: 'Mashing changes nothing at this scale. The membranes are still whole',
        soap: '<b>Soap</b> arrives: a water-loving head, a fat-loving tail',
        pry: 'Soap pries lipids out of the membrane',
        micelles: 'It wraps them into <b>micelles</b>, and the membrane is gone',
        ions: '<b>Na⁺</b> from the salt shields DNA’s negative phosphates',
        unwind: 'The histones let go and the <b>DNA unwinds</b>',
        filter: 'All of this is far smaller than the filter’s pores',
        free: 'DNA from many cells floats free, still dissolved in water',
        alcohol: '<b>Alcohol</b> pulls water away from the DNA',
        stick: 'Its charge shielded, the helices <b>stick together</b> and precipitate',
        lifted: 'Lifted out. Proteins, soap and lipids stay in the liquid',
      },
    },
  },
});
