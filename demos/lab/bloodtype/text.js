/* Every word Blood Typing shows, in English. Edit freely: the code only names these keys.
 * Markup allowed: <b>, <i>, <em>, <sup>. */
LabText.add('en', {
  title: 'Blood Typing',
  icon: 'ph-drop',

  intro: {
    kicker: 'Interactive 3D lab',
    title: 'Whose <em>blood</em> is it?',
    body: 'Antibodies make red cells clump when they find their antigen. Test four people\'s blood with anti-A, anti-B and anti-Rh, then use the types to settle who the baby\'s father could be.',
    keys: [
      { color: '#2f6fe4', text: '<b>Antigens</b> on red cells set the blood type' },
      { color: '#e0334b', text: '<b>Agglutination</b>: clumping means the antigen is there' },
      { color: '#16b3a3', text: '<b>Inheritance</b>: a child\'s alleles come from both parents' },
    ],
  },

  info: {
    kicker: 'About the experiment',
    title: 'How does blood typing work?',
    body: ['Each antiserum holds antibodies against one antigen. Mixed with blood that carries that antigen, the antibodies cross-link the red cells into visible clumps.'],
    tips: [{ icon: 'ph-mouse-left-click', text: 'Click objects to use them · drag to orbit · scroll to zoom · right-drag to pan' }],
  },

  phases: { setup: { title: 'Set up', desc: 'The bench' } },
  steps: {
    look: { title: 'Find the trays', detail: 'One typing tray per person, wells A, B and Rh.', hint: 'Click <b>a tray</b>', action: 'look' },
  },
  completeHint: 'The procedure comes next.',

  objects: { tray: { name: 'Typing tray', short: 'Tray' } },

  props: {
    people: { mother: 'Mother', baby: 'Baby', man1: 'Man #1', man2: 'Man #2' },
    sera: { A: 'Anti-A', B: 'Anti-B', Rh: 'Anti-Rh' },
    blood: { sub: 'Blood sample', footer: 'Simulated blood' },
    serum: { sub: 'Antiserum', footer: 'Typing reagent' },
    bin: 'BIOHAZARD',
    zones: { sera: 'ANTISERA', samples: 'BLOOD SAMPLES', trays: 'TYPING TRAYS', sticks: 'STIR STICKS', bin: 'BIOHAZARD' },
  },
});
