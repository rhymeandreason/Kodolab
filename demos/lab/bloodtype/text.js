/* Every word Blood Typing shows, in English. Edit freely: the code only names these keys.
 * Markup allowed: <b>, <i>, <em>, <sup>. {name} slots are filled in by the code. */
LabText.add('en', {
  title: 'Blood Typing',
  icon: 'ph-drop',

  intro: {
    kicker: 'Interactive 3D lab',
    title: 'Who is the father?',
    body: 'A mother wants to know which of two men is her baby\'s father. Type all four people\'s blood with anti-A, anti-B and anti-Rh, then use inheritance to rule one out.',
    keys: [
      { color: '#2f6fe4', text: '<b>Antigens</b> on red cells set the blood type' },
      { color: '#e0334b', text: '<b>Agglutination</b>: clumping means the antigen is there' },
      { color: '#16b3a3', text: '<b>Inheritance</b>: a child gets one allele from each parent' },
    ],
  },

  info: {
    kicker: 'About the experiment',
    title: 'How does blood typing work?',
    body: ['Each antiserum holds antibodies against one antigen. An antibody has two arms, so it can grab two red cells that carry its antigen at once. Millions of those bridges pull the cells into clumps you can see.'],
    steps: [
      { head: 'ABO.', text: 'Anti-A clumps cells with the A antigen, anti-B cells with B. Both: type AB. Neither: type O.' },
      { head: 'Rh.', text: 'Anti-Rh (anti-D) clumps cells with the D antigen. Clumping means Rh+, written after the letter: B+.' },
      { head: 'Inheritance.', text: 'I<sup>A</sup> and I<sup>B</sup> are codominant, <i>i</i> is recessive; <i>D</i> is dominant over <i>d</i>. A type A person may be I<sup>A</sup>I<sup>A</sup> or I<sup>A</sup><i>i</i>.' },
    ],
    notes: ['The blood here is simulated. Typing can rule a man out, but never prove he is the father: many men share any blood type. That takes DNA.'],
    tips: [
      { icon: 'ph-magnifying-glass', text: 'From step 3 the magnifier shows one well up close. Point at a well, or a cell in the data table, to look at it.' },
      { icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan' },
    ],
  },

  phases: {
    prep: { title: 'Prepare the trays', desc: 'Blood, antisera, stir' },
    read: { title: 'Read the wells', desc: 'Clumping, then type' },
    solve: { title: 'Solve the case', desc: 'Punnett squares' },
  },

  steps: {
    blood: {
      title: 'Add the blood', short: 'Blood',
      action: 'add a drop to each well',
      hint: 'Click each <b>blood sample</b>',
      detail: 'One drop of each person\'s blood in all three wells of their tray.',
      why: 'Three wells, three tests on the same blood: one for each antigen.',
      /* Watch: the instruction plays over the first sample, then the explanation over the rest */
      captions: [
        'Put one drop of each person’s blood in all three wells of their tray',
        'Three wells test the same blood three times, once for each antigen: A, B and Rh',
      ],
    },
    sera: {
      title: 'Add the antisera', short: 'Antisera',
      action: 'add a drop to every matching well',
      hint: 'Click each <b>antiserum</b>',
      detail: 'Anti-A in every A well, anti-B in every B well, anti-Rh in every Rh well.',
      why: 'Each antiserum carries antibodies against one antigen. The dyes only tell the bottles apart.',
      captions: [
        'Add anti-A to every A well, anti-B to every B well and anti-Rh to every Rh well',
        'Each antiserum holds antibodies against one antigen. The dyes only tell the bottles apart',
      ],
    },
    stir: {
      title: 'Stir each well', short: 'Stir',
      action: 'stir its three wells',
      hint: 'Click each <b>tray</b>',
      detail: 'A clean stick for every well, then into the biohazard bin.',
      why: 'One stick per well, or a trace of one antiserum lands in the next well and gives a false clump.',
      captions: [
        'Stir each well with a clean stick, then drop the stick in the biohazard bin',
        'A reused stick carries antiserum into the next well and can fake a clump',
        'Where an antibody meets its antigen, it links red cells into clumps. Watch the magnifier',
      ],
    },
    record: {
      title: 'Mark the clumping', short: 'Mark',
      action: 'look at it in the magnifier',
      hint: 'Mark each well in the <b>data table</b>',
      detail: 'Mark each well + (clumped) or − (smooth).',
      why: 'Smooth red means no antigen for that antibody. Gritty clumps in clear fluid mean it found its antigen.',
      caption: 'Mark each well + if it clumped or − if it stayed smooth. A clump means that antigen is on the red cells',
    },
    type: {
      title: 'Name the blood types', short: 'Types',
      hint: 'Pick each person\'s <b>type</b>',
      detail: 'Anti-A and anti-B give the letter, anti-Rh gives the sign.',
      why: 'Each clump is an antigen on the red cells, and the antigens are the type.',
      caption: 'Name each person’s type: anti-A and anti-B give the letter, anti-Rh gives the + or −',
    },
    solve: {
      title: 'Who is the father?', short: 'Solve',
      hint: 'Use the <b>Genetics</b> tab',
      detail: 'Try each man\'s possible genotypes against the mother\'s in the Punnett squares.',
      why: 'One impossible combination is enough to rule a man out. A possible one only means he could be.',
      caption: 'Try each man’s possible genotypes against the mother’s. One impossible combination rules a man out',
    },
  },

  complete: {
    correct: 'Correct!',
    why: 'Blood types exclude; they never prove. Plenty of other men share {father}\'s type.',
    toast: 'Case solved',
    newToast: 'Case #{no}: new blood, same question',
  },

  case: { label: 'Case #{no}', new: 'New case' },

  magnifier: { title: 'Magnifier', label: '{name} · {serum}' },

  notebook: {
    tabData: 'Data table', tabGenetics: 'Genetics',
    lead: 'Point at a cell to see that well in the magnifier. Click it to cycle +, −.',
    doneLead: 'Every result checks out.',
    sample: 'Sample', type: 'Type', typeOf: '{name}\'s blood type',
    pos: 'clumping', neg: 'no clumping',
    keyTitle: 'How to read the results',
    keyAbo: '1 · ABO letter', keyRhHead: '2 · Rh sign',
    keyRh: 'The Anti-Rh well gives the + or − after the letter. Anti-A −, anti-B +, anti-Rh + is <b>B+</b>.',
    check: 'Check my readings',
    checkTypes: 'Check the blood types',
    leadType: 'Use the key below to name each person\'s type.',
    obsRight: '<b>All twelve wells are right.</b> Now name each type.',
    fillObs: 'Mark all twelve wells.',
    fillTypes: 'Pick a type for each person.',
    notStirred: 'Stir every well first.',
    wrongObs1: '{n} well doesn\'t match. Look again in the magnifier.',
    wrongObsN: '{n} wells don\'t match. Look again in the magnifier.',
    wrongType1: '{n} type is wrong. Clumping means that antigen is present.',
    wrongTypeN: '{n} types are wrong. Clumping means that antigen is present.',
    allRight: '<b>All correct.</b> Genetics is open.',
    locked: 'Check your data table to open this.',
    rule: 'I<sup>A</sup> and I<sup>B</sup> are codominant; <i>i</i> is recessive. <i>D</i> (Rh+) is dominant over <i>d</i>. Mother\'s alleles down the side, the man\'s across the top.',
    goal: 'The baby is <b>{baby}</b>. Test each man: could he be the father?',
    stepGeno: 'Pick a genotype for each parent',
    stepCross: 'Squares that give a {baby} baby are highlighted',
    aboGene: 'ABO gene', rhGene: 'Rh gene',
    can: 'With these genotypes, Mother × {man} <b>can</b> have a {baby} baby ({pct}%).',
    cannot: 'With these genotypes, Mother × {man} <b>cannot</b> have a {baby} baby.',
    tryOther: 'Try the other genotypes too.',
    question: 'The baby is <b>{baby}</b>. Which man could be the father?',
    notQuite: '<b>Not quite.</b> Can {man} pass on the alleles the baby needs? Try every genotype he could have.',
    needO: 'A type O baby is <i>ii</i>, so each parent passed on an <i>i</i>.',
    needAllele: 'Mother (type {mom}) has no {alleles}, so the baby got it from the father.',
    needD: 'Mother is Rh− (<i>dd</i>), so the baby\'s <i>D</i> came from the father.',
    could: '<b>{man}</b> ({type}) carries alleles that can give a {baby} baby: he <b>could be</b> the father.',
    excluded: '<b>{man}</b> ({type}) is <b>ruled out</b>: {why}.',
    whyAbo: 'no mix of a type {mom} mother\'s and a type {man} man\'s alleles gives a type {baby} child',
    whyRh: 'the baby is Rh+, but Mother and {man} are both <i>dd</i>',
  },

  objects: {
    blood: { name: '{name}\'s blood', desc: 'Simulated blood sample' },
    serum: {
      A: 'Antibodies against the A antigen',
      B: 'Antibodies against the B antigen',
      Rh: 'Antibodies against the D (Rh) antigen',
    },
    tray: { name: '{name}\'s tray', desc: 'Three wells: A, B, Rh' },
    cup: { name: 'Stir sticks', short: 'Sticks', desc: 'One clean stick per well' },
    bin: { name: 'Biohazard bin', short: 'Bin', desc: 'Used sticks go here' },
  },

  props: {
    people: { mother: 'Mother', baby: 'Baby', man1: 'Man #1', man2: 'Man #2' },
    sera: { A: 'Anti-A', B: 'Anti-B', Rh: 'Anti-Rh' },
    blood: { sub: 'Blood sample', footer: 'Simulated blood' },
    serum: { sub: 'Antiserum', footer: 'Typing reagent' },
    bin: 'BIOHAZARD',
    zones: { sera: 'ANTISERA', samples: 'BLOOD SAMPLES', trays: 'TYPING TRAYS', sticks: 'STIR STICKS', bin: 'BIOHAZARD' },
  },
});
